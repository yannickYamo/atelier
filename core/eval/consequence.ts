// atelier/core/eval/consequence.ts — WHAT IS DONE WITH AN OUTPUT, DECIDED BY A TABLE THE OWNER OWNS.
//
// The record (./record.ts) says what was observed: VERIFIED, NEEDS_REVIEW, BLOCKED, entry by entry, and it stays honest
// about coverage. Delivery is a separate decision: SHIP, SHIP_LABELLED (the work goes out with what was not read named on
// it), PERSON (it waits for the owner's ruling) or BLOCK. It is decided after repair, by one table: one row per kind of
// finding, an action per row. The table's defaults follow from the latitude the owner ratified, so no rule needs a
// separate acceptance to ship; the owner may set any row otherwise (`atelier amend --consequence <finding>=<action>`),
// and only the rows they changed are kept in the standard, inside its hash. A standard minted before the table existed
// is held by its latitude's defaults (GROUNDED where it has none).
//
// Nothing here reads meaning. Each entry's finding is read off the record's typed facts (its result, its reason, which
// observer read it, what an unbelieved observer found); the decision is the most severe action among the rows that fired.
// What makes a check trusted is its qualification on the owner's examples and rulings (core/method/requalify.ts), and a
// check that qualifies moves its findings from the untrusted rows to the trusted one with no change to the table.

import type { ConsequenceAction, ConsequenceFinding, LatitudeLevel, StandardVersion } from '../state/canonical-state.js';
import { latitudeOf } from '../state/canonical-state.js';
import type { Delivery, DeliveryDecision, DeliveryRow, Entry, EvaluationRecord } from './record.js';

export type { ConsequenceAction, ConsequenceFinding } from '../state/canonical-state.js';
export type ConsequenceTable = Readonly<Record<ConsequenceFinding, ConsequenceAction>>;

/** Every finding the table has a row for, in the order a person reads them, each in plain words. */
export const FINDINGS: readonly { readonly id: ConsequenceFinding; readonly says: string }[] = [
  { id: 'trusted-fail', says: 'a trusted check (counted, or written and qualified) fails' },
  { id: 'untrusted-fail', says: 'a written check not yet qualified fails' },
  { id: 'untrusted-pass', says: 'a written check not yet qualified finds nothing' },
  { id: 'judgement-unread', says: 'a judgement rule, or the part of a rule no check reads, was not read' },
  { id: 'judgement-missed', says: 'the taste reader, qualified by your labels on the rule, read it as missed' },
  { id: 'untraced-specific', says: 'a figure, date or citation was decided absent from the bound material' },
  { id: 'claim-flagged', says: 'a specific only the claim reader flagged, or could not find (not measured on this kind)' },
  { id: 'not-run', says: 'a check could not run, or the material it needs was not bound' },
  { id: 'listed', says: 'listed for you only (a rule you accepted unmeasured, possible slips)' },
  { id: 'clean', says: 'nothing found anywhere' },
];
export const ACTIONS: readonly ConsequenceAction[] = ['ship', 'label', 'person', 'block'];

/**
 * THE DEFAULTS BY LATITUDE (docs: the plan of 2026-10-22). Repair runs before the table on every row it can target, as it
 * always has: "block" after a trusted check fails is "repair, then block". `listed` is the record's own "listed for you":
 * labelled at every level.
 */
export const DEFAULT_TABLE: Readonly<Record<LatitudeLevel, ConsequenceTable>> = {
  STRICT: { 'trusted-fail': 'block', 'untrusted-fail': 'person', 'untrusted-pass': 'label', 'judgement-unread': 'person', 'judgement-missed': 'person',
    'untraced-specific': 'block', 'claim-flagged': 'person', 'not-run': 'person', listed: 'label', clean: 'ship' },
  GROUNDED: { 'trusted-fail': 'block', 'untrusted-fail': 'person', 'untrusted-pass': 'label', 'judgement-unread': 'label', 'judgement-missed': 'person',
    'untraced-specific': 'person', 'claim-flagged': 'person', 'not-run': 'label', listed: 'label', clean: 'ship' },
  CREATIVE: { 'trusted-fail': 'label', 'untrusted-fail': 'label', 'untrusted-pass': 'label', 'judgement-unread': 'label', 'judgement-missed': 'label',
    'untraced-specific': 'label', 'claim-flagged': 'label', 'not-run': 'label', listed: 'label', clean: 'ship' },
};

