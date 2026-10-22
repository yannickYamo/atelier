// atelier/core/eval/certificate.ts — WHAT AN OUTPUT WAS HELD TO, AND WHAT EACH INSTRUMENT HAS EARNED. ONE SHAPE, EVERY DOOR.
//
// "Checked" means no more than this says. The certificate names the standard by its hash, counts the checks (counted by
// a built-in observer, or written by a model and qualified on the owner's examples or not), says which rules the taste
// reader may veto and on how many of the owner's labels, and which instrument read the draft for invented specifics,
// at what measured rates, on which kinds of work. The delivered-error bound stays null, with its reason, until an audit
// sample of the owner's own labels exists: a number here that nobody measured would be the one lie the product exists
// not to tell. `atelier run --json` and `atelier verify --json` print the same head (`recordHead`), so a host reads one
// record whichever door the text came through.

import type { StandardVersion, InvocationSettings, LatitudeLevel } from '../state/canonical-state.js';
import { latitudeOf } from '../state/canonical-state.js';
import type { Delivery, EvaluationRecord, RunState } from './record.js';
import { qualifiedIn } from '../observers/written.js';
import { observes } from './observes.js';
import { QUALIFIED_READERS } from '../loop/claim-extract.js';
import { tasteRules } from '../taste/reader.js';
import { tastePermissions } from '../taste/calibration.js';
import * as store from '../state/store.js';

export type Certificate = NonNullable<InvocationSettings['certificate']>;

/** The taste reader's standing on this standard: the rules it may veto, from this many labelled misses at this bound. */
export interface TasteStanding { readonly veto: ReadonlySet<string>; readonly pooled: { readonly trials: number; readonly upper95: number } }
/** The claim instrument as it ran: which one, at which version, whether it gated, and whether a measurement stands behind it. */
export interface ClaimStanding { readonly instrument: string; readonly version: string | null; readonly gate: 'reader' | 'pattern'; readonly qualified: boolean }

/** The taste reader's standing read from the store, for a door that opens no reading session (`verify`). */
export function tasteStandingFor(L: store.StoreLayout, std: Pick<StandardVersion, 'requirements'>, model: string): TasteStanding | null {
  const rules = tasteRules(std as StandardVersion);
  if (!rules.length) return null;
  const earned = tastePermissions(rules, store.readEvents(L), model);
  return { veto: earned.veto, pooled: { trials: earned.pooled.trials, upper95: earned.pooled.upper95 } };
}

/** The claim instrument's standing, from the sensor a check ran with; null when the check was off. */
export const claimStandingOf = (s: { readonly instrument: string; readonly version: string | null; readonly gate: 'reader' | 'pattern'; readonly qualified: boolean } | null | undefined): ClaimStanding | null =>
  (s ? { instrument: s.instrument, version: s.version, gate: s.gate, qualified: s.qualified } : null);

/** The level a run held its output at, where it read one (cli/latitude.ts, `runLatitude`). */
export interface HeldLatitude { readonly level: LatitudeLevel; readonly quote: string | null }

