// atelier/core/composite/selection.ts — THE PERSON'S COMBINATION, AS DECISIONS ON EVERY PROPOSAL.
//
// The target of a composite skill is what the person chose from each author: not the average of the authors and
// not any one of them. So every proposal gets exactly one of four outcomes, and none is dropped in silence:
//
//   SELECTED   its author was admired for the class it falls in (./admire.ts): approved, and it instructs
//   HABIT      not selected, and shared with another author (./traits.ts), or by an author the person admired for
//              something else: kept as a preference, shown and never instructed. Evidence, not the person's rule
//   REJECTED   not selected, not shared, by an author the person said nothing about
//   OPEN       one side of a conflict nobody has answered: neither side instructs, and the question is kept
//
// A conflict is answered by the person (`--conflict 1=A`), or by their admiration when exactly one side's class
// was admired from its author; with both sides admired, or neither, it stays open. Nothing here guesses. Admiring a
// class takes the rules MAINLY about it (traits.ts, `primaryClassOf`): a ban on bullet lists that says "sentences"
// is not pace.
//
// THE INVARIANT, HELD LAST: TWO CONTRADICTORY RULES NEVER BOTH INSTRUCT. Each rule is decided once across all its
// conflicts (`resolvePerRule`), but a rule can still come to instruct by more than one route: chosen in one conflict
// by the person's answer while the other side's author is admired in another; admired for a class while a rule it
// contradicts is chosen for another class, the table only pairing rules of a shared class; a "both" range whose
// widened limits now contradict a third rule. So after every rule is decided, and before anything is compiled, one
// guard (`guardInstructing`) takes every rule that will instruct (chosen by admiration or by an answer, a range's
// carrier included, at the limits it will be checked against) and tests every pair from two authors with the same
// detector the table uses (traits.ts, `relationOf`: worded against worded, worded against counted, counted bands and
// ranges). For a pair that contradicts:
//
//   the person answered "both" for that pair       both stand, as they said, and the screen says so
//   one side was chosen by an explicit answer      it stands; the other is set aside, naming that answer
//   neither side was (or both were)                NEITHER instructs: the pair is an open question on the screen,
//                                                   under the table's own number when the two (or rules carried in
//                                                   their ranges) are a pair of it, else under a number after the
//                                                   table's, which `--conflict` answers like any other
//
// A rule the person made required with `--set` is their latest word: it outranks an earlier answer, and the screen says
// so in one line. A pair the model read as impossible to follow together (./contradictions.ts) is never settled by rank:
// unless the person answered that pair, neither side instructs. Nor is a pair that conflicts only by the model's reading
// of a rule's numbers, where it and the quantity grammar (./quantity.ts) read them two ways. An answer whose choice the guard had to open again is
// said so, with why, and counted as open.
//
// One author's own rules are not paired here: they are read from one body of work, as in a skill of one author.
// The screen, the author lines and the count of open questions are all read from the outcome after the guard.

import type { Measurement, Requirement } from '../state/canonical-state.js';
import { restateLimits } from '../observers/derive.js';
import { TRAIT_LABEL, labelOf, mergedMeasurement, primaryClassOf, relationOf, type Conflict, type ConflictSide, type ReadRule, type TraitClass, type TraitKind, type TraitTable } from './traits.js';
import { describeQuantity, quantitiesOf, sameReading, type Quantity } from './quantity.js';

export interface CompositeAuthor {
  readonly name: string;
  /** the ids of the pieces by this author */
  readonly pieces: readonly string[];
  /** what the person said they like, as they said it; null when they said nothing */
  readonly admired: string | null;
  /** the classes that line selected, among those the author's rules fall in */
  readonly classes: readonly TraitClass[];
}

export type Outcome = 'SELECTED' | 'HABIT' | 'REJECTED' | 'OPEN';
export type ConflictAnswer = 'A' | 'B' | 'both';

export interface CompositeDecision {
  readonly id: string; readonly author: string; readonly cls: TraitClass; readonly kind: TraitKind;
  readonly outcome: Outcome; readonly why: string;
  /** on 'both as a range': the id this one is merged into, and so does not stand on its own */
  readonly mergedInto?: string;
  /** on 'both as a range' of two counted rules: the one range both limits fit in, carried by the side that stands */
  readonly range?: Measurement;
  /** on 'both' of two worded rules, which cannot be one range: each is kept, shown and never instructed over the other */
  readonly shownOnly?: true;
  /**
   * SELECTED BY THE PERSON'S OWN LINE about this author (directly, or by settling a conflict): the owner's word, not
   * inferred evidence, so it is ratified to instruct (cli/commands/composite.ts, `decisionsFor`).
   */
  readonly byAdmiration?: true;
  /**
   * in a conflict: the conflict whose answer (or admiration) settled this rule, and how; absent while it is open. SET: the
   * person made it required with `--set <id>=required`, their latest word (n is the conflict it stood in, or 0).
   */
  readonly settledBy?: { readonly n: number; readonly how: 'ANSWER' | 'ADMIRATION' | 'SET' };
  /** open: the unanswered conflict that keeps it from instructing */
  readonly openIn?: number;
  /** in a conflict: the numbers of every conflict this rule is a side of */
  readonly inConflicts?: readonly number[];
  /** its author was admired for what this rule is about */
  readonly admired?: true;
}

export interface AnsweredConflict extends Conflict {
  readonly answer: ConflictAnswer | null;
  /**
   * ANOTHER_ANSWER: settled by the guard, for the side the person chose in another conflict. SET: settled by the
   * person's `--set <id>=required`, their latest word, which outranks an answer given before it.
   */
  readonly resolvedBy: 'ANSWER' | 'ADMIRATION' | 'ANOTHER_ANSWER' | 'SET' | null;
  /** found by the final guard, not by the table: two rules of no shared class, or a range against a third rule */
  readonly foundLast?: true;
  /** found by the model's reading of the final instructions (./contradictions.ts), with its one-line reason */
  readonly provenance?: 'read by the model at build';
  readonly reason?: string;
  /**
   * ANSWERED, AND OPEN AGAIN: what the person's answer chose would instruct beside a rule it cannot stand with, and
   * nothing they said decides between the two, so the guard opened it under conflict `in`. Counted as open.
   */
  readonly reopened?: { readonly in: number; readonly why: string };
}

