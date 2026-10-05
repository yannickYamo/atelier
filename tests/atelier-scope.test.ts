// tests/atelier-scope.test.ts — WHAT IS DETECTABLE ABOUT HOW MUCH AN AUTHOR WRITES, AND WHAT IS NOT.
//
// Offline, against a scripted client. A length is never read off answers alone; what an answer adds beyond what
// was asked is read per example and must be quoted from it; a request is kept apart from the author's text; and
// whether a reply gives what the request asks is a reading code validates.
import { describe, it, expect } from 'vitest';
import { splitRequest, looksLikeUnsplitPair } from '../core/intake/extract.js';
import { groundScope, deriveScope, describeScope, spreadByKind, SCOPE_READER_VERSION, MIN_PER_KIND } from '../core/compiler/scope.js';
import { usualLength } from '../core/compiler/voice.js';
import { coverageOf, modelJudge } from '../core/loop/context-judge.js';
import { authorFloor } from '../core/fidelity/twosample.js';
import { mulberry32 } from '../core/fidelity/qualify.js';
import { renderPanel, type EvalSummary } from '../core/eval/summary.js';
import { unmetered, type InferenceClient } from '../core/inference/client.js';

const scripted = (answer: unknown): InferenceClient => ({ complete: () => Promise.resolve({ json: answer, termination: { kind: 'COMPLETE' }, cost: unmetered(), costUsd: 0 } as never) });
const budget = (): { spentUsd: number; capUsd: number; maxCalls: number } => ({ spentUsd: 0, capUsd: 5, maxCalls: 20 });

describe('an example may carry the request it answers, and the request is not the author\'s writing', () => {
  it('front matter: the request comes out, the answer stays, other keys are kept', () => {
    expect(splitRequest('---\nrequest: How do I undo the last commit?\n---\ngit reset --soft HEAD~1\n')).toEqual({ text: 'git reset --soft HEAD~1\n', request: 'How do I undo the last commit?' });
    expect(splitRequest('---\ntopic: git\nrequest: "Undo it: how?"\n---\nRun reset.\n')).toEqual({ text: '---\ntopic: git\n---\nRun reset.\n', request: 'Undo it: how?' });
    expect(splitRequest('---\nrequest: |\n  Walk me through PKCE.\n  I want detail.\ntopic: auth\n---\nPKCE has three steps.\n'))
      .toEqual({ text: '---\ntopic: auth\n---\nPKCE has three steps.\n', request: 'Walk me through PKCE.\nI want detail.' });
  });
  it('headings: a Request section then an Answer section', () => {
    expect(splitRequest('## Request\nWhat is 2 to the 10?\n\n## Answer\n1,024.\n')).toEqual({ text: '1,024.\n', request: 'What is 2 to the 10?' });
  });
  it('bold labels and Q: / A:, when the file begins with the request', () => {
    expect(splitRequest('**Request:** How do I undo it?\n\n**Answer:** Use reset.\n')).toEqual({ text: 'Use reset.\n', request: 'How do I undo it?' });
    expect(splitRequest('**Question**\nWhy is it slow?\n**Response**\nThe cache never expires.\n')).toEqual({ text: 'The cache never expires.\n', request: 'Why is it slow?' });
    expect(splitRequest('Q: What is 2 to the 10?\nA: 1,024.\n')).toEqual({ text: '1,024.\n', request: 'What is 2 to the 10?' });
  });
  it('an answer label inside a code fence does not split the file there', () => {
    const raw = '## Request\nShow me the template.\n\n```md\n## Answer\nfake\n```\n\n## Answer\nHere it is.\n';
    expect(splitRequest(raw)).toEqual({ text: 'Here it is.\n', request: 'Show me the template.\n\n```md\n## Answer\nfake\n```' });
  });
  it('a file that looks like a pair and is not split stays whole, and is named', () => {
    const before = 'Some notes first.\n\n## Request\nHow?\n\n## Answer\nLike this.\n';
    expect(splitRequest(before)).toEqual({ text: before, request: null });
    expect(looksLikeUnsplitPair(before)).toBe(true);
    // a post with an FAQ, or the word "question" in prose, is the author's writing: whole, and no warning for prose
    const faq = '# Notes\n\nA post.\n\nQ: Is it fast?\nA: Yes.\n';
    expect(splitRequest(faq)).toEqual({ text: faq, request: null });
    expect(looksLikeUnsplitPair('The question is whether the answer holds.\n')).toBe(false);
    expect(looksLikeUnsplitPair('## Request\nHow?\n\n## Answer\nLike this.\n')).toBe(false);
  });
  it('a file with neither layout is returned whole, byte for byte', () => {
    for (const raw of ['Just an answer.\n', '---\ntopic: git\n---\nBody.\n', '## Request handling\nWe handle requests.\n', '---\nrequest:\n---\nBody\n']) expect(splitRequest(raw)).toEqual({ text: raw, request: null });
  });
});

