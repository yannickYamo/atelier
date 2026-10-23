// tests/atelier-surgical-fix.test.ts — A FIX CHANGES WHAT WAS NAMED AND KEEPS THE REST WORD FOR WORD (round 3, items 1 and 2).
//
// Metrics named before the change: sentences changed outside the named spans per fix round = 0, and removed phrases
// reintroduced = 0. The reading locates the sentences (closed: numbers of the piece, or whole); only those are written
// again, through the work field, and spliced in by code; what a fix removed is never brought back by the next. Expected
// values are written out by hand from an invented 30-sentence piece.
import { describe, it, expect } from 'vitest';
import { FIX_SCOPE, fixSpans, fixTargets, sentenceDiff } from '../core/loop/surgical-fix.js';
import { removedStretches, reintroducedRuns } from '../core/loop/corrections.js';
import { readContext } from '../core/inference/reading.js';
import { sentencesOf } from '../core/observers/text.js';
import { checkDraft } from '../core/loop/run-repair.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import { anInferenceResult } from './fixtures.js';

// Thirty sentences, three paragraphs of ten, each sentence its own invented fact about a canal town.
const S = Array.from({ length: 30 }, (_, i) => `Lock ${i + 1} on the old canal opens at ${6 + (i % 5)} in the morning for the barges.`);
const PIECE = [S.slice(0, 10).join(' '), S.slice(10, 20).join(' '), S.slice(20).join(' ')].join('\n\n');

/** A writer that answers each passage by what it holds, and says something about the task outside its field. */
const writer = (answers: Record<string, string>, seen: InferenceRequest[] = []): InferenceClient => ({
  complete: async (r) => {
    seen.push(r);
    const key = Object.keys(answers).find((k) => r.userMessage.includes(`THE PASSAGE TO CHANGE\n"""\n${k}`));
    return anInferenceResult({ json: { reply: `Step 1: read the passage. Step 2: change it.\n<work>${key ? answers[key] : 'unchanged'}</work>` } });
  },
});

describe('the reading: which sentences the words are about, or the whole piece', () => {
  const input = { instruction: 'say lock 5 and lock 17 open at noon', sentences: sentencesOf(PIECE).map((s) => s.text) };
  it('the piece is read as thirty sentences', () => { expect(input.sentences).toHaveLength(30); });
  it('numbers inside the piece are kept, sorted and once; a number outside it is dropped', () => {
    expect(FIX_SCOPE.ground({ sentences: [17, 5, 5, 31, 0], whole: false }, input)).toEqual({ kind: 'SPANS', ids: [5, 17] });
  });
  it('whole with no numbers is the whole piece; an answer naming both, or neither, is no answer', () => {
    expect(FIX_SCOPE.ground({ sentences: [], whole: true }, input)).toEqual({ kind: 'WHOLE' });
    expect(FIX_SCOPE.ground({ sentences: [3], whole: true }, input)).toBeNull();
    expect(FIX_SCOPE.ground({ sentences: [], whole: false }, input)).toBeNull();
    expect(FIX_SCOPE.ground({ sentences: [40], whole: false }, input)).toBeNull();
  });
  it('with no model the floor reads no meaning: the piece is written again whole', async () => {
    const r = await readContext(FIX_SCOPE, input, null, null, { spentUsd: 0, capUsd: 1 });
    expect([r.by, r.value]).toEqual(['floor', { kind: 'WHOLE' }]);
    expect(FIX_SCOPE.decide({ ...input, instruction: '  ' })).toEqual({ kind: 'WHOLE' });
  });
});

