# Pre-registration (draft): from examples and a prompt, is an Atelier skill better than a careful hand-written one on coding answers?

**Status:** DRAFT, not sealed. Sealed by the tester with a public commit of this file, the task file's hash and the
sha256 of `bench/compare/closing-quality.mjs`, before any arm answers a test task.
[Decision 0012](../docs/decisions/0012-the-closing-rules.md), claim A.

## The bar

Atelier exists so that someone with a folder of examples and a prompt gets a better skill than a hand-crafted one.
The hand-crafted skill here is [i-have-adhd](https://github.com/ayghri/i-have-adhd), on its own benchmark's judge.
"Better" is said in two parts, and the sentence says only what was shown:

- **on the owner's taste:** the rules the owner approved are held more often. This must be shown.
- **on the hand-written skill's own judge:** not worse overall, with no clear loss anywhere. If the Atelier skill
  scores clearly higher, the sentence says "scored higher"; if not, it says "was not worse".

## Why the earlier comparison could not decide

On the benchmark's 14 cases Atelier and the hand-written skill were a tie in every session, with intervals crossing
zero: fourteen cases cannot see the gaps that were measured. The Atelier skill also had a defect those cases exposed
(it stated a usual length learned from twelve short answers, and cut requested detail). That is fixed, and the 14
cases are where it was found, so they are a regression table here and never part of a primary statistic.

## Material

- **Examples:** at least 20 answers, each with the request it answers, including requests for detail and for
  brevity. The same examples are available to every arm that uses examples.
- **Tasks: 150** new coding-answer tasks written by someone who is not the builder, after the product commit is
  frozen. **40** ask for a walkthrough, a comparison or a plan with named parts; **15** depend on files the agent is
  not shown.
- **The standard:** the Atelier skill's rules, ratified by the person who owns the examples.
- **The writer model:** one priced model for every arm, named and frozen in the seal (`bench/compare/run.mjs` refuses
  a model with no known price).

## Arms

| # | Arm | Role |
|---|---|---|
| 1 | the bare model | baseline |
| 2 | the examples pasted | baseline |
| 3 | i-have-adhd, as published | baseline: the hand-written skill |
| 4 | i-have-adhd with the same examples pasted under it | baseline: what a person could do without Atelier |
| 5 | a skill a frontier model induces from the examples, then twenty minutes of expert editing | baseline |
| 6 | **Atelier, the exported plug-in** (`atelier export`) | **the one primary arm** |
| 7 | i-have-adhd with Atelier's checks on its answers (`atelier verify --repair`) | reported |

The plug-in is compared with arm 3 directly, and with the strongest of arms 2, 4 and 5 as chosen on a validation
split before the test opens. The strict runtime is not an arm here: its quality is reported under
[claim B](CLOSING_B_PREREGISTRATION.md). Claim A has one verdict.

## Judge

The benchmark's own judge, qualified first with `bench/compare/judge-qualification.mjs` on 20 planted good and 20
planted bad answers to tasks outside the test split (at least 0.85 of each called right, threshold sealed with the
labels). Three trials; all arms of a case judged in one session, each session judged twice with labels reshuffled. A
second judge from another model family reads the planted set and a quarter of the test; if the two agree on fewer
than 0.80 of the planted answers, the claim is UNRESOLVED.

## Endpoints (computed by `bench/compare/closing-quality.mjs`; the unit is the case)

| | Endpoint | Kind | Rule |
|---|---|---|---|
| P1 | better than the bare model | show | weighted score, lower 95% bound above 0 |
| P2 | not worse than i-have-adhd, and not worse than the strongest baseline | show | lower 95% bound above −0.20, each |
| P3 | no dimension clearly worse | guard | fails only if a dimension's upper 95% bound is below −0.25 |
| P4 | blockers | guard | fails only if the plug-in clearly has more: the 97.5% bound excludes zero |
| P5 | the owner's required rules are held more often than under i-have-adhd | show | REQUIRED rules with a measurement, counted by `atelier verify` on every answer of both arms; lower 95% bound above 0. A person codes a random, arm-stratified fifth blind to arm; below 0.90 agreement with the counts, UNRESOLVED |
| P6 | requested depth | guard | on the 40 named-part tasks, parts given as coded by a person blind to arm; fails only if the plug-in clearly gives fewer: the 97.5% bound excludes zero |
| P7 | cost | report | dollars per answer, per arm |

**A show must clear its bar. A guard fails only on a clear loss.** As a "show", an arm exactly equal on blockers
passed about one time in three at 100 tasks: that would have failed Atelier for the size of the test, not for its
answers. The guards are held at 97.5% and at zero, not at a margin, so a loss that is real and clear still fails.

**PASS:** P1 to P6 all hold. **Minimum valid units:** 140 tasks with every compared arm answered and judged; below
that, UNRESOLVED.

## Sentences (filled by the analysis script)

- **PASS:** "On [n] coding tasks it never saw, the Atelier plug-in built from [k] examples [scored higher overall
  than | was not worse overall than] the hand-written skill [and | or] the strongest baseline, no quality dimension,
  blocker rate or requested depth showed a clear loss, and it held the shared required rules more often. This is not
  a result for each dimension separately."
- **FAIL**, one per failed endpoint: "... failed "[endpoint]": [estimate] (bounds ...), where the bar was [bar]."
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
- Blockers and requested depth became guards; tasks went from 100 to 150.
- An analysis script, a judge-qualification reader and a minimum of valid units were added.