/** A pair the model read as impossible to follow together, by rule id, with its reason. */
export interface ModelPair { readonly a: string; readonly b: string; readonly reason: string }
/** A quantity the model read in a rule's words (./contradictions.ts), by rule id. */
export interface ModelQuantity { readonly id: string; readonly quantity: Quantity }

/** What the person said beyond the conflicts: the rules they made required (`--set <id>=required`), and the model's reading. */
export interface ComposeOptions {
  readonly forced?: ReadonlySet<string>;
  readonly modelPairs?: readonly ModelPair[];
  readonly modelQuantities?: readonly ModelQuantity[];
}

/**
 * A WORDED RULE READ TWO WAYS: the quantity grammar (./quantity.ts) and the model read its numbers differently. Both
 * readings stand: the rule is held against any rule either reading conflicts with, and the screen says so. Only the
 * rules the model gave a reading for are compared; a rule it read nothing in keeps the grammar's reading alone.
 */
export function readTwoWays(proposals: readonly Requirement[], modelQuantities: readonly ModelQuantity[]): Map<string, { readonly grammar: Quantity[]; readonly model: Quantity[] }> {
  const out = new Map<string, { grammar: Quantity[]; model: Quantity[] }>();
  const byId = new Map(proposals.map((p) => [p.requirementId, p]));
  const ids = [...new Set(modelQuantities.map((q) => q.id))];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p || p.measurement) continue;
    const grammar = quantitiesOf(p.statement);
    const model = modelQuantities.filter((q) => q.id === id).map((q) => q.quantity);
    if (!sameReading(grammar, model)) out.set(id, { grammar, model });
  }
  return out;
}
const saidQ = (qs: readonly Quantity[]): string => (qs.length ? qs.map(describeQuantity).join(' and ') : 'no quantity');
/** The screen's line for a rule read two ways. */
export const twoWaysLine = (id: string, statement: string, r: { readonly grammar: readonly Quantity[]; readonly model: readonly Quantity[] }): string =>
  `read two ways: ${id} "${statement}" is ${saidQ(r.grammar)} by its words, and ${saidQ(r.model)} by the model; it is held against any rule either reading conflicts with.`;

/** The composite as stored on the skill: what was chosen from whom, and what stays open. Data, so a rebuild reads it and changes nothing. */
export interface CompositeRecord {
  readonly authors: readonly CompositeAuthor[];
  readonly decisions: readonly CompositeDecision[];
  readonly conflicts: readonly AnsweredConflict[];
  /** recurring decision moves read from the selected authors, offered as a methodology: a proposal, never the owner's method */
  readonly methodology: { readonly proposal: true; readonly steps: readonly { readonly id: string; readonly author: string; readonly statement: string }[] } | null;
  /** one line each, for the screen: a `--set` that outranked an earlier answer, or could not instruct */
  readonly notes?: readonly string[];
}

type SideOutcome = Pick<CompositeDecision, 'outcome' | 'why' | 'mergedInto' | 'range' | 'shownOnly' | 'byAdmiration' | 'settledBy' | 'inConflicts' | 'openIn'>;

/**
 * EVERY RULE IN A CONFLICT, DECIDED ONCE, ACROSS ALL ITS CONFLICTS. With three or more authors one rule sits in many
 * pairwise conflicts, and their outcomes must agree on it. The person's explicit words outrank everything:
 *
 *   1. an explicit answer that sets a rule aside (`--conflict 4=A` against it) keeps it set aside, whatever any other
 *      conflict says; an explicit answer for a rule makes it instruct;
 *   2. "both" makes the two one range (two counted rules on one observer; several such answers chained make one
 *      range); two statements that make no range are both kept, shown and not instructed;
 *   3. admiration settles a conflict nobody answered, only for a rule no answer has decided;
 *   4. a conflict nobody answered, and admiration cannot settle, leaves its undecided sides open: neither instructs.
 */
