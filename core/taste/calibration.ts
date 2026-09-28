// atelier/core/taste/calibration.ts — WHAT THE TASTE READER HAS EARNED, FROM THE OWNER'S OWN RULINGS.
//
// The pre-registered design is in docs/TASTE.md, and the bar below is the one written there, fixed
// before any data:
//
//   what is bounded   the FALSE-BLOCK rate: of the reader's MISSED readings (with a quoted passage)
//                     that the owner labelled, the share the owner says were followed after all
//   statistic         exact one-sided 95% upper bound (Clopper–Pearson)
//   bar               ≤ 0.15, pooled over a standard's reading-based rules, with at least one
//                     confirmed miss; a rule whose own labelled misses are wrong in more than a third
//                     of three or more loses VETO on its own
//   scope             the reader model and each rule's exact wording; change either and it is OBSERVE
//
// Everything here is a pure function of recorded events. Labels are the owner's, collected blind to
// the reader's verdict (cli/commands/taste.ts); nothing a model says is ever a label.

import { createHash } from 'node:crypto';
import type { Requirement } from '../state/canonical-state.js';
import type { ObserverPermission } from '../measurement/permission.js';
import { clopperPearsonUpper } from '../distinctiveness/measured.js';
import { squash, actsAsMiss, type TasteReading } from './reader.js';

export const FALSE_BLOCK_BAR = 0.15;
/** A rule loses VETO on its own when more than this share of at least `OWN_MIN` labelled misses were wrong. */
export const OWN_BAR = 1 / 3;
export const OWN_MIN = 3;

export const statementHash = (r: Pick<Requirement, 'statement'>): string => createHash('sha256').update(r.statement).digest('hex').slice(0, 12);

/** One recorded reading of one text, with the passage shown to the owner when it is labelled. */
export interface TasteReadingEvent {
  readonly kind: 'TASTE_READING';
  readonly readingId: string;
  readonly invocationId: string | null;
  readonly standardVersionHash: string;
  readonly readerModel: string;
  readonly at: string;
  /**
   * Held back for calibration: none of this reading's verdicts was shown to anyone. Only these readings
   * are put to the owner, so a label is never given by someone who has just seen the reader's verdict
   * on the same passage (see `heldBack`).
   */
  readonly blind?: boolean;
  readonly readings: readonly (TasteReading & { readonly statementHash: string; readonly passage?: string })[];
}

/** The share of readings held back for calibration when nothing else is set (ATELIER_TASTE_HOLDBACK). */
export const HOLDBACK = 1 / 3;

/**
 * Whether a reading is held back: its verdicts are acted on as usual but not displayed, and it joins the
 * calibration queue. Deterministic in the reading's id, so it cannot be steered by what the reading says.
 */
export function heldBack(readingId: string, share = HOLDBACK): boolean {
  if (share <= 0) return false;
  if (share >= 1) return true;
  return parseInt(createHash('sha256').update(`holdback|${readingId}`).digest('hex').slice(0, 8), 16) / 0x100000000 < share;
}

/** The label token a reading is listed and labelled by: stable while other readings are labelled. */
export const labelToken = (readingId: string, key: string): string => `${readingId.slice(0, 8)}:${key}`;


export type OwnerLabel = 'FOLLOWED' | 'MISSED' | 'UNSURE';

export interface TasteLabelEvent {
  readonly kind: 'TASTE_LABEL';
  readonly readingId: string;
  readonly key: string;
  readonly statementHash: string;
  readonly label: OwnerLabel;
  readonly at: string;
}

/**
 * The passage the owner reads when labelling, without the reader's verdict: the paragraph holding the
 * quote, or, when the paragraph is long or the quote spans paragraphs, a window of about `max`
 * characters centred on it.
 */
