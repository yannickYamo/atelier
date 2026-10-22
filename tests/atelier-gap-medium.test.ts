// GAP AUDIT 2026-10-22, MEDIUM: unit tests, expected values read from the defects as described.
import { describe, it, expect } from 'vitest';
import { checkDraft, enforceClaims, listedClaims } from '../core/loop/run-repair.js';
import { claimAction, patternSensor } from '../core/loop/claim-extract.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const STD = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;

describe('M1: the owner\'s cut is a qualified reader\'s, never the pattern check\'s', () => {
  const material = 'Invoice 1: 1,200 EUR. Invoice 2: 800 EUR.';
  const memo = 'The reserve is 2,000 EUR. The adjuster estimated a further 4,750 EUR of damage.\n';
  const cut = claimAction({ level: 'GROUNDED', cls: 'essay', bound: true, ownerCut: true });
  it('the owner chose cut and the kind is measured: the action names what stands in its place where no qualified reader reads', () => {
    expect(cut.act).toBe('cut');
    expect(cut.otherwise).toEqual(claimAction({ level: 'GROUNDED', cls: 'essay', bound: true }));
  });
  it('with only the pattern check reading, nothing is cut: the grounded level flags it for review', async () => {
    const opts = { material, claimSensor: patternSensor(material, false), listsBecause: cut.why, claimAct: cut.act, cutOtherwise: cut.otherwise };
    const e = await enforceClaims('s', STD, memo, opts);
    expect(e.text).toBe(memo);
    expect(e.cut).toEqual([]);
    expect(listedClaims(checkDraft('s', STD, memo, opts))).toEqual([expect.stringContaining('4,750')]);
  });
});

import { acceptedCarried } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

describe('M2: the owner\'s unmeasured choice is carried, closing again or amending', () => {
  const judged = (id: string, statement: string) => aRequirement({ requirementId: id, statement, provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'JUDGEMENT' });
  const counted = (id: string, statement: string) => aRequirement({ requirementId: id, statement, provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE',
    measurement: { observer: 'LENGTH', params: { unit: ['words'], min: 10, max: 400 } } });
  const prior = { requirements: [judged('x1', 'Take a position.'), judged('x2', 'Keep it warm.')], acceptedUnmeasured: ['x1'], latitude: { level: 'GROUNDED' as const, evidence: [], by: 'owner' as const } };
  it('closing again with nothing said keeps what the owner accepted, found by the rule\'s words, whatever its id now', () => {
    expect(acceptedCarried('GROUNDED', [judged('x5', 'Keep it warm.'), judged('x4', 'Take a position.')], undefined, prior)).toEqual(['x4']);
  });
  it('what the owner says now decides', () => {
    expect(acceptedCarried('GROUNDED', prior.requirements, 'review', prior)).toEqual([]);
    expect(acceptedCarried('GROUNDED', prior.requirements, 'accept', prior)).toEqual(['x1', 'x2']);
  });
  it('a new level keeps the owner\'s choice; a choice that was only the old level\'s default gives way to the new one\'s', () => {
    expect(acceptedCarried('CREATIVE', prior.requirements, undefined, prior)).toEqual(['x1']);
    const byDefault = { ...prior, acceptedUnmeasured: ['x1', 'x2'], latitude: { level: 'CREATIVE' as const, evidence: [], by: 'model' as const } };
    expect(acceptedCarried('GROUNDED', prior.requirements, undefined, byDefault)).toEqual([]);
  });
  it('amend --measure moves a rule out (it gained a check) and in (it lost one, on a level that accepts)', () => {
    expect(acceptedCarried('GROUNDED', [counted('x1', 'Take a position.'), prior.requirements[1]], undefined, prior)).toEqual([]);
    const creative = { requirements: [counted('x1', 'Take a position.')], acceptedUnmeasured: [], latitude: { level: 'CREATIVE' as const, evidence: [], by: 'owner' as const } };
    expect(acceptedCarried('CREATIVE', [judged('x1', 'Take a position.')], undefined, creative)).toEqual(['x1']);
  });
});

import { freezeKey, frozenFor, toFreeze } from '../core/method/freeze.js';
import type { StepCheck } from '../core/method/step-check.js';

describe('M3: a frozen check is read again once the owner rejects an output naming its step', () => {
  const step = { id: '1', text: 'Lead with the action.', under: null };
  const check: StepCheck = { how: 'written', measurement: { observer: 'CHECK', params: { source: ['(t) => ({ ok: true, detail: "", spans: [] })'] } }, quote: 'Lead', means: 'leads', by: 'model' };
  it('the key carries the step\'s rejected outputs; with none it is the key a build froze before', () => {
    expect(freezeKey(step.text, 'ex', [])).toBe(freezeKey(step.text, 'ex'));
    expect(freezeKey(step.text, 'ex', ['Thanks for asking!'])).not.toBe(freezeKey(step.text, 'ex'));
  });
  it('frozen with no rejection, it is not kept once one names the step', () => {
    const frozen = toFreeze([step], { 1: check }, 'ex');
    expect(frozenFor([step], 'ex', frozen).size).toBe(1);
    expect(frozenFor([step], 'ex', frozen, new Map([[step.text, ['Thanks for asking!']]])).size).toBe(0);
    const again = toFreeze([step], { 1: check }, 'ex', new Map(), new Map([[step.text, ['Thanks for asking!']]]));
    expect(frozenFor([step], 'ex', again, new Map([[step.text, ['Thanks for asking!']]])).size).toBe(1);
  });
});

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../core/state/store.js';
import { standardHashOf, type Requirement } from '../core/state/canonical-state.js';
import { rejectedOutputs } from '../cli/commands/method.js';
import { ruleNamed } from '../cli/commands/report.js';