function resolvePerRule(conflicts: readonly AnsweredConflict[], byId: ReadonlyMap<string, Requirement>,
  clsOf: (id: string) => TraitClass | undefined): Map<string, SideOutcome> {
  const who = (c: AnsweredConflict): string => `${c.sides[0].author} against ${c.sides[1].author} on ${c.label}`;
  const inConflicts = new Map<string, number[]>();
  for (const c of conflicts) for (const s of c.sides) inConflicts.set(s.id, [...(inConflicts.get(s.id) ?? []), c.n]);
  const out = new Map<string, SideOutcome>();
  const set = (id: string, o: Omit<SideOutcome, 'inConflicts'>): void => { out.set(id, { ...o, inConflicts: inConflicts.get(id) ?? [] }); };
  const explicit = conflicts.filter((c) => c.resolvedBy === 'ANSWER');

  // 1. Explicit rejections first: they hold against everything else.
  const rejectedBy = new Map<string, AnsweredConflict>();
  for (const c of explicit) {
    if (c.answer !== 'A' && c.answer !== 'B') continue;
    const lose = c.answer === 'A' ? c.sides[1] : c.sides[0];
    if (!rejectedBy.has(lose.id)) rejectedBy.set(lose.id, c);
  }
  for (const [id, c] of rejectedBy) set(id, { outcome: 'REJECTED', why: `conflict ${c.n} (${who(c)}): you answered ${c.answer}`, settledBy: { n: c.n, how: 'ANSWER' } });
  // Then explicit choices, for rules no explicit answer set aside.
  for (const c of explicit) {
    if (c.answer !== 'A' && c.answer !== 'B') continue;
    const win = c.answer === 'A' ? c.sides[0] : c.sides[1];
    if (out.has(win.id)) continue;
    // The person's answer is their word as surely as their admiration: the side they chose instructs.
    set(win.id, { outcome: 'SELECTED', why: `conflict ${c.n} (${who(c)}): you answered ${c.answer}`, byAdmiration: true, settledBy: { n: c.n, how: 'ANSWER' } });
  }
  // 2. "Both": the pairs answered so, among rules not set aside, joined into groups; each group one range if it makes one.
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const firstBoth = new Map<string, AnsweredConflict>();
  for (const c of explicit) {
    if (c.answer !== 'both') continue;
    const live = c.sides.filter((s) => !rejectedBy.has(s.id));
    for (const s of live) if (!firstBoth.has(s.id)) firstBoth.set(s.id, c);
    if (live.length === 2) parent.set(find(live[1].id), find(live[0].id));
    else for (const s of live) if (!out.has(s.id)) set(s.id, { outcome: 'SELECTED', why: `conflict ${c.n} (${who(c)}): you answered both, and the other side is set aside by another answer of yours`, byAdmiration: true, settledBy: { n: c.n, how: 'ANSWER' } });
  }
  const groups = new Map<string, string[]>();
  for (const id of firstBoth.keys()) { if (out.has(id) && out.get(id)?.outcome === 'REJECTED') continue; const r = find(id); groups.set(r, [...(groups.get(r) ?? []), id]); }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const c = firstBoth.get(members[0]);
    if (!c) continue;
    const range = members.slice(1).reduce<Measurement | null>((m, id) => mergedMeasurement(m, byId.get(id)?.measurement), byId.get(members[0])?.measurement ?? null);
    const carrier = members[0];
    if (range) {
      set(carrier, { outcome: 'SELECTED', why: `conflict ${c.n} (${who(c)}): both, as one range`, range, byAdmiration: true, settledBy: { n: c.n, how: 'ANSWER' } });
      for (const id of members.slice(1)) { const ci = firstBoth.get(id) ?? c; set(id, { outcome: 'REJECTED', why: `conflict ${ci.n} (${who(ci)}): merged into ${carrier} as one range`, mergedInto: carrier, settledBy: { n: ci.n, how: 'ANSWER' } }); }
    } else {
      // Two worded rules make no range: both are kept, and neither instructs over the other.
      for (const id of members) { const ci = firstBoth.get(id) ?? c; set(id, { outcome: 'SELECTED', why: `conflict ${ci.n} (${who(ci)}): both kept, shown and not instructed, since two statements make no range`, shownOnly: true, settledBy: { n: ci.n, how: 'ANSWER' } }); }
    }
  }
  // 3. Admiration, for conflicts nobody answered, and only for rules no answer decided.
  for (const c of conflicts) {
    if (c.resolvedBy !== 'ADMIRATION') continue;
    const win = c.answer === 'A' ? c.sides[0] : c.sides[1]; const lose = c.answer === 'A' ? c.sides[1] : c.sides[0];
    const how = `you admired ${win.author}'s ${TRAIT_LABEL[clsOf(win.id) ?? c.cls]}`;
    if (!out.has(lose.id)) set(lose.id, { outcome: 'REJECTED', why: `conflict ${c.n} (${who(c)}): ${how}`, settledBy: { n: c.n, how: 'ADMIRATION' } });
  }
  // 4. Open: a conflict nobody answered, that admiration cannot settle, keeps every side no answer decided from instructing.
  for (const c of conflicts) {
    if (c.answer !== null) continue;
    for (const s of c.sides) {
      const o = out.get(s.id);
      if (!o || o.settledBy?.how === 'ADMIRATION') set(s.id, { outcome: 'OPEN', why: `conflict ${c.n} (${who(c)}) is unanswered: neither side instructs until you answer it`, openIn: c.n });
    }
  }
  for (const c of conflicts) {
    if (c.resolvedBy !== 'ADMIRATION') continue;
    const win = c.answer === 'A' ? c.sides[0] : c.sides[1];
    if (!out.has(win.id)) set(win.id, { outcome: 'SELECTED', why: `conflict ${c.n} (${who(c)}): you admired ${win.author}'s ${TRAIT_LABEL[clsOf(win.id) ?? c.cls]}`, byAdmiration: true, settledBy: { n: c.n, how: 'ADMIRATION' } });
  }
  return out;
}

/**
 * Every proposal decided from the table, the admiration and the answers. `answers` is by conflict number.
 */
