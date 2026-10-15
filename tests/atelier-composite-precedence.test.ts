// tests/atelier-composite-precedence.test.ts — THE PERSON'S WORDS OUTRANK EVERYTHING, ACROSS EVERY CONFLICT A RULE IS IN.
//
// Defects a reviewer reproduced, each held here with expected values written from the rules' own words:
//   with three or more authors a rule sits in many pairwise conflicts, and the last one written won: an explicit
//   `--conflict n=B` was overridden by admiration in a later conflict, "both" produced nothing, and the screen said
//   "→ lena (your answer)" while lena's rule was set aside;
//   tone, person and tense were no subjects at all, a negation was read over its whole clause ("Avoid headings that are
//   questions" banned headings), "sources" singularised to "sourc", a repeated reading made a second conflict, and
//   two numbers on one subject ("two sentences at most" against "run to eight sentences") were never compared;
//   a band with a median ceiling above its 90th-percentile ceiling; the admired author whose rules sit in a conflict
//   was told nothing carries what they liked; a method screen called blocking rules optional; a card said "approved by
//   you" of rules nobody ruled on; a bound of 0.304 printed as "at most 30 in 100".
import { describe, it, expect } from 'vitest';
import type { Measurement, Requirement } from '../core/state/canonical-state.js';
import { buildTraitTable, relationOf, traitClassesOf, singular, mergedMeasurement, boundOf } from '../core/composite/traits.js';
import { composeSelection, describeComposite, standOf, type CompositeAuthor } from '../core/composite/selection.js';
import { decisionsFor } from '../cli/commands/composite.js';
import { deriveMeasuredRules } from '../core/observers/derive.js';
import { falseFlagPct } from '../core/eval/false-flags.js';
import { renderSkillCard, type SkillCard } from '../core/eval/skill-card.js';
import { describeMethod, shortScreen } from '../cli/commands/method.js';
import { thinkingOfCalls } from '../cli/runtime.js';
import type { MethodProposal } from '../core/method/standard.js';

const rule = (id: string, statement: string, measurement: Measurement | null = null): Requirement => ({
  requirementId: id, statement, appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null,
  ...(measurement ? { measurement } : {}),
});
const hedge = (id: string, n: number): Requirement => rule(id, `I hedge rarely: at most ${n} hedging words per thousand.`, { observer: 'HEDGE_RATE', params: { maxPer1000: n } });
const pace = (id: string, med: number, p90: number): Requirement => rule(id, `I keep sentences short: a median under ${med} words, and nine in ten under ${p90}.`, { observer: 'SENTENCE_LENGTH', params: { medianMax: med, p90Max: p90 } });

// Five authors, as the reviewer's run had them: lena's and nora's and otto's hedging bands disagree pairwise; kai's,
// nora's and otto's sentence bands disagree pairwise.
const BY: readonly (readonly [string, Requirement])[] = [
  ['lena', hedge('h1', 22)], ['nora', hedge('h2', 2)], ['otto', hedge('h3', 9)],
  ['kai', pace('s1', 5, 13)], ['nora', pace('s2', 16, 22)], ['otto', pace('s3', 30, 40)],
];
const proposals = BY.map(([, r]) => r);
const source = Object.fromEntries(BY.map(([a, r]) => [r.requirementId, a]));
const table = buildTraitTable(proposals, (id) => source[id]);
const author = (name: string, classes: CompositeAuthor['classes']): CompositeAuthor => ({ name, pieces: [`${name}.md`], admired: classes.length ? 'what I like' : null, classes });
// lena admired for her voice (hedging), otto for his pace: admiration alone would keep lena's hedging and otto's sentences.
const AUTHORS = [author('kai', []), author('lena', ['voice']), author('nora', []), author('otto', ['pace'])];
const conflictOf = (x: string, y: string): number => table.conflicts.find((c) => c.sides.some((s) => s.id === x) && c.sides.some((s) => s.id === y))?.n ?? -1;
const statementOf = (id: string): string => proposals.find((p) => p.requirementId === id)?.statement ?? id;

