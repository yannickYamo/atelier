// tests/atelier-deep.test.ts — A DEEP RUN'S PARTS AT THEIR OWN SEAMS (cli/deep.ts, and the draft choice in invoke.ts).
//
// The bands and the plain model's habits are read once and kept with the skill, then served from what was kept; with no
// model nothing is kept and the bands are the library's priors, said as assumed. Rubric weights become shares of one. The
// kind falls back to a blog post, said. Of two drafts, the checks decide first and the reviewer only where they tie.
// Expected values are worked out by hand from the inputs.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalisedRubric, kindFor, readBandsAt, bandsFor, readRenditionAt, renditionFor, reviewNote, reviewEnrichment, REVIEW_PAGE_CHARS, DEFAULT_KIND } from '../cli/deep.js';
import { withDeepChoice, storySpans, STORY_SPANS } from '../cli/commands/invoke.js';
import { loadLibrary } from '../core/library/loader.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { VerifyReport } from '../core/observers/verify.js';
import { anInferenceResult } from './fixtures.js';

const budget = () => ({ spentUsd: 0, capUsd: 5 });
const layout = () => ({ root: mkdtempSync(join(tmpdir(), 'atelier-deep-unit-')), skillName: 'quay' });
/** A client that answers by tool, and counts its calls. */
const byTool = (answers: Record<string, unknown>): InferenceClient & { calls: InferenceRequest[] } => {
  const calls: InferenceRequest[] = [];
  return { calls, complete: async (req: InferenceRequest) => { calls.push(req); return anInferenceResult({ json: answers[req.toolName] ?? {} }); } };
};
const PIECE = (topic: string) => [
  `Why does the ${topic} matter to anyone who lives on the islands today? Most people never ask until the boat is late again.`,
  `The ${topic} changed in March, and the change was small on paper. One extra berth meant one extra sailing every single hour.`,
  `Shops on the quay noticed first, because their mornings filled up. The answer to the question is the hour itself, given back.`,
  `So the ${topic} is not about boats at all. It is about the hour a person gets back each day.`,
].join('\n\n');

describe('the rubric and the kind', () => {
  it('weights become shares of one, whichever scale a library wrote them on', () => {
    const r = (ws: number[]) => ({ kind: 'blog', criteria: ws.map((w, i) => ({ id: `c${i}`, weight: w, question: 'q' })), caps: [] });
    expect(normalisedRubric(r([30, 30, 20, 10, 10])).criteria.map((c) => c.weight)).toEqual([0.3, 0.3, 0.2, 0.1, 0.1]);
    expect(normalisedRubric(r([3, 3, 2, 1, 1])).criteria.map((c) => c.weight)).toEqual([0.3, 0.3, 0.2, 0.1, 0.1]);
  });
  it('a kind the library holds is used; one it does not is written as a blog post, and said', () => {
    const lib = loadLibrary({ packDir: '' });
    expect(kindFor(lib, undefined)).toEqual({ kind: DEFAULT_KIND });
    expect(kindFor(lib, 'blog')).toEqual({ kind: 'blog' });
    expect(kindFor(lib, 'zine')).toEqual({ kind: 'blog', note: 'the library holds nothing for "zine"; written as blog' });
  });
});

describe('the bands, read once and kept', () => {
  const LOOPS = { loops: [{ question: 'why it matters', openQuote: 'matter to anyone who lives on the islands', closeQuote: 'The answer to the question is the hour itself', kind: 'mystery' }], stakes: [], beats: [] };
  const NOVELTY = { novel: [{ quote: 'changed in March', kind: 'new' }, { quote: 'One extra berth meant one extra sailing', kind: 'new' }], claims: [] };
  it('three pieces read: the bands are the author\'s, kept, and served from what was kept with no model after', async () => {
    const L = layout(); const lib = loadLibrary({ packDir: '' });
    const client = byTool({ emit_loops: LOOPS, emit_novelty: NOVELTY });
    const golden = [PIECE('ferry'), PIECE('terminal'), PIECE('timetable')];
    const read = await readBandsAt(L, lib, 'blog', golden, { client, model: 'm' }, budget());
    expect(read.from).toBe('read now');
    // two reads each of loops and novelty, for each of three pieces
    expect(client.calls).toHaveLength(12);
    // every loop each piece opens, it closes (1, 1, 1): widened by a quarter of the largest value and held inside [0, 1]
    expect(read.story.closureRate).toMatchObject({ lo: 0.75, hi: 1, n: 3, source: 'user' });
    expect(existsSync(join(L.root, 'skills', 'quay', 'story-bands.json'))).toBe(true);
    const again = await bandsFor(L, lib, 'blog', golden, { client: null, model: null }, budget());
    expect(again.from).toBe('stored');
    expect(again.story.closureRate).toEqual(read.story.closureRate);
  });
  it('no model: the library\'s priors, said as assumed, and nothing kept', async () => {
    const L = layout(); const lib = loadLibrary({ packDir: '' });
    const b = await bandsFor(L, lib, 'blog', [PIECE('ferry')], { client: null, model: null }, budget());
    expect(b.from).toBe('assumed');
    expect(b.story.closureRate?.source).toBe('assumed');
    // the generic stretch with nothing new: about 150 words
    expect(b.novelty.hi).toBe(150);
    expect(existsSync(join(L.root, 'skills', 'quay', 'story-bands.json'))).toBe(false);
  });
});

