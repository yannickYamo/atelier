// tests/atelier-outer-loop.test.ts — THE OUTER FIDELITY LOOP: ESTIMATE ACROSS OUTPUTS, RETRIEVE, DISTIL, RELEASE.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { estimate, describeEstimate, CUSUM_H, CUSUM_K, type FidelityObservation } from '../core/fidelity/estimator.js';
import { buildRetrievalIndex, retrieve, renderRetrieved, MIN_PASSAGE_WORDS } from '../core/fidelity/retrieval.js';
import { comparisonPairs, distillPrompt, parseNotes, noteProblem, distillNotes, renderNotes, MIN_IN_BAND_GAP, MAX_NOTES, type ExperienceSource } from '../core/fidelity/experience.js';
import { makeRelease, assertSameStandard, nextSettings, MIN_SAMPLES, StandardMoved, type ReleaseOutcome } from '../core/fidelity/release.js';
import * as fstore from '../core/state/fidelity-store.js';
// The release fixtures were written with the full-loop settings; their pinned ids depend on them.
import { LOOP_SETTINGS as DEFAULT_SETTINGS, type FeatureBand, type FidelityReading, type FidelityProfile, type ImplementationSettings } from '../core/fidelity/types.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import { anInferenceResult } from './fixtures.js';

// ── estimator ─────────────────────────────────────────────────────────────────────────────────

const band: FeatureBand = { id: 'para.words', cls: 'all', band: [40, 80], median: 60, spread: 10, n: 20, role: 'SIGNAL', auc: 0.8 };
/** A deterministic stand-in for noise: residuals in [-1, 1] that average zero. */
const noise = (i: number): number => Math.sin(i * 2.399) * 10;
const obs = (values: number[], binding = 'b1', start = 0): FidelityObservation[] =>
  values.map((x, i) => ({ at: new Date(Date.UTC(2026, 0, 1, 0, start + i)).toISOString(), binding, cls: 'medium', values: { 'para.words': x } }));

describe('the estimator', () => {
  it('raises no alarm on noise inside the author\'s band, and reads the author\'s own spread as about one', () => {
    const [row] = estimate(obs(Array.from({ length: 60 }, (_, i) => 60 + noise(i))), [band]);
    expect(row.alarm).toBeNull();
    expect(row.collapsed).toBe(false);
    expect(row.spreadRatio).toBeGreaterThan(0.5);
    expect(row.bandsFrom).toBe('all');
    expect(describeEstimate([row]).join(' ')).toMatch(/none drifting/);
  });

  it('alarms HIGH on a sustained upward shift once enough outputs show it, never on one outlier', () => {
    const shifted = [...Array.from({ length: 10 }, (_, i) => 60 + noise(i)), ...Array.from({ length: 12 }, (_, i) => 75 + noise(i + 10) / 5)];
    const rows = (n: number) => estimate(obs(shifted.slice(0, n)), [band])[0];
    expect(rows(11).alarm).toBeNull();                       // one shifted output is not drift
    expect(rows(22).alarm).toBe('HIGH');
    expect(rows(22).bias).toBeGreaterThan(0.5);
    // A single wild output, ten spreads out, among in-band ones: the clip keeps it under h.
    const one = estimate(obs([60, 61, 59, 160, 60, 60, 61]), [band])[0];
    expect(one.alarm).toBeNull();
    expect(one.cusumHigh).toBeLessThanOrEqual(CUSUM_H);
    expect(CUSUM_K).toBe(0.5);
    // And downward is LOW.
    expect(estimate(obs(Array.from({ length: 12 }, () => 40)), [band])[0].alarm).toBe('LOW');
    expect(describeEstimate([rows(22)]).join(' ')).toMatch(/above the author/);
  });

  it('reads a series sitting at the median as collapsed, but only after enough outputs', () => {
    const at = (n: number) => estimate(obs(Array.from({ length: n }, (_, i) => 60 + (i % 2 ? 0.2 : -0.2))), [band])[0];
    expect(at(9).collapsed).toBe(false);
    expect(at(12).collapsed).toBe(true);
    expect(at(12).alarm).toBeNull();
    const lines = describeEstimate([at(12)]);
    expect(lines.join(' ')).toMatch(/typical value/);
    expect(lines.join(' ')).not.toMatch(/[—–]/);
  });

  it('starts a new series for a new binding: a model update is a step, not drift', () => {
    const series = [...obs(Array.from({ length: 15 }, () => 80)), ...obs([60, 61, 59], 'b2', 100)];
    const rows = estimate(series, [band]);
    expect(rows.map((r) => r.binding)).toEqual(['b1', 'b2']);
    expect(rows[0].alarm).toBe('HIGH');
    expect(rows[1].alarm).toBeNull();
    expect(rows[1].n).toBe(3);
  });

  it('reads against the class band when there is one, and skips nulls and unknown features', () => {
    const medium: FeatureBand = { ...band, cls: 'medium', median: 100, band: [90, 110] };
    const rows = estimate([{ at: '2026-01-01T00:00:00Z', binding: 'b', cls: 'medium', values: { 'para.words': 100, other: 3, gone: null } }], [band, medium]);
    expect(rows).toHaveLength(1);
    expect(rows[0].bandsFrom).toBe('medium');
    expect(rows[0].inBandShare).toBe(1);
  });
});

