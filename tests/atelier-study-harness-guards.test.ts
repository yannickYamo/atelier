// tests/atelier-study-harness-guards.test.ts — THE STUDY AND BENCHMARK SCRIPTS, RUN AS A TESTER RUNS THEM, OFFLINE.
//
// A tester runs these scripts for money, from a directory of their own, more than once, and reads what they print.
// So each is driven here the same way: from another working directory, against the scripted backend, and then again.
// What is held: a run that could not start is never cached as a result; a second run never takes a reader's answers
// with it; a verdict is never FAIL or "done" when nothing was read; and the one file two scripts read under one name
// is written once, in a shape both accept.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
const jsonl = (rows: readonly object[]): string => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
const rowsOf = <T>(file: string): T[] => readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
const tmp = (name: string): string => mkdtempSync(join(tmpdir(), `atelier-guards-${name}-`));

// A developer's own keys and ATELIER_* settings must not decide what a script does here: no key, unless a test gives one.
const ENV: NodeJS.ProcessEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ATELIER|ANTHROPIC|OPENAI)_/.test(k))),
  ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' };
/** A directory that is not the repository: every script is started from here, as a tester would. */
const ELSEWHERE = tmp('cwd');
interface Ran { code: number; out: string; err: string; all: string }
const run = (script: string, ...args: string[]): Ran => {
  const r = spawnSync(process.execPath, [resolve(script), ...args], { encoding: 'utf8', cwd: ELSEWHERE, env: ENV, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
};

const CLEAN = 'We decided first, and explained after. The reasoning follows the decision, and it is short.';
const BREAKS = 'Let us delve into the rich tapestry of this ever-evolving landscape. It\'s not a tool, it\'s a movement. Here\'s the thing: here\'s why. Here\'s how.';
const PLAIN = 'The team picked an option before giving reasons for it. The sequence was important to the outcome, since a later step depended on that earlier one. There were no complaints afterwards, as the project then proceeded in the same manner until it was finished and handed over.';

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
/** Script the backend: the tools every build and run needs, and whatever this test adds or replaces. */
async function scripted(more: Record<string, unknown> = {}, when: readonly { contains: string; answer: unknown }[] = []): Promise<void> {
  const factor = { description: 'Lead with the decision, then the reasoning.', appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['post-0.md'], wouldBeAbsentIf: 'the opposite shows', needsFromUser: '', quote: '' };
  await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ when, byTool: {
    emit_factors: { factors: [factor] }, emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }] }, emit_observation: { applicable: true, present: true, why: 'seen' },
    emit_persona: { points: [] }, emit_piece: { piece: CLEAN }, emit_paragraph: { paragraph: PLAIN }, emit_answer: { answer: CLEAN }, ...more } }) });
}

// ONE SKILL, BUILT ONCE, with a pair bank: what `invoke --voice incontext`, `invoke --strict`, `verify` and `score` need.
const data = tmp('data'); const proj = tmp('proj'); const posts = join(proj, 'posts');
const atelier = (...args: string[]): string => {
  const r = spawnSync(process.execPath, [CLI, ...args, '--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'], { encoding: 'utf8', cwd: proj, env: { ...ENV, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj } });
  if (r.status !== 0) throw new Error(`atelier ${args.join(' ')} exited ${r.status}: ${r.stderr}`);
  return `${r.stdout}${r.stderr}`;
};
const bank = (): string => join(data, 'skills', 'voice', 'voice', 'bank.json');

beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
  await scripted();
  // Paragraphs with no figure and no name, each its own words: the pair bank keeps a pair only when the plain side
  // holds the same facts as the author's, and one scripted plain paragraph has to stand for every one of them.
  const W = ['quiet', 'plain', 'early', 'late', 'slow', 'brisk', 'narrow', 'broad', 'steady', 'loose', 'careful', 'blunt'];
  const N = ['plan', 'draft', 'review', 'launch', 'budget', 'meeting', 'handover', 'estimate', 'rollback', 'release', 'audit', 'brief'];
  const para = (i: number, k: number): string => `We decided on the ${W[(i + k) % 12]} ${N[k % 12]} first, and we explained it after. I think that order matters, and I do not say it lightly, because the ${W[(i * 5 + k * 7) % 12]} ${N[(i + k * 5) % 12]} turned on it. Nobody regretted the choice, since the work went exactly that way in the end.`;
  mkdirSync(posts, { recursive: true });
  for (let i = 0; i < 9; i++) writeFileSync(join(posts, `post-${i}.md`), `# The ${W[i]} ${N[i]}\n\n${Array.from({ length: 12 }, (_, k) => para(i, k)).join('\n\n')}`);
  const NEW = ['new', posts, 'write me a blog post in the voice and style of these', '--name', 'voice'];
  atelier(...NEW); atelier(...NEW, '--accept');
  atelier('voice', 'register', '--skill', 'voice', 'post');
  expect(atelier('voice', 'pairs', '--skill', 'voice')).toMatch(/72 pair\(s\) kept/);
}, 300_000);
afterAll(() => { backend.kill(); });

