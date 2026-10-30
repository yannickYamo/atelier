// THE AUTHOR'S MOVES COMPILED FROM THE PERSONA, GROUNDED IN THE PIECES, COUNTED, AND OF AN INFERRED KIND
// (core/compiler/moves.ts, core/stats/habit.ts). A trigger is supported only by a situation quote from the same piece
// as the evidence; every quote is kept verbatim at any length; the kind is a decision from the counts (never a word,
// never a floor of pieces); the no-model floor counts the point's own quote; the id is a content hash; the profile is
// immutable and named by the build receipt; the standard is untouched.
import { describe, it, expect } from 'vitest';
import { PERSONA_MOVES, moveFloor, moveId, personaHashOf, profileOf, inferMoves, measureHabit, cellsToAsk, describeMove, describeMoves, type MovesInput } from '../core/compiler/moves.js';
import { readContext } from '../core/inference/reading.js';
import type { PersonaPoint } from '../core/compiler/persona.js';

const pieces = [
  { name: 'piece-1', text: 'The handler trusts the caller. A caller can refund more than the order total, and the gateway is charged each time. Use `>=` so the state is correct.' },
  { name: 'piece-2', text: 'The input comes straight from the form. A caller can pass a negative count and the loop never ends. The name `tmp2` is awkward: rename it.' },
  { name: 'piece-3', text: 'This change renames a module and keeps its tests. Which also removes the retry. Use `>=` so the state is correct.' },
];
const points: PersonaPoint[] = [
  { aspect: 'Adversarial framing', description: 'Where input is untrusted, reasons from the caller who abuses it.', frequency: 'SOMETIMES', quote: 'A caller can refund more than the order total' },
  { aspect: 'Impersonal point of view', description: 'States findings as facts about the artifact.', frequency: 'ALWAYS', quote: 'Use `>=` so the state is correct' },
  { aspect: 'Side benefits', description: 'Tacks a secondary payoff on.', frequency: 'RARELY', quote: 'Which also removes the retry' },
];
const steps = [{ n: 1, text: 'Open with a Summary section.' }, { n: 2, text: 'List what must be fixed, each with its line.' }];
const input: MovesInput = { points, pieces, steps };
const raw = (over: Record<string, unknown>[]) => ({ moves: over });
const m1 = { point: 1, trigger: 'where input is untrusted', evidence: [
  { piece: 'piece-1', quote: 'A caller can refund more than the order total', situationQuote: 'The handler trusts the caller' },
  { piece: 'piece-2', quote: 'A caller can pass a negative count', situationQuote: 'The input comes straight from the form' }],
  realisation: 'one sentence from the abusive caller', forbidden: 'never an attacker the diff does not expose', scope: 'paragraph', link: 2, check: null };

