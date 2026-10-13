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
    const r = run('method', 'method.md', '--golden', 'examples', '--name', 'review', '--yes', '--report');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('4 examples from examples; checks read from e1.md, then held against the rest');
    expect(r.out).toContain('starting with one of "Approve", "Request changes", "Comment" on a line of its own; your example: held in all 4 of your examples');
    expect(r.out).toMatch(/Your skill "review" is ready\./);
    expect(r.out).toMatch(/Voice: \d whole piece\(s\) of the author's own served with the skill/);
    expect(r.out).toContain('Your own pieces: 4 of 4 meet every required rule that is counted.');
    const voice = JSON.parse(readFileSync(join(data, 'skills', 'review', 'voice.json'), 'utf8')) as { lengthSpan?: [number, number] };
    expect(voice.lengthSpan?.[0]).toBeLessThan(voice.lengthSpan?.[1] ?? 0);
    expect(existsSync(join(proj, '.claude', 'skills', 'review', 'SKILL.md'))).toBe(true);
  }, 120_000);

  it('a step one example does not do stays required and is named with the piece; the skill is built in the one call', () => {
    const { proj, run } = seed(['Approve', 'Looks fine to me', 'Comment']);
    // a disagreement between the method and the examples never stops a build: the skill is built, and says so
    const first = run('method', 'method.md', '--golden', 'examples', '--name', 'review');
    expect(first.code, first.out).toBe(0);
    expect(first.out).toContain('Your skill "review" is ready.');
    expect(first.out).toMatch(/1 of your steps is not what your own examples do \(marked ! above\)\. It is checked and shown on every run, and blocks nothing until you say so:\n {4}keep it as written: atelier method method\.md --golden examples .*--name review --yes/);
    const r = run('method', 'method.md', '--golden', 'examples', '--name', 'review', '--yes');
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toMatch(/blocks nothing until you say so/);
    expect(r.out).toMatch(/Checked on every run \(3\):[\s\S]*- End with a Verdict section[^\n]*\n {6}! 1 of your examples does not do this: e2\.md \([^\n]*\)\.\n {8}Checked and shown on every run; it blocks nothing until you confirm it\./);
    expect(r.out).not.toMatch(/Left for you to judge/);
    expect(r.out).toContain('Your skill "review" is ready.');
    expect(existsSync(join(proj, '.claude', 'skills', 'review', 'SKILL.md'))).toBe(true);
    // the whole account names the piece and what the check found too
    expect(run('method', 'method.md', '--golden', 'examples', '--name', 'review', '--review', '--report').out).toContain('! 1 of your examples does not do this: e2.md');
  }, 120_000);
  it('built again in the same folder after the method changes, it is a new version of the same skill', () => {
    const { proj, run } = seed(['Approve', 'Request changes', 'Comment']);
    expect(run('new', 'examples', '--method', 'method.md', '--name', 'review').code).toBe(0);
    writeFileSync(join(proj, 'method.md'), `${NOTE}5. Never use the word "nit".\n`);
    const again = run('new', 'examples', '--method', 'method.md', '--name', 'review');
    expect(again.code, again.out).toBe(0);
    expect(again.out).toContain('Never use the word "nit".');
    expect(readFileSync(join(proj, '.claude', 'skills', 'review', 'SKILL.md'), 'utf8')).toContain('nit');
    // another skill in this folder is still refused
    expect(run('new', 'examples', '--method', 'method.md', '--name', 'other').out).toContain('this folder already holds another standard (the skill "review")');
  }, 120_000);
  it('with no name given, the skill is named after the work, or the folder it is built in when the work is just "examples"', () => {
    const { proj, run } = seed(['Approve', 'Request changes', 'Comment']);
    const r = run('new', 'examples', '--method', 'method.md');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/Your skill "atelier-mf-proj-[a-z0-9-]+" is ready\./i);
    expect(existsSync(join(proj, '.claude', 'skills'))).toBe(true);
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
    const out = execFileSync('node', [CLI, 'method', 'rules.md', '--golden', 'tweets', '--name', 'short-posts', '--yes', '--report'], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    expect(out).toContain('checks for: at most 119 characters; your example: held in all 3 of your examples');
    expect(out).toContain('checks for: 2 to 3 sentences; your example: held in all 3 of your examples');
    expect(out).toContain('checks for: none of: excited, thrilled; your example: held in all 3 of your examples');
    expect(out).toMatch(/Your skill "short-posts" is ready\./);
    expect(out).toContain('Your own pieces: 3 of 3 meet every required rule that is counted.');
    const skill = readFileSync(join(proj, '.claude', 'skills', 'short-posts', 'SKILL.md'), 'utf8');
    expect(skill).toContain('Under 120 characters');
  }, 120_000);
});

