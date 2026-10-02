# Atelier

**Atelier turns examples of work you want reproduced into a standard you approve once, and it checks every output against that standard.**

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

Atelier is an open-source CLI, MIT licensed, that reads pieces written the way you want - yours, your team's, or a style you admire - and finds the rules behind them. Each proposed rule arrives with evidence: how often your examples do it, how often a plain model does, and whether it held on pieces it never read. You approve the rules once. The approved standard is hashed and versioned, and no model update, optimizer or judge can change it. Only the person who approved it can. It works for writing and for answers: blog posts, code review comments, coding-assistant answers, support replies, contracts, reports.

```bash
atelier new ./examples-to-match "answers like these"         # read the examples, propose the rules
atelier new ./examples-to-match --accept                      # approve them, install the skill
atelier invoke --skill examples-to-match "the next answer"    # an output, checked and repaired
```

## Why it exists

**A model can follow examples on the first draft. What it can't do is keep a standard someone owns.**

The rules get re-guessed on every run, and nothing checks the result. I kept hitting the same wall from both sides. A prompt optimizer needs a score somebody else wrote. A style checker needs rules somebody wrote by hand. Neither one asks you what good looks like, and neither one holds the answer still once you've given it.

So the standard has to live outside the model, be approved by a person, and be checked on every output. Three properties, and I wanted all three in one tool. Atelier ships as a skill for Claude Code or Codex, a skill installable with `npx skills add`, a single-file export for any agent or system prompt, a CLI guard that exits 1 on a broken rule, an MCP server agents can call on their own output, and a Claude Code hook. Pick the surface you already work in.

## How it works

**Five steps, and only one of them is yours.**

1. It reads the examples and proposes rules with evidence.
2. You approve the standard once. Required rules instruct the model; the rest guide it by example.
3. Every output is checked. Counted rules get measured: machine-writing tells, lengths, phrases, and what a piece must contain - sections in order, a figure where one is required, an answer that ends on its next step.
4. A small model lists every specific claim, and code checks each one against what you supplied. In published writing, an invented story, quotation or claim of evidence is deleted, never reworded. In answers, general knowledge is listed for you to check; a claim of work the agent never did, or a detail of your system you never gave it, is cut. A figure computed from your own figures counts as yours.
5. Only what broke is rewritten. A cut that would leave a fragment is redrafted once, or not made, and the check says so. Two drafts are written, and the one that lands more of its measured features inside the range your own pieces span is kept: paragraph length, sentence rhythm, punctuation. The target is your range, never your average, because an imitation is already closer to your average than you are. A fuller loop that steers pace and rhythm is there behind `--fidelity`, off by default until a study shows it pays.

That asymmetry in step 4 matters more than it looks. Deleting an invented anecdote from an essay costs you nothing. Deleting a correct detail from a technical answer costs you the answer.

## What you see after every run

**Every run ends with its own evaluation, so you know whether you can ship it before you read it.**

The first line is the answer: conformant or not. Below it are the checks that decide it, each a plain pass or fail. Then how close the piece sits to your range, next to where your own unseen pieces sit. Then the instruments that only watch, each saying whether it has been validated.

The last line says what wasn't measured. There's no overall score. Those are different kinds of evidence, and adding them up would hide the one that failed.

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

`atelier report <run>` adds the trace, step by step: the drafts, the claim check, the repair, the settings. `atelier rate <run> yes|no` asks the one question only you can answer, whether you'd ship it as is, and `atelier eval` reports that per release with its sample size. When a skill is built, the same kind of card shows what every output will be checked by. Agents read both with `atelier report --json` or the MCP tool `atelier_skill_report`.

## What the evidence shows

**I'll give you the wins and the failure in the same breath, because an outside test found the failure and I'd rather you hear it from me.**

Building a skill works outside writing. In an outside test, Atelier built a skill from 12 example coding-assistant answers in 90 seconds for $0.41. On the benchmark of a popular hand-written skill tuned for it, the Atelier skill used as a plug-in scored 4.51 against 4.32, ahead in three separate judge runs, with the lowest spread between trials (0.34 against 0.59). A 90-second artifact beating a hand-tuned one on its own eval is the result I care about most.

