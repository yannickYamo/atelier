# Measurements asserted in source comments

Several comments in this repository state a number from a run. The runs are real and the numbers
are as recorded, but **the run records are not in this repository**, so a reader cannot check them
from the tree alone. This file lists every such claim in one place so that no number is load-bearing
without a reader knowing exactly what stands behind it.

The rule for this repository is: **no test asserts any number on this page, and no behaviour depends
on one.** They are here as the reasons a design is shaped the way it is, not as evidence for a claim
about how well it works. Where a number would otherwise decide something, the code takes the
conservative branch instead — see the `UNKNOWN` capability value, the `OBSERVE` gate posture, and
the refusal in `core/fidelity/graded-readout.ts` to treat a rate as a result.

## What each number came from

The runs below were executed against a private predecessor tree during 2026. That tree is not
public and will not be published. Nothing here is a preregistered study, none of it was blinded
unless the row says so, and none of it should be read as a validation of this system.

| Where | The claim | What it rests on |
|---|---|---|
| `core/fidelity/veto-contract.ts:15`, `core/fidelity/veto-sensor.ts:21` | two observer versions produced zero abstentions across 126 observations (v1 0/33, v2 0/33 on the same set, v2 0/60 on a fresh universe) | one internal run per version; verdict counts recorded by the harness, not adjudicated by a person |
| `core/fidelity/graded-readout.ts:4`, `core/inference/client.ts:180`, `core/distinctiveness/floor.ts:25` | three instruments produced zero abstentions across 150 observations | the 126 above plus a third instrument on 24 more; same caveat |
| `core/fidelity/judgement.ts:21`, `core/fidelity/graded-readout.ts:31` | a semantic validator carried 100% sensitivity and 7% specificity, firing on 28 of 30 expert-perfect cells | one run on one 30-cell set that a person had already marked perfect; the denominator is small and the set is not public |
| `core/fidelity/conditional-fidelity.ts:7` | 3 violations across 138 scored outputs | one study; the endpoint measured whether an output avoided situations where it could be penalised, which is the reason the file exists |
| `core/distinctiveness/floor.ts:17` | ~0.4% false-alarm evidence | measured on a different estimand and a different baseline from the one the floor governs, which is why the comment says so and why the number does not transfer |
| `core/discovery/framing.ts:25-26` | per-model recovery percentages across framings | one corpus, one pass per cell, no repetition |
| `core/discovery/union.ts:74-75` | an unguided framing overlapped a guided one at 12%; observed cross-framing range 12-63% | one recorded corpus |
| `core/inference/provider-conformance.ts:48` | four vendors passed all five probes at 200, one returned a different shape | a single conformance sweep against a live router on one day; vendor behaviour changes and this will go stale |
| `core/compiler/placement.ts:14-15` | the selector read the declared-anchor files and `SKILL.md` contributed 0% | one compile, traced by bytes served; this is the delivery defect the module was built to prevent |
| `core/comparison/resolution.ts:48` | a duplicated t-table returned t(3)=3.182 where t(2)=4.303 is correct, giving an interval 26% too narrow | arithmetic, checkable from the tree: `core/stats/t.ts` and `tests/atelier-stats.test.ts` |
| `core/golden/golden-unit.ts:112-115` | ten PRs, zero failures, one-sided 95% bound of 26% within a repo and 95% across projects | arithmetic on a stated n, checkable from the tree |

The last two rows are different in kind from the rest. They are arithmetic on stated inputs, and a
reader can reproduce them without any record from us. The others cannot be reproduced from this
repository, and that is the honest status of them.

## Why they are kept

A comment that says "this gate is OBSERVE and not ENFORCE" is unfalsifiable advice. A comment that
says "an unqualified semantic checker was measured firing on 28 of 30 expert-perfect cells, so this
gate is OBSERVE" tells the next person what would have to change for the decision to be revisited.
Deleting the numbers would leave the decisions looking arbitrary. Presenting them as validation
would be worse. Listing them here, with what they rest on, is the third option.
