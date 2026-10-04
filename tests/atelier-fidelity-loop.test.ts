// tests/atelier-fidelity-loop.test.ts — THE FIDELITY LOOP: THE AUTHOR'S RANGE, THE ACTUATORS, THE RECORD.
//
// Unit tests for each part (the format override, the profile and its reading, the draft order, the
// structural actuator and its guards, the applicability manifest, the claim floor's new failure lines,
// selection on read pieces only, the style-distance ceiling, the reader's patience with rate limits), then
// one journey through the shipped binary against a scripted backend: discovery builds the profile, build
// installs a release, invoke steers four drafts and edits the chosen one toward the author's range and
// records all of it, and `atelier fidelity` reads it back, sets a release and rolls it back.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { formatShape, draftOrder, applicability, editKeepsStandard, type DraftScore } from '../cli/commands/invoke.js';
import * as fstore from '../core/state/fidelity-store.js';
import { makeRelease } from '../core/fidelity/release.js';
import { DEFAULT_SETTINGS } from '../core/fidelity/types.js';
import type { VerifyReport } from '../core/observers/verify.js';
import { buildProfile, readFidelity, inBandShare } from '../core/fidelity/profile.js';
import { movedTarget, steerTowardRange, carrier } from '../core/fidelity/structural.js';
import { parsePlan, sectionBlock, joinSections } from '../core/fidelity/sections.js';
import { applyOperator, sitesOf, effectMatrix, operatorsToward, keepsWords, OPERATOR_IDS } from '../core/fidelity/operators.js';
import { draftPlan } from '../cli/commands/discover.js';
import { bandsFor } from '../core/fidelity/profile.js';
import { ratifiedProfile, firstSettings, releaseFor } from '../cli/fidelity.js';
import { checkDraft, enforceClaims, INCONCLUSIVE, UNREAD } from '../core/loop/run-repair.js';
import { judgeFeature } from '../core/observers/selection.js';
import { authorSelfMargins } from '../core/observers/style.js';
import { patiently } from '../core/loop/claim-extract.js';
import { FORMATS } from '../core/observers/formats.js';
import type { FidelityProfile, FeatureBand, FidelityReading } from '../core/fidelity/types.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';
import type { ClaimSensor } from '../core/loop/claim-extract.js';

// ── a corpus whose form is measurable ─────────────────────────────────────────────────────────────
const SENTENCES = [
  'We shipped the change on a Tuesday.', 'Nobody noticed for a week.', 'Then the support queue doubled.',
  'The cause was a cache that never expired.', 'We had read the docs and still missed it.', 'The fix took an hour.',
  'Finding it took four days.', 'I keep a list of these now.', 'Most of it is boring on purpose.', 'Boring is what lets you sleep.',
  'The team argued about the rollback.', 'We kept the flag and moved on.', 'It was the right call, mostly.', 'The graph went flat by Friday.',
  'Our users never wrote in about it.', 'That silence was the real signal.',
];
const sentence = (i: number): string => SENTENCES[i % SENTENCES.length];
/** An author piece: short paragraphs of two or three sentences. */
const authorPiece = (k: number): string => Array.from({ length: 15 }, (_, p) =>
  Array.from({ length: 2 + ((p + k) % 2) }, (_, s) => sentence(k * 7 + p * 3 + s)).join(' ')).join('\n\n');
/** A model draft: the same sentences, one wall of a paragraph. */
const modelDraft = (k: number): string => Array.from({ length: 34 }, (_, s) => sentence(k * 5 + s)).join(' ');

describe('the format a request states: a shape withholds presentation, a bare request keeps the standard', () => {
  it('code, JSON, a number, one line, yes or no and lists are shapes', () => {
    for (const w of ['return only the code block', 'just the number', 'JSON only', 'answer yes or no', 'one line answer', 'give me only a list']) expect(formatShape(w), w).toBe('SHAPE');
  });
  it('"return only the post", "no preamble" and "just the text" are bare: they drop the wrapping, never the standard', () => {
    for (const w of ['return only the post', 'no preamble', 'give me just the text', 'no commentary']) expect(formatShape(w), w).toBe('BARE');
  });
});

describe('the profile: the author\'s range per feature, its role, and where a text sits', () => {
  const read = Array.from({ length: 8 }, (_, k) => ({ id: `r${k}`, text: authorPiece(k) }));
  const held = Array.from({ length: 3 }, (_, k) => ({ id: `h${k}`, text: authorPiece(k + 8) }));
  const model = Array.from({ length: 10 }, (_, k) => modelDraft(k));
  const profile = buildProfile({ read, held, model, corpusHash: 'c' });

  it('is deterministic', () => {
    expect(buildProfile({ read, held, model, corpusHash: 'c' }).hash).toBe(profile.hash);
  });
  it('a feature that separates the author from the model and holds steers (SIGNAL); one that does not is only monitored', () => {
    const pooled = (id: string): FeatureBand | undefined => profile.bands.find((b) => b.id === id && b.cls === 'all');
    expect(pooled('paragraphP50')?.role).toBe('SIGNAL');
    expect(profile.bands.some((b) => b.role === 'MONITOR')).toBe(true);
  });
  it('bands of their own only for a length class with enough pieces; the rest pooled', () => {
    expect(new Set(profile.bands.map((b) => b.cls))).toEqual(new Set(['all', 'medium']));
  });
  it('an author piece sits in range; a model wall of text does not, and paragraph length is what is out', () => {
    const a = readFidelity(authorPiece(20), profile); const m = readFidelity(modelDraft(20), profile);
    expect(inBandShare(a)).toBeGreaterThan(inBandShare(m)!);
    expect(m.outside.map((o) => o.id)).toContain('paragraphP50');
    expect(m.outside[0].distance).toBeGreaterThanOrEqual(m.outside[m.outside.length - 1].distance);
  });
  it('a FEATURE rule the owner ratified makes that band a RULE, and the hash moves', () => {
    const v = { requirements: [{ requirementId: 'c9', authority: 'USER_ADOPTED', measurement: { observer: 'FEATURE', params: { feature: ['paragraphP50'], maxValue: 60 } } }] } as unknown as StandardVersion;
    const r = ratifiedProfile(profile, v);
    expect(r.bands.find((b) => b.id === 'paragraphP50' && b.cls === 'all')?.role).toBe('RULE');
    expect(r.hash).not.toBe(profile.hash);
  });
  it('a specifics feature below the author\'s range is never "out": asking for more specifics asks for invention', () => {
    const p: FidelityProfile = { version: 1, corpusHash: 'x', detector: null, hash: 'h',
      bands: [{ id: 'numbers', cls: 'all', band: [20, 40], median: 30, spread: 5, n: 8, role: 'SIGNAL', auc: 0.9 }] };
    const r = readFidelity(authorPiece(1), p);
    expect(r.outside).toEqual([]);
    expect(r.inBand).toBe(r.measured);
  });
});

