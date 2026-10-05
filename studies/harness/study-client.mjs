// studies/harness/study-client.mjs — ONE WAY TO GET A CLIENT IN A STUDY HARNESS, AND ONE CAP.
//
// The real run uses the Anthropic API (ANTHROPIC_API_KEY). `--base-url <url>` points the same harness at any
// OpenAI-compatible backend instead: that is how each harness is smoke-tested offline against
// tests/fixtures/scripted-backend.mjs before a dollar is spent, and it is never how a sealed study is run.
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import { OpenAICompatibleInferenceClient } from '../../dist/providers/openai-compatible.js';
import { ANTHROPIC_PRICING, priceFor } from '../../dist/providers/pricing.js';

export const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
export const has = (n) => process.argv.includes(n);
export const fail = (m) => { console.error(m); process.exit(2); };

export function clientFor(model) {
  const base = arg('--base-url');
  if (base) return new OpenAICompatibleInferenceClient({ modelId: model, baseUrl: base, pricing: { inputPerM: 1, outputPerM: 1 }, strictSchema: false });
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) fail('ANTHROPIC_API_KEY is not set. Nothing was spent.');
  // A MODEL WITH NO PRICE BILLS $0.00 HERE, AND A CAP THAT SEES $0.00 NEVER STOPS. Refused before anything is spent.
  const price = priceFor(ANTHROPIC_PRICING, model);
  if (!price) fail(`no price is known for "${model}", so the cap could not hold. Use a model in providers/pricing.ts. Nothing was spent.`);
  return new AnthropicInferenceClient(model, undefined, price);
}

/** A budget with a hard cap in dollars and calls: the harness stops, with what it has, when either is reached. */
export const budgetOf = (capUsd, maxCalls) => ({ spentUsd: 0, capUsd, maxCalls });

/** Cohen's kappa of two binary label lists. */
export function kappa(a, b) {
  const n = a.length; if (!n) return null;
  const agree = a.filter((x, i) => x === b[i]).length / n;
  const pa = a.filter(Boolean).length / n; const pb = b.filter(Boolean).length / n;
  const chance = pa * pb + (1 - pa) * (1 - pb);
  return chance === 1 ? 1 : (agree - chance) / (1 - chance);
}
