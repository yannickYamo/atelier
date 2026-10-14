# Atelier

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

## What is Atelier?

Atelier is an agentic system that builds AI skills from your method and examples of the work you want, runs every output through a check, and keeps improving the skill without ever changing the standard you approved. I built it because I kept hitting the same wall: perfect context, still variance. In production, a standard model suffers from "needle in a haystack" drop-offs, hallucinatory drift, and little formatting discipline. You point it at pieces written the way you want - yours, your team's, or a style you admire - and it reads them, proposes the rules behind them, and shows the evidence for each one. You approve those rules once. From then on, Atelier compiles them into a skill and does the work of holding them.

Teams ask for it in plainer words:

- "Review code the way our principal engineer does."
- "Draft every contract the way our legal team works."
- "Write the way our best product people write and reason."
- "Change the model underneath without changing how we work."

You don't need to learn how Atelier works to get there. Write down how you do the work, hand it a few finished examples, read one short screen that says what will be checked and what stays your judgement, and connect your agent. Everything else stays underneath.

I built it for three things: output that stays stable over time, less entropy from one run to the next, and writing in the voice I chose, at scale, without anyone supervising each draft.

Think of it as three things you do, and one it does for you:

1. **Give it your method and your finished work.** Each step you wrote is your rule, in your words. Where code can hold a step it is checked on every run; the rest is yours to judge, and is said to be. With no written method, it reads the rules off your examples and you approve them.
2. **Build it once.** The standard is hashed and versioned the moment you accept it. No model update, optimizer or judge can move it.
3. **Run it, and react.** Every output is written, checked and repaired, and comes back with its evaluation: each of your rules marked as verified, failed, checked in part or yours to judge, under one word that says where it stands (blocked, needs review, or verified). When something is wrong, you say so in your own words.
4. **It improves itself, and keeps a change only when it measures better.** Atelier mines its own records for what keeps going wrong, searches for a better way to carry your rules, and installs a winner only when the gate allows it.

Instead of a model that re-guesses your rules on every run, you get rules you approved, kept in a file outside the model, and a verdict on every output.

```bash
atelier new ./my-work --method how-we-do-it.md    # build: your method and your finished examples
atelier run "the next piece of work"               # run: the work, and its evaluation rule by rule
atelier fix "what was wrong"                       # react: in your own words
```

No written method yet? `atelier new ./my-work "what it is for"` reads the rules off your examples for you to
approve. Everything else the tool can do is under `atelier lab`.

```bash
atelier lab                                       # the rest: verify, material, reproduce, evolve, and the experiments
```

## Why Atelier?

- **Rules you own.** The standard is hashed and versioned, and only you can change it. Swap the model next month and the rules don't move with it.
- **Nothing invented.** In an essay or a post (`--class`) with your material bound, a made-up story, quote or figure is cut, never reworded; anywhere else it is listed for you to check. On product essays no test had used, the claim check caught all 46 planted inventions and left 39 of 48 clean drafts alone.
- **A verdict on every output.** Conformant or not, with a plain pass or fail per check, plus what wasn't measured. There's no overall score, because adding the checks up would hide the one that failed.
- **It improves without drifting.** Atelier searches for better ways to carry your rules and keeps a change only when it measures better. It can never edit a rule, and every release rolls back in one command.
- **It works where you already work.** A skill for Claude Code or Codex, `npx skills add`, a Cursor or VS Code entry, an MCP server, a CLI guard that exits 1 on a broken rule, or a single-file export for any agent. It covers writing and answers alike: code reviews, financial reports, blog posts, contracts, support replies.

The same model on the same task, with and without Atelier:

