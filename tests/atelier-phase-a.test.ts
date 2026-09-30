// tests/atelier-phase-a.test.ts — THE RUNTIME NEVER MAKES AN ANSWER WORSE.
//
// An outside test ran a skill built from 12 coding answers through `atelier invoke`: it scored below no
// skill at all. The claim check cut 189 sentences from 31 of 42 answers, 17 went out with empty bullets or
// gaps, "17 times 6 is 102." was deleted leaving "Next: nothing to do.", and the report said every rule
// held. The reader, at temperature 1.0, read one text three ways. These pin the fixes:
//   A1  answers are checked as answers: specifics listed, never cut; claims of work done listed first
//   A2  a cut that leaves a fragment is redrafted once, or the text goes out uncut and the check fails
//   A3  checking calls ask for temperature 0, and a reading persists on disk for the same inputs
//   A4  a figure computed from the person's own figures is theirs
//   A5  rules needing material nobody bound are withheld; decisions told as made are claims

import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDraft, refineToStandard, brokenByCut, listedClaims } from '../core/loop/run-repair.js';
import { modelSensor, READER_VERSION } from '../core/loop/claim-extract.js';
import { derivable, derivedFromKnown, MAX_KNOWN } from '../core/loop/derived.js';
import { unsourcedClaims } from '../core/loop/claims.js';
import { FORMATS } from '../core/observers/formats.js';
import { withoutRules } from '../cli/commands/invoke.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
const ok = (json: unknown): Promise<never> => Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never);
const writer = (json: unknown): InferenceClient & { seen: InferenceRequest[] } => {
  const c = { seen: [] as InferenceRequest[], complete: (r: InferenceRequest) => { c.seen.push(r); return ok(json); } };
  return c;
};

describe('A1: answers are checked as answers', () => {
  it('assistant-reply and code-review list specifics; nothing else does', () => {
    expect(FORMATS['assistant-reply'].claims).toBe('list');
    expect(FORMATS['code-review'].claims).toBe('list');
    expect(FORMATS['blog-post'].claims).toBeUndefined();
  });
  it('a claim of work done is cut in an answer, not listed (an outside re-test, P0-2)', () => {
    const t = 'The index is in place. I checked the logs and 1.1M of 2.4M rows are written. Next: rerun the job.';
    const r = checkDraft('d', v, t, { material: '', format: FORMATS['assistant-reply'] });
    expect(r.failed).toBe(true);
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.spans[0].text).toMatch(/^I checked the logs/);
    expect(listedClaims(r)).toEqual([]);
  });
});

describe('A2: never a fragment for a pass', () => {
  it('names what a cut broke', () => {
    expect(brokenByCut('17 times 6 is 102. Next: nothing to do.', 'Next: nothing to do.')).toBe('no answer, only its label');
    expect(brokenByCut('Fix it:\n\n1. Add the header.\n2. Rerun.', 'Fix it:\n\n1.\n2. Rerun.')).toBe('an empty list item');
    expect(brokenByCut('Steps:\n\nI ran the migration yesterday.', 'Steps:\n')).toBe('a label with nothing under it');
    expect(brokenByCut('A long answer with many words in it that goes on. And more words here too.', 'A long answer with many words in it that goes on.')).toBeNull();
  });

  const draft = 'Last year I shipped the retry loop and it broke production for a day.\n\nFix it:\n\n1. Last month we saw retries double the load.\n2. Add a budget.';
  it('a cut that breaks the text is redrafted once, and the redraft is kept when it reads whole and is clean', async () => {
    const w = writer({ text: 'Fix it:\n\n1. Add a budget.' });
    const out = await refineToStandard(w, { spentUsd: 0, capUsd: 1 }, 'd', v, draft, 2, { material: '' });
    expect(w.seen.some((r) => r.toolName === 'emit_draft')).toBe(true);
    expect(out.output).toBe('Fix it:\n\n1. Add a budget.');
    expect(out.repair?.why).toMatch(/rewritten once without them/);
    expect(out.repair?.violatedAfter).toEqual([]);
  });
  it('a redraft that still invents is refused: the text goes out uncut, the claims listed, the check failed', async () => {
    const w = writer({ text: 'Fix it:\n\n1. Last week we saw the load double again.\n2. Add a budget.' });
    const out = await refineToStandard(w, { spentUsd: 0, capUsd: 1 }, 'd', v, draft, 2, { material: '' });
    expect(out.output).toBe(draft);
    expect(out.repair?.violatedAfter).toContain('UNSOURCED');
    expect(out.repair?.why).toMatch(/were not cut: cutting them left/);
    expect(out.repair?.claimsToCheck?.join(' ')).toContain('retries double the load');
  });
});

