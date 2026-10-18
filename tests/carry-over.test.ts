import { describe, it, expect } from 'vitest';
import { carryOverClaims, distinctTerms } from '../core/loop/carry-over.js';

const golden = (topic: string, header: string): string =>
  `request: "My frontend can't call the API. The console says the request was blocked by ${topic} policy."\n\nThe browser blocks it because the API sends no \`${header}\` header.\n\n1. On the API, allow the origin in the ${topic} config.`;

describe('carry-over: a fact of an example\'s case, said of this one', () => {
  it('flags the example\'s subject asserted of a request that never named it', () => {
    const c = carryOverClaims('Good. CORS is fixed.', golden('CORS', 'Access-Control-Allow-Origin'), 'Thanks, that solved it.');
    expect(c.map((x) => x.text)).toEqual(['CORS is fixed.']);
    expect(c[0].why).toMatch(/cors/);
  });
  it('is metamorphic: the same case with another subject moves the flag with it (CORS → DNS), never phrase-bound', () => {
    const g = golden('DNS', 'X-Resolver-Zone');
    expect(carryOverClaims('Good. DNS is fixed.', g, 'Thanks, that solved it.').map((x) => x.text)).toEqual(['DNS is fixed.']);
    expect(carryOverClaims('Good. CORS is fixed.', g, 'Thanks, that solved it.')).toEqual([]);
  });
  it('says nothing when the request names it: it is the person\'s own subject then', () => {
    expect(carryOverClaims('CORS is the cause.', golden('CORS', 'Access-Control-Allow-Origin'), 'My call is blocked by CORS policy. Why?')).toEqual([]);
  });
  it('flags a borrowed header in code too, and an instruction that carries the case', () => {
    const ex = 'Good: "Cause: missing auth header. Fix: add `Authorization: Bearer ${token}` to the request."';
    const c = carryOverClaims('Add `Authorization: Bearer ${token}`.', ex, 'integration tests failed at auth.spec.ts:42 with expected 200, got 401');
    expect(c).toHaveLength(1);
  });
  it('plain words are not terms: no flag on general prose the examples happen to share', () => {
    expect([...distinctTerms('Restart the API and reload the page.')]).toEqual(['api']);
    expect(carryOverClaims('Restart the server and reload the page.', golden('CORS', 'Access-Control-Allow-Origin'), 'My server is down.')).toEqual([]);
  });
  it('nothing without examples', () => {
    expect(carryOverClaims('CORS is fixed.', '', 'Thanks.')).toEqual([]);
  });
});

describe('carry-over reads names, never ordinary words', () => {
  const ex = 'request: "Is the well-known follow-up ready, e.g. the API returns JSON?"\n\nYes: the follow-up is well-known.';
  it('a hyphenated word or "e.g." is a word, not a name', () => {
    expect([...distinctTerms(ex)].sort()).toEqual(['api', 'json']);
    expect(carryOverClaims('A well-known follow-up, e.g. this one, helps.', ex, 'Plan the release.')).toEqual([]);
  });
  it('a header in capitals and a path are names', () => {
    expect(distinctTerms('Send Access-Control-Allow-Origin from src/app.ts.')).toEqual(new Set(['access-control-allow-origin', 'src/app.ts']));
  });
  it('a term the request holds as a word is the request\'s, not one inside a longer word', () => {
    expect(carryOverClaims('The API is down.', ex, 'Our API is slow.')).toEqual([]);
    expect(carryOverClaims('The API is down.', ex, 'Our APIGateway is slow.')).toHaveLength(1);
  });
});

describe('a rule licenses its own figure beside the request\'s', async () => {
  const { decideSpecifics } = await import('../core/loop/claim-extract.js');
  const sp = (text: string) => [{ sentence: 1, text, kind: 'FIGURE', attributed: false, source: 'NONE', support: '' }] as never;
  it('"30 users in under 2 minutes": 30 from the request, 2 from the rule, traces', () => {
    const text = 'Invite the 30 users in under 2 minutes.';
    expect(decideSpecifics(text, sp('30 users in under 2 minutes'), '', 'Invite our 30 users.', false, 't', false, 'End with one thing the reader can do in under 2 minutes.').claims).toEqual([]);
  });
  it('polarity: a figure in neither the rule nor the request does not', () => {
    const text = 'Invite the 45 users in under 2 minutes.';
    expect(decideSpecifics(text, sp('45 users in under 2 minutes'), '', 'Invite our 30 users.', false, 't', false, 'End with one thing the reader can do in under 2 minutes.').claims).toHaveLength(1);
  });
});
