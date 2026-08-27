# M3a — Rule-set dilution / interference. PREREGISTRATION

**Sealed 2026-08-25, before any generation.** Estimand corrected per founder ruling: this is a
**dilution** study. It is **not** a gating study, makes no router claim, and validates nothing about
Atelier's moat.

## 0. The estimand, stated once

> Does adding irrelevant conditional provisions reduce a model's ability to correctly determine
> whether a **named target provision** applies to a set of facts?

## 1. Data, frozen

| | |
|---|---|
| source | `nguha/legalbench`, config `sara_entailment`, split `test` |
| licence | **CC BY-4.0** (permits commercial use with attribution) |
| frozen file | `SARA_TEST_FROZEN.json`, in a private working tree, hash below |
| **sha256** | `9901e05f968edcd21f8f9ba2188fdfbe691e94f55fcb9e5016d73f2a072f718e` |
| unique cases | **272** |
| labels | **136 Entailment / 136 Contradiction**, exactly balanced |
| distinct provision texts | **132** |
| top-level sections | 9 — `s3306` 60, `s1` 58, `s63` 42, `s152` 40, `s2` 31, `s151` 16, `s68` 13, `s7703` 10, `s3301` 2 |

## 2. Arms

Every arm contains the **true target provision**. Distractors are drawn from the 132-provision pool.

| arm | k | distractors | cases |
|---|---|---|---|
| `k1` | 1 | none | 272 |
| `k5_FAR` | 5 | 4, from other top-level sections | 272 |
| `k12_FAR` | 12 | 11, from other top-level sections | 272 |
| `k24_FAR` | 24 | 23, from other top-level sections | 272 |
| `k12_NEAR` *(secondary)* | 12 | 11, from the **same** top-level section | 231 |

**Sampling.** `random.Random(f"{seed}|{case_id}|{k}|{N|F}")`, seed `20260825`, `sample` without
replacement. Provision order shuffled with an independent seeded stream so target position is
randomised. Frozen and reproducible from the file above.

**Why `k12_NEAR` exists.** Far distractors are trivially unrelated, so a null on the FAR ladder would
not distinguish *"dilution does not happen"* from *"easy distractors do not interfere"*. NEAR is the
harder condition. It is capped at k=12 on the five large sections because the pools do not support
k=24 NEAR (`s151` 8, `s68` 7, `s7703` 5, `s3301` 1 distinct provisions). **Secondary and exploratory.**

## 3. Runtime binding

| | |
|---|---|
| model | `claude-sonnet-4-5-20250929` |
| temperature | **0** |
| max_tokens | 8 |
| repetitions | **1 per cell.** At temperature 0 within-case variance is near zero, and power comes from 272 cases rather than from repetitions. A separate determinism re-run of `k1` and `k24_FAR` is reported as an instrument check and **never pooled into the primary** |
| prompt | `INSTR.txt` + `PROVISIONS / SITUATION / STATEMENT` blocks. Sample at `SAMPLE_PROMPT_k24.txt` |
| parsing | first word, case-insensitive, exact match to `Entailment` / `Contradiction`. Unparseable counts as **incorrect** (fail closed) and the rate is reported separately so any reader can recompute |

## 4. Endpoints, frozen

- **Primary.** Restraint = accuracy on the 136 `Contradiction` cases, as a function of k.
- **Required co-endpoint.** Coverage = accuracy on the 136 `Entailment` cases, as a function of k.
- **Guardrail.** Overall accuracy.
- **Trend.** Paired exact McNemar `k1` vs `k24_FAR` on the Contradiction cases is the confirmatory
  test. Monotonicity across k∈{1,5,12,24} is reported descriptively.
- **Unit.** The case. Every case appears in every arm, so all comparisons are paired.

## 5. Power, stated before the run

Simulated, paired McNemar, n=136, α=0.05 two-sided:

| true Δ | 0.03 | 0.05 | 0.07 | 0.10 | 0.15 | 0.20 |
|---|---|---|---|---|---|---|
| power | 0.15 | 0.39 | 0.63 | **0.88** | 0.99 | 1.00 |

