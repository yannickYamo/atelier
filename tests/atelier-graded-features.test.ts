// tests/atelier-graded-features.test.ts — GRADED FEATURES: A REPAIR TARGET THAT IS NEVER A FAILURE (`--graded`, a study arm).
//
// Every FEATURE rule is PREFERRED, so no miss of one ever reached a repair or a note. `--graded <ids>|all` makes the
// named features' rules repair targets: planned and accepted as an enforced rule is, on copies of the report, told
// to the redraft and to later shape rounds; the recorded report and the evaluation never see them as enforced, so
// the record's state is what it was. Without the flag nothing changes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gradedRules, gradedTargets, withGraded, GRADED_PER_PASS } from '../core/loop/run-repair.js';
import { acceptRepair } from '../core/loop/repair.js';
import { FEATURE } from '../core/observers/features.js';
import type { VerifyReport, RuleCheck } from '../core/observers/verify.js';
import * as store from '../core/state/store.js';

const rule = (id: string, feature: string, materiality = 'PREFERRED', extra: Record<string, unknown> = {}) => ({ requirementId: id, statement: `${feature} in range.`, materiality, authority: 'USER_ADOPTED', appliesWhen: 'GENERAL',
  measurement: { observer: 'FEATURE', params: { feature: [feature], minValue: 1, maxValue: 3 } }, ...extra });
const check = (id: string, error: number | undefined, verdict: 'MET' | 'VIOLATED' = 'VIOLATED'): RuleCheck => ({ requirementId: id, statement: id, materiality: 'PREFERRED', enforced: false, observer: 'FEATURE',
  result: { verdict, spans: [], value: 2, detail: '', ...(error === undefined ? {} : { error }) } });
const reportOf = (checked: RuleCheck[]): VerifyReport => ({ skill: 's', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed: false });

describe('which rules are graded, and which checks a pass is pointed at', () => {
  const std = { requirements: [rule('a', 'colon'), rule('b', 'parenthesis'), rule('c', 'parenthesis'), rule('d', 'question', 'REQUIRED'), rule('e', 'italic', 'PREFERRED', { authority: 'EXPERT_REJECTED' }),
    { requirementId: 'f', statement: 'no leverage', materiality: 'REQUIRED', measurement: { observer: 'LEXICON', params: { terms: ['leverage'] } } }] } as never;
  it('nothing without the option; the named features, or all FEATURE rules; never a rejected rule or another observer', () => {
    expect(gradedRules(std, undefined).size).toBe(0);
    expect([...gradedRules(std, ['parenthesis']).entries()]).toEqual([['b', 'parenthesis'], ['c', 'parenthesis']]);
    expect([...gradedRules(std, 'all').keys()]).toEqual(['a', 'b', 'c', 'd']);
    expect(gradedRules(std, ['nope']).size).toBe(0);
  });
  it('the broken graded checks, the largest |error| first, at most three FEATURES a pass (two rules on one feature count once)', () => {
    const rules = new Map([['a', 'colon'], ['b', 'parenthesis'], ['c', 'parenthesis'], ['d', 'question'], ['g', 'italic'], ['h', 'passive']]);
    const report = reportOf([check('a', 0.2), check('b', -0.9), check('c', 0.1), check('d', 0.5), check('g', 1.5), check('h', 0.4), check('f', 2)]);
    const picked = gradedTargets(report, rules).map((c) => c.requirementId);
    expect(picked).toEqual(['g', 'b', 'd', 'c']);
    expect(new Set(picked.map((id) => rules.get(id))).size).toBe(GRADED_PER_PASS);
    // met checks are no target; a check with no error sorts last
    expect(gradedTargets(reportOf([check('a', 0.2, 'MET'), check('b', undefined), check('d', 0.1)]), rules).map((c) => c.requirementId)).toEqual(['d', 'b']);
  });
  it('the copy the planner reads has the targets enforced; the report itself is untouched', () => {
    const report = reportOf([check('a', 0.2), check('b', 0.3)]);
    const marked = withGraded(report, new Set(['b']));
    expect(marked.checked.map((c) => c.enforced)).toEqual([false, true]);
    expect(report.checked.map((c) => c.enforced)).toEqual([false, false]);
    expect(withGraded(report, new Set())).toBe(report);
  });
});

