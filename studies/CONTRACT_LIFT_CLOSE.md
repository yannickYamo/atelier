# Contract lift, BARE vs INITIAL — CLOSE

> **WITHDRAWN IN PART, 2026-08-28.** Every COVERAGE figure below is withdrawn: the generations
> behind it were truncated by the model's thinking budget before an answer was written, so what was
> scored was truncation and not behaviour. 27 of 48 `SHOULD_FIRE` generations ran short; **0 of 48**
> `SHOULD_NOT_APPLY` generations did. **The restraint findings stand and are unaffected.** The
> "components oppose each other" framing is not supported, because one component was never measured.
> See [NEGATIVE_BRANCH_CLOSE.md](NEGATIVE_BRANCH_CLOSE.md) §2, which also reports the fix for the
> restraint failure this study found.

**Status: CLOSED. The primary is a NULL, and its two components oppose each other.** Per the
preregistration nothing was rerun, n was not increased, and the suite was not touched after outputs
existed.

Model `claude-opus-5`, 24 frozen contexts × 3 generations × 2 arms = **144 generations, $4.14** of a
$5.00 cap. Suite frozen before any output existed; 16 of the 24 contexts are scored on the primary,
`BOUNDARY` and `INTERACTION` being unscored by design.

The skill under test is the direct-authored `focus` standard: lead with the next action, number
multi-step work *when the answer has more than one step*, never close with an offer of further help.

---

## 1. The result

Scored by a **structural observer with no model involved**: does the output carry a numbered list of
two or more items? Present is correct for `SHOULD_FIRE`, absent for `SHOULD_NOT_APPLY`. Each context
reduces three generations to a rate; the context is the unit.

| | Δ (skill − bare) | 95% paired context bootstrap | n |
|---|---|---|---|
| **PRIMARY** | **−0.021** | [−0.208, +0.146] | 16 contexts |

**The compiled skill did not beat the bare model on constructed contract cases.** The interval spans
zero comfortably and is centred on it.

## 2. The components are not null, and they oppose each other

| | bare | skill | Δ | 95% CI |
|---|---|---|---|---|
| ~~coverage — `SHOULD_FIRE` (n=8)~~ | ~~0.083~~ | ~~0.250~~ | ~~+0.167~~ | **WITHDRAWN — truncated generations** |
| restraint — `SHOULD_NOT_APPLY` (n=8) | **1.000** | 0.792 | **−0.208** | [−0.500, +0.000] |

~~**This is the M2 result reproduced on a different standard, a different task family and a different
model.** Compilation raised the behaviour where it belonged and lost it where it did not: coverage up
0.167, restraint down 0.208, net zero.~~

**WITHDRAWN.** The "components oppose" reading needs both components and only one was measured. What
survives is the restraint half: compiling this conditional rule as a one-sided instruction made it
fire where its condition did not hold. Whether compilation also raised activation is unknown.

The restraint number deserves emphasis. **The bare model was perfect** — 8 of 8 contexts, 24 of 24
generations, it never numbered a single-step task. The compiled skill broke that in two contexts:

| | bare | skill | |
|---|---|---|---|
| ctx10 | ●●● | ○○○ | numbered all three times |
| ctx15 | ●●● | ●○○ | numbered twice of three |

That is the tagline failure from the live run, recurring across independent contexts rather than as
an anecdote — which is the condition the preregistration set for treating a failure mode as real.

## 3. Regressions and recoveries

Majority of three:

| | n | contexts |
|---|---|---|
| recovery (bare wrong → skill right) | 1 | ctx02 |
| **regression (bare right → skill wrong)** | **2** | ctx10, ctx15 |
| unresolved (both wrong) | 6 | ctx03–ctx08, all `SHOULD_FIRE` |
| already solved (both right) | 7 | |

**More regressions than recoveries.** A compiler that maximises visible rule firing while introducing
regressions is worse than no compiler, and on this suite that is what happened.

