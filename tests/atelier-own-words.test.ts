// tests/atelier-own-words.test.ts — WHAT CODE HOLDS THE OWN-WORDS READING TO, AND WHAT IS LISTED BESIDE THE WORK.
// Expected values written out by hand from the inputs.
import { describe, it, expect } from 'vitest';
import { OWN_WORDS, ownWordsProblem, withOwnWords, ownWordsNote, readOwnWords, MAX_FIXES, OUTSIDE, givenHoldsName, placesOf } from '../core/loop/own-words.js';
import { inferredItems, inferredLines } from '../core/loop/inferred.js';

const TEXT = 'Setup is quick for a small team.\n\nThe brief doesn\'t say how quick, and I won\'t invent a number. Acme moved in a week.\n';
const GIVEN = 'Acme moved its team in a week.';
const BAD = 'The brief doesn\'t say how quick, and I won\'t invent a number.';

describe('the own-words reading, grounded by code', () => {
  it('a rewrite is one sentence, adds no figure and no name, and is not the sentence again', () => {
    expect(ownWordsProblem(BAD, 'Quick means the first week goes to the work, not the setup.', GIVEN)).toBeNull();
    expect(ownWordsProblem(BAD, '', GIVEN)).toBe('the rewrite was empty');
    expect(ownWordsProblem(BAD, 'It is quick. Trust me.', GIVEN)).toBe('the rewrite is not one sentence');
    expect(ownWordsProblem(BAD, 'Setup takes 20 minutes.', GIVEN)).toBe('the rewrite states 20, which nothing given holds');
    expect(ownWordsProblem(BAD, 'Ask Globex how quick it was.', GIVEN)).toBe('the rewrite names Globex, which nothing given holds');
    expect(ownWordsProblem(BAD, 'Ask Acme how quick it was.', GIVEN)).toBeNull();
    expect(ownWordsProblem(BAD, BAD, GIVEN)).toBe('the rewrite is the sentence as it was');
  });
  it('the reading: a sentence not in the piece is not acted on; a rewrite that fails code leaves the sentence, listed', () => {
    const input = { text: TEXT, given: GIVEN };
    const r = OWN_WORDS.ground({ found: [
      { sentence: BAD, about: 'the brief', rewrite: 'Quick means the first week goes to the work.' },
      { sentence: 'No data was provided.', about: 'data', rewrite: null },
      { sentence: 'Setup is quick for a small team.', about: 'x', rewrite: 'Setup takes 9 minutes.' },
    ] }, input);
    expect(r).toEqual({ fixes: [{ sentence: BAD, about: 'the brief', rewrite: 'Quick means the first week goes to the work.' }],
      dropped: [{ sentence: 'No data was provided.', why: 'the sentence is not in the piece as written' },
        { sentence: 'Setup is quick for a small team.', why: 'the rewrite states 9, which nothing given holds' }] });
    expect(OWN_WORDS.ground({ nothing: true }, input)).toBeNull();
    expect(OWN_WORDS.ground({ found: [] }, input)).toEqual({ fixes: [], dropped: [] });
    expect(OWN_WORDS.decide({ text: '  ', given: '' })).toEqual({ fixes: [], dropped: [] });
  });
  it('at most ten sentences are rewritten in one read', () => {
    const sentences = Array.from({ length: MAX_FIXES + 1 }, (_, i) => `Line ${'abcdefghijk'[i]} talks about the notes.`);
    const r = OWN_WORDS.ground({ found: sentences.map((s) => ({ sentence: s, about: 'notes', rewrite: null })) }, { text: sentences.join(' '), given: '' });
    expect(r?.fixes).toHaveLength(10);
    expect(r?.dropped).toEqual([{ sentence: sentences[10], why: 'at most 10 sentences are rewritten in one read' }]);
  });
  it('with no model, nothing is read and the text stands', async () => {
    const d = await readOwnWords({ text: TEXT, given: GIVEN }, null, null, { spentUsd: 0, capUsd: 0.05 });
    expect(d.by).toBe('floor');
    expect(d.value).toEqual({ fixes: [], dropped: [] });
  });
  it('a rewrite stands where the sentence stood; a drop takes one space with it', () => {
    expect(withOwnWords(TEXT, [{ sentence: BAD, about: 'b', rewrite: 'Quick means the first week goes to the work.' }]))
      .toBe('Setup is quick for a small team.\n\nQuick means the first week goes to the work. Acme moved in a week.\n');
    expect(withOwnWords(TEXT, [{ sentence: BAD, about: 'b', rewrite: null }])).toBe('Setup is quick for a small team.\n\nAcme moved in a week.\n');
    expect(withOwnWords('A.\n\nNo data was given.\n\nB.', [{ sentence: 'No data was given.', about: 'd', rewrite: null }])).toBe('A.\n\nB.');
    expect(ownWordsNote([{ sentence: BAD, about: 'the brief', rewrite: 'x y.' }, { sentence: 'z', about: '', rewrite: null }]))
      .toBe('The piece talked about its own making in 2 sentence(s) (the brief; its notes): 1 written again to speak to the reader, 1 dropped. What was missing is listed beside the draft, never in it.');
  });
});

