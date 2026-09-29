# Atelier

**Your taste, learned from your best work and kept in every draft you ship.**

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

If you've asked a model to write like you, you know how it goes.

- **It sounds like AI.** Em dashes, "here's the thing", "that last one deserves emphasis". A reader clocks it
  inside a paragraph.
- **Pasting in your examples helps, and it costs you.** The model lifts your actual sentences, invents
  anecdotes you never lived, and drifts back to its own habits a few paragraphs in.
- **"Good" lives nowhere you can see.** It gets re-guessed from your examples on every run, so there's nothing
  to review, nothing to version, and nothing to carry to another model.
- **Prompt optimizers need a score.** GEPA, SkillOpt and the rest improve a prompt against a metric, and
  nobody can write `reward(essay)` for *sounds like me*.

What I wanted was my taste written down once, in rules I can read and argue with. Every draft checked
against it, so a miss shows up as something I can point to. And an implementation that gets better from its
own runs, under a standard only I can change. Your voice stops being something you re-explain every session,
and becomes something the tool answers to.

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

Five things make it more than a style prompt:

- **It learns from the gap between you and the model.** Atelier has the model write plain drafts on your own
  topics, then counts what the model does that you don't. Each gap becomes a proposed rule carrying both
  numbers, for example "you: none in 42,605 words; the model on its own: 8.4 per 1,000".
- **It keeps only what separates you.** Atelier counts dozens of small features, from colons, links and
  list items to sentence-length tails, cadence and how often you name people. It keeps only those that tell
  your pieces from the model's own drafts and hold on pieces it never read. Some tell single drafts apart
  and become rules you approve. Others only show over many drafts; they choose between drafts and show in
  `verify --profile`, and never block anything.
- **It checks each rule on work it never read.** Some of your pieces are held back before anything reads
  them. A rule your own unseen writing breaks is a rule against you, and it's proposed for rejection.
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
write.

### Nothing invented, and checked

Your stories, figures and sources are yours to supply. A small model reads every draft for specifics:
figures, dates, quotations, attributions, links, and stories told as lived. It says where each one came
from, and code checks the claim against what you actually gave it: the passage it quotes must be in your
material, the numbers must be there, and the specific must really be where the reader said it was. Anything
that doesn't trace is cut and listed, so you can add the real one.

- A figure credited to a study, a quote from a named person, or a link offered as a source is yours to
  supply. It never passes as "general knowledge".
- In a white paper, a report or a contract, nothing passes as general knowledge.
- Only a qualified reader may cut. On 28 pieces no test had used, version 2 caught all 35 planted inventions
  (a pattern check caught 9) and left 35 of 38 clean drafts alone
  ([result](studies/CLAIM_READER_V2_QUALIFICATION_RESULT.md)). An audit then found it did not read headings
  or tables, and could cut a true story written in markdown. The fixed reader (version 3) reports what it
  finds, but it does not cut until it is qualified again. Until then the cut comes from the pattern check,
  which has never flagged a true piece in either study, and missed 54% and then 74% of planted inventions.
- Headings and tables are read. A claim the reader flagged is still cut if the reader fails partway through.
- Expect it to cut a true detail now and then. `atelier material --skill <name> <notes>` binds your notes,
  so a cut story comes back.

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
- **A runtime.** `atelier invoke` writes, checks, repairs and records. It prints the piece and a few lines:
  any rule still broken, what was cut, what the taste reader saw. The full account is written to a file it
  names. A repair can change how something is
  said and never what it claims: a rewrite that drops a figure, a negation or a name is refused.
- **A guard for anything else.** `atelier verify` holds any text to your standard and exits 1 on a broken
  rule, so it fits a pipeline; `--repair` fixes only what broke. The same check runs as an MCP server for
  other agents, and as a Claude Code hook that checks each answer a skill gives before the turn ends.
- **A record.** Every output, the exact package that produced it, the model, and every repair. Rolling back
  is one command.
