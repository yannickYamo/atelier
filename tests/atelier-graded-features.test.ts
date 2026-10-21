// tests/atelier-graded-features.test.ts — GRADED FEATURES: A REPAIR TARGET THAT IS NEVER A FAILURE, ON BY DEFAULT.
//
// Every FEATURE rule is PREFERRED, so no miss of one ever reached a repair or a note. Now every one of them, and
// every far-out SIGNAL feature of the profile, is a repair target on every run: planned and accepted as an enforced
// rule is, on copies of the report, told to the redraft and to later shape rounds; the recorded report and the
// evaluation never see them as enforced, so the record's state is what it was. `--graded none` turns it off.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gradedRules, withGraded, refineToStandard } from '../core/loop/run-repair.js';
import { decide, type ControllerInput } from '../core/loop/controller.js';
import { signalChecks, signalRules, displacement, SIGNAL_PREFIX } from '../core/loop/graded.js';
import type { FidelityProfile, FeatureBand } from '../core/fidelity/types.js';
import type { InferenceClient } from '../core/inference/client.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import { acceptRepair, regressions, GRADED_STEP } from '../core/loop/repair.js';
import { FEATURE, errorAtLength, LENGTH_DRIFT } from '../core/observers/features.js';
import type { VerifyReport, RuleCheck } from '../core/observers/verify.js';
import * as store from '../core/state/store.js';
import type { GradedRecord, ControllerRecord } from '../core/state/canonical-state.js';
import { expectOneCounter } from './one-counter.js';

const rule = (id: string, feature: string, materiality = 'PREFERRED', extra: Record<string, unknown> = {}) => ({ requirementId: id, statement: `${feature} in range.`, materiality, authority: 'USER_ADOPTED', appliesWhen: 'GENERAL',
  measurement: { observer: 'FEATURE', params: { feature: [feature], minValue: 1, maxValue: 3 } }, ...extra });
const check = (id: string, error: number | undefined, verdict: 'MET' | 'VIOLATED' = 'VIOLATED'): RuleCheck => ({ requirementId: id, statement: id, materiality: 'PREFERRED', enforced: false, observer: 'FEATURE',
  result: { verdict, spans: [], value: 2, detail: '', ...(error === undefined ? {} : { error }) } });
const reportOf = (checked: RuleCheck[]): VerifyReport => ({ skill: 's', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed: false });

describe('which rules are graded, and which checks a pass is pointed at', () => {
  const std = { requirements: [rule('a', 'colon'), rule('b', 'parenthesis'), rule('c', 'parenthesis'), rule('d', 'question', 'REQUIRED'), rule('e', 'italic', 'PREFERRED', { authority: 'EXPERT_REJECTED' }),
    { requirementId: 'f', statement: 'no leverage', materiality: 'REQUIRED', measurement: { observer: 'LEXICON', params: { terms: ['leverage'] } } }] } as never;
  it('nothing without the option; the named features, or all FEATURE rules; never a rejected rule, a REQUIRED one or another observer', () => {
    expect(gradedRules(std, undefined).size).toBe(0);
    expect([...gradedRules(std, ['parenthesis']).entries()]).toEqual([['b', 'parenthesis'], ['c', 'parenthesis']]);
    // d is the owner's REQUIRED feature rule: enforced, never graded
    expect([...gradedRules(std, 'all').keys()]).toEqual(['a', 'b', 'c']);
    expect(gradedRules(std, ['question']).size).toBe(0);
    expect(gradedRules(std, ['nope']).size).toBe(0);
  });
  it('the copy the planner reads has the targets enforced; the report itself is untouched', () => {
    const report = reportOf([check('a', 0.2), check('b', 0.3)]);
    const marked = withGraded(report, new Set(['b']));
    expect(marked.checked.map((c) => c.enforced)).toEqual([false, true]);
    expect(report.checked.map((c) => c.enforced)).toEqual([false, false]);
    expect(withGraded(report, new Set())).toBe(report);
  });
});

describe('acceptance: a graded feature nearer its band is progress; an enforced rule keeps its own terms', () => {
  const graded = (id: string, error: number, spans = 3): RuleCheck => ({ ...check(id, error), enforced: true, result: { verdict: 'VIOLATED', value: 2, detail: '', error, spans: Array.from({ length: spans }, (_, i) => ({ start: i, end: i + 1, text: 'x', why: '' })) } });
  const enforced = (id: string, verdict: 'MET' | 'VIOLATED', spans = 1): RuleCheck => ({ requirementId: id, statement: id, materiality: 'REQUIRED', enforced: true, observer: 'LEXICON',
    result: { verdict, value: null, detail: '', spans: verdict === 'VIOLATED' ? Array.from({ length: spans }, (_, i) => ({ start: i, end: i + 1, text: 'x', why: '' })) : [] } });
  it('|error| 2.0 → 1.2 with the same count of places is accepted, for a graded check', () => {
    const v = acceptRepair(reportOf([graded('g', 2)]), reportOf([graded('g', 1.2)]), { graded: new Set(['g']) });
    expect(v).toMatchObject({ ok: true }); expect(v.why).toMatch(/graded feature\(s\) nearer the band: g 2.0 → 1.2/);
    // under the step it is no progress
    expect(acceptRepair(reportOf([graded('g', 2)]), reportOf([graded('g', 1.95)]), { graded: new Set(['g']) }).ok).toBe(false);
    // an enforced FEATURE rule not named as graded is read by its distance too: nearer by 0.8 width is progress
    expect(acceptRepair(reportOf([graded('g', 2)]), reportOf([graded('g', 1.2)]))).toMatchObject({ ok: true, why: 'feature rule(s) nearer the band: g 2.0 → 1.2' });
  });
  it('the same move with an enforced rule newly broken is refused', () => {
    const v = acceptRepair(reportOf([graded('g', 2), enforced('e', 'MET')]), reportOf([graded('g', 1.2), enforced('e', 'VIOLATED')]), { graded: new Set(['g']) });
    expect(v.ok).toBe(false); expect(v.why).toMatch(/made e worse/);
  });
  it('an enforced rule still broken in as many places is still no progress, graded set or not', () => {
    expect(acceptRepair(reportOf([enforced('e', 'VIOLATED', 2)]), reportOf([enforced('e', 'VIOLATED', 2)])).ok).toBe(false);
    expect(acceptRepair(reportOf([enforced('e', 'VIOLATED', 2)]), reportOf([enforced('e', 'VIOLATED', 2)]), { graded: new Set(['other']) }).ok).toBe(false);
    expect(acceptRepair(reportOf([enforced('e', 'VIOLATED', 2)]), reportOf([enforced('e', 'VIOLATED', 1)])).ok).toBe(true);
  });
});

