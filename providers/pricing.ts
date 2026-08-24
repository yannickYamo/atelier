// atelier/providers/pricing.ts — WHAT A CALL COSTS IS PROVIDER CONFIGURATION, NOT A FACT ABOUT ATELIER.
//
// Prices belonged to one vendor's client class, which made them look like a property of inference
// itself. They are a property of a commercial relationship with one backend, and the moment a second
// backend exists that confusion becomes a wrong number rather than an untidy one.
//
// ─── AN UNKNOWN PRICE IS NOT A ZERO PRICE ──────────────────────────────────────────────────────
//
// The old table fell back to Sonnet's price for any unrecognised model, which is a guess wearing the
// costume of a measurement — right by luck for one vendor's mid-tier, wrong by 5x for its top tier and
// meaningless for anyone else's. `priceFor` returns null instead, and the cost becomes UNKNOWN_PRICING:
// the ledger then shows a call it cannot price rather than a call it priced wrongly.

import type { InferenceCost } from '../core/inference/client.js';
import { metered, unmetered, unpriced } from '../core/inference/client.js';

/** Per-million-token prices in USD. */
export interface Pricing {
  readonly inputPerM: number;
  readonly outputPerM: number;
  /** multiplier on `inputPerM` for tokens written to / read from a prompt cache, where the backend has one. */
  readonly cacheWriteMultiplier?: number;
  readonly cacheReadMultiplier?: number;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly outputTokens: number;
}

/**
 * A DATED CONVENIENCE, NOT A FACT ABOUT ANY VENDOR.
 *
 * This file's own header says what a call costs is provider configuration. It then shipped one
 * vendor's rate card as though it were a property of the system, and that card was 3x wrong for
 * months: `claude-opus-4-7` was listed at 15/75 against a real 5/25, on the DEFAULT proposer, so
 * every cost this build reported for its own default configuration was three times the truth.
 *
 * The reasoning already applied to the OpenAI-compatible table below — a table pretending to cover
 * every backend would be stale on the day it shipped — applies identically here and was not applied.
 *
 * ─── SO THE TABLE IS A SEED, AND THE USER IS THE AUTHORITY ─────────────────────────────────────
 *
 * A rate card is commercial data. It changes without notice, differs by region, tier and contract,
 * and has no authoritative programmatic source. Atelier cannot keep one current and should not
 * pretend to. What it CAN do is take a rate from the person who knows theirs, and refuse to guess
 * when nobody has told it — which is what `PRICE_OVERRIDE` and `UNKNOWN_PRICING` are for.
 *
 * Entries here are dated. A miss is UNKNOWN, never a neighbour's number.
 */
export const PRICES_CHECKED_ON = '2026-08-24';

export const ANTHROPIC_PRICING: Readonly<Record<string, Pricing>> = {
  'claude-fable-5': { inputPerM: 10, outputPerM: 50, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 },
  'claude-opus-5': { inputPerM: 5, outputPerM: 25, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 },
  'claude-opus-4-7': { inputPerM: 5, outputPerM: 25, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 },
  'claude-sonnet-5': { inputPerM: 3, outputPerM: 15, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 },
  'claude-sonnet-4-5-20250929': { inputPerM: 3, outputPerM: 15, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 },
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 },
};

/**
 * Prices for OpenAI-compatible backends, keyed by model id.
 *
 * DELIBERATELY EMPTY, and now that is not a second-class outcome. One adapter reaches OpenAI, Groq,
 * Together, DeepSeek, Fireworks, OpenRouter, vLLM, llama.cpp and Ollama, each with its own price
 * list, its own model names and its own release cadence. Seeding it for one of them would recreate
 * exactly the defect above, one layer out.
 *
 * A user who wants a number gives one: `--price-in` and `--price-out`, in USD per million tokens.
 * That flag is the reason this table can stay empty without making non-Anthropic backends
 * second-class — before it existed, UNKNOWN_PRICING was terminal for every one of them.
 */
export const OPENAI_COMPATIBLE_PRICING: Readonly<Record<string, Pricing>> = {};

/** Model ids served by something running on the user's own machine, which bills nobody. */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/i;

export const isLocalBackend = (baseUrl: string): boolean => {
  try { return LOCAL_HOST.test(new URL(baseUrl).host); } catch { return false; }
};

export const priceFor = (table: Readonly<Record<string, Pricing>>, modelId: string): Pricing | null =>
  table[modelId] ?? null;

/**
 * Cost one call.
 *
 * The three branches are the three honest states, in the order they are decided: nobody is billing
 * (local), we know the rate (metered), or something is being billed at a rate this build does not
 * know (unknown). Never a fourth branch that guesses.
 */
export function costOf(pricing: Pricing | null, usage: TokenUsage, local: boolean): InferenceCost {
  if (local) return unmetered();
  if (!pricing) return unpriced();
  const cw = pricing.cacheWriteMultiplier ?? 1;
  const cr = pricing.cacheReadMultiplier ?? 1;
  return metered((
    usage.inputTokens * pricing.inputPerM
    + usage.cacheWriteTokens * pricing.inputPerM * cw
    + usage.cacheReadTokens * pricing.inputPerM * cr
    + usage.outputTokens * pricing.outputPerM
  ) / 1e6);
}