/** The table a standard holds an output by, at a level (the run's, where it tightened the skill's): its latitude's defaults, with the owner's rows over them. */
export function tableOf(std: Pick<StandardVersion, 'latitude' | 'consequences'> | null | undefined, level?: LatitudeLevel): ConsequenceTable {
  return { ...DEFAULT_TABLE[level ?? latitudeOf(std)], ...(std?.consequences ?? {}) };
}

/**
 * THE FINDINGS ONE ENTRY FIRES. Only what is required can hold delivery; what does not apply (set aside for this request,
 * replaced by it, outside its case) and what passed fire nothing. A rule a check read in part fires its check's row for
 * the read part and the judgement row for the rest.
 */
export function findingsOf(e: Entry): ConsequenceFinding[] {
  if (!e.required || e.result === 'NOT_APPLICABLE' || e.result === 'PASS') return [];
  const o = e.observation;
  const specifics = e.dimension === 'EVIDENCE' && e.id === 'specifics';
  if (e.result === 'FAIL') return [o.reader === 'TASTE' ? 'judgement-missed' : specifics ? 'untraced-specific' : 'trusted-fail'];
  // UNVERIFIED from here. A check that exists and did not finish its reading: the evaluation is incomplete.
  if (o.incomplete !== undefined) return ['not-run'];
  if (e.reason === 'LISTED_FOR_YOU') return ['listed'];
  if (e.reason === 'OBSERVER_UNQUALIFIED') {
    const read: ConsequenceFinding = o.found === 'VIOLATED' ? (specifics ? 'claim-flagged' : 'untrusted-fail') : 'untrusted-pass';
    return o.coverage === 'PARTIAL' ? [read, 'judgement-unread'] : [read];
  }
  // Specifics left open by a reader that decides: it could not find them, and could not say they were invented.
  if (e.reason === 'PARTLY_CHECKED') return [specifics ? 'claim-flagged' : 'judgement-unread'];
  // NOTHING READ IT. With no check at all, the rule is judgement; with a check that had nothing to read (the material it
  // needs not bound, a request length no count can hold), the check could not run.
  return [o.proposition === null ? 'judgement-unread' : 'not-run'];
}

const RANK: Readonly<Record<ConsequenceAction, number>> = { ship: 0, label: 1, person: 2, block: 3 };
const DECISION: Readonly<Record<ConsequenceAction, DeliveryDecision>> = { ship: 'SHIP', label: 'SHIP_LABELLED', person: 'PERSON', block: 'BLOCK' };

/**
 * WHO MAY REFUSE A REPAIR (core/loop/run-repair.ts). A rewrite is judged against the rules it could make worse, but only a
 * rule whose failure could hold the work at this table, sent to a person or blocked, may refuse one: a rule that would only
 * label the work, or list what it found, never vetoes the repair of a rule that holds it. Read by the class of the check:
 * a trusted check (counted, or written and qualified), a written check not yet qualified, or the claim check, whose row
 * follows what an untraced specific meets at this run (core/loop/claim-extract.ts, `claimAction`: a listed one is only
 * listed). Nothing here reads a rule's meaning.
 */
export type RepairClass = 'trusted' | 'untrusted' | 'specifics';
export function repairVeto(table: ConsequenceTable, cls: RepairClass, claimAct?: 'cut' | 'block' | 'review' | 'list'): boolean {
  const rows: readonly ConsequenceFinding[] = cls === 'trusted' ? ['trusted-fail'] : cls === 'untrusted' ? ['untrusted-fail']
    : claimAct === 'list' ? ['listed'] : ['untraced-specific', 'claim-flagged'];
  return rows.some((f) => RANK[table[f]] >= RANK.person);
}

/** The delivery of one record under one table: the most severe action among the rows that fired, and those rows. */
export function deliveryOf(r: Pick<EvaluationRecord, 'entries'>, table: ConsequenceTable): Delivery {
  const by = new Map<ConsequenceFinding, string[]>();
  for (const e of r.entries) for (const f of findingsOf(e)) by.set(f, [...(by.get(f) ?? []), e.id]);
  const rows: DeliveryRow[] = by.size ? [...by].map(([finding, entries]) => ({ finding, action: table[finding], entries }))
    : [{ finding: 'clean', action: table.clean, entries: [] }];
  rows.sort((a, b) => RANK[b.action] - RANK[a.action] || FINDINGS.findIndex((f) => f.id === a.finding) - FINDINGS.findIndex((f) => f.id === b.finding));
  return { decision: DECISION[rows[0].action], why: rows };
}

