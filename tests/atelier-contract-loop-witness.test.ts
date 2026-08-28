// tests/atelier-contract-loop-witness.test.ts — THE WHOLE LOOP, ONE SCRIPTED PROVIDER, NO STUBS
// BETWEEN THE STAGES.
//
// Every other contract test exercises one stage with the others faked. This drives the real chain —
// obligations, generation, sealing, running, folding, diagnosis, repair, re-render, re-run — and the
// only thing replaced is the provider at the edge. What it can catch is what unit tests structurally
// cannot: a stage whose output does not fit the next stage's input, which is where a pipeline
// assembled from individually-correct parts actually breaks.
//
// It is NOT a live run and proves nothing about quality. The provider is scripted, so the tasks are
// whatever this file says they are and the reader answers whatever this file tells it to. What is
// under test is that the plumbing carries, that a failure reaches a repair, and that the repair
// produces a differently-arranged package which is then measured — none of which depends on a model
// being good, and all of which would waste money to discover with one.

import { describe, it, expect } from 'vitest';
import { obligationsForStandard } from '../core/contract/obligation.js';
import { generateCases, GenerationRefused } from '../core/contract/generate.js';
import { sealSuite, searchCases, SuiteRefused, type ContractTestSuite } from '../core/contract/suite.js';
import { runCase, foldOutcomes, type CaseOutcome } from '../core/contract/run.js';
import { proposeRepair, assertSameTarget } from '../core/contract/repair.js';
import { applyEscalation } from '../core/architecture/escalate.js';
import { requestFor, requestDiff, type ArmContext } from '../core/contract/arm.js';
import { tallyOf, describeArmComparison } from '../core/contract/compare-arms.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { authorityStateOf, type Requirement, type StandardVersion } from '../core/state/canonical-state.js';
import type { InferenceClient, Budget, InferenceResult, InferenceRequest } from '../core/inference/client.js';

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  requirementId: id, statement: `rule ${id}`, appliesWhen: 'GENERAL',
  kind: 'GENERATIVE', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
  materiality: null, realizationTolerance: null, outputShape: null, ...over,
});

/** The i-have-adhd shape: two instructions and a prohibition, one of them conditional. */
const STANDARD: StandardVersion = (() => {
  const rs = [
    req('x1', { statement: 'Lead with the next action, before any explanation.' }),
    req('x2', { statement: 'Number multi-step work.', appliesWhen: 'the answer has more than one step' }),
    req('x3', { statement: 'Never close with an offer of further help.', kind: 'BOUNDARY' }),
  ];
  return {
    standardVersionHash: 'sv-adhd', evidenceId: null, workType: 'writing', requirements: rs,
    authorityState: authorityStateOf(rs), mintedAt: '2026-01-01T00:00:00.000Z',
    supersedes: null, reason: null,
  };
})();

/**
 * A provider that answers by ROLE, inferred from what it was asked for.
 *
 * `failing` names the requirement the skill under test does not carry: when the reader is asked about
 * an expectation mentioning that rule, it answers the wrong way. Everything else passes. That is the
 * whole fixture — one rule the implementation misses — and it is what makes a repair fire.
 */
