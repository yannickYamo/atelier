# Result — decision-site intervention on the sealed Maintainer A corpus

**Date:** 2026-08-24. **Frozen protocol:** Amendment 3 (sha256 `b7326dd3`), frozen before firing.
**Spend:** $4.700. **Cumulative study spend:** $11.23 of $25.

**OUTCOME: THRESHOLD NOT MET. Routing is STOP.**

---

## 1. What was held fixed and what changed

Same sealed PR IDs (`e08df728feb61d7c`), same temporal split, same models, same settings. **Only the
document representation changed**, and it was additionally **size-matched** so the intervention is not
confounded with corpus volume.

| | conversation-only | decision-site enriched |
|---|---|---|
| corpus | ~21,819 tok | ~27,925 tok |
| documents carrying code under judgment | 8 sections across 24 docs | **24 / 24** |
| decision-site density | 0.33 per doc | **1.00 per doc** |
| candidates | 8, all anchored, 7/8 recurring | 9, all anchored, 7/9 recurring |

**No outcome leak.** For each Maintainer A comment at time `t`, the code shown is the diff as of the last
commit at or before `t`. PR 1442 is the clearest case: he commented at 16:19:41, the last prior commit
is 16:17:54, and a further commit landed at 16:21:09 — 88 seconds later, almost certainly the response
to his feedback. That commit is excluded by the rule.

---

## 2. Classification against the four frozen criteria

A clean DECISION candidate requires **all four**: an actual engineering choice rather than a way of
describing one; a non-trivial `appliesWhen`; an identifiable opposite or withholding condition;
evidence anchored to code and maintainer behaviour rather than conversational form.

| id | statement, abbreviated | verdict |
|---|---|---|
| p7 | **keeps defaults unchanged when confidence in strict equivalence is lacking, deferring rather than forcing the decision now** | **DECISION** on criteria 1–3; criterion 4 arguable, span is a comment not code |
| p5 | justifies accepting or rejecting scope by reference to the roadmap, admitting when it reverses a prior plan | MIXED — the choice is real (core vs plugin) but the stated behaviour is *justifying* |
| p8 | when declining a follow-on change, justifies with concrete numbers rather than preference | MIXED — the behaviour is *justifying*, not declining |
| p1 | names CI failure as infrastructure so the contributor does not self-blame | VOICE |
| p2 | narrates the decision process aloud including rejected options | VOICE |
| p3 | thanks contributors calling out specific strengths | VOICE |
| p4 | admits uncertainty plainly rather than projecting authority | VOICE |
| p6 | backs cost claims with concrete numbers | VOICE |
| p9 | marks decisions provisional, stating the condition that would change them | VOICE |

**Clean DECISION count: 1.** Threshold was ≥3 with ≥2 recurring in held-out.

Per the frozen routing, there is no third path: **stop Maintainer A as the engineering proxy, preserve the
voice result untouched, move to a line-review-heavy maintainer.** No prompt tuning, no reframing, no
further rerun to improve the count.

---

## 3. The finding, and it refines H rather than confirming it

**H as frozen:** decision-site visibility in the acquisition document materially affects recovery of
decision rules.

**Result: weak support, and an important qualification.** Tripling decision-site density moved clean
DECISION recovery from **0 to 1** and produced the sharpest conditional rule in either run (p7 carries
a real withholding condition: change the default when equivalence is verified, keep it when it is not).
It did not flip the corpus to decision-dominant.

**Why, and this is the part worth carrying forward.**

Showing the code did not change *what Maintainer A said about it*. His engagement on his own repository
announces and explains merges; it does not critique implementations line by line. 78 thread comments
against 8 line comments. The decision site was made visible, and the judgment expressed beside it was
still mostly meta-commentary about the decision rather than an evaluation of the code.

> **Decision-site visibility is necessary and not sufficient. The expert's expressed judgment must
> itself be about the code.**

That distinguishes the two corpora better than density does. `maintainer-b` on `ruff` critiques
implementations in the comment itself and yielded 4 of 9 decision rules from 8 documents. Maintainer A on
`llm` explains merges and yielded 1 of 9 from 24.

**Consequence for recruitment, and it replaces the earlier criterion.** "Has substantial review
history" is the wrong screen. The screen is **does this person evaluate implementations in their
comments, or announce outcomes about them.** That is checkable in minutes from public history and it
would have redirected this study before it cost $11.

---

## 4. What is preserved unchanged

The conversation-only run remains a **valid expressive-taste result** and is not reinterpreted:
8 candidates, 8 of 8 anchored, 7 of 8 recurring in held-out, six clear voice and form behaviours,
zero clean engineering-decision rules.

Taken together the two Maintainer A runs and Phase −1 support a claim neither was designed to test:
**Atelier follows the evidence it is given rather than imposing a fixed frame.** Conversational corpus
returned voice; code-critique corpus returned decisions; the same corpus enriched with code returned
slightly more decision-shaped rules and still mostly voice, because the expert's own words stayed
conversational.

---

## 5. What this does NOT establish

Nothing about Maintainer A, who was never contacted and has ratified nothing. Nothing about carrier
comparison, arms, or the moat question, none of which was reached. n = 1 expert per representation,
one repository, one classification performed by the agent running the study and therefore contestable.

**The primary contextual-generalization study has not been run.** No claim tier moves.

---

## 6. State and the open decision

Spent $11.23 of $25. **$13.77 remains.**

Set B (17 PRs, `8df235e6520fe7b4`) was never fetched and stays sealed and unused. It can be reused if
Maintainer A is ever revisited for an expressive-taste generalization study.

The founder's decision is whether to spend the remainder on a line-review-heavy maintainer selected by
the sharpened screen in §3, or to stop the engineering-proxy line here and bank the two results.