| On the same task | Without Atelier | With Atelier |
|---|---|---|
| Required rules held in full, outside blog test (the author's essays pasted in) | 2 of 9 posts | 7 of 9 posts |
| Em dashes, invisible characters, copied six-word runs (same test) | not counted | none in any post |
| Six-word runs copied from the author's pieces, per piece (the pieces given to it) | 97 | 3.6 |
| An invented story, quote or figure, in published writing | ships as written | cut, never reworded, in an essay or post with your material bound; listed anywhere else |
| Coding answers, the outside benchmark's own judge (no skill) | 3.99 | 4.39 |
| What you know about an output before you read it | nothing | a pass or fail per check |

Change the model next month and the standard doesn't move.

## How it works

Atelier runs three loops, and you make one decision in them.

The model writes; code checks and decides. You own what good means, and the machine may only look for a better way to carry it: meaning and optimization have different owners.

**Build.** A discovery agent reads your examples, proposes rules with evidence, and writes drafts of its own on your topics to find where the model drifts from you. You approve the standard once, and it's hashed. A compiler then gives each rule the least machinery that carries it: an instruction, an example, a self-check, an output contract, or nothing.

**Run.** Two drafts are written and the closer one to your range is kept. Counted rules get measured. A small model lists every specific claim and code checks each one against what you supplied. Only what broke is rewritten, and the run is recorded with its verdict. The loop is bounded: at most two repair passes, and with `--strict` a fixed number of fresh drafts, then a refusal with its reasons. Only what you required goes into the prompt as an instruction; what you merely tolerate, or what was only observed, never does.

**Improve.** `atelier fix` writes the piece again with what you said put right. With `--always` it turns your complaint into a candidate for the skill that you compare blind. `atelier tend --auto` runs a round of search, tests each candidate against a regression floor, and undoes its own install when a rule starts breaking more often.

The claim check treats writing and answers differently on purpose. Deleting an invented anecdote from an essay costs you nothing. Deleting a correct detail from a technical answer costs you the answer.

## What you see after every run

**Every run ends with its own evaluation, and a tick never says more than was checked.**

The first line says where the work stands. Under it are three layers that are different promises: your rules in your own words, what this request asked for, and whether the specifics trace to what you supplied. A rule a check read only part of is marked `~`, with the part it read and the part left to you. A rule no check can read is marked `?`. Nothing is added up into a score.

This is the layout, from the renderer, on an example run.

```text
── Evaluation · BLOCKED ──────────────────────────────────────────────────────────── $0.09 · 24 s ──
  Not usable as it stands: 1 requirement seen to fail. 2 of 7 verified, 4 left for you.

  Your rules
    ✓  Open with a Verdict section that holds one of: Approve, Request changes, Comment.
    ~  Then a Must fix section: every defect that blocks the merge, cited as path:line.
         checked, and held: a "Must fix" section, with something in it
         not checked, yours to read: every defect that blocks the merge, cited as path:line
    ~  Cite only lines the change adds.
         checked, and held: every path:line cited is a line of the material with something on it
         not checked, yours to read: whether each item carries a citation, and whether the cited
         line is the right one
    ✗  Keep the whole review under 300 words.
         found: 341 words (at most 299): long by 42
    ?  Weigh the risk of the change before the style of it.
       (no check reads the rule marked ? with nothing under it: it is yours to judge)

  Evidence
    ?  Every specific in the work is found in what you supplied
         read, and not to be relied on: 2 could not be found in it: listed for you (the claim check
         is not measured on code review)
    ✓  No passage is lifted from one of your examples
         the longest shared run is 5 words

  From your examples (not required): 0 of 1 habits kept
         not kept: No hedging words. (2 hedging words in 341)

  What was done: 2 drafts written, the better one kept · written again once for what was missing; 1
  thing is still missing

  Next: run it again. If the evaluation is wrong about your work: atelier fix "<what was wrong>"
  --evaluation
  Every check in full: add --report · Over all your runs: atelier lab eval
```

Work with judgement in it is never called verified by a machine: the card says what is left for you to read. `atelier rate <run> yes|no` records the one answer only you can give: would you use it as it is? `atelier report <run>` adds the engine's own account and the trace, and `atelier lab eval` reports every run. Agents read the same record through `--json` and the MCP check.

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
| Prompt optimizers (GEPA, SkillOpt, EvoSkill; SSO with a judge in place of a metric) | a metric someone else wrote, or a judge's preference | whoever owns the metric or the judge | by that metric or judge | only if it does | each candidate is kept, by that tool |
| **Atelier** | **your examples, approved rule by rule** | **only you** | **yes, with a pass or fail you can read** | **cut, by a measured checker** | **every release is versioned and rolls back** |

Atelier keeps the part each one is good at. It finds the rules from your examples, the way a voice tool does. It checks them on every output, the way a style checker does. It can search for a better way to carry them, the way an optimizer does. The rules stay the ones you approved.

A first head-to-head against GEPA and SkillOpt has been run, in development and at small budgets, with both searching on Atelier's own rule score: Atelier broke fewer of the author's rules in 5 of 6 comparisons, and its skills were 6 to 16 times the size of theirs. A run at a fair budget, on a sealed test, hasn't been made. The kit to do it is in [bench/compare](https://github.com/yannickYamo/atelier/tree/main/bench/compare), and the result goes here whichever way it comes out. More in [COMPARISON](docs/COMPARISON.md) and [RESULTS](docs/RESULTS.md).

## Install

```bash
git clone https://github.com/yannickYamo/atelier && cd atelier
npm install && npm run build && npm link   # puts `atelier` on your PATH
atelier setup                              # gives the coding agents in this project the Atelier MCP server
```

`atelier setup` finds Claude Code, Cursor, VS Code and Codex, adds one entry to each agent's config, and never
replaces what is there. The npm package (`@yannickyamo/atelier`) is not published yet: once it is,
`npm install -g @yannickyamo/atelier` replaces the first two lines, and `npx @yannickyamo/atelier setup` needs
nothing installed.

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

What comes next is a closing test by an independent tester. The bar: from a folder of examples and a prompt, you get a better skill than a hand-crafted one. It is tested against [i-have-adhd](https://github.com/ayghri/i-have-adhd) on coding answers and [stop-slop](https://github.com/hardikpandya/stop-slop) on writing, with delivery under `--strict` across several kinds of work and one last blind read of voice. Each claim is tested once, with its pass and fail sentences written first ([the closing rules](docs/decisions/0012-the-closing-rules.md), [the brief](studies/INDEPENDENT_TEST_BRIEF.md)). Until each is in, it isn't claimed. Before that test, one measured weakness is being worked on: an exported Atelier skill ran 16 to 38 times the size of a hand-written one, and on the one skill measured part by part most of it is your own pieces served whole. One study selected a smaller default for a skill that writes: passages from your pieces within 3,000 words in place of whole pieces within 9,000, an export of 7,121 words against 12,555, 34% cheaper a run, with no loss of quality measured on five titles; `--pieces whole --piece-budget default` serves them whole ([decision 0014](docs/decisions/0014-the-smallest-realization-that-holds-the-standard.md)). The head-to-head against GEPA and SkillOpt is optional: it can run at any time, is reported either way, and never delays or reopens a claim. The rest of the plan is in [ROADMAP](docs/ROADMAP.md).

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
