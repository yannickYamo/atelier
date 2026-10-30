// atelier/core/eval/consequence.ts — WHAT IS DONE WITH AN OUTPUT, DECIDED BY A TABLE THE OWNER OWNS.
//
// The record (./record.ts) says what was observed: VERIFIED, NEEDS_REVIEW, BLOCKED, entry by entry, and it stays honest
// about coverage. Delivery is a separate decision: SHIP, SHIP_LABELLED (the work goes out with what was not read named on
// it), PERSON (it waits for the owner's decision) or BLOCK. It is decided after repair, by one table: one row per kind of
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
import { allocate, budgetFor, type Gate } from '../delivery/budget.js';

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
 * THE DEFAULTS BY LATITUDE. Repair runs before the table on every row it can target, as it
 * always has: "block" after a trusted check fails is "repair, then block". `listed` is the record's own "listed for you":
 * labelled at every level.
 */
export const DEFAULT_TABLE: Readonly<Record<LatitudeLevel, ConsequenceTable>> = {
  // A CHECK STOPS THE WORK ONLY ON PROOF (core/delivery/budget.ts). A check not yet qualified, a reader not measured on
  // this kind, a rule nothing read, a check that could not run: none has shown a false-stop rate, so none holds the
  // work; what it found is written on the work for the person. Holding on such rows sent every run to review, correct work
  // included, because unqualified checks fire on correct pieces too. The trusted rows stop
  // the work within the latitude's budget, by each check's proof; the taste reader's veto is the owner's labels, their word.
  STRICT: { 'trusted-fail': 'block', 'untrusted-fail': 'label', 'untrusted-pass': 'label', 'judgement-unread': 'label', 'judgement-missed': 'person',
    'untraced-specific': 'block', 'claim-flagged': 'label', 'not-run': 'label', listed: 'label', clean: 'ship' },
  GROUNDED: { 'trusted-fail': 'block', 'untrusted-fail': 'label', 'untrusted-pass': 'label', 'judgement-unread': 'label', 'judgement-missed': 'person',
    'untraced-specific': 'person', 'claim-flagged': 'label', 'not-run': 'label', listed: 'label', clean: 'ship' },
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

/** What the budget reads beside the table: the level that sets it, and the rows the owner set themselves (their word, outside the budget). */
export interface DeliveryContext { readonly latitude?: LatitudeLevel; readonly owned?: ReadonlySet<string> }

/**
 * THE GATES OF A RECORD: every required entry a believed check read, with the proof it carries. The budget is allocated
 * over all of them, passed or failed, so the same skill admits the same checks on every run.
 */
function gatesOf(r: Pick<EvaluationRecord, 'entries'>): Gate[] {
  return r.entries.filter((e) => e.required && e.observation.proposition !== null && (e.observation.qualification === 'DETERMINISTIC' || e.observation.qualification === 'QUALIFIED'))
    .map((e) => ({ id: e.id, evidence: e.observation.proof ?? { kind: 'goldens', n: 0, falseStops: 0 } }));
}

/**
 * The delivery of one record under one table: the most severe action among the rows that fired, and those rows. A row
 * that would stop the work (person or block) does so only for the entries whose check is admitted by the false-stop
 * budget (core/delivery/budget.ts); the rest of its entries are labelled, and the budget is written on the delivery.
 * A row the owner set is their word and is not held to the budget.
 */
export function deliveryOf(r: Pick<EvaluationRecord, 'entries' | 'latitude'>, table: ConsequenceTable, ctx: DeliveryContext = {}): Delivery {
  const by = new Map<ConsequenceFinding, string[]>();
  for (const e of r.entries) for (const f of findingsOf(e)) by.set(f, [...(by.get(f) ?? []), e.id]);
  const level = ctx.latitude ?? r.latitude ?? 'GROUNDED';
  const allocation = allocate(gatesOf(r), budgetFor(level));
  const tier = new Map(allocation.gates.map((g) => [g.id, g]));
  const rows: DeliveryRow[] = [];
  const steered: { id: string; why: string }[] = [];
  for (const [finding, entries] of by) {
    const action = table[finding];
    if (RANK[action] < RANK.person || ctx.owned?.has(finding)) { rows.push({ finding, action, entries }); continue; }
    const admitted = entries.filter((id) => (tier.get(id)?.tier ?? 'STEER') === 'BLOCK');
    const held = entries.filter((id) => !admitted.includes(id));
    if (admitted.length) rows.push({ finding, action, entries: admitted });
    if (held.length) { rows.push({ finding, action: 'label', entries: held }); for (const id of held) steered.push({ id, why: tier.get(id)?.why ?? 'no proof of its false stops' }); }
  }
  if (!rows.length) rows.push({ finding: 'clean', action: table.clean, entries: [] });
  rows.sort((a, b) => RANK[b.action] - RANK[a.action] || FINDINGS.findIndex((f) => f.id === a.finding) - FINDINGS.findIndex((f) => f.id === b.finding));
  return { decision: DECISION[rows[0].action], why: rows, budget: { budget: allocation.budget, shipsGood: allocation.shipsGood, steered } };
}

/** The record with its delivery decided by the table. */
export const withDelivery = (r: EvaluationRecord, table: ConsequenceTable, ctx: DeliveryContext = {}): EvaluationRecord => ({ ...r, delivery: deliveryOf(r, table, ctx) });

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
  // STRICT IS THE OWNER'S WORD THAT NOTHING LESS THAN CONFORMANT GOES OUT: a required rule broken is refused even where
  // its check is not proven enough to block within the budget (delivery would ship it labelled); and whatever delivery
  // held back is refused as well.
  const nonconformant = strict && (!conformant || (decided ? !shipped(decided) : false));
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
