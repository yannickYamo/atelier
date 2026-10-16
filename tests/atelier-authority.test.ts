// tests/atelier-authority.test.ts — WHO MAY MAKE A RULE REQUIRED, ON EVERY BUILD THAT ASKS NO ONE.
//
// Three kinds of rule, one policy:
//   owner-required     the owner said it: a step of their method, their confirmation, their --set
//   product-required   a standing rule of the product the owner set: no added AI tells, the dash cap, a platform
//                      limit the owner gives (the editorial grammar check is carried, and never moves the verdict)
//   learned preference read off the examples: it steers drafts and chooses between them, and never blocks
// A build that asks no one (no method note, no model, nothing to approve) must therefore produce no required rule
// beyond the product's. Twenty posts without a hashtag do not forbid hashtags.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tellOffers, grammarOffer, countedOffers } from '../core/method/standard.js';
import { GOOD } from './fixtures/shortform.js';
import { ESSAYS_AND_LISTS } from './fixtures/composite/mixed-format.js';

interface Case { id: string; reference: string }
const asCases = (texts: readonly string[]): Case[] => texts.map((reference, i) => ({ id: `p${i}`, reference }));
const blog = (): Case[] => readdirSync('examples/blog/posts').sort().map((f) => ({ id: f, reference: readFileSync(join('examples/blog/posts', f), 'utf8') }));
/** Everything a build with no method and no model offers, as it offers it. */
const offered = (cases: readonly Case[], limit?: number) => {
  const counted = countedOffers([], cases, limit ? { limit: { chars: limit, from: '--limit' } } : {});
  return [...tellOffers(cases), ...grammarOffer(cases, counted), ...counted];
};
/** A product rule: the AI-tell ban, the dash cap, the editorial grammar check, or a platform limit the owner gave. */
const productRule = (p: ReturnType<typeof offered>[number]): boolean => {
  const m = p.measurement;
  if (!m) return false;
  if (m.observer === 'GRAMMAR') return true;
  if (m.observer === 'PATTERN_RATE') { const pat = (m.params.pattern as readonly string[] | undefined) ?? []; return pat.includes('MACHINE_TELL') || pat.includes('EM_DASH'); }
  return p.platform === true;
};

describe('a build that asks no one requires nothing it learned', () => {
  const corpora: [string, Case[], number | undefined][] = [
    ['fifteen tweets', asCases(GOOD.slice(0, 15)), undefined],
    ['fifteen tweets with a limit the owner gave', asCases(GOOD.slice(0, 15)), 280],
    ['five tweets', asCases(GOOD.slice(0, 5)), undefined],
    ['a blog', blog(), undefined],
    ['essays and lists by one writer', asCases(Object.values(ESSAYS_AND_LISTS)), undefined],
  ];
  for (const [name, cases, limit] of corpora) {
    it(`${name}: every required rule is a product rule`, () => {
      const required = offered(cases, limit).filter((p) => p.required);
      expect(required.filter((p) => !productRule(p)).map((p) => p.statement)).toEqual([]);
    });
  }
  it('twenty posts without a hashtag: the hashtag band is offered as a preference, never a ban', () => {
    const hashtags = offered(asCases(GOOD.slice(0, 15))).filter((p) => p.measurement?.observer === 'SHAPE' && (p.measurement.params.shape as string[])[0] === 'hashtags');
    expect(hashtags.length).toBeGreaterThan(0);
    expect(hashtags.every((p) => !p.required)).toBe(true);
  });
  it('a limit the owner gives is required; none is assumed', () => {
    const withLimit = offered(asCases(GOOD.slice(0, 15)), 280).filter((p) => p.platform);
    expect(withLimit.map((p) => p.statement)).toEqual(['At most 280 characters: the platform\'s limit.']);
    expect(offered(asCases(GOOD.slice(0, 15))).some((p) => p.platform)).toBe(false);
  });
});
