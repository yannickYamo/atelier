# Result: qualifying the structure reader

Pre-registration: [STRUCTURE_READER_PREREGISTRATION.md](STRUCTURE_READER_PREREGISTRATION.md), sealed in `d900a0e`
before any study text was read. Reader `9a0bb843`, harness `7922f9dd1737173d`. Spent: $1.97.

## Verdict: FAIL

No feature was reliable, kept and replicating; the floor was three. Every feature was reliable. None was kept,
because none separated the author's pieces from the model's plain drafts by the product's bar (|AUC − 0.5| ≥ 0.25).

## Reliability: solved

The move reader failed here because what it read reliably did not separate and what separated was not reliable.
The structure reader reads the same way twice:

- **Two reads per text:** median Cohen's κ 0.867, 10th percentile 0.711, over 72 texts.
- **An independent re-read of 20 texts:** rank agreement 0.94 or higher on 11 of 12 features. The one exception
  was the closing move, at 0.757.

## Separation: not on this corpus

INNER pieces against A drafts; AUC is the chance an author piece scores higher than a model draft.

| feature | re-read | AUC | reading |
|---|---|---|---|
| switch rate (how often the move changes) | 0.993 | 0.718 | the authors change move more often |
| entropy rate of the move chain | 0.939 | 0.713 | the authors are less predictable |
| concession share | 0.999 | 0.651 | |
| question, summary, turn shares | 0.95–1.0 | 0.60–0.61 | |
| instruction share | 0.96 | 0.333 | the model instructs more |
| claim support | 0.951 | 0.353 | the model follows a claim with a shown case more often |

The two strongest features point the way the study of AI fiction found (arXiv 2604.03136): model text is tidier and
more predictable. On these technical newsletters the effect is real but below the bar.

**Secondary, no verdict (a technical author's 20 posts).** Selection kept one feature, claim support (AUC 0.773).
It did not hold on the 8 unseen posts against 19 other drafts (0.592). Two features moved strongly on the unseen
posts without being kept: turn share 0.197 and entropy rate 0.293. Both run opposite to their selection AUC, so
they read as noise at this size.

## What it means

- **Paragraph-level moves are readable but do not identify an author here.** For non-fiction in this register, the
  model already builds pieces from the same moves in roughly the same proportions. The signal the fiction study
  found sits at a level this taxonomy does not reach: plot, time, moral ambiguity. Or it is weaker in explainers.
- **The reader stays a monitor.** No structure feature joins a profile, selects a draft, or gates an output.
- **Plan-first generation is unaffected as an actuator.** It never used the features; it samples skeletons from the
  author's own sequences. Whether that moves outputs toward the author is the sealed study's question, measured by
  instruments it does not steer on.
- **No re-run on this corpus** (§8b.6). A better taxonomy is a new instrument and a new pre-registration.