// ── retrieval ─────────────────────────────────────────────────────────────────────────────────

const para = (topic: string, filler: string): string =>
  `${topic} ${Array.from({ length: 6 }, () => filler).join(' ')}`;
const PIECES = [
  { id: 'gardens', text: `# Gardens\n\n${para('Tomatoes in the greenhouse need water every morning and the soil stays warm.', 'The vines climb the trellis slowly while the gardener checks the leaves.')}\n\nToo short to count.` },
  { id: 'trains', text: para('The night train left the station late and the conductor apologised twice.', 'Passengers watched the dark fields roll past the carriage windows quietly.') },
  { id: 'bread', text: `${para('Sourdough bread wants a slow rise and a hot oven.', 'The baker folds the dough each hour and lets the starter bubble.')}\n\n- a list item about tomatoes greenhouse water soil that is not prose and will not be indexed by the builder at all here today` },
];

describe('retrieval', () => {
  it('indexes prose paragraphs of at least the minimum length only', () => {
    const index = buildRetrievalIndex(PIECES);
    expect(index.passages.map((p) => p.piece)).toEqual(['gardens', 'trains', 'bread']);
    expect(MIN_PASSAGE_WORDS).toBe(40);
  });

  it('ranks the relevant passage first, deterministically, with a stable hash', () => {
    const a = buildRetrievalIndex(PIECES); const b = buildRetrievalIndex(PIECES);
    expect(a.hash).toBe(b.hash);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(retrieve(a, 'how should I water tomatoes in a greenhouse', 2)[0]).toBe(0);
    expect(retrieve(a, 'a delayed train at night', 1)).toEqual([1]);
    expect(retrieve(a, 'a delayed train at night', 3)).toEqual(retrieve(a, 'a delayed train at night', 3));
    expect(retrieve(a, 'quantum chromodynamics', 3)).toEqual([]);
    expect(retrieve(a, 'tomatoes', 0)).toEqual([]);
    expect(buildRetrievalIndex([...PIECES].reverse()).hash).not.toBe(a.hash);
  });

  it('breaks ties toward the earlier passage', () => {
    const twin = { id: 't', text: para('Identical words make identical scores for the ranking function.', 'Repeated filler sentence keeps the paragraph long enough to be indexed.') };
    const index = buildRetrievalIndex([twin, { ...twin, id: 'u' }]);
    expect(retrieve(index, 'identical ranking scores', 2)).toEqual([0, 1]);
  });

  it('renders a fenced block that says the passages are for voice, never to copy', () => {
    const index = buildRetrievalIndex(PIECES);
    const block = renderRetrieved(index, [1]);
    expect(block).toMatch(/closest to this request/i);
    expect(block).toMatch(/never to copy/);
    expect(block).toContain('```');
    expect(block).toContain('night train');
    expect(renderRetrieved(index, [])).toBe('');
    expect(renderRetrieved(index, [99])).toBe('');
  });
});

