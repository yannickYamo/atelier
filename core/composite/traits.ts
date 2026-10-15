// atelier/core/composite/traits.ts — THE TRAIT TABLE: WHAT EACH AUTHOR'S RULES ARE ABOUT, AND HOW THEY STAND TO ONE ANOTHER.
//
// Discovery has read each author's pieces on their own (cli/commands/discover.ts), so every proposal names the
// author it came from. This pass, deterministic and free, sorts those proposals two ways:
//
//   CLASS   what a rule is about, one of six: opening, structure, evidence, pace, voice, method. A counted rule is
//           classed by its observer; a worded one by the words it uses. The person's "I like how it opens" is
//           mapped to the same six (./admire.ts), which is how a free line selects rules.
//   KIND    how a rule stands to the other authors' rules of the same class:
//             SHARED          two or more authors propose compatible rules (a limit within tolerance, or the same
//                             statement in other words). Evidence that the trait recurs; not thereby a rule.
//             UNIQUE          one author alone. Kept when admired, however many authors lack it.
//             CONFLICTING     two authors propose incompatible values (paragraphs of two sentences against eight;
//                             "never contractions" against "contractions throughout"). Surfaced, never averaged.
//             TASK_DEPENDENT  conflicting, but the two authors write pieces of different lengths (the length
//                             classes of core/fidelity/types.ts): the difference may be the kind of work, not taste.
//
// Nothing here calls a model, and nothing resolves a conflict: that is the person's, on the composite screen.

import type { Measurement, Requirement } from '../state/canonical-state.js';
import type { ContextClass } from '../fidelity/types.js';

export type TraitClass = 'opening' | 'structure' | 'evidence' | 'pace' | 'voice' | 'method';
export const TRAIT_CLASSES: readonly TraitClass[] = ['opening', 'structure', 'evidence', 'pace', 'voice', 'method'];
export const TRAIT_LABEL: Readonly<Record<TraitClass, string>> = {
  opening: 'openings', structure: 'argument structure', evidence: 'evidence and its depth',
  pace: 'pacing and paragraph construction', voice: 'tone, register and voice', method: 'method and recurring moves',
};

/** How a counted rule's observer places it. Anything not listed is read from its words. */
const BY_OBSERVER: Readonly<Partial<Record<string, TraitClass>>> = {
  OPENING: 'opening', CLOSING: 'structure', HEADINGS: 'structure', PRESENCE: 'structure', TABLE: 'structure', LENGTH: 'structure',
  SENTENCE_LENGTH: 'pace', PARAGRAPH_LENGTH: 'pace', FRAGMENT_SHARE: 'pace', RHYTHM: 'pace', DISTRIBUTION: 'pace',
  CITED: 'evidence', LINES: 'evidence',
  HEDGE_RATE: 'voice', LEXICON: 'voice', TERM_RATE: 'voice', PATTERN_RATE: 'voice', RATIO: 'voice', STYLE_DISTANCE: 'voice', FEATURE: 'voice',
};

/** In this order: the first class whose words a statement uses wins, so "I open with a short scene" is an opening, not pace. */
const BY_WORDS: readonly (readonly [TraitClass, RegExp])[] = [
  ['opening', /\b(open|opens|opening|openings|begin|begins|beginning|first (?:sentence|line|paragraph|words)|lead(?:s)? with|start(?:s)? with|hook|title)\b/i],
  ['evidence', /\b(evidence|figure|figures|number|numbers|data|source|sources|cite|cites|citation|citations|example|examples|specific|specifics|detail|details|proof|statistic|statistics|quote|quotes|footnote|reference|references)\b/i],
  ['pace', /\b(sentence|sentences|paragraph|paragraphs|pace|pacing|rhythm|fragment|fragments|brisk|fast|slow|cadence|clipped|tempo)\b/i],
  ['structure', /\b(structure|structured|argument|arguments|section|sections|order|sequence|outline|heading|headings|list|lists|numbered|step|steps|close|closes|closing|end|ends|ending|conclusion|transition|transitions|moves)\b/i],
  ['voice', /\b(tone|register|voice|formal|informal|contraction|contractions|first person|we|humou?r|wry|warm|dry|plain|jargon|hedge|hedges|hedging|spelling|dash|dashes|word|words|phrasing|vocabulary|irony|understatement|slang|diction)\b/i],
];

