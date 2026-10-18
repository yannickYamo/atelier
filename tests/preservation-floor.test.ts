import { describe, it, expect } from 'vitest';
import { applyStep } from '../core/loop/repair.js';
import { stepLedger } from '../core/loop/controller.js';
import { workLost, codeOf } from '../core/loop/integrity.js';
import { verifyText } from '../core/observers/verify.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const V = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
const read = (t: string) => verifyText('d', V, t);
const ANSWER = 'Exchange the code:\n\n```\nPOST https://auth.example.com/token\ngrant_type=authorization_code\n```\n\nRun `npm test` after.';

describe('the preservation floor: no repair step takes the work away', () => {
  it('reads fenced blocks and inline code', () => {
    expect(codeOf(ANSWER)).toEqual({ blocks: ['POST https://auth.example.com/token\ngrant_type=authorization_code'], inline: ['npm test'] });
  });
  it('a URL inside code is never removed, by any step, a redraft included', () => {
    const after = ANSWER.replace(' https://auth.example.com/token', '');
    for (const action of ['mechanical', 'rewrite', 'redraft', 'cut']) expect(workLost(ANSWER, after, action)).toMatch(/auth\.example\.com\/token/);
  });
  it('an emptied code block is refused (the PKCE "```\\n\\n```" case)', () => {
    const before = 'Back comes:\n\n```\nhttps://app.example.com/callback?code=abc\n```';
    expect(workLost(before, 'Back comes:\n\n```\n\n```', 'redraft')).not.toBeNull();
  });
  it('a span edit may not change code; a redraft may, a claim cut may remove it', () => {
    const after = ANSWER.replace('`npm test`', '`npm run test`');
    expect(workLost(ANSWER, after, 'rewrite')).toMatch(/npm test/);
    expect(workLost(ANSWER, after, 'redraft')).toBeNull();
    expect(workLost(ANSWER, 'Exchange the code.', 'claim-redraft')).toBeNull();
    expect(workLost(ANSWER, 'Exchange the code.', 'cut')).not.toBeNull();
  });
  it('every whole-draft step may write its code again (the coverage, voice and taste drafts), keeping URLs and blocks', () => {
    const after = ANSWER.replace('`npm test`', '`npm run test`').replace('grant_type=authorization_code', 'grant_type=authorization_code&code_verifier=v');
    for (const action of ['coverage', 'voice', 'taste', 'redraft']) expect(workLost(ANSWER, after, action), action).toBeNull();
    expect(workLost(ANSWER, after.replace(' https://auth.example.com/token', ''), 'coverage')).toMatch(/from the code/);
  });
  it('prose links may go; the code stays (what a learned "no links" removal does)', () => {
    const before = `${ANSWER}\n\nSee https://oauth.net/2/pkce/ for the spec.`;
    expect(workLost(before, `${ANSWER}\n\nSee the spec.`, 'mechanical')).toBeNull();
  });
  it('is enforced in every step: a step that empties code is not kept, and says why', async () => {
    const r = await applyStep(stepLedger(), { action: 'mechanical', targets: ['shape-links'], why: 't', expectedGain: 1, expectedCostUsd: 0 },
      { text: ANSWER, report: read(ANSWER) }, async () => { const t = ANSWER.replace(' https://auth.example.com/token', ''); return { text: t, report: read(t) }; }, { purposes: ['repair'] });
    expect(r.kind === 'judged' && r.kept).toBe(false);
    expect(r.kind === 'judged' ? r.why : '').toMatch(/from the code it stood in/);
  });
});