describe('the plain model\'s habits, read once and kept', () => {
  it('read from the plain drafts and kept; the next run serves what was kept', async () => {
    const L = layout();
    const drafts = ['In conclusion, ferries matter. Have you ever wondered?', 'Have you ever thought about it? In conclusion, the hour is back.'];
    const client = byTool({ emit_habits: { habits: [{ part: 'CLOSING', habit: 'signposts its close', quotes: [{ draft: 1, quote: 'In conclusion' }, { draft: 2, quote: 'In conclusion' }] }] } });
    const prior = await readRenditionAt(L, 'blog', drafts, { client, model: 'm' }, budget());
    expect(prior?.habits.map((h) => h.habit)).toEqual(['signposts its close']);
    const r = await renditionFor(L, 'blog', { client: null, model: null }, budget());
    expect([r.from, r.prior?.habits.length]).toEqual(['stored', 1]);
  });
});

describe('the one more draft the reviewer asks for is told what it found, never its rubric', () => {
  it('main failure, what to keep, the first three fixes', () => {
    const note = reviewNote({ mainFailure: 'content', keep: 'the opening question', missingFacts: [],
      fixes: ['a', 'b', 'c', 'd'].map((x) => ({ quote: x, instruction: `fix ${x}`, criterion: null })) });
    expect(note).toContain('what it says does not hold up');
    expect(note).toContain('Keep: the opening question');
    expect(note).toContain('- fix c');
    expect(note).not.toContain('fix d');
  });
});

describe('of two drafts, the checks first and the reviewer where they tie', () => {
  const report = (broken: number): VerifyReport => ({ checked: Array.from({ length: broken }, (_, i) => ({ requirementId: `r${i}`, observer: 'LEXICON', materiality: 'REQUIRED', result: { verdict: 'VIOLATED', spans: [], value: null, detail: '' } })) } as unknown as VerifyReport);
  const kit = { rubric: { kind: 'blog', criteria: [{ id: 'one-idea', weight: 1, question: 'q' }], caps: [] }, cards: [] };
  const ranking = { choose: async (_drafts: readonly string[]) => ({ index: 0, why: 'the ranking' }) };
  const ctx = (check: (t: string) => VerifyReport, client: InferenceClient) => ({ kit, trace: {}, check, model: { client, model: 'm', budget: budget() }, request: 'r', material: 'm', enrichment: [], goldenExcerpts: [] });
  it('a draft that breaks fewer required rules wins as it always did: the reviewer is not asked', async () => {
    const client = byTool({});
    const c = ctx((t) => report(t === 'A' ? 1 : 0), client);
    const r = await withDeepChoice(ranking, c).choose(['A', 'B']);
    expect(r.why).toBe('the ranking');
    expect(client.calls).toHaveLength(0);
    expect(c.trace).toEqual({ choice: { winner: 'a', decidedBy: 'the checks', reasons: ['the ranking'] } });
  });
  it('where they tie, a draft the reviewer prefers in both orders wins', async () => {
    // the reviewer always prefers the draft that says "B", wherever it stands
    const client: InferenceClient = { complete: async (req) => anInferenceResult({ json: { better: req.userMessage.includes('<first_draft>\nB') ? 'first' : 'second', reasons: ['B says more'] } }) };
    const c = ctx(() => report(0), client);
    const r = await withDeepChoice(ranking, c).choose(['A', 'B']);
    expect(r.index).toBe(1);
    expect(c.trace).toMatchObject({ choice: { winner: 'b', decidedBy: 'the reviewer' } });
  });
});

describe('what the reviewer reads from the web pass', () => {
  const page = { url: 'https://example.com/study', title: 'A study', text: 'x'.repeat(6000), readAt: '2026-11-02' };
  const inv = (facts: { text: string; quote: string; source: 'material' | 'enriched' | 'sample'; sourceRef: string }[]) => ({ value: { facts }, by: 'model' as const, reader: 'inventory' });
  it('the facts listed from the web, with quote and URL, never the whole pages', () => {
    const out = reviewEnrichment({ enrichment: { docs: [page] } as never,
      inventory: inv([{ text: 'Odds fall after five minutes.', quote: 'odds fall', source: 'enriched', sourceRef: page.url }, { text: 'Ours: 11.4%.', quote: '11.4%', source: 'material', sourceRef: 'notes' }]) });
    expect(out).toEqual([`Odds fall after five minutes. (${page.url})\nquote: "odds fall"`]);
    expect(out.join('').length).toBeLessThan(200);
  });
  it('nothing listed from the web: the start of each page, capped', () => {
    const out = reviewEnrichment({ enrichment: { docs: [page] } as never, inventory: inv([]) });
    expect(out).toHaveLength(1);
    expect(out[0].length).toBeLessThanOrEqual(page.title.length + page.url.length + 4 + REVIEW_PAGE_CHARS);
  });
  it('no web pass: nothing', () => {
    expect(reviewEnrichment({ enrichment: null, inventory: inv([]) })).toEqual([]);
  });
});

describe('the story spans written again in place', () => {
  it('a target wider than the share of the piece is left out and counted (72% and 100% were cut off on the dev run)', () => {
    const r = storySpans(1000, [{ kind: 'dead-air', repair: 'r', span: { start: 0, end: 720 } }, { kind: 'and-then-run', repair: 'r', span: { start: 800, end: 900 } }]);
    expect(r.wide).toBe(1);
    expect(r.spans.map((x) => x.kind)).toEqual(['and-then-run']);
  });
  it('the first spans that do not overlap, at most the cap, in piece order', () => {
    const t = [500, 0, 100, 50, 300, 700].map((at, i) => ({ kind: `k${i}`, repair: 'r', span: { start: at, end: at + 80 } }));
    const r = storySpans(1000, t);
    expect(r.spans.map((x) => x.start)).toEqual([0, 100, 300].slice(0, STORY_SPANS));
    expect(r.wide).toBe(0);
  });
  it('a target with no span is never written', () => {
    expect(storySpans(1000, [{ kind: 'dead-air', repair: 'r', span: null }]).spans).toEqual([]);
  });
});
