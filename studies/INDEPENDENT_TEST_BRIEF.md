# Brief for an independent test of Atelier

**SUPERSEDED on 2026-10-06. This brief is kept as the record of how the test was first described, and is not a
protocol.** The protocol is the pre-registrations in this folder (CLOSING_A, CLOSING_AW, CLOSING_B, VOICE_GATE,
VOICE_PASS, EFFICIENCY_ABLATION), each with its commands, its config and the moment it is sealed, under decisions
[0012](../docs/decisions/0012-the-closing-rules.md), 0014 and 0015. Where this text differs from them on a bar, a
size, an arm or a command, they hold and this does not.

**For a tester who did not build Atelier.** Take `main`, your own key, your own corpora and your own readers, and find
out whether what Atelier says holds. Report what you find at the same size whether it wins or loses.
[Decision 0012](../docs/decisions/0012-the-closing-rules.md) is the contract: each claim is tested once, and a FAIL
closes it for the 1.x line.

## Why an outside test

- The people who built the instruments also chose the earlier tests, and one labelled set here was written by the
  builder of the reader it tests.
- Several earlier tests could not decide anything: fourteen cases, eight texts a side.
- The project's own rule is that an instrument earns authority by measurement, and five readings added since 1.1
  have not been measured.

## Set up

```bash
git clone https://github.com/yannickYamo/atelier && cd atelier
npm ci && npm run preflight        # typecheck, lint, tests, build: stop if it is not green
node dist/cli/atelier.mjs check    # tests your backend before anything is spent
```

Node 22 or later. Read `AGENTS.md`, `docs/INSTRUMENTS.md`, `docs/RESULTS.md` and decisions 0008, 0009, 0011 and 0012.
Record the commit you test. Every harness under `studies/harness/` takes `--base-url` to run against
`tests/fixtures/scripted-backend.mjs` first, for nothing: do that before each paid run.

## First, check the fix that the earlier loss called for (no sealed study, an hour)

A skill built from twelve short answers used to say "my answers usually run about 100 words" and cut a requested
walkthrough to a third. Confirm, on a skill you build:

1. From answers with no requests: the built skill states no usual length, and says the request sets it
   (`atelier export --skill <name>`; look for "How much I write follows the request").
2. From answers that carry their request (front matter `request:` or a `## Request` then `## Answer` section): the
   request never appears in a rule, a passage or the persona; a length appears only as a record for a kind of request
   seen three times or more.
3. The 14 public benchmark cases, as a regression table only: the three that asked for depth (the PKCE walkthrough,
   rebase against merge, the UUID migration plan) are no longer cut short.
4. `atelier invoke --strict` on a request with named parts: the panel's "request coverage" line names a part that was
   left out, and one completion draft is written.

Report anything that does not behave as written. These are checks of behaviour, not claims.

## Phase 0: development, before anything is sealed

Two claims have a bar a tie does not clear: coding answers must score higher than i-have-adhd, and the voice pass must
be preferred to pasted examples. A FAIL of either is final for 1.x, so neither is sealed until development says the
product is ready. Development material never enters a test.

The method is error analysis, as Hamel Husain and Shreya Shankar teach it: one arbiter of quality, a written critique
of every failure before any metric, the critiques grouped into failure modes, and a judge trusted only once its
true-positive and true-negative rates are known.

1. **Build** the Atelier skill from the examples (20 or more, with their requests).
2. **Run** it and i-have-adhd on at least 80 development tasks of your own, judged in one session per case.
3. **Read every loss.** For each case where the Atelier answer scored lower, write one or two sentences on why, from
   the two answers and the judge's note. No categories yet.
4. **Group** the critiques into failure modes and count them. Report the list.
5. **Fix the cause, in how a skill is built.** Send the list back; a fix that names a task, or only helps one, is
   refused. `atelier fix "<the critique>"` and `atelier tend` are the product's own way to take a critique.
6. **Measure again** on the half of the development tasks no fix was written from.