The runtime has caught up. Run through `atelier invoke`, the same skill first scored 3.21, below no skill at all: the claim check cut correct sentences and some answers went out with empty bullets. In 0.7.0 only a measured instrument may delete text. The benchmark's own judge read its 14 cases in one session, beside the build an outside test last measured. The runtime scored 4.39 against 4.13 (95% CI for the gap +0.07 to +0.51) and 3.99 with no skill, and the plug-in held level. One answer still asked which typo to fix when it could have said where it would look. Every score and summary is in [bench/runs](https://github.com/yannickYamo/atelier/tree/main/bench/runs/0.7.0), and [decision 0006](docs/decisions/0006-release-contract.md) says which numbers stop a release.

The invented-claim check is the piece I trust most. On product essays no test had used, re-measured at the settings it ships with, it caught all 46 planted inventions and left 39 of 48 clean drafts alone. A pattern check on the same material caught 11 of 46.

The counted guarantees hold where prompting doesn't. In the outside blog test, every Atelier post had no em dashes, no invisible characters and no copied six-word runs, and all its required rules held in 7 of 9 posts, against 2 of 9 for a prompt with the author's essays pasted in.

Voice is close, not settled. On one brief written five times, a blind judge scored Atelier 7.2 and a fresh call with the author's essays pasted in 7.4. Across five briefs, Atelier's posts had the fewest unsupported claims and the tightest spread (13.4 a post, standard deviation 1.6, against 14.0 and 3.5). A long single chat does drift; a fresh call with fixed context doesn't, with or without Atelier. Two of our studies came back null and one came back negative. They're listed next to the wins in [RESULTS](docs/RESULTS.md), at the same size.

The pace is still the gap, and I'm not claiming it. An independent reviewer ran the 0.8 loop on their own corpora, and it didn't move the author's range: the whole-text edits it tried were all refused by its own guards, at about three times the cost. So 1.0 keeps that loop off by default and replaces the part that failed. The new version changes punctuation and sentence breaks only where it has measured that the change moves the feature that is out, and rewrites one over-explaining sentence at a time. Whether that works is for the next study to say. Voice isn't part of the 1.0 claim; the counted guarantees are.

## Against a standard model

**Pasting your examples into a strong model gets you a good first draft. It doesn't get you a standard.**

Here's what a skill does that the model alone doesn't, measured:

