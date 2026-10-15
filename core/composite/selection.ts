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
import { TRAIT_LABEL, mergedMeasurement, takenAs, type Conflict, type TraitClass, type TraitKind, type TraitTable } from './traits.js';

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

  // Conflicts first: an answer decides both sides; so does admiration of exactly one side.
  const conflicts: AnsweredConflict[] = table.conflicts.map((c) => {
    const given = answers[c.n];
    if (given) return { ...c, answer: given, resolvedBy: 'ANSWER' };
    const [a, b] = c.sides;
    const aa = admired(a.id); const ab = admired(b.id);
    if (aa !== ab) return { ...c, answer: aa ? 'A' : 'B', resolvedBy: 'ADMIRATION' };
    return { ...c, answer: null, resolvedBy: null };
  });
  const byId = new Map(proposals.map((p) => [p.requirementId, p]));
  const sideOutcome = new Map<string, { outcome: Outcome; why: string; mergedInto?: string; range?: Measurement; shownOnly?: true; byAdmiration?: true }>();
  for (const c of conflicts) {
    const [a, b] = c.sides;
    const who = `${a.author} against ${b.author} on ${c.label}`;
    if (c.answer === null) {
      for (const s of c.sides) sideOutcome.set(s.id, { outcome: 'OPEN', why: `conflict ${c.n} (${who}) is unanswered: neither side instructs until you answer it` });
    } else if (c.answer === 'both') {
      const range = mergedMeasurement(byId.get(a.id)?.measurement, byId.get(b.id)?.measurement);
      if (range) {
        sideOutcome.set(a.id, { outcome: 'SELECTED', why: `conflict ${c.n} (${who}): both, as one range`, range, byAdmiration: true as const });
        sideOutcome.set(b.id, { outcome: 'REJECTED', why: `conflict ${c.n} (${who}): merged into ${a.id} as one range`, mergedInto: a.id });
      } else {
        // Two worded rules make no range: both are kept, and neither instructs over the other.
        for (const side of c.sides) sideOutcome.set(side.id, { outcome: 'SELECTED', why: `conflict ${c.n} (${who}): both kept, shown and not instructed, since two statements make no range`, shownOnly: true });
      }
    } else {
      const win = c.answer === 'A' ? a : b; const lose = c.answer === 'A' ? b : a;
      const how = c.resolvedBy === 'ADMIRATION' ? `you admired ${win.author}'s ${TRAIT_LABEL[clsOf(win.id) ?? c.cls]}` : `you answered ${c.answer}`;
      // The person's answer is their word as surely as their admiration: the side they chose instructs.
      sideOutcome.set(win.id, { outcome: 'SELECTED', why: `conflict ${c.n} (${who}): ${how}`, byAdmiration: true as const });
      sideOutcome.set(lose.id, { outcome: 'REJECTED', why: `conflict ${c.n} (${who}): ${how}` });
    }
  }

  const decisions: CompositeDecision[] = proposals.flatMap((p) => {
    const r = rowOf.get(p.requirementId);
    if (!r) return [];
    const cls = clsOf(r.id) ?? r.cls;
    const base = { id: r.id, author: r.author, cls, kind: r.kind };
    const side = sideOutcome.get(r.id);
    if (side) return [{ ...base, ...side }];
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
    if (!mine.length) { out.push(`  ${a.name}: "${a.admired}": nothing read from these pieces carries that, so nothing is taken.`); continue; }
    out.push(`  From ${a.name}: ${classes.join('; ')}${a.admired ? `  ("${a.admired}")` : '  (from a conflict you answered)'}`);
    for (const d of mine) out.push(`      ${d.id.padEnd(4)} ${statementOf(d.id)}${d.kind === 'UNIQUE' ? '   (this author alone)' : d.kind === 'SHARED' ? '   (shared with another author)' : ''}${d.range ? '   (as one range with the other side)' : ''}${d.shownOnly ? '   (shown, not instructed)' : ''}`);
  }
  if (c.conflicts.length) {
    out.push('', `Conflicts between authors (${c.conflicts.length}): never averaged, and never guessed.`);
    for (const x of c.conflicts) {
      const [a, b] = x.sides;
      const stand = x.answer === null ? `→ open: neither instructs. answer with --conflict ${x.n}=A, ${x.n}=B or ${x.n}=both (one range), or leave it for later`
        : x.answer === 'both' ? '→ both, as one range' : `→ ${x.answer === 'A' ? a.author : b.author} (${x.resolvedBy === 'ADMIRATION' ? 'from what you admired' : 'your answer'})`;
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

/** One line per author for the skill's "How I sound": the classes taken, and the rules that carry them. */
export function compositeVoiceOf(c: CompositeRecord, statementOf: (id: string) => string): { readonly name: string; readonly classes: readonly TraitClass[]; readonly traits: readonly string[] }[] {
  return c.authors.flatMap((a) => {
    const mine = c.decisions.filter((d) => d.author === a.name && d.outcome === 'SELECTED' && !d.mergedInto);
    if (!mine.length) return [];
    return [{ name: a.name, classes: [...new Set(mine.map((d) => d.cls))], traits: mine.map((d) => statementOf(d.id)) }];
  });
}
