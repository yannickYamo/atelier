// tests/stages.test.ts — THE RUN, STAGE BY STAGE, READ OFF ITS RECORD (core/eval/stages.ts).
//
// Each assertion is one the ledger could get wrong: a served prompt without the plan marker must read as plan OFF (a flag
// that says off is not evidence); a copied stretch at the repair length is a failed hard check; the first failing stage in
// run order is the one reported; an older record says unknown, never a made-up value.
import { describe, it, expect } from 'vitest';
import { stagesOf, servedLayersOf, textCounts, changedShare, failedStage, renderStages, RUN_STAGES } from '../core/eval/stages.js';
import { FOR_THIS_REQUEST } from '../core/fidelity/request-notes.js';
import type { InvocationRecord } from '../core/state/canonical-state.js';

const PLAN_NOTE = 'The plan for this piece (write the piece from it; the plan is not part of the piece, so never write it out):\n\n- Angle: the cost of a rewrite';
const ANSWERS_NOTE = 'Before writing I settled these (my answers; write from them):\n\n- What is the angle? the cost';
const ASSUMED_NOTE = 'Not settled: nobody answered these, so each is a working assumption, not my position. Write from it as an assumption:\n\n- News? none';
const BRIEF_NOTE = "For this request, my method's steps that apply: 1, 3.";
const PERSONA = 'How I sound (each point is quoted from my own pieces, and holds across them):\n\n- I open from a position of my own.';
const SKILL = `# post-voice\n\nWrite like these.\n\n${PERSONA}\n\n<example name="a">\nOne piece.\n</example>\n\n<example name="b">\nAnother.\n</example>`;

/** A record with only what the ledger reads; everything else is the shape the type asks for. */
function record(o: Partial<InvocationRecord> & { output: string }): InvocationRecord {
  return {
    invocationId: 'i1', skillName: 's', standardVersionHash: 'h', skillVersionHash: 'h', architectureHash: 'h', servedPackageHash: 'h',
    runtimeBinding: { provider: 'anthropic', model: 'm', bindingHash: 'b' } as unknown as InvocationRecord['runtimeBinding'],
    observedRuntime: { model: 'm' } as unknown as InvocationRecord['observedRuntime'],
    invocationSurface: 'CLI' as InvocationRecord['invocationSurface'], provenance: 'ORGANIC_USE',
    inputHash: 'x', request: { resolvedTaskHash: 'x', servedTaskHash: 'x', source: 'POSITIONAL', atelierVersion: 't' }, outputHash: 'y', at: '2026-10-26T00:00:00Z',
    delivery: { expectedPackageHash: 'h', servedPackageHash: 'h', matched: true, servedFiles: ['SKILL.md'], outputContract: { artifact: '', contractHash: '', schemaHash: '', enforced: false } },
    input: 'Write a post about the rewrite that cost us a quarter.', ...o,
  } as InvocationRecord;
}

describe('the served prompt, by its layers', () => {
  it('reads each layer off the composer\'s own markers, and nothing else', () => {
    const full = servedLayersOf(`${SKILL}${FOR_THIS_REQUEST}${BRIEF_NOTE}\n\n${ANSWERS_NOTE}\n\n${ASSUMED_NOTE}\n\n${PLAN_NOTE}`);
    expect(full.blocks).toEqual({ persona: true, repertoire: false, examples: 2, forThisRequest: true, plan: true, answers: true, assumed: true, brief: true, points: false, latitude: false });
    expect(full.bytes).toBeGreaterThan(100);
    expect(full.hash).toMatch(/^[0-9a-f]{16}$/);
  });
  it('a prompt without the plan note reads as plan off, whatever any flag said', () => {
    const off = servedLayersOf(`${SKILL}${FOR_THIS_REQUEST}${BRIEF_NOTE}`);
    expect(off.blocks.plan).toBe(false);
    expect(off.blocks.answers).toBe(false);
    expect(off.blocks.brief).toBe(true);
    // the same prompt with the persona blocks removed reads as persona off
    expect(servedLayersOf(SKILL.replace(`${PERSONA}\n\n`, '')).blocks.persona).toBe(false);
  });
  it('two prompts that differ by one layer differ by hash', () => {
    expect(servedLayersOf(SKILL).hash).not.toBe(servedLayersOf(`${SKILL}\n\n${PLAN_NOTE}`).hash);
  });
});