| On the same task | The same model, without Atelier | With Atelier |
|---|---|---|
| Required rules held in full, outside blog test (the author's essays pasted in) | 2 of 9 posts | 7 of 9 posts |
| Em dashes, invisible characters, copied six-word runs (same test) | not counted | none in any post |
| Six-word runs copied from the author's pieces, per piece (the pieces given to it) | 97 | 3.6 |
| An invented story, quote or figure, in published writing | ships as written | cut, never reworded |
| Coding answers, the outside benchmark's own judge (no skill) | 3.99 | 4.39 |
| What you know about an output before you read it | nothing | a pass or fail per check |

The model is the same in both columns. The difference is that the standard lives outside it, someone approved it, and every output is checked against it. Change the model next month and the standard doesn't move.

## How it compares

**Everything here infers or enforces a standard. The question is who owns it.**

Each tool solves part of this. A strong model with your examples re-guesses the objective on every run, and nothing checks what comes out. Voice tools like Spiral, Writer and Jasper infer your voice on the vendor's side, so it changes when the vendor re-reads it or its judge feeds back. Style checkers like Vale and Markup AI enforce faithfully, but somebody writes the rules by hand. Prompt optimizers like GEPA, SkillOpt, SSO and EvoSkill search hard, against a metric or a judge somebody else wrote, and they'll move the target if the metric rewards it.

Atelier keeps the part each one is good at and fixes who owns it. It finds the rules from your examples, the way a voice tool does. It checks them on every output, the way a style checker does. It can search for a better way to carry them, the way an optimizer does. But the rules are the ones you approved, they're hashed, and nothing below them can change them. A judge never decides what good means here, and with reason: in an outside study of Atelier, three frontier models preferred an imitation over the real author.

I haven't run Atelier head to head against GEPA or SkillOpt yet. The kit to do it fairly is in [bench/compare](https://github.com/yannickYamo/atelier/tree/main/bench/compare): the same tasks, writer and budget for every arm, a sealed test split, and two scores, the benchmark's own judge and Atelier's standard. The result goes here whichever way it comes out. Contracts, financial reports and support replies have been only partly measured so far.

| | Where the standard comes from | Who can move it | Checked on every output | Invented claims | A change you can undo |
|---|---|---|---|---|---|
| A strong model with examples | re-guessed every run | every run | no | not checked | nothing to undo |
| Voice tools (Spiral, Writer, Jasper) | inferred by the vendor | the vendor, or its judge | by the vendor's own checks | not the focus | the vendor's call |
| Style checkers (Vale, Markup AI) | rules written by hand | whoever edits them | yes, the rules they hold | not checked | yes, in the rule files |
| Prompt optimizers (GEPA, SkillOpt, SSO, EvoSkill) | a metric someone else wrote | whoever owns the metric | by that metric | only if the metric does | a new prompt each round |
| **Atelier** | **your examples, approved rule by rule** | **only you** | **yes, with a pass or fail you can read** | **cut, by a measured checker** | **every release is versioned and rolls back** |

More in [COMPARISON](docs/COMPARISON.md).

## Where it's going

**Agents will write most of what a team ships. Each of those things needs a standard someone owns.**

Docs, release notes, support replies, review comments, reports. Models change every few months, and the standard shouldn't.

Two things are next, and both are tests rather than features. An independent reviewer runs the sealed study of voice ([B6](studies/B6_PREREGISTRATION.md)) on their own corpora: plain prompting, pasted examples and Atelier with and without the loop, read blind by people. And the head-to-head against GEPA and SkillOpt runs on the same tasks, writer and budget for every arm. Both results go in this README whichever way they come out. Until then, voice and the optimizer comparison aren't claimed.

## Install

```bash
git clone https://github.com/yannickYamo/atelier
cd atelier && npm install && npm run build && npm link
```

Node 22 or later. In Claude Code: `/plugin marketplace add yannickYamo/atelier`, then
`/plugin install atelier@atelier`. For any agent that reads skills, `npx skills add yannickYamo/atelier`
([skills.sh](https://skills.sh)); for one with no skill folder, `atelier export --skill <name> --out skill.md`.
Steps that call a model need `ANTHROPIC_API_KEY` or any OpenAI-compatible backend, and `atelier check` tests
yours before anything is spent. Standards and outputs stay under `~/.atelier`, with no account and no
telemetry. [examples/blog](examples/blog/README.md) has a six-post corpus to try, and [USAGE](docs/USAGE.md)
has every command.

## How I built it

**Agents wrote most of the code. I set the bar and owned the call.**

I set the direction, the architecture and the rules the code must keep. Coding agents wrote most of the code against written briefs. Independent reviews and outside tests checked it, and their findings get fixed in the open - including the runtime failure above.

That's how Atelier works, and it's how Atelier was made: agents do the volume, and a person owns the outcome.

[HOW-IT-WAS-BUILT](docs/HOW-IT-WAS-BUILT.md) says who did what, and [LESSONS](docs/LESSONS.md) says what it taught.

## Learn more

- [RESULTS](docs/RESULTS.md) and [studies/](studies/README.md): every study, pass or fail
- [USAGE](docs/USAGE.md): commands, settings, and what Atelier builds around a skill
- [ARCHITECTURE](docs/ARCHITECTURE.md): how a standard becomes a skill
- [MEASURED-RULES](docs/MEASURED-RULES.md), [FORMATS](docs/FORMATS.md) and [TASTE](docs/TASTE.md): the counted checks, the formats, and the reader for everything else
- [decisions/](docs/decisions/README.md): the choices the code depends on, and why
- [MEASUREMENTS.md](MEASUREMENTS.md): every figure quoted in the code, and what it rests on

## Contributing

The most useful contribution is evidence. Point Atelier at work whose standard you know, hold some back,
and report what it got right, what sounded right and was wrong, and whether pasting the examples did as
well; negative results stay in. See [CONTRIBUTING](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
