// A mutual confidentiality agreement drafted from a term sheet, to an eight-step method.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const purpose = 'mutual confidentiality agreements, drafted from a term sheet the way these are';
export const tasks = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, request: 'Draft the mutual confidentiality agreement for this term sheet.', material: [{ name: 'term-sheet', file: `tasks/t${i}.term-sheet.txt` }] }));
export const rules = readFileSync(join(HERE, 'method.md'), 'utf8');
