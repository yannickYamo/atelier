// tests/atelier-questions-gaps.test.ts — QUESTIONS FROM GAPS: PROOF NOTHING GIVEN HOLDS, THE READER AND THE STAKES WHERE
// NOTHING STATES THEM; EACH SAYS WHAT IT UNLOCKS AND HAS A DEFAULT; AT MOST THREE; NEVER THE PIECE'S OWN POSITION; A
// SHORT ANSWER IS A DECLINE; EVERY CANDIDATE IS LOGGED. Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { GAPS, QUESTIONS, chooseQuestions, readAnswers, questionLines, PROOF_DEFAULT, KIND_UNLOCKS, GAP_WORDING, type GapsInput, type QuestionsInput } from '../core/loop/questions.js';
import { readContext } from '../core/inference/reading.js';

const INPUT: GapsInput = { request: 'Write a post on why the harbour reopening matters to small traders.', material: [{ name: 'notes', head: 'The harbour reopened on Tuesday after nine months.' }],
  inventory: [{ text: 'The harbour reopened on Tuesday.' }, { text: 'It was closed for nine months.' }], told: [] };
const frame = (o: Record<string, unknown> = {}) => ({ statedIn: 'NONE', quote: null, spread: 'DIFFERENT', options: ['Local traders', 'Town council'], default: 'Local traders', ...o });
const claim = (o: Record<string, unknown> = {}) => ({ claim: 'Trade fell while it was closed.', answer: 'FACT', supportIn: 'NONE', quote: null, unlocks: 'The middle section can carry a figure.', ...o });

describe('proof: asked only where nothing given holds it, never for the position', () => {
  it('a claim whose proof is in none of the material or inventory is asked, quoting the claim, with its unlocks and the no-invention default', () => {
    const g = GAPS.ground({ claims: [claim()], reader: frame({ statedIn: 'request', quote: 'small traders' }), stakes: frame({ spread: 'SAME' }) }, INPUT);
    const proof = g?.candidates.find((c) => c.kind === 'PROOF');
    expect(proof?.question?.id).toBe('proof');
    expect(proof?.question?.ask).toContain('"Trade fell while it was closed."');
    expect(proof?.question?.default).toBe('Argue it from what is given, with no figure');
    expect(proof?.question?.unlocks).toBe('The middle section can carry a figure.');
    expect(g?.candidates.filter((c) => c.question).map((c) => c.kind)).toEqual(['PROOF']);
  });
  it('proof quoted from the inventory is no gap; a quote the inventory does not hold is no proof; a POSITION is never asked', () => {
    const g = GAPS.ground({ claims: [
      claim({ claim: 'It was shut a long time.', supportIn: 'inventory', quote: 'closed for nine months' }),
      claim({ claim: 'Rents rose.', supportIn: 'inventory', quote: 'rents rose by a third' }),
      claim({ claim: 'The reopening is good for the town.', answer: 'POSITION' }),
    ], reader: frame({ spread: 'SAME' }), stakes: frame({ spread: 'SAME' }) }, INPUT);
    expect(g?.candidates.map((c) => [c.kind, c.what, !!c.question, c.why])).toEqual([
      ['PROOF', 'It was shut a long time.', false, 'its proof is stated in the inventory'],
      ['PROOF', 'Rents rose.', true, undefined],
      ['PROOF', 'The reopening is good for the town.', false, 'the piece\'s own position: never asked'],
      ['READER', 'who the piece is for', false, 'not stated, but the answers would not change the draft'],
      ['STAKES', 'what is at stake for the reader', false, 'not stated, but the answers would not change the draft'],
    ]);
  });
  it('one proof question per run: a second unproven claim is logged, not asked', () => {
    const g = GAPS.ground({ claims: [claim(), claim({ claim: 'Rents rose.' })], reader: frame({ spread: 'SAME' }), stakes: frame({ spread: 'SAME' }) }, INPUT);
    expect(g?.candidates.filter((c) => c.kind === 'PROOF').map((c) => c.why)).toEqual([undefined, 'one proof question per run: an earlier claim was taken']);
  });
});

describe('reader and stakes: asked only where nothing states them, in the house wording or the library\'s', () => {
  it('an unstated reader whose answers change the draft is asked with the house wording; a stated one is not', () => {
    const g = GAPS.ground({ claims: [], reader: frame(), stakes: frame({ statedIn: 'request', quote: 'matters to small traders' }) }, INPUT);
    expect(g?.candidates.map((c) => [c.kind, c.question?.ask ?? c.why])).toEqual([['READER', 'Who is this piece for?'], ['STAKES', 'stated in the request']]);
    expect(g?.candidates[0].question).toEqual({ id: 'reader', ask: GAP_WORDING.READER.ask, options: ['Local traders', 'Town council'], default: 'Local traders', unlocks: GAP_WORDING.READER.unlocks });
  });
  it('a library wording replaces the house wording; last time\'s answer is the default', () => {
    const g = GAPS.ground({ claims: [], reader: frame(), stakes: frame({ spread: 'SAME' }) },
      { ...INPUT, wording: [{ gap: 'reader', ask: 'Who will read it?', unlocks: 'What it explains.' }], told: [{ id: 'reader', ask: 'Who?', answer: 'Town council', at: 't' }] });
    expect(g?.candidates[0].question).toEqual({ id: 'reader', ask: 'Who will read it?', options: ['Local traders', 'Town council'], default: 'Town council', last: 'Town council', unlocks: 'What it explains.' });
  });
  it('with no model the floor asks nothing', async () => {
    const r = await readContext(GAPS, INPUT, null, null, { spentUsd: 0, capUsd: 1 });
    expect([r.by, r.value.candidates]).toEqual(['floor', []]);
  });
});