export function passageAround(text: string, quote: string, max = 900): string | undefined {
  const q = squash(quote);
  if (!q) return undefined;
  const p = text.split(/\n\s*\n/).find((x) => squash(x).includes(q));
  if (p && p.length <= max) return p;
  // Find the quote in the text with whitespace allowed to differ, then centre a window on it.
  const at = new RegExp(q.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')).exec(text);
  if (!at) return undefined;
  const pad = Math.max(0, Math.floor((max - at[0].length) / 2));
  const start = Math.max(0, at.index - pad);
  const end = Math.min(text.length, at.index + at[0].length + pad);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export interface RulePermission {
  readonly key: string;
  readonly permission: ObserverPermission;
  /** labelled MISSED readings the owner confirmed, and the ones they said were followed */
  readonly confirmed: number;
  readonly falseBlocks: number;
  /** labelled FOLLOWED readings the owner said were missed: reported, never used (CERTIFY is not available) */
  readonly missedClears: number;
  readonly why: string;
}

export interface TastePermissions {
  readonly pooled: { readonly trials: number; readonly falseBlocks: number; readonly confirmed: number; readonly upper95: number; readonly earned: boolean };
  readonly rules: ReadonlyMap<string, RulePermission>;
  /** keys holding VETO */
  readonly veto: ReadonlySet<string>;
}

/**
 * What each current rule may do, from the readings and labels on record. Only readings taken by
 * `readerModel` of the rule's current wording count.
 */
export function tastePermissions(
  rules: readonly { rule: Requirement; key: string }[],
  events: readonly Record<string, unknown>[],
  readerModel: string,
): TastePermissions {
  const current = new Map(rules.map(({ rule, key }) => [key, statementHash(rule)]));
  const readings = new Map<string, TasteReading & { statementHash: string }>();
  for (const e of events) {
    if (e.kind !== 'TASTE_READING') continue;
    const ev = e as unknown as TasteReadingEvent;
    // Only held-back readings count: a label on a reading whose verdict had been displayed (or one recorded
    // before readings were held back) is not blind, so it cannot earn anything.
    if (ev.readerModel !== readerModel || !ev.blind) continue;
    for (const r of ev.readings) readings.set(`${ev.readingId}|${r.key}`, r);
  }
  const labels = new Map<string, OwnerLabel>();
  for (const e of events) {
    if (e.kind !== 'TASTE_LABEL') continue;
    const l = e as unknown as TasteLabelEvent;
    if (current.get(l.key) !== l.statementHash) continue;          // the rule was reworded: that label is about other words
    labels.set(`${l.readingId}|${l.key}`, l.label);                 // the latest label for a reading stands
  }
  const per = new Map<string, { confirmed: number; falseBlocks: number; missedClears: number }>();
  for (const [id, label] of labels) {
    const r = readings.get(id);
    if (!r || label === 'UNSURE' || r.statementHash !== current.get(r.key)) continue;
    const t = per.get(r.key) ?? { confirmed: 0, falseBlocks: 0, missedClears: 0 };
    if (actsAsMiss(r)) { if (label === 'MISSED') t.confirmed += 1; else t.falseBlocks += 1; }
    if (r.verdict === 'FOLLOWED' && label === 'MISSED') t.missedClears += 1;
    per.set(r.key, t);
  }
  const confirmed = [...per.values()].reduce((n, t) => n + t.confirmed, 0);
  const falseBlocks = [...per.values()].reduce((n, t) => n + t.falseBlocks, 0);
  const trials = confirmed + falseBlocks;
  const upper95 = trials ? clopperPearsonUpper(falseBlocks, trials, 0.95) : 1;
  const earned = trials > 0 && confirmed >= 1 && upper95 <= FALSE_BLOCK_BAR;
  const out = new Map<string, RulePermission>();
  for (const { key } of rules) {
    const t = per.get(key) ?? { confirmed: 0, falseBlocks: 0, missedClears: 0 };
    const own = t.confirmed + t.falseBlocks;
    const revoked = own >= OWN_MIN && t.falseBlocks / own > OWN_BAR;
    const permission: ObserverPermission = earned && !revoked ? 'VETO' : 'OBSERVE';
    const why = revoked ? `its own labelled misses were wrong ${t.falseBlocks} of ${own} times`
      : earned ? `the reader's misses held up: ${falseBlocks} wrong of ${trials} labelled (at most ${Math.round(upper95 * 100)}%, 95% bound)`
        : trials ? `${falseBlocks} wrong of ${trials} labelled misses so far (at most ${Math.round(upper95 * 100)}%; needs ${Math.round(FALSE_BLOCK_BAR * 100)}%)`
          : 'no labelled misses yet';
    out.set(key, { key, permission, ...t, why });
  }
  return { pooled: { trials, falseBlocks, confirmed, upper95, earned }, rules: out,
    veto: new Set([...out.values()].filter((p) => p.permission === 'VETO').map((p) => p.key)) };
}

/**
 * What to ask the owner next: held-back readings with a quoted passage, oldest first, not yet labelled.
 * Blind twice over: the owner never saw these verdicts (`heldBack`), and the queue takes FOLLOWED and
 * MISSED alike, in the order they were taken, never chosen by verdict.
 */
export function calibrationQueue(rules: readonly { rule: Requirement; key: string }[], events: readonly Record<string, unknown>[], readerModel: string) {
  const current = new Map(rules.map(({ rule, key }) => [key, { hash: statementHash(rule), rule }]));
  const labelled = new Set(events.filter((e) => e.kind === 'TASTE_LABEL').map((e) => `${String(e.readingId)}|${String(e.key)}`));
  const out: { readingId: string; key: string; token: string; rule: Requirement; passage: string; statementHash: string }[] = [];
  for (const e of events) {
    if (e.kind !== 'TASTE_READING') continue;
    const ev = e as unknown as TasteReadingEvent;
    if (ev.readerModel !== readerModel || !ev.blind) continue;
    for (const r of ev.readings) {
      const c = current.get(r.key);
      if (c?.hash !== r.statementHash || !c || !r.passage || !(r.verdict === 'FOLLOWED' || actsAsMiss(r))) continue;
      if (labelled.has(`${ev.readingId}|${r.key}`)) continue;
      out.push({ readingId: ev.readingId, key: r.key, token: labelToken(ev.readingId, r.key), rule: c.rule, passage: r.passage, statementHash: r.statementHash });
    }
  }
  return out;
}
