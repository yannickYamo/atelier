// atelier/core/distinctiveness/stats.ts — WHAT THE FLOOR NEEDS FROM THE t DISTRIBUTION.
//
// Not the owner. `core/stats/t.ts` is. This file re-exports so the floor's import sites did not all
// have to move in the commit that removed the duplicate.
//
//   from  the statistics helpers in the private predecessor
//
// Welch rather than pooled, and that is not a default: it assumes UNPAIRED, INDEPENDENT samples.
// Repeated generations from one context are neither, which is why nothing in the convergence layer
// feeds nested generations here — contexts are the unit, and the weighting rule in
// measurement/observation.ts is explicitly not a sample size.

// The t distribution, Welch, sd and mean now live in `core/stats/t.ts` and are re-exported here so
// the existing import sites keep working. This file held a byte-identical copy of ninety lines while
// its own first line claimed to be "the ONE owner of the t distribution" — and the two copies had
// already drifted at the one spot the project documents as repaired.
export { tCrit, sd, mean, sampleFrom, welchDiff, resolutionFloor } from '../stats/t.js';
export type { TQuantile, Sample } from '../stats/t.js';
