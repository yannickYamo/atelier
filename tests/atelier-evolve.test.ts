// tests/atelier-evolve.test.ts — A SKILL IMPROVES ITSELF ON ITS OWNER'S REQUIREMENTS, AND IS HELD BACK FROM FOOLING ITSELF.
//
// The search may change how a method is carried and never the standard (core/evolve/loop.ts). What is held here is
// the discipline: briefs set aside before anything runs, a noise band read off two runs of the unchanged skill, one
// change at a time and none tried twice, a cost a change must buy, a refusal of any candidate that carries a brief,
// and adoption only when the change is no worse on the briefs set aside.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { splitBriefs, noiseBand, proposals, rule, leak, scoreOf, renderEvolve, carryKey, allowance, readRun, MIN_BRIEFS, NOTE_HEAD, type Carry, type Scored, type EvolveRecord } from '../core/evolve/loop.js';

const scored = (ok: number, n: number, costUsd = 1, missing: Record<string, number> = {}): Scored => ({ ok, n, costUsd, missing });
const plain: Carry = { drafts: 1, note: '' };
const statements = new Map([['x1', 'Open with a Verdict section.'], ['x2', 'Include the price table.']]);

describe('briefs are set aside before anything is run, blind to what they say', () => {
  const ids = Array.from({ length: 10 }, (_, i) => ({ id: `brief-${i}.md` }));
  it('a fifth, at least two, the same ones every time', () => {
    const a = splitBriefs(ids); const b = splitBriefs([...ids].reverse());
    expect(a.heldBack).toHaveLength(2);
    expect(a.dev).toHaveLength(8);
    expect(a.heldBack.map((x) => x.id)).toEqual(b.heldBack.map((x) => x.id));
    expect(splitBriefs(ids.slice(0, 6)).heldBack).toHaveLength(2);
    expect(MIN_BRIEFS).toBe(6);
  });
});

describe('a gain inside what two runs of the same skill differ by is not a gain', () => {
  it('the band is the difference between the two runs, and never less than one case', () => {
    expect(noiseBand(scored(5, 8), scored(5, 8))).toBe(1);
    expect(noiseBand(scored(3, 8), scored(6, 8))).toBe(3);
  });
  it('a candidate is kept only beyond the band', () => {
    expect(rule(scored(6, 8), 5, 1, 1, 'NOTE')).toEqual({ keep: false, why: '6 of 8 against 5: a gain of 1 is inside the noise band of 1 case(s)' });
    expect(rule(scored(7, 8), 5, 1, 1, 'NOTE')).toMatchObject({ keep: true });
    expect(rule(scored(7, 8), 5, 1, 3, 'NOTE').keep).toBe(false);
  });
  it('a change that costs more must buy it with cases: a third more for each tenth gained', () => {
    // two of eight gained is two and a half tenths: up to about 82% more cost is bought
    expect(rule(scored(7, 8, 1.8), 5, 1, 1, 'MORE_DRAFTS').keep).toBe(true);
    const dear = rule(scored(7, 8, 2.5), 5, 1, 1, 'MORE_DRAFTS');
    expect(dear.keep).toBe(false);
    expect(dear.why).toMatch(/^it gains 2 case\(s\) and costs 150% more, where 83% is what that gain buys$/);
  });
  it('a saving is kept when no case is lost and the cost falls by a tenth or more', () => {
    expect(rule(scored(8, 8, 0.6), 8, 1, 1, 'FEWER_DRAFTS')).toEqual({ keep: true, why: 'it holds 8 of 8 at 40% less cost' });
    expect(rule(scored(7, 8, 0.6), 8, 1, 1, 'FEWER_DRAFTS').keep).toBe(false);
    expect(rule(scored(8, 8, 0.95), 8, 1, 1, 'FEWER_DRAFTS').keep).toBe(false);
  });
});

