// WHETHER A RULE FORBIDS OR ASKS IS READ, NOT MATCHED. Three word patterns in three places decided it, and a negative
// word inside a positive step filed the step under what not to do. Here: the reader's answer counts only when it
// answers every statement asked about, with kinds from the enum; the anchored word pattern is the floor; a method
// build with a model reads every step in one call and serves each under the right heading.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RULE_POLARITY, polarityByWords } from '../core/observers/rule-polarity.js';
import { readContext } from '../core/inference/reading.js';
import type { InferenceClient } from '../core/inference/client.js';

const scripted = (answers: unknown[]): InferenceClient => ({ complete: async () => ({ json: answers[0], text: '', cost: { usd: 0 } }) as never });
const budget = () => ({ spentUsd: 0, capUsd: 1, maxCalls: 5 });
const input = { statements: [{ id: 'r1', text: 'Then a Suggestions section: improvements that do not block the merge.' }, { id: 'r2', text: 'The word "leverage" is never used.' }] };

describe('the floor', () => {
  it('a prohibition at the start of the sentence, and nothing else', () => {
    expect(polarityByWords('Never use "best efforts".')).toBe('BOUNDARY');
    expect(polarityByWords('No bullet points.')).toBe('BOUNDARY');
    expect(polarityByWords('Then a Suggestions section: improvements that do not block the merge.')).toBe('GENERATIVE');
    expect(polarityByWords('The word "leverage" is never used.')).toBe('GENERATIVE');
  });
});

describe('the reading', () => {
  it('nothing to read is decided by code, with no call', async () => {
    const d = await readContext(RULE_POLARITY, { statements: [] }, scripted([{ rules: [] }]), 'm', budget());
    expect(d).toMatchObject({ value: {}, by: 'code' });
  });
  it('an answer for every id, from the enum, is the reading; it overrules the floor in both directions', async () => {
    const d = await readContext(RULE_POLARITY, input, scripted([{ rules: [{ id: 'r1', kind: 'GENERATIVE' }, { id: 'r2', kind: 'BOUNDARY' }] }]), 'm', budget());
    expect(d).toMatchObject({ value: { r1: 'GENERATIVE', r2: 'BOUNDARY' }, by: 'model' });
  });
  it('an answer outside the enum, or for an id never asked, is dropped; a statement the reading skipped is left to the floor', async () => {
    const d = await readContext(RULE_POLARITY, input, scripted([{ rules: [{ id: 'r1', kind: 'MAYBE' }, { id: 'r9', kind: 'BOUNDARY' }, { id: 'r2', kind: 'BOUNDARY' }] }]), 'm', budget());
    expect(d).toMatchObject({ value: { r2: 'BOUNDARY' }, by: 'model' });
    expect(d.value.r1).toBeUndefined();
  });
  it('nothing valid in the answer is no reading: the floor decides and says why', async () => {
    const d = await readContext(RULE_POLARITY, input, scripted([{ rules: [{ id: 'r1', kind: 'MAYBE' }] }]), 'm', budget());
    expect(d.by).toBe('floor'); expect(d.value).toEqual({ r1: 'GENERATIVE', r2: 'GENERATIVE' }); expect(d.why).toMatch(/could not be grounded/);
  });
});

describe('through the binary: a method build reads its steps once', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  let backend: ChildProcess; let port = 0;
  const url = (): string => `http://127.0.0.1:${port}`;
  const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
  const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Then a Suggestions section: improvements that do not block the merge.\n3. The word "leverage" is never used, in any form.\n4. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
  const piece = (v: string): string => `---\nrequest: Review this change.\n---\n## Summary\nThe change adds a cache and keeps its tests.\n\n## Suggestions\nNone.\n\n## Verdict\n${v}\n`;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    // the ids are given in the order of the note's steps
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_rule_polarity: { rules: [{ id: 'r1', kind: 'GENERATIVE' }, { id: 'r2', kind: 'GENERATIVE' }, { id: 'r3', kind: 'BOUNDARY' }, { id: 'r4', kind: 'GENERATIVE' }] }, emit_persona: { points: [] }, emit_holds_back: { ids: [] } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('a ban stated mid-sentence is served under what not to do, and a positive step with a negative clause under what to do', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-rp-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-rp-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE);
    ['Approve', 'Comment', 'Request changes'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), piece(v)); });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const out = execFileSync('node', [CLI, 'method', 'method.md', '--golden', 'examples', '--name', 'review', '--yes', '--report', ...BACKEND()], { encoding: 'utf8', cwd: proj, env });
    expect(out).toContain('(what each step is, a prohibition or a thing to do: read by scripted.)');
    // the owner's steps are served whole in the method; their kind is what the standard records of them
    const dir = join(data, 'skills', 'review', 'standards');
    const standards = readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { requirements: { statement: string; kind: string }[] });
    const kinds = new Map(standards.flatMap((v) => v.requirements).map((r) => [r.statement.trim().replace(/\.$/, ''), r.kind]));
    expect(kinds.get('The word "leverage" is never used, in any form')).toBe('BOUNDARY');
    expect(kinds.get('Then a Suggestions section: improvements that do not block the merge')).toBe('GENERATIVE');
    const bodies = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
    expect(bodies.bodies.filter((b) => b.includes('emit_rule_polarity'))).toHaveLength(1);
  }, 120_000);
});
