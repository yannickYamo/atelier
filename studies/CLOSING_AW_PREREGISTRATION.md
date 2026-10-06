# Pre-registration (draft): from an author's pieces and a prompt, is an Atelier skill better than a hand-written writing skill?

**Status:** DRAFT, not sealed. Sealed by the tester with a public commit of this file, the brief file's hash and the
sha256 of `bench/compare/closing-quality.mjs`, before any arm writes a test brief.
[Decision 0012](../docs/decisions/0012-the-closing-rules.md), claim A-w.

## The bar

The hand-written skill is [stop-slop](https://github.com/hardikpandya/stop-slop) (pinned at
`8da1f030185bdfe8471220585162991eaeb970e9`): eight rules and a checklist that remove machine-writing patterns from
prose, with its own five-dimension score out of 50 and its own line ("below 35: revise"). It knows nothing about any
one author. Atelier builds a skill from one author's pieces. The claim is that the built skill is better for that
author than the hand-written one, in two parts:

- **on the author's taste:** the author's approved rules are held more often, and readers do not prefer the
  hand-written skill's piece by a clear margin when asked which reads like the author. The first must be shown.
- **on stop-slop's own score:** not worse, with no dimension clearly worse.

## The four axes of the signed bar (this section decides the claim)

The Atelier arm against stop-slop as published, two outputs per brief, each axis reached at 20% fewer failures and
clearly fewer (`bench/compare/closing-quality.mjs`, `axes`).

| Axis | A failure is | Read by |
|---|---|---|
| Quality | a piece under stop-slop's own line (35 of 50) on both judge reads | the qualified rubric judge |
| Rule anchor | a piece breaking one of the author's REQUIRED rules that has a measurement | `atelier verify`; a person audits a fifth |
| Repeatability | a brief whose two pieces differ on any REQUIRED rule's verdict | counted |
| Voice | a brief where most of five readers pick stop-slop's piece as sounding more like the author | five people per author, blind |

On voice, 20% fewer failures means readers choose the Atelier piece on at least five briefs in nine. W1 to W6 below
are reported beside the axes; W5's 0.40 line no longer decides anything. Development found stop-slop ahead on its
own score by 2.4 to 3.5 points of 50 on two authors: the quality axis may well be missed, and a miss is published.

**Readiness before the seal:** on development briefs for an author not in the test, each axis is measured once; the
claim is sealed when rule anchor and voice reach the bar there. **Size:** at least 60 briefs per author, from the
spread measured in development, not the 27-brief floor below.

## Material

- **Two authors** who agreed, each with at least 20 pieces. The skill is built from the pieces it may read; the
  author ratifies the rules.
- **30 writing briefs per author**, written by someone who is not the builder after the product commit is frozen,
  each with the facts the piece may use.
- **The writer model:** one priced model for every arm, frozen in the seal.

## Arms

| # | Arm | Role |
|---|---|---|
| 1 | the bare model | baseline |
| 2 | four of the author's pieces pasted | baseline |
| 3 | stop-slop as published (SKILL.md and its three reference files) | baseline: the hand-written skill |
| 4 | stop-slop with the same four pieces pasted under it | baseline: what a person could do without Atelier |
| 5 | **Atelier, the exported plug-in** | **the one primary arm** |

The plug-in is compared with arm 3 directly, and with the stronger of arms 2 and 4 as chosen on 6 validation briefs
per author before the test opens.

## Instruments

- **stop-slop's own score:** `bench/compare/rubric-judge.mjs` with `bench/compare/rubrics/stop-slop.json` (its
  dimensions and questions, copied), all arms of a brief in one session under shuffled labels, judged twice. The
  judge is qualified first (`judge-qualification.mjs`, threshold 35 of 50, at least 0.85 of each class of 20 planted
  pieces called right).
- **The author's rules:** `atelier verify` on every piece of both arms, REQUIRED rules with a measurement.
- **Invented specifics:** the claim check on every piece, with the brief's facts as material, counted the same way
  for every arm.
- **Readers:** five per author, not the author. For each brief a reader sees two excerpts of the author's pieces
  (never one a pasted arm was shown), then the plug-in's piece and the comparator's, sides seeded, and marks the one
  that reads more like the author.

## Endpoints (the unit is the brief; `bench/compare/closing-quality.mjs` with `"claim": "A-w"`)

| | Endpoint | Kind | Rule |
|---|---|---|---|
| W1 | better than the bare model on stop-slop's score | show | lower 95% bound above 0 |
| W2 | not worse than stop-slop, and not worse than the stronger baseline, on stop-slop's score | show | lower 95% bound above −2.5 of 50, each |
| W3 | no dimension clearly worse | guard | fails only if a dimension's upper 95% bound is below −1 of 10 |
| W4 | the author's required rules are held more often than under stop-slop | show | lower 95% bound above 0; a person codes a fifth blind to arm, 0.90 agreement or UNRESOLVED |
| W5 | readers do not prefer the comparator by a clear margin | show | share choosing the Atelier piece, lower 95% bound above 0.40 |
| W6 | invented specifics | guard | fails only if the plug-in clearly delivers more than stop-slop: the 97.5% bound excludes zero |

**PASS:** W1 to W6 all hold, pooled over both authors, and no author alone fails W2 or W5 on its point estimate.
**Minimum valid units:** 27 briefs per author with every compared arm written and judged.

## Sentences

- **PASS:** "On [n] writing briefs for two authors, an Atelier skill built from each author's pieces [scored higher
  than | was not worse than] stop-slop on stop-slop's own score, readers chose its piece [x]% of the time for
  sounding like the author, and it held the author's required rules more often."
- **FAIL:** "On [n] writing briefs for two authors, an Atelier skill built from the author's pieces failed
  "[endpoint]": [estimate], where the bar was [bar]."
- **UNRESOLVED:** "The writing comparison did not complete: [cause]. It is closed without a result."

## Limits

Two authors, one model. stop-slop was not written for any author, so W4 says the built skill holds this author's
taste better, not that stop-slop fails at its own aim; W1 to W3 are read on stop-slop's own score for that reason.
W5 asks for "not clearly worse" from readers: in an earlier sealed study pasted examples read as well as Atelier,
and this test does not pretend otherwise.
