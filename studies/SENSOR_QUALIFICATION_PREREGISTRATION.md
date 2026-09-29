# Pre-registration: qualifying the taste sensors (Phase A2)

**Status: SEALED by the commit that adds this file, before any output of this study exists.**

## Why

Phase A2 replaces a hand-picked set of style checks with selection. Every counted feature
(`core/observers/features.ts`) is measured on the author's pieces and on the model's plain drafts. Only
features that separate the two and hold on held-back pieces are kept (`core/observers/selection.ts`), as a
RULE (the band tells single drafts apart) or a SIGNAL (the distributions differ, single drafts don't). A
move reader (`core/taste/moves.ts`) is a candidate for the deep layers.

A feature the selection keeps has to separate the author from the model on pieces and drafts it never saw,
otherwise it describes the sample and not the author. The move reader has to reproduce its own readings
before any of them are used. This study measures both, once.

## Development, stated

- The selection rule and the move reader were developed on the voice rounds' corpus (20 posts and the
  rounds' model drafts). There, counted features kept 7 signals, and the move reader barely separated
  author from model.
- Several of the reader's features were unstable on a re-read (figures −0.21, humour 0.39). The reader's
  token limit was raised after truncation.
- None of that data is used here.

## The instruments, frozen

- Counted features and selection: as on branch `taste-detection` at the sealing commit, with the product's
  thresholds (|AUC − 0.5| ≥ 0.25, 80% of held-back pieces in band, 60% of drafts outside for a RULE).
- Move reader `b1356e48` (`claude-haiku-4-5`). The harness refuses any other version.
- Harness: `studies/harness/sensor-qualification.mjs`, sha256 prefix **`a32f4cc9dcb9b715`**.

## Materials

- **Author pieces.** 40 DailyDoseOfDS newsletters, a house style from two authors, never used by any study
  (the claim reader's 25 are excluded). They were chosen by seeded hash (`sensor-qualification-2026-09-29`)
  from the 52 unused ones with at least 500 words, and are copied to `~/atelier-sensors`.
- **The split, by the same seed, before generation:**
  - INNER: 16 pieces (selection reads them);
  - INNER HELD: 8 (selection's own held-back check);
  - OUTER: 16 (validation only).
- **Model drafts.** One per piece, on its title, by `claude-opus-5`, with discovery's own plain-draft prompt:
  - A: 24 drafts, on the INNER and INNER HELD titles;
  - B: 16 drafts, on the OUTER titles.

## Measures and decision rules

**C1: counted features.** Selection is run exactly as discovery runs it (INNER, INNER HELD, A). A kept
feature **replicates** if its AUC on OUTER against B lies on the same side of 0.5 and at least 0.15 from it.

| verdict | condition |
|---|---|
| **PASS** | at least 3 features kept, and at least 70% of them replicate |
| **FAIL** | at least 3 kept, but fewer than 70% replicate |
| **INCONCLUSIVE** | fewer than 3 kept |

Band checks for RULE features on OUTER and B are reported, not gating.

**C2: the move reader.**

- **Reliability.** 20 texts (10 INNER pieces and 10 A drafts) are read twice. A feature is reliable if its
  rank correlation between the two readings is at least 0.70.
- **Selection and replication.** Move features go through the same selection and replication as C1, with
  the categorical reference built from INNER.

| verdict | condition |
|---|---|
| **PASS** | at least 2 move features are reliable, kept and replicate. It is then wired into the product as signals (never rules) in a later change |
| **FAIL** | anything less. It stays parked, and the counted features ship without it |

## Cost

Hard cap: **$10**. Estimated: about $4.

## Limits

- One house style, technical explainers. A pass says selection generalises for this writer; it is not a rate
  across writers.
- Everything is Claude.
- Validation uses a second sample of the same author and model, not human judgement. Whether the kept
  features track what a person hears as "sounds like them" is Phase C's question.

## Record

The result goes in `studies/SENSOR_QUALIFICATION_RESULT.md` and the CHANGELOG, whatever it is.
