// tests/atelier-composite-length-asked.test.ts — TWO AUTHORS' LENGTHS ON ONE MEASURE ARE ALWAYS ASKED, NEVER PARSED TO BE COMPATIBLE.
//
// Three rounds running, reading worded lengths for compatibility failed on wordings nobody tried: "shouldn't run over
// four sentences" read as a floor, "cite three sources per 1,000 words" read as a length, "at least 500 and at most 800
// words" read as its second bound only. Contradictions shipped and false ones were invented. Now a worded rule that
// mentions a measure and carries a quantity cue states a length on it, and two rules from different authors that state
// a length on one measure are a conflict the person answers, whatever the numbers say. The grammar only shows how
// each side reads. Every phrasing below was written by a reviewer, with the measure it is about worked out by hand.
import { describe, it, expect } from 'vitest';
import type { Measurement, Requirement } from '../core/state/canonical-state.js';
import { buildTraitTable, relationOf, type TraitClass } from '../core/composite/traits.js';
import { composeSelection, describeComposite, openStanding, type CompositeAuthor, type CompositeDecision, type CompositeRecord } from '../core/composite/selection.js';

const rule = (id: string, statement: string, measurement: Measurement | null = null): Requirement => ({
  requirementId: id, statement, appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null,
  ...(measurement ? { measurement } : {}),
});
const W = (statement: string): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement, kind: 'GENERATIVE' });
const C = (measurement: Measurement): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement: 'counted', measurement, kind: 'GENERATIVE' });
const ALL: TraitClass[] = ['opening', 'structure', 'evidence', 'pace', 'voice', 'method'];
const author = (name: string): CompositeAuthor => ({ name, pieces: [`${name}.md`], admired: 'everything', classes: ALL });
const instructs = (d: CompositeDecision | undefined): boolean => d?.outcome === 'SELECTED' && !d.shownOnly && !d.mergedInto;

// A count on each measure, as the authors' own pieces give it.
const SL: Measurement = { observer: 'SENTENCE_LENGTH', params: { medianMax: 16, p90Max: 16 } };
const PL: Measurement = { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 3 } };
const LW: Measurement = { observer: 'LENGTH', params: { unit: ['words'], min: 400, max: 900 } };
const COUNT = { piece: LW, sentence: SL, paragraph: PL } as const;
type M = keyof typeof COUNT;