describe('a length is not read off answers alone', () => {
  const short = ['1,024.', 'Run the migration, then restart the worker.', 'No: the cache never expires, so the old value stays.', 'Yes. Use reset, not revert, on a branch nobody else has pulled.'];
  it('with no request beside them, no length is stated, and the skill says why', () => {
    const p = groundScope(short.map((text) => ({ text, request: null })), null, null);
    expect(p).toMatchObject({ examples: 4, paired: 0, lengths: {}, beyond: [] });
    const d = describeScope(p);
    expect(d).toContain('How much I write follows the request, never a habit of length.');
    expect(d).toContain('No length is learned from them.');
    expect(d).not.toMatch(/\d+ words/);
  });
  it('the usual length of writing has no floor of 100 words', () => {
    expect(usualLength(short)?.[1]).toBeLessThan(100);
    expect(usualLength(Array.from({ length: 5 }, (_, i) => Array.from({ length: 900 + i * 40 }, () => 'word').join(' ')))).toEqual([900, 1000]);
  });
  it('a length is stated only for a kind of request seen often enough, as a record', () => {
    const ex = [...Array.from({ length: MIN_PER_KIND }, (_, i) => ({ text: Array.from({ length: 30 + i * 10 }, () => 'word').join(' '), request: `Small ask ${i}` })),
      { text: Array.from({ length: 400 }, () => 'word').join(' '), request: 'Walk me through it in detail' }];
    const raw = ex.map((_, i) => ({ example: i + 1, asked: i < MIN_PER_KIND ? 'NEITHER' : 'DETAIL', beyond: [] }));
    const p = groundScope(ex, raw, 'r');
    expect(p.lengths.NEITHER).toMatchObject({ n: MIN_PER_KIND });
    expect(p.lengths.DETAIL).toBeUndefined();
    expect(describeScope(p)).toMatch(/as a record and not a target: when the request asked for nothing special, \d+ to \d+ words \(3 examples\)\./);
  });
});

