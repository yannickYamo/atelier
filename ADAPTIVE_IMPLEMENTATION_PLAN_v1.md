# Changing the implementation without changing the target — plan v1

The moat claim this plan is built to test:

> Given a fixed human-owned `StandardVersion`, Atelier can use behavioural evidence to identify a bad
> implementation, change **only** the `SkillVersion`, and produce a better reproduction of the
> expert's taste on unseen tasks **without redefining what good means**.

Everything below exists to make that claim falsifiable. The optimizer may change `π`. It may never
silently change `S`.

---

## 0. THE BLOCKING FINDING: Atelier cannot currently make this proposal

Not "does it badly" — **structurally cannot**, in three verified places. If we hand-edit
`p6: EXAMPLE → PROSE` and call it adaptive compilation, we prove that a person can read a negative
study and patch a skill. That is not the claim.

| # | gap | evidence |
|---|---|---|
| 1 | **The only trigger is a MISS.** `ServedMissEvidence` requires "the author confirmed the output missed this requirement". The carrier study found the opposite: p6 fired MORE in the ablation (0.92 vs 0.57) and the FULL arm was preferred LESS. There is no evidence type for *the rule was realized and the work was still worse*. | `core/architecture/escalate.ts:35` |
| 2 | **EXAMPLE is not on the ladder.** `LADDER = ['PROSE','SELF_CHECK']`, so `nextLevel('EXAMPLE')` returns `null` and the loop refuses with *"already at the strongest carrier this renderer implements"* — which is a **wrong message**: EXAMPLE is not strongest, it is absent. | verified: `nextLevel('EXAMPLE') → null` |
| 3 | **The ladder only ascends.** A carrier change that WEAKENS cannot be expressed at all. | `nextLevel` returns `LADDER[i+1]` only |

A fourth, smaller: the ladder's own comment says EXAMPLE and OUTPUT_CONTRACT are excluded because
"the renderer cannot honour them yet". **That is stale** — the renderer emits `examples/p6.md`, the
runtime serves it, and we measured it leaking. A comment justifying an exclusion on grounds that
have since become false is how a deliberate decision turns into an accident.

**Phase 0 builds the capability. No study fires until Atelier proposes the change itself.**

---

## Phase 0 — make the loop able to be wrong in this direction

### 0.1 A second evidence type: realized-but-worse

`ServedMissEvidence` says *the behaviour did not happen*. We need *the behaviour happened and the
work was worse*, carrying the comparison it came from:

```
CarrierUnderperformEvidence
  requirementId, carrierAtServe
  comparison: { against: Carrier, contexts: n, preferenceDelta, interval }
  instrument: BLIND_EXPERT | ...
  expertConfirmed: true
```

**It must be refused when the comparison is not decisive**, so a nominal majority cannot license a
carrier change. The threshold is preregistered here: a context-level interval excluding zero.

### 0.2 The ladder becomes a graph, and moves both ways

`nextLevel` is one-directional and cannot express a weakening. Replace with an explicit relation
that admits EXAMPLE and OUTPUT_CONTRACT, and permits a **downward** move only when carrying
underperform evidence — never on a miss.

**The asymmetry is the safety property.** A miss may only escalate; underperformance may only
de-escalate. Nothing lets one kind of evidence move a carrier in the direction the other kind
argues for.

### 0.3 The diagnosis must say STANDARD unchanged, out loud

The proposal has to state, in the artifact:

> p6 remains PREFERRED. **No StandardVersion change proposed.** Evidence indicates the EXAMPLE
> realization underperformed a prose realization. Proposed implementation change: EXAMPLE → PROSE.

`assertArchitectureServesStandard` already refuses an architecture that stops serving the standard,
and `applyEscalation` copies `gateRole` and `carries` untouched. Extend both to cover the new
operation, and add a test that a de-escalation which alters any requirement's text, materiality or
gate role is **refused** rather than warned about.

### 0.4 Reuse, do not rebuild

`repair-memory.ts` already refuses laundering, permits reconsideration on stronger evidence, keeps
`TRANSITION_FORBIDDEN` human-authored, and bounds what a proposer sees. The new operation goes
through `mayPropose` unchanged. **Adding a second path around it would be the bug.**

**Phase 0 exit:** on the closed study's evidence, `atelier improve` proposes EXAMPLE → PROSE for p6,
names the evidence, and states no standard change — with the standard hash identical before and
after. Verified on the built binary.

---

## Phase 1 — qualify the leak repair, with no claim attached

The repair is already shipped (labels bracketed, block fenced, ownership stated, detector wired).
Before any arm is built on it, qualify it on real provider calls:

| gate | requirement |
|---|---|
| skill-internal headings in output | **0** |
| verbatim served-example reproduction | **0** |
| termination valid | all COMPLETE |
| delivery witnessed | `servedExamples` non-empty for a GENERAL example |

