// tests/atelier-owner-ban-tells.test.ts — THE OWNER'S BAN HOLDS AGAINST THE EXAMPLES, AND A CONTRAST IS READ HOWEVER IT IS TYPED.
//
// The defect (round 4, item 1), found by building one case-shaped fixture on the version before rounds 1-3 and on the
// branch, with a scripted writer that puts em dashes, a contrastive verdict and a verdict opener in its draft:
//   1. Round 1 made a typed double hyphen a dash (core/observers/tells.ts, `DASH`). The method build reads the examples
//      for the machine-tell rule, where a move any example makes is the author's (core/method/standard.ts, `tellOffers`).
//      The author types "--" in 4 of 5 pieces, so the em dash stopped being banned and a cap at their rate was added
//      ("Keep em dashes (—) to at most 20.5 per 1,000 words, as the examples do."), required and told to the writer, beside
//      the owner's own "No em dashes.". Where the owner's step was held as judgement, nothing counted the dashes and the
//      dash repair (which fires only on a counted ban) never ran: 2 em dashes delivered, 0 before.
//   2. The step-check reading was never told that a step banning a construction the list names is that count at zero, so
//      a ban could be read as judgement or a written check.
//   3. The "not X, it's Y" count read only straight apostrophes: "isn’t …, it’s …" as a model types it was never counted,
//      so a contrastive verdict passed the owner's counted ban.
// Metric: tells delivered = 0 on the fixture; em dashes = 0 under the ban. Expected values are written out by hand.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { tellOffers, type MethodProposal } from '../core/method/standard.js';
import { findPattern } from '../core/observers/style.js';
import { STEP_CHECK_SYSTEM } from '../core/method/step-check.js';

const FX = resolve('tests/fixtures/reaction-case');
const PIECES = readdirSync(join(FX, 'voice')).sort().map((f) => ({ id: f, reference: readFileSync(join(FX, 'voice', f), 'utf8') }));
const DRAFT = readFileSync(join(FX, 'draft-with-tells.md'), 'utf8');
const BAN: MethodProposal = { statement: 'No em dashes.', origin: 'STATED', obligation: 'DELIVERABLE', measurement: { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0 } }, onExample: null, conflict: null };
const capOf = (ps: readonly MethodProposal[]): string | undefined => ps.find((p) => p.statement.includes('as the examples do'))?.statement;

describe('the owner\'s ban beats the examples\' rate', () => {
  it('without a ban, the examples\' typed dashes are the author\'s: held to their rate', () => {
    expect(capOf(tellOffers(PIECES, 'No AI tells.'))).toBe('Keep em dashes (—) to at most 20.5 per 1,000 words, as the examples do.');
  });
  it('with the owner\'s counted ban, no allowance for the dash is offered or told to the writer', () => {
    expect(capOf(tellOffers(PIECES, 'No em dashes.', [BAN]))).toBeUndefined();
    // the machine-tell rule itself is still offered, and still holds on every example
    expect(tellOffers(PIECES, 'No em dashes.', [BAN]).some((p) => (p.measurement?.params.role as readonly string[] | undefined)?.includes('machine-tell'))).toBe(true);
  });
});

describe('a contrastive verdict, however its apostrophes are typed', () => {
  it('"isn’t …, it’s …" and "is not …, it’s …" are counted', () => {
    expect(findPattern('This isn’t a wharf closure, it’s a decision about the valley.', 'NOT_X_ITS_Y').length).toBe(1);
    expect(findPattern('The ramp is not a luxury, it’s the cheapest answer we have.', 'NOT_X_ITS_Y').length).toBe(1);
    expect(findPattern("The ramp is not a luxury, it's the cheapest answer we have.", 'NOT_X_ITS_Y').length).toBe(1);
  });
});

describe('the step-check reading is told a ban is a count', () => {
  it('a step that bans a construction the list names is that count at zero', () => {
    expect(STEP_CHECK_SYSTEM).toContain('A step that bans a construction a listed measurement names');
  });
});

describe('the case-shaped fixture through the binary', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  });
  afterAll(() => { backend.kill(); });

  it('0 tells delivered and 0 em dashes; the writer is never told an em-dash allowance', async () => {
    // the reading as it is told to read a ban: a count at zero; the other two steps are judgement
    const checks = { checks: [
      { id: '1', how: 'judgement', measure: null, source: null, quote: 'No AI tells', means: 'yours to judge' },
      { id: '2', how: 'measure', measure: 'PATTERN_RATE:pattern=EM_DASH,maxPer1000=0', source: null, quote: 'No em dashes', means: 'no em dash' },
      { id: '3', how: 'measure', measure: 'PATTERN_RATE:pattern=NOT_X_ITS_Y,maxPer1000=0', source: null, quote: 'not X, it\'s Y', means: 'no "not X, it\'s Y"' },
      { id: '4', how: 'judgement', measure: null, source: null, quote: 'No named sources', means: 'yours to judge' }] };
    // a rewriter that does what it is asked: each tell taken out of the span it was found in
    const rewrite = [['This isn’t a wharf closure, it’s a decision about who the valley is for.', 'The wharf vote decides who the valley is for.'],
      ['The ramp is not a luxury, it’s the cheapest answer we have.', 'The ramp is the cheapest answer we have.']];
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_step_checks: checks, emit_piece: { piece: `<work>${DRAFT}</work>` }, emit_draft: { text: DRAFT }, emit_replacements: { rewriteSpans: rewrite } } }) });
    const data = mkdtempSync(join(tmpdir(), 'atelier-ban-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-ban-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', ATELIER_CONTEXT_READER: 'scripted' };
    const be = ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
    const cli = (...a: string[]): string => { try { return execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return (e as { stdout?: string }).stdout ?? ''; } };
    cli('new', join(FX, 'voice'), '--method', join(FX, 'rules.md'), '--name', 'post-voice', '--yes', '--latitude', 'creative', ...be);
    const out = cli('invoke', '--skill', 'post-voice', 'Write a long post on X reacting to this week\'s news about the wharf, about 450 to 700 words.', '--with', `notes=${join(FX, 'points.md')}`, '--json', '--claims', 'pattern', '--no-questions', '--no-plan', ...be);
    const j = JSON.parse(out.slice(out.indexOf('{'))) as { output: string };
    expect((j.output.match(/—/g) ?? []).length).toBe(0);
    expect(findPattern(j.output, 'CONTRAST_VERDICT').map((s) => s.text)).toEqual([]);
    expect(findPattern(j.output, 'MACHINE_TELL').map((s) => s.family)).toEqual([]);
    const bodies = ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies;
    expect(bodies.filter((b) => b.includes('emit_piece')).some((b) => b.includes('as the examples do'))).toBe(false);
  });
});