describe('what an answer adds beyond what was asked is read, quoted and counted', () => {
  const ex = [
    { text: 'Great question! Use reset. Let me know if you want the revert version.', request: 'How do I undo the last commit?' },
    { text: 'Use reset.', request: null },
    { text: 'Restart the worker. Note that this drops the queue.', request: 'How do I apply it?' },
  ];
  it('a finding must quote its own answer, name a known kind, and need no request it was not shown', () => {
    const p = groundScope(ex, [
      { example: 1, asked: 'NEITHER', beyond: [{ kind: 'preamble', quote: 'Great question!' }, { kind: 'offer', quote: 'Let me know if you want the revert version.' }, { kind: 'flourish', quote: 'Use reset.' }] },
      { example: 2, asked: 'DETAIL', beyond: [{ kind: 'restates-request', quote: 'Use reset.' }, { kind: 'caveat', quote: 'not in this answer' }] },
      { example: 3, asked: 'NEITHER', beyond: [{ kind: 'caveat', quote: 'Note that this drops the queue.' }] },
      { example: 9, asked: 'NEITHER', beyond: [] }, { example: 1, asked: 'BRIEF', beyond: [] },
    ], 'r');
    const by = Object.fromEntries(p.beyond.map((b) => [b.kind, `${b.count}/${b.of}`]));
    expect(by).toMatchObject({ preamble: '1/3', offer: '1/3', caveat: '1/3', 'restates-request': '0/2', recap: '0/3' });
    // an unknown kind, a kind that needs a request it was not shown, a quote not in the answer, an example that does not exist, one named twice
    expect(p.dropped).toBe(5);
    const d = describeScope(p);
    expect(d).toMatch(/a preamble before the answer .*: sometimes \(1 of 3\), e\.g\. "Great question!"/);
    expect(d).toMatch(/a recap or summary of what was just said: never \(0 of 3\)/);
    expect(d).toContain('This holds at any length');
  });
  it('one call reads the examples; the profile names its reader', async () => {
    const all = [1, 2, 3].map((n) => ({ example: n, asked: null, beyond: n === 3 ? [{ kind: 'caveat', quote: 'Note that this drops the queue.' }] : [] }));
    const p = await deriveScope(scripted({ examples: all }), budget(), ex, 'm');
    expect(p.reader).toBe(`${SCOPE_READER_VERSION}:m`);
    expect(p.beyond.find((b) => b.kind === 'caveat')).toMatchObject({ count: 1, of: 3 });
  });
  const twelve = Array.from({ length: 12 }, (_, i) => ({ text: `Answer ${i}. Note that step ${i} drops the queue.`, request: null }));
  it('a habit is counted over every example, never over the ones the reader answered for', () => {
    const raw = twelve.map((_, i) => ({ example: i + 1, asked: null, beyond: i < 3 ? [{ kind: 'caveat', quote: `Note that step ${i} drops the queue.` }] : [] }));
    const d = describeScope(groundScope(twelve, raw, 'r'));
    expect(d).toMatch(/a caveat or a warning nobody asked for: sometimes \(3 of 12\)/);
    expect(d).toMatch(/a preamble before the answer .*: never \(0 of 12\)/);
  });
  it('a reader that returned two of twelve examples states no habit at all', () => {
    const p = groundScope(twelve, [{ example: 1, asked: null, beyond: [] }, { example: 2, asked: null, beyond: [] }], 'r');
    expect(p).toMatchObject({ unread: 10, beyond: [] });
    const d = describeScope(p);
    expect(d).not.toMatch(/\(\d+ of 2\)/);
    expect(d).toContain('could not be counted: 10 of my 12 examples could not be read');
    // one unread in twelve is under the limit: the habit is stated, over all twelve
    const most = groundScope(twelve, twelve.slice(0, 11).map((_, i) => ({ example: i + 1, asked: null, beyond: [] })), 'r');
    expect(most.unread).toBe(1);
    expect(most.beyond.every((b) => b.of === 12)).toBe(true);
  });
});

describe('whether a reply gives what the request asks is a reading, validated in code', () => {
  const task = 'Plan a migration from integer IDs to UUIDs, with rollback points, and say how long it takes.';
  const reply = 'First add a nullable uuid column and backfill it in batches. Then switch reads, then writes.';
  it('a part must quote the request; "covered" must quote the reply or it is unclear, never covered', () => {
    const c = coverageOf(task, reply, { parts: [
      { words: 'Plan a migration from integer IDs to UUIDs', covered: true, where: 'add a nullable uuid column' },
      { words: 'with rollback points', covered: false, where: null },
      { words: 'say how long it takes', covered: true, where: 'it takes two weeks' },
      { words: 'a part the request never names', covered: false, where: null },
      { words: 'with rollback points', covered: true, where: 'switch reads' },
    ] });
    expect(c?.parts).toEqual([
      { words: 'Plan a migration from integer IDs to UUIDs', covered: true, where: 'add a nullable uuid column' },
      { words: 'with rollback points', covered: false },
      { words: 'say how long it takes', covered: null },
    ]);
    expect(coverageOf(task, reply, { nope: 1 })).toBeNull();
  });
  it('the judge reads it once per text', async () => {
    let calls = 0;
    const j = modelJudge({ complete: () => { calls += 1; return Promise.resolve({ json: { parts: [{ words: 'with rollback points', covered: false, where: null }] }, termination: { kind: 'COMPLETE' }, cost: unmetered(), costUsd: 0 } as never); } }, budget());
    expect((await j.covers?.(task, reply))?.parts).toEqual([{ words: 'with rollback points', covered: false }]);
    await j.covers?.(task, reply);
    expect(calls).toBe(1);
  });
});

