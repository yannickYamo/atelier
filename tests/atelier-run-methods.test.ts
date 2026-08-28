/**
 * W2 — the methodology channel: "you wrote this method down; does your skill carry it?"
 *
 * Driven by a stub client, so the whole extraction path is exercised without spending anything. The
 * cases that matter are the REFUSALS: an obligation whose quote is not in the document must be
 * dropped, and dropping it must not take the honest methods down with it.
 */
import { describe, it, expect } from 'vitest';
import {
  signatureFrom, runMethodExtraction, describeMethodRun,
} from '../core/discovery/run-methods.js';
import type { InferenceClient, InferenceResult, Budget } from '../core/inference/client.js';

const DOC = [
  'Every recommendation must name the decision it changes.',
  'Always state the confidence level alongside any number you report.',
  'You may include a comparison table when more than three options are live.',
].join('\n\n');

const scope = { standardDimensions: ['strategy'] };
const budget = (): Budget => ({ spentUsd: 0, capUsd: 5 });

function stub(methods: unknown): InferenceClient {
  return {
    async complete(): Promise<InferenceResult> {
      return { json: { methods }, modelId: 'stub', inputTokens: 0, cacheReadTokens: 0,
        cacheWriteTokens: 0, outputTokens: 0, cost: { basis: 'API_METERED' as const, billingUsd: 0 }, costUsd: 0, termination: { kind: 'COMPLETE' as const } };
    },
  };
}

const METHOD_NAMES_DECISION = {
  description: 'Every recommendation names the decision it changes',
  necessity: 'REQUIRED',
  obligations: [{
    describe: 'name the decision the recommendation changes',
    quote: 'Every recommendation must name the decision it changes.',
    phrases: ['names the decision', 'decision it changes', 'which decision this changes'],
  }],
};

describe('signatureFrom — the server composes the pattern', () => {
  it('escapes regex metacharacters so a phrase cannot become a pattern', () => {
    const sig = signatureFrom(['cost (usd)', 'a+b']);
    expect(() => new RegExp(sig)).not.toThrow();
    expect(new RegExp(sig, 'i').test('the cost (usd) column')).toBe(true);
    expect(new RegExp(sig, 'i').test('the cost xusdx column')).toBe(false);
  });

  it('is word-bounded — "test" must not match inside "latest"', () => {
    const sig = signatureFrom(['test coverage']);
    expect(new RegExp(sig, 'i').test('latest coverage')).toBe(false);
    expect(new RegExp(sig, 'i').test('our test coverage')).toBe(true);
  });

  it('tolerates reflowed whitespace, because markdown reflows', () => {
    const sig = signatureFrom(['names the decision']);
    expect(new RegExp(sig, 'i').test('it names   the\ndecision')).toBe(true);
  });

  it('WITNESSED: a hyphen must not defeat the detector', () => {
    // Real false alarm from the live check. classification/SKILL.md carries "Assumed-tagged with the
    // reasoning" and the obligation "tag every claim as Known or Assumed" was reported MISSING,
    // because `Assumed\\s+tag` does not match `Assumed-tagged`. Prose hyphenates and slashes the same
    // words freely; a space-only separator measures typography, not whether the rule is carried.
    const sig = signatureFrom(['Assumed tag', 'claim provenance']);
    expect(new RegExp(sig, 'i').test('Assumed-tagged with the reasoning')).toBe(true);
    expect(new RegExp(sig, 'i').test('Assumed tagged with the reasoning')).toBe(true);
    expect(new RegExp(sig, 'i').test('claim/provenance is recorded')).toBe(true);
  });

  it('and the limit is declared: different WORDS still read as missing', () => {
    // Not every false alarm is punctuation. The same live check reported the signal-weighting
    // obligation missing from a skill saying "Behavioral data: highest weight". No separator rule
    // reaches that, which is why a finding here is a candidate for a person to confirm.
    const sig = signatureFrom(['behavioral data first', 'evidence hierarchy']);
    expect(new RegExp(sig, 'i').test('Behavioral data: highest weight')).toBe(false);
  });

  it('declines rather than matching everything or nothing when no phrase is usable', () => {
    // A pattern matching everything reports the obligation present in every skill; one matching
    // nothing reports it missing in every skill. Both are worse than having no detector.
    expect(signatureFrom([])).toBe('');
    expect(signatureFrom(['a', 'of'])).toBe('');
  });
});

