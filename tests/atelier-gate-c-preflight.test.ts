// GATE C PREFLIGHT (2026-10-19): the fixtures the pre-C4 audit asked for, each against the real artifacts and the exact
// model-facing text of a scripted run. What is asserted here is mechanical correctness and isolation, never that the
// moves help: that is C4's. Numbered as the audit numbers them.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EXECUTION_BRIEF, selectMoves, briefNote, type BriefStep } from '../core/loop/execution-brief.js';
import type { MoveUnit } from '../core/compiler/moves.js';
import { posterior, situationEffect } from '../core/stats/habit.js';
import * as store from '../core/state/store.js';
import { listEvals } from '../core/state/eval-store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const unit = (over: Record<string, unknown>) => ({ kind: 'instruction' as const, decision: null, inputs: [], condition: null, output: null, exception: null, dependsOn: [], quote: 'x', by: 'model' as const, ...over });
const steps: BriefStep[] = [
  { id: 'r1', n: 1, statement: 'Open with a Summary section.', required: true, unit: unit({ decision: 'what the change does' }) },
  { id: 'r2', n: 2, statement: 'Add a Risks section when the change touches billing.', required: true, unit: unit({ condition: 'when the change touches billing' }) },
];
const move = (over: Partial<MoveUnit> & { k?: number; n?: number; a?: number; b?: number }): MoveUnit => {
  const { k = 3, n = 12, a = 3, b = 0, ...rest } = over;
  const trigger = rest.trigger ?? { text: 'where input is untrusted', status: 'supported' as const };
  const rate = posterior(k, n); const situation = trigger.text ? situationEffect(a, b, k - a, n - a - b - (k - a)) : null;
  return { id: 'm', aspect: 'a', observed: 'o', readAs: 'SOMETIMES', trigger, realisation: 'one sentence from the abusive caller', forbidden: null,
    evidence: [{ piece: 'piece-1', quote: 'A caller can refund more', situationQuote: null }], situationOnly: [], judged: [],
    rate, situation, kind: situation?.explains ? 'situational' : rate.pMajority > 0.5 ? 'standing' : 'occasional', pieces: k, corpus: n, scope: 'sentence', link: null, check: null, checkMeans: null, modality: 'passage', measured: [], measureAgrees: null, by: 'model', tabled: true, ...rest };
};

describe('audit 3, as values', () => {
  it('9. a link to a step the brief does not have never suppresses a valid move; 10. the steps the brief placed are untouched by the moves', () => {
    const b = EXECUTION_BRIEF.ground({ placed: [{ n: 2, holds: 'DOES_NOT_HOLD', quote: 'touches nothing else' }], unsupported: [], contradicted: [] }, { request: 'Review: it touches nothing else.', material: [], steps })!;
    const before = JSON.stringify(b.placed);
    // the better-evidenced move links to a step the brief does not list (a candidate link that found no step): it is
    // placed first all the same, and the other is past the budget of one
    const sel = selectMoves({ ghost: { applies: 'applies', why: '"x"' }, adv: { applies: 'applies', why: '"x"' } }, b, [move({ id: 'ghost', k: 4, a: 4, link: { step: '9', status: 'candidate' } }), move({ id: 'adv' })], steps);
    expect(sel.budget).toBe(1);
    expect(sel.placed.map((u) => u.id)).toEqual(['ghost']);
    expect(sel.notPlaced).toEqual([{ id: 'adv', why: "past the 1 such move(s) a piece of the author's carries" }]);
    expect(JSON.stringify(b.placed)).toBe(before);
    // served or observed, the step lines of the note are the same
    const served = briefNote(b, steps, [], sel); const observed = briefNote(b, steps, [], null);
    expect(served.split('\n').filter((l) => !l.startsWith('How I would') && !l.startsWith('- ') || l.startsWith('- Step'))).toEqual(observed.split('\n').filter((l) => !l.startsWith('How I would') && !l.startsWith('- ') || l.startsWith('- Step')));
    expect(served).toContain("For this request, my method's steps that apply: 1. Set aside, not this case: 2");
  });
});