describe('counts on a text, by code', () => {
  it('words, sentences, the median, the short share, dashes and tells', () => {
    const c = textCounts('We shipped it. It broke — badly. The fix took a week, and it was not the fix we expected. Fine.');
    expect(c.sentences).toBe(4);
    expect(c.dashes).toBe(1);
    expect(c.medianSentence).toBeGreaterThan(2);
    expect(c.shortShare).toBeGreaterThan(0);
    expect(typeof c.tells).toBe('number');
  });
  it('the share of sentences a pass changed', () => {
    expect(changedShare('One. Two. Three.', 'One. Two. Three.')).toBe(0);
    expect(changedShare('One. Two. Three.', 'One. Two. Four.')).toBeCloseTo(0.33, 1);
    expect(changedShare('', 'One.')).toBe(1);
  });
});

describe('the stages of one run', () => {
  const served = servedLayersOf(`${SKILL}${FOR_THIS_REQUEST}${PLAN_NOTE}`);
  const base = record({
    output: 'We shipped it. It broke. The fix took a week.',
    served,
    prewrite: { questions: [{ id: 'news', ask: 'Any news of your own?', options: ['none', 'the launch'], default: 'none' }], answers: [{ id: 'news', answer: 'none', by: 'default' }], questionsBy: 'model',
      plan: { use: 'choose', angle: 'the cost', pain: '', turn: '', answer: '', points: [{ point: 'a week lost', from: 'a week lost' }, { point: 'nobody asked', from: 'nobody asked' }], image: null, close: '', leftOut: [{ what: 'the vendor', why: 'off the angle' }] }, planBy: 'model' },
    selection: { drafts: 2, chosen: 1, why: 'fewer rules broken', written: 2, unchosen: ['We shipped it — and it broke.'] },
    repair: { passes: 1, violatedBefore: ['x1'], violatedAfter: [], originalOutputHash: 'o', draft: 'We shipped it — it broke. The fix took a week.', why: 'the dash', edits: { accepted: 1, rejected: 0, reasons: [] } },
    copied: { runs: 2, longest: 6, shown: [], repairAt: 8 },
    settings: { provider: 'anthropic', model: 'm', maxTokens: 1, flags: { drafts: 2, noTaste: false, allowUnsourced: false, placeholders: false, brief: { by: 'model', applies: ['1', '3'], setAside: ['2'], unsupported: [] } },
      certificate: { standardVersionHash: 'h', checks: { total: 4, counted: 3, written: 1, writtenQualified: 0 }, readers: { taste: { veto: [], labelledMisses: 0, falseBlockUpper95: null } }, delivery: 'PERSON', errorBound: null, why: 'one rule unread' } } as unknown as InvocationRecord['settings'],
  });
  it('every stage, in run order, with who decided it', () => {
    const st = stagesOf(base);
    expect(st.map((s) => s.id)).toEqual([...RUN_STAGES]);
    const by = Object.fromEntries(st.map((s) => [s.id, s.by]));
    expect(by).toEqual({ intake: 'code', readings: 'model', material: 'code', questions: 'model', plan: 'model', served: 'code', drafts: 'model', selection: 'code', repair: 'model', verdict: 'code', fix: 'off' });
  });
  it('the counts a judge never writes: the plan carried 2 points and left 1 out; the angle was not asked; the first draft had the dash and the delivered text has none', () => {
    const c = Object.fromEntries(stagesOf(base).map((s) => [s.id, s.counts]));
    expect(c.plan.points).toBe(2); expect(c.plan.leftOut).toBe(1);
    expect(c.questions.asked).toBe(1); expect(c.questions.angleAsked).toBe(false); expect(c.questions.byDefault).toBe(1);
    expect(c.drafts['first.dashes']).toBe(1); expect(c.repair['out.dashes']).toBe(0);
    expect(c.repair.changedShare).toBeCloseTo(0.67, 1); // the dash joined two sentences in the draft; two of the three delivered ones are new
    expect(c.selection.unchosen).toBe(1);
    expect(c.served['block.plan']).toBe(true); expect(c.served['block.persona']).toBe(true);
    expect(c.verdict.delivery).toBe('PERSON');
  });
  it('a copied stretch at the repair length is a failed hard check, and the first failed stage in run order is the one reported', () => {
    const st = stagesOf({ ...base, copied: { runs: 1, longest: 9, shown: ['nine words copied from the notes as they stood'], repairAt: 8 }, repair: { ...base.repair!, violatedAfter: ['x1'] } });
    expect(failedStage(st)?.id).toBe('material');
    expect(st.find((s) => s.id === 'repair')?.failed).toContain('x1');
    expect(failedStage(stagesOf(base))).toBeNull();
  });
  it('a fix that changed a sentence outside the ones named fails the fix stage', () => {
    const st = stagesOf({ ...base, fix: { of: 'i0', from: 'i0', instruction: 'shorter', by: 'model', sentences: [], diff: { total: 3, changed: 2, outside: 1 }, spans: [{ before: 'a', after: 'b' }], removed: [], reintroduced: { found: [], rewritten: 0, keptAsItWas: 0 } } as unknown as InvocationRecord['fix'] });
    expect(st.find((s) => s.id === 'fix')?.failed).toContain('outside');
  });
  it('an older record says unknown where it kept nothing, never a value', () => {
    const st = stagesOf(record({ output: 'Short.' }));
    const by = Object.fromEntries(st.map((s) => [s.id, s.by]));
    expect(by.served).toBe('unknown'); expect(by.questions).toBe('unknown'); expect(by.plan).toBe('unknown'); expect(by.verdict).toBe('unknown');
    expect(st.find((s) => s.id === 'repair')?.counts.changedShare).toBeNull();
  });
  it('renders one line per stage with the failure marked', () => {
    const lines = renderStages(stagesOf({ ...base, copied: { runs: 1, longest: 9, shown: [], repairAt: 8 } }));
    expect(lines).toHaveLength(RUN_STAGES.length);
    expect(lines.find((l) => l.startsWith('material'))).toContain('✗ a copied stretch of 9 words');
  });
});

