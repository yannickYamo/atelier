// THE SOURCE ROLES, READ BY THE CONTEXT JUDGE. The judge sees the request and its material beside the answer, and a
// sentence it reads as stating the person's situation beyond them ("Cause: request sends no auth header", when the
// request said only "expected 200, got 401") is listed for the person: never cut, never a failure.
import { describe, it, expect } from 'vitest';
import { checkDraftAsync } from '../core/loop/run-repair.js';
import { modelJudge, type ContextJudge } from '../core/loop/context-judge.js';
import { FORMATS } from '../core/observers/formats.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
const answers = { format: FORMATS['assistant-reply'] };
const REQUEST = 'Three checks ran: lint passed, unit tests passed, integration tests failed at auth.spec.ts:42 with expected 200, got 401. Give a status update.';
const ANSWER = 'Integration tests fail at auth.spec.ts:42: expected 200, got 401. Cause: request sends no auth header.';

const client = (json: unknown): InferenceClient & { seen: InferenceRequest[] } => {
  const seen: InferenceRequest[] = [];
  return { seen, complete: (req: InferenceRequest) => { seen.push(req); return Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never); } };
};

describe('the context judge reads the answer against the request and its material', () => {
  it('is sent the request and the material, and returns the situations apart from the work claims', async () => {
    const c = client({ claims: [], situations: [2] });
    const j = modelJudge(c, { spentUsd: 0, capUsd: 1 });
    const ss = ['Integration tests fail at auth.spec.ts:42: expected 200, got 401.', 'Cause: request sends no auth header.'];
    await j.readAnswer(ss, { request: REQUEST, material: '' });
    expect(JSON.stringify(c.seen[0])).toContain('auth.spec.ts:42 with expected 200');
    expect([...(j.situations?.(ss) ?? [])]).toEqual([1]);
    expect([...(j.workClaims(ss) ?? [])]).toEqual([]);
  });
  it('a stated situation is listed for the person, the draft is not failed, nothing is cut', async () => {
    const judge: ContextJudge = { requestIntent: () => Promise.resolve(null), standsAlone: () => Promise.resolve(null),
      readAnswer: () => Promise.resolve(), workClaims: () => new Set(), situations: () => new Set([1]) };
    const r = await checkDraftAsync('d', v, ANSWER, { ...answers, judge, context: { request: REQUEST } });
    expect(r.failed).toBe(false);
    const listed = r.checked.find((c) => c.requirementId === 'UNSOURCED·check');
    expect(listed?.result.spans.map((s) => s.text)).toEqual(['Cause: request sends no auth header.']);
    expect(listed?.result.spans[0].why).toMatch(/situation .* do not show/);
  });
  it('polarity: a judge that reads no situation lists nothing', async () => {
    const judge: ContextJudge = { requestIntent: () => Promise.resolve(null), standsAlone: () => Promise.resolve(null),
      readAnswer: () => Promise.resolve(), workClaims: () => new Set(), situations: () => new Set() };
    const r = await checkDraftAsync('d', v, ANSWER, { ...answers, judge, context: { request: REQUEST } });
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED·check')).toBeUndefined();
  });
});

describe('a work claim the pattern reads is cut only where the context judge read it so; the pattern alone lists', () => {
  const REVIEW = 'This change adds a method on the settings service. Checked the handler: it drops the header on retries.';
  const mkJudge = (work: number[]): ContextJudge => ({ requestIntent: () => Promise.resolve(null), standsAlone: () => Promise.resolve(null),
    readAnswer: () => Promise.resolve(), workClaims: () => new Set(work), situations: () => new Set() });
  it('the judge read neither as work: both of the pattern\'s claims are listed for the person, nothing is cut, the draft is not failed', async () => {
    const r = await checkDraftAsync('d', v, REVIEW, { ...answers, judge: mkJudge([]), context: { request: 'Review this change.' } });
    expect(r.failed).toBe(false);
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.verdict).toBe('MET');
    const listed = r.checked.find((c) => c.requirementId === 'UNSOURCED·check')?.result.spans ?? [];
    expect(listed.map((x) => x.text)).toContain('Checked the handler: it drops the header on retries.');
    expect(listed.find((x) => x.text.startsWith('Checked the handler'))?.why).toMatch(/read so by the pattern alone; the context judge did not read it as work claimed/);
  });
  it('the judge read the same sentence as work: the pattern\'s claim is cut, as before', async () => {
    const r = await checkDraftAsync('d', v, REVIEW, { ...answers, judge: mkJudge([1]), context: { request: 'Review this change.' } });
    const cut = r.checked.find((c) => c.requirementId === 'UNSOURCED')!;
    expect(cut.result.verdict).toBe('VIOLATED');
    expect(cut.result.spans.map((x) => x.text)).toEqual(['Checked the handler: it drops the header on retries.']);
  });
  it('no judge read: the pattern decides alone, as it did', async () => {
    const r = await checkDraftAsync('d', v, REVIEW, { ...answers, context: { request: 'Review this change.' } });
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.spans.map((x) => x.text)).toEqual(['Checked the handler: it drops the header on retries.']);
  });
});

