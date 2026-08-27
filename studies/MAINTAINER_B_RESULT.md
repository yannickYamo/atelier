# Result — proxy expert 2, Maintainer B on repository B

> **Anonymised for publication.** Both maintainers studied here are real people who were never
> contacted and have ratified nothing. Their review comments are public; the characterisation of
> their judgment in these documents is ours and not theirs, so they are identified as Maintainer A
> and Maintainer B and their projects as repository A and repository B. The paper uses the same
> convention. Nothing else in this record has been altered.

**Date:** 2026-08-24. **Seal:** `308cb700`, frozen before spend. **Spend:** $2.733, under the ~$5 cap.
**Cumulative:** $13.96 of $25. **$11.04 remains.**

**OUTCOME: 2 clean DECISION candidates. Gate was ≥3. Mechanical routing is STOP.**

> **FOUNDER RULING, 2026-08-24: NO EXCEPTION GRANTED. The gate stands.**
>
> ```
> MAINTAINER B ACQUISITION A
> 2 clean DECISION candidates
> threshold = 3
> -> PRIMARY GENERATION STUDY NOT RUN
> ```
>
> Changing the sampling rule because a plausible explanation exists for missing the threshold would
> turn a preregistered gate into a suggestion. STOP means **this acquisition run is finished and its
> boundary study does not proceed**. It does not mean stop investigating Atelier. Any continuation is
> a NEW prospectively preregistered study with a new hypothesis, never a rerun of this one.
>
> **The remaining budget may not be spent trying to make this gate pass. That it failed is part of the
> evidence.**

**But I introduced a selection confound and it is reported here rather than acted on.**

---

## 1. The run

12 documents, ~9,399 tokens, one subsystem of repository B only, decision-site representation via
pinned `diff_hunk` so no outcome could leak. 10 candidates, 10 survived validation, **9 of 10
recurring in held-out** — the highest recurrence of any run in the programme.

The semantic screen passed at 79% before firing, and the structural signal was strong: 237 of 278
substantive comments line-level, against Maintainer A's 8 of 86.

---

## 2. Classification against the four frozen criteria

| id | abbreviated | verdict |
|---|---|---|
| p6 | **polices PR scope, judging changes against what this PR is meant to do and deferring related concerns to the follow-up where they belong** | **DECISION** |
| p7 | **connects a newly found problem to prior encounters, signalling a shared systemic fix rather than a local patch** | **DECISION** |
| p8 | shows both the working case and the semantically equivalent failing case to demonstrate the inconsistency | MIXED — the stated behaviour is *showing*, not deciding |
| p1 | constructs a minimal runnable snippet rather than arguing abstractly | METHOD |
| p2 | annotates snippets with the exact expected diagnostic | METHOD |
| p3 | credits the tool or colleague that surfaced a finding | VOICE |
| p4 | admits prior mistakes before making the next request | VOICE |
| p5 | hedges speculative judgments rather than issuing directives | VOICE |
| p9 | phrases directives as questions | VOICE |
| p10 | pins down the exact branch or version where a behaviour holds | METHOD |

**Count: 2.**

Both are real. p7 carries a genuine architectural boundary — pattern seen once, patch locally; pattern
recurring across contexts, fix systemically. p6 carries a scope boundary — in scope, judge it; out of
scope, defer it. Two is not a boundary study.

**p8 was not promoted, for consistency.** The same call was made against Maintainer A's p5 and p8,
where the stated behaviour was *justifying* rather than deciding. Promoting p8 here would reach 3 and
flip the routing, which is precisely why it must be judged by the same standard as when it did not.

---

## 3. THE CONFOUND, AND IT IS MINE

Phase −1 produced **4 of 9** clean DECISION rules from 8 documents of Maintainer B's reviews. This run
produced **2 of 10** from 12 documents of the same reviewer in a narrower, better-screened domain. The
better-designed run did worse.

The difference is my selection rule. I picked the 12 PRs by **highest count of substantive line-level
comments**, on the reasoning that more comments means more decisions.

**That is probably backwards.** A PR where Maintainer B left eight line comments is likely a detailed
debugging pass, and debugging passes generate rules about *how to demonstrate a bug* — construct a
minimal snippet, annotate the expected diagnostic, pin the branch. Four of the ten recovered rules are
exactly that shape. A PR where they left two substantive comments may be the one containing the sharp
architectural call.

Phase −1 sampled without that filter and found the generalize-only-on-real-evidence rule and the
complexity-must-be-paid-for rule, neither of which appears here.

**Comment volume is a proxy for engagement depth, not for decision density.** That is a third
acquisition-instrument lesson, alongside decision-site visibility and evaluative-versus-narrative
judgment.

---

## 4. Why I am not rerunning

The seal says: *no prompt tuning, no reframing, no rerun to improve the count.* Rebuilding the corpus
with a different selection rule is a rerun to improve the count, whatever its justification. The rule
exists so that a disappointing result cannot be re-rolled, and it binds hardest exactly when I have a
plausible story for why the number should have been better.

The gate reads STOP. Whether the confound justifies an exception is a founder decision, not mine, and
it is recorded here so it can be made with the reasoning visible.

---

## 5. What the three acquisitions together establish

| corpus | representation | clean DECISION |
|---|---|---|
| Maintainer A / repository A, conversation only | 0.33 code sites per doc | 0 of 8 |
| Maintainer A / repository A, decision-site enriched | 1.00 | 1 of 9 |
| Maintainer B / repository B, Phase −1, unfiltered sample | 1.00 | **4 of 9** |
| Maintainer B / repository B, filtered by comment volume | 1.00 | 2 of 10 |

Decision-site visibility is necessary and not sufficient. The expert must evaluate implementations
rather than narrate outcomes. **And the sampling rule within an evaluative expert's history changes
the answer by a factor of two**, which no protocol so far accounted for.

**Across four acquisition runs, recovered candidate types tracked the dominant evidence available in
the corpus.** That is what four samples support. The stronger phrasing this document first carried —
*"recovered the dimension the evidence exposed and no other"* — is too absolute from four samples and
is withdrawn.

---

## 6. State

Set B for Maintainer B (128 candidates, Jul–Aug 2026, minus 7 Phase −1 PRs removed as contaminated)
was never fetched and stays unread. Maintainer A's Set B likewise. No generation pass has been run.
No claim tier moves.

$11.04 remains.
