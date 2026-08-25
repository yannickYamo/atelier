// tests/atelier-judgement.test.ts — THE LEDGER THAT MAKES THE OBSERVER CHECKABLE.
//
// Every `compare` produced a machine reading and every `promote`/`reject` produced an expert reading
// of the same pair, and both were discarded. The consequence was that "the comparator has never been
// checked against the user's own judgement" was a permanent statement rather than a to-do: there was
// no data, and the reason was not that expert labels are expensive.
//
// What is pinned here is mostly what the ledger REFUSES to say. A join is easy; the failures that
// matter are reporting a rate over four pairs, counting a verdict the instrument itself flagged as
// order-dependent, and reading an EQUAL as agreement.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  foldJudgements, concordanceOf, agreement, describeAgreement, describeJudgements,
  rationalesFor, pairKey, MIN_COMPARABLE, type JudgementRecord,
} from '../core/fidelity/judgement.js';
import { initStore, appendEvent, readEvents, type StoreLayout } from '../core/state/store.js';

const observed = (
  requirementId: string, champion: string, candidate: string, result: string,
  at: string, orderInvariant = true, lengthRatio = 1,
) => ({ kind: 'COMPARISON_OBSERVED', requirementId, championSkillVersionHash: champion,
  candidateSkillVersionHash: candidate, result, orderInvariant, lengthRatio, at });

const ruled = (
  requirementId: string, champion: string, candidate: string, choice: string,
  at: string, rationale: string | null = null,
) => ({ kind: 'JUDGEMENT_RECORDED', requirementId, championSkillVersionHash: champion,
  candidateSkillVersionHash: candidate, choice, rationale, at });

/** one agreeing pair, distinct per index so the ledger sees N pairs and not one overwritten N times */
const agreeingPair = (i: number) => [
  observed('p1', 'champ', `cand${i}`, 'CANDIDATE_COMPLIES_BETTER', `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`),
  ruled('p1', 'champ', `cand${i}`, 'CANDIDATE', `2026-01-01T01:00:${String(i).padStart(2, '0')}Z`, 'it kept the concrete noun'),
];

describe('foldJudgements joins the two readings of one pair', () => {
  it('a comparison alone leaves the human side null', () => {
    const r = foldJudgements([observed('p1', 'a', 'b', 'EQUAL', '2026-01-01')]);
    expect(r).toHaveLength(1);
    expect(r[0].observer?.result).toBe('EQUAL');
    expect(r[0].human).toBeNull();
    expect(concordanceOf(r[0])).toBe('INCOMPLETE');
  });

  it('a ruling alone leaves the observer side null', () => {
    const r = foldJudgements([ruled('p1', 'a', 'b', 'CANDIDATE', '2026-01-01', 'clearer')]);
    expect(r[0].observer).toBeNull();
    expect(r[0].human?.rationale).toBe('clearer');
    expect(concordanceOf(r[0])).toBe('INCOMPLETE');
  });

  it('both readings of the same pair fold into ONE record', () => {
    const r = foldJudgements([
      observed('p1', 'a', 'b', 'CANDIDATE_COMPLIES_BETTER', '2026-01-01'),
      ruled('p1', 'a', 'b', 'CANDIDATE', '2026-01-02', 'yes'),
    ]);
    expect(r).toHaveLength(1);
    expect(concordanceOf(r[0])).toBe('AGREED');
  });

  it('the same rule on a DIFFERENT pair is a different row', () => {
    const r = foldJudgements([
      observed('p1', 'a', 'b', 'EQUAL', '2026-01-01'),
      observed('p1', 'a', 'c', 'EQUAL', '2026-01-01'),
    ]);
    expect(r).toHaveLength(2);
  });

  it('a re-run comparison replaces the earlier reading — the ledger holds what you were shown', () => {
    const r = foldJudgements([
      observed('p1', 'a', 'b', 'CHAMPION_COMPLIES_BETTER', '2026-01-01'),
      observed('p1', 'a', 'b', 'CANDIDATE_COMPLIES_BETTER', '2026-01-02'),
      ruled('p1', 'a', 'b', 'CANDIDATE', '2026-01-03', 'the second reading matched what I saw'),
    ]);
    expect(r).toHaveLength(1);
    expect(concordanceOf(r[0])).toBe('AGREED');
  });

  it('pairKey is rule-scoped, so one promotion can be evidence about two rules independently', () => {
    expect(pairKey('p1', 'a', 'b')).not.toBe(pairKey('p2', 'a', 'b'));
    const r = foldJudgements([
      observed('p1', 'a', 'b', 'CANDIDATE_COMPLIES_BETTER', '2026-01-01'),
      observed('p2', 'a', 'b', 'CHAMPION_COMPLIES_BETTER', '2026-01-01'),
      ruled('p1', 'a', 'b', 'CANDIDATE', '2026-01-02', 'w'),
      ruled('p2', 'a', 'b', 'CANDIDATE', '2026-01-02', 'w'),
    ]);
    expect(r.map(concordanceOf).sort()).toEqual(['AGREED', 'DISAGREED']);
  });
});

