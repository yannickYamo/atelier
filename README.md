# Atelier

**A writing standard you approve once, and a model that can't quietly drift away from it.**

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

Atelier is an open-source CLI that reproduces a writing taste at scale. The taste can be yours, your team's, or a style you admire - you point it at a folder of pieces written the way you want to write, whoever wrote them. It reads that folder, finds the decisions that make the writing sound the way it does, and proposes them to you as rules, each one carrying its evidence. You approve them once. From then on every draft is written, checked against that standard, and repaired where it broke. It's MIT licensed and lives at yannickYamo/atelier.

```bash
atelier new ./writing-i-want-to-match "blog posts like these"   # read the pieces, propose the rules
atelier new ./writing-i-want-to-match --accept                   # approve them, install the skill
atelier invoke --skill writing-i-want-to-match "the launch post"  # a draft, checked and repaired
```

## Why it exists

Models write well. They don't write in a particular style on every run.

Paste your examples into a prompt and three things happen. The model lifts sentences straight out of them. It invents stories the author never lived. And a few drafts later it drifts back to its own habits, the ones you were trying to get away from. A better prompt doesn't fix this, because the model re-guesses the style from scratch on every run. A prompt optimizer doesn't fix it either, because an optimizer needs a score, and nobody can write a score for "sounds like this writer."

So the standard has to live outside the model. And someone has to own it. Once it's approved, the standard is hashed and versioned. No model update, no optimizer, no judge can change it. Only the person who approved it can.

## How it works

1. It reads your pieces and proposes rules with evidence attached: how often the writer does this thing, how often a plain model does it, and whether the rule held up on pieces the system never read.
2. You approve the standard once. Required rules instruct the model directly. The rest guide it by example.
3. Every draft gets checked. Counted rules are measured on each one. Then a small model lists every specific claim in the draft, and code checks each claim against the material you supplied. An invented figure, quote, story or claim of evidence - "I checked our logs" - is deleted rather than reworded, and listed for you, so you can put the real one in.
4. Machine-writing tells never get past the rate the writer uses them. Em dashes, runs of very short sentences, announced insights.

## What it can write

**Blog posts and essays in a writer's voice.** Tested. In blind tests on two published authors, readers ranked Atelier's version first of three, ahead of a plain prompt and ahead of a prompt with the author's own posts pasted in. It was the only version with none of the tells that give AI writing away.

**Code review comments in a maintainer's style.** A standard read from one maintainer's public review comments beat raw examples in 15 of 17 held-out contexts, at roughly 18 times less context, but that was the secondary endpoint, and the primary endpoint failed.

**Contracts, white papers and reports.** With `--class contract`, or white-paper, or financial-report, nothing passes as general knowledge: every specific has to trace to the material you supplied. Built, not yet validated with users.

**Customer support replies** in a team's voice, via `--mode respond` and `--class support-reply`. Built, not yet validated.

**LinkedIn and X posts**, with each platform's limits checked, via `--class linkedin-post` and `--class x-post`.

## Where it stands

On product essays no test had used, the claim reader caught all 45 planted inventions it read, including ones hiding in headings and tables, and left 41 of 48 clean drafts alone. A pattern check on the same material caught 11 of 46.

Two studies came back null. One came back negative. They sit next to the wins in [RESULTS](docs/RESULTS.md), because a results page that only shows wins isn't a results page. Every confirmation was pre-registered before its result existed, and every result is published.

An outside review found something I'd missed: the repair step could paraphrase an invented claim into a vaguer claim instead of removing it. That's fixed. Flagged claims are deleted in code now, and nothing downstream can keep them.

## Where it's going

Agents will write most of what a team ships. Docs, release notes, support replies, review comments, the launch post. Each of those needs a standard someone owns, and while models change every few months, the standard shouldn't.

Next up: a one-line install from npm. Skills that look after themselves over weeks, where the loop is built and tested offline. And search over how rules are carried under a fixed standard, with the judge checked against people first, which is [decision 0004](docs/decisions/0004-search-under-a-fixed-standard.md).

## How it compares

| | Where the standard comes from | Who can move it |
|---|---|---|
| A strong model with examples | re-guessed from the examples every run | every run |
| Voice tools (Spiral, Writer, Jasper) | inferred from your samples by the vendor | the vendor, or its judge |
| Style checkers (Vale, Markup AI) | rules someone writes by hand | whoever edits them |
| Prompt optimizers (GEPA, SkillOpt, SSO, EvoSkill) | a metric or judge someone else wrote | whoever owns the metric |
| **Atelier** | **the writing you chose, approved rule by rule** | **only you** |


A strong model with examples re-guesses the objective from those examples on every run. Voice tools like Spiral, Writer and Jasper infer the voice from your samples on the vendor's side, and the voice changes when the vendor re-reads or its judge feeds back into itself. Prompt optimizers - GEPA, SkillOpt, SSO, EvoSkill - optimize toward a metric or a judge that someone else wrote. Atelier is the writing you chose, approved rule by rule, changed only by you.

A strong model with a few examples gets you most of the way there on the first draft. If that's the draft you need, use it. Atelier is for the fiftieth draft, when you need the same standard on every run and a record of what changed. It also hasn't been benchmarked against any of these systems on a shared task, so treat the comparison as a description of where the standard lives, not a score. More in [COMPARISON](docs/COMPARISON.md).

## Install

```bash
git clone https://github.com/yannickYamo/atelier
cd atelier && npm install && npm run build && npm link
```

Node 22 or later. In Claude Code: `/plugin marketplace add yannickYamo/atelier`, then
`/plugin install atelier@atelier`. Steps that call a model need `ANTHROPIC_API_KEY` or any
OpenAI-compatible backend, and `atelier check` tests yours before anything is spent. Standards and outputs
stay under `~/.atelier`, with no account and no telemetry. If you have no pieces to hand,
[examples/blog](examples/blog/README.md) has a six-post corpus to try. [USAGE](docs/USAGE.md) has every command.

## How I built it

I set the direction, the architecture, and the rules the code has to keep. Coding agents wrote most of the code against written briefs, and independent audits checked their work.

Agents do the volume. A person sets the bar and owns the call. That's how Atelier works, and it's how Atelier was made.

[HOW-IT-WAS-BUILT](docs/HOW-IT-WAS-BUILT.md) says who did what, and [LESSONS](docs/LESSONS.md) says what it taught.

## Learn more

- [RESULTS](docs/RESULTS.md) and [studies/](studies/README.md): every study, pass or fail
- [USAGE](docs/USAGE.md): commands, settings, and what Atelier builds around a skill
- [ARCHITECTURE](docs/ARCHITECTURE.md): how a standard becomes a skill
- [MEASURED-RULES](docs/MEASURED-RULES.md) and [TASTE](docs/TASTE.md): the counted checks, and the reader for everything else
- [decisions/](docs/decisions/README.md): the choices the code depends on, and why
- [MEASUREMENTS.md](MEASUREMENTS.md): every figure quoted in the code, and what it rests on

## Contributing

The most useful contribution is evidence. Point Atelier at writing whose standard you know, hold some back,
and report what it got right, what sounded right and was wrong, and whether pasting the examples did as
well; negative results stay in. See [CONTRIBUTING](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