Current evidence: 0 leaks in 8 live invocations. **Raise to ~20 before building arms.**

**The repair is not moat evidence and is never reported as such. The closed 13–3 study stays
negative forever.**

---

## Phase 2 — SEARCH: does the repair deserve promotion?

Both arms carry the leak fix. **We are not comparing repaired prose to a broken example.**

| arm | p6 carrier | everything else |
|---|---|---|
| `REPAIRED_EXAMPLE` | EXAMPLE | identical |
| `PROSE_CANDIDATE` | PROSE | identical |

Same `StandardVersion 7be05d7f92222e15`, same other 18 requirements, same model, runtime, request
shape, rendering, token budget, contexts. Enforced by `assertSemanticClosure` — exactly one
component may differ.

**12 fresh contexts**, sealed before generation, diversity-gated, drawn from a pool disjoint from
Phase 3's.

**Atelier decides promotion from this, not a person's impression of it.** If `REPAIRED_EXAMPLE`
wins, **do not promote PROSE** — that says the leak, not the carrier, caused the original loss,
which is a real and publishable architecture result. Stop there.

## Phase 3 — HOLDOUT: the moat test

Contexts never seen in Phase 2. Nothing changes after Phase 2 closes.

$$\text{ADAPTED} - \text{REPAIRED\_EXAMPLE}$$

**24 fresh contexts**, 2 generations each, 2 arms = 96 generations.

### Endpoints

**Primary — blind expert taste.** *Which is closer to how you would actually write this?*
A / B / Equally me / Neither, arm hidden. Scored `+1 / 0 / −1`, **aggregated within context first**,
then a paired context bootstrap; the decisive-pair sign test is complementary, not primary.

**A moat claim requires the 95% context-level interval above zero**, not a nominal majority.

**Secondary — mechanism.** Did the ending re-land the argument's judgment, takeaway or implication?
Arms still hidden. This explains *why* taste moved; it does not define taste.

**Guardrails, four and no more:** skill-internal leakage, verbatim example copying, required-standard
violation, obvious forced or caricatured style. No 19-requirement composite at the finish line.

---

## The cost nobody has priced yet

**The expert is the only qualified instrument** — κ = 0.257 for the model judge. This design asks for
two rounds of blind scoring.

| phase | pairs | words | reading |
|---|---|---|---|
| Phase 2 SEARCH | 12 | ~29,000 | ~2 hours |
| Phase 3 HOLDOUT | 24 | ~58,000 | ~4 hours |
| | | | **~6 hours total** |

Inference is the cheap half: roughly $4 for Phase 2 and $8 for Phase 3, budget from an uncensored
probe before each. **The founder's reading time is the binding constraint on this entire programme**,
and it should drive the sizing decision rather than be discovered halfway.

If six hours is too much: run Phase 3 only, using the closed study to generate the hypothesis and
accepting that the promotion decision was made by a person rather than by Atelier. That is a weaker
claim and it should be said plainly rather than blurred.

---

## What each outcome closes

| result | what it means | action |
|---|---|---|
| SEARCH: PROSE wins → HOLDOUT: ADAPTED wins, interval above zero, no guardrail regression | **The claim.** Atelier localized the failure to implementation, kept the target fixed, chose a different realization, and reproduced the expert's taste better on unseen tasks. | Close v1. Write the paper. |
| SEARCH: REPAIRED_EXAMPLE wins | The carrier was fine; the runtime was broken. Failure localized to SkillVersion, not StandardVersion — an architecture result without an adaptive-carrier result. | Close. Do not promote PROSE. Do not fish. |
| HOLDOUT ties | Adaptive carrier selection unproven. | Close honestly. |
| HOLDOUT loses | The compiler learned the wrong lesson. This is what prospective validation is for. | Close. |

**No p7, p8, p9. No carrier fishing. No "one more tweak."** A null is closure.

## Optional, and not required to close v1

`B4_EXPERT_ONE_PAGER` — already typed in `core/reference/arms.ts` as *"the commercial competitor,
and the arm this system has the least right to assume it beats."* If `ADAPTED > B4` prospectively,
the claim becomes commercial rather than architectural. **Do not make it necessary.**

## What is deliberately not in this plan

- **No change to `PREFERRED → EXAMPLE`.** One falsification on one requirement with a since-fixed
  confound is not grounds to rewrite a policy. The long-term target is
  `P(carrier | materiality, requirement type, model, runtime, evidence)`; this study produces the
  second data point toward it, not the rewrite.
- **No modification to p6 or the other 18 requirements.** The target is frozen. That is the thesis.
- **No re-run of the closed study.** It generated the hypothesis. It cannot also certify it.