describe('what is listed beside the work', () => {
  it('an unanswered position is decided; an answered one is not listed; a proof and a missing specific say what to add', () => {
    const items = inferredItems({
      questions: [{ id: 'angle', ask: 'Why now?', default: 'The jobs' }, { id: 'reader', ask: 'Who for?', default: 'Traders' }, { id: 'proof', ask: 'Proof?', default: 'Argue it' }],
      answers: [{ id: 'angle', answer: 'The jobs', by: 'default' }, { id: 'reader', answer: 'Council', by: 'person' }, { id: 'proof', answer: 'Argue it', by: 'default' }],
      specifics: [{ step: 3, missing: 'which verdict the author would give' }],
      ownWords: [{ sentence: BAD, about: 'the brief', rewrite: null }],
    });
    expect(items).toEqual([
      { kind: 'decision', what: 'Why now?', settled: 'decided: The jobs', add: '--answers "angle=<your answer>"' },
      { kind: 'proof', what: 'Proof?', settled: 'argued from what is given, with no figure of yours', add: '--answers "proof=<your answer>"' },
      { kind: 'specific', what: 'step 3: which verdict the author would give', settled: 'decided on what is given', add: 'the specific, as material (--with)' },
      { kind: 'own-words', what: BAD, settled: 'dropped: it talked about the piece\'s own making' },
    ]);
    expect(inferredLines(items)[0]).toBe('Inferred for this piece (4), beside it and never in it:');
    expect(inferredLines(items)[1]).toBe('  - decided for you: Why now? → decided: The jobs (to change: --answers "angle=<your answer>")');
    expect(inferredLines([])).toEqual([]);
  });
});

// ── WHAT THE REVIEW OF THE FIRST VERSION FOUND (each test fails on that version) ─────────────────────────────────
import { withOwnWordsStep, ownWordsAlone, type OwnWordsGate } from '../cli/commands/invoke.js';
import type { InferenceClient } from '../core/inference/client.js';
import { anInferenceResult } from './fixtures.js';
import type { VerifyReport } from '../core/observers/verify.js';

