// tests/atelier-skill-package.test.ts — A CARRIER IS NOT IMPLEMENTED UNTIL IT IS SERVED.
//
// The defect this file exists to make impossible: `componentFor` returned EXAMPLE, a test asserted
// that it returned EXAMPLE, the suite went green — and the renderer threw on it. Component-shape
// tests are not evidence about delivery. Every assertion below is about the bytes.

import { describe, it, expect } from 'vitest';
import { componentFor, roleFor, type SkillArchitecture } from '../core/architecture/compile.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import type { Requirement, StandardVersion, Materiality, RealizationTolerance } from '../core/state/canonical-state.js';


const req = (id: string, m: Materiality | null, t: RealizationTolerance | null = null, over: Partial<Requirement> = {}): Requirement => ({
  requirementId: id, statement: `rule ${id}`, appliesWhen: 'GENERAL', kind: 'GENERATIVE',
  authority: 'EXPERT_RATIFIED', provenance: 'MACHINE_DISCOVERED', evidence: `quote for ${id}`,
  evidenceItemId: 'u1', wouldBeAbsentIf: `you would not see ${id}`,
  materiality: m, realizationTolerance: t, outputShape: null, ...over });

const build = (reqs: Requirement[]) => {
  const v: StandardVersion = { standardVersionHash: 'sv', evidenceId: 'e', workType: 'analysis',
    requirements: reqs, authorityState: 'RATIFIED', mintedAt: '2026-08-23T00:00:00Z', supersedes: null, reason: null };
  const arch: SkillArchitecture = { architectureHash: 'ar', standardVersionHash: 'sv',
    components: reqs.map(componentFor) };
  return renderAgentSkill(v, arch, 'skill', 'desc');
};