describe('what a search spends is counted run by run, and no run is started that what is left cannot cover', () => {
  it('of what is left, the reader of claims has three tenths and never more than half a dollar; the writer has the rest', () => {
    expect(allowance(10, 0, 1)).toEqual({ forRun: 9.5, claims: 0.5 });
    expect(allowance(10, 9, 1)).toEqual({ forRun: 0.7, claims: 0.3 });
  });
  it('under sixty cents left, or a writer\'s part that would not cover twenty cents a draft, starts nothing and says so', () => {
    expect(allowance(10, 9.5, 1)).toEqual({ stop: '$0.50 of the $10 cap was left, too little to start another run of 1 draft(s)' });
    // seventy cents left is forty-nine for the writer: enough for two drafts, not for three
    expect(allowance(10, 9.3, 2)).toEqual({ forRun: 0.49, claims: 0.21 });
    expect(allowance(10, 9.3, 3)).toEqual({ stop: '$0.70 of the $10 cap was left, too little to start another run of 3 draft(s)' });
  });
  const verdict = (conformant: boolean, broken: string[]): string => JSON.stringify({ costUsd: 0.12, invocationId: 'inv-1', eval: { result: { conformant }, gates: { required: { broken: broken.map((id) => ({ id })) } } } });
  const tracked = new Set(['x1', 'x2']);
  it('a run that reached a verdict is a case, with what it cost and which tracked steps it missed', () => {
    expect(readRun('a.md', `a note before\n${verdict(false, ['x2', 'other'])}`, '', false, tracked, 20)).toEqual({ result: { id: 'a.md', ok: false, missing: ['x2'], costUsd: 0.12 }, paid: 0.12, invocationId: 'inv-1', stopped: null });
  });
  it('a run with no verdict is not a case: what it spent is still counted, and the reason is its last words', () => {
    expect(readRun('a.md', '', 'No notes of yours are bound.\natelier: the backend answered 500.\n  This run had spent $0.31 when it stopped.', false, tracked, 20))
      .toEqual({ result: null, paid: 0.31, invocationId: null, stopped: 'the run of "a.md" ended with no verdict (atelier: the backend answered 500.)' });
    // a result with a cost and no evaluation: the cost is the run's own figure
    expect(readRun('a.md', JSON.stringify({ costUsd: 0.4, invocationId: 'inv-2', eval: null }), 'atelier: the evaluation could not be built.', false, tracked, 20))
      .toEqual({ result: null, paid: 0.4, invocationId: 'inv-2', stopped: 'the run of "a.md" ended with no verdict (atelier: the evaluation could not be built.)' });
    expect(readRun('a.md', '', '', true, tracked, 20).stopped).toBe('the run of "a.md" had not answered in 20 minutes and was ended; what it had spent is not known');
  });
});

describe('where the model is not priced, cost is not read as if it were measured', () => {
  it('a gain is judged on cases alone, and a draft fewer that loses no case is kept as a draft fewer', () => {
    expect(rule(scored(7, 8, 0), 5, 0, 1, 'MORE_DRAFTS').keep).toBe(true);
    expect(rule(scored(8, 8, 0), 8, 0, 1, 'FEWER_DRAFTS')).toEqual({ keep: true, why: 'it holds 8 of 8 with a draft fewer (this model is not priced, so the saving is not measured)' });
    expect(rule(scored(7, 8, 0), 8, 0, 1, 'FEWER_DRAFTS').keep).toBe(false);
  });
});

