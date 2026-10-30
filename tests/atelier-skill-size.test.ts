// tests/atelier-skill-size.test.ts — SKILL.MD FITS THE STRICTEST HOST, HOWEVER LARGE THE STANDARD.
//
// A host that loads a skill reads SKILL.md's body whole and refuses, or cuts, past its limit; the reference files beside it
// are read on demand. So what grows with the author's corpus (their pieces, their passages, a rule's example) belongs in a
// referenced file, and the body is what the writer must read first. A large invented standard (many rules, a dozen pieces,
// passages of the author's own, a persona) is compiled here and its body held under the strictest limit known.
import { describe, it, expect } from 'vitest';
import { renderAgentSkill, PASSAGES_FILE } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import { skillSizeOf, describeSize, SKILL_BODY_LIMIT, skillBody } from '../core/eval/size.js';
import { composeServed } from '../cli/served.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

const TOPICS = ['tide tables', 'sourdough starters', 'bicycle gears', 'night trains', 'beekeeping', 'lighthouse keepers', 'map folding', 'river ferries',
  'kiln firing', 'orchard grafting', 'choir rehearsals', 'harbour cranes'];
const paragraph = (topic: string, k: number): string => `On ${topic}, the part people skip is step ${k}. I say it plainly because it cost me a season to learn: `
  + `you do the slow thing first, and you check it twice before anyone is watching, and then the quick things look after themselves.`;
const piece = (topic: string): string => `# Notes on ${topic}\n\n${Array.from({ length: 14 }, (_, k) => paragraph(topic, k)).join('\n\n')}`;

const rules: Requirement[] = Array.from({ length: 60 }, (_, i) => aRequirement({
  requirementId: `r${i + 1}`,
  statement: `Rule ${i + 1}: I ${['open on a concrete scene', 'name the cost before the benefit', 'keep one figure per paragraph', 'close on what the reader does next', 'use the second person when giving advice', 'admit what I got wrong before I correct anyone'][i % 6]}, and I say why in the sentence that follows.`,
  materiality: i % 3 === 0 ? 'REQUIRED' : 'PREFERRED',
  kind: i % 7 === 0 ? 'BOUNDARY' : 'GENERATIVE',
  authority: 'EXPERT_RATIFIED',
  appliesWhen: i % 4 === 0 ? `the piece is about ${TOPICS[i % TOPICS.length]}` : 'GENERAL',
  evidence: paragraph(TOPICS[i % TOPICS.length], i).slice(0, 160),
  wouldBeAbsentIf: `the piece would ${i % 2 ? 'open on a summary' : 'hide the cost'}`,
}));
const v = { standardVersionHash: 'big', evidenceId: 'e', workType: 'writing', authorityState: 'RATIFIED', mintedAt: '2026-10-24T00:00:00Z',
  requirements: rules, supersedes: null, reason: null } as unknown as StandardVersion;
const voice = {
  passages: TOPICS.slice(0, 10).map((t) => Array.from({ length: 4 }, (_, k) => paragraph(t, k)).join(' ')),
  lengthWords: [700, 1400] as const,
  pieces: TOPICS.map(piece),
  persona: { dropped: 0, points: Array.from({ length: 12 }, (_, i) => ({ aspect: `aspect ${i + 1}`, description: `Talks to the reader as someone who has done it, habit ${i + 1}.`,
    frequency: 'OFTEN' as const, quote: 'you do the slow thing first' })) },
};

describe('SKILL.md\'s body stays under the strictest host limit', () => {
  const pkg = renderAgentSkill(v, compileArchitecture(v), 'big-skill', 'Writes field notes in the author\'s voice.', null, [], voice);
  const md = pkg.files['SKILL.md'];
  const body = skillBody(md);

  it('the fixture is large: every rule, every piece and every passage is served somewhere', () => {
    expect(Object.keys(pkg.files).filter((f) => /^examples\/voice-\d+\.md$/.test(f))).toHaveLength(TOPICS.length);
    // a prohibition is said in the renderer's own words around the rule's; the rule's number and its words stay
    const all = Object.values(pkg.files).join('\n').toLowerCase();
    for (const r of rules) expect(all).toContain(r.statement.slice(0, 40).toLowerCase());
    for (const p of voice.passages) expect(all).toContain(p.slice(0, 80).toLowerCase());
  });
  it(`the body after the front matter is at most ${SKILL_BODY_LIMIT.toLocaleString('en-US')} bytes`, () => {
    expect(md.startsWith('---\n')).toBe(true);
    expect(body.length).toBeLessThan(md.length);
    expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(SKILL_BODY_LIMIT);
  });
  it('what grows with the corpus is a referenced file: the passages are named in SKILL.md and held beside it', () => {
    expect(md).toContain(`\`${PASSAGES_FILE}\``);
    for (const p of voice.passages) { expect(md).not.toContain(p.slice(0, 80)); expect(pkg.files[PASSAGES_FILE]).toContain(p.slice(0, 80)); }
  });
  it('the skill card says how many bytes SKILL.md is', () => {
    const served = composeServed(pkg.files, '');
    const size = skillSizeOf(pkg.files, served.servedText, served.servedExamples);
    expect(size.skillMd?.bytes).toBe(Buffer.byteLength(md, 'utf8'));
    expect(describeSize(size)).toContain(`SKILL.md ${Buffer.byteLength(md, 'utf8').toLocaleString('en-US')} bytes`);
    expect(size.skillMd?.body).toBe(Buffer.byteLength(body, 'utf8'));
    expect(describeSize(size)).not.toContain('over the');
    // polarity: a body past the limit is said on the card
    expect(describeSize({ ...size, skillMd: { bytes: SKILL_BODY_LIMIT + 300, body: SKILL_BODY_LIMIT + 1 } })).toContain('its body is over the 24,000 bytes the strictest host loads');
  });
});
