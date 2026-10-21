// A claims assessment memo drafted from a claim file, to an adjuster's eight-step method. Nothing here is a real
// insurer, insured or policy (./gen.mjs made the cases; cases.json is their record).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const purpose = 'claims assessment memos, drafted from the claim file the way these are';
export const tasks = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, request: 'Draft the claims assessment memo for this claim file.',
  material: readdirSync(join(HERE, 'tasks', `t${i}`)).sort().map((f) => ({ name: f.replace(/\.txt$/, '').replace(/-/g, ' '), file: `tasks/t${i}/${f}` })) }));
export const rules = readFileSync(join(HERE, 'method.md'), 'utf8');
