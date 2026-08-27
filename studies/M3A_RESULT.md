# M3a — rule-set-size dose-response · RESULT · CLOSED

**The dilution hypothesis is not supported, and the observed effect runs in the opposite direction.**

Preregistration `ATELIER_M3A_PREREGISTRATION_v1.md` (sha256 `a2154312557ca9b9`), frozen before
generation. Frozen design artifact sha256 `56cfa9050df4b7f5`; merged results sha256 `430609fd75a791d0`.
Data and code live in a private working tree and are not part of this repository.

## 1. Executed

`nguha/legalbench` · `sara_entailment` · `test` · revision `daec8237410aa23e3faf4bc41ad8b3a7e1696826` ·
CC BY 4.0 · **272 cases, 136 Entailment / 136 Contradiction.**
`claude-opus-5`, `thinking: disabled`, one generation per case per arm, **1,088 cells, zero missing,
zero truncated, zero unparseable.** Deterministic parser, no model judge. **Total spend $7.865 against
a $10 cap.**

**`temperature` could not be set — the API rejects it as deprecated for this model** (`400:
"temperature is deprecated for this model"`). The run therefore used default sampling, not the
temperature 0 named in the preregistration. This is non-differential across arms and does not
advantage any arm; it is recorded rather than hidden.

## 2. Result

| arm | Contradiction accuracy (**restraint**) | Entailment accuracy (**coverage**) | overall |
|---|---|---|---|
| **K1** | **0.956** | **0.949** | 0.952 |
| K5 | 0.949 | 0.949 | 0.949 |
| K12 | 0.919 | 0.882 | 0.901 |
| **K24** | **0.934** | **0.875** | 0.904 |

**PRIMARY — Contradiction accuracy, K1 vs K24 (frozen contrast):**
`Δrestraint = −0.0221`, paired bootstrap 95% CI **[−0.0735, +0.0221]**, McNemar discordant 7 vs 4,
exact **p = 0.549**. **Null.**

**CO-ENDPOINT — Entailment accuracy, noninferiority margin −0.05:**
`Δcoverage = −0.0735`, paired bootstrap 95% CI **[−0.1324, −0.0147]**, McNemar discordant 13 vs 3,
exact **p = 0.021**. **Noninferiority FAILS** (CI lower bound −0.132 < −0.05).

## 2b. CORRECTION 2026-08-25 — the construct holds for only half the cases

