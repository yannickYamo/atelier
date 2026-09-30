# Result: qualifying the taste sensors (Phase A2)

Pre-registration: [SENSOR_QUALIFICATION_PREREGISTRATION.md](SENSOR_QUALIFICATION_PREREGISTRATION.md), sealed in
`08206d6` before any output. Corpus: 40 newsletters no study had used, split before generation (INNER 16,
INNER HELD 8, OUTER 16). Model drafts: A 24 and B 16. Spent: $3.75.

## C1, counted features: PASS

10 features were kept by selection, run as discovery runs it. **9 of 10 replicate** on OUTER against B, above
the floor of 70%.

| role | feature | selection AUC | validation AUC | replicates | band on OUTER / B |
|---|---|---|---|---|---|
| RULE | links | 1.000 | 1.000 | yes | 88% of pieces inside, 100% of drafts outside |
| RULE | block quotations | 0.991 | 1.000 | yes | 100% inside, 100% outside |
| SIGNAL | names mid-sentence | 0.955 | 0.992 | yes | |
| SIGNAL | list items | 0.927 | 0.938 | yes | |
| SIGNAL | figures in digits | 0.844 | 0.770 | yes | |
| SIGNAL | "you" (fewer than the model) | 0.161 | 0.195 | yes | |
| SIGNAL | small numbers as digits | 0.821 | 0.737 | yes | |
| SIGNAL | quoted phrases (fewer) | 0.186 | 0.168 | yes | |
| SIGNAL | long-sentence length (shorter) | 0.204 | 0.323 | yes | |
| SIGNAL | conjunction openers | 0.768 | 0.577 | **no** | |

**What it means.** The selection keeps what holds. On this writer, the features it picked separated unseen
pieces from unseen drafts, sometimes perfectly: the newsletters link, quote in blocks, name tools and
people, use lists and digits, and address the reader less than the model does. The two RULE bands held on
unseen text as the pre-registration asked. The one feature that did not replicate was the weakest kept.

## C2, the move reader: FAIL

| feature | re-read agreement | selection AUC | validation AUC |
|---|---|---|---|
| concession | **0.866** | 0.147 (kept) | 0.270: replicates |
| figures | 0.482 | 0.199 (kept) | 0.201, but unreliable |
| opening move | **0.931** | 0.502 | not kept |
| closing move | **0.868** | 0.716 | not kept |
| aphorisms, confessional, humour | 0.63–0.67 | | not kept |
| evidence, callbacks, register run, figure domains, moves | 0.22–0.48 | | not kept |

**Only one feature was reliable, kept and replicating** (concession: the model concedes more). The floor
was two. The reader stays parked, and the counted features ship without it.

The pattern repeats what development showed on another author:

- **Some features are reliable but don't separate.** The reader reads openings and closings
  consistently, and the model's openings and closings don't differ from the author's.
- **Some features separate but aren't reliable.** Figures are one.

With a writer this strong, the deep layers do not come out as rates a small model can type per paragraph.

## What this changes

- **Counted features and selection ship.** Discovery proposes RULE features. It keeps SIGNAL features to
  choose between drafts and to profile them.
- **The move reader stays parked.** Where "sounds like them" lives in the deep layers is still unmeasured
  by any qualified instrument. Phase C's blind reads, with every draft's profile recorded beside the human
  ranks, are the next test of whether any sensor tracks what a person hears.

## Limits

- One writer, one genre: technical explainers.
- Validation is against a second sample of the same author and model, not a human.
- Everything is Claude.

## Record

Result file: `~/atelier-sensors/result/result.json`, sha256 prefix `56a4ebf0735b8140`. It holds every draft,
reading and verdict.
