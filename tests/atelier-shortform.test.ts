// tests/atelier-shortform.test.ts — TWEETS, SHORT POSTS AND CONCISE REPLIES, MEASURED AND HELD.
//
// A skill built from five tweets learned two rules, every counted measure was null under 150 words, and a
// 486-character corporate paragraph read the same as a good tweet. Short pieces are now read for their shape (no word
// floor) and for rates pooled over all their words, checked by the count a short output's length expects. A
// long-form standard asked for a short piece keeps its method and its bans, and its counted bands do not apply.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { GOOD, BAD } from './fixtures/shortform.js';
import { shortFormOffers } from '../core/method/standard.js';
import { shortFormOptions, shortFormTransfer, shortFormMeasured, shapeBandRules } from '../core/observers/short-form.js';
import { pooledOut, poissonCdf } from '../core/observers/pooled.js';
import { measure } from '../core/observers/registry.js';
import { FEATURES } from '../core/observers/features.js';
import { deriveMeasuredRules } from '../core/observers/derive.js';
import { suggest } from '../core/ratification/suggest.js';
import type { Measurement, Requirement, StandardVersion } from '../core/state/canonical-state.js';
import { refineToStandard } from '../core/loop/run-repair.js';
import type { InferenceClient } from '../core/inference/client.js';

const cases = (texts: readonly string[]) => texts.map((reference, i) => ({ id: `t${i}`, reference }));
const X = { limit: { chars: 280, from: 'a post on X' }, urlChars: 23 };
const built = shortFormOffers(cases(GOOD.slice(0, 15)), X);
const required = built.proposals.filter((p) => p.required);
const preferred = built.proposals.filter((p) => !p.required);
const broken = (text: string, ps: typeof built.proposals) => ps.filter((p) => measure(text, p.measurement!).verdict === 'VIOLATED');

describe('a rate pooled over short pieces, checked by the count a short output expects', () => {
  it('three questions in 25 words against an expected 0.42 is out; one is not', () => {
    expect(1 - poissonCdf(2, 0.42)).toBeCloseTo(0.0089, 3);
    expect(pooledOut(3, 0.42)).toBe('high');
    expect(pooledOut(1, 0.42)).toBeNull();
    // an author who never does it: any use at all is out
    expect(pooledOut(1, 0, 'high')).toBe('high');
  });
});

describe('fifteen tweets build a skill with length, shape and pooled rates', () => {
  it('length in characters and words and the shape bands are required; at least three rates are pooled', () => {
    const shapes = required.map((p) => (p.measurement!.params.shape as string[])[0]);
    expect(shapes).toEqual(expect.arrayContaining(['characters', 'words', 'sentences', 'hashtags', 'opening', 'firstWord']));
    const rates = preferred.filter((p) => p.measurement?.observer === 'FEATURE' && typeof p.measurement.params.pooledPerWord === 'number');
    expect(rates.length).toBeGreaterThanOrEqual(3);
    expect(built.limits.join('\n')).toMatch(/Platform limit: 280 characters \(a post on X\)/);
  });
  it('held-back tweets by the same author pass at least 80%', () => {
    const passing = GOOD.slice(15).filter((t) => broken(t, required).length === 0).length;
    expect(passing / 5).toBeGreaterThanOrEqual(0.8);
  });
  it('at least 80% of the bad pieces fail a required rule, or are listed with the reason', () => {
    const caught = BAD.filter((b) => broken(b.text, required).length > 0
      || broken(b.text, preferred).some((p) => measure(b.text, p.measurement!).detail.length > 0));
    expect(caught.length / BAD.length).toBeGreaterThanOrEqual(0.8);
  });
  it('the 486-character corporate paragraph fails the tweet skill\'s length rule', () => {
    const corporate = BAD[0].text;
    expect(corporate.length).toBe(486);
    const chars = required.find((p) => (p.measurement!.params.shape as string[])[0] === 'characters')!;
    const r = measure(corporate, chars.measurement!);
    expect(r.verdict).toBe('VIOLATED');
    expect(r.detail).toMatch(/486 characters/);
  });
});