describe('the kind is inferred from the counts', () => {
  it('a move in most pieces stands; one its situation explains is situational; the rest occasional; nothing is unknown', () => {
    const draft = PERSONA_MOVES.ground(raw([m1]), input)!;
    const units = inferMoves(draft, [], pieces, false);
    // adversarial: made in 2 of 3, both in the situation, none outside: the situation explains it
    expect(units[0]).toMatchObject({ kind: 'situational', pieces: 2, corpus: 3, tabled: false, trigger: { status: 'supported' } });
    expect(units[0].rate).toMatchObject({ k: 2, n: 3 }); expect(units[0].situation).toMatchObject({ explains: true, in: { k: 2, n: 2 }, out: { k: 0, n: 1 } });
    // the floor for the other points: the own quote's pieces, counted; 2 of 3 stands, 1 of 3 does not
    expect(units[1]).toMatchObject({ kind: 'standing', by: 'floor', pieces: 2, situation: null }); expect(units[1].rate.pMajority).toBeGreaterThan(0.5);
    expect(units[2]).toMatchObject({ kind: 'occasional', by: 'floor', pieces: 1 }); expect(units[2].rate.pMajority).toBeLessThan(0.5);
    // the table fills a cell: the move found in piece-3 too, outside the situation, makes it 3 of 3 and the situation no longer explains it: standing
    const tabled = inferMoves(draft, [{ habit: 1, piece: 'piece-3', move: 'keeps its tests', situation: null, shows: null }], pieces, true);
    expect(tabled[0]).toMatchObject({ pieces: 3, tabled: true, kind: 'standing' }); expect(tabled[0].situation).toMatchObject({ in: { k: 2, n: 2 }, out: { k: 1, n: 1 }, explains: false });
    // a situation seen without the move counts against it, and with no piece outside the situation there is nothing to compare
    const against = inferMoves(draft, [{ habit: 1, piece: 'piece-3', move: null, situation: 'keeps its tests', shows: null }], pieces, true);
    expect(against[0].situationOnly).toEqual([{ piece: 'piece-3', quote: 'keeps its tests' }]);
    expect(against[0]).toMatchObject({ situation: null, kind: 'standing', trigger: { status: 'proposed' } });
  });
  it('the floor is the point\'s own quote as evidence in every piece that holds it, and the id is a content hash of aspect and quote', () => {
    const f = moveFloor(points[0], pieces);
    expect(f).toMatchObject({ trigger: { text: null, status: 'none' }, scope: 'UNKNOWN', link: null, check: null, by: 'floor' });
    expect(f.evidence).toEqual([{ piece: 'piece-1', quote: points[0].quote, situationQuote: null }]);
    expect(moveId(points[0])).toBe(moveId({ aspect: '  adversarial   FRAMING ', quote: 'a caller can refund more than the order total' }));
    expect(moveId(points[0])).not.toBe(moveId(points[1]));
    expect(personaHashOf(points)).toBe(personaHashOf([...points].map((p) => ({ ...p }))));
    expect(personaHashOf(points)).not.toBe(personaHashOf(points.slice(1)));
    expect(moveFloor({ ...points[0], quote: 'in no piece' }, pieces).evidence).toEqual([]);
  });
});

