// tests/atelier-claim-cascade.test.ts — THE CLAIM CHECK NEVER EATS THE ANSWER.
//
// Found by a head-to-head test of a coding-assistant skill. On a technical explanation the claim reader
// flagged three sentences; the loop cut them and read the text again, the reader flagged sentences it
// had passed the first time, and again: fourteen of sixteen sentences were cut, two empty list items
// were delivered, and the report said every rule held. These pin the four fixes: one verdict per
// sentence for the whole run, an honest report when a cut takes much of a draft, the skill's own
// wording counted as known, and a stated rule that became no rule shown before anything binds.

import { describe, it, expect } from 'vitest';
import { enforceClaims, claimMemory, heavyCut, refineToStandard, checkDraft, INCONCLUSIVE } from '../core/loop/run-repair.js';
import { FORMATS } from '../core/observers/formats.js';
import { isReplyWork } from '../cli/commands/skill.js';
import { modelSensor, READER_VERSION } from '../core/loop/claim-extract.js';
import { uncarriedSections } from '../core/ratification/grounding.js';
import type { InferenceClient } from '../core/inference/client.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import type { VerifyReport } from '../core/observers/verify.js';

const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
const ok = (json: unknown): Promise<never> => Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never);
const qualifiedReaders = [{ model: 'claude-haiku-4-5', version: READER_VERSION }];

/** A reader that, on each read, flags the sentence it is told to by text: a new one every time. */
function driftingReader(flagOnRead: readonly string[]): InferenceClient & { calls: number } {
  const c = { calls: 0, complete: (req: { userMessage: string }) => {
    const want = flagOnRead[Math.min(c.calls++, flagOnRead.length - 1)];
    const units = [...req.userMessage.matchAll(/^\[(\d+)\] (.*)$/gm)].map((m) => ({ n: Number(m[1]), text: m[2] }));
    const hit = units.find((u) => u.text.includes(want));
    return ok({ specifics: hit ? [{ sentence: hit.n, text: want, kind: 'NAMED_FACT', attributed: false, source: 'NONE', support: '' }] : [] });
  } };
  return c;
}

const ANSWER = 'Pinning the algorithm closes two attacks. The attacker controls the alg header. '
  + 'A token can claim to be unsigned. The library then skips the signature. Pin it on sign too.';

