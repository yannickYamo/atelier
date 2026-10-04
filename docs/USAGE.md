# Using Atelier

**Every command, every setting, and what Atelier builds around a skill. The [README](../README.md) is the short version.**

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
  ([result](../studies/CLAIM_READER_V2_QUALIFICATION_RESULT.md)). An audit then found it did not read headings
  or tables, and could cut a true story written in markdown. The fixed reader (version 3) was
  measured again on 25 unused product essays and qualified: it caught all 45 planted inventions it read and
  left 41 of 48 clean drafts alone ([result](../studies/CLAIM_READER_V3_QUALIFICATION_RESULT.md)). Most of
  its false flags were the author's own true stories, so bind yours with `atelier material`.
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

**Build with the model you will run it on.** A skill is built against the model you configure: it asks that
model for drafts on your topics and learns where its habits differ from yours. Claude, GPT, Grok through an
OpenAI-compatible endpoint, or an open model through Ollama all work. Most of what steers a draft is your own
range, read off your pieces, and holds on any model. The style detector does not: it learns one model's
habits, and a detector trained on one model family does not recognise another family's. Run the skill on a
different model and the detector's readings stop meaning much (the run says so); rebuild the skill with that
model to retrain it.

One standard describes one format, read off your pieces of that format: build a LinkedIn skill from your
LinkedIn posts, with `--class linkedin-post`, and it also holds each post to what LinkedIn fixes
([FORMATS.md](FORMATS.md)).

For answers rather than published writing (a coding assistant, support replies, review comments), use
`--class assistant-reply`; `atelier skill` picks it when its rules are about replies. Its answers name
versions, costs and estimates you never supplied, so specifics the claim check cannot trace are listed for
you to check, not cut. Everywhere else an invented story, claim of evidence or quotation is cut.

A standard can also say what a piece must contain: `atelier amend --skill <name> --rule <rule> --measure
"PRESENCE:in=last,starts=next"` makes "end on the next step" a counted rule, and `PRESENCE:sections=…`
holds a template's sections in order ([MEASURED-RULES](MEASURED-RULES.md)). To use a skill where there is
no skill folder (a system prompt, another tool), `atelier export --skill <name> --out skill.md` writes it
as one file with its examples inlined.

### How close to you, measured

Every run's panel says how typical of you the output is: "as typical as 35% of your own pieces". It reads the
output as one point over the features that separate you from the model, and compares its distance with your own
pieces' distances from each other. `atelier fidelity --skill <name> --typicality` asks the question over all your
runs: can a classifier tell your outputs from your pieces (an AUC of 0.5 means it cannot), and are your outputs as
varied as you are. `invoke --until-typical 0.3` writes more rounds until an output is at least that typical, and
never trades a REQUIRED rule for it. `--until-author 0.5` does the same on the style detector: more rounds until it
reads the output as yours at least half the time. `--select sample` draws among drafts the rules cannot separate by
how likely each is yours, instead of always taking the most typical one, so your outputs keep your spread.

### Voice, and other registers (opt-in)

A skill built from blog posts is evidence about blog posts. Ask it for a contract and nothing in the corpus
says which of your habits belong there. So the voice layer starts from a declaration, and does nothing until
you make one:

```bash
atelier voice register --skill posts post            # the register your pieces are written in
atelier voice transfer --skill posts --add c3        # this rule carries to any register (your ruling)
atelier voice pairs --skill posts                    # build the pair bank: one model call per paragraph
atelier fidelity --skill posts --set voice=incontext # turn the voice pass on
atelier voice status --skill posts                   # registers, what carries, the bank, the mode
```

- **In register**, the whole standard applies, as before. With the voice pass on, each paragraph is rewritten
  from pairs of the same content said plainly and as you wrote it, and a rewrite is kept only if it changes no
  fact, no claim's strength and no more than its length allows, and lifts nothing of yours. The assembled text
  is then checked in full; if anything got worse the pass is undone.
- **Out of register** (`invoke --register contract`, or a request that names another document type), only the
  rules and features you marked to carry are applied. The rest are withheld for that run and named on the
  panel. The voice pass never runs out of register.
- With pieces in several registers (`atelier voice register --skill posts --corpus <dir>`, each piece naming
  its own with `register: speech` in its front matter), a steering feature that holds still between them is
  marked as measured. Rules are never measured: you mark them.

None of this moves the standard, and none of it is on by default. Whether the voice pass moves your voice has
not been measured; that takes a blind read by people ([decision 0009](decisions/0009-voice-below-the-standard.md)).

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


[← README](../README.md)