describe('concordance — what counts as agreement, and what deliberately does not', () => {
  const both = (result: string, choice: string, orderInvariant = true) =>
    concordanceOf(foldJudgements([
      observed('p1', 'a', 'b', result, '2026-01-01', orderInvariant),
      ruled('p1', 'a', 'b', choice, '2026-01-02', 'because'),
    ])[0]);

  it('same side is AGREED, either way round', () => {
    expect(both('CANDIDATE_COMPLIES_BETTER', 'CANDIDATE')).toBe('AGREED');
    expect(both('CHAMPION_COMPLIES_BETTER', 'CHAMPION')).toBe('AGREED');
  });

  it('opposite sides is DISAGREED, either way round', () => {
    expect(both('CHAMPION_COMPLIES_BETTER', 'CANDIDATE')).toBe('DISAGREED');
    expect(both('CANDIDATE_COMPLIES_BETTER', 'CHAMPION')).toBe('DISAGREED');
  });

  it('EQUAL is the observer declining to prefer, never agreement with whatever you picked', () => {
    expect(both('EQUAL', 'CANDIDATE')).toBe('OBSERVER_DECLINED');
    expect(both('EQUAL', 'CHAMPION')).toBe('OBSERVER_DECLINED');
  });

  it('NEITHER_COMPLIES is also a declined preference and not a vote for the champion', () => {
    expect(both('NEITHER_COMPLIES', 'CHAMPION')).toBe('OBSERVER_DECLINED');
  });

  it('an order-dependent verdict is ORDER_DEPENDENT even when it happens to match your pick', () => {
    // THE POINT: the instrument's own swap test said this answer tracked position. Scoring it against
    // a human pick moves the agreement count on a coin flip, and it would move it in BOTH directions.
    expect(both('CANDIDATE_COMPLIES_BETTER', 'CANDIDATE', false)).toBe('ORDER_DEPENDENT');
    expect(both('CHAMPION_COMPLIES_BETTER', 'CANDIDATE', false)).toBe('ORDER_DEPENDENT');
  });
});

describe('agreement counts cells and never silently drops a row', () => {
  const records: readonly JudgementRecord[] = foldJudgements([
    ...agreeingPair(1), ...agreeingPair(2),
    observed('p1', 'champ', 'x', 'CHAMPION_COMPLIES_BETTER', '2026-02-01'),
    ruled('p1', 'champ', 'x', 'CANDIDATE', '2026-02-02', 'it read better aloud'),
    observed('p1', 'champ', 'y', 'EQUAL', '2026-03-01'),
    ruled('p1', 'champ', 'y', 'CANDIDATE', '2026-03-02', null),
    observed('p1', 'champ', 'z', 'CANDIDATE_COMPLIES_BETTER', '2026-04-01', false),
    ruled('p1', 'champ', 'z', 'CANDIDATE', '2026-04-02', 'flipped, ignored it'),
    observed('p1', 'champ', 'never-ruled', 'EQUAL', '2026-05-01'),
    ruled('p1', 'champ', 'never-compared', 'CANDIDATE', '2026-06-01', 'gut'),
  ]);
  const a = agreement(records);

  it('every row lands in exactly one cell', () => {
    const total = a.agreed + a.disagreed + a.observerDeclined + a.orderDependent + a.humanOnly + a.observerOnly;
    expect(total).toBe(records.length);
  });

  it('comparable is agreed + disagreed and excludes declined and order-dependent', () => {
    expect(a.agreed).toBe(2);
    expect(a.disagreed).toBe(1);
    expect(a.comparable).toBe(3);
    expect(a.observerDeclined).toBe(1);
    expect(a.orderDependent).toBe(1);
  });

  it('separates "you ruled and nothing compared" from "compared and nobody ruled"', () => {
    expect(a.humanOnly).toBe(1);
    expect(a.observerOnly).toBe(1);
  });

  it('counts how many of your rulings carry a reason, because a bare choice teaches nothing', () => {
    expect(a.humanRulings).toBe(6);
    expect(a.withRationale).toBe(5);
  });

  it('a whitespace-only rationale is not a reason', () => {
    const w = agreement(foldJudgements([ruled('p1', 'a', 'b', 'CANDIDATE', '2026-01-01', '   ')]));
    expect(w.humanRulings).toBe(1);
    expect(w.withRationale).toBe(0);
  });
});

