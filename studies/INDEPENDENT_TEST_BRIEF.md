# Brief for an independent test of Atelier

**For a tester who did not build Atelier.** Take `main`, your own key, your own corpora and your own readers, and find
out whether what Atelier says holds. Report what you find at the same size whether it wins or loses.
[Decision 0012](../docs/decisions/0012-the-closing-rules.md) is the contract: each claim is tested once, and a FAIL
closes it.

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

## Then the instruments, each before the claim that leans on it

| # | Study | Pre-registration | Harness | Decides |
|---|---|---|---|---|
| I1 | Subject reader and register reading against word matching | `SUBJECT_READER_PREREGISTRATION.md` | `subject-reader-qualification.mjs` | whether `nearness=reader` and the judge's register reading may be relied on |
| I2 | Coverage reading against planted omissions | `COVERAGE_READER_PREREGISTRATION.md` | `coverage-qualification.mjs` | whether strict delivery keeps its completion draft |
| I3 | Voice gate against planted changes | `VOICE_GATE_PREREGISTRATION.md` | `voice-gate-qualification.mjs` | which gate, if any, the voice pass may use |

Each pre-registration is a DRAFT with its bars written. Seal it by a public commit before its first model call and
change no line after. If you think a bar is wrong, amend it in a commit before the run and say why.

For I1, add at least 20 register requests of your own, labelled before you run, and report them apart from the
builder's 40. For I3, a person confirms every plant is the kind it declares (the harness writes
`plants-for-review.md`; rerun with `--rejected <file>` or `--reviewed`).

## Then the three claims

| Claim | Pre-registration | What it needs from you |
|---|---|---|
| A. Quality on coding answers | `CLOSING_A_PREREGISTRATION.md` | 20 or more examples with their requests; 100 or more new tasks; a careful hand-written skill whose author was given the same standard; the benchmark's judge, qualified; a second judge; a person to code a sample blind |
| B. Delivery under `--strict` | `CLOSING_B_PREREGISTRATION.md`, `harness/strict-delivery.mjs` | two skills (one writes, one answers); a pilot of 20 requests; 120 or more sealed requests; a person to audit every delivered output |
| C. Implicit voice | `VOICE_PASS_PREREGISTRATION.md`, `harness/voice-pass.mjs` | only if I3 passed a gate: a skill with a pair bank and a declared register, the `pasted` and `atelier` outputs for the same unseen titles (`harness/indistinguishability.mjs`), five readers who never see the key |

Also free, if you are handed them: the five blind-read packets of the earlier indistinguishability study. Have five
people read them and score them against the sealed key.

Optional, never blocking: Atelier against GEPA and SkillOpt with `bench/compare` (read its README; seal the test
split before anything is optimized; judge all arms of a case in one session; report cost per arm).

## Rules

- **Your material, sealed before you spend.** Tasks, splits, briefs and bars are committed before any output exists.
  The builder does not see them.
- **Describe authors, never name them.** They must have agreed to this use.
- **No model judge decides voice.** People reading blind decide; a machine reading is reported beside the author's
  own floor (`atelier fidelity --typicality` prints it), and an arm at the floor is unresolved, not passed.
- **State each run's cap before it and stop at it.** A model with no known price is refused by the harnesses, because
  a cap that sees $0.00 never stops.
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
- On coding answers, where do the plug-in and the strict runtime each stand against the hand-written skill?
- Under strict delivery, was anything that broke a measured rule delivered, and how often did it refuse?
- Did people prefer the voice pass to pasted examples?
- What should Atelier stop claiming, keep claiming, or be allowed to start claiming?

Send the raw outputs, caches and keys so every number can be recomputed.
