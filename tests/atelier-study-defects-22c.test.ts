// THE DEFECTS THE 2026-10-22c STUDY FOUND, with expected values taken from what each should do:
//   1. a repair's rewrite is held to every rule of the standard a check reads, not only the one it was made for; a rule
//      no check reads in full is named on the step as not read on the rewrite (no pattern stands in for a judgement);
//   2. the copying check leaves out what is form in a structured output: its keys, and the values that recur across the
//      owner's examples or stand in the material, also where the JSON has a paragraph after it;
//   3. a written check reads what its `means` line says, word by word against the step, and the whole step only when
//      its means covers it.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { refineToStandard } from '../core/loop/run-repair.js';
import { observesOf } from '../core/eval/observes.js';
import { overlapIndex, formTokensOut, suppliedWording } from '../core/observers/overlap.js';
import type { Measurement, Requirement, StandardVersion } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

const owner = (o: Partial<Requirement> & { requirementId: string }): Requirement => aRequirement({ provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', ...o });
const check = (fires: string, means: string): Measurement => ({ observer: 'CHECK', params: {
  source: [`(t) => { const i = t.toLowerCase().indexOf(${JSON.stringify(fires)}); return { ok: i < 0, detail: i < 0 ? 'none' : 'found', spans: i < 0 ? [] : [{ start: i, end: i + ${fires.length}, why: 'found' }] }; }`],
  means: [means] } });
const X7 = owner({ requirementId: 'x7', statement: 'Never use the words "fraud", "scam", "liar" or "suspicious".', materiality: 'REQUIRED',
  measurement: { observer: 'LEXICON', params: { terms: ['fraud', 'scam', 'liar', 'suspicious'] } } });
const X6 = "Never speculate about the insured's intent or honesty.";
const DRAFT = "## Decision\n\nThe insured's account is suspicious and may be a scam. Covered under clause 4.2.\n";
const REWRITE = "The insured's account raises a concern that may warrant further verification.";
const std = (...requirements: Requirement[]): StandardVersion => ({ standardVersionHash: 'h', evidenceId: null, requirements } as unknown as StandardVersion);
const repair = (v: StandardVersion) => refineToStandard({ complete: async () => ({ json: { replacements: [{ id: 1, text: REWRITE }] }, cost: 0, inputTokens: 1, outputTokens: 1 }) } as never,
  { spentUsd: 0, capUsd: 1 }, 's', v, DRAFT, 2);
const step = (r: Awaited<ReturnType<typeof repair>>) => r.repair?.controller?.decisions.find((d) => d.action === 'rewrite');

describe('1: the rewrite is held to every rule of the standard, not only the one it fixed', () => {
  it('a rewrite that newly fails another step\'s written check, not yet qualified, is refused', async () => {
    const r = await repair(std(X7, owner({ requirementId: 'x6', statement: X6, materiality: null, obligation: 'DELIVERABLE', measurement: check('concern', "No words about the insured's intent or honesty, or doubt about the account.") })));
    expect(r.output).toBe(DRAFT);
    expect([step(r)?.outcome, step(r)?.observed.note]).toEqual(['not kept', 'the rewrite made x6 worse']);
  });
  it('and one that newly fails another step\'s qualified check', async () => {
    const r = await repair(std(X7, owner({ requirementId: 'x6', statement: X6, materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: check('concern', "No words about the insured's intent or honesty, or doubt about the account.") })));
    expect(r.output).toBe(DRAFT);
    expect(step(r)?.outcome).toBe('not kept');
  });
  it('a step only judgement reads: kept, and the step says it was not read on the rewrite', async () => {
    const r = await repair(std(X7, owner({ requirementId: 'x6', statement: X6, materiality: null, obligation: 'JUDGEMENT' })));
    expect(r.output).toContain(REWRITE);
    expect(step(r)?.outcome).toBe('kept');
    expect(step(r)?.observed.note).toBe('not read on the rewrite by a check, yours to read: x6 (no check reads it)');
  });
  it('a step its check reads only in part: named with the part', async () => {
    const r = await repair(std(X7, owner({ requirementId: 'x6', statement: X6, materiality: null, obligation: 'DELIVERABLE', measurement: check('honesty', "No words about the insured's intent or honesty appear in the text.") })));
    expect(step(r)?.outcome).toBe('kept');
    expect(step(r)?.observed.note).toBe('not read on the rewrite by a check, yours to read: x6 (its check does not read "Never speculate")');
  });
  it('a step a check reads in full, or one the owner accepted as unmeasured, is not named', async () => {
    const full = owner({ requirementId: 'x6', statement: 'No words about honesty.', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: check('honesty', 'No words about honesty.') });
    expect(step(await repair(std(X7, full)))?.observed.note).toBeUndefined();
    const v = { ...std(X7, owner({ requirementId: 'x6', statement: X6, materiality: null, obligation: 'JUDGEMENT' })), acceptedUnmeasured: ['x6'] } as StandardVersion;
    expect(step(await repair(v))?.observed.note).toBeUndefined();
  });
});

const LABELS = resolve(__dirname, '..', 'bench', 'standing', 'domains', 'labels');
const body = (f: string): string => readFileSync(f, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
const examples = readdirSync(join(LABELS, 'examples')).filter((f) => f.endsWith('.md')).sort().map((f) => body(join(LABELS, 'examples', f)));
const material = readdirSync(join(LABELS, 'tasks', 't0')).sort().map((f) => readFileSync(join(LABELS, 'tasks', 't0', f), 'utf8')).join('\n\n');
// The Floor label of the study (t0.r1), the JSON and the paragraph the writer put after it.
const FLOOR = `{
  "clip": "c13",
  "duration": "00:58",
  "overall": "Floor",
  "categories": [
    {
      "category": "Floor – all brands",
      "risk": "Floor",
      "span": null,
      "evidence": "The old brewery, now a museum. They brewed a dark ale here until 1960. The copper is original."
    }
  ]
}

Check to settle: "They brewed a dark ale here until 1960" at 00:22 is a historical mention of brewing in a museum setting, with no drinking described. If a reviewer reads it as an alcohol reference, the label becomes "Alcohol – reference", risk Low, span 00:22–00:30, and overall Low, with Floor – all brands removed.`;
const longest = (out: string, mat: string): number => overlapIndex(examples, suppliedWording(mat))(formTokensOut(out, examples, mat)).longestShared;

describe('2: the copying check leaves out the form of a structured output', () => {
  it('the Floor label with a paragraph after its JSON shares no run of 12 words with an example (the limit is 12)', () => {
    expect(longest(FLOOR, material)).toBeLessThan(12);
  });
  it('the JSON alone, as before', () => {
    expect(longest(FLOOR.slice(0, FLOOR.indexOf('\n\nCheck to settle')), material)).toBeLessThan(12);
  });
  it('a value that recurs across the examples is form, though the material does not hold it and not every example does', () => {
    const label = (cat: string, ev: string): string => JSON.stringify({ clip: 'c1', overall: 'Low', categories: [{ category: cat, risk: 'Low', evidence: ev }] }, null, 2);
    const fixed = 'Gambling – reference to betting odds in sports coverage';
    const pieces = [label(fixed, 'odds of three to one'), label(fixed, 'the bookmaker lists the price'), label('Alcohol – reference', 'a pint at the bar'), label('Violence – minor', 'a shove at the gate')];
    const out = formTokensOut(label(fixed, 'a new line of evidence'), pieces, '');
    expect(out).not.toContain(fixed);
    expect(overlapIndex(pieces)(out).longestShared).toBe(0);
  });
  it('prose that is not JSON is read as it is, and free text inside a value is still counted', () => {
    expect(formTokensOut('Check to settle: the label is Floor.', examples, material)).toBe('Check to settle: the label is Floor.');
    const lifted = JSON.stringify({ clip: 'c9', evidence: 'A second man shoves the first; both fall against the railing' });
    expect(overlapIndex(examples)(formTokensOut(lifted, examples, '')).longestShared).toBeGreaterThanOrEqual(10);
  });
});

describe('3: a written check reads what its means line says', () => {
  const written = (means: string, source = '(t) => ({ ok: true, detail: "", spans: [] })'): Measurement => ({ observer: 'CHECK', params: { source: [source], means: [means] } });
  it('the labels taxonomy check reads the form of a category, not the whole step', () => {
    const o = observesOf('Every category in a label is one of the 39 categories of the taxonomy, written exactly as the taxonomy writes it.',
      written("Each category value in the label's categories array must match one of the taxonomy's 39 names exactly."), false);
    expect(o?.coverage).toBe('PARTIAL');
    expect(o?.unchecked).toContain('written exactly as the taxonomy writes it');
  });
  it('the claims honesty check does not read "speculate"', () => {
    const o = observesOf(X6, written("No words about the insured's intent or honesty appear in the text.",
      '(t) => ({ ok: !/speculat|intent|honest/i.test(t), detail: "", spans: [] })'), false);
    expect(o?.coverage).toBe('PARTIAL');
    expect(o?.unchecked).toBe('Never speculate');
  });
  it('a means that covers every word of the step reads it in full', () => {
    expect(observesOf("A span's end is after its start.", written("Each span's end is after its start."), false)?.coverage).toBe('FULL');
  });
  it('a check with no means line reads an unknown part', () => {
    expect(observesOf('A span ends after it starts.', { observer: 'CHECK', params: { source: ['(t) => ({ ok: true, detail: "", spans: [] })'] } }, false)?.coverage).toBe('PARTIAL');
  });
});
