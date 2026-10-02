// tests/atelier-voice-layer.test.ts — THE VOICE LAYER: A POLICY THAT IS DECLARED, AND A REWRITE THAT CHANGES NO FACT.
//
// Offline, against a scripted client. Each guard is tried both ways: the case it must refuse and the case it
// must let through. Nothing here says the voice pass makes a text sound like its author; no test can.
import { describe, it, expect } from 'vitest';
import { measureInvariance, makePolicy, split, carries, featureTrait } from '../core/voice/transfer.js';
import { decideRegister, registerOfRequest, normaliseRegister, registerThreshold, registerDistance } from '../core/voice/register.js';
import { voiceIntegrity, factsMissing } from '../core/voice/integrity.js';
import { pairProblem, pairCandidates, nearestPairs, pairsHash, type PairBank } from '../core/voice/pairs.js';
import { voicePass } from '../core/voice/pass.js';
import { buildRetrievalIndex } from '../core/fidelity/retrieval.js';
import { releaseId } from '../core/fidelity/release.js';
import { DEFAULT_SETTINGS } from '../core/fidelity/types.js';
import { unmetered, type InferenceClient } from '../core/inference/client.js';

describe('transfer is a policy, never a finding', () => {
  it('one register shows nothing: every feature is unknown', () => {
    expect(measureInvariance({ post: [10, 11, 12, 13, 14] })).toEqual({ kind: 'unknown' });
  });
  it('a feature that holds still between two registers is invariant, with its interval', () => {
    // It takes many pieces: with a handful per register the interval is wider than a quarter of the spread.
    const many = (shift: number): number[] => Array.from({ length: 220 }, (_, i) => 10 + ((i * 7 + shift) % 11));
    const s = measureInvariance({ post: many(0), speech: many(3) });
    expect(s.kind).toBe('invariant');
    expect(measureInvariance({ post: many(0).slice(0, 8), speech: many(3).slice(0, 8) }).kind).toBe('unknown');
  });
  it('a feature that moves between registers stays unknown, and so does a register with too few pieces', () => {
    expect(measureInvariance({ post: [10, 11, 12, 13, 14, 15], speech: [30, 31, 32, 33, 34, 35] })).toEqual({ kind: 'unknown' });
    expect(measureInvariance({ post: [10, 11, 12, 13, 14, 15], speech: [10, 12] })).toEqual({ kind: 'unknown' });
  });
  it('only what the owner marked, or what was measured, carries', () => {
    const p = makePolicy('abc', ['post'], { c1: { kind: 'owner-transfer', ratifiedAt: '2026-10-02T00:00:00Z' }, c2: { kind: 'unknown' } }, '2026-10-02T00:00:00Z');
    expect(split(p, ['c1', 'c2', featureTrait('paragraphWords')])).toEqual({ carried: ['c1'], unknown: ['c2', 'f:paragraphWords'] });
    expect(carries(null, 'c1')).toBe(false);
    // `unknown` is the default and is never stored, so striking a trait returns the policy to the same hash.
    expect(p.hash).toBe(makePolicy('abc', ['post'], { c1: { kind: 'owner-transfer', ratifiedAt: '2026-10-02T00:00:00Z' } }, 'later').hash);
  });
});

describe('the register is declared', () => {
  it('a document type named in the request decides, the first one named', () => {
    expect(registerOfRequest('Write a white paper on storage')).toBe('white-paper');
    expect(registerOfRequest('Write a post about our quarterly report')).toBe('post');
    expect(registerOfRequest('Explain how the cache works')).toBeNull();
    expect(normaliseRegister('Blog Post')).toBe('post');
  });
  it('in, out, and assumed when the request names nothing', () => {
    expect(decideRegister(['post'], 'Write a blog post on caching', undefined).status).toBe('in');
    expect(decideRegister(['post'], 'Draft the contract for the pilot', undefined)).toMatchObject({ status: 'out', request: 'contract', source: 'keyword' });
    expect(decideRegister(['post'], 'Explain how the cache works', undefined)).toMatchObject({ status: 'assumed-in', source: 'none' });
    // What the person declares wins over what the request happens to mention.
    expect(decideRegister(['post'], 'Write a post about the contract', 'contract')).toMatchObject({ status: 'out', source: 'declared' });
  });
  it('the lexical distance is computed against the corpus\'s own threshold, and decides nothing', () => {
    const para = (topic: string, i: number): string => `The ${topic} team shipped a new ${topic} pipeline in week ${i} and measured how the ${topic} latency moved after the ${topic} change went out to every region we serve today and tomorrow, with the on-call engineer watching the dashboards for an hour.`;
    const index = buildRetrievalIndex(['cache', 'queue', 'index', 'shard'].map((t, k) => ({ id: `p${k}`, text: [1, 2, 3].map((i) => para(t, i)).join('\n\n') })));
    const threshold = registerThreshold(index);
    expect(threshold).not.toBeNull();
    const d = registerDistance(index, para('cache', 9), threshold);
    expect(d?.value).toBeLessThan(1);
    expect(decideRegister(['post'], 'Draft the contract', undefined, d).status).toBe('out');
  });
});