describe('one change at a time, read off what the last runs got wrong, and none tried twice', () => {
  it('drafts that leave required things out get a note that names them, in the owner\'s words, most-missed first', () => {
    const c = proposals(plain, scored(2, 8, 1, { x2: 5, x1: 3 }), statements, new Set());
    expect(c.map((x) => x.gene)).toEqual(['NOTE', 'MORE_DRAFTS']);
    expect(c[0].carry.note).toBe('Earlier drafts of this work missed these. Each is required: check it before you finish.\n- Include the price table. (missed in 5 of 8)\n- Open with a Verdict section. (missed in 3 of 8)');
    expect(c[0].carry.drafts).toBe(1);
    expect(c[1].carry).toEqual({ drafts: 2, note: '' });
    expect(c[0].hypothesis).toMatch(/naming what drafts missed \(x2, x1\) gets it written/);
  });
  it('a change that was tried is not tried again; when every case holds, a draft fewer is the only thing left to try', () => {
    expect(proposals(plain, scored(2, 8, 1, { x2: 5 }), statements, new Set(['1d|x2', '2d|']))).toEqual([]);
    expect(proposals({ drafts: 2, note: '' }, scored(8, 8), statements, new Set()).map((x) => [x.gene, x.carry.drafts])).toEqual([['FEWER_DRAFTS', 1]]);
    expect(proposals(plain, scored(8, 8), statements, new Set())).toEqual([]);
  });
  it('a change is one way of carrying the method, whole: the same one is not tried twice however it was reached', () => {
    const both = `${NOTE_HEAD}\n- Include the price table. (missed in 5 of 8)\n- Open with a Verdict section. (missed in 3 of 8)`;
    expect(carryKey({ drafts: 1, note: both }, statements)).toBe('1d|x1,x2');
    expect(carryKey(plain, statements)).toBe('1d|');
    // the same two things named, in another order and with other counts, is the note it already carries
    expect(proposals({ drafts: 1, note: both }, scored(6, 8, 1, { x1: 2 }), statements, new Set()).map((c) => c.key)).toEqual(['2d|x1,x2']);
    // a draft fewer that would be the skill as it started, which was run twice already, is not run again
    expect(proposals({ drafts: 2, note: '' }, scored(8, 8), statements, new Set(['1d|']))).toEqual([]);
    // the note that did not hold at one draft is another change at two
    expect(proposals({ drafts: 2, note: '' }, scored(2, 8, 1, { x2: 5 }), statements, new Set(['1d|x2'])).map((c) => c.key)).toEqual(['2d|x2', '3d|']);
  });
  it('a step whose words begin another step does not take its place in the note', () => {
    const two = new Map([['y1', 'Include a table'], ['y2', 'Include a table (with the columns A and B)']]);
    const first = proposals(plain, scored(2, 8, 1, { y2: 4 }), two, new Set())[0].carry;
    const second = proposals(first, scored(5, 8, 1, { y1: 3 }), two, new Set())[0].carry;
    expect(second.note).toBe(`${NOTE_HEAD}\n- Include a table (missed in 3 of 8)\n- Include a table (with the columns A and B) (missed in 4 of 8)`);
  });
  it('where the number of drafts belongs to a release, only the note is searched', () => {
    expect(proposals(plain, scored(2, 8, 1, { x2: 5 }), statements, new Set(), { drafts: false }).map((c) => c.gene)).toEqual(['NOTE']);
    expect(proposals({ drafts: 3, note: '' }, scored(8, 8), statements, new Set(), { drafts: false })).toEqual([]);
  });
  it('what an earlier note named stays named when a later one names something else', () => {
    const first = proposals(plain, scored(2, 8, 1, { x2: 5 }), statements, new Set())[0].carry;
    const second = proposals(first, scored(6, 8, 1, { x1: 2 }), statements, new Set())[0].carry;
    expect(second.note).toBe(`${NOTE_HEAD}\n- Open with a Verdict section. (missed in 2 of 8)\n- Include the price table. (missed in 5 of 8)`);
    // and with a note carried, one more draft is a change of its own
    expect(proposals(first, scored(6, 8, 1, { x1: 2 }), statements, new Set()).map((c) => c.key)).toEqual(['1d|x1,x2', '2d|x2']);
  });
  it('never more than four drafts', () => {
    expect(proposals({ drafts: 4, note: '' }, scored(2, 8), statements, new Set())).toEqual([]);
  });
});

describe('a candidate that carries a brief is refused before anything is spent', () => {
  const briefs = [{ id: 'cygnus-pricing.md', task: 'Compare Cygnus and Dorado on price for a small team of ten people.', material: [{ name: 'p.md', text: 'Cygnus lists nine dollars a seat with a hundred seat minimum.' }] }];
  it('a note written from the owner\'s requirements is clean', () => {
    expect(leak('Earlier drafts of this work missed these.\n- Include the price table. (missed in 5 of 8)', briefs)).toBeNull();
    expect(leak('', briefs)).toBeNull();
  });
  it('the standard\'s own words are not a brief\'s because a brief is named after them or quotes them', () => {
    const note = `${NOTE_HEAD}\n- Open with a Verdict section that says who wins, and for whom. (missed in 5 of 8)`;
    const own = [NOTE_HEAD, 'Open with a Verdict section that says who wins, and for whom.'];
    const named = ['work.md', 'drafts.md', 'verdict.txt', 'a.md'].map((id) => ({ id, task: 'Compare them.', material: [] }));
    expect(leak(note, named, own)).toBeNull();
    const quoting = [{ id: 'lot-1.md', task: 'Compare them, and open with a Verdict section that says who wins, please.', material: [] }];
    expect(leak(note, quoting, own)).toBeNull();
    expect(leak(`${note}\n- In lot-1 the cheaper one wins.`, quoting, own)).toBe('it names the brief "lot-1.md"');
    // a brief named like a count is not named by the counts a note carries
    expect(leak(note, [{ id: '5 of 8.md', task: 'Compare them.', material: [] }], own)).toBeNull();
  });
  it('the name of a brief, or six words in a row of its task or material, is a leak', () => {
    expect(leak('For cygnus-pricing, add the table.', briefs)).toBe('it names the brief "cygnus-pricing.md"');
    expect(leak('Remember that Cygnus lists nine dollars a seat with a hundred.', briefs)).toMatch(/^it repeats 6 words in a row of the brief "cygnus-pricing\.md"/);
  });
});