describe('never worse reads the distance of every FEATURE check, graded or enforced, and never its count of carriers', () => {
  const graded = (id: string, error: number, spans = 3, enforced = true): RuleCheck => ({ ...check(id, error), enforced, result: { verdict: 'VIOLATED', value: 2, detail: '', error, spans: Array.from({ length: spans }, (_, i) => ({ start: i, end: i + 1, text: 'x', why: '' })) } });
  const lex = (id: string, verdict: 'MET' | 'VIOLATED', spans = 1): RuleCheck => ({ requirementId: id, statement: id, materiality: 'REQUIRED', enforced: true, observer: 'LEXICON',
    result: { verdict, value: null, detail: '', spans: verdict === 'VIOLATED' ? Array.from({ length: spans }, (_, i) => ({ start: i, end: i + 1, text: 'x', why: '' })) : [] } });
  const both = new Set(['g1', 'g2']);
  it('g1 2.0 → 1.8 beside g2 1.0 → 3.0, three carriers each, both graded, is refused: the places did not grow, the distance did', () => {
    const before = reportOf([graded('g1', 2.0), graded('g2', 1.0)]); const after = reportOf([graded('g1', 1.8), graded('g2', 3.0)]);
    expect(regressions(before, after)).toEqual(['g2']);
    const v = acceptRepair(before, after, { graded: both });
    expect(v.ok).toBe(false); expect(v.why).toMatch(/made g2 worse/);
  });
  it('a drift under the step is no regression; exactly the step is', () => {
    expect(regressions(reportOf([graded('g2', 1.0)]), reportOf([graded('g2', 1.05)]))).toEqual([]);
    expect(regressions(reportOf([graded('g2', 1.0)]), reportOf([graded('g2', 1.0 + GRADED_STEP)]))).toEqual(['g2']);
    // the sign is the side of the band; the distance is what is read
    expect(regressions(reportOf([graded('g2', -1.0)]), reportOf([graded('g2', -1.3)]))).toEqual(['g2']);
    expect(regressions(reportOf([graded('g2', -1.0)]), reportOf([graded('g2', 0.5)]))).toEqual([]);
  });
  it('every FEATURE check is read by its distance, never by its count of carriers; a steering check a step is not for is never read', () => {
    // |error| up by the step or more is worse, enforced or not (a length drift is taken out first, by readAtLength)
    expect(regressions(reportOf([graded('f', 1.0, 3)]), reportOf([graded('f', 1.15, 3)]))).toEqual(['f']);
    expect(regressions(reportOf([graded('f', 1.0, 3)]), reportOf([graded('f', 3.0, 3)]))).toEqual(['f']);
    expect(regressions(reportOf([graded('f', 1.0, 3, false)]), reportOf([graded('f', 3.0, 3, false)]))).toEqual(['f']);
    // a check the step was not for (a graded feature or a SIGNAL band, on a step for an enforced rule) is never read
    expect(regressions(reportOf([graded('f', 1.0, 3)]), reportOf([graded('f', 3.0, 3)]), { ignore: new Set(['f']) })).toEqual([]);
    expect(regressions(reportOf([{ ...check('f', 0, 'MET'), enforced: false }]), reportOf([graded('f', 3.0, 3, false)]), { ignore: new Set(['f']) })).toEqual([]);
    // two carriers to three at an equal value: a changed carrier distribution is never worse
    expect(regressions(reportOf([graded('f', 1.0, 2)]), reportOf([graded('f', 1.0, 3)]))).toEqual([]);
    expect(regressions(reportOf([graded('f', 1.0, 2, false)]), reportOf([graded('f', 0.8, 3, false)]))).toEqual([]);
    // a FEATURE rule newly VIOLATED still is
    expect(regressions(reportOf([{ ...check('f', 0, 'MET'), enforced: true }]), reportOf([graded('f', 0.3, 1)]))).toEqual(['f']);
    // ignoring another check reads this one as ever
    expect(regressions(reportOf([graded('f', 1.0, 2)]), reportOf([graded('f', 1.5, 3)]), { ignore: new Set(['other']) })).toEqual(['f']);
    // a check with no error keeps the count of places as its measure
    expect(regressions(reportOf([lex('e', 'VIOLATED', 2)]), reportOf([lex('e', 'VIOLATED', 2)]))).toEqual([]);
    expect(regressions(reportOf([lex('e', 'VIOLATED', 2)]), reportOf([lex('e', 'VIOLATED', 3)]))).toEqual(['e']);
    expect(regressions(reportOf([lex('e', 'MET')]), reportOf([lex('e', 'VIOLATED')]))).toEqual(['e']);
  });
  it('a span rule: fewer places is progress, as many is none; a feature rule drifting out beside it is refused, unless the step is not for it', () => {
    expect(acceptRepair(reportOf([lex('e', 'VIOLATED', 2)]), reportOf([lex('e', 'VIOLATED', 1)])).ok).toBe(true);
    expect(acceptRepair(reportOf([lex('e', 'VIOLATED', 2)]), reportOf([lex('e', 'VIOLATED', 2)])).ok).toBe(false);
    const before = reportOf([lex('e', 'VIOLATED', 2), graded('f', 1.0)]); const after = reportOf([lex('e', 'VIOLATED', 1), graded('f', 1.5)]);
    const v = acceptRepair(before, after);
    expect(v.ok).toBe(false); expect(v.why).toMatch(/made f worse/);
    // a feature's carriers are never counted as places: 2 → 1 is the span rule alone
    expect(acceptRepair(before, after, { ignore: new Set(['f']) })).toMatchObject({ ok: true, why: 'places breaking a REQUIRED rule: 2 → 1' });
  });
  it('a graded rate is read at the new length: a shorter text with the count unchanged is no drift; a share or a value is read as it is', () => {
    const colon = { feature: ['colon'], minValue: 2, maxValue: 3 };
    // 3.0 per 1,000 over 1,000 words, the same count over 950 words: 3.158, an error of 0.158, so an after-value of 3.15 is no rise
    expect(errorAtLength(colon, 3.0, 1000, 950)).toBeCloseTo(0.158, 3);
    expect(errorAtLength(colon, 3.0, 1000, 1000)).toBe(0);
    // under the drift the value is read as it is
    expect(errorAtLength(colon, 3.0, 1000, Math.ceil(1000 / (1 + LENGTH_DRIFT)))).toBe(0);
    expect(errorAtLength(colon, 3.0, 1000, 975)).toBeGreaterThan(0);
    // a longer text lowers the rate the same count would show
    expect(errorAtLength(colon, 3.3, 1000, 1100)).toBe(0);
    expect(errorAtLength({ feature: ['question'], minValue: 0.1, maxValue: 0.2 }, 0.25, 1000, 900)).toBeCloseTo(0.5, 3);
    expect(errorAtLength({ feature: ['sentenceP90'], minValue: 20, maxValue: 30 }, 32, 1000, 900)).toBeCloseTo(0.2, 3);
  });
  it('the acceptance names what it counted: graded rules, not REQUIRED, when only graded checks were broken', () => {
    const met = { ...check('g', 0, 'MET'), enforced: true };
    expect(acceptRepair(reportOf([graded('g', 2)]), reportOf([met]), { graded: new Set(['g']) }).why).toBe('graded rules broken: 1 → 0');
    // a feature's carriers are not places: three to two at about the same distance is no progress
    expect(acceptRepair(reportOf([graded('g', 2, 3)]), reportOf([graded('g', 1.95, 2)]), { graded: new Set(['g']) }).why).toBe('the rewrite fixed no graded rule');
    expect(acceptRepair(reportOf([graded('g', 2, 3)]), reportOf([graded('g', 1.95, 3)]), { graded: new Set(['g']) }).why).toBe('the rewrite fixed no graded rule');
    expect(acceptRepair(reportOf([graded('g', 2), lex('e', 'VIOLATED')]), reportOf([met, lex('e', 'VIOLATED')]), { graded: new Set(['g']) }).why).toBe('REQUIRED or graded rules broken: 2 → 1');
    expect(acceptRepair(reportOf([lex('e', 'VIOLATED')]), reportOf([lex('e', 'MET')])).why).toBe('REQUIRED rules broken: 1 → 0');
  });
});