// ── THROUGH RUNS, WITH THE ARTIFACTS INSPECTED ────────────────────────────────────────────────────────────────
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Add a Risks section when the change touches billing.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
const NOTE_B = `${NOTE}4. Name the missing test under Suggestions.\n`;
// the adversarial sentence in two of the four pieces, so the situation (shown with it there) explains the move
const body = (n: number): string => `I would start with the riskiest line. ${n <= 2 ? 'A caller can refund more than the order total. ' : ''}${'The change touches the runner and keeps its tests. '.repeat(n)}The handler trusts the caller.`;
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\n${body(n)}\n\n## Risks\nNone to billing.\n\n## Verdict\n${verdict}\n`;
const UNITS = { units: [
  { id: '1', kind: 'instruction', decision: 'what the change does', inputs: ['the diff'], condition: null, output: 'a Summary section', exception: null, dependsOn: [], quote: 'Open with a Summary section' },
  { id: '2', kind: 'instruction', decision: 'whether billing is touched', inputs: ['the diff'], condition: 'when the change touches billing', output: 'a Risks section', exception: null, dependsOn: ['1'], quote: 'Add a Risks section' },
  { id: '3', kind: 'instruction', decision: 'the verdict', inputs: [], condition: null, output: 'a Verdict section', exception: null, dependsOn: ['1', '2'], quote: 'End with a Verdict section' },
] };
const PERSONA = { points: [
  { aspect: 'stance', description: 'Opens from a position of my own, not a summary.', frequency: 'ALWAYS', quote: 'I would start with the riskiest line.' },
  { aspect: 'Adversarial framing', description: 'Where input is untrusted, reasons from the caller who abuses it.', frequency: 'SOMETIMES', quote: 'A caller can refund more than the order total.' },
] };
const PERSONA_B = { points: [PERSONA.points[1], PERSONA.points[0]] };
const MOVES = { moves: [
  { point: 1, trigger: null, evidence: ['piece-1', 'piece-2', 'piece-3'].map((piece) => ({ piece, quote: 'I would start with the riskiest line.', situationQuote: null })), realisation: 'a position first', forbidden: null, scope: 'sentence', link: 1, check: null },
  { point: 2, trigger: 'where input is untrusted', evidence: ['piece-1', 'piece-2'].map((piece) => ({ piece, quote: 'A caller can refund more than the order total.', situationQuote: 'The handler trusts the caller.' })), realisation: 'one sentence from the abusive caller', forbidden: 'never an attacker the diff does not expose', scope: 'sentence', link: 1, check: null },
] };
const BRIEF = { placed: [{ n: 2, holds: 'DOES_NOT_HOLD', quote: 'touches nothing else' }], unsupported: [], contradicted: [] };
const CASES = { cases: [{ n: 1, holds: 'HOLDS', quote: 'straight from the request body' }] };
const DRAFT = '## Summary\nThe change takes the amount from the body and keeps the build green.\n\n## Verdict\nRequest changes\n';
const READINGS = { readings: [{ n: 1, outcome: 'MISSING', quote: null, why: 'no sentence from the abusive caller' }, { n: 2, outcome: 'REALISED', quote: 'The change takes the amount from the body', why: 'a bare statement' }] };
const REQUEST = 'Review this change: the handler now takes the refund amount straight from the request body, and touches nothing else.';
const DIFF = 'diff --git a/api/refund.py b/api/refund.py\n+    amount = request.json["amount"]  # straight from the request body\n+    gateway.refund(order.id, amount)\n';

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--context-reader', 'scripted', '--reader-model', 'scripted'];
interface Body { tools?: { function?: { name?: string } }[]; messages?: { content?: string }[] }
const bodiesFor = async (tool: string): Promise<string[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.map((b) => JSON.parse(b) as Body).filter((b) => b.tools?.[0]?.function?.name === tool).map((b) => (b.messages ?? []).map((m) => m.content ?? '').join('\n'));
};
const setTools = (byTool: Record<string, unknown>): Promise<Response> => fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool }) });
const ALL = { emit_method_units: UNITS, emit_holds_back: { ids: [] }, emit_persona: PERSONA, emit_persona_moves: MOVES, emit_execution_brief: BRIEF, emit_move_cases: CASES, emit_move_readings: READINGS, emit_piece: { piece: DRAFT } };