/** What a rule is about. The observer decides for a counted rule; the words for a worded one; a decision move otherwise. */
export function traitClassOf(r: Pick<Requirement, 'statement' | 'measurement'>): TraitClass {
  const byObserver = r.measurement ? BY_OBSERVER[r.measurement.observer] : undefined;
  if (byObserver) return byObserver;
  for (const [cls, re] of BY_WORDS) if (re.test(r.statement)) return cls;
  return 'method';
}

export type TraitKind = 'SHARED' | 'UNIQUE' | 'CONFLICTING' | 'TASK_DEPENDENT';

export interface TraitRow {
  readonly id: string;
  readonly author: string;
  readonly cls: TraitClass;
  readonly kind: TraitKind;
  /** the ids of the other authors' rules this one is shared with, or conflicts with */
  readonly with: readonly string[];
}

export interface ConflictSide { readonly id: string; readonly author: string; readonly statement: string }
export interface Conflict {
  /** 1-based, the number a person answers by (`--conflict 1=A`) */
  readonly n: number;
  readonly cls: TraitClass;
  /** one line naming what the two disagree on */
  readonly label: string;
  readonly sides: readonly [ConflictSide, ConflictSide];
  /** the two authors write pieces of different lengths: the difference may be the kind of work */
  readonly taskDependent: boolean;
}

export interface TraitTable { readonly rows: readonly TraitRow[]; readonly conflicts: readonly Conflict[] }

const STOP = new Set(['i', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'with', 'and', 'or', 'for', 'my', 'it', 'its', 'is', 'are', 'be',
  'that', 'this', 'as', 'by', 'from', 'when', 'then', 'than', 'so', 'if', 'each', 'every', 'one', 'all', 'most', 'keep', 'use', 'write', 'give', 'make']);
