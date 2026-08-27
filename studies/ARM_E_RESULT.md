# Result — Arm E. Distilled standard against raw examples in context

> **`INVALID_FOR_PRIMARY_ESTIMAND`, 2026-08-24.** The arms were rewarded for different behaviours: arm
> E passed the one discriminating check by reproducing corpus headings **verbatim 30/30**, arm S by
> paraphrasing **0/30 verbatim, 29/30 passes**. Scoring those with the same binary and reporting a tie
> is an instrument failure, and the primary instrument had no sensitivity to expert-level semantic
> correctness. **The headline tie is withdrawn.** The S_draft vs S_req comparison inside is
> uncontaminated by copying — neither arm copied — but speaks only to format adherence, not decisions.
> Superseded by `ATELIER_CONTEXTUAL_GENERALIZATION_PREREGISTRATION_v1.md`.

**Date:** 2026-08-24
**Pre-registration:** `ATELIER_ARM_E_PREREGISTRATION_v1.md`, sha1 `6830bce1462bd0fa5f26ccb18006f4f8445671bf`
(amended before any generation call; the pre-amendment seal was `ecdfef02`).
**Corpus:** `d9a1bbc1455ed254`, five explainers, ~1,247 tokens.
**Fired:** 120 of 240 cells. Sonnet 4.5 complete in all four arms across 30 topics. **Opus not run.**
**Cost:** $4.709.

---

## 1. Headline, and it is a negative

**Raw examples in context matched the compiled ratified standard.** Paired over 30 topics on eight
deterministic checks, arm E was better on 9 topics, arm S_req on 5, tied on 16. **p = 0.42.**

The corpus records the honest status as *"compilation demonstrated; behavioural superiority over raw
examples not established"*. **This run does not change that.** It is now measured rather than
unmeasured, and it measured no difference.

**What the run did establish, and it was not predicted:** the compiled standard only works once a
human ratifies it. The unratified draft that `atelier create` emits loses decisively to raw examples
(21 topics to 2, **p = 0.0001**), and ratification alone closes the entire gap (17 to 5, **p = 0.017**).

---

## 2. The table

Sonnet 4.5, 30 topics, all four arms complete. Counts of 30.

| check | what it tests | A | E | S_draft | S_req |
|---|---|---|---|---|---|
| V1 | three-part scaffold, in order | 0 | **30** | 11 | **29** |
| V2 | dismissive tag in first 60 words | 0 | **30** | 27 | 24 |
| V3 | no sentence over 45 words | 0 | 29 | 30 | 29 |
| O1 | no concluding summary | 28 | 30 | 30 | 30 |
| O2 | no transition opening a section | 30 | 30 | 30 | 30 |
| O3 | at most one hedge | 17 | 30 | 30 | 29 |
| X1 | no named discoverers | 22 | 29 | 27 | 29 |
| X2 | no percentages or bare large numbers | 5 | 20 | 19 | 22 |
| | **positive family** | 0% | 99% | 76% | 91% |
| | **standard-stated omissions** | 83% | 100% | 100% | 99% |
| | **corpus-present, standard-absent** | 45% | 82% | 77% | 85% |
| | mean hedges per cell | 1.6 | 0.2 | 0.2 | 0.2 |
| | mean output chars | 4176 | 1505 | 1447 | 1741 |

---

## 3. Predictions, scored

| | prediction | outcome |
|---|---|---|
| **P1** | positive checks: E ≈ S, both ≫ A | **HELD on the second half, decisively.** Both beat A 30–0, p < 10⁻⁹. E is not equal but slightly ahead of S_req |
| **P2** | standard-stated omissions: S > E | **NOT SUPPORTED, and the test had no power.** E 100%, S_draft 100%, S_req 99%. Ceiling for every carrier |
| **P3** | corpus-present / standard-absent: E > S | **NOT SUPPORTED.** E 82%, S_req 85%. No separation |
| **P4** | the S−E gap narrows on the stronger tier | **NOT RUN.** See §6 |
| **P5** | S_req > S_draft on stated omissions | **NOT SUPPORTED, no power.** Both at ceiling. But S_req > S_draft overall, p = 0.017, on a different family |
| **P6** | S_draft ≈ E on stated omissions | trivially true at ceiling, uninformative |

**Every omission prediction failed, and the reason is that the omission checks did not discriminate.**
O1 and O2 were near-ceiling even for the bare control. O3 and X2 had real power against the control
and every carrier fixed them equally. The axis I predicted would separate distillation from
demonstration separates nothing here.

**Only V1 discriminated between carriers, and it discriminated on the BINDING axis, not the
distillation axis.**

---

## 4. The finding that is actually here

