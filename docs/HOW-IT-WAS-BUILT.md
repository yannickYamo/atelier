# How this was built

**One person set the direction and the rules the code must keep. Coding agents wrote most of the code
against written briefs. Confirmations were pre-registered and sealed before their results existed, and
every result is published, failures included.**

The commits say `Co-Authored-By: Claude` because that is what happened. This page says who did what.

## Who did what

| | The owner | Coding agents |
|---|---|---|
| What the product is for, and who decides what "good" means | ✓ | |
| The invariants the code must keep (below) | ✓ | |
| Which studies to run, their questions and their pass bars | ✓ | |
| Briefs: what to build, with acceptance tests | ✓ | drafted some, from audits |
| The code and the tests | approved each merge | wrote |
| Audits and reviews of each change | ruled on findings | ran them, as separate sessions |
| Merging to `main` | ✓ | |

## The invariants

Five rules the code is not allowed to break, each enforced by a test:

1. **Only the owner makes a rule part of the standard.** A model proposes; a person approves.
2. **Nothing below the standard can change it.** Every automated change asserts the standard's hash.
3. **An instrument earns authority by measurement.** A check that has not passed its battery reports and
   never blocks.
4. **Nothing the person did not supply reaches a draft as fact.** Invented specifics are cut, and the cut
   is listed.
5. **Every write is atomic, and every run is recorded.** A run can be traced to the exact package that
   produced it.

## The process

- **Briefs, not prompts.** Each piece of work started from a written brief with its acceptance tests and
  a list of what not to do. Several briefs are the output of the previous round's audit.
- **Review before merge.** `main` is protected: a change reaches it through a pull request with CI on
  Node 22 and 24 (the earliest commits predate this).
  Major phases were audited by separate agent sessions reading the code cold; their findings were fixed
  or declined with a reason, and are recorded in the [CHANGELOG](../CHANGELOG.md).
- **Studies sealed by commit.** A pre-registration is committed before any output exists, so the commit
  time is the evidence. They are in [studies/](../studies/README.md), with every result, failures included.
- **Censuses in the test suite.** Tests fail when a documented command does not exist, an exported value
  is unreachable, a claim in the docs drifts from the code, or a study is not indexed.

## By the numbers

19 merged pull requests, 227 commits on `main` since 2026-08-24, over 1,700 offline tests, and 22
pre-registrations, two of them drafts. The suite drives the shipped binary end to end, against a scripted model.

## What I would do differently

Run the outside-reader study first. Most of the studies here are self-judged or surrogate-judged, and
the strongest result is still one author read by the person who built the tool.
