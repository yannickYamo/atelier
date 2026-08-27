# Result — Maintainer A expressive standard, end to end

**Date:** 2026-08-25. **Spend:** $4.572 generation. **Cumulative $20.84 of $25.**
**StandardVersion** `e25be51b4aa46f59` · **SkillVersion** `753eca49c4cefedb` · package `2df3ef85994ab198`
**17 held-out PRs**, merged after the target model's training cutoff, sealed before discovery.
Blind scoring by the surrogate, arm-stripped, balanced rotation, ordering seed withheld.

---

## 1. Headline, at the strength the design supports

**On blind preference relative to the ratified standard, the compiled skill won 16 of 17 contexts,
raw examples won 0, the bare control won 0, one tie. p < 0.0001 against each.**

**And the preregistered PRIMARY endpoint was uninformative.** It has to be reported that way.

---

## 2. The primary endpoint failed, and the flaw is one we had already caught once

Complete adherence was defined as *no requirement VIOLATED*. Results:

| arm | COMPLETE | BEST | MET total |
|---|---|---|---|
| A, base model | **17/17** | 0 | 17 |
| E, raw examples | 15/17 | 0 | 17 |
| S, compiled | **17/17** | **16** | **44** |

**74% of all verdicts were N/A**, because five of six rules are conditional. A rule that is N/A cannot
be violated, so **an output that engages with nothing scores a perfect COMPLETE.** Arm A did exactly
that: 17 of 17 on the primary while demonstrating 17 rule instances against S's 44 and winning no
preference at all.

This is the same defect the founder caught in the contextual-generalization design, where
false-application rate alone would have been won by a model that never applies the behaviour. **The
correction was made there and I rebuilt the identical flaw here under a different name.** A
completeness endpoint measured as the absence of violations rewards silence.

**Any future adherence endpoint must require demonstrated engagement, not merely absent violation.**

---

## 3. What the discriminating measure says, and what it is worth

BEST was preregistered as **secondary**. It is where the effect is, and it may not be promoted to
primary after the fact.

**S 16 · E 0 · A 0 · TIE 1.** Exact binomial p < 0.0001 against both comparators.

**The length confound is controlled and dead.** Arm A is the *longest* output (2,585 chars mean
against S's 2,446 and E's 1,336) and won zero. Structural markers — bullets, headings, code fences —
are indistinguishable across arms. S did not win by looking more elaborate.

**But BEST and MET are one signal, not two.** BEST matched the unique most-MET output in 14 of 16
decided contexts. Reporting them as independent corroboration would be double-counting.

**Per-rule engagement, rep 1, of 17 contexts:**

| arm | p1 | p2 | p3 | **p5** | p6 | **p8** |
|---|---|---|---|---|---|---|
| A | 0 | 0 | 4 | 1 | 12 | 0 |
| E | 0 | 0 | 6 | 1 | 10 | 0 |
| S | 0 | 2 | **16** | **9** | **17** | 0 |

p5 and p8 are the two BINDING rules, compiled to PROSE under ENFORCE. **p5 fired in 9 of 17 contexts
for S against 1 for each comparator.** That is the sharpest single number here: the rule that was
made binding is the rule that separated.

---

## 4. Two of six rules were never exercised, and one of them is binding

**p1 and p8 scored zero MET across all 51 outputs.** Both were N/A everywhere. The scorer recorded why:
applicability was judged conservatively, and a condition asserted only inside a candidate output was
not treated as evidence the condition held.

"Half-exercised" is loose and the sharper statement is about the binding layer:

| | exercised | not |
|---|---|---|
| all rules | 4 of 6 (p2, p3, p5, p6) | p1, p8 |
| **BINDING rules** | **1 of 2** (p5) | **p8** |

**Half of the binding layer was never tested**, and the untested half is the rule the surrogate
singled out as *"a genuine epistemic requirement, not merely voice."* The result rests on p3, p5, p6.

---

## 5. Reference, unsealed after scoring, revising nothing

Maintainer A's actual held-out comments: **median 341 characters.** One in full: *"Thanks, this is a good
catch."*

Every arm wrote long substantive reviews — 1,336 to 2,585 characters. **None of them resembles what
the maintainer actually did on most of these pull requests.**

That is not a compilation failure. Set A was built from PRs where he engaged substantively, so the
standard describes his substantive-engagement behaviour, and on held-out PRs he mostly acknowledges
briefly. **The acquisition selection determined what the standard is about — for the fifth time in
this programme.**

---

## 6. What this licenses, exactly

**Supported:** a real public human corpus yielded an evidence-backed expressive standard; a surrogate
authority ratified it with genuine rejections, rejecting two of eight and rewriting two more; the
compiled Atelier skill reproduced that explicit standard on unseen contexts, and did so **more than
the same model given the raw examples the standard was inferred from**, on a blind preference measure
with the length confound controlled.

**Not supported, and must not be claimed:** Maintainer A's true internal standard. External human
ratification. Contextual engineering-decision superiority. Complete-adherence superiority — that
endpoint did not discriminate. Anything about p1 or p8, which were never exercised. And nothing about
reliability across repetitions: reps 2 and 3 were generated and **not scored**, so within-context
consistency remains unmeasured.

**No claim tier moves.** This is one corpus, one surrogate, one model, 17 contexts, and its
significant result sits on a secondary endpoint because the primary was built wrong.

---

## 7. Cost, as a measured product fact

Arm E carries 33,961 tokens of raw corpus per invocation. Arm S carries 1,894. **The compiled standard
is 18× smaller than the evidence it was compiled from, and it won.** At scale that is the economics
argument, and it is measured here rather than asserted.
