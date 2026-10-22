# The failed pass lines of 2026-10-22b, run again, 2026-10-22c

Head: phase-g at efa0050, dist built once at that commit before any call. Writer `claude-sonnet-5-5` on every build
and run; context reader `claude-haiku-5-5`, claim reader `claude-haiku-4-5` (defaults). Every model call passed
through `meter.mjs` (a fresh meter on its own port, a fresh ledger: `calls.jsonl`, `ledger.json`). One fresh
`ATELIER_DATA` per fixture; nothing under `~/.atelier`. **Spend: $2.20 measured** (cap $8.50); nothing was cut, two
runs per task throughout.

Scripts: copied from 2026-10-22b (`lib.mjs`, `meter.mjs`, `build.mjs`, `verify.mjs`, `repair.mjs`,
`hook-ground-authority.mjs`, `consistency.mjs`, `run-*.sh`), changed only in the scratch folder, port and cap. New:
`probe.mjs` (the record of one held-out golden, no model call), `accept.mjs` (the owner's acceptances, read off that
record), `analyse.mjs` (D1 to D6 and the spend; replaces `deliver.mjs`, `score.mjs` and `report.mjs`, which read arms
this study did not run). Every table is in `report.md`; the numbers are in `arms/analysis.json`.

## The owner's choices (stated before the runs)

On both STRICT skills the owner accepts as unmeasured the required steps that are judgement (no check) and the unread
part of any required rule a check reads only in part, with `atelier amend --accept-unmeasured <ids>` after the build.
A rule a check reads in full is not accepted. A step whose written check did not qualify is recorded by the product as
read in full (`coverage FULL`, reason `OBSERVER_UNQUALIFIED`), so under the owner's words it is **not** accepted.

| skill | accepted (by id) | why | required, held, not accepted |
|---|---|---|---|
| claims (standard f201213421c222c1 → 4823666957968b33) | x1 | Summary: "one paragraph" is not read (PARTIAL) | x3, x4, x5, x6, x8: written checks read in full, not qualified |
| labels (41190182644e50ff → 4833d2ab138de82b) | x4, x8, x9, x13, x14, x15, x17 | judgement, no check | x2, x5, x6, x7, x10, x11, x19, x20: written checks read in full, not qualified |

## Headline

