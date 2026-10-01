# Pre-registration (draft): B6, the closed-loop fidelity study

**Status:** DRAFT, not sealed. Sealed by a public commit of this file and of the reviewer's `plan.json` (the
seeded split and the briefs) before any `generate` call on the test split. After that no line changes.
**Run by:** an independent reviewer, on corpora and a key of their own, with `bench/b6/run.mjs`.
**Answers to:** the measurable claim in [decision 0006](../docs/decisions/0006-release-contract.md). Its human
read is the one in [CROSS_DOMAIN_PREREGISTRATION](CROSS_DOMAIN_PREREGISTRATION.md); this file adds the
counted endpoints and the arms that say which part of Atelier moved what.

---

## 1. The question

Atelier 0.7 reproduced the explicit layer of an author's taste (punctuation, tells, required rules) and
missed the implicit one: paragraph and document pace, how sentences sound, and the whole-text fingerprint a
detector reads. 0.8 adds a closed loop below the standard: drafts chosen by how much of the author's range
they land in, a structural actuator for pace, retrieval of the author's closest passages, experience notes,
and grounded fact coverage. Does the loop close the implicit gap, without inventing more?

## 2. Material

One corpus per register (blog, LinkedIn, contract clauses, financial report sections, customer support; any
the reviewer has), from one source each, with consent for this use. At least 36 pieces per register for a
confirmatory result (15 test, 6 validation, at least 15 training); fewer is exploratory and reported as such.
`prepare` splits each corpus once with a recorded seed. A human-written brief per validation and test piece
is preferred (`<register>/briefs/<piece>.md`); a generated brief (title, length, the piece's facts) is the
fallback, and which was used is recorded.

## 3. Arms (one writer model for all, `B6_MODEL`)

| arm | what writes |
|---|---|
| plain | the model with the brief |
| pasted | the model with the brief and four of the author's training pieces |
| open | Atelier as 0.7 ran it: one draft, no fidelity loop (`--no-fidelity --drafts 1`) |
| loop | Atelier 0.8 with its implementation release (four drafts, structural edits, retrieval) |

The skill for `open` and `loop` is built from the training pieces only, its suggested rulings accepted as
shown (nobody in the study owns the corpus; an owner's ratification is the product's real path, and this is
a stated limit).

## 4. The evaluator is not the steering

The loop steers by the skill's profile, built from the training pieces. The evaluator is built apart:

- bands over every counted feature from the **validation** pieces;
- a stylometric detector trained on the validation pieces against the `plain` and `pasted` outputs of the
  **validation** briefs, never on any test output, never with the skill's own detector.

## 5. Endpoints and bars (per register)

| endpoint | bar for `loop` |
|---|---|
| in-band share on the evaluator's bands, test outputs | within 5 points of the real test pieces' own share, and at least 5 points above `open` |
| detector AUC, real test pieces vs the arm (P(model) as the score) | upper 95% bound below `pasted`'s point estimate |
| specifics outside the brief's facts, per output | no more than `pasted` |
| manifest gaps (a rule waived without a reason) | zero |
| run-to-run spread (length CV over 3 repeats of 5 briefs) | no higher than `pasted` |
| blind human read (the cross-domain study, section 4: 3 readers, both orders, masked) | at least 0.60 for `loop`, with the brief-bootstrap lower bound above 0.50 |

The ablation (`open` vs `loop`) is reported for every endpoint, so it is clear what the loop did and what the
standard alone already did.

## 6. Decision

The claim holds when the human read passes in at least four registers with none below 0.50, and every
counted bar holds in those registers. Anything else is reported as the result, at the same size: which
endpoints held, in which registers, and by how much.

## 7. Limits stated now

- Corpora are whatever the reviewer can use with consent; one source per register.
- Rulings accepted as shown, not ratified by an owner.
- The detector is one family of instrument (function words and character trigrams); a different family could
  separate what this one cannot.
- Code is not covered: the features here are prose features.
