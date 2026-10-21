# Atelier

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-source--available-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

## What is Atelier?

**Atelier takes the standard your experts already hold work to - a method note, a policy, a folder of finished examples - and turns it into checks that run on every output. It fixes what breaks a measurable rule, hands what needs judgment to a person, and records what was checked and what wasn't. The aim is narrow: output quality held to one standard, repeatable from run to run.**

I'll say up front what this isn't, because the category is crowded and most of what's in it works on a different part of the problem.

## It isn't an eval, and it isn't an optimizer

Evals and optimizers improve the average over many runs. You measure a set, you tune, the distribution moves. That's useful work and I'm not arguing against it.

Atelier looks at this output, now, before it ships. Which rules held, which broke, the passage as evidence, and what happens next. Upstream tools make the model more likely to be right. Atelier catches the one that isn't, and names which output, which rule, and why.

**Those are different jobs and you want both.** An optimizer that lifts your pass rate has done something real, and the outputs it still misses go to a customer.

## It isn't a guardrail or a schema check

A guardrail checks a rule a developer wrote. Someone sat down, decided banned terms matter, and typed them in.

Atelier compiles the rules your experts actually hold, out of documents you already have. Before anything runs, you get a compile report in three columns:

- **measurable** - checked by code on every output
- **needs judgment** - read by a model, reported
- **not captured** - quoted back to you verbatim, with the question attached

The third column is the honest one. If your policy says "the tone should match the account's seniority," Atelier doesn't pretend to have operationalized that. It hands the sentence back and asks what you meant.

**A rule a model reads never blocks until it has proved its error rate on your own labels.** A counted rule - a banned term, a required section, a length - blocks from day one. Code decides it, no label needed. I want to say that plainly because the two get conflated and the trust you extend should be different.

## What it checks

The counted layer: required sections and fields, allowed values, lengths and counts, banned terms, a cited line that exists in the material, every specific traced back to material you supplied.

Then the step-specific layer. Figures that reconcile, cross-field rules - a check a model writes for that step, grounded on your examples. It reports until it's qualified on edits of your own examples that break only that step. Only then may it block.

Then judgment rules: "the span supports the label," "severity matches the evidence." A model reads these and quotes the passage back. Reported until qualified on your labels.

And then what it couldn't read at all, shown verbatim, for you.

## How outputs change

A rewrite happens only where a measurable rule broke. The rewrite is kept only if it re-verifies clean on every rule it touched. **A rewrite that changes a claim or a figure is refused** - I'd rather hand you a blocked output than a quietly edited number.

An omission is a different animal. A missing section isn't something you repair in place; the work is written again, in a run. In verify it stays blocked and says so.

Judgment goes to a person, with the passage. Their rulings qualify the reader. The standard itself never changes unless you change it.

## Who decides what good means

You do. Every rule is approved before it binds. Rules are versioned by content, apart from the model, so a model's reading cannot alter what you ratified.

A new reader model starts unqualified: it reports only, until your labels qualify it. A new writer model is held to the same standard on every output. What doesn't exist yet is a gate that re-verifies a new model against your labels before it goes live. I'd like that. It isn't built.

## Where it plugs in today

**CLI.** `verify` and `run`, with one JSON record head on both: schema, state, standard, skill version, certificate, record. Exit 1 when a required rule broke, exit 2 when it couldn't check.

**Claude Code hook.** `verify --hook` reads the hook event and exits 2 with the broken rules, only when something required failed. Otherwise 0 - including when it couldn't check.

**MCP.** `atelier_verify`, `atelier_rules`, `atelier_new`, `atelier_run`, `atelier_report`, `atelier_rate`, `atelier_fix`, for Claude Code and Codex.

**CI.** `verify` as a step. A broken required rule fails the check.

One caveat worth stating rather than burying: verify takes one file at a time. A folder is a shell loop. I'm not going to call that "a folder of outputs in one call," because it isn't.

Not built, and not available: a Python or TypeScript SDK, a hosted endpoint, a labeling queue, asynchronous reading. Those are next.

On latency: counted checks run offline in milliseconds. The invented-claim reader and the judgment reader are model calls in the request path when a key is set. There's no asynchronous path yet.

## Two modes for skill authors

**Portable.** The exported skill carries your method into Claude Code or Codex. It cannot guarantee the agent obeyed it.

**Guarded.** Verify runs on every output - in `run`, in CI, through the hook, or through the MCP tool - and the record says what held.

```bash
atelier new ./examples --method how-we-do-it.md --name my-skill   # from your method and your work
atelier skill "lead with the action, number the steps"            # from rules you state
atelier run "write the release notes for v2.1"                    # drafted, checked, repaired, recorded
atelier verify --skill my-skill draft.md --repair                 # check or fix any text
atelier verify --skill my-skill --hook                            # as a Claude Code hook: exit 2 blocks
atelier fix "the opening was too abstract"                        # correct a piece, or the skill
```

## Voice

Voice is where I want to be most careful, because it's where the temptation to oversell is strongest.

Atelier holds your method. It keeps every specific traced to your material. It holds your counted habits - the contraction rate, the dash rate, the things you do without noticing. It keeps machine tells out.

What it does not yet do is make a model sound like you from a few pieces. We tested that. I'd rather say it than claim otherwise.

## What is measured

Every figure below comes from a study in `studies/`, with the design and the failures kept alongside it. Most of this is development evidence, not sealed.

| claim | result | status |
|---|---|---|
| Nothing invented | 0 invented claims in 60 outputs across two corpora; the other arms carried 37 to 67 flagged specifics per corpus | sealed |
| The method holds | code review: checklist 7 of 10, defect cited 9 of 10, every other arm 0 of 10; contracts: 10 of 10, matched by one skill creator's skill | development |
| Counted rules hold | 31% of answers broke a counted rule, against 76% for a hand-written skill never shown the rules | development |
| Invented specifics caught | 46 of 46 planted inventions; clean drafts left alone 39 of 48 and 35 of 38 | sealed |
| Sounds like the author | ranked first blind on single pieces; the pre-registered gate failed | closed, not claimed |

A few readings worth pulling out. On the code review arm, the planted defect was cited within two lines 9 times in 10, and every other arm scored 0 of 10 on the checklist. On the contracts arm, ten term sheets came back 10 of 10 - and so did a skill creator's skill, which is the comparison I'd want to see if I were you.

The invented-specifics run used product essays no test had touched. All 46 planted inventions were caught. A pattern check on the same material caught 11. Clean drafts were left alone 39 times in 48.

What isn't established: a sealed win against a hand-written skill, error bounds on a real customer stream, and the compile front door on arbitrary SKILL.md files. That last one is in progress.

## The offer

Send one policy and the last thousand outputs of one workflow, in whatever form they're in. Back comes how many broke your own rules, rule by rule, with the passage. The first report costs nothing.

You'll still be the one who decides what the broken ones mean. The reading moved; the answering didn't.

## Install

The repository is public under a source-available license (see [LICENSE](LICENSE)): you may use and redistribute
unmodified copies; changes are made only by the authors.

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

Code changes are made by the authors only; the license allows no modification by anyone else. The
contribution that is open to everyone is evidence. Point Atelier at work whose standard you know,
hold some back, and report what it got right, what sounded right and was wrong, and whether pasting the
examples did as well; negative results stay in. See [CONTRIBUTING](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