export function certificateFor(std: StandardVersion, taste: TasteStanding | null, claims: ClaimStanding | null, held: HeldLatitude | null = null): Certificate {
  const measured = std.requirements.filter((r) => r.authority !== 'EXPERT_REJECTED' && r.measurement);
  const written = measured.filter((r) => r.measurement?.observer === 'CHECK');
  // THE CLAIM READER'S HONEST LINE: the rates it was measured at, on the kinds it was measured on, or none.
  const known = claims?.qualified && claims.version ? QUALIFIED_READERS.find((q) => q.version === claims.version) : undefined;
  return {
    standardVersionHash: std.standardVersionHash,
    checks: { total: measured.length, counted: measured.length - written.length, written: written.length, writtenQualified: written.filter((r) => qualifiedIn(std, r.requirementId)).length },
    readers: {
      taste: { veto: [...(taste?.veto ?? [])].sort(), labelledMisses: taste?.pooled.trials ?? 0, falseBlockUpper95: taste && taste.pooled.trials > 0 ? Math.round(taste.pooled.upper95 * 1000) / 1000 : null },
      claims: claims ? { instrument: claims.instrument, version: claims.version, gate: claims.gate, qualified: claims.qualified,
        measured: known?.measured ? { caught: known.measured.caught, planted: known.measured.planted, leftAlone: known.measured.leftAlone, clean: known.measured.clean, on: known.measured.on } : null,
        kinds: [...(known?.classes ?? [])] } : null,
    },
    // HOW STRICTLY IT WAS HELD, AND WHAT THE OWNER ACCEPTED UNREAD: carried on every certificate, whichever door.
    latitude: { skill: latitudeOf(std), run: held?.level ?? latitudeOf(std), tightenedBy: held && held.level !== latitudeOf(std) ? held.quote : null, setBy: std.latitude?.by ?? 'default' },
    // A rule a check reads in part, or whose written check has not qualified, is accepted for what no qualified check reads: said.
    acceptedUnmeasured: (std.acceptedUnmeasured ?? []).flatMap((id) => {
      const r = std.requirements.find((q) => q.requirementId === id); if (!r) return [];
      const o = r.measurement ? observes(r) : null;
      const part = !r.measurement ? null : o && o.coverage !== 'FULL' ? o.unchecked ?? 'the part its check does not read' : r.measurement.observer === 'CHECK' && !qualifiedIn(std, id) ? 'what its check, not qualified on your examples, reads' : null;
      return [{ id, statement: r.statement, ...(part ? { part } : {}) }];
    }),
    // THE OWNER'S ROWS OF THE CONSEQUENCE TABLE (core/eval/consequence.ts): every other row is the latitude's default.
    ...(std.consequences && Object.keys(std.consequences).length ? { consequences: { ...std.consequences } } : {}),
    // WRITTEN CHECKS HELD AGAIN TO THE OWNER'S RULINGS since the build (core/method/requalify.ts): what moved, and on what.
    ...(Object.keys(std.requalified ?? {}).length ? { requalified: Object.entries(std.requalified ?? {}).flatMap(([id, rq]) => {
      const r = std.requirements.find((q) => q.requirementId === id); const now = std.qualifications?.[id];
      return r && now ? [{ id, statement: r.statement, was: rq.base.qualified, now: now.qualified, accepted: rq.accepted.length, rejected: rq.rejected.length, cross: rq.cross.length, at: rq.at }] : [];
    }) } : {}),
    errorBound: null,
    why: 'no delivered-error bound: it needs an audit sample of your own labels, drawn like the work this skill does; the checks and readers above are what this output was held to',
  };
}

/** The one record head `run --json` and `verify --json` both print, before what each door adds. */
export const RECORD_SCHEMA = 'atelier-record/1';
export interface RecordHead {
  readonly schema: typeof RECORD_SCHEMA;
  /** VERIFIED, NEEDS_REVIEW or BLOCKED; null where no record could be built */
  readonly state: RunState | null;
  readonly standardVersionHash: string;
  readonly skillVersion: string | null;
  readonly certificate: Certificate | null;
  readonly record: EvaluationRecord | null;
  /** what was done with the output (core/eval/consequence.ts): SHIP, SHIP_LABELLED, PERSON or BLOCK, with the rows that decided it; null where no record could be built */
  readonly delivery: Delivery | null;
}
/** The head, with the record's delivery carried beside its state and on its certificate. */
export const recordHead = (x: Omit<RecordHead, 'schema' | 'delivery'>): RecordHead => {
  const delivery = x.record?.delivery ?? null;
  return { schema: RECORD_SCHEMA, ...x, certificate: x.certificate && delivery ? { ...x.certificate, delivery: delivery.decision } : x.certificate, delivery };
};
