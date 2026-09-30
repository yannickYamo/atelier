# Atelier

**Your voice, learned from your best work, and kept in every draft an agent writes for you.** Atelier
reads what you've written, finds the decisions that make it yours, and turns them into a standard you
approve once. Every draft is then written, checked and repaired against it, with nothing invented and
nothing that reads as machine-written. No model update, optimizer or judge can change what "good" means.
Only you can.

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

```bash
atelier new ./my-best-posts "write me a blog post like these"   # read your work, find the rules
atelier new ./my-best-posts --accept                              # approve them, install the skill
atelier invoke --skill my-best-posts "write the launch post"      # a draft, checked and repaired
```

## Why it exists

Models got very good at writing. So why does a draft still not sound like you?

Paste your examples into a prompt and you get something close; close is the problem. It lifts your sentences, invents stories
you never lived, and drifts back to its own habits a few drafts later. A better prompt won't fix that,
because the model re-guesses your style on every run. A prompt optimizer won't either, because nobody
can write a score for *sounds like me*.

**The standard has to live outside the model, and it has to be yours.**

## How it works

1. **It reads your work and proposes the rules behind it, with evidence.** For each rule you see how
   often you do it, how often a plain model does, and whether it held on pieces it never read.
2. **You approve the standard once.** It's hashed and versioned. Required rules instruct the model and
   the rest guide it by example. Nothing automated can edit it.
3. **Every draft is checked, and only what broke gets rewritten.** Counted rules are measured on every
   draft. A small model lists every specific claim and code checks each one against what you supplied.
   Invented figures, quotes and stories are cut and listed, so you can add the real one.

It ships as a skill for Claude Code or Codex, a CLI guard (`atelier verify` exits 1 on a broken rule), an
MCP server your agents can call on their own output, and a Claude Code hook. [USAGE](docs/USAGE.md) has
every command.

## What it does today

**The guard is proven.** On product essays no test had used, the claim reader caught all 45 planted
inventions it read, in headings and tables too, and left 41 of 48 clean drafts alone. A pattern check
caught 11 of 46.

**The voice works.** In blind tests on two published authors, readers ranked Atelier's version first of
three: ahead of a plain prompt, and ahead of a prompt with the author's own posts pasted in. It was the
only version with none of the tells that give AI writing away, and it kept what the author never does
out of the draft, down to the punctuation.

Not everything worked. Two studies came back null and one negative, and they sit next to the wins in
[RESULTS](docs/RESULTS.md).

## How it compares

| | Where the objective comes from | Can the target move? |
|---|---|---|
| A strong model with your examples | re-guessed from the examples every run | every run |
| Voice tools (Spiral, Writer, Jasper) | inferred from your samples by the vendor | whenever the vendor re-reads you or its judge feeds back |
| Style checkers (Vale, Markup AI) | rules someone writes by hand | when they edit them |
| Prompt optimizers (GEPA, SkillOpt, SSO, EvoSkill) | a metric or judge someone else wrote | by whoever owns the metric |
| **Atelier** | **your work, approved by you rule by rule** | **only by you** |

The fair objection is that a strong model with a few examples gets you most of the way. It does, on the
first draft. Atelier is for the fiftieth, when you need the same standard on every run and a record of
what changed. It searches over how your rules are carried, never over the rules, and it hasn't yet been
benchmarked against these systems on a shared task. More in [COMPARISON](docs/COMPARISON.md).

## Where it's going

Agents will write most of what a team ships: docs, release notes, support replies, the launch post.
Each of those needs a standard that belongs to someone, because models change every few months and your
standard shouldn't.

- **One-line install** from npm, in place of clone and build.
- **Skills that look after themselves.** The loop that tends a skill over weeks is built and tested
  offline. Next it runs on live skills.
- **Search under a fixed standard.** Optimizer-class search over how rules are carried, with a judge
  checked against people before it's trusted ([decision 0004](docs/decisions/0004-search-under-a-fixed-standard.md)).
- **Beyond blog posts.** Support replies and team docs, where one standard has to hold across many
  writers.

The full list, and what's deliberately not being built, is in the [ROADMAP](docs/ROADMAP.md).

## Install

```bash
git clone https://github.com/yannickYamo/atelier
cd atelier && npm install && npm run build && npm link
```

Node 22 or later. In Claude Code: `/plugin marketplace add yannickYamo/atelier`, then
`/plugin install atelier@atelier`. Steps that call a model need `ANTHROPIC_API_KEY` or any
OpenAI-compatible backend, and `atelier check` tests yours before anything is spent. Your standards and
outputs stay under `~/.atelier`. No account, no telemetry.

No writing of your own to hand? [examples/blog](examples/blog/README.md) has a six-post corpus to try.

## How I built it

I set the direction, the architecture and the rules the code has to keep. Coding agents wrote most of
the code against written briefs, and independent audits checked it. Every confirmation was
pre-registered before its result existed, and every result is published, failures included.

**Agents do the volume. A person sets the bar and owns the call.** It's how Atelier works, and it's how
Atelier was made. [HOW-IT-WAS-BUILT](docs/HOW-IT-WAS-BUILT.md) says who did what, and
[LESSONS](docs/LESSONS.md) says what it taught.

## Learn more

- [RESULTS](docs/RESULTS.md) and [studies/](studies/README.md): every study, pass or fail
- [USAGE](docs/USAGE.md): commands, settings, and what Atelier builds around a skill
- [ARCHITECTURE](docs/ARCHITECTURE.md): how a standard becomes a skill
- [MEASURED-RULES](docs/MEASURED-RULES.md) and [TASTE](docs/TASTE.md): the counted checks, and the reader for everything else
- [decisions/](docs/decisions/README.md): the choices the code depends on, and why
- [MEASUREMENTS.md](MEASUREMENTS.md): every figure quoted in the code, and what it rests on

## Contributing

The most useful contribution is evidence. Point Atelier at writing whose standard you know, hold some
back, and tell us what it got right, what sounded right and was wrong, and whether pasting your examples
did as well. Negative results stay in; see [CONTRIBUTING](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

Your taste is the one part of the work no model can supply. Write it down once, and make every agent
keep it.