describe('the own-words reading holds against what it missed', () => {
  it('a figure in words is a figure; a name the piece already uses is no new name', () => {
    expect(ownWordsProblem(BAD, 'Roughly a third of teams move in a week.', GIVEN)).toBe('the rewrite states "third", a figure nothing given holds');
    expect(ownWordsProblem(BAD, 'It takes forty percent less time.', GIVEN)).toBe('the rewrite states "forty", a figure nothing given holds');
    expect(ownWordsProblem(BAD, 'We hit this when Kubernetes ran the jobs.', GIVEN, 'Our Kubernetes cluster ran the jobs.')).toBeNull();
    expect(ownWordsProblem(BAD, 'We hit this when Kubernetes ran the jobs.', GIVEN, 'Our cluster ran the jobs.')).toBe('the rewrite names Kubernetes, which nothing given holds');
  });
  it('a slot is written whole unless the person asked for slots; a sentence across a line break is found', () => {
    const text = 'Setup is quick. The gain was [figure: what it measures] in the first month.\n\nThe brief doesn\'t say\nhow quick, sadly.\n';
    const found = [
      { kind: 'slot', sentence: 'The gain was [figure: what it measures] in the first month.', about: 'a slot', name: null, rewrite: 'The gain shows in the first month.' },
      { kind: 'making', sentence: 'The brief doesn\'t say how quick, sadly.', about: 'the brief', name: null, rewrite: null },
    ];
    const r = OWN_WORDS.ground({ found }, { text, given: '' });
    expect(r?.fixes.map((f) => [f.kind, f.rewrite])).toEqual([['slot', 'The gain shows in the first month.'], [undefined, null]]);
    expect(withOwnWords(text, r!.fixes)).toBe('Setup is quick. The gain shows in the first month.\n');
    // asked for (--placeholders): the slot is theirs, left as it stands
    const asked = OWN_WORDS.ground({ found }, { text, given: '', slots: true });
    expect(asked?.fixes.map((f) => f.sentence)).toEqual(['The brief doesn\'t say how quick, sadly.']);
    expect(asked?.dropped).toEqual([]);
    // a rewrite that leaves a slot is no rewrite; a "slot" with no bracket in it is not one
    const still = OWN_WORDS.ground({ found: [{ ...found[0], rewrite: 'The gain was [figure] in that month.' }, { kind: 'slot', sentence: 'Setup is quick.', about: 'x', name: null, rewrite: 'Setup is fast.' }] }, { text, given: '' });
    expect(still?.fixes).toEqual([]);
    expect(still?.dropped.map((d) => d.why)).toEqual(['the rewrite leaves a slot to fill', 'it holds no slot']);
  });
  it('a name nothing given holds is written out; a name the person gave is never touched', () => {
    const text = 'Our customer Brightwell cut its close from ten days to two. Sarah Chen on our team saw it first. Stripe made the same point years ago.\n';
    const given = 'Write about faster month-end close. Notes: a customer cut close from ten days to two. Sarah noticed it.';
    const r = OWN_WORDS.ground({ found: [
      { kind: 'name', sentence: 'Our customer Brightwell cut its close from ten days to two.', about: 'a customer', name: 'Brightwell', rewrite: 'One customer cut its close from ten days to two.' },
      { kind: 'name', sentence: 'Sarah Chen on our team saw it first.', about: 'a colleague', name: 'Sarah Chen', rewrite: 'Someone on our team saw it first.' },
      { kind: 'name', sentence: 'Stripe made the same point years ago.', about: 'x', name: 'Acme', rewrite: 'A payments firm made the same point.' },
    ] }, { text, given });
    expect(r?.fixes).toEqual([{ kind: 'name', name: 'Brightwell', sentence: 'Our customer Brightwell cut its close from ten days to two.', about: 'a customer', rewrite: 'One customer cut its close from ten days to two.' }]);
    // Sarah is given: nothing wrong, nothing listed; a name not in its sentence is no finding
    expect(r?.dropped).toEqual([{ sentence: 'Stripe made the same point years ago.', why: 'the name is not in the sentence' }]);
    expect(givenHoldsName('Sarah Chen', given)).toBe(true);
    expect(givenHoldsName('The Brightwell Group', given)).toBe(false);
  });
  it('no rewrite keeps a name the read found invented, at the start of a sentence included', () => {
    const text = 'Brightwell moved fast. The brief doesn\'t say how fast.\n';
    const r = OWN_WORDS.ground({ found: [
      { kind: 'name', sentence: 'Brightwell moved fast.', about: 'a customer', name: 'Brightwell', rewrite: 'One customer moved fast.' },
      { kind: 'making', sentence: 'The brief doesn\'t say how fast.', about: 'the brief', name: null, rewrite: 'Brightwell moved faster than anyone expected.' },
    ] }, { text, given: 'Write about speed.' });
    expect(r?.fixes.map((f) => f.sentence)).toEqual(['Brightwell moved fast.']);
    expect(r?.dropped).toEqual([{ sentence: 'The brief doesn\'t say how fast.', why: 'the rewrite keeps Brightwell, which nothing given holds' }]);
  });
  it('a fix in place opens only the sentences it wrote', () => {
    const text = 'The brief doesn\'t say. I won\'t invent a date.\n';
    const r = OWN_WORDS.ground({ found: [
      { kind: 'making', sentence: 'The brief doesn\'t say.', about: 'b', name: null, rewrite: null },
      { kind: 'making', sentence: 'I won\'t invent a date.', about: 'd', name: null, rewrite: null },
    ] }, { text, given: '', within: ['I won\'t invent a date.'] });
    expect(r?.fixes.map((f) => f.sentence)).toEqual(['I won\'t invent a date.']);
    expect(r?.dropped).toEqual([{ sentence: 'The brief doesn\'t say.', why: OUTSIDE }]);
  });
  it('every place a sentence stands is fixed; a drop leaves no empty list marker or emphasis', () => {
    const fix = [{ sentence: 'I won\'t invent one.', about: 'x', rewrite: null }];
    expect(withOwnWords('A. I won\'t invent one.\n\nB. I won\'t invent one.\n', fix)).toBe('A.\n\nB.\n');
    expect(withOwnWords('- First point.\n- I won\'t invent one.\n- Last point.\n', fix)).toBe('- First point.\n- Last point.\n');
    expect(withOwnWords('Lead in. **I won\'t invent one.** Then more.\n', fix)).toBe('Lead in. Then more.\n');
  });
});

