// A REVIEW NEVER BREAKS A RULE THE DRAFT HELD (cli/direct.ts, `refine`). The self-review returns the whole piece; where
// its piece breaks a rule code holds and the first draft did not, the first draft is delivered, the person is told in one
// line, and the record says the review was not taken, with why. Run through the shipped binary on the scripted backend.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { outcomeOf } from '../cli/commands/run.js';
import { checkSection } from '../renderers/agent-skill/render.js';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
const FX = resolve('tests/fixtures/reaction-case');
const DRAFT = '# The wharf, this week\n\nThe council voted to keep the wharf open. I walked it on Tuesday and counted the boats. Most of them were working boats. That is the part the vote was about.';
const BROKEN = `${DRAFT} It was close — closer than anyone said.`;
/** a contrast the person banned, which the scripted rewriter leaves standing */
const CONTRAST = `${DRAFT} It isn't a harbour, it's a car park.`;
const CHECKS = { checks: [
  { id: '1', how: 'judgement', measure: null, source: null, quote: 'No AI tells', means: 'yours to judge' },
  { id: '2', how: 'measure', measure: 'PATTERN_RATE:pattern=EM_DASH,maxPer1000=0', source: null, quote: 'No em dashes', means: 'no em dash' },
  { id: '3', how: 'measure', measure: 'PATTERN_RATE:pattern=NOT_X_ITS_Y,maxPer1000=0', source: null, quote: 'not X, it\'s Y', means: 'no "not X, it\'s Y"' },
  { id: '4', how: 'judgement', measure: null, source: null, quote: 'No named sources', means: 'yours to judge' }] };

let backend: ChildProcess; let port = 0;
beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
}, 60_000);
afterAll(() => { backend.kill(); });

const set = (byTool: Record<string, unknown>): Promise<unknown> => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool }) });
const session = (): ((...a: string[]) => { code: number; out: string; err: string }) & { proj: string } => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-rev-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-rev-proj-'));
  const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', ATELIER_CONTEXT_READER: 'scripted' };
  const run = (...a: string[]): { code: number; out: string; err: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }), err: '' }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout, err: x.stderr }; }
  };
  return Object.assign(run, { proj });
};
const be = (): string[] => ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
const jsonOf = (out: string): { output: string; direct?: { review: { ran: boolean; why?: string } } | null } => JSON.parse(out.slice(out.indexOf('{'))) as { output: string; direct?: { review: { ran: boolean; why?: string } } | null };


