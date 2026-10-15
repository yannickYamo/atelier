// tests/atelier-composite-inferred.test.ts — SEVERAL VOICES, COMBINED BY INFERENCE: FOUND, WEIGHED, SETTLED, NEVER ASKED.
//
// The grouping is checked on writing whose voices are known (tests/fixtures/composite/five-voices.ts) and on a real
// folder of one writer (examples/blog/posts). The weights are checked against values worked out by hand from the
// formula in core/composite/infer.ts, not read off the code: consistency × distinctiveness × preference.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Measurement, Requirement } from '../core/state/canonical-state.js';
import { groupByStyle, authorship, voicesAsAuthors, describeVoices, MIN_SILHOUETTE, MIN_VOICE_GAP } from '../core/composite/voices.js';
import { buildTraitTable } from '../core/composite/traits.js';
import { weighTraits, inferredChoice, inferenceRecord, buildLine, likingIn, type WeighMeta } from '../core/composite/infer.js';
import { composeSelection, instructs, settleByWeight, type CompositeAuthor } from '../core/composite/selection.js';
import { decisionsFor, requestLength } from '../cli/commands/composite.js';
import type { AuthorMap } from '../core/composite/authors.js';
import type { Suggestion } from '../core/ratification/suggest.js';
import { FIVE_VOICES, FIVE_GROUPS, ONE_VOICE } from './fixtures/composite/five-voices.js';

const pieces = (o: Readonly<Record<string, string>>): { id: string; text: string }[] => Object.entries(o).map(([id, text]) => ({ id, text }));

describe('the voices are found in the writing', () => {
  it('five writers, two pieces each, no front matter: five voices, with the confidence the cut reached', () => {
    const g = groupByStyle(pieces(FIVE_VOICES));
    expect(g.groups.map((x) => [...x.pieces])).toEqual(FIVE_GROUPS.map((x) => [...x]));
    expect(g.groups.map((x) => x.name)).toEqual(['voice 1', 'voice 2', 'voice 3', 'voice 4', 'voice 5']);
    expect(g.silhouette).not.toBeNull();
    expect(g.confidence).toBe(g.silhouette);
    expect(g.confidence).toBeGreaterThanOrEqual(MIN_SILHOUETTE);
    // the number chosen is the cut with the best silhouette among those tried
    expect(Math.max(...g.tried.filter((t) => t.valid).map((t) => t.silhouette))).toBe(g.silhouette);
    expect(describeVoices(g, 10)).toMatch(/^5 voices found in 10 pieces, by how they are written \(confidence 0\.\d\d\)/);
  });
  it('the order the folder is listed in changes nothing', () => {
    const forward = groupByStyle(pieces(FIVE_VOICES));
    const backward = groupByStyle(pieces(FIVE_VOICES).reverse());
    expect(backward).toEqual(forward);
  });
  it('a folder of one voice, six pieces on six topics, is one voice', () => {
    const g = groupByStyle(pieces(ONE_VOICE));
    expect(g.groups).toHaveLength(1);
    expect(g.groups[0].pieces).toHaveLength(6);
    expect(voicesAsAuthors(g)).toBeNull();
  });
  it('a real folder of one writer\'s posts is one voice', () => {
    const dir = 'examples/blog/posts';
    const g = groupByStyle(readdirSync(dir).map((f) => ({ id: f, text: readFileSync(join(dir, f), 'utf8') })));
    expect(g.groups).toHaveLength(1);
    expect(g.confidence).toBeGreaterThan(0.5);
  });
  it('fewer than four pieces are one voice, and one odd piece is not a voice of its own', () => {
    expect(groupByStyle(pieces(FIVE_VOICES).slice(0, 3)).groups).toHaveLength(1);
    // four of one voice and one of another: the odd one cannot be a voice of one piece
    const odd = { ...ONE_VOICE, 'z-sprint.md': FIVE_VOICES['c-sprint.md'] };
    expect(groupByStyle(pieces(odd)).groups).toHaveLength(1);
  });
  it('pieces that differ in one measure alone split cleanly and are still one voice: the voices must sit apart', () => {
    // twenty pieces of ten-word sentences and four of sixteen: a silhouette near 1, and almost no distance between them
    const even = (n: number): string => Array.from({ length: 10 }, () => Array.from({ length: 3 }, () => `${Array.from({ length: n - 1 }, () => 'stone').join(' ')} end.`).join(' ')).join('\n\n');
    const g = groupByStyle(Array.from({ length: 24 }, (_, i) => ({ id: `p${String(i).padStart(2, '0')}.md`, text: even(i < 20 ? 10 : 16) })));
    expect(g.tried.find((t) => t.k === 2)?.silhouette).toBeGreaterThan(MIN_SILHOUETTE);
    expect(g.tried.find((t) => t.k === 2)?.gap).toBeLessThan(MIN_VOICE_GAP);
    expect(g.groups).toHaveLength(1);
  });
  it('a declared author always wins, even one: the writing is then not grouped', () => {
    const one = pieces(FIVE_VOICES).map((p) => ({ ...p, text: `---\nauthor: Ada\n---\n${p.text}` }));
    expect(authorship(one)).toEqual({ authors: null, voices: null });
    const two = pieces(FIVE_VOICES).map((p, i) => ({ ...p, text: `---\nauthor: ${i % 2 ? 'Bea' : 'Ada'}\n---\n${p.text}` }));
    expect(authorship(two).authors).toMatchObject({ how: 'FRONT_MATTER', names: ['Ada', 'Bea'] });
    expect(authorship(pieces(FIVE_VOICES)).authors).toMatchObject({ how: 'INFERRED', names: ['voice 1', 'voice 2', 'voice 3', 'voice 4', 'voice 5'] });
  });
});

