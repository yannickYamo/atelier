# Milestone 2 — participating-expert pricing study. Design of record.

**Status 2026-08-25: sealed, pre-generation.** Nothing has been generated. This document exists so the
design can be read before any result exists, which is the only order in which a design can be judged.

---

## 1. The question

> From 30 situation-to-judgment examples, can Atelier discover and compile a frozen behavioural
> standard that **prospectively** reproduces an expert's pricing decisions and conditional boundaries
> on cases sealed before discovery — with higher context-level reliability than the bare model, than
> automated retrieval over the same corpus, and than **the expert's own selection of four precedents**?

Domain: early-stage B2B pricing under incomplete evidence. Five decisions: `HOLD`, `CHANGE`, `TERMS`,
`DECLINE`, `DEFER`. The `DEFER` and `DECLINE` cases matter most — they are genuine decisions that
produce no action, and a corpus normally lacks them.

## 2. What is sealed, and when

| artefact | seal | sealed before |
|---|---|---|
| corpus-A, 30 cases | `af3ecd05eb86becc` | discovery |
| **set-B, 20 cases, PRIMARY** | `10369fbedf68d382` | **discovery** |
| provenance declaration | `08dd50be207e4508` | discovery |
| StandardVersion, 9 REQUIRED | `cde2ac38261f0819` | applicability |
| applicability grid, 200 cells | `3b3a908c…` | any generation |
| set-C, 19 cases, DIAGNOSTIC | `68304755295f4e02` | any generation |
| E_topk retrieval policy | `655b0d3598698089` | reading any held-out context |

## 3. Provenance, declared not inferred

**`aiAssisted: true`.** The judgment is the expert's; the articulation is model-assisted. Some cases
are anonymised renderings of situations they judged; others were constructed to their specification
because real material was insufficient in volume.

**Consequences that travel with every number.** No claim that the corpus is naturally-occurring work.
**No expressive or stylistic finding is admissible** — the prose is not the expert's, so a recovered
rule about form would describe the rendering model. Recovery rates are an **upper bound**: every file
has a visible situation, judgment and reason in a uniform shape, and real work is lumpy.

## 4. Ratification, by the expert whose judgment is under test

18 candidates → **8 rejected, 2 rewritten, 1 narrowed, 7 adopted**, then one merge. Survivors: 9, all
`REQUIRED`, all compiling to PROSE under ENFORCE.

The rejections are the informative half. **Five were rendering artefacts** — rules about prose style
that the provenance declaration voids. **Two were scope artefacts** — behaviour imposed by the task
boundary rather than held as judgment, a class no prior study caught. One was rejected as too absolute.

**p12 was merged into p6 by a test specified before the grid was filled:** their applicability was
identical across all 20 sealed cases, so Set B cannot establish them as separately observable. Retired
with no model output in existence.

## 5. The endpoint, and why the previous one is dead

Prior studies scored adherence as *no requirement violated*. Over conditional rules a scorer marks an
unfired rule N/A, and an N/A cannot be violated, so **silence bought a perfect score**: 138 outputs,
3 violations, every arm at 100%, including a base model that won 3 of 46 contexts.

The fix moves **who decides applicability**. The expert sealed `APPLIES`/`DOES_NOT_APPLY` per context
before any output existed. The scorer is never asked whether a rule applied.

```
PASS(x) = D(x) ∧ ⋀_{r ∈ A(x)} S_r ∧ ⋀_{r ∉ A(x)} ¬F_r
```

correct decision, every applicable requirement satisfied, no inapplicable requirement falsely invoked.
Implemented in `core/fidelity/conditional-fidelity.ts` with 24 polarity fixtures, including the exact
silent output the old endpoint scored perfect and this one fails.

**Reported alongside, never instead of:** decision accuracy · applicable-rule satisfaction ·
false-application rate · boundary discipline (HOLD/DECLINE/DEFER) · action discipline (CHANGE/TERMS) ·
per-rule performance · run-to-run reliability. So one correct CHANGE cannot masquerade as two
independent successes.

## 6. Arms

