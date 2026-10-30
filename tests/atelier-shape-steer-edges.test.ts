// tests/atelier-shape-steer-edges.test.ts — A HASHTAG THAT IS A WORD KEEPS ITS WORD; A LENGTH AIM STAYS IN THE AUTHOR'S BAND.
// Expected values are read off the sentences and the bands, never off the code under test.
import { describe, it, expect } from 'vitest';
import { removeShapeExtras, shapeLengthAim, ownLinks, LENGTH_TOLERANCE } from '../core/loop/shape-steer.js';
import { checkDraft } from '../core/loop/run-repair.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';

describe('a hashtag is removed whole only where it is a tag', () => {
  it('a hashtag at the end of a sentence is a word of it: its # goes, the word stays', () => {
    expect(removeShapeExtras('We shipped after #approval.', 'hashtags', 0)).toBe('We shipped after approval.');
    expect(removeShapeExtras('We shipped after #approval', 'hashtags', 0)).toBe('We shipped after approval');
    expect(removeShapeExtras('Ask the #platform team, then the #security team!', 'hashtags', 0)).toBe('Ask the platform team, then the security team!');
    expect(removeShapeExtras('#Python is still the glue.', 'hashtags', 0)).toBe('Python is still the glue.');
  });
  it('tags after the sentence ends, or on a line of their own, go whole', () => {
    expect(removeShapeExtras('Shipped the rebuild. #devops #database', 'hashtags', 0)).toBe('Shipped the rebuild.');
    expect(removeShapeExtras('Shipped the rebuild.\n\n#devops #database', 'hashtags', 0)).toBe('Shipped the rebuild.');
    expect(removeShapeExtras('Shipped the rebuild! 🚀 #devops', 'hashtags', 0)).toBe('Shipped the rebuild! 🚀');
  });
  it('what is not a hashtag is left alone', () => {
    expect(removeShapeExtras('Rewrote it in C# and F#.', 'hashtags', 0)).toBe('Rewrote it in C# and F#.');
    expect(removeShapeExtras('See issue #42 for the trace.', 'hashtags', 0)).toBe('See issue #42 for the trace.');
  });
});

describe('a length aim stays inside the author\'s band', () => {
  it('the tolerance is 15%', () => { expect(LENGTH_TOLERANCE).toBe(0.15); });
  it('a draft far past the ceiling is aimed at the band itself, never under its floor', () => {
    // band 150 to 155 characters, draft 385: the aim names the band, not a number under 150
    const a = shapeLengthAim(385, 150, 155, 'characters');
    expect(a.aim).toBe('aim for 150 to 155 characters');
    expect(a.move).toBe('about 230 characters shorter');
  });
  it('a draft within 15% of the band is left as it is', () => {
    expect(shapeLengthAim(178, 117, 155, 'characters').aim).toBeUndefined();   // 155 * 1.15 = 178.25
    expect(shapeLengthAim(179, 117, 155, 'characters').aim).toBe('aim for 117 to 155 characters');
    expect(shapeLengthAim(100, 117, 155, 'characters').aim).toBeUndefined();   // 117 * 0.85 = 99.45: within
  });
});

describe('a learned length past its ceiling is steered only beyond the tolerance', () => {
  const band = { observer: 'SHAPE' as const, params: { shape: ['characters'], min: 117, max: 155 } };
  it('178 characters against a 155 ceiling is left as it is; 179 is steered', async () => {
    const { steersMiss } = await import('../core/loop/shape-steer.js');
    expect(steersMiss(band, 0.5, 178)).toBe(false);
    expect(steersMiss(band, 0.5, 179)).toBe(true);
    expect(steersMiss({ observer: 'SHAPE', params: { shape: ['hashtags'], max: 0 } }, 1, 1)).toBe(true);   // a count is exact
  });
});

describe('a link the request or the material supplies is the person\'s, never a habit miss (expected values read off the texts)', () => {
  const rule = (id: string, measurement: Requirement['measurement'], extra: Partial<Requirement> = {}): Requirement => ({ requirementId: id, statement: id, materiality: 'PREFERRED',
    authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', provenance: 'MACHINE_DISCOVERED', measurement, ...extra } as unknown as Requirement);
  const band = { observer: 'SHAPE' as const, params: { shape: ['links'], max: 0 } };
  const spec = 'https://example.org/spec';
  it('the links of a text that stand in the request or the material, trailing punctuation aside', () => {
    expect(ownLinks(`See ${spec}. Then https://elsewhere.example/x too.`, [`Review ${spec} for me`])).toEqual([spec]);
    expect(ownLinks('No link here.', [spec])).toEqual([]);
    expect(ownLinks(`See ${spec}.`, ['nothing about it'])).toEqual([]);
  });
  it('a removal in code leaves the person\'s own links where they stand and counts only the rest against the band', () => {
    expect(removeShapeExtras(`Shipped it.\n\n${spec} https://b.example/two`, 'links', 0, [spec])).toBe(`Shipped it.\n\n${spec}`);
    // one allowed: the first link that is not the person's stays, the next goes
    expect(removeShapeExtras(`Done.\n\n${spec} https://b.example/two https://c.example/three`, 'links', 1, [spec])).toBe(`Done.\n\n${spec} https://b.example/two`);
  });
  it('on a check, a learned no-links band counts only the links that are not the person\'s: both from the material, the band holds', () => {
    const v = { standardVersionHash: 's', requirements: [rule('links', band)] } as unknown as StandardVersion;
    const two = `Read ${spec} and https://example.org/notes before Friday.`;
    const r = checkDraft('d', v, two, { material: `The spec: ${spec}\nThe notes: https://example.org/notes` });
    const line = r.checked.find((c) => c.requirementId === 'links');
    expect([line?.result.verdict, line?.result.value, line?.result.error]).toEqual(['MET', 0, 0]);
    expect(line?.result.detail).toBe('no links of its own (2 from the request or the material; your pieces carry none)');
    expect(line?.result.spans).toEqual([]);
  });
  it('one from the request and one from nowhere: a miss of one, pointing only at the one that is not the person\'s', () => {
    const v = { standardVersionHash: 's', requirements: [rule('links', band)] } as unknown as StandardVersion;
    const text = `Read ${spec} and https://elsewhere.example/x before Friday.`;
    const r = checkDraft('d', v, text, { context: { request: `Announce ${spec} to the team` } });
    const line = r.checked.find((c) => c.requirementId === 'links');
    expect([line?.result.verdict, line?.result.value, line?.result.error]).toEqual(['VIOLATED', 1, 1]);
    expect(line?.result.spans.map((sp) => sp.text)).toEqual(['https://elsewhere.example/x']);
    expect(line?.result.detail).toBe('no links; this has 1 of its own (1 more is from the request or the material)');
  });
  it('a band the owner stated is theirs: counted as written, the person\'s links included', () => {
    const v = { standardVersionHash: 's', requirements: [rule('links', band, { provenance: 'EXPERT_ADDED' })] } as unknown as StandardVersion;
    const r = checkDraft('d', v, `Read ${spec} today.`, { material: spec });
    expect([r.checked[0]?.result.verdict, r.checked[0]?.result.value]).toEqual(['VIOLATED', 1]);
  });
});
