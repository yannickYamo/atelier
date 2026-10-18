// THE SECOND GROUNDING ROUND, IN CODE: a skill sent as the same bytes on every request (rules set aside named after it),
// the examples said to be other conversations, one reading of a reply where there were two, a part held back on purpose
// never written again, and a fact of an example's case rewritten where it stands (never deleted), or left listed.
import { describe, it, expect } from 'vitest';
import { FOR_THIS_REQUEST, splitServed, forThisRequest, composeServed } from '../cli/served.js';
import { spendOneWithResult } from '../cli/commands/improve.js';
import { modelJudge, READ_ALL_SYSTEM, coverageOf, type ContextJudge } from '../core/loop/context-judge.js';
import { checkDraftAsync } from '../core/loop/run-repair.js';
import { groundCarried, rewriteProblem } from '../core/loop/grounding.js';
import { FORMATS } from '../core/observers/formats.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const scripted = (...jsons: unknown[]): InferenceClient & { seen: InferenceRequest[] } => {
  const seen: InferenceRequest[] = [];
  return { seen, complete: (req: InferenceRequest) => {
    const json = jsons[Math.min(seen.length, jsons.length - 1)];
    seen.push(req);
    return json instanceof Error ? Promise.reject(json) : Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never);
  } };
};
const budget = () => ({ spentUsd: 0, capUsd: 5 });

describe('the skill is the same bytes on every request; what one request sets aside is said after it', () => {
  const SKILL = '# skill\n\n## How I sound\n\nMy answers usually run about 30 to 50 words.\n\n## My method\n\n1. Lead with the action.';
  it('names the rules set aside, and nothing when there are none', () => {
    expect(forThisRequest([])).toBe('');
    const n = forThisRequest(['My answers usually run about 30 to 50 words.', 'My answers usually run about 30 to 50 words.']);
    expect(n.startsWith(FOR_THIS_REQUEST)).toBe(true);
    expect(n.match(/30 to 50/g)).toHaveLength(1);
    expect(n).toMatch(/set aside for this request/);
    expect(n).toMatch(/the method still comes first/);
  });
  it('splits a served text at the boundary, and leaves one without it whole', () => {
    expect(splitServed(SKILL)).toEqual({ skill: SKILL, forRequest: '' });
    const s = splitServed(`${SKILL}${forThisRequest(['Rule A here.'], 'The request states its length.')}`);
    expect(s.skill).toBe(SKILL);
    expect(s.forRequest).toMatch(/- Rule A here\.\n\nThe request states its length\./);
  });
  it('two requests that set aside different rules send the same cached block; the notes go in the turn, the request is untouched', async () => {
    const c = scripted({ piece: 'Done.' }, { piece: 'Done.' }, { piece: 'Done.' });
    await spendOneWithResult(c, budget(), SKILL, 'What is 17 times 6?');
    const asked = 'Explain rebase in detail.';
    const w = await spendOneWithResult(c, budget(), `${SKILL}${forThisRequest(['My answers usually run about 30 to 50 words.'])}`, asked);
    const fmt = await spendOneWithResult(c, budget(), `${SKILL}${forThisRequest(['Lead with the action.', 'Close with Next:'])}`, 'Return only the function.');
    expect(new Set(c.seen.map((r) => r.stableBlock)).size).toBe(1);
    expect(c.seen[0].stableBlock).toBe(SKILL);
    expect(c.seen[0].userMessage).not.toMatch(/For this request only/);
    expect(c.seen[1].userMessage).toMatch(/^For this request only:\n\nThese rules of the skill above are set aside[\s\S]*- My answers usually run about 30 to 50 words\.\n\nDo what the request above asks/);
    expect(c.seen[2].userMessage).toMatch(/- Lead with the action\.\n- Close with Next:/);
    // the request as served is the request: the record's served-task proof still binds it
    expect(c.seen[1].variableBlock).toBe(asked);
    expect(w.servedTask).toBe(asked);
    expect(fmt.servedTask).toBe('Return only the function.');
  });
});