export function composeSelection(table: TraitTable, proposals: readonly Requirement[], authors: readonly CompositeAuthor[],
  answers: Readonly<Record<number, ConflictAnswer>> = {}, options: ComposeOptions = {}): CompositeRecord {
  const classesOf = new Map(authors.map((a) => [a.name, new Set(a.classes)]));
  const rowOf = new Map(table.rows.map((r) => [r.id, r]));
  const byId = new Map(proposals.map((p) => [p.requirementId, p]));
  // The class each rule is taken for: what it is mainly about. Admiring a class takes the rules mainly about it.
  const clsOf = (id: string): TraitClass | undefined => { const p = byId.get(id); return p ? primaryClassOf(p) : rowOf.get(id)?.cls; };
  const admired = (id: string): boolean => { const r = rowOf.get(id); const c = clsOf(id); return Boolean(r && c && classesOf.get(r.author)?.has(c)); };

  // Conflicts first: what the person answered, else admiration of exactly one side, else open.
  const conflicts: AnsweredConflict[] = table.conflicts.map((c) => {
    const given = answers[c.n];
    if (given) return { ...c, answer: given, resolvedBy: 'ANSWER' };
    const [a, b] = c.sides;
    const aa = admired(a.id); const ab = admired(b.id);
    if (aa !== ab) return { ...c, answer: aa ? 'A' : 'B', resolvedBy: 'ADMIRATION' };
    return { ...c, answer: null, resolvedBy: null };
  });
  const sideOutcome = resolvePerRule(conflicts, byId, clsOf);
  const decided: CompositeDecision[] = proposals.flatMap((p) => {
    const r = rowOf.get(p.requirementId);
    if (!r) return [];
    const cls = clsOf(r.id) ?? r.cls;
    const base = { id: r.id, author: r.author, cls, kind: r.kind };
    // The same rule said again by its author stands and falls with the first, and is not a second rule.
    if (r.sameAs) return [{ ...base, outcome: 'REJECTED' as const, why: `the same rule as ${r.sameAs}, read again: it stands and falls with ${r.sameAs}`, mergedInto: r.sameAs }];
    const side = sideOutcome.get(r.id);
    if (side) return [{ ...base, ...side, ...(admired(r.id) ? { admired: true as const } : {}) }];
    if (admired(r.id)) return [{ ...base, outcome: 'SELECTED' as const, why: `you admired ${r.author}'s ${TRAIT_LABEL[cls]}`, byAdmiration: true as const, admired: true as const }];
    if (r.kind === 'SHARED') return [{ ...base, outcome: 'HABIT' as const, why: `shared with ${r.with.length} other rule(s) and not chosen: kept as a habit, shown and not instructed` }];
    // An author the person said they like, for something else: the rest of what their pieces show is kept as a habit,
    // shown and never instructed. An author they said nothing about gives nothing alone.
    if (authors.find((a) => a.name === r.author)?.admired) return [{ ...base, outcome: 'HABIT' as const, why: `not what you chose from ${r.author}: kept as a habit, shown and not instructed` }];
    return [{ ...base, outcome: 'REJECTED' as const, why: `${r.author}'s ${TRAIT_LABEL[cls]} was not what you chose from them` }];
  });
  const repeats = new Set(table.rows.filter((r) => r.sameAs).map((r) => r.id));
  // A RULE MADE REQUIRED BY `--set`: the person's latest explicit word, whatever chose or set it aside before. It goes
  // through the same guard as every other rule that will instruct, ranked above an earlier answer.
  const forced = options.forced ?? new Set<string>();
  const withSet = decided.map((d): CompositeDecision => {
    if (!forced.has(d.id) || repeats.has(d.id) || d.mergedInto) return d;
    const { shownOnly: _shown, openIn: _open, ...rest } = d;
    return { ...rest, outcome: 'SELECTED', why: `you made it required (--set ${d.id}=required)`, byAdmiration: true, settledBy: { n: d.settledBy?.n ?? d.openIn ?? 0, how: 'SET' } };
  });
  const twoWays = readTwoWays(proposals, options.modelQuantities ?? []);
  const guarded = guardInstructing(withSet, conflicts, byId, answers, repeats, options.modelPairs ?? [], twoWays);
  const decisions = guarded.decisions;
  const notes = [...[...twoWays].map(([id, r]) => twoWaysLine(id, byId.get(id)?.statement ?? id, r)), ...guarded.notes];

  // RECURRING DECISION MOVES: method rules chosen, or shared by two or more authors. Offered as a methodology the
  // person may adopt, marked a proposal read from the examples; a method note of theirs (`--method`) is authoritative instead.
  const steps = decisions.filter((d) => d.cls === 'method' && (d.outcome === 'SELECTED' || d.kind === 'SHARED')).map((d) => ({ id: d.id, author: d.author, statement: byId.get(d.id)?.statement ?? '' }));
  return { authors, decisions, conflicts: guarded.conflicts, methodology: steps.length ? { proposal: true, steps } : null, ...(notes.length ? { notes } : {}) };
}

/** Whether a decided rule will instruct the writer: chosen, not merely shown, and not carried in another rule's range. */
export const instructs = (d: CompositeDecision | undefined): boolean => d?.outcome === 'SELECTED' && !d.shownOnly && !d.mergedInto;

/**
 * THE FINAL GUARD (see the head of this file): no two rules that will instruct contradict each other, unless the
 * person answered "both" for that very pair. Exported so the invariant can be held on any decided set.
 *
 * The person's words rank: a `--set <id>=required` (their latest word) above an answer to a conflict, an answer above
 * admiration. A pair the model read as impossible to follow together (`modelPairs`, ./contradictions.ts) is never
 * settled by rank: unless the person answered that pair, neither side instructs and the pair is asked.
 */
