# M3a — Rule-set dilution. RESULTS

**2026-08-25.** Preregistered `PREREG_M3A.md` sha256 `8bcaee5d…` (Amendment 1 included), sealed before
generation. Data `9901e05f…`, prompts `026d0b51…`. 1,319 calls, 0 failures, 0 unparseable.
`claude-sonnet-4-5-20250929`, temperature 0. **Total spend $8.65** including a failed first run.

## 1. The primary endpoint confirms. The mechanism does not.

| arm | n | restraint | coverage | overall | Youden J |
|---|---|---|---|---|---|
| `k1` | 272 | **0.934** | 0.691 | 0.812 | **0.625** |
| `k5_FAR` | 272 | 0.853 | 0.669 | 0.761 | 0.522 |
| `k12_FAR` | 272 | 0.882 | 0.640 | 0.761 | 0.522 |
| `k24_FAR` | 272 | **0.831** | 0.625 | 0.728 | **0.456** |
| `k12_NEAR` | 231 | 0.888 | 0.574 | 0.732 | 0.462 |

**Confirmatory test, preregistered.** Restraint, `k1` vs `k24_FAR`, paired exact McNemar on the 136
Contradiction cases: 18 vs 4 discordant, **p = 0.0043**, Δ = **+0.103** [+0.039, +0.171].

Adding 23 irrelevant provisions costs about ten points of restraint. The effect sits right at the
threshold the design was sized for (Δ ≥ 0.10 at 88% power), so it is real and it is not large.

## 2. The finding that matters, and it was not in either preregistered branch

**Dilution does not push the model toward over-application. It degrades discrimination.**

| | `k1` | `k5` | `k12` | `k24` |
|---|---|---|---|---|
| P(model says "Entailment") | 0.379 | 0.408 | 0.379 | 0.397 |
| Youden J (bias-free discrimination) | 0.625 | 0.522 | 0.522 | 0.456 |

Response bias is **flat**. Discrimination falls monotonically: ΔJ = **+0.169** [+0.058, +0.283].

Both endpoints move the **same** direction. Restraint −0.103 (CI excludes zero) and coverage −0.066
(CI **includes** zero, [−0.024, +0.162]). The model does not start firing rules more often. It simply
gets worse at telling applicable from inapplicable, in both directions at once.

### Why that breaks the bridge to M2

M2's compiled-standard arm moved the two endpoints in **opposite** directions:

```text
M2 pricing        coverage +0.127     restraint −0.235      OPPOSITE directions
M3a SARA          coverage −0.066     restraint −0.103      SAME direction
```

**On what M2 does and does not establish.** M2's opposite-direction movement is a *descriptive
signature consistent with increased firing*. It is not a demonstration of a response-bias mechanism.
The restraint component was 1 of 12 tests, did not survive correction, and the M2 close record already
labels it a mechanism hypothesis rather than a finding. No bias analysis of the M2 arms exists.

What can be said is narrower and still useful. The two studies show **different endpoint patterns**.
In M3a the pattern is a measured discrimination loss with flat response bias. In M2 the pattern is
descriptively consistent with more firing, and its mechanism is unestablished. **M3a therefore does not
reproduce M2's signature**, and rule-load interference is not a sufficient explanation for what
happened in pricing.

**Architectural consequence.** A fix motivated by "too many rules in context" addresses the effect M3a
measured. Whether it addresses M2 is unknown, because M2's mechanism is unknown and its endpoint
pattern differs. That fix should not be built on this result.

## 3. The secondary moderator is null

`k12_FAR` vs `k12_NEAR` on the same 231 cases, same-section distractors against unrelated ones:

| | FAR | NEAR | p |
|---|---|---|---|
| restraint | 0.888 | 0.888 | 1.000 |
| coverage | 0.617 | 0.574 | 0.511 |