describe('one outcome per rule, across every conflict it is in', () => {
  it('the table has each pairwise conflict once', () => {
    expect(table.conflicts.map((c) => c.sides.map((s) => s.id).join('/')).sort()).toEqual(['h1/h2', 'h1/h3', 'h2/h3', 's1/s2', 's1/s3', 's2/s3']);
  });
  it('an explicit answer that sets a rule aside holds against admiration in every other conflict', () => {
    // --conflict (lena vs nora on hedging) = nora: lena's band is set aside, though lena was admired for her voice and
    // admiration alone would pick her over otto in their own conflict.
    const n = conflictOf('h1', 'h2');
    const rec = composeSelection(table, proposals, AUTHORS, { [n]: 'B' });
    const lena = rec.decisions.find((d) => d.id === 'h1');
    expect(lena?.outcome).toBe('REJECTED');
    const ds = decisionsFor(rec, proposals, new Map(), new Map());
    expect(ds.find((d) => d.id === 'h1')?.decision).toBe('REJECT');
    expect(ds.find((d) => d.id === 'h2')?.decision).toBe('APPROVE');
    // and no line of the screen says lena's band stands
    const screen = describeComposite(rec, statementOf).join('\n');
    expect(screen).not.toMatch(/→ lena \(/);
    const other = conflictOf('h1', 'h3');
    expect(screen).toContain(`  ${other}. hedging`);
    expect(standOf(rec.conflicts[other - 1], lena, rec.decisions.find((d) => d.id === 'h3'))).toMatch(/^→ neither instructs: lena set aside \(your answer to conflict \d+\)/);
  });
  it('an explicit choice holds against admiration of the other side elsewhere', () => {
    // kai's sentences chosen over otto's by the person; otto was admired for pace, which no longer decides that pair
    const rec = composeSelection(table, proposals, AUTHORS, { [conflictOf('s1', 's3')]: 'A', [conflictOf('s1', 's2')]: 'A' });
    expect(rec.decisions.find((d) => d.id === 's1')?.outcome).toBe('SELECTED');
    expect(rec.decisions.find((d) => d.id === 's3')?.outcome).toBe('REJECTED');
  });
  it('two answers that disagree on one rule: the one that sets it aside wins', () => {
    const rec = composeSelection(table, proposals, AUTHORS, { [conflictOf('s1', 's2')]: 'A', [conflictOf('s1', 's3')]: 'B' });
    expect(rec.decisions.find((d) => d.id === 's1')?.outcome).toBe('REJECTED');
  });
  it('"both" makes one range rule, whatever admiration says in another conflict', () => {
    // kai and nora's sentence bands, both: one range (median under 16, nine in ten under 22), carried by kai's rule;
    // otto's band, admired, still conflicts with kai's and is not what the person answered there.
    const n = conflictOf('s1', 's2');
    const rec = composeSelection(table, proposals, AUTHORS, { [n]: 'both' });
    const kai = rec.decisions.find((d) => d.id === 's1'); const nora = rec.decisions.find((d) => d.id === 's2');
    expect(kai).toMatchObject({ outcome: 'SELECTED', range: { observer: 'SENTENCE_LENGTH', params: { medianMax: 16, p90Max: 22 } } });
    expect(nora).toMatchObject({ outcome: 'REJECTED', mergedInto: 's1' });
    const ds = decisionsFor(rec, proposals, new Map(), new Map());
    const carried = ds.find((d) => d.id === 's1');
    expect(carried?.decision).toBe('APPROVE');
    expect(carried?.measure).toBe('SENTENCE_LENGTH:medianMax=16,p90Max=22');
    // the rule says the limits it is checked against
    expect(carried?.statement).toBe('I keep sentences short: a median under 16 words, and nine in ten under 22.');
    expect(describeComposite(rec, statementOf).join('\n')).toContain(`  ${n}. sentence length`);
    expect(standOf(rec.conflicts[n - 1], kai, nora)).toBe('→ both, as one range (your answer)');
  });
  it('a conflict nobody answered is never settled silently: both admired, it stays open, and the line says so', () => {
    const both = [author('kai', ['pace']), author('lena', []), author('nora', ['pace']), author('otto', [])];
    const rec = composeSelection(table, proposals, both, {});
    const n = conflictOf('s1', 's2');
    expect(rec.decisions.find((d) => d.id === 's1')?.outcome).toBe('OPEN');
    expect(rec.decisions.find((d) => d.id === 's2')?.outcome).toBe('OPEN');
    expect(standOf(rec.conflicts[n - 1], rec.decisions.find((d) => d.id === 's1'), rec.decisions.find((d) => d.id === 's2'))).toMatch(/^→ open: neither instructs/);
  });
  it('every line of the screen agrees with the build, on every combination of answers', () => {
    const answers = ['A', 'B', 'both', undefined] as const;
    for (const a1 of answers) for (const a2 of answers) for (const a3 of answers) {
      const given: Record<number, 'A' | 'B' | 'both'> = {};
      [a1, a2, a3].forEach((v, i) => { if (v) given[[conflictOf('h1', 'h2'), conflictOf('s1', 's2'), conflictOf('s1', 's3')][i]] = v; });
      const rec = composeSelection(table, proposals, AUTHORS, given);
      const ds = new Map(decisionsFor(rec, proposals, new Map(), new Map()).map((d) => [d.id, d.decision]));
      for (const c of rec.conflicts) {
        const line = standOf(c, rec.decisions.find((d) => d.id === c.sides[0].id), rec.decisions.find((d) => d.id === c.sides[1].id));
        // a side carried inside another rule's range stands through that rule
        const carrier = /carried in one range by (\w+)/.exec(line)?.[1];
        if (carrier) expect(ds.get(carrier), line).toBe('APPROVE');
        const named = /^→ (\w+) \(/.exec(line)?.[1];
        if (named) {
          const side = c.sides.find((s) => s.author === named);
          expect(ds.get(side?.id ?? ''), `${JSON.stringify(given)} conflict ${c.n}: ${line}`).toBe('APPROVE');
        }
        if (line.startsWith("→ open")) for (const s of c.sides) expect(ds.get(s.id), line).toBe('REJECT');
        if (line.startsWith("→ neither")) for (const s of c.sides) expect(ds.get(s.id), line).toBe('REJECT');
      }
    }
  });
  it('an admired author whose rules sit in a conflict is told which conflict, not that nothing carries it', () => {
    const both = [author('kai', ['pace']), author('lena', []), author('nora', ['pace']), author('otto', [])];
    const rec = composeSelection(table, proposals, both, {});
    const screen = describeComposite(rec, statementOf).join('\n');
    expect(screen).toMatch(/kai: "what I like": what carries that is in conflict \d+(, \d+)*, so nothing is taken from this author until you answer/);
    expect(screen).not.toMatch(/kai: "what I like": nothing read from these pieces carries that/);
  });
});

describe('a rule said twice by one author is one rule', () => {
  const ps = [rule('p1', 'Write in a casual, conversational tone.'), rule('p2', 'Keep a formal tone throughout.'), rule('p3', 'Write in a casual, conversational tone.')];
  const src: Record<string, string> = { p1: 'kai', p2: 'lena', p3: 'kai' };
  const t = buildTraitTable(ps, (id) => src[id]);
  it('paired once: one conflict, and the repetition stands and falls with the first', () => {
    expect(t.conflicts.length).toBe(1);
    expect(t.rows.find((r) => r.id === 'p3')?.sameAs).toBe('p1');
    const rec = composeSelection(t, ps, [author('kai', []), author('lena', [])], { 1: 'A' });
    expect(rec.decisions.find((d) => d.id === 'p1')?.outcome).toBe('SELECTED');
    expect(rec.decisions.find((d) => d.id === 'p3')).toMatchObject({ outcome: 'REJECTED', mergedInto: 'p1' });
  });
});

describe('what two worded rules are about, and whether they are opposed', () => {
  const w = (s: string): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement: s, kind: 'GENERATIVE' });
  const compared = (a: string, b: string): string => {
    const common = traitClassesOf(w(a)).filter((c) => traitClassesOf(w(b)).includes(c));
    return common.length ? relationOf(w(a), w(b)) : 'NOT COMPARED';
  };
  const conflicts: [string, string][] = [
    ['Write in a casual, conversational tone.', 'Keep a formal tone throughout.'],
    ['Sound relaxed and informal, like a friend talking.', 'Hold a formal, impersonal register.'],
    ['Address the reader as you, in the second person.', 'Write in the first person, as I.'],
    ['Write in the first person.', 'Write in the third person, never as I.'],
    ['Write in the present tense.', 'Tell it in the past tense.'],
    ['Narrate in the past tense.', 'Use the present tense throughout.'],
    ['Use bullet lists for any set of three or more items.', 'Never use bullet lists; carry items in sentences.'],
    ['Lay out steps as a numbered list.', 'Write everything as running prose, with no lists.'],
    ['Break the piece up with headings.', 'Avoid headings; let paragraphs carry the structure.'],
    ['Give every section a heading.', 'Write without headings.'],
    ['Keep each paragraph to a single short idea, two sentences at most.', 'Let a paragraph run to eight sentences when the evidence needs room.'],
  ];
  for (const [a, b] of conflicts) it(`opposed: ${a} / ${b}`, () => { expect(compared(a, b)).toBe('CONFLICT'); expect(compared(b, a)).toBe('CONFLICT'); });
  const compatible: [string, string][] = [
    ['Use headings.', 'Avoid headings that are questions.'],
    ['Use bullet lists for steps.', 'Never pad a list; keep each bullet short.'],
    ['Give an example in every section.', 'Use examples, never hypotheticals.'],
    ['Keep sentences short.', 'Keep sentences short, never more than twenty words.'],
    ['Use a warm, conversational tone.', 'Write in a casual, conversational tone.'],
    ['Use short headings.', 'Break the piece up with headings.'],
    ['Cite sources inline.', 'No source without a link.'],
    ['Use the first person.', 'Do not hedge in the first person.'],
    ['Use questions to pull the reader in.', 'Never end on a question.'],
    ['Keep paragraphs short.', 'No paragraph should run past five sentences.'],
    ['Use contractions.', 'Avoid contractions in headings.'],
    ['Write short sentences.', 'Avoid long paragraphs.'],
    ['Use British spelling.', 'Avoid American spelling.'],
    ['Use lists only for steps.', 'Use lists for steps.'],
  ];
  for (const [a, b] of compatible) it(`not opposed: ${a} / ${b}`, () => { expect(compared(a, b)).not.toBe('CONFLICT'); expect(compared(b, a)).not.toBe('CONFLICT'); });
  it('a worded rule against a counted one on the same subject, from another author', () => {
    const counted: Pick<Requirement, 'statement' | 'measurement' | 'kind'> = { statement: 'I keep paragraphs to 3 sentences at most.', kind: 'GENERATIVE', measurement: { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 3 } } };
    expect(relationOf(w('Let a paragraph run to eight sentences when the evidence needs room.'), counted)).toBe('CONFLICT');
    expect(relationOf(counted, w('Let a paragraph run to eight sentences when the evidence needs room.'))).toBe('CONFLICT');
    expect(relationOf(w('Keep paragraphs to three sentences at most.'), counted)).toBe('SAME');
    expect(relationOf(w('Keep paragraphs short.'), counted)).toBe('UNRELATED');
    // and in the table, from two authors
    const t = buildTraitTable([rule('p1', 'Let a paragraph run to eight sentences when the evidence needs room.'), rule('m2', counted.statement, counted.measurement)], (id) => (id === 'p1' ? 'Piet' : 'Oona'));
    expect(t.conflicts.map((c) => c.label)).toEqual(['paragraph length']);
  });
  it('reads the numbers a rule puts on a subject', () => {
    expect(boundOf('Keep each paragraph to a single short idea, two sentences at most.')).toEqual({ subject: 'paragraph', kind: 'ceiling', n: 2 });
    expect(boundOf('Let a paragraph run to eight sentences when the evidence needs room.')).toEqual({ subject: 'paragraph', kind: 'allowance', n: 8 });
    expect(boundOf('Keep sentences short, never more than twenty words.')).toEqual({ subject: 'sentence', kind: 'ceiling', n: 20 });
    expect(boundOf('Keep paragraphs to two to four sentences.')).toBeNull();
  });
  it('singular forms', () => {
    expect(['sources', 'examples', 'sentences', 'figures', 'dashes', 'headings', 'bullet points', 'hedging', 'questions'].map(singular))
      .toEqual(['source', 'example', 'sentence', 'figure', 'dash', 'heading', 'bullet', 'hedge', 'question']);
  });
});

