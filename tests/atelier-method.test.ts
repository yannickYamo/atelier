// tests/atelier-method.test.ts — A SKILL FROM ONE METHOD AND ONE FINISHED EXAMPLE, HELD TO THE METHOD ON EVERY RUN.
//
// The method's steps become requirements of three kinds (core/method/standard.ts): what the work must contain, read
// by code on the output; what it must be made from, read against the material; and judgement, reported as not
// measured. A step gets a check only when the owner's own example passes it. What is missing from a draft is written
// again with it named, never patched into a sentence. And an output that follows the easy rules and says nothing is
// not conformant: it lacks what the method requires the work to contain.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { tablesOf, figuresOf, TABLE, CITED } from '../core/observers/obligations.js';
import { measure } from '../core/observers/registry.js';
import { stepsOf, outlineOf, methodProposals } from '../core/method/standard.js';
import { methodReading, methodLine } from '../core/eval/obligations.js';
import { verifyText } from '../core/observers/verify.js';
import { planRepair } from '../core/loop/repair.js';
import { describeMethod } from '../cli/commands/method.js';
import { aRequirement } from './fixtures.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const MATERIAL = 'Acme lists 12 dollars a seat with a 50 seat minimum. Borealis lists 15 dollars a seat with no minimum. Both bill yearly.';
const TASK = 'Compare Acme and Borealis on price for a small team.';
const NOTE = `# Competitive analysis, the way we do it

## Required inputs

- The vendors' public price lists

## Steps

1. Open with a Verdict section that says who wins, and for whom.
2. Include a table with the columns Vendor, Price per seat and Minimum.
3. Every figure must be sourced from the material you were given.
4. Weigh switching cost before recommending anything.
5. End with a Risks section.
`;
const EXAMPLE = `## Verdict

Borealis wins for a small team, and Acme wins once the team is large enough to clear its minimum.

## The comparison

| Vendor | Price per seat | Minimum |
|---|---|---|
| Acme | 12 dollars | 50 seats |
| Borealis | 15 dollars | none |

Acme is cheaper a seat and dearer in total below its minimum, because a small team pays for seats it does not use.

## Risks

Either vendor can change its list price, and switching later means moving every payee again.
`;
const BLAND = 'There are many factors to consider when comparing vendors. Each option has strengths and weaknesses. The right choice depends on the needs of the team. It is important to weigh the trade-offs carefully before deciding.';
const context = { request: TASK, material: [{ name: 'prices.md', text: MATERIAL }] };

describe('a table with the columns the method names', () => {
  it('reads the header of each table, outside code', () => {
    expect(tablesOf(EXAMPLE)).toMatchObject([{ header: ['vendor', 'price per seat', 'minimum'], rows: 2 }]);
    expect(tablesOf('```\n| a | b |\n|---|---|\n| 1 | 2 |\n```')).toEqual([]);
  });
  it('met when one table holds every column; says which is missing, or that there is none', () => {
    const m = { observer: 'TABLE' as const, params: { columns: ['vendor', 'price per seat', 'minimum'], minRows: 1 } };
    expect(measure(EXAMPLE, m).verdict).toBe('MET');
    const lacking = measure(EXAMPLE.replace('| Minimum |', '| Notes |'), m);
    expect(lacking).toMatchObject({ verdict: 'VIOLATED', detail: 'the table lacks the column(s) "minimum"' });
    expect(measure(BLAND, m)).toMatchObject({ verdict: 'VIOLATED', detail: 'no table; one with the column(s) "vendor", "price per seat", "minimum" is required' });
    expect(TABLE.validate({})).toBe('needs columns=<name>|<name>');
    // a column is met by a header cell that holds every word of its name, never by letters inside another word
    const t = '| Provider | Price per seat |\n|---|---|\n| Acme | 12 |';
    expect(measure(t, { observer: 'TABLE', params: { columns: ['price'], minRows: 1 } }).verdict).toBe('MET');
    expect(measure(t, { observer: 'TABLE', params: { columns: ['id', 'price'], minRows: 1 } })).toMatchObject({ verdict: 'VIOLATED', detail: 'the table lacks the column(s) "id"' });
    // a line with a bar above a rule is not a table
    expect(tablesOf('Either a | b works.\n---\nNext.')).toEqual([]);
  });
});

