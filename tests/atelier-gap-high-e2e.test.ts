// THROUGH THE COMMANDS (gap audit 2026-10-22, H2 to H5): a skill built again is decided again, never added to; the owner's
// level and the rules they accepted unmeasured outlive the run that set them; a skill from rules built again on the answers
// the owner kept keeps the rules they accepted and is not proposed again; an unchanged method reads nothing again, the
// kind of each step included. Offline, against the scripted backend.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTE = (third: string): string => `How we write the memo\n\n1. Open with a Summary section.\n2. End with a Decision section.\n3. ${third}\n`;
const memo = (n: number): string => `---\nrequest: Draft the memo.\n---\n## Summary\nThe claim is covered. ${'The file holds every document. '.repeat(n)}\n\n## Decision\nPay the claim.\n`;

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--context-reader', 'scripted'];
const calls = async (tool: string): Promise<number> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.filter((b) => (JSON.parse(b) as { tools?: { function?: { name?: string } }[] }).tools?.[0]?.function?.name === tool).length;
};
const setup = (): { data: string; env: NodeJS.ProcessEnv } => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-gap-data-'));
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  return { data, env };
};
const project = (): string => { const p = mkdtempSync(join(tmpdir(), 'atelier-gap-proj-')); mkdirSync(join(p, 'examples')); [1, 2, 3].forEach((n) => { writeFileSync(join(p, 'examples', `m${n}.md`), memo(n)); }); return p; };
const run = (env: NodeJS.ProcessEnv, proj: string, ...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env: { ...env, ATELIER_PROJECT_DIR: proj }, stdio: ['ignore', 'pipe', 'pipe'] });
const built = (data: string, name: string): StandardVersion => { const L = { root: data, skillName: name }; return store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!; };
const buildMemo = (env: NodeJS.ProcessEnv, proj: string, third: string, ...more: string[]): string => {
  writeFileSync(join(proj, 'method.md'), NOTE(third));
  return run(env, proj, 'new', 'examples', '--method', 'method.md', '--name', 'memo', '--yes', ...BACKEND(), ...more);
};

describe('a skill built again (gap audit, high)', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
      emit_holds_back: { ids: [] },
      emit_rules: { rules: [{ statement: 'Lead with the action.', kind: 'GENERATIVE', appliesWhen: 'GENERAL', faithful: true, sourceSpan: 'lead with the action' }], workType: 'support replies' },
      emit_draft_examples: { examples: [{ request: 'The import stalls.', answer: 'Restart the worker. Then check the log.' }, { request: 'How do I reset it?', answer: 'Run reset, then log in again.' }] },
    } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('H2: one step reworded, built from a copy of the project: the standard has as many rules as before, none twice', () => {
    const { data, env } = setup();
    const one = project(); buildMemo(env, one, 'Keep the tone plain.');
    const first = built(data, 'memo').requirements;
    // the project copied, its installed skill with it: the copy takes a copy of the run that built the skill
    const two = mkdtempSync(join(tmpdir(), 'atelier-gap-copy-')); cpSync(one, two, { recursive: true });
    buildMemo(env, two, 'Keep the tone plain and warm.', '--reason', 'one step reworded');
    const again = built(data, 'memo').requirements;
    expect(again.length).toBe(first.length);
    expect(new Set(again.map((r) => r.statement)).size).toBe(again.length);
    expect(again.map((r) => r.statement)).toContain('Keep the tone plain and warm.');
    expect(again.map((r) => r.statement)).not.toContain('Keep the tone plain.');
  }, 240_000);

  it('H3: the level the owner set, and the rules they accepted unmeasured, outlive the build that set them', () => {
    const { data, env } = setup(); const proj = project();
    buildMemo(env, proj, 'Keep the tone plain.', '--latitude', 'strict', '--unmeasured', 'accept');
    const first = built(data, 'memo');
    expect(first.latitude).toMatchObject({ level: 'STRICT', by: 'owner' });
    expect(first.acceptedUnmeasured?.length ?? 0).toBeGreaterThan(0);
    buildMemo(env, proj, 'Keep the tone plain.');
    const again = built(data, 'memo');
    expect(again.latitude).toMatchObject({ level: 'STRICT', by: 'owner' });
    const said = (v: StandardVersion): string[] => (v.acceptedUnmeasured ?? []).map((id) => v.requirements.find((r) => r.requirementId === id)!.statement).sort();
    expect(said(again)).toEqual(said(first));
  }, 240_000);

  it('H4: built again on the answers kept, by the command rate prints: the rules accepted, once each, and no new proposal', async () => {
    const { data, env } = setup(); const proj = mkdtempSync(join(tmpdir(), 'atelier-gap-skill-'));
    const said = 'Lead with the action.';
    run(env, proj, 'skill', said, '--name', 'help', ...BACKEND());
    run(env, proj, 'skill', said, '--yes', '--name', 'help', ...BACKEND());
    run(env, proj, 'skill', said, '--name', 'help', '--draft-examples', ...BACKEND());
    const rated = run(env, proj, 'rate', 'd1', 'yes');
    const printed = /atelier (skill [^\n]*)$/m.exec(rated)?.[1] ?? '';
    expect(printed).toBe('skill --yes --name help');
    const proposed = await calls('emit_rules');
    const out = run(env, proj, ...printed.split(' '), ...BACKEND());
    expect(await calls('emit_rules')).toBe(proposed);
    expect(out).toContain('the rules you accepted, kept');
    const v = built(data, 'help');
    expect(v.requirements.map((r) => r.statement)).toEqual([said]);
  }, 240_000);

  it('H5: the same method and examples read nothing again, what each step is included, and give the same standard', async () => {
    const { data, env } = setup(); const proj = project();
    buildMemo(env, proj, 'Never add a postscript.');
    const first = built(data, 'memo').standardVersionHash;
    const polarity = await calls('emit_rule_polarity');
    buildMemo(env, proj, 'Never add a postscript.');
    expect(await calls('emit_rule_polarity')).toBe(polarity);
    expect(built(data, 'memo').standardVersionHash).toBe(first);
  }, 240_000);
});