export function guardInstructing(decided: readonly CompositeDecision[], conflicts: readonly AnsweredConflict[], byId: ReadonlyMap<string, Requirement>,
  answers: Readonly<Record<number, ConflictAnswer>>, repeats: ReadonlySet<string> = new Set(), modelPairs: readonly ModelPair[] = [],
  twoWays: ReadonlyMap<string, { readonly grammar: readonly Quantity[]; readonly model: readonly Quantity[] }> = new Map()): { decisions: CompositeDecision[]; conflicts: AnsweredConflict[]; notes: string[] } {
  const ds = new Map(decided.map((d) => [d.id, d]));
  const order = decided.map((d) => d.id);
  // A range's carrier stands for every rule merged into it (a repetition of one rule is not a range member).
  const membersOf = (id: string): string[] => [id, ...decided.filter((d) => d.mergedInto === id && !repeats.has(d.id)).map((d) => d.id)];
  const asRead = (d: CompositeDecision, both = true): ReadRule => {
    const p = byId.get(d.id); const two = both ? twoWays.get(d.id) : undefined;
    return { statement: p?.statement ?? '', measurement: d.range ?? p?.measurement ?? undefined, kind: p?.kind ?? 'GENERATIVE', ...(two ? { readings: [two.grammar, two.model] } : {}) };
  };
  // A pair that conflicts only by the model's reading of a rule's numbers is the model's to ask, never settled by rank.
  const byReading: ModelPair[] = [];
  const side = (d: CompositeDecision): ConflictSide => ({ id: d.id, author: d.author, statement: byId.get(d.id)?.statement ?? d.id });
  const live = decided.filter(instructs);
  const all: AnsweredConflict[] = [...conflicts];
  let next = conflicts.reduce((m, c) => Math.max(m, c.n), 0) + 1;
  const knownFor = (a: string, b: string): AnsweredConflict | undefined => {
    const ma = membersOf(a); const mb = membersOf(b);
    return all.find((x) => (ma.includes(x.sides[0].id) && mb.includes(x.sides[1].id)) || (mb.includes(x.sides[0].id) && ma.includes(x.sides[1].id)));
  };
  // Every contradicting pair among the rules that will instruct, found before any is settled, so the numbers given
  // to pairs the table never had depend on the answers to the table's conflicts alone.
  const found: { a: string; b: string; c: AnsweredConflict; model?: true }[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]; const b = live[j];
      if (a.author === b.author || relationOf(asRead(a), asRead(b)) !== 'CONFLICT') continue;
      if ((twoWays.has(a.id) || twoWays.has(b.id)) && relationOf(asRead(a, false), asRead(b, false)) !== 'CONFLICT') {
        const two = [a, b].filter((d) => twoWays.has(d.id)).map((d) => { const r = twoWays.get(d.id); return `${d.id} read two ways (${saidQ(r?.grammar ?? [])} by its words, ${saidQ(r?.model ?? [])} by the model)`; });
        byReading.push({ a: a.id, b: b.id, reason: two.join('; ') });
        continue;
      }
      const known = knownFor(a.id, b.id);
      if (known) {
        const aFirst = membersOf(a.id).includes(known.sides[0].id);
        found.push({ a: aFirst ? a.id : b.id, b: aFirst ? b.id : a.id, c: known });
        continue;
      }
      const pa = byId.get(a.id); const pb = byId.get(b.id);
      const n = next++; const given = answers[n] ?? null;
      const c: AnsweredConflict = { n, cls: a.cls, label: pa && pb ? labelOf(pa, pb) : 'one statement against another', taskDependent: false,
        sides: [side(a), side(b)], answer: given, resolvedBy: given ? 'ANSWER' : null, foundLast: true };
      all.push(c);
      found.push({ a: a.id, b: b.id, c });
    }
  }
  // THE MODEL'S PAIRS, after the keyword's, in the order the rules are listed: each between two rules that will instruct,
  // from two authors, and not already found. Numbered after every pair the keyword reading found.
  const at = new Map(order.map((id, i) => [id, i]));
  const liveIds = new Set(live.map((d) => d.id));
  const pairs = [...byReading, ...modelPairs]
    .filter((p) => p.a !== p.b && liveIds.has(p.a) && liveIds.has(p.b) && ds.get(p.a)?.author !== ds.get(p.b)?.author)
    .map((p) => ((at.get(p.a) ?? 0) <= (at.get(p.b) ?? 0) ? p : { a: p.b, b: p.a, reason: p.reason }))
    .sort((x, y) => (at.get(x.a) ?? 0) - (at.get(y.a) ?? 0) || (at.get(x.b) ?? 0) - (at.get(y.b) ?? 0));
  for (const p of pairs) {
    if (found.some((f) => (f.a === p.a && f.b === p.b) || (f.a === p.b && f.b === p.a))) continue;
    const known = knownFor(p.a, p.b);
    if (known) { const aFirst = membersOf(p.a).includes(known.sides[0].id); found.push({ a: aFirst ? p.a : p.b, b: aFirst ? p.b : p.a, c: known, model: true }); continue; }
    const da = ds.get(p.a); const db = ds.get(p.b); const pa = byId.get(p.a); const pb = byId.get(p.b);
    if (!da || !db) continue;
    const n = next++; const given = answers[n] ?? null;
    const c: AnsweredConflict = { n, cls: da.cls, label: pa && pb ? labelOf(pa, pb) : 'one statement against another', taskDependent: false,
      sides: [side(da), side(db)], answer: given, resolvedBy: given ? 'ANSWER' : null, foundLast: true, provenance: 'read by the model at build', reason: p.reason };
    all.push(c);
    found.push({ a: p.a, b: p.b, c, model: true });
  }
  if (!found.length) return { decisions: [...decided], conflicts: all, notes: [] };

  const who = (c: AnsweredConflict): string => `${c.sides[0].author} against ${c.sides[1].author} on ${c.label}`;
  const conflictOf = new Map(all.map((c) => [c.n, c]));
  const update = (c: AnsweredConflict, to: Partial<AnsweredConflict>): void => { conflictOf.set(c.n, { ...(conflictOf.get(c.n) ?? c), ...to }); };
  const withConflict = (d: CompositeDecision, n: number): readonly number[] => [...new Set([...(d.inConflicts ?? []), n])].sort((x, y) => x - y);
  // A rule that no longer instructs takes the rules carried in its range with it: they stood only through it.
  const bare = (d: CompositeDecision, n: number): CompositeDecision => ({ id: d.id, author: d.author, cls: d.cls, kind: d.kind, outcome: d.outcome, why: d.why,
    inConflicts: withConflict(d, n), ...(d.admired ? { admired: true as const } : {}) });
  const setAside = (loser: string, winner: CompositeDecision, c: AnsweredConflict): void => {
    const by = winner.settledBy ?? { n: c.n, how: 'ANSWER' as const };
    const stands = by.how === 'SET' ? `stands by your --set ${winner.id}=required, your latest word`
      : `stands by your answer${by.n === c.n ? '' : ` to conflict ${by.n}`}`;
    for (const id of membersOf(loser)) {
      const d = ds.get(id); if (!d) continue;
      ds.set(id, { ...bare(d, c.n), outcome: 'REJECTED', settledBy: by, why: `conflict ${c.n} (${who(c)}): ${winner.author}'s rule ${stands}, and the two cannot both instruct` });
    }
  };
  const open = (id: string, c: AnsweredConflict): void => {
    for (const m of membersOf(id)) {
      const d = ds.get(m); if (!d) continue;
      ds.set(m, { ...bare(d, c.n), outcome: 'OPEN', openIn: c.n, why: `conflict ${c.n} (${who(c)}) is unanswered: neither side instructs until you answer it` });
    }
  };
  const rank = (d: CompositeDecision | undefined): number => (d?.settledBy?.how === 'SET' ? 2 : d?.settledBy?.how === 'ANSWER' ? 1 : 0);
  const notes: string[] = [];
  const quote = (d: CompositeDecision): string => `${d.author}'s "${byId.get(d.id)?.statement ?? d.id}"`;
  const setNote = (win: CompositeDecision, lose: CompositeDecision, how: string): void => {
    notes.push(`--set ${win.id}=required: ${quote(win)} cannot be followed with ${quote(lose)}, which ${how}; your --set is your latest word, so ${lose.id} is set aside.`);
  };
  // 1. What the person said decides first: "both" for the pair; an answer for the pair; a --set; an answer elsewhere.
  const undecided: typeof found = [];
  for (const f of found) {
    const da = ds.get(f.a); const db = ds.get(f.b);
    if (!instructs(da) || !instructs(db) || !da || !db) continue;
    const c = conflictOf.get(f.c.n) ?? f.c;
    if (c.resolvedBy === 'ANSWER' && c.answer === 'both') {
      for (const d of [da, db]) ds.set(d.id, { ...d, inConflicts: withConflict(d, c.n) });
      continue;
    }
    if (c.resolvedBy === 'ANSWER' && (c.answer === 'A' || c.answer === 'B')) {
      const [win, lose] = c.answer === 'A' ? [da, db] : [db, da];
      // A --set made after the answer outranks it, for this very pair too; two --sets against each other are asked.
      if (!f.model && rank(lose) === 2 && rank(win) < 2) {
        ds.set(lose.id, { ...lose, inConflicts: withConflict(lose, c.n) });
        setAside(win.id, lose, c);
        update(c, { answer: lose.id === f.a ? 'A' : 'B', resolvedBy: 'SET' });
        setNote(lose, win, `you chose in conflict ${c.n}`);
        continue;
      }
      if (!f.model && rank(lose) === 2 && rank(win) === 2) { undecided.push(f); continue; }
      ds.set(win.id, { ...win, inConflicts: withConflict(win, c.n) });
      setAside(lose.id, { ...win, settledBy: { n: c.n, how: 'ANSWER' } }, c);
      continue;
    }
    // The model's reading never settles a pair by rank: it is asked.
    if (f.model) { undecided.push(f); continue; }
    if (rank(da) !== rank(db)) {
      const [win, lose] = rank(da) > rank(db) ? [da, db] : [db, da];
      ds.set(win.id, { ...win, inConflicts: withConflict(win, c.n) });
      setAside(lose.id, win, c);
      update(c, { answer: win.id === f.a ? 'A' : 'B', resolvedBy: win.settledBy?.how === 'SET' ? 'SET' : 'ANOTHER_ANSWER' });
      if (rank(win) === 2 && rank(lose) === 1) setNote(win, lose, `you chose by your answer to conflict ${lose.settledBy?.n ?? c.n}`);
      continue;
    }
    undecided.push(f);
  }
  // 2. Nothing the person said decides it: neither instructs, and the pair is asked, never guessed.
  //    A side already held open by another such pair holds this one open too: the other side does not instruct in its
  //    place, so "neither instructs" is true of every pair asked. Only a side set aside leaves the other standing.
  for (const f of undecided) {
    const da = ds.get(f.a); const db = ds.get(f.b);
    if (!da || !db) continue;
    const held = (d: CompositeDecision): boolean => instructs(d) || d.outcome === 'OPEN';
    if (!held(da) || !held(db) || (!instructs(da) && !instructs(db))) continue;
    const c = conflictOf.get(f.c.n) ?? f.c;
    if (rank(da) === 2 && rank(db) === 2) notes.push(`--set ${da.id}=required and --set ${db.id}=required cannot both be followed: neither instructs until you answer conflict ${c.n}.`);
    for (const d of [da, db]) if (instructs(d)) open(d.id, c);
    update(c, { answer: null, resolvedBy: null });
  }
  // 3. AN ANSWER THE GUARD OPENED AGAIN: what it chose now waits on another conflict. Said, with why, and counted as open,
  //    so the screen, the count and the record agree.
  const rangeOf = new Map(decided.flatMap((d) => (d.range ? [[d.id, d.range] as const] : [])));
  const carrierOf = new Map(decided.flatMap((d) => (d.mergedInto ? [[d.id, d.mergedInto] as const] : [])));
  const said = (s: ConflictSide): string => {
    const carrier = rangeOf.has(s.id) ? s.id : carrierOf.get(s.id);
    const range = carrier ? rangeOf.get(carrier) : undefined; const p = carrier ? byId.get(carrier) : undefined;
    if (range && p?.measurement) return `${s.author}'s "${restateLimits(p.statement, p.measurement, range) ?? p.statement}" (one range, by your answer "both")`;
    return `${s.author}'s "${s.statement}"`;
  };
  for (const c of [...conflictOf.values()]) {
    if (c.resolvedBy !== 'ANSWER' || c.answer === null) continue;
    const chosen = c.answer === 'both' ? c.sides : [c.answer === 'A' ? c.sides[0] : c.sides[1]];
    const opened = chosen.map((x) => ds.get(x.id)).find((d) => d?.outcome === 'OPEN' && d.openIn !== undefined && d.openIn !== c.n);
    const m = opened?.openIn !== undefined ? conflictOf.get(opened.openIn) : undefined;
    if (!m) continue;
    const why = `your answer ${c.answer === 'both' ? '"both"' : c.answer} would ship two instructions that cannot both be followed: ${said(m.sides[0])} and ${said(m.sides[1])}${m.reason ? ` (${m.reason})` : ''}. Neither instructs until you answer conflict ${m.n}`;
    update(c, { reopened: { in: m.n, why } });
  }
  return { decisions: order.flatMap((id) => { const d = ds.get(id); return d ? [d] : []; }), conflicts: [...conflictOf.values()].sort((x, y) => x.n - y.n), notes };
}