describe('FEATURE misses carry spans for every FEATURE rule; an enforced one is still judged by its distance', () => {
  // A repair needs a target, so a FEATURE miss points at its carriers whatever the rule's materiality. The carriers are
  // where a rewrite starts, never a measure: progress and regression on any FEATURE rule are read by |error|.
  const feature = (error: number, spans: number): RuleCheck => ({ requirementId: 'f', statement: 'f', materiality: 'REQUIRED', enforced: true, observer: 'FEATURE',
    result: { verdict: 'VIOLATED', value: 2, detail: '', error, spans: Array.from({ length: spans }, (_, i) => ({ start: i, end: i + 1, text: 'x', why: '' })) } });
  const met: RuleCheck = { requirementId: 'f', statement: 'f', materiality: 'REQUIRED', enforced: true, observer: 'FEATURE', result: { verdict: 'MET', value: 2, detail: '', error: 0, spans: [] } };
  it('an enforced FEATURE rule nearer its band is progress; fewer carriers further out is a regression, and fewer at the same distance is nothing', () => {
    const v = acceptRepair(reportOf([feature(1.0, 3)]), reportOf([feature(0.6, 2)]));
    expect(v.ok).toBe(true); expect(v.why).toBe('feature rule(s) nearer the band: f 1.0 → 0.6');
    // the reviewer's case: 1.727 widths over three carriers became 3.673 over one
    const worse = acceptRepair(reportOf([feature(1.727, 3)]), reportOf([feature(3.673, 1)]));
    expect(worse.ok).toBe(false); expect(worse.why).toBe('the rewrite made f worse');
    expect(acceptRepair(reportOf([feature(1.0, 3)]), reportOf([feature(1.0, 1)])).ok).toBe(false);
  });
  it('a FEATURE rule newly VIOLATED is still a regression, and the whole pass is refused', () => {
    expect(regressions(reportOf([met]), reportOf([feature(0.3, 1)]))).toEqual(['f']);
    const v = acceptRepair(reportOf([met, { ...met, requirementId: 'e', observer: 'LEXICON', result: { verdict: 'VIOLATED', value: null, detail: '', spans: [{ start: 0, end: 1, text: 'x', why: '' }, { start: 2, end: 3, text: 'x', why: '' }] } }]),
      reportOf([feature(0.3, 1), { ...met, requirementId: 'e', observer: 'LEXICON', result: { verdict: 'VIOLATED', value: null, detail: '', spans: [{ start: 0, end: 1, text: 'x', why: '' }] } }]));
    expect(v.ok).toBe(false); expect(v.why).toMatch(/made f worse/);
  });
});

