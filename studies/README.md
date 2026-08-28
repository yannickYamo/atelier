# Preregistrations and study records

Every study this project has run that bears on a claim in the paper, including the ones that failed
and the one whose headline figure was withdrawn. Preregistrations were sealed before generation and
are published as sealed, not as they would read with hindsight.

**What is here is the design and the analysis. What is not here is the corpora.** The raw work of the
maintainers studied, the pricing cases, and the scored outputs live in a private tree and are not
published. So the method is checkable and most of the numbers are not recomputable from this
repository alone. That distinction is the honest boundary of "public" for this work, and
[MEASUREMENTS.md](../MEASUREMENTS.md) draws the same line for figures quoted in source comments.

## Anonymisation

Two studies use the public review comments of real maintainers. **Neither person was contacted and
neither has ratified anything.** Their comments are public; the characterisation of their judgment in
these records is ours, not theirs. They appear as **Maintainer A** and **Maintainer B**, their
projects as **repository A** and **repository B**, and the paper uses the same convention. Nothing
else in these records has been altered, and no result depends on the identities.

## The studies

### The one reproducible study

| | |
|---|---|
| [CARRIER_ABLATION_PREREGISTRATION.md](CARRIER_ABLATION_PREREGISTRATION.md) | Judge-free carrier ablation. Run it: `npm run ablation:carrier`. Measures structural conformance mechanically across three arms; its own header states which arms are conformant by construction and what a passing verdict does not mean. |

### Compilation against baselines

| | |
|---|---|
| [M2_PRICING_STUDY_DESIGN.md](M2_PRICING_STUDY_DESIGN.md) | The sealed design for the pricing study. |
| [M2_PRICING_STUDY_CLOSE.md](M2_PRICING_STUDY_CLOSE.md) | **The null.** A compiled standard scored exactly what a bare model scored, 17 clusters, sign-flip permutation. Not repaired, not rerun, per the preregistered failure protocol. The components are not null and they oppose each other: compilation improved coverage and destroyed restraint. |
| [MAINTAINER_A_STUDY_CLOSE.md](MAINTAINER_A_STUDY_CLOSE.md) | **The positive result, and a withdrawn figure.** 15 of 17 held-out contexts. The first published p-value pooled 46 nested observations as independent; it is withdrawn and replaced by a context-level analysis. Read §"statistical correction" before quoting anything here. |
| [MAINTAINER_A_ENDTOEND_RESULT.md](MAINTAINER_A_ENDTOEND_RESULT.md) | The end-to-end run behind that close. |

### What discovery can and cannot recover

| | |
|---|---|
| [ACQUISITION_STUDY_B_PREREGISTRATION.md](ACQUISITION_STUDY_B_PREREGISTRATION.md) · [RESULT](ACQUISITION_STUDY_B_RESULT.md) | Which work yields decision rules. Review conversation returned 0 clean rules of 8; implementation critique returned 4 of 9. |
| [MAINTAINER_B_RESULT.md](MAINTAINER_B_RESULT.md) | **A gate that failed and was not excepted.** 2 clean candidates against a threshold of 3, so the generation study did not run. Contains a selection confound the author introduced, reported rather than acted on. |
| [DECISION_SITE_INTERVENTION_RESULT.md](DECISION_SITE_INTERVENTION_RESULT.md) | Making decision sites visible in the evidence. |
| [DOMAIN_FAMILY_PROBE_PREREGISTRATION.md](DOMAIN_FAMILY_PROBE_PREREGISTRATION.md) · [RESULT](DOMAIN_FAMILY_PROBE_RESULT.md) | Whether findings hold across domain families. |
| [ARM_E_PREREGISTRATION.md](ARM_E_PREREGISTRATION.md) · [RESULT](ARM_E_RESULT.md) | The expert-selected-examples arm. |
| [CONTEXTUAL_GENERALIZATION_PREREGISTRATION.md](CONTEXTUAL_GENERALIZATION_PREREGISTRATION.md) | Generalization to unseen contexts. |

### Does a compiled skill beat the bare model?

