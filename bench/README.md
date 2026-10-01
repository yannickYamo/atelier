# bench: how a change is measured before it ships

Decision [0006](../docs/decisions/0006-release-contract.md) says which numbers block a release. This folder
is how they are produced, so no number in the README or CHANGELOG is typed by hand.

## Coding answers (an outside benchmark)

The 14 cases, rubric and blind judge of [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd)
(MIT), fetched at a pinned commit rather than copied here:

```bash
git clone https://github.com/ayghri/i-have-adhd && git -C i-have-adhd checkout 839872f9d1cd634fed642b4589ce7226199cc15f
```

Every arm answers with the same model (`claude-opus-4-8`), through one runner (`runners/arms.py`), so each
results file has one runner as the harness requires:

| arm | what answers | how the runner is told |
|---|---|---|
| no skill | the bare model | no `<response_style>` in the prompt |
| hand-written skill | the model with `i-have-adhd`'s SKILL.md | the skill file as `--condition-skill` |
| Atelier plug-in | the model with `atelier export`'s file | the exported file |
| Atelier runtime | `atelier invoke` on the task alone | a file holding `ATELIER_RUNTIME:<build>`; builds listed in `RUNTIMES_FILE` |

The Atelier skill is built by each version under test from the same 12 answers in `data/answers-12/`
(written for this benchmark on topics none of the 14 cases use), with `atelier new … --mode respond`, then
`--accept`. The previous release is built the same way in a worktree, and judged in the same session: the
benchmark's judge moves about 0.1 between sessions on identical answers, so only side-by-side counts.

## Head to head with the skill optimizers

[`compare/`](compare/README.md) runs the same answer tasks through six arms (no skill, the hand-written
skill, the Atelier plug-in and runtime, a GEPA-optimized and a SkillOpt-optimized skill) with one writer and
one token limit, a sealed test split, and two evaluators: the benchmark's judge and `atelier score`.

## The claim reader, at its production settings

`claims/reread.mjs` re-reads the drafts the claim reader's qualification study stored (48 clean, 46 with a
planted invention) with the reader as it runs now, and compares each verdict with the stored one: paired,
exact McNemar, exact Clopper-Pearson intervals.

## Results

`runs/<version>/`: the judge's scores and a summary per judging session. `summarize.py` computes each
summary from the scores (the harness's weights, blockers, spread between trials, and a paired bootstrap by
case for the new build against the comparator), and the summary is what the README and CHANGELOG quote.

For 0.7.0: `full-rc1/` is the full bench (14 cases × 3 trials) of the first candidate, against 0650801 and
against the hand-written skill; `small-before-tells/` is the small bench (14 cases, one trial) of the final
wording before the short-piece tells fix, and `small/` the same for the shipped build, each judged in one
session beside 0650801's answers to the same cases; `claims/` is the claim reader re-read.
