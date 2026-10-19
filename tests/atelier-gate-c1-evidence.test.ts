// THE EVIDENCE PASS (core/compiler/moves.ts): a standing habit the first reading quoted from fewer than three pieces is
// looked for in the pieces it left out, once, grounded like the first reading; applicability is recomputed by code; a
// unit that stays UNKNOWN is marked as sought, so "seen in few pieces" is told apart from "uncollected". The authority
// ceiling is unchanged: nothing here raises evidence past observed or permission past monitor.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PERSONA_EVIDENCE, PERSONA_MOVES, wantsEvidence, collectEvidence, describeMove, personaHashOf, type MovesInput } from '../core/compiler/moves.js';
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

describe('the pass as a value', () => {
  it('wants only a standing habit short of three pieces in a corpus of three or more, read by a model', () => {
    expect(firstPass.map((u) => [u.frequency, u.pieces, u.applicability])).toEqual([['ALWAYS', 1, 'UNKNOWN'], ['SOMETIMES', 1, 'UNKNOWN']]);
    expect(wantsEvidence(firstPass, 4).map((u) => u.aspect)).toEqual(['Impersonal point of view']);
    expect(wantsEvidence(firstPass, 2)).toEqual([]);
    expect(wantsEvidence(PERSONA_MOVES.floor(input), 4)).toEqual([]);
  });
  it('a quote is kept only verbatim, from a piece not yet evidenced, one per piece; applicability is recomputed; the unit says the pass ran', async () => {
    const sought = wantsEvidence(firstPass, 4);
    const ask = { points: sought.map((u) => ({ n: 1, aspect: u.aspect, description: u.observed, quote: points[0].quote, have: ['piece-1'] })), pieces };
    expect(PERSONA_EVIDENCE.decide({ points: [], pieces })).toEqual({});
    expect(PERSONA_EVIDENCE.decide(ask)).toBeNull();
    expect((await readContext(PERSONA_EVIDENCE, ask, null, null, { spentUsd: 0, capUsd: 1 })).by).toBe('floor');
    const g = PERSONA_EVIDENCE.ground({ evidence: [
      { point: 1, piece: 'piece-2', quote: 'The handler trusts the body.' },
      { point: 1, piece: 'piece-2', quote: 'Validate the amount before the charge.' },   // a second quote from one piece: dropped
      { point: 1, piece: 'piece-1', quote: 'The loop stops one short.' },                 // already evidenced: dropped
      { point: 1, piece: 'piece-3', quote: 'the tests cover everything' },               // not verbatim: dropped
      { point: 1, piece: 'piece-9', quote: 'The migration is reversible' },               // no such piece: dropped
      { point: 7, piece: 'piece-3', quote: 'The migration is reversible' },               // no such habit: dropped
    ] }, ask)!;
    expect(g[1]).toEqual([{ piece: 'piece-2', quote: 'The handler trusts the body.', situationQuote: null }]);
    const merged = collectEvidence(firstPass, g, sought);
    expect(merged[0]).toMatchObject({ pieces: 2, applicability: 'UNKNOWN', evidenceSought: true });
    expect(merged[1]).toMatchObject({ pieces: 1, applicability: 'UNKNOWN' }); expect(merged[1].evidenceSought).toBeUndefined();
    expect(describeMove(merged[0])).toContain('UNKNOWN (sought in every piece: seen in few)');
    // three pieces, and the habit is general: still monitor, still observed
    const g3 = PERSONA_EVIDENCE.ground({ evidence: [{ point: 1, piece: 'piece-2', quote: 'The handler trusts the body.' }, { point: 1, piece: 'piece-3', quote: 'The migration is reversible' }] }, ask)!;
    const general = collectEvidence(firstPass, g3, sought);
    expect(general[0]).toMatchObject({ pieces: 3, applicability: 'GENERAL', provisional: false, evidenceSought: true });
    expect(PERSONA_EVIDENCE.ground({ evidence: [] }, ask)).toBeNull();
  });
});

// ── THROUGH THE BUILD ──────────────────────────────────────────────────────────────────────────────────────────
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Then a Must fix section.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
const body = (n: number): string => `I would start with the riskiest line. ${Array.from({ length: n }, (_, i) => `The change touches part ${i + 1} of the runner and keeps its tests.`).join(' ')} Tests first, then the rest.`;
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\n${body(n)}\n\n## Must fix\nNone.\n\n## Verdict\n${verdict}\n`;
const PERSONA = { points: [
  { aspect: 'stance', description: 'Opens from a position of my own, not a summary.', frequency: 'ALWAYS', quote: 'I would start with the riskiest line.' },
  { aspect: 'close', description: 'Closes on a short plain instruction.', frequency: 'OFTEN', quote: 'Tests first, then the rest.' },
] };
// the first reading quotes each habit from one piece only
const MOVES = { moves: [
  { point: 1, trigger: null, evidence: [{ piece: 'piece-1', quote: 'I would start with the riskiest line.', situationQuote: null }], realisation: 'a position first', forbidden: null, scope: 'sentence', link: 1, check: null },
  { point: 2, trigger: null, evidence: [{ piece: 'piece-1', quote: 'Tests first, then the rest.', situationQuote: null }], realisation: 'a short instruction last', forbidden: null, scope: 'sentence', link: 3, check: null },
] };
// the pass finds the first habit in every other piece, the second in one more
const EVIDENCE = { evidence: [
  ...['piece-2', 'piece-3', 'piece-4'].map((piece) => ({ point: 1, piece, quote: 'I would start with the riskiest line.' })),
  { point: 2, piece: 'piece-2', quote: 'Tests first, then the rest.' },
] };

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
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_persona: PERSONA, emit_persona_moves: MOVES, emit_persona_evidence: EVIDENCE, emit_holds_back: { ids: [] } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('the pass runs once for the standing habits short of three pieces; a habit found in every piece becomes general, one found in two stays unknown and says the pass ran; the standard is untouched', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-gce-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gce-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE);
    ['Approve', 'Request changes', 'Comment', 'Approve'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, i + 1)); });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [resolve('dist/cli/atelier.mjs'), ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    const r = run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report', '--persona', 'auto', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect((await toolsCalled()).filter((t) => t === 'emit_persona_evidence')).toHaveLength(1);
    expect(r.out).toContain('Moves: 2 moves: 1 general, 0 conditional, 1 unknown, evidence sought in every piece for 2 standing habit(s)');
    expect(r.out).toContain('GENERAL · stance · seen in 4 of 4 piece(s)');
    expect(r.out).toContain('UNKNOWN (sought in every piece: seen in few) · close · seen in 2 of 4 piece(s)');
    const L = { root: data, skillName: 'code-review' };
    const sv = store.getSkillVersion(L, store.getActive(L)!)!;
    const profile = store.getMovesByHash(L, store.getReceipt(L, sv.skillVersionHash)!.movesHash!)!;
    expect(profile.units.map((u) => [u.applicability, u.pieces, u.evidenceSought ?? false])).toEqual([['GENERAL', 4, true], ['UNKNOWN', 2, true]]);
    expect(store.getMoves(L, personaHashOf(PERSONA.points as PersonaPoint[]))!.hash).toBe(profile.hash);
    expect(store.getStandard(L, sv.standardVersionHash)!.requirements.filter((q) => q.provenance === 'EXPERT_STATED')).toHaveLength(3);
  }, 240_000);
});
