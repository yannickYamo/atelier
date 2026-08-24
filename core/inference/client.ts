// atelier/core/inference/client.ts — THE ONLY PLACE CORE TOUCHES A MODEL, AND IT TOUCHES AN INTERFACE.
//
// Core must not know which provider, which host, or which SDK. Discovery needs inference; it does not
// need Anthropic. Naming a vendor here would put a provider in the domain layer, and the whole claim
// Atelier makes — that the expert's standard belongs to the expert, not to the model implementing it —
// is falsified the moment the standard's own compiler cannot run anywhere else.
//
// The stable/variable split is part of the CONTRACT, not an optimisation detail: an implementation that
// ignores it still works, it just costs ~9x more, and a caller cannot tell. Making it explicit is how
// the interface stays honest about what it expects.

export interface InferenceRequest {
  /** invariant across calls in a batch — implementations SHOULD cache this */
  readonly stableBlock: string;
  /** varies per call — implementations MUST NOT cache this */
  readonly variableBlock: string;
  readonly userMessage: string;
  readonly toolName: string;
  readonly toolDescription: string;
  readonly schema: Record<string, unknown>;
  readonly maxTokens: number;
}

/**
 * WHAT THE CALL COST, AND ON WHAT BASIS.
 *
 * A local model is not free — it costs electricity, hardware and time — it is UNMETERED. Reporting
 * `$0.0000` for it says the computation had no cost, which is false and quietly makes a local run
 * look strictly better than a hosted one on the only axis the ledger shows. Reporting `null` with a
 * basis says the true thing: nobody is billing for this, so there is no number to add up.
 *
 * `UNKNOWN_PRICING` is the third honest state and it is distinct from both. A hosted model at a price
 * this build does not know about did cost money; a ledger that silently counted it as zero would
 * understate spend and let a budget cap pass that should have stopped.
 */
export type CostBasis = 'API_METERED' | 'LOCAL_UNMETERED' | 'UNKNOWN_PRICING';

export interface InferenceCost {
  readonly basis: CostBasis;
  /** what the provider will bill for this call. `null` when nothing is billed or the price is unknown. */
  readonly billingUsd: number | null;
}

export const metered = (billingUsd: number): InferenceCost => ({ basis: 'API_METERED', billingUsd });
export const unmetered = (): InferenceCost => ({ basis: 'LOCAL_UNMETERED', billingUsd: null });
export const unpriced = (): InferenceCost => ({ basis: 'UNKNOWN_PRICING', billingUsd: null });

/**
 * What the budget ledger adds up. DERIVED from `cost` and never set beside it.
 *
 * An unbilled call contributes nothing to a dollar cap, which is correct and is also why a dollar cap
 * is the wrong instrument for a local run — see `Budget`.
 */
export const budgetUsd = (c: InferenceCost): number => c.billingUsd ?? 0;

export interface InferenceResult {
  readonly json: unknown;
  /**
   * The model the PROVIDER says answered, not the one we asked for. An alias resolves server-side,
   * and a binding that recorded the request would be recording our intent rather than what ran.
   */
  readonly modelId: string;
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly outputTokens: number;
  /** the authority on what this call cost. */
  readonly cost: InferenceCost;
  /** `budgetUsd(cost)`. Kept as a field because the budget ledger reads it on every call. */
  readonly costUsd: number;
}

export interface InferenceClient {
  complete(req: InferenceRequest): Promise<InferenceResult>;
}

/**
 * A hard cap the caller sets. Core refuses to continue past it rather than trusting a provider.
 *
 * A DOLLAR cap is the wrong instrument for an unmetered runtime — every local call adds zero, so the
 * cap never binds and a runaway loop runs until something else stops it. `calls` is the bound that
 * still works there, and it is counted for every provider so the two never disagree.
 */
export interface Budget { spentUsd: number; readonly capUsd: number; calls?: number; readonly maxCalls?: number }

