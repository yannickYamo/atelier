// GATE C3: WHAT THE DELIVERED TEXT DID WITH THE MOVES PLACED FOR THE REQUEST, READ AND NEVER COUNTED
// (core/taste/move-reader.ts). Five outcomes; a present outcome stands only on a quote in the text; the floor is not
// read; the reading is its own call, so the taste reader's coverage of the method's steps is unchanged; recorded with
// the run, shown in the panel, summed per move by `atelier eval`; nothing redrafts on it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MOVE_READER, READ_MOVES, countOutcomes } from '../core/taste/move-reader.js';
import { readContext } from '../core/inference/reading.js';
import type { MoveUnit } from '../core/compiler/moves.js';
import { posterior, situationEffect } from '../core/stats/habit.js';
import * as store from '../core/state/store.js';
import { listEvals } from '../core/state/eval-store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const move = (over: Partial<MoveUnit> & { k?: number; n?: number; a?: number; b?: number }): MoveUnit => {
  const { k = 3, n = 12, a = 3, b = 0, ...rest } = over;
  const trigger = rest.trigger ?? { text: 'where input is untrusted', status: 'supported' as const };
  const rate = posterior(k, n); const situation = trigger.text ? situationEffect(a, b, k - a, n - a - b - (k - a)) : null;
  return { id: 'm', aspect: 'Adversarial framing', observed: 'o', readAs: 'SOMETIMES', trigger, realisation: 'one sentence from the abusive caller', forbidden: 'never an attacker the diff does not expose',
    evidence: [{ piece: 'piece-1', quote: 'A caller can refund more than the order total', situationQuote: null }], situationOnly: [],
    rate, situation, kind: situation?.explains ? 'situational' : rate.pMajority > 0.5 ? 'standing' : 'occasional', pieces: k, corpus: n, scope: 'sentence', link: null, check: null, by: 'model', tabled: true, ...rest };
};
const text = '## Summary\nThe handler reads the amount from the body unchecked. A caller can send any amount and the gateway refunds it.\n\n## Verdict\nRequest changes';
const moves = [move({ id: 'adv' }), move({ id: 'stance', aspect: 'Impersonal', trigger: { text: null, status: 'none' }, k: 11, realisation: 'findings as bare statements' })];

describe('the reading as a value', () => {
  it('nothing to read decides by code; no model is not read; the prompt names each move with its situation, move, not-line and one instance', async () => {
    expect(MOVE_READER.decide({ text, request: 'r', moves: [] })).toEqual({});
    expect(MOVE_READER.decide({ text, request: 'r', moves })).toBeNull();
    const d = await readContext(MOVE_READER, { text, request: 'r', moves }, null, null, { spentUsd: 0, capUsd: 1 });
    expect(d.by).toBe('floor');
    expect(d.value).toEqual({ adv: { outcome: 'NOT_READ', quote: null, why: 'no model read the piece' }, stance: { outcome: 'NOT_READ', quote: null, why: 'no model read the piece' } });
    const prompt = MOVE_READER.prompt({ text, request: 'Review this change.', moves });
    expect(prompt).toContain('1. Adversarial framing\n   situation: where input is untrusted\n   the move: one sentence from the abusive caller\n   not: never an attacker the diff does not expose\n   as the writer once made it: "A caller can refund more than the order total"');
    expect(prompt).toContain('2. Impersonal\n   situation: none: how the writer always writes');
    expect(countOutcomes(d.value)).toEqual({ REALISED: 0, MISAPPLIED: 0, MISSING: 0, NOT_APPLICABLE: 0, NOT_READ: 2 });
  });
  it('realised and misapplied stand on a quote in the text; missing and not applicable need none; unclear and an invented quote are not read; past the cap is not read', () => {
    const input = { text, request: 'r', moves };
    const g = MOVE_READER.ground({ readings: [{ n: 1, outcome: 'REALISED', quote: 'A caller can send any amount', why: 'the abusive caller, in one sentence' }, { n: 2, outcome: 'MISSING', quote: null, why: 'says I' }] }, input)!;
    expect(g.adv).toEqual({ outcome: 'REALISED', quote: 'A caller can send any amount', why: 'the abusive caller, in one sentence' });
    expect(g.stance).toEqual({ outcome: 'MISSING', quote: null, why: 'says I' });
    const g2 = MOVE_READER.ground({ readings: [{ n: 1, outcome: 'MISAPPLIED', quote: 'an attacker takes over the page', why: 'x' }, { n: 2, outcome: 'UNCLEAR', quote: null, why: 'too short' }] }, input)!;
    expect(g2.adv).toEqual({ outcome: 'NOT_READ', quote: null, why: 'MISAPPLIED without a quote the text bears out' });
    expect(g2.stance).toEqual({ outcome: 'NOT_READ', quote: null, why: 'too short' });
    expect(MOVE_READER.ground({ readings: [{ n: 1, outcome: 'NOT_APPLICABLE', quote: null, why: 'docs only' }] }, input)!.stance.outcome).toBe('NOT_READ');
    expect(MOVE_READER.ground({ readings: [{ n: 9, outcome: 'REALISED', quote: text.slice(0, 10), why: '' }] }, input)).toBeNull();
    expect(MOVE_READER.ground({ nope: 1 }, input)).toBeNull();
    const many = Array.from({ length: READ_MOVES + 2 }, (_, i) => move({ id: `m${i}` }));
    const g3 = MOVE_READER.ground({ readings: [{ n: 1, outcome: 'MISSING', quote: null, why: '' }] }, { text, request: 'r', moves: many })!;
    expect(g3[`m${READ_MOVES}`].why).toBe('past the moves one call reads'); expect(g3[`m${READ_MOVES + 1}`].outcome).toBe('NOT_READ');
    expect(MOVE_READER.prompt({ text, request: 'r', moves: many })).not.toContain(`${READ_MOVES + 1}. `);
  });
});

