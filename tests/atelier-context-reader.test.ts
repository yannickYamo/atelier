// tests/atelier-context-reader.test.ts — WHAT A REQUEST WAS READ AS, AND WHICH PIECES IT WAS MEASURED AGAINST.
//
// Offline, against a scripted client. Each reading is tried both ways: the answer code must accept and the answer
// it must drop. A small model reads the context (the subject, the document a request names, whether a rewrite kept
// its claims); code validates every answer and decides what it may do, and with no model the word patterns stand.
import { describe, it, expect } from 'vitest';
import { buildRetrievalIndex, retrieve } from '../core/fidelity/retrieval.js';
import { lexicalNearness, readerNearness, referenceWeight, retrieveNear, nearWeight, piecesOf, LEXICAL_NEAR_PASSAGES } from '../core/fidelity/nearness.js';
import { cardOf, gradesOf, gradeSubjects, readSubjectCards, renderCards, cardText, SUBJECT_READER_VERSION, type SubjectCards } from '../core/fidelity/subject-reader.js';
import { localContext } from '../core/fidelity/context.js';
import { calibrateFromValues, typicalityOfValues, typicalityInContext } from '../core/fidelity/typicality.js';
import { authorFloor, floorOf, closeness } from '../core/fidelity/twosample.js';
import { mulberry32 } from '../core/fidelity/qualify.js';
import { decideRegister } from '../core/voice/register.js';
import { modelJudge } from '../core/loop/context-judge.js';
import { changesOf, readClaimChanges } from '../core/voice/reader.js';
import { voicePass } from '../core/voice/pass.js';
import { pairsHash, type PairBank } from '../core/voice/pairs.js';
import { renderPanel, type EvalSummary } from '../core/eval/summary.js';
import { unmetered, type InferenceClient } from '../core/inference/client.js';

const scripted = (answer: (req: { userMessage: string; toolName?: string }) => unknown): InferenceClient => ({
  complete: (req) => Promise.resolve({ json: answer(req), termination: { kind: 'COMPLETE' }, cost: unmetered(), costUsd: 0 } as never),
});
const failing: InferenceClient = { complete: () => Promise.reject(new Error('no model')) };
const budget = (): { spentUsd: number; capUsd: number; maxCalls: number } => ({ spentUsd: 0, capUsd: 5, maxCalls: 60 });

const para = (topic: string, i: number): string => `The ${topic} team shipped a new ${topic} pipeline in week ${i} and measured how the ${topic} latency moved after the ${topic} change went out to every region, then wrote down what the ${topic} rollout taught them about ${topic} capacity for the next quarter of work.`;
const TOPICS = ['incident', 'hiring', 'pricing', 'onboarding'];
const index = buildRetrievalIndex(TOPICS.map((t) => ({ id: `${t}.md`, text: [1, 2, 3].map((i) => para(t, i)).join('\n\n') })));

describe('the lexical reading reports what the run already used', () => {
  it('near is the pieces of the closest passages, and a near piece counts the full weight', () => {
    const n = lexicalNearness(index, 'how the incident pipeline moved latency');
    const top = new Set(retrieve(index, 'how the incident pipeline moved latency', LEXICAL_NEAR_PASSAGES).map((k) => index.passages[k].piece));
    expect(new Set(n.pieces.map((p) => p.id))).toEqual(top);
    expect(n.pieces[0].id).toBe('incident.md');
    expect(n).toMatchObject({ source: 'lexical', of: 4, index: index.hash });
    expect(referenceWeight(n, 'incident.md', 3)).toBe(3);
    expect(retrieveNear(index, 'how the incident pipeline moved latency', 3, n)).toEqual(retrieve(index, 'how the incident pipeline moved latency', 3));
  });
  it('a request that shares no word with any piece is near nothing, and says it is thin', () => {
    const n = lexicalNearness(index, 'Outage');
    expect(n.pieces).toEqual([]);
    expect(n.thin).toBe(true);
    expect(referenceWeight(n, 'incident.md', 3)).toBe(1);
  });
});

