// atelier/core/fidelity/release.ts — EVERY CHANGE BELOW THE STANDARD IS A RELEASE, AND A RELEASE IS FROZEN.
//
// The outer loop changes implementation only: how many drafts, how many redrafts, how many of the
// author's passages are retrieved, how many experience notes are served, and which notes. Each such
// change is a new ImplementationRelease (./types.ts) with a parent, named by the hash of what it
// contains. Rollback is pointing back at the parent. Nothing the loop learned may shape an output
// unless it is inside the release the output records; that is what makes a run replayable and a bad
// change undoable without guessing what else moved.
//
// The standard is never in play. A release names the standard it was made under, and
// `assertSameStandard` refuses to serve it under any other: a new standard from the owner starts a new
// line of releases, it does not inherit lessons learned against the old one silently.
//
// THE SEARCH IS SMALL ON PURPOSE. Four settings on a coarse grid, one coordinate at a time from the
// best release measured so far, each candidate run until it has MIN_SAMPLES outputs. A wide search on
// a few dozen outputs a week finds noise. Invented claims rank first: a setting that writes more in
// the author's range by inventing more is worse, whatever its in-band share.

import { createHash } from 'node:crypto';
import type { ImplementationRelease, ImplementationSettings } from './types.js';

export const MIN_SAMPLES = 20;

/** The grid the search moves on. A current value off the grid is snapped to the nearest point. */
export const SETTINGS_GRID: Readonly<Record<'drafts' | 'editBudget' | 'retrievalK' | 'notesCap', readonly number[]>> = {
  drafts: [2, 4, 6],
  editBudget: [0, 1, 2],
  retrievalK: [0, 3, 5],
  notesCap: [0, 6],
};
const COORDS = ['drafts', 'editBudget', 'retrievalK', 'notesCap'] as const;
type Coord = typeof COORDS[number];

/** JSON with object keys sorted at every level, so a hash does not depend on how an object was built. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export type ReleaseInput = Omit<ImplementationRelease, 'id'>;

/** The id: a hash of every field except `createdAt` and `why`, which describe the release and do not shape an output. */
export function releaseId(r: ReleaseInput | ImplementationRelease): string {
  const { parent, standardVersionHash, skillVersionHash, settings, notes, profileHash, retrievalHash } = r;
  return createHash('sha256')
    .update(canonicalJson({ parent, standardVersionHash, skillVersionHash, settings, notes, profileHash, retrievalHash }))
    .digest('hex').slice(0, 16);
}

export function makeRelease(input: ReleaseInput): ImplementationRelease {
  return { ...input, id: releaseId(input) };
}

export class StandardMoved extends Error {
  constructor(readonly release: string, readonly expected: string, readonly found: string) {
    super(`release ${release} was made under standard ${expected}, and the standard now is ${found}. `
      + 'A release never carries lessons across a change the owner made; start a new release under the new standard.');
    this.name = 'StandardMoved';
  }
}

/** Throws when the release was not made under this standard. */
export function assertSameStandard(release: ImplementationRelease, standardVersionHash: string): void {
  if (release.standardVersionHash !== standardVersionHash) throw new StandardMoved(release.id, release.standardVersionHash, standardVersionHash);
}

/** What one release's outputs came to. Computed by the caller from invocation records. */
export interface ReleaseOutcome {
  readonly releaseId: string;
  readonly settings: ImplementationSettings;
  /** outputs measured */
  readonly n: number;
  /** mean over outputs of inBand / measured */
  readonly meanInBandShare: number;
  /** invented claims cut or flagged, per output */
  readonly inventedPerOutput: number;
  readonly costPerOutput: number;
}

export interface SettingsProposal {
  readonly settings: ImplementationSettings;
  /** the release whose settings it neighbours, or null when nothing has been measured yet */
  readonly basedOn: string | null;
  /** plain words for the release's `why` */
  readonly why: string;
}

