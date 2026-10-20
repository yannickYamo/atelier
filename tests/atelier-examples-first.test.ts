// EXAMPLES FIRST (cli/commands/invoke.ts, cli/served.ts): one run flag serves the writer the author's pieces, the
// method and the rules with no description of the author (no "How I sound" points, no repertoire, no move in the
// brief), forces the moves to observe, and records the mode on the run. The move reader still reads the work
// afterwards; nothing of the profile authorises a repair. The build, the skill on disk and every other run are
// unchanged: the next run without the flag is served the description again.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { withoutPersonaBlocks } from '../cli/served.js';
import * as store from '../core/state/store.js';
import { listEvals } from '../core/state/eval-store.js';

describe('the skill without the description of the author', () => {
  it('drops the two blocks and their lists, keeps everything else, and leaves a skill without them as it is', () => {
    const md = 'Intro.\n\nHow I sound (each point is quoted from my own pieces):\n\n- (always) Opens from a position.\n- (often) Closes short.\n\nMoves I make in some pieces, not most (what I do when a piece calls for it):\n\n- (in 2 of 4 pieces) a concession.\n\n`examples/voice-1.md` is a whole piece of mine.\n\nNever take my topics.';
    expect(withoutPersonaBlocks(md)).toBe('Intro.\n\n`examples/voice-1.md` is a whole piece of mine.\n\nNever take my topics.');
    expect(withoutPersonaBlocks('Intro.\n\nNothing here.')).toBe('Intro.\n\nNothing here.');
  });
});

// ── THROUGH A RUN ──────────────────────────────────────────────────────────────────────────────────────────────
const CLI = resolve('dist/cli/atelier.mjs');
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Add a Risks section when the change touches billing.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
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
const READINGS = { readings: [{ n: 1, outcome: 'MISSING', quote: null, why: 'no sentence from the abusive caller' }, { n: 2, outcome: 'REALISED', quote: 'The change takes the amount from the body', why: 'a bare statement' }] };
const DRAFT = '## Summary\nThe change takes the amount from the body and keeps the build green.\n\n## Verdict\nRequest changes\n';
const REQUEST = 'Review this change: the handler now takes the refund amount straight from the request body, and touches nothing else.';

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--context-reader', 'scripted', '--reader-model', 'scripted'];
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
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_method_units: UNITS, emit_holds_back: { ids: [] }, emit_persona: PERSONA, emit_persona_moves: MOVES, emit_execution_brief: BRIEF, emit_move_cases: CASES, emit_move_readings: READINGS, emit_piece: { piece: DRAFT } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('the writer is served the pieces, the method and the rules and no description; the moves are read, not served; the run says so; the next run is served the description again', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-exf-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-exf-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE);
    ['Approve', 'Request changes', 'Comment', 'Approve'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, i + 1)); });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    const L = { root: data, skillName: 'review' };
    const b = run('new', 'examples', '--method', 'method.md', '--name', 'review', '--yes', '--persona', 'auto', ...BACKEND());
    expect(b.code, b.out).toBe(0);
    const skillMd = readFileSync(join(proj, '.claude', 'skills', 'review', 'SKILL.md'), 'utf8');
    expect(skillMd).toContain('How I sound ('); expect(skillMd).toContain('Moves I make in some pieces');
    const idOf = (out: string): string => (JSON.parse(out.slice(out.indexOf('\n{') + 1)) as { invocationId: string }).invocationId;
    const recOf = (out: string) => store.listInvocations(L).find((i) => i.invocationId === idOf(out))!;
    // EXAMPLES FIRST, with --moves serve asked for as well: the flag wins, nothing of the author's description reaches the writer
    const r = run('invoke', '--skill', 'review', REQUEST, '--json', '--examples-first', '--moves', 'serve', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const piece = (await promptsFor('emit_piece')).at(-1) ?? '';
    expect(piece).not.toContain('How I sound ('); expect(piece).not.toContain('Moves I make in some pieces'); expect(piece).not.toContain('How I would make this');
    expect(piece).not.toContain('Opens from a position of my own'); expect(piece).not.toContain('reasons from the caller who abuses it');
    // the pieces, the method and the brief's steps are still there
    expect(piece).toContain('I would start with the riskiest line.'); expect(piece).toContain('Open with a Summary section'); expect(piece).toContain("For this request, my method's steps that apply: 1, 3.");
    expect(r.out).toContain('Examples first: served without the description of how I sound or my repertoire; my moves are read on the work and never served.');
    expect(r.out).toMatch(/Moves of mine for this request: 1 placed \(observed, not served/);
    const rec = recOf(r.out);
    expect(rec.settings.flags.brief!.served).toBe('examples-first');
    expect(rec.settings.flags.brief!.moves!.mode).toBe('observe');
    // the move reader still read the work, and nothing was repaired on the profile's account
    const ev = listEvals(L).find((e) => e.invocationId === idOf(r.out))!;
    expect(ev.monitors.moves).toMatchObject({ mode: 'observe', by: 'model', realised: 1, missing: 1 });
    expect(rec.repair?.taste).toBeUndefined();
    // THE NEXT RUN WITHOUT THE FLAG IS SERVED THE DESCRIPTION AGAIN, and the skill on disk is unchanged
    const s = run('invoke', '--skill', 'review', REQUEST, '--json', '--moves', 'serve', ...BACKEND());
    expect(s.code, s.out).toBe(0);
    const again = (await promptsFor('emit_piece')).at(-1) ?? '';
    expect(again).toContain('How I sound ('); expect(again).toContain('How I would make this');
    expect(recOf(s.out).settings.flags.brief!.served).toBeUndefined();
    expect(readFileSync(join(proj, '.claude', 'skills', 'review', 'SKILL.md'), 'utf8')).toBe(skillMd);
  }, 300_000);
});