describe('a carried-over fact is listed on any kind of work, never cut', () => {
  it('CORS from an example\'s case, said of "Thanks, that solved it."', async () => {
    const examples = 'The request it answered: My frontend can\'t call the API; blocked by CORS policy.\n\nWhat I wrote:\n\nAllow the origin in the CORS config.';
    const r = await checkDraftAsync('d', v, 'Good. CORS is fixed.', { ...answers, examples, context: { request: 'Thanks, that solved it.' } });
    expect(r.failed).toBe(false);
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED·check')?.result.spans.map((s) => s.text)).toEqual(['CORS is fixed.']);
  });
});

describe('the delivered text is read once for stated situations (invoke, withSituations)', async () => {
  const { withSituations } = await import('../cli/commands/invoke.js');
  it('reads once with the request and the material, and lists what it finds beside what was listed', async () => {
    const reads: unknown[] = [];
    const judge: ContextJudge = { requestIntent: () => Promise.resolve(null), standsAlone: () => Promise.resolve(null), workClaims: () => null,
      readAnswer: (_s, about) => { reads.push(about); return Promise.resolve(); }, situations: () => new Set([1]) };
    const base = () => Promise.resolve({ output: ANSWER, repair: { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', draft: ANSWER, why: 'w', claimsToCheck: ['Integration tests fail'] } } as never);
    const d = await withSituations(base, { judge, request: REQUEST, material: '' })('draft');
    expect(reads).toEqual([{ request: REQUEST, material: '' }]);
    expect(d.repair?.claimsToCheck).toEqual(['Integration tests fail', 'Cause: request sends no auth header.']);
  });
  it('a judge that cannot read leaves the delivered text and its list as they were', async () => {
    const judge: ContextJudge = { requestIntent: () => Promise.resolve(null), standsAlone: () => Promise.resolve(null), workClaims: () => null,
      readAnswer: () => Promise.reject(new Error('overloaded')), situations: () => null };
    const out = { output: ANSWER, repair: null };
    expect(await withSituations(() => Promise.resolve(out as never), { judge, request: REQUEST, material: '' })('d')).toBe(out);
  });
});

describe('review findings, held', () => {
  it('a situation reading never rewrites the work claims the loop already read and acted on', async () => {
    let call = 0;
    const answersOf = [{ claims: [1] }, { claims: [], situations: [2] }];
    const c: InferenceClient = { complete: () => Promise.resolve({ json: answersOf[call++], cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never) };
    const j = modelJudge(c, { spentUsd: 0, capUsd: 1 });
    const ss = ['I ran the migration.', 'Cause: no header.'];
    expect(j.situations?.(ss)).toBeNull();
    await j.readAnswer(ss);
    await j.readAnswer(ss, { request: 'r', material: '' });
    expect([...(j.workClaims(ss) ?? [])]).toEqual([0]);
    expect([...(j.situations?.(ss) ?? [])]).toEqual([1]);
    await j.readAnswer(ss, { request: 'r', material: '' });
    expect(call).toBe(2);
  });
  it('a long situation sentence is listed once (kept as listed claims are, 160 characters)', async () => {
    const { withSituations } = await import('../cli/commands/invoke.js');
    const long = `Cause: ${'the token minted in the fixture expired long before this run, '.repeat(4)}so the header is rejected.`;
    const judge: ContextJudge = { requestIntent: () => Promise.resolve(null), standsAlone: () => Promise.resolve(null), workClaims: () => null,
      readAnswer: () => Promise.resolve(), situations: () => new Set([0]) };
    const d = await withSituations(() => Promise.resolve({ output: long, repair: { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', draft: long, why: 'w', claimsToCheck: [long.slice(0, 160)] } } as never), { judge, request: REQUEST, material: '' })('d');
    expect(d.repair?.claimsToCheck).toEqual([long.slice(0, 160)]);
  });
  it('listed findings on a measured kind of work say what they are, not "counts written in words"', async () => {
    const examples = 'The request it answered: blocked by CORS policy.\n\nWhat I wrote:\n\nAllow the origin in the CORS config.';
    const r = await checkDraftAsync('d', v, 'Good. CORS is fixed.', { examples, context: { request: 'Thanks, that solved it.' } });
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED·check')?.statement).toMatch(/Not shown by your request/);
  });
  it('with no request (a verify with no --task) nothing is called borrowed', async () => {
    const examples = 'The request it answered: blocked by CORS policy.';
    const r = await checkDraftAsync('d', v, 'CORS is fixed.', { examples });
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED·check')).toBeUndefined();
  });
});
