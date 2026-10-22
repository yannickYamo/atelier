// THE RECORD AND THE CERTIFICATE CARRY THE LEVEL, AND A RULE THE OWNER ACCEPTED UNMEASURED IS LISTED, NOT A REVIEW.
// A judgement rule (no check reads it) holds a run at NEEDS_REVIEW unless the owner accepted it as unmeasured; then the
// run may be VERIFIED and the rule still stands on the record and the certificate. A specific listed for the owner still
// sends the run to review, whatever was accepted.
import { describe, it, expect } from 'vitest';
import { buildRecord } from '../core/eval/record-build.js';
import { certificateFor } from '../core/eval/certificate.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';
import { standardHashOf, defaultAccepted } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

const counted = aRequirement({ requirementId: 'x1', statement: 'Between 220 and 420 words.', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE',
  measurement: { observer: 'LENGTH', params: { unit: ['words'], min: 220, max: 420 } } });
const judged = aRequirement({ requirementId: 'x2', statement: 'Take a position and defend it.', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'JUDGEMENT' });
const reqs: Requirement[] = [counted, judged];
const checked = [{ id: 'x1', required: true, verdict: 'MET' as const, detail: '300 words' }];
const facts = (o: Partial<Parameters<typeof buildRecord>[0]> = {}): Parameters<typeof buildRecord>[0] =>
  ({ requirements: reqs, checked, waived: new Map(), request: null, claims: null, copying: null, ...o });

describe('owner-accepted unmeasured rules', () => {
  it('a judgement rule nobody accepted holds the run for review', () => {
    expect(buildRecord(facts()).state).toBe('NEEDS_REVIEW');
  });
  it('accepted, it is listed on the record and the run is VERIFIED', () => {
    const r = buildRecord(facts({ accepted: new Set(['x2']) }));
    expect(r.state).toBe('VERIFIED');
    const e = r.entries.find((x) => x.id === 'x2');
    expect(e).toMatchObject({ result: 'UNVERIFIED', reason: 'LISTED_FOR_YOU' });
    expect(e?.observation.evidence).toMatch(/accepted by you as unmeasured/);
  });
  it('a listed claim still forces review, whatever was accepted', () => {
    const r = buildRecord(facts({ accepted: new Set(['x2']), claims: { state: 'checked', bound: true, qualified: false, why: 'held creative', delivered: 0, open: 1, cut: 0 } }));
    expect(r.state).toBe('NEEDS_REVIEW');
  });
  it('a strict block of a specific is a block', () => {
    const r = buildRecord(facts({ accepted: new Set(['x2']), claims: { state: 'checked', bound: true, qualified: true, why: 'held strict', delivered: 1, open: 0, cut: 0 } }));
    expect(r.state).toBe('BLOCKED');
  });
  it('the default by level: creative accepts every rule no check reads, grounded and strict none, the owner overrides', () => {
    expect(defaultAccepted('CREATIVE', reqs)).toEqual(['x2']);
    expect(defaultAccepted('GROUNDED', reqs)).toEqual([]);
    expect(defaultAccepted('STRICT', reqs)).toEqual([]);
    expect(defaultAccepted('CREATIVE', reqs, 'review')).toEqual([]);
    expect(defaultAccepted('STRICT', reqs, 'accept')).toEqual(['x2']);
  });
});

describe('the record and the certificate carry the level', () => {
  const std = (o: Partial<StandardVersion>): StandardVersion => {
    const body = { evidenceId: null, workType: 'posts', requirements: reqs, ...o };
    return { standardVersionHash: standardHashOf(body), ...body, authorityState: 'RATIFIED', mintedAt: '2026-10-21', supersedes: null, reason: null };
  };
  it('the record says the level it was held at', () => {
    expect(buildRecord(facts({ latitude: 'STRICT' })).latitude).toBe('STRICT');
    expect(buildRecord(facts()).latitude).toBeUndefined();
  });
  it('the certificate names the skill\'s level, the run\'s, the words that tightened it, and the rules accepted unmeasured', () => {
    const v = std({ latitude: { level: 'CREATIVE', evidence: ['my newsletter'], by: 'model' }, acceptedUnmeasured: ['x2'] });
    const c = certificateFor(v, null, null, { level: 'STRICT', quote: 'revenue grew 40%' });
    expect(c.latitude).toEqual({ skill: 'CREATIVE', run: 'STRICT', tightenedBy: 'revenue grew 40%', setBy: 'model' });
    expect(c.acceptedUnmeasured).toEqual([{ id: 'x2', statement: 'Take a position and defend it.' }]);
    expect(certificateFor(std({}), null, null).latitude).toEqual({ skill: 'GROUNDED', run: 'GROUNDED', tightenedBy: null, setBy: 'default' });
  });
});
