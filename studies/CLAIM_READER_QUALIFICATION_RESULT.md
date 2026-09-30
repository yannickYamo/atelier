# Result: qualifying the claim reader (Phase B)

Pre-registration: [CLAIM_READER_QUALIFICATION_PREREGISTRATION.md](CLAIM_READER_QUALIFICATION_PREREGISTRATION.md),
sealed in `7e9583d` before any output existed. Reader `claude-haiku-4-5`, prompt `a5c3ef8a`, unchanged
throughout. Harness `studies/harness/claim-qualification.mjs`, run as sealed. Spent: $4.95 on TEST and
$1.55 on DEV.

## Verdict: FAIL, on specificity

| TEST (22 pieces) | claim reader | pattern check (comparator) | floor |
|---|---|---|---|
| **specificity**: clean drafts with no flag | **32 / 43 = 0.744** (95% CI 0.588–0.865) | 43 / 43 = 1.00 (0.918–1.00) | ≥ 0.80 |
| **sensitivity**: planted inventions caught | **39 / 39 = 1.00** (95% CI 0.910–1.00) | 18 / 39 = 0.462 (0.301–0.628) | ≥ 0.50 |

Sensitivity by kind, reader against pattern:

| kind | reader | pattern |
|---|---|---|
| figure | 6 / 6 | 2 / 6 |
| dated event | 6 / 6 | 1 / 6 |
| named quotation | 6 / 6 | 1 / 6 |
| anonymous quotation | 1 / 1 | 1 / 1 |
| attributed statistic | 5 / 5 | 5 / 5 |
| figure with a link | 5 / 5 | 1 / 5 |
| first-person event | 5 / 5 | 3 / 5 |
| second-hand event | 5 / 5 | 4 / 5 |

Descriptive: with no material supplied, the reader found at least one specific in 41 of 43 clean drafts
(0.953). DEV (5 pieces, not counted) agreed: specificity 6 / 10, sensitivity 9 / 9.

Four plants and no clean drafts were lost to generation (43 clean, 39 planted). The reader call never
failed.

## What it means

- **The reader catches what the pattern cannot.** Every one of 39 planted inventions was caught,
  including every kind the pattern check mostly missed: plain figures, dated events, named quotations and
  linked figures.
- **It also cuts true material too often to be qualified.** About one clean draft in four had a true
  specific flagged. That misses the pre-registered floor, and on this evidence the reader is **not
  qualified to gate**.
- **The pattern check has the opposite profile.** It never flagged a clean draft here, and it caught fewer
  than half the plants.

As registered, the gate stays **fail-closed**: an invented specific in published work is the worse error.
The README and docs now say the reader is unqualified and give these rates. Nothing about the reader was
changed during the study.

## What the false positives looked like (a hypothesis for the next reader, not a finding)

Read after unblinding, from the 11 flagged clean drafts (14 flagged sentences):

- **Most flagged sentences carry no specific at all**: "They force reflection.", "That story stuck with
  me.", "Karpathy put his finger on where the leverage really is:". Each sits beside a sentence that does
  carry one (the story, the quotation that follows the colon). The reader appears to anchor a real
  specific to the wrong sentence number, and the decision trusts the number. A decision that checks the
  typed text is actually in the sentence it names would refuse the mislocated ones. That is a code-side
  check, in keeping with "nothing the reader says counts on its own", which the current decision applies
  to the support quote and not to the location.
- **Spelled-out figures** ("ten hours", "fifty years", "six quarters") that the material states in another
  form fail a support check built for verbatim or near-verbatim quotes.
- Two flagged sentences carry figures that are in the material ("often >70%", "a 17% gap"). Their support
  quotes did not match a single passage closely enough.

These were read off the TEST set. A reader changed because of them is a new instrument, and under the
pre-registration it must be qualified **on pieces this study did not use**. This corpus cannot re-qualify
it.

## Record

- TEST result: the study folder outside the repository (`claim-qualification/test/result.json`), sha256 prefix `ad051ca5335f644c`.
- DEV result: the study folder outside the repository (`claim-qualification/dev/result.json`), sha256 prefix `6d1779735d68cf1a`.

Both hold every draft, plant and reading. They are kept on the owner's machine and are not published.
