// tests/atelier-phase6.test.ts — PROPORTIONS MEASURED, RULES THAT KEEP THEIR NAMES, AND WRITE-THIS-NOT-THAT.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { measure, validateMeasurement } from '../core/observers/registry.js';
import { lengthMix, mixDistance } from '../core/observers/balance.js';
import { deriveContrastRules } from '../core/observers/contrast.js';
import { contentKey, ruleKey, resolveRule, diffStandards, keysOf, measurementId } from '../core/state/rule-key.js';
import { spanIntegrity } from '../core/loop/integrity.js';
import { planRepair, applyRepair, type Reverted } from '../core/loop/repair.js';
import { checkDraft } from '../core/loop/run-repair.js';
import { toHundredths } from '../core/observers/contrast.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import { decide } from '../core/ratification/authority.js';
import { refineToStandard } from '../core/loop/run-repair.js';
import { selectContrastPairs, contrastFor, renderContrastFile, MAX_PAIRS } from '../core/compiler/contrast-examples.js';
import type { InvocationRecord, Measurement, Requirement, StandardVersion } from '../core/state/canonical-state.js';
import type { InferenceClient } from '../core/inference/client.js';
import * as store from '../core/state/store.js';
import { anInferenceResult, aRequirement } from './fixtures.js';

/** A text of roughly `n` words built from sentences, so the rate observers apply. */
const prose = (sentence: string, n: number): string => Array.from({ length: Math.ceil(n / sentence.split(' ').length) }, () => sentence).join(' ');

describe('TERM_RATE: a floor asks for more, a cap sends only the excess', () => {
  const m = (params: Measurement['params']): Measurement => ({ observer: 'TERM_RATE', params });
  it('a floor on connectives the text barely uses is violated with nothing to point at', () => {
    const r = measure(prose('The team met on Monday and wrote the plan for the quarter.', 200), m({ terms: ['but', 'so'], minPer1000: 4 }));
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans).toEqual([]);
  });
  it('a cap sends only the occurrences over it', () => {
    const text = prose('It is crucial to plan early and review the work with care.', 300);
    const r = measure(text, m({ terms: ['crucial'], maxPer1000: 20 }));
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans.length).toBeGreaterThan(0);
    expect(r.spans.length).toBeLessThan(text.split('crucial').length - 1);
  });
  it('under 150 words is not measured', () => {
    expect(measure('But so but so.', m({ terms: ['but'], minPer1000: 1 })).verdict).toBe('NOT_APPLICABLE');
  });
  it('refuses a malformed target before it is stored', () => {
    expect(validateMeasurement(m({ terms: ['but'], minPer1000: 5, maxPer1000: 2 }))).toMatch(/cannot exceed/);
    expect(validateMeasurement(m({ minPer1000: 5 }))).toMatch(/terms/);
  });
});

describe('RATIO: which of two competing words, as a share', () => {
  const m: Measurement = { observer: 'RATIO', params: { numerator: ['but'], denominator: ['however'], minShare: 0.7 } };
  it('too many of the competing word: those are the spans, only as many as it takes', () => {
    const text = 'However, it rained. However, we went. However, it was cold. But we stayed. However, it cleared.';
    const r = measure(text, m);
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans.every((s) => s.text === 'However')).toBe(true);
    expect(r.spans.length).toBe(3);   // 1 of 5 is "but"; 0.7 × 5 = 3.5 → need 3 more
    expect(r.spans[0].why).toMatch(/write "but" here/);
  });
  it('met, and not applicable on too few uses', () => {
    expect(measure('But it rained. But we went. But it was cold. However, we stayed.', m).verdict).toBe('MET');
    expect(measure('But it rained.', m).verdict).toBe('NOT_APPLICABLE');
  });
  it('shares are checked', () => {
    expect(validateMeasurement({ observer: 'RATIO', params: { numerator: ['a'], denominator: ['b'], minShare: 1.5 } })).toMatch(/between 0 and 1/);
  });
});