describe('the reader\'s reading: grades become weights, in code', () => {
  const n = readerNearness(index, new Map([['incident.md', 'same'], ['onboarding.md', 'related'], ['ghost.md', 'same']]), `${SUBJECT_READER_VERSION}:m`, 'cards1');
  it('a same-subject piece counts whole, a related one half, and a piece the index does not hold is dropped', () => {
    expect(n.pieces).toEqual([{ id: 'incident.md', weight: 1, grade: 'same' }, { id: 'onboarding.md', weight: 0.5, grade: 'related' }]);
    expect(n.nEff).toBeCloseTo(1.8, 3);
    expect(n.thin).toBe(false);
    expect(nearWeight(n, 'pricing.md')).toBe(0);
    expect(referenceWeight(n, 'incident.md', 3)).toBe(3);
    expect(referenceWeight(n, 'onboarding.md', 3)).toBe(2);
    expect(referenceWeight(n, 'pricing.md', 3)).toBe(1);
  });
  it('a request that shares no word still gets the near pieces\' passages, nearest piece first, and nothing from the rest', () => {
    const got = retrieveNear(index, 'Outage', 4, n).map((k) => index.passages[k].piece);
    expect(got).toEqual(['incident.md', 'incident.md', 'incident.md', 'onboarding.md']);
    expect(retrieve(index, 'Outage', 4)).toEqual([]);
    expect(retrieveNear(index, 'Outage', 4, readerNearness(index, new Map(), 'r', 'c'))).toEqual([]);
  });
  it('one near piece is thin', () => {
    expect(readerNearness(index, new Map([['incident.md', 'same']]), 'r', 'c').thin).toBe(true);
  });
  it('the range for the subject takes the reader\'s weights when it is given them', () => {
    const rows = TOPICS.flatMap((_, k) => [0, 1].map((j) => ({ a: k * 10 + j, b: k + j * 0.5 })));
    const ids = TOPICS.flatMap((t) => [`${t}.md`, `${t}-held.md`]);
    const cal = calibrateFromValues(rows, undefined, ids);
    expect(cal).not.toBeNull();
    if (!cal) return;
    const lexical = localContext('Outage', cal, index);
    expect(lexical).toBeNull();
    const read = localContext('Outage', cal, index, (id) => nearWeight(n, id));
    expect(read?.pieces.map((p) => p.id)).toEqual(['incident.md', 'onboarding.md']);
    expect(read?.nEff).toBeCloseTo(1.8, 3);
  });
});

describe('subject cards and grades are validated in code', () => {
  it('a card needs a sentence and short phrases; long phrases and blanks are dropped', () => {
    expect(cardOf('p', { about: ' What an outage taught the team. ', subjects: ['a production failure', '', 'x'.repeat(4), 'one two three four five six seven eight nine', 'a production failure'] }))
      .toEqual({ piece: 'p', about: 'What an outage taught the team.', subjects: ['a production failure', 'xxxx'] });
    expect(cardOf('p', { about: '', subjects: ['a'] })).toBeNull();
    expect(cardOf('p', { about: 'About things.', subjects: [] })).toBeNull();
    expect(cardOf('p', null)).toBeNull();
  });
  const cards: SubjectCards = { version: 1, reader: `${SUBJECT_READER_VERSION}:m`, index: index.hash, builtAt: 't', hash: 'h',
    cards: TOPICS.map((t) => ({ piece: `${t}.md`, about: `About ${t}.`, subjects: [t] })) };
  it('the grader never sees a piece\'s id, which is often its title', () => {
    expect(renderCards(cards.cards)).not.toMatch(/\.md/);
    expect(cardText(index, 'incident.md')).not.toMatch(/incident\.md/);
  });
  it('an unknown card number or label is dropped, and a piece named twice keeps its first grade', () => {
    const g = gradesOf(cards.cards, { pieces: [{ card: 1, grade: 'same' }, { card: 9, grade: 'same' }, { card: 2, grade: 'excellent' }, { card: 1, grade: 'related' }, { card: 4, grade: 'related' }] });
    expect([...(g ?? [])]).toEqual([['incident.md', 'same'], ['onboarding.md', 'related']]);
    expect(gradesOf(cards.cards, { nope: 1 })).toBeNull();
  });
  it('one call grades a request; a reader that fails returns null, so the caller falls back to words', async () => {
    const g = await gradeSubjects(scripted(() => ({ pieces: [{ card: 1, grade: 'same' }] })), budget(), 'Outage', cards);
    expect([...(g ?? [])]).toEqual([['incident.md', 'same']]);
    expect(await gradeSubjects(failing, budget(), 'Outage', cards)).toBeNull();
    expect(await gradeSubjects(scripted(() => ({ pieces: [] })), budget(), '   ', cards)).toBeNull();
  });
  it('cards are read once per piece and name the reader and the index', async () => {
    const built = await readSubjectCards(scripted((r) => ({ about: `About ${/The (\w+) team/.exec(r.userMessage)?.[1]}.`, subjects: ['a subject'] })), budget(), index, 'm');
    expect(built.cards.map((c) => c.piece)).toEqual(piecesOf(index));
    expect(built).toMatchObject({ reader: `${SUBJECT_READER_VERSION}:m`, index: index.hash });
    expect(built.cards[0].about).toBe('About incident.');
  });
});

