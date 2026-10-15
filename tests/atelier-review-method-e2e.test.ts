// tests/atelier-review-method-e2e.test.ts — A REVIEW METHOD, BUILT AND HELD THROUGH THE BINARY, WITH NO MODEL.
//
// The owner's method for reviewing a change has three steps: a verdict, a citation for every finding, and a test that
// would have caught it. Built from one finished review with its diff beside it, the second and third are read by code
// (in part), the first is left to the owner in their own words. A review that does all three is not VERIFIED: what the
// checks do not read (whether a cited line supports its finding, whether the test is the right one, whether the
// verdict is right) is the owner's to read. A finding with no citation, or no test named, blocks, with what failed.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
const METHOD = 'How I review a change\n\n1. Say whether the change is correct.\n2. Cite the file and line for every finding.\n3. Name the test that would have caught it.\n';
const DIFF = '--- a/src/client.ts\n+++ b/src/client.ts\n@@ -80,0 +81,6 @@\n+export function send(req, options) {\n+  let attempts = 0;\n+  while (true) {\n+    attempts += 1;\n+    if (attempts > options.maxRetries) break;\n+  }\n';
const REVIEW = '## Verdict\nNot correct.\n\n## Findings\n- src/client.ts:85 treats maxRetries 0 as retry forever.\n- src/client.ts:81 changes the public signature of send.\n\n## Test\n`test_zero_retries` in client.test.ts would have caught it.\n';
const UNCITED = 'The loop never checks the response status.';

interface Entry { id: string; statement: string; result: string; reason: string | null; observation?: { coverage: string; unchecked?: string } }
interface Checked { requirementId: string; result: { verdict: string; detail: string; spans: { start: number; end: number; text: string; why: string }[] } }

describe('atelier new --method on a code-review method, with a diff as material', () => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-rv-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-rv-proj-'));
  mkdirSync(join(proj, 'review.material'));
  writeFileSync(join(proj, 'method.md'), METHOD);
  writeFileSync(join(proj, 'review.md'), `---\nrequest: Review this change.\n---\n${REVIEW}`);
  writeFileSync(join(proj, 'review.material', 'change.diff'), DIFF);
  writeFileSync(join(proj, 'change.diff'), DIFF);
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  const verify = (text: string): { code: number; record: { state: string; entries: Entry[] }; checked: Checked[]; text: string } => {
    const file = join(proj, `draft-${Math.random().toString(36).slice(2)}.md`); writeFileSync(file, text);
    const r = run('verify', '--skill', 'review', '--claims', 'pattern', '--allow-unsourced', '--task', 'Review this change.', '--with', `diff=${join(proj, 'change.diff')}`, '--json', file);
    const j = JSON.parse(r.out.slice(r.out.indexOf('{'))) as { record: { state: string; entries: Entry[] }; checked: Checked[] };
    return { code: r.code, ...j, text };
  };
  const entry = (r: { record: { entries: Entry[] } }, words: string): Entry | undefined => r.record.entries.find((e) => e.statement === words);

  it('builds with no key, each step read as the owner wrote it', () => {
    const r = run('new', 'review.md', '--method', 'method.md', '--name', 'review', '--report');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('Your skill "review" is ready.');
    expect(r.out).not.toContain('could not be read');
    expect(r.out).toMatch(/example: review\.md with 1 file\(s\) of material/);
    expect(r.out).toMatch(/- Cite the file and line for every finding\.\n {6}checks for: every path:line cited is a line of the material with something on it, and every finding under "Findings" carries one \(for a diff, a line the change adds\); your example: 2 of 2 citation\(s\)[^\n]*2 of 2 finding\(s\) point at a line\n {6}not checked, yours to read: whether the cited line supports the claim/);
    expect(r.out).toMatch(/- Name the test that would have caught it\.\n {6}checks for: the work names a test[^\n]*your example: names a test/);
    expect(r.out).toMatch(/Judgement: shown to the writer, reported as not measured \(1\)\n {2}- Say whether the change is correct\./);
    expect(existsSync(join(proj, '.claude', 'skills', 'review', 'SKILL.md'))).toBe(true);
  }, 120_000);

  it('a review citing real lines for every finding and naming a test: NEEDS_REVIEW, never VERIFIED', () => {
    const r = verify(REVIEW);
    expect(r.code).toBe(0);
    expect(r.record.state).toBe('NEEDS_REVIEW');
    expect(r.checked.filter((c) => /finding\(s\) point at a line|names a test/.test(c.result.detail)).map((c) => c.result.verdict)).toEqual(['MET', 'MET']);
    expect(entry(r, 'Cite the file and line for every finding.')).toMatchObject({ result: 'UNVERIFIED', reason: 'PARTLY_CHECKED', observation: { coverage: 'PARTIAL', unchecked: 'whether the cited line supports the claim' } });
    expect(entry(r, 'Name the test that would have caught it.')).toMatchObject({ result: 'UNVERIFIED', reason: 'PARTLY_CHECKED', observation: { coverage: 'PARTIAL', unchecked: 'whether the named test is the right one' } });
    expect(entry(r, 'Say whether the change is correct.')).toMatchObject({ result: 'UNVERIFIED', reason: 'NOT_MACHINE_CHECKABLE' });
  }, 60_000);

  it('one finding without a citation is VIOLATED, with that finding\'s span', () => {
    const r = verify(REVIEW.replace('- src/client.ts:81 changes the public signature of send.', `- ${UNCITED}`));
    expect(r.code).toBe(1);
    expect(r.record.state).toBe('BLOCKED');
    const lines = r.checked.find((c) => c.result.detail.includes('finding(s) point at a line'));
    expect(lines?.result.verdict).toBe('VIOLATED');
    expect(lines?.result.spans).toEqual([{ start: r.text.indexOf(UNCITED), end: r.text.indexOf(UNCITED) + UNCITED.length, text: UNCITED, why: 'this finding points at no line' }]);
  }, 60_000);

  it('no test named is VIOLATED', () => {
    const r = verify(REVIEW.replace('`test_zero_retries` in client.test.ts would have caught it.', 'A test for the zero case would have caught it.'));
    expect(r.code).toBe(1);
    expect(r.record.state).toBe('BLOCKED');
    expect(r.checked.find((c) => c.result.detail === 'no test is named')?.result.verdict).toBe('VIOLATED');
  }, 60_000);
});