| | |
|---|---|
| [CONTRACT_LIFT_PREREGISTRATION.md](CONTRACT_LIFT_PREREGISTRATION.md) | Sealed before any context was generated. 24 contexts x 3 generations x 2 arms, endpoints and stopping rules fixed in advance, one amendment recorded before the freeze. |
| [CONTRACT_LIFT_CLOSE.md](CONTRACT_LIFT_CLOSE.md) | **Coverage figures WITHDRAWN — see the negative-branch close.** **The M2 result reproduced on a different standard, task family and model.** Primary null (Δ = −0.021), and its components oppose: coverage +0.167, restraint −0.208. The bare model was perfect on restraint and the compiled skill broke it. More regressions than recoveries. The model reader abstains 29% of the time and is systematically permissive — 17 false passes, zero false fails — which is why it certifies nothing. |
| [CONTRACT_LIFT_SUITE.json](CONTRACT_LIFT_SUITE.json) · [RESULTS](CONTRACT_LIFT_RESULTS.json) | The frozen contexts and the per-generation structural labels. Reproducible from these. |

### Can static prose carry a conditional rule?

| | |
|---|---|
| [NEGATIVE_BRANCH_PREREGISTRATION.md](NEGATIVE_BRANCH_PREREGISTRATION.md) | Sealed before any context existed. The contract-lift study compiled a conditional rule that said when to apply and never what to do otherwise, so it tested a one-sided rendering rather than static prose as such. Three arms — BARE, STATIC, EXPLICIT — on 16 fresh contexts, with the success condition and the failure shape to watch for both stated in advance. |
| [NEGATIVE_BRANCH_CLOSE.md](NEGATIVE_BRANCH_CLOSE.md) | **The primary passed: stating the otherwise-branch fully restored restraint** (0.708 → 1.000, Δ +0.292, CI [+0.083, +0.500], three recoveries and no regressions), for a one-sentence renderer change and no applicability engine. It also found the defect that **withdraws every coverage figure in both studies**: generations truncated by the thinking budget before an answer was written. Restraint outputs were never truncated, so those findings stand. |
| [P6_OBSERVER_PROBE.md](P6_OBSERVER_PROBE.md) | **Run before building a suite, and it found something better than it was looking for.** No structural detector reaches the 0.60 majority baseline on a clean human key; a frozen model judge reaches kappa **0.257**. But the disagreements are not noise: two careful readers and the author disagree about which sentences a rule the author ratified actually covers. **Ratifying a STATEMENT is not agreeing on its EXTENSION** — the machine's paraphrase kept a frequent realization (brevity) and dropped the invariant. Cost: two labelling sessions and $0.11, against a sealed suite and several hundred generations. |

### Why the obvious repair was not built

| | |
|---|---|
| [M3A_PREREGISTRATION.md](M3A_PREREGISTRATION.md) · [RESULT](M3A_RESULT.md) | The rule-load hypothesis. |
| [M3A_DILUTION_PREREG.md](M3A_DILUTION_PREREG.md) · [RESULTS](M3A_DILUTION_RESULTS.md) | **A supported effect that still did not license the fix.** Adding 23 irrelevant provisions costs ~10 points of restraint, preregistered McNemar p = 0.0043. But it degrades discrimination with flat response bias, where the pricing study showed the opposite endpoint pattern, so rule-load does not explain that null. A plausible architectural fix was removed from consideration before anyone built it. Its co-endpoint is reported **unadjudicated**, because the margin was omitted from the preregistration and picking one afterwards is the flexibility a preregistration exists to remove. |

## How to read these

Three things recur and are worth knowing before quoting any figure.

**Withdrawn numbers stay in the record.** Where a figure was wrong it is marked withdrawn next to
what replaced it, rather than being quietly corrected. The pooled binomial in the Maintainer A close
is the clearest case.

**A preregistered gate that fails is not renegotiated.** The Maintainer B run missed its threshold
with a plausible excuse available, and the excuse was recorded instead of used.

**An unadjudicated endpoint is not a passed one.** M3a's primary passed and its co-condition had no
frozen margin, so the conjunction is reported as not satisfied even though the headline held.