describe('acceptance: a graded feature nearer its band is progress; an enforced rule keeps its own terms', () => {
  const graded = (id: string, error: number, spans = 3): RuleCheck => ({ ...check(id, error), enforced: true, result: { verdict: 'VIOLATED', value: 2, detail: '', error, spans: Array.from({ length: spans }, (_, i) => ({ start: i, end: i + 1, text: 'x', why: '' })) } });
  const enforced = (id: string, verdict: 'MET' | 'VIOLATED', spans = 1): RuleCheck => ({ requirementId: id, statement: id, materiality: 'REQUIRED', enforced: true, observer: 'LEXICON',
    result: { verdict, value: null, detail: '', spans: verdict === 'VIOLATED' ? Array.from({ length: spans }, (_, i) => ({ start: i, end: i + 1, text: 'x', why: '' })) : [] } });
  it('|error| 2.0 → 1.2 with the same count of places is accepted, for a graded check', () => {
    const v = acceptRepair(reportOf([graded('g', 2)]), reportOf([graded('g', 1.2)]), { graded: new Set(['g']) });
    expect(v).toMatchObject({ ok: true }); expect(v.why).toMatch(/graded feature\(s\) nearer the band: g 2.0 → 1.2/);
    // under the step, or not named as graded, it is no progress
    expect(acceptRepair(reportOf([graded('g', 2)]), reportOf([graded('g', 1.95)]), { graded: new Set(['g']) }).ok).toBe(false);
    expect(acceptRepair(reportOf([graded('g', 2)]), reportOf([graded('g', 1.2)])).ok).toBe(false);
  });
  it('the same move with an enforced rule newly broken is refused', () => {
    const v = acceptRepair(reportOf([graded('g', 2), enforced('e', 'MET')]), reportOf([graded('g', 1.2), enforced('e', 'VIOLATED')]), { graded: new Set(['g']) });
    expect(v.ok).toBe(false); expect(v.why).toMatch(/made e worse/);
  });
  it('an enforced rule still broken in as many places is still no progress, graded set or not', () => {
    expect(acceptRepair(reportOf([enforced('e', 'VIOLATED', 2)]), reportOf([enforced('e', 'VIOLATED', 2)])).ok).toBe(false);
    expect(acceptRepair(reportOf([enforced('e', 'VIOLATED', 2)]), reportOf([enforced('e', 'VIOLATED', 2)]), { graded: new Set(['other']) }).ok).toBe(false);
    expect(acceptRepair(reportOf([enforced('e', 'VIOLATED', 2)]), reportOf([enforced('e', 'VIOLATED', 1)])).ok).toBe(true);
  });
});

describe('a graded miss reaches the notes', () => {
  const plain = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
  const aside = 'The rule holds here (as it did last year) and it holds there too (most of the time, at least).';
  const text = Array.from({ length: 8 }, (_, i) => Array.from({ length: 3 }, (_, k) => ((i * 3 + k) % 3 === 0 ? aside : plain)).join(' ')).join('\n\n');
  const r = rule('p1', 'parenthesis'); const params = r.measurement.params;
  const std = { standardVersionHash: 's', requirements: [r] } as never;
  const missed = FEATURE.observe(text, params);
  const report = { failed: false, unchecked: [], conditional: [], checked: [{ requirementId: 'p1', statement: r.statement, materiality: 'PREFERRED', enforced: false, observer: 'FEATURE', result: missed }] } as never;
  it('unmetReader reads nothing of a PREFERRED feature rule without the option, and its miss with the move when graded', async () => {
    const { unmetReader, redraftNote } = await import('../cli/commands/invoke.js');
    expect(unmetReader(std, null)).toBeNull();
    const [miss] = unmetReader(std, null, null, ['parenthesis'])?.({ output: text, report }) ?? [];
    expect(miss).toMatchObject({ id: 'p1', statement: 'parenthesis in range.', off: missed.error });
    expect(miss.move).toMatch(/^about [\d.]+ fewer parenthetical asides per 1,000 words$/);
    expect(redraftNote([miss], text)).toContain(miss.move ?? 'x');
    expect(unmetReader(std, null, null, ['colon'])).toBeNull();
  });
  it('roundMisses carries it too, and the shape note is written from it', async () => {
    const { roundMisses, shapeNote } = await import('../cli/commands/invoke.js');
    expect(roundMisses(std, { output: text, report })).toEqual([]);
    const misses = roundMisses(std, { output: text, report }, 'all');
    expect(misses.map((u) => u.id)).toEqual(['p1']);
    expect(shapeNote(misses)).toContain('fewer parenthetical asides per 1,000 words');
  });
  it('the flag is read as a list of feature ids, or all', async () => {
    const { gradedFeatures } = await import('../cli/commands/invoke.js');
    expect(gradedFeatures(undefined)).toBeUndefined();
    expect(gradedFeatures('all')).toBe('all');
    expect(gradedFeatures('oneSentenceParagraph, paragraphP50')).toEqual(['oneSentenceParagraph', 'paragraphP50']);
  });
});

