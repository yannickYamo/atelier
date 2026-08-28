# What has to change before the next study can answer anything

Audit written after the coverage remeasurement, against code at `89f9371`. Every claim below was
checked at file:line. It is ordered by what blocks the next experiment, not by size.

## The finding that matters: the product path would reproduce the artifact

`cli/commands/contract.ts:127` still sets **`maxTokens: 1200`** — the exact cap that truncated 54 of
144 generations and produced the withdrawn `+0.167`. Measured requirement on positive contexts is a
**6606-token median** for a bare answer. The product's own contract command is provisioned at roughly
a fifth of what the work needs.

It is worse than a stale constant, because the signal that would reveal it does not exist:

| what | where | state |
|---|---|---|
| `stop_reason` propagated out of the provider | `providers/anthropic.ts:64` | **never** — read only to build an error string; `InferenceResponse` does not carry it |
| `'TRUNCATED'` produced anywhere in `cli/` or `core/` | — | **nowhere**; it appears only in `run.ts`'s own type and one test fixture |
| completeness decided in the live path | `cli/commands/contract.ts:139` | `text.trim() ? 'COMPLETE' : 'EMPTY'` — **inferred from the text** |

`core/contract/run.ts:86` states the rule the CLI then breaks, three lines above the type it breaks
it on: *"only the caller that made the request knows whether the provider stopped it. A runner that
inferred completeness from the text would be guessing at exactly the thing that must not be
guessed."*

**Stated without overclaim.** The live path uses a schema'd tool call, and a truncation that corrupts
the tool JSON may well surface as `EMPTY` and be caught. That is a *hope about provider behaviour we
have not tested*, standing where a measurement belongs — and an untested hope about truncation is
precisely what cost $3.70 and a retracted finding. The authoritative signal is one field away and is
currently discarded.

**Consequence for the plan:** the validity gate shipped in `696e3f7` is real in the study script and
**unreachable in the product**. Its tests pass because they inject a `RunSkill` that hands it a
validity directly; the real path can never hand it `TRUNCATED`. Green tests over an inert path.

## The second finding: the evidence harness is not in the product

Both studies were run by `/tmp/study/run3.mjs`, a throwaway file. Everything learned lives there and
nowhere else: the validity gate, `stop_reason` capture, the 0.35 context-diversity ceiling, arm
byte-hashing, the paired context bootstrap, the cost cap. `/tmp` is cleared on reboot.

Meanwhile `core/contract/` contains arms, a sealed suite with a search/holdout split, obligations and
a runner — and **has never executed a real study**. The instrument we trust and the instrument we
ship are different code.

## The third finding: the arm that decides the product already exists, unrun

`core/reference/arms.ts:20` defines six arms. Two of them are the controls the next study needs, and
their doc comments already say why:

- **`B3_STANDARD_AS_PROSE`** — *"the ratified standard as flat prose: no carrier selection, no
  anchored examples, no output contract. Isolates the compiler from the standard it compiled."*
- **`B4_EXPERT_ONE_PAGER`** — *"the commercial competitor, and the arm this system has the least
  right to assume it beats."*

`servedTextFor` builds each arm's bytes and `ArmInputs.standardAsProse` is already a field. There is
nothing to design. `ALL_ARMS` is not reachable from `cli/index.ts`.

## What is NOT broken, so it is not touched

The self-improvement spine is wired, not dark. `diagnose` has ten consumers across `improve.ts`,
`contract.ts`, `core/convergence/*`, `core/compiler/proposal.ts` and `core/measurement/longitudinal.ts`;
`proposeEscalation` and `applyEscalation` are consumed by `improve.ts` and `contract.ts`. **The loop
exists. What is missing is the quality of the signal entering it** — a diagnoser fed by a runner that
cannot tell "the model failed" from "the model was cut off" will route repairs off noise.

## Fix order, cheapest first, each one blocking the next study

1. **Propagate `stop_reason`.** Add it to `InferenceResponse`; return `TRUNCATED` from the live path.
   One field. It makes `EXECUTION_INVALID` reachable in the product for the first time. Polarity-test
   by forcing a low cap and asserting `TRUNCATED` is emitted where input existed.
2. **Delete the hardcoded 1200.** Budget is measured per run from an *uncensored* probe, never from a
   previous run's surviving tail — the error we made twice. A run that estimates its cap from data
   gathered under a smaller cap must refuse to start.
3. **Move the harness into `core/contract/`.** Retire `/tmp/study/run3.mjs` in the same slice, per
   reuse-don't-rebuild. The study runner and the product runner become one path or the evidence does
   not describe the product.
4. **Reach `ALL_ARMS` from the CLI** so `B3_STANDARD_AS_PROSE` can be served.
5. **A ceiling guard.** A study whose control arm scores 1.000 on an endpoint must report that
   endpoint as UNMEASURABLE rather than as a pass. Today's co-primary was "met" only vacuously; a
   zero-width interval should be an error condition, not a result.

Items 1, 2 and 5 are small and are what stop the next study from being unreadable. Item 3 is the one
that stops this recurring.
