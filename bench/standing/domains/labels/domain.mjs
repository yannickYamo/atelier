// Brand-suitability labels for a clip, as JSON, under a twenty-rule policy and a taxonomy of thirty-nine categories; a
// transcript stands in for the clip. Nothing here is a real platform, clip or policy (./gen-labels.mjs in the study's
// scratch made the cases; cases.json is their record).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const purpose = 'brand-suitability labels for video clips, as JSON under the policy, the way these are';
export const tasks = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, request: 'Label this clip for brand suitability under the policy, as JSON.',
  material: ['transcript', 'taxonomy', 'policy'].map((n) => ({ name: n, file: `tasks/t${i}/${n}.txt` })) }));
export const rules = readFileSync(join(HERE, 'method.md'), 'utf8');