describe('every figure is one the writer was given', () => {
  it('a figure is a number with a unit or of two digits or more; a list marker and a lone digit are not', () => {
    expect(figuresOf('1. We saw 3 options, at $12,400 and 15%, over 50 seats.').map((f) => f.raw)).toEqual(['$12,400', '15%', '50']);
  });
  it('a year, a date, a time, a page or standard number, a footnote mark and a numbered heading are not figures', () => {
    const honest = 'In 2026, on the 21st at 10:30, see page 14 and ISO 27001 [12]. Reported in Q3 2024.\n\n## 12. Appendix\n\nNothing else.';
    expect(figuresOf(honest)).toEqual([]);
  });
  it('the same quantity however it is written, and never a percentage for a count', () => {
    const m = { observer: 'CITED' as const, params: { allow: 0 } };
    const given = (text: string) => ({ material: [{ name: 'm.md', text }] });
    expect(measure('Revenue was 12.4k and costs $5m.', m, given('Revenue was 12,400 and costs were $5,000,000.')).verdict).toBe('MET');
    expect(measure('Growth was 12.0%.', m, given('Growth was 12 percent.')).verdict).toBe('MET');
    expect(measure('It lost 12 deals.', m, given('It lost twelve deals.')).verdict).toBe('MET');
    expect(measure('Churn was 15%.', m, given('It has 15 employees.')).verdict).toBe('VIOLATED');
    expect(measure('It has 15 customers.', m, given('It raised $15m.')).verdict).toBe('VIOLATED');
  });
  it('a figure that follows from two given figures by one step of arithmetic is the writer reading the material', () => {
    const m = { observer: 'CITED' as const, params: { allow: 0 } };
    const given = { material: [{ name: 'm.md', text: 'It won 10 of 20 deals, and lost 30 deals elsewhere.' }] };
    expect(measure('It won 50% of them, 40 deals lost or won beyond the 10.', m, given).verdict).toBe('MET');
    expect(measure('It won 73% of them.', m, given).verdict).toBe('VIOLATED');
  });
  it('met when each is in the request or the material; names the ones that are not', () => {
    const m = { observer: 'CITED' as const, params: { allow: 0 } };
    expect(measure(EXAMPLE, m, context)).toMatchObject({ verdict: 'MET', detail: '3 of 3 figure(s) are in the request or the material (prices.md)' });
    const invented = measure(`${EXAMPLE}\nAcme has 4,200 customers.`, m, context);
    expect(invented.verdict).toBe('VIOLATED');
    expect(invented.spans.map((s) => s.text)).toEqual(['4,200']);
    expect(measure(`${EXAMPLE}\nAcme has 4,200 customers.`, { observer: 'CITED', params: { allow: 1 } }, context).verdict).toBe('MET');
  });
  it('with no material it is read against the request alone: a figure nobody gave was not given', () => {
    expect(measure(EXAMPLE, { observer: 'CITED', params: { allow: 0 } })).toMatchObject({ verdict: 'VIOLATED', detail: '0 of 3 figure(s) are in the request (no material was bound)' });
    expect(CITED.validate({ allow: -1 })).toMatch(/allow is a count/);
  });
});