describe('DISTRIBUTION: the mix of sentence lengths', () => {
  const edges = [8, 18, 30];
  const long = 'This sentence is written to be rather long so that it lands well inside the third band of lengths here.';
  const short = 'Short one here.';
  it('a text of all long sentences against a mostly short target is violated, pointing at long sentences', () => {
    const text = Array.from({ length: 12 }, () => long).join(' ');
    const r = measure(text, { observer: 'DISTRIBUTION', params: { edges, shares: [0.5, 0.3, 0.15, 0.05], tolerance: 0.2 } });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans.length).toBeGreaterThan(0);
    expect(r.spans[0].why).toMatch(/rewrite it as 8 words or fewer/);
  });
  it('a text matching its own mix meets it', () => {
    const text = [...Array.from({ length: 6 }, () => short), ...Array.from({ length: 6 }, () => long)].join(' ');
    const shares = lengthMix(text, edges).shares;
    expect(mixDistance(shares, shares)).toBe(0);
    expect(measure(text, { observer: 'DISTRIBUTION', params: { edges, shares: shares.map((x) => Math.round(x * 100) / 100), tolerance: 0.1 } }).verdict).toBe('MET');
  });
  it('shares need one more entry than edges', () => {
    expect(validateMeasurement({ observer: 'DISTRIBUTION', params: { edges, shares: [0.5, 0.5], tolerance: 0.1 } })).toMatch(/one more/);
  });
});

describe('the contrast pass proposes a connective floor only where it separates, and the author passes it', () => {
  const author = (i: number): { id: string; text: string } => ({ id: `a${i}.md`,
    text: prose(`We tried it but it broke, so we fixed it, and even then it was just slow. Item ${i} went fine.`, 400) });
  const model = prose('The approach offers a framework for teams to consider as they evaluate their options carefully.', 400);
  it('connectives the author leans on become one floor, met by held-out work and failed by the drafts', () => {
    const read = [0, 1, 2, 3].map(author); const held = [4, 5].map(author);
    const rules = deriveContrastRules(read, held, [model, model, model], 'MACHINE_DISCOVERED');
    const floor = rules.find((r) => r.requirement.measurement?.observer === 'TERM_RATE');
    expect(floor, 'no connective floor proposed').toBeDefined();
    expect(floor!.conformance.present).toBe(floor!.conformance.applicable);
    expect(measure(model, floor!.requirement.measurement!).verdict).toBe('VIOLATED');
  });
  it('nothing is proposed from proportions when the model writes like the author', () => {
    const read = [0, 1, 2, 3].map(author);
    const same = read.map((p) => p.text);
    const rules = deriveContrastRules(read, [], same, 'MACHINE_DISCOVERED');
    expect(rules.filter((r) => ['TERM_RATE', 'RATIO', 'DISTRIBUTION'].includes(r.requirement.measurement!.observer))).toEqual([]);
  });
});