describe('the report refuses a rate it cannot support', () => {
  const below = agreement(foldJudgements([...agreeingPair(1), ...agreeingPair(2)]));
  const atFloor = agreement(foldJudgements(
    Array.from({ length: MIN_COMPARABLE }, (_, i) => agreeingPair(i)).flat(),
  ));

  it('prints no percentage below the floor', () => {
    expect(below.comparable).toBeLessThan(MIN_COMPARABLE);
    expect(describeAgreement(below)).not.toMatch(/\d+% agreement/);
    expect(describeAgreement(below)).toContain(`Below ${MIN_COMPARABLE}`);
  });

  it('still prints the cells below the floor — withholding a rate is not withholding the data', () => {
    expect(describeAgreement(below)).toContain('agreed              2');
  });

  it('prints the rate at the floor', () => {
    expect(atFloor.comparable).toBe(MIN_COMPARABLE);
    expect(describeAgreement(atFloor)).toContain('100% agreement');
  });

  it('the rate never appears without both limits that make it not a qualification', () => {
    const out = describeAgreement(atFloor);
    expect(out).toContain('does NOT qualify the observer');
    expect(out).toContain('Selection:');
    expect(out).toContain('Difficulty:');
  });

  it('an empty ledger reports zeros and asks for nothing to be set up', () => {
    expect(describeJudgements([])).toContain('No judgements recorded yet');
    expect(describeAgreement(agreement([]))).toContain('0 comparable pair(s)');
  });
});

describe('rationalesFor — what compare shows you before it rules', () => {
  const recs = foldJudgements([
    ruled('p1', 'a', 'b', 'CANDIDATE', '2026-03-01', 'kept the concrete noun'),
    ruled('p1', 'a', 'c', 'CHAMPION', '2026-01-01', 'the candidate hedged'),
    ruled('p1', 'a', 'd', 'CANDIDATE', '2026-02-01', null),
    ruled('p2', 'a', 'e', 'CANDIDATE', '2026-02-01', 'different rule entirely'),
  ]);

  it('returns only the named rule', () => {
    expect(rationalesFor(recs, 'p1').map((r) => r.rationale))
      .toEqual(['the candidate hedged', 'kept the concrete noun']);
  });

  it('is ordered oldest first, so the newest reason is the last thing read', () => {
    expect(rationalesFor(recs, 'p1').at(-1)?.rationale).toBe('kept the concrete noun');
  });

  it('drops rulings with no reason rather than showing an empty line', () => {
    expect(rationalesFor(recs, 'p1')).toHaveLength(2);
  });

  it('carries which side was chosen, since a reason without its verdict is unreadable', () => {
    expect(rationalesFor(recs, 'p1')[0].choice).toBe('CHAMPION');
  });
});

