## What this changes, and why

<!-- The defect or the gap. If a comment in the diff explains a design choice, say which. -->

## How it was verified

<!-- Not "tests pass". What did you run, and what did you observe? If a guard was added, say
     whether you polarity-tested it: does it actually fail when the thing it guards is broken? -->

- [ ] `npm test` green
- [ ] `npm run typecheck` and `npm run lint` clean
- [ ] verified against the built binary, not only the test harness

## Claims

- [ ] No documented claim got stronger than its evidence
- [ ] If a number in the docs moved, the guard that pins it still passes
- [ ] If a module became reachable or unreachable, the parked list was updated in this commit
