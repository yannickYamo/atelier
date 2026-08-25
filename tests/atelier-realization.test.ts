// tests/atelier-realization.test.ts — A REALIZATION IS EVIDENCE OF FORM, NOT A SECOND COMMAND.
//
// THE CASE. One live discovery run produced 14 rules, 8 of them expressive. Two of those were:
//
//   p7   I drop in one concrete scene of a single user at a single moment, then leave it.
//   p12  When I use an image I end the beat on a short declarative that renames the thing —
//        "That silence is the product" — so the emphasis lands on the reframing.
//
// p12 is how p7 lands. Read flat, as one of fourteen peers, it is a fussy habit about sentence
// length and the author REJECTED it — that ruling is in the ratification ledger. The taste was
// detected and the packet lost it.
//
// The edge is ASSERTED, never inferred. Deriving it was measured across three independent runs: one
// rule was given three different parents in three runs, a standalone preference was captured twice,
// and the graph produced a chain. A proposer may offer an edge with its stability; only the author's
// confirmation makes it structure.

import { describe, it, expect } from 'vitest';
import { componentFor, compileArchitecture } from '../core/architecture/compile.js';
import { assertRealizationGraph, type Requirement, type StandardVersion } from '../core/state/canonical-state.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { aRequirement } from './fixtures.js';

const DECISION = aRequirement({
  requirementId: 'p7', authority: 'EXPERT_RATIFIED', materiality: 'REQUIRED', appliesWhen: 'GENERAL',
  statement: 'I drop in one concrete scene of a single user at a single moment to carry the argument.',
});
const REALIZATION = aRequirement({
  requirementId: 'p12', authority: 'EXPERT_RATIFIED', appliesWhen: 'GENERAL',
  statement: 'I end the beat on a short declarative that renames the thing.',
  realizes: 'p7', realizationTolerance: 'FUNCTIONALLY_EQUIVALENT', materiality: null,
});

const standard = (reqs: Requirement[]): StandardVersion => ({
  standardVersionHash: 'sv-real', evidenceId: 'e1', workType: 'writing', requirements: reqs,
  authorityState: 'RATIFIED', mintedAt: '2026-01-01T00:00:00.000Z', supersedes: null, reason: null,
});

describe('the decision keeps the obligation; the realization carries the form', () => {
  it('a linked realization compiles to EXAMPLE and OBSERVE, whatever its materiality', () => {
    const c = componentFor(REALIZATION);
    expect(c.carrier).toBe('EXAMPLE');
    expect(c.gateRole).toBe('OBSERVE');
    expect(c.rationale).toMatch(/one way the author realizes p7/);
    expect(c.rationale, 'the rationale must say it is not a second instruction').toMatch(/not issued as a second instruction/);
  });

  it('and the decision it serves still compiles as the instruction', () => {
    const c = componentFor(DECISION);
    expect(c.carrier).toBe('PROSE');
    expect(c.gateRole).toBe('ENFORCE');
  });

  it('POLARITY: the SAME rule without the edge is issued as its own command', () => {
    // This is the defect the edge exists to fix, pinned. Unlinked and REQUIRED, the form becomes a
    // peer instruction and the model receives two commands for one choice.
    const unlinked = { ...REALIZATION, realizes: null, materiality: 'REQUIRED' as const };
    const c = componentFor(unlinked);
    expect(c.carrier).toBe('PROSE');
    expect(c.gateRole).toBe('ENFORCE');
  });

  it('the form tolerance survives into the carrier rationale, because it is the open question', () => {
    expect(componentFor(REALIZATION).rationale).toMatch(/FUNCTIONALLY_EQUIVALENT/);
    expect(componentFor({ ...REALIZATION, realizationTolerance: 'STRICT' }).rationale).toMatch(/STRICT/);
  });
});