describe('rule keys: a rule keeps its name across versions', () => {
  const capped = (id: string, cap: number): Requirement => aRequirement({ requirementId: id, kind: 'BOUNDARY', statement: 'x',
    measurement: { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: cap } } });
  it('a measured rule is named by what it counts, not by its threshold or its run id', () => {
    const a = capped('c1', 1.5); const b = capped('c7', 0.5);
    expect(contentKey(a)).toBe(contentKey(b));
    expect(contentKey(a)).toMatch(/^R-[0-9a-f]{6}$/);
  });
  it('an unmeasured rule is named by its folded statement', () => {
    const r = (s: string): Requirement => aRequirement({ requirementId: 'p1', statement: s });
    expect(contentKey(r('Lead with the action.'))).toBe(contentKey(r('lead  with the ACTION')));
    expect(contentKey(r('Lead with the action.'))).not.toBe(contentKey(r('Lead with the result.')));
  });
  it('an amendment that rewords the rule keeps its key', () => {
    const r = aRequirement({ requirementId: 'p1', statement: 'Lead with the action.', materiality: 'REQUIRED', realizationTolerance: 'FLEXIBLE' });
    const amended = decide(r, { verb: 'AMEND', statement: 'Open with what to do next.' }).requirement;
    expect(ruleKey(amended)).toBe(ruleKey(r));
    expect(contentKey(amended)).not.toBe(ruleKey(r));
  });
  it('a rule is found by id, by key in any case with or without R-, or by its number', () => {
    const rules = [aRequirement({ requirementId: 'p1', statement: 'One.' }), aRequirement({ requirementId: 'p2', statement: 'Two.' })];
    const k = ruleKey(rules[1]);
    for (const ref of ['p2', k, k.toLowerCase(), k.slice(2), '2', '#2']) expect(resolveRule(rules, ref)).toEqual({ rule: rules[1] });
    expect(resolveRule(rules, '9')).toHaveProperty('error');
  });
  it('the diff between versions says which rule moved, and how', () => {
    const p1 = aRequirement({ requirementId: 'p1', statement: 'Lead with the action.', materiality: 'PREFERRED', realizationTolerance: 'FLEXIBLE' });
    const p2 = aRequirement({ requirementId: 'p2', statement: 'Number the steps.' });
    const amended = decide(p1, { verb: 'AMEND', materiality: 'REQUIRED' }).requirement;
    const v = (rs: Requirement[]): StandardVersion => ({ requirements: rs } as unknown as StandardVersion);
    const d = diffStandards(v([p1, p2]), v([amended, aRequirement({ requirementId: 'p3', statement: 'Cite a source.' })]));
    expect(d.find((c) => c.id === 'p1')).toMatchObject({ change: 'CHANGED' });
    expect(d.find((c) => c.id === 'p1')!.fields).toContain('weight PREFERRED → REQUIRED');
    expect(d.map((c) => c.change).sort()).toEqual(['ADDED', 'CHANGED', 'REMOVED']);
  });
});

describe('write this, not that: pairs from accepted repairs, re-verified, bounded', () => {
  const rule = aRequirement({ requirementId: 'x1', kind: 'BOUNDARY', statement: 'Never say leverage.', materiality: 'REQUIRED',
    measurement: { observer: 'LEXICON', params: { terms: ['leverage=>use'] } } });
  const v = { standardVersionHash: 's', requirements: [rule] } as unknown as StandardVersion;
  it('an accepted repair records the pair under the rule\'s key', async () => {
    const client: InferenceClient = { complete: async () => anInferenceResult({ json: { replacements: [{ id: 1, text: 'We use the data.' }] } }) };
    const out = await refineToStandard(client, { spentUsd: 0, capUsd: 1 }, 'd', v, 'We leverage the data. Then we ship.', 2, { guardClaims: false });
    expect(out.repair?.pairs).toEqual([{ key: ruleKey(rule), check: measurementId(rule.measurement!), before: 'We leverage the data.', after: 'We use the data.' }]);
  });
  const inv = (pairs: { key: string; before: string; after: string; check?: string }[], at: string, input = 'write something'): InvocationRecord =>
    ({ at, input, repair: { pairs } } as unknown as InvocationRecord);
  it('selection keeps pairs that still teach the current standard, newest first, two per rule', () => {
    const k = ruleKey(rule);
    const picked = selectContrastPairs([
      inv([{ key: k, before: 'We leverage A.', after: 'We use A.' }], '2026-01-01'),
      inv([{ key: k, before: 'We leverage B.', after: 'We use B.' }, { key: k, before: 'We leverage C.', after: 'We use C.' }], '2026-02-01'),
      inv([{ key: k, before: 'No banned word here.', after: 'Still fine.' }], '2026-03-01'),       // before never broke it
      inv([{ key: k, before: 'We leverage D.', after: 'We leverage less.' }], '2026-03-02'),      // after still breaks it
      inv([{ key: 'R-000000', before: 'We leverage E.', after: 'We use E.' }], '2026-03-03'),     // no such rule now
    ], v);
    expect(picked.map((p) => p.before)).toEqual(['We leverage B.', 'We leverage C.']);
    expect(picked[0].statement).toBe('Never say leverage.');
  });
  it('a rejected rule\'s pairs never ship, and the total is bounded', () => {
    const rejected = { ...v, requirements: [{ ...rule, authority: 'EXPERT_REJECTED' as const }] } as StandardVersion;
    expect(contrastFor([{ key: ruleKey(rule), before: 'We leverage A.', after: 'We use A.', statement: 's' }], rejected)).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => aRequirement({ requirementId: `x${i}`, statement: `Never say w${i}.`, kind: 'BOUNDARY',
      measurement: { observer: 'LEXICON', params: { terms: [`w${i}`] } } }));
    const vm = { requirements: many } as unknown as StandardVersion;
    const invs = many.map((r, i) => inv([{ key: ruleKey(r), before: `Say w${i} now.`, after: 'Say it now.' }], `2026-01-${String(i + 1).padStart(2, '0')}`));
    expect(selectContrastPairs(invs, vm)).toHaveLength(MAX_PAIRS);
  });
  it('the shipped file shows each pair under its rule', () => {
    const f = renderContrastFile([{ key: ruleKey(rule), before: 'We leverage A.', after: 'We use A.', statement: 'Never say leverage.' }], v);
    expect(f).toContain('## 1. Never say leverage.');
    expect(f).toMatch(/Not this:\n\n> We leverage A\.\n\nThis:\n\n> We use A\./);
  });
});

