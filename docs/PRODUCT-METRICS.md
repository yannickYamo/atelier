# Product metrics

**How easy the first run is, last measured across 0.4.0 and 0.5.0. A number only moves here when it was
measured, and each says how.**

## Measured offline, the same way before and after

The six-post corpus in [examples/blog](../examples/blog/README.md), against the test suite's scripted
model. Scripted output is shorter than a real model's, so these compare versions; they are not what a
person sees.

| Metric | 0.4.0 | 0.5.0 | Target |
|---|---|---|---|
| Commands from a folder to an installed skill, without a terminal | 2, if you knew the undocumented step | 2, printed on screen | 2 |
| Words printed on the first run, to the review screen | 1,992 | 960 | under 1,000 |
| Words printed accepting the rules and building | 4,100 | 228 | under 300 |
| Words printed around the post | 256 | 55 | under 80 |

## Measured with real models

| Metric | 0.4.0 | 0.5.0 |
|---|---|---|
| Words printed before the skill was installed | 9,064, over four commands | not yet measured |
| Words printed around a 498-word post | 1,230 | not yet measured |
| First run on a gateway without the default reading model | fails | proceeds, and says so (tested offline) |

The 0.4.0 column comes from a first run of the shipped CLI by an outside tester, following the README.
The real-model run has not been repeated, so those 0.5.0 cells stay unmeasured rather than estimated.

## Tracked on real use

| Metric | Now |
|---|---|
| Share of suggested rulings the owner changes | reported by `atelier status --skill <name>` |
| Minutes of editing before a draft is published | not measured |