**§1 of the preregistration asserts every question has the form "Section X applies to Alice for year Y."
That is wrong. It is 131 of 272 (48%).** The other 141 are numeric or relational claims ("Alice's total
exemption for 2015 under section 151(a) is equal to $4000", "has to pay $24543 in taxes", "bears a
relationship to"). For those, Entailment/Contradiction is about whether a stated amount or relation is
correct, **not** about whether a provision applies. The restraint/coverage mapping is therefore exact
for 131 cases and loose for 141.

Re-run on the clean applicability subset, which is the only subset that is actually a restraint test:

| subset | restraint Δ (K1→K24) | coverage Δ (K1→K24) |
|---|---|---|
| all 272 (as reported in §2) | −0.022, McNemar 7v4, p 0.55 | −0.074, 13v3, **p 0.021** |
| **applicability only (131)** | **0.000**, McNemar 4v4, **p 1.00** | **−0.031**, 4v2, **p 0.69** |
| numeric/relational (141) | −0.044, 3v0, p 0.25 | −0.111, 9v1, p 0.021 |

**The coverage effect does not survive on the applicability subset.** It is carried by the numeric
cases, where it is better described as arithmetic degrading under distraction than as under-application
of a rule. On the cases where applicability is genuinely the question, **added rule load moves neither
endpoint** — restraint exactly zero.

**What changes:** §3's claim that added rule load pushes toward under-application is **narrowed**. It
holds on the mixed set and does not hold on the clean subset. **What does not change:** the primary
conclusion. Rule-set-size dilution does not erode restraint and cannot explain M2 — that is now
supported on the clean subset more strongly than on the mixed one, restraint Δ being exactly 0.000.
Any paper must quote the 131-case subset for the restraint claim and must not quote the −0.074 coverage
effect as an applicability finding.

## 3. The direction is opposite to the hypothesized mechanism

M2's mechanism hypothesis was that rule load causes rules to fire where they do not belong. The error
decomposition says the reverse:

| errors | over-RESTRAINT (missed a provision that **does** apply) | over-APPLICATION (fired one that does **not**) |
|---|---|---|
| K1 | 7 | 6 |
| K24 | **17** | 9 |

Adding 23 irrelevant provisions made the model **more likely to decide a provision does not apply**,
not more likely to fire it. Restraint was preserved; coverage was lost. **Rule-set size does not
explain M2's restraint loss, and pushes the opposite way.**

Dose response is also **not monotonic** — the drop lands between K5 and K12 and then flattens
(restraint 0.956 → 0.949 → 0.919 → 0.934). Loss is concentrated by section: coverage change K1→K24 is
s68 −0.286, s152 −0.150, s1 −0.138, while s63 *improved* +0.048.

## 4. Outcome classification — honest, because none of the four fits

| preregistered | condition | met? |
|---|---|---|
| A restraint-specific dilution | Contradiction materially worsens **and** coverage noninferior | **NO** — restraint null |
| B generic interference | **both** materially worsen | **NO** — restraint did not |
| C no dose response | K24 ≈ K1 on **both** | **NO** — coverage clearly worsened |
| D opposite | K24 improves | **NO** — K24 does not improve |

**The observed pattern is a fifth cell the preregistration did not enumerate: restraint held, coverage
degraded.** Forcing it into a named box would be dishonest, so it is reported as what it is.

**The decision is nonetheless unambiguous**, because C and D prescribe the same action and the result
sits between them: the primary is null, and the mechanism is directionally contradicted. **Do not build
a router on this evidence.** The dilution explanation for M2 is closed.

## 5. Why this null is not merely a power failure

The obvious objection is a ceiling: Contradiction accuracy starts at 0.956 (130/136), leaving little
room to fall. Two things answer it.

1. **The instrument demonstrated its own sensitivity on the same 272 cases.** It detected the coverage
   effect at p = 0.021 with 13 vs 3 discordant pairs. A design that can find a real effect on one
   endpoint and finds nothing on the other is not simply underpowered.
2. **McNemar on 136 pairs detects 8 one-way discordant pairs at p = 0.008.** The observed restraint
   split was 7 vs 4 — genuinely balanced, not a suppressed signal.

The ceiling is real and does bound the maximum detectable restraint decline. It is a limitation, not an
explanation for the specific null observed.

## 6. Pre-generation confound found and corrected

**272/272 questions name an explicit section identifier; only 45/272 provision texts contained their
own.** The remainder open as bare `(2)`, `(1)`, `(B)`, `(f)`. Supplying 24 unlabelled fragments while
asking about "Section 3306(c)(2)" would have measured **retrieval under ambiguity rather than rule
interference**, and would have produced a large, confident, wrong effect in the predicted direction.
Every provision in every arm was prefixed with the identifier its own question names — uniformly, so no
arm is advantaged. Caught before any generation.

## 7. Operational record

- **279 of 1,088 first-pass calls hit `max_tokens=32` (26%)** — the model emits `<thinking>` prose and
  arithmetic on the Section 1 computation cases. Truncation was **flat across arms** (28.3 / 25.7 /
  23.9 / 24.6%) but **label-correlated** (Entailment ~30% vs Contradiction ~20%), which would have
  biased both endpoints.
- Per the preregistration, truncation was treated as an **operational error, not a datum**. The 279
  were regenerated at `max_tokens=400` (14 residual regenerated at 1,600), prompt byte-identical, cap
  the only change. `max_tokens` binds only outputs that exceed it, so cells completing under the
  original cap are drawn from the same distribution either way; the merged set is equivalent to a
  single run at the higher cap.
- Zero provider retries across all passes. Superseded calls are counted in the $7.865 spend.

## 8. Claim for the paper

> Supplying a language model with up to 23 additional irrelevant statutory provisions did not degrade
> its ability to correctly decline to apply a named provision (Δ = −0.022, 95% CI [−0.074, +0.022],
> McNemar p = 0.55, n = 136 paired cases). It did degrade its ability to correctly apply one
> (Δ = −0.074, 95% CI [−0.132, −0.015], p = 0.021), failing a preregistered −0.05 noninferiority
> margin. Rule-set size therefore does not account for the loss of conditional restraint observed when
> a compiled standard is served as a static rule list; the effect of added rule load runs in the
> opposite direction, toward under-application.

**Limitations:** benchmark familiarity may attenuate the treatment; distractors are cross-section and
therefore easy negatives, making the test conservative for the hypothesized direction; statutory
entailment is not open-ended pricing judgment; restraint accuracy begins near ceiling; `temperature`
was not settable. Single model, single provider.

## 9. Status

**The public mechanism-study line is CLOSED.** No CUAD, no further LegalBench task, no other public
dataset, no repair of this null, no redesign of M3a from its own result.

M2's conclusion stands unchanged and unrepaired: **static compilation failed to preserve conditional
fidelity, and the mechanism remains unresolved.** M3a removes one candidate explanation — rule-set-size
dilution — and does so on public, reproducible data.
