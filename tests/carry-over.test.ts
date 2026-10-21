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

describe('the form\'s own names are never borrowed (brand-safety assessments, v6)', async () => {
  const { formTerms } = await import('../core/loop/carry-over.js');
  const example = '{\n  "video_id": "vid_0012",\n  "verdict": "fail",\n  "safety_score": 23,\n  "moments": [{"timestamp": "00:12", "note": "a fight"}]\n}';
  const request = 'Assess this video under the policy. A 3 minute cooking show: the host chops onions and plates a dish. Duration 3:02.';
  it('a key of the examples is the form, read from where it stands; a value is still the example\'s own', () => {
    expect([...formTerms(example)].sort()).toEqual(['safety_score', 'video_id']);
    const draft = '{\n  "video_id": "vid_0107",\n  "verdict": "pass",\n  "safety_score": 92\n}';
    expect(carryOverClaims(draft, example, request)).toEqual([]);
    const copied = '{\n  "video_id": "vid_0012",\n  "verdict": "pass"\n}';
    expect(carryOverClaims(copied, example, request).map((c) => c.why)).toEqual([expect.stringMatching(/^states vid_0012 of your case/)]);
  });
  it('a YAML key and a table heading are the form too; a cell of a body row is not', () => {
    const yaml = 'video_id: vid_0012\nsafety_score: 23\n';
    expect(carryOverClaims('safety_score: 92\nverdict: pass', yaml, request)).toEqual([]);
    const table = '| video_id | safety_score |\n|---|---|\n| vid_0012 | 23 |\n';
    expect([...formTerms(table)].sort()).toEqual(['safety_score', 'video_id']);
    expect(carryOverClaims('| video_id | safety_score |\n|---|---|\n| vid_0107 | 92 |', table, request)).toEqual([]);
    expect(carryOverClaims('| video_id | safety_score |\n|---|---|\n| vid_0012 | 92 |', table, request)).toHaveLength(1);
  });
  it('is metamorphic: the same key under another name moves with it, and a prose example yields no form terms', () => {
    const ex2 = example.replace(/video_id/g, 'clip_ref');
    expect([...formTerms(ex2)].sort()).toEqual(['clip_ref', 'safety_score']);
    expect(carryOverClaims('{"clip_ref": "x1", "safety_score": 9}', ex2, request)).toEqual([]);
    expect(carryOverClaims('{"clip_ref": "vid_0012"}', ex2, request)).toHaveLength(1);
    expect(formTerms(golden('CORS', 'Access-Control-Allow-Origin')).size).toBe(0);
    // a label opening one line of prose is the example's own subject, not a key of a record
    const labelled = 'CORS: the browser blocks the call because the API sends no header.\n\nFix: allow the origin.';
    expect(formTerms(labelled).size).toBe(0);
    expect(carryOverClaims('Good. CORS is fixed.', labelled, 'Thanks, that solved it.')).toHaveLength(1);
    // a one-line JSON example, and keys at any depth, are read as JSON
    expect([...formTerms('{"video_id": "v1", "moments": [{"segment_id": 3, "note": "x"}]}')].sort()).toEqual(['segment_id', 'video_id']);
    expect(carryOverClaims('Good. CORS is fixed.', golden('CORS', 'Access-Control-Allow-Origin'), 'Thanks, that solved it.')).toHaveLength(1);
  });
});
