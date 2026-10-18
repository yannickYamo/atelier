// History informs PROPOSALS and is kept out of what the executor is shown.
//
// Independent measurement (WikiSkill, arXiv 2608.27454): the same accumulated knowledge raised
// quality 48.7% -> 63.7% when shown to the component proposing changes, and LOWERED it 63.7% ->
// 60.9% when shown to the component executing the task. Same knowledge, opposite sign, decided by
// which component sees it.
import { describe, it, expect } from 'vitest';
import {
  assertHistoryNotServed, HistoryLeakedToExecutor, type RepairRecord,
} from '../core/architecture/repair-memory.js';

const rec = (o: Partial<RepairRecord> & { repairId: string }): RepairRecord => ({
  requirementId: 'g9', from: 'PROSE', to: 'SELF_CHECK', outcome: 'REJECTED',
  candidateSkillVersionHash: `${o.repairId}aaaaaaaaaaaaaaaa`,
  evidenceBasis: { missContexts: 1, invocationIds: [] },
  evaluationBasis: { generations: 1, instrument: 'HUMAN_EYE', orderInvariant: null },
  note: null, at: '2026-01-01T00:00:00.000Z', ...o,
} as RepairRecord);

describe('history reaches the proposer and never the executor', () => {
  const h = [rec({ repairId: 'deadbeef' })];

  it('REFUSES served bytes carrying a candidate hash from history', () => {
    const served = '# skill\n\nLead with the action.\n<!-- built from deadbeefaaaaaaaa -->';
    expect(() => { assertHistoryNotServed(served, h); }).toThrow(HistoryLeakedToExecutor);
    expect(() => { assertHistoryNotServed(served, h); }).toThrow(/nobody ratified it/);
  });

  it('POLARITY: clean served bytes pass', () => {
    expect(() => { assertHistoryNotServed('# skill\n\nLead with the action.', h); }).not.toThrow();
  });

  it('and an empty history cannot leak', () => {
    expect(() => { assertHistoryNotServed('anything at all', []); }).not.toThrow();
  });
});