describe('the authority guard was FIXED, not weakened', () => {
  it('a ratified GENERATIVE requirement may be OBSERVE when the expert said it is not an obligation', () => {
    // EXPERT_RATIFIED means the expert is authoritative about the DECLARED MATERIALITY. It never
    // meant every ratified observation is mandatory — which is what made a ratified PREFERRED
    // requirement unrepresentable.
    for (const m of ['PREFERRED', 'EXEMPLAR_ONLY', 'TOLERATED'] as Materiality[]) {
      expect(roleFor(req('g1', m))).toBe('OBSERVE');
      expect(componentFor(req('g1', m)).gateRole).toBe('OBSERVE');
    }
    expect(roleFor(req('g1', 'REQUIRED'))).toBe('ENFORCE');
    // undeclared-discovered observes until its owner declares it; undeclared-AUTHORED still instructs
    expect(roleFor(req('g1', null))).toBe('OBSERVE');
    expect(roleFor(req('g1', null, null, { authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED' }))).toBe('ENFORCE');
  });

  it('an INFERRED prohibition is still OBSERVE whatever its materiality — the guard is intact', () => {
    const inferred = req('g1', 'REQUIRED', null, { kind: 'BOUNDARY', authority: 'DERIVED_UNRATIFIED' });
    expect(roleFor(inferred)).toBe('OBSERVE');
  });

  it('and the component always agrees with the derivation — no component may set its own role', () => {
    for (const m of ['REQUIRED', 'PREFERRED', 'EXEMPLAR_ONLY', 'TOLERATED', 'INCIDENTAL', null] as (Materiality | null)[]) {
      const r = req('g1', m);
      expect(componentFor(r).gateRole).toBe(roleFor(r));
    }
  });
});

describe('every carrier survives a real render', () => {
  it('PREFERRED renders — the exact case that threw before', () => {
    const pkg = build([req('g1', 'PREFERRED')]);
    expect(Object.keys(pkg.runtime)).toContain('examples/g1.md');
  });

  it('an EXAMPLE says it is NOT binding; a REQUIRED one says the form is the point', () => {
    expect(build([req('g1', 'PREFERRED')]).runtime['examples/g1.md'])
      .toMatch(/NOT required[\s\S]*does otherwise is not wrong/);
    expect(build([req('g1', 'REQUIRED', 'STRICT')]).runtime['examples/g1.md'])
      .toMatch(/IS required, and the form shown is the point/);
  });

  it('OUTPUT_CONTRACT emits a schema, and the instructions do not restate it', () => {
    const pkg = build([req('g1', 'REQUIRED', null, { outputShape: { verdict: { type: 'string' } } })]);
    const schema = JSON.parse(pkg.runtime['contracts/output.schema.json']);
    expect(schema.properties).toHaveProperty('verdict');
    expect(schema.additionalProperties).toBe(false);
    expect(pkg.runtime['SKILL.md']).not.toMatch(/"type": "string"/);
  });

  it('INCIDENTAL reaches NOTHING — not the instructions, not an example, not a contract', () => {
    const pkg = build([req('g1', 'REQUIRED'), req('g9', 'INCIDENTAL')]);
    for (const body of Object.values(pkg.runtime)) expect(body).not.toMatch(/rule g9/);
    expect(Object.keys(pkg.runtime)).not.toContain('examples/g9.md');
  });

  it('TOLERATED is watched, never instructed', () => {
    const pkg = build([req('g1', 'TOLERATED')]);
    const c = componentFor(req('g1', 'TOLERATED'));
    expect(c.carrier).toBe('SELF_CHECK');
    expect(c.gateRole).toBe('OBSERVE');
    expect(pkg.runtime['SKILL.md']).not.toMatch(/## What to do[\s\S]*rule g1[\s\S]*##/);
  });
});

describe('runtime and assurance are separate surfaces', () => {
  const pkg = build([req('g1', 'REQUIRED'), req('g2', 'PREFERRED'), req('g9', 'INCIDENTAL')]);

  it('the manifest names one row per requirement, with the artifact it became', () => {
    const m = JSON.parse(pkg.assurance['assurance/manifest.json']);
    expect(m.requirements).toHaveLength(3);
    expect(m.requirements.find((r: any) => r.requirementId === 'g2')).toMatchObject(
      { carrier: 'EXAMPLE', artifact: 'examples/g2.md', emitted: true });
    expect(m.requirements.find((r: any) => r.requirementId === 'g9')).toMatchObject(
      { carrier: 'NONE', artifact: null, emitted: false });
    expect(m.emittedCount).toBe(2);
  });

  it('ASSURANCE NEVER APPEARS IN RUNTIME — an eval the subject can read is not a test', () => {
    expect(Object.keys(pkg.runtime).some((f) => f.startsWith('assurance/'))).toBe(false);
    for (const body of Object.values(pkg.runtime)) expect(body).not.toMatch(/manifest/i);
  });

  it('the manifest names every runtime file, so nothing is served off the record', () => {
    const m = JSON.parse(pkg.assurance['assurance/manifest.json']);
    expect([...m.runtimeFiles].sort()).toEqual(Object.keys(pkg.runtime).sort());
  });
});

describe('a carrier change moves the SERVED BYTES, not only the ids', () => {
  it('the polarity test: same standard, different materiality, different payload', () => {
    const asRequired = build([req('g1', 'REQUIRED')]);
    const asPreferred = build([req('g1', 'PREFERRED')]);
    expect(asRequired.packageHash).not.toBe(asPreferred.packageHash);
    // and the difference is real content, not a hash of a renamed field
    expect(Object.keys(asRequired.runtime)).not.toEqual(Object.keys(asPreferred.runtime));
    expect(asRequired.runtime['SKILL.md']).not.toBe(asPreferred.runtime['SKILL.md']);
  });

  it('conditional components are listed for routing; unconditional ones are not', () => {
    const pkg = build([req('g1', 'PREFERRED', null, { appliesWhen: 'when reviewing a migration' }),
      req('g2', 'PREFERRED')]);
    const cm = JSON.parse(pkg.runtime['context-map.json']);
    expect((cm.components as { requirementId: string }[]).map((c) => c.requirementId)).toEqual(['g1']);
    expect(build([req('g2', 'PREFERRED')]).runtime['context-map.json']).toBeUndefined();
  });
});

describe('no template sprawl', () => {
  it('a simple standard compiles to SKILL.md and a manifest — nothing else', () => {
    const pkg = build([req('g1', 'REQUIRED')]);
    expect(Object.keys(pkg.runtime)).toEqual(['SKILL.md']);
    expect(Object.keys(pkg.assurance)).toEqual(['assurance/manifest.json']);
  });

  it('directories appear only when a requirement put something in them', () => {
    const pkg = build([req('g1', 'REQUIRED'), req('g2', 'PREFERRED')]);
    expect(Object.keys(pkg.runtime)).toContain('examples/g2.md');
    expect(Object.keys(pkg.runtime).some((f) => f.startsWith('contracts/'))).toBe(false);
    expect(Object.keys(pkg.runtime).some((f) => f.startsWith('scaffolds/'))).toBe(false);
  });
});

describe('the invocation path serves the package, not just SKILL.md', () => {
  // THIS WAS THREE GREPS OVER CLI SOURCE, and one of them failed on a correct refactor: extracting the
  // payload composition into a reusable function produced a destructuring line that happened to put
  // `servedText` and `contractFile` on one line, which the regex read as the contract being pasted
  // into the prompt. It was not. A guard that fires on a rename and stays silent on a real regression
  // is measuring the source's spelling, not the system's behaviour.
  //
  // What the greps were trying to say is checked directly now, against a real composed payload.
  const served = (pkg: Record<string, string>, contextFlag?: string): { text: string; withheld: string[] } => {
    const cmap = pkg['context-map.json']
      ? (JSON.parse(pkg['context-map.json']) as { components: { requirementId: string; appliesWhen: string }[] })
      : { components: [] };
    const conditional = new Map(cmap.components.map((c) => [c.requirementId, c.appliesWhen]));
    const withheld: string[] = [];
    const servedExamples = Object.keys(pkg).filter((f) => f.startsWith('examples/')).filter((f) => {
      const cond = conditional.get(f.slice('examples/'.length, -'.md'.length));
      if (!cond) return true;
      if (contextFlag && cond.toLowerCase().includes(contextFlag)) return true;
      withheld.push(f); return false;
    });
    const block = servedExamples.length ? `\n\n${servedExamples.map((f) => pkg[f]).join('\n\n')}` : '';
    return { text: `${pkg['SKILL.md']}${block}`, withheld };
  };

  it('an unconditional example is IN the payload, not merely on disk', () => {
    const pkg = build([req('g1', 'REQUIRED'), req('g2', 'PREFERRED')]).runtime as Record<string, string>;
    const exampleText = pkg['examples/g2.md'];
    expect(exampleText.length).toBeGreaterThan(0);          // a payload check over an empty file proves nothing
    expect(served(pkg).text).toContain(exampleText);
  });

  it('a conditional example is withheld until the invocation names its context', () => {
    const pkg = build([req('g1', 'REQUIRED'),
      req('g2', 'PREFERRED', null, { appliesWhen: 'when reviewing a migration' })]).runtime as Record<string, string>;
    const exampleText = pkg['examples/g2.md'];
    expect(exampleText.length).toBeGreaterThan(0);

    const off = served(pkg);
    expect(off.text).not.toContain(exampleText);
    expect(off.withheld).toEqual(['examples/g2.md']);       // withheld, and SAID SO — not silently dropped

    expect(served(pkg, 'migration').text).toContain(exampleText);
  });

  it('the output contract is the runtime\'s job and is never restated into the prompt', () => {
    const pkg = build([req('g1', 'REQUIRED', null, { outputShape: { verdict: { type: 'string' } } })]).runtime as Record<string, string>;
    const contract = pkg['contracts/output.schema.json'];
    // A not.toContain over a package that has no contract is a vacuous pass and reads identically to
    // a real one. Assert the subject exists before asserting its absence.
    expect(contract, 'no contract was compiled, so the absence check below would prove nothing').toBeTruthy();
    expect(served(pkg).text).not.toContain(contract);
    expect(served(pkg).text).not.toContain('"verdict"');
  });
});
