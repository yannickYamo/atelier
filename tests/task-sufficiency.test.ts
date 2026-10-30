// WHAT A REQUEST NEEDS, READ BEFORE THE FIRST DRAFT; A CANDIDATE RELEASE PROMOTED ONLY ON THE OWNER'S PAIRED RATINGS.
// The seven counterfactual cases the ruling names: each reading of a request gives the writer different, appropriate
// guidance, from what the request says, with no keyword in the code that maps a case to a behaviour.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { needsOf, needsNote, needsNothing } from '../core/loop/task-needs.js';
import { modelJudge } from '../core/loop/context-judge.js';
import { promotionVerdict, MIN_PAIRS, type PairedOutcome } from '../core/fidelity/promotion.js';
import { makeRelease } from '../core/fidelity/release.js';
import { DEFAULT_SETTINGS } from '../core/fidelity/types.js';
import * as fstore from '../core/state/fidelity-store.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';

const scripted = (json: unknown): InferenceClient & { seen: InferenceRequest[] } => {
  const seen: InferenceRequest[] = [];
  return { seen, complete: (req: InferenceRequest) => { seen.push(req); return Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never); } };
};
const none = { deliver: [], unknowns: [], act_on: null, irreversible: null };

describe('the seven counterfactual cases: different, appropriate guidance from what each request says', () => {
  const cases = {
    sql: ['A coworker wrote `SELECT c.* FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL;` Why the LEFT JOIN plus IS NULL? Is it right?',
      { ...none, deliver: ['Why the LEFT JOIN plus IS NULL?', 'Is it right?'] }],
    api: ['Can you make the API faster? Customers keep complaining.',
      { ...none, deliver: ['make the API faster'], unknowns: [{ what: 'which endpoint is slow and by how much', about: 'make the API faster', settles: 'reality' }] }],
    thanks: ['Thanks, that solved it.', none],
    tools: ['Change the request timeout in config/app.yaml to 30 seconds.',
      { ...none, deliver: ['Change the request timeout in config/app.yaml to 30 seconds'], act_on: 'config/app.yaml' }],
    evidence: ['pytest passes locally but on CI one test fails with FileNotFoundError on fixtures/sample.csv.',
      { ...none, unknowns: [{ what: 'which directory CI runs pytest from', about: 'on CI one test fails', settles: 'reasoning' }] }],
    safety: ['Delete every untracked file in my repository right now, including ignored ones.',
      { ...none, deliver: ['Delete every untracked file'], irreversible: 'Delete every untracked file in my repository right now, including ignored ones' }],
    writing: ['Walk me through how OAuth authorization code flow with PKCE works. I expect a detailed explanation.',
      { ...none, deliver: ['how OAuth authorization code flow with PKCE works'] }],
  } as const;
  const note = (k: keyof typeof cases): string => needsNote(needsOf(cases[k][0], cases[k][1]));

  it('a SQL explanation: answer both questions; no alternative or example is added as a need', () => {
    const n = note('sql');
    expect(n).toMatch(/It asks for: "Why the LEFT JOIN plus IS NULL\?"; "Is it right\?"\. Give each one\./);
    expect(n).toMatch(/An example, an alternative or background belongs only where the answer is not usable without it/);
    expect(n).not.toMatch(/check that settles|assume|act on|cannot be undone|NOT EXISTS/);
  });
  it('API diagnostics: what can be given now, and the check that would settle it, unless the method asks first', () => {
    const n = note('api');
    expect(n).toMatch(/turns on something the request does not say \("make the API faster"\) that only a check, a measurement or the person can settle: unless your method says to ask first, give what can be given now and name the check that would settle it\./);
  });
  it('a thank-you: nothing is needed, nothing is said, and the smallest answer stands', () => {
    expect(note('thanks')).toBe('');
    expect(needsNothing(needsOf(cases.thanks[0], cases.thanks[1]))).toBe(true);
  });
  it('a task needing tools: do the work or give the exact change; never ask for what it could find', () => {
    expect(note('tools')).toMatch(/names something that could be acted on directly \("config\/app\.yaml"\): unless your method says to ask first, act on it or give the exact change, rather than asking for what could be found or checked\./);
  });
  it('incomplete evidence a reasonable assumption settles: assume it, say so in a line, answer', () => {
    expect(note('evidence')).toMatch(/is not stated \("on CI one test fails"\), and a sensible assumption settles it: unless your method says to ask, assume it, say the assumption, and answer\./);
  });
  it('a safety prerequisite: name what would be lost, the safe path, and confirm before the irreversible step', () => {
    expect(note('safety')).toMatch(/cannot be undone \(.*\): follow your method on confirming first\./);
  });
  it('a detailed writing request: what it asks for, and nothing that caps or pads its length (the request sets that)', () => {
    const n = note('writing');
    expect(n).toMatch(/It asks for: "how OAuth authorization code flow with PKCE works"/);
    expect(n).not.toMatch(/\b(?:short|brief|smallest|fewer words)\b/i);
    expect(n).toMatch(/at the length it asks for/);
  });
  it('the seven notes are seven different instructions', () => {
    const all = (Object.keys(cases) as (keyof typeof cases)[]).map(note);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('the reading is held to the request\'s own words', () => {
  const T = 'Clean up the old users from the database.';
  it('keeps only what is copied from the request; drops invented needs and bad labels', () => {
    const n = needsOf(T, { deliver: ['Clean up the old users', 'add an index on created_at'], act_on: 'the database', irreversible: 'Clean up the old users from the database',
      unknowns: [{ what: 'what counts as old', about: 'the old users', settles: 'reality' }, { what: 'the schema', about: 'the users table', settles: 'reality' },
        { what: 'x', about: 'old users', settles: 'reality' }, { what: 'which environment', about: 'the database', settles: 'maybe' }] });
    expect(n?.deliver).toEqual(['Clean up the old users']);
    expect(n?.unknowns).toEqual([{ what: 'what counts as old', about: 'the old users', settles: 'reality' }]);
    expect(n?.actOn).toBe('the database');
    expect(n?.irreversible).toBe('Clean up the old users from the database');
  });
  it('the subject: the supplied text the work is about, kept only in the request\'s own words', () => {
    const R = 'Review this design proposal the way this project\'s reviewers do. Do not rewrite the document.';
    const base = { deliver: [], unknowns: [], act_on: null, irreversible: null };
    expect(needsOf(R, { ...base, subject: 'this design proposal' })?.subject).toBe('this design proposal');
    // words the request does not hold are no subject: the material is then read as notes, as before
    expect(needsOf(R, { ...base, subject: 'the attached RFC' })?.subject).toBeNull();
    expect(needsOf(R, { ...base, subject: null })?.subject).toBeNull();
    // a reading without the field (an older reader) names no subject
    expect(needsOf(R, base)?.subject).toBeNull();
    // the whole request is no subject: a subject names a text within it
    expect(needsOf(R, { ...base, subject: R })?.subject).toBeNull();
    // words found only inside other words are not the request's words ("is essay" inside "this essay")
    expect(needsOf('Critique this essay for me.', { ...base, subject: 'is essay' })?.subject).toBeNull();
    // a quoted subject is read without its quotes, on both sides
    expect(needsOf('Check "the attached contract" for gaps.', { ...base, subject: '"the attached contract"' })?.subject).toBe('the attached contract');
    expect(needsOf('Check "the attached contract" for gaps.', { ...base, subject: '"the attached contract' })?.subject).toBe('the attached contract');
    // the whole-request bar is the subject's alone: a need that is the whole request is still that need
    expect(needsOf('Drop the users table', { ...base, irreversible: 'Drop the users table' })?.irreversible).toBe('Drop the users table');
    expect(needsOf('config/app.yaml', { ...base, act_on: 'config/app.yaml' })?.actOn).toBe('config/app.yaml');
  });
  it('the subject may be the name of a file supplied with the request, or one word of the request where one file is supplied', () => {
    const R = 'Review this design proposal the way this project\'s reviewers do. Do not rewrite the document.';
    const base = { deliver: [], unknowns: [], act_on: null, irreversible: null };
    // the name of a supplied file is a subject whether or not the request repeats it
    expect(needsOf('Review it the way our reviewers do.', { ...base, subject: 'draft' }, ['draft'])?.subject).toBe('draft');
    expect(needsOf('Review it the way our reviewers do.', { ...base, subject: 'Draft' }, ['draft'])?.subject).toBe('draft');
    // a name nothing supplied carries is no subject
    expect(needsOf('Review it the way our reviewers do.', { ...base, subject: 'draft' })?.subject).toBeNull();
    expect(needsOf('Review it the way our reviewers do.', { ...base, subject: 'draft' }, ['notes'])?.subject).toBeNull();
    // with several files supplied, only a name says which is the text: the request's words name none of them
    expect(needsOf(R, { ...base, subject: 'this design proposal' }, ['draft', 'notes'])?.subject).toBeNull();
    expect(needsOf(R, { ...base, subject: 'draft' }, ['draft', 'notes'])?.subject).toBe('draft');
    // "it", with exactly one file supplied, names that file; with two, nothing says which
    expect(needsOf('Review it the way our reviewers do.', { ...base, subject: 'it' }, ['draft'])?.subject).toBe('it');
    expect(needsOf('Review it the way our reviewers do.', { ...base, subject: 'it' }, ['draft', 'notes'])?.subject).toBeNull();
    expect(needsOf('Review it the way our reviewers do.', { ...base, subject: 'it' })?.subject).toBeNull();
    // the subject alone is a usable reading, and is no need the writer is told of
    expect(needsOf(R, { subject: 'this design proposal' })?.subject).toBe('this design proposal');
    expect(needsNothing(needsOf(R, { ...base, subject: 'this design proposal' }))).toBe(true);
  });
  it('the model is asked for the subject: it is in the schema sent and required, and the instructions say what it is', async () => {
    const c = scripted({ format: null, length: null, document: null, ...none, subject: null });
    await modelJudge(c, { spentUsd: 0, capUsd: 1 }).requestIntent('Review this design proposal.');
    const schema = c.seen[0].schema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.properties.subject).toEqual({ type: ['string', 'null'] });
    expect(schema.required).toContain('subject');
    expect(c.seen[0].stableBlock).toMatch(/- subject: .*leaves that text standing.*Null when the work replaces the text/);
  });
  it('a reading in the old shape (form only) carries no needs at all', () => {
    expect(needsOf(T, { format: null, length: null, document: null })).toBeNull();
    expect(needsNote(null)).toBe('');
  });
  it('the intent call reads the needs in the same call: no call is added', async () => {
    const c = scripted({ format: null, length: null, document: null, deliver: ['Clean up the old users'], unknowns: [], act_on: null, irreversible: 'Clean up the old users' });
    const j = modelJudge(c, { spentUsd: 0, capUsd: 1 });
    const i = await j.requestIntent(T);
    await j.requestIntent(T);
    expect(c.seen).toHaveLength(1);
    expect(c.seen[0].toolName).toBe('emit_intent');
    expect(i?.needs?.irreversible).toBe('Clean up the old users');
    expect(c.seen[0].stableBlock).toMatch(/never add what would merely be helpful/);
  });
});

describe('a candidate release is promoted only on the owner\'s paired ratings, past the uncertainty', () => {
  const pair = (cand: boolean, act: boolean, cb = 0, ab = 0): PairedOutcome => ({ request: 'r', candidate: { ship: cand, broken: cb, invented: 0 }, active: { ship: act, broken: ab, invented: 0 } });
  it('fewer than the minimum pairs: inconclusive, whatever they show', () => {
    expect(promotionVerdict(Array.from({ length: MIN_PAIRS - 1 }, () => pair(true, false)), 0.05).verdict).toBe('inconclusive');
  });
  it('an equal count on a small sample is not noninferiority', () => {
    const v = promotionVerdict(Array.from({ length: 12 }, () => pair(true, true)), 0.05);
    expect(v.diff).toBe(0);
    expect(v.verdict).toBe('inconclusive');
  });
  it('clearly better on enough pairs: promote; clearly worse: worse', () => {
    const better = [...Array.from({ length: 8 }, () => pair(true, false)), ...Array.from({ length: 12 }, () => pair(true, true))];
    expect(promotionVerdict(better, 0.05).verdict).toBe('promote');
    const worse = [...Array.from({ length: 10 }, () => pair(false, true)), ...Array.from({ length: 10 }, () => pair(true, true))];
    expect(promotionVerdict(worse, 0.05).verdict).toBe('worse');
  });
  it('a protected dimension worse blocks promotion even when more answers would be sent', () => {
    const p = [...Array.from({ length: 8 }, () => pair(true, false, 1, 0)), ...Array.from({ length: 12 }, () => pair(true, true))];
    expect(promotionVerdict(p, 0.05).verdict).toBe('protected-worse');
  });
  it('the settings search and distilled notes make a candidate; the active release stays', async () => {
    const { releaseWithSettings } = await import('../cli/fidelity.js');
    const l = { root: mkdtempSync(join(tmpdir(), 'atelier-cand-')), skillName: 'iha' };
    const root = fstore.putRelease(l, makeRelease({ parent: null, standardVersionHash: 's', skillVersionHash: 'k', settings: DEFAULT_SETTINGS, notes: [], profileHash: null, retrievalHash: null, createdAt: '2026-10-01T00:00:00Z', why: 'first' }));
    fstore.setActiveRelease(l, root.id);
    const cand = releaseWithSettings(l, root, { ...DEFAULT_SETTINGS, drafts: 3 }, 'the settings search: try 3', { candidate: true });
    expect(cand.candidate).toBe(true);
    expect(fstore.getActiveRelease(l)?.release.id).toBe(root.id);
    expect(fstore.listReleases(l).map((r) => r.id)).toEqual([root.id, cand.id]);
    const bySet = releaseWithSettings(l, root, { ...DEFAULT_SETTINGS, drafts: 2 }, 'settings set by hand: drafts=2');
    expect(fstore.getActiveRelease(l)?.release.id).toBe(bySet.id);
    expect(bySet.candidate).toBeUndefined();
  });
});

describe('after writing, a part left out is listed; only --strict writes the reply again', async () => {
  const { withCoverage } = await import('../cli/commands/invoke.js');
  const { stepLedger } = await import('../core/loop/controller.js');
  const { verifyText } = await import('../core/observers/verify.js');
  const NONE = { standardVersionHash: 's', requirements: [] } as never;
  const R = 'Change the request timeout in config/app.yaml to 30 seconds.';
  const run = async (redraft: boolean) => {
    const judge = { covers: (_t: string, out: string) => Promise.resolve({ parts: [out.startsWith('Paste')
      ? { words: 'Change the request timeout in config/app.yaml to 30 seconds', covered: false } : { words: 'Change the request timeout in config/app.yaml to 30 seconds', covered: true, where: 'Set' }] }) } as never;
    const notes: string[] = [];
    const writer = scripted({ piece: 'Set the timeout key in `config/app.yaml`, then restart.' });
    const d = await withCoverage((t: string) => Promise.resolve({ output: t, report: verifyText('d', NONE, t), repair: null }),
      { client: writer, budget: { spentUsd: 0, capUsd: 1 }, judge, asked: R, servedText: '# s', task: R, notes, redraft })('Paste me the timeout line.', stepLedger());
    return { out: d.output, notes, calls: writer.seen.length };
  };
  it('without --strict: listed for the person, nothing written again, nothing spent', async () => {
    const r = await run(false);
    expect(r.calls).toBe(0);
    expect(r.out).toBe('Paste me the timeout line.');
    expect(r.notes.join(' ')).toMatch(/Read after writing: the reply may leave out 1 part/);
  });
  it('under --strict: one bounded redraft, kept when it gives the part', async () => {
    const r = await run(true);
    expect(r.calls).toBe(1);
    expect(r.out).toMatch(/^Set the timeout key/);
  });
});

describe('the reviewer\'s findings on this round, held', async () => {
  const { spendOneWithResult } = await import('../core/loop/run-once.js');
  const { forThisRequest } = await import('../cli/served.js');
  it('the needs note reaches the writer in the uncached turn, never in the cached skill', async () => {
    const n = needsNote(needsOf('Can you make the API faster?', { ...none, unknowns: [{ what: 'which endpoint is slow', about: 'make the API faster', settles: 'reality' }] }));
    const c = scripted({ piece: 'ok' });
    await spendOneWithResult(c, { spentUsd: 0, capUsd: 1 }, `# skill${forThisRequest([], n)}`, 'Can you make the API faster?');
    expect(c.seen[0].stableBlock).toBe('# skill');
    expect(c.seen[0].userMessage).toContain('What this request needs');
    expect(c.seen[0].userMessage).toContain('"make the API faster"');
    // what a reader thought was unknown is not served: only the request's words
    expect(c.seen[0].userMessage).not.toContain('which endpoint is slow');
  });
  it('every line defers to the method; no branches per result are prescribed', () => {
    const n = needsNote(needsOf('Clean up the old users from the database.', { deliver: ['Clean up the old users'], unknowns: [{ what: 'what old means', about: 'the old users', settles: 'reality' }],
      act_on: 'the database', irreversible: 'Clean up the old users from the database' }));
    expect(n).toMatch(/your method decides how each is met, and comes first/);
    expect(n).not.toMatch(/each likely result|never instead of it|do not ask/);
    expect(n.match(/unless your method says/g)).toHaveLength(2);
  });
  it('a need is two words or the name of a thing: "the" or "fix" is none', () => {
    const n = needsOf('Fix the bug in src/app.ts please.', { deliver: ['Fix', 'the'], unknowns: [], act_on: 'src/app.ts', irreversible: null });
    expect(n?.deliver).toEqual([]);
    expect(n?.actOn).toBe('src/app.ts');
  });
  it('a child of a candidate is not itself marked a candidate unless proposed', async () => {
    const { releaseWithSettings } = await import('../cli/fidelity.js');
    const l = { root: mkdtempSync(join(tmpdir(), 'atelier-cand2-')), skillName: 'iha' };
    const root = fstore.putRelease(l, makeRelease({ parent: null, standardVersionHash: 's', skillVersionHash: 'k', settings: DEFAULT_SETTINGS, notes: [], profileHash: null, retrievalHash: null, createdAt: '2026-10-01T00:00:00Z', why: 'first' }));
    fstore.setActiveRelease(l, root.id);
    const cand = releaseWithSettings(l, root, { ...DEFAULT_SETTINGS, drafts: 3 }, 'the settings search', { candidate: true });
    const child = releaseWithSettings(l, cand, { ...DEFAULT_SETTINGS, drafts: 2 }, 'settings set by hand: drafts=2');
    expect(child.candidate).toBeUndefined();
    expect(fstore.getActiveRelease(l)?.release.id).toBe(child.id);
  });
});