describe('what a pass over the new commands found', () => {
  const DIFF = '--- a/src/run.ts\n+++ b/src/run.ts\n@@ -10,0 +10,2 @@\n+const a = load();\n+run(a);\n';
  const REVIEW = '## Summary\nIt adds a runner and keeps the tests.\n\n## Must fix\n- src/run.ts:11 runs before the check.\n\n## Verdict\nRequest changes\n';
  const setup = () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-gap-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gap-proj-'));
    mkdirSync(join(proj, 'e1.material'));
    writeFileSync(join(proj, 'e1.material', 'diff.txt'), DIFF);
    writeFileSync(join(proj, 'e1.md'), `---\nrequest: Review this change.\n---\n${REVIEW}`);
    writeFileSync(join(proj, 'diff.txt'), DIFF); writeFileSync(join(proj, 'ok.md'), REVIEW);
    writeFileSync(join(proj, 'method.md'), 'How we review\n\n- Open with a Summary section.\n- Then a Must fix section: defects that do not wait for a later change.\n- Cite each Must fix item as path:line.\n- End with a Verdict section.\n');
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    expect(run('method', 'method.md', '--golden', 'e1.md', '--name', 'reviews', '--yes').code).toBe(0);
    return { proj, run };
  };
  it('a step that asks for a section is not listed under what not to do, though it says "do not"', () => {
    const { proj } = setup();
    const skill = readFileSync(join(proj, '.claude', 'skills', 'reviews', 'SKILL.md'), 'utf8');
    const prohibitions = skill.split(/^## /m).find((part) => /^What not to do/i.test(part)) ?? '';
    expect(prohibitions).not.toContain('Must fix section');
    expect(skill).toContain('Then a Must fix section');
  }, 120_000);
  it('verify, score and the same material agree on a line citation; with nothing bound it says so', () => {
    const { run } = setup();
    expect(run('verify', '--skill', 'reviews', 'ok.md', '--with', 'diff=diff.txt', '--claims', 'pattern').code).toBe(0);
    const scored = run('score', '--skill', 'reviews', '--task', 'Review this change.', '--material', 'diff.txt', 'ok.md', '--json');
    expect(scored.out).not.toContain('no such file in the material');
    const unbound = run('verify', '--skill', 'reviews', 'ok.md', '--claims', 'pattern');
    expect(unbound.code).toBe(1);
    expect(unbound.out).toContain('no material is bound to look it up in');
  }, 120_000);
});

// What a person sees: one command to build, a screen of their own steps, and nothing of the engine.
describe('the front door: atelier new <your-work> --method <note>', () => {
  it('is the same build, said in three groups, in under twenty lines', () => {
    const { proj, run } = seed(['Approve', 'Request changes', 'Comment', 'Approve']);
    const r = run('new', 'examples', '--method', 'method.md', '--name', 'review', '--yes');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/^Method: method\.md {2}· {2}4 examples from examples\n\n4 step\(s\) in your method\.\n\nChecked on every run \(3\):/);
    expect(r.out).toMatch(/You judge these yourself \(1\):\n {2}- Weigh the risk of the change before the style of it\./);
    expect(r.out).toContain('Your skill "review" is ready.');
    expect(r.out).not.toMatch(/Standard [0-9a-f]+ minted|EVERY OUTPUT IS CHECKED BY|TASTE READER|SIZE {2}|Kind of work|checks for:/);
    expect(r.out.trim().split('\n').length).toBeLessThan(20);
    expect(existsSync(join(proj, '.claude', 'skills', 'review', 'SKILL.md'))).toBe(true);
  }, 120_000);
  it('the help is three commands, and everything else is one word away', () => {
    const { run } = seed(['Approve']);
    const help = run('--help').out;
    expect(help.trim().split('\n').length).toBeLessThanOrEqual(8);
    expect(run('lab', 'verify', '--help').out).toMatch(/^usage: atelier verify/);
    expect(run('lab', 'bogus').code).toBe(1);
    for (const c of ['atelier new <your-work> --method', 'atelier run "<task>"', 'atelier fix "<what was wrong>"', 'atelier lab']) expect(help).toContain(c);
    expect(help).not.toMatch(/taste|fidelity|tend|floor|ratify/);
    const lab = run('lab').out;
    for (const c of ['verify', 'reproduce', 'evolve', 'fidelity', 'method']) expect(lab).toContain(c);
    expect(run('lab', 'status').code).toBe(0);
    expect(run('nonsense').out).toContain('The three you need: new, run, fix');
  }, 120_000);
});

describe('atelier new <your-work>, with no method note and no model', () => {
  const POSTS = ['Shipped the cache fix. Four days to find, one hour to fix. The docs were right; we just did not read them.',
    'Rolled back the flag at 2am. Nobody noticed, which is the point. Boring deploys are a feature.', 'Deleted 4,000 lines today. The tests still pass. Best commit of the month, and it adds nothing.'];
  const seedPosts = () => { const x = seed([]); mkdirSync(join(x.proj, 'posts')); POSTS.forEach((p, i) => { writeFileSync(join(x.proj, 'posts', `p${i + 1}.md`), `${p}\n`); }); return x; };
  it('no key is not a reason to build nothing: the skill is the examples, and says what it is', () => {
    const { proj, run } = seedPosts();
    const r = run('new', 'posts');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('No model is set up (ANTHROPIC_API_KEY), so the skill is built from what can be counted in your examples');
    expect(r.out).toContain('No method was given: the skill is your examples, served to the writer');
    expect(r.out).toContain('Your skill "posts" is ready.');
    // the pieces themselves are what the writer is given, and the one rule is the owner's to judge
    const dir = join(proj, '.claude', 'skills', 'posts');
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toContain('New work reads like the 3 examples given');
    expect(['voice-1.md', 'voice-2.md', 'voice-3.md'].map((f) => readFileSync(join(dir, 'examples', f), 'utf8')).join('\n')).toContain('Boring deploys are a feature.');
  }, 120_000);
  it('--no-model chooses the same build on purpose, and one example is enough', () => {
    const { proj, run } = seedPosts();
    const r = run('new', join('posts', 'p1.md'), '--no-model', '--name', 'one-post');
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain('No model is set up');
    expect(r.out).toContain('Your skill "one-post" is ready.');
    expect(existsSync(join(proj, '.claude', 'skills', 'one-post', 'SKILL.md'))).toBe(true);
  }, 120_000);
});