const QIN: QuestionsInput = { request: INPUT.request, material: INPUT.material, method: [], examples: [], told: [] };
const dec = (kind: string, o: Record<string, unknown> = {}) => ({ kind, status: 'UNKNOWN', spread: 'DIFFERENT', settledBy: 'author-only', what: `${kind.toLowerCase()} of it`, ask: `${kind}?`, options: ['a1', 'a2'], default: 'a1', statedIn: 'NONE', quote: null, ...o });

describe('the merge: at most three, each with unlocks and a default, and a log of every candidate', () => {
  it('with no gaps the decisions reading\'s questions stand, in their order, each given its unlocks', () => {
    const d = QUESTIONS.ground({ decisions: [dec('NEWS'), dec('ANGLE')] }, QIN)!;
    const { questions } = chooseQuestions(d, null);
    expect(questions.map((q) => [q.id, q.unlocks])).toEqual([['angle', KIND_UNLOCKS.ANGLE], ['news', KIND_UNLOCKS.NEWS]]);
  });
  it('the cap keeps the angle, then proof and the reader; the rest are logged with why; stakes yields to the angle', () => {
    const d = QUESTIONS.ground({ decisions: [dec('ANGLE'), dec('EMPHASIS'), dec('OTHER'), dec('NAMING', { settledBy: 'material' })] }, QIN)!;
    const g = GAPS.ground({ claims: [claim()], reader: frame(), stakes: frame() }, INPUT)!;
    const { questions, log } = chooseQuestions(d, g);
    expect(questions.map((q) => q.id)).toEqual(['angle', 'proof', 'reader']);
    expect(questions.every((q) => q.unlocks && q.default)).toBe(true);
    expect(log.map((e) => [e.kind, e.asked, e.why])).toEqual([
      ['ANGLE', true, 'asked'],
      ['EMPHASIS', false, 'cut by the cap of 3'],
      ['OTHER', false, 'voice, tone or form: the examples and the method settle it'],
      ['NAMING', false, 'settled by the material'],
      ['PROOF', true, 'asked'],
      ['READER', true, 'asked'],
      ['STAKES', false, 'the angle question already asks why it matters now'],
    ]);
  });
  it('the terminal lines say what an answer unlocks', () => {
    const { questions } = chooseQuestions({ decisions: [], questions: [] }, GAPS.ground({ claims: [], reader: frame(), stakes: frame({ spread: 'SAME' }) }, INPUT));
    expect(questionLines(questions)).toContain(`   an answer unlocks: ${GAP_WORDING.READER.unlocks}`);
  });
});

describe('an answer under 20 characters to a gap question is a decline', () => {
  const qs = [{ id: 'proof', ask: 'Proof?', options: [PROOF_DEFAULT, 'Leave the claim out'], default: PROOF_DEFAULT }, { id: 'reader', ask: 'Who?', options: ['Local traders', 'Town council'], default: 'Local traders' }];
  it('a short free answer is declined and said; a long one is kept verbatim; an option by letter or in full is never a decline', () => {
    const r = readAnswers('proof=yes it fell,reader=b', qs);
    expect([...r.answers]).toEqual([['reader', 'Town council']]);
    expect(r.said).toEqual([`proof=yes it fell: under 20 characters, counted as a decline; written with the default (${PROOF_DEFAULT}).`]);
    const long = 'Footfall fell 40% per the port survey';
    expect([...readAnswers(`proof=${long},reader=Local traders`, qs).answers]).toEqual([['proof', long], ['reader', 'Local traders']]);
    // ", word=" inside an answer in the person's words is the answer's; a mistyped id after a letter is still said
    const own = 'Footfall fell 40%, margin=thin since then';
    expect([...readAnswers(`proof=${own},reader=b`, qs).answers]).toEqual([['proof', own], ['reader', 'Town council']]);
    expect(readAnswers('reader=b,prof=the port survey says so', qs).said).toEqual(['prof matched no question; ignored.']);
  });
  it('the decision kinds keep short answers as before', () => {
    expect([...readAnswers('emphasis=jobs', []).answers]).toEqual([['emphasis', 'jobs']]);
  });
});