describe('the register a request names is read, and must be the request\'s own words', () => {
  it('a quote from the request decides; the word table\'s false hit does not', () => {
    // "report" as a verb: the table reads a report, the reader says the request names no document.
    expect(decideRegister(['post'], 'Report the bug to the platform team', undefined)).toMatchObject({ status: 'out', request: 'report', source: 'keyword' });
    expect(decideRegister(['post'], 'Report the bug to the platform team', undefined, null, null)).toMatchObject({ status: 'assumed-in', request: null, source: 'none' });
    expect(decideRegister(['post'], 'Draft a press release on the launch', undefined, null, 'press release')).toMatchObject({ status: 'out', request: 'press-release', source: 'reader', words: 'press release' });
    expect(decideRegister(['post'], 'Write a LinkedIn post on the launch', undefined, null, 'LinkedIn post')).toMatchObject({ status: 'in', request: 'post', source: 'reader' });
  });
  it('a quote the request does not hold is no reading: the table decides, as with no reader', () => {
    expect(decideRegister(['post'], 'Draft the contract for the pilot', undefined, null, 'white paper')).toMatchObject({ status: 'out', request: 'contract', source: 'keyword' });
    expect(decideRegister(['post'], 'Draft the contract for the pilot', undefined, null, undefined)).toMatchObject({ request: 'contract', source: 'keyword' });
  });
  it('what the person declares wins over any reading', () => {
    expect(decideRegister(['post'], 'Write a post about the contract', 'contract', null, 'post')).toMatchObject({ status: 'out', source: 'declared' });
  });
  it('the judge returns the document only as the request\'s own words', async () => {
    const ask = (json: unknown): ReturnType<typeof modelJudge> => modelJudge(scripted(() => json), budget());
    expect((await ask({ format: null, length: null, document: 'white paper' }).requestIntent('Write a white paper on storage'))?.document).toBe('white paper');
    expect((await ask({ format: null, length: null, document: null }).requestIntent('Report the bug'))?.document).toBeNull();
    // Words the request does not hold, or an answer without the field: undefined, and the table decides.
    expect((await ask({ format: null, length: null, document: 'memo' }).requestIntent('Write a white paper'))?.document).toBeUndefined();
    expect((await ask({ format: null, length: null }).requestIntent('Write a white paper'))?.document).toBeUndefined();
  });
});

