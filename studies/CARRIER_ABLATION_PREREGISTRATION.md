# Carrier ablation: prose vs schema. Pre-registration.

**Sealed 2026-08-23, before any data exists.**
**Harness:** `scripts/ablation-carrier.mts` in this repository (`npm run ablation:carrier`)
**Repository:** `https://github.com/yannickYamo/atelier`
**Status at sealing:** no run has been made. This machine has no API key and no local backend. The
harness has been verified against a stub with known ground truth only.

---

## 1. The claim under test

The compiler asserts, in three places, that:

> Prose describing a schema is a weaker version of the schema.

That sentence is load-bearing. It is why `OUTPUT_CONTRACT` outranks `PROSE`, why a shape-bearing rule
compiles to a contract, and why the prose restatement was **removed** from contract-carried rules at
`749200c`. It has never been measured. It is design intuition wearing a rationale's clothing.

**Why this experiment and not another.** It is the only carrier claim in the system that is measurable
**without a judge**. Schema conformance is a parse and five comparisons. No model scores another model,
no expert labels anything, and the entire failed history of qualifying a semantic instrument
(`finding_computed_vs_elicited_uncertainty`: three observers, 150 observations, zero abstentions) does
not apply.

---

## 2. Design

Three arms, all built through the **real compiler** and served through the **real invocation path**
(`componentFor` → `renderAgentSkill` → `runOnce`). Carriers are chosen by the compiler from declared
materiality, never named directly.

| arm | requirements | carriers the compiler picks | what the provider receives |
|---|---|---|---|
| **PROSE_ONLY** | house rule + shape stated in words | `PROSE`, `PROSE` | the free-text schema `{piece: string}` |
| **SCHEMA_ONLY** | house rule + shape as `outputShape` | `PROSE`, `OUTPUT_CONTRACT` | the compiled JSON Schema |
| **BOTH** | house rule + shape in words + shape as `outputShape` | `PROSE`, `PROSE`, `OUTPUT_CONTRACT` | the compiled JSON Schema, and the prose in `SKILL.md` |

**BOTH is Atelier before `749200c`.** SCHEMA_ONLY is Atelier as it ships today. So this is a test of
that change, not only of the carrier.

`n` tasks per arm, tasks fixed and listed in the harness. Measurement is deterministic: `parsesClean`,
`neededFenceStrip`, `hasAllFields`, `typesOk`, `noExtraFields`, and strict `conformant` (all of them,
with no fence).

---

## 3. Sealed predictions

**P1. SCHEMA_ONLY and BOTH will be 100% conformant, and this is not a finding.** The provider enforces
the schema, so those arms cannot fail this measurement. Saying so in advance prevents a trivially
guaranteed result being reported later as a demonstration.

**P2. PROSE_ONLY strict conformance: point estimate 45%.** Sealed interval 20% to 75%. This is the
number the experiment exists to produce.

**P3. The dominant failure mode will be the code fence and extra fields, ahead of type errors.** A
model told "raw JSON only, no code fence" wraps it in a fence anyway, and adds a `rationale` field
nobody asked for, more often than it returns `confidence` as `"high"`.

**P4. SCHEMA_ONLY and BOTH will be indistinguishable.** The schema dominates, so removing the prose
restatement cost nothing **on this instrument**. Any real cost would be in content quality, which this
cannot see. If they do differ structurally, that is noise at this `n` and must not be read as signal.

**P5. Decision rule, fixed now so the result cannot be reinterpreted after it arrives:**

| PROSE_ONLY strict conformance | what it means | what changes |
|---|---|---|
| **≥ 90%** | the rationale is **overstated** for a frontier model. The carrier buys certainty, not accuracy | rewrite the three compiler rationale comments and the README carrier row to claim a guarantee rather than a hit-rate improvement |
| **70% to 90%** | supported as a **guarantee** claim, unsupported as an **accuracy** claim | soften the comments to say exactly that |
| **≤ 70%** | supported as written. The carrier buys roughly 30 points of conformance on top of the guarantee | leave the rationale, and cite this run in it |

---

## 4. Declared limits, before the fact

**Arm PROSE_ONLY still runs in structured-output mode**, for `{piece: string}`. That is exactly what
Atelier does for any rule without an `outputShape`, so it is the correct comparison and not a flaw. It
does mean the result is about prose-versus-schema **within** a structured-output call, not about
free-form generation.

**Fence stripping is a generosity and is reported separately.** A response wrapped in ```` ```json ````
fails strict conformance, because the instruction explicitly forbids it, but `parses` counts it. Both
numbers are printed.

**The instruction is written in good faith.** A weak one would rig the result and the finding would be
about the writing rather than about carriers. Its exact text is in the harness and in the result file.
If a better instruction exists, the run should be repeated and this record replaced rather than
amended.

**`n` is small and the intervals are wide.** At `n = 12` with zero failures, the exact one-sided 95%
bound is about 22%, so this run cannot distinguish 90% from 99%. It can comfortably distinguish 45%
from 95%, which is the distinction P5 turns on.

**One model, one provider, one shape, one task family.** It says nothing about another model, which is
precisely why `RuntimeBinding` exists. The shape is a natural fit for the analysis tasks used; a shape
fighting its task would score worse.

**Structural conformance only.** A carrier producing perfectly shaped worthless output scores 100%.
Nothing here says whether any answer is good.

---

## 5. Why this matters beyond one comment

The durable advantage this project is building is not the architecture, which is MIT and copyable. It
is accumulated knowledge of **which carrier actually works for which kind of decision on which target
model**, learned without ever learning a new definition of good on the user's behalf.

This is the first entry in that table, and the first carrier effect the system can measure with no
judge and no expert hours. If the method holds, the same shape of experiment extends to `EXAMPLE`
versus `PROSE` for realization-strict rules, and to `SELF_CHECK` versus `PROSE` for boundaries, though
neither of those has a judge-free measurement yet and that is the harder problem.

---

## 6. To run it

```bash
export ANTHROPIC_API_KEY=sk-...
npm run ablation:carrier -- --n 12 --cap 1.00
```

Roughly 36 calls. The result file records the shape, the exact instruction, the runtime binding, the
tasks, and per-arm counts with every failure described. Publish it against these predictions whatever
it says.