describe('a graded miss reaches the notes', () => {
  const plain = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
  const aside = 'The rule holds here (as it did last year) and it holds there too (most of the time, at least).';
  const text = Array.from({ length: 8 }, (_, i) => Array.from({ length: 3 }, (_, k) => ((i * 3 + k) % 3 === 0 ? aside : plain)).join(' ')).join('\n\n');
  const r = rule('p1', 'parenthesis'); const params = r.measurement.params;
  const std = { standardVersionHash: 's', requirements: [r] } as never;
  const missed = FEATURE.observe(text, params);
  const report = { failed: false, unchecked: [], conditional: [], checked: [{ requirementId: 'p1', statement: r.statement, materiality: 'PREFERRED', enforced: false, observer: 'FEATURE', result: missed }] } as never;
  it('unmetReader reads nothing of a PREFERRED feature rule without the option, and its miss with the move when graded', async () => {
    const { unmetReader, redraftNote } = await import('../cli/commands/invoke.js');
    expect(unmetReader(std)).toBeNull();
    const [miss] = unmetReader(std, null, ['parenthesis'])?.({ output: text, report }) ?? [];
    expect(miss).toMatchObject({ id: 'p1', statement: 'parenthesis in range.', off: missed.error });
    expect(miss.move).toMatch(/^about [\d.]+ fewer parenthetical asides per 1,000 words$/);
    expect(redraftNote([miss], text)).toContain(miss.move ?? 'x');
    expect(unmetReader(std, null, ['colon'])).toBeNull();
  });
  it('roundMisses carries it too, and the shape note is written from it', async () => {
    const { roundMisses, shapeNote } = await import('../cli/commands/invoke.js');
    expect(roundMisses(std, { output: text, report })).toEqual([]);
    const misses = roundMisses(std, { output: text, report }, 'all');
    expect(misses.map((u) => u.id)).toEqual(['p1']);
    expect(shapeNote(misses)).toContain('fewer parenthetical asides per 1,000 words');
  });
  it('a graded miss is marked, and never told as something the method requires: its block says what your pieces usually do', async () => {
    const { unmetReader, redraftNote, shapeNote, gradedLines } = await import('../cli/commands/invoke.js');
    const [miss] = unmetReader(std, null, ['parenthesis'])?.({ output: text, report }) ?? [];
    expect(miss.graded).toBe(true);
    for (const note of [redraftNote([miss], text), shapeNote([miss])]) {
      expect(note).toContain('did not do what your pieces usually do (each line says which way and about how far):');
      expect(note).not.toMatch(/requires|required\b/);
      expect(note).toContain(`- ${miss.statement} (${miss.detail}; ${miss.move})`);
    }
    // beside an enforced miss, the two are in blocks of their own, and the graded line is distinguishable by its block
    const enforced = { id: 'x7', statement: 'Between 220 and 420 words.', detail: '471 words', off: 51, move: 'about 51 words shorter' };
    const mixed = redraftNote([enforced, miss], text);
    expect(mixed.indexOf('did not hold what this work requires:\n- Between 220')).toBeGreaterThanOrEqual(0);
    expect(mixed.indexOf('did not do what your pieces usually do')).toBeGreaterThan(mixed.indexOf('did not hold what this work requires'));
    expect(gradedLines([enforced, miss])).toEqual([`- ${miss.statement} (${miss.detail}; ${miss.move})`]);
    // an enforced FEATURE rule that is also graded is still the method's
    const r0 = report as unknown as { checked: Record<string, unknown>[] };
    const required = { ...r0, checked: [{ ...r0.checked[0], materiality: 'REQUIRED', enforced: true }] } as never;
    const [hard] = unmetReader(std, null, ['parenthesis'])?.({ output: text, report: required }) ?? [];
    expect(hard.graded).toBeUndefined();
  });
  it('the switch: on by default, and only none turns it off', async () => {
    const { gradedFeatures } = await import('../cli/commands/invoke.js');
    expect(gradedFeatures(undefined)).toBe('all');
    expect(gradedFeatures('none')).toBeUndefined();
    expect(gradedFeatures(' none ')).toBeUndefined();
  });
});