// ── 1. THE REVIEWER'S 68 PHRASINGS THAT STATE A LENGTH, EACH WITH THE MEASURE IT IS ABOUT ──────────────
const PHRASINGS: readonly (readonly [string, M])[] = [
  ['Write at most 600 words.', 'piece'], ['Keep the piece to no more than 750 words.', 'piece'], ['Never more than four sentences in a paragraph.', 'paragraph'],
  ['Keep sentences no longer than 22 words.', 'sentence'], ['Cap the piece at 500 words.', 'piece'], ['Stay within 400 words.', 'piece'],
  ['Keep posts under a thousand words.', 'piece'], ['Write fewer than 300 words.', 'piece'], ['Write at least 1,200 words.', 'piece'], ['Never under 900 words.', 'piece'],
  ['Not fewer than five paragraphs.', 'piece'], ['Do not write fewer than 300 words.', 'piece'], ['Write more than two thousand words.', 'piece'],
  ['Keep the essay above 700 words.', 'piece'], ['Write upwards of 1,500 words.', 'piece'], ["Paragraphs shouldn't run over four sentences.", 'paragraph'],
  ["Sentences mustn't be longer than 20 words.", 'sentence'], ['Cut any sentence over 30 words.', 'sentence'], ['Rewrite sentences longer than 25 words.', 'sentence'],
  ['Split paragraphs that run past five sentences.', 'paragraph'], ['Avoid sentences over 30 words.', 'sentence'], ['Never let a paragraph go beyond six sentences.', 'paragraph'],
  ['Twenty-five words per sentence, max.', 'sentence'], ['Sentences can be as long as 40 words.', 'sentence'], ['Sentences may go up to forty words.', 'sentence'],
  ['Let paragraphs run to eight sentences.', 'paragraph'], ['Write 800 words or more.', 'piece'], ['Write 500 words or fewer.', 'piece'], ['Write 1000+ words.', 'piece'],
  ['At least 500 and at most 800 words.', 'piece'], ['Write less than 1,000 words but more than 600.', 'piece'], ['Keep it between 300 and 500 words, never more than 450.', 'piece'],
  ['Write about 300 words.', 'piece'], ['Aim for roughly fifteen hundred words.', 'piece'], ['Around a dozen sentences per piece.', 'piece'],
  ['Somewhere around 40 sentences in all.', 'piece'], ['Sentences of approximately 18 words.', 'sentence'], ['Write 300 words or so.', 'piece'], ['Write ~250 words.', 'piece'],
  ['In the region of two thousand words.', 'piece'], ['Write 300-500 words.', 'piece'], ['Write 300–500 words.', 'piece'], ['Write from 300 to 500 words.', 'piece'],
  ['Write between eight hundred and a thousand words.', 'piece'], ['Paragraphs of two or three sentences.', 'paragraph'], ['Two to three paragraphs.', 'piece'],
  ['A paragraph or two.', 'piece'], ['Write a single paragraph.', 'piece'], ['Exactly three paragraphs.', 'piece'], ['One-sentence paragraphs only.', 'paragraph'],
  ['A five-paragraph essay.', 'piece'], ['A 1,000-word essay.', 'piece'], ['Aim for a five-minute read.', 'piece'], ['A 7 to 10-minute read.', 'piece'],
  ['Keep it under a two-minute read.', 'piece'], ['Reading time of four minutes.', 'piece'], ['Keep it under 2,000 characters.', 'piece'], ['At least 6,000 characters.', 'piece'],
  ['A 5 min read.', 'piece'], ['Write 2k words.', 'piece'], ['Keep it to a page.', 'piece'], ['Fit it in a tweet.', 'piece'], ['Keep it brief.', 'piece'],
  ['Keep paragraphs short.', 'paragraph'], ['Keep sentences short, around twelve words.', 'sentence'], ['Twelve words a sentence on average.', 'sentence'],
  ['Write three paragraphs of 100 words each.', 'paragraph'], ['No more than 3 sentences per paragraph.', 'paragraph'],
];
const OTHER: Readonly<Record<M, string>> = { piece: 'Keep the piece to roughly 600 words.', sentence: 'Keep sentences to about sixteen words.', paragraph: 'Keep paragraphs to about three sentences.' };

describe('every phrasing that states a length is found to state it, on its measure', () => {
  it('holds all 68 of the reviewer\'s length phrasings', () => { expect(PHRASINGS).toHaveLength(68); });
  for (const [p, m] of PHRASINGS) {
    it(`${m}: ${p}`, () => {
      // against a count of that measure from another author's pieces, and against another author's words on it: asked
      expect(relationOf(W(p), C(COUNT[m]))).toBe('CONFLICT');
      expect(relationOf(C(COUNT[m]), W(p))).toBe('CONFLICT');
      expect(relationOf(W(p), W(OTHER[m]))).toBe('CONFLICT');
      // and the table pairs them, whatever else either rule is about
      const rules = [rule('a1', p), rule('b1', 'counted', COUNT[m])];
      expect(buildTraitTable(rules, (id) => (id === 'a1' ? 'ada' : 'bram')).conflicts).toHaveLength(1);
    });
  }
});