describe('A3: a repeatable reader', () => {
  const qualifiedReaders = [{ model: 'claude-haiku-4-5', version: READER_VERSION }];
  const flags = { specifics: [{ sentence: 1, text: '94 minutes', kind: 'FIGURE', attributed: false, source: 'NONE', support: '' }] };
  it('the claim reader asks for temperature 0', async () => {
    const w = writer(flags);
    const s = modelSensor(w, { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', { material: '', task: '', placeholders: false, qualifiedReaders });
    await s.read('The review took 94 minutes.');
    expect(w.seen[0].temperature).toBe(0);
  });
  it('a reading persists: a new run on the same inputs does not ask again, and decides the same way', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'atelier-claims-cache-'));
    const ctx = { material: '', task: '', placeholders: false, qualifiedReaders, cacheDir };
    const first = writer(flags); const again = writer({ specifics: [] });
    const a = modelSensor(first, { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', ctx);
    await a.read('The review took 94 minutes.');
    const b = modelSensor(again, { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', ctx);
    await b.read('The review took 94 minutes.');
    expect(again.seen).toHaveLength(0);
    expect(b.reading('The review took 94 minutes.')?.claims).toHaveLength(1);
    // other material is another reading
    const c = modelSensor(writer({ specifics: [] }), { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', { ...ctx, material: 'The review took 94 minutes.' });
    await c.read('The review took 94 minutes.');
    expect(c.reading('The review took 94 minutes.')?.claims).toHaveLength(0);
  });
});

describe('A4: a figure computed from the person\'s own is theirs', () => {
  it('products, growth, shares and ratios at the figure\'s own precision', () => {
    expect(derivedFromKnown('17 times 6 is 102.', 'What is 17 times 6?')).toBe(true);
    expect(derivedFromKnown('Revenue grew 25%.', 'Revenue was 80 last year and 100 this year.')).toBe(true);
    expect(derivedFromKnown('The margin is 33.3%.', 'Cost 200, revenue 600.')).toBe(true);
  });
  it('a wrong result, or a figure from nowhere, is not', () => {
    expect(derivedFromKnown('Revenue grew 30%.', 'Revenue was 80 last year and 100 this year.')).toBe(false);
    expect(derivedFromKnown('We saw 47 of them fail.', 'Revenue was 80.')).toBe(false);
  });
  it(`past ${MAX_KNOWN} known figures nothing is derived: almost any number would be some pair's result`, () => {
    expect(derivable('4999', Array.from({ length: MAX_KNOWN + 1 }, (_, i) => i * 7))).toBe(false);
  });
  it('the number is exempt, never an invented source beside it (an outside re-test, P0-1)', () => {
    const material = 'Revenue was 80 last year and 100 this year.';
    const sourced = checkDraft('d', v, 'According to a 2024 report, revenue grew 25% from 80 to 100.', { material });
    const u = sourced.checked.find((c) => c.requirementId === 'UNSOURCED');
    expect(u?.result.verdict).toBe('VIOLATED');
    expect((u?.result.spans[0] as { kind?: string }).kind).toBe('SOURCE');
    const plain = checkDraft('d', v, 'Data shows revenue grew 25% from 80 to 100.', { material });
    expect(plain.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.verdict).toBe('MET');
    expect(plain.checked.find((c) => c.requirementId === 'UNSOURCED·public')?.result.spans[0].why).toMatch(/check the arithmetic/);
    expect(checkDraft('d', v, 'Our CFO said revenue grew 25%.', { material }).checked.find((c) => c.requirementId === 'UNSOURCED')?.result.verdict).toBe('VIOLATED');
  });
});

describe('A5: nothing asked for that needs material nobody gave', () => {
  const md = '## What to do\n\n1. Lead with the answer.\n   Checked: the opening.\n   <!-- p1 -->\n\n2. Name the design alternative we rejected, and why.\n   <!-- p2 -->\n\n## Moves\n\n- Tell the story of an outage you fixed.\n- Keep sentences short.\n';
  it('a waiting rule and a waiting move are withheld, with their indented lines; the rest stays', () => {
    const out = withoutRules(md, ['Name the design alternative we rejected, and why.', 'Tell the story of an outage you fixed.']);
    expect(out).not.toContain('design alternative');
    expect(out).not.toContain('<!-- p2 -->');
    expect(out).not.toContain('outage');
    expect(out).toContain('1. Lead with the answer.');
    expect(out).toContain('   Checked: the opening.');
    expect(out).toContain('- Keep sentences short.');
  });
  it('a decision told as made is a claim; a decision recommended is not', () => {
    for (const t of ['We considered a queue and rejected it for latency.', 'We chose Postgres over Mongo.', 'The reason we dropped it was cost.']) expect(unsourcedClaims(t, ''), t).toHaveLength(1);
    for (const t of ['We should consider a queue.', 'If you choose Postgres, index early.', 'Teams often reject queues too early.']) expect(unsourcedClaims(t, ''), t).toEqual([]);
  });
});