const bandOf = (id: string, band: readonly [number, number], role: FeatureBand['role'] = 'SIGNAL', cls: FeatureBand['cls'] = 'all'): FeatureBand => ({ id, cls, band, median: (band[0] + band[1]) / 2, spread: 1, n: 8, role, auc: 0.9 });
const profileOf = (bands: FeatureBand[]): FidelityProfile => ({ version: 1, corpusHash: 'c', detector: null, hash: 'h', bands });
const plainS = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
const asideS = 'The rule holds here (as it did last year) and it holds there too (most of the time, at least).';
/** eight paragraphs of three sentences; every `every`-th sentence carries two asides */
const pieceOf = (every: number | null): string => Array.from({ length: 8 }, (_, i) => Array.from({ length: 3 }, (_, k) => (every !== null && (i * 3 + k) % every === 0 ? asideS : plainS)).join(' ')).join('\n\n');

describe('the profile\'s SIGNAL features act when far out, as checks of their own', () => {
  const far = pieceOf(3); const near = pieceOf(12);
  it('a SIGNAL feature more than one band width outside is a VIOLATED check with carriers and a signed error; nearer, it is MET with its distance kept', () => {
    const [c] = signalChecks(far, profileOf([bandOf('parenthesis', [1, 3])]));
    expect(c.requirementId).toBe(`${SIGNAL_PREFIX}parenthesis`);
    expect(c).toMatchObject({ feature: 'parenthesis', enforced: false, materiality: null, observer: 'FEATURE', params: { feature: ['parenthesis'], minValue: 1, maxValue: 3 } });
    expect(c.result.verdict).toBe('VIOLATED'); expect(c.result.error ?? 0).toBeGreaterThan(1); expect(c.result.spans.length).toBeGreaterThan(0);
    expect(c.statement).toBe('Keep parenthetical asides where your pieces hold it (1 to 3 per 1,000 words).');
    // the near text runs about 8.5 asides per 1,000 words: outside 1 to 7, by under one width of it
    const [n] = signalChecks(near, profileOf([bandOf('parenthesis', [1, 7])]));
    expect(n.result.verdict).toBe('MET'); expect(n.result.spans).toEqual([]); expect(Math.abs(n.result.error ?? 0)).toBeGreaterThan(0); expect(Math.abs(n.result.error ?? 0)).toBeLessThanOrEqual(1);
  });
  it('a RULE band is the standard\'s, a MONITOR band never acts, an unknown feature is skipped, and no profile means no check', () => {
    expect(signalChecks(far, profileOf([bandOf('parenthesis', [1, 3], 'RULE'), bandOf('colon', [0, 1], 'MONITOR'), bandOf('nope', [0, 1])]))).toEqual([]);
    expect(signalChecks(far, null)).toEqual([]);
    expect([...signalRules(profileOf([bandOf('parenthesis', [1, 3]), bandOf('colon', [0, 1], 'MONITOR'), bandOf('question', [0, 0.1], 'RULE')])).entries()]).toEqual([[`${SIGNAL_PREFIX}parenthesis`, 'parenthesis']]);
  });
  it('a specifics feature below its band is never a miss', () => {
    const [q] = signalChecks(far, profileOf([bandOf('quoted', [20, 30])]));
    expect(q.result.verdict).toBe('MET');
  });
  it('the class band is read for the text\'s length class when it steers', () => {
    const p = profileOf([bandOf('parenthesis', [30, 40]), bandOf('parenthesis', [1, 3], 'SIGNAL', 'medium')]);
    expect(signalChecks(far, p)[0].result.verdict).toBe('VIOLATED');
  });
  it('graded rules take the signal ids beside the standard\'s, under their own prefix', () => {
    const std = { requirements: [rule('a', 'colon')] } as never;
    expect([...gradedRules(std, 'all', profileOf([bandOf('parenthesis', [1, 3])])).entries()]).toEqual([['a', 'colon'], [`${SIGNAL_PREFIX}parenthesis`, 'parenthesis']]);
    expect(gradedRules(std, undefined, profileOf([bandOf('parenthesis', [1, 3])])).size).toBe(0);
  });
  it('the cap of three targets a step is one cap across both sources, the furthest out first', () => {
    // standard FEATURE rules and profile SIGNAL features reach the controller as one list of graded misses
    const miss = (id: string, error: number) => ({ id, error, operatorEffect: null });
    const input: ControllerInput = { enforced: [], claims: 0, length: null, grammar: null, budget: { usdLeft: 1, callsLeft: null }, history: [], observedUsdPerCall: {},
      can: { redraft: true, rewrite: true }, unreachable: new Set(),
      graded: [miss('a', 0.6), miss('b', -0.9), miss(`${SIGNAL_PREFIX}parenthesis`, 1.5), miss(`${SIGNAL_PREFIX}italic`, 1.1), miss(`${SIGNAL_PREFIX}ellipsis`, 2.5)] };
    expect(decide(input)).toMatchObject({ kind: 'act', targets: [`${SIGNAL_PREFIX}ellipsis`, `${SIGNAL_PREFIX}parenthesis`, `${SIGNAL_PREFIX}italic`] });
  });
});