describe('M4: a rejection names the rule of the standard it was made under, found by its words', () => {
  const rule = (id: string, statement: string): Requirement => aRequirement({ requirementId: id, statement, provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'JUDGEMENT' });
  const mint = (L: store.StoreLayout, reqs: Requirement[], tag: string): void => {
    const body = { evidenceId: null, workType: 'replies', requirements: reqs };
    const v = store.putStandard(L, { standardVersionHash: standardHashOf(body), ...body, authorityState: 'RATIFIED', mintedAt: '2026-10-22', supersedes: null, reason: null } as never);
    store.putSkillVersion(L, { skillVersionHash: `sv${tag}`, skillName: L.skillName, standardVersionHash: v.standardVersionHash, architectureHash: 'a', materializedHash: 'm', builtAt: '2026-10-22', description: 'd' });
    store.setActive(L, `sv${tag}`);
  };
  it('an unknown --rule is refused with the rules it could name', () => {
    const r = ruleNamed([rule('x1', 'Lead with the action.'), rule('x2', 'Keep it short.')], 'x9');
    expect(r).toMatchObject({ error: expect.stringContaining('x9') });
    expect('error' in r ? r.error : '').toContain('x2: Keep it short.');
    expect(ruleNamed([rule('x1', 'Lead with the action.')], 'x1')).toEqual({ id: 'x1', statement: 'Lead with the action.' });
  });
  it('the rejection keeps the words it was made under: rebuilt with the ids moved, it still breaks that step', () => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-m4-')), skillName: 'help' };
    mint(L, [rule('x1', 'Lead with the action.'), rule('x2', 'Keep it short.')], '1');
    store.setDrafted(L, [{ id: 'd1', request: 'r', answer: 'Thanks for asking! Restart it.', kept: false, rule: 'x1', ruleStatement: 'Lead with the action.' }]);
    mint(L, [rule('x1', 'Keep it short.'), rule('x2', 'Lead with the action.')], '2');
    expect([...rejectedOutputs(L)]).toEqual([['Lead with the action.', ['Thanks for asking! Restart it.']]]);
  });
});

import { qualifiedIn } from '../core/observers/written.js';

describe('M5: a check qualified under the old marker keeps its standing', () => {
  const written = (params: Record<string, unknown>): Requirement => aRequirement({ requirementId: 'x1', statement: 'Cite the clause.', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE',
    measurement: { observer: 'CHECK', params: { source: ['(t) => ({ ok: true, detail: "", spans: [] })'], ...params } } });
  it('params.qualified === 1, from a standard minted before qualifications sat beside it, is qualified', () => {
    expect(qualifiedIn({ requirements: [written({ qualified: 1 })] }, 'x1')).toBe(true);
    expect(qualifiedIn({ requirements: [written({})] }, 'x1')).toBe(false);
  });
  it('where the standing beside the standard is recorded, it decides', () => {
    expect(qualifiedIn({ requirements: [written({ qualified: 1 })], qualifications: { x1: { qualified: false } as never } }, 'x1')).toBe(false);
  });
});

import { planRepair, applyRepair, repairPrompt, type Reverted } from '../core/loop/repair.js';
import type { VerifyReport } from '../core/observers/verify.js';

