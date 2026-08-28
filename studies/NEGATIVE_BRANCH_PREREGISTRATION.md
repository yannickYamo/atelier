# Does stating the otherwise-branch restore restraint? — preregistration

**Sealed before any context is generated and before any output exists.**

## Why this before an activation engine

The contract-lift study found compilation raising a conditional rule's activation and costing
restraint, netting to no lift — M2's signature on a different standard. The obvious reading is that
static prose cannot carry a conditional rule and an applicability engine is needed.

But the prose never stated the condition's other half. What was compiled was:

```
## What to do
2. Number multi-step work so the reader can stop and resume.
   Applies when: the answer has more than one step
```

A rule under a "what to do" heading with a trailing annotation. Nothing anywhere says *what to do
when the condition does not hold*. So the study did not test whether static prose can carry a
conditional; it tested whether a **one-sided** rendering can, and found it cannot.

This is not "carry the rule harder", which the contract-lift result rules out and which the repair
gate already refuses. It is saying the half that was never said. If it works, no new execution
architecture is needed and the compiler gains one renderer rule. If it does not, the case for an
applicability mechanism is made on evidence rather than on the absence of a cheaper test.

## Design

| | |
|---|---|
| contexts | **16 fresh**, frozen before generation — 8 `SHOULD_FIRE`, 8 `SHOULD_NOT_APPLY` |
| generations per context per arm | **3** |
| arms | **BARE**, **STATIC**, **EXPLICIT** |
| total generations | 16 × 3 × 3 = **144** |
| unit | the context |
| hard cap | **$5.00** |

`BOUNDARY` and `INTERACTION` are not built: they score no endpoint, and spending on them buys
nothing. Contexts are newly generated with the diversity constraint (0.35 overlap ceiling) that the
previous suite needed, so this is not a re-analysis of the same cases.

### The arms

**BARE** — no skill.

**STATIC** — the package exactly as the compiler emits it today. This is the arm the contract-lift
study measured, rebuilt here so the comparison is within one experiment rather than across two.

**EXPLICIT** — identical in every respect except that a conditional requirement renders both
branches:

```
2. When the answer has more than one step, number multi-step work so the reader can stop and
   resume. When it does not, do not number it.
```

Same requirement, same standard, same hash. Only the rendering of the condition differs, which is a
carrier decision and not a change to what was authored.

### No reader

The contract-lift study already answered whether the model reader is any good: 29% abstention, 75%
agreement, **17 false passes and zero false fails**. It is systematically permissive and stays a
diagnosis aid. Re-running it here would add cost and no information, so scoring is the structural
observer only.

## Endpoints, fixed now

Scored mechanically: does the output carry a numbered list of two or more items? Present is correct
for `SHOULD_FIRE`, absent for `SHOULD_NOT_APPLY`. Each context reduces three generations to a rate;
the context is the unit.

**Primary — restraint.**

    restraint Δ = mean over the 8 SHOULD_NOT_APPLY contexts of ( R_EXPLICIT − R_STATIC )

**Co-primary — coverage, which must not be given up to get it.**

    coverage Δ = mean over the 8 SHOULD_FIRE contexts of ( R_EXPLICIT − R_STATIC )

Both with a paired context bootstrap, 10,000 resamples, resampling contexts and never generations.
Reported separately, never averaged. `BARE` is reported alongside as the control that made the
original finding legible; it is not a target and enters no comparison that decides anything.

**Secondary** — regressions and recoveries STATIC→EXPLICIT on majority-of-three, and the
within-context stability distribution per arm.

## The success condition, stated before the result

**EXPLICIT wins** if restraint Δ is positive and coverage Δ is not negative — the point is to recover
what was lost without trading away what was gained.

**EXPLICIT fails** if restraint does not improve, or improves only by suppressing the rule everywhere
(restraint up, coverage down). That second shape is the one to watch: a rule that stops firing
entirely scores perfectly on restraint and is useless.

If EXPLICIT fails, static prose genuinely cannot carry a conditional and applicability becomes a
compilation mechanism rather than a rendering choice. That is a more expensive road and this study is
what justifies taking it.

## Stopping rules

- n fixed at 16 contexts × 3 generations × 3 arms. Not increased after seeing anything.
- No failure rerun until it passes. The suite is not edited after outputs exist.
- If the result is noisy, the reported conclusion is that it is noisy.
- The previous study's contexts are not reused, and its numbers are not pooled with these.

---

# Amendment 2 — coverage remeasurement, sealed before any new generation

The coverage endpoint above was never validly observed: 54 of 72 `SHOULD_FIRE` generations were
stopped at the token limit before an answer was written. This is not a rerun of a disliked result.
The dependent variable was not produced, and the recorded statistic was an execution failure.

**What changes. Only the generation budget, and only because it has been measured.**

`max_tokens` 1200 → **8000**. Measured requirement on this arm: worst observed complete answer is
**4376** output tokens, giving 1.8× headroom. Restraint contexts average 769.

**Validity, declared before any call.**

    VALID  :=  stop_reason != 'max_tokens'  AND  answer text is non-empty

An invalid generation is `EXECUTION_INVALID`. It is never scored as behaviour, and it is **not
rerun** — either the declared budget was adequate or this remeasurement failed its own
instrumentation gate, and that is the reportable outcome.

**The observer is corrected, and the correction is stated now.** The original regex required a digit
at line start and could not see `**1.` bold-numbered lists. It matches an optional emphasis marker.
On the previous outputs this changed 4 of 144 labels and moved no conclusion; it is fixed here so the
remeasurement is not run on a known-blind instrument.

**Restraint is re-run, which the earlier plan said not to do.** A pre-flight check found the previous
EXPLICIT package differed from STATIC in more than the conditional: it had been rendered from a
hand-built fixture and carried `standardVersion: sv` and a different `mintedAt` in its trailing
comment. Both arms are now rendered from the same stored standard `27f643df08f5b11e`, and the diff
between them is exactly three lines — two replaced by one, the conditional sentence.

The metadata sat in an HTML comment and very likely changed nothing. "Very likely" is not the standard
for a controlled comparison, so the restraint figure is measured again on clean arms. The original
stands as recorded and is superseded only if this disagrees with it.

**Frozen and unchanged:** the 16 contexts and their wording, the standard, the three arms, 3
generations per context per arm, the scoring rule, the analysis, the context as the unit of analysis.

**Cost.** Measured, not estimated: 144 generations, ~$8.76 expected, hard cap **$12.00**. The earlier
$2 figure was wrong because the runs it was based on were cheap precisely *because* they were
truncated.

**Stopping rules unchanged.** n fixed. Run once. No selective reruns. No merging with the truncated
generations, which remain in the record as evidence of an instrumentation failure. If the result is
noisy, the reported conclusion is that it is noisy.
