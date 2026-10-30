// THE METHOD THE PIECES FOLLOW, READ WHEN THE OWNER WROTE NONE (core/method/infer.ts, cli/commands/build.ts,
// cli/commands/invoke.ts). With no note, the steps are read off the pieces, each shown by a verbatim quote, and kept
// beside the skill; every run with a brief is briefed from them as the owner's steps would brief it, said as a habit
// and not confirmed; the moves link to them; the standard holds none of them and nothing blocks on them. An owner's
// note replaces them; --no-infer-method leaves them out; pieces with no common shape yield none.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { METHOD_INFER, outlineOf, noteOf, MIN_STEPS, MAX_STEPS } from '../core/method/infer.js';
import { readContext } from '../core/inference/reading.js';
import * as store from '../core/state/store.js';

const pieces = [
  { name: 'piece-1', text: '## Verdict\nKelp costs least for a team of 12.\n\n## Vendor pricing\n| Vendor | Price |\n|---|---|\n| Kelp | $8 |\n\n## Cost at this size\n12 × $8 = $96 per month.\n\n## Risks\nList price only.' },
  { name: 'piece-2', text: '## Verdict\nAcme costs least for a team of 30.\n\n## Vendor pricing\n| Vendor | Price |\n|---|---|\n| Acme | $14 |\n\n## Cost at this size\n30 × $14 = $420 per month.\n\n## Risks\nNo discounts shown.' },
];
const input = { purpose: 'price comparisons', pieces };

describe('the reading as a value', () => {
  it('an outline is the headings and the openings under them, within the budget; one piece decides by code; no model is no method', async () => {
    const o = outlineOf(pieces[0].text);
    expect(o).toContain('## Verdict'); expect(o).toContain('Kelp costs least'); expect(o).toContain('## Risks');
    expect(outlineOf('# T\n' + 'a long line of text that goes on and on. '.repeat(100), 200).length).toBeLessThanOrEqual(260);
    expect(METHOD_INFER.decide({ purpose: null, pieces: [pieces[0]] })).toEqual([]);
    expect(METHOD_INFER.decide(input)).toBeNull();
    expect((await readContext(METHOD_INFER, input, null, null, { spentUsd: 0, capUsd: 1 })).value).toEqual([]);
  });
  it('a step stands on a verbatim quote from the piece it names; a duplicate, an unquoted or a misquoted step falls; under two steps is no method', () => {
    const g = METHOD_INFER.ground({ steps: [
      { text: 'Open with the verdict: which vendor costs least for this team.', piece: 'piece-1', quote: '## Verdict' },
      { text: 'Table the vendors and their prices.', piece: 'piece-2', quote: '## Vendor pricing' },
      { text: 'Work the cost at this team size for each vendor.', piece: 'piece-1', quote: '12 × $8 = $96 per month.' },
      { text: 'Work the cost at this team size for each vendor.', piece: 'piece-2', quote: '30 × $14 = $420' },      // duplicate text: dropped
      { text: 'Close on the risks of the comparison.', piece: 'piece-9', quote: '## Risks' },                      // no such piece
      { text: 'Add a recommendation section.', piece: 'piece-1', quote: 'We recommend Kelp' },                      // not in the piece
    ] }, input)!;
    expect(g.map((s) => s.quote)).toEqual(['## Verdict', '## Vendor pricing', '12 × $8 = $96 per month.']);
    expect(noteOf(g)).toBe('1. Open with the verdict: which vendor costs least for this team.\n2. Table the vendors and their prices.\n3. Work the cost at this team size for each vendor.');
    expect(METHOD_INFER.ground({ steps: [{ text: 'One step only.', piece: 'piece-1', quote: '## Verdict' }] }, input)).toBeNull();
    expect(METHOD_INFER.ground({ steps: [] }, input)).toBeNull(); expect(METHOD_INFER.ground({ nope: 1 }, input)).toBeNull();
    const many = METHOD_INFER.ground({ steps: Array.from({ length: 20 }, (_, i) => ({ text: `Step ${i}.`, piece: 'piece-1', quote: '## Risks' })) }, input)!;
    expect(many.length).toBe(MAX_STEPS); expect(MIN_STEPS).toBe(2);
  });
});