// ── THE WEIGHTS ──────────────────────────────────────────────────────────────────────────────────
const rule = (id: string, statement: string, measurement: Measurement | null = null, kind: Requirement['kind'] = 'GENERATIVE'): Requirement => ({
  requirementId: id, statement, appliesWhen: 'GENERAL', kind, authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null,
  ...(measurement ? { measurement } : {}),
});
const AUTHORS: AuthorMap = { names: ['voice 1', 'voice 2', 'voice 3'], how: 'INFERRED',
  of: { 'a1.md': 'voice 1', 'a2.md': 'voice 1', 'a3.md': 'voice 1', 'b1.md': 'voice 2', 'b2.md': 'voice 2', 'c1.md': 'voice 3', 'c2.md': 'voice 3' } };
// voice 1 opens on questions and is casual; voice 2 is formal; every voice keeps its hedging low (method)
const PROPS: readonly (readonly [string, Requirement, WeighMeta])[] = [
  ['voice 1', rule('p1', 'Open with a question the reader is already asking.'), { framings: ['A', 'B'], heldOut: { applicable: 4, present: 3 } }],
  ['voice 1', rule('p2', 'Use contractions throughout, in a casual register.'), { framings: ['A'] }],
  ['voice 1', rule('m1', 'Hedge at most 3 times per 1000 words.', { observer: 'HEDGE_RATE', params: { maxPer1000: 3 } }), { corpus: { pieces: 3, breaking: [] } }],
  ['voice 2', rule('p3', 'Never use contractions; keep a formal register.', null, 'BOUNDARY'), { framings: ['A', 'B', 'C'] }],
  ['voice 2', rule('m2', 'Hedge at most 3 times per 1000 words.', { observer: 'HEDGE_RATE', params: { maxPer1000: 3 } }), { corpus: { pieces: 2, breaking: [] } }],
  ['voice 2', rule('p4', 'Make the reader feel the stakes before the facts.'), { framings: ['C'] }],
  ['voice 3', rule('m3', 'Hedge at most 3 times per 1000 words.', { observer: 'HEDGE_RATE', params: { maxPer1000: 3 } }), { corpus: { pieces: 2, breaking: [1] }, vsDrafts: { drafts: 4, breaking: 1 } }],
  ['voice 3', rule('m4', 'Half the sentences run 8 words or fewer.', { observer: 'SENTENCE_LENGTH', params: { medianMax: 8, p90Max: 14 } }), { corpus: { pieces: 2, breaking: [] }, vsDrafts: { drafts: 4, breaking: 3 } }],
];
const props = PROPS.map(([, p]) => p);
const meta = new Map(PROPS.map(([a, p, m]) => [p.requirementId, { ...m, source: a }]));
const table = buildTraitTable(props, (id) => meta.get(id)?.source);
const weigh = (liked: Record<string, ('opening' | 'voice' | 'effect' | 'pace')[]> = {}) => weighTraits(table, props, (id) => meta.get(id), AUTHORS, liked);
const by = (ws: ReturnType<typeof weigh>, id: string) => ws.find((w) => w.id === id);

