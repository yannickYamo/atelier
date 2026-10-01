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
import { formatShape, draftOrder, applicability, type DraftScore } from '../cli/commands/invoke.js';
import { buildProfile, readFidelity, inBandShare } from '../core/fidelity/profile.js';
import { editTarget, editInstruction, movedTarget, contentKept, editTowardRange, EDITABLE } from '../core/fidelity/structural.js';
import { ratifiedProfile } from '../cli/fidelity.js';
import { checkDraft, enforceClaims, INCONCLUSIVE, UNREAD } from '../core/loop/run-repair.js';
import { judgeFeature } from '../core/observers/selection.js';
import { authorSelfMargins } from '../core/observers/style.js';
import { patiently } from '../core/loop/claim-extract.js';
import { FORMATS } from '../core/observers/formats.js';
import type { FidelityProfile, FeatureBand, FidelityReading } from '../core/fidelity/types.js';
import type { InferenceClient } from '../core/inference/client.js';
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
    expect(draftOrder({ ...base, detector: 0.50 }, { ...base, detector: 0.55 })).toBe(0);
    expect(draftOrder({ ...base, outside: 0, detector: 0.9 }, { ...base, outside: 1, detector: 0.1 })).toBeLessThan(0);
  });
});

describe('the structural actuator: one target, the author\'s numbers, and three guards', () => {
  const read = Array.from({ length: 8 }, (_, k) => ({ id: `r${k}`, text: authorPiece(k) }));
  const profile = buildProfile({ read, held: [{ id: 'h', text: authorPiece(9) }, { id: 'h2', text: authorPiece(10) }], model: Array.from({ length: 10 }, (_, k) => modelDraft(k)), corpusHash: 'c' });
  const wall = modelDraft(3);
  const split = (t: string): string => {
    const ss = t.match(/[^.]+\./g) ?? [t];
    const out: string[] = [];
    for (let i = 0; i < ss.length; i += 2) out.push(ss.slice(i, i + 2).map((x) => x.trim()).join(' '));
    return out.join('\n\n');
  };
  const fake = (answer: (msg: string) => string): InferenceClient => ({
    async complete(req: { userMessage: string }) { return { json: { text: answer(req.userMessage) }, modelId: 'fake', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, cost: { usd: 0 } as never, costUsd: 0, logprobs: null, termination: { kind: 'COMPLETE' } as never }; },
  });
  const budget = (): { spentUsd: number; capUsd: number; maxCalls: number } => ({ spentUsd: 0, capUsd: 1, maxCalls: 10 });

  it('targets the editable band furthest outside, and says it in the author\'s numbers', () => {
    const t = editTarget(readFidelity(wall, profile), profile)!;
    expect(EDITABLE.has(t.id)).toBe(true);
    expect(editInstruction(t)).toMatch(/the author's own pieces sit between [\d.]+ and [\d.]+/);
  });
  it('content kept counts content words with multiplicity', () => {
    expect(contentKept('alpha beta gamma delta', 'alpha beta gamma delta')).toBe(1);
    expect(contentKept('alpha beta gamma delta', 'alpha beta')).toBe(0.5);
  });
  it('a redraft that only re-paragraphs is kept; the target moved and nothing else went out', async () => {
    const r = await editTowardRange(fake(() => split(wall)), budget(), wall, profile, 1, async () => true);
    expect(r.edits[0]).toMatchObject({ kept: true });
    expect(r.text).toBe(split(wall));
    expect(movedTarget(readFidelity(wall, profile), r.reading, r.edits[0].target)).toBe(true);
  });
  it('a redraft that drops a figure is refused by the meaning guard', async () => {
    const withFigure = `${wall} It cost 4,000 dollars.`;
    const r = await editTowardRange(fake(() => split(wall)), budget(), withFigure, profile, 1, async () => true);
    expect(r.edits[0].kept).toBe(false);
    expect(r.edits[0].why).toMatch(/changed what the text claims|did not bring the target closer/);
    expect(r.text).toBe(withFigure);
  });
  it('a redraft the standard rejects is refused', async () => {
    const r = await editTowardRange(fake(() => split(wall)), budget(), wall, profile, 1, async () => false);
    expect(r.edits[0]).toMatchObject({ kept: false, why: 'it broke a rule of the standard or added a claim' });
    expect(r.text).toBe(wall);
  });
  it('a redraft that does not move the target is refused', async () => {
    const r = await editTowardRange(fake(() => wall), budget(), wall, profile, 1, async () => true);
    expect(r.edits[0].kept).toBe(false);
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
    expect(out).toMatch(/Implementation release [0-9a-f]{16}: 4 drafts, up to 2 structural edit\(s\)/);
  }, 120_000);

  it('invoke writes four drafts, keeps a structural edit toward the range, and records the reading, the edits and the manifest', () => {
    const out = run('invoke', '--skill', 'posts', '--no-taste', '--json', 'write about the cache incident');
    const j = JSON.parse(out) as { output: string; fidelity: { release: string; inBand: number; measured: number; edits: { target: string; kept: boolean }[]; applicability: { status: string }[] } };
    expect(j.fidelity.release).toMatch(/^[0-9a-f]{16}$/);
    expect(j.fidelity.edits.some((e) => e.kept)).toBe(true);
    expect(j.output).toBe(split);
    expect(j.fidelity.applicability.length).toBeGreaterThan(0);
    const invDir = join(data, 'skills', 'posts', 'invocations');
    const rec = JSON.parse(readFileSync(join(invDir, readdirSync(invDir).find((f) => f.endsWith('.json'))!), 'utf8')) as { fidelity: { drafts: FidelityReading[]; reading: FidelityReading } };
    expect(rec.fidelity.drafts).toHaveLength(4);
    // a kept edit brings its target closer and never lets another feature out
    const by = (r: FidelityReading): number => r.outside.reduce((n, o) => n + o.distance, 0);
    expect(by(rec.fidelity.reading)).toBeLessThan(by(rec.fidelity.drafts[0]));
    expect(rec.fidelity.reading.inBand).toBeGreaterThanOrEqual(rec.fidelity.drafts[0].inBand);
  }, 120_000);

  it('fidelity reports the profile and the release; --set makes a child release; --rollback returns to the parent', () => {
    const page = run('fidelity', '--skill', 'posts');
    expect(page).toMatch(/Fidelity profile [0-9a-f]{16}/);
    expect(page).toMatch(/Active implementation release [0-9a-f]{16}: 4 draft\(s\)/);
    expect(page).toMatch(/1 output\(s\) recorded with a reading/);
    const set = run('fidelity', '--skill', 'posts', '--set', 'drafts=2,editBudget=1');
    expect(set).toMatch(/New implementation release [0-9a-f]{16} \(parent [0-9a-f]{16}\): 2 draft\(s\), 1 structural edit\(s\)/);
    expect(run('fidelity', '--skill', 'posts', '--rollback')).toMatch(/Active implementation release is now [0-9a-f]{16}/);
    expect(run('fidelity', '--skill', 'posts')).toMatch(/Active implementation release [0-9a-f]{16}: 4 draft\(s\)/);
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
