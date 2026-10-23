// tests/atelier-fix-review-r3.test.ts — NINE DEFECTS A REVIEW FOUND IN THE IN-PLACE FIX AND THE AUTHOR'S RATES.
//
// Each case is an invented piece or profile, with its expected value worked out by hand in the comment beside it:
// a writer that answers nothing keeps the sentence; the owner's rule beats a learned rate; a rejected proposal stays
// monitored; a named sentence that also stands unnamed is the one that changed; a named span may not invent a figure or a
// name, and a fix is delivered as a run is; a list stays a list; the owner's own words are never banned; a provider error
// writes the piece again whole; and the first person is read at the output's own length.
import { describe, it, expect } from 'vitest';
import { fixSpans, fixTargets, sentenceDiff } from '../core/loop/surgical-fix.js';
import { applyRepair, type Applied, type Reverted } from '../core/loop/repair.js';
import { reintroducedRuns } from '../core/loop/corrections.js';
import { authorRatesNote, signalChecks, ruledFeatures } from '../core/loop/graded.js';
import { gradedRules } from '../core/loop/run-repair.js';
import { withAuthorRates } from '../core/fidelity/profile.js';
import { ratifiedProfile } from '../cli/fidelity.js';
import { deliveryOutcome, STRICT_EXIT } from '../core/eval/consequence.js';
import type { InferenceClient } from '../core/inference/client.js';
import type { FeatureBand, FidelityProfile } from '../core/fidelity/types.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import type { Delivery } from '../core/eval/record.js';
import { anInferenceResult } from './fixtures.js';
import { piece } from './fixtures/author-rates-corpus.js';

// Six sentences: a heading, a paragraph of two, a list of two, a paragraph of two. Sentence 2 and sentence 6 are the same.
const MD = '# Harbour notes\n\nThe ferry leaves at dawn. The pier is wet.\n\n- rope by the gate\n- lamps on the wall\n\nGulls wait on the roof. The pier is wet.';
const answering = (reply: unknown): InferenceClient => ({ complete: async () => anInferenceResult({ json: reply === undefined ? null : { reply } }) });

describe('1. a writer that answers nothing keeps the sentence', () => {
  it('no reply, or an empty one, leaves the span as it was and says so', async () => {
    for (const client of [answering(undefined), answering(''), answering(null)]) {
      const r = await fixSpans(client, { spentUsd: 0, capUsd: 1 }, MD, [2], 'make it warmer', []);
      expect(r.text).toBe(MD);
      expect(r.applied).toEqual([]);
      expect(r.reverted).toEqual([{ id: 1, kind: 'CUT', lost: ['nothing: the writer returned no text for it'] }]);
    }
  });
  it('an empty work field in a reply is the writer\'s cut, as before', async () => {
    const r = await fixSpans(answering('<work></work>'), { spentUsd: 0, capUsd: 1 }, MD, [2], 'drop it', []);
    expect(r.text).toBe(MD.replace(' The pier is wet.\n\n- rope', '\n\n- rope'));
  });
});

const rateBand = (role: FeatureBand['role'] = 'SIGNAL'): FeatureBand => ({ id: 'sentenceP50', cls: 'all', band: [13.5, 16.5], median: 15, spread: 1, n: 5, role, auc: null, rate: true });
const profileOf = (bands: FeatureBand[]): FidelityProfile => ({ version: 1, corpusHash: 'c', detector: null, hash: '', bands });
const shortOnly = { requirements: [{ requirementId: 'r1', statement: 'Keep sentences under ten words.', authority: 'EXPERT_CONFIRMED', measurement: { observer: 'FEATURE', params: { feature: ['sentenceP50'], minValue: 0, maxValue: 10 } } }] } as unknown as StandardVersion;

describe('2. the owner\'s rule beats a learned rate', () => {
  it('a ratified rule on the typical sentence: the rate is not said', () => {
    const p = ratifiedProfile(profileOf([rateBand()]), shortOnly);
    expect([p.bands[0].role, p.bands[0].band]).toEqual(['RULE', [0, 10]]);
    expect(authorRatesNote(p)).toBe('');
  });
  it('a profile made before the rule: neither said nor steered while the standard rules the feature', () => {
    const p = profileOf([rateBand()]);
    const ruled = ruledFeatures(shortOnly);
    expect([...ruled]).toEqual(['sentenceP50']);
    expect(authorRatesNote(p, ruled)).toBe('');
    expect(authorRatesNote(p)).toBe('How I write, counted over my own pieces: sentences around 15 words. Write at these rates.');
    expect(signalChecks(piece(80), p, ruled)).toEqual([]);
    expect([...gradedRules(shortOnly, 'all', p).keys()].filter((k) => k.startsWith('signal·'))).toEqual([]);
    expect([...gradedRules({ requirements: [] }, 'all', p).keys()]).toEqual(['signal·sentenceP50']);
  });
  it('round 4, item 5: a first-person rate a profile made before kept as a signal is measured, never said or steered', () => {
    const p = profileOf([{ id: 'firstSingular', cls: 'all', band: [1, 9], median: 4.587, spread: 1, n: 5, role: 'SIGNAL', auc: null, rate: true }]);
    expect(authorRatesNote(p)).toBe('');
    expect([...gradedRules({ requirements: [] }, 'all', p).keys()]).toEqual([]);
  });
});