/** The record with its delivery decided by the table. */
export const withDelivery = (r: EvaluationRecord, table: ConsequenceTable): EvaluationRecord => ({ ...r, delivery: deliveryOf(r, table) });

/** Did delivery let the output go out: shipped, plainly or labelled. */
export const shipped = (d: Delivery | null | undefined): boolean => d?.decision === 'SHIP' || d?.decision === 'SHIP_LABELLED';

/** The exit code of a strict run whose output did not conform, delivered or not. */
export const STRICT_EXIT = 3;

/**
 * WHAT A RUN DOES WITH ITS WORK, one decision for every door that delivers it (a run, and a fix in place): under strict
 * delivery an output that did not ship (or, with no record, did not conform) is not conformant and is refused unless
 * `--allow-nonconformant`; the exit is STRICT_EXIT for that, 1 for a BLOCK, 0 otherwise; and the line printed above it.
 */
export function deliveryOutcome(strict: boolean, decided: Delivery | null | undefined, conformant: boolean, allowed: boolean): { nonconformant: boolean; refused: boolean; exit: number; head: string } {
  const nonconformant = strict && (decided ? !shipped(decided) : !conformant);
  const refused = nonconformant && !allowed;
  const exit = nonconformant ? STRICT_EXIT : decided?.decision === 'BLOCK' ? 1 : 0;
  const head = nonconformant ? 'NOT CONFORMANT, delivered because --allow-nonconformant was given:\n\n'
    : decided?.decision === 'PERSON' ? 'FOR YOUR REVIEW (sent to a person, not shipped as checked):\n\n' : decided?.decision === 'BLOCK' ? 'BLOCKED (not for use as it is):\n\n' : '';
  return { nonconformant, refused, exit, head };
}

/**
 * THE OWNER'S ROWS, AS THEY TYPE THEM (`--consequence untrusted-fail=block,judgement-unread=person`): a form parser of
 * `<finding>=<action>` pairs, nothing more. `default` takes a row back to its latitude's default. What is no finding or no
 * action is said and left out; it never stops the command.
 */
export function parseConsequences(spec: string, prev: StandardVersion['consequences'], say: (line: string) => void): Partial<Record<ConsequenceFinding, ConsequenceAction>> {
  const out: Partial<Record<ConsequenceFinding, ConsequenceAction>> = { ...(prev ?? {}) };
  for (const pair of spec.split(',').map((x) => x.trim()).filter(Boolean)) {
    const at = pair.indexOf('=');
    const finding = (at === -1 ? pair : pair.slice(0, at)).trim().toLowerCase() as ConsequenceFinding;
    const action = (at === -1 ? '' : pair.slice(at + 1)).trim().toLowerCase();
    if (!FINDINGS.some((f) => f.id === finding)) { say(`Consequence: not "${pair}", no such finding. The findings: ${FINDINGS.map((f) => f.id).join(', ')}.`); continue; }
    if (action === 'default') { out[finding] = undefined; continue; }
    if (!(ACTIONS as readonly string[]).includes(action)) { say(`Consequence: not "${pair}", the action is one of ${ACTIONS.join(', ')} or default.`); continue; }
    out[finding] = action as ConsequenceAction;
  }
  // A row taken back to its default is left out: only the owner's overrides are kept.
  return Object.fromEntries(Object.entries(out).filter(([, a]) => a !== undefined));
}

/** The table as a person reads it: one line a finding, the action, and whether it is the owner's or the latitude's. */
export function describeTable(std: Pick<StandardVersion, 'latitude' | 'consequences'>): string[] {
  const t = tableOf(std); const level = latitudeOf(std).toLowerCase();
  return FINDINGS.map((f) => `  ${f.id.padEnd(18)} ${t[f.id].padEnd(7)} ${std.consequences?.[f.id] ? '(yours)' : `(${level} default)`}  ${f.says}`);
}

/** One line for the work as delivered: the decision and the rows that sent it there. */
export function deliveryLine(d: Delivery): string {
  const rows = d.why.filter((w) => w.action !== 'ship').map((w) => `${w.finding}${w.entries.length ? ` (${w.entries.join(', ')})` : ''}: ${w.action}`);
  return `Delivery: ${d.decision.replace('_', ' ').toLowerCase()}${rows.length ? `; ${rows.join('; ')}` : ''}`;
}