/**
 * The questions the screen asks, split as it shows them: NEITHER, a conflict shown open or open again (neither side
 * instructs); ONE SIDE, a conflict where one side stands by an answer to another conflict and the other waits on this
 * one. A conflict shown waiting on another conflict's answer is counted there, once.
 */
export function openStanding(c: CompositeRecord): { readonly neither: AnsweredConflict[]; readonly oneSide: AnsweredConflict[] } {
  const byId = new Map(c.decisions.map((d) => [d.id, d]));
  const asked = (want: Standing['asks']): AnsweredConflict[] => c.conflicts.filter((x) => standingOf(x, byId.get(x.sides[0].id), byId.get(x.sides[1].id)).asks === want);
  return { neither: asked('NEITHER'), oneSide: asked('ONE_SIDE') };
}

/** The conflicts the screen shows open, or open again: the build and the skill's record show them and never answer. */
export const openQuestions = (c: CompositeRecord): AnsweredConflict[] => openStanding(c).neither;

/**
 * THE COMPOSITE SCREEN, as lines. One screen, not one per rule: what comes from whom, by class; the conflicts and
 * how each stands; the method read from the examples, marked a proposal; and what is left as a habit or set aside.
 */
export function describeComposite(c: CompositeRecord, statementOf: (id: string) => string, measurementOf?: (id: string) => Measurement | undefined): string[] {
  const out: string[] = [];
  // A "both" range is shown at its merged limits, as the build states it (cli/commands/composite.ts, `decisionsFor`).
  const shownAs = (d: CompositeDecision): string => {
    const m = measurementOf?.(d.id);
    return d.range && m ? restateLimits(statementOf(d.id), m, d.range) ?? statementOf(d.id) : statementOf(d.id);
  };
  const selected = c.decisions.filter((d) => d.outcome === 'SELECTED' && !d.mergedInto);
  out.push(`Your composite: ${selected.length} rule(s) chosen from ${new Set(selected.map((d) => d.author)).size} of ${c.authors.length} authors. It is your combination, not any one author and not their average.`);
  out.push('What you chose from an author instructs the writer once you accept (a counted one steers the drafts and never fails one); everything else is shown or set aside.');
  for (const a of c.authors) {
    const mine = selected.filter((d) => d.author === a.name);
    const classes = [...new Set(mine.map((d) => d.cls))].map((k) => TRAIT_LABEL[k]);
    if (!a.admired && !mine.length) { out.push(`  ${a.name}: nothing said, so nothing is taken from this author alone.`); continue; }
    if (!mine.length) {
      // What carries it may be there, and held in a conflict still open (said, with the conflicts to answer), or set
      // aside by an answer already given or by admiration of the other side (said, with what set it aside).
      const carried = c.decisions.filter((d) => d.author === a.name && d.admired && d.outcome !== 'SELECTED' && !d.mergedInto);
      const held = [...new Set(carried.flatMap((d) => (d.outcome === 'OPEN' && d.openIn !== undefined ? [d.openIn] : [])))].sort((x, y) => x - y);
      const by = (how: 'ANSWER' | 'ADMIRATION'): number[] => [...new Set(carried.flatMap((d) => (d.outcome === 'REJECTED' && d.settledBy?.how === how ? [d.settledBy.n] : [])))].sort((x, y) => x - y);
      const answered = by('ANSWER'); const admiredElse = by('ADMIRATION');
      const reasons = [...(answered.length ? [`your answer${answered.length === 1 ? '' : 's'} to conflict ${answered.join(', ')}`] : []),
        ...(admiredElse.length ? [`what you admired of the other side in conflict ${admiredElse.join(', ')}`] : [])];
      out.push(held.length
        ? `  ${a.name}: "${a.admired}": what carries that is in conflict ${held.join(', ')}, so nothing is taken from this author until you answer${held.length === 1 ? ' it' : ' them'}.`
        : reasons.length
          ? `  ${a.name}: "${a.admired}": what carries that was set aside by ${reasons.join(' and ')}, so nothing is taken from this author.`
          : `  ${a.name}: "${a.admired}": nothing read from these pieces carries that, so nothing is taken.`);
      continue;
    }
    out.push(`  From ${a.name}: ${classes.join('; ')}${a.admired ? `  ("${a.admired}")` : '  (from a conflict you answered)'}`);
    for (const d of mine) out.push(`      ${d.id.padEnd(4)} ${shownAs(d)}${d.kind === 'UNIQUE' ? '   (this author alone)' : d.kind === 'SHARED' ? '   (shared with another author)' : ''}${d.range ? '   (as one range with the other side)' : ''}${d.shownOnly ? '   (shown, not instructed)' : ''}`);
  }
  if (c.notes?.length) out.push('', ...c.notes);
  if (c.conflicts.length) {
    out.push('', `Conflicts between authors (${c.conflicts.length}): never averaged, and never guessed.`);
    const decided = new Map(c.decisions.map((d) => [d.id, d]));
    // "both (one range)" is offered only where the two sides make one range: two counted bands on one observer.
    const byN = new Map(c.conflicts.map((x) => [x.n, x]));
    const ranged = (n: number): boolean => { const x = byN.get(n); return Boolean(x && measurementOf && mergedMeasurement(measurementOf(x.sides[0].id), measurementOf(x.sides[1].id))); };
    for (const x of c.conflicts) {
      const [a, b] = x.sides;
      const stand = standOf(x, decided.get(a.id), decided.get(b.id), ranged);
      out.push(`  ${x.n}. ${x.label}${x.taskDependent ? ' (the two write pieces of different lengths: this may be the kind of work, not taste)' : ''}${x.provenance ? ` (read by the model at build: ${x.reason ?? 'the two cannot both be followed'})` : x.foundLast ? ' (found among the rules that would instruct: the two cannot both)' : ''}`);
      out.push(`      A  ${a.author}: ${a.statement}`);
      out.push(`      B  ${b.author}: ${b.statement}`);
      out.push(`      ${stand}`);
    }
  }
  if (c.methodology) {
    out.push('', `Method (a proposal, read from your examples; not your method until you say so): ${c.methodology.steps.length} recurring move(s)`);
    for (const s of c.methodology.steps) out.push(`  ${s.id.padEnd(4)} ${s.statement}   (${s.author})`);
    out.push('  Your own method note is authoritative instead: atelier new <folder> --method <how-you-do-it.md>');
  }
  const habits = c.decisions.filter((d) => d.outcome === 'HABIT'); const rejected = c.decisions.filter((d) => d.outcome === 'REJECTED' && !d.mergedInto);
  out.push('', `Kept as habits, shown and not instructed (${habits.length}): ${habits.map((d) => d.id).join(', ') || 'none'}.`);
  out.push(`Set aside, not what you chose (${rejected.length}): ${rejected.map((d) => d.id).join(', ') || 'none'}.`);
  return out;
}