`S_draft` and `S_req` contain the same twelve statements, recovered by the same discovery run, in the
same words. Nothing was reworded, dropped or added. They differ in two fields, `authority` and
`materiality`, and therefore in carrier:

| | authority | materiality | carrier | scaffold check V1 |
|---|---|---|---|---|
| S_draft | `DERIVED_UNRATIFIED` | null | EXAMPLE, OBSERVE | **11 / 30** |
| S_req | `EXPERT_RATIFIED` | `REQUIRED` | PROSE, ENFORCE | **29 / 30** |

Paired, S_req wins V1 on 18 topics and loses on 0. **p < 0.0001.**

The draft loses because the compiler is honest about it. Every EXAMPLE file it emits carries:

> This is NOT required. It is how the author works. An output that does otherwise is not wrong;
> reach for this when it fits, and do not force it.

That is correct behaviour. Nobody ratified those rules, so nothing should bind. **And it has a
measured cost of 18 of 30 paired wins on the one check that discriminated.**

So the defensible claim from this run is not *the compiled standard beats examples*. It is:

> **Human ratification is load-bearing rather than ceremonial. The same twelve sentences, shown as
> unconfirmed observation, produce the scaffold 11 times in 30; the same twelve marked as the author's
> own requirements produce it 29 times in 30. Discovery alone does not get you a working skill.**

That is a harder claim to imitate than the one the design set out to test, and it is the one the
product architecture is actually built around.

---

## 5. One small confirmation of an existing design belief

V2 checks for a verbatim formula, *everything else is X*. Arm E beat S_req on it, 6 paired wins to 0,
p = 0.031 uncorrected and the only check on which E separated from S_req at all.

`core/architecture/compile.ts` already argues this in its own comment: *"For form, showing beats
telling: a paragraph describing cadence is a worse carrier of cadence than one instance of it."* A rule
saying *add a short dismissive tag* reproduces a specific phrase less reliably than five instances of
the phrase. One check, uncorrected, on one corpus. It is consistent with the design and it is not
evidence for it.

---

## 6. What was not run, and why

The Opus tier fired 30 control cells and 19 arm-E cells, then the OpenRouter key hit its **$10 total
account limit** and returned 403 on every subsequent call. Job order was model, then arm, then topic,
so both Atelier arms were never reached.

The first reading of the error distribution was that failures were concentrated in the arms carrying
Atelier content, which would have been a systematic confound. **That reading was wrong.** The cause is
a hard account cap plus job ordering, confirmed by re-issuing one cell per arm and receiving the same
403 on all three, arm E included.

**P4 is not tested.** `G2S_CAMPAIGN_1A_SEALED_DESIGN_v2.md` §7b predicts arm E gets stronger as the
model gets stronger, which makes the stronger tier the harder and more durable test. This result comes
from the friendlier tier, and per the sealed stopping rule no cell was resampled.

---

## 7. Scope, stated plainly

**The corpus is ~1,247 tokens.** The manifest framed this comparison as *a distilled standard vs 39K
tokens of raw examples*. At 1.2K tokens the whole corpus fits trivially in attention and costs almost
nothing to paste, so **this run tests the carrier question at the size where arm E is strongest.** The
compression argument has no room to operate and no compression claim may be made from it, in either
direction.

Two size facts, both measured: the draft package is ~1,926 tokens against a ~1,247-token corpus, so an
unratified compile EXPANDS. The ratified package is ~972 tokens, so a ratified compile compresses. Any
document claiming distillation always compresses is wrong.

**Other limits.** One tier. One corpus, authored by the agent running this. Eight deterministic checks
derived from that corpus's own standard, frozen before firing and polarity-tested in both directions
(40/40 on the corpus itself, and all eight fire on text built to violate them, after one instrument
error was found and narrowed: a capitalised-word-plus-verb pattern fired on *"the Atlantic showed"*).
No model judged anything. This measures rule adherence and says nothing about whether the notes are
good.

---

## 8. What this licenses and forbids

**Licenses.** Both carriers beat the bare control overwhelmingly and identically. Saying the corpus
teaches something that survives to unseen topics is supported. Saying that ratification converts a
non-binding draft into a working skill is supported, at p = 0.017 overall and p < 0.0001 on the check
that discriminated.

**Forbids.** Any claim that the compiled standard outperforms the expert's raw examples. On this
corpus at this size it did not, and the honest sentence is that arm E ties arm S_req. That sentence
belongs in the paper's limitations and in §6, not buried.

**No claim tier moves.** The locked ledger is unchanged.

---

## 9. What a replication should change

Run it on a corpus large enough that pasting it is not free. The design's own 39K figure is the right
order and this corpus is 30× below it. That is the single variable most likely to change the answer,
and it is the one this run could not vary.

Then run the stronger tier, since arm E is expected to gain from it and the result should be reported
per tier rather than pooled.
