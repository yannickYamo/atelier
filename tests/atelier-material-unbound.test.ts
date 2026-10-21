// A CHECK THAT READS THE MATERIAL CANNOT READ WHAT WAS NOT GIVEN. With no material bound (a hook event binds none; a
// verify with no --with), a written check that looks things up in the material was run against nothing and failed every
// memo: the golden too. It is now not applicable, unverified and named, and the run is not blocked on it. A citation
// that cannot be looked up is listed as unverifiable. A repair that ends with a rule still broken never says they hold.
import { describe, it, expect } from 'vitest';
import { measure } from '../core/observers/registry.js';
import { checkReadsMaterial, MATERIAL_UNREAD } from '../core/observers/written.js';
import { buildRecord } from '../core/eval/record-build.js';
import { checkDraft, listedClaims, whyAgrees } from '../core/loop/run-repair.js';
import { claimAction } from '../core/loop/claim-extract.js';
import type { Measurement, StandardVersion } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';
import { overlapIndex, suppliedWording } from '../core/observers/overlap.js';

const cites = "(text, request, material) => { const names = material.map((m) => m.name.toLowerCase()); const bad = [...text.matchAll(/\\[([^\\]]+)\\]/g)].filter((x) => !names.includes(x[1].toLowerCase())); return { ok: bad.length === 0, detail: bad.length ? 'cites a document not in the file' : 'every citation is in the file', spans: [] }; }";
const plain = "(text) => ({ ok: !/fraud/i.test(text), detail: 'no banned word', spans: [] })";
const m = (src: string): Measurement => ({ observer: 'CHECK', params: { source: [src], means: ['a written check'] } });
const memo = 'The claimant reported the theft on 3 March [police report].\n';

describe('which written checks read the material: the parameter list, read as code', () => {
  it('a check whose third parameter its body uses reads the material; one that names none does not', () => {
    expect(checkReadsMaterial(cites)).toBe(true);
    expect(checkReadsMaterial(plain)).toBe(false);
    expect(checkReadsMaterial('(t, r, m) => ({ ok: m.length > 0, detail: "", spans: [] })')).toBe(true);
    expect(checkReadsMaterial('(t, r, m) => ({ ok: true, detail: "", spans: [] })')).toBe(false);
    expect(checkReadsMaterial('function check(text, request, files) { return { ok: files.length >= 0 }; }')).toBe(true);
  });
});

describe('with no material bound, a check that reads it is not applicable, never failed', () => {
  it('not applicable with nothing bound; read as written with the file bound', () => {
    const none = measure(memo, m(cites), { material: [] });
    expect(none.verdict).toBe('NOT_APPLICABLE');
    expect(none.detail.startsWith(MATERIAL_UNREAD)).toBe(true);
    expect(measure(memo, m(cites), { material: [{ name: 'police report', text: 'CR/2026/4117' }] }).verdict).toBe('MET');
    expect(measure(memo, m(cites), { material: [{ name: 'policy', text: 'x' }] }).verdict).toBe('VIOLATED');
    // a check that reads no material runs as it always did
    expect(measure('this is fraud', m(plain), { material: [] }).verdict).toBe('VIOLATED');
  });
  it('the record says it was not checked, and the run is left for review, not blocked', () => {
    const rule = aRequirement({ requirementId: 'x2', statement: 'Every fact cites a document in the file.', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: m(cites) });
    const r = buildRecord({ requirements: [rule], checked: [{ id: 'x2', required: true, verdict: 'NOT_APPLICABLE', detail: `${MATERIAL_UNREAD}: not checked` }], waived: new Map(), request: null, claims: null, copying: null });
    expect(r.state).toBe('NEEDS_REVIEW');
    expect(r.entries[0]).toMatchObject({ result: 'UNVERIFIED' });
  });
});

describe('a citation with nothing to look it up in is listed as unverifiable', () => {
  const STD = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
  it('listed, never failed and never cut', () => {
    const text = 'The water came from the roof [witness statement]. See [the docs](https://example.com).\n';
    const r = checkDraft('s', STD, text, { material: '', listsBecause: claimAction({ level: 'STRICT', bound: false }).why, claimAct: 'list' });
    expect(r.failed).toBe(false);
    expect(listedClaims(r)).toEqual(['The water came from the roof [witness statement].']);
  });
});

describe('the repair never says the rules hold over a text that still breaks one', () => {
  it('the why is put right where the text is still blocked, and left alone where it is not', () => {
    expect(whyAgrees('every REQUIRED measured rule now holds', true, ['x2'])).toBe('a REQUIRED rule still fails: x2');
    expect(whyAgrees('every REQUIRED measured rule now holds (invented claims cut)', true, ['x2', 'x5'])).toBe('a REQUIRED rule still fails: x2, x5 (invented claims cut)');
    expect(whyAgrees('every REQUIRED measured rule now holds', false, [])).toBe('every REQUIRED measured rule now holds');
  });
});

describe('wording the material supplies is not copying', () => {
  it('a transcript quoted as evidence shares a long run with an example that quoted it, and is not counted', () => {
    const quote = 'we are going to take the whole city back tonight with whatever it takes from all of you';
    const example = `{"evidence": "${quote}", "risk": "High"}`;
    const out = `{"evidence": "${quote}", "risk": "Medium"}`;
    expect(overlapIndex([example])(out).longestShared).toBeGreaterThanOrEqual(18);
    expect(overlapIndex([example], suppliedWording(`CLIP 7\nTranscript:\n${quote}\n`))(out).longestShared).toBeLessThan(11);
  });
});