/**
 * HOW ONE CONFLICT STANDS, READ FROM WHAT WAS FINALLY DECIDED ON ITS TWO RULES, so the screen can never say one thing
 * and the build do another: a rule kept by the answer to another conflict, or set aside by one, is said so here.
 */
export function standOf(x: AnsweredConflict, da: CompositeDecision | undefined, db: CompositeDecision | undefined, ranged: (n: number) => boolean = () => false): string {
  return standingOf(x, da, db, ranged).line;
}

/** How a conflict stands, as its line and as the question it asks (NEITHER: open, or open again; ONE_SIDE: one side stands, the other waits on this conflict). */
interface Standing { readonly line: string; readonly asks: 'NEITHER' | 'ONE_SIDE' | null }
function standingOf(x: AnsweredConflict, da: CompositeDecision | undefined, db: CompositeDecision | undefined, ranged: (n: number) => boolean = () => false): Standing {
  const [a, b] = x.sides;
  const reason = (d: CompositeDecision | undefined): string => {
    const by = d?.settledBy;
    // A rule chosen by the person's line about its author, outside any answer.
    if (!by) return d?.outcome === 'SELECTED' ? 'from what you admired' : '';
    if (by.how === 'ANSWER') return by.n === x.n ? 'your answer' : `your answer to conflict ${by.n}`;
    if (by.how === 'SET') return 'your --set, your latest word';
    return 'from what you admired';
  };
  const stands = (d: CompositeDecision | undefined): boolean => d?.outcome === 'SELECTED' && !d.shownOnly;
  const inRange = (d: CompositeDecision | undefined, other: CompositeDecision | undefined): boolean =>
    Boolean(d && other && ((d.mergedInto !== undefined && (d.mergedInto === other.id || d.mergedInto === other.mergedInto)) || other.mergedInto === d.id));
  const both = (n: number): string => (ranged(n) ? `${n}=both (one range)` : `${n}=both`);
  const ask = `answer with --conflict ${x.n}=A, ${x.n}=B or ${both(x.n)}, or leave it for later`;
  const settled = (line: string): Standing => ({ line, asks: null });
  if (x.reopened) return { line: `→ open again: ${x.reopened.why}: --conflict ${x.reopened.in}=A, ${x.reopened.in}=B or ${x.reopened.in}=both`, asks: 'NEITHER' };
  if (da?.outcome === 'OPEN' && db?.outcome === 'OPEN') return { line: `→ open: neither instructs. ${ask}`, asks: 'NEITHER' };
  if (inRange(da, db)) return settled(`→ both, as one range (${reason(da?.range ? da : db) || reason(da) || 'your answer'})`);
  if (da?.shownOnly && db?.shownOnly) return settled(`→ both kept, shown and not instructed (${reason(da) || 'your answer'})`);
  const sa = stands(da) || (da?.mergedInto !== undefined && da.settledBy !== undefined);
  const sb = stands(db) || (db?.mergedInto !== undefined && db.settledBy !== undefined);
  const openAt = (d: CompositeDecision | undefined): number => d?.openIn ?? x.n;
  const askAt = (n: number): string => `answer with --conflict ${n}=A, ${n}=B or ${both(n)}, or leave it for later`;
  const waits = (side: ConflictSide, d: CompositeDecision | undefined): string => (d?.outcome === 'OPEN'
    ? `; ${side.author}'s does not instruct until you answer conflict ${openAt(d)}${openAt(d) === x.n ? `: ${ask}` : ''}` : '');
  // A side merged into another rule's range stands through that rule, and is said so.
  const said = (side: ConflictSide, d: CompositeDecision | undefined): string => (d?.mergedInto ? `${side.author}, carried in one range by ${d.mergedInto}` : side.author);
  const by = (d: CompositeDecision | undefined): string => { const r = reason(d); return r ? ` (${r})` : ''; };
  const waitsHere = (d: CompositeDecision | undefined): boolean => d?.outcome === 'OPEN' && openAt(d) === x.n;
  if (sa && sb) return settled(`→ both stand: ${said(a, da)}${by(da)} and ${said(b, db)}${by(db)}`);
  if (sa) return { line: `→ ${said(a, da)}${by(da)}${waits(b, db)}`, asks: waitsHere(db) ? 'ONE_SIDE' : null };
  if (sb) return { line: `→ ${said(b, db)}${by(db)}${waits(a, da)}`, asks: waitsHere(da) ? 'ONE_SIDE' : null };
  const why = (side: ConflictSide, d: CompositeDecision | undefined): string => `${side.author} ${d?.outcome === 'OPEN' ? `open in conflict ${openAt(d)}`
    : d?.shownOnly ? `kept, shown and not instructed (${reason(d) || 'your answer'})` : `set aside (${reason(d) || 'not what you chose'})`}`;
  const firstOpen = da?.outcome === 'OPEN' ? openAt(da) : db?.outcome === 'OPEN' ? openAt(db) : null;
  // Asked here when the side held open waits on this very conflict; else it is asked, and counted, where it waits.
  return { line: `→ neither instructs: ${why(a, da)}, ${why(b, db)}${firstOpen !== null ? `. ${askAt(firstOpen)}` : ''}`, asks: firstOpen === x.n ? 'NEITHER' : null };
}

