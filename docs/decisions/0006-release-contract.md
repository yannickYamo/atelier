# 0006. The release contract, and the moat it answers to

**Status.** Proposed 2026-09-30 and never signed. [0012](0012-the-closing-rules.md), signed on 2026-10-05, is the
binding record and amends this one: only what 0012 keeps of it operates (the goal of four domains in five, first
counted in claim B, and the table of what blocks a release). Recorded in
[0014](0014-the-smallest-realization-that-holds-the-standard.md). The text below is kept as proposed.

**Context.** Four outside rounds in one week moved Atelier back and forth: each fix was tested against the
probe that reported it, and the regression showed up in the next outside run. Nothing measured Atelier's
own changes on real models before they merged, the balance between conflicting goals lived in code
comments, and an unmeasured instrument was allowed to delete text. This record fixes the target, the
numbers that may block a release, and how they are measured, before any run.

## The moat (the owner's words)

> An agent (skill, harness, tools, loop, guardrails) that detects taste at scale and reproduces it at scale
> across contexts (blog posts, LinkedIn writing, contract drafting, financial reports, customer support),
> better than what exists today and than a standard model, with near-zero variance, repeatable, and
> integrable into any structure. "Write me a blog post in the style of the golden samples", or "a financial
> report like these": Atelier should be the best system to execute it.

**As a measurable claim** (the whitepaper's rules applied: a judge may block, never promote; final evidence
is a blind human read; comparative, never an absolute score):

> In a domain with at least 30 example pieces (below 30, exploratory only), a skill Atelier builds (under 10
> minutes, under $2) is preferred over the strongest baseline in at least 60% of blind pairwise reads on a
> sealed test set, by readers who are not the owner and are not shown the standard; it invents no more
> claims than that baseline; its run-to-run spread on the counted metrics is at least 30% lower; in at least
> four of the five named domains, with no domain worse than the baseline. The strongest baseline is the best
> of: the same model with the examples in the prompt; a skill a frontier model induces from the same
> examples; and that induced skill after twenty minutes of expert editing.

A qualified judge may screen, order and block toward this claim. It is decided only by the human read.
Nothing in the README states the claim until that read has passed.

## What blocks a release

Measured by `bench/` on every release candidate, side by side with the previous release in the same
judging session (judge scores move about 0.1 between sessions on identical answers).

| Metric | Blocks when | Instrument |
|---|---|---|
| Required rules held, blog | fewer than 7 of 9 posts | counted |
| Machine tells, invisible characters, copied 6-word runs | any in an Atelier output | counted |
| Invented work or results in answers | any delivered | patterns, plus a hand-checked sample |
| Correct sentences cut, answers | more than 1 per 42 answers | the claim battery, hand-checked |
| Claim battery: planted inventions caught | recall below the last release's | the claim reader at its production settings |
| Claim battery: true sentences cut | above the last release's | same |
| Refusals of work the agent can do | any | the answer set, hand-checked |
| Explicit output formats obeyed | below 100% | counted |
| Answers delivered broken (empty items, bare labels) | any | counted |
| Runtime, coding answers | more than 0.1 below the previous release, same judging session | the benchmark's own judge, report-only for claims |
| Plug-in, coding answers | more than 0.1 below the previous release, same session | same |
| Cost per runtime answer | more than 1.5 times the previous release | metered |

**Report-only** until their instrument is qualified: any judge's preference against a baseline; voice
scores; the context judge's readings.

**May support a public claim**: counted metrics; the claim battery; a sealed blind human read. A judge
score alone never does.

## The balance between conflicting goals

- Invented work or results in an answer: 0 allowed. Correct sentences cut: at most 1 per 42 answers.
- Refusal of work the agent can do itself: 0. Asking when the request lacks what is needed: required.
- An explicit format or length in the request beats any learned presentation rule, always.
- Only a measured instrument may delete text (`core/loop/cut-authority.ts`); every other one may list.

## How changes are gated

- Any change to generation, checking, repair or compiling runs the **small bench** before merge: the claim
  battery and the 14 coding cases, one trial each (about $3).
- A release runs the **full bench** (about $15 to $25), side by side with the previous release.
- A failure found outside is added to the battery as a class, with both polarities, before it is fixed.
- Numbers in the README and CHANGELOG come from bench artifacts (`bench/runs/<version>/`), or are removed.

**Signed:** _(owner, date)_