describe('the reading as a value', () => {
  it('nothing to read decides by code; no model is the floor throughout', async () => {
    expect(PERSONA_MOVES.decide({ points: [], pieces, steps })).toEqual([]);
    expect(PERSONA_MOVES.decide(input)).toBeNull();
    const d = await readContext(PERSONA_MOVES, input, null, null, { spentUsd: 0, capUsd: 1 });
    expect(d.by).toBe('floor');
    expect(d.value.map((u) => [u.by, u.evidence.length])).toEqual([['floor', 1], ['floor', 2], ['floor', 1]]);
  });
  it('a supported trigger: situation quotes from the same pieces; the link is a candidate; the forbidden line a negation', () => {
    const g = PERSONA_MOVES.ground(raw([m1]), input)!;
    expect(g[0]).toMatchObject({ trigger: { text: 'where input is untrusted', status: 'supported' }, scope: 'paragraph', link: { step: '2', status: 'candidate' }, forbidden: 'never an attacker the diff does not expose', by: 'model' });
    expect(g[0].evidence).toHaveLength(2);
    // the other points, unanswered, fall to the floor
    expect(g[1]).toMatchObject({ by: 'floor' }); expect(g[2]).toMatchObject({ by: 'floor' });
    const u = inferMoves(g, [], pieces, true);
    expect(describeMove(u[0])).toBe('situational · Adversarial framing · in 2 of 3 pieces [0.18, 0.96] · when: "where input is untrusted" (explains it: in 2 of 2 pieces [0.33, 1.00] in the situation, in 0 of 1 piece [0.00, 0.85] outside) · scope: paragraph · at step 2 (candidate) · not: never an attacker the diff does not expose');
    expect(describeMove(u[2])).toBe('occasional (by the words alone) · Side benefits · in 1 of 3 pieces [0.04, 0.82]');
    expect(describeMoves(u)).toBe('3 moves: 1 standing, 1 situational, 1 occasional');
  });
  it('a situation quote from another piece, or not verbatim, does not support the trigger: proposed, and the situation has one side only', () => {
    const cross = { ...m1, evidence: [{ piece: 'piece-1', quote: 'A caller can refund more than the order total', situationQuote: 'The input comes straight from the form' }] };
    const g = PERSONA_MOVES.ground(raw([cross]), input)!;
    expect(g[0]).toMatchObject({ trigger: { status: 'proposed' } }); expect(g[0].evidence).toHaveLength(1);
    expect(inferMoves(g, [], pieces, false)[0]).toMatchObject({ situation: null, kind: 'occasional', trigger: { status: 'proposed' } });
    expect(g[0].evidence[0].situationQuote).toBeNull();
    const invented = { ...m1, evidence: [{ piece: 'piece-1', quote: 'A caller can refund more than the order total', situationQuote: 'the caller is hostile' }] };
    expect(PERSONA_MOVES.ground(raw([invented]), input)![0].trigger.status).toBe('proposed');
    // the sentence that makes the move is not also the one that shows its situation
    const same = { ...m1, evidence: [{ piece: 'piece-1', quote: 'A caller can refund more than the order total', situationQuote: 'a caller can refund more than the order total' }] };
    expect(PERSONA_MOVES.ground(raw([same]), input)![0].trigger.status).toBe('proposed');
  });
  it('a quote not in its piece is dropped; the point\'s own quote is always evidence; a bad step, feature, scope or forbidden line falls; a null trigger has no situation', () => {
    const g = PERSONA_MOVES.ground(raw([{ point: 2, trigger: null, evidence: [
      { piece: 'piece-9', quote: 'Use `>=` so the state is correct', situationQuote: null },
      { piece: 'piece-2', quote: 'these words are in no piece', situationQuote: null },
      { piece: 'piece-3', quote: 'keeps its tests', situationQuote: 'This change renames a module' }],
    realisation: 'findings as facts', forbidden: 'use the passive voice', scope: 'poem', link: 7, check: 'no-such-feature' }]), input)!;
    // the forbidden line is kept as read: guidance to a writer, never a requirement, and no pattern judges its wording
    expect(g[1]).toMatchObject({ trigger: { text: null, status: 'none' }, scope: 'UNKNOWN', link: null, check: null, forbidden: 'use the passive voice', by: 'model' });
    expect(g[1].evidence.map((e) => e.piece)).toEqual(['piece-1', 'piece-3']);
    expect(g[1].evidence.every((e) => e.situationQuote === null)).toBe(true);
    const g2 = PERSONA_MOVES.ground(raw([{ point: 2, trigger: null, evidence: [{ piece: 'piece-1', quote: 'Use `>=` so the state is correct', situationQuote: null }, { piece: 'piece-3', quote: 'Use `>=` so the state is correct', situationQuote: null }, { piece: 'piece-2', quote: 'is awkward: rename it', situationQuote: null }], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: 'question' }]), input)!;
    expect(g2[1]).toMatchObject({ check: 'question', scope: 'sentence' }); expect(g2[1].evidence).toHaveLength(3);
    // a quote of any length is kept when verbatim: whether it shows the move is the reading's judgement, measured by its eval, never a word count
    const bare = PERSONA_MOVES.ground(raw([{ point: 2, trigger: null, evidence: [{ piece: 'piece-1', quote: 'The handler', situationQuote: null }, { piece: 'piece-2', quote: 'rename it.', situationQuote: null }], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: null }]), input)!;
    expect(bare[1].evidence.map((e) => e.piece)).toEqual(['piece-1', 'piece-2', 'piece-3']);
    expect(PERSONA_MOVES.ground(raw([{ point: 9, trigger: null, evidence: [], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: null }]), input)).toBeNull();
    expect(PERSONA_MOVES.ground({ nope: 1 }, input)).toBeNull();
  });
  it('a habit a counted feature measures is counted over every whole piece, by code, where the reading says the habit is that feature present or absent; a feature only near the habit leaves the quote to decide', () => {
    // impersonal: the habit IS the absence of "we": every piece of the three has none, so 3 of 3 by the count, whatever was quoted
    const measured = PERSONA_MOVES.ground(raw([{ point: 2, trigger: null, evidence: [{ piece: 'piece-1', quote: 'Use `>=` so the state is correct', situationQuote: null }], realisation: 'bare statements', forbidden: null, scope: 'sentence', link: null, check: 'firstPlural', modality: 'document', checkMeans: 'absent' }]), input)!;
    expect(measured[1]).toMatchObject({ modality: 'document', check: 'firstPlural', checkMeans: 'absent' });
    expect(measureHabit('firstPlural', 'absent', pieces).map((m) => [m.piece, m.count, m.exhibits])).toEqual([['piece-1', 0, true], ['piece-2', 0, true], ['piece-3', 0, true]]);
    // the count confirms and never adds: the quotes (and the own quote, in pieces 1 and 3) say 2 of 3; the count agrees on those and cannot add piece-2 by itself
    const u = inferMoves(measured, [], pieces, true);
    expect(u[1]).toMatchObject({ kind: 'standing', pieces: 2, corpus: 3 }); expect(u[1].measured).toHaveLength(3);
    expect(describeMove(u[1])).toBe('standing · Impersonal point of view · in 2 of 3 pieces [0.18, 0.96] by the quotes, confirmed by the count of firstPlural · scope: sentence · over the whole piece · counted: firstPlural (absent in a piece is the habit)');
    // with the table judging the whole piece shown in piece-2 too, the count confirms all three
    const u3 = inferMoves(measured, [{ habit: 2, piece: 'piece-2', move: null, situation: null, shows: true }], pieces, true);
    expect(u3[1]).toMatchObject({ pieces: 3 });
    // a count that exhibits where nothing was read adds nothing: a feature absent everywhere is consistent with the habit, not evidence of it
    const silent = PERSONA_MOVES.ground(raw([{ point: 2, trigger: null, evidence: [], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: 'exclamation', modality: 'passage', checkMeans: 'absent' }]), input)!;
    expect(inferMoves(silent, [], pieces, true)[1].pieces).toBe(2); // the own quote's two pieces, not three
    // the move cells of a measured habit are still asked of the table: the count decides only where it agrees with the quotes
    expect(cellsToAsk(measured, pieces).filter((c) => c.habit === 2).map((c) => c.piece)).toEqual(['piece-2']); // piece-1 quoted, piece-3 holds the point's own quote
    // a feature that is only near the habit: the quotes decide, and the line says so; a plain-value feature has no events to count
    const near = PERSONA_MOVES.ground(raw([{ point: 2, trigger: null, evidence: [{ piece: 'piece-1', quote: 'Use `>=` so the state is correct', situationQuote: null }], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: 'tentativeModal', modality: 'passage', checkMeans: null }]), input)!;
    expect(inferMoves(near, [], pieces, true)[1]).toMatchObject({ checkMeans: null, pieces: 2 }); expect(inferMoves(near, [], pieces, true)[1].measured).toEqual([]);
    expect(describeMove(inferMoves(near, [], pieces, true)[1])).toContain('counted: tentativeModal (near the habit, not it)');
    const value = PERSONA_MOVES.ground(raw([{ point: 2, trigger: null, evidence: [], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: 'sentenceP10', modality: 'document', checkMeans: 'present' }]), input)!;
    expect(value[1]).toMatchObject({ check: 'sentenceP10', checkMeans: null });
    // a feature present in a piece, where the habit is its presence: counted where it occurs
    const hedges = [{ name: 'p1', text: 'This might fail. It may not.' }, { name: 'p2', text: 'This fails.' }];
    expect(measureHabit('tentativeModal', 'present', hedges).map((m) => [m.count, m.exhibits])).toEqual([[2, true], [0, false]]);
    // a count that disagrees with a quote does not measure the habit: the author hedges with "probably", the feature counts "might": the quotes decide
    const hedgy = [{ name: 'h1', text: 'The branch is probably safe, but confirm it.' }, { name: 'h2', text: 'This fails.' }, { name: 'h3', text: 'It might fail.' }];
    const hin = { points: [{ aspect: 'Hedges', description: 'Hedges where the code cannot settle it.', frequency: 'SOMETIMES' as const, quote: 'probably safe' }], pieces: hedgy, steps: [] };
    const hg = PERSONA_MOVES.ground(raw([{ point: 1, trigger: null, evidence: [{ piece: 'h1', quote: 'probably safe, but confirm it', situationQuote: null }], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: 'tentativeModal', modality: 'passage', checkMeans: 'present' }]), hin)!;
    const hu = inferMoves(hg, [], hedgy, true)[0];
    expect(hu).toMatchObject({ measureAgrees: false, pieces: 1, kind: 'occasional' }); expect(hu.measured.map((m) => m.exhibits)).toEqual([false, false, true]);
    expect(describeMove(hu)).toContain('by the quotes (the count of tentativeModal disagrees with them in 1 piece(s): it does not measure this habit)');
    expect(u[1].measureAgrees).toBe(true);
  });
  it('a profile is named by its content and its persona; the time is outside the hash', () => {
    const g = inferMoves(PERSONA_MOVES.ground(raw([m1]), input)!, [], pieces, true);
    const a = profileOf(g, personaHashOf(points), 'scripted', pieces, '2026-10-19T00:00:00Z');
    const b = profileOf(g, personaHashOf(points), 'scripted', pieces, '2026-10-20T00:00:00Z');
    expect(a.hash).toBe(b.hash); expect(a.hash).toHaveLength(12); expect(a.schema).toBe(2);
    expect(a.personaHash).toBe(personaHashOf(points));
    expect(profileOf(inferMoves(PERSONA_MOVES.floor(input), [], pieces, false), personaHashOf(points), null, pieces).hash).not.toBe(a.hash);
    // the pieces the evidence names trace to their text
    expect(a.pieces.map((p) => p.name)).toEqual(['piece-1', 'piece-2', 'piece-3']); expect(a.pieces[0].sha).toHaveLength(16);
    expect(profileOf(g, personaHashOf(points), 'scripted', [...pieces].reverse(), '2026-10-19T00:00:00Z').hash).not.toBe(a.hash);
  });
});

