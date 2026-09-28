# Atelier

**Your taste, compiled. Point it at your best work and it builds a harness that writes, checks and fixes
new work the way you would, on any model.**

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

> **tl;dr** A model can imitate your writing. It can't tell which of your habits are decisions, keep them
> the same on every run, or notice when it drifts back to its own. Atelier reads your work, turns your
> taste into a standard you own, and builds a harness around the model: it writes from your voice, checks
> every draft against your standard, rewrites only what broke, and learns from what went wrong. You approve
> the standard once. Everything below it runs on its own.

```bash
atelier new ./my-best-posts "write me a blog post in the voice and style of these"
```

## Why I built it

Hand your writing to a model and the draft comes back fluent and sounding like nobody. It announces
insights ("the part people miss"), grades its own lists ("that last one deserves emphasis"), and reaches for
em dashes. Paste in your examples and it gets closer, then copies your sentences, makes up anecdotes you
never lived, and slides back to its defaults by the third section.

Underneath, your taste lives nowhere. The model re-guesses it from examples every run. You can't read it,
version it, move it to another model, or tell the model which of your habits matter. Prompt optimizers
need a score to climb, and nobody can write `reward(essay)` for *sounds like me*.

## How Atelier reads taste

Atelier reads your work along eight dimensions, and checks each one the way it can honestly be checked:

| dimension | what it looks at | checked by |
|---|---|---|
| **Vocabulary** | the words you reach for and the ones you never use, which of two competing words you pick ("but" or "however"), the connectives you lean on, your spelling | counting, on every draft |
| **Register** | first person, contractions, how you hedge, whether a spoken aside stands | counting and reading |
| **Pace** | sentence and paragraph length, and how much they vary from one to the next | counting |
| **Structure** | how you open and close, what your headings say, bold takeaways, one-line paragraphs | counting |
| **Argument** | where you split a question by who's asking, when you concede, how you put the case against yourself | reading |
| **Evidence** | how you cite, and the caveat you attach to a number | reading |
| **Figure** | your metaphors and images, and where you draw them from | reading |
| **Cadence** | how a section lands, the move that closes an argument | reading |

Four things make it more than a style prompt:

- **It learns from the gap between you and the model.** Atelier has the model write plain drafts on your own
  topics, then counts what the model does that you don't. Each gap becomes a proposed rule carrying both
  numbers ("you: none in 42,605 words; the model on its own: 8.4 per 1,000").
- **It proves each rule on work it never read.** Some of your pieces are held back before anything reads
  them. A rule your own unseen writing breaks is a rule against you, and it's dropped.
- **It knows how often you do something.** Writers work in modes. A move you make in two pieces out of five
  is served as something you *sometimes* do, with a cap per piece, so the model doesn't stamp it on every
  draft.
- **Rules nobody can count get read, carefully.** A reader checks argument, evidence, figure and cadence
  twice, the second time with the formatting stripped and the rules reordered, and discards any verdict
  that changes. Every verdict must quote the passage it rests on. It only reports until your own blind
  labels show its judgments hold up; after that it may block or repair, and it can never approve.