describe('the ledger reads back off the real append-only store', () => {
  it('events written the way the CLI writes them fold on the way out', () => {
    const L: StoreLayout = { root: mkdtempSync(join(tmpdir(), 'atelier-judgement-')), skillName: 'my-voice' };
    initStore(L);
    appendEvent(L, observed('p1', 'champ', 'cand', 'CHAMPION_COMPLIES_BETTER', '2026-01-01T00:00:00Z'));
    appendEvent(L, { kind: 'PROMOTED', at: '2026-01-02T00:00:00Z', skillVersionHash: 'cand' });
    appendEvent(L, ruled('p1', 'champ', 'cand', 'CANDIDATE', '2026-01-02T00:00:00Z', 'the observer read length'));

    const r = foldJudgements(readEvents(L));
    expect(r).toHaveLength(1);
    expect(concordanceOf(r[0])).toBe('DISAGREED');
    expect(describeJudgements(r)).toContain('the observer read length');
  });

  it('unrelated events in the same log are ignored, not mistaken for readings', () => {
    const L: StoreLayout = { root: mkdtempSync(join(tmpdir(), 'atelier-judgement-')), skillName: 'my-voice' };
    initStore(L);
    appendEvent(L, { kind: 'REPAIR_PROPOSED', repairId: 'r1', requirementId: 'p1' });
    appendEvent(L, { kind: 'TRANSITION_FORBIDDEN', requirementId: 'p1' });
    expect(foldJudgements(readEvents(L))).toHaveLength(0);
  });
});

describe('disagreements are surfaced first, because they are the rows worth reading', () => {
  it('a DISAGREED row outranks an AGREED row in the printed ledger', () => {
    const out = describeJudgements(foldJudgements([
      ...agreeingPair(1),
      observed('p1', 'champ', 'x', 'CHAMPION_COMPLIES_BETTER', '2026-02-01'),
      ruled('p1', 'champ', 'x', 'CANDIDATE', '2026-02-02', 'it read better aloud'),
    ]));
    expect(out.indexOf('DISAGREED')).toBeLessThan(out.indexOf('AGREED  '));
  });

  it('an order-dependent row says so where the verdict is printed', () => {
    const out = describeJudgements(foldJudgements([
      observed('p1', 'champ', 'z', 'CANDIDATE_COMPLIES_BETTER', '2026-01-01', false),
      ruled('p1', 'champ', 'z', 'CANDIDATE', '2026-01-02', 'ignored it'),
    ]));
    expect(out).toContain('(order-dependent)');
  });
});

// ─── THE WIRING, ASSERTED AT THE CALL SITE ─────────────────────────────────────────────────────
//
// The module above is pure and would pass every test in this file while nothing ever wrote a row.
// A ledger that is never appended to is a ledger that reports an honest zero forever, which is the
// most convincing possible way to be dark. So the producers are pinned where they live.

describe('the ledger has producers, and they are the commands that make the decisions', () => {
  const promoteSrc = readFileSync('cli/commands/promote.ts', 'utf8');

  it('compare writes the observer reading', () => {
    expect(promoteSrc).toMatch(/appendEvent\(L, \{ kind: 'COMPARISON_OBSERVED'/);
  });

  it('compare shows what you already said about the rule BEFORE spending on a verdict', () => {
    const priorAt = promoteSrc.indexOf('rationalesFor(foldJudgements');
    const spendAt = promoteSrc.indexOf('await compareOnRule');
    expect(priorAt).toBeGreaterThan(-1);
    expect(priorAt).toBeLessThan(spendAt);
  });

  it('promote refuses without a reason', () => {
    expect(promoteSrc).toMatch(/flag\('--why'\) \?\? die\(/);
  });

  it('promote writes the human reading', () => {
    expect(promoteSrc).toMatch(/kind: 'JUDGEMENT_RECORDED'[\s\S]{0,220}choice: 'CANDIDATE'/);
  });

  it('reject writes one too — the loop must learn from a no as well as a yes', () => {
    expect(promoteSrc).toMatch(/kind: 'JUDGEMENT_RECORDED'[\s\S]{0,220}choice: 'CHAMPION'/);
  });

  it('the reason reaches the repair record instead of the hardcoded null it used to', () => {
    expect(promoteSrc).not.toMatch(/outcome: 'PROMOTED',[\s\S]{0,200}note: null/);
    expect(promoteSrc).toMatch(/outcome: 'PROMOTED',[\s\S]{0,200}note: why/);
  });

  it('a rule is JOINED from what was compared, never invented at promotion time', () => {
    // A judgement filed against a requirement nobody examined is a fabricated expert label, which is
    // the one thing this corpus must not contain.
    expect(promoteSrc).toMatch(/const compared = foldJudgements\(events\)/);
    expect(promoteSrc).toMatch(/: \[\];/);
  });

  it('the reader can get to the ledger', () => {
    expect(readFileSync('cli/atelier.mts', 'utf8')).toMatch(/case 'judgements':/);
  });
});