export class CallBudgetExceeded extends Error {
  constructor(public readonly made: number, public readonly max: number) {
    super(`call budget exhausted: ${made} of ${max} inference calls. Nothing further was requested. `
      + `A dollar cap does not bind an unmetered runtime; this one does.`);
    this.name = 'CallBudgetExceeded';
  }
}

export class BudgetExceeded extends Error {
  constructor(public readonly spent: number, public readonly cap: number) {
    super(`budget exhausted: $${spent.toFixed(4)} of $${cap.toFixed(2)}. Nothing further was requested.`);
    this.name = 'BudgetExceeded';
  }
}

/**
 * A DOLLAR CAP OVER CALLS NOTHING IS BILLING FOR IS NOT A CAP.
 *
 * This module already said so about a local runtime, three paragraphs up, and then the ledger threw
 * the distinction away one line later: `budgetUsd` maps a null bill to 0, so an unpriced call adds
 * nothing, `spentUsd` never moves, and `capUsd` never binds. With `OPENAI_COMPATIBLE_PRICING`
 * deliberately empty, that was EVERY hosted call through that adapter — `create`, `discover`,
 * `improve`, `amend` and `promote` all ran with no effective bound at all while printing a cap.
 *
 * It cannot be caught before the first call, because what a call costs is a fact the provider
 * reports. It can be caught after exactly one, which is what this does.
 */
export class UnboundedRuntime extends Error {
  constructor(public readonly basis: CostBasis, public readonly cap: number) {
    super(`this runtime reports ${basis}, so the $${cap.toFixed(2)} cap cannot bind it.\n`
      + `  Nothing is billing per token here that Atelier can price, so every call adds $0.00 to the\n`
      + `  ledger and the dollar cap would never stop anything. One call was made; nothing further was\n`
      + `  requested.\n`
      + `  Bound it by COUNT instead:  --max-calls <n>\n`
      + (basis === 'UNKNOWN_PRICING'
        ? '  This build does not know this model\'s rate. That is not the same as it being free.'
        : '  A local model bills nobody, so a count is the only bound that can hold it.'));
    this.name = 'UnboundedRuntime';
  }
}

/**
 * Spend one unit of inference against a budget.
 *
 * Checks BEFORE the call using a caller-supplied estimate, not after using the actual. A ledger that
 * only notices overspend afterwards is an accounting record, not a cap.
 *
 * TAKES THE COST, NOT A NUMBER. It used to take `actualUsd`, which collapsed the three honest cost
 * states into one figure at the moment the ledger most needed to tell them apart: `$0.00 because it
 * was cheap`, `$0.00 because nobody is billing`, and `$0.00 because we do not know the rate` are the
 * same number and three different facts. The caller already holds the typed value; flattening it here
 * is what let an unpriced runtime look fully accounted for.
 */
export async function spend<T>(budget: Budget, estimateUsd: number, fn: () => Promise<{ value: T; cost: InferenceCost }>): Promise<T> {
  if (budget.spentUsd + estimateUsd > budget.capUsd) throw new BudgetExceeded(budget.spentUsd + estimateUsd, budget.capUsd);
  const used = budget.calls ?? 0;
  if (budget.maxCalls !== undefined && used >= budget.maxCalls) {
    throw new CallBudgetExceeded(used, budget.maxCalls);
  }
  budget.calls = used + 1;
  const { value, cost } = await fn();
  budget.spentUsd += budgetUsd(cost);
  // AFTER ONE CALL, AND NOT BEFORE. What a call costs is reported by the provider, so the first one
  // is what establishes whether a dollar cap is capable of binding this runtime at all. If it is not,
  // and no call bound was set, then continuing means running with no bound while displaying one.
  if (cost.billingUsd === null && budget.maxCalls === undefined) {
    throw new UnboundedRuntime(cost.basis, budget.capUsd);
  }
  return value;
}
