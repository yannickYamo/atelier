# Change the implementation, never the target — plan v2

**Supersedes v1.** v1 proposed generalising the carrier ladder into a bidirectional relation. That
was wrong and the correction is recorded below, because it matters more than the plan.

The one claim this exists to falsify:

> Atelier can use qualified comparative behavioural evidence to replace a bad `SkillVersion`
> implementation while leaving the human-owned `StandardVersion` unchanged, and the adapted
> `SkillVersion` performs better on fresh blind tasks.

---

## THE CORRECTION v1 GOT WRONG

v1 said: *a miss may only escalate; underperformance may only de-escalate.* That assumes carriers
are **ordered by strength**. They are not. PROSE, SELF_CHECK, EXAMPLE and OUTPUT_CONTRACT are
**heterogeneous mechanisms** — telling, checking, showing, enforcing. "EXAMPLE → PROSE" is not a
step down a ladder; it is a **replacement of one mechanism by another**.

Building a bidirectional ladder would have encoded a false ordering into the compiler permanently,
to serve one experiment. The existing MISS ladder stays untouched.

**What is verified and makes the narrow version cheap:**

| fact | consequence |
|---|---|
| `mayPropose(history, prohibitions, requirementId, from, to, …)` is **carrier-agnostic** | a replacement routes through the existing authority path with **no second proposal authority** |
| `diagnose` already returns `IMPLEMENTATION_MISS` and `STANDARD_GAP` as distinct routes | the distinction exists; what is missing is comparative evidence to reach it |
| `applyEscalation` copies `gateRole` and `carries` untouched | the operation is already structurally unable to move authority |

---

## Phase 0 — one capability, narrowly scoped

### 0.1 `proposeCarrierReplacement(requirementId, from, to, comparativeEvidence)`

Proposable **only** when qualified comparative evidence directly compared the incumbent
implementation against the proposed comparator. Not a ladder move. Not derivable from a miss.

Routes through `mayPropose` unchanged — laundering refusal, reconsideration on stronger evidence and
`TRANSITION_FORBIDDEN` all apply as they stand.

### 0.2 The minimum evidence type

`ComparativeImplementationEvidence` carries and nothing more:

```
standardVersionHash      the target, which must not move
requirementId
incumbentCarrier         comparatorCarrier
armIdentities            served-byte hashes for both
suiteHash                contexts the comparison ran on
preference               decisive counts + the interval
instrument               BLIND_EXPERT
executionValidity        all COMPLETE, or it does not qualify
```

Enough to reach `IMPLEMENTATION_UNDERPERFORMANCE` **without implying `STANDARD_GAP`**. No new
user-facing semantic question is added.

### 0.3 The proposal states what did not change

The artifact must say, and a test must assert, that `standardVersionHash` is **identical before and
after**, and that materiality, statement and gate role are untouched.

### 0.4 The closed study authorises a RETEST, not a promotion

The 13–3 result established that the *current* EXAMPLE implementation underperformed **and** that it
leaked skill internals at 59% against 29%. Because the treatment leaked, it cannot establish that
clean PROSE is intrinsically better.

Its machine-readable consequence is `CURRENT_IMPLEMENTATION_FAILED / RETEST_AFTER_IMPLEMENTATION_FIX`.
**Never `PROMOTE_PROSE`.** The closed negative stands unchanged and is not reopened.

**Phase 0 exit:** on the SEARCH evidence (not the closed study), `atelier improve` proposes
EXAMPLE → PROSE for p6, names the evidence, states no standard change, and the standard hash is
identical either side. Verified on the built binary.

---

## Phase 1 — qualify the leak repair. No claim attached.

Already shipped: labels bracketed, block fenced, ownership stated, detector on the output. Qualify
through the real provider path before any arm is built:

| gate | requirement | status |
|---|---|---|
| skill-internal `# pN` headings in output | 0 | 0/8 so far |
| verbatim served-example reproduction | 0 | 0/8 so far |
| execution valid | all COMPLETE | — |
| target EXAMPLE delivered | `servedExamples` non-empty | witnessed |