// ── THROUGH A RUN ──────────────────────────────────────────────────────────────────────────────────────────────
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Add a Risks section when the change touches billing.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n4. Say what the reader should check next, as a judgement of what matters most.\n';
// the adversarial sentence in two of the four pieces, so the situation (shown with it there) explains the move
const body = (n: number): string => `I would start with the riskiest line. ${n <= 2 ? 'A caller can refund more than the order total. ' : ''}${'The change touches the runner and keeps its tests. '.repeat(n)}The handler trusts the caller.`;
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\n${body(n)}\n\n## Risks\nNone to billing.\n\n## Verdict\n${verdict}\n`;
const UNITS = { units: [
  { id: '1', kind: 'instruction', decision: 'what the change does', inputs: ['the diff'], condition: null, output: 'a Summary section', exception: null, dependsOn: [], quote: 'Open with a Summary section' },
  { id: '2', kind: 'instruction', decision: 'whether billing is touched', inputs: ['the diff'], condition: 'when the change touches billing', output: 'a Risks section', exception: null, dependsOn: ['1'], quote: 'Add a Risks section' },
  { id: '3', kind: 'instruction', decision: 'the verdict', inputs: [], condition: null, output: 'a Verdict section', exception: null, dependsOn: ['1', '2'], quote: 'End with a Verdict section' },
  { id: '4', kind: 'instruction', decision: 'what matters most', inputs: [], condition: null, output: 'a next check', exception: null, dependsOn: [], quote: 'Say what the reader should check next' },
] };
const PERSONA = { points: [
  { aspect: 'stance', description: 'Opens from a position of my own, not a summary.', frequency: 'ALWAYS', quote: 'I would start with the riskiest line.' },
  { aspect: 'Adversarial framing', description: 'Where input is untrusted, reasons from the caller who abuses it.', frequency: 'SOMETIMES', quote: 'A caller can refund more than the order total.' },
] };
const MOVES = { moves: [
  { point: 1, trigger: null, evidence: ['piece-1', 'piece-2', 'piece-3'].map((piece) => ({ piece, quote: 'I would start with the riskiest line.', situationQuote: null })), realisation: 'a position first', forbidden: null, scope: 'sentence', link: 1, check: null },
  { point: 2, trigger: 'where input is untrusted', evidence: ['piece-1', 'piece-2'].map((piece) => ({ piece, quote: 'A caller can refund more than the order total.', situationQuote: 'The handler trusts the caller.' })), realisation: 'one sentence from the abusive caller', forbidden: 'never an attacker the diff does not expose', scope: 'sentence', link: 1, check: null },
] };
const BRIEF = { placed: [{ n: 2, holds: 'DOES_NOT_HOLD', quote: 'touches nothing else' }], unsupported: [], contradicted: [] };
const CASES = { cases: [{ n: 1, holds: 'HOLDS', quote: 'straight from the request body' }] };
const DRAFT = '## Summary\nThe change takes the amount from the body and keeps the build green. Check the gateway logs next.\n\n## Verdict\nRequest changes\n';
const READINGS = { readings: [{ n: 1, outcome: 'MISSING', quote: null, why: 'no sentence from the abusive caller' }, { n: 2, outcome: 'REALISED', quote: 'The change takes the amount from the body', why: 'a bare statement' }] };
const REQUEST = 'Review this change: the handler now takes the refund amount straight from the request body, and touches nothing else.';

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--context-reader', 'scripted', '--reader-model', 'scripted'];
const callsFor = async (tool: string): Promise<number> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.filter((b) => (JSON.parse(b) as { tools?: { function?: { name?: string } }[] }).tools?.[0]?.function?.name === tool).length;
};

