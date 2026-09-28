# Atelier

**Hand it your best work. It writes new work the way you would, and shows you exactly why.**

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

**tl;dr:** Atelier reads a folder of your writing, finds the decisions behind it, and asks you to approve
them on one screen. What you approve becomes your standard: a versioned file you own. From then on every
draft is written from your voice, checked against your standard, and repaired where it breaks, on any
model. In a blind test the author's reader picked Atelier's draft over a model that had the author's
posts pasted into its prompt, with almost none of the copying and none of the invented stories.

```bash
atelier new ./my-best-posts "write me a blog post in the voice and style of these"
```

## The problem

If you've asked a model to write like you, you know how it goes.

- **It sounds like AI.** Em dashes, "here's the thing", "that last one deserves emphasis", "not X, it's Y".
  Readers spot it in a paragraph.
- **Pasting your examples helps, and costs you.** The model lifts your sentences, invents anecdotes you
  never lived, and drifts back to its own habits a few paragraphs in.
- **"Good" lives nowhere you can see.** It's re-guessed from examples on every run, so you can't review it,
  version it, or move it to another model.
- **Prompt optimizers need a score.** GEPA, SkillOpt and friends improve a prompt against a metric. Nobody
  can write `reward(essay)` for *sounds like me*.

## What Atelier does

1. **Reads your work.** Two independent readings find the decisions (how you open, when you concede, how
   you use evidence), and counts measure the rest (sentence length, contractions, the tells you never use).
   Every rule is checked against pieces it never read. Some of your work is held back from the start.
2. **You rule.** One screen, strongest evidence first. Nothing becomes part of your standard until you say
   yes. That approval is recorded, and the standard is a file you can diff.
3. **It writes, checks and repairs.** The skill carries a description of how you sound (each point quoted
   from your own pieces) and a few of your whole pieces. Every draft is counted against your standard, and
   only the sentences that break a required rule are rewritten.
4. **It learns from you.** `atelier fix "the answer buried the recommendation"` in your own words. Atelier
   tries another way of carrying the rule, measures it, and installs it only through a gate you control.

## What you get

- **Your voice, without the machine.** Moves you never make ("let me be blunt", "the part people miss",
  "that's the whole game") are removed. Each skill also learns the phrases its own drafts keep repeating
  that you never write (`atelier tells`).
- **Nothing invented.** A story, a quote from an unnamed source, or a figure that isn't in the material you
  gave it is cut, and listed so you can add the real one (`atelier material`).
- **No copying.** Your pieces show the voice. Reusing a long run of your sentences is flagged.
- **A guard for any text.** `atelier verify` checks anything against your standard and exits 1 on a broken
  rule, so it fits a pipeline. `--repair` fixes only what broke. The same check runs as an MCP tool.
- **The same standard on any model.** Your standard carries no model identity. Recompile it onto another
  model tomorrow.
- **It looks after itself.** `atelier tend` finds what keeps going wrong and tries fixes on a schedule;
  `atelier status --skill <name>` shows where a skill stands on one page.

## Does it work?

I tested it the hard way, in seven blind rounds on one public author's Substack (20 posts, six held back
from every version). Each round was pre-registered, and every failure is recorded in the
[changelog](CHANGELOG.md). The latest round, round 7:

| | the author's reader, blind | copied from the corpus (shared 6-word runs per piece) | invented stories | required rules held |
|---|---|---|---|---|
| **Atelier** | **picked first on both briefs read** | **3.6** | **0** | **every rule, every piece** |
| the model with the posts pasted in | ranked below Atelier | 97 | 2 | about half |
| the model on its own | ranked last | 0.6 | 0 | about half |

A second reader, blind, put Atelier first on four of five briefs and a model judge agreed. Round 7 still
failed its pre-registered gate on two counts: it left about one machine move per piece where the gate
asked for fewer, and one piece strayed outside the author's range on two habits. The first is fixed:
run back through the current guard, round 7's drafts carry no machine moves and no invented material.
The second is still open (that piece writes fewer one-line paragraphs than the author does). It has been
tested on one author so far. The design and every pre-registration are in
[studies/](studies/README.md).