// ── 2. THE REVIEWER'S PAIRS: EVERY PAIR ON ONE MEASURE IS ASKED, AND NEITHER SIDE SHIPS ────────────────
const PAIRS: readonly (readonly [string, string])[] = [
  ["Paragraphs shouldn't run over four sentences.", 'Keep paragraphs to three sentences at most.'],
  ["Sentences mustn't be longer than 20 words.", 'Keep sentences around twelve words.'],
  ['Cut any sentence over 30 words.', 'Keep sentences around twelve words.'],
  ['Rewrite sentences longer than 25 words.', 'Never write a sentence over 15 words.'],
  ['Split paragraphs that run past five sentences.', 'Write paragraphs of two or three sentences.'],
  ['Cap the piece at 500 words.', 'Write about 300 words.'],
  ['Twenty-five words per sentence, max.', 'Keep sentences around twelve words.'],
  ['Sentences can be as long as 40 words.', 'Aim for sentences of about 15 words.'],
  ['Cite three sources per 1,000 words.', 'Keep the piece under 600 words.'],
  ['Every 300 words, add a subheading.', 'Write at least 1,500 words.'],
  ['Include a 50-word bio.', 'Write at least 800 words.'],
  ['End with a 20-word takeaway.', 'Write about 600 words.'],
  ['At least 500 and at most 800 words.', 'Write no more than 400 words.'],
  ['Write less than 1,000 words but more than 600.', 'Keep it under 300 words.'],
  ['Keep it between 300 and 500 words, never more than 450.', 'Write at least 480 words.'],
  ['Reading time of four minutes.', 'Keep it under 300 words.'],
  ['A 5 min read.', 'Keep it under 300 words.'],
  ['Write 2k words.', 'Keep it under 300 words.'],
  ['Keep it to a page.', 'Write at least 3,000 words.'],
  ['Fit it in a tweet.', 'Write at least 800 words.'],
  ["Paragraphs shouldn't run over four sentences.", 'Each paragraph should have at least seven sentences.'],
  ['Cut any sentence over 30 words.', 'Let sentences run between 35 and 50 words.'],
];
describe('two authors\' lengths on one measure are a question, whatever the numbers say', () => {
  it('holds all 22 of the reviewer\'s pairs', () => { expect(PAIRS).toHaveLength(22); });
  for (const [a, b] of PAIRS) {
    it(`asked: ${a} / ${b}`, () => {
      expect(relationOf(W(a), W(b))).toBe('CONFLICT');
      expect(relationOf(W(b), W(a))).toBe('CONFLICT');
      const rules = [rule('a1', a), rule('b1', b)];
      const t = buildTraitTable(rules, (id) => (id === 'a1' ? 'ada' : 'bram'));
      const rec = composeSelection(t, rules, [author('ada'), author('bram')]);
      expect(rec.conflicts).toHaveLength(1);
      expect(rec.decisions.map((d) => d.outcome)).toEqual(['OPEN', 'OPEN']);
      expect(openStanding(rec).neither.map((c) => c.n)).toEqual([1]);
    });
  }
  it('one author\'s own lengths are not paired', () => {
    const rules = [rule('a1', 'Write at least 1,500 words.'), rule('a2', 'Keep the piece under 600 words.'), rule('a3', 'counted', LW)];
    expect(buildTraitTable(rules, () => 'ada').conflicts).toEqual([]);
  });
});

// ── 3. THE REVIEWER'S RUNS ─────────────────────────────────────────────────────────────────────────
const sentences: Measurement = SL; const paragraphs: Measurement = PL; const hedges: Measurement = { observer: 'HEDGE_RATE', params: { maxPer1000: 2 } };
interface Run { readonly rules: Requirement[]; readonly src: Record<string, string>; readonly authors: CompositeAuthor[] }
function runOf(words: Record<string, string[]>, counted: Record<string, Measurement[]>): Run {
  const rules: Requirement[] = []; const src: Record<string, string> = {};
  let n = 0;
  for (const name of Object.keys(words)) {
    for (const s of words[name]) { const id = `p${++n}`; rules.push(rule(id, s)); src[id] = name; }
    for (const m of counted[name] ?? []) {
      const id = `m${++n}`;
      const said = m.observer === 'SENTENCE_LENGTH' ? 'I keep sentences short: a median under 16 words, and nine in ten under 16.'
        : m.observer === 'PARAGRAPH_LENGTH' ? 'I keep paragraphs to 3 sentences at most.' : 'I hedge rarely: at most 2 hedging words per thousand.';
      rules.push(rule(id, said, m)); src[id] = name;
    }
  }
  return { rules, src, authors: Object.keys(words).map(author) };
}
const compose = (r: Run, answers: Record<number, 'A' | 'B' | 'both'> = {}): { rec: CompositeRecord; screen: string[] } => {
  const t = buildTraitTable(r.rules, (id) => r.src[id]);
  const rec = composeSelection(t, r.rules, r.authors, answers);
  const of = (id: string): Requirement | undefined => r.rules.find((x) => x.requirementId === id);
  return { rec, screen: describeComposite(rec, (id) => of(id)?.statement ?? id, (id) => of(id)?.measurement ?? undefined) };
};
const nOf = (r: Run, a: string, b: string): number => {
  const t = buildTraitTable(r.rules, (id) => r.src[id]);
  const c = t.conflicts.find((x) => x.sides.map((s) => s.statement).sort().join('|') === [a, b].sort().join('|'));
  if (!c) throw new Error(`no conflict ${a} / ${b}`);
  return c.n;
};
/** Every two rules that will instruct, from two authors, stating a length on one measure: there must be none. */
const lengthPairsShipped = (r: Run, rec: CompositeRecord): string[] => {
  const live = rec.decisions.filter(instructs).flatMap((d) => r.rules.filter((x) => x.requirementId === d.id));
  return live.flatMap((x, i) => live.slice(i + 1).filter((y) => r.src[x.requirementId] !== r.src[y.requirementId] && relationOf(x, y) === 'CONFLICT')
    .map((y) => `${x.statement} / ${y.statement}`));
};
/**
 * No rule withheld or set aside without a question: every admired rule that does not instruct is open in a conflict
 * the screen asks (and counts), or was decided by the person's own answer.
 */