describe('the displacement guard: nothing is steered at the cost of the rest', () => {
  // before: about 34 asides per 1,000 words, outside 0 to 10; fixed: about 8.5, inside it; no colons, no exclamation marks
  const p = profileOf([bandOf('parenthesis', [0, 10]), bandOf('colon', [0, 1]), bandOf('exclamation', [0, 1], 'RULE'), bandOf('ellipsis', [0, 1], 'MONITOR')]);
  const before = pieceOf(3);
  const fixed = pieceOf(12);
  const colons = (t: string): string => t.replace(/ and it holds/g, ': and it holds');
  it('a rewrite that fixes one feature and displaces nothing is accepted', () => {
    const d = displacement(before, fixed, p, new Set(['parenthesis']));
    expect(d).toEqual({ before: 1, after: 0, refusedFor: [] });
  });
  it('a rewrite that fixes one feature and pushes two others out is refused, and says which', () => {
    const d = displacement(before, colons(fixed).replace(/brings to it\./g, 'brings to it!'), p, new Set(['parenthesis']));
    expect(d?.before).toBe(1); expect(d?.after).toBe(2);
    expect(d?.refusedFor[0]).toMatch(/^1 more of your features outside their range \(colons, exclamation marks\)$/);
    expect(d?.refusedFor.slice(1).join(' ')).toMatch(/colons moved from inside your range to [\d.]+ widths outside it/);
  });
  it('as many outside as before, but one nobody was pointed at pushed far out: refused; the same one pointed at: not', () => {
    const d = displacement(before, colons(fixed), p, new Set(['parenthesis']));
    expect(d?.before).toBe(1); expect(d?.after).toBe(1);
    expect(d?.refusedFor).toHaveLength(1); expect(d?.refusedFor[0]).toMatch(/^colons moved from inside your range/);
    expect(displacement(before, colons(fixed), p, new Set(['parenthesis', 'colon']))?.refusedFor).toEqual([]);
  });
  it('a MONITOR band is never counted; without a profile there is no guard', () => {
    const d = displacement(before, fixed.replace(/\. The rule/g, '... The rule'), p, new Set(['parenthesis']));
    expect(d?.refusedFor).toEqual([]);
    expect(displacement(before, fixed, null, new Set())).toBeNull();
  });
});

