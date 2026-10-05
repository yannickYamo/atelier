# Pre-registration (draft): is an Atelier skill as good as a careful hand-written one on coding answers, and better on what it enforces?

**Status:** DRAFT, not sealed. Sealed by the tester with a public commit of this file, the task file's hash and the
analysis script's hash, before any arm answers a test task. [Decision 0012](../docs/decisions/0012-the-closing-rules.md), claim A.

## Why the earlier comparison could not decide

On the outside benchmark's 14 cases, Atelier and the benchmark's hand-written skill were a tie in every session, with
intervals crossing zero. Fourteen cases cannot see the gaps that were measured. And the Atelier skill had a defect the
cases exposed: built from twelve short answers with no requests, it stated a usual length and cut requested detail.
That is fixed (`core/compiler/scope.ts`, the CHANGELOG), and those 14 cases are where it was found, so they are a
regression table here and never part of a primary statistic.

## Material

- **Examples:** at least 20 answers, each with the request it answers (front matter `request:` or a `## Request`
  section), including requests that ask for detail and requests that ask for brevity. The same examples are given to
  every arm that uses examples.
- **Tasks:** at least 100 new coding-answer tasks written by someone who is not the builder, sealed after the
  product tag is frozen. At least a fifth ask for a walkthrough, a comparison or a plan with named parts; at least a
  tenth depend on files the agent is not shown.
- **The standard:** the Atelier skill's rules, ratified by the person who owns the examples. The hand-written skill's
  author is given the same standard before writing or revising their skill, so both arms are held to rules both knew.

## Arms (one writer model, one token limit, the same tools)

| # | Arm | Role |
|---|---|---|
| 1 | the bare model | baseline |
| 2 | the examples pasted | baseline |
| 3 | the careful hand-written skill | baseline |
| 4 | a skill a frontier model induces from the examples, then twenty minutes of expert editing | baseline |
| 5 | Atelier, the exported plug-in (`atelier export`) | **primary** |
| 6 | Atelier runtime under strict delivery (`atelier invoke --strict --answer-only`) | **primary** |
| 7 | the hand-written skill with Atelier's checks on top | reported |

Arms 5 and 6 are each compared with arm 3, and with the strongest of arms 2 to 4 as chosen on a validation split
before the test opens. They are reported apart: the plug-in is a compiled prompt, the runtime is the checked product,
and one does not stand in for the other. A refusal by arm 6 counts as a failed answer in every quality endpoint.

## Judge

The benchmark's own judge, qualified first on 20 planted bad and 20 planted good answers (at least 0.85 of each
called right). Three trials; all arms of a case judged in one session, each session judged twice with labels
reshuffled. A second judge from another model family reads a quarter; disagreement above the threshold sealed with
this file makes the claim UNRESOLVED.

## Endpoints, for each primary arm

| | Endpoint | Rule |
|---|---|---|
| P1 | better than the bare model | weighted score, one-sided 95% bound above 0 |
| P2 | not worse than the hand-written skill, and not worse than the strongest baseline | one-sided 95% bound above −0.20, each |
| P3 | no dimension clearly worse | no dimension's upper 95% bound below −0.25 |
| P4 | blockers | rate difference, upper 95% bound at most +3 points |
| P5 | the shared standard is held more often | REQUIRED rules with a measurement, counted by `atelier verify` on every answer of both arms; one-sided 95% bound above 0 against arm 3. A person codes a random tenth, blind to arm, to confirm the counts |
| P6 | requested depth is given | on the tasks with named parts, parts given as coded by a person blind to arm; not below arm 3 by more than 5 points |
| P7 | cost | dollars per delivered conformant answer, reported; no bar |

**PASS** for an arm: P1 to P6 all hold.

## Sentences

- **PASS:** "On [n] coding tasks it never saw, an Atelier skill built from [k] examples was not worse overall than a
  careful hand-written skill or [the strongest baseline], no quality dimension showed a clear loss, it gave the
  depth requests asked for, and it held the shared required rules more often. [Plug-in / runtime under strict
  delivery.] This is not a result for each dimension separately, and it covers coding answers only."
- **FAIL**, one per failed endpoint: "On [n] coding tasks it never saw, an Atelier skill built from examples failed
  [endpoint]: [estimate] against [comparator], where the bar was [threshold]."
- **UNRESOLVED:** "The quality comparison did not complete: [cause]. It is closed without a result."

## Limits

One task family, one model, one hand-written skill. A non-inferiority margin of 0.20 on a five-point scale is a
choice; at 100 cases a truly equal arm still fails P2 about one time in seven, and 0012 makes a FAIL final for the
1.x line. The tester may raise the number of tasks before sealing, never after.