describe('through the binary', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  const seed = () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p6-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p6-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['pipe', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    return { data, proj, run };
  };
  it('add --measure takes the new observers, and refuses a malformed one', () => {
    const { run } = seed();
    expect(run('add', '--statement', 'Lean on but and so.', '--kind', 'GENERATIVE', '--measure', 'TERM_RATE:terms=but|so,minPer1000=4').code).toBe(0);
    expect(run('add', '--statement', 'But over however.', '--kind', 'GENERATIVE', '--measure', 'RATIO:numerator=but,denominator=however,minShare=0.8').code).toBe(0);
    expect(run('add', '--statement', 'Mix lengths.', '--kind', 'GENERATIVE', '--measure', 'DISTRIBUTION:edges=8/18/30,shares=0.3/0.4/0.2/0.1,tolerance=0.2').code).toBe(0);
    expect(run('add', '--statement', 'Bad.', '--kind', 'GENERATIVE', '--measure', 'DISTRIBUTION:edges=8/18,shares=0.5/0.5,tolerance=0.2').code).not.toBe(0);
    expect(run('add', '--statement', 'Bad.', '--kind', 'GENERATIVE', '--measure', 'RATIO:numerator=but,minShare=0.8').code).not.toBe(0);
  });
  it('plan shows keys; amend takes a rule by number; history names the rule that moved', () => {
    const { data, run } = seed();
    run('add', '--statement', 'Lead with the action.', '--kind', 'GENERATIVE', '--materiality', 'PREFERRED');
    run('add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--materiality', 'PREFERRED', '--measure', 'LEXICON:leverage');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'keys');
    const L = { root: data, skillName: 'keys' };
    const std = () => store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!;
    const key = ruleKey(std().requirements[1]);
    expect(run('plan', '--skill', 'keys').out).toContain(key);
    expect(run('amend', '--skill', 'keys', '--rule', '2', '--materiality', 'REQUIRED', '--reason', 'firm').code).toBe(0);
    expect(ruleKey(std().requirements[1])).toBe(key);
    expect(std().requirements[1].materiality).toBe('REQUIRED');
    expect(run('history', '--skill', 'keys').out).toMatch(new RegExp(`~ ${key} \\w+ {2}Never say leverage\\..*weight PREFERRED → REQUIRED`));
    expect(run('amend', '--skill', 'keys', '--rule', 'R-zzzzzz', '--materiality', 'REQUIRED', '--reason', 'x').out).toContain('no rule "R-zzzzzz"');
  });
  it('build --review writes nothing: not the exemplar, not the class, not the contrast choice', () => {
    const { data, proj, run } = seed();
    run('add', '--statement', 'Lead with the action.', '--kind', 'GENERATIVE');
    run('ratify-close', '--work-type', 'writing');
    const ex = join(proj, 'ex.md'); writeFileSync(ex, 'A piece of mine.');
    expect(run('build', '--name', 'peek', '--review', '--exemplar', ex, '--class', 'blog', '--contrast', 'none').out).toContain('stopping before anything is written');
    expect(existsSync(join(data, 'skills', 'peek'))).toBe(false);
    expect(run('build', '--name', 'peek', '--contrast', 'bogus').code).not.toBe(0);
    run('build', '--name', 'peek', '--exemplar', ex, '--class', 'blog', '--contrast', 'none');
    const L = { root: data, skillName: 'peek' };
    expect(store.getExemplar(L)?.text).toBe('A piece of mine.');
    expect(store.getDocClass(L)).toBe('blog');
    expect(store.getContrast(L).off).toBe(true);
    expect(readFileSync(join(proj, '.claude', 'skills', 'peek', 'SKILL.md'), 'utf8')).not.toContain('Write this, not that');
  });
});

