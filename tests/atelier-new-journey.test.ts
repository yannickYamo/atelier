// tests/atelier-new-journey.test.ts — THE ONE-COMMAND JOURNEY, THROUGH THE SHIPPED BINARY.
//
// `atelier new <folder> "<purpose>"` against a scripted backend: the corpus is split and some of it
// reserved before anything reads it, discovery proposes, the review screen suggests a ruling for each
// rule, nothing is compiled until the person accepts, and accepting builds a skill that instructs.
import * as store from '../core/state/store.js';
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
    expect(first).toMatch(/needs your material, so shown until you make it required/);
    expect(first).toMatch(/needs from you: the actual figures for the period/);
    expect(first).toMatch(/Nothing was decided/);
    expect(existsSync(join(proj, '.claude', 'skills', 'voice', 'SKILL.md'))).toBe(false);
  });

  it('running it again with --accept continues from review — no second discovery — and builds a skill that instructs', () => {
    // A rule that needs the person's own material is suggested as shown when producing new work (a
    // REQUIRED one would refuse every task that does not bind it); the person makes it required here.
    const second = run(data, proj, 'new', dir, 'write me a blog post in the voice and style of these', '--name', 'voice', '--accept', '--set', 'p2=required');
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
    expect(out).toMatch(/--with actual-figures-period=<file>/);
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

// ── Found by the Phase 1 gap audit ─────────────────────────────────────────────────────────────
import { readdirSync } from 'node:fs';

describe('re-entry is the same run, or a refusal — never a silent switch', () => {
  it('a second call naming a different folder is refused, and the built skill is untouched', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-new2-data-'));
    const proj = mkdtempSync(join(tmpdir(), 'atelier-new2-proj-'));
    const dir = corpus(proj, 8);
    run(data, proj, 'new', dir, 'write me a blog post like these', '--name', 'voice', '--accept');
    const other = join(proj, 'other'); mkdirSync(other);
    for (let i = 0; i < 5; i++) writeFileSync(join(other, `o${i}.md`), `Other ${i}. ${'Something else entirely here. '.repeat(12)}`);
    const out = run(data, proj, 'new', other, 'ensure all copy follows these', '--name', 'other');
    expect(out).toMatch(/this project's run was made from .*posts, not .*other/);
    expect(existsSync(join(proj, '.claude', 'skills', 'other'))).toBe(false);
  });

  it('the second call of the two-step flow keeps the purpose as the host-facing description', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-new3-data-'));
    const proj = mkdtempSync(join(tmpdir(), 'atelier-new3-proj-'));
    const dir = corpus(proj, 8);
    run(data, proj, 'new', dir, 'write me a blog post like these', '--name', 'voice');
    run(data, proj, 'new', dir, '--name', 'voice', '--accept');
    expect(readFileSync(join(proj, '.claude', 'skills', 'voice', 'SKILL.md'), 'utf8')).toMatch(/Use when asked to: write me a blog post like these/);
  });

  it('the name and class given on the first call hold on a continuation that does not repeat them', () => {
    // Found in a real run: the second call built a skill named after the folder, and the class set on
    // the first call went to a skill that was never built.
    const data = mkdtempSync(join(tmpdir(), 'atelier-new5-data-'));
    const proj = mkdtempSync(join(tmpdir(), 'atelier-new5-proj-'));
    const dir = corpus(proj, 8);
    run(data, proj, 'new', dir, 'write me a blog post like these', '--name', 'my-voice', '--class', 'blog-post');
    run(data, proj, 'new', dir, '--accept');
    expect(existsSync(join(proj, '.claude', 'skills', 'my-voice', 'SKILL.md'))).toBe(true);
    expect(store.getDocClass({ root: data, skillName: 'my-voice' })).toBe('blog-post');
  });

  it('the ledger records the weight chosen, the suggestion beside it, and whether it was taken', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-new4-data-'));
    const proj = mkdtempSync(join(tmpdir(), 'atelier-new4-proj-'));
    const dir = corpus(proj, 8);
    run(data, proj, 'new', dir, 'write me a blog post like these', '--name', 'voice', '--accept', '--set', 'p1=preferred');
    const runs = join(data, 'runs', readdirSync(join(data, 'runs'))[0]);
    const ledger = JSON.parse(readFileSync(join(runs, 'ratification-ledger.json'), 'utf8')) as { records: { shown: { requirementId: string }; ruling?: { took: string; materiality: string } }[] };
    const p1 = ledger.records.find((r) => r.shown.requirementId === 'p1');
    expect(p1?.ruling?.took).toBe('OVERRIDE');
    expect(p1?.ruling?.materiality).toBe('PREFERRED');
    expect(ledger.records.find((r) => r.shown.requirementId === 'p2')?.ruling?.took).toBe('SUGGESTION');
  });
});

describe('a larger corpus is not stopped by a call cap sized for a small one', () => {
  it('thirty pieces: every held-out observation is made and the run reaches review', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-new5-data-'));
    const proj = mkdtempSync(join(tmpdir(), 'atelier-new5-proj-'));
    const dir = corpus(proj, 30);
    const out = run(data, proj, 'new', dir, 'write me a blog post like these', '--name', 'voice');
    expect(out).not.toMatch(/call budget exhausted/);
    expect(out).toMatch(/Nothing was decided/);
  });
});

describe('--held-out is a count, or a refusal', () => {
  it('a non-number is refused before anything is sealed', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-new6-data-'));
    const proj = mkdtempSync(join(tmpdir(), 'atelier-new6-proj-'));
    const dir = corpus(proj, 8);
    expect(run(data, proj, 'intake', dir, '--held-out', 'abc')).toMatch(/--held-out must be a whole number/);
  });
});

describe('the purpose is read from what the skill is asked to DO', () => {
  it.each([
    ['always write in my voice', 'GENERATE'],
    ['Write me a newsletter every week', 'GENERATE'],
    ['write a blog post for all our customers', 'GENERATE'],
    ['customer support needs to always answer this way', 'RESPOND'],
    ['reply to support tickets like our best agent', 'RESPOND'],
    ['ensure all content outputs follow the corpus', 'GUARD'],
    ['check every draft against our house style', 'GUARD'],
    ['make sure every email follows our tone', 'GUARD'],
    ['review drafts for tone', 'GUARD'],
    ['write a support article', 'GENERATE'],
    ['draft replies to customer emails', 'RESPOND'],
  ])('%s → %s', (intent, mode) => { expect(modeFromIntent(intent).mode).toBe(mode); });
});

describe('whose work it is is decided once, at intake, and kept', () => {
  it('a continuation without --source-author still records the rules as someone else\'s public work, and review adopts them', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-pub-data-'));
    const proj = mkdtempSync(join(tmpdir(), 'atelier-pub-proj-'));
    const dir = corpus(proj, 8);
    run(data, proj, 'intake', dir, '--source-author', 'A Public Writer');
    const out = run(data, proj, 'new', dir, 'write like these', '--name', 'pub', '--accept');
    expect(out).toMatch(/Accepting ADOPTS them for your skill/);
    const std = JSON.parse(readFileSync(join(data, 'runs', readdirSync(join(data, 'runs'))[0], 'pending-standard.json'), 'utf8')) as { requirements: { provenance: string; authority: string }[] };
    expect(std.requirements.every((r) => r.provenance === 'PUBLIC_BEHAVIOUR_INFERRED')).toBe(true);
    expect(std.requirements.every((r) => r.authority === 'USER_ADOPTED')).toBe(true);
  });
});