describe('the voice read is written from any directory, and a second run never takes a reader\'s answers with it', () => {
  const out = tmp('voice'); const human = join(out, 'human');
  const corpus = (name: string, more: object = {}): object => ({ name, data, project: proj, skill: 'voice', read: Array.from({ length: 6 }, (_, i) => join(posts, `post-${i}.md`)), heldOut: [], briefWords: 100,
    requests: [`Write about the first choice of ${name}.`, `Write about the second choice of ${name}.`], ...more });
  const plan = (dir: string, ...corpora: object[]): string => { writeFileSync(join(dir, 'plan.json'), JSON.stringify({ corpora })); return join(dir, 'plan.json'); };
  const voicePass = (...args: string[]): Ran => run('studies/harness/voice-pass.mjs', '--plan', plan(out, corpus('author-a'), corpus('author-b')), '--out', out, ...args);
  const packet = (name: string, reader: number): string => join(human, `${name}-reader-${reader}.md`);
  const key = (): Record<string, Record<string, Record<string, string>>> => JSON.parse(readFileSync(join(human, 'KEY-open-after-reading.json'), 'utf8')) as never;
  const answer = (file: string, letter: string): string => { const filled = readFileSync(file, 'utf8').replace(/^(ANSWER [^:\n]+:).*$/gm, `$1 ${letter}`); writeFileSync(file, filled); return filled; };
  const cacheRows = (dir: string): { arm: string; failed?: string }[] => (existsSync(join(dir, 'cache.json')) ? Object.values(JSON.parse(readFileSync(join(dir, 'cache.json'), 'utf8')) as Record<string, { arm: string; failed?: string }>) : []);

  beforeAll(async () => {
    await scripted();
    const first = voicePass('--corpus', 'author-a', '--corpus', 'author-b', '--base-url', url());
    expect(first.code, first.all).toBe(0);
  }, 120_000);

  it('started from another directory it writes both arms for every request, a packet per reader and the key', () => {
    const rows = cacheRows(out);
    expect(rows.filter((r) => r.arm === 'pasted' && !r.failed)).toHaveLength(4);
    expect(rows.filter((r) => r.arm === 'voice' && !r.failed)).toHaveLength(4);
    expect(readdirSync(human).filter((f) => f.endsWith('.md'))).toHaveLength(10);
    expect(Object.keys(key()).sort()).toEqual(['author-a', 'author-b']);
    expect(Object.keys(key()['author-a']['1']).sort()).toEqual(['author-a-01', 'author-a-02']);
    expect(readFileSync(packet('author-a', 1), 'utf8')).toMatch(/^ANSWER author-a-01: $/m);
  });
  it('run again for the packets, and for one author alone, the answers stay and the key keeps both authors', () => {
    const a = answer(packet('author-a', 1), 'A'); const b = answer(packet('author-b', 3), 'B');
    const before = key();
    const again = voicePass('--corpus', 'author-a', '--corpus', 'author-b', '--only', 'packets');
    expect(again.code, again.all).toBe(0);
    expect(again.err).toMatch(/packets written: none\./);
    expect(again.err).toMatch(/packets left alone, with their key entries \(already there; --force rewrites one nobody has answered, --force-answered one with answers\): author-a-reader-1\.md, /);
    const one = voicePass('--corpus', 'author-a', '--only', 'packets');
    expect(one.code, one.all).toBe(0);
    // a resume that writes nothing new, with the backend there
    expect(voicePass('--corpus', 'author-b', '--base-url', url()).code).toBe(0);
    expect(readFileSync(packet('author-a', 1), 'utf8')).toBe(a);
    expect(readFileSync(packet('author-b', 3), 'utf8')).toBe(b);
    expect(key()).toEqual(before);
    const result = JSON.parse(readFileSync(join(out, 'result.json'), 'utf8')) as { corpora: { corpus: string }[] };
    expect(result.corpora.map((c) => c.corpus).sort()).toEqual(['author-a', 'author-b']);
  });
  it('a packet that was deleted is written again, and a key that lost an author gets that author back unchanged', () => {
    const before = key();
    writeFileSync(join(human, 'KEY-open-after-reading.json'), JSON.stringify({ 'author-a': before['author-a'] }));
    const r = voicePass('--corpus', 'author-b', '--only', 'packets');
    expect(r.code, r.all).toBe(0);
    expect(key()).toEqual(before);
    expect(readFileSync(packet('author-b', 3), 'utf8')).toMatch(/^ANSWER author-b-01: B$/m);
  });
  it('--force rewrites a packet nobody answered, refuses one with answers and names --force-answered, which writes over it', () => {
    const refused = voicePass('--corpus', 'author-a', '--only', 'packets', '--force');
    expect(refused.code).toBe(2);
    expect(refused.err).toMatch(/--force would write over 1 packet\(s\) that already hold a reader's answers \(author-a-reader-1\.md\)\. Leave --force out to keep them, or add --force-answered/);
    expect(readFileSync(packet('author-a', 1), 'utf8')).toMatch(/^ANSWER author-a-01: A$/m);
    // an answer written on the line under the answer line is an answer too
    writeFileSync(packet('author-a', 2), readFileSync(packet('author-a', 2), 'utf8').replace(/^(ANSWER author-a-01:).*$/m, '$1 \n**b**'));
    writeFileSync(packet('author-a', 1), readFileSync(packet('author-a', 1), 'utf8').replace(/^(ANSWER [^:\n]+:).*$/gm, '$1 '));
    expect(voicePass('--corpus', 'author-a', '--only', 'packets', '--force').err).toMatch(/\(author-a-reader-2\.md\)/);
    const forced = voicePass('--corpus', 'author-a', '--only', 'packets', '--force', '--force-answered');
    expect(forced.code, forced.all).toBe(0);
    expect(forced.err).toMatch(/packets written: author-a-reader-1\.md, author-a-reader-2\.md, /);
    expect(readFileSync(packet('author-a', 2), 'utf8')).not.toMatch(/\*\*b\*\*/);
    // the other author was not named, and is as it was
    expect(readFileSync(packet('author-b', 3), 'utf8')).toMatch(/^ANSWER author-b-01: B$/m);
    expect(Object.keys(key()).sort()).toEqual(['author-a', 'author-b']);
  });
  it('with no key and no --base-url it stops before anything is written to the cache (exit 2)', () => {
    const dir = tmp('voice-nokey');
    const r = run('studies/harness/voice-pass.mjs', '--plan', plan(dir, corpus('author-a')), '--corpus', 'author-a', '--out', dir);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/ANTHROPIC_API_KEY is not set\. Nothing was spent\./);
    expect(cacheRows(dir)).toEqual([]);
  });
  it('a run that could not start is not cached as a failed request: a backend that is not there, and a CLI that crashed at once', () => {
    const gone = tmp('voice-gone');
    const unreachable = run('studies/harness/voice-pass.mjs', '--plan', plan(gone, corpus('author-a')), '--corpus', 'author-a', '--out', gone, '--base-url', 'http://127.0.0.1:1');
    expect(unreachable.code, unreachable.all).toBe(2);
    expect(unreachable.err).toMatch(/the pasted arm could not reach its model .*Nothing was cached for "Write about the first choice of author-a\."/);
    expect(cacheRows(gone)).toEqual([]);
    // the voice arm: the project directory is not there, so the CLI never starts. It is not an `atelier:` refusal.
    const crash = tmp('voice-crash');
    const crashed = run('studies/harness/voice-pass.mjs', '--plan', plan(crash, corpus('author-a', { project: join(crash, 'no-such-project') })), '--corpus', 'author-a', '--out', crash, '--base-url', url());
    expect(crashed.code, crashed.all).toBe(2);
    expect(crashed.err).toMatch(/the voice run could not start, before any model call: .*Nothing was cached/);
    expect(cacheRows(crash).filter((r) => r.arm === 'voice')).toEqual([]);
    expect(cacheRows(crash).filter((r) => r.failed)).toEqual([]);
  }, 120_000);
});