It also catches what marks text as machine-written: families of moves (announced insights, self-graded
lists, stacked superlatives, "let me be blunt", "that's the whole game", one problem "wearing another's
clothes") held to your own rate, plus the phrases each skill's own drafts keep repeating that you never
write. And it keeps your life yours: a story, a quote from an unnamed source, or a figure you didn't supply
gets cut and listed, so you can add the real one.

## What it builds: the whole harness

A prompt file is the part the model reads. Atelier builds everything around it:

```text
your work ──► proposed rules ──► YOU APPROVE (once) ──► Standard: versioned, hash-checked, yours
                                                              │
      ┌──────────────────────────── runs on its own ──────────┴──────────────────────────────┐
      ▼                                                                                      │
  compiled skill ──► write (2 drafts, the better kept) ──► check every rule ──► rewrite only │
  (your pieces, a persona,                                 (counts, the reader,  what broke  │
   the rules, an output schema)                             machine moves, claims)     │     │
      ▲                                                                                │     │
      └── fix · tend · optimize: a better way to carry the rule, installed through ◄──┘     │
          a gate, only when your measured rules improve and nothing else gets worse ─────────┘
```

- **A standard you own.** Every rule, its weight, when it applies and the evidence behind it, in a versioned
  file. Automated changes assert its hash, so nothing below it can change what "good" means.
- **A compiled skill.** Instructions, a persona of how you sound (each point quoted from your own pieces,
  with how often you do it), a few of your whole pieces spanning how you write, and a schema where a rule
  has a fixed shape. Installed for Claude Code or Codex.
- **A runtime.** `atelier invoke` writes, checks, repairs and records. A repair can change how something is
  said and never what it claims: a rewrite that drops a figure, a negation or a name is refused.
- **A guard for anything else.** `atelier verify` holds any text to your standard and exits 1 on a broken
  rule, so it fits a pipeline; `--repair` fixes only what broke. The same check runs as an MCP server for
  other agents, and as a Claude Code hook that checks each answer a skill gives before the turn ends.
- **A record.** Every output, the exact package that produced it, the model, and every repair. Rolling back
  is one command.
- **A loop.** `atelier tend` finds what keeps going wrong and tries other ways of carrying the rule. A change
  installs itself only through a regression floor measured on your own tasks.

## When it asks you

- **Once, when you create a skill.** It shows the rules it found, strongest evidence first, each with a
  suggested ruling. Press Enter to accept them all, or change any.
- **Whenever you want to.** `atelier fix "the close was a summary, not a turn"` in your own words. Label a few
  of the reader's verdicts (`atelier taste --calibrate`) to let it act. Change what "good" means with
  `atelier amend`, which only you can do.

Everything else runs without you, from `atelier invoke` to `atelier tend --auto` on a schedule.

## How it compares

**Against a strong model, on its own or with your examples pasted in:**

| | a model | Atelier on that model |
|---|---|---|
| where "good" is defined | re-guessed from examples every run | a standard you approved, versioned and diffable |
| which habits matter | can't tell a decision from an accident | each rule weighed, with when it applies, proven on work it never read |
| machine tells | its own habits come back | caught as moves, held to your own rate |
| your stories, sources and figures | invented when missing | cut and listed; you supply the real ones |
| your sentences | lifted when pasted | shown for voice; copying flagged |
| after the draft | nothing checks it | every rule checked; only what broke is rewritten |
| next month | no memory of what went wrong | `fix` and `tend` learn from it, through a gate |
| another model | re-prompt and hope | recompile the same standard |

**Against skill and prompt optimizers:**

| | what it optimizes | where the objective comes from | who can change the objective | runs its own loop |
|---|---|---|---|---|
| [GEPA](https://arxiv.org/abs/2507.19457) | prompt text, by reflecting on rollouts | a metric you supply | the metric's author | yes, given the metric |
| [SkillOpt](https://arxiv.org/abs/2605.23904) | a skill file, through trajectory-driven edits | a validation gate you supply | the gate's author | yes |
| SSO (arXiv:2607.28777) | a skill, without labels | its own judge's win margin | the judge | yes, circularly |
| EvoSkill (arXiv:2603.02766) | a set of skills, from execution failures | the task's success signal | whoever owns the task | yes |
| **Atelier** | **how your standard is carried, never the standard** | **your work, approved by you rule by rule** | **only you** | **yes, below your standard** |

Each of them needs a score someone else wrote, or lets its own judge decide. Taste has no such score.
Atelier borrows their search (`atelier optimize` uses reflective proposals and a Pareto screen) and puts it
under a standard you approved: its judge can block a change and never approve one, and a change installs
only when your measured rules improve and nothing else gets worse. Atelier hasn't been benchmarked against
these systems on a shared task yet; the difference is in the architecture, and you can check it in the code.

**Against fine-tuning:** weights can't be diffed against what you meant. A standard can, and it moves to
another model tomorrow without retraining.

## Install

Using Claude Code or Codex? Point it at this repository: [AGENTS.md](AGENTS.md) tells the agent how to set
it up and use it, and what to leave to you.

```bash
git clone https://github.com/yannickYamo/atelier
cd atelier && npm install && npm run build && npm link
```

In Claude Code, add the plugin. It records each `/skill` use for `atelier fix`, checks the skill's answer
before the turn ends, and registers the checker as an MCP tool:

```text
/plugin marketplace add yannickYamo/atelier
/plugin install atelier@atelier
```

Node 22 or later. No account, no telemetry. Steps that call a model need `ANTHROPIC_API_KEY` (or
`ANTHROPIC_AUTH_TOKEN`, or any OpenAI-compatible backend with `--provider openai-compatible --base-url ...`).
`atelier check` tests the backend before you spend anything. Your standards, evidence and outputs stay under
`~/.atelier`.

## Using it

```bash
atelier new ./posts "write me a blog post like these"   # read your work, approve the rules, build
/posts write the launch post                           # in Claude Code
atelier invoke --skill posts "write the launch post"    # or the CLI: written, checked, repaired
atelier verify --skill posts draft.md --repair           # guard any text
atelier material --skill posts notes.md                  # your real stories and figures
atelier fix "the close was a summary, not a turn"        # correct it in your words
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

The suite is 103 files and 1564 tests, runs offline, and drives the shipped binary end to end.

## Contributing

The most useful contribution is evidence. Point Atelier at writing whose standard you know well, hold some
back, and tell us what it got right, what sounded right and was wrong, and whether pasting your examples
did as well. Negative results stay in. See [CONTRIBUTING.md](CONTRIBUTING.md).