// ── experience ────────────────────────────────────────────────────────────────────────────────

const reading = (inBand: number, outside: string[] = []): FidelityReading => ({ cls: 'medium', bandsFrom: 'all', values: {}, inBand, measured: 8,
  outside: outside.map((id) => ({ id, distance: 1, direction: 'high' as const })), detector: null });
const record = (id: string, inBands: number[], outsides: string[][] = [], chosen = 0): ExperienceSource => ({
  invocationId: id, input: `request ${id}`, output: `draft ${chosen} of ${id}`,
  selection: { chosen, unchosen: inBands.map((_, i) => `draft ${i} of ${id}`).filter((_, i) => i !== chosen) },
  fidelity: { release: null, profileHash: null, seed: 1, reading: null, drafts: inBands.map((n, i) => reading(n, outsides[i] ?? [])) },
});

describe('experience notes', () => {
  it('pairs a winner with drafts at least two bands behind it on the same request, and no closer', () => {
    const pairs = comparisonPairs([record('r1', [7, 6, 4], [[], ['para.words'], ['para.words', 'sent.sd']], 1), record('r2', [5, 4]), { invocationId: 'r3', input: '', output: '' }]);
    expect(MIN_IN_BAND_GAP).toBe(2);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].winner.index).toBe(0);
    expect(pairs[0].winner.text).toBe('draft 0 of r1');
    expect(pairs[0].loser.text).toBe('draft 2 of r1');
    expect(pairs[0].gap).toBe(3);
    expect(pairs[0].features).toEqual(['para.words', 'sent.sd']);
    expect(distillPrompt(pairs, 4)).toContain('<winner>\ndraft 0 of r1');
  });

  it('a note is a measured feature, an operation from a closed list, and how; anything else is refused', () => {
    expect(noteProblem('paragraphP50: broke the argument into short paragraphs, each on one detail from the material')).toBeNull();
    expect(noteProblem('Open with a question.')).toMatch(/not of the form/);          // a new rule, never ratified
    expect(noteProblem('sentenceP10: Start every paragraph short')).toMatch(/not of the form|operation/);
    expect(noteProblem('sentenceP10: wrote varied sentences')).toMatch(/not one of the operations/);
    expect(noteProblem('madeUp: split long sentences')).toMatch(/not a measured feature/);
    expect(noteProblem('paragraphP50: used three short paragraphs of 3 lines')).toMatch(/digit/);
    expect(noteProblem('paragraphP50: used the quote from Smith early')).toMatch(/names/);
    expect(noteProblem('sentenceCv: shortened sentences, always after a long one')).toMatch(/rule/);
    expect(noteProblem(`sentenceCv: split ${Array.from({ length: 33 }, () => 'word').join(' ')}`)).toMatch(/words/);
    const pairs = comparisonPairs([record('r1', [7, 4], [[], ['para.words']])]);
    const notes = parseNotes({ notes: [
      { text: 'sentenceP90: lengthened one sentence after two short ones', features: ['para.words', 'invented'] },
      { text: 'sentenceP90: lengthened one sentence after two short ones' },
      'paragraphP50: shortened paragraphs where the material was thin',
      { text: 'Use two examples.' }, { text: 'colon: used Jones as the example' }, { text: 'Never hedge.' }, 7, null,
    ] }, pairs);
    expect(notes.map((n) => n.text)).toEqual(['sentenceP90: lengthened one sentence after two short ones', 'paragraphP50: shortened paragraphs where the material was thin']);
    expect(notes[0].features).toEqual(['para.words']);
    expect(notes[0].evidence).toEqual({ pairs: 1, gain: 3 });
    expect(notes[0].cls).toBe('medium');
    const many = parseNotes({ notes: Array.from({ length: 12 }, (_, i) => `paragraphP50: broke paragraphs in way ${'abcdefghijkl'[i]}`) }, pairs);
    expect(many).toHaveLength(MAX_NOTES);
    expect(parseNotes('garbage', pairs)).toEqual([]);
  });

  it('distils with one call at temperature 0, and none when there is nothing to compare', async () => {
    const seen: InferenceRequest[] = [];
    const client: InferenceClient = { complete: (req) => { seen.push(req); return Promise.resolve(anInferenceResult({ json: { notes: [
      { text: 'sentenceP10: joined the shortest sentences to the one before them' }, { text: 'Winners cited four sources.' }] } })); } };
    const budget = { spentUsd: 0, capUsd: 1, maxCalls: 5 };
    const pairs = comparisonPairs([record('r1', [7, 4]), record('r2', [8, 5, 2])]);
    const notes = await distillNotes(client, budget, pairs);
    expect(seen).toHaveLength(1);
    expect(seen[0].temperature).toBe(0);
    expect(seen[0].userMessage).toContain('<loser>');
    expect(notes.map((n) => n.text)).toEqual(['sentenceP10: joined the shortest sentences to the one before them']);
    expect(await distillNotes(client, budget, [])).toEqual([]);
    expect(seen).toHaveLength(1);
    const block = renderNotes(notes);
    expect(block).toMatch(/^IMPLEMENTATION NOTES/);
    expect(block).toMatch(/not rules/);
    expect(block).not.toContain('draft 0 of r1');            // drafts are never served, only notes
    expect(renderNotes([])).toBe('');
  });
});