describe('the voice gate\'s second read can only refuse', () => {
  const content = 'We think the cache migration cut checkout latency for some merchants in March, though the team has not measured the long tail yet.';
  const voice = 'The cache migration cut checkout latency for every merchant in March. Nobody has measured the long tail.';
  it('a finding must quote the paragraph it names', () => {
    expect(changesOf(content, voice, { changes: [{ kind: 'strength', quote: 'for every merchant' }, { kind: 'dropped', quote: 'We think' },
      { kind: 'added', quote: 'words that are nowhere' }, { kind: 'dropped', quote: 'in March' }, { kind: 'odd', quote: 'cut' }] }))
      .toEqual([{ kind: 'strength', quote: 'for every merchant' }, { kind: 'dropped', quote: 'We think' }]);
    expect(changesOf(content, voice, {})).toBeNull();
    expect(changesOf(content, voice, { changes: [] })).toEqual([]);
  });
  it('a reader that fails returns null', async () => {
    expect(await readClaimChanges(failing, budget(), content, voice)).toBeNull();
  });
  const pairs = [0, 1, 2, 3].map((i) => ({ id: `p${i}`, piece: 'a', neutral: `The cache migration reduced checkout latency in release ${i}.`, author: `We moved the cache in release ${i}, and checkout got faster.`, neutraliser: 'm' }));
  const bank: PairBank = { version: 1, sourceHash: 's', pairs, rejected: { facts: 0, same: 0, length: 0, failed: 0 } as never, builtAt: 't', hash: pairsHash(pairs) };
  const text = 'The platform team released the cache migration in March 2024 and the checkout latency fell by 40% in the first week, which may continue as more merchants move over to the new cache.';
  const rewrite = 'In March 2024 the platform team released the cache migration, and checkout latency fell by 40% in the first week, which may continue as more merchants move over to the new cache.';
  const writer = scripted(() => ({ paragraph: rewrite }));
  it('a rewrite the word lists pass is refused when the reader quotes a changed claim, and kept when it finds none or cannot answer', async () => {
    const kept = await voicePass(writer, budget(), text, bank, null);
    expect(kept.paragraphs[0]).toMatchObject({ kept: true });
    const refused = await voicePass(writer, budget(), text, bank, null, scripted(() => ({ changes: [{ kind: 'strength', quote: 'fell by 40%' }] })));
    expect(refused.paragraphs[0]).toMatchObject({ kept: false, check: 'reader' });
    expect(refused.text).toBe(text);
    expect((await voicePass(writer, budget(), text, bank, null, scripted(() => ({ changes: [] })))).paragraphs[0].kept).toBe(true);
    expect((await voicePass(writer, budget(), text, bank, null, failing)).paragraphs[0].kept).toBe(true);
    // A quote that is nowhere in the rewrite is no finding.
    expect((await voicePass(writer, budget(), text, bank, null, scripted(() => ({ changes: [{ kind: 'added', quote: 'not in the text' }] })))).paragraphs[0].kept).toBe(true);
  });
});

describe('typicality says when a text is beyond every piece', () => {
  const rand = mulberry32(7);
  const rows = Array.from({ length: 6 }, () => ({ a: rand(), b: rand(), c: rand() }));
  const cal = calibrateFromValues(rows, undefined, rows.map((_, i) => `p${i}`));
  it('past the farthest piece the reading is "beyond", with both distances; inside, it is a share', () => {
    expect(cal).not.toBeNull();
    if (!cal) return;
    const far = typicalityOfValues({ a: 40, b: -40, c: 40 }, cal);
    expect(far).toMatchObject({ beyond: true, pieces: 6 });
    expect(far?.p).toBeCloseTo(1 / 7, 3);
    expect(far?.farthest).toBe(cal.scores[cal.scores.length - 1]);
    const near = typicalityOfValues({ a: 0.5, b: 0.5, c: 0.5 }, cal);
    expect(near?.beyond).toBeUndefined();
    expect(typicalityInContext({ a: 40, b: -40, c: 40 }, cal, () => 1)?.beyond).toBe(true);
  });
});

describe('the floor: an author\'s own pieces told from each other', () => {
  const rand = mulberry32(3);
  const gauss = (): number => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  const draw = (n: number, shift: number): number[][] => Array.from({ length: n }, () => Array.from({ length: 4 }, () => gauss() + shift));
  it('is not run on fewer than twelve pieces', () => {
    expect(authorFloor(draw(11, 0))).toBeNull();
    expect(closeness(draw(8, 0), draw(8, 0)).floor).toBeNull();
  });
  it('one distribution split in halves gives the floor, and a separable output set sits above it', () => {
    const author = draw(24, 0);
    const f = authorFloor(author);
    expect(f).not.toBeNull();
    expect(f?.median).toBeGreaterThanOrEqual(0.5);
    expect(f?.median).toBeLessThan(0.75);
    expect(f?.p95).toBeGreaterThanOrEqual(f?.p90 ?? 1);
    expect(f?.size).toBe(12);
    const c = closeness(author, draw(24, 4));
    expect(c.c2st?.auc).toBeGreaterThan(f?.p95 ?? 1);
    // an AUC below chance counts as chance
    expect(floorOf([0.2, 0.4, 0.6], 6)).toMatchObject({ median: 0.5, p95: 0.6, splits: 3 });
  });
});

