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
4. A small model lists every specific claim, and code checks each one against what you supplied. In published writing, an invented story, quotation or claim of evidence is deleted, never reworded. In answers, specifics are listed for you to check, never cut. A figure computed from your own figures counts as yours.
5. Only what broke is rewritten. A cut that would leave a fragment is redrafted once, or not made, and the check says so.

That asymmetry in step 4 matters more than it looks. Deleting an invented anecdote from an essay costs you nothing. Deleting a correct detail from a technical answer costs you the answer.

## What the evidence shows

**I'll give you the wins and the failure in the same breath, because an outside test found the failure and I'd rather you hear it from me.**

Building a skill works outside writing. In an outside test, Atelier built a skill from 12 example coding-assistant answers in 90 seconds for $0.41. Against a popular hand-written skill tuned for that benchmark, it matched it: 4.43 to 4.30, inside the judge's noise of about 0.1, with the lowest spread across repeats. A 90-second artifact holding even with a hand-tuned one is the result I care about most.

The same test found the runtime hurting answers. The claim check cut correct sentences, and some answers went out with empty bullets. Both are fixed - answers are listed, not cut, and a fragment never passes - and the fix has not been re-measured on that benchmark yet. On our own ten-turn coding session after the fix, Atelier's answers broke a counted rule once, against five times for the hand-written skill. Our own session, our own harness, so weigh it accordingly.

The invented-claim check is the piece I trust most. On product essays no test had used, it caught all 45 planted inventions it read, and left 41 of 48 clean drafts alone. A pattern check on the same material caught 11 of 46.

The counted guarantees hold where prompting doesn't. In the outside test, Atelier's posts had no em dashes and broke the machine-writing rule in 2 of 9. A prompt with the author's essays pasted in produced 14 em dashes and broke it in 7 of 9.

Voice is not settled, and I won't pretend otherwise. In that same test, a fresh call with the author's essays pasted in scored as steady as Atelier and higher on voice with a blind judge. Earlier, blind readers ranked Atelier's version first on two rewrites - one reader each, which is barely evidence. A long single chat does drift; a fresh call with fixed context doesn't, with or without Atelier. Two of our studies came back null and one came back negative. They're listed next to the wins in [RESULTS](docs/RESULTS.md), at the same size.

## How it compares

**Everything here infers or enforces a standard. The question is who owns it.**

A strong model with your examples pasted in re-guesses the objective from those examples on every run, and nothing checks what comes out. Voice tools like Spiral, Writer and Jasper infer the voice from samples on the vendor's side, which means it changes when the vendor re-reads or its judge feeds back. Style checkers like Vale and Markup AI enforce faithfully, but the rules are ones somebody wrote by hand. Prompt optimizers - GEPA, SkillOpt, SSO, EvoSkill - optimize hard against a metric or judge somebody else wrote.

Atelier: the examples you chose, approved by you rule by rule, checked on every output, changed only by you.

| | Where the standard comes from | Who can move it |
|---|---|---|
| A strong model with examples | re-guessed from the examples every run | every run |
| Voice tools (Spiral, Writer, Jasper) | inferred from your samples by the vendor | the vendor, or its judge |
| Style checkers (Vale, Markup AI) | rules someone writes by hand | whoever edits them |
| Prompt optimizers (GEPA, SkillOpt, SSO, EvoSkill) | a metric or judge someone else wrote | whoever owns the metric |
| **Atelier** | **the examples you chose, approved rule by rule** | **only you** |

More in [COMPARISON](docs/COMPARISON.md).

## Where it's going

**Agents will write most of what a team ships. Each of those things needs a standard someone owns.**

Docs, release notes, support replies, review comments, reports. Models change every few months, and the standard shouldn't.

Next up is re-measuring the runtime across domains - coding answers, code review, a contract, a finance report, a blog post - sealed before the run and reported whichever way it comes out. After that, skills that look after themselves: the loop that tends a skill can search for a better way to carry the rules, and it undoes any change of its own that makes a rule break more often. An optimizer that can revert itself is the only kind I'd let near an approved standard.

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
