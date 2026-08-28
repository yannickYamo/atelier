# Contract lift, BARE vs INITIAL — preregistration

**Sealed before any context is generated and before any output exists.** Written to fix the
endpoints, the analysis and the stopping rules while the result is still unknown, which is the only
time fixing them means anything.

## The question

On a frozen adversarial contract suite, how much behavioural lift does a compiled skill produce over
the same model with no skill, and how variable is that lift across repeated generations?

**Not** a deployment rate. These are constructed cases derived from the standard, not samples of real
work, so no confidence interval over them estimates how often the skill succeeds in use. What they
can support is a paired comparison between two arms on identical constructed contexts.

## Design

| | |
|---|---|
| contexts | **24**, frozen before generation |
| generations per context per arm | **3** |
| arms | **BARE**, **INITIAL**. No optimization, no candidate. |
| total generations | 24 × 3 × 2 = **144** |
| unit of analysis | **the context.** Never the 144 outputs. |
| standard | the direct-authored `focus` skill, three requirements |
| hard cap | **$5.00** |

Generations are nested inside contexts. Treating 144 outputs as 144 independent observations is the
error this programme published and withdrew, and it is the one this design exists to avoid.

### Balance

Weighted toward the conditional rule, because that is where the live failure appeared and it is the
only requirement here that is mechanically observable.

| obligation | n | what it tests |
|---|---|---|
| `SHOULD_FIRE` on x2 | 8 | activation: the task genuinely has multiple steps |
| `SHOULD_NOT_APPLY` on x2 | 8 | **restraint**: the task genuinely has no steps |
| `BOUNDARY` on x2 | 4 | the edge, where either answer is defensible |
| `INTERACTION` | 4 | two rules live at once |

Eight negative cases is deliberate. A suite weighted to positives lets false application hide behind
a high hit rate, which is exactly how the pricing study's endpoint became a restraint test by
accident rather than by design.

## Endpoints, fixed now

### Primary — context-level contract correctness, scored WITHOUT a model

For each context *i* and arm *a*, three generations are scored by a **structural observer**, and
reduced to a rate `R_i^a ∈ {0, 1/3, 2/3, 1}`.

The observer for x2 is mechanical: **does the output contain a numbered list of two or more items**
(a line matching `^\s*\d+[.)]\s`)? For `SHOULD_FIRE` the correct answer is present; for
`SHOULD_NOT_APPLY` it is absent.

This deliberately does not use the model reader. The live runs showed the same case moving apparent
pass → apparent fail → apparent pass across three runs, so a reader is not fit to carry a primary
endpoint. `BOUNDARY` and `INTERACTION` contexts are **not scored** on the primary: a boundary has no
correct answer by construction, and an interaction cannot be mechanically attributed.

Primary statistic:

    Δ = mean over scored contexts of ( R_i^INITIAL − R_i^BARE )

reported with a **paired bootstrap over contexts**, 10,000 resamples, resampling contexts and never
generations.

### Secondary — coverage and restraint, reported separately

    coverage  = mean Δ over the 8 SHOULD_FIRE contexts
    restraint = mean Δ over the 8 SHOULD_NOT_APPLY contexts

Never averaged together. An overall mean that hides coverage rising while restraint collapses is the
M2 result reproduced by accident.

### Secondary — regressions and recoveries

Each scored context classified on majority-of-three:

| bare | skill | |
|---|---|---|
| wrong | right | **recovery** |
| right | wrong | **regression** |
| wrong | wrong | unresolved |
| right | right | already solved |

Regressions are reported as prominently as recoveries. A compiler that maximises visible rule firing
while introducing regressions is worse than no compiler.

### Secondary — within-context stability

Distribution of `R_i` over {0, 1/3, 2/3, 1} per arm. This measures the variance observed live
directly, rather than smoothing it away.

### Separate question — is the reader any good?

The model reader runs on every scored context and is compared against the structural labels:
agreement, false-pass rate, false-fail rate, abstention rate, coverage. It **does not** contribute to
any endpoint above. Its role stays diagnosis, never certification, and this measures whether even
that is earned.

## Suite validation, before freezing

Every generated context is checked before any output exists:

- a `SHOULD_NOT_APPLY` context must not itself describe multiple steps — if the negative case
  contains the trigger, the whole evaluation is worthless;
- a `SHOULD_FIRE` context must genuinely require more than one step;
- no context may mention the rules, the standard, or that anything is being tested.

A context failing validation is regenerated **before** the freeze. After the freeze nothing changes.

## Amendment 1 — before the freeze, before any output existed

`BOUNDARY` contexts could not be built: eight attempts each returned a task the validator called
`MULTI` rather than `ARGUABLE`. Certifying a context as "genuinely arguable" asks the validator for a
judgment it is demonstrably not reliable at, and gates a context that **contributes to no endpoint**.

So `BOUNDARY` and `INTERACTION` are gated only on not leaking the rules. The scored kinds keep their
full step-count gate, because a negative case containing the trigger would poison the primary. The
validator's step-count reading is recorded on every context either way, so what those cases actually
were is visible rather than assumed.

Made with no output generated and nothing to see, which is the only point at which changing a design
is not choosing a result.

## Stopping rules

- **n is fixed at 24 contexts × 3 generations.** Not increased after seeing anything.
- If the cost projection exceeds $5, reduce to **20 contexts**, never fewer repetitions — the
  observed variance makes one-shot generation nearly useless.
- No failure is rerun until it passes.
- The suite is not edited after outputs exist.
- If the result is noisy, the reported conclusion is that it is noisy.

## What would justify proceeding to optimization

Coherence, not significance, from 24 constructed contexts:

- the skill improves a meaningful number of contexts over bare;
- improvements recur across repetitions rather than appearing once;
- restraint is not catastrophically worse;
- the same failure mode appears in several independent contexts;
- the reader has useful agreement with the structural labels and a non-zero abstention rate;
- no provider or delivery defect explains the behaviour.

**bare ≈ skill**, or coverage gained at the cost of restraint, is a more valuable outcome than a
marginal win, and would send the next step back to construction strategy rather than forward to
optimization.
