// tests/atelier-reproduce.test.ts — `atelier reproduce`: A HELD-BACK CASE IS RUN ON ITS TASK AND MATERIAL, NEVER ON ITSELF.
//
// Through the binary, against the scripted backend: a skill is built from a folder of cases, one full case is held
// back, and the command runs it. What is asserted is the rule (no request carries the reference), the count (binary
// per case, the expert's own piece read beside it), and what is said when nothing can be run.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderReproduction, countsOf, type ReproductionRecord, type CaseOutcome } from '../core/eval/reproduce.js';
import { goldenCase, whyNotRunnable, repeatsReference, CARRIED_RUN, HOLDS_THE_WORK } from '../core/golden/case.js';

const CLI = resolve('dist/cli/atelier.mjs');
const ENV: NodeJS.ProcessEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ATELIER|ANTHROPIC|OPENAI)_/.test(k))), ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' };
const CLEAN = 'We compared the two on the same terms. The filing gives the figures, and the order follows from them.';
const BREAKS = 'Let us delve into the rich tapestry of this ever-evolving landscape. It\'s not a tool, it\'s a movement. Here\'s the thing: here\'s why. Here\'s how.';

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const factor = { description: 'Lead with the verdict, then the comparison.', appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['plain-3.md'], wouldBeAbsentIf: 'the opposite shows', needsFromUser: '', quote: '' };
const scripted = (piece: string): Promise<unknown> => fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
  emit_factors: { factors: [factor] }, emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }] }, emit_observation: { applicable: true, present: true, why: 'seen' },
  emit_persona: { points: [] }, emit_piece: { piece }, emit_answer: { answer: piece } } }) });
const served = async (): Promise<string[]> => (await (await fetch(`${url()}/__log`)).json() as { bodies: string[] }).bodies;

const root = realpathSync(mkdtempSync(join(tmpdir(), 'atelier-reproduce-')));
const data = join(root, 'data'); const proj = join(root, 'proj'); const dir = join(proj, 'reports');
const atelier = (...args: string[]): { code: number; out: string; err: string } => {
  const r = spawnSync(process.execPath, [CLI, ...args, '--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'], { encoding: 'utf8', cwd: proj, env: { ...ENV, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj }, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
};
// Each piece its own words, so no rule is read from a repeated sentence; each reference ends on a line no task or material holds.
const W = ['quiet', 'plain', 'early', 'late', 'slow', 'brisk', 'narrow', 'broad', 'steady', 'loose', 'careful', 'blunt'];
const N = ['plan', 'draft', 'review', 'launch', 'budget', 'meeting', 'handover', 'estimate', 'rollback', 'release', 'audit', 'brief'];
const body = (i: number): string => Array.from({ length: 14 }, (_, k) => `We set the ${W[(i + k) % 12]} ${N[k % 12]} beside the ${W[(i * 5 + k * 7) % 12]} ${N[(i + k * 5) % 12]} and wrote down which one the filing supports. I think the order matters, and I do not say it lightly.`).join('\n\n');
const SECRET = (who: string): string => `The verdict nobody was told: ${who} wins only once the seat minimum is counted against the other.`;

beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
  await scripted(CLEAN);
  mkdirSync(data); mkdirSync(dir, { recursive: true });
  // two full cases, six of finished work alone: one of the two full cases is held back
  for (const who of ['acme', 'borealis']) {
    mkdirSync(join(dir, `${who}.material`));
    writeFileSync(join(dir, `${who}.md`), `---\nrequest: Compare ${who} with its nearest rival on price for a team of ten.\n---\n${body(who === 'acme' ? 0 : 1)}\n\n${SECRET(who)}`);
    writeFileSync(join(dir, `${who}.material`, 'filing.md'), `${who} lists twelve dollars a seat with a fifty seat minimum, and its rival lists fifteen with none. `.repeat(6));
  }
  for (let i = 3; i < 9; i++) writeFileSync(join(dir, `plain-${i}.md`), body(i));
  const NEW = ['new', dir, 'competitive analysis, the way these are done', '--name', 'analysis'];
  const first = atelier(...NEW); if (first.code !== 0) throw new Error(`new: ${first.err}${first.out}`);
  const built = atelier(...NEW, '--accept'); if (built.code !== 0) throw new Error(`accept: ${built.err}${built.out}`);
}, 300_000);
afterAll(() => { backend.kill(); });

