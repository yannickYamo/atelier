// PORTED test — same assertions, run against atelier/core/discovery/chain/.
// The predecessor keeps its own copy of these tests until its callers migrate.

/**
 * IMPORT — the entry point.
 * Load-bearing tests: the journey is INFERRED (never asked), the split is content-blind, and a
 * corpus too small to yield evidence is REFUSED rather than run at reduced confidence.
 */
import { describe, it, expect } from 'vitest';
import { planImport, MIN_GOLDEN_CHARS, type ImportedMaterial } from '../../core/discovery/chain/corpus-import.js';
import { validateDiscovery } from '../../core/discovery/chain/discovery-contract.js';

const body = (n = MIN_GOLDEN_CHARS + 50) => 'x'.repeat(n);
const golden = (id: string): ImportedMaterial => ({ id, kind: 'GOLDEN', text: body() });
const four = ['d_four', 'a_one', 'c_three', 'b_two'].map(golden);

describe('import', () => {
  it('INFERS the journey — the user is never asked to classify their own situation', () => {
    expect(planImport(four).journey).toBe('CREATE');
    expect(planImport([...four, { id: 'positioning', kind: 'EXISTING_SKILL', text: body() }]).journey).toBe('IMPROVE');
  });

  it('names the journey it chose, and never poses a branch question', () => {
    const create = planImport(four).summary;
    const improve = planImport([...four, { id: 'positioning', kind: 'EXISTING_SKILL', text: body() }]).summary;
    expect(create).toMatch(/no skill here yet/i);
    expect(improve).toMatch(/already have a skill/i);
    expect(improve).toMatch(/positioning/);
    for (const s of [create, improve]) {
      expect(s).not.toMatch(/would you like|do you want|choose|which of these/i);
    }
  });

  it('assigns the split CONTENT-BLIND — ordering depends only on identifiers', () => {
    // Same ids, wildly different contents: identical split. If content could move the split, the
    // examples that make a pattern look strongest could be steered into the proposal set.
    const a = planImport(four);
    const b = planImport(four.map(g => ({ ...g, text: `${g.text} totally different content ${g.id}` })));
    expect(a.goldens).toEqual(b.goldens);
    // held-out pieces sit at an even stride through the sorted ids, not at its tail
    expect(a.goldens.filter(g => g.role === 'PROPOSAL').map(g => g.contextId)).toEqual(['a_one', 'c_three']);
  });

  it('SCALES with the corpus: forty pieces are all read or checked, not two', () => {
    const forty = Array.from({ length: 40 }, (_, i) => golden(`post-${String(i).padStart(2, '0')}`));
    const plan = planImport(forty);
    const proposal = plan.goldens.filter(g => g.role === 'PROPOSAL');
    const held = plan.goldens.filter(g => g.role === 'HELD_OUT');
    expect(held).toHaveLength(8);                       // capped: every held-out piece is observed per rule
    expect(proposal).toHaveLength(32);
    expect(plan.unread ?? []).toEqual([]);
  });

  it('a piece past the proposer\'s one-pass read is NAMED as unread, never silently dropped', () => {
    const big = (id: string): ImportedMaterial => ({ id, kind: 'GOLDEN', text: 'y'.repeat(40_000) });  // ~10k tokens
    const plan = planImport(Array.from({ length: 20 }, (_, i) => big(`p${String(i).padStart(2, '0')}`)));
    expect((plan.unread ?? []).length).toBeGreaterThan(0);
    expect(plan.summary).toMatch(/not read/);
  });

  it('a declared held-out count wins, within the floors', () => {
    const ten = Array.from({ length: 10 }, (_, i) => golden(`g${i}`));
    expect(planImport(ten, { heldOut: 5 }).goldens.filter(g => g.role === 'HELD_OUT')).toHaveLength(5);
    expect(planImport(ten, { heldOut: 1 }).goldens.filter(g => g.role === 'HELD_OUT')).toHaveLength(2);
  });

  it('a reserved piece takes no role at all', () => {
    const plan = planImport([...four, golden('e_five')], { reserved: ['a_one'] });
    expect(plan.goldens.map(g => g.contextId)).not.toContain('a_one');
  });

  it('produces a split discovery ACCEPTS — the two floors agree', () => {
    const plan = planImport(four);
    const problems = validateDiscovery({
      skillId: 's', goldens: plan.goldens,
      proposed: [{
        proposedId: 'f', description: 'd',
        appliesWhen: [{ id: 'w', describe: 'when' }],
        readFrom: plan.goldens.filter(g => g.role === 'PROPOSAL').map(g => g.contextId),
        wouldBeAbsentIf: 'absent if not present', quote: '',
      }],
      observations: plan.goldens.filter(g => g.role === 'HELD_OUT')
        .map(g => ({ proposedId: 'f', observation: { contextId: g.contextId, applicable: true, present: true } })),
    });
    expect(problems).toEqual([]);
  });

  it('REFUSES a corpus too small to yield evidence, rather than running at low confidence', () => {
    const plan = planImport([golden('a'), golden('b'), golden('c')]);
    expect(plan.refusals.length).toBeGreaterThan(0);
    expect(plan.goldens).toEqual([]);                       // no split is offered at all
    expect(plan.summary).toMatch(/cannot start yet/i);
    expect(plan.summary).toMatch(/description of the examples themselves/i);
  });

  it('REFUSES a fragment rather than treating it as an example of finished work', () => {
    const plan = planImport([...four, { id: 'snippet', kind: 'GOLDEN', text: 'too short' }]);
    expect(plan.refusals.join(' ')).toMatch(/"snippet" is too short/);
  });

  it('REFUSES rejected examples with nothing to contrast them against', () => {
    const plan = planImport([{ id: 'bad', kind: 'REJECTED', text: body() }]);
    expect(plan.refusals.join(' ')).toMatch(/only learn what you want by contrast/i);
  });

  it('counts rejected and methodology material without requiring it', () => {
    const plan = planImport([
      ...four,
      { id: 'bad1', kind: 'REJECTED', text: body() },
      { id: 'framework', kind: 'METHODOLOGY', text: body() },
    ]);
    expect(plan.refusals).toEqual([]);
    expect(plan.rejectedCount).toBe(1);
    expect(plan.methodologyCount).toBe(1);
    expect(plan.summary).toMatch(/sharpen the contrast/);
  });

  it('explains WHY the split exists, since that is what makes a finding a finding', () => {
    expect(planImport(four).summary).toMatch(/finding rather than a restatement/i);
  });

  it('leaks no machinery to the user', () => {
    const s = planImport([...four, { id: 'sk', kind: 'EXISTING_SKILL', text: body() }]).summary;
    for (const jargon of ['PROPOSAL', 'HELD_OUT', 'GoldenRef', 'MaterialKind', 'ADVISORY']) {
      expect(s, `leaked: ${jargon}`).not.toContain(jargon);
    }
  });
});