describe('the first release costs what 0.7 did: the loop is opt-in until a study shows it pays', () => {
  const band = (id: string, role: FeatureBand['role']): FeatureBand => ({ id, cls: 'all', band: [1, 2], median: 1.5, spread: 0.2, n: 8, role, auc: 0.9 });
  const p = (roles: FeatureBand['role'][]): FidelityProfile => ({ version: 1, corpusHash: 'c', detector: null, hash: 'h', bands: roles.map((r, i) => band(`f${i}`, r)) });
  it('two drafts, no edits, no notes, retrieval on, however much there is to steer', () => {
    expect(firstSettings(p(['SIGNAL', 'SIGNAL', 'RULE']), true)).toEqual({ drafts: 2, editBudget: 0, retrievalK: 3, notesCap: 0 });
    expect(firstSettings(p(['MONITOR']), true)).toEqual({ drafts: 2, editBudget: 0, retrievalK: 3, notesCap: 0 });
  });
  it('no retrieval without an index', () => {
    expect(firstSettings(p(['SIGNAL', 'SIGNAL', 'SIGNAL']), false).retrievalK).toBe(0);
  });
});

describe('a length class steers only on its own evidence', () => {
  it('a feature that separates the author from the model overall, with no model draft of that length, is only monitored in that class', () => {
    const read = Array.from({ length: 8 }, (_, k) => ({ id: `r${k}`, text: authorPiece(k) }));
    const held = Array.from({ length: 3 }, (_, k) => ({ id: `h${k}`, text: authorPiece(k + 8) }));
    const longWall = (k: number): string => Array.from({ length: 110 }, (_, i) => sentence(k + i)).join(' ');   // a 'long' draft
    const p = buildProfile({ read, held, model: Array.from({ length: 10 }, (_, k) => longWall(k)), corpusHash: 'c' });
    expect(p.bands.find((b) => b.id === 'paragraphP50' && b.cls === 'all')?.role).toBe('SIGNAL');
    expect(p.bands.find((b) => b.id === 'paragraphP50' && b.cls === 'medium')?.role).toBe('MONITOR');
  });
});

describe('the draft order: rules first, then the author\'s range, then the supplied facts, the detector last', () => {
  const base: DraftScore = { req: 0, taste: 0, tells: 0, all: 0, signal: null, style: 0 };
  it('a draft with fewer features outside the range wins, whatever its signal distance', () => {
    expect(draftOrder({ ...base, outside: 1, signal: 9 }, { ...base, outside: 3, signal: 0 })).toBeLessThan(0);
  });
  it('a REQUIRED rule still outranks the range', () => {
    expect(draftOrder({ ...base, req: 1, outside: 0 }, { ...base, req: 0, outside: 5 })).toBeGreaterThan(0);
  });
  it('more of the person\'s facts used wins a tie on the range', () => {
    expect(draftOrder({ ...base, outside: 1, facts: 4 }, { ...base, outside: 1, facts: 1 })).toBeLessThan(0);
  });
  it('the detector breaks only what is left, and only on a clear difference', () => {
    expect(draftOrder({ ...base, detector: 0.2 }, { ...base, detector: 0.8 })).toBeLessThan(0);
    expect(draftOrder({ ...base, detector: 0.51 }, { ...base, detector: 0.54 })).toBe(0);
    expect(draftOrder({ ...base, outside: 0, detector: 0.9 }, { ...base, outside: 1, detector: 0.1 })).toBeLessThan(0);
  });
});

describe('the operators: re-punctuation of the words already there', () => {
  const t = 'The team argued about the rollback for most of the afternoon, and nobody wanted to be the one who blinked first. We kept the flag. It was the right call.\n\n'
    + 'Smith said the graph (which had been flat since Monday) would move; we waited for it.\n\n- a list item, and it stays put\n\n'
    + 'The cache never expired. The fix took an hour. Finding it took four days. I keep a list of these now.';
  it('split at ", and" drops the "and"; join adds one, never before a name', () => {
    expect(applyOperator('split-conjunction', t, 0)).toContain('most of the afternoon. Nobody wanted');
    expect(applyOperator('join-adjacent', t, 0)).toContain('We kept the flag, and it was the right call.');
    // never joined before a word that might be a name: the next join is where a function word follows
    expect(applyOperator('join-adjacent', 'We met at noon. Smith was late. It rained all day long there.', 0)).toBe('We met at noon. Smith was late, and it rained all day long there.');
  });
  it('paragraphs break in the middle and merge when both are short; parentheses and semicolons convert', () => {
    expect(applyOperator('break-paragraph', t, 0)).toContain('The fix took an hour.\n\nFinding it took four days.');
    expect(applyOperator('parenthetical-to-commas', t, 0)).toContain('the graph, which had been flat since Monday, would move');
    expect(applyOperator('semicolon-to-period', t, 0)).toContain('would move. We waited for it.');
  });
  it('never touches a list item, a heading or a code fence', () => {
    for (const op of ['split-conjunction', 'join-adjacent', 'break-paragraph', 'merge-paragraphs', 'parenthetical-to-commas', 'semicolon-to-period'] as const) {
      for (let k = 0; k < sitesOf(op, t); k++) expect(applyOperator(op, t, k), op).toContain('- a list item, and it stays put');
    }
    const fenced = '```\na, and b\n```';
    expect(sitesOf('split-conjunction', fenced)).toBe(0);
  });
  it('the effect matrix says which way each operator moves each feature, and only those are tried', () => {
    const m = effectMatrix(Array.from({ length: 6 }, (_, k) => modelDraft(k)), ['paragraphP50', 'sentencesPerParagraph']);
    expect(m['break-paragraph'].paragraphP50.mean).toBeLessThan(0);
    expect(operatorsToward(m, 'paragraphP50', 'high')).toContain('break-paragraph');
    expect(operatorsToward(m, 'paragraphP50', 'low')).not.toContain('break-paragraph');
  });
});

