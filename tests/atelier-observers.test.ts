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
    const long = `${short} Word ${'word '.repeat(39).trim()}.`;
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
    text: Array.from({ length: 50 }, (_, k) => `Sentence number ${k} of piece ${i} is short.${k % 3 === 2 ? '\n\n' : ' '}`).join('') });
  const read = Array.from({ length: 8 }, (_, i) => piece(i));
  const held = Array.from({ length: 3 }, (_, i) => piece(20 + i));
  const rules = deriveMeasuredRules(read, held, 'MACHINE_DISCOVERED');

  it('proposes sentence, paragraph, hedge and stock-phrase rules with their measurement', () => {
    expect(rules.map((r) => r.requirement.measurement?.observer)).toEqual(['SENTENCE_LENGTH', 'PARAGRAPH_LENGTH', 'HEDGE_RATE', 'LEXICON']);
    for (const r of rules) {
      expect(r.requirement.authority).toBe('DERIVED_UNRATIFIED');
      expect(r.requirement.materiality).toBeNull();
    }
  });
  it('the target is checked on held-out work it was not computed from, and says so', () => {
    for (const r of rules) {
      expect(r.conformance.independent).toBe(true);
      expect(r.conformance.applicable).toBeLessThanOrEqual(held.length);
    }
    expect(deriveMeasuredRules(read, [], 'MACHINE_DISCOVERED')[0].conformance.independent).toBe(false);
  });
  it('the statement quotes the numbers it is checked against', () => {
    const s = rules[0].requirement;
    expect(s.statement).toContain(`under ${s.measurement?.params.medianMax as number} words`);
    expect(s.statement).toContain(`nine in ten under ${s.measurement?.params.p90Max as number}`);
  });
  it('a stock phrase the author DOES use is never proposed as banned', () => {
    const uses = deriveMeasuredRules(read.map((p) => ({ ...p, text: `${p.text} Let's dive in, it goes.` })), held, 'MACHINE_DISCOVERED');
    const lex = uses.find((r) => r.requirement.measurement?.observer === 'LEXICON');
    expect(lex?.requirement.measurement?.params.terms).not.toContain("let's dive in");
  });
  it('suggestions: REQUIRED only on independent evidence; a phrase ban is shown by default; a miss is rejected', () => {
    const r = rules[0].requirement;
    expect(suggest(r, { framings: [], heldOut: null, needs: null, inSample: { applicable: 3, present: 3, independent: true } }, 'GENERATE').materiality).toBe('REQUIRED');
    expect(suggest(r, { framings: [], heldOut: null, needs: null, inSample: { applicable: 8, present: 8, independent: false } }, 'GUARD').materiality).toBe('PREFERRED');
    expect(suggest(rules[3].requirement, { framings: [], heldOut: null, needs: null, inSample: { applicable: 3, present: 3, independent: true } }, 'GUARD').materiality).toBe('PREFERRED');
    expect(suggest(r, { framings: [], heldOut: null, needs: null, inSample: { applicable: 10, present: 3, independent: true } }, 'GUARD').decision).toBe('REJECT');
  });
  it('a too-small corpus proposes nothing measured', () => {
    expect(deriveMeasuredRules([{ id: 'a.md', text: 'One short piece. Only a few sentences. Nothing to count.' }], [], 'MACHINE_DISCOVERED')).toEqual([]);
  });
});