// ── release ───────────────────────────────────────────────────────────────────────────────────

const input = (settings: ImplementationSettings = DEFAULT_SETTINGS, why = 'first') => ({ parent: null, standardVersionHash: 'std1', skillVersionHash: 'sk1',
  settings, notes: [], profileHash: 'p1', retrievalHash: 'r1', createdAt: '2026-10-01T00:00:00Z', why });
const outcome = (releaseId: string, settings: ImplementationSettings, n: number, inBand: number, invented: number, cost = 0.1): ReleaseOutcome =>
  ({ releaseId, settings, n, meanInBandShare: inBand, inventedPerOutput: invented, costPerOutput: cost });

describe('releases', () => {
  it('names a release by its content: stable, blind to createdAt and why, moved by settings', () => {
    const a = makeRelease(input());
    expect(makeRelease(input(DEFAULT_SETTINGS, 'another reason')).id).toBe(a.id);
    expect(makeRelease({ ...input(), createdAt: '2027-01-01T00:00:00Z' }).id).toBe(a.id);
    expect(makeRelease(input({ ...DEFAULT_SETTINGS, drafts: 6 })).id).not.toBe(a.id);
    expect(makeRelease(input({ notesCap: 6, retrievalK: 3, editBudget: 2, drafts: 4 })).id).toBe(a.id);   // key order does not matter
  });

  it('refuses to serve a release under a standard it was not made under', () => {
    const r = makeRelease(input());
    expect(() => { assertSameStandard(r, 'std1'); }).not.toThrow();
    expect(() => { assertSameStandard(r, 'std2'); }).toThrow(StandardMoved);
  });

  it('proposes a neighbour of the best measured settings, and refuses a move that raised invented claims', () => {
    const base: ImplementationSettings = { drafts: 4, editBudget: 1, retrievalK: 3, notesCap: 0 };
    const first = nextSettings(base, []);
    expect(first?.settings).toEqual({ ...base, drafts: 2 });
    expect(first?.basedOn).toBeNull();
    // drafts 2 measured and worse on invention; drafts 6 measured and raised invention over base.
    const history = [outcome('A', base, MIN_SAMPLES, 0.6, 0.1), outcome('B', { ...base, drafts: 2 }, MIN_SAMPLES, 0.5, 0.1),
      outcome('C', { ...base, drafts: 6 }, 5, 0.9, 0.4)];
    const next = nextSettings(base, history);
    expect(next?.basedOn).toBe('A');
    expect(next?.settings).toEqual({ ...base, editBudget: 0 });       // drafts 6 refused: it raised invented claims
    // The best is the one with fewer invented claims even at a lower in-band share.
    const pick = nextSettings(base, [outcome('A', base, 30, 0.9, 0.3), outcome('D', { ...base, notesCap: 6 }, 30, 0.5, 0.0)]);
    expect(pick?.basedOn).toBe('D');
  });

  it('returns null when every allowed neighbour has its samples', () => {
    const s: ImplementationSettings = { drafts: 2, editBudget: 0, retrievalK: 0, notesCap: 0 };
    const all = [outcome('A', s, 25, 0.8, 0), outcome('B', { ...s, drafts: 4 }, 25, 0.7, 0), outcome('C', { ...s, editBudget: 1 }, 25, 0.7, 0),
      outcome('D', { ...s, retrievalK: 3 }, 25, 0.7, 0), outcome('E', { ...s, notesCap: 6 }, 25, 0.7, 0)];
    expect(nextSettings(s, all)).toBeNull();
    expect(nextSettings(s, all.slice(0, 4))?.settings).toEqual({ ...s, notesCap: 6 });
  });
});