describe('steering toward the range: kept only when the target moved and nothing else went out', () => {
  const read = Array.from({ length: 8 }, (_, k) => ({ id: `r${k}`, text: authorPiece(k) }));
  const profile = buildProfile({ read, held: [{ id: 'h', text: authorPiece(9) }, { id: 'h2', text: authorPiece(10) }], model: Array.from({ length: 10 }, (_, k) => modelDraft(k)), corpusHash: 'c' });
  const wall = modelDraft(3);
  it('a wall of text is broken toward the author\'s paragraph length, with no model call, and every application is recorded', async () => {
    const r = await steerTowardRange(null, null, wall, profile, { operators: 24, sentences: 0 }, async () => true);
    const kept = r.applications.filter((a) => a.kept);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept[0]).toMatchObject({ actuator: 'break-paragraph' });
    expect(kept[0].after!).toBeLessThan(kept[0].before!);
    expect(r.text.split(/\n\n/).length).toBeGreaterThan(1);
    expect(movedTarget(readFidelity(wall, profile), r.reading, kept[0].target)).toBe(true);
  });
  it('a change the standard rejects is refused and the text stays', async () => {
    const r = await steerTowardRange(null, null, wall, profile, { operators: 24, sentences: 0 }, async () => false);
    expect(r.applications.every((a) => !a.kept)).toBe(true);
    expect(r.text).toBe(wall);
  });
  it('no budget, no change', async () => {
    const r = await steerTowardRange(null, null, wall, profile, { operators: 0, sentences: 0 }, async () => true);
    expect(r.applications).toEqual([]);
    expect(r.text).toBe(wall);
  });
  it('the carrier of over-explaining is the sentence whose removal lowers it most', () => {
    const t = `${Array.from({ length: 30 }, (_, i) => sentence(i)).join(' ')} We did it because the docs said so, which means it was right, that is the reason.`;
    expect(carrier(t, 'explanatory')?.s).toMatch(/^We did it because/);
  });
});

describe('long form by section: a plan, one section at a time, joined', () => {
  it('a plan is 2 to 9 sections with a title and what each covers; anything else is refused', () => {
    expect(parsePlan({ sections: [{ title: 'A', covers: 'x' }, { title: 'B', covers: 'y' }], headings: false })?.sections).toHaveLength(2);
    expect(parsePlan({ sections: [{ title: 'A', covers: 'x' }], headings: false })).toBeNull();
    expect(parsePlan({ sections: Array.from({ length: 10 }, (_, i) => ({ title: `S${i}`, covers: 'x' })), headings: false })).toBeNull();
    expect(parsePlan({ sections: [{ title: '', covers: 'x' }, { title: 'B', covers: 'y' }], headings: false })).toBeNull();
  });
  it('each section is told the whole plan and to write only its own; headings only when the author uses them', () => {
    const plan = { sections: [{ title: 'Start', covers: 'the setup' }, { title: 'End', covers: 'the result' }], headings: false };
    expect(sectionBlock(plan, 1)).toMatch(/Write section 2 of 2 only: "End"/);
    expect(sectionBlock(plan, 1)).toContain('1. Start: the setup');
    expect(joinSections(plan, ['one', 'two'])).toBe('one\n\ntwo');
    expect(joinSections({ ...plan, headings: true }, ['one', 'two'])).toBe('## Start\n\none\n\n## End\n\ntwo');
  });
});