describe('a small corpus is built, with its limits stated', () => {
  it('five tweets: the bands may block, and the screen says no rate can be read yet and how many more pieces would', () => {
    const five = shortFormOffers(cases(GOOD.slice(0, 5)), {});
    expect(five.proposals.filter((p) => p.required).length).toBeGreaterThan(0);
    const said = five.limits.join('\n');
    expect(said).toMatch(/5 short pieces/);
    expect(said).toMatch(/No rate has 10 occurrences.*more pieces? like these would let the first be read/);
    expect(said).toMatch(/No platform limit/);
  });
  it('four tweets: every band is shown, none blocks, and each says one more example would let it block', () => {
    const four = shortFormOffers(cases(GOOD.slice(0, 4)), {});
    expect(four.proposals.length).toBeGreaterThan(0);
    expect(four.proposals.some((p) => p.required)).toBe(false);
    expect(four.proposals.filter((p) => p.measurement?.observer === 'SHAPE').every((p) => (p.onExample ?? '').includes('read from 4 examples, 1 more would let it block'))).toBe(true);
  });
});

describe('pieces that answer requests take their length from the request', () => {
  it('no band of shape is proposed for answers; their rates are still read, and the screen says why', () => {
    const answers = shortFormOffers(cases(GOOD.slice(0, 15)), shortFormOptions('assistant-reply', undefined) as object);
    expect(answers.proposals.some((p) => p.measurement?.observer === 'SHAPE')).toBe(false);
    expect(answers.proposals.filter((p) => p.measurement?.observer === 'FEATURE').length).toBeGreaterThanOrEqual(3);
    expect(answers.limits.join('\n')).toMatch(/follow the request/);
    const read = GOOD.slice(0, 15).map((text, i) => ({ id: `r${i}`, text }));
    expect(shortFormMeasured(read, [], 'MACHINE_DISCOVERED', { answers: true }).some((x) => x.requirement.measurement?.observer === 'SHAPE')).toBe(false);
  });
});

describe('the platform limit: from the format or from --limit, never read off the pieces', () => {
  it('--limit is a whole number of characters; anything else is refused', () => {
    expect(shortFormOptions(undefined, '280')).toEqual({ limit: { chars: 280, from: '--limit' } });
    expect(shortFormOptions('x-post', undefined)).toEqual({ limit: { chars: 280, from: 'a post on X' }, urlChars: 23 });
    expect(shortFormOptions(undefined, 'lots')).toMatch(/whole number/);
    expect(shortFormOptions(undefined, '0')).toMatch(/whole number/);
  });
  it('the character band is held under the limit, and the screen says so', () => {
    const at = shortFormOffers(cases(GOOD.slice(0, 15)), { limit: { chars: 150, from: '--limit' } });
    const chars = at.proposals.find((p) => (p.measurement?.params.shape as string[] | undefined)?.[0] === 'characters')!;
    expect(chars.measurement!.params.max).toBe(150);
    expect(chars.statement).toMatch(/150 is the platform's limit/);
    expect(at.limits.join('\n')).toMatch(/Platform limit: 150 characters \(--limit\).*examples run past it/);
    expect(shapeBandRules(GOOD.slice(0, 15), { limit: 280 }).find((s) => s.shape === 'characters')!.measurement.params.max).toBeLessThanOrEqual(280);
  });
});

describe('nothing unmeasurable on a short output reads as met', () => {
  it('every counted feature is "too short to measure" on a tweet, and a rate under 150 words is too', () => {
    for (const f of FEATURES) {
      const r = measure(GOOD[0], { observer: 'FEATURE', params: { feature: [f.id], minValue: -1000, maxValue: 1000 } });
      expect(r.verdict, f.id).toBe('NOT_APPLICABLE');
      expect(r.detail, f.id).toMatch(/too short to measure/);
    }
    const longForm: Measurement[] = [
      { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 10 } },
      { observer: 'TERM_RATE', params: { terms: ['but'], minPer1000: 1 } },
      { observer: 'HEDGE_RATE', params: { maxPer1000: 5 } },
      { observer: 'FRAGMENT_SHARE', params: { maxWords: 5, maxShare: 0.3 } },
    ];
    for (const m of longForm) expect(measure(GOOD[0], m).verdict, m.observer).toBe('NOT_APPLICABLE');
  });
});

