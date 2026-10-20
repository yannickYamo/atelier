// THE EXECUTION BRIEF (core/loop/execution-brief.ts): which stated steps this request asks for, said to the writer before
// the draft, with the decisions they ask for and what was given. A step with no condition applies by code; a step set
// aside needs the request's own words; one a reading could not place applies. A short request gets no brief. The
// standard is untouched: a set-aside required step keeps the run at NEEDS REVIEW.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EXECUTION_BRIEF, briefNote, applyingSteps, setAsideSteps, type BriefStep } from '../core/loop/execution-brief.js';
import { readContext } from '../core/inference/reading.js';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const unit = (over: Record<string, unknown>) => ({ kind: 'instruction' as const, decision: null, inputs: [], condition: null, output: null, exception: null, dependsOn: [], quote: 'x', by: 'model' as const, ...over });
const steps: BriefStep[] = [
  { id: 'r1', n: 1, statement: 'Open with a Summary section.', required: true, unit: unit({ decision: 'what the change does', inputs: ['the diff'] }) },
  { id: 'r2', n: 2, statement: 'Add a Risks section when the change touches billing.', required: true, unit: unit({ decision: 'whether billing is touched', condition: 'when the change touches billing', dependsOn: ['1'] }) },
  { id: 'r3', n: 3, statement: 'End with a Verdict section.', required: true, unit: unit({ decision: 'the verdict', dependsOn: ['1', '2'] }) },
];
const request = 'Review this change: it renames a CSS class in the docs site and touches nothing else.';

describe('the brief as a value', () => {
  it('no conditional step and no decision: every step applies by code; with decisions and no model the floor applies all, and the note names them in dependency order', async () => {
    const bare = steps.map((s) => ({ ...s, unit: unit({ dependsOn: s.unit!.dependsOn }) }));
    expect(EXECUTION_BRIEF.decide({ request, material: [], steps: bare })?.by).toBe('code');
    const plain = steps.map((s) => ({ ...s, unit: unit({ decision: s.unit!.decision, inputs: s.unit!.inputs, dependsOn: s.unit!.dependsOn }) }));
    const d = await readContext(EXECUTION_BRIEF, { request, material: [], steps: plain }, null, null, { spentUsd: 0, capUsd: 1 });
    expect(d.by).toBe('floor');
    expect(applyingSteps(d.value, plain).map((s) => s.n)).toEqual([1, 2, 3]);
    const note = briefNote(d.value, plain, []);
    expect(note).toContain("For this request, my method's steps that apply: 1, 2, 3.");
    expect(note).toContain('- Step 1: decide what the change does (from the diff)\n- Step 2: decide whether billing is touched\n- Step 3: decide the verdict');
    expect(note).toContain('Given: the request, and nothing else.');
  });
  it('a set-aside needs the request\'s words; without them the step is unresolved and applies; an unsupported decision is said', () => {
    const input = { request, material: [], steps };
    expect(EXECUTION_BRIEF.decide(input)).toBeNull();
    const g = EXECUTION_BRIEF.ground({ placed: [{ n: 2, holds: 'DOES_NOT_HOLD', quote: 'touches nothing else' }], unsupported: [{ n: 3, missing: 'which verdict the author would give' }], contradicted: [{ n: 1, quote: 'renames a CSS class' }, { n: 3, quote: 'not in the request' }] }, input)!;
    expect(g.placed.r2).toEqual({ applies: 'set-aside', why: 'the request says "touches nothing else"' });
    // a contradiction stands only on the request's words, and the step it names still applies
    expect(g.contradicted).toEqual([{ id: 'r1', quote: 'renames a CSS class' }]);
    expect(applyingSteps(g, steps).map((s) => s.n)).toEqual([1, 3]);
    expect(briefNote(g, steps, [])).toContain('The request says "renames a CSS class", which is against step 1: my method stands; follow it, and say in one line that the request asked otherwise.');
    expect(g.placed.r1.applies).toBe('applies');
    expect(g.unsupported).toEqual([{ id: 'r3', missing: 'which verdict the author would give' }]);
    expect(setAsideSteps(g, steps).map((s) => s.n)).toEqual([2]);
    const note = briefNote(g, steps, [{ name: 'change.diff' }]);
    expect(note).toContain("steps that apply: 1, 3. Set aside, not this case: 2 (the request says \"touches nothing else\").");
    expect(note).toContain('- Step 3: decide the verdict — a specific this needs is not given (which verdict the author would give): say so in one line, and decide on what is given');
    expect(note).toContain('Given: the request and change.diff. A specific not given is said to be missing, never invented; every decision is still made, on what is given, in the shape my method asks for.');
    const invented = EXECUTION_BRIEF.ground({ placed: [{ n: 2, holds: 'DOES_NOT_HOLD', quote: 'the change touches billing' }], unsupported: [], contradicted: [] }, input);
    // the quote is in the step, not the request: unresolved, and unresolved applies, and the note says so
    expect(invented?.placed.r2.applies ?? 'applies').toBe('unresolved');
    expect(applyingSteps(invented!, steps).map((s) => s.n)).toEqual([1, 2, 3]);
    expect(briefNote(invented!, steps, [])).toContain('Not decided by the request, so held as applying: 2.');
    // an unsupported id on a set-aside step is dropped; nothing grounded is no reading
    expect(EXECUTION_BRIEF.ground({ placed: [{ n: 9, holds: 'HOLDS', quote: null }], unsupported: [], contradicted: [] }, input)).toBeNull();
    expect(EXECUTION_BRIEF.floor(input).by).toBe('floor');
  });
});