describe('the record says what was tried, what was kept and why, and whether it carried', () => {
  it('reads as a person would want it, and says what is not scored', () => {
    const r: EvolveRecord = { schema: 1, skill: 'analysis', skillVersion: 'a', standardVersion: 'b', at: '', briefs: { dev: ['a', 'b', 'c', 'd', 'e', 'f'], heldBack: ['g', 'h'] }, start: plain,
      baseline: { first: scored(1, 6), second: scored(2, 6), band: 1 },
      trials: [{ round: 1, gene: 'NOTE', key: 'NOTE:x1', hypothesis: 'h', carry: { drafts: 1, note: 'n' }, scored: scored(6, 6), kept: true, why: '6 of 6 against 2: a gain of 4, beyond the noise band of 1' },
        { round: 1, gene: 'MORE_DRAFTS', key: 'DRAFTS:2', hypothesis: 'h', carry: { drafts: 2, note: '' }, scored: scored(2, 6), kept: false, why: '2 of 6 against 2: a gain of 0 is inside the noise band of 1 case(s)' }],
      end: { drafts: 1, note: 'n' }, heldBack: { start: scored(0, 2), end: scored(2, 2) }, verdict: 'ADOPTED', why: 'the change held on the briefs set aside.', costUsd: 3 };
    const text = renderEvolve(r);
    expect(text).toMatch(/^SELF-IMPROVEMENT · analysis · 6 working brief\(s\), 2 held back\n {2}as it started {3}1 draft\(s\): 1 and 2 of 6 conformant on two runs\. Noise band: 1 case\(s\)\./);
    expect(text).toMatch(/round 1 {2}kept {6}name what drafts leave out: 6 of 6 against 2/);
    expect(text).toMatch(/round 1 {2}not kept {2}2 drafts: 2 of 6 against 2: a gain of 0 is inside the noise band/);
    expect(text).toMatch(/held back {7}as it started 0 of 2; as the search left it 2 of 2\./);
    expect(text).toMatch(/A judgement step is scored by nothing here\./);
    expect(renderEvolve({ ...r, baseline: { first: scored(1, 3), second: null, band: 1 }, trials: [], heldBack: null, verdict: 'STOPPED', why: 'w' })).toMatch(/as it started {3}1 draft\(s\): 1 of 3 conformant on the one run that was made\./);
    expect(scoreOf([{ id: 'a', ok: true, missing: [], costUsd: 0.1 }, { id: 'b', ok: false, missing: ['x1'], costUsd: 0.2 }])).toEqual({ ok: 1, n: 2, costUsd: 0.3, missing: { x1: 1 } });
  });
});