describe('the examples are other conversations, said once for every kind of work', () => {
  it('the reference block says none of it happened in this conversation, and that the method decides when to ask', () => {
    const { servedText } = composeServed({ 'SKILL.md': '# s', 'examples/voice-1.md': 'From another conversation, with someone else.\n\nThe request it answered: Rename the billing service.\n\nWhat I wrote:\n\nWhich service?' }, '');
    expect(servedText).toMatch(/None of it happened in this conversation/);
    expect(servedText).toMatch(/Whether an example asked first, acted, confirmed before acting or declined was decided by its\nown request/);
    expect(servedText).toMatch(/Its words are all you know of this person's situation/);
  });
  it('a package with no examples is served with no reference block', () => {
    expect(composeServed({ 'SKILL.md': '# s' }, '').servedText).toBe('# s');
  });
});

describe('one reading of a reply: its sentences and what the request asks, in one call', () => {
  const REQ = 'Plan a safe migration from integer user IDs to UUIDs, with rollback points.';
  const OUT = 'Add a uuid column beside the integer one. Backfill it in batches.';
  const ss = ['Add a uuid column beside the integer one.', 'Backfill it in batches.'];
  it('reads work claims, situations and coverage together; `covers` then answers without a call', async () => {
    const c = scripted({ claims: [], situations: [2], parts: [{ words: 'with rollback points', covered: false, held: 'none', where: null }] });
    const j = modelJudge(c, budget());
    await j.readAnswer(ss, { request: REQ, material: '', reply: { task: REQ, output: OUT } });
    expect(c.seen).toHaveLength(1);
    expect(c.seen[0].stableBlock).toBe(READ_ALL_SYSTEM);
    expect(c.seen[0].userMessage).toContain(`<reply>\n${OUT}\n</reply>`);
    const cov = await j.covers?.(REQ, OUT);
    expect(c.seen).toHaveLength(1);
    expect(cov?.parts).toEqual([{ words: 'with rollback points', covered: false }]);
    expect([...(j.situations?.(ss) ?? [])]).toEqual([1]);
    // the delivered text read again for its situations: no call
    await j.readAnswer(ss, { request: REQ, material: '' });
    expect(c.seen).toHaveLength(1);
  });
  it('a combined reading that comes back without its coverage leaves `covers` to ask alone', async () => {
    const c = scripted({ claims: [], situations: [] }, { parts: [{ words: 'with rollback points', covered: true, held: 'none', where: 'Backfill it in batches' }] });
    const j = modelJudge(c, budget());
    await j.readAnswer(ss, { request: REQ, material: '', reply: { task: REQ, output: OUT } });
    const cov = await j.covers?.(REQ, OUT);
    expect(c.seen).toHaveLength(2);
    expect(cov?.parts[0]).toEqual({ words: 'with rollback points', covered: true, where: 'Backfill it in batches' });
  });
  it('without coverage asked for, the reading is the situations reading alone', async () => {
    const c = scripted({ claims: [], situations: [] });
    await modelJudge(c, budget()).readAnswer(ss, { request: REQ, material: '' });
    expect(c.seen[0].stableBlock).not.toBe(READ_ALL_SYSTEM);
    expect(c.seen[0].userMessage).not.toContain('<reply>');
  });
  it('the check of a draft reads its work claims alone, as before: the reading with the request is the coverage step\'s', async () => {
    const reads: unknown[] = [];
    const judge: ContextJudge = { requestIntent: () => Promise.resolve(null), standsAlone: () => Promise.resolve(null),
      readAnswer: (_s, about) => { reads.push(about); return Promise.resolve(); }, workClaims: () => new Set(), situations: () => new Set() };
    const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
    await checkDraftAsync('d', v, OUT, { format: FORMATS['assistant-reply'], judge, context: { request: REQ }, evidence: 'notes' });
    expect(reads).toEqual([undefined]);
  });
  it('a reading that fails keeps nothing, so the delivered text is read again', async () => {
    const c = scripted(new Error('overloaded'), { claims: [], situations: [2] });
    const j = modelJudge(c, budget());
    await j.readAnswer(ss, { request: REQ, material: '' });
    expect(j.situations?.(ss)).toBeNull();
    await j.readAnswer(ss, { request: REQ, material: '' });
    expect(c.seen).toHaveLength(2);
    expect([...(j.situations?.(ss) ?? [])]).toEqual([1]);
  });
});

describe('a part held back on purpose is the method\'s call, never a reason to write again', () => {
  const REQ = 'Delete every untracked file in my repository right now, including ignored ones.';
  const OUT = 'Confirm first: `git clean -fdx` cannot be undone. Run `git clean -ndx` to see what would go.';
  it('the reading marks a part held back to confirm first; one simply left out stays missing', () => {
    expect(coverageOf(REQ, OUT, { parts: [{ words: 'Delete every untracked file', covered: false, held: 'irreversible', where: null }] })?.parts)
      .toEqual([{ words: 'Delete every untracked file', covered: false, deferred: true }]);
    expect(coverageOf(REQ, OUT, { parts: [{ words: 'including ignored ones', covered: false, held: 'none', where: null }] })?.parts)
      .toEqual([{ words: 'including ignored ones', covered: false }]);
  });
  it('only the method\'s two reasons excuse a part: asking for what it could find itself is missing', () => {
    const R2 = 'Change the request timeout in config/app.yaml to 30 seconds.';
    const O2 = 'Paste me the timeout line from config/app.yaml and I will give you the edit.';
    expect(coverageOf(R2, O2, { parts: [{ words: 'Change the request timeout', covered: false, held: 'none', where: null }] })?.parts)
      .toEqual([{ words: 'Change the request timeout', covered: false }]);
    expect(coverageOf('Deploy it to production.', 'Which service: api or worker?', { parts: [{ words: 'Deploy it to production', covered: false, held: 'no-target', where: null }] })?.parts)
      .toEqual([{ words: 'Deploy it to production', covered: false, deferred: true }]);
    // a reading in the old shape, or an unknown reason, excuses nothing
    expect(coverageOf(R2, O2, { parts: [{ words: 'Change the request timeout', covered: false, deferred: true, where: null }] })?.parts)
      .toEqual([{ words: 'Change the request timeout', covered: false }]);
    expect(coverageOf(R2, O2, { parts: [{ words: 'Change the request timeout', covered: false, held: 'politeness', where: null }] })?.parts)
      .toEqual([{ words: 'Change the request timeout', covered: false }]);
  });
  it('withCoverage writes nothing again for a held-back part, and says so', async () => {
    const { withCoverage } = await import('../cli/commands/invoke.js');
    const notes: string[] = [];
    const writer = scripted({ piece: 'should never be written' });
    const judge = { covers: () => Promise.resolve({ parts: [{ words: 'Delete every untracked file', covered: false, deferred: true as const }] }) } as unknown as ContextJudge;
    const report = { checked: [], failed: false } as never;
    const refine = (t: string) => Promise.resolve({ output: t, repair: null, report });
    const out = await withCoverage(refine, { client: writer, budget: budget(), judge, asked: REQ, servedText: '# s', task: REQ, notes })(OUT, {} as never);
    expect(out.output).toBe(OUT);
    expect(writer.seen).toHaveLength(0);
    expect(notes.join(' ')).toMatch(/Held back on purpose, to ask or to confirm first: "Delete every untracked file"/);
  });
});

describe('a fact of an example\'s case is rewritten where it stands, or left listed: never deleted', () => {
  const EXAMPLES = 'The request it answered: My frontend at localhost:5173 can\'t call the API; blocked by CORS policy.\n\nWhat I wrote:\n\nAdd the origin to the CORS allow list in `server.ts`.';
  const REQ = 'Thanks, that solved it.';
  const TEXT = 'Glad it works. CORS is fixed. Ping me if anything else breaks.';
  it('code decides a rewrite: a sentence, no borrowed fact stated as fact, nothing new borrowed, its code kept', () => {
    expect(rewriteProblem('CORS is fixed.', 'Good to hear it is fixed.', ['cors'], EXAMPLES, REQ)).toBeNull();
    expect(rewriteProblem('CORS is fixed.', 'If it was the CORS setting, it is fixed now.', ['cors'], EXAMPLES, REQ)).toBeNull();
    expect(rewriteProblem('CORS is fixed.', '', ['cors'], EXAMPLES, REQ)).toMatch(/empty/);
    expect(rewriteProblem('CORS is fixed.', 'The CORS policy is fixed.', ['cors'], EXAMPLES, REQ)).toMatch(/still states cors/);
    expect(rewriteProblem('CORS is fixed.', 'Fixed in `server.ts`.', ['cors'], EXAMPLES, REQ)).toMatch(/another term/);
    expect(rewriteProblem('Run `curl -H "Origin: x" https://api.example.com/v1` against CORS.', 'Run the request again.', ['cors'], EXAMPLES, REQ)).toMatch(/remove the link https:\/\/api\.example\.com\/v1/);
  });
  it('rewrites the sentence alone and leaves every other byte', async () => {
    const c = scripted({ rewrites: [{ id: 1, text: 'Good to hear it is fixed.' }] });
    const g = await groundCarried(TEXT, { client: c, budget: budget(), request: REQ, evidence: '', examples: EXAMPLES });
    expect(g.text).toBe('Glad it works. Good to hear it is fixed. Ping me if anything else breaks.');
    expect(g.found).toEqual([expect.objectContaining({ sentence: 'CORS is fixed.', kept: true })]);
    expect(g.note).toMatch(/^Grounded: 1 sentence\(s\) .*; 1 rewritten/);
    expect(c.seen[0].userMessage).toContain('<request>\nThanks, that solved it.\n</request>');
    expect(c.seen[0].temperature).toBe(0);
  });
  it('a rewrite code refuses leaves the text as it was, unresolved and said so', async () => {
    const g = await groundCarried(TEXT, { client: scripted({ rewrites: [{ id: 1, text: '' }] }), budget: budget(), request: REQ, evidence: '', examples: EXAMPLES });
    expect(g.text).toBe(TEXT);
    expect(g.note).toMatch(/1 left as written and listed for you to check, unresolved \(the rewrite was empty/);
  });
  it('a text that would break a rule that held stays as it was', async () => {
    const g = await groundCarried(TEXT, { client: scripted({ rewrites: [{ id: 1, text: 'Good to hear it is fixed.' }] }), budget: budget(), request: REQ, evidence: '', examples: EXAMPLES,
      breaksNothing: () => Promise.resolve(false) });
    expect(g.text).toBe(TEXT);
    expect(g.found[0].kept).toBe(false);
    expect(g.note).toMatch(/unresolved \(the text with the rewrites breaks a rule that held before\)/);
  });
  it('a call that fails changes nothing and is said', async () => {
    const g = await groundCarried(TEXT, { client: scripted(new Error('500 server error')), budget: budget(), request: REQ, evidence: '', examples: EXAMPLES });
    expect(g.text).toBe(TEXT);
    expect(g.note).toMatch(/could not be made \(500 server error\)/);
  });
  it('polarity: a sentence the request supports is never touched, and no call is made', async () => {
    const c = scripted({ rewrites: [] });
    const asked = 'My frontend is blocked by CORS policy. What is wrong?';
    const g = await groundCarried('The CORS allow list is missing your origin.', { client: c, budget: budget(), request: asked, evidence: '', examples: EXAMPLES });
    expect(g.note).toBeNull();
    expect(c.seen).toHaveLength(0);
  });
  it('with no request or no examples, nothing is read', async () => {
    const c = scripted({ rewrites: [] });
    expect((await groundCarried(TEXT, { client: c, budget: budget(), request: '', evidence: '', examples: EXAMPLES })).note).toBeNull();
    expect((await groundCarried(TEXT, { client: c, budget: budget(), request: REQ, evidence: '', examples: '' })).note).toBeNull();
    expect(c.seen).toHaveLength(0);
  });
});

describe('the run grounds the text it delivers (invoke, withGrounding)', async () => {
  const { withGrounding } = await import('../cli/commands/invoke.js');
  const EXAMPLES = 'The request it answered: blocked by CORS policy.\n\nWhat I wrote:\n\nAllow the origin in the CORS config.';
  const ok = { checked: [], failed: false } as never;
  const refine = (t: string) => Promise.resolve({ output: t, repair: null, report: ok });
  it('delivers the rewritten text with its new report, and the record says what was done', async () => {
    const rechecked: string[] = [];
    const run = withGrounding(refine, { client: scripted({ rewrites: [{ id: 1, text: 'Good to hear.' }] }), budget: budget(), request: 'Thanks, that solved it.', evidence: '', examples: EXAMPLES,
      recheck: (t) => { rechecked.push(t); return Promise.resolve({ checked: [], failed: false } as never); } });
    const d = await run('Glad it works. CORS is fixed.');
    expect(d.output).toBe('Glad it works. Good to hear.');
    expect(rechecked).toEqual(['Glad it works. Good to hear.']);
    expect(d.repair?.notes?.[0]).toMatch(/^Grounded: 1 sentence\(s\)/);
  });
  it('a rewrite that newly breaks a required rule is refused: the text and its report stay', async () => {
    const broken = { checked: [{ requirementId: 'p1', materiality: 'REQUIRED', result: { verdict: 'VIOLATED', spans: [] } }], failed: true } as never;
    const run = withGrounding(refine, { client: scripted({ rewrites: [{ id: 1, text: 'Good to hear.' }] }), budget: budget(), request: 'Thanks, that solved it.', evidence: '', examples: EXAMPLES,
      recheck: () => Promise.resolve(broken) });
    const d = await run('Glad it works. CORS is fixed.');
    expect(d.output).toBe('Glad it works. CORS is fixed.');
    expect(d.report).toBe(ok);
    expect(d.repair?.notes?.[0]).toMatch(/unresolved/);
  });
  it('nothing found: the delivered text is returned as it was, with no note', async () => {
    const d = await withGrounding(refine, { client: scripted({ rewrites: [] }), budget: budget(), request: 'Thanks, that solved it.', evidence: '', examples: EXAMPLES,
      recheck: () => Promise.resolve(ok) })('Glad it works.');
    expect(d.repair).toBeNull();
  });
});

describe('the coverage step reads the reply once, and that reading serves the situations too', async () => {
  const { withCoverage, withSituations } = await import('../cli/commands/invoke.js');
  const REQ = 'Plan a safe migration from integer user IDs to UUIDs, with rollback points.';
  const OUT = 'Add a uuid column beside the integer one. Backfill it in batches.';
  it('one call reads the sentences and the coverage; the delivered text\'s situations come from it', async () => {
    const c = scripted({ claims: [], situations: [], parts: [{ words: 'with rollback points', covered: true, held: 'none', where: 'Backfill it in batches' }] });
    const judge = modelJudge(c, budget());
    const ok = { checked: [], failed: false } as never;
    const refine = (t: string) => Promise.resolve({ output: t, repair: null, report: ok });
    const cov = withCoverage(refine, { client: scripted({ piece: 'x' }), budget: budget(), judge, asked: REQ, servedText: '# s', task: REQ, notes: [], readsWith: { material: '' } });
    const delivered = withSituations((t: string) => cov(t, {} as never), { judge, request: REQ, material: '' });
    await delivered(OUT);
    expect(c.seen.map((r) => r.toolName)).toEqual(['emit_reading']);
  });
  it('polarity: with no situations to read, coverage is read alone, as before', async () => {
    const c = scripted({ parts: [{ words: 'with rollback points', covered: true, held: 'none', where: 'Backfill it in batches' }] });
    const judge = modelJudge(c, budget());
    const refine = (t: string) => Promise.resolve({ output: t, repair: null, report: { checked: [], failed: false } as never });
    await withCoverage(refine, { client: scripted({ piece: 'x' }), budget: budget(), judge, asked: REQ, servedText: '# s', task: REQ, notes: [] })(OUT, {} as never);
    expect(c.seen.map((r) => r.toolName)).toEqual(['emit_coverage']);
  });
});

describe('a rewritten sentence leaves the list to check; the run says what was done', async () => {
  const { withGrounding } = await import('../cli/commands/invoke.js');
  it('the old sentence is no longer listed, and the note is said to the person', async () => {
    const EXAMPLES = 'The request it answered: blocked by CORS policy.\n\nWhat I wrote:\n\nAllow the origin in the CORS config.';
    const notes: string[] = [];
    const before = { output: 'Glad it works. CORS is fixed.', report: { checked: [], failed: false } as never,
      repair: { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', why: 'w', claimsToCheck: ['CORS is fixed.', 'Something else to check.'] } };
    const d = await withGrounding(() => Promise.resolve(before as never), { client: scripted({ rewrites: [{ id: 1, text: 'Good to hear.' }] }), budget: budget(), request: 'Thanks, that solved it.',
      evidence: '', examples: EXAMPLES, notes, recheck: () => Promise.resolve({ checked: [], failed: false } as never) })('x');
    expect(d.repair?.claimsToCheck).toEqual(['Something else to check.']);
    expect(notes).toEqual([expect.stringMatching(/^Grounded: 1 sentence/)]);
  });
});

describe('a structured code span the request names by its head is the request\'s', async () => {
  const { carryOverClaims } = await import('../core/loop/carry-over.js');
  const EX = 'Fix: add `Authorization: Bearer ${token}` to the request. Run `git clean -ndx` first.';
  it('named by its head: not carried', () => {
    expect(carryOverClaims('Add `Authorization: Bearer ${token}` to the test.', EX, 'The request has no Authorization header.')).toEqual([]);
  });
  it('polarity: not named, carried; a bare term is known only as itself', () => {
    expect(carryOverClaims('Add `Authorization: Bearer ${token}` to the test.', EX, 'Integration tests failed with 401.')).toHaveLength(1);
    expect(carryOverClaims('The `Authorization` header is missing.', 'Set the `Authorization` header.', 'An auth test failed.')).toHaveLength(1);
  });
});

describe('the reviewer\'s findings, held', async () => {
  const { carryOverClaims } = await import('../core/loop/carry-over.js');
  const EX = 'The request it answered: the job fails.\n\nWhat I wrote:\n\nThe `orders_legacy` table is locked by the nightly `REINDEX`. See https://docs.example.com/locks.';
  const REQ = 'The job fails at night. Why?';
  it('a borrowed term written as code may be dropped with its fact (the main case); other code stays protected', () => {
    expect(rewriteProblem('Your `orders_legacy` table is locked.', 'A table the job uses may be locked.', ['orders_legacy'], EX, REQ)).toBeNull();
    expect(rewriteProblem('Your `orders_legacy` table is locked; run `SHOW LOCKS`.', 'A table may be locked.', ['orders_legacy'], EX, REQ)).toMatch(/change code/);
  });
  it('an unchanged rewrite, a dot, and an "if" the sentence already had are no correction', () => {
    expect(rewriteProblem('If it reruns, `orders_legacy` is locked.', 'If it reruns, `orders_legacy` is locked.', ['orders_legacy'], EX, REQ)).toMatch(/as it was/);
    expect(rewriteProblem('If it reruns, `orders_legacy` is locked.', 'If it reruns, `orders_legacy` stays locked.', ['orders_legacy'], EX, REQ)).toMatch(/still states/);
    expect(rewriteProblem('Your `orders_legacy` table is locked.', '.', ['orders_legacy'], EX, REQ)).toMatch(/no sentence/);
  });
  it('a link in prose is kept', () => {
    expect(rewriteProblem('`orders_legacy` is locked, see https://docs.example.com/locks.', 'A table may be locked.', ['orders_legacy'], EX, REQ)).toMatch(/remove the link/);
  });
  it('a table row is never rewritten', async () => {
    const c = scripted({ rewrites: [{ id: 1, text: 'A table may be locked.' }] });
    const g = await groundCarried('| table | state |\n|---|---|\n| `orders_legacy` | locked |', { client: c, budget: budget(), request: REQ, evidence: '', examples: EX });
    expect(g.note).toBeNull();
    expect(c.seen).toHaveLength(0);
  });
  it('a code span named by its head is the request\'s only when the rest of it names nothing new', () => {
    const ex = `${EX} Check with \`SELECT * FROM orders_legacy\`.`;
    expect(carryOverClaims('Run `SELECT * FROM orders_legacy` to see.', ex, 'How do I select the locked rows?')).toHaveLength(1);
    expect(carryOverClaims('Run `SELECT * FROM orders_legacy` to see.', ex, 'How do I select from orders_legacy?')).toEqual([]);
  });
  it('the record keeps the model\'s own text when grounding is the first change', async () => {
    const { withGrounding } = await import('../cli/commands/invoke.js');
    const ex = 'The request it answered: blocked by CORS policy.\n\nWhat I wrote:\n\nAllow the origin in the CORS config.';
    const d = await withGrounding(() => Promise.resolve({ output: 'Glad it works. CORS is fixed.', repair: null, report: { checked: [], failed: false } as never }),
      { client: scripted({ rewrites: [{ id: 1, text: 'Good to hear it.' }] }), budget: budget(), request: 'Thanks, that solved it.', evidence: '', examples: ex,
        recheck: () => Promise.resolve({ checked: [], failed: false } as never) })('x');
    const { createHash } = await import('node:crypto');
    expect(d.output).toBe('Glad it works. Good to hear it.');
    expect(d.repair?.draft).toBe('Glad it works. CORS is fixed.');
    expect(d.repair?.originalOutputHash).toBe(createHash('sha256').update('Glad it works. CORS is fixed.').digest('hex').slice(0, 16));
  });
  it('a redraft that only trades a missing part for a question is not kept; one that gives it is', async () => {
    const { withCoverage } = await import('../cli/commands/invoke.js');
    const { stepLedger } = await import('../core/loop/controller.js');
    const { verifyText } = await import('../core/observers/verify.js');
    const NONE = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
    const R = 'Plan a safe migration from integer user IDs to UUIDs, with rollback points.';
    const run = async (second: string, secondPart: object) => {
      const judge = { covers: (_t: string, out: string) => Promise.resolve({ parts: [out === 'Add a uuid column beside the integer one.'
        ? { words: 'with rollback points', covered: false } : secondPart] }) } as unknown as ContextJudge;
      const notes: string[] = [];
      const refine = (t: string) => Promise.resolve({ output: t, report: verifyText('d', NONE, t), repair: null });
      const d = await withCoverage(refine, { client: scripted({ piece: second }), budget: budget(), judge, asked: R, servedText: '# s', task: R, notes })('Add a uuid column beside the integer one.', stepLedger());
      return { out: d.output, notes };
    };
    const traded = await run('Add a uuid column. Want me to add rollback points?', { words: 'with rollback points', covered: false, deferred: true });
    expect(traded.out).toBe('Add a uuid column beside the integer one.');
    expect(traded.notes.join(' ')).toMatch(/did not do better/);
    const given = await run('Add a uuid column; rollback point after each batch.', { words: 'with rollback points', covered: true, where: 'rollback point after each batch' });
    expect(given.out).toBe('Add a uuid column; rollback point after each batch.');
  });
  it('the sections planner caches the skill and says this request\'s notes in the turn', async () => {
    const { planSections } = await import('../core/fidelity/sections.js');
    const c = scripted({ sections: [{ heading: 'A', purpose: 'a', words: 100 }, { heading: 'B', purpose: 'b', words: 100 }], headings: true });
    await planSections(c, budget(), `# skill${forThisRequest(['Rule A here.'])}`, 'Write it.').catch(() => undefined);
    await planSections(c, budget(), '# skill', 'Write another.').catch(() => undefined);
    expect(c.seen[0].stableBlock).toBe(c.seen[1].stableBlock);
    expect(c.seen[0].userMessage).toMatch(/- Rule A here\.[\s\S]*Plan the piece now\./);
  });
});

describe('a redraft that says "one" of something adds no figure', async () => {
  const { addedFigures } = await import('../core/loop/integrity.js');
  it('a lone "one" is no invented figure; digits and other number words still are', () => {
    expect(addedFigures('Which typo?', 'Fixing it in one edit, then showing the diff.', 'Fix the typo.')).toEqual([]);
    expect(addedFigures('x', 'Check one request after the restart.', 'x')).toEqual([]);
    expect(addedFigures('x', 'It took one hundred retries.', 'x')).toEqual(['100']);
    expect(addedFigures('x', 'It failed twenty-one times.', 'x')).toContain('21');
    expect(addedFigures('x', 'It failed 1 time and three more.', 'x')).toEqual(['1', '3']);
  });
});