describe('the rendered package — the witness that matters', () => {
  const pkg = renderAgentSkill(
    standard([DECISION, REALIZATION]),
    compileArchitecture(standard([DECISION, REALIZATION])), 'w', 'writes in the standard');
  const skillMd = pkg.runtime['SKILL.md'];
  const example = pkg.runtime['examples/p12.md'];

  it('the decision reaches the model as an instruction', () => {
    expect(skillMd).toContain(DECISION.statement);
  });

  it('the realization does NOT appear beside it as a second instruction', () => {
    // The instruction list only. SKILL.md also POINTS AT the examples further down, which is correct
    // and is how a progressive-disclosure host finds them — so the assertion has to be about the
    // numbered commands, not about the whole document.
    const start = skillMd.indexOf('## What to do');
    const end = skillMd.indexOf('\n## ', start + 4);
    const instructions = skillMd.slice(start, end === -1 ? undefined : end);
    expect(instructions).toContain(DECISION.statement);
    expect(instructions, 'the form must not be issued as a command').not.toContain(REALIZATION.statement);
  });

  it('it reaches the model as an example that NAMES the decision it serves', () => {
    expect(example).toBeTruthy();
    expect(example).toContain(REALIZATION.statement);
    expect(example).toMatch(/how p7 lands/);
    expect(example).toMatch(/one way the author carries out \*\*p7\*\*/);
    expect(example, 'and it must say where the obligation actually sits').toMatch(/which is where the obligation sits/);
  });

  it('and the example states how tightly the form binds, not whether it is required', () => {
    expect(example).toMatch(/FUNCTIONALLY_EQUIVALENT: another form doing the same work is fine/);
    expect(example).not.toMatch(/This IS required/);
  });
});

describe('the graph is one level, and malformed standards do not compile', () => {
  it('a realization pointing at a rule that is not there is refused', () => {
    const orphan = { ...REALIZATION, realizes: 'p99' };
    expect(() => { assertRealizationGraph([DECISION, orphan]); }).toThrow(/not in this standard/);
  });

  it('a chain is refused — realizations attach to decisions, never to each other', () => {
    const mid = aRequirement({ requirementId: 'pA', realizes: 'p7', authority: 'EXPERT_RATIFIED' });
    const chained = aRequirement({ requirementId: 'pB', realizes: 'pA', authority: 'EXPERT_RATIFIED' });
    expect(() => { assertRealizationGraph([DECISION, mid, chained]); }).toThrow(/Chains are not represented/);
  });

  it('self-reference is refused', () => {
    expect(() => { assertRealizationGraph([{ ...DECISION, realizes: 'p7' }]); }).toThrow(/cannot realize itself/);
  });

  it('and a standard with no edges at all is unaffected', () => {
    expect(() => { assertRealizationGraph([DECISION]); }).not.toThrow();
  });
});

// ── AN EXAMPLE MUST SHOW, NOT TELL ───────────────────────────────────────────────────────────
//
// The EXAMPLE carrier's whole argument is that showing beats telling. It had nothing to show: the
// chain proposal type carried no span, so `evidence` was hardcoded null on the path that actually
// runs and every compiled example contained the rule's DESCRIPTION. A carrier built to demonstrate
// was issuing a second sentence of instruction, which for a realization defeats the point entirely —
// "end the beat on a short declarative that renames the thing" is a paraphrase of a form, and
// "That silence is the product" is the form.
describe('a realization is SHOWN when a span was anchored', () => {
  const withSpan = { ...REALIZATION, evidence: 'That silence is the product.', evidenceItemId: 'p1.md' };
  const render = (reqs: Requirement[]): string => {
    const v = standard(reqs);
    return renderAgentSkill(v, compileArchitecture(v), 'w', 'd').runtime[`examples/${reqs[1].requirementId}.md`];
  };

  it('the span leads, and the description follows it', () => {
    const md = render([DECISION, withSpan]);
    const spanAt = md.indexOf('That silence is the product.');
    const descAt = md.indexOf(withSpan.statement);
    expect(spanAt).toBeGreaterThan(-1);
    expect(spanAt, 'the observed form must come before the paraphrase of it').toBeLessThan(descAt);
    expect(md).toMatch(/That is one way the author does it/);
  });

  it('and it is quoted, so the model reads it as evidence rather than as another instruction', () => {
    expect(render([DECISION, withSpan])).toMatch(/^> That silence is the product\./m);
  });

  it('with no span, the file SAYS it is describing rather than showing', () => {
    // explicit null: the shared fixture supplies an evidence string by default, and a test for the
    // absent case that quietly had one would assert nothing.
    const md = render([DECISION, { ...REALIZATION, evidence: null }]);
    expect(md).toMatch(/No verbatim span was anchored/);
    expect(md, 'and it must not present the paraphrase as if it were an instance').not.toMatch(/^> /m);
  });

  it('a non-realization example is unchanged — this did not rewrite the ordinary case', () => {
    const plain = aRequirement({ requirementId: 'pX', authority: 'EXPERT_RATIFIED',
      materiality: 'PREFERRED', appliesWhen: 'GENERAL', statement: 'A plain preference.',
      evidence: 'the observed line', evidenceItemId: 'p1.md' });
    const md = render([DECISION, plain]);
    expect(md).toMatch(/## How the author did it/);
    expect(md.indexOf('A plain preference.')).toBeLessThan(md.indexOf('the observed line'));
  });
});