describe('each rule is weighed: consistency × distinctiveness × preference', () => {
  const ws = weigh();
  it('consistency: unseen pieces showing it; pieces inside a band; else one pass, by how many vantages reached it', () => {
    expect(by(ws, 'p1')?.consistency).toBe(0.75);                // 3 of 4 unseen pieces
    expect(by(ws, 'p2')?.consistency).toBe(0.4);                 // one pass, one vantage
    expect(by(ws, 'p3')?.consistency).toBe(0.8);                 // one pass, three vantages (capped at 0.8)
    expect(by(ws, 'm3')?.consistency).toBe(0.5);                 // 1 of 2 pieces in the band
  });
  it('distinctiveness: unlike the other voices, and (for a count) unlike plain drafts', () => {
    expect(by(ws, 'p1')?.distinctiveness).toBe(1);               // no other voice opens on questions
    expect(by(ws, 'm4')?.distinctiveness).toBe(0.875);           // (1 + 3/4) / 2
    expect(by(ws, 'p1')?.weight).toBe(0.75);
    expect(by(ws, 'm4')?.weight).toBe(0.875);
  });
  it('what every voice shows is method: no voice\'s own, so weight 0, and taken as method', () => {
    for (const id of ['m1', 'm2', 'm3']) expect(by(ws, id)).toMatchObject({ sharedBy: 3, method: true, chosen: true, distinctiveness: id === 'm3' ? 0.125 : 0 });
  });
  it('taken: at least 0.6 of the voice\'s highest and at least 0.25; the rest a habit', () => {
    expect(by(ws, 'p1')?.chosen).toBe(true);
    expect(by(ws, 'p2')?.chosen).toBe(false);                    // 0.4 < 0.6 × 0.75
    expect(by(ws, 'p3')?.chosen).toBe(true);
    expect(by(ws, 'p4')).toMatchObject({ weight: 0.4, chosen: false, effectReading: true });   // 0.4 < 0.6 × 0.8
  });
  it('a stated liking multiplies the rules it names by 1.5, and moves nothing else', () => {
    const liked = weigh({ 'voice 2': ['effect'] });
    expect(by(liked, 'p4')).toMatchObject({ preference: 1.5, weight: 0.6, chosen: true });   // 0.4 × 1.5, and now ≥ 0.6 × 0.8
    for (const w of ws.filter((x) => x.id !== 'p4')) expect(by(liked, w.id)?.weight).toBe(w.weight);
  });
  it('a sentence of liking is found in a request, or nothing is', () => {
    expect(likingIn('A column. I love the openings and the imagery.')).toBe('I love the openings and the imagery.');
    expect(likingIn('a column for the team newsletter')).toBeNull();
    expect(requestLength('a post of about 300 words')).toBe('240 to 360 words in the piece');
    expect(requestLength('a post')).toBeNull();
  });
});