// ── THROUGH THE BUILD ──────────────────────────────────────────────────────────────────────────────────────────
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, afterAll } from 'vitest';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Then a Must fix section.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
const body = (n: number): string => `I would start with the riskiest line. ${Array.from({ length: n }, (_, i) => `The change touches part ${i + 1} of the runner and keeps its tests.`).join(' ')} ${n === 1 ? 'Tests first, then the rest.' : 'Run the tests.'}`;
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\n${body(n)}\n\n## Must fix\nNone.\n\n## Verdict\n${verdict}\n`;
const PERSONA = { points: [
  { aspect: 'stance', description: 'Opens from a position of my own, not a summary.', frequency: 'ALWAYS', quote: 'I would start with the riskiest line.' },
  { aspect: 'close', description: 'Closes on a short plain instruction.', frequency: 'OFTEN', quote: 'Tests first, then the rest.' },
] };
// one move answered for point 1 (its quote stands in 3 of 4 pieces: standing); point 2 is adversarial
// ADVERSARIAL: point 2 comes back with a trigger no piece shows (an invented situation quote), the same quote twice from one
// piece, a link to a step the method does not have, and a "forbidden" line that is an instruction: proposed, 1 of 4, occasional;
// one piece of evidence; no link; no forbidden line.
const MOVES = { moves: [
  { point: 1, trigger: null, evidence: ['piece-1', 'piece-2', 'piece-3'].map((piece) => ({ piece, quote: 'I would start with the riskiest line.', situationQuote: null })),
    realisation: 'the first sentence takes a position', forbidden: 'never a summary first', scope: 'sentence', link: 1, check: null },
  { point: 2, trigger: 'when the reader has a next step', evidence: [{ piece: 'piece-1', quote: 'Tests first, then the rest.', situationQuote: 'the reader must act now' }, { piece: 'piece-1', quote: 'Tests first, then the rest.', situationQuote: null }],
    realisation: 'one short instruction', forbidden: 'always close softly', scope: 'sentence', link: 9, check: null },
] };

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const toolsCalled = async (): Promise<string[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.map((b) => (JSON.parse(b) as { tools?: { function?: { name?: string } }[] }).tools?.[0]?.function?.name ?? '?');
};
interface Seed { data: string; proj: string; run: (...a: string[]) => { code: number; out: string } }
const seed = (keyless = false): Seed => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-gc1-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gc1-proj-'));
  mkdirSync(join(proj, 'examples'));
  writeFileSync(join(proj, 'method.md'), NOTE);
  ['Approve', 'Request changes', 'Comment', 'Approve'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, i + 1)); });
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; if (keyless) delete env.ATELIER_PROVIDER;
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  return { data, proj, run };
};
const L = (data: string) => ({ root: data, skillName: 'code-review' });
const activeOf = (data: string) => store.getSkillVersion(L(data), store.getActive(L(data))!)!;

