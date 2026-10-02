# Result: qualifying the claim reader, version 3

Pre-registration: [CLAIM_READER_V3_QUALIFICATION_PREREGISTRATION.md](CLAIM_READER_V3_QUALIFICATION_PREREGISTRATION.md),
sealed in `9104992` and merged to `main` before any output. Instrument `a173339d` (reader `claude-haiku-4-5`,
decision version 3) and harness sha256 `b36a546b…`, both checked unchanged before the run. Pieces: 30
product essays from a public newsletter no study had used; 25 TEST. Spent: $7.98 of the $8 cap.

## Verdict: PASS

| TEST (25 pieces) | claim reader v3 | pattern check (comparator) | floor |
|---|---|---|---|
| **specificity**: clean drafts with no flag | **41 / 48 = 0.854** (95% CI 0.722–0.939) | 45 / 48 = 0.938 (0.828–0.987) | ≥ 0.80 |
| **sensitivity**: planted inventions caught | **45 / 45 = 1.00** read by the reader (see below) | 11 / 46 = 0.239 (0.126–0.388) | ≥ 0.50 |

By kind (reader, pattern). The two kinds new in this study test what version 3 changed:

| kind | reader | pattern |
|---|---|---|
| figure | 4 / 4 | 1 / 4 |
| dated event | 4 / 4 | 1 / 4 |
| named quotation | 5 / 5 | 1 / 5 |
| anonymous quotation | 5 / 5 | 1 / 5 |
| attributed statistic | 5 / 5 | 4 / 5 |
| figure with a link | 5 / 5 | 0 / 5 |
| first-person event | 5 / 5 | 1 / 5 |
| second-hand event | 5 / 5 | 2 / 5 |
| **figure in a heading** | **4 / 4** | 0 / 4 |
| **figure in a table** | **4 / 4** | 0 / 4 |

**One read was not the reader's.** The $8 cap ran out on the last planted draft, so that one text was read by
the pattern check, as the product does when the reader cannot run. The harness counted it as the reader
catching the plant (46 / 46). Stated here as 45 of 45 read by the reader; counted either way, sensitivity is
far above its floor. Every clean draft was read by the reader. The harness's "reader failures" count (48)
counts the standing note an unqualified reader carries on every reading, not failures; the one real failure
is the budget above. Generation lost two plants and one excerpt.

The seven false flags on clean drafts: five are the author's own first-person stories, which the paraphrase
kept and the material supports ("I'd just left Airbnb…", "my manager wouldn't be convinced…"); one is a
general claim ("Weekly PM team meetings just end up duplicating…"); one is a link to the author's own
template. With no material bound, the reader found a specific in 47 of 48 clean drafts.

## What it means, and what it does not

- **By the pre-registered rule, version 3 is qualified to gate** on this population: product essays by one
  author. Both point estimates clear their floors.
- **The interval is wide**: the lower bound on specificity (0.722) is below the floor. Read it as "passes
  on the evidence, not yet tightly bounded", as with version 2.
- **The false flags are the documented risk, measured.** Most were true first-person stories. A person's own
  stories must be bound as material (`atelier material`), or some will be cut.
- **The pattern check is not always precise.** It flagged 3 of 48 true drafts here, after 0 in both earlier
  studies. It caught 11 of 46 plants and none in a heading or a table.
- **Qualification is per instrument and per population.** Version 1 failed on a public technical author's
  posts; version 2 passed on technical and marketing writing; version 3 passes on product essays. No single
  version has been measured on two populations.

## What changed as a result

`{ model: 'claude-haiku-4-5', version: 'a173339d' }` joins `QUALIFIED_READERS`, so version 3 cuts by default.
It was the last attempt allowed before Phase C, as pre-registered.

[← studies](README.md)
