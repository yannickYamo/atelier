// tests/atelier-request-length-rule.test.ts — THE LENGTH A REQUEST ASKS FOR IS A RULE OF THE RUN.
//
// The defect: a draft under the bottom of the range the request asked for was written again twice, and a draft written
// again that came nearer but still landed outside the range was kept and delivered outside it; the record of a draft
// inside the range said only how many words were written, never what was asked. Now: one draft written again toward the
// range, kept only if it lands inside it (and breaks nothing that could hold the work), and the record says the length
// and the range either way.
//
// Metric (plan round 1, item 4): outputs inside the requested range, target 19 of 20. Expected values are hand-counted.
import { describe, it, expect } from 'vitest';
import { stepLedger } from '../core/loop/controller.js';
import { withRedraft, requestLength, LENGTH_ID, type Unmet } from '../cli/commands/invoke.js';
import { statedLength } from '../core/intake/length.js';
import type { VerifyReport } from '../core/observers/verify.js';

const words = (n: number): string => Array.from({ length: n }, (_, i) => (i % 12 === 11 ? 'harbour.' : 'harbour')).join(' ');
const asked = statedLength('Write 150 to 200 words on the harbour.');
const report: VerifyReport = { skill: 's', standardVersionHash: 'h', checked: [], unchecked: [], conditional: [], failed: false };
const delivered = (t: string) => ({ output: t, report, repair: null });
// what the run reads as unmet: the request's length, while the draft is outside 150 to 200 words
const unmet = (d: { output: string }): Unmet[] => {
  const n = d.output.split(/\s+/).filter(Boolean).length;
  return n >= 150 && n <= 200 ? [] : [{ id: LENGTH_ID, of: 'request', whole: true, statement: 'Write it at the length the request asks for: 150 to 200 words', detail: `${n} words, ${n < 150 ? 150 - n : n - 200} too ${n < 150 ? 'few' : 'many'}`, off: n < 150 ? 150 - n : n - 200, aim: n < 150 ? 'aim for 165 words or more' : 'aim for 180 words or fewer' }];
};

describe('the record says the length and the range', () => {
  it('inside the range: the words written and what the request allows', () => {
    expect(requestLength(words(170), asked!)).toEqual({ asked: '150 to 200 words', met: true, detail: '170 words written, within the 150 to 200 it allows' });
  });
  it('outside it: how far, and what it allows', () => {
    expect(requestLength(words(120), asked!)).toEqual({ asked: '150 to 200 words', met: false, detail: '120 words written: too short, it allows 150 to 200' });
  });
});

describe('one draft written again toward the range, kept only inside it', () => {
  it('a draft that comes nearer but still lands outside is not kept, and no second draft is written', async () => {
    let calls = 0;
    const notes: string[] = [];
    const d = await withRedraft(async (t) => delivered(t), { notes, unmet, redraft: async () => { calls += 1; return words(140); } })(words(100), stepLedger());
    expect(calls).toBe(1);
    expect(d.output).toBe(words(100));
    const step = d.repair?.controller?.decisions.find((x) => x.action === 'redraft');
    expect(step?.outcome).toBe('not kept');
    expect(notes[0]).toBe('The draft runs 100 words, 50 too few, outside what the request asks for; one more draft came nearer (140 words, 10 too few) and still did not land inside it, so the first is kept.');
  });
  it('a draft that lands inside the range is kept', async () => {
    const d = await withRedraft(async (t) => delivered(t), { notes: [], unmet, redraft: async () => words(170) })(words(100), stepLedger());
    expect(d.output).toBe(words(170));
    expect(d.repair?.controller?.decisions.find((x) => x.action === 'redraft')?.outcome).toBe('kept');
  });
});