describe('the verdict stage reads the decision from the stored evaluation, and counts interruptions', () => {
  const served = servedLayersOf(SKILL);
  const r = record({ output: 'Done.', served,
    prewrite: { questions: [{ id: 'news', ask: 'Any news?', options: ['none'], default: 'none' }, { id: 'angle', ask: 'Angle?', options: ['a'], default: 'a' }], answers: [], questionsBy: 'model', plan: null, planBy: 'off' },
    settings: { provider: 'anthropic', model: 'm', maxTokens: 1, flags: { drafts: 1, noTaste: false, allowUnsourced: false, placeholders: false }, certificate: { standardVersionHash: 'h', checks: { total: 1, counted: 1, written: 0, writtenQualified: 0 }, readers: { taste: { veto: [], labelledMisses: 0, falseBlockUpper95: null } }, errorBound: null, why: null } } as unknown as InvocationRecord['settings'] });
  const verdict = (d: Parameters<typeof stagesOf>[1]) => stagesOf(r, d).find((s) => s.id === 'verdict')!;
  it('a run blocked after two questions: three interruptions, the budget written, and the stage failed', () => {
    const v = verdict({ delivery: { decision: 'BLOCK', budget: { budget: 0.1, shipsGood: 0.9025, steered: [{ id: 'x2', why: 'no goldens' }] } } });
    expect(v.counts).toMatchObject({ delivery: 'BLOCK', interruptions: 3, 'budget.allowed': 0.1, 'budget.shipsGood': 0.903, 'budget.steered': 1 });
    expect(v.failed).toMatch(/blocked/);
  });
  it('a run shipped labelled after the same questions: two interruptions, nothing failed', () => {
    const v = verdict({ delivery: { decision: 'SHIP_LABELLED' } });
    expect(v.counts).toMatchObject({ delivery: 'SHIP_LABELLED', interruptions: 2 });
    expect(v.failed).toBeNull();
  });
  it('with no evaluation stored, the certificate\'s delivery (if any) stands, else null', () => {
    expect(verdict({}).counts.delivery).toBeNull();
  });
});