- **A loop.** `atelier tend` finds what keeps going wrong and tries other ways of carrying the rule. A change
  installs itself only through a regression floor measured on your own tasks.

## When it asks you

- **Once, when you create a skill.** It shows the rules it found, each with a suggested ruling: the rules
  that will instruct the model and the ones with the thinnest evidence in full, the rest one line each
  (`atelier pending` shows every rule with its evidence). Press Enter to accept them all, or change any
  (`p3=reject`). Without a terminal, `atelier new <folder> --accept` accepts and builds in one step.
  Rejection is suggested only when a rule failed in at least four pieces discovery never read; on fewer,
  the rule is shown as an example for you to judge. Accepting a suggestion is a ruling like any other, and
  the record keeps which you took and which you changed: `atelier status --skill <name>` shows both counts,
  so "you approved it" never hides "you pressed Enter".
- **Whenever you want to.** `atelier fix "the close was a summary, not a turn"` in your own words. Label a few
  of the reader's verdicts (`atelier taste --calibrate`) to let it act. Change what "good" means with
  `atelier amend`, which only you can do.

Everything else runs without you, from `atelier invoke` to `atelier tend --auto` on a schedule. (The loop
is built and tested offline; it has not yet looked after a live skill for weeks. See below.)

## What has been tested, and what hasn't

Every study is published with its result, including the ones that failed
([studies/](studies/README.md)). The confirmations and qualifications were pre-registered before any
output existed; the early voice rounds and the development runs were exploratory, and are marked as such.

- **Voice.** Seven blind rounds on one public author's 20 posts, with the same writer model throughout. In
  the last round, read blind by this project's owner, Atelier ranked first on both briefs read, above the
  model given the author's own pieces. It copied far less (3.6 shared six-word runs per piece against 97)
  and none of its stories was caught as invented, where the pasted-examples version invented 2. A stricter
  check run afterwards still found six invented details in those drafts, which is why the claim check was
  rebuilt (below). The sealed gate as a whole failed on two criteria. This is one author, two briefs, and one reader who built the tool, so treat it as encouraging,
  not settled ([result](studies/VOICE_ROUNDS_RESULT.md)).
- **Invented claims.** The claim reader was qualified against bars set in advance, on pieces it had never
  seen (above).
- **What it keeps.** On 40 pieces no test had used, 9 of the 10 features selection kept still separated
  new pieces from new model drafts ([result](studies/SENSOR_QUALIFICATION_RESULT.md)). That was one writer
  in one genre, technical explainers, checked against a second sample rather than a human reader. A reader for the
  deeper layers (figures, argument, how a piece opens and lands) failed the same test. So those layers are
  still carried by your pieces and the persona, and read by the taste reader, but not measured.
- **Not yet shown:**
  - that it works for other writers, or read by other people;
  - how it does against GEPA-style optimizers on a shared task;
  - that it handles support replies;
  - that the self-improving loop holds up on a live skill over time.

  An external blind study is next.

## How it compares

**Against a strong model, on its own or with your examples pasted in:**

| | a model | Atelier on that model |
|---|---|---|
| where "good" is defined | re-guessed from examples every run | a standard you approved, versioned and diffable |
| which habits matter | can't tell a decision from an accident | each rule weighed, with when it applies, checked on work it never read |
| machine tells | its own habits come back | caught as moves, held to your own rate |
| your stories, sources and figures | invented when missing | read for, traced to what you supplied; the rest cut and listed |
| your sentences | lifted when pasted | shown for voice; copying flagged |
| after the draft | nothing checks it | every counted rule checked, the rest read (reporting only, until you label it); only what broke is rewritten |
| next month | no memory of what went wrong | `fix` and `tend` propose changes, installed only through a gate (not yet shown on a live skill) |
| another model | re-prompt and hope | recompile the same standard |

**Against skill and prompt optimizers:**