describe('the steps of a method note', () => {
  it('a list item is a step; headings are not; what the work needs before it starts is not a step', () => {
    expect(stepsOf(NOTE).map((s) => s.text)).toEqual([
      'Open with a Verdict section that says who wins, and for whom.', 'Include a table with the columns Vendor, Price per seat and Minimum.',
      'Every figure must be sourced from the material you were given.', 'Weigh switching cost before recommending anything.', 'End with a Risks section.']);
  });
  it('a comment is no step; "Sources of error" is not a list of inputs; a sentence beside a list is a step only when it says must or never', () => {
    const note = '<!-- QUICK_MODE\nfocus: tables\n-->\n\n## Purpose\n\nThis describes the landscape for the reader. Never rank a vendor before stating the market.\n\n## Sources of error\n\n- Check each price against the list.\n';
    expect(stepsOf(note).map((s) => s.text)).toEqual(['Check each price against the list.', 'Never rank a vendor before stating the market.']);
  });
  it('a note with no list is read by its sentences', () => {
    expect(stepsOf('Lead with the verdict. Then show the comparison in a table. Never recommend without the price.').map((s) => s.text)).toHaveLength(3);
  });
  it('one example shows its sections in order and its tables', () => {
    expect(outlineOf(EXAMPLE)).toMatchObject({ sections: ['Verdict', 'The comparison', 'Risks'] });
  });
});