describe('the applicability manifest: every requirement, and what it was to this output', () => {
  const std = { standardVersionHash: 's', requirements: [
    { requirementId: 'a', statement: 'Lead with the decision.', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', materiality: 'REQUIRED' },
    { requirementId: 'b', statement: 'Paragraphs of at most 3 sentences.', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', materiality: 'PREFERRED',
      measurement: { observer: 'FEATURE', params: { feature: ['paragraphP50'], maxValue: 60 } } },
    { requirementId: 'c', statement: 'Never say leverage.', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', materiality: 'REQUIRED',
      measurement: { observer: 'LEXICON', params: { terms: ['leverage'] } } },
    { requirementId: 'd', statement: 'Rejected rule.', authority: 'EXPERT_REJECTED', appliesWhen: 'GENERAL', materiality: 'REQUIRED' },
  ] } as unknown as StandardVersion;
  it('waived with a reason, not applicable when the measure cannot judge, applied otherwise; rejected rules are not listed', () => {
    const m = applicability('s', std, 'Short.', new Map([['c', 'the request states its own format']]), []);
    expect(m.map((x) => x.requirementId)).toEqual(['a', 'b', 'c']);
    expect(m.find((x) => x.requirementId === 'a')?.status).toBe('APPLIED');
    expect(m.find((x) => x.requirementId === 'b')?.status).toBe('NOT_APPLICABLE');
    expect(m.find((x) => x.requirementId === 'c')).toMatchObject({ status: 'WAIVED', why: 'the request states its own format' });
  });
});

describe('the claim floor: unconfirmed is not passed, and an unread text is not checked', () => {
  const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
  const heavy = 'According to a 2023 survey, 73% of teams saw the same. A 2024 report found that 41% of outages start in retries. '
    + 'The 2022 census counted 1,200 such firms. Retries need a budget.';
  it('in writing, a heavy flag rate leaves the figures in and fails the check on them', async () => {
    const r = await enforceClaims('d', v, heavy, { material: '' });
    expect(r.report.checked.find((c) => c.requirementId === INCONCLUSIVE)?.result.verdict).toBe('VIOLATED');
    expect(r.report.failed).toBe(true);
  });
  it('a qualified reader that degraded fails a writing check closed, and only a writing check', () => {
    const sensor = { instrument: 'pattern check (degraded)', qualified: true, degraded: true, gate: 'pattern', notes: [], version: null, spentUsd: 0,
      read: async () => undefined, reading: () => undefined } as unknown as ClaimSensor;
    const w = checkDraft('d', v, 'Retries need a budget.', { claimSensor: sensor });
    expect(w.checked.find((c) => c.requirementId === UNREAD)?.result.verdict).toBe('VIOLATED');
    expect(w.failed).toBe(true);
    const a = checkDraft('d', v, 'Retries need a budget.', { claimSensor: sensor, format: FORMATS['assistant-reply'] });
    expect(a.checked.some((c) => c.requirementId === UNREAD)).toBe(false);
  });
});

describe('selection is made on the pieces read; the held-back pieces only test it', () => {
  it('the held-back values change neither the separation nor the median', () => {
    const a = judgeFeature('x', { read: [10, 11, 12, 10, 11], held: [11, 12], model: [1, 2, 1, 2, 1, 2, 1, 2] });
    const b = judgeFeature('x', { read: [10, 11, 12, 10, 11], held: [1, 2], model: [1, 2, 1, 2, 1, 2, 1, 2] });
    expect(b.auc).toBe(a.auc);
    expect(b.authorMedian).toBe(a.authorMedian);
    expect(b.kept).toBe(false);
  });
  it('fewer than eight model drafts cannot qualify a feature', () => {
    expect(judgeFeature('x', { read: [10, 11, 12, 10, 11], held: [11, 12], model: [1, 2, 1, 2, 1] }).why).toMatch(/too few measurable texts/);
  });
});

describe('style distance: the author\'s own margin is a ceiling', () => {
  it('each author piece has a margin, and a reference too small has none', () => {
    const ref = { words: ['a', 'b'], mean: [0, 0], sd: [1, 1], authorDocs: [[0, 0], [0.1, 0], [0, 0.1]], modelDocs: [[2, 2], [2.1, 2]] };
    expect(authorSelfMargins(ref)).toHaveLength(3);
    expect(authorSelfMargins({ ...ref, authorDocs: [[0, 0]] })).toEqual([]);
  });
});

describe('the claim reader waits out a rate limit, and only a rate limit', () => {
  it('retries a 429 and succeeds; never retries another error', async () => {
    process.env.ATELIER_RETRY_BASE_MS = '1';
    let n = 0;
    expect(await patiently(async () => { n += 1; if (n < 2) throw new Error('HTTP 429 rate limit'); return 'ok'; })).toBe('ok');
    expect(n).toBe(2);
    let m = 0;
    await expect(patiently(async () => { m += 1; throw new Error('schema not satisfied'); })).rejects.toThrow(/schema/);
    expect(m).toBe(1);
  });
});

// ── the journey, through the shipped binary ───────────────────────────────────────────────────────
const CLI = resolve('dist/cli/atelier.mjs');
describe('through the binary: discovery builds the profile, invoke steers and records, fidelity reads it back', () => {
  let backend: ChildProcess; let port = 0;
  const data = mkdtempSync(join(tmpdir(), 'atelier-fid-data-'));
  const proj = mkdtempSync(join(tmpdir(), 'atelier-fid-proj-'));
  const wall = modelDraft(7);
  const split = wall.match(/[^.]+\./g)!.reduce<string[]>((out, s, i) => (i % 2 ? [...out.slice(0, -1), `${out[out.length - 1]} ${s.trim()}`] : [...out, s.trim()]), []).join('\n\n');
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
    const factor = (description: string) => ({ description, appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['post-0.md'], wouldBeAbsentIf: 'the opposite shows', needsFromUser: '', quote: '' });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
      emit_factors: { factors: [factor('Say what happened before why.')] },
      emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }] },
      emit_observation: { applicable: true, present: true, why: 'seen' },
      emit_piece: { piece: wall },
      emit_text: { text: split },
      emit_plan: { sections: [{ title: 'What happened', covers: 'the incident' }, { title: 'What we changed', covers: 'the fix' }], headings: true },
    } }) });
    const dir = join(proj, 'posts'); mkdirSync(dir, { recursive: true });
    for (let k = 0; k < 12; k++) writeFileSync(join(dir, `post-${k}.md`), authorPiece(k));
  });
  afterAll(() => { backend.kill(); });
  const run = (...args: string[]): string => {
    try {
      return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
        encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' },
      });
    } catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${x.status}\n${x.stderr ?? ''}${x.stdout ?? ''}`; }
  };

  it('new … --accept builds the profile and the first implementation release', () => {
    const out = run('new', join(proj, 'posts'), 'write a post like these', '--name', 'posts', '--accept', '--no-ai-assist');
    expect(out).not.toMatch(/^EXIT:/);
    expect(out).toMatch(/Fidelity profile: \d+ feature\(s\) measured on your pieces, \d+ of them steer drafts/);
    expect(out).toMatch(/Implementation release [0-9a-f]{16}: 2 drafts, up to 0 structural edit\(s\)/);
    // the skill's evaluation, printed the moment it is built
    expect(out).toMatch(/── Atelier · skill posts · version [0-9a-f]{8} · standard [0-9a-f]{8}/);
    expect(out).toMatch(/EVERY OUTPUT IS CHECKED BY\n {4}your rules/);
    expect(out).toMatch(/YOUR RANGE {2}descriptive/);
    // the baseline is the reserved pieces, which nothing read: out of sample
    expect(out).toMatch(/baseline {10}your reserved pieces sit in range on a median [0-9.]+ of [0-9.]+ \(n=\d+\)/);
    expect(out).toMatch(/not measured: /);
  }, 120_000);

  it('the card is recorded with the skill: report --skill reads it back, the same in JSON', () => {
    const text = run('report', '--skill', 'posts');
    expect(text).toMatch(/── Atelier · skill posts/);
    const card = JSON.parse(run('report', '--skill', 'posts', '--json')) as { schema: number; rules: { total: number }; fidelity: { steering: number; baseline: unknown } | null; next: string[] };
    expect(card.schema).toBe(1);
    expect(card.rules.total).toBeGreaterThan(0);
    expect(card.fidelity?.baseline).toBeTruthy();
    expect(card.next).toContain('atelier eval --skill posts');
    // live, not frozen: a new release shows on the next read, and is gone again after a rollback
    run('fidelity', '--skill', 'posts', '--set', 'drafts=3');
    expect((JSON.parse(run('report', '--skill', 'posts', '--json')) as { release: { drafts: number } }).release.drafts).toBe(3);
    run('fidelity', '--skill', 'posts', '--rollback');
    expect((JSON.parse(run('report', '--skill', 'posts', '--json')) as { release: { drafts: number }; builtAt: string | null }).release.drafts).toBe(2);
  }, 60_000);

  it('invoke --fidelity writes four drafts, steers toward the range, and records the reading, every application and the manifest', () => {
    const out = run('invoke', '--skill', 'posts', '--no-taste', '--json', '--fidelity', 'write about the cache incident');
    const j = JSON.parse(out) as { output: string; fidelity: { release: string; inBand: number; measured: number; edits: { target: string; kept: boolean }[]; applicability: { status: string }[] } };
    // --fidelity overrides the release's settings for this run, so the run is not that release's evidence
    expect(j.fidelity.release).toBeNull();
    // every application is recorded with its actuator and the target's value before and after
    expect(j.fidelity.edits.length).toBeGreaterThan(0);
    expect(j.fidelity.edits.every((e) => typeof (e as { actuator?: string }).actuator === 'string')).toBe(true);
    expect(j.output.split(/\n\n/).length).toBeGreaterThan(1);
    expect(j.fidelity.applicability.length).toBeGreaterThan(0);
    const invDir = join(data, 'skills', 'posts', 'invocations');
    const rec = JSON.parse(readFileSync(join(invDir, readdirSync(invDir).find((f) => f.endsWith('.json'))!), 'utf8')) as { fidelity: { drafts: FidelityReading[]; reading: FidelityReading } };
    expect(rec.fidelity.drafts).toHaveLength(4);
    // --fidelity makes the drafts differ: each its own temperature, recorded
    expect((rec.fidelity as { variants?: { temperature: number }[] }).variants?.map((v) => v.temperature)).toEqual([0.7, 0.9, 1.0, 0.7]);
    // the steering never leaves the delivered text further from the range than the draft it chose
    const by = (r: FidelityReading): number => r.outside.reduce((n, o) => n + o.distance, 0);
    expect(by(rec.fidelity.reading)).toBeLessThanOrEqual(Math.max(...rec.fidelity.drafts.map(by)));
    expect(rec.fidelity.reading.inBand).toBeGreaterThanOrEqual(rec.fidelity.drafts[0].inBand);
  }, 120_000);

  it('invoke --sections plans the piece, writes it section by section, and records the plan', () => {
    const out = run('invoke', '--skill', 'posts', '--no-taste', '--json', '--sections', 'write the long version of the cache incident');
    const j = JSON.parse(out) as { output: string };
    expect(j.output).toMatch(/^## What happened\n\n[\s\S]*\n\n## What we changed\n\n/);
    const invDir = join(data, 'skills', 'posts', 'invocations');
    const latest = readdirSync(invDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(invDir, f), 'utf8')) as { at: string; fidelity?: { plan?: string[] } })
      .sort((a, b) => a.at.localeCompare(b.at)).pop();
    expect(latest?.fidelity?.plan).toEqual(['What happened', 'What we changed']);
  }, 120_000);

  it('fidelity reports the profile and the release; --set makes a child release; --rollback returns to the parent', () => {
    const page = run('fidelity', '--skill', 'posts');
    expect(page).toMatch(/Fidelity profile [0-9a-f]{16}/);
    expect(page).toMatch(/Active implementation release [0-9a-f]{16}: 2 draft\(s\)/);
    expect(page).toMatch(/2 output\(s\) recorded with a reading/);   // the --fidelity run and the --sections run
    const set = run('fidelity', '--skill', 'posts', '--set', 'drafts=2,editBudget=1');
    expect(set).toMatch(/New implementation release [0-9a-f]{16} \(parent [0-9a-f]{16}\): 2 draft\(s\), 1 structural edit\(s\)/);
    expect(run('fidelity', '--skill', 'posts', '--rollback')).toMatch(/Active implementation release is now [0-9a-f]{16}/);
    expect(run('fidelity', '--skill', 'posts')).toMatch(/Active implementation release [0-9a-f]{16}: 2 draft\(s\)/);
  }, 120_000);

  it('every run is evaluated: the panel with --panel, an eval object in --json, and report, rate and eval read it back', () => {
    const shown = run('invoke', '--skill', 'posts', '--no-taste', '--panel', 'write a short note about the rollback');
    expect(shown).toMatch(/── Atelier · posts · release [0-9a-f]{8}/);
    expect(shown).toMatch(/ {2}RESULT {2}(CONFORMANT|NOT CONFORMANT)/);
    expect(shown).toMatch(/GATES {2}binary, every run/);
    expect(shown).toMatch(/not measured: /);
    const j = JSON.parse(run('invoke', '--skill', 'posts', '--no-taste', '--json', 'write a short note about the flag')) as { invocationId: string; eval: { schema: number; result: { conformant: boolean } } };
    expect(j.eval.schema).toBe(1);
    expect(typeof j.eval.result.conformant).toBe('boolean');
    const rep = run('report', j.invocationId);
    expect(rep).toMatch(/RESULT/);
    expect(rep).toMatch(/TRACE\n {2}request/);
    expect(rep).toMatch(/ {2}repair|claim check|delivered/);
    expect(run('rate', j.invocationId, 'no', 'the opening was too long')).toMatch(/Recorded: no, you would not ship/);
    const ev = run('eval', '--skill', 'posts');
    expect(ev).toMatch(/evaluated run\(s\) of "posts", 1 rated by you/);
    expect(ev).toMatch(/would ship {5}0% \(0\/1, 95% 0%–\d+%\)/);
    expect(ev).toMatch(/not shipped because: "the opening was too long"/);
    expect(run('rate', j.invocationId, 'maybe')).toMatch(/answer yes or no/);
  }, 180_000);

  it('fidelity --read places one file against the range, offline', () => {
    const f = join(proj, 'one.md'); writeFileSync(f, wall);
    const out = run('fidelity', '--skill', 'posts', '--read', f);
    expect(out).toMatch(/in range on \d+ of \d+ steering features/);
    expect(out).toMatch(/HIGH {2}.*paragraph/);
  }, 60_000);
  it('every run says how typical of you it is; --until-typical writes more rounds toward a target and keeps the best', () => {
    const out = run('invoke', '--skill', 'posts', 'Write a post about the outage', '--until-typical', '0.99', '--shape-rounds', '2', '--panel');
    expect(out).not.toMatch(/^EXIT:/);
    expect(out).toMatch(/typical of you {4}as typical as \d+% of your own pieces/);
    expect(out).toMatch(/shape rounds {6}3 written toward 99% typical; kept round \d/);
    expect(run('invoke', '--skill', 'posts', 'x', '--until-typical', '2')).toMatch(/--until-typical takes a share between 0 and 1/);
    const report = run('fidelity', '--skill', 'posts', '--typicality');
    expect(report).toMatch(/output\(s\) against \d+ of your pieces/);
  }, 180_000);

  it('--until-author steers on the style detector, and --select sample draws a tied draft and records the draw', () => {
    const out = run('invoke', '--skill', 'posts', 'Write a post about the outage', '--until-author', '0.99', '--shape-rounds', '1', '--select', 'sample', '--drafts', '3', '--panel', '--json');
    expect(out).not.toMatch(/^EXIT:/);
    const j = JSON.parse(out.slice(out.indexOf('{'))) as { invocationId: string };
    const rec = JSON.parse(readFileSync(join(data, 'skills', 'posts', 'invocations', `${j.invocationId}.json`), 'utf8')) as { fidelity: { shape?: { authorTarget?: number; rounds: { author?: number | null }[] }; settings?: { selection?: string } } };
    expect(rec.fidelity.shape?.authorTarget).toBe(0.99);
    expect(rec.fidelity.shape?.rounds.length).toBe(2);
    expect(typeof rec.fidelity.shape?.rounds[0].author).toBe('number');
    expect(rec.fidelity.settings?.selection).toBe('sample');
    expect(run('invoke', '--skill', 'posts', 'x', '--select', 'random')).toMatch(/--select is sample or best/);
    expect(run('invoke', '--skill', 'posts', 'x', '--until-author', '0.5', '--no-repair')).toMatch(/--no-repair turns the checks off/);
    expect(run('invoke', '--skill', 'posts', 'x', '--until-author', '0.5', '--shape-rounds', '0')).toMatch(/--shape-rounds must be at least 1/);
  }, 180_000);

  it('plan-first: the author\'s structure is read once, each draft gets its own skeleton, and the delivered text is read against it', async () => {
    const factor = (description: string) => ({ description, appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['post-0.md'], wouldBeAbsentIf: 'the opposite shows', needsFromUser: '', quote: '' });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
      emit_factors: { factors: [factor('Say what happened before why.')] }, emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }] },
      emit_observation: { applicable: true, present: true, why: 'seen' }, emit_piece: { piece: split }, emit_text: { text: split },
      emit_plan: { sections: [{ title: 'What happened', covers: 'the incident' }, { title: 'What we changed', covers: 'the fix' }], headings: true },
      emit_labels: { labelAll: ['STORY', 'CLAIM', 'EXAMPLE', 'TURN'] },
    } }) });
    expect(run('invoke', '--skill', 'posts', 'x', '--structure', 'plan')).toMatch(/--structure plan needs your pieces read for structure first/);
    const readOut = run('fidelity', '--skill', 'posts', '--read-structure-from', join(proj, 'posts'), '--cap', '1');
    expect(readOut).not.toMatch(/^EXIT:/);
    expect(readOut).toMatch(/Read \d+ piece\(s\) \(reader [0-9a-f]{8}\); the two reads agreed at a median kappa of 1/);
    const out = run('invoke', '--skill', 'posts', 'Write a post about the outage', '--structure', 'plan', '--drafts', '2', '--panel', '--json');
    expect(out).not.toMatch(/^EXIT:/);
    const j = JSON.parse(out.slice(out.indexOf('{'))) as { invocationId: string };
    const rec = JSON.parse(readFileSync(join(data, 'skills', 'posts', 'invocations', `${j.invocationId}.json`), 'utf8')) as { fidelity: { structure?: { plans: string[][]; read: (string | null)[] | null; followed: number | null } } };
    expect(rec.fidelity.structure?.plans).toHaveLength(2);
    expect(rec.fidelity.structure?.plans[0][0]).toBe('STORY');
    expect(rec.fidelity.structure?.read?.length).toBeGreaterThan(3);
    expect(typeof rec.fidelity.structure?.followed).toBe('number');
    expect(run('invoke', '--skill', 'posts', 'x', '--structure', 'plan', '--sections')).toMatch(/use one/);
  }, 180_000);

  it('the voice layer does nothing until a register is declared; out of register only what the owner marked carries', () => {
    expect(run('voice', 'status', '--skill', 'posts')).toMatch(/no register declared, so nothing of the voice layer runs/);
    const before = run('invoke', '--skill', 'posts', 'Draft the contract for the pilot', '--panel');
    expect(before).not.toMatch(/VOICE {2}below the standard/);
    expect(run('voice', 'register', '--skill', 'posts', 'blog post')).toMatch(/written in one register: post\.\nOne register: nothing can be shown to transfer/);
    // in register: nothing is withheld, and the panel says which register
    expect(run('invoke', '--skill', 'posts', 'Write a blog post about the outage', '--panel')).toMatch(/register {10}in register \(post\)/);
    // out of register: every rule is withheld until the owner marks one
    const out = run('invoke', '--skill', 'posts', 'Draft the contract for the pilot', '--panel');
    expect(out).not.toMatch(/^EXIT:/);
    expect(out).toMatch(/out of register \(contract vs post\): 0 trait\(s\) carried by your policy, \d+ unknown/);
    expect(out).toMatch(/voice pass {8}off/);
    const trait = /^ {2}(\S+)\s+unknown: not carried/m.exec(run('voice', 'status', '--skill', 'posts'))![1];
    expect(run('voice', 'transfer', '--skill', 'posts', '--add', trait)).toMatch(/1 trait\(s\) now carry .* The standard is unchanged\./);
    expect(run('voice', 'status', '--skill', 'posts')).toMatch(/carries: your ruling/);
    expect(run('voice', 'transfer', '--skill', 'posts', '--add', 'nope')).toMatch(/is not a rule of this standard or a steering feature/);
    // the card says it, live
    expect(run('report', '--skill', 'posts')).toMatch(/VOICE {2}written in: post\n {4}out of register {3}1 trait\(s\) carry \(0 measured across registers, 1 by your ruling\)/);
    // the voice pass is refused without a bank, and a bank whose pairs fail their checks is not stored
    expect(run('invoke', '--skill', 'posts', 'Write a blog post', '--voice', 'incontext')).toMatch(/needs a pair bank of at least 12 pairs/);
    expect(run('fidelity', '--skill', 'posts', '--set', 'voice=incontext')).toMatch(/the voice pass on \(in-context pairs\)/);
    expect(run('fidelity', '--skill', 'posts', '--rollback')).toMatch(/Active implementation release is now/);
  }, 180_000);
});

// keep the Requirement import honest for readers of this file
export type { Requirement };

// ── what the review of 0.8 found, pinned ───────────────────────────────────────────────────────────
describe('the owner\'s rulings decide what steers', () => {
  const band = (id: string, extra: Partial<FeatureBand> = {}): FeatureBand => ({ id, cls: 'all', band: [10, 20], median: 15, spread: 2, n: 8, role: 'SIGNAL', auc: 0.95, ...extra });
  const p: FidelityProfile = { version: 1, corpusHash: 'c', detector: null, hash: 'h', bands: [band('paragraphP50', { proposable: true }), band('colon', { proposable: true }), band('sentenceCv')] };
  it('a feature proposed as a rule and not adopted is only monitored; one never proposed still steers', () => {
    const r = ratifiedProfile(p, { requirements: [] } as unknown as StandardVersion);
    expect(r.bands.find((b) => b.id === 'paragraphP50')?.role).toBe('MONITOR');
    expect(r.bands.find((b) => b.id === 'sentenceCv')?.role).toBe('SIGNAL');
  });
  it('a rejected FEATURE rule is monitored; a ratified one is a RULE with the band the owner ratified', () => {
    const v = { requirements: [
      { requirementId: 'c1', authority: 'EXPERT_REJECTED', measurement: { observer: 'FEATURE', params: { feature: ['colon'], maxValue: 5 } } },
      { requirementId: 'c2', authority: 'USER_ADOPTED', measurement: { observer: 'FEATURE', params: { feature: ['paragraphP50'], minValue: 12, maxValue: 30 } } },
    ] } as unknown as StandardVersion;
    const r = ratifiedProfile(p, v);
    expect(r.bands.find((b) => b.id === 'colon')?.role).toBe('MONITOR');
    expect(r.bands.find((b) => b.id === 'paragraphP50')).toMatchObject({ role: 'RULE', band: [12, 30] });
  });
});

describe('a structural edit is held to the terms of a repair', () => {
  const line = (id: string, verdict: 'MET' | 'VIOLATED', spans: string[] = [], materiality = 'REQUIRED') => ({ requirementId: id, statement: id, materiality,
    result: { verdict, value: spans.length, detail: '', spans: spans.map((t) => ({ start: 0, end: t.length, text: t, why: '' })) } });
  const rep = (...checked: ReturnType<typeof line>[]): VerifyReport => ({ skill: 's', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed: false });
  it('refuses a rule already broken now broken in more places (the em dash an edit adds)', () => {
    expect(editKeepsStandard(rep(line('c1', 'VIOLATED', ['—'])), rep(line('c1', 'VIOLATED', ['—', '—'])))).toBe(false);
  });
  it('refuses a PREFERRED rule that held and now breaks', () => {
    expect(editKeepsStandard(rep(line('p3', 'MET', [], 'PREFERRED')), rep(line('p3', 'VIOLATED', ['x'], 'PREFERRED')))).toBe(false);
  });
  it('refuses a newly flagged claim', () => {
    expect(editKeepsStandard(rep(line('UNSOURCED', 'MET')), rep(line('UNSOURCED', 'VIOLATED', ['It cost 4,000 dollars.'])))).toBe(false);
  });
  it('keeps an edit that changed nothing the standard counts', () => {
    expect(editKeepsStandard(rep(line('c1', 'VIOLATED', ['—'])), rep(line('c1', 'VIOLATED', ['—'])))).toBe(true);
  });
});

describe('a release line never crosses a standard', () => {
  it('rollback stops at the first release under the current standard', () => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-rel-')), skillName: 'x' };
    const mk = (parent: string | null, std: string, why: string) => fstore.putRelease(L, makeRelease({ parent, standardVersionHash: std, skillVersionHash: 's', settings: DEFAULT_SETTINGS,
      notes: [], profileHash: null, retrievalHash: null, createdAt: '2026-10-01T00:00:00Z', why }));
    const old = mk(null, 'std-old', 'old');
    const root = mk(old.id, 'std-new', 'new root');   // as a release written before 0.8's fix might be chained
    const child = mk(root.id, 'std-new', 'child');
    fstore.setActiveRelease(L, child.id);
    expect(fstore.rollbackRelease(L)?.id).toBe(root.id);
    expect(fstore.rollbackRelease(L)).toBeNull();
    expect(fstore.getActiveRelease(L)?.release.id).toBe(root.id);
  });
  it('a profile and an index are kept by hash, so a release is served what it names', () => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-prof-')), skillName: 'x' };
    const p1: FidelityProfile = { version: 1, corpusHash: 'a', detector: null, hash: 'p1', bands: [] };
    const p2: FidelityProfile = { ...p1, hash: 'p2' };
    fstore.setProfile(L, p1); fstore.setProfile(L, p2);
    expect(fstore.getProfile(L)?.hash).toBe('p2');
    expect(fstore.getProfile(L, 'p1')?.hash).toBe('p1');
  });
});

describe('upgrading from 0.8: a default nobody chose moves to 1.0\'s; a choice stays', () => {
  const setup = (why: string) => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-up-')), skillName: 'x' };
    const profile: FidelityProfile = { version: 1, corpusHash: 'c', detector: null, hash: 'ph', bands: [] };
    fstore.setProfile(L, profile);
    const r = fstore.putRelease(L, makeRelease({ parent: null, standardVersionHash: 'std', skillVersionHash: 'sv1',
      settings: { drafts: 4, editBudget: 2, retrievalK: 3, notesCap: 6 }, notes: [], profileHash: 'ph', retrievalHash: null, createdAt: '2026-10-01T00:00:00Z', why }));
    fstore.setActiveRelease(L, r.id);
    // the skill's active version, as a built skill's store records it (the version body is not needed here)
    writeFileSync(join(L.root, 'skills', 'x', 'active.json'), JSON.stringify({ skillVersionHash: 'sv1', at: '2026-10-01T00:00:00Z' }));
    return { L, r };
  };
  it('0.8\'s automatic first release becomes a child release with 1.0\'s default, saying why', () => {
    const { L, r } = setup('the first release, built with the skill');
    const got = releaseFor(L, { skillVersionHash: 'sv1', standardVersionHash: 'std' })!;
    expect(got.release.settings).toMatchObject({ drafts: 2, editBudget: 0, notesCap: 0 });
    expect(got.release.parent).toBe(r.id);
    expect(got.release.why).toMatch(/opt-in/);
  });
  it('settings someone chose by hand are kept', () => {
    const { L, r } = setup('settings set by hand: drafts=4,editBudget=2');
    expect(releaseFor(L, { skillVersionHash: 'sv1', standardVersionHash: 'std' })!.release.id).toBe(r.id);
  });
});

// ── what the review of 1.0 found, pinned ───────────────────────────────────────────────────────────
describe('a class band that did not qualify never hides a pooled band that did', () => {
  it('with few drafts per class, a text in that class is still read against the pooled steering bands', () => {
    const shortPiece = (k: number): string => Array.from({ length: 5 }, (_, p) => `${sentence(k + p)} ${sentence(k + p + 1)}`).join('\n\n');
    const read = [...Array.from({ length: 7 }, (_, k) => ({ id: `s${k}`, text: shortPiece(k) })), ...Array.from({ length: 7 }, (_, k) => ({ id: `m${k}`, text: authorPiece(k) }))];
    const held = [0, 1].map((k) => ({ id: `h${k}`, text: authorPiece(k + 20) }));
    const p = buildProfile({ read, held, model: Array.from({ length: 12 }, (_, k) => modelDraft(k)), corpusHash: 'c' });
    const r = readFidelity(modelDraft(30), p);
    expect(r.measured).toBeGreaterThan(0);
    expect(bandsFor(p, r.cls).bands.some((b) => b.role !== 'MONITOR')).toBe(true);
  });
});

describe('the contrast design is crossed, not confounded', () => {
  it('every writer and every length gets plain drafts and imitations', () => {
    const plan = draftPlan(16, 2, [100, 400]);
    for (const w of [0, 1]) for (const len of [100, 400]) {
      const cell = plan.filter((x) => x.writer === w && x.length === len);
      expect(cell.some((x) => x.pasted), `${w}/${len}`).toBe(true);
      expect(cell.some((x) => !x.pasted), `${w}/${len}`).toBe(true);
    }
  });
});

describe('the operators never corrupt text (the review\'s cases)', () => {
  const cases = [
    'I met Mr. Smith there, and we talked about the project for a long while before lunch today.',
    'Pick a language, e.g. Python, and then stick with it for at least a year or more of real work.',
    'We need flour, sugar, eggs, butter, and salt from the shop on the corner before the guests arrive.',
    'We moved the meeting to the third floor of the building, so that everyone could fit in the room.',
    'Use `for (i = 0; i < n; i++)` to loop; it is simple. Tom &amp; Jerry left.',
    'The plan worked (It ended. Mostly anyway.) and then we left early for home.',
    'We left early. Rain fell. Why did we go? It was cold.',
    'Read [the guide, and the notes for the whole team](http://x.y/a.b) before you start on the work today.',
    '    indented code, and more code here for the block that should stay',
    'line one of a hard-wrapped paragraph, and it continues\nonto line two of the same paragraph here.',
  ];
  it('every application keeps the words, and nothing lands in code, links, entities, lists or abbreviations', () => {
    for (const t of cases) for (const op of OPERATOR_IDS) for (let k = 0; k < sitesOf(op, t); k++) {
      const r = applyOperator(op, t, k)!;
      expect(keepsWords(t, r), `${op} on ${t}`).toBe(true);
      expect(r).not.toMatch(/Mr,|e\.g,|\bvs,|&amp\.|`for \(i = 0\. I|, and Rain|, and Why|flour, sugar, eggs, butter\. /);
    }
    expect(sitesOf('split-conjunction', cases[2])).toBe(0);   // a list is not a clause
    expect(sitesOf('split-conjunction', cases[3])).toBe(0);   // "so that" is not a clause boundary
    expect(sitesOf('parenthetical-to-commas', cases[5])).toBe(0);
    expect(sitesOf('split-conjunction', cases[7])).toBe(0);   // inside a link
    for (const op of OPERATOR_IDS) expect(sitesOf(op, cases[8]) + sitesOf(op, cases[9]), op).toBe(0);
  });
  it('keepsWords allows one "and" in or out, and nothing else', () => {
    expect(keepsWords('A b, and c d.', 'A b. C d.')).toBe(true);
    expect(keepsWords('A b. C d.', 'A b, and c d.')).toBe(true);
    expect(keepsWords('A b c.', 'A b d.')).toBe(false);
    expect(keepsWords('A b c.', 'A b.')).toBe(false);
  });
  it('a quotation is someone\'s words: nothing lands inside one', () => {
    const t = 'He said "stop; now, and then wait for the next one" and left the room after that long day.';
    expect(sitesOf('semicolon-to-period', t)).toBe(0);
    expect(sitesOf('split-conjunction', t)).toBe(0);
  });
});