// ── THROUGH THE BINARY, AGAINST THE SCRIPTED BACKEND ─────────────────────────────────────────────
const CLI = resolve('dist/cli/atelier.mjs');
const ENV: NodeJS.ProcessEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ATELIER|ANTHROPIC|OPENAI)_/.test(k))), ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' };
const NOTE = '# How we compare vendors\n\n1. Open with a Verdict section that says who wins, and for whom.\n2. Include a table with the columns Vendor, Price per seat and Minimum.\n3. Weigh switching cost before recommending anything.\n4. End with a Risks section.\n';
const piece = (a: string, b: string): string => `## Verdict\n\n${b} wins for a small team, and ${a} wins once the team is large enough to clear its minimum.\n\n## The comparison\n\n| Vendor | Price per seat | Minimum |\n|---|---|---|\n| ${a} | 12 dollars | 50 seats |\n| ${b} | 15 dollars | none |\n\n${a} is cheaper a seat and dearer in total below its minimum, because a small team pays for seats it does not use.\n\n## Risks\n\nEither vendor can change its list price, and switching later means moving every payee again.\n`;
const BLAND = 'There are many factors to consider when comparing vendors. Each option has strengths and weaknesses. The right choice depends on the needs of the team. It is important to weigh the trade-offs carefully before deciding.';
const MATERIAL = 'The first vendor lists 12 dollars a seat with a 50 seat minimum. The second lists 15 dollars a seat with no minimum.';
let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const root = realpathSync(mkdtempSync(join(tmpdir(), 'atelier-evolve-')));
const data = join(root, 'data'); const proj = join(root, 'proj'); const briefDir = join(proj, 'briefs');
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const extraEnv: NodeJS.ProcessEnv = {};
const envIn = (dir: string): NodeJS.ProcessEnv => ({ ...ENV, ATELIER_DATA: data, ATELIER_PROJECT_DIR: dir, ...extraEnv });
const atelierIn = (dir: string, ...args: string[]): { code: number; out: string; err: string } => {
  const r = spawnSync(process.execPath, [CLI, ...args, ...BACKEND()], { encoding: 'utf8', cwd: dir, env: envIn(dir), maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
};
const atelier = (...args: string[]): { code: number; out: string; err: string } => atelierIn(proj, ...args);
// A second skill from the same method has a folder of its own: one folder holds one standard.
const projB = join(root, 'proj-b');
const atelierB = (...args: string[]): { code: number; out: string; err: string } => atelierIn(projB, ...args);
/** What `atelier fix` and `atelier report` point at for a project: the last run made in it. */
const pointerOf = (dir: string): string | null => {
  const runs = join(data, 'runs');
  const d = existsSync(runs) ? readdirSync(runs).find((x) => new RegExp(`^${dir.split('/').at(-1) ?? ''}-[0-9a-f]+$`).test(x)) : undefined;
  return d && existsSync(join(runs, d, 'last-invocation.json')) ? readFileSync(join(runs, d, 'last-invocation.json'), 'utf8') : null;
};
const served = async (): Promise<string[]> => (await (await fetch(`${url()}/__log`)).json() as { bodies: string[] }).bodies;

describe('through the binary: a skill that leaves required things out learns to name them, and keeps the change only because it carried', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
    mkdirSync(data); mkdirSync(join(proj, 'example.material'), { recursive: true }); mkdirSync(briefDir);
    writeFileSync(join(proj, 'method.md'), NOTE);
    writeFileSync(join(proj, 'example.md'), `---\nrequest: Compare Acme and Borealis on price for a small team.\n---\n${piece('Acme', 'Borealis')}`);
    writeFileSync(join(proj, 'example.material', 'prices.md'), MATERIAL);
    for (let i = 0; i < 8; i++) {
      mkdirSync(join(briefDir, `vendor-${i}.material`));
      writeFileSync(join(briefDir, `vendor-${i}.md`), `---\nrequest: Compare the two vendors in lot ${i} on price for a small team.\n---\n`);
      writeFileSync(join(briefDir, `vendor-${i}.material`, 'prices.md'), `${MATERIAL} This is lot ${i}.`);
    }
    // THE MODEL AS SCRIPTED: it writes the bland piece, unless it is told what earlier drafts left out.
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ when: [{ contains: 'Earlier drafts of this work missed these', answer: { piece: piece('Cygnus', 'Dorado') } }], byTool: { emit_piece: { piece: BLAND } } }) });
    const built = atelier('method', 'method.md', '--golden', 'example.md', '--name', 'vendors', '--yes');
    if (built.code !== 0) throw new Error(`method: ${built.err}${built.out}`);
  }, 120_000);
  afterAll(() => { backend.kill(); });

  it('--dry-run says what it would do, which briefs are set aside and what it is scored on, and calls nothing', async () => {
    const before = (await served()).length;
    const r = atelier('evolve', '--skill', 'vendors', '--briefs', 'briefs', '--dry-run');
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/^8 briefs: 6 to work on, 2 set aside \(vendor-\d\.md, vendor-\d\.md\)\.$/m);
    expect(r.out).toMatch(/Scored on 3 required step\(s\) that code reads: x\d+, x\d+, x\d+\./);
    expect(r.out).toMatch(/At most 52 runs, each what a run of this skill costs, within --cap \$10\. --dry-run: nothing was called\./);
    expect((await served()).length).toBe(before);
  });

  it('tries one change at a time, keeps the one beyond the noise band, checks it on the briefs set aside, and adopts it', async () => {
    const r = atelier('evolve', '--skill', 'vendors', '--briefs', 'briefs', '--json');
    expect(r.code, `${r.err}${r.out.slice(0, 800)}`).toBe(0);
    const rec = JSON.parse(r.out) as EvolveRecord & { file: string };
    expect(rec.briefs.dev).toHaveLength(6);
    expect(rec.briefs.heldBack).toHaveLength(2);
    expect(rec.baseline).toMatchObject({ first: { ok: 0, n: 6 }, second: { ok: 0, n: 6 }, band: 1 });
    // round one: the note that names what drafts left out, and one more draft; only the first is beyond the band
    expect(rec.trials.map((t) => [t.round, t.gene, t.kept, t.scored?.ok])).toEqual([[1, 'NOTE', true, 6], [1, 'MORE_DRAFTS', false, 0]]);
    expect(rec.trials[0].why).toBe('6 of 6 against 0: a gain of 6, beyond the noise band of 1');
    expect(rec.trials[1].why).toBe('0 of 6 against 0: a gain of 0 is inside the noise band of 1 case(s)');
    expect(rec.end.note).toMatch(/^Earlier drafts of this work missed these\./);
    expect(rec.end.note).toContain('Open with a Verdict section that says who wins, and for whom.');
    // the briefs set aside were read once, at the end, both ways
    expect(rec.heldBack).toMatchObject({ start: { ok: 0, n: 2 }, end: { ok: 2, n: 2 } });
    expect(rec.verdict).toBe('ADOPTED');
    expect(existsSync(rec.file)).toBe(true);
    const carry = JSON.parse(readFileSync(join(data, 'skills', 'vendors', 'carry.json'), 'utf8')) as { drafts: number; note: string };
    expect(carry).toMatchObject({ drafts: 1, note: rec.end.note });
    // the standard did not move, and no run of the search is something the skill learns from
    const store = await import('../core/state/store.js');
    expect(store.listInvocations({ root: data, skillName: 'vendors' }).length).toBeGreaterThanOrEqual(28);
    expect(store.listLearningInvocations({ root: data, skillName: 'vendors' })).toEqual([]);
    expect(readdirSync(join(data, 'skills', 'vendors', 'standards'))).toHaveLength(1);
  }, 300_000);

  it('from then on a plain run is told what earlier drafts left out, under a heading that says it is not a rule', async () => {
    const before = (await served()).length;
    const r = atelier('invoke', '--skill', 'vendors', '--task=Compare the two vendors in lot 99 on price for a small team.', '--with', `prices=${join(briefDir, 'vendor-0.material', 'prices.md')}`, '--json');
    const j = JSON.parse(r.out.slice(r.out.indexOf('{'))) as { eval: { result: { conformant: boolean } } };
    expect(j.eval.result.conformant).toBe(true);
    const body = (await served()).slice(before).join('\n');
    expect(body).toContain('From earlier runs of this skill (not a rule of the standard)');
    expect(body).toContain('Earlier drafts of this work missed these');
  }, 120_000);

  it('a second search finds nothing left to try that the checks can score, and leaves the skill as it is', async () => {
    const r = atelier('evolve', '--skill', 'vendors', '--briefs', 'briefs', '--json');
    const rec = JSON.parse(r.out) as EvolveRecord;
    expect(rec.baseline.first.ok).toBe(6);
    expect(rec.trials).toEqual([]);
    expect(rec.verdict).toBe('UNCHANGED');
    expect(readdirSync(join(data, 'skills', 'vendors', 'evolve'))).toHaveLength(2);
  }, 300_000);

  it('--rollback goes back to how the skill carried its method before, and the search record stays', () => {
    const r = atelier('evolve', '--skill', 'vendors', '--rollback');
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/"vendors" carries its method as it was built again\./);
    expect(existsSync(join(data, 'skills', 'vendors', 'carry.json'))).toBe(false);
    expect(readdirSync(join(data, 'skills', 'vendors', 'carry-history'))).toHaveLength(1);
    expect(readdirSync(join(data, 'skills', 'vendors', 'evolve'))).toHaveLength(2);
  });

  it('too few briefs, or a folder that is not there, is refused before anything is run', () => {
    mkdirSync(join(proj, 'few')); writeFileSync(join(proj, 'few', 'a.md'), '---\nrequest: Compare them.\n---\n');
    expect(atelier('evolve', '--skill', 'vendors', '--briefs', 'few').err).toMatch(/1 brief\(s\) in .*few: at least 6 are needed/);
    expect(atelier('evolve', '--skill', 'vendors', '--briefs', 'nowhere').err).toMatch(/there is no such folder/);
  });
  it('a gain that does not carry to the briefs set aside is reported and not adopted', async () => {
    mkdirSync(join(projB, 'example.material'), { recursive: true });
    for (const f of ['method.md', 'example.md', join('example.material', 'prices.md')]) writeFileSync(join(projB, f), readFileSync(join(proj, f), 'utf8'));
    const built = atelierB('method', 'method.md', '--golden', 'example.md', '--name', 'vendors-b', '--yes');
    expect(built.code, built.err).toBe(0);
    const held = splitBriefs(Array.from({ length: 8 }, (_, i) => ({ id: `vendor-${i}.md` }))).heldBack.map((b) => `lot ${/\d+/.exec(b.id)?.[0]} on`);
    // The note helps on the working briefs. On the two set aside the model was right without it and is wrong with it.
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ when: [
      ...held.map((h) => ({ containsAll: ['Earlier drafts of this work missed these', h], answer: { piece: BLAND } })),
      { contains: 'Earlier drafts of this work missed these', answer: { piece: piece('Cygnus', 'Dorado') } },
      ...held.map((h) => ({ contains: h, answer: { piece: piece('Cygnus', 'Dorado') } }))], byTool: { emit_piece: { piece: BLAND } } }) });
    // the person's own last run, which a search must leave as what `atelier fix` points at
    atelierB('invoke', '--skill', 'vendors-b', '--task=Compare the two vendors in lot 77 on price for a small team.', '--with', `prices=${join(briefDir, 'vendor-0.material', 'prices.md')}`, '--json');
    const mine = pointerOf(projB);
    expect(mine).toContain('lot 77');
    const r = atelierB('evolve', '--skill', 'vendors-b', '--briefs', briefDir, '--json');
    const rec = JSON.parse(r.out) as EvolveRecord;
    expect(pointerOf(projB)).toBe(mine);
    expect(rec.trials[0]).toMatchObject({ gene: 'NOTE', kept: true });
    expect(rec.heldBack).toMatchObject({ start: { ok: 2, n: 2 }, end: { ok: 0, n: 2 } });
    expect(rec.verdict).toBe('NOT_CARRIED');
    expect(rec.why).toMatch(/^better on the briefs it worked on, and worse on the ones set aside \(0 of 2 against 2\): the gain did not carry/);
    expect(existsSync(join(data, 'skills', 'vendors-b', 'carry.json'))).toBe(false);
    expect(readdirSync(join(data, 'skills', 'vendors-b', 'evolve'))).toHaveLength(1);
  }, 300_000);

  it('a search the cap cannot start is stopped, adopts nothing, and is still kept', () => {
    const stoppedRun = atelierB('evolve', '--skill', 'vendors-b', '--briefs', briefDir, '--cap', '0.5', '--json');
    const rec = JSON.parse(stoppedRun.out) as EvolveRecord;
    expect(stoppedRun.code).toBe(2);
    expect(rec.baseline.second).toBeNull();
    expect(rec.verdict).toBe('STOPPED');
    expect(rec.trials).toEqual([]);
    expect(rec.why).toMatch(/of the \$0\.5 cap was left, too little to start another run of 1 draft\(s\)\. Nothing was adopted/);
    expect(existsSync(join(data, 'skills', 'vendors-b', 'carry.json'))).toBe(false);
  });

  it('a run that breaks stops the search and is never read as a case that failed', async () => {
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ failNext: 200, byTool: { emit_piece: { piece: BLAND } } }) });
    const rec = JSON.parse(atelierB('evolve', '--skill', 'vendors-b', '--briefs', briefDir, '--json').out) as EvolveRecord;
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: BLAND } } }) });
    expect(rec.verdict).toBe('STOPPED');
    expect(rec.baseline.first).toMatchObject({ ok: 0, n: 0 });
    expect(rec.why).toMatch(/^the run of "vendor-\d\.md" ended with no verdict \(.+\)\. Nothing was adopted/);
    expect(existsSync(join(data, 'skills', 'vendors-b', 'carry.json'))).toBe(false);
  }, 300_000);

  it('what a search adopted under another standard is not served, and going back goes one adoption at a time to as built', async () => {
    const store = await import('../core/state/store.js');
    const L = { root: data, skillName: 'vendors-b' };
    const old = { drafts: 1, note: `${NOTE_HEAD}\n- A step that is no longer in the standard.`, adoptedAt: '2026-01-01T00:00:00.000Z', from: 'a search', standardVersion: 'another-standard' };
    store.setCarry(L, old);
    const before = (await served()).length;
    const run = atelierB('invoke', '--skill', 'vendors-b', '--task=Compare the two vendors in lot 98 on price for a small team.', '--with', `prices=${join(briefDir, 'vendor-0.material', 'prices.md')}`, '--json');
    const sent = (await served()).slice(before);
    expect(sent.length, run.err).toBeGreaterThan(0);
    expect(sent.join('\n')).not.toContain('From earlier runs of this skill');
    // a later adoption keeps the one it replaced whole, with the standard it was adopted under
    store.setCarry(L, { drafts: 2, note: '', adoptedAt: '2026-02-01T00:00:00.000Z', from: 'a later search', standardVersion: 'the-next-standard' });
    expect(store.getCarry(L)?.before).toEqual({ ...old, before: null });
    const r = atelierB('evolve', '--skill', 'vendors-b', '--rollback');
    expect(r.out).toMatch(/Back to how "vendors-b" carried its method before: 1 draft\(s\), with its note\. It was adopted under an earlier standard, so it is kept and not used\./);
    expect(store.getCarry(L)).toEqual({ ...old, before: null });
    expect(atelierB('evolve', '--skill', 'vendors-b', '--rollback').out).toMatch(/"vendors-b" carries its method as it was built again\./);
    expect(store.getCarry(L)).toBeNull();
    expect(atelierB('evolve', '--skill', 'vendors-b', '--rollback').err).toMatch(/there is nothing to go back from/);
    expect(readdirSync(join(data, 'skills', 'vendors-b', 'carry-history'))).toHaveLength(3);
  }, 120_000);

  it('a run records the note it was served by its hash, so two runs of one skill version can be told apart', async () => {
    const store = await import('../core/state/store.js');
    const runs = store.listInvocations({ root: data, skillName: 'vendors' });
    const adopted = JSON.parse(readFileSync(join(data, 'skills', 'vendors', 'carry-history', readdirSync(join(data, 'skills', 'vendors', 'carry-history'))[0]), 'utf8')) as { note: string };
    const hash = createHash('sha256').update(adopted.note).digest('hex').slice(0, 16);
    const withNote = runs.filter((r) => r.settings?.flags.carryNoteHash !== undefined);
    // the note's candidate on six briefs, the two held back, the plain run after, and the second search's runs
    expect(withNote.length).toBeGreaterThanOrEqual(9);
    expect(new Set(withNote.map((r) => r.settings?.flags.carryNoteHash))).toEqual(new Set([hash]));
    expect(runs.filter((r) => r.settings?.flags.carryNoteHash === undefined).length).toBeGreaterThanOrEqual(14);
  });

  it('a signal to the search alone stops it: nothing is adopted, and the person\'s last run is still what is pointed at', async () => {
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ when: [{ contains: 'Earlier drafts of this work missed these', answer: { piece: piece('Cygnus', 'Dorado') } }], byTool: { emit_piece: { piece: BLAND } } }) });
    const mine = pointerOf(projB);
    const child = spawn(process.execPath, [CLI, 'evolve', '--skill', 'vendors-b', '--briefs', briefDir, ...BACKEND()], { cwd: projB, env: envIn(projB), stdio: ['ignore', 'pipe', 'pipe'] });
    const code = await new Promise<number | null>((ok) => {
      child.stdout.once('data', () => { setTimeout(() => { child.kill('SIGTERM'); }, 1500); });
      child.on('exit', (c) => { ok(c); });
    });
    expect(code).toBe(130);
    expect(existsSync(join(data, 'skills', 'vendors-b', 'carry.json'))).toBe(false);
    expect(pointerOf(projB)).toBe(mine);
  }, 120_000);
});