describe('a method and one example become requirements of three kinds', () => {
  const ps = methodProposals(NOTE, { task: TASK, material: context.material, reference: EXAMPLE });
  const of = (statement: RegExp) => ps.find((p) => statement.test(p.statement));
  it('a step that names a section, a table or sources gets the check, and the kind that check is', () => {
    expect(of(/^Open with a Verdict/)).toMatchObject({ origin: 'STATED', obligation: 'DELIVERABLE', measurement: { observer: 'PRESENCE', params: { sections: ['Verdict'] } } });
    expect(of(/^Include a table/)).toMatchObject({ origin: 'STATED', obligation: 'DELIVERABLE', measurement: { observer: 'TABLE', params: { columns: ['vendor', 'price per seat', 'minimum'] } } });
    expect(of(/^Every figure must be sourced/)).toMatchObject({ origin: 'STATED', obligation: 'EXECUTION', measurement: { observer: 'CITED' } });
    expect(of(/^End with a Risks/)).toMatchObject({ obligation: 'DELIVERABLE' });
  });
  it('a step that names none of these is a judgement, with no check and no claim that it is measured', () => {
    expect(of(/^Weigh switching cost/)).toMatchObject({ origin: 'STATED', obligation: 'JUDGEMENT', measurement: null, demoted: null });
  });
  it('a step the owner\'s own example does not hold is kept as theirs, as a judgement, and asked about', () => {
    const disagree = methodProposals(`${NOTE}6. Include a table with the columns Vendor and Contract length.\n`, { task: TASK, material: context.material, reference: EXAMPLE.replace('## Risks', '## Caveats') });
    const risks = disagree.find((p) => p.statement.startsWith("End with a Risks"));
    expect(risks).toMatchObject({ origin: 'STATED', obligation: 'JUDGEMENT', measurement: null });
    expect(risks?.demoted).toBe('your example does not hold it as a check would read it (no "Risks" section)');
    // a table whose columns the step names is held against those columns, never against whatever table the example has
    const contract = disagree.find((p) => p.statement.includes('Contract length'));
    expect(contract?.demoted).toBe('your example does not hold it as a check would read it (the table lacks the column(s) "contract length")');
    const lines = describeMethod(disagree, 'FULL_REPRO_CASE').join('\n');
    expect(lines).toMatch(/Checked on every output: what the work must contain \(2\)/);
    expect(lines).toMatch(/Checked against the material: what the work must be made from \(1\)/);
    expect(lines).toMatch(/Yours to settle: your method says it, and your example does not hold it \(2\)/);
  });
  it('a template table in the note that the example does not hold is a question, never a rule', () => {
    const withTemplate = `${NOTE}\n## Template\n\n| Vendor | Contract length | Exit fee |\n|---|---|---|\n| [name] | [months] | [amount] |\n`;
    const p = methodProposals(withTemplate, { task: TASK, material: context.material, reference: EXAMPLE }).find((x) => x.statement.includes('contract length'));
    expect(p).toMatchObject({ origin: 'STATED', obligation: 'JUDGEMENT', measurement: null });
    expect(p?.demoted).toMatch(/^your example does not hold it as a check would read it \(the table lacks the column\(s\) "contract length", "exit fee"\)$/);
    expect(describeMethod([p!], 'FULL_REPRO_CASE').join('\n')).toMatch(/Yours to settle: your method says it, and your example does not hold it \(1\)/);
  });
  it('a step that only mentions a section in passing is a judgement, never a check on the work\'s shape', () => {
    const ps2 = methodProposals('1. Move to the Next section only after the Verdict is settled.\n2. Never give a Verdict before the comparison is read.\n', { task: TASK, material: context.material, reference: EXAMPLE });
    expect(ps2.filter((p) => p.origin === 'STATED').map((p) => [p.obligation, p.measurement])).toEqual([['JUDGEMENT', null], ['JUDGEMENT', null]]);
  });
  it('the template\'s section order is the owner\'s: where the example orders them otherwise it is asked, never taken from the example', () => {
    const template = '## Risks\n\nWhat could go wrong.\n\n## Verdict\n\nWho wins.\n\n- Weigh switching cost.\n';
    const p = methodProposals(template, { task: TASK, material: context.material, reference: EXAMPLE }).find((x) => x.statement.includes('these sections') && x.origin === 'STATED');
    expect(p?.statement).toBe('The work has these sections, in this order: Risks, Verdict.');
    expect(p).toMatchObject({ obligation: 'JUDGEMENT', measurement: null });
    expect(p?.demoted).toMatch(/sections out of order/);
    // in the example's order it is held, and stated sections are not proposed again from the example
    const agree = methodProposals('## Verdict\n\nWho wins.\n\n## Risks\n\nWhat could go wrong.\n\n- Weigh switching cost.\n', { task: TASK, material: context.material, reference: EXAMPLE });
    expect(agree.find((x) => x.origin === 'STATED' && x.statement.includes('these sections'))).toMatchObject({ obligation: 'DELIVERABLE', measurement: { params: { sections: ['Verdict', 'Risks'] } } });
    expect(agree.filter((x) => x.origin === 'SHOWN_BY_EXAMPLE' && x.statement.includes('these sections'))).toEqual([]);
  });
  it('one step that names a section does not stop the other sections being required', () => {
    const two = methodProposals('1. Open with a Verdict section.\n2. End with a Risks section.\n', { task: TASK, material: context.material, reference: EXAMPLE });
    expect(two.filter((p) => p.obligation === 'DELIVERABLE' && p.origin === 'STATED').map((p) => p.measurement?.params.sections)).toEqual([['Verdict'], ['Risks']]);
  });
  it('a table the example has whose columns are this case\'s own names is not proposed as a rule for the next case', () => {
    const named = `${EXAMPLE}\n| Dimension | Acme | Borealis |\n|---|---|---|\n| Price | lower | higher |\n`;
    const shown = methodProposals('1. Weigh switching cost.\n', { task: TASK, material: context.material, reference: named }).filter((p) => p.origin === 'SHOWN_BY_EXAMPLE').map((p) => p.statement);
    expect(shown.some((x) => x.includes('acme'))).toBe(false);
    expect(shown).toContain('The work includes a table with the columns vendor, price per seat, minimum.');
  });
  it('what the example shows and no step said is proposed, never assumed', () => {
    const silent = methodProposals('1. Weigh switching cost before recommending anything.\n', { task: TASK, material: context.material, reference: EXAMPLE });
    expect(silent.filter((p) => p.origin === 'SHOWN_BY_EXAMPLE').map((p) => p.statement)).toEqual([
      'The work has these sections, in this order: Verdict, The comparison, Risks.', 'The work includes a table with the columns vendor, price per seat, minimum.',
      'Every figure in the work is one the request or the material gives.']);
  });
  it('with no material, nothing about what the work is made from is checked, and the screen says so', () => {
    const bare = methodProposals(NOTE, { task: TASK, material: [], reference: EXAMPLE });
    expect(bare.find((p) => p.statement.startsWith("Every figure"))).toMatchObject({ obligation: 'JUDGEMENT', measurement: null });
    expect(describeMethod(bare, 'TASK_AND_REFERENCE').join('\n')).toMatch(/Your example carries its task and no material, so nothing about what the work is made from can be checked\./);
  });
});