Two things the literature says to try first, both to be tested and neither assumed: a skill of two or three focused
parts outperformed comprehensive documentation, and skills written without iterative checking gave no gain on
average ([SkillsBench, arXiv 2602.12670](https://arxiv.org/abs/2602.12670)). So: a shorter export against the full
one, and the strict runtime against the plug-in.

**Ready** for claim A: on the held-out half, at least 0.15 higher than i-have-adhd with a lower bound above zero.
**Ready** for claim C: the line in `VOICE_PASS_PREREGISTRATION.md`. A claim that is not ready is not sealed; say so
in the report. That is not a FAIL.

## Then the instruments, each before the claim that leans on it

| # | Study | Pre-registration | Harness | Decides |
|---|---|---|---|---|
| I0 | The judges of A and A-w, on planted good and bad answers | in `CLOSING_A` and `CLOSING_AW` | `bench/compare/judge-qualification.mjs` | whether a judge's scores may be read at all |
| I1 | Subject reader and register reading against word matching | `SUBJECT_READER_PREREGISTRATION.md` | `subject-reader-qualification.mjs` | whether `nearness=reader` and the judge's register reading may be relied on |
| I2 | Coverage reading against planted omissions | `COVERAGE_READER_PREREGISTRATION.md` | `coverage-qualification.mjs` | whether strict delivery keeps its completion draft |
| I3 | Voice gate against planted changes | `VOICE_GATE_PREREGISTRATION.md` | `voice-gate-qualification.mjs` | which gate, if any, the voice pass may use |

Each pre-registration is a DRAFT with its bars written. Seal it by a public commit before its first model call and
change no line after. If you think a bar is wrong, amend it in a commit before the run and say why.

A person confirms the planted material before any bar is read: every plant and every clean pair for I3, every
omission for I2 (each harness writes a review file and takes `--rejected <file>` or `--reviewed`). For I1, add at
least 20 register requests of your own, labelled before you run, and report them apart from the builder's 40.

## Then the four claims

The bar is the owner's: **from a corpus and a prompt, a person gets a better skill than a hand-crafted one.** The
hand-crafted skills are i-have-adhd for answers and stop-slop for writing. Each claim's analysis is a script in the
repository; seal its sha256 with the pre-registration.

| Claim | Pre-registration | Analysis | What it needs from you |
|---|---|---|---|
| A. Coding answers against i-have-adhd | `CLOSING_A_PREREGISTRATION.md` | `bench/compare/closing-quality.mjs` | 20 or more examples with their requests; 300 new tasks (80 with named parts, 30 that depend on files not shown); a priced writer model; the benchmark's judge, qualified; a second judge; a person to code a fifth of the answers blind |
| A-w. Writing against stop-slop | `CLOSING_AW_PREREGISTRATION.md` | `bench/compare/closing-quality.mjs`, `bench/compare/rubric-judge.mjs` with `rubrics/stop-slop.json` | two authors with 20 or more pieces each; 30 briefs per author with their facts; five readers per author; a person to code a fifth blind |
| B. Delivery and repeatability across domains | `CLOSING_B_PREREGISTRATION.md` | `harness/strict-delivery.mjs` | three or more skills from different kinds of work; a pilot of 20 requests per skill; 60 or more sealed requests per skill; a person to audit every delivered output |
| C. Implicit voice | `VOICE_PASS_PREREGISTRATION.md` | `harness/voice-pass.mjs`, `harness/voice-pass-score.mjs` | only if I3 passed a gate: two authors, each with a skill, a declared register and a pair bank; 15 sealed requests each; five readers per author who never see the key |

In A the primary arm is the better Atelier configuration on validation (the exported plug-in or the strict runtime),
and it must score higher than i-have-adhd: a tie fails. In A-w the primary arm is the exported plug-in. A show endpoint must clear its bar; a guard fails only on a clear loss; which is which is written
in each pre-registration.

Also free, if you are handed them: the five blind-read packets of the earlier indistinguishability study.

Optional, never blocking: Atelier against GEPA and SkillOpt with `bench/compare` (seal the test split before
anything is optimized; judge all arms of a case in one session; report cost per arm).

## Rules

- **Your material, sealed before you spend.** Tasks, splits, briefs and bars are committed before any output exists.
  The builder does not see them.
- **Describe authors, never name them.** They must have agreed to this use.
- **No model judge decides voice.** People reading blind decide; a machine reading is reported beside the author's
  own floor (`atelier fidelity --typicality` prints it), and an arm at the floor is unresolved, not passed.
- **State each run's cap before it and stop at it.** A model with no known price is refused by the harnesses and by
  `bench/compare/run.mjs`, because a cap that sees $0.00 never stops.
- **A failed reading is counted, never skipped.**
- **Do not change the standard, the rules or the code to make a test pass.** A bug you find is a finding: report it,
  and say which results it touches. Fix a harness, never a bar, and record the fix.
- **One run per sealed design.** A rerun is allowed only for the two causes 0012 names.

## What to send back

For each instrument and each claim: the sealing commit and date; the corpora described, with sizes and splits; the
result against every bar as PASS, FAIL or UNRESOLVED, with numbers and intervals; what it cost; what you would not
conclude from it; every harness fix and every deviation. Then one page that answers, plainly:

- Is the length defect gone, and did anything new break in its place?
- Which of the five new readings may be relied on?
- From examples and a prompt, is the Atelier skill better than i-have-adhd on coding answers, and than stop-slop on
  writing: on the owner's rules, and on each hand-crafted skill's own measure?
- Under strict delivery, in which domains was nothing that broke a measured rule delivered, how often did it not
  deliver, and is the output more repeatable than pasted examples?
- Did people prefer the voice pass to pasted examples?
- What should Atelier stop claiming, keep claiming, or be allowed to start claiming?

Send the raw outputs, caches and keys so every number can be recomputed.
