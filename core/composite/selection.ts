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
// was admired from its author; with both sides admired, or neither, it stays open. Nothing here guesses.

import type { Measurement, Requirement } from '../state/canonical-state.js';
import { TRAIT_LABEL, mergedMeasurement, takenAs, type Conflict, type ConflictSide, type TraitClass, type TraitKind, type TraitTable } from './traits.js';

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
  /** in a conflict: the conflict whose answer (or admiration) settled this rule, and how; absent while it is open */
  readonly settledBy?: { readonly n: number; readonly how: 'ANSWER' | 'ADMIRATION' };
  /** open: the unanswered conflict that keeps it from instructing */
  readonly openIn?: number;
  /** in a conflict: the numbers of every conflict this rule is a side of */
  readonly inConflicts?: readonly number[];
  /** its author was admired for what this rule is about */
  readonly admired?: true;
}

export interface AnsweredConflict extends Conflict {
  readonly answer: ConflictAnswer | null;
  readonly resolvedBy: 'ANSWER' | 'ADMIRATION' | null;
}

/** The composite as stored on the skill: what was chosen from whom, and what stays open. Data, so a rebuild reads it and changes nothing. */
export interface CompositeRecord {
  readonly authors: readonly CompositeAuthor[];
  readonly decisions: readonly CompositeDecision[];
  readonly conflicts: readonly AnsweredConflict[];
  /** recurring decision moves read from the selected authors, offered as a methodology: a proposal, never the owner's method */
  readonly methodology: { readonly proposal: true; readonly steps: readonly { readonly id: string; readonly author: string; readonly statement: string }[] } | null;
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
  answers: Readonly<Record<number, ConflictAnswer>> = {}): CompositeRecord {
  const classesOf = new Map(authors.map((a) => [a.name, new Set(a.classes)]));
  const rowOf = new Map(table.rows.map((r) => [r.id, r]));
  const admired = (id: string): boolean => { const r = rowOf.get(id); return Boolean(r?.classes.some((c) => classesOf.get(r.author)?.has(c))); };
  // The class each rule is taken for: of the classes it carries, the one its author's line named, else its first.
  const clsOf = (id: string): TraitClass | undefined => { const r = rowOf.get(id); return r ? takenAs(r.classes, classesOf.get(r.author)) : undefined; };

  // Conflicts first: what the person answered, else admiration of exactly one side, else open.
  const conflicts: AnsweredConflict[] = table.conflicts.map((c) => {
    const given = answers[c.n];
    if (given) return { ...c, answer: given, resolvedBy: 'ANSWER' };
    const [a, b] = c.sides;
    const aa = admired(a.id); const ab = admired(b.id);
    if (aa !== ab) return { ...c, answer: aa ? 'A' : 'B', resolvedBy: 'ADMIRATION' };
    return { ...c, answer: null, resolvedBy: null };
  });
  const byId = new Map(proposals.map((p) => [p.requirementId, p]));
  const sideOutcome = resolvePerRule(conflicts, byId, clsOf);
  const decisions: CompositeDecision[] = proposals.flatMap((p) => {
    const r = rowOf.get(p.requirementId);
    if (!r) return [];
    const cls = clsOf(r.id) ?? r.cls;
    const base = { id: r.id, author: r.author, cls, kind: r.kind };
    // The same rule said again by its author stands and falls with the first, and is not a second rule.
    if (r.sameAs) return [{ ...base, outcome: 'REJECTED' as const, why: `the same rule as ${r.sameAs}, read again: it stands and falls with ${r.sameAs}`, mergedInto: r.sameAs }];
    const side = sideOutcome.get(r.id);
    if (side) return [{ ...base, ...side, ...(admired(r.id) ? { admired: true as const } : {}) }];
    if (admired(r.id)) return [{ ...base, outcome: 'SELECTED' as const, why: `you admired ${r.author}'s ${TRAIT_LABEL[cls]}`, byAdmiration: true as const }];
    if (r.kind === 'SHARED') return [{ ...base, outcome: 'HABIT' as const, why: `shared with ${r.with.length} other rule(s) and not chosen: kept as a habit, shown and not instructed` }];
    // An author the person said they like, for something else: the rest of what their pieces show is kept as a habit,
    // shown and never instructed. An author they said nothing about gives nothing alone.
    if (authors.find((a) => a.name === r.author)?.admired) return [{ ...base, outcome: 'HABIT' as const, why: `not what you chose from ${r.author}: kept as a habit, shown and not instructed` }];
    return [{ ...base, outcome: 'REJECTED' as const, why: `${r.author}'s ${TRAIT_LABEL[cls]} was not what you chose from them` }];
  });

  // RECURRING DECISION MOVES: method rules chosen, or shared by two or more authors. Offered as a methodology the
  // person may adopt, marked a proposal read from the examples; a method note of theirs (`--method`) is authoritative instead.
  const steps = decisions.filter((d) => d.cls === 'method' && (d.outcome === 'SELECTED' || d.kind === 'SHARED')).map((d) => ({ id: d.id, author: d.author, statement: byId.get(d.id)?.statement ?? '' }));
  return { authors, decisions, conflicts, methodology: steps.length ? { proposal: true, steps } : null };
}

