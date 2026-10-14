// A plain-language explainer: twelve examples that all keep the six habits in check.mjs.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const purpose = 'plain-language explanations for a reader with no background';
export const tasks = ['how a battery stores energy', 'what a stock index is', 'how noise-cancelling headphones work', 'what machine learning is', 'why antibiotics do not work on a cold',
  'how a heat pump warms a house', 'what a blockchain is', 'how GPS finds your position', 'what an insurance deductible is', 'why the sky is blue']
  .map((t, i) => ({ id: `t${i}`, request: `Explain ${t} to someone with no background in it.` }));
// What an owner would write on one page (method.md). The "rules" arm gets it and the examples; so does the Atelier build.
export const rules = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'method.md'), 'utf8');
