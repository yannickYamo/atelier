# Result — Acquisition Study B, decision-rich sampling

**Date:** 2026-08-24. **Preregistration:** sha256 `7cc6c6eb`, frozen before screening.
**Frozen PR set:** sha256 `e3993fa63cdc4067`. **Corpus hash:** `26395663f1235a12`.
**Spend:** $2.309. **Cumulative: $16.27 of $25. $8.73 remains and may not be spent making this pass.**

**OUTCOME: 2 clean DECISION candidates. Gate was ≥3. KILL RULE FIRES.**

```
STOP public-proxy acquisition entirely.
DO NOT search for another GitHub maintainer.
```

---

## 1. The selector did its job

12 PRs hand-screened from a 70-PR fresh pool, disjoint from Phase −1, Acquisition A, the semantic
screen, and held-out B. Every inclusion carries a quoted comment where Maintainer B chooses among at least two
plausible alternatives and gives a context-dependent reason. Verified by hand, not by keyword.

Discovery returned 9 candidates, 9 survived validation, 6 of 9 recurring in held-out.

**The evidence genuinely contained the decisions.** Two of the twelve, verified before firing:

- **#24514** — *"matching our special-cased constructor signature to the typeshed one would have been
  the other way to fix this. I felt... it would be better to implement this via an additional overload
  in typeshed, rather than by maintaining..."*
- **#24868** — *"we could replace all these with just `IN_VALID_UNPACK_CONTEXT`... Whether that makes
  sense depends on whether we'll have other uses for these more granular flags."*

Neither was recovered as a decision rule.

---

## 2. Classification

| id | verdict |
|---|---|
| p5 | **DECISION** — whether a related deficiency blocks this PR or is noted without blocking |
| p7 / p8 | **DECISION, counted once** — when two conventions are both workable, state which context favours each rather than universalising one |
| p2 | MIXED — accepts a shortcut because a policy elsewhere enforces the invariant, but the stated behaviour is *asking for a comment* |
| p6 | MIXED — names the remaining gap after endorsing, stated as review practice |
| p9 | MIXED — *"I justify positions by their effect on real user workflows rather than internal consistency"* |
| p1, p3, p4 | METHOD / VOICE |

**Count: 2.**

**p7 and p8 are one candidate, not two.** They share an identical evidence span and one substantive
claim; p7 adds only that the tool cannot know which population it serves. Counting them separately
reaches 3 and flips the routing, which is precisely why they must not be. The same call was made
against Maintainer A's p8 and Acquisition A's p8 when it was equally convenient to promote them.

**p9 is MIXED for consistency.** Its grammar is *"I justify X by Y rather than Z"* — the same shape as
Maintainer A's p8, called MIXED then.

---

## 3. What the negative actually says, stated precisely

The preregistration committed in advance: failing on deliberately decision-rich material would be a
genuine negative against acquisition itself rather than another selector problem. **That commitment
holds and the kill rule fires.**

But the negative is narrower than "acquisition does not work", and the precision matters:

> **The acquisition succeeded in selecting decision-rich evidence. The discovery framing rendered most
> of it as review practice rather than as decisions.**

The corpus provably contained explicit choices with stated reasons — hand-verified before spending.
Discovery recovered nine well-anchored rules from it, and phrased the decision content as
*communication behaviour*: **I justify** positions by user impact; **I state** which context favours
each alternative; **I ask** for the reasoning to be recorded. Not *I decide* X when Y.

Two of the three MIXED rules encode real decision criteria under a communicative verb. Had the framing
emitted them as decisions, this study would have passed.

**This is consistent with a finding already in the corpus:** discovery framing changes what is
recovered, strict recall 3/9 under one framing and 4/9 under another, union ~7/9. That finding was
about how much is recovered. This adds that framing also governs **what kind of thing** is recovered
from the same evidence.

**It is recorded as an observation and is NOT grounds for an exception.** Re-running under a different
framing would be tuning until the gate complies, which the seal forbids and which would make every
prior gate in this programme retrospectively advisory.

---

## 4. Five acquisition runs, final table

| corpus | selector | decision sites/doc | clean DECISION |
|---|---|---|---|
| Maintainer A, conversation | none | 0.33 | 0 of 8 |
| Maintainer A, enriched | none | 1.00 | 1 of 9 |
| Maintainer B, Phase −1 | unfiltered sample | 1.00 | 4 of 9 |
| Maintainer B, Acquisition A | highest comment volume | 1.00 | 2 of 10 |
| **Maintainer B, Study B** | **hand-screened decision content** | **1.00** | **2 of 9** |

Selecting directly for decision content did not beat an unfiltered sample of the same expert. That is
the result, and it is not the one the hypothesis predicted.

**H_B is not supported.**

---

## 5. State

Public-proxy acquisition is closed. No fourth maintainer. Both held-out B sets remain unfetched and
unread. No generation study has been run against any proxy. No claim tier moves.

$8.73 remains and is not to be spent on this line.

The next useful step is no longer a GitHub maintainer. It is a participating human who can answer
*"is this actually your judgment?"* — which is the one question every proxy study is structurally
unable to ask.