const NEGATION = /\b(never|no|not|avoid|without|don't|do not|rarely)\b/i;
const contentWords = (s: string): Set<string> => new Set((s.toLowerCase().match(/[a-z][a-z'-]+/g) ?? [])
  .map((w) => w.replace(/'s$/, '').replace(/(?<=[a-z]{3})s$/, '')).filter((w) => !STOP.has(w) && !NEGATION.test(w)));
const jaccard = (a: Set<string>, b: Set<string>): number => { const inter = [...a].filter((w) => b.has(w)).length; const uni = new Set([...a, ...b]).size; return uni ? inter / uni : 0; };
/** Two worded rules are about the same thing when they share this much of their content words. */
export const SAME_SUBJECT = 0.34;

/** How far two limits may sit apart and still be one trait: within 30% of the larger, and never less than 2 apart counts. */
const withinTolerance = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(2, 0.3 * Math.max(Math.abs(a), Math.abs(b)));

type Relation = 'SAME' | 'CONFLICT' | 'UNRELATED';

/** How two rules of one class from two authors stand to each other. */
export function relationOf(a: Pick<Requirement, 'statement' | 'measurement' | 'kind'>, b: Pick<Requirement, 'statement' | 'measurement' | 'kind'>): Relation {
  if (a.measurement && b.measurement) {
    if (a.measurement.observer !== b.measurement.observer) return 'UNRELATED';
    const pa = a.measurement.params; const pb = b.measurement.params;
    // Two bands on different patterns or features are different traits; the same pattern or feature, compared by limits.
    for (const key of ['pattern', 'feature', 'terms', 'unit']) {
      if (key in pa || key in pb) { if (JSON.stringify(pa[key] ?? null) !== JSON.stringify(pb[key] ?? null)) return 'UNRELATED'; }
    }
    const numeric = Object.keys(pa).filter((k) => typeof pa[k] === 'number' && typeof pb[k] === 'number');
    if (!numeric.length) return 'SAME';
    return numeric.every((k) => withinTolerance(pa[k] as number, pb[k] as number)) ? 'SAME' : 'CONFLICT';
  }
  if (a.measurement || b.measurement) return 'UNRELATED';
  const wa = contentWords(a.statement); const wb = contentWords(b.statement);
  if (jaccard(wa, wb) < SAME_SUBJECT) return 'UNRELATED';
  // The same subject, and one says never where the other says do: a conflict. (A boundary against a generative rule too.)
  const na = NEGATION.test(a.statement) || a.kind === 'BOUNDARY'; const nb = NEGATION.test(b.statement) || b.kind === 'BOUNDARY';
  return na === nb ? 'SAME' : 'CONFLICT';
}

/**
 * A MEASUREMENT COVERING BOTH SIDES OF A CONFLICT ("both, as a range"): every upper limit takes the larger value, every
 * lower limit the smaller; other parameters must agree. Null when the two cannot be one range.
 */
export function mergedMeasurement(a: Measurement | null | undefined, b: Measurement | null | undefined): Measurement | null {
  if (!a || !b) return null;
  if (a.observer !== b.observer) return null;
  const params: Record<string, Measurement['params'][string]> = {};
  for (const k of new Set([...Object.keys(a.params), ...Object.keys(b.params)])) {
    const x = a.params[k]; const y = b.params[k];
    if (typeof x === 'number' && typeof y === 'number') {
      if (/max|Max|tolerance/.test(k)) params[k] = Math.max(x, y);
      else if (/min|Min/.test(k)) params[k] = Math.min(x, y);
      else if (x === y) params[k] = x; else return null;
    } else if (JSON.stringify(x ?? null) === JSON.stringify(y ?? null)) { if (x !== undefined) params[k] = x; }
    else return null;
  }
  return { observer: a.observer, params };
}

/** What two conflicting rules disagree on, in a few words. */
const labelOf = (a: Requirement, b: Requirement): string => {
  const m = a.measurement;
  if (m) {
    const names: Readonly<Record<string, string>> = { PARAGRAPH_LENGTH: 'paragraph length', SENTENCE_LENGTH: 'sentence length', HEDGE_RATE: 'hedging', FRAGMENT_SHARE: 'fragments', OPENING: 'opening length', HEADINGS: 'headings', RHYTHM: 'rhythm' };
    return names[m.observer] ?? m.observer.toLowerCase().replace(/_/g, ' ');
  }
  const shared = [...contentWords(a.statement)].filter((w) => contentWords(b.statement).has(w));
  // The subject the two share, named as a person would: "paragraph length", not "let, paragraph, run".
  const SUBJECTS: readonly (readonly [string, string])[] = [['paragraph', 'paragraph length'], ['sentence', 'sentence length'], ['contraction', 'contractions'],
    ['open', 'openings'], ['opening', 'openings'], ['hedge', 'hedging'], ['heading', 'headings'], ['list', 'lists'], ['example', 'examples'], ['figure', 'figures']];
  const named = SUBJECTS.find(([w]) => shared.includes(w));
  return named ? named[1] : shared.slice(0, 3).join(', ') || 'one statement against another';
};

/**
 * THE TABLE. `sourceOf` names each proposal's author; `lengthClassOf` the length class an author's pieces fall in (or
 * null when unknown), which tells a conflict of taste from one of kind of work.
 */
export function buildTraitTable(proposals: readonly Requirement[], sourceOf: (id: string) => string | undefined,
  lengthClassOf: (author: string) => ContextClass | null = () => null): TraitTable {
  const items = proposals.flatMap((p) => { const author = sourceOf(p.requirementId); return author ? [{ p, author, cls: traitClassOf(p) }] : []; });
  const same = new Map<string, string[]>(); const conflict = new Map<string, string[]>();
  const conflicts: Conflict[] = [];
  const push = (m: Map<string, string[]>, k: string, v: string): void => { m.set(k, [...(m.get(k) ?? []), v]); };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]; const b = items[j];
      if (a.author === b.author || a.cls !== b.cls) continue;
      const rel = relationOf(a.p, b.p);
      if (rel === 'SAME') { push(same, a.p.requirementId, b.p.requirementId); push(same, b.p.requirementId, a.p.requirementId); }
      if (rel === 'CONFLICT') {
        push(conflict, a.p.requirementId, b.p.requirementId); push(conflict, b.p.requirementId, a.p.requirementId);
        const la = lengthClassOf(a.author); const lb = lengthClassOf(b.author);
        conflicts.push({ n: conflicts.length + 1, cls: a.cls, label: labelOf(a.p, b.p), taskDependent: la !== null && lb !== null && la !== lb,
          sides: [{ id: a.p.requirementId, author: a.author, statement: a.p.statement }, { id: b.p.requirementId, author: b.author, statement: b.p.statement }] });
      }
    }
  }
  const rows: TraitRow[] = items.map(({ p, author, cls }) => {
    const id = p.requirementId;
    const c = conflict.get(id) ?? []; const s = same.get(id) ?? [];
    const kind: TraitKind = c.length
      ? (conflicts.filter((x) => x.sides.some((side) => side.id === id)).every((x) => x.taskDependent) ? 'TASK_DEPENDENT' : 'CONFLICTING')
      : s.length ? 'SHARED' : 'UNIQUE';
    return { id, author, cls, kind, with: [...new Set([...c, ...s])] };
  });
  return { rows, conflicts };
}