const scriptedProvider = (opts: { failing: string; repaired?: boolean }): InferenceClient & {
  calls: { role: string; request: InferenceRequest }[];
} => {
  const calls: { role: string; request: InferenceRequest }[] = [];
  return {
    calls,
    complete: (r: InferenceRequest): Promise<InferenceResult> => {
      const role = r.toolName === 'emit_task' ? 'generate'
        : r.toolName === 'emit_observation' ? 'read' : 'produce';
      calls.push({ role, request: r });

      let json: unknown;
      if (role === 'generate') {
        // Unrelated scenarios, not a template: the diversity gate is live in generateCases, and a
        // stub whose tasks share boilerplate is refused — which is the gate working, not a bug.
        json = { task: GENERATED_TASKS[calls.filter((c) => c.role === 'generate').length - 1]
          ?? `an unrelated request number ${calls.length}` };
      } else if (role === 'produce') {
        json = { output: r.stableBlock ? 'output produced under a compiled skill' : 'bare output' };
      } else {
        // The reader answers whether the OUTPUT has the property named. `satisfied` is what the
        // fixture wants the case to conclude; the answer that produces it depends on polarity.
        //
        // Case-INSENSITIVE, because the expectations genuinely use both casings — "must NOT do this"
        // for a prohibition and "must not invoke this rule" for an over-application. The first
        // version matched only the upper-case form, so every over-application case answered as
        // though it were positive and failed for a reason that had nothing to do with the fixture.
        const aboutFailing = r.variableBlock.includes(opts.failing);
        const negative = /must not/i.test(r.variableBlock);
        const satisfied = aboutFailing ? Boolean(opts.repaired) : true;
        json = { holds: satisfied === !negative ? 'YES' : 'NO', evidence: 'the deciding span' };
      }
      return Promise.resolve({
        json, modelId: 'scripted', inputTokens: 1, outputTokens: 1,
        cacheReadTokens: 0, cacheWriteTokens: 0,
        cost: { billingUsd: 0 }, costUsd: 0, logprobs: null,
      } as InferenceResult);
    },
  };
};

const budget = (): Budget => ({ spentUsd: 0, capUsd: 10, maxCalls: 500 });

const GENERATED_TASKS: readonly string[] = [
  'configure a wireless router for a small dental practice',
  'draft an apology email about a delayed furniture shipment',
  'summarise quarterly revenue trends for the board',
  'plan a three-day hiking route through volcanic terrain',
  'write release notes for a photo editing application',
  'explain compound interest to a teenager saving money',
  'outline safety procedures for handling laboratory reagents',
  'compose a product description for handmade ceramic bowls',
  'review a rental agreement clause about pet ownership',
  'design an onboarding checklist for warehouse staff',
  'troubleshoot why a sourdough starter stopped rising',
  'prepare talking points about municipal parking reform',
];

const ctxFor = (task: string): ArmContext => ({
  task, maxTokens: 1200, toolName: 'emit_output',
  toolDescription: 'Produce the requested work.',
  schema: { type: 'object', properties: { output: { type: 'string' } } },
});

/** One arm over one set of cases, through the real `runCase`. */
const runArm = async (
  client: InferenceClient, b: Budget, cases: readonly { caseId: string }[],
  suite: ContractTestSuite, bytes: string | null,
): Promise<CaseOutcome[]> => {
  const out: CaseOutcome[] = [];
  for (const c of suite.cases.filter((x) => cases.some((y) => y.caseId === x.caseId))) {
    out.push(await runCase(client, b, c, async (task) => {
      const r = await client.complete(requestFor(bytes === null ? 'BARE' : 'INITIAL', bytes, ctxFor(task)));
      const o = (r.json as { output?: unknown }).output;
      const text = typeof o === 'string' ? o : '';
      return { output: text, validity: text.trim() ? 'COMPLETE' as const : 'EMPTY' as const };
    }));
  }
  return out;
};