describe('text is read the way a reader reads it', () => {
  it('abbreviations, decimals, URLs and inline code are not sentence breaks; a wrapped paragraph is one paragraph', () => {
    const t = 'Dr. Smith, e.g. on Monday, paid 3.5 dollars at example.com/a.b and ran `obj.method()` here. This\nwraps onto a second line. Done.';
    expect(sentencesOf(t).map((s) => s.words)).toEqual([18, 6, 1]);   // "e.g." and "3.5" count as two words each
    expect(paragraphsOf(t).map((p) => p.sentences)).toEqual([3]);
  });
  it('front matter, fenced code with blank lines, tables and headings are not prose', () => {
    const t = '---\ntitle: x. y.\n---\n# Head\n\n```\na. b.\n\nc. d.\n```\n\n| a. | b. |\n\nOnly this.';
    expect(sentencesOf(t).map((s) => s.text)).toEqual(['Only this.']);
  });
  it('a paragraph right after a heading is still a paragraph', () => {
    expect(paragraphsOf('# Head\nOne. Two. Three.').map((p) => p.sentences)).toEqual([3]);
  });
  it('curly and straight apostrophes match the same banned phrase; inline code is not prose', () => {
    const r = measure('It’s worth noting. Use `leverage()` here.', { observer: 'LEXICON', params: { terms: ["it's worth noting", 'leverage'] } });
    expect(r.spans.map((s) => s.text)).toEqual(['It’s worth noting']);
  });
  it('a substitution table names what to write instead', () => {
    const r = measure('We leverage it.', { observer: 'LEXICON', params: { terms: ['leverage=>use'] } });
    expect(r.spans[0].why).toMatch(/write "use"/);
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
    { requirementId: 'x1', statement: 'Never say delve.', appliesWhen: 'GENERAL', kind: 'BOUNDARY', materiality: 'REQUIRED', authority: 'EXPERT_AUTHORED',
      measurement: { observer: 'LEXICON', params: { terms: ['delve'] } } },
    { requirementId: 'x2', statement: 'Open with a scene.', appliesWhen: 'GENERAL', kind: 'GENERATIVE', materiality: 'REQUIRED', authority: 'EXPERT_AUTHORED' },
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

// ── Found by the Phase 2 gap audit ─────────────────────────────────────────────────────────────
import { decide } from '../core/ratification/authority.js';
import { renderRatifyPage } from '../renderers/ratify-page/render.js';

describe('a measured rule follows its words, and the owner can change its target', () => {
  const measured = { requirementId: 'm1', statement: 'Short sentences.', appliesWhen: 'GENERAL', kind: 'GENERATIVE',
    authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED', evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
    materiality: null, realizationTolerance: null, outputShape: null,
    measurement: { observer: 'SENTENCE_LENGTH', params: { medianMax: 12, p90Max: 20 } } } as unknown as Requirement;
  it('approving keeps the measurement; rewording drops it unless a new one is given', () => {
    expect(decide(measured, { verb: 'APPROVE', materiality: 'REQUIRED' }).requirement.measurement).toBeDefined();
    expect(decide(measured, { verb: 'REWRITE', statement: 'I write in bursts.', materiality: 'REQUIRED' }).requirement.measurement).toBeUndefined();
    const retarget = decide(measured, { verb: 'REWRITE', statement: 'Shorter.', materiality: 'REQUIRED',
      measurement: { observer: 'SENTENCE_LENGTH', params: { medianMax: 10, p90Max: 18 } } }).requirement;
    expect(retarget.measurement?.params.medianMax).toBe(10);
  });
  it('a median above the 90th percentile is refused', () => {
    expect(validateMeasurement({ observer: 'SENTENCE_LENGTH', params: { medianMax: 30, p90Max: 10 } })).toMatch(/cannot exceed/);
  });
});

describe('verify is a gate a pipeline can trust', () => {
  const v = { standardVersionHash: 's', requirements: [
    { requirementId: 'x1', statement: 'Never say delve.', appliesWhen: 'when writing for the board', kind: 'BOUNDARY', materiality: 'REQUIRED',
      authority: 'EXPERT_AUTHORED', measurement: { observer: 'LEXICON', params: { terms: ['delve'] } } },
  ] } as unknown as StandardVersion;
  it('a conditional measured rule is listed, not applied to every text', () => {
    const r = verifyText('demo', v, 'Let us delve in.');
    expect(r.failed).toBe(false);
    expect(r.conditional.map((c) => c.requirementId)).toEqual(['x1']);
  });

  const CLI2 = resolve('dist/cli/atelier.mjs');
  it('exit 2 for "could not check" (no such skill, empty input), never the exit 1 of a broken rule', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-verify2-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-verify2p-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    const code = (...a: string[]): number => { try { execFileSync('node', [CLI2, ...a], { cwd: proj, env, input: '', stdio: ['pipe', 'pipe', 'pipe'] }); return 0; } catch (e) { return (e as { status: number }).status; } };
    expect(code('verify', '--skill', 'nothing-here', '-')).toBe(2);
    writeFileSync(join(proj, 'empty.md'), '   ');
    execFileSync('node', [CLI2, 'add', '--statement', 'x', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--measure', 'LEXICON:delve'], { cwd: proj, env });
    execFileSync('node', [CLI2, 'ratify-close', '--work-type', 'writing'], { cwd: proj, env });
    execFileSync('node', [CLI2, 'build', '--name', 'g'], { cwd: proj, env });
    expect(code('verify', '--skill', 'g', join(proj, 'empty.md'))).toBe(2);
  });
});

describe('the ratify page is auditable', () => {
  it('its rulings carry the suggestion they were shown beside, and the page shows the target', () => {
    const p = { requirementId: 'm1', statement: 's', appliesWhen: 'GENERAL', kind: 'GENERATIVE', evidence: null, wouldBeAbsentIf: null } as unknown as Requirement;
    const html = renderRatifyPage([p], { corpusHash: 'c', workType: 'w', itemCount: 1, heldOutChecked: true,
      suggestions: { m1: { value: 'REQUIRED', why: '3 of 3 held-out pieces meet it', needs: null, measures: 'median sentence ≤ 12 words' } } });
    expect(html).toContain('checked as');
    expect(html).toContain('median sentence ≤ 12 words');
    expect(html).toMatch(/"suggested":'\+JSON\.stringify\(SUGGESTED_FULL\[id\]\)/);
  });
});