const key = (s: ImplementationSettings): string => COORDS.map((c) => s[c]).join('/');
const snap = (c: Coord, v: number): number => {
  const g = SETTINGS_GRID[c];
  return g.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), g[0]);
};

interface Pooled { settings: ImplementationSettings; releaseId: string; n: number; inBand: number; invented: number; cost: number }

/** Outcomes pooled by settings: two releases with the same settings (different notes) are one arm of this search. */
function pool(history: readonly ReleaseOutcome[]): Map<string, Pooled> {
  const m = new Map<string, Pooled>();
  for (const h of history) {
    if (h.n <= 0) continue;
    const k = key(h.settings);
    const p = m.get(k) ?? { settings: h.settings, releaseId: h.releaseId, n: 0, inBand: 0, invented: 0, cost: 0 };
    p.inBand += h.meanInBandShare * h.n; p.invented += h.inventedPerOutput * h.n; p.cost += h.costPerOutput * h.n; p.n += h.n;
    m.set(k, p);
  }
  for (const p of m.values()) { p.inBand /= p.n; p.invented /= p.n; p.cost /= p.n; }
  return m;
}

/** Fewest invented claims first, then the larger in-band share, then the cheaper. */
const better = (a: Pooled, b: Pooled): number => a.invented - b.invented || b.inBand - a.inBand || a.cost - b.cost;

/**
 * The next settings to try, or null when the search has nothing left to learn.
 *
 * From the best settings with at least MIN_SAMPLES outputs (or `current` when none has that many), try
 * each one-step neighbour on the grid in a fixed order: drafts, editBudget, retrievalK, notesCap, each
 * down then up. The first neighbour with fewer than MIN_SAMPLES outputs is proposed (one already
 * running is proposed again until it has its samples). Refused outright, whatever its other numbers:
 *   - a neighbour already measured with more invented claims per output than the best
 *   - a move (one coordinate, from one value to another) that raised invented claims wherever both
 *     sides of it have been measured with everything else equal
 * Null when every allowed neighbour has MIN_SAMPLES outputs: the best is a local optimum on this grid.
 */
export function nextSettings(current: ImplementationSettings, history: readonly ReleaseOutcome[]): SettingsProposal | null {
  const pooled = pool(history);
  const judged = [...pooled.values()].filter((p) => p.n >= MIN_SAMPLES).sort(better);
  const best = judged.length ? judged[0] : null;
  const base: ImplementationSettings = best ? best.settings : current;
  const centre = Object.fromEntries(COORDS.map((c) => [c, snap(c, base[c])])) as Record<Coord, number>;

  /** Moves of coordinate c from `from` to `to` that raised invented claims, everything else equal. */
  const raised = (c: Coord, from: number, to: number): boolean => [...pooled.values()].some((a) => {
    if (a.settings[c] !== from) return false;
    const b = pooled.get(key({ ...a.settings, [c]: to }));
    return b !== undefined && b.invented > a.invented;
  });

  for (const c of COORDS) {
    const g = SETTINGS_GRID[c];
    const at = g.indexOf(centre[c]);
    for (const j of [at - 1, at + 1]) {
      if (j < 0 || j >= g.length) continue;
      const settings: ImplementationSettings = { ...base, ...centre, [c]: g[j] };
      const seen = pooled.get(key(settings));
      if (seen && seen.n >= MIN_SAMPLES) continue;
      if (seen && best && seen.invented > best.invented) continue;
      if (raised(c, centre[c], g[j])) continue;
      const from = best ? `the best measured release (${best.releaseId}, ${best.n} outputs)` : 'the current settings, nothing measured yet';
      return { settings, basedOn: best?.releaseId ?? null,
        why: `${c} ${centre[c]} to ${g[j]}, one step from ${from}${seen ? `; ${seen.n} of ${MIN_SAMPLES} outputs so far` : ''}.` };
    }
  }
  return null;
}