## How it compares

**Against a strong model on its own, or with your examples pasted in:**

| | a model | Atelier on that model |
|---|---|---|
| where "good" is defined | re-guessed every run | a standard you approved, versioned |
| machine tells | its own habits | removed, at your own rate |
| your stories and figures | invented when missing | cut and listed; you supply the real ones |
| your sentences | lifted when pasted | shown for voice, copying flagged |
| after the draft | nothing checks it | every required rule checked and repaired |
| another model | re-prompt and hope | recompile the same standard |

**Against skill and prompt optimizers** ([GEPA](https://arxiv.org/abs/2507.19457),
[SkillOpt](https://arxiv.org/abs/2605.23904), SSO, EvoSkill): they all close their own loop, and they all
need a score someone else wrote, or let their own judge decide. Atelier's loop runs below a standard you
approved rule by rule, and it can't change that standard: the code asserts its hash on every automated
change. It borrows their search (`atelier optimize` uses reflective proposals and a Pareto screen), and
installs a change only when your measured rules say it's better and nothing else got worse.

**Against fine-tuning:** you can't diff weights against what you meant. You can diff a standard.

## Install

```bash
git clone https://github.com/yannickYamo/atelier
cd atelier && npm install && npm run build && npm link
```

In Claude Code, add the plugin. It records each `/skill` use for `atelier fix`, checks answers at the end
of the turn, and registers the checker as an MCP tool:

```text
/plugin marketplace add yannickYamo/atelier
/plugin install atelier@atelier
```

Node 22 or later. No account, no telemetry. Steps that call a model need `ANTHROPIC_API_KEY` (or
`ANTHROPIC_AUTH_TOKEN`, or any OpenAI-compatible backend with `--provider openai-compatible --base-url ...`).
`atelier check` tests the backend before you spend anything. Your standards, evidence and outputs stay
under `~/.atelier`.

## Using it

```bash
atelier new ./posts "write me a blog post like these"   # read, rule on one screen, build
/posts write the launch post                           # in Claude Code
atelier invoke --skill posts "write the launch post"    # or the CLI: written, checked, repaired
atelier verify --skill posts draft.md --repair           # guard any text
atelier fix "the close was a summary, not a turn"        # correct it in your words
atelier material --skill posts notes.md                  # your real stories and figures
atelier tend --skill posts --auto                        # look after it, from cron
```

The sentence you give `new` sets how rules are weighed: writing new work, holding copy to a standard
("ensure all our copy follows these"), or answering people ("support always answers this way"). Prefer to
state your rules yourself? `atelier skill "lead with the action, number the steps"`. A host doesn't always
deliver everything the CLI does; `atelier carriers --skill posts --host codex` says what it drops.
`atelier --help` lists everything.

| setting | what it does |
|---|---|
| `ATELIER_DATA` | where standards, skills and runs live (default `~/.atelier`) |
| `ATELIER_MODEL` | the model for every role, unless a more specific setting names one |
| `ATELIER_DISCOVERY_MODEL`, `ATELIER_TARGET_MODEL` | the model for reading your work, and for running the skill |
| `ATELIER_PROVIDER` | `anthropic` (default) or `openai-compatible`, with `ATELIER_BASE_URL` |
| `ATELIER_HOST` | `claude-code` (default) or `codex`: where a built skill is installed |

## Learn more

- [docs/MEASURED-RULES.md](docs/MEASURED-RULES.md): every counted rule, machine tells, repair, the regression floor
- [docs/TASTE.md](docs/TASTE.md): the reader for rules no count can check, and how your labels give it authority
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how a standard becomes a skill
- [studies/](studies/README.md): every pre-registration and result, including the ones that failed
- [MEASUREMENTS.md](MEASUREMENTS.md): every figure quoted in the code, and what it rests on

The suite is 103 files and 1563 tests, runs offline, and drives the shipped binary end to end.

## Contributing

The most useful contribution is evidence. Point Atelier at writing whose standard you know well, hold some
back, and tell us what it got right, what sounded right and was wrong, and whether pasting your examples
did as well. Negative results stay in. See [CONTRIBUTING.md](CONTRIBUTING.md).
