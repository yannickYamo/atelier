# Does stating the otherwise-branch restore restraint? — CLOSE

**Status: CLOSED. The primary PASSED and is robust. The co-primary is WITHDRAWN, along with every
coverage figure in the previous study, because the instrument that produced it was broken.**

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
