# Result: qualifying the claim reader, version 2

Pre-registration: [CLAIM_READER_V2_QUALIFICATION_PREREGISTRATION.md](CLAIM_READER_V2_QUALIFICATION_PREREGISTRATION.md),
sealed in `4b57eeb` before any output. Instrument `0279163b` (reader `claude-haiku-4-5`, decision version
2), unchanged throughout. Pieces: 33 that no study had used; 28 TEST. Spent: $3.45.

## Verdict: PASS

| TEST (28 pieces) | claim reader v2 | pattern check (comparator) | floor |
|---|---|---|---|
| **specificity**: clean drafts with no flag | **35 / 38 = 0.921** (95% CI 0.786–0.983) | 38 / 38 = 1.00 (0.907–1.00) | ≥ 0.80 |
| **sensitivity**: planted inventions caught | **35 / 35 = 1.00** (95% CI 0.900–1.00) | 9 / 35 = 0.257 (0.125–0.433) | ≥ 0.50 |

By kind (reader, pattern):

| kind | reader | pattern |
|---|---|---|
| figure | 5 / 5 | 0 / 5 |
| dated event | 5 / 5 | 0 / 5 |
| named quotation | 5 / 5 | 0 / 5 |
| anonymous quotation | 2 / 2 | 0 / 2 |
| attributed statistic | 5 / 5 | 5 / 5 |
| figure with a link | 5 / 5 | 1 / 5 |
| first-person event | 4 / 4 | 0 / 4 |
| second-hand event | 4 / 4 | 3 / 4 |

The reader call never failed. Generation lost three plants and no clean drafts. With no material, the
reader found a specific in 37 of 38 clean drafts.

The three false flags on clean drafts:

- a sentence left broken by the source's own formatting ("Just install the library…", where the original
  showed code as an image);
- a general claim ("a very small k is usually a bad idea");
- a colon-ended lead-in to a quotation ("The Kimi team's observation and their fix:").

## What it means, and what it does not

- **By the pre-registered rule, the reader is qualified to gate** on this population: technical explainers
  and marketing pages. The rule used point estimates, and both clear their floors.
- **The interval is wide.** The lower bound on specificity is 0.786, below the floor. With 38 clean drafts,
  that is as precise as this study can be. Read the result as "passes on the evidence, not yet tightly
  bounded".
- **Two populations, two results.** Version 1 failed on essays with specificity 0.744. Version 2 passes
  here. Version 2's own score on version 1's essays (36 / 43 = 0.837) was development data, not evidence.
  Neither figure is a rate for writing in general.
- **Every plant is one model-written sentence.** Sensitivity of 1.00 on these says nothing about an
  invention woven through a true sentence.
- **Everything is Claude:** the writer, the planter and the reader.

## Record

- TEST result: `<a local folder>`, sha256 prefix `a5d0bc88d93c922d`. It holds every draft,
  plant, and the reader's typed specifics.
- The pieces: `<a local folder>` (a copy), the owner's private marketing pages and
  `<a local folder>`.