describe('through the binary: a graded miss is repaired on its carriers and leaves the record where it was', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  let backend: ChildProcess; let port = 0;
  const plain = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
  const aside = 'The rule holds here (as it did last year) and it holds there too (most of the time, at least).';
  // Four sentences of eight parentheses in about 470 words: 17 per 1,000 against a cap of 5. Three carriers rewritten
  // leave one aside, which is inside the band.
  const draft = Array.from({ length: 8 }, (_, i) => Array.from({ length: 3 }, (_, k) => ((i * 3 + k) % 6 === 0 ? aside : plain)).join(' ')).join('\n\n');
  const rewritten = aside.replace(/[()]/g, '');
  const replacements = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, text: rewritten }));
  let env: NodeJS.ProcessEnv; let data: string; let proj: string;
  const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env });
  const invoke = (...extra: string[]) => JSON.parse(run('invoke', '--skill', 'asides', 'write a note', '--json', '--allow-unsourced', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', ...extra)) as
    { output: string; graded?: { features: string[]; targeted: number; repaired: number }; eval: { record?: { state: string; entries: { id: string; required: boolean; result: string }[] } } };
  const rewritesSent = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies.filter((b) => b.includes('emit_replacements')).length;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: draft }, emit_replacements: { replacements: replacements(3) } } }) });
    data = mkdtempSync(join(tmpdir(), 'atelier-graded-data-')); proj = mkdtempSync(join(tmpdir(), 'atelier-graded-proj-'));
    env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    run('add', '--statement', 'Few asides in parentheses.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'PREFERRED', '--measure', 'FEATURE:feature=parenthesis,maxValue=5');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'asides');
  });
  afterAll(() => { backend.kill(); });

  it('without the flag: no rewrite is asked for, the draft ships as written, and the JSON has no graded field', async () => {
    const before = await rewritesSent();
    const out = invoke();
    expect(await rewritesSent()).toBe(before);
    expect(out.output).toBe(draft);
    expect(out.graded).toBeUndefined();
    // nothing required fails on this skill: whatever is left for a person to read, the state is not BLOCKED
    expect(out.eval.record?.state).toMatch(/^(VERIFIED|NEEDS_REVIEW)$/);
  });
  it('with --graded all: the carriers are rewritten, the JSON and the record carry graded, and the state is what it was', async () => {
    const plainRun = invoke();
    const before = await rewritesSent();
    const out = invoke('--graded', 'all');
    expect(await rewritesSent()).toBeGreaterThan(before);
    expect(out.output).not.toBe(draft);
    expect((out.output.match(/\(/g) ?? []).length).toBeLessThan((draft.match(/\(/g) ?? []).length);
    expect(out.graded).toEqual({ features: ['parenthesis'], targeted: 1, repaired: 1 });
    // the rule stays PREFERRED: never a failure, and the record's state is the unflagged run's
    expect(out.eval.record?.state).toBe(plainRun.eval.record?.state);
    expect(out.eval.record?.state).not.toBe('BLOCKED');
    expect(out.eval.record?.entries.find((e) => e.id === 'x1')?.required).toBe(false);
    const recs = store.listInvocations({ root: data, skillName: 'asides' });
    const graded = recs.find((r) => r.repair?.graded);
    expect(graded?.repair?.graded).toEqual({ features: ['parenthesis'], targeted: 1, repaired: 1 });
    expect(graded?.repair?.violatedBefore).toEqual([]);
    expect(graded?.repair?.violatedAfter).toEqual([]);
    // a graded rule the standard does not enforce is no source of its examples
    expect(graded?.repair?.pairs ?? []).toEqual([]);
  });
  it('a miss too far for one pass: the rewrite that lands closer but outside the band is kept, and counts as repaired', async () => {
    // eight aside sentences: about 34 per 1,000 against a cap of 5; three carriers rewritten leave about 21, still out
    const far = Array.from({ length: 8 }, (_, i) => Array.from({ length: 3 }, (_, k) => ((i * 3 + k) % 3 === 0 ? aside : plain)).join(' ')).join('\n\n');
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: far }, emit_replacements: { replacements: replacements(3) } } }) });
    const out = invoke('--graded', 'all');
    const parens = (t: string): number => (t.match(/\(/g) ?? []).length;
    expect(parens(out.output)).toBeLessThan(parens(far));
    expect(parens(out.output)).toBeGreaterThan(0);
    expect(out.graded).toEqual({ features: ['parenthesis'], targeted: 1, repaired: 1 });
    expect(out.eval.record?.state).not.toBe('BLOCKED');
    expect(out.eval.record?.entries.find((e) => e.id === 'x1')?.required).toBe(false);
  });
  it('an unknown feature id is refused before anything is spent', () => {
    expect(() => invoke('--graded', 'nope')).toThrow(/unknown feature/);
  });
});
