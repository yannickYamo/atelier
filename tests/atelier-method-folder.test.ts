// One method note and a folder of finished examples, built in one call with no model: the owner's steps are the
// rules, each held against every example; the examples are served with the skill and their lengths recorded.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Then a Must fix section.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n4. Weigh the risk of the change before the style of it.\n';
const body = (n: number): string => Array.from({ length: n }, (_, i) => `The change touches part ${i + 1} of the runner and keeps its tests.`).join(' ');
const piece = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\n${body(n)}\n\n## Must fix\nNone.\n\n## Verdict\n${verdict}\n`;

const seed = (verdicts: readonly string[]) => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-mf-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-mf-proj-'));
  mkdirSync(join(proj, 'examples'));
  writeFileSync(join(proj, 'method.md'), NOTE);
  verdicts.forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), piece(v, 4 + i)); });
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  return { data, proj, run };
};

describe('atelier method <note> --golden <folder>', () => {
  it('builds with no key: every step held against every example, the pieces served, their span recorded', () => {
    const { data, proj, run } = seed(['Approve', 'Request changes', 'Comment', 'Approve']);
    const r = run('method', 'method.md', '--golden', 'examples', '--name', 'review', '--yes');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('4 examples from examples; checks read from e1.md, then held against the rest');
    expect(r.out).toContain('starting with one of "Approve", "Request changes", "Comment" on a line of its own; your example: held in all 4 of your examples');
    expect(r.out).toMatch(/Held to your method on every run: 3 thing\(s\) the work must contain, 0 it must be made from; 1 judgement step\(s\)/);
    expect(r.out).toMatch(/Voice: \d whole piece\(s\) of the author's own served with the skill/);
    expect(r.out).toContain('Your own pieces: 4 of 4 meet every required rule that is counted.');
    const voice = JSON.parse(readFileSync(join(data, 'skills', 'review', 'voice.json'), 'utf8')) as { lengthSpan?: [number, number] };
    expect(voice.lengthSpan?.[0]).toBeLessThan(voice.lengthSpan?.[1] ?? 0);
    expect(existsSync(join(proj, '.claude', 'skills', 'review', 'SKILL.md'))).toBe(true);
  }, 120_000);

  it('a step one example breaks stops the build and names the piece; nothing is installed', () => {
    const { proj, run } = seed(['Approve', 'Looks fine to me', 'Comment']);
    const r = run('method', 'method.md', '--golden', 'examples', '--name', 'review');
    expect(r.out).toContain('Yours to settle');
    expect(r.out).toContain('1 of your examples do not hold it as a check would read it: e2.md');
    expect(r.out).toContain('Nothing has been built');
    expect(existsSync(join(proj, '.claude', 'skills', 'review'))).toBe(false);
  }, 120_000);

  it('a name that reads as answers still calls no model, and a note, a hidden file and a piece\'s material are not examples', () => {
    const { proj, run } = seed(['Approve', 'Request changes', 'Comment']);
    writeFileSync(join(proj, 'examples', '.draft.md'), 'not a piece');
    writeFileSync(join(proj, 'examples', 'method.md'), NOTE);
    mkdirSync(join(proj, 'examples', 'e1.material'));
    writeFileSync(join(proj, 'examples', 'e1.material', 'diff.txt'), 'a change');
    const r = run('method', 'examples/method.md', '--golden', 'examples', '--name', 'code-review', '--yes');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('3 examples from examples');
    expect(r.out).not.toContain('could not be read');
    expect(r.out).not.toContain('ANTHROPIC_API_KEY');
  }, 120_000);

  it('one file still works as it did: one worked example, no pieces served', () => {
    const { run } = seed(['Approve']);
    const r = run('method', 'method.md', '--golden', 'examples/e1.md', '--name', 'review', '--yes');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('example: e1.md');
    expect(r.out).not.toMatch(/Voice: \d/);
  }, 120_000);
});

describe('three tweets and five lines of rules', () => {
  it('build with no key, three rules held by code, every tweet passing them', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-tw-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-tw-proj-'));
    mkdirSync(join(proj, 'tweets'));
    ['Shipped the fix at 2am. Nobody noticed. That is the job.', 'Your roadmap is a list of guesses. Date the guesses, not the features.', 'Hiring tip: ask what they deleted last quarter. Builders remember.']
      .forEach((t, i) => { writeFileSync(join(proj, 'tweets', `${i + 1}.md`), `${t}\n`); });
    writeFileSync(join(proj, 'rules.md'), 'How I write a tweet\n\n- Under 120 characters.\n- Between 2 and 3 sentences.\n- Never use the word "excited" or "thrilled".\n- No hashtags and no emoji.\n- End on the point, not on a question.\n');
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const out = execFileSync('node', [CLI, 'method', 'rules.md', '--golden', 'tweets', '--name', 'short-posts', '--yes'], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    expect(out).toContain('checks for: at most 119 characters; your example: held in all 3 of your examples');
    expect(out).toContain('checks for: 2 to 3 sentences; your example: held in all 3 of your examples');
    expect(out).toContain('checks for: none of: excited, thrilled; your example: held in all 3 of your examples');
    expect(out).toMatch(/Held to your method on every run: 3 thing\(s\) the work must contain, 0 it must be made from; 2 judgement step\(s\)/);
    expect(out).toContain('Your own pieces: 3 of 3 meet every required rule that is counted.');
    const skill = readFileSync(join(proj, '.claude', 'skills', 'short-posts', 'SKILL.md'), 'utf8');
    expect(skill).toContain('Under 120 characters');
  }, 120_000);
});
