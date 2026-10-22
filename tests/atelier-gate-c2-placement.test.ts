// GATE C2: WHICH OF THE AUTHOR'S MOVES THIS REQUEST CALLS FOR, PLACED BY THE BRIEF'S READING AND SELECTED BY CODE
// (core/loop/execution-brief.ts). A standing move stands by itself; a situational one is placed only on a quote of the
// request or material showing its situation; unresolved is never placed (the reverse of a step); an occasional move
// never travels. Selection: not at a set-aside step, one move per scope and step, within the author's own rate (the sum
// of the posterior means), the better-evidenced first by posterior, zero an ordinary result. Served only under 'serve' (a run's --moves or the release);
// observed and recorded under the default. The standard is untouched.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EXECUTION_BRIEF, briefNote, selectMoves, type BriefStep } from '../core/loop/execution-brief.js';
import { MOVE_CASES, eligibleMoves } from '../core/loop/move-cases.js';
import { readContext } from '../core/inference/reading.js';
import type { MoveUnit } from '../core/compiler/moves.js';
import { posterior, situationEffect } from '../core/stats/habit.js';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const unit = (over: Record<string, unknown>) => ({ kind: 'instruction' as const, decision: null, inputs: [], condition: null, output: null, exception: null, dependsOn: [], quote: 'x', by: 'model' as const, ...over });
const steps: BriefStep[] = [
  { id: 'r1', n: 1, statement: 'Open with a Summary section.', required: true, unit: unit({ decision: 'what the change does' }) },
  { id: 'r2', n: 2, statement: 'Add a Risks section when the change touches billing.', required: true, unit: unit({ condition: 'when the change touches billing' }) },
  { id: 'r3', n: 3, statement: 'End with a Verdict section.', required: true, unit: unit({ decision: 'the verdict' }) },
];
const move = (over: Partial<MoveUnit> & { k?: number; n?: number; a?: number; b?: number }): MoveUnit => {
  const { k = 3, n = 12, a = 3, b = 0, ...rest } = over;
  const trigger = rest.trigger ?? { text: 'where input is untrusted', status: 'supported' as const };
  const rate = posterior(k, n); const situation = trigger.text ? situationEffect(a, b, k - a, n - a - b - (k - a)) : null;
  return { id: 'm', aspect: 'a', observed: 'o', readAs: 'SOMETIMES', trigger, realisation: 'one sentence from the abusive caller', forbidden: 'never an attacker the diff does not expose',
    evidence: [{ piece: 'piece-1', quote: 'A caller can refund more than the order total', situationQuote: 'trusts the caller' }], situationOnly: [], judged: [],
    rate, situation, kind: situation?.explains ? 'situational' : rate.pMajority > 0.5 ? 'standing' : 'occasional', pieces: k, corpus: n, scope: 'sentence', link: { step: '1', status: 'candidate' }, check: null, checkMeans: null, modality: 'passage', measured: [], measureAgrees: null, by: 'model', tabled: true, ...rest };
};
const units: MoveUnit[] = [
  move({ id: 'adv', aspect: 'Adversarial framing' }),
  move({ id: 'naming', aspect: 'Naming judgements', trigger: { text: 'when a name is awkward', status: 'supported' }, k: 2, a: 2, link: { step: '3', status: 'candidate' }, scope: 'sentence', realisation: 'one flat adjective, then the clearer name', forbidden: null }),
  move({ id: 'stance', aspect: 'Impersonal', readAs: 'ALWAYS', trigger: { text: null, status: 'none' }, k: 11, link: null }),
  // a habit seen in 3 of 12 whose situation does not explain it (made as often outside it): occasional, placed in no run
  move({ id: 'occ', aspect: 'Occasional', trigger: { text: 'when closing', status: 'proposed' }, k: 3, a: 1, b: 3 }),
];
const request = 'Review this change: the handler now takes the refund amount straight from the request body. The name tmp2 is awkward.';

