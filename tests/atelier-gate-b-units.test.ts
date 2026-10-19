// DECISION UNITS: EACH STATED STEP COMPILED FOR EXECUTION, NEVER A NEW REQUIREMENT (core/method/decision-units.ts).
// The reading says what a step is (instruction, template, explanation, criterion), what it asks the writer to decide,
// what it consults, when it applies in the step's own words, what it puts in the work, and what comes first. Code
// grounds every unit in its step's words and floors the rest; the standard has exactly as many requirements with the
// reading as without it, at the same weights.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { METHOD_UNITS, unitFloor, describeUnit } from '../core/method/decision-units.js';
import { readContext } from '../core/inference/reading.js';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const steps = [
  { id: '1', text: 'Open with a Summary section: two or three sentences on what the change does.', under: null },
  { id: '2', text: 'Add a Risks section when the change touches billing.', under: 'Risks' },
  { id: '3', text: 'For example: "Verdict: Request changes — the retry loop never backs off."', under: 'Verdict' },
  { id: '4', text: 'Then rank the initiatives you framed as bets by expected impact.', under: null },
];
const unit = (over: Record<string, unknown>) => ({ id: '1', kind: 'instruction', decision: null, inputs: [], condition: null, output: null, exception: null, dependsOn: [], quote: 'Open with a Summary section', ...over });

describe('the reading as a value', () => {
  it('nothing to read decides by code; a step with no model is an instruction, conditional only by its own words', async () => {
    expect(METHOD_UNITS.decide({ steps: [] })).toEqual({});
    expect(METHOD_UNITS.decide({ steps })).toBeNull();
    const d = await readContext(METHOD_UNITS, { steps }, null, null, { spentUsd: 0, capUsd: 1 });
    expect(d.by).toBe('floor');
    expect(d.value['1']).toMatchObject({ kind: 'instruction', condition: null, by: 'floor' });
    expect(d.value['2']).toMatchObject({ kind: 'instruction', by: 'floor' });
    expect(d.value['2'].condition).not.toBeNull();
    expect(describeUnit(unitFloor(steps[0]))).toBe('instruction (by the words alone)');
  });
  it('the floor reads a template and an explanation by their words, and a heading\'s condition scopes the steps under it', () => {
    expect(unitFloor({ id: '1', text: 'For example: "Verdict: Request changes — the retry loop never backs off."', under: 'Verdict' })).toMatchObject({ kind: 'template', condition: null });
    expect(unitFloor({ id: '2', text: '| Account | Why now | Owner |', under: null })).toMatchObject({ kind: 'template' });
    expect(unitFloor({ id: '3', text: 'We lead with the riskiest line because reviewers stop reading after the second paragraph.', under: null })).toMatchObject({ kind: 'instruction' });
    expect(unitFloor({ id: '4', text: 'Because reviewers stop reading after the second paragraph, the riskiest line comes first.', under: null })).toMatchObject({ kind: 'explanation' });
    const under = 'Escalation (only when the customer asks for a manager)';
    expect(unitFloor({ id: '5', text: 'Name who will call the customer back and the hour they will.', under })).toMatchObject({ kind: 'instruction', condition: under });
    expect(unitFloor({ id: '6', text: 'Name who will call the customer back and the hour they will.', under: 'Routine replies' })).toMatchObject({ condition: null });
    // a model may quote the heading's condition for a step under it, and it is kept
    const g = METHOD_UNITS.ground({ units: [unit({ id: '1', condition: 'only when the customer asks for a manager', quote: 'Name who will call the customer back' })] },
      { steps: [{ id: '1', text: 'Name who will call the customer back and the hour they will.', under }] })!;
    expect(g['1']).toMatchObject({ condition: 'only when the customer asks for a manager', by: 'model' });
  });
  it('a unit stands only on its step\'s words: a condition or a quote not in the step falls to the floor; dependencies name other steps', () => {
    const raw = { units: [
      unit({ id: '1', decision: 'what the change does', output: 'a Summary section', quote: 'Open with a Summary section' }),
      unit({ id: '2', condition: 'when the change touches billing', output: 'a Risks section', quote: 'Add a Risks section' }),
      unit({ id: '3', kind: 'template', quote: 'For example' }),
      unit({ id: '4', decision: 'the order of the bets', dependsOn: ['2', '4', '9'], quote: 'rank the initiatives', condition: 'only on Tuesdays' }),
    ] };
    const g = METHOD_UNITS.ground(raw, { steps })!;
    expect(g['1']).toMatchObject({ kind: 'instruction', decision: 'what the change does', output: 'a Summary section', condition: null, by: 'model' });
    expect(g['2']).toMatchObject({ condition: 'when the change touches billing', by: 'model' });
    expect(g['3']).toMatchObject({ kind: 'template', by: 'model' });
    // an invented condition drops the unit to the floor, which reads no condition in those words
    expect(g['4']).toMatchObject({ by: 'floor', condition: null });
    const g2 = METHOD_UNITS.ground({ units: [unit({ id: '4', dependsOn: ['2', '4', '9'], quote: 'rank the initiatives' })] }, { steps })!;
    expect(g2['4'].dependsOn).toEqual(['2']);
    expect(METHOD_UNITS.ground({ units: [unit({ quote: 'words not in the step' })] }, { steps })).toBeNull();
    expect(METHOD_UNITS.ground({ units: [unit({ kind: 'poem' })] }, { steps })).toBeNull();
    expect(describeUnit(g['2'])).toBe('instruction · when: "when the change touches billing" · puts: a Risks section');
  });
});