// ── THROUGH THE BUILD AND A RUN ────────────────────────────────────────────────────────────────────────────────
const CLI = resolve('dist/cli/atelier.mjs');
const piece = (vendor: string, team: number, price: number, verdict: string): string => `---\nrequest: Compare these vendors on price for a team of ${team} people.\n---\n## Verdict\n${verdict}\n\n## Vendor pricing\n| Vendor | Price per seat |\n|---|---|\n| ${vendor} | $${price} |\n\n## Cost at this size\n${team} × $${price} = $${team * price} per month, as the price list gives it.\n\n## Risks\nList price only; no discount is in the price list.\n`;
const INFER = { steps: [
  { text: 'Open with the verdict: which vendor costs least for this team, in one line.', piece: 'piece-1', quote: '## Verdict' },
  { text: 'Table each vendor with its price per seat.', piece: 'piece-2', quote: '## Vendor pricing' },
  { text: 'Work the monthly cost at this team size for each vendor, showing the arithmetic.', piece: 'piece-3', quote: '## Cost at this size' },
  { text: 'Close on the risks when the price list leaves terms out: say what it does not say.', piece: 'piece-1', quote: '## Risks' },
] };
const UNITS = { units: [
  { id: '1', kind: 'instruction', decision: 'which vendor costs least', inputs: ['the price list'], condition: null, output: 'a Verdict line', exception: null, dependsOn: [], quote: 'Open with the verdict' },
  { id: '2', kind: 'instruction', decision: null, inputs: ['the price list'], condition: null, output: 'a table', exception: null, dependsOn: [], quote: 'Table each vendor' },
  { id: '3', kind: 'instruction', decision: 'the cost at this size', inputs: ['the team size'], condition: null, output: 'the worked costs', exception: null, dependsOn: ['2'], quote: 'Work the monthly cost' },
  { id: '4', kind: 'instruction', decision: null, inputs: [], condition: 'when the price list leaves terms out', output: 'a Risks section', exception: null, dependsOn: [], quote: 'Close on the risks' },
] };
const BRIEF = { placed: [{ n: 4, holds: 'HOLDS', quote: 'no discount terms' }], unsupported: [], contradicted: [] };
const DRAFT = '## Verdict\nKelp costs least.\n\n## Vendor pricing\n| Vendor | Price per seat |\n|---|---|\n| Kelp | $8 |\n\n## Cost at this size\n12 × $8 = $96 per month.\n\n## Risks\nList price only.\n';
const REQUEST = 'Compare these vendors on price for a team of 12 people; the list carries no discount terms.';

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--context-reader', 'scripted', '--reader-model', 'scripted'];
const promptsFor = async (tool: string): Promise<string[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.map((b) => JSON.parse(b) as { tools?: { function?: { name?: string } }[]; messages?: { content?: string }[] })
    .filter((b) => b.tools?.[0]?.function?.name === tool).map((b) => (b.messages ?? []).map((m) => m.content ?? '').join('\n'));
};