interface Seed { data: string; proj: string; run: (...a: string[]) => { code: number; out: string } }
const seed = (): Seed => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-gcp-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gcp-proj-'));
  mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE); writeFileSync(join(proj, 'method-b.md'), NOTE_B); writeFileSync(join(proj, 'change.diff'), DIFF);
  ['Approve', 'Request changes', 'Comment', 'Approve'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, i + 1)); });
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  return { data, proj, run };
};
const idOf = (out: string): string => (JSON.parse(out.slice(out.indexOf('\n{') + 1)) as { invocationId: string }).invocationId;
const outputOf = (out: string): string => (JSON.parse(out.slice(out.indexOf('\n{') + 1)) as { output: string }).output;
const L = (data: string) => ({ root: data, skillName: 'review' });
const activeOf = (data: string) => store.getSkillVersion(L(data), store.getActive(L(data))!)!;

describe('through runs', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await setTools(ALL);
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('audits 1, 3.7, 4, 5: the profile the receipt names is the one the run uses; a short request with material gets its move; serve differs from observe by the moves block alone; the reader changes nothing but the record; a failed reading is not read and the output stands', async () => {
    const s = seed();
    expect(s.run('new', 'examples', '--method', 'method.md', '--name', 'review', '--yes', '--persona', 'auto', ...BACKEND()).code).toBe(0);
    const receipt = store.getReceipt(L(s.data), activeOf(s.data).skillVersionHash)!;
    expect(receipt.movesHash).toMatch(/^[0-9a-f]{12}$/);
    // 3.7 a three-word request with the diff bound is the method's work: the case is read on the material and the move placed
    const short = s.run('invoke', '--skill', 'review', 'Review this change.', '--with', 'change=change.diff', '--json', '--moves', 'observe', ...BACKEND());
    expect(short.code, short.out).toBe(0);
    expect((await bodiesFor('emit_move_cases')).at(-1) ?? '').toContain('straight from the request body');
    const shortRec = store.listInvocations(L(s.data)).find((i) => i.invocationId === idOf(short.out))!;
    expect(shortRec.settings.flags.brief!.moves).toMatchObject({ profile: receipt.movesHash, placed: [expect.stringMatching(/./)], mode: 'observe' });
    // 5. observe vs serve: the writer's prompt differs by the moves block and nothing else
    const observed = s.run('invoke', '--skill', 'review', REQUEST, '--json', '--moves', 'observe', ...BACKEND()); expect(observed.code, observed.out).toBe(0);
    const pObs = (await bodiesFor('emit_piece')).at(-1)!;
    const served = s.run('invoke', '--skill', 'review', REQUEST, '--json', '--moves', 'serve', ...BACKEND()); expect(served.code, served.out).toBe(0);
    const pSrv = (await bodiesFor('emit_piece')).at(-1)!;
    const extra = pSrv.split('\n').filter((l) => !pObs.includes(l));
    expect(extra).toEqual(['How I would make this, as myself:', expect.stringMatching(/^- at step 1: where input is untrusted: one sentence from the abusive caller, as in "A caller can refund more than the order total\." \(2 of the 2 of my pieces in this situation\)\. Not: never an attacker the diff does not expose\.$/)]);
    expect(pObs.split('\n').filter((l) => !pSrv.includes(l))).toEqual([]);
    expect(outputOf(served.out)).toBe(outputOf(observed.out));
    // 5. the reader on or off: the writer's prompt and the output are identical; only the record and the events differ
    const noRead = s.run('invoke', '--skill', 'review', REQUEST, '--json', '--moves', 'observe', '--no-taste', ...BACKEND()); expect(noRead.code, noRead.out).toBe(0);
    expect((await bodiesFor('emit_piece')).at(-1)).toBe(pObs);
    expect(outputOf(noRead.out)).toBe(outputOf(observed.out));
    const evObs = listEvals(L(s.data)).find((e) => e.invocationId === idOf(observed.out))!; const evNo = listEvals(L(s.data)).find((e) => e.invocationId === idOf(noRead.out))!;
    expect(evObs.monitors.moves).toMatchObject({ realised: 1, missing: 1 }); expect(evNo.monitors.moves ?? null).toBeNull();
    expect(evObs.result.conformant).toBe(evNo.result.conformant); expect(evObs.record?.state).toBe(evNo.record?.state);
    // 4. the reading fails (the script does not answer it): not read, said, and the delivered output is the same bytes
    await setTools({ ...ALL, emit_move_readings: undefined });
    const failed = s.run('invoke', '--skill', 'review', REQUEST, '--json', '--moves', 'observe', ...BACKEND()); expect(failed.code, failed.out).toBe(0);
    expect(outputOf(failed.out)).toBe(outputOf(observed.out));
    const evF = listEvals(L(s.data)).find((e) => e.invocationId === idOf(failed.out))!;
    expect(evF.monitors.moves).toMatchObject({ by: 'floor', notRead: 2, realised: 0 });
    expect(failed.out).toMatch(/2 not read of 2/);
    await setTools(ALL);
    // 2. no move reading can reach the taste reader's permissions: calibration reads TASTE_READING events only
    expect(store.readEvents(L(s.data)).filter((e) => e.kind === 'MOVE_READING').length).toBeGreaterThan(0);
    expect(store.listInvocations(L(s.data)).every((i) => !i.repair?.taste)).toBe(true);
  }, 400_000);

  it('audit 5: the persona changed with the method fixed moves no standard; the method changed with the persona fixed moves no persona; a reordered persona keeps its move ids; a profile stale against the pieces is read again', async () => {
    const a = seed();
    expect(a.run('new', 'examples', '--method', 'method.md', '--name', 'review', '--yes', '--persona', 'auto', ...BACKEND()).code).toBe(0);
    const stdA = activeOf(a.data).standardVersionHash; const recA = store.getReceipt(L(a.data), activeOf(a.data).skillVersionHash)!;
    const idsA = store.getMovesByHash(L(a.data), recA.movesHash!)!.units.map((u) => u.id);
    // persona reordered: same points, other order: the persona hash differs, every move id is the same
    await setTools({ ...ALL, emit_persona: PERSONA_B, emit_persona_moves: { moves: [{ ...MOVES.moves[1], point: 1 }, { ...MOVES.moves[0], point: 2 }] } });
    expect(a.run('build', '--name', 'review', '--persona', 'auto', ...BACKEND()).code).toBe(0);
    const recA2 = store.getReceipt(L(a.data), activeOf(a.data).skillVersionHash)!;
    expect(activeOf(a.data).standardVersionHash).toBe(stdA);
    expect(store.getMovesByHash(L(a.data), recA2.movesHash!)!.units.map((u) => u.id).sort()).toEqual([...idsA].sort());
    expect(recA2.movesHash).not.toBe(recA.movesHash);
    // method changed, persona kept: the standard moves, the persona and its points do not
    await setTools(ALL);
    const b = seed();
    expect(b.run('new', 'examples', '--method', 'method.md', '--name', 'review', '--yes', '--persona', 'auto', ...BACKEND()).code).toBe(0);
    const personaBefore = JSON.stringify((JSON.parse(readFileSync(join(b.data, 'skills', 'review', 'voice.json'), 'utf8')) as { persona: unknown }).persona);
    const stdB = activeOf(b.data).standardVersionHash;
    expect(b.run('method', 'method-b.md', '--golden', 'examples', '--name', 'review', '--yes', ...BACKEND()).code).toBe(0);
    expect(activeOf(b.data).standardVersionHash).not.toBe(stdB);
    expect(JSON.stringify((JSON.parse(readFileSync(join(b.data, 'skills', 'review', 'voice.json'), 'utf8')) as { persona: unknown }).persona)).toBe(personaBefore);
    // stale against the pieces: a piece of the corpus changes under a kept persona; the profile is read again, the old one stays for its receipt
    const recB = store.getReceipt(L(b.data), activeOf(b.data).skillVersionHash)!;
    writeFileSync(join(b.proj, 'examples', 'e4.md'), review('Comment', 9));
    const before = (await bodiesFor('emit_persona_moves')).length;
    const again = b.run('build', '--name', 'review', '--report', ...BACKEND()); expect(again.code, again.out).toBe(0);
    expect((await bodiesFor('emit_persona_moves')).length).toBe(before + 1);
    const recB2 = store.getReceipt(L(b.data), activeOf(b.data).skillVersionHash)!;
    expect(recB2.movesHash).not.toBe(recB.movesHash);
    expect(store.getMovesByHash(L(b.data), recB.movesHash!)).not.toBeNull();
  }, 400_000);
});