describe('the floor is computed at the size of the comparison', () => {
  const rand = mulberry32(5);
  const gauss = (): number => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  const author = Array.from({ length: 24 }, () => Array.from({ length: 4 }, () => gauss()));
  it('one side of the given size against all the rest, and none when a side would be too small', () => {
    expect(authorFloor(author, 1, 20, 8)).toMatchObject({ size: 8, other: 16 });
    expect(authorFloor(author, 1, 20)).toMatchObject({ size: 12, other: 12 });
    expect(authorFloor(author, 1, 20, 5)).toBeNull();
    expect(authorFloor(author, 1, 20, 20)).toBeNull();
  });
});

describe('the panel under strict delivery', () => {
  const base: EvalSummary = {
    schema: 1, invocationId: 'i1', skill: 'answers', at: 't', release: null, model: 'm', drafts: 1, costUsd: 0.1, durationMs: 1000,
    result: { conformant: false, reasons: ['1 required rule broken (c1 "x")'] },
    gates: { required: { held: 0, applicable: 1, broken: [{ id: 'c1', detail: 'd', label: 'x' }] },
      claims: { state: 'checked', delivered: 0, unconfirmed: 0, cut: 0, listed: 0, instrument: null, measured: null, answers: true },
      copying: null, format: { kind: 'none', words: null, withheld: 0 }, applicability: { applied: 1, notApplicable: 0, waived: [] } },
    fidelity: null, monitors: { detector: null, taste: null, coverage: { asked: 3, given: 1, missing: ['with rollback points'], unclear: 1 } },
    delivery: { mode: 'strict', delivered: false, redraws: 2 }, notMeasured: ['x'],
  };
  it('says the output was not delivered, and what of the request it leaves out', () => {
    // A long line wraps at a " · ", which the wrap drops: read the panel with every separator as a space.
    const p = renderPanel(base).replace(/\n {23}/g, ' ').replace(/ · /g, ' ');
    expect(p).toMatch(/NOT DELIVERED \(strict delivery\): the text is kept with the record/);
    expect(p).toMatch(/request coverage {2}1 of 3 thing\(s\) the request asks for are given not found: "with rollback points" 1 unclear not qualified yet/);
    expect(renderPanel({ ...base, delivery: { mode: 'strict', delivered: true, redraws: 2 } })).toMatch(/DELIVERED ANYWAY \(--allow-nonconformant\)/);
    expect(renderPanel({ ...base, result: { conformant: true, reasons: [] } })).not.toMatch(/DELIVERED/);
  });
});

describe('the examples shown are spread across the kinds of request the corpus holds', () => {
  const w = (n: number): string => Array.from({ length: n }, () => 'word').join(' ');
  const texts = [w(200), w(210), w(190), w(220), w(8), w(12), w(40)];
  const kinds = ['explain', 'explain', 'explain', 'explain', 'fact', 'code', null] as const;
  it('every kind is shown at least once, however small the budget, and the largest kind does not crowd the rest out', () => {
    const tight = spreadByKind(texts, kinds, 50);
    expect(new Set(tight.map((i) => kinds[i]))).toEqual(new Set(['explain', 'fact', 'code', null]));
    expect(tight).toHaveLength(4);
    const roomy = spreadByKind(texts, kinds, 5000);
    expect(roomy).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('the kind is read with the scope, and a kind outside the list is not kept', () => {
    const p = groundScope([{ text: 'a b c', request: null }, { text: 'd e f', request: null }], [{ example: 1, asked: null, kind: 'code', beyond: [] }, { example: 2, asked: null, kind: 'poem', beyond: [] }], 'r');
    expect(p.kinds).toEqual(['code', null]);
  });
});