describe('the baseline is out of sample and read with the run\'s roles', () => {
  it('it comes from the reserved pieces, and ratification recounts it with the ratified roles', () => {
    const read = Array.from({ length: 8 }, (_, k) => ({ id: `r${k}`, text: authorPiece(k) }));
    const held = [0, 1].map((k) => ({ id: `h${k}`, text: authorPiece(k + 20) }));
    const unseen = [0, 1, 2].map((k) => authorPiece(k + 40));
    const p = buildProfile({ read, held, model: Array.from({ length: 10 }, (_, k) => modelDraft(k)), corpusHash: 'c', unseen });
    expect(p.baseline?.n).toBe(3);
    expect(buildProfile({ read, held, model: Array.from({ length: 10 }, (_, k) => modelDraft(k)), corpusHash: 'c' }).baseline).toBeUndefined();
    // reject every proposable feature: fewer steer, and the baseline is recounted on what still does
    const proposed = p.bands.filter((b) => b.cls === 'all' && b.proposable).map((b) => b.id);
    const r = ratifiedProfile(p, { requirements: [] } as unknown as StandardVersion);
    if (proposed.length) expect(r.baseline?.medianMeasured).toBeLessThan(p.baseline!.medianMeasured);
    expect(r.baseline?.n).toBe(3);
  });
});