describe('the whole loop, driven end to end', () => {
  it('carries a standard from obligations to a measured repair without a seam failing', async () => {
    const b = budget();
    const client = scriptedProvider({ failing: 'Number multi-step work' });

    // ── 1. what the standard obliges ──────────────────────────────────────────────────────────
    const obligations = obligationsForStandard(STANDARD);
    expect(obligations.length, 'the standard placed no obligations').toBeGreaterThan(3);

    // ── 2. a task per obligation ──────────────────────────────────────────────────────────────
    const generated = await generateCases(client, b, obligations, STANDARD.workType);
    expect(generated).not.toBeInstanceOf(GenerationRefused);
    if (generated instanceof GenerationRefused) return;
    expect(generated.cases).toHaveLength(obligations.length);

    // ── 3. sealed and split before anything runs ──────────────────────────────────────────────
    const suite = sealSuite(STANDARD, generated.cases);
    expect(suite).not.toBeInstanceOf(SuiteRefused);
    if (suite instanceof SuiteRefused) return;
    expect(suite.searchCaseIds.length).toBeGreaterThan(0);
    expect(suite.holdoutCaseIds.length).toBeGreaterThan(0);

    // ── 4. compile and run the initial arrangement on the search half ─────────────────────────
    const arch = compileArchitecture(STANDARD);
    const pkg = renderAgentSkill(STANDARD, arch, 'focus', 'd');
    const bytes = pkg.files['SKILL.md'] ?? '';
    expect(bytes).toBeTruthy();

    const search = searchCases(suite);
    const initialOutcomes = await runArm(client, b, search, suite, bytes);
    const initial = foldOutcomes(suite, 'sv-initial', 'SEARCH', initialOutcomes);

    // The scripted reader fails exactly the rule the fixture says is missed.
    const failing = [...initial.failed, ...initial.apparentFail];
    expect(failing.length, 'the fixture failed nothing, so nothing downstream is exercised')
      .toBeGreaterThan(0);

    // ── 5. a failure reaches a repair ─────────────────────────────────────────────────────────
    const firstFail = suite.cases.find((c) => c.caseId === failing[0]);
    expect(firstFail).toBeTruthy();
    if (!firstFail) return;

    const failedObligation = suite.obligations.find((o) => o.obligationId === firstFail.obligationId);
    expect(failedObligation, 'the failing case claims an obligation the suite does not hold').toBeTruthy();

    // THE REPAIR HAS TO BE POINTED THE RIGHT WAY, and the obligation is what decides that. Carrying
    // a rule harder fixes a behaviour that failed to appear and a prohibition that was violated. It
    // makes an OVER-APPLYING conditional rule worse, so that failure is refused with a reason rather
    // than repaired in the wrong direction.
    const overApplying = suite.cases.filter((c) => failing.includes(c.caseId))
      .find((c) => suite.obligations.find((o) => o.obligationId === c.obligationId)?.kind === 'SHOULD_NOT_APPLY');
    if (overApplying) {
      const refusal = proposeRepair('IMPLEMENTATION_MISS', 'SHOULD_NOT_APPLY',
        { requirementId: overApplying.requirementIds[0], carrierAtServe: 'PROSE',
          invocationId: 'witness' } as never, arch);
      expect('refused' in refusal, 'an over-application was repaired by carrying the rule harder').toBe(true);
      expect((refusal as { reason: string }).reason).toMatch(/more likely to fire again/);
    }

    // And a failure escalation CAN fix drives the rest of the loop.
    const repairable = suite.cases.filter((c) => failing.includes(c.caseId)).find((c) => {
      const k = suite.obligations.find((o) => o.obligationId === c.obligationId)?.kind;
      return (k === 'SHOULD_FIRE' || k === 'SHOULD_NOT_FIRE') && c.requirementIds.length === 1;
    }) ?? firstFail;
    const repairableKind = suite.obligations.find((o) => o.obligationId === repairable.obligationId)?.kind
      ?? 'SHOULD_FIRE';
    const repairCarrier = arch.components.find((c) => c.carries.includes(repairable.requirementIds[0]));
    const proposal = proposeRepair('IMPLEMENTATION_MISS', repairableKind,
      { requirementId: repairable.requirementIds[0], carrierAtServe: repairCarrier?.carrier ?? 'PROSE',
        invocationId: 'witness' } as never, arch);
    expect('refused' in proposal, `no repairable failure in this run: ${JSON.stringify(proposal)}`).toBe(false);
    if ('refused' in proposal) return;

    // ── 6. the repair produces a DIFFERENT arrangement of the SAME standard ───────────────────
    const candidateArch = applyEscalation(arch, proposal.operation, 'arch-candidate');
    expect(candidateArch.architectureHash).not.toBe(arch.architectureHash);
    expect(() => { assertSameTarget(STANDARD, STANDARD); }).not.toThrow();
    expect(candidateArch.standardVersionHash).toBe(arch.standardVersionHash);

    const candidatePkg = renderAgentSkill(STANDARD, candidateArch, 'focus', 'd');
    expect(candidatePkg.packageHash, 'the repair produced identical bytes, so nothing was arranged differently')
      .not.toBe(pkg.packageHash);

    // ── 7. the candidate is measured on the same cases ────────────────────────────────────────
    const repairedClient = scriptedProvider({
      failing: 'Number multi-step work', repaired: true,
    });
    const candidateOutcomes = await runArm(repairedClient, b, search, suite,
      candidatePkg.files['SKILL.md'] ?? '');
    const candidate = foldOutcomes(suite, 'sv-candidate', 'SEARCH', candidateOutcomes);

    expect(candidate.apparentPass.length + candidate.passed.length)
      .toBeGreaterThan(initial.apparentPass.length + initial.passed.length);

    // ── 8. and the report keeps the channels apart ────────────────────────────────────────────
    const table = describeArmComparison([tallyOf('INITIAL', initial), tallyOf('CANDIDATE', candidate)]);
    expect(table).toMatch(/decided — passed/);
    expect(table).toMatch(/what optimization added/);
    expect(table).not.toMatch(/\d+%/);
  });

  it('the bare arm runs the same cases and differs from the skill arm in one field', async () => {
    const b = budget();
    const client = scriptedProvider({ failing: 'nothing fails here' });
    const obligations = obligationsForStandard(STANDARD);
    const generated = await generateCases(client, b, obligations, STANDARD.workType);
    if (generated instanceof GenerationRefused) throw new Error('refused');
    const suite = sealSuite(STANDARD, generated.cases);
    if (suite instanceof SuiteRefused) throw new Error('refused');

    const arch = compileArchitecture(STANDARD);
    const bytes = renderAgentSkill(STANDARD, arch, 'focus', 'd').files['SKILL.md'] ?? '';
    const search = searchCases(suite);

    const bareOutcomes = await runArm(client, b, search, suite, null);
    const skillOutcomes = await runArm(client, b, search, suite, bytes);
    expect(bareOutcomes.map((o) => o.caseId)).toEqual(skillOutcomes.map((o) => o.caseId));

    // The actual requests that went out, not a claim about them.
    const produced = client.calls.filter((c) => c.role === 'produce').map((c) => c.request);
    const bareReq = produced.find((r) => r.stableBlock === '');
    const skillReq = produced.find((r) => r.stableBlock !== '');
    expect(bareReq && skillReq).toBeTruthy();
    if (bareReq && skillReq) {
      // Same task is not guaranteed across different cases, so compare a matched pair by building
      // both from one context — the invariant is about the arm, not about which task was drawn.
      const ctx = ctxFor('one task');
      expect(requestDiff(requestFor('BARE', null, ctx), requestFor('INITIAL', bytes, ctx)))
        .toEqual(['stableBlock']);
    }
  });

  it('spends nothing it did not need to, and stays inside its budget', async () => {
    const b = budget();
    const client = scriptedProvider({ failing: 'nothing' });
    const obligations = obligationsForStandard(STANDARD);
    const generated = await generateCases(client, b, obligations, STANDARD.workType);
    if (generated instanceof GenerationRefused) throw new Error('refused');

    // One generation call per obligation, no more.
    expect(client.calls.filter((c) => c.role === 'generate')).toHaveLength(obligations.length);
    expect(b.calls ?? 0).toBe(obligations.length);
    expect(b.spentUsd).toBeLessThanOrEqual(b.capUsd);
  });
});
