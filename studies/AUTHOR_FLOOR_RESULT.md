# Result: how well can an author's own pieces be told from each other?

Pre-registration: [AUTHOR_FLOOR_PREREGISTRATION.md](AUTHOR_FLOOR_PREREGISTRATION.md), sealed before any reading.
Offline, nothing spent. Harness: `studies/harness/author-floor.mjs`.

## The floor is not 0.5

The same classifier, on the same feature family, asked to tell one random set of an author's pieces from another set
of the same author's pieces, 200 times:

| corpus | a side | reference | median AUC | 90th | **95th (the floor)** | floor without function-word n-grams |
|---|---|---|---|---|---|---|
| technical author (20 pieces) | 8 | 4 | 0.516 | 0.750 | **0.813** | 0.797 |
| newsletters (36 pieces) | 12 | 12 | 0.500 | 0.688 | **0.722** | 0.743 |

At 6 a side the floor is 0.833 on both corpora. One split in twenty of an author's own pieces is "told apart" at
0.72 to 0.81 at the sizes the indistinguishability study used.

## The study's arms against it

The AUCs are the ones recorded in [INDISTINGUISHABILITY_RESULT](INDISTINGUISHABILITY_RESULT.md), not recomputed.

| arm | technical author | above its floor (0.813)? | newsletters | above its floor (0.722)? |
|---|---|---|---|---|
| plain | 0.750 | **no: at the floor** | 0.951 | yes |
| pasted examples | 0.922 | yes | 0.958 | yes |
| Atelier | 0.938 | yes | 0.951 | yes |
| plan-first | 0.906 | yes | 1.000 | yes |
| plan-first, steered | 0.906 | yes | 0.972 | yes |

Without n-grams made only of function words: on the technical author every arm (0.67 to 0.80) is at that reading's
floor (0.797); on the newsletters every arm (0.87 to 0.94) is above it (0.743).

## What it means

- **The study's FAIL stands for every Atelier arm.** On both corpora, on the full feature family, Atelier, plan-first
  and plan-first steered sit above what the author's own pieces give. They were told apart, and by a margin: about
  0.09 to 0.12 above the floor on the technical author, 0.23 to 0.28 on the newsletters.
- **Two readings of that study were not resolved, and are restated as such.** On the technical author, the plain arm
  (0.750) and every arm's reading without function-word n-grams are at the floor: 8 texts a side could not tell them
  from the author's own pieces, and could not have told a closer arm either. The newsletters, with 12 a side and a
  reference of 12, resolved every arm.
- **The target for any later voice study is the floor, not 0.5.** An arm passes a machine reading when its AUC is at
  or below the 95th percentile of the author's own splits at the same size, and the floor is reported beside it.
  A sealed bar of "0.10 below the best baseline" can be met or missed inside the noise at 8 a side.
- **A floor is not a pass.** An arm at the floor is unresolved, not indistinguishable. People reading blind remain
  the primary.

## Limits

- The technical author's reference is 4 pieces here against 12 in the study, so that floor may read high. The
  reading at 6 a side with a reference of 8 gives 0.833, so it does not read lower with more reference.
- Two authors, one feature family, these sizes.

## What changed

`atelier fidelity --typicality` now prints the same floor for any skill whose calibration holds 12 or more pieces
(`authorFloor`, `core/fidelity/twosample.ts`), beside the AUC it is read against.
