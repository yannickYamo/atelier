# Does stating the otherwise-branch restore restraint? — CLOSE

**Status: CLOSED, then REMEASURED — see [the remeasurement](#remeasurement--the-coverage-endpoint-and-a-cleaner-restraint-measurement)
at the end of this file. The primary PASSED and REPLICATED on clean arms (+0.250 [+0.083, +0.458]).
The co-primary was withdrawn here for a broken instrument, and the remeasurement then REFUTED it:
coverage is at ceiling in every arm, so the previously reported +0.167 gain was an artifact end to
end. The figures in §1-§5 below are the first measurement and are retained as recorded.**

16 fresh frozen contexts × 3 generations × 3 arms = **144 generations, $3.70** of a $5.00 cap.
Nothing rerun, n not increased, suite untouched after outputs existed.

---

## 1. The primary result

Restraint, `SHOULD_NOT_APPLY` contexts, scored by a structural observer with no model involved:

| | BARE | STATIC | EXPLICIT |
|---|---|---|---|
| restraint | 1.000 | **0.708** | **1.000** |

| | Δ | 95% paired context bootstrap |
|---|---|---|
| **PRIMARY** restraint, EXPLICIT − STATIC | **+0.292** | **[+0.083, +0.500]** |

**Stating the otherwise-branch fully restores restraint**, back to the level of a model with no skill
at all. Three recoveries, **zero regressions**. The interval excludes zero.

The change was one sentence in the renderer:

```diff
- 2. Number multi-step work so the reader can stop and resume.
-    Applies when: the answer has more than one step
+ 2. When the answer has more than one step, number the steps.
+    When that does not hold, do not.
```

Same requirement, same authority, same standard hash. Only the sentence carrying the condition
changed, which is a carrier decision the compiler owns.

**No applicability engine was required.** The previous study's failure was not that static prose
cannot carry a conditional; it was that the prose stated only half of one. That distinction is worth
the $3.70 it cost to establish, because the alternative reading pointed at a substantially larger
piece of architecture.

### Robust to the instrument correction

The observer missed bold-numbered lists (`**1.`). Re-scored with one that sees them, on the same
outputs:

| | Δ | CI |
|---|---|---|
| restraint, EXPLICIT − STATIC | +0.292 | [+0.083, +0.500] |

Identical. `BARE` restraint moves 1.000 → 0.917 under the corrected observer, so a bare model does
occasionally over-number; the finding does not depend on it.

## 2. The co-primary is withdrawn, and so is the previous study's coverage figure

Coverage read 0.083 in every arm, which is not credible for tasks like *"write instructions so my
parents can set up the router I mailed them."* It is not credible because it is not real.

**`stop_reason: max_tokens`, with a `thinking` block consuming the budget.** At `max_tokens: 1200`
the model's extended thinking used the allowance before the answer was written. `SHOULD_FIRE` tasks —
multi-step instructions — think longest, so their text was truncated, sometimes to nothing. Minimum
recorded output length: **0 characters**. One output was the 33 characters `# Setting Up Your New
Router\n\n**1`.

The damage is confined, and confined in a way that can be checked rather than assumed:

| | `SHOULD_FIRE` truncated | `SHOULD_NOT_APPLY` truncated |
|---|---|---|
| contract-lift study | 27 / 48 | **0 / 48** |
| this study | 54 / 72 | **0 / 72** |

Restraint contexts are taglines, blurbs and short notes. They think briefly, they complete, and not
one of them was truncated in either study. **Every restraint figure in both studies stands. Every
coverage figure in both studies is withdrawn**, including the contract-lift study's `+0.167`
coverage gain, which measured how often a truncated output happened to contain a numbered list.

Nothing here is re-scored to recover the co-primary. The measurement was not taken, and a design
whose stated success condition depended on it is reported as half-answered rather than repaired
after the fact.

## 3. What this means for the previous study's headline

The contract-lift study reported coverage up and restraint down, netting to a null, and called it
M2's signature reproduced. **The restraint half of that is confirmed and now has a fix.** The
coverage half was an artifact and is withdrawn, so the "components oppose" framing is not supported:
one component was measured and one was not.

What survives is narrower and still the important part: **compiling a conditional rule as a one-sided
instruction caused it to fire where its condition did not hold, and stating the other half fixed
that.**

## 4. What is still unknown

**Whether the skill helps at all.** Coverage — does the rule fire where it should — has never been
measured on an uncorrupted instrument. `EXPLICIT` may be a skill that reliably does no harm and no
good, and this study cannot distinguish that from one that works.

Answering it needs the same 8 `SHOULD_FIRE` contexts rerun at a token budget that leaves room for an
answer after thinking, three arms, roughly 72 generations. The contexts are frozen and reusable, so
it is a re-measurement rather than a new design.

## 5. Instrument defects found, in order

1. **Truncation by thinking budget** — above. Invalidates coverage in both studies.
2. **A structural observer blind to bold-numbered lists** — corrected and re-run; changed nothing
   material.
3. **Near-duplicate contexts**, found in the previous suite before its freeze: 13 pairs, all in the
   restraint arm, one at 0.82 overlap. The diversity constraint added then was carried into this
   suite; worst pair here is 0.15.

Three instrument problems across two studies, two of them caught before any result depended on them
and one caught by looking at a number that was not credible. The third is the one worth remembering:
**the finding that looked strongest in the previous study was the one that was not measured.**

---

# REMEASUREMENT — the coverage endpoint, and a cleaner restraint measurement

**Sealed as Amendment 2 before any generation. 144 generations, $9.53 of a $12.00 cap,
`max_tokens` 8000.** Arms `STATIC 95cce5eb6d52c124` → `EXPLICIT 70199c1dbcdd5a04`, suite
`6a3cc6842f38782d`, both arms rendered from stored standard `27f643df08f5b11e`. Raw labels in
[NEGATIVE_BRANCH_RESULTS_REMEASURED.json](NEGATIVE_BRANCH_RESULTS_REMEASURED.json).

## R1. The primary replicates on clean arms

| restraint, `SHOULD_NOT_APPLY`, n=8 | BARE | STATIC | EXPLICIT |
|---|---|---|---|
| first measurement (confounded arms) | 1.000 | 0.708 | 1.000 |
| **remeasurement (clean arms)** | 0.958 | **0.750** | **1.000** |

| | Δ | 95% paired context bootstrap |
|---|---|---|
| **PRIMARY** restraint, EXPLICIT − STATIC | **+0.250** | **[+0.083, +0.458]** |

Two recoveries (ctx11, ctx15), **zero regressions**, interval excludes zero. The confound — arm
metadata inside an HTML comment — moved the estimate by 0.042, well inside the interval. The original
+0.292 stands as recorded and is superseded by a measurement that agrees with it.

Every one of STATIC's six restraint failures is repaired. **EXPLICIT scored correct on 48 of 48 valid
generations** and sat at 3/3 in all 16 contexts; BARE reached 3/3 in 15 of 16, STATIC in 12 of 16.
Two-sided rendering did not only raise the mean, it removed the variance the skill introduced.

## R2. The coverage endpoint does not exist on this suite

**Zero of 70 valid `SHOULD_FIRE` generations were scored WRONG — in any arm.**

| coverage, `SHOULD_FIRE`, n=8 | BARE | STATIC | EXPLICIT |
|---|---|---|---|
| | **1.000** | **1.000** | **1.000** |

Coverage Δ is +0.000 with a bootstrap interval of **[+0.000, +0.000]**. A zero-width interval is the
signature of a constant, not of a precise estimate. The co-primary condition "coverage must not go
down" is met **vacuously**: nothing could have gone down, and nothing could have gone up.

**This refutes the withdrawn figure rather than restoring it.** The previous study reported coverage
0.083 bare → 0.250 skill, Δ +0.167, and called it half of an M2 reproduction. The truth on validly
generated outputs is 1.000 → 1.000. That number was not merely unmeasured; it was an artifact of
truncation from end to end.

The endpoint is also weak by construction, and this is our own instrument's fault. A bare answer to
these tasks runs a median of **6606 output tokens**; an answer that long to a multi-step request will
almost always contain a numbered list. The observer therefore had close to no discriminating power on
`SHOULD_FIRE`. **Whether compilation raises activation is still unmeasured, and this suite cannot
measure it** — it would need contexts where the bare model does not already comply.

## R3. The product question, which is the uncomfortable one

Neither preregistered endpoint asks whether the compiled skill beats no skill. Against BARE:

| vs BARE | coverage Δ | restraint Δ | 95% CI (restraint) |
|---|---|---|---|
| STATIC | +0.000 | **−0.208** | **[−0.375, −0.083]** — excludes zero |
| EXPLICIT | +0.000 | +0.042 | [+0.000, +0.125] — touches zero |

**Compiling this standard made the model measurably worse than having no skill at all**, and that
interval excludes zero. It is the same −0.208 the contract-lift study measured, on fresh contexts.
Two-sided rendering repairs it to +0.042, an interval that touches zero.

So on this standard the compiler's net measured contribution over no skill is approximately nothing:
it cannot raise a behaviour already at ceiling, and its restraint gain is repair of damage it
introduced. **The finding in R1 is real and it is a compiler fix, not a product benefit.** Stated
plainly so the paper cannot be read as claiming lift that was not measured.

## R4. A second instrumentation failure, of the same class, made by us

The budget was set from a **censored sample**. Amendment 2 declared `max_tokens: 8000` on the measured
grounds that "the worst observed complete answer is 4376 output tokens." That measurement was taken
from the previous run, where `max_tokens` was 1200 — so every long answer had already been cut, and
"worst complete" was drawn from the surviving short tail.

Actual requirement, now that answers can finish:

| `SHOULD_FIRE` median output tokens | BARE | STATIC | EXPLICIT |
|---|---|---|---|
| | **6606** | 3747 | 3713 |

Two BARE generations (ctx03 rep1, ctx05 rep3) ran to the full 8000 and were cut. Per the sealed rule
they are `EXECUTION_INVALID`, were not scored and were **not rerun**. They are immaterial to what is
reported: both fall on `SHOULD_FIRE`, where every arm is at ceiling, and both contexts scored CORRECT
on their remaining reps. **2 of 144 = 1.4%**, against 54 of 144 before.

The error class is worth naming because it is the same one twice: *estimating a population maximum
from a distribution that was already truncated.* Fixing the cap does not fix an estimate derived under
the old cap. A budget must be measured on an uncensored sample, or not called measured.

## R5. An observation outside the preregistration

The skill roughly **halves output length** on `SHOULD_FIRE` — 6606 median tokens bare, ~3730 with
either compiled arm. This is the largest single effect in the dataset and it is not a preregistered
endpoint, so it is recorded as an observation and carries no interval. It suggests the standard's real
effect on this task family is compression rather than structure.

## R6. What the remeasurement settles

- **Settled.** Two-sided rendering repairs the conditional-restraint defect: +0.250 [+0.083, +0.458],
  zero regressions, on arms differing in exactly one sentence.
- **Settled negatively.** The withdrawn +0.167 coverage gain was an artifact. Coverage is at ceiling
  in every arm.
- **Still open.** Whether compilation raises activation — needs a suite where bare does not already
  comply. Whether the compiled skill beats bare at all: on this standard, the honest answer is that it
  does not, and the CI on the one arm that could have shown it touches zero.
- **Unchanged.** Sparse semantic conditionals (M2 pricing). Nothing here addresses them.