const unasked = (rec: CompositeRecord): string[] => {
  const { neither, oneSide } = openStanding(rec);
  const asked = new Set([...neither, ...oneSide].map((c) => c.n));
  return rec.decisions.filter((d) => !instructs(d) && !d.mergedInto).filter((d) => {
    if (d.outcome === 'OPEN') return !d.inConflicts?.some((n) => asked.has(n));
    return d.settledBy?.how !== 'ANSWER' && d.settledBy?.how !== 'SET';
  }).map((d) => `${d.id}: ${d.why}`);
};
/** The count the screen gives equals the conflicts it shows open, and no conflict's line names its own number. */
const countAndSelfReference = (rec: CompositeRecord, screen: string[]): void => {
  const { neither, oneSide } = openStanding(rec);
  const text = screen.join('\n');
  const blocks = text.split(/\n {2}(?=\d+\. )/).slice(1);
  const asking = blocks.filter((b) => { const n = Number(/^(\d+)\./.exec(b)?.[1]); return b.includes(`--conflict ${n}=A`); }).map((b) => Number(/^(\d+)\./.exec(b)?.[1]));
  expect([...neither, ...oneSide].map((c) => c.n).sort((x, y) => x - y)).toEqual(asking.sort((x, y) => x - y));
  // every conflict nobody answered that holds a side open is asked
  const byId = new Map(rec.decisions.map((d) => [d.id, d]));
  const open = rec.conflicts.filter((c) => c.answer === null && c.sides.some((s) => byId.get(s.id)?.outcome === 'OPEN')).map((c) => c.n);
  expect(open.every((n) => asking.includes(n))).toBe(true);
  for (const b of blocks) {
    const n = Number(/^(\d+)\./.exec(b)?.[1]);
    expect(b.replace(new RegExp(`--conflict ${n}=`, 'g'), '')).not.toMatch(new RegExp(`conflict ${n}\\b`));
  }
};

describe('N1e: four authors, sentence, paragraph and piece lengths', () => {
  const r = runOf({ ada: ['Cut any sentence over 30 words.', 'Cap the piece at 500 words.'], bram: ['Keep sentences around twelve words.', 'Write about 300 words.'],
    cleo: ["Paragraphs shouldn't run over four sentences.", 'Use British spelling.'], dov: ['Keep paragraphs to three sentences at most.', 'Write in the first person.'] },
  { ada: [sentences, paragraphs], bram: [sentences, paragraphs], cleo: [sentences, paragraphs], dov: [sentences, paragraphs] });
  it('with no answer: no length ships beside another author\'s, nothing is withheld unasked, the count is what is shown', () => {
    const { rec, screen } = compose(r);
    expect(lengthPairsShipped(r, rec)).toEqual([]);
    expect(unasked(rec)).toEqual([]);
    countAndSelfReference(rec, screen);
  });
  it('with the run\'s answers (the piece lengths "both", cleo over dov): the same holds', () => {
    const answers = { [nOf(r, 'Cap the piece at 500 words.', 'Write about 300 words.')]: 'both' as const,
      [nOf(r, "Paragraphs shouldn't run over four sentences.", 'Keep paragraphs to three sentences at most.')]: 'A' as const };
    const { rec, screen } = compose(r, answers);
    expect(lengthPairsShipped(r, rec)).toEqual([]);
    expect(unasked(rec)).toEqual([]);
    countAndSelfReference(rec, screen);
    // "both" on two worded lengths is both kept, shown and not instructed: never a guessed range
    for (const s of ['Cap the piece at 500 words.', 'Write about 300 words.']) {
      const d = rec.decisions.find((x) => r.rules.find((y) => y.requirementId === x.id)?.statement === s);
      expect(d).toMatchObject({ outcome: 'SELECTED', shownOnly: true });
      expect(d?.range).toBeUndefined();
    }
  });
});

