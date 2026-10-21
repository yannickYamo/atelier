// THE TABLE (core/compiler/moves.ts): every cell the first reading left (no quote for the move in a piece, or none for
// its situation) is asked once, in calls sized by the answer budget and the corpus, grounded like the first reading;
// every cell is then a count, and the kinds are inferred from the counts (core/stats/habit.ts). No floor of pieces,
// no word for how often: a habit seen in 4 of 4 stands, one seen in 2 of 4 does not, and either is said with its
// interval. The authority ceiling is unchanged: nothing here raises evidence past observed or permission past monitor.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PERSONA_TABLE, PERSONA_MOVES, cellsToAsk, habitsPerCall, inferMoves, describeMove, personaHashOf, type MovesInput } from '../core/compiler/moves.js';
import { readContext } from '../core/inference/reading.js';
import type { PersonaPoint } from '../core/compiler/persona.js';
import * as store from '../core/state/store.js';

const pieces = [
  { name: 'piece-1', text: 'The loop stops one short. Use a range to the length. Request changes.' },
  { name: 'piece-2', text: 'The handler trusts the body. Validate the amount before the charge. Request changes.' },
  { name: 'piece-3', text: 'The migration is reversible and the tests cover it. Approve.' },
  { name: 'piece-4', text: 'I think the rename is fine, you should merge it. Approve.' },
];
const points: PersonaPoint[] = [
  { aspect: 'Impersonal point of view', description: 'Never says I or you; a finding is a bare statement about the artifact.', frequency: 'ALWAYS', quote: 'The loop stops one short' },
  { aspect: 'Adversarial framing', description: 'Where input is untrusted, reasons from the caller who abuses it.', frequency: 'SOMETIMES', quote: 'The handler trusts the body' },
];
const input: MovesInput = { points, pieces, steps: [] };
const firstPass = PERSONA_MOVES.ground({ moves: [
  { point: 1, trigger: null, evidence: [{ piece: 'piece-1', quote: 'The loop stops one short', situationQuote: null }], realisation: 'bare statements', forbidden: null, scope: 'sentence', link: null, check: null },
  { point: 2, trigger: 'where input is untrusted', evidence: [{ piece: 'piece-2', quote: 'The handler trusts the body', situationQuote: null }], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: null },
] }, input)!;