describe('the panel says what the request was read as', () => {
  const base: EvalSummary = {
    schema: 1, invocationId: 'i1', skill: 'blog', at: 't', release: 'r1', model: 'm', drafts: 2, costUsd: 0.1, durationMs: 1000,
    result: { conformant: true, reasons: [] },
    gates: { required: { held: 1, applicable: 1, broken: [] },
      claims: { state: 'checked', delivered: 0, unconfirmed: 0, cut: 0, listed: 0, instrument: null, measured: null, answers: false },
      copying: null, format: { kind: 'none', words: null, withheld: 0 }, applicability: { applied: 1, notApplicable: 0, waived: [] } },
    fidelity: { inBand: 7, measured: 9, baseline: null, pieces: 9, profile: 'abc', outside: [], facts: null, edits: { tried: 0, kept: 0 },
      typicality: { p: 0.1429, distance: 5.1, pieces: 6, weighted: true, beyond: true, farthest: 2.4 } },
    monitors: { detector: null, taste: null }, notMeasured: ['x'],
  };
  // A long line wraps at a " · ", which the wrap drops: read the panel with every separator as a space.
  const flat = (s: string): string => s.replace(/\n {23}/g, ' ').replace(/ · /g, ' ');
  it('a run with no context reads as before', () => {
    expect(renderPanel({ ...base, fidelity: null })).not.toMatch(/CONTEXT/);
  });
  it('the register, how it was read, the near pieces, how they were found, and what they were used for', () => {
    const p = flat(renderPanel({ ...base, context: {
      register: { status: 'out', request: 'white-paper', corpus: ['post'], source: 'reader', words: 'white paper' },
      subject: { source: 'reader', reader: `${SUBJECT_READER_VERSION}:claude-haiku-4-5`, fellBack: null, near: 2, of: 14, nEff: 1.8, thin: false,
        nearest: [{ id: 'the-outage.md', grade: 'same' }, { id: 'on-call.md', grade: 'related' }], usedFor: ['passages', 'typicality'] } } }));
    expect(p).toMatch(/CONTEXT {2}what this request was read as/);
    expect(p).toMatch(/register +white-paper \(the request says "white paper"\) your pieces: post out of register/);
    expect(p).toMatch(/subject +2 of your 14 pieces are near this request \(1\.8 effective\) read by subject \(claude-haiku-4-5\)/);
    expect(p).toMatch(/nearest +the-outage\.md \(same subject\) on-call\.md \(related subject\)/);
    expect(p).toMatch(/used for +the passages shown to the writer the typical-of-you reading/);
    expect(p).not.toMatch(/thin /);
  });
  it('a thin subject and a fallback to words are said', () => {
    const p = flat(renderPanel({ ...base, context: { register: null,
      subject: { source: 'lexical', reader: null, fellBack: 'the subject reader could not answer', near: 1, of: 14, nEff: 1, thin: true, nearest: [{ id: 'a.md', grade: null }], usedFor: [] } } }));
    expect(p).toMatch(/1 of your 14 pieces is near this request \(1 effective\) found by shared words the subject reader was not used: the subject reader could not answer/);
    expect(p).toMatch(/thin +only one of your pieces is near this subject/);
  });
  it('a text beyond every piece says so, with the pieces the reading rests on', () => {
    const p = flat(renderPanel(base));
    expect(p).toMatch(/typical of you +beyond every piece of yours: distance 5\.1, your farthest piece 2\.4 read against 6 of your pieces, so it moves in steps of 14% those nearest this request counted more/);
    const inside = flat(renderPanel({ ...base, fidelity: base.fidelity ? { ...base.fidelity, typicality: { p: 0.62, distance: 1.2, pieces: 14 } } : null }));
    expect(inside).toMatch(/as typical as 62% of your own pieces \(distance 1\.2\) read against 14 of your pieces$/m);
  });
});