**This design resolves Δ ≥ 0.10. A null means "no effect larger than about 0.10", not "no effect".**
M2's component effects were 0.13–0.24, so the study is sized for effects of that magnitude and blind
to anything under 0.05. The `k12_NEAR` cell reaches 0.81 power at Δ=0.10 and is labelled secondary
for that reason.

## 6. Interpretation, fixed in advance

| result | reading |
|---|---|
| restraint falls with k, coverage roughly preserved | dilution contributes false-positive pressure. The M2 restraint loss becomes less mysterious |
| both fall with k | generic context interference, not specific to applicability |
| no dose response on FAR, effect on NEAR | interference requires *confusable* rules, not merely more of them |
| no dose response anywhere | **dilution unsupported at Δ ≥ 0.10.** A routing architecture motivated by "too many rules" loses this support |

## 7. The limit that bounds every reading

**SARA names the target provision in the question** ("Section 7703(a)(2) applies to Alice for the year
2018"). The model can locate the target by string match. M2's pricing task named nothing: the model
received nine rules and had to decide which fired.

So SARA tests interference **under trivially easy target identification**, which is the *easier*
regime. Inference is therefore asymmetric and must be reported as such:

- a **positive** result is strong — interference survives even when retrieval is trivial;
- a **null** is weak evidence for M2 — it does not rule out dilution where identification is hard.

No result here licenses a claim about executable gating, about a router, or about Atelier.

## 8. Cost

1,319 calls. 3.72 chars/token measured against the live counting endpoint.

| | calls | est. input tokens | est. cost |
|---|---|---|---|
| primary ladder (`k1`,`k5`,`k12`,`k24` FAR) | 1,088 | ~615K | **$1.93** |
| `k12_NEAR` secondary | 231 | ~136K | **$0.41** |
| determinism re-run (`k1`,`k24`) | 544 | ~350K | $1.10 |
| **total** | **1,863** | | **≈ $3.44**, hard cap $10 |

---

## AMENDMENT 1 — instrument replaced. 2026-08-25, after a failed run, before any analysis.

**What failed.** The run of 1,319 calls under §3 as sealed returned **100% UNPARSEABLE**. Every
response hit `max_tokens: 8` mid-preamble; `out_tok` was exactly 8 on all 1,319. The model ignored
the prose instruction "Answer with exactly one word" and began reasoning:

```text
366×  "Looking at this problem, I need to"
181×  "Let me analyze this step by step."
148×  "Let me analyze whether Section 3306"
```

No verdict was produced anywhere, so **no result was obtained and none was analysed.** Cost $2.56.

**Cause.** Mine. A prose instruction was used as an output constraint, and it did not constrain.

**Fix.** The answer is now extracted with a **forced tool call**, `tool_choice: {type: 'tool', name:
'emit_answer'}`, schema `{answer: enum['Entailment','Contradiction']}`, `max_tokens: 64`. This is the
`OUTPUT_CONTRACT` carrier rather than the `PROSE` carrier.

**Pilot, 40 cases per arm, before committing to a re-run.**

| arm | n | accuracy | unparseable | mean out tokens |
|---|---|---|---|---|
| `k1` | 40 | 0.900 | 0 | 34.9 |
| `k24_FAR` | 40 | 0.775 | 0 | 35.0 |

Parseability 100%, accuracy well above chance, and headroom in both directions. Pilot cost $0.37. The
pilot is stateless at temperature 0 and its cases are recomputed in the full run, so it contaminates
nothing.

**What did NOT change.** The estimand, the dataset and its hash, the frozen prompts and their hash,
the arms, the distractor seeds, the endpoints, the power analysis, and the interpretation table. Only
the answer-extraction mechanism changed.

**What was dropped.** The determinism re-run, to stay inside budget after the wasted spend.

**Recorded as a finding in its own right.** An experiment about whether rule *structure* survives
where rule *prose* does not, failed at the first attempt because a prose instruction failed to
constrain an output that a schema then constrained perfectly. That is a live instance of the
`OUTPUT_CONTRACT` argument, obtained by accident and at my expense.
