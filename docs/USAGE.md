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
that doesn't trace is cut and listed, so you can add the real one. That needs your material bound
(`atelier material`, or `--with`) and a skill whose kind of work is an essay or a post: with no material, or on
any other kind of work, what doesn't trace is listed and nothing is deleted.

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
- It deletes only in an essay or a post with your material bound (`atelier material --skill <name> <notes>`, or
  `--with`). Anywhere else it lists what it could not find and deletes nothing. Where it does delete, expect it
  to cut a true detail now and then: add the detail to your material and it stays.

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
  To rule on every proposal yourself, `atelier ratify --page rulings.html` writes a page to mark up; save
  its rulings as a file and pass `atelier ratify --decisions @decisions.json` (the JSON inline also works,
  but a long batch is one argument some agent hosts refuse).
  Rejection is suggested only when a rule failed in at least four pieces discovery never read; on fewer,
  the rule is shown as an example for you to judge. Accepting a suggestion is a ruling like any other, and
  the record keeps which you took and which you changed: `atelier status --skill <name>` shows both counts,
  so "you approved it" never hides "you pressed Enter".
- **Whenever you want to.** `atelier fix "the close was a summary, not a turn"` in your own words. Label a few
  of the reader's verdicts (`atelier taste --calibrate`) to let it act. Change what "good" means with
  `atelier amend`, which only you can do.

Everything else runs without you, from `atelier invoke` to `atelier tend --auto` on a schedule. (The loop
is built and tested offline; it has not yet looked after a live skill for weeks. See below.)

## The three commands

```bash
atelier new ./reviews --method review.md     # build: your finished work, and a note of how you do it
atelier run "review this change" --with change.diff     # run: the work, then its evaluation, rule by rule
atelier fix "it missed the migration cost"   # react: what was wrong, in your own words; that piece is written again
```

Under the work a run prints its evaluation, in three layers that are kept apart because they are different
promises: **your rules**, in your words; **this request** (a length it asked for); and **evidence** (every specific
traced to what you supplied, no passage lifted from one of your examples). Below them, the habits seen in your
examples, which are counted and block nothing, and what was done to the draft. Each line carries one of four marks,
and a mark never says more than was observed:

| mark | means |
|---|---|
| `✓` | a check read the whole of the rule, and it held |
| `✗` | a check saw it fail; everything it found is shown |
| `~` | a check read part of the rule and that part held; the part it did not read is named, and is yours |
| `?` | no check reads it: yours to judge |

The evaluation opens with where the work stands:

- **BLOCKED**: something required was seen to fail. The work is shown and is not usable as it stands. Exit 1.
- **NEEDS REVIEW**: nothing was seen to fail, and part of what you require was not read in full by a check. The
  line counts what was verified and what is left for you.
- **VERIFIED**: everything required was read in full, and held.

A rule you wrote is required whether or not a check can read it, so work with judgement in it is never VERIFIED by
a machine on its own: it is yours to finish reading, until the taste reader has earned a say on that rule. Once your
labels have qualified the reader on a rule (`atelier taste --skill <name> --label ...`, see TASTE.md), its reading of
the part no count reads is a qualified observation: read as followed, the rule is verified in full; read as missed, it
fails. That is the one path by which work with judgement in it reads VERIFIED. A rule you stated stays required when your own examples do not follow
it. The build never stops for that: the rule is checked and shown on every run, and blocks nothing until you
confirm it (`--yes`) or change the method. `atelier verify`, `atelier report`,
`--json` and the MCP check carry the same record (`record`), so they cannot disagree with the card.

`atelier fix "<what was wrong>"` goes one of three ways, and you choose by saying so:

- **This piece** (the default). It is written again with what you said put right, and your skill is not changed:
  one complaint about one piece is not a rule. It is also recorded as a piece you would not have used, with why.
- **Every run** (`--always`). Where your rules already cover it, Atelier tries another way to carry them and shows
  you both results. Where they do not, it asks whether this should be a rule; nothing becomes one without your yes.
- **The evaluation** (`--evaluation`). It blocked what was right, or passed what was not. It is recorded with what the
  evaluation said, and nothing is changed: a check reads one of your rules, and is put right through the rule.

`--report` on either command adds the engine's whole account. `atelier rate <run> yes|no "why"` records whether you
would use the work as it is, and `atelier lab eval` shows that and every check over all your runs. Every
other command is under `atelier lab`. `atelier invoke` is `atelier run` with that account always on, and is what
scripts and other tools call.