describe('through a run', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_method_units: UNITS, emit_holds_back: { ids: [] }, emit_persona: PERSONA, emit_persona_moves: MOVES, emit_execution_brief: BRIEF, emit_move_cases: CASES, emit_move_readings: READINGS, emit_piece: { piece: DRAFT } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('the placed and standing moves are read on the work by their own call, recorded, shown, summed by eval; the taste reader reads the same; nothing redrafts; --no-taste skips it', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-gc3-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gc3-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE);
    ['Approve', 'Request changes', 'Comment', 'Approve'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, i + 1)); });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    const L = { root: data, skillName: 'review' };
    expect(run('new', 'examples', '--method', 'method.md', '--name', 'review', '--yes', '--persona', 'auto', ...BACKEND()).code).toBe(0);
    const idOf = (out: string): string => (JSON.parse(out.slice(out.indexOf('\n{') + 1)) as { invocationId: string }).invocationId;
    // a run with no moves in play (--no-brief) first: the taste reader's own calls on this request
    const bare = run('invoke', '--skill', 'review', REQUEST, '--json', '--no-brief', ...BACKEND());
    expect(bare.code, bare.out).toBe(0);
    const tasteCallsBare = await callsFor('emit_readings');
    expect(await callsFor('emit_move_readings')).toBe(0);
    // with the moves placed: one call of its own; the taste reader made exactly as many calls as before
    const r = run('invoke', '--skill', 'review', REQUEST, '--json', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(await callsFor('emit_move_readings')).toBe(1);
    expect((await callsFor('emit_readings')) - tasteCallsBare).toBe(tasteCallsBare);
    expect(r.out).toMatch(/My moves, read on the work: 1 realised, 0 misapplied, 1 missing, 0 not applicable of 2 \(observed, not served; a reading, never a gate\)/);
    expect(r.out).toContain('Adversarial framing missing: no sentence from the abusive caller');
    const ev = listEvals(L).find((e) => e.invocationId === idOf(r.out))!;
    expect(ev.monitors.moves).toMatchObject({ mode: 'observe', by: 'model', realised: 1, misapplied: 0, missing: 1, notApplicable: 0, notRead: 0 });
    expect(ev.monitors.moves!.each.map((x) => [x.aspect, x.placed, x.outcome])).toEqual([['Adversarial framing', true, 'MISSING'], ['stance', false, 'REALISED']]);
    // kept with the run as an event, and the run's own state is untouched by the reading
    const events = store.readEvents(L).filter((e) => e.kind === 'MOVE_READING') as { invocationId: string; readings: Record<string, { outcome: string }> }[];
    expect(events.filter((e) => e.invocationId === idOf(r.out))).toHaveLength(1);
    expect(store.listInvocations(L).find((i) => i.invocationId === idOf(r.out))!.repair?.taste).toBeUndefined();
    // summed per move by eval
    const summary = run('eval', '--skill', 'review');
    expect(summary.code, summary.out).toBe(0);
    expect(summary.out).toContain('MY MOVES, READ ON THE WORK (1 run(s), 0 with the moves served; a reading, never a gate)');
    expect(summary.out).toMatch(/Adversarial framing\s+realised 0\/1 · misapplied 0 · missing 1 · not applicable 0/);
    expect(summary.out).toMatch(/stance\s+realised 1\/1 · misapplied 0 · missing 0/);
    // --no-taste skips the reading with the taste reader's
    const before = await callsFor('emit_move_readings');
    const nt = run('invoke', '--skill', 'review', REQUEST, '--json', '--no-taste', ...BACKEND());
    expect(nt.code, nt.out).toBe(0);
    expect(await callsFor('emit_move_readings')).toBe(before);
    expect(listEvals(L).find((e) => e.invocationId === idOf(nt.out))!.monitors.moves ?? null).toBeNull();
  }, 300_000);
});