describe('the moves, placed and selected', () => {
  it('an occasional move never travels; with no model a standing move stands and a situational one is unresolved, so nothing is placed', async () => {
    const eligible = eligibleMoves(units);
    expect(eligible.map((u) => u.id)).toEqual(['adv', 'naming', 'stance']);
    const d = await readContext(MOVE_CASES, { request, material: [], moves: eligible }, null, null, { spentUsd: 0, capUsd: 1 });
    expect(d.by).toBe('floor');
    expect(d.value).toEqual({ adv: { applies: 'unresolved', why: 'not read' }, naming: { applies: 'unresolved', why: 'not read' }, stance: { applies: 'applies', why: null } });
    const brief = EXECUTION_BRIEF.floor({ request, material: [], steps });
    const sel = selectMoves(d.value, brief, eligible, steps);
    expect(sel.placed).toEqual([]); expect(sel.standing.map((u) => u.id)).toEqual(['stance']); expect(sel.unresolved).toEqual(['adv', 'naming']);
    expect(briefNote(brief, steps, [], sel)).not.toContain('How I would make this');
    // nothing to read when no move has a case: a standing move applies by code; the brief's own reading is untouched
    expect(MOVE_CASES.decide({ request, material: [], moves: eligible })).toBeNull();
    expect(MOVE_CASES.decide({ request, material: [], moves: [units[2]] })).toEqual({ stance: { applies: 'applies', why: null } });
    expect(EXECUTION_BRIEF.version).toBe('6');
  });
  it('a move is placed only on a quote of the request or material; does not hold needs none; the prompt numbers the cases M1, M2', () => {
    const eligible = eligibleMoves(units);
    const prompt = MOVE_CASES.prompt({ request, material: [], moves: eligible });
    expect(prompt).toContain('Cases:\n1. where input is untrusted\n2. when a name is awkward');
    expect(prompt).not.toContain('3.');
    const g = MOVE_CASES.ground({ cases: [{ n: 1, holds: 'HOLDS', quote: 'straight from the request body' }, { n: 2, holds: 'HOLDS', quote: 'the name is ugly' }] }, { request, material: [], moves: eligible })!;
    expect(g.adv).toEqual({ applies: 'applies', why: '"straight from the request body"' });
    expect(g.naming).toEqual({ applies: 'unresolved', why: 'the reading could not quote the request' });
    expect(g.stance).toEqual({ applies: 'applies', why: null });
    const g2 = MOVE_CASES.ground({ cases: [{ n: 1, holds: 'DOES_NOT_HOLD', quote: null }, { n: 2, holds: 'HOLDS', quote: 'The name tmp2 is awkward' }] }, { request, material: [], moves: eligible })!;
    expect(g2.adv).toEqual({ applies: 'set-aside', why: 'not this case' });
    expect(g2.naming.applies).toBe('applies');
    // a case the reading did not answer stays unresolved; a quote in the material counts; nothing grounded is no reading
    const g3 = MOVE_CASES.ground({ cases: [{ n: 1, holds: 'HOLDS', quote: 'amount = body["amount"]' }] }, { request: 'Review this change.', material: [{ name: 'diff', head: '+ amount = body["amount"]' }], moves: eligible })!;
    expect(g3.adv.applies).toBe('applies'); expect(g3.naming.applies).toBe('unresolved');
    expect(MOVE_CASES.ground({ cases: [{ n: 9, holds: 'HOLDS', quote: null }] }, { request, material: [], moves: eligible })).toBeNull();
  });
  it('selection: not at a set-aside step, one per scope and step, within the author\'s rate, better-evidenced first by posterior; the note serves the placed ones only', () => {
    const eligible = eligibleMoves(units);
    const both = { placed: { r1: { applies: 'applies' as const, why: null }, r2: { applies: 'set-aside' as const, why: 'the request says "x"' }, r3: { applies: 'applies' as const, why: null } }, unsupported: [], contradicted: [], by: 'model' as const };
    const pl = { adv: { applies: 'applies' as const, why: '"straight from the request body"' }, naming: { applies: 'applies' as const, why: '"tmp2 is awkward"' }, stance: { applies: 'applies' as const, why: null } };
    const sel = selectMoves(pl, both, eligible, steps);
    // the rate: the posterior means 3.5/13 + 2.5/13 round to 0, floored to 1: one such move a piece, the better-evidenced first
    expect(sel.budget).toBe(1);
    expect(sel.placed.map((u) => u.id)).toEqual(['adv']);
    expect(sel.notPlaced).toEqual([{ id: 'naming', why: 'past the 1 such move(s) a piece of the author\'s carries' }]);
    const note = briefNote(both, steps, [], sel);
    expect(note).toContain('How I would make this, as myself:\n- at step 1: where input is untrusted: one sentence from the abusive caller, as in "A caller can refund more than the order total" (3 of the 3 of my pieces in this situation). Not: never an attacker the diff does not expose.');
    expect(note).not.toContain('Naming judgements'); expect(note).not.toContain('Impersonal');
    // observed: the same selection, nothing served
    expect(briefNote(both, steps, [], null)).not.toContain('How I would make this');
    // a move at a step set aside for this request is not placed, whatever the reading said
    const placedToo = (...ids: string[]) => ({ ...pl, ...Object.fromEntries(ids.map((id) => [id, { applies: 'applies' as const, why: '"x"' }])) });
    const atAside = selectMoves(placedToo('risk'), both, [move({ id: 'risk', link: { step: '2', status: 'candidate' } }), ...eligible], steps);
    expect(atAside.notPlaced).toContainEqual({ id: 'risk', why: 'at step 2, set aside for this request' });
    // one piece is not a floor: a move seen once, in its situation, is a candidate with a wide interval, ranked by its posterior; two moves of one scope at one step: the second is not placed
    const thin = selectMoves(placedToo('one', 'twin'), both, [move({ id: 'one', k: 1, a: 1 }), move({ id: 'twin', aspect: 'Twin', k: 3 }), ...eligible], steps);
    expect(thin.placed.map((u) => u.id)).toEqual(['adv']);
    expect(thin.notPlaced.find((x) => x.id === 'one')?.why).toBe('another move of the same scope at step 1');
    expect(thin.notPlaced.find((x) => x.id === 'twin')?.why).toBe('another move of the same scope at step 1');
    // a rare move the request calls for outranks a frequent one it does not: only a holding situation makes a candidate
    const rare = selectMoves({ ...pl, adv: { applies: 'set-aside', why: 'not this case' } }, both, eligible, steps);
    expect(rare.placed.map((u) => u.id)).toEqual(['naming']);
    expect(rare.notPlaced).toContainEqual({ id: 'adv', why: 'not this case' });
  });
});