| arm | evidence | human at inference |
|---|---|---|
| **A** | none | no |
| **E_topk** | 4 corpus cases, frozen TF-IDF | no |
| **E_oracle** | 4 corpus cases, **expert-selected** | **yes** |
| **S** | compiled 9-rule SkillVersion `d91ddd7000db833a` | no |

**E_topk is a floor for automated retrieval, not a ceiling.** TF-IDF was chosen over embeddings
deliberately: an embedding retriever is stronger but comes with a vendor, a dimension count and a
version — three knobs that could be turned if the arm underperformed. A classical retriever has none.

**E_oracle is expert-selected precedent under a fixed four-example budget. It is NOT "perfect
retrieval"** — the expert can select badly, and that is a property of the comparator. Its interpretation
was corrected during design: a human choosing the right precedents **has already done the contextual
judgment**, so `S ≈ E_oracle` means the compiled standard matches a system requiring the expert at
every inference. That is close to the product claim, not a deflation of it.

**Token budgets are matched between the evidence arms at four cases and are NOT equalised against S**
(~924 against ~1,752 tokens). Counts are reported rather than artificially matched, because
compression and representation are part of the treatment.

## 7. B is the experiment. C is instrumentation.

**Set B** was sealed before discovery and can support *did the compiled standard generalise to unseen
situations*. **Set C** was constructed after the standard was frozen, to exercise p3, p9 and p14, which
had 2, 2 and **1** applicable cases in B. It answers *when deliberately confronted with this boundary,
can the system execute it* and **can never be evidence of natural generalization.**

`assertNotPooled` throws if anything tries to analyse them together.

**A pre-generation amendment to C:** cross-tabulating side against expected decision showed p14's
positives all expected CHANGE and its negatives none, so a skill mapping *thin margin → override*
would pass all six without holding the rule. One negative was added that **also expects CHANGE**, for
observed willingness-to-pay with positive contribution. False application is now detectable. **p3
remains separable by decision alone and that weakness travels with its number.**

## 8. The unit is the context

Three generations of one context are not three observations. Per context and arm,
`R = passes / 3 ∈ {0, ⅓, ⅔, 1}`; arms are compared on paired context-level differences. **The 20 B
cases contain 17 independent clusters**, and inference respects `clusterId` rather than claiming n=20.
Cluster-aware intervals and context-by-context outcomes are reported ahead of any p-value.

## 9. Predeclared comparisons and the interpretation matrix

**Primary: S vs E_oracle on sealed B.** Secondary: S vs E_topk. Baseline: S vs A. Diagnostic:
E_oracle vs E_topk, which says whether the corpus holds precedents lexical retrieval cannot find.

| outcome | reading |
|---|---|
| S > E_oracle > E_topk > A | strong compiler result |
| S ≈ E_oracle > E_topk > A | compilation preserves expert-selected evidence |
| E_oracle > S > E_topk > A | acquisition found signal, compilation loses case-level information |
| E_oracle ≈ E_topk > S | retrieval suffices, compiler adds little |
| S > E_oracle ≈ E_topk ≈ A | rules encode something examples do not transmit |
| all ≈ A | little transferable signal, or the model already holds the policy |
| all poor / all excellent | task, evaluator or holdout not discriminating |

## 10. Failure protocol, fixed in advance

**If S loses, this StandardVersion is not repaired and B is not rerun.** The failure is recorded, B is
inspected to separate acquisition miss from compilation miss from evaluator miss, and the next version
is validated on a **new** sealed B2. That is how the claim gets earned rather than optimised into.

## 11. What a positive result would and would not license

**Would:** that from 30 situation-to-judgment examples Atelier discovered and compiled a frozen
standard which prospectively reproduced the expert's decisions and conditional boundaries on sealed
cases, at higher context-level reliability than the bare model and the retrieval comparators, without
seeing or tuning against those cases.

**Would not:** anything expressive or stylistic (provenance-voided) · that the corpus was natural work ·
external validity, since the expert built the system · anything from C about natural generalization ·
p3's false-application behaviour, which C cannot test.
