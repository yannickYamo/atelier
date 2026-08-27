# Maintainer A expressive study — CLOSED

**Date:** 2026-08-25. **Total spend $20.84 of $25.** Three repetitions, blind, same frozen rubric.
**StandardVersion** `e25be51b4aa46f59` · **SkillVersion** `753eca49c4cefedb` · package `2df3ef85994ab198`

**No further Maintainer A work. No new PRs, no standard changes, no retrofitted p8 cases, no repaired
endpoint rerun on the same held-out set, no other maintainer.**

---

## 1. The result held across repetitions

| | rep 1 | rep 2 | rep 3 | pooled |
|---|---|---|---|---|
| **BEST** | S 16 · E 0 · A 0 · T 1 | S 12 · E 0 · A 2 · T 0 | S 13 · E 0 · A 1 · T 1 | **S 41 · E 0 · A 3 · T 2** |
| n | 17 | 14 | 15 | 46 |
| S share | 94% | 86% | 87% | **89%** |
| MET total | S 44 · E 17 · A 17 | S 23 · E 4 · A 8 | S 34 · E 4 · A 5 | |
| **p5 (BINDING)** | S 9 · E 1 · A 1 | S 3 · E 0 · A 1 | S 7 · E 2 · A 0 | **S 19 · E 3 · A 2** |

**STATISTICAL CORRECTION, and the first figure published here was wrong.** A pooled binomial over 46
observations was reported. **The 46 are not independent**: repetitions are nested inside 17 contexts,
and the independent unit is the context. That is this programme's own standing doctrine and it was
violated in its own headline.

**Context-level analysis, n = 17 contexts:**

| | |
|---|---|
| S majority winner | **15 of 17** |
| A majority winner | 1 |
| TIE | 1 |
| **E majority winner** | **0** |
| paired sign test S vs E | **p = 6.1×10⁻⁵** |
| paired sign test S vs A | p = 0.0005 |
| cluster bootstrap over contexts, S win rate | **0.88, 95% CI [0.71, 1.00]** |

That CI is the honest width of a 17-context study and it is what should be quoted. The 10⁻¹³ figure is
withdrawn.

**And the more informative statement is not a p-value at all:** across the 14 contexts evaluated in
all three repetitions, S was BEST in **all three generations in 12 of 14**, and **raw examples were
never BEST in any generation of any context.**

**Arm E won zero of forty-six scored contexts.** Not one, in any repetition. The same model given
33,961 tokens of the raw evidence the standard was inferred from never once produced the output judged
closest to that standard.

Repetition 1 was not a fluke, which was the question this stage existed to answer.

---

## 2. Within-context reliability

Of the 14 contexts scored in all three repetitions:

| S wins | contexts |
|---|---|
| **3 of 3** | **12** |
| 1 of 3 | 2 (PRs 1604, 1620) |

**86% of contexts are unanimous across independent generations.** The two exceptions are contexts
where every arm engaged thinly — the MET counts there are low for all three — so they read as contexts
that failed to activate the standard rather than as instability in the skill.

MET totals fall in the later repetitions (S 44 → 23 → 34) while the ranking holds. Generation
variance moves how much gets demonstrated; it does not move which arm demonstrates most.

---

## 3. The primary endpoint failed three times

**Repetitions 2 and 3 contain zero VIOLATED verdicts across 87 outputs.** COMPLETE was therefore
**100% for every arm**, including the base model that won 3 of 46 contexts.

Across all three repetitions: **138 scored outputs, 3 violations total.**

The defect is now demonstrated rather than argued. Defining complete adherence as the absence of
violations, over a standard whose rules are conditional, measures whether an output avoided situations
in which it could be penalised. **It rewards non-engagement.** The record keeps this as a negative and
it is not repaired retroactively.

The correction for any future study: **a context succeeds only when every applicable requirement is
demonstrated AND no requirement is falsely applied where it does not belong.** Applicability must be
sealed before generation, by the expert, per context.

---

## 4. Coverage — the binding layer is half-untested, definitively

Requirement engagement across all three repetitions, 138 outputs:

| p1 | p2 | p3 | **p5** | p6 | **p8** |
|---|---|---|---|---|---|
| **0** | 5 | 61 | **24** | 66 | **0** |

**p1 and p8 were never exercised once in 138 outputs.** p8 is one of the two binding rules and the one
the surrogate singled out as *"a genuine epistemic requirement, not merely voice."*

By binding rules the coverage is **1 of 2**. The standard as tested is effectively p3, p5 and p6.

---

## 5. Economics, measured

| arm | context per invocation |
|---|---|
| E, raw examples | **33,961 tokens** |
| S, compiled standard | **1,894 tokens** |

**18× less context, and it won 41–0.**

---

## 6. The final Maintainer A claim, and it does not grow

> Atelier converted an evidence-backed, surrogate-adopted expressive standard from real public human
> work into a compact executable skill. On unseen post-cutoff contexts, that skill strongly and
> repeatably outperformed the same model given either no standard or the raw source examples in blind
> preference, while using about 18× less context.

**Limitations, attached permanently:**

Authority is **surrogate**, not the source author, who was never contacted and ratified nothing. The
preregistered primary endpoint was non-discriminating and its failure is part of the record. One of
two binding rules was never exercised. The significant effect sits on a **secondary** endpoint that is
largely the same signal as the MET count, not independent corroboration of it. One corpus, one
surrogate, one model, 46 scored contexts.

And the standard describes **how this maintainer writes when he substantively reviews**, not when he
decides substantive review is warranted — his real held-out median is 341 characters, and no arm
resembles that. See `ATELIER_ENGAGEMENT_GATE_FINDING_v1.md`.

**THE p5 MECHANISM CLAIM IS DOWNGRADED, and by more than "surrogate adopted and surrogate scored."**
The surrogate **rewrote p5** during ratification and then **judged adherence to its own rewrite.** p5
carries essentially the whole requirement-level mechanism story (19 · 3 · 2). Blind arms protect the
*comparative* result from direct favouritism; they do not make the *construct* independent of its
judge.

So the ordering of evidential strength is the reverse of how it first read:

| claim | strength |
|---|---|
| S produces outputs closer to the adopted standard than A or raw evidence, repeatably | **strong** |
| ENFORCE carrier caused the p5 behaviour | **suggestive mechanism only** — no carrier ablation, and the construct was authored by the judge |

**No claim tier moves.**

---

## 7. What changed for the programme

Before this study, the honest position was that the architecture was compelling and the behavioural
moat had never been demonstrated end to end. That is no longer the position.

The chain now runs whole and it had never run before:

```
real public human work → discovery → surrogate ratification (6 adopted, 2 rejected)
  → immutable StandardVersion → compilation → real served skill
  → unseen post-cutoff contexts → blind judgment → S 41 · E 0 · A 3
```

**The narrow mechanism has its first serious behavioural evidence.** The broader expert-reproduction
moat remains unproven, and the next study is the confirmatory one with real authority, sealed
applicability, all load-bearing rules exercised, and the engagement decision represented.