describe('the self-review and the rules code holds', () => {
  it('a review that adds an em dash under the person\'s ban is not taken: the draft is delivered, said, and on the record', async () => {
    const cli = session();
    await set({ emit_step_checks: CHECKS, __plain: [DRAFT, BROKEN] });
    expect(cli('new', join(FX, 'voice'), '--method', join(FX, 'rules.md'), '--name', 'post-voice', '--yes', '--latitude', 'creative', ...be()).code).toBe(0);
    await set({ __plain: [DRAFT, BROKEN] });
    const r = cli('invoke', '--skill', 'post-voice', 'Write a post on this week\'s news about the wharf.', '--claims', 'pattern', '--json', ...be());
    const j = jsonOf(r.out);
    expect(j.direct, r.out + r.err).toBeTruthy();
    expect(j.output).not.toContain('—');
    expect(j.output).toBe(DRAFT);
    expect(j.direct?.review.ran).toBe(false);
    expect(j.direct?.review.why).toContain('it broke a rule the draft held');
    expect(r.err + r.out).toContain('which the first draft held, so the first draft is delivered');
  }, 120_000);

  it('a review that breaks nothing is taken as before', async () => {
    const cli = session();
    const BETTER = `${DRAFT} The count was forty.`;
    await set({ emit_step_checks: CHECKS, __plain: [DRAFT, BETTER] });
    expect(cli('new', join(FX, 'voice'), '--method', join(FX, 'rules.md'), '--name', 'post-voice', '--yes', '--latitude', 'creative', ...be()).code).toBe(0);
    await set({ __plain: [DRAFT, BETTER] });
    const j = jsonOf(cli('invoke', '--skill', 'post-voice', 'Write a post on this week\'s news about the wharf.', '--claims', 'pattern', '--json', ...be()).out);
    expect(j.direct?.review).toEqual({ ran: true });
    expect(j.output).toContain('The count was forty.');
  }, 120_000);
  // THREE OUTCOMES, IN THE PERSON'S WORDS (cli/commands/run.ts): the piece is always handed over; the table's own words
  // (Delivery, trusted-fail) stay behind --report.
  it('a piece that breaks a required rule is handed over as "Needs a fix", with the rule in the person\'s words and no table words', async () => {
    const cli = session();
    await set({ emit_step_checks: CHECKS, __plain: [CONTRAST, CONTRAST], emit_replacements: { rewriteSpans: [] } });
    expect(cli('new', join(FX, 'voice'), '--method', join(FX, 'rules.md'), '--name', 'post-voice', '--yes', '--latitude', 'creative', ...be()).code).toBe(0);
    expect(cli('amend', '--skill', 'post-voice', '--consequence', 'trusted-fail=block,untrusted-fail=block', '--reason', 'a broken ban is to be fixed').code).toBe(0);
    await set({ __plain: [CONTRAST, CONTRAST, CONTRAST, CONTRAST], emit_replacements: { rewriteSpans: [] } });
    const r = cli('run', 'Write a post on this week\'s news about the wharf.', '--skill', 'post-voice', '--claims', 'pattern', '--no-questions', ...be());
    expect(r.code, r.out + r.err).toBe(1);
    expect(r.out.startsWith('Needs a fix: see under the piece.\n\n# The wharf, this week')).toBe(true);
    expect(r.out).toMatch(/^Needs a fix: Checked: /m);
    expect(r.out).toMatch(/^ {2}Not met: /m);
    expect(r.out).toContain('To fix it atelier fix "<what to change>"');
    expect(r.out).not.toMatch(/BLOCKED|Delivery:|trusted-fail|not for use|held back/);
  }, 120_000);

  it('a clean piece ends "Ready."', async () => {
    const cli = session();
    await set({ emit_step_checks: CHECKS, __plain: [DRAFT, DRAFT] });
    expect(cli('new', join(FX, 'voice'), '--method', join(FX, 'rules.md'), '--name', 'post-voice', '--yes', '--latitude', 'creative', ...be()).code).toBe(0);
    await set({ __plain: [DRAFT, DRAFT] });
    const r = cli('run', 'Write a post on this week\'s news about the wharf.', '--skill', 'post-voice', '--claims', 'pattern', '--no-questions', ...be());
    expect(r.code, r.out + r.err).toBe(0);
    expect(r.out.startsWith('# The wharf, this week')).toBe(true);
    expect(r.out).toMatch(/^Ready\. Checked: /m);
    expect(r.out).not.toMatch(/Delivery:|trusted-fail/);
  }, 120_000);
});

describe('the three outcomes, and where a host is told to check', () => {
  it('needs a fix where a required rule failed; needs a look only where something was found; else ready', () => {
    expect(outcomeOf('BLOCK', 'BLOCKED')).toBe('fix');
    expect(outcomeOf('SHIP_LABELLED', 'BLOCKED')).toBe('fix');
    expect(outcomeOf('PERSON', 'NEEDS_REVIEW')).toBe('look');
    expect(outcomeOf('SHIP_LABELLED', 'NEEDS_REVIEW', ['  Possible slip: "teh" → "the"'])).toBe('look');
    // a rule no check could read on this piece (no notes given) is named, and is nothing to look at
    expect(outcomeOf('SHIP_LABELLED', 'NEEDS_REVIEW', ['  Not checked on this piece: Every specific (no material)'])).toBe('ready');
    expect(outcomeOf('SHIP', 'VERIFIED')).toBe('ready');
  });
  it('the installed skill orders the check by its exact command, in its first 2,000 characters, and verify says the outcome first', async () => {
    expect(checkSection('posts')).toContain('run `atelier verify --skill posts <file>`');
    const cli = session();
    await set({ emit_step_checks: CHECKS, __plain: [DRAFT, DRAFT] });
    expect(cli('new', join(FX, 'voice'), '--method', join(FX, 'rules.md'), '--name', 'post-voice', '--yes', '--latitude', 'creative', ...be()).code).toBe(0);
    const proj = cli.proj;
    const md = readFileSync(join(proj, '.claude', 'skills', 'post-voice', 'SKILL.md'), 'utf8');
    expect(md.slice(0, 2000)).toContain('run `atelier verify --skill post-voice <file>`');
    writeFileSync(join(proj, 'd.md'), DRAFT);
    const v = cli('verify', '--skill', 'post-voice', 'd.md', '--claims', 'pattern');
    expect(v.out, v.err).toMatch(/^(Ready|Needs a look|Needs a fix)\.\n/);
  }, 120_000);
});