describe('a run says what of the method was held, by kind, and a missing section is never patched into a sentence', () => {
  const reqs = [
    aRequirement({ requirementId: 'x1', statement: 'Open with a Verdict section.', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: { observer: 'PRESENCE', params: { sections: ['Verdict'] } } }),
    aRequirement({ requirementId: 'x2', statement: 'Include the price table.', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: { observer: 'TABLE', params: { columns: ['vendor', 'minimum'], minRows: 1 } } }),
    aRequirement({ requirementId: 'x3', statement: 'Every figure is sourced.', materiality: 'REQUIRED', obligation: 'EXECUTION', measurement: { observer: 'CITED', params: { allow: 0 } } }),
    aRequirement({ requirementId: 'x4', statement: 'Weigh switching cost.', obligation: 'JUDGEMENT' }),
  ];
  const v = { standardVersionHash: 'h', evidenceId: null, workType: 'analysis', requirements: reqs } as unknown as StandardVersion;
  it('three counts, never added; the judgement steps are said as not measured', () => {
    const full = methodReading(reqs, verifyText('s', v, EXAMPLE, context));
    expect(full).toEqual({ deliverable: { held: 2, applicable: 2, missing: [] }, execution: { held: 1, applicable: 1, missing: [], notRead: 0 }, judgement: 1 });
    expect(methodLine(full!)).toBe('Method: contains 2 of 2 thing(s) it must · made from what was given 1 of 1 · 1 judgement step(s) not measured.');
  });
  it('an output that follows the easy rules and says nothing is not the method followed: it lacks what the work must contain', () => {
    const bland = verifyText('s', v, BLAND, context);
    expect(bland.failed).toBe(true);
    expect(methodLine(methodReading(reqs, bland)!)).toBe('Method: contains 0 of 2 thing(s) it must (missing: x1, x2) · made from what was given 1 of 1 · 1 judgement step(s) not measured.');
  });
  it('with no material bound, what the work was made from is read against the request, and is not held', () => {
    expect(methodLine(methodReading(reqs, verifyText('s', v, EXAMPLE))!)).toMatch(/made from what was given 0 of 1/);
  });
  it('the sentence repair leaves a method requirement alone', () => {
    expect(planRepair(BLAND, verifyText('s', v, BLAND, context))).toEqual([]);
    // a figure the material does not hold is the other kind: its sentence is rewritten without it
    const invented = `${EXAMPLE}\nAcme has 4,200 paying customers today.`;
    expect(planRepair(invented, verifyText('s', v, invented, context)).map((t) => t.reasons.join(' '))).toEqual([expect.stringMatching(/^x3: Every figure is sourced\. \(the figure 4,200 is in neither the request nor the material\)/)]);
    expect(methodReading([aRequirement({ requirementId: 'c1' })], verifyText('s', v, EXAMPLE))).toBeNull();
  });
});