describe('3. a rate band keeps whether it was the owner\'s to adopt', () => {
  it('withAuthorRates carries proposable, so a proposal the owner did not adopt stays monitored', () => {
    const texts = [piece(80), piece(12), piece(14), piece(16), piece(18)];
    const out = withAuthorRates([{ id: 'sentenceP50', cls: 'all', band: [10, 12], median: 11, spread: 1, n: 5, role: 'SIGNAL', auc: 0.9, proposable: true }], texts);
    const b = out.find((x) => x.id === 'sentenceP50');
    expect([b?.rate, b?.proposable, b?.band]).toEqual([true, true, [13.5, 16.5]]);
    expect(ratifiedProfile(profileOf(out), { requirements: [] } as unknown as StandardVersion).bands.find((x) => x.id === 'sentenceP50')?.role).toBe('MONITOR');
  });
});

describe('4. a named sentence the piece also carries unnamed is the one that changed', () => {
  it('sentence 2 named and changed; its twin, sentence 6, stays: nothing outside changed', () => {
    const after = MD.replace('The ferry leaves at dawn. The pier is wet.', 'The ferry leaves at dawn. The pier is dry by noon.');
    expect(sentenceDiff(MD, after, [2])).toEqual({ total: 6, changed: 1, outside: 0 });
  });
});

describe('5. a named span may change its claim, never invent; a fix is delivered as a run is', () => {
  const t = fixTargets(MD, [1], 'say it leaves at six', 'The ferry company runs two boats.');
  const run = (text: string): { out: string; reverted: Reverted[] } => { const reverted: Reverted[] = []; const applied: Applied[] = []; return { out: applyRepair(MD, t, [{ id: 1, text }], reverted, applied), reverted }; };
  it('a figure the person gave is allowed; one nobody gave is refused, and the span stays', () => {
    expect(run('The ferry leaves at six.').out).toContain('The ferry leaves at six.');
    const r = run('The ferry leaves at 7 with 40 passengers.');
    expect(r.out).toBe(MD);
    expect(r.reverted[0].kind).toBe('MEANING');
    expect(r.reverted[0].lost[0]).toContain('"7"');
  });
  it('a name nobody gave is refused; a name the material carries is allowed', () => {
    expect(run('The ferry to Northwick leaves at dawn.').out).toBe(MD);
    expect(run('The ferry company boat leaves at dawn.').out).toContain('The ferry company boat leaves at dawn.');
  });
  const blocked = { decision: 'BLOCK', why: [] } as unknown as Delivery;
  const ship = { decision: 'SHIP', why: [] } as unknown as Delivery;
  it('strict and blocked: refused with the strict exit; marked when allowed; not strict: printed as blocked, exit 1', () => {
    expect(deliveryOutcome(true, blocked, false, false)).toMatchObject({ refused: true, exit: STRICT_EXIT });
    expect(deliveryOutcome(true, blocked, false, true)).toMatchObject({ refused: false, exit: STRICT_EXIT, head: 'NOT CONFORMANT, delivered because --allow-nonconformant was given:\n\n' });
    expect(deliveryOutcome(false, blocked, false, false)).toMatchObject({ refused: false, exit: 1, head: 'BLOCKED (not for use as it is):\n\n' });
    expect(deliveryOutcome(true, ship, true, false)).toEqual({ nonconformant: false, refused: false, exit: 0, head: '' });
  });
});

describe('6. a list stays a list', () => {
  it('sentence 2 and the list item after it are two spans; the breaks between them are never written', () => {
    const ts = fixTargets(MD, [2, 3, 4], 'x');
    expect(ts.map((x) => x.text)).toEqual(['The pier is wet.', 'rope by the gate', 'lamps on the wall']);
    const out = applyRepair(MD, ts, [{ id: 1, text: 'The pier is dry.' }, { id: 2, text: 'rope by the old gate' }, { id: 3, text: 'lamps on the stone wall' }]);
    expect(out).toBe('# Harbour notes\n\nThe ferry leaves at dawn. The pier is dry.\n\n- rope by the old gate\n- lamps on the stone wall\n\nGulls wait on the roof. The pier is wet.');
  });
  it('two sentences on one line still join into one span', () => {
    expect(fixTargets(MD, [5, 6], 'x').map((x) => x.text)).toEqual(['Gulls wait on the roof. The pier is wet.']);
  });
});

describe('7. the owner\'s own words are never banned', () => {
  const removed = ['At the end of the day we shipped it'];
  const later = 'Costs rose, and at the end of the day the board agreed.';
  it('a window their method, statements or examples carry is dropped from what was removed', () => {
    expect(reintroducedRuns(later, removed, 'We shipped it on Friday.').map((r) => r.text)).toEqual(['at the end of the day']);
    expect(reintroducedRuns(later, removed, 'We shipped it on Friday.', 'Close on what happened at the end of the day.')).toEqual([]);
  });
});

describe('8. a provider or budget error writes the piece again whole', () => {
  it('fixSpans does not throw: nothing is spliced, and the error is returned for the caller to say', async () => {
    const failing: InferenceClient = { complete: async () => { throw new Error('provider said 529: overloaded\nmore'); } };
    const r = await fixSpans(failing, { spentUsd: 0, capUsd: 1 }, MD, [2], 'make it warmer', []);
    expect([r.text, r.applied, r.error]).toEqual([MD, [], 'provider said 529: overloaded']);
    const broke = await fixSpans(answering('<work>x</work>'), { spentUsd: 0, capUsd: 0.01 }, MD, [2], 'make it warmer', []);
    expect(broke.text).toBe(MD);
    expect(broke.error).toBeTruthy();
  });
});
