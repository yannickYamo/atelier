// Code review to a six-step method: twelve golden reviews, each of a change with one planted defect.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const purpose = 'reviews of a code change, the way these are written';
export const tasks = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, request: 'Review this change.', material: [{ name: 'diff', file: `tasks/t${i}.diff.txt` }] }));
// The owner's page: here it is the method itself. Every arm that is given rules gets exactly this.
export const rules = readFileSync(join(HERE, 'method.md'), 'utf8');