// ── THROUGH THE BINARY, AGAINST THE SCRIPTED BACKEND ─────────────────────────────────────────────
const CLI = resolve('dist/cli/atelier.mjs');
const ENV: NodeJS.ProcessEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ATELIER|ANTHROPIC|OPENAI)_/.test(k))), ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' };
let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const root = realpathSync(mkdtempSync(join(tmpdir(), 'atelier-method-')));
const data = join(root, 'data'); const proj = join(root, 'proj');
const atelier = (...args: string[]): { code: number; out: string; err: string } => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: proj, env: { ...ENV, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj }, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
};
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const script = (piece: string, when: { contains: string; answer: unknown }[] = []): Promise<unknown> => fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ when, byTool: { emit_piece: { piece } } }) });
const count = async (): Promise<number> => (await (await fetch(`${url()}/__count`)).json() as { count: number }).count;
// A new piece on new material: same method, another subject.
const NEW_MATERIAL = 'Cygnus lists 9 dollars a seat with a 100 seat minimum. Dorado lists 14 dollars a seat with a 10 seat minimum.';
const NEW_PIECE = EXAMPLE.replace(/Acme/g, 'Cygnus').replace(/Borealis/g, 'Dorado').replace('12 dollars', '9 dollars').replace('50 seats', '100 seats').replace('15 dollars', '14 dollars').replace('| none |', '| 10 seats |');