describe('a sentence band describes some text', () => {
  it('where the median and the tail sit together, the tail\'s ceiling is never under the median\'s', () => {
    // every sentence 20 words: median 20, 90th percentile 20
    const s = 'The harbour master counts every ship that passes the old light before the tide turns and writes it down tonight.';
    const text = Array.from({ length: 12 }, () => `${s} ${s} ${s}`).join('\n\n');
    const band = deriveMeasuredRules([{ id: 'a', text }], [], 'MACHINE_DISCOVERED').find((m) => m.requirement.measurement?.observer === 'SENTENCE_LENGTH');
    const p = band?.requirement.measurement?.params as { medianMax: number; p90Max: number };
    expect(p).toEqual({ medianMax: 25, p90Max: 25 });
    expect(band?.requirement.statement).toBe('I keep sentences short: a median under 25 words, and nine in ten under 25.');
  });
  it('and a range made of an impossible band is made possible', () => {
    const m = mergedMeasurement({ observer: 'SENTENCE_LENGTH', params: { medianMax: 25, p90Max: 24 } }, { observer: 'SENTENCE_LENGTH', params: { medianMax: 5, p90Max: 11 } });
    expect(m?.params).toEqual({ medianMax: 25, p90Max: 25 });
  });
});

describe('what a screen and a card say of a rule is its actual standing', () => {
  const required: MethodProposal = { statement: 'No mechanical errors: spelling, agreement, punctuation.', origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: { observer: 'GRAMMAR', params: {} }, onExample: '3 of 3 example(s) hold it', conflict: null, counted: true, required: true };
  const habit: MethodProposal = { statement: 'I keep paragraphs to 4 sentences at most.', origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 4 } }, onExample: 'set where all 3 of your examples meet it', conflict: null, counted: true };
  const step: MethodProposal = { statement: 'Write between 120 and 300 words.', origin: 'STATED', obligation: 'DELIVERABLE', measurement: { observer: 'LENGTH', params: { unit: ['word'], min: 120, max: 300 } }, onExample: 'held', conflict: null };
  it('the method screen lists a rule that blocks as required, and only habits as "required only if you say so"', () => {
    const lines = describeMethod([step, required, habit], 'FULL_REPRO_CASE');
    const optional = lines.findIndex((l) => l.includes('required only if you say so'));
    const req = lines.findIndex((l) => l.startsWith('Counted from your examples, and not in your method: required'));
    expect(req).toBeGreaterThan(-1);
    expect(lines[req + 1]).toBe(`  - ${required.statement}`);
    expect(lines.slice(optional)).not.toContain(`  - ${required.statement}`);
    expect(lines.slice(optional)).toContain(`  - ${habit.statement}`);
    const short = shortScreen([step, required, habit]).join('\n');
    expect(short).toContain('Also learned from your examples: 1 required, since every example meets it, and checked on every run; 1 habit, shown and never blocking (see them with --report).');
  });
  it('the card says who stands behind the rules, never "approved by you" of rules nobody ruled on', () => {
    const card: SkillCard = { schema: 1, skill: 'bake', skillVersion: 'b0ce2040aaaa', standardVersion: 'f3cc666caaaa', builtAt: null, corpus: null, copying: false,
      rules: { total: 8, required: 5, counted: 6, read: 2, conditional: 0, needsMaterial: 0, written: 5, unconfirmed: 0 },
      claims: { instrument: 'pattern check', qualified: false, measured: null, answers: false }, fidelity: null, release: null, taste: null, notMeasured: [], next: [] };
    const text = renderSkillCard(card, 140);
    expect(text).not.toContain('approved by you');
    expect(text).toContain('8 in force (5 written by you, 3 read from your work): 5 required');
    expect(renderSkillCard({ ...card, rules: { ...card.rules, written: 0, unconfirmed: 2 } }, 140)).toContain('8 in force (0 written by you, 8 read from your work, 2 not yet confirmed by you)');
  });
  it('a bound of 0.304 is said as at most 31 in 100: a ceiling is never rounded down', () => {
    expect(falseFlagPct({ leftAlone: 39, clean: 48 })).toBe(31);
  });
});

describe('the thinking setting a run\'s calls were sent with', () => {
  it('is "disabled" only when every call says so, and null otherwise', () => {
    expect(thinkingOfCalls([{ role: 'target', modelId: 'm', thinkingSent: 'disabled' }, { role: 'discovery', modelId: 'h', thinkingSent: 'disabled' }])).toBe('disabled');
    expect(thinkingOfCalls([{ role: 'target', modelId: 'm', thinkingSent: 'disabled' }, { role: 'discovery', modelId: 'h', thinkingSent: undefined }])).toBeNull();
    expect(thinkingOfCalls([])).toBeNull();
  });
});
