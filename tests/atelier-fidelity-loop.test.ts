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
import { applyOperator, sitesOf, effectMatrix, operatorsToward } from '../core/fidelity/operators.js';
import { ratifiedProfile, firstSettings } from '../cli/fidelity.js';
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
  it('split at ", and" drops the "and"; join adds one; a name keeps its capital', () => {
    expect(applyOperator('split-conjunction', t, 0)).toContain('most of the afternoon. Nobody wanted');
    expect(applyOperator('join-adjacent', t, 0)).toContain('We kept the flag, and it was the right call.');
    expect(applyOperator('join-adjacent', 'We met at noon. Smith was late. It rained all day long there.', 0)).toContain('We met at noon, and Smith was late.');
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
  }, 120_000);

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
    // the steering never leaves the delivered text further from the range than the draft it chose
    const by = (r: FidelityReading): number => r.outside.reduce((n, o) => n + o.distance, 0);
    expect(by(rec.fidelity.reading)).toBeLessThanOrEqual(Math.max(...rec.fidelity.drafts.map(by)));
    expect(rec.fidelity.reading.inBand).toBeGreaterThanOrEqual(rec.fidelity.drafts[0].inBand);
  }, 120_000);

  it('fidelity reports the profile and the release; --set makes a child release; --rollback returns to the parent', () => {
    const page = run('fidelity', '--skill', 'posts');
    expect(page).toMatch(/Fidelity profile [0-9a-f]{16}/);
    expect(page).toMatch(/Active implementation release [0-9a-f]{16}: 2 draft\(s\)/);
    expect(page).toMatch(/1 output\(s\) recorded with a reading/);
    const set = run('fidelity', '--skill', 'posts', '--set', 'drafts=2,editBudget=1');
    expect(set).toMatch(/New implementation release [0-9a-f]{16} \(parent [0-9a-f]{16}\): 2 draft\(s\), 1 structural edit\(s\)/);
    expect(run('fidelity', '--skill', 'posts', '--rollback')).toMatch(/Active implementation release is now [0-9a-f]{16}/);
    expect(run('fidelity', '--skill', 'posts')).toMatch(/Active implementation release [0-9a-f]{16}: 2 draft\(s\)/);
  }, 120_000);

  it('fidelity --read places one file against the range, offline', () => {
    const f = join(proj, 'one.md'); writeFileSync(f, wall);
    const out = run('fidelity', '--skill', 'posts', '--read', f);
    expect(out).toMatch(/in range on \d+ of \d+ steering features/);
    expect(out).toMatch(/HIGH {2}.*paragraph/);
  }, 60_000);
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

describe('the detector tie is transitive', () => {
  const base: DraftScore = { req: 0, taste: 0, tells: 0, all: 0, signal: null, style: 0 };
  it('bucketed to tenths: 0.00, 0.08 and 0.16 order consistently', () => {
    const xs = [0.16, 0.0, 0.08].map((d) => ({ ...base, detector: d }));
    const sorted = [...xs].sort(draftOrder).map((x) => x.detector);
    expect(sorted).toEqual([...[...xs].reverse()].sort(draftOrder).map((x) => x.detector));
  });
});