describe('through the binary: atelier method, then a run held to the method', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
    mkdirSync(data); mkdirSync(join(proj, 'acme.material'), { recursive: true });
    writeFileSync(join(proj, 'method.md'), NOTE);
    writeFileSync(join(proj, 'acme.md'), `---\nrequest: ${TASK}\n---\n${EXAMPLE}`);
    writeFileSync(join(proj, 'acme.material', 'prices.md'), MATERIAL);
    writeFileSync(join(proj, 'new-prices.md'), NEW_MATERIAL);
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('shows the owner their steps by kind, and builds nothing until they say yes; it calls no model', async () => {
    const before = await count();
    const r = atelier('method', 'method.md', '--golden', 'acme.md', '--name', 'analysis', ...BACKEND());
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/^Method: method\.md {2}· {2}example: acme\.md with 1 file\(s\) of material$/m);
    expect(r.out).toMatch(/5 step\(s\) from your method\./);
    expect(r.out).toMatch(/Checked on every output: what the work must contain \(3\)/);
    expect(r.out).toMatch(/Checked against the material: what the work must be made from \(1\)\n {2}- Every figure must be sourced from the material you were given\.\n {6}your example: 3 of 3 figure\(s\) are in the request or the material \(acme\.material\/prices\.md\)/);
    expect(r.out).toMatch(/Judgement: shown to the writer, reported as not measured \(1\)\n {2}- Weigh switching cost before recommending anything\./);
    expect(r.out).toMatch(/Nothing has been built\. To accept exactly this:/);
    expect(existsSync(join(data, 'skills', 'analysis'))).toBe(false);
    expect(await count()).toBe(before);
  });

  it('--yes builds the skill from exactly that, with the example as its one worked example, and still calls no model', async () => {
    const before = await count();
    const r = atelier('method', 'method.md', '--golden', 'acme.md', '--name', 'analysis', '--yes', ...BACKEND());
    expect(r.code, `${r.err}${r.out}`).toBe(0);
    expect(r.out).toMatch(/Held to your method on every run: 3 thing\(s\) the work must contain, 1 it must be made from; 1 judgement step\(s\) shown and reported as not measured\./);
    expect(await count()).toBe(before);
    const skill = readFileSync(join(proj, '.claude', 'skills', 'analysis', 'SKILL.md'), 'utf8');
    for (const step of stepsOf(NOTE)) expect(skill).toContain(step.text.replace(/\.$/, ''));
    expect(readFileSync(join(proj, '.claude', 'skills', 'analysis', 'examples', 'exemplar.md'), 'utf8')).toContain('Borealis wins for a small team');
  });

  it('a new piece on new material that carries the method out is conformant, and the run says what was held', async () => {
    await script(NEW_PIECE);
    const r = atelier('invoke', '--skill', 'analysis', '--task=Compare Cygnus and Dorado on price for a small team.', '--with', 'prices=new-prices.md', '--json', ...BACKEND());
    expect(r.code, `${r.err}${r.out.slice(0, 600)}`).toBe(0);
    const j = JSON.parse(r.out.slice(r.out.indexOf('{'))) as { output: string; report: string[]; eval: { result: { conformant: boolean; reasons: string[] } } };
    expect(j.eval.result, JSON.stringify(j.eval.result.reasons)).toMatchObject({ conformant: true });
    expect(j.report.join('\n')).toMatch(/Method: contains 3 of 3 thing\(s\) it must · made from what was given 1 of 1 · 1 judgement step\(s\) not measured\./);
    expect(j.output).toContain('| Cygnus | 9 dollars | 100 seats |');
  }, 120_000);

  it('an output that follows the easy rules and says nothing is not conformant: it lacks what the work must contain', async () => {
    await script(BLAND);
    const r = atelier('invoke', '--skill', 'analysis', '--task=Compare Cygnus and Dorado on price for a small team.', '--with', 'prices=new-prices.md', '--json', ...BACKEND());
    const j = JSON.parse(r.out.slice(r.out.indexOf('{'))) as { report: string[]; eval: { result: { conformant: boolean; reasons: string[] } } };
    expect(j.eval.result.conformant).toBe(false);
    expect(j.eval.result.reasons.join(' ')).toMatch(/3 required rules broken/);
    expect(j.report.join('\n')).toMatch(/Method: contains 0 of 3 thing\(s\) it must \(missing: x\d+, x\d+, x\d+\)/);
    expect(j.report.join('\n')).toMatch(/The draft leaves out 3 thing\(s\) the method requires \(x\d+, x\d+, x\d+\); one more draft did not do better, so the first is kept\./);
  }, 120_000);

  it('what a draft left out is written again with it named, and the piece that then holds it is the one delivered', async () => {
    await script(BLAND, [{ contains: 'An earlier draft left out what this work must contain', answer: { piece: NEW_PIECE } }]);
    const r = atelier('invoke', '--skill', 'analysis', '--task=Compare Cygnus and Dorado on price for a small team.', '--with', 'prices=new-prices.md', '--json', ...BACKEND());
    const j = JSON.parse(r.out.slice(r.out.indexOf('{'))) as { output: string; report: string[]; eval: { result: { conformant: boolean } } };
    expect(j.report.join('\n')).toMatch(/Written again: the first draft left out 3 thing\(s\) the method requires \(x\d+, x\d+, x\d+\); it now leaves out 0\./);
    expect(j.output).toContain('## Verdict');
    expect(j.eval.result.conformant).toBe(true);
  }, 120_000);

  it('a figure the material does not hold is never delivered as sourced: with the claim check off, the method\'s own check decides', async () => {
    await script(`${NEW_PIECE}\nCygnus has 4,200 paying customers today.`);
    const r = atelier('invoke', '--skill', 'analysis', '--task=Compare Cygnus and Dorado on price for a small team.', '--with', 'prices=new-prices.md', '--allow-unsourced', '--json', ...BACKEND());
    const j = JSON.parse(r.out.slice(r.out.indexOf('{'))) as { output: string; report: string[]; eval: { result: { conformant: boolean } } };
    expect(j.output).toContain('4,200');
    expect(j.eval.result.conformant).toBe(false);
    expect(j.report.join('\n')).toMatch(/made from what was given 0 of 1 \(not: x\d+\)/);
  }, 120_000);

  it('a second method in the same folder is refused before anything is written: one project, one standard', () => {
    const r = atelier('method', 'method.md', '--golden', 'acme.md', '--name', 'again', '--yes', ...BACKEND());
    expect(r.code).not.toBe(0);
    expect(`${r.err}${r.out}`).toMatch(/this folder already holds a standard \(the skill "analysis"\): a method's steps would be added to its rules/);
    expect(existsSync(join(data, 'skills', 'again'))).toBe(false);
  });
});
