// GATE C1: THE AUTHOR'S MOVES COMPILED FROM THE PERSONA, GROUNDED IN THE PIECES, OF A STATED APPLICABILITY
// (core/compiler/moves.ts). A trigger is supported only by a situation quote from the same piece as the evidence;
// the no-model floor is UNKNOWN, never general; the id is a content hash; the profile is immutable and named by the
// build receipt; the standard is untouched.
import { describe, it, expect } from 'vitest';
import { PERSONA_MOVES, MIN_EVIDENCE_WORDS, applicabilityOf, moveFloor, moveId, personaHashOf, profileOf, describeMove, describeMoves, type MovesInput } from '../core/compiler/moves.js';
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

describe('applicability is decided by code', () => {
  it('general needs ALWAYS in three pieces, or every piece of a small corpus (provisional); conditional needs a supported trigger; the rest is unknown', () => {
    expect(applicabilityOf('ALWAYS', 'none', 3, 12)).toEqual({ applicability: 'GENERAL', provisional: false });
    expect(applicabilityOf('ALWAYS', 'none', 2, 12)).toEqual({ applicability: 'UNKNOWN', provisional: false });
    expect(applicabilityOf('ALWAYS', 'none', 2, 2)).toEqual({ applicability: 'GENERAL', provisional: true });
    expect(applicabilityOf('ALWAYS', 'none', 1, 1)).toEqual({ applicability: 'GENERAL', provisional: true });
    expect(applicabilityOf('OFTEN', 'none', 12, 12)).toEqual({ applicability: 'UNKNOWN', provisional: false });
    expect(applicabilityOf('SOMETIMES', 'supported', 2, 12)).toEqual({ applicability: 'CONDITIONAL', provisional: false });
    expect(applicabilityOf('SOMETIMES', 'proposed', 2, 12)).toEqual({ applicability: 'UNKNOWN', provisional: false });
    expect(applicabilityOf('ALWAYS', 'supported', 1, 12)).toEqual({ applicability: 'CONDITIONAL', provisional: false });
  });
  it('the floor is UNKNOWN with the point\'s own quote as evidence, and the id is a content hash of aspect and quote', () => {
    const f = moveFloor(points[0], pieces);
    expect(f).toMatchObject({ applicability: 'UNKNOWN', trigger: { text: null, status: 'none' }, scope: 'UNKNOWN', link: null, check: null, by: 'floor', pieces: 1, corpus: 3 });
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
    expect(d.value.map((u) => u.applicability)).toEqual(['UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  });
  it('a supported trigger: situation quotes from the same pieces; the link is a candidate; the forbidden line a negation', () => {
    const g = PERSONA_MOVES.ground(raw([m1]), input)!;
    expect(g[0]).toMatchObject({ applicability: 'CONDITIONAL', trigger: { text: 'where input is untrusted', status: 'supported' }, pieces: 2, corpus: 3, scope: 'paragraph', link: { step: '2', status: 'candidate' }, forbidden: 'never an attacker the diff does not expose', by: 'model' });
    expect(g[0].evidence).toHaveLength(2);
    // the other points, unanswered, fall to the floor
    expect(g[1]).toMatchObject({ by: 'floor', applicability: 'UNKNOWN' });
    expect(g[2]).toMatchObject({ by: 'floor' });
    expect(g.filter((u) => u.applicability !== 'UNKNOWN').map((u) => u.aspect)).toEqual(['Adversarial framing']);
    expect(describeMove(g[0])).toBe('CONDITIONAL · Adversarial framing · when: "where input is untrusted" (shown in 2 piece(s)) · seen in 2 of 3 piece(s) · scope: paragraph · at step 2 (candidate) · not: never an attacker the diff does not expose');
    expect(describeMoves(g)).toBe('3 moves: 0 general, 1 conditional, 2 unknown');
  });
  it('a situation quote from another piece, or not verbatim, does not support the trigger: proposed, so UNKNOWN', () => {
    const cross = { ...m1, evidence: [{ piece: 'piece-1', quote: 'A caller can refund more than the order total', situationQuote: 'The input comes straight from the form' }] };
    const g = PERSONA_MOVES.ground(raw([cross]), input)!;
    expect(g[0]).toMatchObject({ trigger: { status: 'proposed' }, applicability: 'UNKNOWN', pieces: 1 });
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
    expect(g[1]).toMatchObject({ trigger: { text: null, status: 'none' }, scope: 'UNKNOWN', link: null, check: null, forbidden: null, by: 'model' });
    expect(g[1].evidence.map((e) => e.piece)).toEqual(['piece-1', 'piece-3']);
    expect(g[1].evidence.every((e) => e.situationQuote === null)).toBe(true);
    // ALWAYS in two distinct pieces of three is not general
    expect(g[1].applicability).toBe('UNKNOWN');
    const g2 = PERSONA_MOVES.ground(raw([{ point: 2, trigger: null, evidence: [{ piece: 'piece-1', quote: 'Use `>=` so the state is correct', situationQuote: null }, { piece: 'piece-3', quote: 'Use `>=` so the state is correct', situationQuote: null }, { piece: 'piece-2', quote: 'is awkward: rename it', situationQuote: null }], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: 'question' }]), input)!;
    expect(g2[1]).toMatchObject({ applicability: 'GENERAL', provisional: false, pieces: 3, check: 'question', scope: 'sentence' });
    // a quote of one or two words shows that a line exists, not how a move is made: never evidence
    expect(MIN_EVIDENCE_WORDS).toBe(3);
    const bare = PERSONA_MOVES.ground(raw([{ point: 2, trigger: null, evidence: [{ piece: 'piece-1', quote: 'The handler', situationQuote: null }, { piece: 'piece-2', quote: 'rename it.', situationQuote: null }], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: null }]), input)!;
    expect(bare[1].evidence.map((e) => e.piece)).toEqual(['piece-1']);
    // unless the move is a short line by its own quote: then a short quote is at the move's grain
    const terse = { ...input, points: [{ aspect: 'Abrupt closing', description: 'Ends on a terse verdict line.', frequency: 'ALWAYS' as const, quote: 'rename it.' }] };
    const ok = PERSONA_MOVES.ground(raw([{ point: 1, trigger: null, evidence: [{ piece: 'piece-2', quote: 'rename it.', situationQuote: null }, { piece: 'piece-1', quote: 'The handler', situationQuote: null }, { piece: 'piece-3', quote: 'keeps its tests.', situationQuote: null }], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: null }]), terse)!;
    expect(ok[0]).toMatchObject({ pieces: 3, applicability: 'GENERAL' });
    expect(PERSONA_MOVES.ground(raw([{ point: 9, trigger: null, evidence: [], realisation: 'x', forbidden: null, scope: 'sentence', link: null, check: null }]), input)).toBeNull();
    expect(PERSONA_MOVES.ground({ nope: 1 }, input)).toBeNull();
  });
  it('a profile is named by its content and its persona; the time is outside the hash', () => {
    const g = PERSONA_MOVES.ground(raw([m1]), input)!;
    const a = profileOf(g, personaHashOf(points), 'scripted', pieces, '2026-10-19T00:00:00Z');
    const b = profileOf(g, personaHashOf(points), 'scripted', pieces, '2026-10-20T00:00:00Z');
    expect(a.hash).toBe(b.hash); expect(a.hash).toHaveLength(12);
    expect(a.personaHash).toBe(personaHashOf(points));
    expect(profileOf(PERSONA_MOVES.floor(input), personaHashOf(points), null, pieces).hash).not.toBe(a.hash);
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
const body = (n: number): string => `I would start with the riskiest line. ${Array.from({ length: n }, (_, i) => `The change touches part ${i + 1} of the runner and keeps its tests.`).join(' ')} Tests first, then the rest.`;
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\n${body(n)}\n\n## Must fix\nNone.\n\n## Verdict\n${verdict}\n`;
const PERSONA = { points: [
  { aspect: 'stance', description: 'Opens from a position of my own, not a summary.', frequency: 'ALWAYS', quote: 'I would start with the riskiest line.' },
  { aspect: 'close', description: 'Closes on a short plain instruction.', frequency: 'OFTEN', quote: 'Tests first, then the rest.' },
] };
// one move answered for point 1 (its quote stands in every piece, so general); point 2 unanswered falls to the floor
// ADVERSARIAL: point 2 comes back with a trigger no piece shows (an invented situation quote), the same quote twice from one
// piece, a link to a step the method does not have, and a "forbidden" line that is an instruction: proposed, so UNKNOWN;
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
    expect(r.out).toContain('Moves: 2 moves: 1 general, 0 conditional, 1 unknown, read from the persona and your pieces.');
    expect(r.out).toContain('What my moves are, and when I make them:');
    expect(r.out).toContain('GENERAL · stance · seen in 3 of 4 piece(s) · scope: sentence · at step 1 (candidate) · not: never a summary first');
    expect(r.out).toContain('UNKNOWN · close · when: "when the reader has a next step" (proposed, no piece shows the situation) · seen in 1 of 4 piece(s) · scope: sentence');
    expect(r.out).toMatch(/· moves ✓ \(2 moves: 1 general, 0 conditional, 1 unknown\) ·/);
    const sv = activeOf(withModel.data);
    const receipt = store.getReceipt(L(withModel.data), sv.skillVersionHash)!;
    const profile = store.getMoves(L(withModel.data), personaHashOf(PERSONA.points as PersonaPoint[]))!;
    expect(profile).not.toBeNull();
    expect(receipt.movesHash).toBe(profile.hash);
    expect(profile.reader).toBe('scripted');
    expect(profile.units.map((u) => u.applicability)).toEqual(['GENERAL', 'UNKNOWN']);
    expect(profile.units[0]).toMatchObject({ pieces: 3, corpus: 4, link: { step: '1', status: 'candidate' }, by: 'model' });
    // THE PERSISTED RECORD IS TRUTHFUL ON THE ADVERSARIAL POINT: proposed trigger, one evidence with no situation, no link, no forbidden line
    expect(profile.units[1]).toMatchObject({ applicability: 'UNKNOWN', trigger: { text: 'when the reader has a next step', status: 'proposed' }, pieces: 1, link: null, forbidden: null, by: 'model' });
    expect(profile.units[1].evidence).toEqual([{ piece: 'piece-1', quote: 'Tests first, then the rest.', situationQuote: null }]);
    expect(profile.pieces.map((x) => x.name)).toEqual(['piece-1', 'piece-2', 'piece-3', 'piece-4']);
    // the profile on disk is the one the receipt names, by its own hash
    expect(store.getMovesByHash(L(withModel.data), receipt.movesHash!)!.hash).toBe(profile.hash);
    // THE STANDARD IS UNTOUCHED: the same hash and requirements as a build with no model at all
    expect(without.run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report').code).toBe(0);
    expect(activeOf(without.data).standardVersionHash).toBe(sv.standardVersionHash);
    expect(store.getReceipt(L(without.data), activeOf(without.data).skillVersionHash)!.movesHash).toBeNull();
    // THE PACKAGE CARRIES NOTHING OF IT: the profile is beside the voice, not in the skill
    const skillMd = readFileSync(join(withModel.proj, '.claude', 'skills', 'code-review', 'SKILL.md'), 'utf8');
    expect(skillMd).not.toContain('never a summary first'); expect(skillMd).not.toContain('What my moves');
    // A REBUILD WITH THE SAME PERSONA READS NOTHING AGAIN
    const before = (await toolsCalled()).filter((t) => t === 'emit_persona_moves').length;
    expect(before).toBe(1);
    const again = withModel.run('build', '--name', 'code-review', '--report', ...BACKEND());
    expect(again.code, again.out).toBe(0);
    expect(again.out).toMatch(/· moves ✓ \(2 moves: 1 general, 0 conditional, 1 unknown \(kept\)\) ·/);
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
