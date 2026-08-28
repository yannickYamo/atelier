# The study harness

Everything that DECIDES anything lives in `core/contract/` and ships in the product. This directory
holds one runner that chooses parameters and nothing else.

## Why the split matters

Both studies this repository published were executed by a throwaway script in `/tmp`. The validity
gate, the 0.35 diversity ceiling, arm hashing, the scoring rule and the paired bootstrap lived there
and nowhere else, while `core/contract/` — the code a user installs — had never executed a study.
A paper measured an instrument the product did not contain, and a user ran an instrument the paper
had not measured.

Those scripts are **not preserved here as runnable code, deliberately**. A retired copy sitting in
the tree is the thing somebody reaches for in three weeks because it is easier, and it would
disagree with the product silently. What is preserved is the auditable artifact — the sealed suites
and the labelled generations in `studies/` — plus the study documents describing exactly what was
executed.

## Where each rule now lives

| rule | owner |
|---|---|
| near-duplicate ceiling, and the ledger of what it rejected | `core/contract/diversity.ts` |
| sealing, suite identity, scoring, execution, reduction to the context | `core/contract/study.ts` |
| paired context bootstrap | `core/contract/analysis.ts` |
| arm bytes, request shape, run identity | `core/contract/study-identity.ts` |
| the uncensored-budget rule | `core/contract/budget-probe.ts` |
| direction-aware measurability | `core/contract/headroom.ts` |
| execution validity from provider termination | `core/contract/run.ts` |

## Running one

Sealing and analysis need no provider and go through the binary:

```
atelier study seal    --contexts contexts.json --out sealed.json
atelier study screen  --candidates candidates.json
atelier study analyse --suite sealed.json --results results.json --control BARE \
                      --prose STANDARD_AS_PROSE --compiled COMPILED
```

Execution needs one, and imports the same modules from `dist`:

```
node studies/harness/run-study.mjs --suite sealed.json --arms arms.json
```

## The boundary, enforced

A runner may choose the behaviour, the number of contexts, the number of generations, the arms, the
seed and where output lands. It may not decide what counts as a duplicate, as fired, or as valid,
nor how an interval is computed. `tests/atelier-study-semantics-census.test.ts` fails if a rule
reappears in a runner, and it is polarity-tested against a reintroduced percentile.