describe('Phase 6 audit: the gaps it found, closed', () => {
  const k = (r: Requirement): string => ruleKey(r);
  const lex = aRequirement({ requirementId: 'x1', kind: 'BOUNDARY', statement: 'Never say leverage.', materiality: 'REQUIRED',
    measurement: { observer: 'LEXICON', params: { terms: ['leverage=>use'] } } });
  const vl = { standardVersionHash: 's', requirements: [lex] } as unknown as StandardVersion;
  const inv = (pairs: { key: string; before: string; after: string; check?: string }[], at: string, input = 'write something'): InvocationRecord =>
    ({ at, input, repair: { pairs } } as unknown as InvocationRecord);

  it('a ratio swap may change the word, never drop the negation it carried', () => {
    expect(spanIntegrity('The plan is not ready.', 'The plan is ready.', new Set(), false, new Set(['is not'])).ok).toBe(false);
    expect(spanIntegrity('The plan is not ready.', "The plan isn't ready.", new Set(), false, new Set(['is not'])).ok).toBe(true);
    const v = { requirements: [aRequirement({ requirementId: 'r1', statement: 'Contract.', materiality: 'REQUIRED',
      measurement: { observer: 'RATIO', params: { numerator: ["isn't"], denominator: ['is not'], minShare: 0.9 } } })] } as unknown as StandardVersion;
    const draft = 'It is not done. It is not ready. It is not safe. It is not over.';
    const targets = planRepair(draft, checkDraft('d', v, draft, { guardClaims: false }));
    expect(targets[0].swaps).toEqual(['is not']);
    expect(targets[0].drops).toEqual([]);
    const reverted: Reverted[] = [];
    applyRepair(draft, targets, targets.map((t) => ({ id: t.id, text: t.text.replace('is not', 'is') })), reverted);
    expect(reverted.length).toBe(targets.length);
  });

  it('pairs written for a held-back task, or quoting a held-back piece, never ship', () => {
    const p = { key: k(lex), before: 'We leverage A.', after: 'We use A.' };
    expect(selectContrastPairs([inv([p], '2026-01-01', 'the reserved task')], vl, { tasks: ['the reserved task'], texts: [] })).toEqual([]);
    expect(selectContrastPairs([inv([p], '2026-01-01')], vl, { tasks: [], texts: ['Intro. We leverage A. More.'] })).toEqual([]);
    expect(selectContrastPairs([inv([p], '2026-01-01')], vl)).toHaveLength(1);
  });

  it('a pair recorded under a different check (an amended threshold or list) no longer ships', () => {
    const p = { key: k(lex), check: 'deadbe', before: 'We leverage A.', after: 'We use A.' };
    expect(selectContrastPairs([inv([p], '2026-01-01')], vl)).toEqual([]);
    expect(selectContrastPairs([inv([{ ...p, check: measurementId(lex.measurement!) }], '2026-01-01')], vl)).toHaveLength(1);
  });

  it('word-counting checks are re-counted on the passage: a ratio pair must reduce the competing word', () => {
    const ratio = aRequirement({ requirementId: 'r1', statement: 'But, not however.', measurement: { observer: 'RATIO', params: { numerator: ['but'], denominator: ['however'], minShare: 0.8 } } });
    const v = { requirements: [ratio] } as unknown as StandardVersion;
    expect(selectContrastPairs([inv([{ key: k(ratio), before: 'However, it held.', after: 'But it held.' }], '2026-01-01')], v)).toHaveLength(1);
    expect(selectContrastPairs([inv([{ key: k(ratio), before: 'However, it held.', after: 'However it held fine.' }], '2026-01-01')], v)).toEqual([]);
  });

  it('two rules with the same content key get distinct keys, and the diff reports a removal as a removal', () => {
    const a = aRequirement({ requirementId: 'm1', statement: 'Short sentences.', measurement: { observer: 'SENTENCE_LENGTH', params: { medianMax: 15, p90Max: 28 } } });
    const b = aRequirement({ requirementId: 'm2', statement: 'Shorter still.', measurement: { observer: 'SENTENCE_LENGTH', params: { medianMax: 12, p90Max: 20 } } });
    const keys = keysOf([a, b]);
    expect(keys[1]).toBe(`${keys[0]}-2`);
    const v = (rs: Requirement[]): StandardVersion => ({ requirements: rs } as unknown as StandardVersion);
    expect(diffStandards(v([a, b]), v([a])).map((c) => c.change)).toEqual(['REMOVED']);
  });

  it('a floor and a cap on the same thing are different rules', () => {
    const floor = aRequirement({ requirementId: 'c1', measurement: { observer: 'PATTERN_RATE', params: { pattern: ['BOLD_SPAN'], minPer1000: 1 } } });
    const cap = aRequirement({ requirementId: 'c2', measurement: { observer: 'PATTERN_RATE', params: { pattern: ['BOLD_SPAN'], maxPer1000: 3 } } });
    expect(contentKey(floor)).not.toBe(contentKey(cap));
  });

  it('a proposed mix never has a negative share, and always sums to one', () => {
    const shares = toHundredths([0.3366, 0.3366, 0.3268, 0]);
    expect(shares.every((x) => x >= 0)).toBe(true);
    expect(Math.round(shares.reduce((a, b) => a + b, 0) * 100)).toBe(100);
    expect(validateMeasurement({ observer: 'DISTRIBUTION', params: { edges: [8, 18, 30], shares: [0.5, 0.5, 0.1, -0.1], tolerance: 0.2 } })).toMatch(/between 0 and 1/);
  });

  it('a mix sends no more sentences to a band than it lacks', () => {
    const mid = 'This sentence is here to sit in the middle band of lengths.';
    const text = Array.from({ length: 10 }, () => mid).join(' ');
    const r = measure(text, { observer: 'DISTRIBUTION', params: { edges: [8, 18, 30], shares: [0.3, 0.4, 0.2, 0.1], tolerance: 0.1 } });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans.length).toBe(3);
  });

  it('"it is not" is one use, not one of each side', () => {
    const r = measure("It is not done. It's fine. It is not ready. Don't go.", { observer: 'RATIO', params: { numerator: ["it's", "don't", "isn't"], denominator: ['it is', 'do not', 'is not'], minShare: 0.9 } });
    expect(r.detail).toMatch(/50% of 4 uses/);
    expect(r.spans[0].why).toMatch(/write "isn't" here/);
  });

  it('the contrast pass proposes a ratio only where most drafts fail it, and drops one the author\'s held-out work fails', () => {
    const author = (i: number, word: string): { id: string; text: string } => ({ id: `a${i}.md`,
      text: prose(`We shipped it ${word} the tests were thin. We fixed that ${word} kept going. Piece ${i} ends here.`, 300) });
    const model = prose('We shipped it; however, the tests were thin. We fixed that; however, we kept going.', 300);
    const read = [0, 1, 2, 3].map((i) => author(i, 'but'));
    const ratios = (held: { id: string; text: string }[]) => deriveContrastRules(read, held, [model, model, model], 'MACHINE_DISCOVERED')
      .filter((r) => r.requirement.measurement?.observer === 'RATIO');
    expect(ratios([4, 5].map((i) => author(i, 'but')))).toHaveLength(1);
    expect(ratios([4, 5].map((i) => author(i, 'however')))).toEqual([]);
  });

  it('a candidate carries the pairs its source version served, through the package, not the store', () => {
    const v = { standardVersionHash: 's', evidenceId: 'e', workType: 'writing', requirements: [{ ...lex, authority: 'EXPERT_RATIFIED' }] } as unknown as StandardVersion;
    const pairs = [{ key: k(lex), before: 'We leverage A.', after: 'We use A.', statement: lex.statement }];
    const pkg = renderAgentSkill(v, compileArchitecture(v), 'demo', 'd', null, pairs);
    expect(JSON.parse(pkg.assurance['contrast-pairs.json'])).toEqual(pairs);
    expect(pkg.files['examples/contrast.md']).toContain('model-written');
    expect(pkg.packageHash).toBe(renderAgentSkill(v, compileArchitecture(v), 'demo', 'd', null, pairs).packageHash);
  });
});