describe('the fix: exactly the sentences named change', () => {
  it('two sentences named of thirty: those two change, word for word nothing else, and the writer\'s notes are not delivered', async () => {
    const seen: InferenceRequest[] = [];
    const r = await fixSpans(writer({ [S[4]]: 'Lock 5 on the old canal opens at noon for the barges.', [S[16]]: 'Lock 17 on the old canal opens at noon for the barges.' }, seen),
      { spentUsd: 0, capUsd: 1 }, PIECE, [5, 17], 'say lock 5 and lock 17 open at noon', []);
    const after = sentencesOf(r.text).map((s) => s.text);
    expect(after).toHaveLength(30);
    expect(after[4]).toBe('Lock 5 on the old canal opens at noon for the barges.');
    expect(after[16]).toBe('Lock 17 on the old canal opens at noon for the barges.');
    for (let i = 0; i < 30; i++) if (i !== 4 && i !== 16) expect(after[i]).toBe(S[i]);
    expect(r.text).not.toContain('Step 1');
    expect(r.work).toEqual([{ delimited: true, outside: 'Step 1: read the passage. Step 2: change it.' }, { delimited: true, outside: 'Step 1: read the passage. Step 2: change it.' }]);
    expect(sentenceDiff(PIECE, r.text, [5, 17])).toEqual({ total: 30, changed: 2, outside: 0 });
    // the paragraphs stand where they stood
    expect(r.text.split('\n\n')).toHaveLength(3);
    // one call per span, each shown only its passage to change
    expect(seen.map((x) => x.toolName)).toEqual(['emit_fix', 'emit_fix']);
  });
  it('a change the person named may change a figure: their words are the licence (the meaning guard holds only repairs)', async () => {
    const r = await fixSpans(writer({ [S[0]]: 'Lock 1 opens at 9 now.' }), { spentUsd: 0, capUsd: 1 }, PIECE, [1], 'lock 1 opens at 9', []);
    expect(sentencesOf(r.text)[0].text).toBe('Lock 1 opens at 9 now.');
    expect(r.reverted).toEqual([]);
  });
  it('consecutive sentences make one span; a sentence counted as changed outside the named ones is measured, not assumed', () => {
    expect(fixTargets(PIECE, [3, 4, 9], 'x').map((t) => t.sentenceIds)).toEqual([[3, 4], [9]]);
    const moved = PIECE.replace(S[20], 'Something else entirely happens here.');
    expect(sentenceDiff(PIECE, moved, [5])).toEqual({ total: 30, changed: 1, outside: 1 });
  });
});

describe('what a fix removed stays out of the piece', () => {
  const before = S[4]; const after = 'Lock 5 opens at noon.';
  const fixed = PIECE.replace(before, after);
  const removed = removedStretches([{ before, after }], fixed);
  // Locks 10, 15, 20, 25 and 30 still open "on the old canal at 10 in the morning": only what no other sentence carries was taken out.
  it('the stretch the fix took out is recorded, without the wording the piece still carries', () => {
    expect(removed).toEqual(['Lock 5 on the old canal']);
  });
  it('brought back by a later version, it is found; wording the piece still had is never a reintroduction', () => {
    const back = fixed.replace(after, 'Lock 5 on the old canal opens at 7 in the morning for the barges.');
    expect(reintroducedRuns(back, removed, fixed).map((x) => x.text)).toEqual(['Lock 5 on the old canal']);
    expect(reintroducedRuns(fixed, removed, fixed)).toEqual([]);
  });
  it('a later fix whose writer brings it back is written once more without it: removed phrases reintroduced = 0', async () => {
    let n = 0;
    const client: InferenceClient = { complete: async (r) => { n += 1; return anInferenceResult({ json: { reply: n === 1 ? `<work>${before}</work>` : r.userMessage.includes('do not bring back') ? '<work>Lock 5 opens at one.</work>' : '<work>x</work>' } }); } };
    const r = await fixSpans(client, { spentUsd: 0, capUsd: 1 }, fixed, [5], 'make lock 5 sound older', removed);
    expect(sentencesOf(r.text)[4].text).toBe('Lock 5 opens at one.');
    expect(r.reintroduced).toEqual({ found: ['Lock 5 on the old canal'], rewritten: 1, keptAsItWas: 0 });
    expect(reintroducedRuns(r.text, removed, fixed)).toEqual([]);
  });
  it('one that brings it back twice is not spliced: the span stays as it was', async () => {
    const client: InferenceClient = { complete: async () => anInferenceResult({ json: { reply: `<work>${before}</work>` } }) };
    const r = await fixSpans(client, { spentUsd: 0, capUsd: 1 }, fixed, [5], 'make lock 5 sound older', removed);
    expect(r.text).toBe(fixed);
    expect(r.reintroduced.keptAsItWas).toBe(1);
  });
  it('on a run that writes the piece again whole, it is a finding the repair rewrites, held on nothing', () => {
    const v = { standardVersionHash: 'h', requirements: [] } as unknown as StandardVersion;
    const back = fixed.replace(after, before);
    const line = checkDraft('s', v, back, { guardClaims: false, removed: { phrases: removed, previous: fixed } }).checked.find((c) => c.requirementId === 'REMOVED');
    expect([line?.result.verdict, line?.materiality, line?.enforced, line?.result.spans.map((x) => x.text)]).toEqual(['VIOLATED', 'PREFERRED', true, ['Lock 5 on the old canal']]);
    expect(checkDraft('s', v, fixed, { guardClaims: false, removed: { phrases: removed, previous: fixed } }).checked.find((c) => c.requirementId === 'REMOVED')?.result.verdict).toBe('MET');
  });
});
