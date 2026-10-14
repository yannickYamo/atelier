// A competitive analysis of three vendors on price, from a price list, to a six-step method.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sheets, requestFor } from './cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const purpose = 'competitive analyses of vendors on price, the way these are done';
export const tasks = sheets.filter((s) => s.id.startsWith('t')).map((s) => ({ id: s.id, request: requestFor(s), material: [{ name: 'price-list', file: `tasks/${s.id}.price-list.txt` }] }));
export const rules = readFileSync(join(HERE, 'method.md'), 'utf8');