describe('N2e: five authors on piece length, with no answer', () => {
  const r = runOf({ esme: ['At least 500 and at most 800 words.', 'Use contractions freely.'], faro: ['Write no more than 400 words.', 'Avoid contractions.'],
    kai: ['Write less than 1,000 words but more than 600.', 'Use short headings.'], milo: ['Keep it under 300 words.'], nora: ['Reading time of four minutes.'] },
  { esme: [sentences, paragraphs], faro: [sentences, paragraphs, hedges], kai: [sentences, paragraphs], milo: [sentences, paragraphs, hedges], nora: [sentences, paragraphs] });
  it('ships no two length instructions from two authors without an answer', () => {
    const { rec, screen } = compose(r);
    expect(lengthPairsShipped(r, rec)).toEqual([]);
    for (const s of ['At least 500 and at most 800 words.', 'Write no more than 400 words.', 'Write less than 1,000 words but more than 600.', 'Keep it under 300 words.', 'Reading time of four minutes.']) {
      expect(rec.decisions.find((d) => r.rules.find((y) => y.requirementId === d.id)?.statement === s)?.outcome).toBe('OPEN');
    }
    expect(unasked(rec)).toEqual([]);
    countAndSelfReference(rec, screen);
  });
  it('shows how each worded side reads, and "unclear" where the grammar cannot read it', () => {
    const { screen } = compose(runOf({ esme: ['At least 500 and at most 800 words.'], faro: ['Keep it to a page.'] }, {}));
    const text = screen.join('\n');
    expect(text).toContain('A  esme: At least 500 and at most 800 words.   (reads as: 500 to 800 words in the piece)');
    expect(text).toContain('B  faro: Keep it to a page.   (reads as: unclear)');
  });
});

describe('N3e: five authors, numbers that are not lengths', () => {
  const r = runOf({ otto: ['Cite three sources per 1,000 words.', 'Give two examples.'], pia: ['Keep the piece under 600 words.', 'Every 300 words, add a subheading.'],
    quin: ['Include a 50-word bio.', 'Use American spelling.'], rosa: ['Sentences can be as long as 40 words.', 'Write at least 800 words.'],
    sol: ['Aim for sentences of about 15 words.', 'Twenty-five words per sentence, max.'] },
  { otto: [sentences, paragraphs], pia: [sentences, paragraphs, hedges], quin: [sentences, paragraphs], rosa: [sentences, paragraphs, hedges], sol: [sentences, paragraphs] });
  it('with the run\'s answer (pia and rosa "both"): nothing is withheld unasked, the count is what is shown, no line names itself', () => {
    const { rec, screen } = compose(r, { [nOf(r, 'Keep the piece under 600 words.', 'Write at least 800 words.')]: 'both' });
    expect(lengthPairsShipped(r, rec)).toEqual([]);
    expect(unasked(rec)).toEqual([]);
    countAndSelfReference(rec, screen);
  });
  it('a "both" answer on a pair the grammar cannot read is both kept, shown and not instructed', () => {
    const p = runOf({ otto: ['Keep it to a page.'], pia: ['Fit it in a tweet.'] }, {});
    const { rec, screen } = compose(p, { 1: 'both' });
    expect(rec.decisions.map((d) => [d.outcome, d.shownOnly, d.range])).toEqual([['SELECTED', true, undefined], ['SELECTED', true, undefined]]);
    expect(screen.join('\n')).toContain('→ both kept, shown and not instructed (your answer)');
    expect(screen.join('\n')).toContain('(reads as: unclear)');
  });
  it('is decided the same way twice', () => {
    expect(JSON.stringify(compose(r).rec)).toBe(JSON.stringify(compose(r).rec));
  });
});