Raise to **20 invocations** before proceeding. Then **freeze the repaired implementation** — it is
never tuned against study outcomes. **This repair is product work and is not moat evidence.**

---

## Phase 2 — SEARCH. Development evidence, permanently burned.

**8 fresh contexts**, one generation per arm, both carrying the leak fix.

| arm | p6 | everything else |
|---|---|---|
| `REPAIRED_EXAMPLE` | EXAMPLE | identical |
| `PROSE_COMPARATOR` | PROSE | identical |

Same `StandardVersion 7be05d7f92222e15`, same other 18 requirements, model, runtime, request shape,
rendering, budget. `assertSemanticClosure` enforces exactly one differing component.

**Requested answer length is bounded and identical across contexts** — roughly 500–700 words. Long
enough that an argument exists to land, short enough that reading stays bounded. Length is a
property of the CONTEXT, identical in both arms, so it cannot favour either.

The expert sees randomised A/B and answers **one question**: *which is closer to how you would
actually write this?* A / B / Equally me / Neither. **No p6 labelling. No re-ratification. No
observer exercise.**

### The promotion criterion, frozen now, and asymmetric on purpose

**At n=8 a "PROSE wins 6 of 8" rule has p ≈ 0.29 under a fair coin.** A criterion shaped as a win
would promote on noise, and HOLDOUT would then be testing a carrier chosen by chance.

So SEARCH is a **screen against a clear loss**, which is what n=8 can support:

- **REPAIRED_EXAMPLE wins ≥ 5 of 8 decisive** → **STOP.** The leak, not the carrier, caused the
  original loss. Do not propose a replacement. Publishable architecture result.
- **Otherwise** → PROSE is an eligible candidate and Phase 0's proposal path runs on this evidence.

SEARCH contexts are development data, sealed as such, and the reuse guard refuses them in HOLDOUT.

---

## Phase 3 — HOLDOUT. The moat test.

**16 fresh contexts**, unseen in SEARCH, same bounded length. Blind:

$$\text{ADAPTED (Atelier-created)} \;-\; \text{REPAIRED\_EXAMPLE}$$

**Primary and only endpoint:** *which is closer to how you would actually write this?*

Context is the independent unit; replicates nested. Report the paired context-level interval **and**
the exact decisive-pair result. Nothing changes after outputs exist — not n, not carrier, not
standard, not prompts, not endpoints.

---

## Cost, now that length is bounded

| phase | pairs | words | reading |
|---|---|---|---|
| SEARCH | 8 | ~10,000 | ~40 min |
| HOLDOUT | 16 | ~20,000 | ~80 min |
| | | | **~2 hours** |

Bounding the answer length cut this from ~6 hours to ~2. Inference roughly **$6 total**, budget from
an uncensored probe before each firing.

---

## Stop conditions, and they are real

| condition | action |
|---|---|
| repaired EXAMPLE wins or does not clearly lose in SEARCH | **Stop.** The prior failure was not evidence against the clean carrier. |
| Atelier cannot produce the implementation-only proposal with the standard hash preserved | **Stop.** The adaptive-compiler moat is not mechanically demonstrated. That is the finding. |
| HOLDOUT null or negative | **Stop.** Close honestly. |

**No p7, p8, p9. No carrier fishing. No tuning the repair against outcomes.**

## The claim if it succeeds — this wording and no wider

> Atelier reconstructed and human-ratified an expert standard, kept that `StandardVersion` fixed when
> behavioural evidence showed a model-specific implementation was inferior, proposed and created a
> replacement `SkillVersion` from qualified comparative evidence, and the adapted implementation was
> preferred by the source expert on fresh blinded tasks.

**Not** universal taste reproduction. **Not** optimal carrier selection. **Not** that PROSE beats
EXAMPLE in general.

## Not in this slice

No new user workflow. No user-facing feature surface. No change to `PREFERRED → EXAMPLE`. No
modification to p6 or the other 18 requirements. The closed study is not re-run and not reopened.
