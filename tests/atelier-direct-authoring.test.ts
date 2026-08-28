// tests/atelier-direct-authoring.test.ts — A STANDARD SOMEONE WROTE THEMSELVES IS STILL A STANDARD.
//
// `add` recorded requirements and nothing downstream would compile them. Three separate guards
// assumed a corpus: the close refused without sealed evidence, the build refused without an evidence
// record to store, and the run-state graph had no edge out of EMPTY except CORPUS_SEALED. Every
// function on the path was reachable and tested; the SEQUENCE dead-ended, which no reachability
// census in this repository can see.
//
// The tests below are mostly about what must NOT be weakened while unblocking it. Making evidence
// optional is easy; keeping the work type mandatory, keeping a 0% discovery rate honest, and keeping
// a directly authored standard distinguishable from a recovered one is the part worth pinning.

import { describe, it, expect } from 'vitest';
import { sourceModeOf, discoveryRecall, authorityStateOf,
  type StandardVersion, type Requirement } from '../core/state/canonical-state.js';
import { TRANSITIONS } from '../core/state/run-state.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  requirementId: id, statement: `rule ${id}`, appliesWhen: 'GENERAL',
  kind: 'BOUNDARY', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
  materiality: null, realizationTolerance: null, outputShape: null, ...over,
});

const standard = (requirements: Requirement[], evidenceId: string | null = null): StandardVersion => ({
  standardVersionHash: 'sv1', evidenceId, workType: 'writing', requirements,
  authorityState: authorityStateOf(requirements), mintedAt: '2026-01-01T00:00:00.000Z',
  supersedes: null, reason: null,
});

describe('where the content came from is derived, never stored twice', () => {
  it('every requirement authored: DIRECT', () => {
    expect(sourceModeOf(standard([req('x1'), req('x2')]))).toBe('DIRECT');
  });

  it('every requirement read out of work: DISCOVERED', () => {
    expect(sourceModeOf(standard([req('p1', { provenance: 'MACHINE_DISCOVERED' })]))).toBe('DISCOVERED');
  });

  it('a person adding to what was found: HYBRID', () => {
    expect(sourceModeOf(standard([req('p1', { provenance: 'MACHINE_DISCOVERED' }), req('x1')])))
      .toBe('HYBRID');
  });

  it('nothing to characterise: EMPTY', () => {
    expect(sourceModeOf(standard([]))).toBe('EMPTY');
  });

  it('a rewritten discovery is not authorship', () => {
    // SUBSTANTIVELY_REWRITTEN means a person changed the words of something the machine found. The
    // machine still found it, and counting that as DIRECT would let discovery credit be erased by
    // editing.
    expect(sourceModeOf(standard([req('p1', { provenance: 'SUBSTANTIVELY_REWRITTEN' })])))
      .toBe('DISCOVERED');
  });
});

describe('a standard with no corpus is honest about it', () => {
  it('reports 0% discovered, because the machine found none of it', () => {
    expect(discoveryRecall(standard([req('x1'), req('x2')]))).toBe(0);
  });

  it('is RATIFIED, not DRAFT — a person wrote every word of it', () => {
    expect(standard([req('x1')]).authorityState).toBe('RATIFIED');
  });

  it('carries a null evidenceId rather than a fabricated empty record', () => {
    // The alternative considered was an ExpertEvidence with items: [] and a hash over nothing. That
    // writes a file which later reads as a sealed corpus, which is worse than an absence.
    expect(standard([req('x1')]).evidenceId).toBeNull();
  });
});

describe('what must not be weakened alongside it', () => {
  it('workType survives as a required field', () => {
    // It is not a fact about the corpus. `defaultDescription` turns it into the skill's description,
    // which is the first thing a host reads when deciding whether to load the skill at all.
    const v = standard([req('x1')]);
    expect(v.workType).toBe('writing');
    expect(renderAgentSkill(v, compileArchitecture(v), 'focus', 'Applies a compiled standard (writing)')
      .files['SKILL.md']).toContain('writing');
  });

  it('the direct edge exists and does not open a shortcut for a recovered standard', () => {
    const from = (s: string): string[] => TRANSITIONS.filter((t) => t.from === s).map((t) => t.to);
    expect(from('EMPTY'), 'a person cannot go from nothing to a ratified standard').toContain('RATIFIED');
    // A discovered run leaves EMPTY when its corpus is sealed, so it can never reach this edge.
    expect(from('CORPUS_SEALED')).not.toContain('RATIFIED');
    expect(from('PROPOSED')).toContain('RATIFIED');
  });
});

describe('a positive rule reaches the model as a positive rule', () => {
  // `add` defaulted kind to BOUNDARY, so "lead with the next action" compiled into the prohibitions
  // section and reached the model as a rule AGAINST doing it. Silent, meaning-inverting, and
  // invisible until someone read the compiled package.
  const compiled = (rs: Requirement[]): string => {
    const v = standard(rs);
    return renderAgentSkill(v, compileArchitecture(v), 'focus', 'd').files['SKILL.md'] ?? '';
  };

  it('renders instructions and prohibitions in different sections', () => {
    const md = compiled([
      req('x1', { kind: 'GENERATIVE', statement: 'Lead with the next action.' }),
      req('x2', { kind: 'BOUNDARY', statement: 'Never open with a preamble.' }),
    ]);
    const doIdx = md.indexOf('Lead with the next action.');
    const dontIdx = md.indexOf('Never open with a preamble.');
    expect(doIdx, 'the instruction did not reach the package').toBeGreaterThan(-1);
    expect(dontIdx, 'the prohibition did not reach the package').toBeGreaterThan(-1);

    const whatToDo = md.indexOf('## What to do');
    const whatNotToDo = md.indexOf('## What not to do');
    expect(doIdx).toBeGreaterThan(whatToDo);
    expect(doIdx, 'a GENERATIVE rule landed under "What not to do"').toBeLessThan(whatNotToDo);
    expect(dontIdx).toBeGreaterThan(whatNotToDo);
  });

  it('a stated condition survives compilation', () => {
    expect(compiled([req('x1', { kind: 'GENERATIVE', appliesWhen: 'the answer has more than one step' })]))
      .toContain('the answer has more than one step');
  });
});