/**
 * WHETHER THE PIECE'S LENGTH IS LEFT OPEN: a rule on it (a worded length of the whole piece, or a count of its words)
 * sits in a conflict nobody answered, so neither side instructs. The build then states no length of its own.
 */
export function pieceLengthOpen(c: CompositeRecord, ruleOf: (id: string) => Pick<Requirement, 'statement' | 'measurement'> | undefined): boolean {
  return c.decisions.some((d) => {
    if (d.outcome !== 'OPEN') return false;
    const r = ruleOf(d.id);
    if (!r) return false;
    const m = r.measurement;
    if (m) return m.observer === 'LENGTH' && !(Array.isArray(m.params.in) && m.params.in.length > 0) && (!Array.isArray(m.params.unit) || String(m.params.unit[0]).toLowerCase() === 'words');
    return quantitiesOf(r.statement).some((q) => q.measure === 'piece');
  });
}

/** One line per author for the skill's "How I sound": the classes taken, and the rules that carry them. */
export function compositeVoiceOf(c: CompositeRecord, statementOf: (id: string) => string): { readonly name: string; readonly classes: readonly TraitClass[]; readonly traits: readonly string[] }[] {
  return c.authors.flatMap((a) => {
    const mine = c.decisions.filter((d) => d.author === a.name && d.outcome === 'SELECTED' && !d.mergedInto);
    if (!mine.length) return [];
    return [{ name: a.name, classes: [...new Set(mine.map((d) => d.cls))], traits: mine.map((d) => statementOf(d.id)) }];
  });
}