describe('floors by evidence, not by length, on the discovery path', () => {
  const pieces = (n: number) => GOOD.slice(0, n).map((text, i) => ({ id: `g${i}`, text: `${text} ${text} ${text}` }));
  it('two pieces: a pooled count is read, and is thin', () => {
    const m = deriveMeasuredRules(pieces(2), [], 'MACHINE_DISCOVERED');
    for (const x of m) expect(x.conformance.thin).toEqual({ pieces: 2, more: 3 });
  });
  it('four pieces: what is counted is thin, suggested as a preference, and says how many more would let it block', () => {
    const m = deriveMeasuredRules(pieces(4), [], 'MACHINE_DISCOVERED');
    expect(m.length).toBeGreaterThan(0);
    for (const x of m) {
      expect(x.conformance.thin).toEqual({ pieces: 4, more: 1 });
      const s = suggest(x.requirement, { framings: [], heldOut: null, needs: null, inSample: x.conformance }, 'GENERATE');
      expect(s.materiality).toBe('PREFERRED');
      expect(s.why).toMatch(/read from 4 examples, 1 more would let it block/);
    }
  });
  it('short pieces in discovery: shape bands read from those read, checked on those held out, and required where they hold', () => {
    const read = GOOD.slice(0, 15).map((text, i) => ({ id: `r${i}`, text }));
    const held = GOOD.slice(15).map((text, i) => ({ id: `h${i}`, text }));
    const m = shortFormMeasured(read, held, 'MACHINE_DISCOVERED', { limit: 280, urlChars: 23 });
    const chars = m.find((x) => (x.requirement.measurement?.params.shape as string[] | undefined)?.[0] === 'characters')!;
    expect(chars.conformance).toMatchObject({ applicable: 5, present: 5, independent: true });
    expect(suggest(chars.requirement, { framings: [], heldOut: null, needs: null, inSample: chars.conformance }, 'GENERATE').materiality).toBe('REQUIRED');
    const rates = m.filter((x) => typeof x.requirement.measurement?.params.pooledPerWord === 'number');
    expect(rates.length).toBeGreaterThanOrEqual(3);
    for (const r of rates) expect(suggest(r.requirement, { framings: [], heldOut: null, needs: null, inSample: r.conformance }, 'GENERATE').materiality).toBe('PREFERRED');
  });
});