describe('through the build', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_persona: PERSONA, emit_persona_moves: MOVES, emit_holds_back: { ids: [] } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('with a model: the profile is read once per persona, named by the receipt, kept on a rebuild; the standard is the same with and without it', async () => {
    const withModel = seed(); const without = seed(true);
    const r = withModel.run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report', '--persona', 'auto', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    // the table pass is asked (the backend has no answer for it, so the counts are the first reading's and the stage says so)
    // (4 cells asked: habit 2 where its situation was not shown and where the move was not; asked twice, the budget, and never answered)
    expect(r.out).toContain('Moves: 2 moves: 1 standing, 0 situational, 1 occasional, read from the persona and your pieces and tabled against every piece in 2 call(s) (4 of 4 cells were not answered: their counts are the first reading\'s).');
    expect(r.out).toContain('What my moves are, and when I make them:');
    // the point's own quote is evidence in every piece that holds it verbatim: 4 of 4, said without an interval the counts leave nothing of
    expect(r.out).toContain('standing · stance · in 4 of 4 pieces · scope: sentence · at step 1 (candidate) · not: never a summary first (not tabled: counts from the first reading alone)');
    expect(r.out).toContain('occasional · close · in 1 of 4 pieces [0.03, 0.72] · when: "when the reader has a next step" (proposed, the situation not seen on both sides) · scope: sentence · not: always close softly (not tabled: counts from the first reading alone)');
    expect(r.out).toMatch(/· moves ✓ \(2 points in 1 call: 2 moves: 1 standing, 0 situational, 1 occasional; 4 cells asked, 0 answered, 4 left in 2 calls; 4 of 4 cells not tabled: their counts are the first reading's\) ·/);
    const sv = activeOf(withModel.data);
    const receipt = store.getReceipt(L(withModel.data), sv.skillVersionHash)!;
    const profile = store.getMoves(L(withModel.data), personaHashOf(PERSONA.points as PersonaPoint[]))!;
    expect(profile).not.toBeNull();
    expect(receipt.movesHash).toBe(profile.hash);
    expect(profile.reader).toBe('scripted');
    expect(profile.schema).toBe(2); expect(profile.reading).toBe('persona-moves-7+persona-table-4+infer-2');
    expect(profile.units.map((u) => u.kind)).toEqual(['standing', 'occasional']);
    expect(profile.units[0]).toMatchObject({ pieces: 4, corpus: 4, link: { step: '1', status: 'candidate' }, by: 'model', tabled: false, readAs: 'ALWAYS' });
    expect(profile.units[0].rate).toMatchObject({ k: 4, n: 4 }); expect(profile.units[0].rate.pMajority).toBeGreaterThan(0.5);
    // THE PERSISTED RECORD IS TRUTHFUL ON THE ADVERSARIAL POINT: proposed trigger, one evidence with no situation, no link; the forbidden line kept as read
    expect(profile.units[1]).toMatchObject({ kind: 'occasional', trigger: { text: 'when the reader has a next step', status: 'proposed' }, pieces: 1, link: null, forbidden: 'always close softly', by: 'model', situation: null });
    expect(profile.units[1].evidence).toEqual([{ piece: 'piece-1', quote: 'Tests first, then the rest.', situationQuote: null }]);
    expect(profile.pieces.map((x) => x.name)).toEqual(['piece-1', 'piece-2', 'piece-3', 'piece-4']);
    // the profile on disk is the one the receipt names, by its own hash
    expect(store.getMovesByHash(L(withModel.data), receipt.movesHash!)!.hash).toBe(profile.hash);
    // THE STANDARD IS UNTOUCHED BY THE MOVES: a build with no model at all differs from it only by the step-check reading
    // (with no model every stated step is a judgement), never by a move; the receipt of that build names no moves profile.
    expect(without.run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report').code).toBe(0);
    expect(store.getReceipt(L(without.data), activeOf(without.data).skillVersionHash)!.movesHash).toBeNull();
    // THE PACKAGE CARRIES NOTHING OF IT: the profile is beside the voice, not in the skill
    const skillMd = readFileSync(join(withModel.proj, '.claude', 'skills', 'code-review', 'SKILL.md'), 'utf8');
    expect(skillMd).not.toContain('never a summary first'); expect(skillMd).not.toContain('What my moves');
    // THE SKILL WORDS EACH POINT BY ITS COUNT, never by the reading's word: "always" seen in 3 of 4, "often" seen in 1 of 4 (a repertoire line)
    expect(skillMd).toContain('- (in 4 of 4 pieces) Opens from a position of my own, not a summary. e.g. "I would start with the riskiest line."');
    expect(skillMd).toContain('- (in 1 of 4 pieces [0.03, 0.72]) close: closes on a short plain instruction.');
    expect(skillMd).not.toContain('(always)'); expect(skillMd).not.toContain('(often)');
    // A REBUILD WITH THE SAME PERSONA READS NOTHING AGAIN
    const before = (await toolsCalled()).filter((t) => t === 'emit_persona_moves').length;
    expect(before).toBe(1);
    const again = withModel.run('build', '--name', 'code-review', '--report', ...BACKEND());
    expect(again.code, again.out).toBe(0);
    expect(again.out).toMatch(/· moves ✓ \(2 moves: 1 standing, 0 situational, 1 occasional \(kept\)\) ·/);
    expect((await toolsCalled()).filter((t) => t === 'emit_persona_moves').length).toBe(1);
    expect(store.getReceipt(L(withModel.data), activeOf(withModel.data).skillVersionHash)!.movesHash).toBe(profile.hash);
  }, 240_000);

  it('no persona, no moves: --persona none records the stage not run and the receipt names no profile', () => {
    const s = seed();
    const r = s.run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report', '--persona', 'none', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/· moves — no persona ·/);
    expect(store.getReceipt(L(s.data), activeOf(s.data).skillVersionHash)!.movesHash).toBeNull();
  }, 180_000);
});

// THE POINTS ARE READ IN BATCHES. Every persona point went to the moves reader in one call; on five long pieces with
// twenty points the answer overran its token limit, nothing in it could be grounded, and the floor gave 0 standing
// moves for a move made in 5 of 5 pieces. Now the points are read a batch at a time (core/compiler/moves.ts,
// `pointsPerCall`), the drafts merged in point order, and a batch that fell to the floor is said on the receipt.
describe('the points are read in batches', () => {
  const N = 20;
  const sentence = (k: number): string => `Move number ${k} is made right here.`;
  const piece = (n: number): string => `---\nrequest: Review this change ${n}.\n---\n## Summary\n${Array.from({ length: N }, (_, i) => sentence(i + 1)).join(' ')} The change touches part ${n} of the runner.\n\n## Must fix\nNone.\n\n## Verdict\nApprove\n`;
  const persona = { points: Array.from({ length: N }, (_, i) => ({ aspect: `a${i + 1}`, description: `Makes move number ${i + 1}.`, frequency: 'ALWAYS', quote: sentence(i + 1) })) };
  // a batch's answer: one move per point of the batch, numbered within the batch, each quoted from piece-1
  const batchAnswer = (from: number, to: number) => ({ moves: Array.from({ length: to - from + 1 }, (_, i) => ({ point: i + 1, trigger: null, evidence: [{ piece: 'piece-1', quote: sentence(from + i), situationQuote: null }], realisation: `move ${from + i}`, forbidden: null, scope: 'sentence', link: null, check: null, modality: 'passage' })) });
  const seedMany = (): Seed => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-gc1b-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gc1b-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE);
    [1, 2, 3, 4].forEach((n) => { writeFileSync(join(proj, 'examples', `e${n}.md`), piece(n)); });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    return { data, proj, run };
  };
  // the batches are told apart by the first point each one lists; a `when` on the moves prompt alone (THE POINTS:)
  const batches = (lost: number | null) => [
    { containsAll: ['THE POINTS:', 'Makes move number 17.'], ...(lost === 3 ? { finish: 'length' } : { answer: batchAnswer(17, 20) }) },
    { containsAll: ['THE POINTS:', 'Makes move number 9.'], ...(lost === 2 ? { finish: 'length' } : { answer: batchAnswer(9, 16) }) },
    { containsAll: ['THE POINTS:', 'Makes move number 1.'], ...(lost === 1 ? { finish: 'length' } : { answer: batchAnswer(1, 8) }) },
  ];
  beforeAll(async () => {
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  }, 60_000);
  afterAll(() => { backend.kill(); });
  it('20 points go in 3 calls of 8, 8 and 4, merged in point order; the stage says so and is not degraded', async () => {
    const { pointsPerCall, PERSONA_MOVES: R } = await import('../core/compiler/moves.js');
    expect(pointsPerCall(R.maxTokens)).toBe(8); expect(pointsPerCall(4000)).toBe(3); expect(pointsPerCall(500)).toBe(1);
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_persona: persona, emit_holds_back: { ids: [] } }, when: batches(null) }) });
    const before = (await toolsCalled()).filter((t) => t === 'emit_persona_moves').length;
    const s = seedMany();
    const r = s.run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report', '--persona', 'auto', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect((await toolsCalled()).filter((t) => t === 'emit_persona_moves').length - before).toBe(3);
    const stage = store.getReceipt(L(s.data), activeOf(s.data).skillVersionHash)!.stages.find((x) => x.id === 'moves')!;
    expect(stage).toMatchObject({ ran: true, by: 'model', calls: 3, detail: `${N} points in 3 calls: ${N} moves: ${N} standing, 0 situational, 0 occasional` });
    expect(stage.degraded).toBeUndefined(); expect(stage.truncated).toBeUndefined();
    const profile = store.getMovesByHash(L(s.data), store.getReceipt(L(s.data), activeOf(s.data).skillVersionHash)!.movesHash!)!;
    expect(profile.units.map((u) => u.realisation)).toEqual(Array.from({ length: N }, (_, i) => `move ${i + 1}`));
    expect(profile.units.every((u) => u.by === 'model' && u.kind === 'standing' && u.pieces === 4)).toBe(true);
  }, 240_000);
  it('one batch cut at the token limit falls to the floor alone: the other points are read, the stage is degraded and says why, and status shows it', async () => {
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_persona: persona, emit_holds_back: { ids: [] } }, when: batches(2) }) });
    const before = (await toolsCalled()).filter((t) => t === 'emit_persona_moves').length;
    const s = seedMany();
    const r = s.run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report', '--persona', 'auto', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect((await toolsCalled()).filter((t) => t === 'emit_persona_moves').length - before).toBe(3);
    const stage = store.getReceipt(L(s.data), activeOf(s.data).skillVersionHash)!.stages.find((x) => x.id === 'moves')!;
    expect(stage).toMatchObject({ ran: true, by: 'model', calls: 3, truncated: true, degraded: true, detail: `${N} points in 3 calls: ${N} moves: ${N} standing, 0 situational, 0 occasional` });
    expect(stage.why).toMatch(/^1 of 3 point batch\(es\) fell to the floor: the reader could not be asked: .*token limit/);
    expect(r.out).toContain(`· moves ✓ (${stage.detail!}; ${stage.why!}; an answer cut at the token limit) ·`);
    const profile = store.getMovesByHash(L(s.data), store.getReceipt(L(s.data), activeOf(s.data).skillVersionHash)!.movesHash!)!;
    // points 9 to 16 are the floor (the point's own quote, in every piece); the rest the reader's, in order
    expect(profile.units.map((u) => u.by)).toEqual([...Array<string>(8).fill('model'), ...Array<string>(8).fill('floor'), ...Array<string>(4).fill('model')]);
    expect(profile.units.map((u) => u.realisation).slice(0, 2)).toEqual(['move 1', 'move 2']);
    const st = s.run('status', '--skill', 'code-review');
    expect(st.out).toMatch(/built without: moves \(1 of 3 point batch\(es\) fell to the floor/);
  }, 240_000);
});