| line | pass line | result | number |
|---|---|---|---|
| D1 | claims delivered (VERIFIED) above 0 of 20 | **fail** | 0 of 20; every run held by x3, x4, x5, x6, x8 (unqualified written checks), 15 also by the claims reader (`specifics`, PARTLY_CHECKED) |
| D2 | labels delivered above 0 of 20 | **fail** | 0 of 20 (19 NEEDS_REVIEW, 1 BLOCKED); every run held by x2, x5, x6, x7, x10, x11, x19, 5 also by x20, 14 by `specifics`; t0.r1 blocked by `lifted` |
| D3 | claims every-rule hold, Atelier − (method + served examples), lower bound above 0 | **pass** | 19/20 vs 7/20: +60.0 points (37.0 to 83.0) |
| D4 | repair fixes the five claims defects, nothing added, dropped or negated | **partial** | 2 of 5 fixed (0 of 5 before): speculation, uncited; one sentence rewritten in each, no negation, no material figure lost |
| D5 | hook: non-JSON exits 2; held-out golden, no material, exits 0 naming unread required rules | **pass** | non-JSON exit 2 in 0.14 s with the reason; e10 exit 0 in 0.86 s, 4 required rules named as not read |
| D6 | planted defects named by their own step with the passage, against 3/5 and 3/5 | **fail** | claims 3 of 5 by the script (2 of 5 with the defect's own passage), labels 2 of 5 |

Not a pass line: had the owner also accepted the steps whose written check did not qualify, 5 of 20 claims and 6 of 20
labels runs would have been delivered; the rest were held by the claims reader as well.

## D1, D2

Every run's holding entries are listed in `report.md`. On claims the only accepted rule, x1, was listed and held
nothing; the five unqualified checks (Coverage, Decision, Reserve, intent or honesty, nothing added) held all twenty.
On labels the seven judgement rules were listed; the eight unqualified checks held all twenty. The labels run t0.r1 (a
Floor label) was BLOCKED by the copying check: "a run of 12 words is shared with one of them: overall floor categories
category floor all brands risk floor span null evidence", the keys and values every Floor label has. The same output
added a "Check to settle:" paragraph after the JSON; the JSON-shape check (x19) is unqualified and blocked nothing.

## D3

The method + examples arm was **run again**, not reused: the examples Atelier serves are written by the build into the
skill's `examples/` folder, and the 2026-10-22b build's folder was not kept, so the prompt could not be shown identical.
Same writer, same method, same ten tasks, the examples this build serves (an exemplar and eight voice pieces).

| rule (check.mjs, R8 reads the task's material) | Atelier fails | method + examples fails |
|---|---|---|
| R2 a fact without a citation | 0 | 5 |
| R3, R3c coverage clause and exclusions | 0 | 2 |
| R5 the reserve equals the invoices | 1 | 0 |
| R8 a figure the file does not give | 0 | 8 |
| R8b a date the file does not give | 0 | 2 |

For reference, scored by today's `check.mjs`, the 2026-10-22b outputs' first two runs were 20/20 (Atelier) and 10/20
(method + examples). Cost: Atelier $0.49, method + examples $0.58.

## D4

| defect | oracle rule | fixed | change |
|---|---|---|---|
| speculation | R7 | yes | "is suspicious and may be a scam" → "raises a concern that may warrant further verification" |
| uncited | R2 | yes | the uncited sentence gained "[notice of loss]" |
| date, exclusion, reserve | R8c, R3b, R5 | no | no enforced rule was broken in a sentence; nothing rewritten |

The speculation rewrite removed the banned words and still voices doubt about the insured's account, which step 6 forbids;
x6 is unqualified, so nothing held it.

## D5

The non-JSON event: exit 2, "the hook event on stdin is not a JSON object ... nothing was checked". The held-out golden
on a Write event: exit 0, "4 required rule(s) ... were not read on this text", the Facts citation rule named first
(it reads the material). The speculation defect still exits 2 (Write and Stop); uncited and reserve exit 0 with the
same note.

## D6

| fixture | defect (step) | named by its step | passage |
|---|---|---|---|
| claims | date (8) | x8 | "1,850", not the added date: x8 fires on that figure in every defect file |
| claims | exclusion (3) | no | |
| claims | reserve (5) | x5 | none |
| claims | speculation (7) | x7, blocks | "suspicious" |
| claims | uncited (2) | x2, blocks | the uncited sentence |
| labels | firearms-floor (5) | x5 | the label |
| labels | high (4) | no (x4 is judgement in this build) | |
| labels | paraphrase (17) | no (x17 is judgement in this build; it had a check in 10-22b) | |
| labels | span (12) | x12, blocks | the span |
| labels | taxonomy (1) | no: x1's check passed "Violence – scuffle" | |

Held-out goldens: claims e10 and labels e12 NEEDS_REVIEW, neither blocked. Grounding (not a pass line): an invented
figure and citation in e02 BLOCKED with material, NEEDS_REVIEW without; repair kept both.

## Product bugs found (not fixed)

1. **A qualified written check that reads only the form of its step is recorded as reading it in full.** Labels x1
   ("one of the 39 categories of the taxonomy") qualified on 11 examples and one breaking edit; its check only tests
   the "A – B" form, and its own note says the taxonomy list could not be checked. The record says FULL, so
   "Violence – scuffle" passes.
2. **An unqualified written check is FULL on the record and "partly read" in the CHANGELOG.** `--accept-unmeasured`
   would accept such a step for its unread part, while the record says it reads it all; the owner's rule ("never
   accept a rule a check reads in full") then leaves no way to deliver. Five claims steps and eight labels steps hold
   every run.
3. **The copying check blocks a Floor label** for the keys and values every Floor label shares (labels t0.r1).
4. **Repair replaces a banned word with an insinuation** ("raises a concern that may warrant further verification"); the
   step against speculation has no qualified check, so nothing holds it.
5. **Two first builds still differ:** in 10-22b labels step 17 had a check and claims step 2 failed to qualify; here
   x17 is judgement and claims x2 qualified (the material-naming fix worked).