// ── THROUGH A RUN ──────────────────────────────────────────────────────────────────────────────────────────────
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Add a Risks section when the change touches billing.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
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
const MOVES = { moves: [
  { point: 1, trigger: null, evidence: ['piece-1', 'piece-2', 'piece-3'].map((piece) => ({ piece, quote: 'I would start with the riskiest line.', situationQuote: null })), realisation: 'a position first', forbidden: null, scope: 'sentence', link: 1, check: null },
  { point: 2, trigger: 'where input is untrusted', evidence: ['piece-1', 'piece-2'].map((piece) => ({ piece, quote: 'A caller can refund more than the order total.', situationQuote: 'The handler trusts the caller.' })), realisation: 'one sentence from the abusive caller', forbidden: 'never an attacker the diff does not expose', scope: 'sentence', link: 1, check: null },
] };
const BRIEF = { placed: [{ n: 2, holds: 'DOES_NOT_HOLD', quote: 'touches nothing else' }], unsupported: [], contradicted: [] };
const CASES = { cases: [{ n: 1, holds: 'HOLDS', quote: 'straight from the request body' }] };
const DRAFT = '## Summary\nThe change takes the amount from the body and keeps the build green.\n\n## Verdict\nRequest changes\n';
const REQUEST = 'Review this change: the handler now takes the refund amount straight from the request body, and touches nothing else.';

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--context-reader', 'scripted'];
const promptsFor = async (tool: string): Promise<string[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.map((b) => JSON.parse(b) as { tools?: { function?: { name?: string } }[]; messages?: { content?: string }[] })
    .filter((b) => b.tools?.[0]?.function?.name === tool).map((b) => (b.messages ?? []).map((m) => m.content ?? '').join('\n'));
};