/** The conflicts still open on a composite, which the build and the skill's record show and never answer. */
export const openQuestions = (c: CompositeRecord): AnsweredConflict[] => c.conflicts.filter((x) => x.answer === null);

/**
 * THE COMPOSITE SCREEN, as lines. One screen, not one per rule: what comes from whom, by class; the conflicts and
 * how each stands; the method read from the examples, marked a proposal; and what is left as a habit or set aside.
 */
export function describeComposite(c: CompositeRecord, statementOf: (id: string) => string): string[] {
  const out: string[] = [];
  const selected = c.decisions.filter((d) => d.outcome === 'SELECTED' && !d.mergedInto);
  out.push(`Your composite: ${selected.length} rule(s) chosen from ${new Set(selected.map((d) => d.author)).size} of ${c.authors.length} authors. It is your combination, not any one author and not their average.`);
  out.push('What you chose from an author instructs the writer once you accept (a counted one steers the drafts and never fails one); everything else is shown or set aside.');
  for (const a of c.authors) {
    const mine = selected.filter((d) => d.author === a.name);
    const classes = [...new Set(mine.map((d) => d.cls))].map((k) => TRAIT_LABEL[k]);
    if (!a.admired && !mine.length) { out.push(`  ${a.name}: nothing said, so nothing is taken from this author alone.`); continue; }
    if (!mine.length) {
      // What carries it may be there, and held in a conflict: said, with the conflicts to answer.
      const held = [...new Set(c.decisions.filter((d) => d.author === a.name && d.admired && d.outcome !== 'SELECTED').flatMap((d) => d.inConflicts ?? []))].sort((x, y) => x - y);
      out.push(held.length
        ? `  ${a.name}: "${a.admired}": what carries that is in conflict ${held.join(', ')}, so nothing is taken from this author until you answer${held.length === 1 ? ' it' : ' them'}.`
        : `  ${a.name}: "${a.admired}": nothing read from these pieces carries that, so nothing is taken.`);
      continue;
    }
    out.push(`  From ${a.name}: ${classes.join('; ')}${a.admired ? `  ("${a.admired}")` : '  (from a conflict you answered)'}`);
    for (const d of mine) out.push(`      ${d.id.padEnd(4)} ${statementOf(d.id)}${d.kind === 'UNIQUE' ? '   (this author alone)' : d.kind === 'SHARED' ? '   (shared with another author)' : ''}${d.range ? '   (as one range with the other side)' : ''}${d.shownOnly ? '   (shown, not instructed)' : ''}`);
  }
  if (c.conflicts.length) {
    out.push('', `Conflicts between authors (${c.conflicts.length}): never averaged, and never guessed.`);
    const decided = new Map(c.decisions.map((d) => [d.id, d]));
    for (const x of c.conflicts) {
      const [a, b] = x.sides;
      const stand = standOf(x, decided.get(a.id), decided.get(b.id));
      out.push(`  ${x.n}. ${x.label}${x.taskDependent ? ' (the two write pieces of different lengths: this may be the kind of work, not taste)' : ''}`);
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
export function standOf(x: AnsweredConflict, da: CompositeDecision | undefined, db: CompositeDecision | undefined): string {
  const [a, b] = x.sides;
  const reason = (d: CompositeDecision | undefined): string => {
    const by = d?.settledBy;
    if (!by) return '';
    if (by.how === 'ANSWER') return by.n === x.n ? 'your answer' : `your answer to conflict ${by.n}`;
    return 'from what you admired';
  };
  const stands = (d: CompositeDecision | undefined): boolean => d?.outcome === 'SELECTED' && !d.shownOnly;
  const inRange = (d: CompositeDecision | undefined, other: CompositeDecision | undefined): boolean =>
    Boolean(d && other && ((d.mergedInto !== undefined && (d.mergedInto === other.id || d.mergedInto === other.mergedInto)) || other.mergedInto === d.id));
  const ask = `answer with --conflict ${x.n}=A, ${x.n}=B or ${x.n}=both (one range), or leave it for later`;
  if (da?.outcome === 'OPEN' && db?.outcome === 'OPEN') return `→ open: neither instructs. ${ask}`;
  if (inRange(da, db)) return `→ both, as one range (${reason(da?.range ? da : db) || reason(da)})`;
  if (da?.shownOnly && db?.shownOnly) return `→ both kept, shown and not instructed (${reason(da)})`;
  const sa = stands(da) || (da?.mergedInto !== undefined && da.settledBy !== undefined);
  const sb = stands(db) || (db?.mergedInto !== undefined && db.settledBy !== undefined);
  const openAt = (d: CompositeDecision | undefined): number => d?.openIn ?? x.n;
  const askAt = (n: number): string => `answer with --conflict ${n}=A, ${n}=B or ${n}=both (one range), or leave it for later`;
  const waits = (side: ConflictSide, d: CompositeDecision | undefined): string => (d?.outcome === 'OPEN'
    ? `; ${side.author}'s does not instruct until you answer conflict ${openAt(d)}${openAt(d) === x.n ? `: ${ask}` : ''}` : '');
  // A side merged into another rule's range stands through that rule, and is said so.
  const said = (side: ConflictSide, d: CompositeDecision | undefined): string => (d?.mergedInto ? `${side.author}, carried in one range by ${d.mergedInto}` : side.author);
  if (sa && sb) return `→ both stand: ${said(a, da)} (${reason(da)}) and ${said(b, db)} (${reason(db)})`;
  if (sa) return `→ ${said(a, da)} (${reason(da)})${waits(b, db)}`;
  if (sb) return `→ ${said(b, db)} (${reason(db)})${waits(a, da)}`;
  const why = (side: ConflictSide, d: CompositeDecision | undefined): string => `${side.author} ${d?.outcome === 'OPEN' ? `open in conflict ${openAt(d)}` : `set aside (${reason(d) || 'not what you chose'})`}`;
  const firstOpen = da?.outcome === 'OPEN' ? openAt(da) : db?.outcome === 'OPEN' ? openAt(db) : null;
  return `→ neither instructs: ${why(a, da)}, ${why(b, db)}${firstOpen !== null ? `. ${askAt(firstOpen)}` : ''}`;
}

/** One line per author for the skill's "How I sound": the classes taken, and the rules that carry them. */
export function compositeVoiceOf(c: CompositeRecord, statementOf: (id: string) => string): { readonly name: string; readonly classes: readonly TraitClass[]; readonly traits: readonly string[] }[] {
  return c.authors.flatMap((a) => {
    const mine = c.decisions.filter((d) => d.author === a.name && d.outcome === 'SELECTED' && !d.mergedInto);
    if (!mine.length) return [];
    return [{ name: a.name, classes: [...new Set(mine.map((d) => d.cls))], traits: mine.map((d) => statementOf(d.id)) }];
  });
}