describe('M6: the repair can fix what the rules named', () => {
  const report = (line: Record<string, unknown>): VerifyReport => ({ skill: 's', standardVersionHash: 'h', checked: [line], unchecked: [], conditional: [], failed: true } as never);
  it('a banned word inside a hedge: the rewrite may drop the hedge that carried it', () => {
    const text = 'Covered under clause 4.2.\n\nThe insured\'s account is suspicious and may be a scam. The claim is accepted.\n';
    const at = (w: string): { start: number; end: number; text: string; why: string } => ({ start: text.indexOf(w), end: text.indexOf(w) + w.length, text: w, why: `the banned word "${w}"` });
    const targets = planRepair(text, report({ requirementId: 'x7', statement: 'Do not write the words "fraud", "scam", "liar" or "suspicious".', materiality: 'REQUIRED', enforced: true, observer: 'LEXICON',
      result: { verdict: 'VIOLATED', value: 2, detail: '', spans: [at('suspicious'), at('scam')] } }));
    expect(targets).toHaveLength(1);
    const reverted: Reverted[] = [];
    const out = applyRepair(text, targets, [{ id: 1, text: 'The insured\'s account is consistent with the documents.' }], reverted);
    expect(reverted).toEqual([]);
    expect(out).toContain('consistent with the documents');
  });
  it('the reviewer\'s two cases: a "may" outside the banned clause is kept; a removed clause sharing "the" with the rest still goes', () => {
    const scamAt = (text: string) => ({ start: text.indexOf('scam'), end: text.indexOf('scam') + 4, text: 'scam', why: 'banned' });
    const plan = (text: string) => planRepair(text, report({ requirementId: 'x7', statement: 'Do not write the word "scam".', materiality: 'REQUIRED', enforced: true, observer: 'LEXICON',
      result: { verdict: 'VIOLATED', value: 1, detail: '', spans: [scamAt(text)] } }));
    // a second "may", outside the banned clause, lost by the rewrite: refused
    const a = 'Repairs may take a week, and it may be a scam.\n';
    const ra: Reverted[] = [];
    applyRepair(a, plan(a), [{ id: 1, text: 'Repairs take a week.' }], ra);
    expect(ra.map((r) => r.kind)).toEqual(['MEANING']);
    // the banned clause removed whole, though "the" survives in what is left: accepted
    const b = 'The account is plausible, and the claim may be a scam.\n';
    const rb: Reverted[] = [];
    const out = applyRepair(b, plan(b), [{ id: 1, text: 'The account is plausible.' }], rb);
    expect(rb).toEqual([]);
    expect(out).toContain('The account is plausible.');
  });
  it('a hedge outside the banned word\'s clause still may not go', () => {
    const text = 'Repairs may take a week, and the account is suspicious.\n';
    const at = (w: string) => ({ start: text.indexOf(w), end: text.indexOf(w) + w.length, text: w, why: 'banned' });
    const targets = planRepair(text, report({ requirementId: 'x7', statement: 'Do not write "suspicious".', materiality: 'REQUIRED', enforced: true, observer: 'LEXICON',
      result: { verdict: 'VIOLATED', value: 1, detail: '', spans: [at('suspicious')] } }));
    const reverted: Reverted[] = [];
    applyRepair(text, targets, [{ id: 1, text: 'Repairs take a week, and the account is under review.' }], reverted);
    expect(reverted[0]?.lost).toContain('the qualifier "may"');
  });
  it('a written check of what the work must contain that names a sentence: that sentence is rewritten, and a citation of a document in the material is no slot', () => {
    const text = '## Facts\n\nThe loss occurred on 3 March [notice of loss]. The items were in a locked container at the time.\n';
    const sp = 'The items were in a locked container at the time.';
    const targets = planRepair(text, report({ requirementId: 'x2', statement: 'Every fact cites the document in the file it comes from, in square brackets.', materiality: 'REQUIRED', enforced: true, observer: 'CHECK', obligation: 'DELIVERABLE',
      result: { verdict: 'VIOLATED', value: 1, detail: '', spans: [{ start: text.indexOf(sp), end: text.indexOf(sp) + sp.length, text: sp, why: 'no bracketed document' }] } }), { cites: ['police-report.txt', 'notice_of_loss.txt'] });
    expect(targets).toHaveLength(1);
    expect(repairPrompt(text, targets)).toContain('police report');
    const reverted: Reverted[] = [];
    const out = applyRepair(text, targets, [{ id: 1, text: 'The items were in a locked container at the time [police report].' }], reverted);
    expect(reverted).toEqual([]);
    expect(out).toContain('at the time [police report].');
    const invented: Reverted[] = [];
    applyRepair(text, targets, [{ id: 1, text: 'The items were in a locked container at the time [witness statement].' }], invented);
    expect(invented[0]?.kind).toBe('SLOT');
  });
});

import { overlapIndex, formTokensOut } from '../core/observers/overlap.js';

describe('M8: a structured output\'s fixed keys and category names are its form, not a passage lifted', () => {
  const ex = (cat: string, pri: string, why: string): string => JSON.stringify({ ticket_category: cat, priority_level: pri, customer_sentiment: 'neutral', needs_human_review: 'no', reason_for_label: why }, null, 1);
  const pieces = [ex('billing', 'high', 'The card was charged twice this month.'), ex('shipping', 'low', 'The parcel is a day late.'), ex('account', 'high', 'They cannot log in after the reset.')];
  const output = ex('billing', 'high', 'A refund was promised and never arrived.');
  it('the keys every example carries, and values the examples share, are left out of the count', () => {
    const before = overlapIndex(pieces)(output).longestShared;
    const after = overlapIndex(pieces)(formTokensOut(output, pieces, '')).longestShared;
    expect(before).toBeGreaterThanOrEqual(12);
    expect(after).toBeLessThan(6);
  });
  it('prose is untouched, and a free-text value copied from an example still counts', () => {
    expect(formTokensOut('The card was charged twice this month.', pieces, '')).toBe('The card was charged twice this month.');
    const lifted = ex('billing', 'high', 'The card was charged twice this month, and again the month after that one.');
    expect(overlapIndex(pieces)(formTokensOut(lifted, pieces, '')).longestShared).toBeGreaterThanOrEqual(7);
  });
});