With no method note, `atelier new ./posts --no-model` builds from the examples alone (as does `atelier new ./posts`
when no model key is set): the pieces are served to the writer with what can be counted in them, and whether new
work reads like them is yours to judge. Three short posts are enough; so is one.

## From your method and your finished work

When you can say how the work is done, say it, and hand over the pieces where it was done:

```bash
atelier new ./reviews --method review.md             # your finished examples (a file or a folder), and a note of steps
atelier new ./reviews --method review.md --review    # look at what it would check, and build nothing
```

Every step of the note is your rule, in your words. It calls no model. The screen sorts the steps into three
kinds and says, for each check, what it looks for and how your examples fare on it:

- **Checked on every output.** A section the work must have ("Open with a Summary section", "Then a Must fix
  section"), one of a closed set ("a Verdict section that holds one of: Approve, Request changes, Comment"), a
  table's columns, a length you stated ("between 150 and 230 words", "under 280 characters", "no sentence longer
  than 25 words"), the words a paragraph starts with, a word never to use.
- **Checked against the material.** Figures that must be ones you gave, and places cited as `path:line`: each
  citation is looked up, and the material is shown to the writer with its line numbers so that none is counted.
- **Judgement.** Everything else: shown to the writer, reported as not measured, never called checked.

A check is kept only when every example holds it. A step that a piece of yours does not do is named with the piece
and left for you to judge; change the note or the example and build again to have it checked. Building again in
the same folder makes a new version of the same skill. With three or more
examples, the pieces are served with the skill and their lengths recorded, so a draft is chosen by how near it runs
to them when a request names no length. Three short pieces and a few lines of rules are enough to build from.

Two limits. One step gets one check: "Then a Must fix section: cite each item as path:line" is read for its
section, so put the citation rule in a step of its own. And the build reads every example, so none is left to test
the skill on blind: `atelier reproduce` needs a skill built with `atelier new`.

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
you to check, not cut. In essays and posts with your material bound, an invented story, claim of evidence or quotation is cut; anywhere
else it is listed.

A standard can also say what a piece must contain: `atelier amend --skill <name> --rule <rule> --measure
"PRESENCE:in=last,starts=next"` makes "end on the next step" a counted rule, and `PRESENCE:sections=…`
holds a template's sections in order ([MEASURED-RULES](MEASURED-RULES.md)). To use a skill where there is
no skill folder (a system prompt, another tool), `atelier export --skill <name> --out skill.md` writes it
as one file with its examples inlined.

### How big a skill is, and what a run cost

A skill has three sizes, and they are stated apart. **Stored** is every file of the compiled package.
**Exported** is what `atelier export` writes and what `atelier invoke` serves: the instructions with the example
files inlined. **Per run** is what one run sent the writer: the served skill, what was added for the request (your nearest
passages, the release's notes), and the request. The first two are on the skill's card, printed at build and by
`atelier report --skill <name>`, with the export split by part:

```
SIZE  stored 13,400 words in 31 files · exported 13,173 words (79,300 bytes)
  the export    your pieces 9,201 (3 files) · rule examples 1,954 (25 files) · rules and instructions 682
                how I sound 471 · moves 396 · reference index 282 · framing 187
```

Most of a skill built from writing is your own pieces, served so the model hears you. A skill that writes serves
passages from them by default, within 3,000 words: on the one newsletter skill measured, that export ran 7,121 words
against 12,555 for whole pieces, each run cost 34% less, and no loss of quality was measured on five titles. How much
of them is served is yours to set, and neither option changes a rule:

```bash
atelier build --name posts --piece-budget 3000                    # choose the pieces again, within 3,000 words
atelier build --name posts --piece-budget 3000 --pieces excerpts  # an opening and a middle passage of each, from more pieces
atelier build --name posts --piece-budget 0                       # none of your pieces; the persona and your usual length stay
atelier build --name posts --piece-budget default --pieces whole  # whole pieces within 9,000 words: how every skill was served before
atelier export --skill posts --out skill.md --no-index            # leave out the list naming files the export has inlined
```

- **A budget you set is a ceiling** on what the export counts for your pieces: each piece with the line that opens
  its file, in any script, code and tables included. One piece may use the whole budget. A budget smaller than your
  shortest piece serves none, and says so.
- **The compact default is stored on the skill.** A skill that writes, built for the first time with neither option,
  takes `--piece-budget 3000 --pieces excerpts` and stores them as if you had given them; the build says
  `pieces served compact by default`, and a rebuild reads the skill, not the default. A skill that already holds a
  voice keeps what it holds, so nothing built before changes. A skill that answers, and one built from a method
  (`atelier method`, or `atelier new` with no model), are served whole.
- **The whole serving is not a ceiling of that kind.** `--pieces whole --piece-budget default` chooses as every skill
  was built before: whole pieces within 9,000 words of English prose, none longer than half of that.
- **An excerpt is your text, exactly.** Each passage is one unbroken stretch of the piece, about 250 words, with
  `[…]` where text is left out. A paragraph longer than a passage is taken apart at its line breaks, then at its
  sentence ends; a fenced block of code is never cut. A piece too short to cut is served whole and its file says so.
  Excerpts are for a skill that writes: answers are short and are shown whole.
- **For a skill that answers,** the budget is that of the examples shown: one of each kind of request whatever
  the budget, and none at 0.
- **A build keeps the budget and the form** until you give others, `--voice auto` included. `--voice none` gives
  them up with the voice, and `--piece-budget default` gives the budget up and keeps the form. Choosing the pieces
  again reads the pieces the skill was built from and calls no model. (A skill that answers reads which of its moves
  hold back once, and again only when a move is new or `--persona auto` asks.)
- **A rebuild compiles your standard as it stands, and changes nothing you did not ask for.** If you amended a rule
  after the skill was built, a rebuild keeps the amendment. It keeps the skill's description and its "write this,
  not that" pairs, none included (only `--contrast auto` chooses them), and a project folder you moved or renamed is found again
  by the skill's name.
- **Every build says how your own pieces fare:** "Your own pieces: 22 of 24 meet every required rule that is
  counted." A standard your best work fails will fail drafts for things you do, so under nine in ten the build names
  the rules your pieces break most and the rulings that bring it back to nine in ten, each a command ready to run: first the limit your own pieces meet
  (`atelier amend --rule m1 --measure "SENTENCE_LENGTH:medianMax=16,p90Max=16" ...`), which keeps the rule required,
  and where no limit can be moved, the rule as a preference. Each is your ruling and mints a new standard; nothing is
  applied for you. The review screen suggests a rule as required only when your own pieces meet it, one by one and
  together, and a new discovery sets each counted limit where your pieces meet it to begin with.

Nothing here is a default: a skill built without these options is chosen exactly as before. Whether a smaller skill
holds your rules and your voice as well is a question for a measurement
([the drafted pre-registration](../studies/EFFICIENCY_ABLATION_PREREGISTRATION.md),
[decision 0014](decisions/0014-the-smallest-realization-that-holds-the-standard.md)).

`atelier report <run>` ends with where that run's cost went, one line per purpose with its calls and the tokens
the provider counted, and with the words the writer was sent:

```
cost and size
  writing: $0.1012 · 2 calls · 26,410 tokens in, 1,790 out
  claim reader: $0.0214 · 2 calls · 9,120 tokens in, 610 out
  taste reader: $0.0188 · 3 calls · 7,400 tokens in, 420 out
  sent to the writer: 13,173 words of skill · 610 added for this request (your nearest passages, notes) · 14 of request
```

Lines and total are counted from the same moment, where the run's budget is made. A call that names no purpose is
counted under `other`, and a difference between the lines and the total is printed, never absorbed. The figures in these two examples are illustrations of the layout.

### How close to you, measured

Every run's panel says how typical of you the output is: "as typical as 35% of your own pieces". It reads the
output as one point over the features that separate you from the model, and compares its distance with your own
pieces' distances from each other. `atelier fidelity --skill <name> --typicality` asks the question over all your
runs: can a classifier tell your outputs from your pieces (an AUC of 0.5 means it cannot), and are your outputs as
varied as you are. `invoke --until-typical 0.3` writes more rounds until an output is at least that typical, and
never trades a REQUIRED rule for it. `--until-author 0.5` does the same on the style detector: more rounds until it
reads the output as yours at least half the time. `--select sample` draws among drafts the rules cannot separate by
how likely each is yours, instead of always taking the most typical one, so your outputs keep your spread.
`--context local` holds drafts to your range on the request's subject: your pieces nearest the request set it,
pulled toward your usual range when few are near, and your ratified rules never move. A sealed offline test found
it told your pieces from the model's no better than the usual range ([result](../studies/CONTEXT_BANDS_RESULT.md)),
so it is off unless you ask for it.

A text farther from your pieces than any of them is from the rest reads "beyond every piece of yours", with both
distances: the share cannot go below 1 in (your pieces + 1), so past your farthest piece it says nothing. The
`--typicality` report also tells your own pieces from each other at random halves and prints that AUC: at a dozen
texts a side an author's own pieces are told apart at 0.7 to 0.8 one time in twenty
([result](../studies/AUTHOR_FLOOR_RESULT.md)), so an AUC is read against that floor, not against 0.5.

### Skills that answer: length follows the request

A skill built from example answers states no usual length. Answers alone cannot show whether an author is terse or
the questions were small, so the skill says the request sets the length, and states what your examples add beyond
what was asked (a preamble, a caveat, an offer of more), counted over them. If your examples carry the request they
answer, the build reads the pair. Put it in front matter:

```markdown
---
request: Walk me through OAuth PKCE. I want a detailed explanation.
---
PKCE has three steps. ...
```

or as a `## Request` section followed by `## Answer`. The request is never read as your writing.

### Strict delivery

`atelier invoke --skill <name> --strict "<task>"` delivers the output only when it conforms. A reply that leaves out
part of what the request asks is written once more; a draft that breaks a REQUIRED rule is written again
(`--redraws <n>`, default 2); what still does not conform is refused with its reasons and exit code 3, and
`atelier report <run>` shows the text. `--allow-nonconformant` delivers it anyway, marked. To make it the skill's
way of running: `atelier fidelity --skill <name> --set delivery=strict`. It holds the REQUIRED rules that have a
measurement and the claim check; a REQUIRED rule in prose with no measurement is outside the guarantee.

Delivered under `--strict` means nothing required was seen to fail and every check finished. It does not mean
verified: where a check read only part of a rule, or a rule is yours to judge, the run says how many such rules
there are, and `eval.record.state` is `NEEDS_REVIEW`. A check that could not finish (the claim reader could not
run, or left specifics undecided) is refused, never passed.

### What your request was read as

Every run of a skill built from a corpus prints a CONTEXT block: the register the request names and how that was
read, how many of your pieces are near the request's subject, which ones, how they were found, and what the run
used them for (the passages shown to the writer, the typical-of-you reading, your range for the subject, the
plan). When fewer than two pieces are near, it says the readings rest on your whole range.
`atelier eval --skill <name>` lists the requests your pieces were thin on, which is the list of what to write more of.

Your nearest pieces are found by shared words. A request that is only a title shares few words with anything, so
`atelier fidelity --skill <name> --read-subjects` has a small model read what each piece is about, once (one call
per piece, a few cents), and `atelier fidelity --skill <name> --set nearness=reader` (or `invoke --nearness reader`
for one run) then has it grade each request against those cards: same subject, related, or neither. Code checks
every answer, the grades are recorded with the run, and with no model the words decide as before. It is opt-in
until its sealed qualification is run ([pre-registration](../studies/SUBJECT_READER_PREREGISTRATION.md)).

### Several writers in one skill

Point `atelier new` at a folder with pieces by several writers, labelled or not. The voices are told apart by how
they are written (function words, phrasing, punctuation), never by format or length, so one writer's essays, lists and
posts stay one voice. Each voice is read on its own, its most characteristic traits are taken, what every voice shares
is kept as method, and every clash is settled by which side is more characteristic, with the reason. Nothing is asked;
the build says one line ("Combined 2 voices: openings from the first, tone from the second…"). Every inferred trait
steers and never blocks. `atelier report --skill <name>` shows the grouping, every weight and every settled clash;
`atelier fix "<what was wrong>"` changes any of it, and `--admire "<what you like>"` weighs the traits you name up.
Two writers with three or more pieces each are told apart reliably; three or more may be read as two, and a folder too
small to tell stays one voice.

### Voice, and other registers (opt-in)

A skill built from blog posts is evidence about blog posts. Ask it for a contract and nothing in the corpus
says which of your habits belong there. So the voice layer starts from a declaration, and does nothing until
you make one:

```bash
atelier voice register --skill posts post            # the register your pieces are written in
atelier voice transfer --skill posts --add c3        # this rule carries to any register (your ruling)
atelier voice pairs --skill posts                    # build the pair bank: one model call per paragraph
atelier fidelity --skill posts --set voice=incontext # turn the voice pass on
atelier fidelity --skill posts --set voiceGate=reader # only if the gate study qualified it: a small model reads each rewrite in place of the word lists
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
`atelier --help` shows the three commands; `atelier lab` lists every other.

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