~~The six unresolved contexts are their own finding: on most multi-step tasks neither arm numbered.~~
**WITHDRAWN.** Those six are `SHOULD_FIRE` contexts, and their generations were truncated before an
answer was written. They record nothing about whether the rule fired.

## 4. Stability

| | 3/3 | 2/3 | 1/3 | 0/3 |
|---|---|---|---|---|
| BARE | 8 | 1 | 0 | 7 |
| INITIAL | 6 | 2 | 3 | 5 |

Bare is nearly deterministic — 15 of 16 contexts are all-or-nothing. The skill is measurably less
stable, with five contexts landing at 1/3 or 2/3. **Adding the skill added variance**, which is the
same direction the dilution study measured for rule load.

## 5. Is the reader any good? (contributes to no endpoint above)

Compared against the structural labels on 96 generations:

| | |
|---|---|
| abstained | **28 (29%)** |
| agreement, where it ruled | 51/68 (**75%**) |
| **false pass** (said correct; structure says wrong) | **17** |
| false fail (said wrong; structure says correct) | **0** |

Two things, and the second is the important one.

It **abstains**, at 29%. Three model-based instruments in this programme produced zero abstentions
across 150 observations. Asking what an output *does* rather than whether it is *good* produced
abstention here.

But it is **systematically permissive**: 17 false passes and zero false fails. It never calls correct
work wrong, and it calls wrong work correct about a quarter of the time. That is the dangerous
direction for a diagnostic aid — it under-reports exactly the failures a repair loop exists to find,
and it would have missed most of the restraint regressions this study's structural observer caught.

**It stays a diagnosis aid and certifies nothing.** This study is the reason that is a measurement
rather than a policy.

## 6. Instrument problems found and fixed BEFORE the freeze

**Near-duplicate contexts.** The first frozen suite had 13 near-duplicate pairs, **all in
`SHOULD_NOT_APPLY`**, one at 0.82 token overlap. Asked the same question eight times with no memory,
the generator converges on one scenario. Eight "independent" restraint contexts were about three, and
the restraint endpoint — the one that carries this study's finding — would have been the one
inflated. Prior tasks are now shown to the generator and a 0.35 overlap ceiling refuses a near-repeat.
Worst pair in the frozen suite: **0.15**.

**An unrunnable control arm.** The Anthropic adapter set `cache_control` on an empty system block,
which the API refuses. `BARE` sends an empty block by design, so the control condition had never once
executed. Found on the first real call.

**`BOUNDARY` gating (Amendment 1).** Recorded in the preregistration, made before the freeze and
before any output existed.

## 7. What this licenses, and what it does not

**Supported.** On this frozen suite, compiling this standard raised the rule's activation and cost
restraint, netting to no measurable lift. The over-application failure recurs across independent
contexts and repeated generations, so it is a failure mode rather than an anecdote.

**Not supported.** Any statement about deployment. These are constructed cases from one generation
procedure, not samples of real work; no confidence interval over them estimates how often the skill
succeeds in use. n=8 per component is small and both component intervals touch zero.

**Not tested.** Optimization. Phase 4 was deliberately excluded so the initial compiler's signature
could be established first.

## 8. What follows

The preregistration said proceed to optimization only on coherence. Two of its conditions fail:
restraint got worse, and regressions outnumber recoveries.

So the honest next step is **not** to optimize. It is that the escalation repair — the only one this
system owns — cannot fix what this study found, and the repair gate already refuses to try:
carrying an over-applying rule harder makes it fire more. That refusal is now supported by a measured
result rather than by argument.

What this points at is **applicability**, not carrier strength. The compiler renders `Applies when:`
as prose beside the rule and nothing evaluates it.

**Resolved, 2026-08-28.** It was narrower than an applicability engine: the prose stated only half of
the condition. Rendering both branches restored restraint completely — 0.708 → 1.000, Δ +0.292,
CI [+0.083, +0.500], no regressions — for one sentence in the renderer. See
[NEGATIVE_BRANCH_CLOSE.md](NEGATIVE_BRANCH_CLOSE.md).
