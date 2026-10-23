// tests/atelier-material-points.test.ts — NOTES WRITTEN AS SENTENCES ARE POINTS TO WRITE FROM, NOT TEXT TO COPY (plan item 8).
//
// Metric the change must move (named before it was built): copied runs = 0. Where the material holds finished sentences
// the run says so once and serves it as points; the delivered work is read for the stretches it shares with the material
// (maximal runs of 5 words or more, on the record), and one of 8 words or more is a finding the repair rewrites like any
// listed finding. It never holds the work: the evaluation leaves it out. Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import type { StandardVersion } from '../core/state/canonical-state.js';
import type { InferenceRequest } from '../core/inference/client.js';
import { sharedRuns } from '../core/observers/copied-runs.js';
import { writtenAsSentences, finishedSentences, copiedRecord } from '../core/loop/material-points.js';
import { checkDraft, refineToStandard, COPIED_LINE } from '../core/loop/run-repair.js';
import { anInferenceResult, aRequirement } from './fixtures.js';

const NOTES = 'The new terminal opens in March and doubles the number of berths. Ferries to the islands will leave every hour from the first week.';
const COPY = 'The new terminal opens in March and doubles the number of berths';
const PLAIN = 'I walked down to the quay this morning and watched the gulls over the water for a while.';
const DRAFT = `${COPY}, which I did not expect. ${PLAIN} ${PLAIN}`;

describe('copied stretches, as maximal runs', () => {
  it('overlapping 5-word windows are one stretch, with its length and where it stands', () => {
    const [r] = sharedRuns(DRAFT, NOTES);
    expect([r.text, r.words, r.start]).toEqual([COPY, 12, 0]);
    expect(sharedRuns(DRAFT, NOTES)).toHaveLength(1);
  });
  it('the record keeps every stretch of 5 words or more, the longest, and the length a stretch is repaired at', () => {
    expect(copiedRecord(DRAFT, NOTES)).toEqual({ runs: 1, longest: 12, shown: [COPY], repairAt: 8 });
  });
});

describe('notes written as sentences, by form', () => {
  it('two sentences of 8 words or more with their own stop: sentences; a list of fragments: points already', () => {
    expect(finishedSentences(NOTES)).toBe(2);
    expect(writtenAsSentences([{ text: NOTES }])).toBe(true);
    expect(writtenAsSentences([{ text: '- terminal opens March\n- doubles berths\n- hourly island ferries' }])).toBe(false);
  });
});

describe('a stretch of 8 words or more is a finding the repair rewrites; it never holds the work', () => {
  const std = { standardVersionHash: 's', requirements: [aRequirement({ requirementId: 'r1', statement: 'Write plainly.', materiality: 'PREFERRED' })] } as unknown as StandardVersion;
  it('read only where the material is written as sentences: 8 words or more is a finding, a shorter one is not', () => {
    const line = (t: string, from?: string) => checkDraft('d', std, t, { guardClaims: false, ...(from ? { copiedFrom: from } : {}) }).checked.find((c) => c.requirementId === COPIED_LINE);
    expect(line(DRAFT)).toBeUndefined();
    expect(line(DRAFT, NOTES)?.result).toMatchObject({ verdict: 'VIOLATED', value: 1 });
    expect(line(`The new terminal opens in March, I hear. ${PLAIN}`, NOTES)?.result.verdict).toBe('MET');
  });
  it('the repair rewrites the copied stretch in its own words: no copied run is left', async () => {
    const writer = { complete: async (req: InferenceRequest) => {
      const spans = [...req.userMessage.matchAll(/SPAN (\d+)\n"""([\s\S]*?)"""/g)];
      return anInferenceResult({ json: { replacements: spans.map(([, id, t]) => ({ id: Number(id), text: t.startsWith('The new terminal') ? 'March brings the new terminal, with twice the berths, which I did not expect.' : t })) } });
    } };
    const out = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', std, DRAFT, 2, { guardClaims: false, copiedFrom: NOTES });
    expect(out.output.startsWith('March brings the new terminal, with twice the berths, which I did not expect.')).toBe(true);
    expect(sharedRuns(out.output, NOTES)).toEqual([]);
  });
});