describe('through the build and a run', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_method_infer: INFER, emit_method_units: UNITS, emit_holds_back: { ids: [] }, emit_execution_brief: BRIEF, emit_piece: { piece: DRAFT } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('with no note, the steps are read off the pieces and kept; a run is briefed from them as a habit; the standard holds none; a note or --no-infer-method leaves them out', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-infer-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-infer-proj-'));
    mkdirSync(join(proj, 'examples'));
    [['Kelp', 12, 8, 'Kelp costs least for a team of 12.'], ['Acme', 30, 14, 'Acme costs least for a team of 30.'], ['Fennel', 50, 19, 'Fennel costs least for a team of 50.'], ['Kelp', 6, 8, 'Kelp costs least for a team of 6.']]
      .forEach(([v, t, p, verdict], i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), piece(v as string, t as number, p as number, verdict as string)); });
    writeFileSync(join(proj, 'price-list.txt'), 'PRICE LIST\nKelp: 8 dollars per seat, minimum 5 seats\nAcme: 14 dollars per seat, minimum 25 seats\n');
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    const L = { root: data, skillName: 'pricing' };
    // a skill from the pieces alone, no note, no model: nothing to read the method with, and the build says so
    const first = run('new', 'examples', '--name', 'pricing', '--no-model', '--report');
    expect(first.code, first.out).toBe(0);
    expect(first.out).toContain('No method note'); expect(store.getInferredMethod(L)).toBeNull();
    // built again with a model: the steps are read off the pieces, each with its quote, and what each asks the writer to decide
    const b = run('build', '--name', 'pricing', '--report', ...BACKEND());
    expect(b.code, b.out).toBe(0);
    expect(b.out).toContain('Method, read from your pieces (you wrote none): 4 step(s), followed as your habit on every run and made a rule of nothing');
    expect(b.out).toMatch(/Stages: method ✓ \(4 step\(s\) read from your pieces, not confirmed: the brief follows them as your habit, no rule is made of them\) ·/);
    const m = store.getInferredMethod(L)!;
    expect(m.steps.map((s) => [s.id, s.quote])).toEqual([['i1', '## Verdict'], ['i2', '## Vendor pricing'], ['i3', '## Cost at this size'], ['i4', '## Risks']]);
    expect(m.steps[3].unit).toMatchObject({ condition: 'when the price list leaves terms out' }); expect(m.reader).toBe('scripted');
    // THE STANDARD HOLDS NONE OF THEM: no stated requirement, nothing required by the steps
    const sv = store.getSkillVersion(L, store.getActive(L)!)!;
    expect(store.getStandard(L, sv.standardVersionHash)!.requirements.filter((q) => q.provenance === 'EXPERT_STATED')).toEqual([]);
    expect(readFileSync(join(proj, '.claude', 'skills', 'pricing', 'SKILL.md'), 'utf8')).not.toContain('Open with the verdict: which vendor costs least');
    // a rebuild with the same pieces reads nothing again
    const again = run('build', '--name', 'pricing', '--report', ...BACKEND());
    expect(again.code, again.out).toBe(0);
    expect((await promptsFor('emit_method_infer')).length).toBe(1);
    // A RUN IS BRIEFED FROM THEM: the conditional step placed on the request's words, said as a habit, recorded as inferred
    const r = run('invoke', '--skill', 'pricing', REQUEST, '--json', '--with', 'price-list=price-list.txt', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const briefPrompt = (await promptsFor('emit_execution_brief')).at(-1) ?? '';
    expect(briefPrompt).toContain('Close on the risks when the price list leaves terms out');
    const pieceP = (await promptsFor('emit_piece')).at(-1) ?? '';
    expect(pieceP).toContain('(My usual steps, named below, were read from my own pieces and are not rules I wrote: follow them as my habit, not as requirements.)');
    expect(pieceP).toContain("For this request, my method's steps that apply: 1, 2, 3, 4.");
    const idOf = (out: string): string => (JSON.parse(out.slice(out.indexOf('\n{') + 1)) as { invocationId: string }).invocationId;
    const rec = store.listInvocations(L).find((i) => i.invocationId === idOf(r.out))!;
    expect(rec.settings!.flags.brief).toMatchObject({ inferred: true, applies: ['i1', 'i2', 'i3', 'i4'] });
    // AN OWNER'S NOTE REPLACES THEM; --no-infer-method LEAVES THEM OUT
    const nm = run('build', '--name', 'pricing', '--report', '--no-infer-method', ...BACKEND());
    expect(nm.code, nm.out).toBe(0);
    expect(nm.out).toMatch(/Stages: method — no method note \(--no-infer-method\) \(switched off\) ·/); expect(store.getInferredMethod(L)).toBeNull();
    // A READ THAT FINDS NONE IS REMEMBERED AS NONE: the next rebuild on the same pieces calls nothing again
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_method_infer: { steps: [] }, emit_method_units: UNITS, emit_holds_back: { ids: [] } } }) });
    const none = run('build', '--name', 'pricing', '--report', ...BACKEND());
    expect(none.code, none.out).toBe(0);
    expect(none.out).toMatch(/Stages: method — no method note, and the pieces share no method a reading could show ·/);
    expect(store.getInferredMethod(L)).toMatchObject({ steps: [] });
    const before = (await promptsFor('emit_method_infer')).length;
    expect(run('build', '--name', 'pricing', '--report', ...BACKEND()).code).toBe(0);
    expect((await promptsFor('emit_method_infer')).length).toBe(before);
  }, 300_000);
});
