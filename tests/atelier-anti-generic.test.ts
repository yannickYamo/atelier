// tests/atelier-anti-generic.test.ts — WHAT THE MODEL DOES THAT THE AUTHOR DOESN'T: COUNTED, CAPPED, REPAIRED.
//
// Found by the owner reading a skill's output: em dashes where the author writes a spaced hyphen, five-
// word fragments, "That's not X. It's Y.", signposting — the model's fingerprint, at ten to thirty times
// the author's rate, invisible to discovery because discovery only reads what the author does.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findPattern, patternRate, fragmentShare, deltaReference, styleDistanceDocs } from '../core/observers/style.js';
import { deriveContrastRules } from '../core/observers/contrast.js';
import { measure } from '../core/observers/registry.js';
import { unsourcedClaims } from '../core/loop/claims.js';
import { checkDraft } from '../core/loop/run-repair.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import * as store from '../core/state/store.js';

const author = (i: number): { id: string; text: string } => ({ id: `a${i}.md`, text: Array.from({ length: 30 }, (_, k) =>
  `In practice the team - which owns the loop - reviewed item ${k + i} against the checklist and recorded what changed in the log.`).join(' ') });
const model = (i: number): string => Array.from({ length: 30 }, (_, k) =>
  `That's the point. It's not a tool — it's a mindset. Here's the thing ${k + i}: the loop quietly changes everything.`).join(' ');

describe('the patterns are facts about the text, with spans', () => {
  it('finds em dashes, "not X, it\'s Y", "That\'s" openers, "Here\'s", signposting and intensifiers', () => {
    const t = 'That\'s the point. It\'s not a tool — it\'s a mindset. Here is the thing: let me be clear. It quietly works.';
    expect(findPattern(t, 'EM_DASH')).toHaveLength(1);
    expect(findPattern(t, 'NOT_X_ITS_Y').length).toBeGreaterThan(0);
    expect(findPattern(t, 'THAT_OPENER')).toHaveLength(1);
    expect(findPattern(t, 'HERES_OPENER')).toHaveLength(1);
    expect(findPattern(t, 'SIGNPOST').length).toBeGreaterThan(0);
    expect(findPattern(t, 'INTENSIFIER')).toHaveLength(1);
  });
  it('a spaced hyphen is the author\'s mark, not an em dash; a hyphenated word is neither', () => {
    expect(findPattern('The loop - which runs nightly - works. A well-known fix.', 'SPACED_HYPHEN')).toHaveLength(2);
    expect(findPattern('A well-known fix.', 'EM_DASH')).toHaveLength(0);
  });
  it('rates are per 1,000 words; fragment share is a share of sentences', () => {
    expect(patternRate(model(0), 'EM_DASH')).toBeGreaterThan(20);
    expect(fragmentShare('Short one. Another short. This sentence is quite a bit longer than the others.', 5)).toBeCloseTo(2 / 3);
  });
});

