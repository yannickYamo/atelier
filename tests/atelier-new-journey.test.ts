// tests/atelier-new-journey.test.ts — THE ONE-COMMAND JOURNEY, THROUGH THE SHIPPED BINARY.
//
// `atelier new <folder> "<purpose>"` against a scripted backend: the corpus is split and some of it
// reserved before anything reads it, discovery proposes, the review screen suggests a ruling for each
// rule, nothing is compiled until the person accepts, and accepting builds a skill that instructs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { modeFromIntent, suggest } from '../core/ratification/suggest.js';
import type { Requirement } from '../core/state/canonical-state.js';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;

beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
  const factor = (description: string, needs = '') => ({
    description, appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['post-0.md'],
    wouldBeAbsentIf: 'the opposite shows', needsFromUser: needs, quote: '',
  });
  await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
    emit_factors: { factors: [factor('Lead with the decision, then the reasoning.'), factor('Quantify with the real figure.', 'the actual figures for the period')] },
    emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }, { leftIndex: 1, matchedRightIndex: 1 }] },
    emit_observation: { applicable: true, present: true, why: 'seen' },
  } }) });
});
afterAll(() => { backend.kill(); });

const run = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
      encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' },
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};

const corpus = (proj: string, n: number): string => {
  const dir = join(proj, 'posts');
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) writeFileSync(join(dir, `post-${i}.md`), `Post ${i}. ${'We decided first, and explained after. '.repeat(12)}`);
  return dir;
};

describe('atelier new: a folder and a sentence', () => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-new-data-'));
  const proj = mkdtempSync(join(tmpdir(), 'atelier-new-proj-'));
  const dir = corpus(proj, 8);
  let first = '';
  beforeAll(() => { first = run(data, proj, 'new', dir, 'write me a blog post in the voice and style of these', '--name', 'voice'); });

  it('reserves some work before anything reads it, and reads the rest', () => {
    expect(first).toMatch(/RESERVED, before anything read them/);
  });

  it('shows every rule with a suggested ruling, and compiles NOTHING without a yes', () => {
    expect(first).toMatch(/Lead with the decision/);
    expect(first).toMatch(/→ REQUIRED — instructs/);
    expect(first).toMatch(/needs from you: the actual figures for the period/);
    expect(first).toMatch(/Nothing was decided/);
    expect(existsSync(join(proj, '.claude', 'skills', 'voice', 'SKILL.md'))).toBe(false);
  });

  it('running it again with --accept continues from review — no second discovery — and builds a skill that instructs', () => {
    const second = run(data, proj, 'new', dir, 'write me a blog post in the voice and style of these', '--name', 'voice', '--accept');
    expect(second).toMatch(/Continuing the run already in this project/);
    expect(second).not.toMatch(/Reading your work/);
    const md = readFileSync(join(proj, '.claude', 'skills', 'voice', 'SKILL.md'), 'utf8');
    expect(md).toMatch(/Lead with the decision/);
    // the rule that needs material says so in the skill a host reads
    expect(md).toMatch(/Needs: the actual figures for the period\. If you were not given it, ask for it\. Never invent it\./);
    // and the purpose is how a host decides to load it
    expect(md).toMatch(/Use when asked to: write me a blog post/);
    expect(second).toMatch(/\/voice <your task>/);
  });

  it('invoke refuses a REQUIRED rule whose material is not bound, before any call', () => {
    const out = run(data, proj, 'invoke', '--skill', 'voice', 'write about the quarter');
    expect(out).toMatch(/MISSING_REQUIRED_EVIDENCE/);
  });
});

describe('the suggestion is computed from evidence, never decided', () => {
  const p = { requirementId: 'p1', statement: 's', appliesWhen: 'GENERAL' } as Requirement;
  it('reads the mode off the words used', () => {
    expect(modeFromIntent('write me a blog post in the voice of the corpus').mode).toBe('GENERATE');
    expect(modeFromIntent('ensure all content outputs follow the corpus').mode).toBe('GUARD');
    expect(modeFromIntent('customer support needs to always answer this way').mode).toBe('RESPOND');
  });
  it('a rule never seen again where it could apply is suggested for rejection', () => {
    expect(suggest(p, { framings: ['A'], heldOut: { applicable: 3, present: 0 }, needs: null }, 'GENERATE').decision).toBe('REJECT');
  });
  it('generating: required only on held-out evidence; guarding: agreement between readings is enough', () => {
    const agreedOnly = { framings: ['A', 'B'], heldOut: { applicable: 0, present: 0 }, needs: null };
    expect(suggest(p, agreedOnly, 'GENERATE').materiality).toBe('PREFERRED');
    expect(suggest(p, agreedOnly, 'GUARD').materiality).toBe('REQUIRED');
  });
  it('responding: a conditional rule is suggested as shown, not instructed, unless the evidence is strong', () => {
    const cond = { ...p, appliesWhen: 'the customer is asking for a refund' } as Requirement;
    expect(suggest(cond, { framings: ['A', 'B'], heldOut: { applicable: 1, present: 0 }, needs: null }, 'RESPOND').materiality).toBe('PREFERRED');
    expect(suggest(cond, { framings: ['A', 'B'], heldOut: { applicable: 2, present: 2 }, needs: null }, 'RESPOND').materiality).toBe('REQUIRED');
  });
});