describe('carriedFrom reads the source version\'s package, and honours --contrast none', () => {
  it('pairs and exemplar come from the version rebuilt from; a rule no longer taught drops its pair', async () => {
    const { carriedFrom } = await import('../cli/runtime.js');
    const root = mkdtempSync(join(tmpdir(), 'atelier-p6-carry-'));
    const L = { root, skillName: 'carry' };
    const lex = aRequirement({ requirementId: 'x1', kind: 'BOUNDARY', statement: 'Never say leverage.', authority: 'EXPERT_RATIFIED',
      measurement: { observer: 'LEXICON', params: { terms: ['leverage=>use'] } } });
    const v = { standardVersionHash: 's1', evidenceId: 'e', workType: 'writing', requirements: [lex] } as unknown as StandardVersion;
    const pairs = [{ key: ruleKey(lex), before: 'We leverage A.', after: 'We use A.', statement: lex.statement }];
    const pkg = renderAgentSkill(v, compileArchitecture(v), 'carry', 'd', { text: 'My piece.' }, pairs);
    store.putPackage(L, pkg);
    store.putSkillVersion(L, { skillVersionHash: 'sv1', skillName: 'carry', standardVersionHash: 's1', architectureHash: 'a',
      materializedHash: pkg.packageHash, builtAt: '2026-01-01', description: 'd' } as Parameters<typeof store.putSkillVersion>[1]);
    // The store's own exemplar has since changed: the candidate must not pick that up.
    store.setExemplar(L, 'A later piece.');
    const carried = carriedFrom(L, 'sv1', v);
    expect(carried.exemplar?.text).toBe('My piece.');
    expect(carried.contrast).toEqual(pairs);
    const rejected = { ...v, requirements: [{ ...lex, authority: 'EXPERT_REJECTED' as const }] } as StandardVersion;
    expect(carriedFrom(L, 'sv1', rejected).contrast).toEqual([]);
    store.setContrast(L, { off: true, pairs: [] });
    expect(carriedFrom(L, 'sv1', v).contrast).toEqual([]);
  });
});
