# Pre-registration: qualifying the claim reader, version 2

**Status: SEALED by the commit that adds this file, before any output of this study exists.**

## Why a second attempt, and why the last

Version 1 failed its pre-registered bar on specificity
([result](CLAIM_READER_QUALIFICATION_RESULT.md)): it caught 39 of 39 plants, but flagged true material in 11
of 43 clean drafts, a specificity of 0.744 against a floor of 0.80. Read after unblinding, most false flags
were a plain sentence beside the one that held the specific: the decision trusted the reader's sentence
number. The owner approved **one** bounded attempt at a revised reader, qualified on pieces neither study
had used. Whatever it shows is recorded, and there is no third attempt before Phase C.

## What changed (the decision in code; the reader's prompt is unchanged)

`DECISION_VERSION` 2, in `core/loop/claim-extract.ts`:

- **Location is checked.** A specific must be in the sentence the reader names. If it isn't, it is moved to
  the sentence that holds it. If no sentence holds it, nothing is cut.
- **A specific that traces to the material verbatim is supported**, whatever source the reader named.
- **Spelled-out numbers count as the same figure as their digits** ("ten hours" is "10 hours"), both in the
  number check and in text matching.

Instrument version: **`0279163b`** (`READER_VERSION`: the prompt, the schema and the decision version).
The reader is `claude-haiku-4-5`. The harness is `studies/harness/claim-qualification.mjs`, sha256 prefix
**`9253795dce398f68`**. It refuses any other reader version.

**Development data, stated.** Version 2 was built from version 1's read of its own test set. That set is
spent as evidence, so it served as development data. On those same drafts, version 2 scored specificity
36 / 43 and sensitivity 39 / 39. Those numbers are not evidence. This study is the evidence.

## Materials: pieces no study has used

- **25 newsletters** from the DailyDoseOfDS archive, chosen by seeded hash (seed
  `claim-reader-v2-2026-09-29`) from the 77 with at least 500 words once the metadata header is removed.
  These are technical explainers dense in figures, names and benchmarks, copied to
  `~/atelier-claims-v2/newsletters`.
- **8 short pieces**: 4 marketing pages the owner wrote (private, not published) and `~/atelier-b2-study/corpus` (4).

The DEV/TEST split (5 DEV pieces), excerpts, clean drafts, plants, measures and statistics all follow the
[version 1 pre-registration](CLAIM_READER_QUALIFICATION_PREREGISTRATION.md) unchanged. The only
differences are the new seed and the new instrument version.

## Decision rule (unchanged)

On TEST only, using point estimates:

| verdict | condition | consequence |
|---|---|---|
| **PASS** | specificity ≥ 0.80 **and** sensitivity ≥ 0.50 | the reader is qualified to gate on this population; the README states the rates; the whitepaper gets a dated amendment |
| **FAIL** | either one below its floor | the gate stays fail-closed and is documented as unqualified, with both versions' rates; no further attempt before Phase C |
| **INCOMPLETE** | fewer than 30 clean or 30 planted TEST drafts | reported with no verdict |

## Cost

Hard cap: **$8**. Estimated: about $5.

## Limits

The limits of version 1 apply, plus one more: this genre (technical explainers, marketing pages) differs
from version 1's essays. A pass here and a fail there describe different populations. Neither is a rate
for writing in general.
