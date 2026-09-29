# Product metrics

**How easy the first run is, measured at each release. A number only moves here when it was measured.**

| Metric | 0.4.0 | 0.5.0 | Target |
|---|---|---|---|
| Commands from a folder to an installed skill, without a terminal | 5, plus a setting found in the docs | 2 | 2 |
| Words printed on the first run, to the review screen | 2,985 | 960 | under 1,000 |
| Words printed accepting the rules and building | 2,919 + 2,779 | 228 | under 300 |
| Words printed around a 500-word post | 1,230 | 55 | under 80 |
| First run on a backend without the default reading model | fails | proceeds, and says so | proceeds |
| Minutes of editing before a draft is published | not measured | not measured | tracked on real use |
| Share of suggested rulings the owner changes | reported by `atelier status` | reported | tracked |

**How they were measured.** 0.4.0: a first run of the shipped CLI on a six-post corpus with real models,
recorded in the ease-of-use brief. 0.5.0: the same corpus ([examples/blog](../examples/blog/README.md))
against the test suite's scripted model, offline. Scripted output is shorter than a real model's, so the
0.5.0 column is confirmed with real models before release.