describe('through the binary: one full case held back, run on its task and material', () => {
  const held = (): string => { const s = JSON.parse(readFileSync(join(data, 'skills', 'analysis', 'reproduction.json'), 'utf8')) as ReproductionRecord; return s.cases[0].id.replace(/\.md$/, ''); };

  it('--dry-run says what would be served and calls nothing', async () => {
    const before = (await served()).length;
    const r = atelier('reproduce', '--skill', 'analysis', '--dry-run');
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/^would run {2}(acme|borealis)\.md\n {2}task: Compare (acme|borealis) with its nearest rival on price for a team of ten\.\n {2}material: (acme|borealis)\.material\/filing\.md \(\d+ words\)$/m);
    expect(r.out).toMatch(/--dry-run: 1 of 1 case\(s\) would be run; nothing was called and nothing was written\./);
    const plan = JSON.parse(atelier('reproduce', '--skill', 'analysis', '--dry-run', '--json').out) as { cases: { id: string; runs: boolean; task?: string }[] };
    expect(plan.cases).toHaveLength(1);
    expect(plan.cases[0]).toMatchObject({ runs: true });
    expect((await served()).length).toBe(before);
    expect(existsSync(join(data, 'skills', 'analysis', 'reproduction.json'))).toBe(false);
  });

  it('runs the held-back case, and no request it makes carries the reference', async () => {
    const before = (await served()).length;
    const r = atelier('reproduce', '--skill', 'analysis');
    expect(r.code, `${r.err}${r.out}`).toBe(0);
    expect(r.out).toMatch(/^reproduced {5} (acme|borealis)\.md$/m);
    expect(r.out).toMatch(/REPRODUCTION ON WORK THE SKILL NEVER SAW · analysis · 1 case\n {2}1 of 1 {3}reproduced: the run's own verdict was "conformant"/);
    // the pattern check is not a qualified reader, and the record does not say facts were read
    expect(r.out).toMatch(/not read {3}unsupported specifics: no qualified reader read every case, so the pattern check decided/);
    expect(r.out).toMatch(/\(patterns only\)/);
    expect(r.out).toMatch(/1 case: a count, not a rate\./);
    expect(r.out).not.toMatch(/READY|CERTIFIED|score/i);
    const who = held();
    const bodies = (await served()).slice(before);
    expect(bodies.length).toBeGreaterThan(0);
    // the task and the material reached the writer; the held-back piece did not, in any request of the run
    expect(bodies.some((b) => b.includes(`Compare ${who} with its nearest rival`))).toBe(true);
    expect(bodies.some((b) => b.includes(`${who} lists twelve dollars a seat`))).toBe(true);
    // (the other full case was learned from, and its piece may be served as the author's: only the held-back one is tested)
    for (const b of bodies) expect(b).not.toContain(`${who} wins only once the seat minimum`);
    // and it was never in any request since the build either: not at discovery, not in the skill
    for (const b of await served()) expect(b).not.toContain(`${who} wins only once the seat minimum`);
    const rec = JSON.parse(readFileSync(join(data, 'skills', 'analysis', 'reproduction.json'), 'utf8')) as ReproductionRecord;
    expect(rec).toMatchObject({ schema: 1, skill: 'analysis', heldBack: { full: 1, taskOnly: 0, referenceOnly: 0 } });
    expect(rec.cases[0]).toMatchObject({ state: 'ran', conformant: true, claims: { qualified: false } });
    expect(rec.cases[0].sharedWithReference).toBeLessThan(CARRIED_RUN);
    expect(rec.cases[0].words.reference).toBeGreaterThan(300);
    expect(rec.timesRun).toBe(1);
    // a reproduction is not the person's last piece of work: the pointer a bare `atelier report` follows is as it was
    expect(existsSync(join(data, 'runs')) ? atelier('report').out : '').not.toMatch(new RegExp(`Compare ${who} with its nearest rival`));
  }, 120_000);

  it('an output that breaks a required rule is not reproduced, and the count says so', async () => {
    await scripted(BREAKS);
    try {
      const r = atelier('reproduce', '--skill', 'analysis', '--json');
      expect(r.code, r.err).toBe(0);
      const rec = JSON.parse(r.out) as ReproductionRecord & { counts: ReturnType<typeof countsOf> };
      expect(rec.cases[0]).toMatchObject({ state: 'ran', conformant: false });
      expect(rec.counts).toMatchObject({ ran: 1, reproduced: 0 });
      // the same held-back case, run a second time on this skill: said, because it is no longer unseen
      expect(rec.timesRun).toBe(2);
      expect(atelier('report', '--skill', 'analysis').out).toMatch(/These cases have now been run 2 times on this skill\. A piece held back is unseen once/);
    } finally { await scripted(CLEAN); }
  }, 120_000);

  it('the skill\'s report carries the last reproduction', () => {
    const r = atelier('report', '--skill', 'analysis');
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/REPRODUCTION ON WORK THE SKILL NEVER SAW · analysis · 1 case/);
    expect((JSON.parse(atelier('report', '--skill', 'analysis', '--json').out) as { reproduction?: { schema: number } }).reproduction?.schema).toBe(1);
  });
  it('under strict delivery a refusal is a case that was run and not reproduced, never one left out of the count', async () => {
    await scripted(BREAKS);
    try {
      const r = atelier('reproduce', '--skill', 'analysis', '--strict', '--json');
      expect(r.code, r.err).toBe(0);
      const rec = JSON.parse(r.out) as ReproductionRecord & { counts: ReturnType<typeof countsOf> };
      expect(rec.cases[0]).toMatchObject({ state: 'ran', conformant: false, refused: true });
      expect(rec.counts).toMatchObject({ ran: 1, reproduced: 0, refused: 1 });
    } finally { await scripted(CLEAN); }
  }, 120_000);

  it('a skill that is not there, and a folder whose run did not build the skill, are each refused in so many words', () => {
    const none = atelier('reproduce', '--skill', 'no-such-skill');
    expect(none.code).not.toBe(0);
    expect(`${none.err}${none.out}`).toMatch(/no built skill called "no-such-skill"/);
    const elsewhere = mkdtempSync(join(tmpdir(), 'atelier-reproduce-else-'));
    const r = spawnSync(process.execPath, [CLI, 'reproduce', '--skill', 'analysis'], { encoding: 'utf8', cwd: elsewhere, env: { ...ENV, ATELIER_DATA: data, ATELIER_PROJECT_DIR: elsewhere } });
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/this folder's run did not build "analysis"|carries on the run|took a copy/);
  });
});