// ── store ─────────────────────────────────────────────────────────────────────────────────────

describe('the fidelity store', () => {
  it('round-trips the profile, the index and releases; activation follows the parent chain and rolls back', () => {
    const l = { root: mkdtempSync(join(tmpdir(), 'atelier-outer-')), skillName: 'essays' };
    expect(fstore.getProfile(l)).toBeNull();
    expect(fstore.getActiveRelease(l)).toBeNull();
    const profile: FidelityProfile = { version: 1, corpusHash: 'c', bands: [band], detector: null, hash: 'h' };
    fstore.setProfile(l, profile);
    expect(fstore.getProfile(l)).toEqual(profile);
    const index = buildRetrievalIndex(PIECES);
    fstore.setRetrievalIndex(l, index);
    expect(fstore.getRetrievalIndex(l)).toEqual(index);

    const root = makeRelease(input());
    const child = makeRelease({ ...input({ ...DEFAULT_SETTINGS, drafts: 6 }, 'more drafts'), parent: root.id, createdAt: '2026-10-02T00:00:00Z' });
    expect(() => fstore.putRelease(l, child)).toThrow(/parent/);
    fstore.putRelease(l, root);
    fstore.putRelease(l, child);
    expect(fstore.putRelease(l, { ...root, why: 'restated' }).why).toBe('first');        // first write kept
    expect(() => fstore.putRelease(l, { ...root, settings: { ...DEFAULT_SETTINGS, drafts: 2 } })).toThrow(/hashes to/);
    expect(fstore.listReleases(l).map((r) => r.id)).toEqual([root.id, child.id]);
    expect(fstore.getRelease(l, child.id)).toEqual(child);

    expect(() => { fstore.setActiveRelease(l, 'abcdef'); }).toThrow(/not stored/);
    fstore.setActiveRelease(l, child.id);
    const active = fstore.getActiveRelease(l);
    expect(active?.release.id).toBe(child.id);
    expect(active?.chain.map((r) => r.id)).toEqual([child.id, root.id]);
    expect(fstore.rollbackRelease(l)?.id).toBe(root.id);
    expect(fstore.getActiveRelease(l)?.release.id).toBe(root.id);
    expect(fstore.rollbackRelease(l)).toBeNull();
    expect(fstore.listReleases(l)).toHaveLength(2);                                      // rollback deletes nothing
  });
});
