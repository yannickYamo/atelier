// History informs PROPOSALS and is kept out of what the executor is shown — and it is bounded.
//
// Independent measurement (WikiSkill, arXiv 2608.27454): the same accumulated knowledge raised
// quality 48.7% -> 63.7% when shown to the component proposing changes, and LOWERED it 63.7% ->
// 60.9% when shown to the component executing the task. Same knowledge, opposite sign, decided by
// which component sees it.
import { describe, it, expect } from 'vitest';
import {
  historyForProposer, assertHistoryNotServed, describeBound, HistoryLeakedToExecutor,
  PROPOSER_HISTORY_BUDGET, type RepairRecord,
} from '../core/architecture/repair-memory.js';

const rec = (o: Partial<RepairRecord> & { repairId: string }): RepairRecord => ({
  requirementId: 'g9', from: 'PROSE', to: 'SELF_CHECK', outcome: 'REJECTED',
  candidateSkillVersionHash: `${o.repairId}aaaaaaaaaaaaaaaa`,
  evidenceBasis: { missContexts: 1, invocationIds: [] },
  evaluationBasis: { generations: 1, instrument: 'HUMAN_EYE', orderInvariant: null },
  note: null, at: '2026-01-01T00:00:00.000Z', ...o,
} as RepairRecord);

describe('a bound that drops what is recoverable elsewhere first', () => {
  it('keeps REJECTIONS over PROMOTIONS, inverting "accumulate everything"', () => {
    // A promotion is already in the artifact — the carrier changed, the pointer moved. A rejection
    // exists nowhere else, which is the whole reason the record exists.
    const h = [
      ...Array.from({ length: 6 }, (_, i) => rec({ repairId: `p${i}`, outcome: 'PROMOTED' })),
      ...Array.from({ length: 6 }, (_, i) => rec({ repairId: `r${i}`, outcome: 'REJECTED' })),
    ];
    const b = historyForProposer(h, 'g9', 6);
    expect(b.kept.every((r) => r.outcome === 'REJECTED')).toBe(true);
    expect(b.droppedOutcomes.PROMOTED).toBe(6);
  });

  it('within a class, stronger evidence survives the cut', () => {
    const h = [
      rec({ repairId: 'weak', evidenceBasis: { missContexts: 1, invocationIds: [] } }),
      rec({ repairId: 'strong', evidenceBasis: { missContexts: 9, invocationIds: [] } }),
    ];
    expect(historyForProposer(h, 'g9', 1).kept[0]!.evidenceBasis.missContexts).toBe(9);
  });

  it('never truncates silently — the caller is handed what it did not show', () => {
    const h = Array.from({ length: 12 }, (_, i) => rec({ repairId: `x${i}`, outcome: 'PROMOTED' }));
    const b = historyForProposer(h, 'g9', 4);
    expect(b.droppedCount).toBe(8);
    expect(describeBound(b)).toMatch(/4 of 12 attempt\(s\) shown/);
    expect(describeBound(b)).toMatch(/already in the artifact/);
    // and says nothing about dropping when nothing was dropped
    expect(describeBound(historyForProposer([rec({ repairId: 'a' })], 'g9', 4))).toMatch(/all shown/);
  });

  it('only that requirement\'s history, never the whole log', () => {
    const h = [rec({ repairId: 'a' }), rec({ repairId: 'b', requirementId: 'other' })];
    expect(historyForProposer(h, 'g9').kept).toHaveLength(1);
  });

  it('has a default bound rather than relying on every caller to pass one', () => {
    expect(PROPOSER_HISTORY_BUDGET).toBeGreaterThan(0);
    expect(historyForProposer(Array.from({ length: 50 }, (_, i) => rec({ repairId: `z${i}` })), 'g9')
      .kept.length).toBe(PROPOSER_HISTORY_BUDGET);
  });
});

describe('history reaches the proposer and never the executor', () => {
  const h = [rec({ repairId: 'deadbeef' })];

  it('REFUSES served bytes carrying a candidate hash from history', () => {
    const served = '# skill\n\nLead with the action.\n<!-- built from deadbeefaaaaaaaa -->';
    expect(() => assertHistoryNotServed(served, h)).toThrow(HistoryLeakedToExecutor);
    expect(() => assertHistoryNotServed(served, h)).toThrow(/nobody ratified it/);
  });

  it('POLARITY: clean served bytes pass', () => {
    expect(() => assertHistoryNotServed('# skill\n\nLead with the action.', h)).not.toThrow();
  });

  it('and an empty history cannot leak', () => {
    expect(() => assertHistoryNotServed('anything at all', [])).not.toThrow();
  });
});