describe('a case is audited before it is run, and its output after', () => {
  const material = [{ name: 'filing.md', text: 'Acme lists twelve dollars a seat with a fifty seat minimum, and its rival lists fifteen with none.' }];
  const reference = `${Array.from({ length: 12 }, (_, k) => `We set point ${k} beside the filing and wrote down which vendor it favours.`).join(' ')} Acme wins only once the seat minimum is counted against the other vendor in the pair.`;
  it('a case with a task and honest material may be run', () => {
    expect(whyNotRunnable(goldenCase('a', reference, 'Compare Acme with its rival on price.', material))).toBeNull();
    expect(whyNotRunnable(goldenCase('a', reference, null, material))).toBe('it carries no task');
  });
  it('a task that repeats the finished work is not run', () => {
    const why = whyNotRunnable(goldenCase('a', reference, 'Compare them. Acme wins only once the seat minimum is counted against the other vendor.', material));
    expect(why).toMatch(/^its task repeats 1[0-9] words in a row of the finished work, so running it would give the skill part of the answer\. Word the task as it was asked/);
  });
  it('material that holds the finished work is not run: the audit\'s exemption for material must not cover a copy', () => {
    const filed = [...material, { name: 'final-report.md', text: reference }];
    expect(whyNotRunnable(goldenCase('a', reference, 'Compare Acme with its rival on price.', filed))).toMatch(/^its material \(final-report\.md\) holds \d+ words in a row of the finished work, so the skill would be handed the answer/);
    const withNotes = [{ name: 'notes.md', text: `My notes first. ${reference} And a closing remark.` }];
    expect(whyNotRunnable(goldenCase('a', reference, 'Compare Acme with its rival on price.', withNotes))).toMatch(/holds \d+ words in a row/);
    // an expert quoting a source is not that: a sentence shared is far under the line
    const quoting = `${reference} As the filing says: ${material[0].text}`;
    expect(whyNotRunnable(goldenCase('a', quoting, 'Compare Acme with its rival on price.', material))).toBeNull();
    expect(HOLDS_THE_WORK).toBeGreaterThan(material[0].text.split(' ').length);
  });
  it('an output that carries the held-back piece\'s own wording is caught after the run; the material\'s wording is not', () => {
    const c = goldenCase('a', reference, 'Compare Acme with its rival on price.', material);
    expect(repeatsReference('We found that Acme wins only once the seat minimum is counted against the other vendor in the pair.', c)).toBeGreaterThanOrEqual(CARRIED_RUN);
    expect(repeatsReference(`Our reading: ${material[0].text}`, goldenCase('a', `${reference} ${material[0].text}`, 't', material))).toBeLessThan(CARRIED_RUN);
    expect(repeatsReference('Acme is cheaper for a large team and dearer for a small one.', c)).toBeLessThan(CARRIED_RUN);
  });
});