describe('a long-form standard asked for a short piece', () => {
  const req = (id: string, m: Measurement, provenance: Requirement['provenance'] = 'MACHINE_DISCOVERED'): Requirement => ({ requirementId: id, statement: id, appliesWhen: 'GENERAL', kind: 'GENERATIVE',
    authority: provenance === 'EXPERT_STATED' ? 'EXPERT_AUTHORED' : 'EXPERT_RATIFIED', provenance, evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: 'REQUIRED',
    realizationTolerance: null, outputShape: null, measurement: m });
  const std = [
    req('para', { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 4 } }),
    req('length', { observer: 'LENGTH', params: { unit: ['WORDS'], min: 600, max: 900 } }),
    req('mix', { observer: 'SENTENCE_LENGTH', params: { medianMax: 18, p90Max: 30 } }),
    req('ban', { observer: 'LEXICON', params: { terms: ['delve'] } }),
    req('tells', { observer: 'PATTERN_RATE', params: { pattern: ['MACHINE_TELL'], never: ['EM_DASH'], maxPer1000: 1 } }),
    req('step', { observer: 'SENTENCE_LENGTH', params: { medianMax: 12, p90Max: 20 } }, 'EXPERT_STATED'),
  ];
  it('the counted bands do not apply; the owner\'s steps and every ban are kept; the limit is reported', () => {
    const t = shortFormTransfer(std, { chars: 280, from: 'a post on X' })!;
    expect([...t.doesNotApply.keys()].sort()).toEqual(['length', 'mix', 'para']);
    expect(t.said).toMatch(/at most 280 characters, a post on X/);
    expect(t.note).toMatch(/essential argument.*must survive the compression/);
  });
  it('a long request, or a standard read from short pieces, transfers nothing', () => {
    expect(shortFormTransfer(std, null)).toBeNull();
    expect(shortFormTransfer(std, { chars: 3000, from: 'a LinkedIn post' })).toBeNull();
    expect(shortFormTransfer([...std, req('shape', { observer: 'SHAPE', params: { shape: ['characters'], max: 200 } })], { chars: 280, from: 'x' })).toBeNull();
  });
});

describe('end to end, offline', () => {
  const cli = (cwd: string, data: string, ...a: string[]): { code: number; out: string } => {
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: cwd };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    try { return { code: 0, out: execFileSync('node', [resolve('dist/cli/atelier.mjs'), ...a], { encoding: 'utf8', cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: `${x.stdout}${x.stderr}` }; }
  };
  it('a tweet skill blocks the corporate paragraph and passes the author\'s own held-back tweets', { timeout: 180_000 }, () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-sf-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-sf-proj-'));
    mkdirSync(join(proj, 'tweets'));
    GOOD.slice(0, 15).forEach((t, i) => { writeFileSync(join(proj, 'tweets', `t${String(i).padStart(2, '0')}.md`), `${t}\n`); });
    const b = cli(proj, data, 'new', 'tweets', '--class', 'x-post', '--name', 'tw');
    expect(b.code).toBe(0);
    expect(b.out).toMatch(/Short form: 15 short pieces.*13 shape bands required; 4 rates pooled.*limit 280 characters \(a post on X\)/);
    writeFileSync(join(proj, 'corporate.md'), `${BAD[0].text}\n`);
    const v = cli(proj, data, 'verify', '--skill', 'tw', 'corporate.md', '--claims', 'pattern');
    expect(v.code).toBe(1);
    expect(v.out).toMatch(/486 characters/);
    const held = GOOD.slice(15).filter((t, i) => { writeFileSync(join(proj, `h${i}.md`), `${t}\n`); return cli(proj, data, 'verify', '--skill', 'tw', `h${i}.md`, '--claims', 'pattern').code === 0; });
    expect(held.length).toBeGreaterThanOrEqual(4);
  });
  it('a blog skill checked as a post on X: paragraph bands do not apply, never unverified, and the limit is reported; as a blog post nothing changes', { timeout: 180_000 }, () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-sf-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-sf-proj-'));
    cpSync(resolve('examples/blog/posts'), join(proj, 'posts'), { recursive: true });
    expect(cli(proj, data, 'new', 'posts', '--name', 'blog').code).toBe(0);
    writeFileSync(join(proj, 'tweet.md'), `${GOOD[16]}\n`);
    const out = cli(proj, data, 'verify', '--skill', 'blog', 'tweet.md', '--class', 'x-post', '--claims', 'pattern', '--json');
    const r = JSON.parse(out.out) as { record: { entries: { statement: string; result: string; reason: string }[] }; note?: string };
    const para = r.record.entries.find((e) => e.statement.includes('paragraphs'))!;
    expect(para).toMatchObject({ result: 'NOT_APPLICABLE', reason: 'DOES_NOT_APPLY' });
    expect(r.record.entries.filter((e) => e.result === 'UNVERIFIED' && e.statement.includes('paragraphs'))).toEqual([]);
    expect(r.note).toMatch(/at most 280 characters, a post on X/);
    // The same skill on a piece of its own kind: the band applies as before.
    const own = cli(proj, data, 'verify', '--skill', 'blog', 'posts/post-1.md', '--claims', 'pattern', '--json');
    const ownPara = (JSON.parse(own.out) as { record: { entries: { statement: string; result: string }[] } }).record.entries.find((e) => e.statement.includes('paragraphs'))!;
    expect(ownPara.result).toBe('PASS');
  });
});