describe('through the loop: a far-out signal is rewritten on its carriers, recorded from the profile, and the report never carries it', () => {
  const ok = (json: unknown): Promise<never> => Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never);
  const scripted = (answers: readonly unknown[]): InferenceClient & { calls: number } => {
    const c = { calls: 0, complete: () => { const a = answers[Math.min(c.calls++, answers.length - 1)]; return a instanceof Error ? Promise.reject(a) : ok(a); } };
    return c;
  };
  const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
  const far = pieceOf(3);
  const reps = (text: string) => ({ replacements: [1, 2, 3].map((id) => ({ id, text })) });
  it('with a profile whose parenthesis signal is far out, the carriers are rewritten; values say so from the profile; the report has no signal line', async () => {
    const p = profileOf([bandOf('parenthesis', [0, 5]), bandOf('colon', [0, 1])]);
    const writer = scripted([reps(asideS.replace(/[()]/g, ''))]);
    const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', v, far, 2, { graded: 'all', gradedProfile: p, guardClaims: false });
    expect(writer.calls).toBeGreaterThan(0);
    expectOneCounter(r.repair?.controller, writer.calls);
    expect((r.output.match(/\(/g) ?? []).length).toBeLessThan((far.match(/\(/g) ?? []).length);
    expect(r.report.checked.some((c) => c.requirementId.startsWith(SIGNAL_PREFIX))).toBe(false);
    expect(r.report.failed).toBe(false);
    const g = r.repair?.graded;
    expect(g).toMatchObject({ features: ['colon', 'parenthesis'], targeted: 1, repaired: 1, steered: ['parenthesis'] });
    expect(g?.values.parenthesis).toMatchObject({ lo: 0, hi: 5, source: 'profile' });
    expect(g?.values.parenthesis.after).toBeLessThan(g?.values.parenthesis.before ?? 0);
    expect(g?.displacement).toEqual({ before: 1, after: expect.any(Number), refusedFor: [] });
    expect(r.repair?.violatedBefore).toEqual([]); expect(r.repair?.violatedAfter).toEqual([]);
    expect(r.repair?.pairs ?? []).toEqual([]);
  });
  it('a rewrite that fixes the asides and puts the colons outside their band is refused for displacement, and the record says so', async () => {
    // three carriers rewritten with two colons each: about 13 colons per 1,000 words, outside 0 to 8 by under one width,
    // so the colon signal stays MET and never-worse has nothing to read; the count of features outside rises from 1 to 2
    const p = profileOf([bandOf('parenthesis', [0, 5]), bandOf('colon', [0, 8])]);
    const writer = scripted([reps(asideS.replace(/[()]/g, '').replace(/ and it holds/, ': and it holds').replace(/ too /, ': too '))]);
    const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', v, far, 2, { graded: 'all', gradedProfile: p, guardClaims: false });
    expectOneCounter(r.repair?.controller, writer.calls);
    expect(r.output).toBe(far);
    // the steering step's refusal is on its own record; the run's why still says the draft holds every rule
    expect(r.repair?.controller?.decisions.some((d) => d.outcome === 'not kept' && (d.observed.note ?? '').startsWith("it displaced what your pieces hold"))).toBe(true);
    expect(r.repair?.why).toBe('every REQUIRED measured rule now holds');
    expect(r.repair?.graded?.displacement?.refusedFor.length).toBeGreaterThan(0);
    expect(r.repair?.graded?.edits.rejected).toBeGreaterThan(0);
  });
  it('a signal within one width is no target: nothing is asked for, and no record of steering is made', async () => {
    const p = profileOf([bandOf('parenthesis', [0, 5])]);
    const writer = scripted([reps('x')]);
    const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', v, pieceOf(12), 2, { graded: 'all', gradedProfile: p, guardClaims: false });
    expect(writer.calls).toBe(0);
    expectOneCounter(r.repair?.controller, writer.calls);
    expect(r.repair?.graded).toMatchObject({ targeted: 0, steered: [] });
  });
  it('with no profile and no FEATURE rule, nothing is graded and no record is made', async () => {
    const r = await refineToStandard(scripted([reps('x')]), { spentUsd: 0, capUsd: 1 }, 'd', v, pieceOf(12), 2, { graded: 'all', guardClaims: false });
    expect(r.repair).toBeNull();
  });
});

describe('through the binary: a graded miss is repaired on its carriers and leaves the record where it was', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  let backend: ChildProcess; let port = 0;
  const plain = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
  const aside = 'The rule holds here (as it did last year) and it holds there too (most of the time, at least).';
  // Four sentences of eight parentheses in about 470 words: 17 per 1,000 against a band of 2 to 9, about 1.1 band widths
  // out. The controller sizes that to a carrier rewrite of two sentences, which leaves about 8.5 per 1,000, inside the band.
  const draft = Array.from({ length: 8 }, (_, i) => Array.from({ length: 3 }, (_, k) => ((i * 3 + k) % 6 === 0 ? aside : plain)).join(' ')).join('\n\n');
  const rewritten = aside.replace(/[()]/g, '');
  const replacements = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, text: rewritten }));
  let env: NodeJS.ProcessEnv; let data: string; let proj: string;
  const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env });
  const invoke = (...extra: string[]) => JSON.parse(run('invoke', '--skill', 'asides', 'write a note', '--json', '--allow-unsourced', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', ...extra)) as
    { output: string; graded?: GradedRecord; report: string[]; eval: { spend?: { purpose: string; calls: number; usd: number }[]; record?: { state: string; entries: { id: string; required: boolean; result: string }[] } } };
  // the repair calls the backend answered: each span or carrier rewrite, and each draft written again or trimmed
  const repairCalls = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies
    .filter((b) => b.includes('emit_replacements') || b.includes('<earlier-draft>')).length;
  const rewritesSent = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies.filter((b) => b.includes('emit_replacements')).length;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: draft }, emit_replacements: { replacements: replacements(3) } } }) });
    data = mkdtempSync(join(tmpdir(), 'atelier-graded-data-')); proj = mkdtempSync(join(tmpdir(), 'atelier-graded-proj-'));
    env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    run('add', '--statement', 'Few asides in parentheses.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'PREFERRED', '--measure', 'FEATURE:feature=parenthesis,minValue=2,maxValue=9');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'asides');
  });
  afterAll(() => { backend.kill(); });

  it('--graded none: no rewrite is asked for, the draft ships as written, and the JSON has no graded field', async () => {
    const before = await rewritesSent();
    const out = invoke('--graded', 'none');
    expect(await rewritesSent()).toBe(before);
    expectOneCounter((out as { controller?: ControllerRecord }).controller, 0);
    expect(out.output).toBe(draft);
    expect(out.graded).toBeUndefined();
    // nothing required fails on this skill: whatever is left for a person to read, the state is not BLOCKED
    expect(out.eval.record?.state).toMatch(/^(VERIFIED|NEEDS_REVIEW)$/);
  });
  it('--no-repair: the controller never runs, and neither the JSON nor the record carries its steps', async () => {
    const before = await rewritesSent();
    const out = invoke('--no-repair') as { output: string; controller?: unknown };
    expect(await rewritesSent()).toBe(before);
    expect(out.output).toBe(draft);
    expect(out.controller).toBeUndefined();
    const rec = store.listInvocations({ root: data, skillName: 'asides' }).find((r) => r.output === draft);
    expect(rec).toBeDefined(); expect(rec?.repair?.controller).toBeUndefined();
  });
  it('any other value is refused, naming the switch, before anything is spent', () => {
    expect(() => invoke('--graded', 'all')).toThrow(/--graded takes only none/);
    expect(() => invoke('--graded', 'parenthesis')).toThrow(/--graded takes only none/);
  });
  it('with no flag: the carriers are rewritten, the JSON and the record carry graded, and the state is what --graded none gives', async () => {
    const plainRun = invoke('--graded', 'none');
    const before = await rewritesSent(); const sent = await repairCalls();
    const out = invoke();
    expect(await rewritesSent()).toBeGreaterThan(before);
    expectOneCounter((out as { controller?: ControllerRecord }).controller, await repairCalls() - sent);
    expect(out.output).not.toBe(draft);
    expect((out.output.match(/\(/g) ?? []).length).toBeLessThan((draft.match(/\(/g) ?? []).length);
    expect(out.graded).toMatchObject({ features: ['parenthesis'], targeted: 1, repaired: 1, steered: ['parenthesis'] });
    // THE RECORD OF WHAT WAS STEERED: the band reached in one pass, so no draft was written again and no note sent;
    // the rewrites kept; the calls and dollars are the ledger's line for it, not an estimate; the bounds raised.
    const g = out.graded!;
    expect(g.values.parenthesis.source).toBe('standard'); expect(g.displacement).toBeUndefined();
    expect(out.report.join('\n')).toMatch(/^Steered toward your range, never a block: parenthetical asides fewer \([\d.]+ → [\d.]+ per 1,000 words\)\.$/m);
    expect(g.redrafts).toBe(0); expect(g.notes).toEqual([]);
    expect(g.values.parenthesis.before).toBeGreaterThan(9); expect(g.values.parenthesis.after).toBeLessThanOrEqual(9);
    expect(g.values.parenthesis).toMatchObject({ lo: 2, hi: 9 });
    // sized to the miss: two carrier sentences, k = ceil(1.1), and no more
    expect(g.edits.accepted).toBe(2); expect(g.edits.rejected).toBe(0);
    const ctl = (out as { controller?: ControllerRecord }).controller;
    expect(ctl?.decisions.map((d) => [d.action, d.outcome])).toEqual([['carrier-rewrite', 'kept']]);
    expect(ctl?.stoppedBecause).toBe('every enforced rule holds and nothing graded is off');
    expect(ctl?.callsUsed).toBe(g.calls);
    const line = out.eval.spend?.find((l) => l.purpose === 'graded');
    expect(line?.calls).toBe(g.calls); expect(line?.usd).toBe(g.costUsd);
    // the scripted backend reports no token cost, so the dollars are checked against the ledger's line above, not against zero
    expect(g.calls).toBeGreaterThanOrEqual(1);
    expect(g.allowance).toEqual({ calls: 3, usd: 0.4 });
    expect(out.report.join('\n')).toMatch(/graded features .*; 0 draft\(s\) written again for them; \d+ rewrite\(s\) kept, 0 not; \d+ call\(s\), \$[\d.]+, on their account/);
    // the rule stays PREFERRED: never a failure, and the record's state is the unflagged run's
    expect(out.eval.record?.state).toBe(plainRun.eval.record?.state);
    expect(out.eval.record?.state).not.toBe('BLOCKED');
    expect(out.eval.record?.entries.find((e) => e.id === 'x1')?.required).toBe(false);
    const recs = store.listInvocations({ root: data, skillName: 'asides' });
    const graded = recs.find((r) => r.repair?.graded);
    expect(graded?.repair?.graded).toEqual(g);
    expect(graded?.repair?.violatedBefore).toEqual([]);
    expect(graded?.repair?.violatedAfter).toEqual([]);
    // a graded rule the standard does not enforce is no source of its examples
    expect(graded?.repair?.pairs ?? []).toEqual([]);
    // every repair's edits are counted on the record, flag or not
    expect(graded?.repair?.edits).toMatchObject({ accepted: g.edits.accepted, rejected: 0 });
  });
  it('a miss too far for a rewrite: written again first; a redraft that does no better switches to a carrier rewrite, kept when it helps', async () => {
    // eight aside sentences: about 34 per 1,000 against a band of 2 to 9, about 3.6 widths out: over 1.5, so a redraft
    const far = Array.from({ length: 8 }, (_, i) => Array.from({ length: 3 }, (_, k) => ((i * 3 + k) % 3 === 0 ? aside : plain)).join(' ')).join('\n\n');
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: far }, emit_replacements: { replacements: replacements(3) } } }) });
    const before = await rewritesSent(); const sent = await repairCalls();
    const out = invoke();
    // the scripted writer returns the same piece, which is no nearer; the first draft's carriers are then rewritten
    expect(await rewritesSent()).toBeGreaterThan(before);
    expectOneCounter((out as { controller?: ControllerRecord }).controller, await repairCalls() - sent);
    const parens = (t: string): number => (t.match(/\(/g) ?? []).length;
    expect(parens(out.output)).toBeLessThan(parens(far));
    expect(out.graded).toMatchObject({ features: ['parenthesis'], targeted: 1, repaired: 1 });
    // The redraft is the flag's (one draft, counted and charged to it), its directional line is recorded as sent, and it
    // never said "requires".
    const g = out.graded!;
    expect(g.redrafts).toBe(1);
    expect(g.notes).toHaveLength(1); expect(g.notes[0]).toMatch(/^- Few asides in parentheses\. \(parenthetical asides [\d.]+ per 1,000 words; .*about [\d.]+ fewer parenthetical asides per 1,000 words\)$/);
    expect(g.values.parenthesis.after).toBeLessThan(g.values.parenthesis.before ?? 0);
    // THE STEPS, RECONSTRUCTABLE: handed to a redraft, the redraft not kept and why, then the carrier rewrite on the same
    // target, kept, with the switch named; the redrafted piece's own request for another redraft is not on the record
    const ctl = (out as { controller?: ControllerRecord }).controller!;
    expect(ctl.decisions.slice(0, 3).map((d) => [d.action, d.outcome])).toEqual([['redraft', 'handed to a redraft'], ['redraft', 'not kept'], ['carrier-rewrite', 'kept']]);
    expect(ctl.decisions.filter((d) => d.outcome === 'handed to a redraft')).toHaveLength(1);
    expect(ctl.decisions[1].observed.note).toMatch(/one more draft did not do better, so the first is kept/);
    expect(ctl.decisions[1].observed.calls).toBe(1);
    expect(ctl.decisions[2].why).toMatch(/switched to it because redraft on x1 not kept/);
    expect(ctl.decisions.filter((d) => d.action === 'redraft' && d.outcome !== 'handed to a redraft')).toHaveLength(1);
    expect(ctl.callsUsed).toBe(g.calls);
    expect(out.eval.spend?.find((l) => l.purpose === 'graded')?.calls).toBe(g.calls);
    const said = out.report.join('\n');
    expect(said).toContain('your pieces usually do');
    expect(said).not.toContain('the method requires');
    const rec = store.listInvocations({ root: data, skillName: 'asides' }).find((r) => r.repair?.graded?.redrafts === 1);
    expect(rec?.repair?.notes?.join('\n')).toContain('your pieces usually do');
    expect(rec?.repair?.notes?.join('\n')).not.toContain('the method requires');
    expect(rec?.repair?.why).not.toContain('the method requires');
    expect(out.eval.record?.state).not.toBe('BLOCKED');
    expect(out.eval.record?.entries.find((e) => e.id === 'x1')?.required).toBe(false);
  });
});