**No evidence of moderation was detected.** Restraint was identical to three decimal places, and the
coverage difference did not approach significance. This is a failure to detect moderation, not a
demonstration that confusability is irrelevant: the cell has ~116 Contradiction cases and resolves
Δ ≈ 0.10 at 0.81 power, so a moderation effect smaller than that would not have been seen. What can be
said is that the interference measured here tracks rule **count**, and that no count-independent
contribution from confusability was detectable at this sample size. This cell was my own addition to
the design, and it returned nothing.

## 4. Everything else, reported

**Monotonicity.** Coverage is monotonic in k (0.691 · 0.669 · 0.640 · 0.625). Restraint is **not**
(0.934 · 0.853 · 0.882 · 0.831); `k5` sits below `k12`. Preregistered as descriptive only. The
endpoint contrast is sound; the intermediate ladder is noisy.

**Position.** Target position within the provision list, `k24_FAR`, by quartile: 0.753 · 0.662 ·
0.765 · 0.743. No systematic position effect.

**Base asymmetry.** Even at `k1` the model is far better at restraint (0.934) than coverage (0.691).
It is conservative on this task by default, which is the opposite of M2's compiled skill.

**Adjudication status, stated plainly.**

- **The restraint primary PASSED.** Δ = +0.103, paired exact McNemar p = 0.0043, preregistered as the
  confirmatory test.
- **The coverage noninferiority co-condition is FORMALLY UNADJUDICATED.** §4 required coverage to be
  "noninferior within a margin frozen before the run" and **the margin was omitted from the
  preregistration.** Without a pre-specified margin there is no defined pass or fail, and choosing one
  after seeing −0.066 [−0.024, +0.162] would be exactly the flexibility a preregistration exists to
  remove. The co-endpoint is therefore reported as an estimate with its interval and **no verdict**.

Because the co-condition is unadjudicated, the preregistered conjunctive success criterion as a whole
is **not satisfied**. The primary result stands on its own terms; the conjunction does not.

## 5. What this licenses, and what it does not

**Supported.** Increasing the number of simultaneously supplied conditional provisions measurably
degrades a model's ability to judge whether a named target provision applies. Δ restraint ≈ 0.10 at
k=24 versus k=1, and the degradation is a loss of discrimination rather than a shift toward
over-application.

**Not supported.** That this explains M2. The signatures differ.

**Not tested at all.** Executable gating, routing, activation inference, or anything about Atelier.
SARA names the target provision in the question, so the model can locate it by string match. This is
interference under trivially easy identification, which is the easier regime. M2 named nothing.

**The asymmetry stands as preregistered.** A positive result here is strong because interference
survives even when retrieval is trivial. Had it been null, that would have said little about M2.

## 6. Where this leaves the programme

The dilution hypothesis (H3a) is **supported as a real effect and rejected as an explanation for M2.**
That is a more useful outcome than either branch anticipated: it removes a plausible-sounding
architectural fix from consideration before anyone built it.

What remains is H3b, the activation hypothesis, and this study says nothing about it. Testing it needs
a dataset with a rule pool, a gold active set that is **not named in the question**, and a mechanically
checkable answer. `sara_entailment` is not that dataset, which is what the preflight established.

## 7. Reproduction

The frozen inputs are listed with their hashes. The files themselves live in a private working tree
and are not part of this repository; the hashes are here so that a regenerated copy can be checked
against what was actually run.

```text
# CC BY-4.0 data, seeded distractors, frozen prompts
SARA_TEST_FROZEN.json    9901e05f968edcd21f8f9ba2188fdfbe691e94f55fcb9e5016d73f2a072f718e
PROMPTS_FROZEN.jsonl     026d0b51777257d09a8dbadd949aa8a959e81c159c7a9c634d4a4912750ed910
run.mjs                  claude-sonnet-4-5-20250929, temp 0, forced tool call
analyze.py               the preregistered analysis, verbatim
RESULTS_V2.jsonl         1,319 rows
RESULTS.jsonl            the failed first run, kept as evidence
```