describe('the table as a value', () => {
  it('the cells to ask are every piece without a quote for the move, or for its situation; the habits a call holds come from the budget and the corpus', () => {
    // habit 1 has no situation: the three pieces without a quote; habit 2 has one: its own piece too (the situation was not shown there)
    expect(cellsToAsk(firstPass, pieces)).toEqual([
      { habit: 1, piece: 'piece-2' }, { habit: 1, piece: 'piece-3' }, { habit: 1, piece: 'piece-4' },
      { habit: 2, piece: 'piece-1' }, { habit: 2, piece: 'piece-2' }, { habit: 2, piece: 'piece-3' }, { habit: 2, piece: 'piece-4' },
    ]);
    expect(habitsPerCall(8000, 4)).toBe(21); expect(habitsPerCall(8000, 40)).toBe(2); expect(habitsPerCall(8000, 400)).toBe(1);
    expect(habitsPerCall(8000, 4)).toBeGreaterThan(habitsPerCall(4000, 4));
  });
  it('a cell is kept only verbatim, only when asked, once; the counts and the kinds follow', async () => {
    const asked = cellsToAsk(firstPass, pieces);
    const ask = { habits: [{ n: 1, aspect: points[0].aspect, description: points[0].description, quote: points[0].quote, situation: null, modality: 'document' as const }, { n: 2, aspect: points[1].aspect, description: points[1].description, quote: points[1].quote, situation: 'where input is untrusted', modality: 'passage' as const }], pieces, cells: asked };
    expect(PERSONA_TABLE.decide({ ...ask, cells: [] })).toEqual([]);
    expect(PERSONA_TABLE.decide(ask)).toBeNull();
    expect((await readContext(PERSONA_TABLE, ask, null, null, { spentUsd: 0, capUsd: 1 })).by).toBe('floor');
    const g = PERSONA_TABLE.ground({ cells: [
      { habit: 1, piece: 'piece-2', move: 'The handler trusts the body.', situation: null },
      { habit: 1, piece: 'piece-2', move: 'Validate the amount before the charge.', situation: null },   // the same cell twice: dropped
      { habit: 1, piece: 'piece-1', move: 'The loop stops one short.', situation: null },                 // not asked: dropped
      { habit: 1, piece: 'piece-3', move: 'the tests cover everything', situation: null },               // not verbatim: no move
      { habit: 1, piece: 'piece-4', move: null, situation: null },                                        // the habit absent: a count of not
      { habit: 1, piece: 'piece-9', move: 'The migration is reversible', situation: null },               // no such piece: dropped
      { habit: 7, piece: 'piece-3', move: 'The migration is reversible', situation: null },               // no such habit: dropped
      { habit: 2, piece: 'piece-2', move: null, situation: 'The handler trusts the body' },               // the situation shown where the move was
      { habit: 2, piece: 'piece-1', move: null, situation: 'Use a range to the length' },                 // the situation without the move
      { habit: 2, piece: 'piece-3', move: null, situation: null },
      { habit: 2, piece: 'piece-4', move: 'you should merge it', situation: 'you should merge it', shows: true },      // one quote for both: the situation is dropped; `shows` is for a whole-piece habit only
    ].map((c) => ({ shows: null, ...c })) }, ask)!;
    expect(g.map((c) => `${c.habit}:${c.piece}:${c.move ? 'm' : '-'}${c.situation ? 's' : '-'}`)).toEqual(['1:piece-2:m-', '1:piece-3:--', '1:piece-4:--', '2:piece-2:-s', '2:piece-1:-s', '2:piece-3:--', '2:piece-4:m-']);
    expect(g.every((c) => c.shows === null)).toBe(true);
    const units = inferMoves(firstPass, g, pieces, true);
    // impersonal: 2 of 4, no situation: occasional (a majority no more probable than not), said with its interval
    expect(units[0]).toMatchObject({ kind: 'occasional', pieces: 2, corpus: 4, tabled: true, situation: null });
    expect(units[0].rate).toMatchObject({ k: 2, n: 4 }); expect(units[0].rate.pMajority).toBeCloseTo(0.5, 6);
    // a whole-piece habit is judged over the piece: `shows` counts, a passage only illustrates; a piece judged not to show it does not count
    const gw = PERSONA_TABLE.ground({ cells: [{ habit: 1, piece: 'piece-2', move: null, situation: null, shows: true }, { habit: 1, piece: 'piece-3', move: null, situation: null, shows: true }, { habit: 1, piece: 'piece-4', move: null, situation: null, shows: false }] }, ask)!;
    expect(gw.map((c) => c.shows)).toEqual([true, true, false]);
    const wu = inferMoves(firstPass, gw, pieces, true)[0];
    expect(wu).toMatchObject({ kind: 'standing', pieces: 3 }); expect(wu.judged).toEqual([{ piece: 'piece-2', shows: true }, { piece: 'piece-3', shows: true }, { piece: 'piece-4', shows: false }]);
    expect(describeMove(wu)).toContain('in 3 of 4 pieces [0.28, 0.97] judged over each whole piece');
    // adversarial: made in piece-2 (in the situation) and piece-4 (outside); the situation seen in piece-1 without it: 1 of 2 in, 1 of 2 out: one rate fits as well, it does not explain
    expect(units[1].evidence.map((e) => [e.piece, e.situationQuote !== null])).toEqual([['piece-2', true], ['piece-4', false]]);
    expect(units[1].situationOnly).toEqual([{ piece: 'piece-1', quote: 'Use a range to the length' }]);
    expect(units[1].situation).toMatchObject({ in: { k: 1, n: 2 }, out: { k: 1, n: 2 }, explains: false });
    expect(units[1]).toMatchObject({ kind: 'occasional', trigger: { status: 'proposed' }, pieces: 2 });
    expect(PERSONA_TABLE.ground({ cells: [] }, ask)).toBeNull(); expect(PERSONA_TABLE.ground({ nope: 1 }, ask)).toBeNull();
  });
});

// ── THROUGH THE BUILD ──────────────────────────────────────────────────────────────────────────────────────────
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Then a Must fix section.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
const body = (n: number): string => `I would start with the riskiest line. ${Array.from({ length: n }, (_, i) => `The change touches part ${i + 1} of the runner and keeps its tests.`).join(' ')} ${n <= 2 ? 'Tests first, then the rest.' : 'Run the tests.'}`;
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\n${body(n)}\n\n## Must fix\nNone.\n\n## Verdict\n${verdict}\n`;
const PERSONA = { points: [
  { aspect: 'stance', description: 'Opens from a position of my own, not a summary.', frequency: 'ALWAYS', quote: 'I would start with the riskiest line.' },
  { aspect: 'close', description: 'Closes on a short plain instruction.', frequency: 'RARELY', quote: 'Tests first, then the rest.' },
] };
// the first reading quotes each habit from one piece only
const MOVES = { moves: [
  { point: 1, trigger: null, evidence: [{ piece: 'piece-1', quote: 'I would start with the riskiest line.', situationQuote: null }], realisation: 'a position first', forbidden: null, scope: 'sentence', link: 1, check: null },
  { point: 2, trigger: null, evidence: [{ piece: 'piece-1', quote: 'Tests first, then the rest.', situationQuote: null }], realisation: 'a short instruction last', forbidden: null, scope: 'sentence', link: 3, check: null },
] };
// the table finds the first habit in every other piece, the second in one more
const TABLE = { cells: [
  ...['piece-2', 'piece-3', 'piece-4'].map((piece) => ({ habit: 1, piece, move: 'I would start with the riskiest line.', situation: null })),
  { habit: 2, piece: 'piece-2', move: 'Tests first, then the rest.', situation: null }, { habit: 2, piece: 'piece-3', move: null, situation: null }, { habit: 2, piece: 'piece-4', move: null, situation: null },
].map((c) => ({ ...c, shows: null })) };

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const toolsCalled = async (): Promise<string[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.map((b) => (JSON.parse(b) as { tools?: { function?: { name?: string } }[] }).tools?.[0]?.function?.name ?? '?');
};