describe('the own-words step, as the run takes it', () => {
  const report = (broken: readonly string[]): VerifyReport => ({ failed: broken.length > 0, checked: ['r1', 'r2'].map((id) => ({ requirementId: id, materiality: 'REQUIRED', result: { verdict: broken.includes(id) ? 'VIOLATED' : 'MET', spans: [], value: 0, detail: '' } })) }) as unknown as VerifyReport;
  const PIECE = 'Setup is quick.\n\nThe brief doesn\'t say how quick. I won\'t invent a number either.\n\nAcme moved in a week.\n';
  const client = (found: unknown[]): InferenceClient => ({ complete: async () => anInferenceResult({ json: { found } }) });
  const gate = (c: InferenceClient | null, recheck?: (t: string) => Promise<VerifyReport>): OwnWordsGate => ({ client: c, model: c ? 'small' : null, budget: { spentUsd: 0, capUsd: 1 },
    given: 'Acme moved in a week.', kept: [], left: [], notes: [], state: { checked: false }, ...(recheck ? { recheck } : {}) });
  const refine = async (t: string) => ({ output: t, repair: null, report: report([]) });
  it('a fix the rule refuses never takes the others with it: one by one, each on the ledger, the refused one listed', async () => {
    // dropping the second sentence breaks r1 (say, the length asked); rewriting the first breaks nothing
    const recheck = async (t: string) => report(t.includes('I won\'t invent') ? [] : ['r1']);
    const g = gate(client([{ sentence: 'The brief doesn\'t say how quick.', about: 'the brief', rewrite: 'Quick means the first week goes to the work.' },
      { sentence: 'I won\'t invent a number either.', about: 'invention', rewrite: null }]), recheck);
    const d = await withOwnWordsStep(refine, g)(PIECE);
    expect(d.output).toBe('Setup is quick.\n\nQuick means the first week goes to the work. I won\'t invent a number either.\n\nAcme moved in a week.\n');
    expect(g.kept.map((f) => f.sentence)).toEqual(['The brief doesn\'t say how quick.']);
    expect(g.left).toEqual([{ sentence: 'I won\'t invent a number either.', why: 'it made r1 worse' }]);
    expect(d.repair?.controller?.decisions.filter((x) => x.action === 'own-words').map((x) => x.outcome)).toEqual(['not kept', 'kept', 'not kept']);
  });
  it('a rewrite that fails code is left as written and listed, never dropped in silence', async () => {
    const g = gate(client([{ sentence: 'The brief doesn\'t say how quick.', about: 'the brief', rewrite: 'Setup takes 20 minutes.' }]), async () => report([]));
    const d = await withOwnWordsStep(refine, g)(PIECE);
    expect(d.output).toBe(PIECE);
    expect(g.left).toEqual([{ sentence: 'The brief doesn\'t say how quick.', why: 'the rewrite states 20, which nothing given holds' }]);
    expect(inferredItems({ ownWordsLeft: g.left })).toEqual([{ kind: 'own-words', what: 'The brief doesn\'t say how quick.', settled: 'left as written (the rewrite states 20, which nothing given holds)', add: 'edit or remove this sentence' }]);
  });
  it('with no standard (no chain), the read still runs on the draft', async () => {
    const g = gate(client([{ sentence: 'I won\'t invent a number either.', about: 'invention', rewrite: null }]));
    expect(await ownWordsAlone(PIECE, g)).toBe('Setup is quick.\n\nThe brief doesn\'t say how quick.\n\nAcme moved in a week.\n');
    expect(g.state.checked).toBe(true);
    const none = gate(null);
    expect(await ownWordsAlone(PIECE, none)).toBe(PIECE);
    expect(none.state).toEqual({ checked: false, why: 'no small reader is set up' });
  });
});