describe('contrast: rules from the gap, guarded by the author\'s own held-out work', () => {
  const read = [0, 1, 2, 3].map(author); const held = [4, 5].map(author);
  const rules = deriveContrastRules(read, held, [model(0), model(1), model(2)], 'MACHINE_DISCOVERED');
  const byPattern = (p: string) => rules.find((r) => (r.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === p);
  it('the model\'s em dashes against the author\'s none: a cap of zero, with the author\'s own mark named', () => {
    const r = byPattern('EM_DASH');
    expect(r?.requirement.statement).toMatch(/Never use em dashes.*spaced hyphen/);
    expect(r?.requirement.measurement?.params.maxPer1000).toBe(0);
    expect(r?.requirement.evidence).toMatch(/you: none in .* words; the model on its own: .* per 1,000/);
  });
  it('the author\'s own mark, which the model never uses, becomes a floor', () => {
    const floor = rules.find((r) => (r.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'SPACED_HYPHEN'
      && typeof r.requirement.measurement.params.minPer1000 === 'number');
    expect(floor?.requirement.measurement?.params.minPer1000).toBeGreaterThan(0);
  });
  it('the substitute the em-dash rule names gets a cap at the author\'s own rate, so it cannot take over', () => {
    const cap = rules.find((r) => (r.requirement.measurement?.params.role as string[] | undefined)?.[0] === 'dash-substitute');
    expect(cap?.requirement.measurement?.params.maxPer1000).toBeGreaterThan(0);
  });
  it('a style distance is proposed, and every rule held on the author\'s held-out pieces', () => {
    expect(rules.some((r) => r.requirement.measurement?.observer === 'STYLE_DISTANCE')).toBe(true);
    for (const r of rules) expect(r.conformance.present).toBe(r.conformance.applicable);
  });
  it('a cap the author\'s held-out work would break is never proposed', () => {
    const heldWithDashes = [{ id: 'h.md', text: `${author(9).text} ${'A dash — here. '.repeat(20)}` }];
    const guarded = deriveContrastRules(read, heldWithDashes, [model(0), model(1), model(2)], 'MACHINE_DISCOVERED');
    expect(guarded.find((r) => (r.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'EM_DASH')).toBeUndefined();
  });
  it('style distance puts the author\'s unseen piece nearer the author than the model', () => {
    const ref = deltaReference(read.map((p) => p.text), [model(0), model(1), model(2)]);
    const d = styleDistanceDocs(author(7).text, ref);
    expect(d.author).toBeLessThan(d.model);
  });
});

describe('PATTERN_RATE: caps name what to write instead; floors report without a span', () => {
  const long = (s: string): string => `${s} ${'Plain words fill out this sentence to make the text long enough to count. '.repeat(25)}`;
  it('a cap of zero flags every em dash, with the author\'s substitute in the reason', () => {
    const r = measure(long('It works — mostly.'), { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0, prefer: [' - '] } });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans[0].why).toContain('write " - " instead');
  });
  it('too few is a violation with no span to rewrite', () => {
    const r = measure(long('No bold here.'), { observer: 'PATTERN_RATE', params: { pattern: ['BOLD_SPAN'], minPer1000: 2 } });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans).toEqual([]);
  });
});

describe('a voice may not invent the person\'s life or their numbers', () => {
  it('an invented first-person story and an attributed figure are flagged; material makes them the person\'s', () => {
    const t = 'Years ago I worked on a ground-segment integration that failed. According to the 2025 report, 40,000 objects are tracked. The loop matters.';
    expect(unsourcedClaims(t, '').map((c) => c.kind)).toEqual(['EXPERIENCE', 'FIGURE']);
    const material = 'I worked on a ground-segment integration years ago; it failed. The 2025 report tracks 40,000 objects.';
    expect(unsourcedClaims(t, material)).toEqual([]);
  });
  it('general first-person opinion and unattributed numbers are not claims', () => {
    expect(unsourcedClaims('I think loops matter. We should ship 3 things this week.', '')).toEqual([]);
  });
  it('it is a REQUIRED line in every draft check, and can be turned off', () => {
    const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
    const t = 'Last year we shipped a migration that broke production for a day.';
    expect(checkDraft('d', v, t).checked.find((c) => c.requirementId === 'UNSOURCED')?.result.verdict).toBe('VIOLATED');
    expect(checkDraft('d', v, t, { guardClaims: false }).checked.find((c) => c.requirementId === 'UNSOURCED')).toBeUndefined();
  });
});

