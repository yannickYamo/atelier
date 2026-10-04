# Atelier

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

## What is Atelier?

Atelier is an agentic system that builds AI skills from examples of the work you want, runs every output through a check, and keeps improving the skill without ever changing the standard you approved. I built it because I kept hitting the same wall: perfect context, still variance. You point it at pieces written the way you want - yours, your team's, or a style you admire - and it reads them, proposes the rules behind them, and shows the evidence for each one. You approve those rules once. From then on, Atelier compiles them into a skill and does the work of holding them.

I built it for three things: output that stays stable over time, less entropy from one run to the next, and writing in the voice I chose, at scale, without anyone supervising each draft.

Think of it as four steps you walk through:

1. **Point it at examples.** It reads them and proposes the rules behind them, each with evidence: how often your examples do it, how often a plain model does, and whether it held on pieces the agent never read.
2. **Approve the rules once.** The standard is hashed and versioned the moment you accept it. No model update, optimizer or judge can move it.
3. **Every output is written, checked and repaired.** You get a plain pass or fail per check before you read a word, and only what broke gets rewritten.
4. **It improves itself, and keeps a change only when it measures better.** Atelier mines its own records for what keeps going wrong, searches for a better way to carry your rules, and installs a winner only when the gate allows it.

Instead of a model that re-guesses your rules on every run, you get rules you approved, kept in a file outside the model, and a verdict on every output.

```bash
atelier new ./examples-to-match "answers like these"         # read the examples, propose the rules
atelier new ./examples-to-match --accept                      # approve them, install the skill
atelier invoke --skill examples-to-match "the next answer"    # an output, checked and repaired
atelier tend --skill examples-to-match --auto                 # find what keeps failing, keep a fix only if it measures better
```

## Why Atelier?

- **Rules you own.** The standard is hashed and versioned, and only you can change it. Swap the model next month and the rules don't move with it.
- **Nothing invented.** A made-up story, quote or figure is cut from published writing, never reworded. On product essays no test had used, the claim check caught all 46 planted inventions and left 39 of 48 clean drafts alone.
- **A verdict on every output.** Conformant or not, with a plain pass or fail per check, plus what wasn't measured. There's no overall score, because adding the checks up would hide the one that failed.
- **It improves without drifting.** Atelier searches for better ways to carry your rules and keeps a change only when it measures better. It can never edit a rule, and every release rolls back in one command.
- **It works where you already work.** A skill for Claude Code or Codex, `npx skills add`, a Cursor or VS Code entry, an MCP server, a CLI guard that exits 1 on a broken rule, or a single-file export for any agent. It covers writing and answers alike: code reviews, financial reports, blog posts, contracts, support replies.

The same model on the same task, with and without Atelier:

| On the same task | Without Atelier | With Atelier |
|---|---|---|
| Required rules held in full, outside blog test (the author's essays pasted in) | 2 of 9 posts | 7 of 9 posts |
| Em dashes, invisible characters, copied six-word runs (same test) | not counted | none in any post |
| Six-word runs copied from the author's pieces, per piece (the pieces given to it) | 97 | 3.6 |
| An invented story, quote or figure, in published writing | ships as written | cut, never reworded |
| Coding answers, the outside benchmark's own judge (no skill) | 3.99 | 4.39 |
| What you know about an output before you read it | nothing | a pass or fail per check |

Change the model next month and the standard doesn't move.

## How it works

Atelier runs three loops, and you make one decision in them.

**Build.** A discovery agent reads your examples, proposes rules with evidence, and writes drafts of its own on your topics to find where the model drifts from you. You approve the standard once, and it's hashed. A compiler then gives each rule the least machinery that carries it: an instruction, an example, a self-check, an output contract, or nothing.

**Run.** Two drafts are written and the closer one to your range is kept. Counted rules get measured. A small model lists every specific claim and code checks each one against what you supplied. Only what broke is rewritten, and the run is recorded with its verdict.

**Improve.** `atelier fix` turns your complaint into a candidate you compare blind. `atelier tend --auto` runs a round of search, tests each candidate against a regression floor, and undoes its own install when a rule starts breaking more often.

The claim check treats writing and answers differently on purpose. Deleting an invented anecdote from an essay costs you nothing. Deleting a correct detail from a technical answer costs you the answer.

## What you see after every run

**Every run ends with its own evaluation, so you know whether you can ship it before you read it.**

The first line is the answer: conformant or not. Below it are the checks that decide it, then how close the piece sits to your own range, then the instruments that only watch. The last line says what wasn't measured. There's no overall score, because adding the checks up would hide the one that failed.

This is the layout. The claim reader's rates are its real measured ones; the rest is an example run.

```text
── Atelier · blog · release 96a48e75 · claude-opus-5 · 2 drafts ──────────────────────────── $0.38 · 41 s ──
  RESULT  NOT CONFORMANT: 1 required rule broken (c12)

  GATES  binary, every run
  FAIL  required rules   5/6 held: broken c12 (the opening paragraph: 62 words, at most 50)
  PASS  invented claims  0 delivered · 1 cut · 2 listed to check
                       claim reader (claude-haiku-4-5): caught 46/46 planted, left 39/48 clean alone, on
                       product essays
  PASS  copying          longest run shared with your pieces: 6 words (limit 12)
  PASS  format           bare request ("return only the post"): standard applied in full
  INFO  applicability    31 applied · 1 not applicable
                       1 waived, each with a reason (the material it needs is not bound)

  FIDELITY  descriptive · bands from 9 of your pieces (profile cfd55277)
    in your range     7 of 9 steering features · your reserved pieces: median 8 of 9 (n=3)
    furthest outside  cadence 0.41 (yours 0.05 to 0.32) · passive constructions 2.9 (yours 0 to 2.1)
    facts used        3 of 4 supplied

  MONITORS  shown only, never gate
    style detector    P(model-written) 0.57 · valid for claude-opus-5 · not qualified yet (atelier qualify)
    taste reader      7 followed · 0 missed · 4 unclear
                       not validated: label it with atelier taste --calibrate

  not measured: argument, stance and content (read by the taste reader, a monitor); voice beyond the 9
                       counted features
  trace: atelier report i7c41a09e2b · over runs: atelier eval --skill blog
                       would you ship it? atelier rate i7c41a09e2b yes|no
```

`atelier report <run>` adds the trace, step by step. `atelier rate <run> yes|no` records the one answer only you can give: would you ship it as is? `atelier eval` reports that per release. Agents read the same data with `atelier report --json` or the MCP tool `atelier_skill_report`.

## What's proven, and what isn't

**What Atelier counts holds up in the tests. Matching an author's voice hasn't been shown yet.**

A skill built in 90 seconds held its own against a hand-tuned one. In an outside test, Atelier built a skill from 12 example coding-assistant answers for $0.41. On the benchmark of a popular hand-written skill tuned for it, the Atelier skill scored 4.51 against 4.32 as a plug-in. Run through `atelier invoke` it scored 4.39, against 4.13 for the earlier build and 3.99 with no skill.

The invented-claim check is the piece I trust most. On product essays no test had used, it caught all 46 planted inventions and left 39 of 48 clean drafts alone. A pattern check on the same material caught 11 of 46. In a sealed study across two corpora, Atelier delivered no invented claim in 60 outputs, where plain prompting and pasted examples carried 37 to 67 flagged specifics per corpus ([INDISTINGUISHABILITY_RESULT](studies/INDISTINGUISHABILITY_RESULT.md)).

Voice is not settled, and a model judge can't settle it: in an outside study, three frontier models preferred an imitation over the real author. An independent reviewer ran the fuller loop that steers pace and rhythm, and it didn't move the author's range at about three times the cost. That loop stays off by default behind `--fidelity`. The same study tested it directly: a classifier on features no part of Atelier reads still told every arm's outputs from the authors' unseen pieces, Atelier's included, and writing against a skeleton of the author's own paragraph moves did not close the gap.

An outside test also found a real failure: an early runtime cut correct sentences from answers and scored below no skill at all. Since 0.7.0 only a measured instrument may delete text. Two studies came back null and one came back negative. They're listed next to the wins in [RESULTS](docs/RESULTS.md), at the same size, with every score in [bench/runs](https://github.com/yannickYamo/atelier/tree/main/bench/runs/0.7.0).

## How it compares

**Each of these tools finds a standard or enforces one. They differ in who can change it.**

| | Where the standard comes from | Who can move it | Checked on every output | Invented claims | A change you can undo |
|---|---|---|---|---|---|
| A strong model with examples | re-guessed every run | every run | no | not checked | nothing to undo |
| Voice tools (Spiral, Writer, Jasper) | inferred by the vendor | the vendor, or its judge | by the vendor's own checks | not the focus | the vendor's call |
| Style checkers (Vale, Markup AI) | rules written by hand | whoever edits them | yes, the rules they hold | not checked | yes, in the rule files |
| Prompt optimizers (GEPA, SkillOpt, SSO, EvoSkill) | a metric someone else wrote | whoever owns the metric | by that metric | only if the metric does | a new prompt each round |
| **Atelier** | **your examples, approved rule by rule** | **only you** | **yes, with a pass or fail you can read** | **cut, by a measured checker** | **every release is versioned and rolls back** |

Atelier keeps the part each one is good at. It finds the rules from your examples, the way a voice tool does. It checks them on every output, the way a style checker does. It can search for a better way to carry them, the way an optimizer does. The rules stay the ones you approved.

I haven't run Atelier head to head against GEPA or SkillOpt yet. The kit to do it fairly is in [bench/compare](https://github.com/yannickYamo/atelier/tree/main/bench/compare), and the result goes here whichever way it comes out. More in [COMPARISON](docs/COMPARISON.md).

## Install

```bash
npm install -g @yannickyamo/atelier      # puts `atelier` on your PATH
atelier setup                            # gives the coding agents in this project the Atelier MCP server
```

Or with nothing installed: `npx @yannickyamo/atelier setup`. It finds Claude Code, Cursor, VS Code and Codex,
adds one entry to each agent's config, and never replaces what is there. From source:
`git clone https://github.com/yannickYamo/atelier && cd atelier && npm install && npm run build && npm link`.

Node 22 or later. In Claude Code: `/plugin marketplace add yannickYamo/atelier`, then
`/plugin install atelier@atelier`. For any agent that reads skills, `npx skills add yannickYamo/atelier`
([skills.sh](https://skills.sh)); for one with no skill folder, `atelier export --skill <name> --out skill.md`.
Steps that call a model need `ANTHROPIC_API_KEY` or any OpenAI-compatible backend, and `atelier check` tests
yours before anything is spent. Standards and outputs stay under `~/.atelier`, with no account and no
telemetry. [examples/blog](examples/blog/README.md) has a six-post corpus to try, and [USAGE](docs/USAGE.md)
has every command.

## Where it's going

**More of what a team ships is written by agents: docs, release notes, support replies, review comments, reports. Each kind needs rules someone approved.**

Models change every few months. The rules shouldn't change with them.

Two tests come next. An independent reviewer runs the sealed study of voice ([B6](studies/B6_PREREGISTRATION.md)) on their own corpora, read blind by people. Then the head-to-head against GEPA and SkillOpt runs on the same tasks, writer and budget for every arm. Until both are in, voice and the optimizer comparison aren't claimed. The rest of the plan is in [ROADMAP](docs/ROADMAP.md).

## Learn more

- [USAGE](docs/USAGE.md): commands, settings, and what Atelier builds around a skill
- [RESULTS](docs/RESULTS.md) and [studies/](studies/README.md): every study, pass or fail
- [LESSONS](docs/LESSONS.md): what building it taught, each with its evidence
- [ARCHITECTURE](docs/ARCHITECTURE.md): how a standard becomes a skill
- [INSTRUMENTS](docs/INSTRUMENTS.md): every instrument, what it was validated on, and whether it may steer, gate or only report
- [MEASURED-RULES](docs/MEASURED-RULES.md), [FORMATS](docs/FORMATS.md) and [TASTE](docs/TASTE.md): the counted checks, the formats, and the reader for everything else
- [decisions/](docs/decisions/README.md): the choices the code depends on, and why
- [MEASUREMENTS.md](MEASUREMENTS.md): every figure quoted in the code, and what it rests on

## Contributing

The most useful contribution is evidence. Point Atelier at work whose standard you know, hold some back,
and report what it got right, what sounded right and was wrong, and whether pasting the examples did as
well; negative results stay in. See [CONTRIBUTING](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