describe('clashes are settled by inference, one side always, with the reason', () => {
  const ws = weigh();
  const inf = inferredChoice(ws, AUTHORS);
  const authors: CompositeAuthor[] = AUTHORS.names.map((n) => ({ name: n, pieces: Object.keys(AUTHORS.of).filter((k) => AUTHORS.of[k] === n), admired: null, classes: [] }));
  const c = composeSelection(table, props, authors, {}, { inferred: inf });
  const d = (id: string) => c.decisions.find((x) => x.id === id);
  it('the more characteristic side stands, and the other is set aside, never both', () => {
    expect(table.conflicts).toHaveLength(1);
    expect(c.conflicts[0]).toMatchObject({ answer: 'B', resolvedBy: 'INFERENCE', settledWhy: "voice 2's was more characteristic (weight 0.80 against 0.40)" });
    expect(d('p3')).toMatchObject({ outcome: 'SELECTED', inferred: true });
    expect(d('p2')?.outcome).toBe('REJECTED');
    expect(instructs(d('p2'))).toBe(false);
    expect(c.decisions.some((x) => x.outcome === 'OPEN')).toBe(false);
  });
  it('a tie goes to the rule more voices show, then to the voice with more pieces, then to the side listed first', () => {
    const tie = { ...inf, weightOf: new Map([['x', 0.5], ['y', 0.5]]), sharedBy: new Map([['x', 1], ['y', 2]]), piecesOf: new Map([['voice 1', 3], ['voice 2', 2]]) };
    expect(settleByWeight(tie, { id: 'x', author: 'voice 1' }, { id: 'y', author: 'voice 2' })).toEqual({ winner: 'B', why: "equally characteristic (weight 0.50); voice 2's is shown by more voices (2 against 1)" });
    const tie2 = { ...tie, sharedBy: new Map([['x', 1], ['y', 1]]) };
    expect(settleByWeight(tie2, { id: 'x', author: 'voice 1' }, { id: 'y', author: 'voice 2' }).winner).toBe('A');
    expect(settleByWeight(tie2, { id: 'x', author: 'voice 1' }, { id: 'y', author: 'voice 2' }).why).toMatch(/voice 1 has more pieces \(3 against 2\)/);
    const tie3 = { ...tie2, piecesOf: new Map([['voice 1', 2], ['voice 2', 2]]) };
    expect(settleByWeight(tie3, { id: 'x', author: 'voice 1' }, { id: 'y', author: 'voice 2' }).winner).toBe('A');
  });
  it('a pair the model reads as impossible to follow together is settled the same way, never left open', () => {
    const withPair = composeSelection(table, props, authors, {}, { inferred: inf, modelPairs: [{ a: 'p1', b: 'm4', reason: 'a question cannot open a fragment' }] });
    const pair = withPair.conflicts.find((x) => x.provenance);
    expect(pair).toMatchObject({ resolvedBy: 'INFERENCE', answer: 'B' });   // m4 0.875 against p1 0.75
    expect(instructs(withPair.decisions.find((x) => x.id === 'm4'))).toBe(true);
    expect(instructs(withPair.decisions.find((x) => x.id === 'p1'))).toBe(false);
  });
  it('what the person did say outranks inference: an answer to the clash', () => {
    const answered = composeSelection(table, props, authors, { 1: 'A' }, { inferred: inf });
    expect(answered.decisions.find((x) => x.id === 'p2')?.outcome).toBe('SELECTED');
    expect(answered.decisions.find((x) => x.id === 'p3')?.outcome).toBe('REJECTED');
  });
  it('the shared rules are the method', () => {
    expect(c.methodology?.steps.map((s) => s.id).sort()).toEqual(['m1', 'm2', 'm3']);
    for (const id of ['m1', 'm2', 'm3']) expect(d(id)).toMatchObject({ outcome: 'SELECTED', inferred: true, why: 'shown by every voice: applied as method' });
  });
  it('the rulings say they were inferred: a worded rule instructs, a counted one steers', () => {
    const sugg = new Map<string, Suggestion>(props.map((p) => [p.requirementId, { decision: 'APPROVE', materiality: 'PREFERRED', needs: null, why: 'seen', strength: 1 }]));
    const list = decisionsFor(c, props, sugg, new Map());
    expect(list.find((x) => x.id === 'p3')).toMatchObject({ decision: 'APPROVE', materiality: 'REQUIRED' });
    expect(list.find((x) => x.id === 'p3')?.suggested?.why).toMatch(/^inferred from voice 2 \(b1\.md, b2\.md\): conflict 1/);
    expect(list.find((x) => x.id === 'm4')).toMatchObject({ decision: 'APPROVE', materiality: 'PREFERRED' });
    expect(list.find((x) => x.id === 'p2')).toMatchObject({ decision: 'REJECT' });
    expect(list.find((x) => x.id === 'p4')).toMatchObject({ decision: 'APPROVE', materiality: 'PREFERRED' });   // a habit: shown, not instructed
  });
  it('one line says it all, and the record holds the rest', () => {
    const rec = inferenceRecord(c, AUTHORS, null, ws, null, null);
    expect(buildLine(c, AUTHORS, ws)).toBe('Combined 3 voices: openings from the first, tone and word choice from the second, pace from the third; what every one of them does kept as method; 1 clash settled by which was more characteristic. Say `atelier fix` to change any of it.');
    expect(rec.settled).toEqual([{ n: 1, label: 'contractions', stands: [{ id: 'p3', voice: 'voice 2' }], aside: [{ id: 'p2', voice: 'voice 1' }], by: 'INFERENCE', why: "voice 2's was more characteristic (weight 0.80 against 0.40)" }]);
    expect(rec.effectReadings).toEqual(['p4']);
  });
  it('a length the request names: no voice\'s length is taken', () => {
    const lengths = [rule('q1', 'Keep the piece to about 300 words.'), rule('q2', 'Let the piece run to 2,000 words.')];
    const src = (id: string): string => (id === 'q1' ? 'voice 1' : 'voice 2');
    const t = buildTraitTable(lengths, src);
    const two: AuthorMap = { names: ['voice 1', 'voice 2'], how: 'INFERRED', of: { 'a.md': 'voice 1', 'b.md': 'voice 2' } };
    const w = weighTraits(t, lengths, (id) => ({ source: src(id), framings: ['A'] }), two);
    const auth = two.names.map((n) => ({ name: n, pieces: [], admired: null, classes: [] }));
    const free = composeSelection(t, lengths, auth, {}, { inferred: inferredChoice(w, two) });
    expect(free.decisions.filter(instructs)).toHaveLength(1);
    const asked = composeSelection(t, lengths, auth, {}, { inferred: inferredChoice(w, two, { requestLength: '500 words in the piece', pieceLength: new Set(['q1', 'q2']) }) });
    expect(asked.decisions.filter(instructs)).toHaveLength(0);
    expect(asked.decisions.map((x) => x.why)).toEqual(Array(2).fill("the request names the length (500 words in the piece): no voice's length is taken"));
  });
  it('the same pieces give the same composite, byte for byte', () => {
    expect(JSON.stringify(composeSelection(table, props, authors, {}, { inferred: inferredChoice(weigh(), AUTHORS) }))).toBe(JSON.stringify(c));
  });
});
