// tests/atelier-invariants.test.ts — THE EIGHT THINGS THAT MUST STAY TRUE, WHATEVER IS BUILT NEXT.
//
// Each of these was broken at least once by a feature that was right on its own terms: a check that read half a
// rule and ticked the whole of it, a rule the owner stated set aside because their examples ran longer, a request
// for 400 words answered with 187 and called checked. They are stated here as properties of the product, not as
// cases: a test below fails for any new feature that breaks one, in whatever part of the code it does so.
//
// THIS FILE IS FROZEN. A test here changes only when the owner changes what the product promises. A new bug becomes
// a test of the parser or the observer it was in; it does not become a new case here.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { judge, entry, stateOf, recordOf, blocks, partlyChecked, type Coverage, type Qualification, type Observed, type Entry } from '../core/eval/record.js';
import { buildRecord, type RecordFacts, type CheckedLine } from '../core/eval/record-build.js';
import { observesOf } from '../core/eval/observes.js';
import { renderRunCard, stateLine } from '../core/eval/run-card.js';
import { renderPanel, type EvalSummary } from '../core/eval/summary.js';
import { methodProposals, acrossExamples, proposalsAcross } from '../core/method/standard.js';
import { enforceClaims, checkDraft } from '../core/loop/run-repair.js';
import { describeVerify } from '../core/observers/verify.js';
import type { ClaimSensor, ClaimReading } from '../core/loop/claim-extract.js';
import { statedLength, notHeldBecause } from '../core/intake/length.js';
import { recordForText } from '../cli/eval-run.js';
import * as store from '../core/state/store.js';
import type { InvocationRecord, StandardVersion, Requirement } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

const COVERAGES: Coverage[] = ['FULL', 'PARTIAL', 'NONE'];
const QUALS: Qualification[] = ['DETERMINISTIC', 'QUALIFIED', 'UNQUALIFIED', 'UNAVAILABLE'];
const VERDICTS: Observed['verdict'][] = ['MET', 'VIOLATED', null];
const APPLIES: Observed['applies'][] = [true, false, { setAside: 'for this run' }, { replacedBy: 'the request' }];
/** Every combination of what can be observed of a requirement. */
const EVERY: Observed[] = APPLIES.flatMap((applies) => VERDICTS.flatMap((verdict) => COVERAGES.flatMap((coverage) => QUALS.map((qualification) => ({ applies, verdict, coverage, qualification })))));