describe('a voice rewrite may change every word and no fact', () => {
  const content = 'In March 2024 the team at Stripe cut checkout latency by 40% after moving the session cache closer to the edge, and the change may hold for larger merchants too.';
  it('a rewrite that keeps the facts and the strength is kept', () => {
    const voice = 'Stripe moved the session cache closer to the edge in March 2024. Checkout latency fell by 40%. For larger merchants the change may hold too.';
    expect(voiceIntegrity(content, voice, null)).toEqual({ ok: true });
  });
  it('a lost figure, an added name, a dropped qualifier and an added negation are each refused', () => {
    expect(voiceIntegrity(content, content.replace('40%', 'a lot'), null)).toMatchObject({ ok: false, check: 'facts' });
    expect(voiceIntegrity(content, content.replace('the team at Stripe', 'the team at Stripe and Adyen'), null)).toMatchObject({ ok: false, check: 'facts' });
    expect(voiceIntegrity(content, content.replace('may hold', 'holds'), null)).toMatchObject({ ok: false, check: 'strength' });
    expect(voiceIntegrity(content, content.replace('cut checkout', 'never cut checkout'), null)).toMatchObject({ ok: false, check: 'strength' });
  });
  it('a rewrite outside the length band, or lifting the author\'s words, is refused', () => {
    expect(voiceIntegrity(content, 'In March 2024 Stripe cut checkout latency by 40%; it may hold.', null)).toMatchObject({ ok: false, check: 'length' });
    const lifted = () => ({ shared6: 9, longestShared: 14 });
    expect(voiceIntegrity(content, content, lifted)).toMatchObject({ ok: false, check: 'copying' });
  });
  it('a name moved to the start of a sentence is not a lost name', () => {
    expect(factsMissing('We asked Stripe for the logs.', 'Stripe gave us the logs we asked for.')).toEqual([]);
  });
});

describe('the pair bank', () => {
  const author = 'We shipped the migration on a Friday, which everyone tells you not to do, and by Monday the queue had drained itself: 1,200 jobs gone, no pages, and one very quiet standup where nobody wanted to be the first to say it had worked.';
  it('keeps a plain rewrite with the same facts, and refuses one that drops a figure or returns the original', () => {
    const neutral = 'The migration was released on a Friday, contrary to common advice. By Monday the queue had emptied, with 1,200 jobs processed and no alerts. The following standup meeting was quiet because no one wished to state first that it had succeeded.';
    expect(pairProblem(author, neutral)).toBeNull();
    expect(pairProblem(author, neutral.replace('1,200 jobs', 'many jobs'))).toBe('facts');
    expect(pairProblem(author, author)).toBe('unchanged');
    expect(pairProblem(author, 'The migration worked.')).toBe('length');
  });
  it('takes paragraphs of 40 to 300 words only', () => {
    expect(pairCandidates([{ piece: 'a', text: author }, { piece: 'a', text: 'Too short to pair.' }])).toHaveLength(1);
  });
});

describe('the voice pass', () => {
  const bank = ((): PairBank => {
    const pairs = [0, 1, 2].map((i) => ({ id: `p${i}`, piece: 'a', neutraliser: 'scripted',
      neutral: `The cache migration number ${i} was released and the latency of the checkout service was measured afterwards by the platform team.`,
      author: `We shipped cache migration ${i}. Then we watched checkout latency, the way you watch a kettle.` }));
    return { version: 1, sourceHash: 'x', pairs, rejected: { facts: 0, length: 0, unchanged: 0, failed: 0 }, builtAt: 'now', hash: pairsHash(pairs) };
  })();
  const client = (answer: (asked: string) => string): InferenceClient => ({
    complete: (req) => Promise.resolve({ json: { paragraph: answer(req.userMessage) }, termination: { kind: 'COMPLETE' }, cost: unmetered(), costUsd: 0 } as never),
  });
  const text = 'The platform team released the cache migration in March 2024 and the checkout latency fell by 40% in the first week, which may continue as more merchants move over to the new cache.\n\n'
    + 'A second cache migration followed in June 2024 and the checkout latency fell by a further 12% for the merchants on the platform, though the team expects smaller gains from here.';

  it('shows the pairs nearest in content', () => {
    expect(nearestPairs(bank, 'the cache migration and checkout latency', 2)).toHaveLength(2);
    expect(nearestPairs(bank, 'zebras', 2)).toEqual([]);
  });
  it('keeps a paragraph that holds its facts and refuses, whole, one that does not', async () => {
    const out = await voicePass(client((asked) => (asked.includes('June 2024')
      // the second paragraph comes back with its figure changed
      ? 'Then June 2024. A second cache migration, and checkout latency fell a further 20% for merchants on the platform, though the team expects smaller gains from here.'
      : 'March 2024: the platform team released the cache migration. Checkout latency fell by 40% in the first week. That may continue as more merchants move over to the new cache.')),
    { spentUsd: 0, capUsd: 1, maxCalls: 10 }, text, bank, null);
    expect(out.paragraphs.map((p) => p.kept)).toEqual([true, false]);
    expect(out.paragraphs[1].check).toBe('facts');
    expect(out.text).toContain('March 2024: the platform team');
    expect(out.text).toContain('fell by a further 12%');
  });
});

describe('off until asked for', () => {
  it('the default carries no voice mode, and a release without one hashes as it always did', () => {
    expect('voice' in DEFAULT_SETTINGS).toBe(false);
    const r = { parent: null, standardVersionHash: 's', skillVersionHash: 'k', settings: DEFAULT_SETTINGS, notes: [], profileHash: null, retrievalHash: null, createdAt: 'a', why: 'b' };
    expect(releaseId({ ...r, settings: { ...DEFAULT_SETTINGS, voice: undefined } })).toBe(releaseId(r));
    expect(releaseId({ ...r, settings: { ...DEFAULT_SETTINGS, voice: 'incontext' } })).not.toBe(releaseId(r));
  });
});
