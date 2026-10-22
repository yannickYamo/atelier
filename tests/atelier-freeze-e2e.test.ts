// THROUGH THE COMMANDS: a rebuild keeps every check its step and the examples still stand behind, and reads only the
// step that was reworded; an output the owner rejects naming a rule joins that rule's mutants; a skill from rules alone
// says so and drafts answers for the owner to keep or reject. Offline, against the scripted backend.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTE = (third: string): string => `How we write the memo\n\n1. Open with a Summary section.\n2. End with a Decision section.\n3. ${third}\n`;
const memo = (n: number): string => `---\nrequest: Draft the memo.\n---\n## Summary\nThe claim is covered. ${'The file holds every document. '.repeat(n)}\n\n## Decision\nPay the claim.\n`;

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--context-reader', 'scripted'];
const stepPrompts = async (): Promise<string[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.map((b) => JSON.parse(b) as { tools?: { function?: { name?: string } }[]; messages?: { content?: string }[] })
    .filter((b) => b.tools?.[0]?.function?.name === 'emit_step_checks').map((b) => (b.messages ?? []).map((m) => m.content ?? '').join('\n'));
};

describe('frozen checks, rejected outputs, drafted answers', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
      emit_holds_back: { ids: [] },
      emit_rules: { rules: [{ statement: 'Lead with the action.', kind: 'GENERATIVE', appliesWhen: 'GENERAL', faithful: true, sourceSpan: 'lead with the action' }], workType: 'support replies' },
      emit_draft_examples: { examples: [{ request: 'The import stalls.', answer: 'Restart the worker. Then check the log.' }, { request: 'How do I reset it?', answer: 'Run reset, then log in again.' }, { request: '', answer: 'no request: dropped' }] },
    } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('a rebuild reads only the step that changed', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-frz-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-frz-proj-'));
    mkdirSync(join(proj, 'examples'));
    [1, 2, 3].forEach((n) => { writeFileSync(join(proj, 'examples', `m${n}.md`), memo(n)); });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const go = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const build = (third: string): void => { writeFileSync(join(proj, 'method.md'), NOTE(third)); go('new', 'examples', '--method', 'method.md', '--name', 'memo', '--yes', ...BACKEND()); };

    const p0 = (await stepPrompts()).length;
    build('Keep the tone plain.');
    const first = (await stepPrompts()).slice(p0);
    expect(first.length).toBeGreaterThanOrEqual(1);
    const L = { root: data, skillName: 'memo' };
    expect(Object.keys(store.getFrozenChecks(L)).length).toBe(3);
    // the same method and examples: nothing is read again
    const p1 = (await stepPrompts()).length;
    build('Keep the tone plain.');
    expect((await stepPrompts()).length).toBe(p1);
    // one step reworded: only that step is read, best of the draws
    build('Keep the tone plain and warm.');
    const third = (await stepPrompts()).slice(p1);
    expect(third.length).toBeGreaterThanOrEqual(1);
    for (const p of third) {
      expect(p).toContain('Keep the tone plain and warm.');
      expect(p).not.toContain('Open with a Summary section.');
    }
    expect(Object.keys(store.getFrozenChecks(L)).length).toBe(4);
  }, 240_000);

  it('a skill from rules alone says so; drafted answers are kept or rejected by the owner, a rejection naming its rule', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-drf-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-drf-proj-'));
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const go = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const said = 'Lead with the action.';
    go('skill', said, '--name', 'help', ...BACKEND());
    const built = go('skill', said, '--yes', '--name', 'help', ...BACKEND());
    expect(built).toContain('Built from your rules alone, with no finished work');
    expect(built).toContain('--draft-examples');
    // built already: drafting builds nothing again
    const drafted = go('skill', said, '--name', 'help', '--draft-examples', ...BACKEND());
    expect(drafted).toContain('2 answer(s) drafted for you to keep or reject');
    expect(drafted).toContain('── d1 · The import stalls.\nRestart the worker. Then check the log.');
    const L = { root: data, skillName: 'help' };
    expect(store.getDrafted(L).map((d) => [d.id, d.kept])).toEqual([['d1', null], ['d2', null]]);
    const rule = store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!.requirements[0].requirementId;
    expect(go('rate', 'd1', 'yes')).toContain('d1 kept as finished work of yours');
    expect(go('rate', 'd2', 'no', 'it does not lead with the action', '--rule', rule)).toContain(`rejected, as breaking ${rule}`);
    expect(store.getDrafted(L).map((d) => [d.id, d.kept, d.rule ?? null])).toEqual([['d1', true, null], ['d2', false, rule]]);
    // the rejected answer is an edit that breaks its rule, at the next build; the kept one is finished work
    const { rejectedOutputs } = await import('../cli/commands/method.js');
    expect([...rejectedOutputs(L)]).toEqual([['Lead with the action.', ['Run reset, then log in again.']]]);
  }, 240_000);
});