const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Add a Risks section when the change touches billing.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\nI would start with the riskiest line. ${'The change touches the runner and keeps its tests. '.repeat(n)}\n\n## Risks\nNone to billing.\n\n## Verdict\n${verdict}\n`;
const UNITS = { units: [
  { id: '1', kind: 'instruction', decision: 'what the change does', inputs: ['the diff'], condition: null, output: 'a Summary section', exception: null, dependsOn: [], quote: 'Open with a Summary section' },
  { id: '2', kind: 'instruction', decision: 'whether billing is touched', inputs: ['the diff'], condition: 'when the change touches billing', output: 'a Risks section', exception: null, dependsOn: ['1'], quote: 'Add a Risks section' },
  { id: '3', kind: 'instruction', decision: 'the verdict', inputs: [], condition: null, output: 'a Verdict section', exception: null, dependsOn: ['1', '2'], quote: 'End with a Verdict section' },
] };

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
interface Seed { data: string; run: (...a: string[]) => { code: number; out: string } }
const seed = (keyless = false): Seed => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-gu-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gu-proj-'));
  mkdirSync(join(proj, 'examples'));
  writeFileSync(join(proj, 'method.md'), NOTE);
  ['Approve', 'Request changes', 'Comment', 'Approve'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, i + 1)); });
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; if (keyless) delete env.ATELIER_PROVIDER;
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  return { data, run };
};
const standardOf = (data: string) => { const L = { root: data, skillName: 'review' }; const sv = store.getSkillVersion(L, store.getActive(L)!)!; return store.getStandard(L, sv.standardVersionHash)!; };

describe('through the build', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_method_units: UNITS, emit_holds_back: { ids: [] } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('with a model: every stated step carries its unit, said in the whole account; the standard has the same requirements at the same weights as without', () => {
    const withModel = seed(); const without = seed(true);
    const r = withModel.run('new', 'examples', '--method', 'method.md', '--name', 'review', '--yes', '--report', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('What each step asks the writer to decide:');
    expect(r.out).toContain('instruction · decides: whether billing is touched · from: the diff · when: "when the change touches billing" · puts: a Risks section · after: 1');
    expect(without.run('new', 'examples', '--method', 'method.md', '--name', 'review', '--yes', '--report').code).toBe(0);
    const a = standardOf(withModel.data); const b = standardOf(without.data);
    const stated = a.requirements.filter((q) => q.provenance === 'EXPERT_STATED');
    expect(stated.length).toBe(3);
    // THE UNITS LIVE BESIDE THE STANDARD, NEVER IN IT: the two standards are the same bytes and the same hash, though one
    // was read by a model and the other by the words alone. No requirement carries a unit.
    expect(a.standardVersionHash).toBe(b.standardVersionHash);
    expect(a.requirements).toEqual(b.requirements);
    expect(a.requirements.some((q) => 'unit' in q)).toBe(false);
    const unitsA = store.getUnits({ root: withModel.data, skillName: 'review' }, a.standardVersionHash);
    const unitsB = store.getUnits({ root: without.data, skillName: 'review' }, b.standardVersionHash);
    expect(stated.map((q) => unitsA[q.requirementId]?.kind)).toEqual(['instruction', 'instruction', 'instruction']);
    expect(unitsA[stated[1].requirementId]).toMatchObject({ condition: 'when the change touches billing', decision: 'whether billing is touched', dependsOn: ['1'], by: 'model' });
    // without a model the words decide: the billing step is conditional by its own "when", the others apply always
    const floors = stated.map((q) => unitsB[q.requirementId]);
    expect(floors.map((u) => u?.by)).toEqual(['floor', 'floor', 'floor']);
    expect(floors[0]?.condition).toBeNull(); expect(floors[1]?.condition).not.toBeNull(); expect(floors[2]?.condition).toBeNull();
    // rules read off the examples carry no unit
    expect(Object.keys(unitsA).sort()).toEqual(stated.map((q) => q.requirementId).sort());
  }, 180_000);
});
