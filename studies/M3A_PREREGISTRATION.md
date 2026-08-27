# M3a — rule-set-size dose-response · PREREGISTRATION (frozen, pre-generation)

**Hypothesis, generated prospectively by the closed M2 pricing null:** increasing the number of
simultaneously supplied conditional rules creates interference that reduces correct restraint.

Not a moat test. Not a router validation. No arm is "gated". This is a dose-response experiment on
rule-set size, run on public data, reproducible by anyone.

## 1. Dataset — frozen

`nguha/legalbench`, config `sara_entailment`, split `test`, revision `daec8237410aa23e3faf4bc41ad8b3a7e1696826`
(lastModified 2026-03-30). CC BY 4.0.

**272 cases · 136 Entailment · 136 Contradiction · 136 `_pos` / 136 `_neg` case ids.**
9 top-level IRC sections: 1, 2, 63, 68, 151, 152, 3301, 3306, 7703.
Raw pull sha256 `266219335cdc8f8e` · frozen artifact sha256 `56cfa9050df4b7f5`.

**The 272 vs historical 256/120 discrepancy is resolved, not waved at.** LegalBench holds
`sara_entailment` 4 train + 272 test = 276 and `sara_numeric` 4 + 96 = 100. **276 + 100 = 376**, which
is exactly the row count of the original `jhu-clsp/SARA` release. The historical 256/120 is SARA's own
split across *both* subtasks; LegalBench re-split each subtask as 4 few-shot + remainder. Nothing is
missing. **We use the 272 actually executed.**

**Why this dataset fits the construct.** Every question has the form *"Section X applies to Alice for
year Y."* So **Entailment = the provision does apply (coverage)** and **Contradiction = it does not
(restraint)** — the same two quantities M2 measured, with ground truth supplied and no human scorer.

## 2. Arms — nested dose

Target provision is the one LegalBench supplies for the case. Distractors drawn from an immutable
132-provision pool built from the same artifact (each pool entry is a distinct (identifier, text) pair;
zero identifier collisions).

| arm | provisions |
|---|---|
| **K1** | target only |
| **K5** | target + 4 distractors |
| **K12** | target + 11 distractors |
| **K24** | target + 23 distractors |

- Distractors exclude the target's exact text **and every provision sharing its top-level section**, so
  they are genuinely irrelevant to the named target.
- **Nested by construction:** one ordered draw of 23 per case; K5 takes the first 4, K12 the first 11,
  K24 all 23. `K5 ⊂ K12 ⊂ K24` is asserted per case, not assumed.
- Distractor seed `30250824`; target-position seed `77010325`, separate and frozen. Target position is
  randomized within each rule set (observed K24 positions span all 24 slots; target-first counts are
  balanced across labels: K24 7 Entailment / 7 Contradiction).
- Asserted per case per arm: block length == K, target present exactly once, no duplicate provisions.
  **All assertions pass for 272 × 4.**

## 3. A confound found pre-generation and corrected

**272/272 questions name an explicit section identifier, but only 45/272 provision texts contain their
own.** The rest open as bare `(2)`, `(1)`, `(B)`, `(f)`. Supplying 24 unlabelled fragments and asking
about "Section 3306(c)(2)" would have measured **retrieval under ambiguity, not rule interference**,
and would have manufactured a large effect meaning something other than the hypothesis.

**Correction:** every provision in every arm is prefixed with the exact section identifier its own
question names. This is what "keep statutory identifiers intact" requires — the source statute carries
them; the LegalBench field had stripped them. Applied uniformly to target and distractors in all four
arms, so it cannot advantage any arm.

## 4. Generation

`claude-opus-5` · **`thinking: disabled`** · **`temperature: 0`** · `max_tokens: 32` · one generation
per case per arm · **1,088 calls**.

- **Thinking disabled is load-bearing here.** The arms differ precisely in prompt size, and adaptive
  thinking engages differently by prompt size — it would be a per-arm confound, the exact one M2
  controlled for.
- **Temperature 0** because with one generation per case, sampling noise adds variance to the paired
  contrast and buys nothing; the estimand is the causal effect of K, not stochasticity. It also makes
  the run reproducible by any reader, which is the point of a public study.
- All four arms of a case fire together, so provider drift hits arms equally rather than in a fixed
  order.
- **Provider/runtime retries are operational, never independent observations**, and are counted.
- `stop_reason == max_tokens` is an **error**, not a datum (the M2 truncation lesson).

Identical instruction in every arm; only the provision block differs.

## 5. Readout — deterministic, no model judge

Required response is exactly `FINAL: ENTAILMENT` or `FINAL: CONTRADICTION`. Structural parser, last
`FINAL:` wins. **Polarity-tested pre-generation: 14/14**, including negated prose ("The answer is NOT
entailment" → None), bare verdict without the marker → None, `FINAL: UNKNOWN` → None, and
self-correction (two markers → last one). Unparseable is recorded as such and never silently coerced.

## 6. Endpoints — frozen

**PRIMARY: Contradiction accuracy, K1 vs K24.** `Δrestraint = acc(K24) − acc(K1)`, hypothesized < 0.
Case is the independent unit; paired case-level difference; paired bootstrap 95% CI resampling cases;
exact McNemar on discordant pairs. **No pooled call-level p-value is headlined.**

**CO-ENDPOINT: Entailment accuracy (coverage), noninferiority margin −0.05 for K24 vs K1.**

**Dose response** K1/K5/K12/K24 reported for Contradiction, Entailment and overall accuracy as
mechanism evidence. **The inferential contrast stays frozen at K1 vs K24** — intermediate K values are
not four separate primary tests, and twelve p-values will not be generated and fished.

## 7. Preregistered interpretation

| outcome | condition | reading |
|---|---|---|
| **A** | Contradiction accuracy materially worsens K1→K24 **and** Entailment noninferior within −5pp | restraint-specific dilution supported. Simultaneous irrelevant rules create false-positive applicability pressure; M2's all-rules delivery has a plausible general interference mechanism. **Does not prove a router is the fix.** |
| **B** | both worsen materially | generic context interference; does not isolate restraint |
| **C** | K24 ≈ K1 on both | dilution unsupported as an explanation for M2. **Do not build a router on this evidence.** |
| **D** | K24 improves | dilution hypothesis falsified. Report and close. |

## 8. Cost gate

1,088 calls · 2,642,656 input chars total (K1 mean 833 / K24 mean 4,707).

| tokenizer assumption | input | output cap (32 tok × 1,088) | total |
|---|---|---|---|
| expected 4.0 ch/tok | $3.30 | $0.87 | **$4.17** |
| conservative 3.2 | $4.13 | $0.87 | **$5.00** |
| paranoid 2.8 | $4.72 | $0.87 | **$5.59** |

**Absolute worst case $5.59 against a $10 hard cap.** `max_tokens` was cut 200 → 32 specifically so the
cap holds by arithmetic rather than by assumption. A live budget guard hard-stops the runner at $10.
No sample reduction is needed, so the full 272 with exact 136/136 balance is executed.

## 9. Stop condition

After M3a is run and written up, **the public mechanism-study line is closed.** No CUAD, no other
LegalBench task, no other public dataset, no repair of a null, no redesign of M3a from its own result.

## 10. Limitations, stated before the result

Benchmark familiarity is a limitation and may attenuate the treatment effect; no perturbation arm in
v1 by design. Distractors are cross-section and therefore easy negatives — this makes the test
conservative for outcome A. Statutory reasoning is not pricing judgment; a positive result is evidence
about rule-set size in general, not about the pricing standard specifically.