describe('strict delivery is run from any directory, and a run that could not start is never a "not delivered" row', () => {
  const requests = (dir: string, skill = 'voice'): string => { writeFileSync(join(dir, 'requests.jsonl'), jsonl([1, 2].map((i) => ({ id: `q${i}`, skill, request: `Write a short post about decision ${i}.` })))); return join(dir, 'requests.jsonl'); };
  const strict = (dir: string, ...args: string[]): Ran => run('studies/harness/strict-delivery.mjs', '--requests', requests(dir), '--data', data, '--project', proj, '--out', join(dir, 'out'), '--pilot', ...args);
  interface Summary { all: { requests: number; delivered: number; refused: number; errored: number } }

  it('--base-url reaches the backend as it does for the voice read: delivered, then refused when the draft breaks a required rule', async () => {
    await scripted();
    const ok = tmp('strict');
    const delivered = strict(ok, '--base-url', url());
    expect(delivered.code, delivered.all).toBe(0);
    expect((JSON.parse(delivered.out.slice(delivered.out.indexOf('{\n'))) as Summary).all).toMatchObject({ requests: 2, delivered: 2, refused: 0, errored: 0 });
    expect(readFileSync(join(ok, 'out', 'delivered-for-audit.md'), 'utf8')).toMatch(/## q1 \(skill voice\)\n\nRequest: Write a short post about decision 1\.\n\n.*The reasoning follows the decision, and it is short\./);
    await scripted({ emit_piece: { piece: BREAKS } });
    const no = tmp('strict-refused');
    const refused = strict(no, '--base-url', url());
    expect(refused.code, refused.all).toBe(0);
    expect((JSON.parse(refused.out.slice(refused.out.indexOf('{\n'))) as Summary).all).toMatchObject({ requests: 2, delivered: 0, refused: 2, errored: 0 });
    await scripted();
  }, 120_000);
  it('with no key and no --base-url it stops before the first request, and no cache is written (exit 2)', () => {
    const dir = tmp('strict-nokey');
    const r = strict(dir);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/ANTHROPIC_API_KEY is not set \(or pass --base-url <url> for the offline smoke test\)\. Nothing was spent, and nothing was cached\./);
    expect(existsSync(join(dir, 'out', 'cache.json'))).toBe(false);
  });
  it('a run that ends at once with no result stops the study and caches nothing, so the same command runs it again', () => {
    const dir = tmp('strict-unknown');
    const r = run('studies/harness/strict-delivery.mjs', '--requests', requests(dir, 'no-such-skill'), '--data', data, '--project', proj, '--out', join(dir, 'out'), '--pilot', '--base-url', url());
    expect(r.code, r.all).toBe(2);
    expect(r.err).toMatch(/q1: the run could not start, before any model call \(exit \d+\): .*Nothing was cached for it: fix it and run the same command again/);
    expect(existsSync(join(dir, 'out', 'cache.json'))).toBe(false);
    expect(existsSync(join(dir, 'out', 'strict-delivery.json'))).toBe(false);
  });

  // ── R3: THE SAME REQUEST, RUN AGAIN, IS DELIVERED OR REFUSED THE SAME WAY ──────────────────────────
  interface R3 { repeats: number; requests: number; split: number; splitShare: number | null; bar: number; allowed: number; incomplete: number; holds: boolean | null; splitRequests: string[] }
  interface Skill { requests: number; runs?: number; delivered: number; refused: number; r2: { bar: number; upper95: number; holds: boolean }; r3?: R3 }
  interface Whole { all: { requests: number; runs?: number; delivered: number }; perSkill: Record<string, Skill>; verdict: string; bar: number; repeats?: number; repeatBar?: number }
  const whole = (dir: string): Whole => JSON.parse(readFileSync(join(dir, 'out', 'strict-delivery.json'), 'utf8')) as Whole;

  it('--repeats runs each request again under its own cache key, and a cache written before is repetition 1', async () => {
    await scripted();
    const dir = tmp('strict-repeats');
    // as today: one run a request, no R3 anywhere, and the cache keyed by the request's id alone
    const once = strict(dir, '--base-url', url());
    expect(once.code, once.all).toBe(0);
    expect(Object.keys(JSON.parse(readFileSync(join(dir, 'out', 'cache.json'), 'utf8')) as object)).toEqual(['q1', 'q2']);
    expect(whole(dir).perSkill.voice.r3).toBeUndefined();
    expect(whole(dir).repeats).toBeUndefined();
    expect(once.all).not.toMatch(/R3/);
    expect(once.err).toMatch(/^R2 voice: not delivered on 0 of 2 run\(s\), upper bound 0\.842, bar 0\.15: does not hold$/m);
    // then three times: only the two repetitions that are missing are run
    const thrice = strict(dir, '--base-url', url(), '--repeats', '3');
    expect(thrice.code, thrice.all).toBe(0);
    expect(thrice.out).not.toMatch(/^q1 {2}delivered/m);
    expect(thrice.out).toMatch(/^q1 repetition 2 {2}delivered {2}exit 0$/m);
    expect(thrice.out).toMatch(/^q2 repetition 3 {2}delivered {2}exit 0$/m);
    const cache = JSON.parse(readFileSync(join(dir, 'out', 'cache.json'), 'utf8')) as Record<string, { repetition?: number }>;
    expect(Object.keys(cache).sort()).toEqual(['q1', 'q1#2', 'q1#3', 'q2', 'q2#2', 'q2#3']);
    expect(cache.q1.repetition).toBeUndefined();
    expect(cache['q2#3'].repetition).toBe(3);
    const r = whole(dir);
    expect(r.all).toMatchObject({ requests: 2, runs: 6, delivered: 6 });
    expect(r.perSkill.voice.r3).toEqual({ repeats: 3, requests: 2, split: 0, splitShare: 0, bar: 0.1, allowed: 0, incomplete: 0, holds: true, splitRequests: [] });
    expect(thrice.err).toMatch(/^R3 voice: 0 of 2 requests split between delivered and not over 3 repetitions \(share 0\), 0 allowed at 0\.1: holds$/m);
    expect(readFileSync(join(dir, 'out', 'delivered-for-audit.md'), 'utf8')).toMatch(/^## q1#3 \(skill voice\)$/m);
  }, 180_000);

  /** A finished run's cache, written by hand: two skills, sixty requests each, three repetitions. `splitOn(skill, i)`: the second repetition of that request was refused. */
  const finished = (name: string, splitOn: (skill: string, i: number) => boolean): { dir: string; args: string[] } => {
    const dir = tmp(name); mkdirSync(join(dir, 'out'));
    const reqs = ['alpha', 'beta'].flatMap((skill) => Array.from({ length: 60 }, (_, i) => ({ id: `${skill}-${i}`, skill, request: `Write about decision ${i}.` })));
    writeFileSync(join(dir, 'requests.jsonl'), jsonl(reqs));
    const cache: Record<string, object> = {};
    for (const q of reqs) for (const k of [1, 2, 3]) {
      const refused = k === 2 && splitOn(q.skill, Number(q.id.split('-')[1]));
      cache[k === 1 ? q.id : `${q.id}#${k}`] = { skill: q.skill, request: q.request, code: refused ? 3 : 0, tries: 1, delivered: !refused, output: refused ? null : 'A delivered answer.', conformant: !refused, reasons: refused ? ['a required rule is broken'] : [], ...(k === 1 ? {} : { repetition: k }) };
    }
    writeFileSync(join(dir, 'out', 'cache.json'), JSON.stringify(cache));
    return { dir, args: ['--requests', join(dir, 'requests.jsonl'), '--data', data, '--project', proj, '--out', join(dir, 'out'), '--base-url', 'http://127.0.0.1:1'] };
  };
  it('R3 counts the requests delivered on some repetitions and refused on others, and fails the verdict over the bar, in whole requests', () => {
    // seven of alpha's sixty split, where floor(0.10 x 60) = 6 are allowed; every run is cached, so no model is asked
    const over = finished('strict-split', (skill, i) => skill === 'alpha' && i < 7);
    const r = run('studies/harness/strict-delivery.mjs', ...over.args, '--repeats', '3');
    expect(r.code, r.all).toBe(0);
    const result = whole(over.dir);
    expect(result.perSkill.alpha.r3).toMatchObject({ requests: 60, split: 7, splitShare: 0.117, allowed: 6, holds: false, splitRequests: Array.from({ length: 7 }, (_, i) => `alpha-${i}`) });
    expect(result.perSkill.beta.r3).toMatchObject({ requests: 60, split: 0, splitShare: 0, holds: true });
    // R1 and R2 are read over every run: 180 a skill, seven of alpha's not delivered, and that is still under the bar
    expect(result.perSkill.alpha).toMatchObject({ requests: 60, runs: 180, delivered: 173, refused: 7, r2: { bar: 0.15, holds: true } });
    expect(result).toMatchObject({ bar: 0.15, repeats: 3, repeatBar: 0.1 });
    expect(result.verdict).toBe('FAIL: R3 (alpha): 7 of 60 requests were delivered on some repetitions and not on others, where 6 are allowed');
    expect(r.err).toMatch(/^R3 alpha: 7 of 60 requests split between delivered and not over 3 repetitions \(share 0\.117\), 6 allowed at 0\.1: does not hold$/m);
    expect(r.err).toMatch(/^FAIL: R3 \(alpha\)/m);
    // six is at the bar and holds; nothing has failed, and R1 is still a person's
    const at = finished('strict-at-bar', (skill, i) => skill === 'alpha' && i < 6);
    expect(run('studies/harness/strict-delivery.mjs', ...at.args, '--repeats', '3').code).toBe(0);
    expect(whole(at.dir).perSkill.alpha.r3).toMatchObject({ split: 6, allowed: 6, holds: true });
    expect(whole(at.dir).verdict).toMatch(/^PENDING THE AUDIT: R2 and R3 hold for every skill\. R1 is read by a person: audit .*delivered-for-audit\.md/);
    // a stricter sealed bar fails the same runs, and so does a stricter refusal bar
    expect(run('studies/harness/strict-delivery.mjs', ...at.args, '--repeats', '3', '--repeat-bar', '0.05').code).toBe(0);
    expect(whole(at.dir).verdict).toBe('FAIL: R3 (alpha): 6 of 60 requests were delivered on some repetitions and not on others, where 3 are allowed');
    expect(run('studies/harness/strict-delivery.mjs', ...at.args, '--repeats', '3', '--bar', '0.05').code).toBe(0);
    expect(whole(at.dir).verdict).toMatch(/^FAIL: R2 \(alpha\): not delivered on 0\.033 of its runs, upper bound 0\.071, where under 0\.05 is needed$/);
    // the same cache read once a request is the first repetition alone: nothing split, and no R3 in the result
    expect(run('studies/harness/strict-delivery.mjs', ...over.args).code).toBe(0);
    expect(whole(over.dir).perSkill.alpha.r3).toBeUndefined();
    expect(whole(over.dir).perSkill.alpha).toMatchObject({ requests: 60, delivered: 60, refused: 0 });
    expect(whole(over.dir).verdict).toMatch(/^PENDING THE AUDIT: R2 holds for every skill\./);
  });
  it('a number of repetitions or a bar that is not one is refused before anything is run (exit 2)', () => {
    const f = finished('strict-flags', () => false);
    for (const n of ['0', '21', '1.5', 'many']) {
      const r = run('studies/harness/strict-delivery.mjs', ...f.args, '--repeats', n);
      expect(r.code, n).toBe(2);
      expect(r.err).toMatch(/--repeats is .*: it must be a whole number from 1 to 20, the times each request is run\. Nothing was spent\./);
    }
    expect(run('studies/harness/strict-delivery.mjs', ...f.args, '--bar', '0.2').err).toMatch(/--bar is "0\.2": it must be a share above 0 and at most 0\.15, the most the pre-registration allows/);
    expect(run('studies/harness/strict-delivery.mjs', ...f.args, '--repeat-bar', '0').code).toBe(2);
    expect(existsSync(join(f.dir, 'out', 'strict-delivery.json'))).toBe(false);
  });
});

describe('the voice gate\'s first verdict is UNRESOLVED, never FAIL, until a person has been through the plants', () => {
  interface Gate { verdict: Record<string, string>; unresolved?: string; measures: { planted: number } }
  const gate = (out: string, ...args: string[]): Ran => run('studies/harness/voice-gate-qualification.mjs', '--out', out, '--base-url', url(), ...args);
  const read = (r: Ran): Gate => JSON.parse(r.out) as Gate;
  const out = tmp('gate');
  beforeAll(async () => {
    // One plant for every pair and kind: a word that is new in the paragraph, or, for a dropped fact, words the
    // author's paragraph holds and the plant does not. The reader finds nothing.
    const plant = PLAIN.replace('There were no complaints afterwards', 'There were no complaints from the zebra afterwards');
    await scripted({ emit_plant: { paragraph: plant, words: 'zebra' }, emit_changes: { changes: [] } }, [{ contains: 'remove ONE fact', answer: { paragraph: PLAIN, words: 'Nobody regretted' } }]);
  });
  afterAll(async () => { await scripted(); });

  it('unreviewed: every gate is UNRESOLVED, with the reason and the command to run next', () => {
    const r = gate(out, '--bank', bank());
    expect(r.code, r.all).toBe(0);
    const g = read(r);
    expect(g.measures.planted).toBe(360);
    expect(g.verdict).toEqual({ lists: 'UNRESOLVED', listsAndReader: 'UNRESOLVED', ledgerAndReader: 'UNRESOLVED' });
    expect(g.unresolved).toMatch(/the plants have not been reviewed by a person\. Read .*plants-for-review\.md, list the ones to reject in a file, and run: node studies\/harness\/voice-gate-qualification\.mjs --bank .* --out .* --rejected <file> \(or --reviewed when none is rejected\)/);
    expect(r.err).toMatch(/^UNRESOLVED: the plants have not been reviewed/m);
    expect((JSON.parse(readFileSync(join(out, 'voice-gate.json'), 'utf8')) as Gate).verdict.lists).toBe('UNRESOLVED');
  }, 120_000);
  it('reviewed, with enough plants: each gate is read, PASS or FAIL', () => {
    const g = read(gate(out, '--bank', bank(), '--reviewed'));
    expect(g.unresolved).toBeUndefined();
    for (const v of Object.values(g.verdict)) expect(['PASS', 'FAIL']).toContain(v);
    // a plant a person rejected is left out, and a rejection file is a review
    const rejected = join(out, 'rejected.txt');
    const first = (JSON.parse(readFileSync(bank(), 'utf8')) as { pairs: { id: string }[] }).pairs[0].id;
    writeFileSync(rejected, `${first}|CLEAN\n`);
    expect(read(gate(out, '--bank', bank(), '--rejected', rejected)).unresolved).toBeUndefined();
  }, 120_000);
  it('reviewed, with too few valid plants: UNRESOLVED, saying how many there are', () => {
    const small = tmp('gate-small');
    const all = JSON.parse(readFileSync(bank(), 'utf8')) as { pairs: object[]; hash: string };
    writeFileSync(join(small, 'bank.json'), JSON.stringify({ ...all, pairs: all.pairs.slice(0, 3) }));
    const g = read(gate(join(small, 'out'), '--bank', join(small, 'bank.json'), '--reviewed'));
    expect(g.verdict).toEqual({ lists: 'UNRESOLVED', listsAndReader: 'UNRESOLVED', ledgerAndReader: 'UNRESOLVED' });
    expect(g.unresolved).toMatch(/too few valid plants to read the bars: 18 in all \(200 needed\), and fewer than 30 of FACT_CHANGED, /);
  });
  it('a --rejected file that is not there is an error before anything is spent, never an empty list of rejections', () => {
    const dir = tmp('gate-typo');
    const r = run('studies/harness/voice-gate-qualification.mjs', '--bank', bank(), '--out', join(dir, 'out'), '--rejected', join(dir, 'rejectd.txt'));
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/--rejected .*rejectd\.txt: no such file\..*or pass --reviewed when none is rejected\. Nothing was spent\./);
    expect(existsSync(join(dir, 'out'))).toBe(false);
  });
  it('the header names a writer model that has a price, the one the code defaults to', () => {
    const src = readFileSync(resolve('studies/harness/voice-gate-qualification.mjs'), 'utf8');
    expect(src).toMatch(/\[--writer claude-sonnet-5\] /);
    expect(src).toContain('arg(\'--writer\', \'claude-sonnet-5\')');
    expect(src).not.toContain('claude-sonnet-5-5');
  });
});

