# Acquisition Study B — decision-rich sampling

**Preregistered 2026-08-24, before any Study B discovery spend.**
**A NEW study, not a rerun.** Maintainer B Acquisition A is closed at 2 clean DECISION against a threshold of
3, primary generation study not run, no exception granted. Nothing here revisits that result.

**Ceiling: $4–5. Cumulative spend at preregistration: $13.96 of $25.**

---

## 1. The new hypothesis, which is not the inverse of the old error

Acquisition A selected PRs by **highest count of substantive line comments** and recovered mostly
debugging and demonstration practice. The tempting inversion is *fewer comments means sharper
architectural decisions*. **That does not follow and is explicitly rejected as a selector.** Low-comment
PRs may equally be trivial approvals, obvious fixes, low engagement, or decisions taken elsewhere.

Replacing one bad proxy with its inverse is not a design.

> **H_B: selecting evidence by DECISION CONTENT, rather than by any proxy for engagement volume,
> materially improves recovery of contextual decision rules.**

The selector targets the thing we want directly.

---

## 2. INCLUSION CRITERION, frozen verbatim

A PR is eligible for Study B only if it contains at least one Maintainer B comment where:

> **He explicitly chooses among at least two plausible implementations, scopes, abstractions or
> behaviours, AND gives a reason why one is preferable in this context.**

Three components, all required:

```
implementation alternatives present
        +
context-dependent choice
        +
stated reason for the choice
        =
decision-rich evidence
```

**Eligible in shape:**
- *"I considered putting this in X, but because Y changes independently, this belongs in Z."*
- *"I would not generalize this yet; we only have one actual use case."*
- *"This behaviour is worth preserving here because changing it would break X, but I wouldn't carry
  that compatibility into Y."*

**Not eligible:**
- *"Can you add a minimal reproduction?"*
- *"Please add the expected diagnostic."*
- *"This branch is failing."*
- *"Thanks, merged."*

The shapes above fix what the criterion means. **They are not shown to discovery and may not seed it.**

---

## 3. Fresh material only

The pool is A-side eligible PRs **untouched by every prior study**: not in Phase −1, not in
Acquisition A's corpus, not among the 14 comments read during the semantic screen.

| | count |
|---|---|
| A-side eligible | 103 |
| touched by a prior study | 33 |
| **fresh pool** | **70** |

Set B (Jul–Aug 2026, minus the 7 contaminated Phase −1 PRs) remains **unfetched and unread** and is
not involved in Study B. Study B is an acquisition study; its held-out is discovery's own internal
split within the sampled corpus.

---

## 4. Sampling and size, frozen

From the fresh pool, PRs are screened by hand against §2. A keyword pass may **surface** candidates for
reading; it may not **decide** eligibility. Every inclusion is a human judgment against the criterion
and is recorded with the quoted comment that satisfied it.

**Target: 12 documents.** If fewer than 12 fresh PRs satisfy the criterion, the study runs at whatever
number qualifies and that number is reported, because falling short is itself the measurement.

Selected IDs are hashed and published **before discovery is fired**.

---

## 5. Discovery settings, unchanged from Acquisition A

Same models, same defaults, decision-site representation via the pinned `diff_hunk` for line comments
so no outcome can leak. `--max-calls` sized from the corpus before firing. Cap $5.

Nothing about discovery is tuned. The only variable is the selector.

---

## 6. Continuation gate, frozen, and the kill rule

The four criteria are unchanged: an actual engineering choice rather than a way of describing one; a
non-trivial `appliesWhen`; an identifiable opposite or withholding condition; evidence anchored to
code and maintainer behaviour rather than conversational form.

```
>= 3 usable contextual DECISION candidates
    -> Atelier can recover engineering judgment when the evidence contains it.
       A generation study becomes discussable, separately budgeted, not automatic.

<  3
    -> STOP public-proxy acquisition entirely.
       DO NOT search for another GitHub maintainer.
```

**Why the kill rule bites here.** In Study B the evidence has been *directly selected* for containing
explicit engineering judgment with stated reasons. Failing to recover three contextual decision rules
from deliberately decision-rich material would be **a genuine negative against acquisition itself**,
not another selector problem. That is worth knowing and it is the reason to run this rather than
another variation.

No prompt tuning. No reframing. No rerun to improve the count. The rule binds hardest when a plausible
story exists for why the number should have been better.

---

## 7. What no outcome licenses

Maintainer B has not been contacted and has ratified nothing. Public behaviour is source evidence only;
any adoption is `USER_ADOPTED`, never `EXPERT_RATIFIED`. One expert, one repository, one domain, and a
hand-screen performed by the agent running the study and therefore contestable.

**A pass licenses a conversation about a generation study. It does not license a claim about the moat,
and no claim tier moves either way.**