const stated = (id: string, statement: string, measurement: Requirement['measurement'], o: Partial<Requirement> = {}): Requirement =>
  aRequirement({ requirementId: id, statement, provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', ...(measurement ? { measurement } : {}), ...o });
const facts = (o: Partial<RecordFacts> & { requirements: readonly Requirement[] }): RecordFacts => ({ checked: [], waived: new Map(), request: null, claims: null, copying: null, ...o });
const line = (id: string, verdict: CheckedLine['verdict'], detail = 'found'): CheckedLine => ({ id, required: true, verdict, detail });
const PARTIES = stated('x1', 'Open with a Parties section that names both parties exactly as they appear in the term sheet.', { observer: 'PRESENCE', params: { sections: ['Parties'], body: 1, opens: 1 } });
const LENGTH = stated('x2', 'Keep the whole piece between 150 and 230 words.', { observer: 'LENGTH', params: { unit: ['words'], min: 150, max: 230 } });

describe('1 · automation never mutates owner authority', () => {
  const piece = (words: number): string => `## Summary\n${Array.from({ length: words }, (_, i) => `w${i}`).join(' ')}.\n`;
  const NOTE = '- Keep the whole piece between 150 and 230 words.\n- Open with a Summary section.\n';
  it('a rule the owner stated keeps its check when every one of their examples breaks it', () => {
    const cases = [300, 320, 340].map((n, i) => ({ id: `e${i + 1}.md`, task: 'Explain it.', material: [], reference: piece(n) }));
    const rule = proposalsAcross(NOTE, cases).proposals.find((p) => p.statement.startsWith('Keep the whole piece'));
    expect(rule).toMatchObject({ origin: 'STATED', obligation: 'DELIVERABLE', measurement: { observer: 'LENGTH', params: { min: 150, max: 230 } } });
    expect(rule?.conflict).toMatch(/^3 of your examples do not do this: /);
  });
  it('no stated step is ever dropped, or loses its check, by being held against more examples', () => {
    const lead = { id: 'a.md', task: 'Explain it.', material: [], reference: piece(200) };
    const before = methodProposals(NOTE, lead).filter((p) => p.origin === 'STATED');
    const after = acrossExamples(methodProposals(NOTE, lead), [{ id: 'b.md', task: 't', material: [], reference: '## Other\nfour words in all.\n' }], 'a.md').filter((p) => p.origin === 'STATED');
    expect(after.map((p) => [p.statement, p.measurement])).toEqual(before.map((p) => [p.statement, p.measurement]));
  });
  it('a stated step its examples break is built with its check, is the owner\'s in every record, and blocks once they confirm it', async () => {
    const { decideSteps } = await import('../cli/commands/method.js');
    const cases = [300, 320].map((n, i) => ({ id: `e${i + 1}.md`, task: 'Explain it.', material: [], reference: piece(n) }));
    const built = (confirmed: boolean): Requirement => { let n = 0; return decideSteps(proposalsAcross(NOTE, cases).proposals, () => `x${(n += 1)}`, confirmed).decided.find((r) => r.statement.startsWith('Keep the whole piece'))!; };
    // never dropped, never without its check, never a habit: before the owner confirms it, and after
    for (const r of [built(false), built(true)]) {
      expect(r).toMatchObject({ authority: 'EXPERT_AUTHORED', measurement: { observer: 'LENGTH', params: { min: 150, max: 230 } } });
      const e = buildRecord(facts({ requirements: [r], checked: [{ ...line(r.requirementId, 'VIOLATED', '300 words'), required: r.materiality === 'REQUIRED' }] })).entries[0];
      expect(e).toMatchObject({ dimension: 'STANDARD', source: 'METHOD', required: true });
    }
    // a reading the owner's own work contradicts blocks nothing until they confirm it; confirmed, it blocks
    const state = (r: Requirement): string => buildRecord(facts({ requirements: [r], checked: [{ ...line(r.requirementId, 'VIOLATED', '300 words'), required: r.materiality === 'REQUIRED' }] })).state;
    expect(built(false).contested).toMatch(/of your examples do not do this/);
    expect(state(built(false))).toBe('NEEDS_REVIEW');
    expect(built(true)).toMatchObject({ materiality: 'REQUIRED' });
    expect(built(true).contested).toBeUndefined();
    expect(state(built(true))).toBe('BLOCKED');
  });
  it('whether a rule is required is the same going into the record and coming out, whatever was observed of it', () => {
    for (const required of [true, false]) for (const o of EVERY) {
      const e = entry({ id: 'r', dimension: 'STANDARD', source: 'METHOD', statement: 's', required, observation: { proposition: 'p', coverage: o.coverage, qualification: o.qualification, evidence: null }, applies: o.applies, verdict: o.verdict });
      expect(e.required).toBe(required);
    }
  });
  it('a rule with no check is still the owner\'s: it is in the record, required, and left to them', () => {
    const r = buildRecord(facts({ requirements: [aRequirement({ requirementId: 'j1', statement: 'Weigh the risk before the style.', obligation: 'JUDGEMENT' })] }));
    expect(r.entries).toEqual([expect.objectContaining({ id: 'j1', required: true, result: 'UNVERIFIED', reason: 'NOT_MACHINE_CHECKABLE' })]);
    expect(r.state).toBe('NEEDS_REVIEW');
  });
});

describe('2 · example suggestions never block before adoption', () => {
  const habit = aRequirement({ requirementId: 'h1', statement: 'Paragraphs of at most 4 sentences.', materiality: 'PREFERRED', wordedFromCheck: true, measurement: { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 4 } } });
  it('a habit read from the examples and broken by the output blocks nothing', () => {
    const r = buildRecord(facts({ requirements: [LENGTH, habit], checked: [line('x2', 'MET', '200 words'), { ...line('h1', 'VIOLATED'), required: false }] }));
    expect(r.entries.find((e) => e.id === 'h1')).toMatchObject({ dimension: 'HABIT', required: false, result: 'FAIL' });
    expect(r.state).toBe('VERIFIED');
  });
  it('no entry that is not required ever blocks or holds a run for review, whatever was observed', () => {
    for (const o of EVERY) {
      const e = entry({ id: 'h', dimension: 'HABIT', source: 'EXAMPLE', statement: 's', required: false, observation: { proposition: 'p', coverage: o.coverage, qualification: o.qualification, evidence: null }, applies: o.applies, verdict: o.verdict });
      expect(stateOf([e])).toBe('VERIFIED');
    }
  });
  it('what only some examples show is never built as a rule', () => {
    const withRisks = { id: 'a.md', task: 't', material: [], reference: '## Summary\nSomething here.\n\n## Risks\nNone seen.\n\n## Rollback\nRevert it.\n' };
    const lead = methodProposals('- Open with a Summary section.\n', withRisks);
    expect(lead.some((p) => p.origin === 'SHOWN_BY_EXAMPLE')).toBe(true);
    expect(acrossExamples(lead, [{ id: 'b.md', task: 't', material: [], reference: '## Summary\nSomething else.\n' }]).some((p) => p.origin === 'SHOWN_BY_EXAMPLE')).toBe(false);
  });
});

describe('3 · a partial observation never passes', () => {
  it('nothing short of the whole rule, read by an observer that can be believed, and held, is a pass', () => {
    for (const o of EVERY) {
      const whole = o.applies === true && o.verdict === 'MET' && o.coverage === 'FULL' && (o.qualification === 'DETERMINISTIC' || o.qualification === 'QUALIFIED');
      expect(judge(o).result === 'PASS', JSON.stringify(o)).toBe(whole);
    }
  });
  it('a check that reads half of the owner\'s sentence leaves the rule unverified when that half holds, and names the other half', () => {
    const r = buildRecord(facts({ requirements: [PARTIES], checked: [line('x1', 'MET')] }));
    expect(r.entries[0]).toMatchObject({ result: 'UNVERIFIED', reason: 'PARTLY_CHECKED', observation: { coverage: 'PARTIAL', unchecked: 'names both parties exactly as they appear in the term sheet' } });
    expect(r.state).toBe('NEEDS_REVIEW');
    // and the half it did read still fails the rule when it fails
    expect(buildRecord(facts({ requirements: [PARTIES], checked: [line('x1', 'VIOLATED')] })).state).toBe('BLOCKED');
  });
  it('a rule in the owner\'s words is covered in full only when every word of it is the check\'s', () => {
    const cover = (s: string, m: NonNullable<Requirement['measurement']>): string => observesOf(s, m, false)?.coverage ?? 'NONE';
    const length = { observer: 'LENGTH', params: { unit: ['words'], min: 150, max: 230 } } as const;
    expect(cover('Keep the whole piece between 150 and 230 words.', length)).toBe('FULL');
    expect(cover('Between 150 and 230 words, and every paragraph earns its place.', length)).toBe('PARTIAL');
    expect(cover('Never use the word "excited".', { observer: 'LEXICON', params: { terms: ['excited'] } })).toBe('FULL');
    expect(cover('Never use the word "excited" about a competitor.', { observer: 'LEXICON', params: { terms: ['excited'] } })).toBe('PARTIAL');
    // a check against the material reads less than any sentence about sourcing says
    expect(cover('Cite each item as path:line.', { observer: 'LINES', params: { min: 0 } })).toBe('PARTIAL');
    expect(cover('Every figure must be sourced.', { observer: 'CITED', params: { allow: 0 } })).toBe('PARTIAL');
    // a word this reading does not know costs the tick: it never grants one
    expect(cover('Keep the whole piece between 150 and 230 words, zxqv.', length)).toBe('PARTIAL');
  });
  it('a word of place, order, count or choice is the check\'s only where the check holds it', () => {
    // Each of these was once read in full. Through the real readers: where a step becomes a check at all, a check
    // that reads less than the step says never covers it.
    const example = { task: null, material: [], reference: '## Summary\n\nOne two three four five.\n\n## Risks\n\nNone seen here.\n\n## Verdict\n\nApprove\n\n## Sources\n\nA list.\n\n| Vendor | Price |\n|---|---|\n| a | 1 |\n' };
    const read = (step: string): string => { const p = methodProposals(`- ${step}\n`, example)[0]; return p.measurement ? observesOf(p.statement, p.measurement, false)?.coverage ?? 'NONE' : 'JUDGEMENT'; };
    for (const step of ['Include a Sources section at the end.', 'Include a Summary section first.', 'Add a Sources section last.', 'Open with a Summary section, one paragraph.', 'Finish with a Sources section, one line.',
      'Include a Verdict section that holds exactly one sentence.', 'Include a Risks section after the opening paragraph.', 'Include a Summary section under the first heading.', 'Write a Summary section in one sentence.',
      'Add a table with at least 5 rows and the columns Vendor and Price.', 'Include a Risks section with 3 risks.', 'Include a Risks section and a Summary section, Summary first.',
      'Include a table with the columns Vendor and Price, one row for each vendor.', 'Include a table with the columns Vendor and Price in the Risks section.', 'The last paragraph starts with "In short," and is one sentence.',
      'Include one Risks section.']) expect(read(step), step).toBe('PARTIAL');
    // and a step about a part of the work, or about every section, is not read as a rule on the whole of it
    for (const step of ['Keep sentences under 25 words.', 'No more than 25 words a sentence.', 'Sentences run under 30 words.', 'The last sentence starts with "In short,".', 'Each section starts with a Summary line.',
      'Start every section with a heading called Summary.', 'Open each section with a Summary heading.', 'Keep the first sentence under 20 words.', 'Keep the lede under 40 words.', 'Keep the meta description under 160 characters.',
      'Lines under 100 characters.']) expect(read(step), step).toBe('JUDGEMENT');
    // what the check does hold is still read in full
    for (const step of ['Open with a Summary section.', 'End with a Sources section.', 'Open with a Summary section, then a Risks section, then a Verdict section.', 'Include a table with the columns Vendor and Price.',
      'Keep the whole piece between 150 and 230 words.', 'No sentence is longer than 25 words.', 'At least 5 sentences.', 'The Summary section is under 80 words.', 'The last paragraph starts with "In short,".']) expect(read(step), step).toBe('FULL');
  });
  it('a sentence a person or a model wrote is never taken for its check: only what the machine worded from the check is', () => {
    const lexicon = { observer: 'LEXICON', params: { terms: ['in conclusion'] } } as const;
    const modelWorded = aRequirement({ requirementId: 'c4', statement: 'Each essay opens on a concrete scene and returns to it in the last line.', provenance: 'MACHINE_DISCOVERED', materiality: 'REQUIRED', measurement: lexicon });
    expect(buildRecord(facts({ requirements: [modelWorded], checked: [line('c4', 'MET')] })).entries[0]).toMatchObject({ result: 'UNVERIFIED', reason: 'PARTLY_CHECKED' });
    expect(buildRecord(facts({ requirements: [{ ...modelWorded, statement: 'Never write "in conclusion".', wordedFromCheck: true }], checked: [line('c4', 'MET')] })).entries[0]).toMatchObject({ result: 'PASS' });
  });
  it('a rule whose check had no material to read against was not checked', () => {
    const cited = stated('x3', 'Every figure is one the material gives.', { observer: 'CITED', params: { allow: 0 } }, { obligation: 'EXECUTION', provenance: 'MACHINE_DISCOVERED', wordedFromCheck: true });
    const r = buildRecord(facts({ requirements: [cited], checked: [line('x3', 'NOT_APPLICABLE', 'no material is bound')] }));
    expect(r.entries[0]).toMatchObject({ result: 'UNVERIFIED', reason: 'NOT_MACHINE_CHECKABLE' });
  });
});

describe('4 · an unqualified reader never blocks', () => {
  it('no observation by a reader that has not earned belief is ever a failure', () => {
    for (const o of EVERY) if (o.qualification === 'UNQUALIFIED' || o.qualification === 'UNAVAILABLE') expect(judge(o).result, JSON.stringify(o)).not.toBe('FAIL');
  });
  const claims = { state: 'checked' as const, bound: true, delivered: 3, open: 0, cut: 0 };
  it('specifics the reader could not find block only where the reader was measured on this kind of work', () => {
    expect(buildRecord(facts({ requirements: [], claims: { ...claims, qualified: true, why: null } })).state).toBe('BLOCKED');
    const unmeasured = buildRecord(facts({ requirements: [], claims: { ...claims, qualified: false, why: 'the claim check is not measured on analysis' } }));
    expect(unmeasured.state).toBe('NEEDS_REVIEW');
    expect(unmeasured.entries[0]).toMatchObject({ result: 'UNVERIFIED', reason: 'OBSERVER_UNQUALIFIED' });
  });
  it('a run of words shared with an example blocks only where standard wording could be told from a lifted passage', () => {
    const shared = { longest: 16, limit: 12 };
    expect(buildRecord(facts({ requirements: [], copying: { ...shared, tellable: true } })).state).toBe('BLOCKED');
    expect(buildRecord(facts({ requirements: [], copying: { ...shared, tellable: false } })).state).toBe('NEEDS_REVIEW');
  });
  it('the most a piece may share with one example is what the author\'s own examples share with one another', async () => {
    const { sharedAmong } = await import('../core/observers/overlap.js'); const { copyLimit, COPY_LIMIT } = await import('../cli/eval-run.js');
    const clause = 'the receiving party shall hold the confidential information in strict confidence and shall not disclose it to any third party without consent';
    const ESSAYS = ['Rivers bend where the ground gives way, and maps are drawn after the fact by people who walked it.', 'A kitchen runs on timing: salt early, heat late, rest longer than feels reasonable before anyone cuts.', 'Tide tables lie a little in every harbour because wind moves water that no almanac was told about.',
      'Old bridges fail at their bearings first, quietly, years before a crack shows anywhere a driver looks.', 'Most budgets die in March when the forecast meets an invoice nobody remembered to schedule properly.'];
    const essay = (i: number): string => ESSAYS[i - 1];
    // pieces that share a clause two at a time, as drafted work does: the limit follows them
    const drafted = [`First. ${clause}. Alpha ends here.`, `Second, differently. ${clause}. Beta ends there.`, essay(3), essay(4)];
    expect(sharedAmong(drafted)).toBeGreaterThanOrEqual(20);
    expect(copyLimit({ sharedAmong: sharedAmong(drafted)! })).toBe(sharedAmong(drafted)! + 1);
    // pieces that share nothing: the limit is the floor, and never below it
    expect(copyLimit({ sharedAmong: sharedAmong([essay(1), essay(2), essay(5)])! })).toBe(COPY_LIMIT);
    expect(copyLimit(null)).toBe(COPY_LIMIT);
    // too few pieces to tell: nothing is read
    expect(sharedAmong(drafted.slice(0, 2))).toBeNull();
  });
  it('a check that did not run, or was turned off, is never a pass and never a failure', () => {
    for (const state of ['off', 'not-checked'] as const) {
      const r = buildRecord(facts({ requirements: [], claims: { state, bound: true, qualified: true, why: null, delivered: 0, open: 0, cut: 0 } }));
      expect(r.state).toBe('NEEDS_REVIEW');
    }
  });
});

describe('5 · what the request asks is not replaced by what the examples tend to do', () => {
  it('a request for 400 words answered with 187 is blocked, though every rule of the standard holds', () => {
    const r = buildRecord(facts({ requirements: [stated('x9', 'Open with a Summary section.', { observer: 'PRESENCE', params: { sections: ['Summary'], body: 1, opens: 1 } })], checked: [line('x9', 'MET')],
      request: { asked: '400 words', met: false, detail: '187 words written, short of it' } }));
    expect(r.entries.find((e) => e.dimension === 'REQUEST')).toMatchObject({ source: 'REQUEST', required: true, result: 'FAIL' });
    expect(r.state).toBe('BLOCKED');
  });
  it('the request\'s length sets aside the method\'s default and the span of the examples for that run, and is itself held', async () => {
    const { lengthRulesTheRequestSets, ownLengthApplies, unmetReader, requestLength, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const std = { requirements: [LENGTH] } as unknown as StandardVersion; const asked = statedLength('Explain caching in 400 words.');
    expect(asked).not.toBeNull();
    expect(lengthRulesTheRequestSets(std, asked).map((q) => q.requirementId)).toEqual(['x2']);
    const no = { asked: false, shape: false, contract: false, answers: false, outOfRegister: false, sections: false };
    expect(ownLengthApplies({ ...no, stated: true })).toBe(false);
    const short = Array.from({ length: 187 }, () => 'word').join(' ');
    expect(requestLength(short, asked!)).toMatchObject({ asked: '400 words', met: false });
    // and a draft that misses it is one more thing to write again for: said as the request's, never as the examples'
    const unmet = unmetReader(std, null, asked)?.({ output: short, report: { checked: [], unchecked: [], failed: false } as never });
    expect(unmet).toEqual([expect.objectContaining({ id: LENGTH_ID, of: 'request', statement: 'Write it at the length the request asks for: 400 words' })]);
  });
  it('a length is held only where the request can be read one way; otherwise it is shown as not counted, never guessed', () => {
    const held = (r: string): string | null => notHeldBecause(r, statedLength(r)!);
    expect(held('Explain caching in 400 words.')).toBeNull();
    expect(held('Draft it in about 300 words.')).toBeNull();
    for (const r of ['Write a 400-word post. Each paragraph under 60 words.', 'Write a 300-word post with a headline under 10 words', 'Write a 600-word post, no sentence over 25 words.']) expect(held(r), r).toMatch(/names more than one count of words/);
    expect(held('Write a post about 10 words that changed our roadmap')).toMatch(/what the piece is about/);
    expect(held('Explain caching in 3 sentences.')).toBe('a length in sentences is not counted');
    // not counted is said, and is the person's to read: never a pass, never a block
    const r = buildRecord(facts({ requirements: [], request: { asked: 'under 60 words', met: null, detail: 'the request names more than one count of words' } }));
    expect(r.entries[0]).toMatchObject({ dimension: 'REQUEST', result: 'UNVERIFIED' });
    expect(r.state).toBe('NEEDS_REVIEW');
  });
  it('the three kinds of requirement are never one list: each entry says which it is', () => {
    const r = buildRecord(facts({ requirements: [LENGTH], checked: [line('x2', 'MET')], request: { asked: '200 words', met: true, detail: '201 words written' },
      claims: { state: 'checked', bound: true, qualified: true, why: null, delivered: 0, open: 0, cut: 0 }, copying: { longest: 3, limit: 12, tellable: true } }));
    expect(r.entries.map((e) => e.dimension)).toEqual(['STANDARD', 'REQUEST', 'EVIDENCE', 'EVIDENCE']);
    expect(r.state).toBe('VERIFIED');
  });
});

describe('6 · a repair cannot silently break a REQUIRED rule the draft was meeting', () => {
  const flagged = 'Our churn fell to 3% last quarter after the change.';
  const text = `Caching keeps a copy of an answer near where it is asked for. ${flagged}`;
  const reader: ClaimSensor = { instrument: 'claim reader (test)', notes: [], version: 'test', qualified: true, gate: 'reader', degraded: false, spentUsd: 0,
    read: async () => { /* nothing to fetch */ },
    reading: (t): ClaimReading => ({ instrument: 'claim reader (test)', publicFacts: [], claims: t.includes(flagged) ? [{ start: t.indexOf(flagged), end: t.indexOf(flagged) + flagged.length, text: flagged, kind: 'FIGURE', why: 'not in your material' }] : [] }) };
  const opts = { material: 'Caching notes.', guardClaims: true, claimSensor: reader };
  it('a sentence the claim check would cut stays where cutting it breaks a required rule that held', async () => {
    const need = { standardVersionHash: 's', requirements: [stated('m1', 'At least 20 words.', { observer: 'LENGTH', params: { unit: ['words'], min: 20 } })] } as unknown as StandardVersion;
    expect(checkDraft('s', need, text, {}).checked.find((c) => c.requirementId === 'm1')?.result.verdict).toBe('MET');
    const r = await enforceClaims('s', need, text, opts);
    expect(r.text).toContain(flagged);
    expect(r.cut).toEqual([]);
    expect(r.report.checked.find((c) => c.requirementId === 'm1')?.result.verdict).toBe('MET');
  });
  it('and is cut where no required rule depends on it: the guard is the reason it stayed', async () => {
    const free = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
    const r = await enforceClaims('s', free, text, opts);
    expect(r.text).not.toContain(flagged);
  });
  it('one more draft is kept only if it breaks no more of any other required rule', async () => {
    const { withRedraft } = await import('../cli/commands/invoke.js');
    const report = (broken: readonly string[]) => ({ failed: broken.length > 0, unchecked: [], checked: broken.map((id) => ({ requirementId: id, materiality: 'REQUIRED', result: { verdict: 'VIOLATED', detail: 'd', spans: [], value: null } })) }) as never;
    const first = { output: 'first', report: report([]), repair: null }; const second = { output: 'second', report: report(['other']), repair: null };
    const refine = async (d: string) => (d === 'draft' ? first : second) as never;
    const out = await withRedraft(refine, { unmet: (d) => (d.output === 'first' ? [{ id: 'x1', statement: 'a section', detail: 'missing' }] : []), redraft: async () => 'again', notes: [] })('draft');
    expect(out.output).toBe('first');
  });
});

describe('7 · a test run or a held-back case is never something the skill learns from', () => {
  it('a run marked as a test is in no list a later build, an evaluation or a diagnosis learns from', () => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-inv-')), skillName: 'inv' };
    const run = (id: string, testRun: boolean): InvocationRecord => ({ invocationId: id, at: `2026-10-0${id.length}`, input: 'write', output: 'text',
      settings: { flags: { drafts: 1, noTaste: true, allowUnsourced: false, placeholders: false, ...(testRun ? { testRun: true } : {}) } } }) as unknown as InvocationRecord;
    store.putInvocation(L, run('a', false)); store.putInvocation(L, run('bb', true));
    expect(store.listLearningInvocations(L).map((r) => r.invocationId)).toEqual(['a']);
    expect([...store.testRunIds(L)]).toEqual(['bb']);
  });
  it('nothing that learns from past runs reads the list that still holds the test runs', () => {
    // A structural guard. These are the commands that learn from history (a build's "write this, not that" pairs,
    // recurrences, learned phrases, tuning, the fidelity range). One of them reading every run would learn from a
    // benchmark answer; they read `listLearningInvocations`, which leaves the test runs out.
    for (const f of ['build', 'tend', 'mine', 'tells', 'optimize', 'improve', 'fidelity']) {
      const src = readFileSync(join(__dirname, '..', 'cli', 'commands', `${f}.ts`), 'utf8');
      expect(/\bstore\.listInvocations\(/.test(src), `${f}.ts reads every run, test runs included`).toBe(false);
      expect(src, f).toMatch(/listLearningInvocations\(/);
    }
  });
  it('a held-back case is run as a test, so its output is never learned from', () => {
    expect(readFileSync(join(__dirname, '..', 'cli', 'commands', 'reproduce.ts'), 'utf8')).toMatch(/'--test-run'/);
  });
});

describe('8 · every surface says the same thing about the same run', () => {
  const records = [
    buildRecord(facts({ requirements: [LENGTH], checked: [line('x2', 'MET', '200 words')] })),
    buildRecord(facts({ requirements: [LENGTH, PARTIES], checked: [line('x2', 'MET', '200 words'), line('x1', 'MET')] })),
    buildRecord(facts({ requirements: [LENGTH, PARTIES], checked: [line('x2', 'VIOLATED', '469 words (150 to 230): long by 239'), line('x1', 'MET')] })),
  ];
  const NAME = { VERIFIED: 'VERIFIED', NEEDS_REVIEW: 'NEEDS REVIEW', BLOCKED: 'BLOCKED' } as const;
  it('the card, the engine\'s panel and the record name one state', () => {
    expect(records.map((r) => r.state)).toEqual(['VERIFIED', 'NEEDS_REVIEW', 'BLOCKED']);
    for (const record of records) {
      const card = renderRunCard({ record, costUsd: 0.03, seconds: 20, drafts: 1, done: [], invocationId: 'i1' }).join('\n');
      expect(card.split('\n')[0]).toContain(`Evaluation · ${NAME[record.state]} `);
      const e = { schema: 1, invocationId: 'i1', skill: 's', at: '2026-10-12', release: null, model: null, drafts: 1, costUsd: 0.03, durationMs: 20000, result: { conformant: true, reasons: [] }, record,
        gates: { required: { held: 1, applicable: 1, broken: [] }, claims: { state: 'checked', delivered: 0, unconfirmed: 0, cut: 0, listed: 0, instrument: null, measured: null, answers: false }, copying: null,
          format: { kind: 'none', words: null, withheld: 0 }, applicability: { applied: 1, notApplicable: 0, waived: [] } }, fidelity: null, monitors: { detector: null, taste: null }, notMeasured: [] } as unknown as EvalSummary;
      expect(renderPanel(e).split('\n')[1]).toContain(`RESULT  ${NAME[record.state]}`);
    }
  });
  it('the card ticks exactly the entries the record passed, and crosses exactly the ones it failed', () => {
    for (const record of records) {
      const card = renderRunCard({ record, costUsd: 0, seconds: 0, drafts: 1, done: [], invocationId: 'i1' });
      const count = (m: string): number => card.filter((l) => l.startsWith(`    ${m}  `)).length;
      expect(count('✓')).toBe(record.entries.filter((e) => e.dimension !== 'HABIT' && e.result === 'PASS').length);
      expect(count('✗')).toBe(record.entries.filter((e) => e.dimension !== 'HABIT' && e.result === 'FAIL').length);
      expect(count('~') + count('?')).toBe(record.entries.filter((e) => e.dimension !== 'HABIT' && e.result === 'UNVERIFIED').length);
    }
  });
  it('a failure is shown whole: the rule and what was found, never cut short', () => {
    const long = 'x'.repeat(40);
    const rule = stated('x7', `Keep the whole piece between 150 and 230 words ${long} ${long} ${long} ${long}.`, LENGTH.measurement);
    const card = renderRunCard({ record: buildRecord(facts({ requirements: [rule], checked: [line('x7', 'VIOLATED', `469 words ${long} ${long} ${long} the end of the evidence`)] })), costUsd: 0, seconds: 0, drafts: 1, done: [], invocationId: 'i' }, 80).join(' ');
    expect(card).toContain('the end of the evidence');
    expect(card.match(new RegExp(long, 'g'))?.length).toBe(7);
    expect(card).not.toContain('…');
  });
  it('the state of a record is its entries\' and nothing else\'s', () => {
    for (const record of records) expect(recordOf(record.entries).state).toBe(record.state);
    expect(stateLine(records[2])).toMatch(/^Not usable as it stands: 1 requirement seen to fail\./);
    expect(records[2].entries.filter(blocks).map((e: Entry) => e.id)).toEqual(['x2']);
  });
  it('the exit code a script reads is the record\'s state, however the run was asked for', async () => {
    const { exitFor } = await import('../cli/commands/run.js');
    for (const record of records) expect(exitFor({ record, result: { conformant: true, reasons: [] } } as unknown as EvalSummary)).toBe(record.state === 'BLOCKED' ? 1 : 0);
    // with no record the engine's own bar stands; with no evaluation at all, the run is not usable as it is
    expect(exitFor({ result: { conformant: true, reasons: [] } } as unknown as EvalSummary)).toBe(0);
    expect(exitFor({ result: { conformant: false, reasons: ['x'] } } as unknown as EvalSummary)).toBe(1);
    expect(exitFor(null)).toBe(1);
  });
  it('a check of a text and a run of the same text build one record: what the check failed, the record fails', () => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-inv8-')), skillName: 'inv8' };
    const std = { standardVersionHash: 's', requirements: [LENGTH, PARTIES] } as unknown as StandardVersion;
    const text = `## Parties\n${Array.from({ length: 300 }, () => 'word').join(' ')}.\n`;
    const report = checkDraft('inv8', std, text, {});
    const record = recordForText({ L, std, text, report, sensor: undefined, claimsOff: true, answers: false, unmeasured: null });
    expect(report.failed).toBe(true);
    expect(record.state).toBe('BLOCKED');
    expect(record.entries.find((e) => e.id === 'x1')).toMatchObject({ result: 'UNVERIFIED', reason: 'PARTLY_CHECKED' });
    // and a surface that lists checks says, under a check that held, that it read only part of the rule
    expect(describeVerify(report, partlyChecked(record))).toMatch(/^ok {4}x1 {2}Open with a Parties section[^\n]*\n[^\n]*\n {8}the check held, and it reads only part of this rule\. Not checked, yours to read: names both parties exactly as they appear in the term sheet$/m);
    expect(describeVerify(report, partlyChecked(record))).not.toMatch(/REQUIRED rule is broken/);
  });
  it('no file but the record decides what a result is', () => {
    // A renderer that writes a result of its own has begun a second evaluation. The record's file is the only one
    // in which a result is assigned.
    const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : /\.m?ts$/.test(f) ? [p] : []; });
    const root = join(__dirname, '..');
    const writes = [...files(join(root, 'core')), ...files(join(root, 'cli'))].filter((f) => /\bresult: '(?:PASS|FAIL|UNVERIFIED|NOT_APPLICABLE)'/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1));
    expect(writes).toEqual(['core/eval/record.ts']);
  });
});
