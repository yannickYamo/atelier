# Pre-registration: how well can an author's own pieces be told from each other?

**Written and sealed before any reading of the data below. Offline: no model call, nothing spent.**

## The question

The indistinguishability study ([INDISTINGUISHABILITY_RESULT](INDISTINGUISHABILITY_RESULT.md)) asked whether a
classifier on a feature family no arm steers on could tell each arm's outputs from the author's unseen pieces. Every
arm was told apart, at AUC 0.75 to 1.0, and the verdict was FAIL.

That verdict reads each AUC against 0.5. With 8 or 12 texts a side, two sets of the same author's pieces do not give
0.5 every time: they give a spread around it, and nobody measured that spread. If an author's own pieces are told
from each other at 0.75 at these sizes, an arm at 0.75 is at the floor and the study could not have passed anything.
If they are told apart at 0.55, the arms sit far above it and the verdict stands with a known margin.

This study measures the floor. It changes no verdict of the sealed study: it says what the instrument can resolve.

## Data (already collected, nothing new is written)

The two corpora of the indistinguishability study, every author piece in each (the pieces the skill read and the
held-out ones): 20 pieces for `author-posts`, 36 for `newsletters`. No model output is read except the arm AUCs
already recorded in that study's `result.json`, which are copied beside the floor and not recomputed.

## Method

For each corpus, with `n` the number of held-out pieces in the study (8 and 12), 200 seeded random splits:

1. Shuffle the author's pieces (a seeded generator, the split's index as its seed).
2. Side A is the first `n`, side B the next `n`, and the reference is every remaining piece (4 and 12).
3. The evaluation vocabulary (character 4-grams and word bigrams, `core/fidelity/evaluation.ts`) is fixed from the
   reference alone, and both sides are standardised by the reference, exactly as the study fixed its vocabulary from
   the read pieces and standardised by them.
4. The classifier two-sample test (`c2st`, seed 1, as in the study) gives the AUC of telling A from B.

An AUC below 0.5 counts as 0.5, the study's own sealed rule.

## Readings

Per corpus: the median, the 90th and the 95th percentile of the 200 AUCs.

**The floor is the 95th percentile.** An arm of the study is **above the floor** when its recorded AUC is greater
than it, and **at the floor** otherwise.

- If every arm is above the floor on a corpus, the study's FAIL on that corpus stands as read.
- If an arm is at the floor on a corpus, the study could not tell that arm from the author's own pieces on that
  corpus at that size, and its result is restated as "not resolved at this sample size" for that arm.
- The same reading is repeated on the vocabulary without n-grams made only of function words, as the study did.

## Limits, stated before the data

- On `author-posts` the reference is 4 pieces, against 12 in the study, so its vocabulary and scale are noisier and
  the floor may read higher than it would with the study's reference. A second reading at 6 a side (reference 8) is
  reported beside it; neither is the study's exact configuration, which the author's 20 pieces cannot reproduce.
- The floor is for these two authors at these sizes. It is not a property of the method in general.
- A floor is not a pass. An arm at the floor is unresolved, not indistinguishable.

## What changes with the result

`atelier fidelity --typicality` reports the same floor for any skill with 12 or more calibration pieces
(`authorFloor`, `core/fidelity/twosample.ts`). Whatever this study finds is written beside the indistinguishability
result in the CHANGELOG and docs/RESULTS.md. No README claim moves on it: voice stays unclaimed either way.
