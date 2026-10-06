# Pre-registration (draft): from examples and a prompt, is an Atelier skill better than a careful hand-written one on coding answers?

**Status:** DRAFT, not sealed. Sealed by the tester with a public commit of this file, the task file's hash, the
config of section "The config", and the sha256 of `bench/compare/closing-quality.mjs`, `bench/compare/axes.mjs` and
`bench/compare/failure-modes.mjs`, before any arm answers a test task.
[Decision 0012](../docs/decisions/0012-the-closing-rules.md), claim A.

## The bar

Atelier exists so that someone with a folder of examples and a prompt gets a better skill than a hand-crafted one.
The hand-crafted skill here is [i-have-adhd](https://github.com/ayghri/i-have-adhd), on its own benchmark's judge.
"Better" has two parts, and both must be shown:

- **on the hand-written skill's own judge: it scores higher.** The lower bound of the difference is above zero. A
  tie is a FAIL of this claim, however fair the tie.
- **on the owner's taste:** the rules the owner approved are held more often.

That is the bar as the owner first worded it. **The signed bar of the next section replaces it wherever the two
differ, and it alone decides the claim.** The judge's mean, the dimensions, blockers and requested depth are reported
beside it.

## The four axes of the signed bar (this section decides the claim)

One Atelier arm is read on all four axes: the exported plug-in or the runtime under strict delivery, **chosen on the
working development tasks before the test opens, by one rule: the one with fewer quality failures there, read with
this section's definition**, and never per axis. The other is reported. The comparator is i-have-adhd as published.
**Two outputs per task for every arm, everywhere in this document.** Each axis is reached at 20% fewer failures and clearly fewer; when the
comparator never fails on an axis there is nothing to reduce and the axis is not applicable.

| Axis | A failure is | Read by |
|---|---|---|
| Quality | an answer with a blocker both judge reads agree on, or a named failure mode | the qualified judge, twice; `bench/compare/failure-modes.mjs` |
| Rule anchor | an answer breaking a REQUIRED rule that has a measurement | `atelier verify` on every answer of both arms; a person audits a fifth |
| Repeatability | a task whose two outputs differ on pass or fail, or on any REQUIRED rule's verdict; under strict delivery, also delivered against refused | counted |
| Voice | a task where most of three readers pick the other arm's answer as closer to the owner's examples | three people, blind, sides seeded, on 100 of the tasks |

The owner's rules were never shown to i-have-adhd, so the rule-anchor sentence says so: it reads "held the owner's
rules", never "the other skill is worse at its own aims".

**The claim's verdict comes from the four axes and from nothing else.**

- **PASS** when every axis is reached, or is not applicable. An axis is not applicable only when it covers every
  sealed task and i-have-adhd never failed on it.
- **FAIL** when every axis is covered and one is not reached. Each axis is published as measured, and the claim
  closes.
- **UNRESOLVED** when an axis is missing or does not cover exactly its sealed tasks, trials and readers, or fewer
  than 280 tasks have every compared arm answered and judged. Never a PASS.

All four axes are required, voice included: 100 of the tasks, drawn by seed before the test opens, three readers
each.

## From answers to the verdict (the scripts decide; nothing is built by hand)

Run from the repository's root. Keep every input in one directory of your own and give each script an output
directory of its own.

```bash
# 1. the answers: each arm to its own file, under its own label, two outputs a task
node bench/compare/run.mjs --tasks tasks.jsonl --arm none --condition bare --out answers/bare.jsonl --trials 2 --cap <cap>
node bench/compare/run.mjs --tasks tasks.jsonl --arm skill:<i-have-adhd>/skills/i-have-adhd/SKILL.md --condition i-have-adhd --out answers/i-have-adhd.jsonl --trials 2 --cap <cap>
node bench/compare/run.mjs --tasks tasks.jsonl --arm skill:<export>.md --condition atelier --out answers/atelier.jsonl --trials 2 --cap <cap>
#    (the runtime arm, when it is the one chosen: --arm atelier-runtime:<build> --runtimes runtimes.json --condition atelier)

# 2. the judge, twice (the benchmark's own judge: scores-1.jsonl and scores-2.jsonl, rows {case_id, trial, condition, <dimensions>, blocker})

# 3. the failure modes, and the owner's rules, on every answer (one file of all arms; the axes read the two compared)
cat answers/bare.jsonl answers/i-have-adhd.jsonl answers/atelier.jsonl > responses.jsonl
node bench/compare/failure-modes.mjs --tasks tasks.jsonl --responses responses.jsonl --out modes.jsonl --cap <cap>
node bench/compare/verify-rows.mjs --responses responses.jsonl --skill <skill> --data <ATELIER_DATA> --out verify.jsonl

# 4. a person rules on each answer whose two judge reads disagree on the blocker (resolutions.jsonl), then the axes
node bench/compare/closing-quality.mjs --config closing-a.json --disagreements disagreements.jsonl
node bench/compare/axes.mjs --config axes.json --out axes

# 5. the verdict
node bench/compare/closing-quality.mjs --config closing-a.json --out result.json
```

`axes.json`, sealed:

```json
{
  "claim": "A", "tasks": "tasks.jsonl", "trials": 2,
  "candidate": "atelier", "handwritten": "i-have-adhd", "others": ["bare"],
  "reads": ["scores-1.jsonl", "scores-2.jsonl"],
  "modes": "modes.jsonl", "resolutions": "resolutions.jsonl", "verify": "verify.jsonl"
}
```

## The config

`closing-a.json`, sealed as written with the files' paths filled in. `bench/compare/axes.mjs` builds the first three
axis files; the voice file is the readers' choices, `{case_id, reader, chose}` with `chose` `"candidate"` or
`"comparator"`, three rows for each of the 100 tasks listed in `voice-tasks.jsonl`.

```json
{
  "claim": "A", "k": 24, "arm": "plug-in",
  "conditions": { "bare": "bare", "handwritten": "i-have-adhd", "candidate": "atelier" },
  "tasks": "tasks.jsonl", "trials": 2, "readers": 3, "minUnits": 280,
  "bar": { "reduction": 0.2 },
  "requiredAxes": ["quality", "rule anchor", "repeatability", "voice"],
  "axes": [
    { "name": "quality", "file": "axes/quality.jsonl" },
    { "name": "rule anchor", "file": "axes/rule-anchor.jsonl" },
    { "name": "repeatability", "file": "axes/repeatability.jsonl" },
    { "name": "voice", "file": "voice.jsonl", "tasks": "voice-tasks.jsonl" }
  ],
  "weights": { "correctness": 0.35, "autonomy": 0.25, "actionability": 0.2, "safety": 0.1, "concision": 0.1 },
  "scores": ["scores-1.jsonl", "scores-2.jsonl"], "reads": ["scores-1.jsonl", "scores-2.jsonl"],
  "verify": "verify.jsonl", "human": "human.jsonl"
}
```

`"arm"` is `"plug-in"` or `"runtime"`, whichever was chosen, and `"k"` the number of examples the skill was built
from. Every file named must exist: `human.jsonl` is the person's blind coding of a fifth of the answers.

## The quality axis in detail (2026-10-05)

On the quality axis a failure is an answer with a blocker both judge reads agree on, or a named failure mode
(`bench/compare/failure-modes.mjs`: withholds the deliverable, refuses without a safe path, invents context, action
not first), each reader qualified first. The Atelier arm reaches the bar when it has **at least 20% fewer failures
than i-have-adhd, and clearly fewer** (the lower 95% bound of the case-level difference above zero). The config
seals the quality axis as above. The judge's mean, the dimensions, blockers, requested depth and the audit of the
rule count (P1 to P6 below) are reported beside it and decide nothing. Answers whose two judge reads disagree on the
blocker go to a person (`--disagreements`), whose ruling `axes.mjs` requires before it writes the axis; the
disagreement rate is reported as the judge's noise. A miss is published as measured and closes the claim.

## Readiness comes before the seal

A FAIL is final for the 1.x line, and "scores higher" is a bar a tie does not clear, so this claim is sealed only
when development says it is ready ([the brief](INDEPENDENT_TEST_BRIEF.md), phase 0). On development tasks that never
enter the test, the Atelier skill is run against i-have-adhd, every loss is read and grouped into failure modes, the
causes are fixed in how a skill is built (never for one task), and the loop repeats. Development runs at most three rounds.

**The readiness line, fixed by the owner on 2026-10-06:** every counted axis (quality, rule anchor, repeatability)
has at least 20% fewer failures than i-have-adhd, with the lower bound above zero, read on development tasks that no
earlier reading used. Quality alone is not enough: a claim sealed on it could still miss on an axis that decides it.
Voice is read by people in the sealed test and is not part of the readiness line.

The 60 held-out development tasks of the second round were read under an earlier definition of a quality failure.
They are evidence, and they are not the readiness reading.
If development never reaches that, the claim is not sealed, and the README says a tie, as it does today. Not sealing
is not a FAIL.

## Why the earlier comparison could not decide

On the benchmark's 14 cases Atelier and the hand-written skill were a tie in every session, with intervals crossing
zero: fourteen cases cannot see the gaps that were measured. The Atelier skill also had a defect those cases exposed
(it stated a usual length learned from twelve short answers, and cut requested detail). That is fixed, and the 14
cases are where it was found, so they are a regression table here and never part of a primary statistic.

## Material

- **Examples:** at least 20 answers, each with the request it answers, including requests for detail and for
  brevity. The same examples are available to every arm that uses examples.
- **Tasks: 300** new coding-answer tasks written by someone who is not the builder, after the product commit is
  frozen. Each task carries `wants`: what it asks for, one of `code`, `command`, `fix`, `status` or `explain`.
  `bench/compare/failure-modes.mjs` refuses a task without it, because two of the four failure modes are decided by
  code only where the task says what a deliverable looks like. **80** ask for a walkthrough, a comparison or a plan with named parts; **30** depend on files the agent is
  not shown. At the paired spread the outside review measured on earlier sessions (SD about 0.73 a case), 300 tasks show a true gain of 0.10 about
  three times in four and one of 0.15 almost always; 150 would need 0.15 for the same odds.
- **The standard:** the Atelier skill's rules, ratified by the person who owns the examples.
- **The writer model:** one priced model for every arm, named and frozen in the seal (`bench/compare/run.mjs` refuses
  a model with no known price).

## Arms

| # | Arm | Role |
|---|---|---|
| 1 | the bare model | baseline |
| 2 | i-have-adhd, as published | the comparator: the hand-written skill |
| 3 | **Atelier, from the same examples**: the exported plug-in, or the runtime under strict delivery | **the one primary arm** |
| 4 | the Atelier configuration that was not chosen | reported |

**Which Atelier configuration is the primary arm is chosen on the working development tasks, before the test opens,**
by the rule of the axes section: the plug-in (`atelier export`) or the strict runtime (`atelier invoke --strict
--answer-only`, a refusal scored as a failed answer). The primary arm is compared with i-have-adhd, and with nothing
else. Earlier drafts also compared it with the strongest of three other baselines (the examples pasted, i-have-adhd
with the examples pasted, an induced and edited skill): that endpoint is removed. The signed bar names one
comparator, and a second one decided nothing the bar asks. Claim A has one verdict.

## Judge

The benchmark's own judge, qualified first with `bench/compare/judge-qualification.mjs` on 20 planted good and 20
planted bad answers to tasks outside the test split (at least 0.85 of each called right, threshold sealed with the
labels). Two outputs per task; all arms of a case judged in one session, each session judged twice with labels
reshuffled. The failure-mode reader is qualified the same way before its rows are used. A
second judge from another model family reads the planted set and a quarter of the test; if the two agree on fewer
than 0.80 of the planted answers, the claim is UNRESOLVED.

## What is reported beside the axes (computed by `bench/compare/closing-quality.mjs`; the unit is the case)

None of these decides the claim. They are the judge's own reading, kept so a reader can see what the axes do not show.

| | Endpoint | Kind | Rule |
|---|---|---|---|
| P1 | better than the bare model | show | weighted score, lower 95% bound above 0 |
| P2 | scores higher than i-have-adhd | show | lower 95% bound above 0 |
| P3 | no dimension clearly worse | guard | fails only if a dimension's upper 95% bound is below −0.25 |
| P4 | blockers | guard | fails only if the plug-in clearly has more: the 97.5% bound excludes zero |
| P5 | the owner's required rules are held more often than under i-have-adhd | show | REQUIRED rules with a measurement, counted by `atelier verify` on every answer of both arms; lower 95% bound above 0. A person codes a random, arm-stratified fifth blind to arm; below 0.90 agreement with the counts, UNRESOLVED |
| P6 | requested depth | guard | on the 80 named-part tasks, parts given as coded by a person blind to arm; fails only if the plug-in clearly gives fewer: the 97.5% bound excludes zero |
| P7 | cost | report | dollars per answer, per arm |

**A show must clear its bar. A guard fails only on a clear loss.** As a "show", an arm exactly equal on blockers
passed about one time in three at 100 tasks: that would have failed Atelier for the size of the test, not for its
answers. The guards are held at 97.5% and at zero, not at a margin, so a loss that is real and clear still fails.

**Minimum valid units:** 280 tasks with every compared arm answered and judged; below that, UNRESOLVED.

## Sentences (filled by the analysis script, from the axes)

- **PASS:** "On [n] coding tasks it never saw, the Atelier [plug-in | runtime] built from [k] examples met the signed
  bar against the hand-written skill on all 4 required axes. Quality: [a]% failed against [b]% for the hand-written
  skill, [c]% fewer (reached: the bar is 20% fewer and clearly fewer). ..." and so on for each axis.
- **FAIL:** "... did not meet the signed bar against the hand-written skill: [axis] not reached." followed by every
  axis's sentence.
- **UNRESOLVED:** "The quality comparison did not complete: [cause]. It is closed without a result."

## Limits

One task family, one model, one hand-written skill. The hand-written skill was not written to the owner's rules, so
P5 says the Atelier skill holds the owner's taste better, not that the other skill is worse at its own aims; P2 to
P4 are read on that skill's own judge for that reason. A margin of 0.20 on a five-point scale is a choice.

## What changed before sealing

- One primary arm (the plug-in). The strict runtime moved to claim B as a reported measure: it refuses some
  requests, a refusal is a failed answer, and it could not pass a quality bar by construction.
- The hand-written skill is i-have-adhd as published, and as published with the examples pasted, since nobody will
  rewrite a public skill to another owner's rules.
- The bar against the hand-written skill is "scores higher", at the owner's word: a tie fails. Because of that the
  claim is sealed only after a readiness check on development tasks, and the tasks went from 100 to 300.
- Blockers and requested depth became guards.
- The Atelier configuration (plug-in or strict runtime) is chosen on the working development tasks, by one rule.
- 2026-10-06, from an outside tester's read of this draft: the verdict comes from the four axes alone and a missing
  or short axis is UNRESOLVED; the axis files are built by a sealed script; the strongest-baseline endpoint is
  removed; two outputs per task is said everywhere; every task carries `wants`; the voice axis is required.
- An analysis script, a judge-qualification reader and a minimum of valid units were added.
