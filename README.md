# Atelier

**Your taste, learned from your best work and owned by you.** Atelier reads what you have written,
turns the decisions behind it into a standard you approve once, and holds every AI draft to it: nothing
invented, nothing that reads as machine-written. No optimizer, judge or model update can change what
"good" means. Only you can.

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

```bash
atelier new ./my-best-posts "write me a blog post like these"   # read your work, show the rules it found
atelier new ./my-best-posts --accept                              # approve them and install the skill
atelier invoke --skill my-best-posts "write the launch post"      # a draft, checked and repaired
```

## The problem

A model can imitate your writing. It cannot tell which of your habits are decisions, keep them the same
on every run, or notice when it drifts back to its own. Paste in your examples and it lifts your
sentences and invents stories you never lived. And prompt optimizers need a score, which nobody can
write for *sounds like me*.

## What it does

- **It reads your work and proposes rules, with the evidence.** Each rule shows how often you do it,
  how often a plain model does, and whether it held on pieces it never read.
- **You approve what binds.** A rule you mark required instructs the model; the rest are shown as
  examples. The approved standard is hashed and versioned, and nothing automated can change it.
- **Every draft is checked, and only what broke is rewritten.** Counted rules are measured on every
  draft. Invented figures, quotations and stories are cut and listed, so you can add the real one. A
  small model lists every specific, and code checks each one against what you supplied.

It installs as a skill for Claude Code or Codex, a CLI guard (`atelier verify` exits 1 on a broken
rule), an MCP server, and a Claude Code hook. See [USAGE](docs/USAGE.md) for every command.

## Where it stands

**The guard works.** On product essays no test had used, the claim reader caught all 45 planted inventions
it read, in headings and tables too, and left 41 of 48 clean drafts alone, where a pattern check caught 11. Rewriting a post in Linear's style,
three ways on the same model, Atelier's was the only version that changed none of the post's claims
and added no em dash or other catalogued tell; a plain prompt added five claims and more than twice
Linear's rate of em dashes. Read blind by the owner, Atelier's was ranked first.

**The voice is starting to show.** Rewriting the same post in Addy Osmani's voice, an outside reviewer
ranked Atelier's version first of three, blind: the only one with his punctuation and register, and
nothing copied. That is one post and one reviewer, and the rhythm did not move yet. The study that
decides tests new pieces, read blind by three people, with its pass rule sealed before any output exists
([ROADMAP](docs/ROADMAP.md)).

Two studies came back null and one negative. They are listed beside the wins in
[RESULTS](docs/RESULTS.md).

## How it compares

| | Where the objective comes from | Can the target move? |
|---|---|---|
| A strong model with your examples | re-guessed from the examples every run | every run |
| Style checkers (Vale, Acrolinx) | rules someone writes by hand | when they edit them |
| Prompt optimizers (GEPA, SkillOpt, SSO, EvoSkill) | a metric or judge someone else wrote | by whoever owns the metric |
| **Atelier** | **your work, approved by you rule by rule** | **only by you** |

Atelier searches over how your rules are carried, never over the rules. It has not been benchmarked
against these systems on a shared task. More in [COMPARISON](docs/COMPARISON.md).

## Install

```bash
git clone https://github.com/yannickYamo/atelier
cd atelier && npm install && npm run build && npm link
```

Node 22 or later. In Claude Code: `/plugin marketplace add yannickYamo/atelier`, then
`/plugin install atelier@atelier`. Steps that call a model need `ANTHROPIC_API_KEY`, or any
OpenAI-compatible backend. `atelier check` tests your backend before anything is spent. Your standards
and outputs stay under `~/.atelier`. No account, no telemetry.

No writing of your own to hand? [examples/blog](examples/blog/README.md) has a six-post corpus to try.

## How it was built

I set the direction, the architecture and the rules the code must keep. Coding agents wrote most of the
code against written briefs, and independent audits checked it. Every confirmation was pre-registered
before its result existed, and every result is published, failures included.
[HOW-IT-WAS-BUILT](docs/HOW-IT-WAS-BUILT.md) says who did what, and [LESSONS](docs/LESSONS.md) says what
it taught.

## Learn more

- [RESULTS](docs/RESULTS.md) and [studies/](studies/README.md): every study, pass or fail
- [USAGE](docs/USAGE.md): commands, settings, and what Atelier builds around a skill
- [ARCHITECTURE](docs/ARCHITECTURE.md): how a standard becomes a skill
- [MEASURED-RULES](docs/MEASURED-RULES.md) and [TASTE](docs/TASTE.md): the counted checks, and the reader for everything else
- [decisions/](docs/decisions/README.md): the choices the code depends on, and why
- [ROADMAP](docs/ROADMAP.md): what is next, and what is not being built
- [MEASUREMENTS.md](MEASUREMENTS.md): every figure quoted in the code, and what it rests on

## Contributing

The most useful contribution is evidence. Point Atelier at writing whose standard you know, hold some
back, and report what it got right, what sounded right and was wrong, and whether pasting your examples
did as well. Negative results stay in. See [CONTRIBUTING](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