describe('the record is a count of cases, read beside the expert\'s own work', () => {
  const one = (over: Partial<CaseOutcome>): CaseOutcome => ({ id: 'a.md', state: 'ran', conformant: true, required: { held: 5, applicable: 5 }, claims: { qualified: true, instrument: 'reader', unsupported: 0 }, reference: { met: 5, applicable: 5 }, words: { output: 900, reference: 1000 }, costUsd: 0.2, ...over });
  const rec = (cases: CaseOutcome[], heldBack = { full: cases.length, taskOnly: 0, referenceOnly: 0 }, timesRun = 1): ReproductionRecord => ({ schema: 1, skill: 'x', skillVersion: 'a', standardVersion: 'b', at: '', heldBack, cases, notCheckable: 2, timesRun, costUsd: 0 });
  it('binary per case; rules and facts are never added into one number', () => {
    const r = rec([one({}), one({ id: 'b.md', conformant: false, required: { held: 4, applicable: 5 } }), one({ id: 'c.md', conformant: false, claims: { qualified: true, instrument: 'reader', unsupported: 2 } }), one({ id: 'd.md', reference: { met: 4, applicable: 5 } })]);
    expect(countsOf(r)).toEqual({ ran: 4, reproduced: 2, refused: 0, factSafe: 3, required: { held: 19, applicable: 20 }, reference: { met: 19, applicable: 20, whole: 3 } });
    const text = renderReproduction(r);
    expect(text).toMatch(/· 4 cases\n {2}2 of 4 {3}reproduced: the run's own verdict was "conformant"\n {2}3 of 4 {3}with no unsupported specific, read by a qualified reader\n {2}19 of 20 {3}required rules met, over the 4 cases\n {2}19 of 20 {3}on your own held-back work, for the counted required rules that apply to every piece; 3 of 4 of your pieces meet every one/);
    expect(text).toMatch(/2 required rules cannot be checked by code, and are in none of these counts/);
    expect(text).toMatch(/Where your own piece breaks such a rule, the rule asks for more than your work does/);
    expect(text).toMatch(/4 cases: a count, not a rate\./);
    expect(text).not.toMatch(/%|\bscore\b|READY|CERTIFIED|These cases have now been run/i);
  });
  it('a refusal is counted as run and not reproduced; a case that could not be run is listed and is in no count', () => {
    const r = rec([one({}), one({ id: 'b.md', conformant: false, refused: true, claims: null }), one({ id: 'c.md', state: 'not-run', why: 'its task repeats 12 words in a row of the finished work', conformant: null, required: null, claims: null })]);
    expect(countsOf(r)).toMatchObject({ ran: 2, reproduced: 1, refused: 1, factSafe: 1 });
    const text = renderReproduction(r);
    expect(text).toMatch(/1 of 2 {3}reproduced: the run's own verdict was "conformant" \(1 refused under strict delivery, counted as not reproduced\)/);
    expect(text).toMatch(/not run: c\.md: its task repeats 12 words in a row of the finished work/);
    expect(text).toMatch(/not reproduced {2}b\.md {2}· {2}5\/5 rules · refused, nothing delivered/);
  });
  it('facts are "not read" unless a qualified reader read every case, and one piece is "meets"', () => {
    const r = rec([one({ claims: { qualified: false, instrument: 'pattern check', unsupported: 0 } })]);
    expect(countsOf(r)).toMatchObject({ ran: 1, reproduced: 1, factSafe: null });
    expect(renderReproduction(r)).toMatch(/not read {3}unsupported specifics: no qualified reader read every case, so the pattern check decided, and it misses what a reader finds/);
    expect(renderReproduction(r)).toMatch(/1 of 1 of your pieces meets every one/);
    expect(renderReproduction(r)).toMatch(/0 unsupported \(patterns only\)/);
  });
  it('with no counted required rule, and with no case that ran, it says so and prints no empty count', () => {
    const none = renderReproduction(rec([one({ required: { held: 0, applicable: 0 }, reference: { met: 0, applicable: 0 } })]));
    expect(none).toMatch(/No required rule is checked by code on these cases: "reproduced" says only that nothing unsupported was found\./);
    expect(none).not.toMatch(/0 of 0/);
    const failed = renderReproduction(rec([one({ state: 'not-run', why: 'the run ended with no result: boom', conformant: null, required: null, claims: null })]));
    expect(failed).toBe('REPRODUCTION · x: no case could be run.\n  not run: a.md: the run ended with no result: boom');
  });
  it('run more than once on a skill, it says the cases are no longer unseen', () => {
    expect(renderReproduction(rec([one({})], undefined, 3))).toMatch(/These cases have now been run 3 times on this skill\. A piece held back is unseen once: if the skill was changed between runs because of what they showed, read this as work in progress, not as a test\./);
  });
  it('an output that carried the reference\'s wording is not reproduced, and its line says why', () => {
    const text = renderReproduction(rec([one({ conformant: false, sharedWithReference: 18, why: 'the output repeats 18 words in a row of the held-back piece that are not in its material: something served them, and this is not a reproduction' })]));
    expect(text).toMatch(/not reproduced {2}a\.md .* · the output repeats 18 words in a row of the held-back piece/);
  });
  it('with nothing that can be run it says why, and what to add', () => {
    expect(renderReproduction(rec([], { full: 0, taskOnly: 1, referenceOnly: 2 }))).toBe('REPRODUCTION · x: not tested.\n  3 pieces held back, and none carries both its task and the material it was made from. A candidate can only be given what you were given when both are there.\n  Add the task (`request:` in the front matter) and the material (a folder `<example>.material` beside it) to some examples, and build again.');
    expect(renderReproduction(rec([], { full: 0, taskOnly: 0, referenceOnly: 0 }))).toMatch(/No piece was held back when this skill was built\./);
  });
});
