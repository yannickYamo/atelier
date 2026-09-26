// tests/atelier-observers.test.ts — THE CHECKABLE PART OF A VOICE: FACTS ABOUT TEXT, WITH SPANS.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { measure, sentencesOf, paragraphsOf, validateMeasurement } from '../core/observers/registry.js';
import { deriveMeasuredRules } from '../core/observers/derive.js';
import { verifyText } from '../cli/commands/verify.js';
import { obligationsFor } from '../core/contract/obligation.js';
import { suggest } from '../core/ratification/suggest.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';

describe('the observers return facts, with the span that broke the rule', () => {
  it('LEXICON finds every use, whole words only, and never inside code', () => {
    const text = 'We leverage data.\n\n```\nleverage()\n```\n\nLeveraged is fine. Leverage again.';
    const r = measure(text, { observer: 'LEXICON', params: { terms: ['leverage'] } });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans.map((s) => s.text)).toEqual(['leverage', 'Leverage']);
    expect(text.slice(r.spans[0].start, r.spans[0].end)).toBe('leverage');
  });
  it('SENTENCE_LENGTH reports the median and marks the long sentences', () => {
    const short = 'One two three four. Five six seven. Eight nine ten eleven.';
    const long = `${short} ${'word '.repeat(40).trim()}.`;
    expect(measure(short, { observer: 'SENTENCE_LENGTH', params: { medianMax: 5, p90Max: 10 } }).verdict).toBe('MET');
    const r = measure(long, { observer: 'SENTENCE_LENGTH', params: { medianMax: 5, p90Max: 10 } });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans[0].why).toMatch(/40 words/);
  });
  it('headings are not sentences; list items are', () => {
    expect(sentencesOf('# A heading here\n\n- first item\n- second item').map((s) => s.text)).toEqual(['first item', 'second item']);
  });
  it('PARAGRAPH_LENGTH counts sentences per paragraph and skips lists', () => {
    const text = 'One. Two. Three. Four. Five.\n\n- a\n- b\n- c\n- d\n- e\n- f\n\nShort one.';
    expect(paragraphsOf(text).map((p) => p.sentences)).toEqual([5, 1]);
    expect(measure(text, { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 4 } }).verdict).toBe('VIOLATED');
  });
  it('HEDGE_RATE is not applicable to a scrap of text', () => {
    expect(measure('perhaps maybe', { observer: 'HEDGE_RATE', params: { maxPer1000: 1 } }).verdict).toBe('NOT_APPLICABLE');
  });
  it('a malformed measurement is refused before it is stored', () => {
    expect(validateMeasurement({ observer: 'LEXICON', params: { terms: [] } })).toMatch(/at least one term/);
    expect(validateMeasurement({ observer: 'NOPE' as never, params: {} })).toMatch(/unknown observer/);
  });
});

describe('the measurable part of a voice is counted off the work, and proposed — not decided', () => {
  const piece = (i: number): { id: string; text: string } => ({ id: `p${i}.md`,
    text: Array.from({ length: 16 }, (_, k) => `Sentence number ${k} of piece ${i} is short.${k % 3 === 2 ? '\n\n' : ' '}`).join('') });
  const pieces = Array.from({ length: 10 }, (_, i) => piece(i));
  const rules = deriveMeasuredRules(pieces, 'MACHINE_DISCOVERED');

  it('proposes sentence, paragraph, hedge and stock-phrase rules with their measurement', () => {
    expect(rules.map((r) => r.requirement.measurement?.observer)).toEqual(['SENTENCE_LENGTH', 'PARAGRAPH_LENGTH', 'HEDGE_RATE', 'LEXICON']);
    for (const r of rules) {
      expect(r.requirement.authority).toBe('DERIVED_UNRATIFIED');
      expect(r.requirement.materiality).toBeNull();
    }
  });
  it('the author\'s own pieces meet their own targets', () => {
    for (const r of rules) expect(r.inSample.present).toBe(r.inSample.applicable);
  });
  it('a stock phrase the author DOES use is never proposed as banned', () => {
    const uses = deriveMeasuredRules(pieces.map((p) => ({ ...p, text: `${p.text} Moreover, it works.` })), 'MACHINE_DISCOVERED');
    const lex = uses.find((r) => r.requirement.measurement?.observer === 'LEXICON');
    expect(lex?.requirement.measurement?.params.terms).not.toContain('moreover');
  });
  it('a measured rule most of the corpus meets is suggested REQUIRED; one it does not is rejected', () => {
    const r = rules[0].requirement;
    expect(suggest(r, { framings: [], heldOut: null, needs: null, inSample: { applicable: 10, present: 9 } }, 'GENERATE').materiality).toBe('REQUIRED');
    expect(suggest(r, { framings: [], heldOut: null, needs: null, inSample: { applicable: 10, present: 3 } }, 'GUARD').decision).toBe('REJECT');
  });
  it('a too-small corpus proposes nothing measured', () => {
    expect(deriveMeasuredRules([piece(0)], 'MACHINE_DISCOVERED')).toEqual([]);
  });
});

describe('a measured rule is tested by a count, never by a reader', () => {
  it('it carries a MEASURED obligation, observed deterministically', () => {
    const r = { requirementId: 'x1', statement: 's', appliesWhen: 'GENERAL', kind: 'BOUNDARY', materiality: 'REQUIRED',
      measurement: { observer: 'LEXICON', params: { terms: ['delve'] } } } as unknown as Requirement;
    const m = obligationsFor(r).find((o) => o.kind === 'MEASURED');
    expect(m?.observation).toBe('DETERMINISTIC');
  });
});

describe('verify: any text, held to the standard', () => {
  const v = { standardVersionHash: 's', requirements: [
    { requirementId: 'x1', statement: 'Never say delve.', kind: 'BOUNDARY', materiality: 'REQUIRED', authority: 'EXPERT_AUTHORED',
      measurement: { observer: 'LEXICON', params: { terms: ['delve'] } } },
    { requirementId: 'x2', statement: 'Open with a scene.', kind: 'GENERATIVE', materiality: 'REQUIRED', authority: 'EXPERT_AUTHORED' },
  ] } as unknown as StandardVersion;
  it('fails on a broken REQUIRED rule, with the span, and names what it did not check', () => {
    const r = verifyText('demo', v, 'Let us delve in.');
    expect(r.failed).toBe(true);
    expect(r.checked[0].result.spans[0].text).toBe('delve');
    expect(r.unchecked.map((u) => u.requirementId)).toEqual(['x2']);
    expect(verifyText('demo', v, 'Let us begin.').failed).toBe(false);
  });

  const CLI = resolve('dist/cli/atelier.mjs');
  beforeAll(() => { if (!existsSync(CLI)) throw new Error('build first'); });
  it('through the binary: add --measure, build, verify a file — exit 1 on a broken REQUIRED rule', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-verify-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-verify-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env });
    run('add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage|utilize');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'house');
    writeFileSync(join(proj, 'draft.md'), 'We leverage our data.');
    let code = 0; let out: string;
    try { out = run('verify', '--skill', 'house', join(proj, 'draft.md')); } catch (e) { code = (e as { status: number }).status; out = (e as { stdout: string }).stdout; }
    expect(code).toBe(1);
    expect(out).toMatch(/FAIL {2}x1/);
    expect(out).toMatch(/"leverage"/);
  });
});