describe('through a run', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_method_units: UNITS, emit_holds_back: { ids: [] }, emit_persona: PERSONA, emit_persona_moves: MOVES, emit_execution_brief: BRIEF, emit_move_cases: CASES, emit_piece: { piece: DRAFT } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('not read unasked; observed and recorded under --moves observe; served under --moves serve; none on a short request or without the brief', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-gc2-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gc2-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE);
    ['Approve', 'Request changes', 'Comment', 'Approve'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, i + 1)); });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    const L = { root: data, skillName: 'review' };
    const b = run('new', 'examples', '--method', 'method.md', '--name', 'review', '--yes', '--persona', 'auto', '--report', ...BACKEND());
    expect(b.code, b.out).toBe(0);
    expect(b.out).toContain('Moves: 2 moves: 1 standing, 1 situational, 0 occasional');
    const idOf = (out: string): string => (JSON.parse(out.slice(out.indexOf('\n{') + 1)) as { invocationId: string }).invocationId;
    const recOf = (out: string) => store.listInvocations(L).find((i) => i.invocationId === idOf(out))!;
    // THE DEFAULT: a reading that would be served to no one and act on nothing is not made (the v6 study: it doubled
    // the cost of short work and changed no text)
    const none = (await promptsFor('emit_move_cases')).length;
    const d = run('invoke', '--skill', 'review', REQUEST, '--json', ...BACKEND());
    expect(d.code, d.out).toBe(0);
    expect((await promptsFor('emit_move_cases')).length).toBe(none);
    expect(d.out).not.toMatch(/Moves of mine for this request/);
    expect(recOf(d.out).settings!.flags.brief!.moves).toBeUndefined();
    // OBSERVE, ASKED: the case was read, the move placed and recorded; the writer was served nothing of it
    const r = run('invoke', '--skill', 'review', REQUEST, '--json', '--moves', 'observe', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect((await promptsFor('emit_move_cases')).at(-1) ?? '').toContain('Cases:\n1. where input is untrusted');
    expect((await promptsFor('emit_execution_brief')).at(-1) ?? '').not.toContain('where input is untrusted');
    let piece = (await promptsFor('emit_piece')).at(-1) ?? '';
    expect(piece).toContain("For this request, my method's steps that apply: 1, 3.");
    expect(piece).not.toContain('How I would make this');
    expect(r.out).toMatch(/Moves of mine for this request: 1 placed \(observed, not served; about 1 a piece\), 1 standing/);
    const rec = recOf(r.out);
    const profile = store.getReceipt(L, store.getActive(L)!)!.movesHash!;
    expect(rec.settings!.flags.brief!.moves).toMatchObject({ by: 'model', mode: 'observe', profile, placed: [expect.stringMatching(/./)], standing: [expect.stringMatching(/./)], notPlaced: [], unresolved: [], budget: 1 });
    // SERVE, ASKED FOR THIS RUN: the placed move is in the brief, with its situation, one instance and what it is not
    const s = run('invoke', '--skill', 'review', REQUEST, '--json', '--moves', 'serve', ...BACKEND());
    expect(s.code, s.out).toBe(0);
    piece = (await promptsFor('emit_piece')).at(-1) ?? '';
    expect(piece).toContain('How I would make this, as myself:\n- at step 1: where input is untrusted: one sentence from the abusive caller, as in "A caller can refund more than the order total." (2 of the 2 of my pieces in this situation). Not: never an attacker the diff does not expose.');
    expect(piece).not.toContain('Opens from a position of my own, not a summary.\n- '); // the standing trait is not served again in the brief
    expect(recOf(s.out).settings!.flags.brief!.moves!.mode).toBe('serve');
    expect(run('invoke', '--skill', 'review', REQUEST, '--json', '--moves', 'sometimes', ...BACKEND()).out).toContain('--moves is observe or serve');
    // THE STANDARD IS UNTOUCHED
    expect(store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!.requirements.filter((q) => q.provenance === 'EXPERT_STATED')).toHaveLength(3);
    // NO BRIEF, NO MOVES; A SHORT REQUEST, NONE
    const before = (await promptsFor('emit_move_cases')).length;
    const nb = run('invoke', '--skill', 'review', REQUEST, '--json', '--no-brief', '--moves', 'serve', ...BACKEND());
    expect(nb.code, nb.out).toBe(0);
    expect(recOf(nb.out).settings!.flags.brief).toBeUndefined();
    expect((await promptsFor('emit_piece')).at(-1) ?? '').not.toContain('How I would make this');
    const short = run('invoke', '--skill', 'review', 'Thanks, done.', '--json', '--moves', 'serve', ...BACKEND());
    expect(short.code, short.out).toBe(0);
    expect((await promptsFor('emit_move_cases')).length).toBe(before);
    expect(recOf(short.out).settings!.flags.brief).toBeUndefined();
  }, 300_000);
});