| | what it optimizes | where the objective comes from | who can change the objective | runs its own loop |
|---|---|---|---|---|
| [GEPA](https://arxiv.org/abs/2507.19457) | prompt text, by reflecting on rollouts | a metric you supply | the metric's author | yes, given the metric |
| [SkillOpt](https://arxiv.org/abs/2605.23904) | a skill file, through trajectory-driven edits | a validation gate you supply | the gate's author | yes |
| SSO (arXiv:2607.28777) | a skill, without labels | its own judge's win margin | the judge | yes, scored by its own judge |
| EvoSkill (arXiv:2603.02766) | a set of skills, from execution failures | the task's success signal | whoever owns the task | yes |
| **Atelier** | **how your standard is carried, never the standard** | **your work, approved by you rule by rule** | **only you** | **yes, below your standard** |

Each of them needs a score someone else wrote, or lets its own judge decide. Taste has no such score.
Atelier borrows two ideas from their search, a reflective choice among legal changes and a Pareto screen
over your measured rules, and applies them to how your rules are carried, never to their text. It puts
that search under a standard you approved. Its judge can block a change and never install one. A change
installs only when your measured rules improve and none regresses beyond its margin; rules no count reads
are listed, not guarded. Atelier hasn't been benchmarked against
these systems on a shared task yet; the difference is in the architecture, and you can check it in the code.

**Against style checkers:** Vale, proselint, Acrolinx and Writer hold copy to rules someone wrote down.
Atelier reads the rules off your own work, checks them on pieces it never read, and has you approve them.
Its checker is the last step, not the first.

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

One standard describes one format, read off your pieces of that format: build a LinkedIn skill from your
LinkedIn posts, with `--class linkedin-post`, and it also holds each post to what LinkedIn fixes
([docs/FORMATS.md](docs/FORMATS.md)).

The sentence you give `new` sets how rules are weighed: writing new work, holding copy to a standard
("ensure all our copy follows these"), or answering people ("support always answers this way"). Prefer to
state your rules yourself? `atelier skill "lead with the action, number the steps"`. A host doesn't always
deliver everything the CLI does; `atelier carriers --skill posts --host codex` says what it drops.
`atelier --help` lists everything.

| setting | what it does |
|---|---|
| `ATELIER_DATA` | where standards, skills and runs live (default `~/.atelier`) |
| `ATELIER_MODEL` | the model for every role, unless a more specific setting names one |
| `ATELIER_DISCOVERY_MODEL`, `ATELIER_TARGET_MODEL` | the model for reading your work, and for running the skill. If your backend does not serve the default reader, discovery reads with the target model and says so; a model you name is never swapped |
| `ATELIER_PROVIDER` | `anthropic` (default) or `openai-compatible`, with `ATELIER_BASE_URL` |
| `ATELIER_HOST` | `claude-code` (default) or `codex`: where a built skill is installed |
| `ATELIER_CLAIMS_MODEL` | the small model that reads drafts for invented specifics (default `claude-haiku-4-5` on Anthropic; on your own backend, name one of yours) |
| `ATELIER_CLAIMS` | `pattern` for the offline pattern check instead of the reader |
| `ATELIER_CLAIMS_CAP` | the claim reader's own spending cap per command, in dollars (default 0.50) |

## Learn more

- [docs/MEASURED-RULES.md](docs/MEASURED-RULES.md): every counted rule, machine tells, repair, the regression floor
- [docs/TASTE.md](docs/TASTE.md): the reader for rules no count can check, and how your labels give it authority
- [docs/FORMATS.md](docs/FORMATS.md): the layers of taste, what is measured today, and what each format fixes
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how a standard becomes a skill
- [studies/](studies/README.md): every pre-registration and result, including the ones that failed
- [MEASUREMENTS.md](MEASUREMENTS.md): every figure quoted in the code, and what it rests on

The suite is 108 files and 1749 tests, runs offline, and drives the shipped binary end to end.

## Contributing

The most useful contribution is evidence. Point Atelier at writing whose standard you know well, hold some
back, and tell us what it got right, what sounded right and was wrong, and whether pasting your examples
did as well. Negative results stay in. See [CONTRIBUTING.md](CONTRIBUTING.md).