describe('through the binary: material, and several drafts chosen by count', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
      emit_piece: { piece: 'Last year we shipped a loop that broke production. It recovered by noon.' },
      emit_replacements: { replacements: [{ id: 1, text: '[your story: a time a loop broke production]' }] },
    } }) });
  });
  afterAll(() => { backend.kill(); });

  it('an invented story becomes a placeholder; material added to the skill is served and stored', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-ag-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-ag-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env });
    run('add', '--statement', 'Lead with the incident.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'inc');
    const be = ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
    const out = run('invoke', '--skill', 'inc', 'write it', '--drafts', '2', ...be);
    expect(out).toContain('[your story: a time a loop broke production]');
    expect(out).toMatch(/wrote 2 drafts and kept one/);
    const [rec] = store.listInvocations({ root: data, skillName: 'inc' });
    expect(rec.repair?.violatedBefore).toEqual(['UNSOURCED']);
    mkdirSync(join(proj, 'm'), { recursive: true });
    writeFileSync(join(proj, 'm', 'incidents.md'), 'Last year we shipped a loop that broke production. It recovered by noon.');
    run('material', '--skill', 'inc', join(proj, 'm', 'incidents.md'));
    expect(store.getMaterial({ root: data, skillName: 'inc' }).map((m) => m.name)).toEqual(['incidents.md']);
    const out2 = run('invoke', '--skill', 'inc', 'write it', ...be);
    expect(out2).toContain('Last year we shipped a loop that broke production.');
    expect(readFileSync(join(proj, '.claude', 'skills', 'inc', 'SKILL.md'), 'utf8')).toBeTruthy();
  });
});

// ── Found by the audit of this build ──────────────────────────────────────────────────────────
describe('the guard is precise, and never defeats itself', () => {
  it('a story the person typed into the request is theirs; the whole invented story is caught, not its first line', () => {
    const t = 'Last year we shipped a loop that broke production for a day. Everything else was routine.';
    expect(unsourcedClaims(t, 'Write about how last year we shipped a loop that broke production for a day')).toEqual([]);
    const story = 'Years ago I worked on a ground-segment integration. We shipped it. Six months later I was reviewing an incident. Nobody was malicious. The lesson is simple.';
    expect(unsourcedClaims(story, '').map((c) => c.text)).toEqual([
      'Years ago I worked on a ground-segment integration.', 'We shipped it.', 'Six months later I was reviewing an incident.', 'Nobody was malicious.']);
  });
  it('numbers match whole, a linked sentence is sourced, and a version number or a year is not a finding', () => {
    expect(unsourcedClaims('According to the survey, 40% of teams agree.', 'the survey said 400 teams')).toHaveLength(1);
    expect(unsourcedClaims('According to [the survey](https://x.org/s), 40% of teams agree.', '')).toEqual([]);
    expect(unsourcedClaims('As of 2025, the API supports streaming. Python 3.12 reports errors better.', '')).toEqual([]);
  });
  it('no placeholder or repair instruction contains an em dash, so it cannot break an em-dash cap', () => {
    const c = unsourcedClaims('According to the 2025 report, 40,000 objects are tracked.', '');
    expect(c[0].why).not.toContain('—');
  });
});

describe('contrast proposes nothing the evidence does not support', () => {
  const read = [0, 1, 2, 3].map(author); const held = [4, 5].map(author);
  it('when the "model drafts" write like the author, nothing is proposed from the gap', () => {
    const same = deriveContrastRules(read, held, [6, 7, 8].map((i) => author(i).text), 'MACHINE_DISCOVERED');
    expect(same.filter((r) => r.requirement.measurement?.observer === 'PATTERN_RATE')).toEqual([]);
  });
});

describe('patterns match the tic, not ordinary prose', () => {
  it('"isn\'t X. It\'s Y" is the tic; "not X, but Y" is a concession', () => {
    expect(findPattern('The loop isn\'t a tool. It\'s a habit.', 'NOT_X_ITS_Y')).toHaveLength(1);
    expect(findPattern('It\'s not foolproof, but it helps.', 'NOT_X_ITS_Y')).toHaveLength(0);
  });
  it('a numeric range is not a spaced hyphen', () => {
    expect(findPattern('It takes 2 - 3 days.', 'SPACED_HYPHEN')).toHaveLength(0);
  });
  it('only the excess over a cap is sent to be rewritten', () => {
    const t = `${'Plain words here make a long enough sentence for counting. '.repeat(60)} It works — mostly. It works — again.`;
    const r = measure(t, { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 2 } });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans).toHaveLength(1);
  });
});