describe('the benchmark runner labels any number of arms, and a strict refusal is read the same way by every script after it', () => {
  const work = tmp('bench');
  const TASKS = [0, 1, 2].map((t) => ({ id: `t${t}`, prompt: `Explain decision ${t}.`, wants: 'explain' }));
  writeFileSync(join(work, 'tasks.jsonl'), jsonl(TASKS));
  const answers = (condition: string, text: (task: number, trial: number) => string | null): object[] => [1, 2].flatMap((trial) => [0, 1, 2].map((t) => ({ case_id: `t${t}`, trial, condition, runner: 'atelier-compare', response: text(t, trial) })));
  // the hand-written arm breaks a required rule on every answer; the candidate is clean, and refused one task once
  writeFileSync(join(work, 'hand.jsonl'), jsonl(answers('handwritten', () => BREAKS)));
  writeFileSync(join(work, 'plugin.jsonl'), jsonl(answers('plug-in', (t, trial) => (t === 2 && trial === 2 ? null : CLEAN))));
  interface Verify { case_id: string; trial: number; condition: string; broken: boolean; rules: string[]; applicable: number; held: number; delivered?: boolean }
  const verifyRows = (...args: string[]): Ran => run('bench/compare/verify-rows.mjs', '--skill', 'voice', '--data', data, ...args);

  it('run.mjs takes a claim\'s own arm label, from any directory, against another backend', async () => {
    await scripted();
    const out = join(work, 'runner', 'gepa.jsonl');
    const r = run('bench/compare/run.mjs', '--tasks', join(work, 'tasks.jsonl'), '--arm', 'none', '--condition', 'gepa-tuned', '--out', out, '--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--price-in', '1', '--price-out', '1');
    expect(r.code, r.all).toBe(0);
    expect(rowsOf<{ condition: string; response: string }>(out).map((x) => `${x.condition}: ${x.response}`)).toEqual([0, 1, 2].map(() => `gepa-tuned: ${CLEAN}`));
    // a cap under --per-call never starts, and says which flag to change
    const small = run('bench/compare/run.mjs', '--tasks', join(work, 'tasks.jsonl'), '--arm', 'none', '--condition', 'other', '--out', out, '--cap', '0.1', '--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--price-in', '1', '--price-out', '1');
    expect(small.code).toBe(3);
    expect(small.err).toMatch(/pass a smaller --per-call with it/);
    expect(run('bench/compare/run.mjs', '--tasks', join(work, 'tasks.jsonl'), '--arm', 'none', '--condition', 'other', '--out', out, '--cap', '0.1', '--per-call', '0.01', '--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--price-in', '1', '--price-out', '1').code).toBe(0);
  }, 60_000);

  it('verify-rows.mjs writes one row an answer with every field both readers take, and a refusal as a row', () => {
    const out = join(work, 'verify.jsonl');
    const r = verifyRows('--responses', join(work, 'hand.jsonl'), '--responses', join(work, 'plugin.jsonl'), '--out', out);
    expect(r.code, r.all).toBe(0);
    const rows = rowsOf<Verify>(out);
    expect(rows).toHaveLength(12);
    for (const x of rows) expect(Object.keys(x).filter((k) => k !== 'delivered')).toEqual(['case_id', 'trial', 'condition', 'broken', 'rules', 'applicable', 'held']);
    const hand = rows.filter((x) => x.condition === 'handwritten'); const plugin = rows.filter((x) => x.condition === 'plug-in');
    for (const x of hand) {
      expect(x.broken).toBe(true);
      expect(x.rules.length).toBeGreaterThan(0);
      expect(x.rules.every((id) => typeof id === 'string' && !id.startsWith('UNSOURCED'))).toBe(true);
      expect(x.applicable).toBeGreaterThanOrEqual(x.rules.length);
      expect(x.held).toBe(x.applicable - x.rules.length);
    }
    const refusal = plugin.find((x) => x.case_id === 't2' && x.trial === 2);
    expect(refusal).toEqual({ case_id: 't2', trial: 2, condition: 'plug-in', broken: true, rules: ['NOT_DELIVERED'], applicable: 0, held: 0, delivered: false });
    // every answer a person got says so: axes.mjs reads delivered against refused from this field
    expect(hand.every((x) => x.delivered === true)).toBe(true);
    for (const x of plugin.filter((y) => y !== refusal)) {
      expect(x).toMatchObject({ broken: false, rules: [], delivered: true });
      expect(x.applicable).toBeGreaterThan(0);
      expect(x.held).toBe(x.applicable);
    }
    expect(r.err).toMatch(/handwritten: 6 of 6 answers break a required rule/);
    expect(r.err).toMatch(/plug-in: 1 of 6 answers break a required rule \(1 of them not delivered\)/);
  }, 120_000);

  it('the one file is accepted by axes.mjs and by closing-quality.mjs', () => {
    const dir = join(work, 'claim'); mkdirSync(dir, { recursive: true });
    const every = (f: (case_id: string, trial: number, condition: string) => object): object[] => ['handwritten', 'plug-in'].flatMap((c) => [1, 2].flatMap((trial) => TASKS.map((t) => f(t.id, trial, c))));
    writeFileSync(join(dir, 'one.jsonl'), jsonl(every((case_id, trial, condition) => ({ case_id, trial, condition, quality: 4, blocker: false }))));
    writeFileSync(join(dir, 'modes.jsonl'), jsonl(every((case_id, trial, condition) => ({ case_id, trial, condition, F1: false, F2: false, F3: false, F4: false, failed: false, unread: 0 }))));
    writeFileSync(join(dir, 'axes.json'), JSON.stringify({ claim: 'A', tasks: join(work, 'tasks.jsonl'), trials: 2, candidate: 'plug-in', handwritten: 'handwritten', reads: ['one.jsonl', 'one.jsonl'], modes: 'modes.jsonl', verify: join(work, 'verify.jsonl') }));
    const axes = run('bench/compare/axes.mjs', '--config', join(dir, 'axes.json'), '--out', join(dir, 'axes'));
    expect(axes.code, axes.all).toBe(0);
    const anchor = rowsOf<{ case_id: string; trial: number; condition: string; failed: boolean }>(join(dir, 'axes', 'rule-anchor.jsonl'));
    expect(anchor.filter((x) => x.failed).map((x) => `${x.condition} ${x.case_id} ${x.trial}`).sort()).toEqual([
      ...[1, 2].flatMap((trial) => TASKS.map((t) => `handwritten ${t.id} ${trial}`)), 'plug-in t2 2'].sort());
    // the refusal is a different rule verdict from the clean answer of the same task: that task is not repeatable
    const repeat = rowsOf<{ case_id: string; condition: string; failed: boolean }>(join(dir, 'axes', 'repeatability.jsonl'));
    expect(repeat.filter((x) => x.failed).map((x) => `${x.condition} ${x.case_id}`)).toEqual(['plug-in t2']);
    writeFileSync(join(dir, 'closing.json'), JSON.stringify({ claim: 'A', k: 9, arm: 'runtime', weights: { quality: 1 }, scores: ['one.jsonl'], conditions: { handwritten: 'handwritten', candidate: 'plug-in' }, verify: join(work, 'verify.jsonl') }));
    const closing = run('bench/compare/closing-quality.mjs', '--config', join(dir, 'closing.json'));
    expect(closing.code, closing.all).toBe(0);
    const result = JSON.parse(closing.out) as { endpoints: { P5: { n: number; pass: boolean; mean: number } } };
    // the candidate held every rule that could be read on its answers; the refusal is left out of that rate, not counted as held
    expect(result.endpoints.P5).toMatchObject({ n: 3, pass: true });
    expect(result.endpoints.P5.mean).toBeGreaterThan(0);
  });

  it('verify-rows.mjs refuses a duplicate, an output that is an input, an existing output without --force, and a row that is not an answer', () => {
    const out = join(work, 'verify.jsonl');
    const before = readFileSync(out, 'utf8');
    const exists = verifyRows('--responses', join(work, 'hand.jsonl'), '--out', out);
    expect(exists.code).toBe(2);
    expect(exists.err).toMatch(/verify\.jsonl is already there\. .*pass --force to replace it/);
    expect(readFileSync(out, 'utf8')).toBe(before);
    const self = verifyRows('--responses', join(work, 'hand.jsonl'), '--out', join(work, 'hand.jsonl'), '--force');
    expect(self.code).toBe(2);
    expect(self.err).toMatch(/--out is .*hand\.jsonl, one of the responses files/);
    const twice = verifyRows('--responses', join(work, 'hand.jsonl'), '--responses', join(work, 'hand.jsonl'), '--out', join(work, 'twice.jsonl'));
    expect(twice.code).toBe(2);
    expect(twice.err).toMatch(/row 1: t0 trial 1 \(handwritten\) is already in .*hand\.jsonl, row 1/);
    expect(existsSync(join(work, 'twice.jsonl'))).toBe(false);
    writeFileSync(join(work, 'empty.jsonl'), jsonl([{ case_id: 't0', trial: 1, condition: 'x', response: '  ' }]));
    const empty = verifyRows('--responses', join(work, 'empty.jsonl'), '--out', join(work, 'no.jsonl'));
    expect(empty.code).toBe(2);
    expect(empty.err).toMatch(/row 1 \(t0 trial 1, x\) has no answer: `response` is text, or null for a strict refusal/);
    expect(verifyRows('--out', join(work, 'no.jsonl')).err).toMatch(/usage: verify-rows\.mjs --responses <file> \[--responses <file> \.\.\.\] --skill <name> --data <ATELIER_DATA> --out <verify\.jsonl> \[--force\]/);
    // --force replaces the file; an unknown skill stops the run naming the answer
    expect(verifyRows('--responses', join(work, 'plugin.jsonl'), '--out', out, '--force').code).toBe(0);
    expect(rowsOf(out)).toHaveLength(6);
    const unknown = run('bench/compare/verify-rows.mjs', '--skill', 'no-such-skill', '--data', data, '--responses', join(work, 'plugin.jsonl'), '--out', join(work, 'no.jsonl'));
    expect(unknown.code).toBe(2);
    expect(unknown.err).toMatch(/t0 trial 1 \(plug-in\): atelier verify could not check this answer/);
    expect(existsSync(join(work, 'no.jsonl'))).toBe(false);
  }, 120_000);

  it('verify-rows.mjs refuses an --out that is a responses file under another name: through a linked folder, or as a link to the file', () => {
    const before = readFileSync(join(work, 'hand.jsonl'), 'utf8');
    const links = tmp('links');
    symlinkSync(work, join(links, 'folder'), 'dir');
    symlinkSync(join(work, 'hand.jsonl'), join(links, 'rows.jsonl'), 'file');
    for (const out of [join(links, 'folder', 'hand.jsonl'), join(links, 'rows.jsonl')]) {
      const r = verifyRows('--responses', join(work, 'hand.jsonl'), '--responses', join(work, 'plugin.jsonl'), '--out', out, '--force');
      expect(r.code, r.all).toBe(2);
      expect(r.err).toMatch(/--out is .*hand\.jsonl, one of the responses files: it would be written over\. Nothing was written\. Name another file\./);
      expect(readFileSync(join(work, 'hand.jsonl'), 'utf8')).toBe(before);
    }
    // a new file in the linked folder is no input, and is written
    expect(verifyRows('--responses', join(work, 'plugin.jsonl'), '--out', join(links, 'folder', 'linked-verify.jsonl')).code).toBe(0);
    expect(rowsOf(join(work, 'linked-verify.jsonl'))).toHaveLength(6);
  }, 120_000);

  it('score.mjs skips a refusal and says how many, instead of crashing on it', () => {
    const out = join(work, 'scores.jsonl');
    const r = run('bench/compare/score.mjs', '--responses', join(work, 'plugin.jsonl'), '--tasks', join(work, 'tasks.jsonl'), '--data', data, '--skill', 'voice', '--out', out);
    expect(r.code, r.all).toBe(0);
    expect(rowsOf(out)).toHaveLength(5);
    expect(r.err).toMatch(/1 row\(s\) with no answer \(a strict refusal, `response: null`\) were not scored: t2 trial 2 \(plug-in\)\. The means below are over delivered answers only\./);
    expect(r.out).toMatch(/mean \d\.\d+ over 5/);
  }, 120_000);

  it('failure-modes.mjs writes no row for an answer its reader could not read, exits 3, and reads it on the next run', async () => {
    const out = join(work, 'modes.jsonl');
    const args = ['--responses', join(work, 'plugin.jsonl'), '--tasks', join(work, 'tasks.jsonl'), '--out', out];
    const failed = run('bench/compare/failure-modes.mjs', ...args, '--base-url', 'http://127.0.0.1:1');
    expect(failed.code, failed.all).toBe(3);
    expect(failed.err).toMatch(/5 answer\(s\) left unread: the reader's call failed \(first: t0 trial 1 \(plug-in\): .*No row was written for them in .*run the same command again to read them/);
    expect(failed.err).not.toMatch(/^done:/m);
    // only the refusal, which code decides alone, was written
    expect(rowsOf<{ case_id: string; trial: number }>(out).map((x) => `${x.case_id} ${x.trial}`)).toEqual(['t2 2']);
    await scripted({ emit_failures: { F1: false, F3: false, quote: '' } });
    const again = run('bench/compare/failure-modes.mjs', ...args, '--base-url', url());
    expect(again.code, again.all).toBe(0);
    const rows = rowsOf<{ F1: boolean | null; F3: boolean | null; unread: number }>(out);
    expect(rows).toHaveLength(6);
    expect(rows.every((x) => x.F1 !== null && x.F3 !== null && x.unread === 0)).toBe(true);
    await scripted();
  }, 120_000);

  it('rubric-judge.mjs exits 3 while a session was not written, and 0 once every session is', async () => {
    writeFileSync(join(work, 'rubric.json'), JSON.stringify({ name: 'r', source: 'test', scale: [1, 10], dimensions: [{ name: 'Directness', question: 'Is it direct?' }] }));
    writeFileSync(join(work, 'judged-answers.jsonl'), jsonl([...answers('handwritten', () => BREAKS), ...answers('plug-in', () => CLEAN)]));
    const out = join(work, 'judged.jsonl');
    const judge = (): Ran => run('bench/compare/rubric-judge.mjs', '--responses', join(work, 'judged-answers.jsonl'), '--tasks', join(work, 'tasks.jsonl'), '--rubric', join(work, 'rubric.json'), '--out', out, '--base-url', url());
    await scripted({ emit_scores: { pieces: [{ label: 'A', Directness: 7, notes: '' }] } });
    const short = judge();
    expect(short.code, short.all).toBe(3);
    expect(short.err).toMatch(/6 session\(s\) of this run were not written, so .*judged\.jsonl does not hold every case\. Run the same command again/);
    expect(existsSync(out)).toBe(false);
    await scripted({ emit_scores: { pieces: [{ label: 'A', Directness: 7, notes: '' }, { label: 'B', Directness: 5, notes: '' }] } });
    const whole = judge();
    expect(whole.code, whole.all).toBe(0);
    expect(rowsOf(out)).toHaveLength(12);
    await scripted();
  }, 120_000);
});