describe('runMethodExtraction', () => {
  const docs = new Map([['METHOD.md', DOC]]);

  it('finds an authored method that leaves no trace in the skill', async () => {
    const run = await runMethodExtraction(
      stub([METHOD_NAMES_DECISION]), budget(), docs, 'A skill that says nothing of the sort.', scope);
    expect(run.methods).toHaveLength(1);
    expect(run.missing).toHaveLength(1);
    expect(run.missing[0].sourceDoc).toBe('METHOD.md');
  });

  it('reports nothing missing when the skill carries the obligation', async () => {
    const run = await runMethodExtraction(
      stub([METHOD_NAMES_DECISION]), budget(), docs,
      'Each recommendation names the decision it changes.', scope);
    expect(run.missing).toHaveLength(0);
  });

  it('REFUSES an obligation quoting text the document does not contain', async () => {
    const invented = { ...METHOD_NAMES_DECISION, obligations: [{
      ...METHOD_NAMES_DECISION.obligations[0],
      quote: 'Always open with a one-line summary.',   // sensible, and nowhere in the document
    }] };
    const run = await runMethodExtraction(stub([invented]), budget(), docs, 'skill text', scope);
    expect(run.methods).toHaveLength(0);
    expect(run.problems).toHaveLength(1);
    expect(run.problems[0].problem).toContain('invented');
  });

  it('drops only the invented method, never the honest ones beside it', async () => {
    // toMethodSpecs throws on ANY problem, which would discard a whole document's real methods for
    // one hallucinated quote. This is the divergence that keeps the other findings.
    const invented = { description: 'invented', necessity: 'REQUIRED', obligations: [{
      describe: 'x', quote: 'This sentence is not in the document.', phrases: ['alpha beta gamma'] }] };
    const run = await runMethodExtraction(
      stub([METHOD_NAMES_DECISION, invented]), budget(), docs, 'nothing here', scope);
    expect(run.methods).toHaveLength(1);
    expect(run.methods[0].description).toContain('names the decision');
    expect(run.problems).toHaveLength(1);
    expect(run.missing).toHaveLength(1);
  });

  it('attributes sourceDoc from the server, so a model mislabel cannot refuse a good extraction', async () => {
    const mislabelled = { ...METHOD_NAMES_DECISION, sourceDoc: 'SOMETHING_ELSE.md' };
    const run = await runMethodExtraction(stub([mislabelled]), budget(), docs, 'x', scope);
    expect(run.problems).toHaveLength(0);
    expect(run.methods[0].sourceDoc).toBe('METHOD.md');
  });

  it('only REQUIRED methods can be found missing — an option not taken is not a defect', async () => {
    const optional = { ...METHOD_NAMES_DECISION, necessity: 'OPTIONAL',
      obligations: [{ describe: 'comparison table', phrases: ['comparison table', 'compare the options'],
        quote: 'You may include a comparison table when more than three options are live.' }] };
    const run = await runMethodExtraction(stub([optional]), budget(), docs, 'no table here', scope);
    expect(run.methods).toHaveLength(1);
    expect(run.missing).toHaveLength(0);
  });

  it('drops an obligation with no usable phrases rather than inventing a detector for it', async () => {
    const vague = { ...METHOD_NAMES_DECISION, obligations: [{
      ...METHOD_NAMES_DECISION.obligations[0], phrases: ['a', 'of', 'is'] }] };
    const run = await runMethodExtraction(stub([vague]), budget(), docs, 'x', scope);
    expect(run.methods).toHaveLength(0);
    expect(run.problems).toHaveLength(0);   // not an invention — just nothing checkable
  });
});

describe('describeMethodRun', () => {
  const docs = new Map([['METHOD.md', DOC]]);

  it('calls findings CANDIDATES and says why', async () => {
    const run = await runMethodExtraction(stub([METHOD_NAMES_DECISION]), budget(), docs, 'nothing', scope);
    const text = describeMethodRun(run);
    expect(text).toContain('candidates, not verdicts');
    expect(text).toContain('WORDING');
  });

  it('distinguishes "no documents" from "documents that instruct nothing"', async () => {
    const none = await runMethodExtraction(stub([]), budget(), new Map(), 'x', scope);
    expect(describeMethodRun(none)).toContain('No methodology documents');
    const silent = await runMethodExtraction(stub([]), budget(), docs, 'x', scope);
    expect(describeMethodRun(silent)).toContain('describe rather than instruct');
  });
});