const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Add a Risks section when the change touches billing.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\nI would start with the riskiest line. ${'The change touches the runner and keeps its tests. '.repeat(n)}\n\n## Risks\nNone to billing.\n\n## Verdict\n${verdict}\n`;
const UNITS = { units: [
  { id: '1', kind: 'instruction', decision: 'what the change does', inputs: ['the diff'], condition: null, output: 'a Summary section', exception: null, dependsOn: [], quote: 'Open with a Summary section' },
  { id: '2', kind: 'instruction', decision: 'whether billing is touched', inputs: ['the diff'], condition: 'when the change touches billing', output: 'a Risks section', exception: null, dependsOn: ['1'], quote: 'Add a Risks section' },
  { id: '3', kind: 'instruction', decision: 'the verdict', inputs: [], condition: null, output: 'a Verdict section', exception: null, dependsOn: ['1', '2'], quote: 'End with a Verdict section' },
] };
const BRIEF = { placed: [{ n: 2, holds: 'DOES_NOT_HOLD', quote: 'touches nothing else' }], unsupported: [], contradicted: [] };
const DRAFT = '## Summary\nThe change renames one CSS class in the docs site and keeps the build green.\n\n## Verdict\nApprove\n';

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--context-reader', 'scripted'];
const promptsFor = async (tool: string): Promise<string[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  // the messages' text, not the wire JSON: a quote in the brief is a quote, not an escaped one
  return bodies.map((b) => JSON.parse(b) as { tools?: { function?: { name?: string } }[]; messages?: { content?: string }[] })
    .filter((b) => b.tools?.[0]?.function?.name === tool).map((b) => (b.messages ?? []).map((m) => m.content ?? '').join('\n'));
};

describe('through a run', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_method_units: UNITS, emit_holds_back: { ids: [] }, emit_execution_brief: BRIEF, emit_piece: { piece: DRAFT } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('the writer is served the brief after the skill; the set-aside step is withheld by name and marked set aside; a short request gets none', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-gbr-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gbr-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE);
    ['Approve', 'Request changes', 'Comment', 'Approve'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, i + 1)); });
    writeFileSync(join(proj, 'change.diff'), 'diff --git a/docs/site.css b/docs/site.css\n-.hero { }\n+.banner { }\n');
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    expect(run('new', 'examples', '--method', 'method.md', '--name', 'review', '--yes', ...BACKEND()).code).toBe(0);
    const r = run('invoke', '--skill', 'review', request, '--with', 'change=change.diff', '--json', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const json = JSON.parse(r.out.slice(r.out.indexOf('\n{') + 1)) as { output: string | null; invocationId: string };
    const prompt = (await promptsFor('emit_piece')).at(-1) ?? '';
    expect(prompt).toContain('For this request only');
    expect(prompt).toContain("For this request, my method's steps that apply: 1, 3. Set aside, not this case: 2 (the request says \"touches nothing else\").");
    expect(prompt).toContain('- Step 1: decide what the change does (from the diff)');
    expect(prompt).toContain('Add a Risks section when the change touches billing.');
    expect(prompt).toContain('These rules of the skill above are set aside for this request');
    // the brief did not touch the standard; the record carries it; the set-aside step is set aside in the evaluation
    const rec = store.listInvocations({ root: data, skillName: 'review' }).find((i) => i.invocationId === json.invocationId)!;
    expect(rec.settings!.flags.brief).toMatchObject({ by: 'model', setAside: [expect.stringMatching(/./)], unsupported: [] });
    expect(rec.settings!.flags.brief!.applies).toHaveLength(2);
    const L = { root: data, skillName: 'review' };
    expect(store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!.requirements.filter((q) => q.provenance === 'EXPERT_STATED')).toHaveLength(3);
    // the run's own report says the step was set aside for this request, with the request's words
    expect(r.out).toMatch(/set aside for this request: the request says/);
    // THE NEED FOR THE METHOD DECIDES, NOT THE WORD COUNT: three words with the diff bound get the brief; a bare thank-you does not
    const before = (await promptsFor('emit_execution_brief')).length;
    const terse = run('invoke', '--skill', 'review', 'Review this change.', '--with', 'change=change.diff', '--json', ...BACKEND());
    expect(terse.code, terse.out).toBe(0);
    expect((await promptsFor('emit_execution_brief')).length).toBe(before + 1);
    expect((await promptsFor('emit_piece')).at(-1) ?? '').toContain("For this request, my method's steps that apply");
    const short = run('invoke', '--skill', 'review', 'Thanks, done.', '--json', ...BACKEND());
    expect(short.code, short.out).toBe(0);
    expect((await promptsFor('emit_execution_brief')).length).toBe(before + 1);
    const shortRec = store.listInvocations(L).find((i) => i.invocationId === (JSON.parse(short.out.slice(short.out.indexOf('\n{') + 1)) as { invocationId: string }).invocationId)!;
    expect(shortRec.settings!.flags.brief).toBeUndefined();
  }, 240_000);
});