describe('a rollback is a choice the upgrade never undoes', () => {
  it('after rolling back to 0.8\'s loop settings, they stay', () => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-rb-')), skillName: 'x' };
    fstore.setProfile(L, { version: 1, corpusHash: 'c', detector: null, hash: 'ph', bands: [] });
    const old = fstore.putRelease(L, makeRelease({ parent: null, standardVersionHash: 'std', skillVersionHash: 'sv1',
      settings: { drafts: 4, editBudget: 2, retrievalK: 3, notesCap: 6 }, notes: [], profileHash: 'ph', retrievalHash: null, createdAt: '2026-10-01T00:00:00Z', why: 'the first release, built with the skill' }));
    fstore.setActiveRelease(L, old.id);
    writeFileSync(join(L.root, 'skills', 'x', 'active.json'), JSON.stringify({ skillVersionHash: 'sv1', at: '2026-10-01T00:00:00Z' }));
    const moved = releaseFor(L, { skillVersionHash: 'sv1', standardVersionHash: 'std' })!.release;
    expect(moved.settings.drafts).toBe(2);
    expect(fstore.rollbackRelease(L)?.id).toBe(old.id);
    expect(releaseFor(L, { skillVersionHash: 'sv1', standardVersionHash: 'std' })!.release.id).toBe(old.id);
  });
});

describe('the detector tie is transitive', () => {
  const base: DraftScore = { req: 0, taste: 0, tells: 0, all: 0, signal: null, style: 0 };
  it('bucketed to tenths: 0.00, 0.08 and 0.16 order consistently', () => {
    const xs = [0.16, 0.0, 0.08].map((d) => ({ ...base, detector: d }));
    const sorted = [...xs].sort(draftOrder).map((x) => x.detector);
    expect(sorted).toEqual([...[...xs].reverse()].sort(draftOrder).map((x) => x.detector));
  });
});