describe('the own-words splice touches only what it changes', () => {
  const drop = (sentence: string) => [{ sentence, about: 'x', rewrite: null }];
  it('hard line breaks, quote blank lines, code and emphasis elsewhere stand as they were', () => {
    const text = 'Line one  \nline two.\n\n> Quote one.\n>\n> Quote two.\n\nThe brief is thin. A **bold** **more** word.\n\n```\nx = a**  **b\n\n\n\ny\n```\n';
    expect(withOwnWords(text, drop('The brief is thin.'))).toBe(text.replace('The brief is thin. ', ''));
  });
  it('a sentence inside fenced code is never changed', () => {
    const text = 'Intro.\n\n```\nThe brief is thin.\n```\n';
    expect(withOwnWords(text, drop('The brief is thin.'))).toBe(text);
  });
  it('a place starts and ends on a word, and a sentence copied without its mark stands only where a sentence ends', () => {
    expect(placesOf('I cannot say.', 'not say.')).toEqual([]);
    expect(withOwnWords('The brief does not say. The brief does not say more here.', [{ sentence: 'The brief does not say', about: 'b', rewrite: 'X' }]))
      .toBe('X. The brief does not say more here.');
  });
  it('with `within`, a sentence repeated outside those stretches stands', () => {
    expect(withOwnWords('Ship it. The brief is thin. Ship it.', drop('Ship it.'), ['Ship it. The brief is thin.'])).toBe('The brief is thin. Ship it.');
  });
  it('a drop in emphasis at the start leaves no stray space', () => {
    expect(withOwnWords('**The brief does not say.** Next.', drop('The brief does not say.'))).toBe('Next.');
  });
  it('a name the person gave is found through a possessive, a hyphen, or one word written as a name', () => {
    expect(givenHoldsName("Acme's", 'our customer Acme')).toBe(true);
    expect(givenHoldsName('Acme', "Acme's team")).toBe(true);
    expect(givenHoldsName('Jean-Luc', 'Jean Luc wrote it')).toBe(true);
    expect(givenHoldsName('Bright Path Labs', 'the path is bright')).toBe(false);
    expect(givenHoldsName('Northwind Systems', 'our systems team')).toBe(false);
  });
  it('the author\'s own words give their names, never their figures', () => {
    const own = 'At Quayside we cut the wait to 14 minutes.';
    expect(ownWordsProblem('The brief is thin.', 'Quayside sees it every week.', '', '', own)).toBeNull();
    expect(ownWordsProblem('The brief is thin.', 'The wait fell to 14 minutes.', '', '', own)).toMatch(/14/);
    const r = OWN_WORDS.ground({ found: [{ kind: 'name', sentence: 'Quayside saw it first.', about: 'x', name: 'Quayside', rewrite: 'We saw it first.' }] },
      { text: 'Quayside saw it first.', given: 'Write about waits.', own });
    expect(r?.fixes).toEqual([]);
  });
  it('figures in words: teens, -fold and ordinals are figures', () => {
    expect(ownWordsProblem('The brief is thin.', 'Most teams see a threefold gain.', '')).toMatch(/threefold/);
    expect(ownWordsProblem('The brief is thin.', 'It took seventeen weeks.', '')).toMatch(/seventeen/);
    expect(ownWordsProblem('The brief is thin.', 'It came fifth.', '')).toMatch(/fifth/);
  });
});