describe('one verdict per sentence for the whole run', () => {
  it('a sentence the reader passed in the fuller text is not cut when a later read flags it', async () => {
    // Read 1 flags "unsigned"; after that cut, read 2 flags "alg header", which read 1 passed.
    const sensor = modelSensor(driftingReader(['claim to be unsigned', 'controls the alg header', 'skips the signature']),
      { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', { material: '', task: '', placeholders: false, qualifiedReaders });
    const r = await enforceClaims('d', v, ANSWER, { claimSensor: sensor });
    expect(r.cut).toEqual(['A token can claim to be unsigned.']);
    expect(r.text).toContain('The attacker controls the alg header.');
    expect(r.text).toContain('The library then skips the signature.');
    expect(r.report.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.verdict).toBe('MET');
  });

  it('polarity: with no memory, the same drifting reader cascades, which is the defect', async () => {
    const sensor = modelSensor(driftingReader(['claim to be unsigned', 'controls the alg header', 'skips the signature']),
      { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', { material: '', task: '', placeholders: false, qualifiedReaders });
    const forgetful = { apply: (_t: string, report: VerifyReport) => report, demote: () => undefined, doubt: () => undefined, listed: () => [] };
    const r = await enforceClaims('d', v, ANSWER, { claimSensor: sensor }, undefined, forgetful);
    expect(r.cut.length).toBe(3);
  });

  it('the memory drops only re-flagged sentences it already passed, and says how many', () => {
    const line = (spans: string[]): VerifyReport => ({ failed: spans.length > 0, checked: [{ requirementId: 'UNSOURCED', materiality: 'REQUIRED',
      result: { verdict: spans.length ? 'VIOLATED' : 'MET', value: spans.length, detail: 'x', spans: spans.map((t) => ({ start: 0, end: t.length, text: t, why: '' })) } }] } as never);
    const m = claimMemory();
    m.apply('One. Two. Three.', line(['One.']));
    const again = m.apply('Two. Three. Four.', line(['Two.', 'Four.']));
    const u = again.checked[0].result;
    expect(u.spans.map((s) => s.text)).toEqual(['Four.']);
    expect(u.detail).toMatch(/1 sentence\(s\) already passed or listed/);
    expect(again.failed).toBe(true);
  });

  it('through the loop: a drifting reader cannot take a technical answer apart', async () => {
    const sensor = modelSensor(driftingReader(['claim to be unsigned', 'controls the alg header', 'skips the signature', 'Pin it on sign']),
      { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', { material: '', task: '', placeholders: false, qualifiedReaders });
    const writer = { complete: () => ok({ replacements: [] }) } as unknown as InferenceClient;
    const out = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', v, ANSWER, 2, { claimSensor: sensor });
    expect(out.repair?.storiesCut).toEqual(['A token can claim to be unsigned.']);
    expect(out.output.split('. ').length).toBeGreaterThanOrEqual(4);
  });
});

describe('an honest report when a cut takes much of a draft', () => {
  it('a third or more of the sentences cut (at least three) is said as the answer being gone', () => {
    const cut = ['Pinning the algorithm closes two attacks.', 'The attacker controls the alg header.', 'A token can claim to be unsigned.'];
    expect(heavyCut(ANSWER, cut)).toMatch(/cut 3 of 5 sentences, so much of the draft is gone.*--allow-unsourced/);
  });
  it('a few cuts in a long draft are not', () => {
    expect(heavyCut(ANSWER, ['A token can claim to be unsigned.'])).toBeNull();
    expect(heavyCut(`${ANSWER} ${ANSWER} ${ANSWER}`, ['a', 'b', 'c'])).toBeNull();
  });
});

describe('a stated rule that became no rule is shown before anything binds', () => {
  const stated = '## Rules\n\n### 1. Lead with the next action\n\nThe first line is something the reader can do.\n\n'
    + '### 2. No preamble, no recap, no closing pleasantries\n\nForbidden closers: "Hope this helps", "Let me know".\n';
  it('the dropped section is named, and a group heading on its own is not', () => {
    expect(uncarriedSections(stated, [{ statement: 'Lead with the next action: the first line is something the reader can do.', sourceSpan: '' }]))
      .toEqual(['No preamble, no recap, no closing pleasantries']);
  });
  it('nothing is listed when every section carries a rule', () => {
    expect(uncarriedSections(stated, [{ statement: 'Lead with the next action.', sourceSpan: 'The first line is something the reader can do' },
      { statement: 'Never close with a pleasantry such as "Hope this helps".', sourceSpan: 'Forbidden closers' }])).toEqual([]);
  });
  it('without headings, paragraphs are the sections', () => {
    expect(uncarriedSections('Lead with the action and keep it short.\n\nNever end with an offer of more help or a question.',
      [{ statement: 'Lead with the action.', sourceSpan: 'Lead with the action' }])).toEqual(['Never end with an offer of more help or a question.']);
  });
});

describe('assistant replies: specifics are listed for the reader to check, never cut', () => {
  const reply = 'Cost 14 is your 2 seconds. A senior engineer once told me cost 12 is plenty. Next: run the login test.';
  const listing = { material: '', format: FORMATS['assistant-reply'] };

  it('an untraced remark in an assistant reply is listed to check, not failed', () => {
    const r = checkDraft('d', v, reply, listing);
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.verdict).toBe('MET');
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED·check')?.materiality).toBe('PREFERRED');
    expect(r.failed).toBe(false);
  });

  it('the loop cuts nothing and hands the list on', async () => {
    const writer = { complete: () => ok({ replacements: [] }) } as unknown as InferenceClient;
    const out = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', v, reply, 2, listing);
    expect(out.output).toBe(reply);
    expect(out.repair?.storiesCut).toBeUndefined();
    expect(out.repair?.claimsToCheck?.join(' ')).toContain('cost 12 is plenty');
  });

  it('polarity: the same reply as published writing is cut', async () => {
    const writer = { complete: () => ok({ replacements: [] }) } as unknown as InferenceClient;
    const out = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', v, reply, 2, { material: '' });
    expect(out.output).not.toContain('cost 12 is plenty');
  });

  it('atelier skill reads reply work as replies, and other writing as writing', () => {
    for (const w of ['assistant replies', 'coding assistant answers', 'customer support replies', 'code review comments']) expect(isReplyWork(w), w).toBe(true);
    for (const w of ['blog posts', 'essays', 'LinkedIn posts', 'writing']) expect(isReplyWork(w), w).toBe(false);
  });
});

describe('the balance: when the check flags much of a draft, only the unambiguous inventions are cut', () => {
  const draft = 'Last year I shipped a retry loop that broke production. According to a 2023 survey, 73% of teams saw the same. '
    + 'A 2024 report found that 41% of outages start in retries. I watched a junior engineer debug it for a week. Retries need a budget.';

  it('stories told as lived are cut; flagged figures are listed for the person to check', async () => {
    const r = await enforceClaims('d', v, draft, { material: '' });
    expect(r.text).not.toContain('Last year I shipped');
    expect(r.text).not.toContain('I watched a junior engineer');
    expect(r.text).toContain('73% of teams');
    expect(r.text).toContain('41% of outages');
    expect(r.listed.join(' ')).toContain('73%');
    // LISTED IS NOT PASSED in published writing: the figures nobody confirmed fail the claim floor.
    const unsure = r.report.checked.find((c) => c.requirementId === INCONCLUSIVE);
    expect(unsure?.result.verdict).toBe('VIOLATED');
    expect(unsure?.result.spans.map((sp) => sp.text).join(' ')).toContain('41% of outages');
    expect(r.report.failed).toBe(true);
  });

  it('polarity: in an answer, where specifics are listed by design, the list is the verdict', async () => {
    const r = await enforceClaims('d', v, draft, { material: '', format: FORMATS['assistant-reply'] });
    expect(r.report.checked.some((c) => c.requirementId === INCONCLUSIVE)).toBe(false);
  });

  it('a draft with only a few flags is still cut in full, figures included', async () => {
    const light = 'Retries need a budget. Every call should carry a deadline. According to a 2023 survey, 73% of teams saw the same. '
      + 'Budgets make the failure visible. Deadlines keep it bounded. Both belong in the client.';
    const r = await enforceClaims('d', v, light, { material: '' });
    expect(r.text).not.toContain('73%');
    expect(r.listed).toEqual([]);
  });
});