describe('through the build', () => {
  beforeAll(async () => {
    if (!existsSync(resolve('dist/cli/atelier.mjs'))) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_persona: PERSONA, emit_persona_moves: MOVES, emit_persona_table: TABLE, emit_holds_back: { ids: [] } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('the table runs once for every cell the first reading left; 4 of 4 stands and 2 of 4 does not, whatever the reading\'s word; the skill says the counts; the standard is untouched', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-gct-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gct-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE);
    ['Approve', 'Request changes', 'Comment', 'Approve'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, i + 1)); });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_PROVIDER;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [resolve('dist/cli/atelier.mjs'), ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    const r = run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report', '--persona', 'auto', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect((await toolsCalled()).filter((t) => t === 'emit_persona_table')).toHaveLength(1);
    expect(r.out).toContain('Moves: 2 moves: 1 standing, 0 situational, 1 occasional, read from the persona and your pieces and tabled against every piece in 1 call(s).');
    expect(r.out).toContain('standing · stance · in 4 of 4 pieces · scope: sentence · at step 1 (candidate)');
    expect(r.out).toContain('occasional · close · in 2 of 4 pieces [0.12, 0.88] · scope: sentence · at step 3 (candidate)');
    const L = { root: data, skillName: 'code-review' };
    const sv = store.getSkillVersion(L, store.getActive(L)!)!;
    const profile = store.getMovesByHash(L, store.getReceipt(L, sv.skillVersionHash)!.movesHash!)!;
    expect(profile.units.map((u) => [u.kind, u.pieces, u.tabled, u.readAs])).toEqual([['standing', 4, true, 'ALWAYS'], ['occasional', 2, true, 'RARELY']]);
    expect(store.getMoves(L, personaHashOf(PERSONA.points as PersonaPoint[]))!.hash).toBe(profile.hash);
    expect(store.getStandard(L, sv.standardVersionHash)!.requirements.filter((q) => q.provenance === 'EXPERT_STATED')).toHaveLength(3);
    // the skill words each point by its count, never by the reading's word
    const md = readFileSync(join(proj, '.claude', 'skills', 'code-review', 'SKILL.md'), 'utf8');
    expect(md).toContain('- (in 4 of 4 pieces) Opens from a position of my own, not a summary.');
    expect(md).toContain('- (in 2 of 4 pieces [0.12, 0.88]) close: closes on a short plain instruction.');
    expect(md).not.toContain('(always)'); expect(md).not.toContain('(rarely)');
    // A PROFILE READ BY AN EARLIER READING IS READ AGAIN where a model is there: the pointer is moved to a copy of the
    // profile marked as read by the earlier versions; the next build reads both passes anew and the receipt names the new one
    const older = { ...profile, hash: 'older0000000', schema: 1, reading: 'persona-moves-4' } as unknown as typeof profile;
    store.putMoves(L, personaHashOf(PERSONA.points as PersonaPoint[]), older);
    const again = run('build', '--name', 'code-review', '--report', ...BACKEND());
    expect(again.code, again.out).toBe(0);
    expect(again.out).toMatch(/· moves ✓ \(2 moves: 1 standing, 0 situational, 1 occasional\) ·/);
    expect((await toolsCalled()).filter((t) => t === 'emit_persona_table')).toHaveLength(2);
    const sv2 = store.getSkillVersion(L, store.getActive(L)!)!;
    expect(store.getReceipt(L, sv2.skillVersionHash)!.movesHash).toBe(profile.hash);
    // and with no model, the older profile is kept and the stage says so
    store.putMoves(L, personaHashOf(PERSONA.points as PersonaPoint[]), older);
    const noModel = run('build', '--name', 'code-review', '--report');
    expect(noModel.code, noModel.out).toBe(0);
    expect(noModel.out).toMatch(/· moves — kept from an earlier reading \(persona-moves-4\) and no model to read again/);
  }, 240_000);
});