describe('short-form checks through the bounded controller', () => {
  const ok = (json: unknown): Promise<never> => Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never);
  const scripted = (): InferenceClient & { calls: number } => { const c = { calls: 0, complete: () => { c.calls += 1; return ok({ replacements: [] }); } }; return c; };
  const rule = (id: string, m: Measurement, materiality: 'REQUIRED' | 'PREFERRED', extra: object = {}) => ({ requirementId: id, statement: id, materiality, authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', provenance: 'MACHINE_DISCOVERED', measurement: m, ...extra });
  const std = (rs: object[]): StandardVersion => ({ standardVersionHash: 's', requirements: rs } as unknown as StandardVersion);
  const chars = rule('len', { observer: 'SHAPE', params: { shape: ['characters'], min: 60, max: 210 } }, 'REQUIRED', { obligation: 'DELIVERABLE' });
  const you = rule('you', { observer: 'FEATURE', params: { feature: ['secondPerson'], pooledPerWord: 0.031, pooledWords: 355 } }, 'PREFERRED');

  it('a SHAPE length miss is an enforced target; a pooled-rate miss is a graded target', async () => {
    const long = await refineToStandard(scripted(), { spentUsd: 0, capUsd: 1 }, 'd', std([chars, you]), BAD[0].text, 2, { graded: 'all', guardClaims: false, controller: { redraft: true } });
    expect(long.repair?.controller?.decisions[0]).toMatchObject({ action: 'redraft', targets: ['len'] });
    const heavy = 'You know your users want you to ship. Your team tells you so, and your plan says you should. You can.';
    const r = await refineToStandard(scripted(), { spentUsd: 0, capUsd: 1 }, 'd', std([chars, you]), heavy, 2, { graded: 'all', guardClaims: false });
    expect(measure(heavy, chars.measurement).verdict).toBe('MET');
    expect(r.repair?.controller?.decisions[0]?.targets).toEqual(['you']);
  });
  it('a long-form band that does not apply to a short output is never a target', async () => {
    const para = rule('para', { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 1 } }, 'REQUIRED');
    const band = rule('neg', { observer: 'FEATURE', params: { feature: ['negation'], minValue: 0, maxValue: 1, pooledPerWord: 0.001, pooledWords: 5000 } }, 'PREFERRED');
    const tweet = GOOD[3];
    const plain = await refineToStandard(scripted(), { spentUsd: 0, capUsd: 1 }, 'd', std([para, band]), tweet, 2, { graded: 'all', guardClaims: false, controller: { redraft: true } });
    expect(plain.repair?.controller?.decisions.flatMap((d) => d.targets)).toContain('para');
    const t = shortFormTransfer(std([para, band]).requirements, { chars: 280, from: 'a post on X' })!;
    expect([...t.doesNotApply.keys()].sort()).toEqual(['neg', 'para']);
    const writer = scripted();
    const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', std([para, band]), tweet, 2, { graded: 'all', guardClaims: false, controller: { redraft: true }, doesNotApply: t.doesNotApply });
    expect(writer.calls).toBe(0);
    expect(r.repair?.controller?.decisions ?? []).toEqual([]);
    expect(r.output).toBe(tweet);
  });
});
