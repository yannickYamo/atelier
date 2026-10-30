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
material, the numbers must be there, and the specific must really be where the reader said it was. What
doesn't trace meets the skill's latitude (below): on a strict skill a figure, date or citation not in your material
stops the work, on a grounded one it is flagged for your review, on a creative one it is listed for you. Nothing is
deleted unless you choose it (`atelier material --skill <name> --cut`), and then only where a reader qualified on
that kind of work found it. With no material bound, a document's invented story, figure or source is replaced by a slot
for your own (`--no-placeholders` lists it instead), a reply lists every specific as unverifiable, and a check that looks
things up in your material says it was not checked.

### How strictly the work is held

Every skill has a latitude, read at the build from your examples, your method and what the skill is for, and said in
one line:

- **strict** (a contract, a policy, a claims decision, a label): house language and defined terms; a figure, date or
  citation not in your material stops the work.
- **grounded** (a report, an analysis, a support answer): free in wording within the method; what doesn't trace goes
  to your review.
- **creative** (a post, an essay, a newsletter): the writer composes freely, argues, takes positions and uses marked
  hypotheticals; only facts presented as real need a source, and those it can't trace are listed for you. The rules
  no check reads are accepted as unmeasured by default, so a run isn't held for your review on their account.

It is yours: `--latitude strict|grounded|creative` on the build, or `atelier amend --skill <name> --latitude <level>
--reason "<why>"` after, and `--unmeasured accept|review` for the rules no check reads. On a strict skill nothing is
accepted unless you say so; `--accept-unmeasured <rule,...>` (at the build, or with `atelier amend`) accepts the rules
you name, by id, key or number: a rule no check reads, whole, and a rule a check reads only in part (the "one paragraph"
of a Summary step) or whose written check has not qualified, for the part no qualified check reads. Every accepted rule
is listed on the record and the certificate, a partly read one with the part you accepted. An output in which every
required rule was read in full and held, nothing is listed, and every other rule is accepted or does not apply, is
VERIFIED at every level. A request that needs more care
than the skill (a figure to publish, asked of a creative skill) is held stricter for that run, on its own words, and
never looser. The record and the certificate of every run say the level it was held at. A level you set, and the rules
you accepted unmeasured, stay when the skill is built again; a rule given a check leaves the accepted list.

### What is done with the work: the consequence table

The record says what was observed (VERIFIED, NEEDS REVIEW, BLOCKED). What is done with the work is a separate decision,
its **delivery**, made after repair by one table with a row per kind of finding. The latitude gives the defaults:

| finding | strict | grounded | creative |
|---|---|---|---|
| `trusted-fail`: a counted or qualified check fails | block | block | label |
| `untrusted-fail`: a written check not yet qualified fails | label | label | label |
| `untrusted-pass`: it finds nothing | label | label | label |
| `judgement-unread`: a judgement rule, or the unread part of a rule | label | label | label |
| `judgement-missed`: the taste reader, qualified on the rule, read it as missed | person | person | label |
| `untraced-specific`: a figure, date or citation decided absent from the material | block | person | label |
| `claim-flagged`: a specific only an unmeasured claim reader flagged or could not find | label | label | label |
| `not-run`: a check could not run, or its material was not bound | label | label | label |
| `listed`: listed for you only (accepted unmeasured, possible slips) | label | label | label |
| `clean`: nothing found anywhere | ship | ship | ship |

A row that stops the work (person or block) does so only for a check that has proven its false stops: by definition (a
count at zero, a rule in your words, a figure code finds absent from the material), by your rejection naming the rule
(`atelier rate <run> no "why" --rule <rule>`), or by the clean examples it was held to. The latitude sets how much good
work the stops may cost (strict 20%, grounded 10%, creative 5% of good outputs, the false-stop budget), checks are
admitted to stop in order of proof while the product of their proven specificities stays within it, and every other
check steers the draft, ranks drafts and aims repair, then writes what it found on the work. The record's `delivery.budget`
says which checks were held to steering and what each would need. A row you set yourself is your word and is not held
to the budget. The format's limit, a rule you made required yourself (`--set <id>=required`) and a text that is mostly one of your examples are proven by definition and may stop the work on any latitude; `--strict` refuses any output with a required rule broken, whatever its check has proven.

The work is delivered by the most severe row that fired: **SHIP**, **SHIP LABELLED** (out, with what was not read named
on it), **PERSON** (out, marked for your review; exit 0) or **BLOCK** (exit 1, and exit 2 from the hook). A step set
aside for the request never holds it. `--strict` refuses what was not shipped. `atelier amend --skill <name>
--consequence untrusted-fail=block --reason "<why>"` sets a row (`=default` takes it back); only the rows you set are
kept, in the standard's hash. The record head and the certificate of every run carry the decision and the rows behind it.

**The loop runs itself.** `atelier report --pending` lists the runs sent to you and not yet ruled on, newest first. Your
ruling (`atelier rate <run> yes`, or `no --rule <rule>`) holds every written check again at once: a run you would ship is
one more example each check must pass, one you would not, naming a step, one more break its check must catch and the
others must not fire on. A check that now qualifies is enforced, so its failures are repaired, then blocked, instead of
sent to you; the certificate lists what moved (`requalified`). It is counting, with no model call, and runs again on every
build and on `atelier report --requalify`.

**Repair answers to the same table.** A rewrite is refused only by a rule whose failure would hold the work at the run's
latitude (a row that sends it to you or blocks it): a rule that would only label or list the work, such as the claim check
on a creative skill, never undoes the repair of another. Each rewritten span is judged on its own: one that fixes its rule
and breaks nothing that could hold the work is kept, and only a harmful span is discarded, named on the step.

**What the writer delivers is what it puts inside its field.** The writer is asked for the piece between `<work>` and
`</work>`; anything it says about the task outside the field is set aside, kept on the record (`work.outside`), and never
delivered or checked. Each field closes at its own first `</work>`: two fields deliver their insides, and what stood
between them is outside; a field shown inside a code fence is no field. A reply with no field is taken whole, and the
record says so (`work.delimited: false`). `invoke --json` carries the field as `work`.

**Fixed in code where meaning cannot change.** Where a rule bans dashes, each one (an em dash, or a double hyphen typed for
one) is replaced by position: a pair around an aside by commas, a short tail by a comma, a long one by a colon, a dash
with nothing after it by a full stop. A double hyphen with a digit on both sides is a range ("2018--2020"), not a dash;
one inside a URL, a path or a class name is a token; front matter and quotations are left as written. A signposting
clause is cut only as a whole set-off clause: between two commas, or opening the sentence with a whole clause after it
("To be clear, the ferry leaves" becomes "The ferry leaves"); a phrase that is the sentence's subject ("The short answer,
though, is no.") goes to the model's rewrite, as does anything else.

**What only you know is asked before the draft, and the draft is planned.** Where a small reader is set up, before a
piece is drafted the run lists the decisions it needs and asks you only those whose answer is yours alone and would
change the draft: the angle or why now, what may be named, news about your own work, what to stress. Never voice or form,
never what the request, material, method or examples settle, at most three, each with two to four options and a
default, and none when the request carries it. The angle and news of your own work are asked wherever the request, the
material and what you said before do not state them in so many words: a reaction post with no stated angle asks for it. At a terminal you answer with a letter, your own words, or "just write
it". Elsewhere (`--json`, a pipe, the MCP server, an agent) nothing waits: the questions come back as
`questions: [{id, ask, options, default}]`, the work is written with the defaults (served to the writer as assumptions, never as your answers), said in one line, and
`--answers "angle=b,naming=only the product, never its staff"` answers them on the next call (an answer may hold
commas; a kind not asked this run, `naming=...` say, still applies and replaces what you said before). Your answers are
the next run's defaults ("last time you said …"); what may be named, once said, is not asked again. Then the run makes a plan: the angle, the
pain, the turn, the answer, the points it takes from your material (each tied to its words), one image, the
close, and what was left out and why. How many points depends on what your material is to the piece, read on each run
and shown as the plan's first line: what the piece must say (terms to state, questions to answer, findings to raise,
points you listed to make) is carried point by point, up to forty (any past that is listed as left out), a point
left out only where the length cannot hold it; a pool to draw from gives at most three, and an unclear reading is a pool. Where the piece argues nothing (a reply, a clause, a review), the angle is
what it must get done. At a terminal it is shown before writing (enter writes; anything you type makes
the plan again from scratch with every change you typed); with `--json` it is returned as `plan`. The draft is written from it: the
writer is served the plan's points in the plan's words, not your notes, and never what the plan left out (the checks
still read your notes). The plan is never part of the work and stays on the record (`atelier report <run>`).
`--no-questions` and `--no-plan` turn either off; with no reader set up nothing is asked and there is no plan, and a run
with no plan says why on its record.

**Notes written as sentences are points.** Where your bound material holds finished sentences, the run says so once and
serves it to the writer as points to write from. The work is read for the stretches it copies from the material: every
run of 5 words or more is on the record (`copied`), and one of 8 words or more is rewritten in the writer's own words
like any listed finding. It never blocks the work.

**The length the request asks for is a rule of the run.** Outside its range after repair, the piece is written again once
toward it, and that draft is kept only if it lands inside and breaks nothing that could hold the work. The record says the
length and the range either way ("170 words written, within the 150 to 200 it allows").

A document of your material is named the way you cite it, at the build and at a run alike: the file's name without its
folder or extension, `-` and `_` read as spaces (`notice-of-loss.txt` is "notice of loss"); `--with <name>=<file>` keeps
the name you give. A check written against your examples' material reads the same names on new work.

With your material bound, a run in which every specific is found in it reads VERIFIED at any level (where everything
else required was read in full and held); what is blocked, flagged or listed by the level is what keeps it from that.

- A figure credited to a study, a quote from a named person, or a link offered as a source is yours to
  supply. It never passes as "general knowledge".
- In a white paper, a report or a contract, nothing passes as general knowledge.
- Only a qualified reader may cut. The current reader reads headings and tables and strips markdown before
  matching, so a true story written in markdown is not cut for its formatting. Measured on 25 unused product
  essays at its production settings, it caught all 46 planted inventions (a pattern check caught 11) and left
  39 of 48 clean drafts alone. The earlier reader, also qualified, caught all 35 planted inventions on 28 unused
  technical and marketing pieces (a pattern check caught 9) and left 35 of 38 clean drafts alone. Most of
  its false flags were the author's own true stories, so bind yours with `atelier material`.
- Headings and tables are read. A claim the reader flagged is still cut if the reader fails partway through.
- It deletes only where you chose `--cut`, with your material bound, on a kind of work the reader was measured on.
  Anywhere else it blocks, flags or lists by the latitude and deletes nothing. Where it does delete, expect it to cut
  a true detail now and then: add the detail to your material and it stays.

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
atelier new ./posts --method method.md       # build: your finished work, and a note of how you do it
atelier run "write the launch post" --with notes.md     # run: the work, then its evaluation, rule by rule
atelier fix "the opening buried the news"    # react: what was wrong, in your own words; that piece is written again
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
fails. That is the one path by which work with judgement in it reads VERIFIED, besides your accepting a rule as unmeasured. A rule you stated stays required when your own examples do not follow
it. The build never stops for that: the rule is checked and shown on every run, and blocks nothing until you
confirm it (`--yes`) or change the method. A step whose written check has not qualified on your examples is yours
the same way: required, its check shown, and the run left for your review on it. `atelier verify`, `atelier report`,
`--json` and the MCP check carry the same record (`record`), so they cannot disagree with the card; `verify --json`
lists what blocked the text under `violated`, from that record. A run asked for `--json` that stops before its record
prints `{"schema", "state": "ERROR", "error"}`, never nothing. As a hook, `verify --hook` names any required rule it
could not read on the event (a check that reads your material, where the event binds none) and blocks nothing on its
account; an event that is not a JSON object exits 2, so a guard wired wrong is seen.

`atelier fix "<what was wrong>"` goes one of three ways, and you choose by saying so:

- **This piece** (the default). Only what you named changes, and your skill is not changed: one complaint about one
  piece is not a rule. A small reading finds the sentences your words are about (a closed answer: their numbers in
  the piece, or "the whole piece"); only those are written again, and code puts them back, so every other sentence
  stays word for word. You see the piece, "Changed 2 of 30 sentences", and each changed passage before and after;
  the whole piece is checked again against your rules and read against your range, and `atelier report <run>` keeps
  the same diff. A sentence your words are about that comes back as it was is said, with why (the rewrite kept it
  word for word, what it added was not in your material, or each rewrite brought back wording an earlier fix took out). Where your words are about the whole piece, or no model can read them, it is written again whole.
  What a fix took out of the piece stays out of it: a later fix, or the piece written again, that brings back 5 words
  or more of it has that passage written again, and the record says so. It is also recorded as a piece you would not
  have used, with why. Quote it back yourself ("change it back to '…'") and it may return: the fix says so, and later
  fixes no longer keep it out.
- **Every run** (`--always`). Where your rules already cover it, Atelier tries another way to carry them and shows
  you both results. Where they do not, it asks whether this should be a rule; nothing becomes one without your yes.
- **The evaluation** (`--evaluation`). It blocked what was right, or passed what was not. It is recorded with what the
  evaluation said, and nothing is changed: a check reads one of your rules, and is put right through the rule.

Your own rates steer every run of a skill built from four pieces or more: how long your typical sentence runs, and how
many of your sentences are five words or fewer, each read over all your pieces. The writer is told them before the draft
("sentences around 15 words; about 1 in 8 under 6 words"), and a draft off either is written again or rewritten toward
it, never failed for it (`--graded none` turns the steering off for a run). How often you say "I" is a ceiling: the
writer is told the most your pieces carry, and a draft above it is written again toward it; a draft below it is never a
miss, since it could only reach your rate by inventing opinion you never gave.

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
atelier new ./memos --method method.md               # your finished examples (a file or a folder), and a note of steps
atelier new ./memos --method method.md --review      # look at what it would check, and build nothing
```

Every step of the note is your rule, in your words. It calls no model. The screen sorts the steps into three
kinds and says, for each check, what it looks for and how your examples fare on it:

- **Checked on every output.** A section the work must have ("Open with a Summary section", "Then a Background
  section"), one of a closed set ("a Recommendation section that holds one of: Go, Wait, Stop"), a
  table's columns, a length you stated ("between 150 and 230 words", "under 280 characters", "no sentence longer
  than 25 words"), the words a paragraph starts with, a word never to use.
- **Checked against the material.** Figures that must be ones you gave, and places cited as `path:line`: each
  citation is looked up, and the material is shown to the writer with its line numbers so that none is counted.
- **Judgement.** Everything else: shown to the writer, reported as not measured, never called checked.

A check is kept only when every example holds it, and once built it is kept: a rebuild reads a step's check again
only when the step's wording or the examples changed, so rewording one step changes that step's check and no other.

The build also says what form the work takes, read from your examples: replies in a conversation, or documents. A piece
is a reply only where it answers a particular person who wrote first; posts written to whoever reads them, an essay, an
announcement, are documents, and a document is asked its questions and planned before it is drafted.
`--work-form reply|document` says otherwise.
An output you reject naming the rule it breaks (`atelier rate <run> no "why" --rule <rule>`) is one more edit a
written check must catch to qualify: the check is held to it at once, and that step's check is read again at the next build. The rule is named in the
standard the output was made under and kept by its words, so building again with the steps renumbered does not move
it. Every sentence of your note is a step, beside a list or not; which are instructions and which explain is read and
shown at the build. A skill from rules alone, built again after you rated drafted answers, keeps the rules you
accepted: `atelier skill --yes --name <name>`. A step that a piece of yours does not do is named with the piece
and left for you to judge; change the note or the example and build again to have it checked. Building again in
the same folder makes a new version of the same skill. With three or more
examples, the pieces are served with the skill and their lengths recorded, so a draft is chosen by how near it runs
to them when a request names no length. Three short pieces and a few lines of rules are enough to build from.

Two limits. One step gets one check: "Then a Sources section: cite each item as path:line" is read for its
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
you to check, not cut. Elsewhere an invented story, claim of evidence or quotation meets the skill's latitude, and is
cut only where you chose `atelier material --cut`.

A rule you state, amend or add that forbids or caps something your own pieces do is kept as you wrote it, and you are
told once how often they do it: "Your examples use em dashes (—) in 4 of 5 pieces; your rule bans it; kept as you wrote
it." A double hyphen typed for a dash counts as a dash, and a short piece that uses one is counted too. A step of your
method that bans something Atelier counts ("No em dashes.", "No "not X, it's Y"") is held by that count at zero, and your
examples' own use of it is then no allowance: nothing tells the writer it may use one.

A rule can be set aside for one run: `atelier run "<task>" --set-aside p3,p10` leaves the rules named out of that run's
prompt and does not count them against the output; the skill is untouched, and the run's record names each rule set
aside and why. The same request with and without a rule is how a rule earns its place.

A rule read off your pieces that applies under a case in its own words is served only where the case is shown: before
the draft, a small reading places it against the request and the material bound to it, and a rule whose case nothing
given shows is set aside for that run and named so on the record. A step of your own method is placed the same way but
stands unless the request's own words lift it.

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
holds your rules and your voice as well is a question for a measurement that has not been run.

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
varied as you are. The typicality and the detector monitor and record; steering on them is an experimental
instrument (below), off unless you ask for it.

A text farther from your pieces than any of them is from the rest reads "beyond every piece of yours", with both
distances: the share cannot go below 1 in (your pieces + 1), so past your farthest piece it says nothing. The
`--typicality` report also tells your own pieces from each other at random halves and prints that AUC: at a dozen
texts a side an author's own pieces are told apart at 0.7 to 0.8 one time in twenty, so an AUC is read against that floor, not against 0.5.

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

`atelier invoke --skill <name> --strict "<task>"` delivers the output only when its delivery ships it (SHIP or SHIP
LABELLED, above); one that goes to a person or is blocked is refused. A reply that leaves out
part of what the request asks is written once more; a draft that breaks a REQUIRED rule is written again
(`--redraws <n>`, default 2); what still does not conform is refused with its reasons and exit code 3, and
`atelier report <run>` shows the text. `--allow-nonconformant` delivers it anyway, marked. To make it the skill's
way of running: `atelier fidelity --skill <name> --set delivery=strict`. It holds the REQUIRED rules that have a
measurement and the claim check; a REQUIRED rule in prose with no measurement is outside the guarantee.

Delivered under `--strict` means the consequence table shipped it. It does not mean
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
until it is qualified.

### Several writers in one skill

Point `atelier new` at a folder with pieces by several writers, labelled (`author:` front matter, a folder per writer,
or `--authors`). A label splits the pieces only where at least one writer has enough to be counted alone (30 sentences,
10 paragraphs or 1,000 words of their pieces together); where none has, the pieces are read as one voice and the build
says so in one line. Unlabelled, a folder is one voice: where the writing itself shows several, the build says how many and
builds them as one, since one folder is what you pointed at; `--voices` builds the blend of them instead. The voices are
told apart by how they are written (function words, phrasing, punctuation), never by format or length, so one writer's
essays, lists and posts stay one voice. Each voice is read on its own, its most characteristic traits are taken, what every voice shares
is kept as method, and every clash is settled by which side is more characteristic, with the reason. Nothing is asked;
the build says one line ("Combined 2 voices: openings from the first, tone from the second…"). Every inferred trait
steers and never blocks. `atelier report --skill <name>` shows the grouping, every weight and every settled clash;
`atelier fix "<what was wrong>"` changes any of it, and `--admire "<what you like>"` weighs the traits you name up.
Two writers with three or more pieces each are told apart reliably; three or more may be read as two, and a folder too
small to tell stays one voice.

### Experimental instruments (opt-in)

Everything a run does by default is there because a measured failure asked for it: the brief, drafts on demand,
the repair of required rules, the claim check, grounding, the request's length. The instruments below exist in the
code, each behind its own flag on `atelier invoke`, and none has a measured result that puts it on the default
path. `atelier lab` lists them. Each stays opt-in until a measurement moves it onto the default path or removes it.

| flag | what it does | what is known |
|---|---|---|
| `--fidelity`, `--edits <n>` | structural edits toward your range after the checks | measured: 0 of 20 whole-text edits kept; in-range share 0.733 against 0.738 at 3.3 times the cost |
| `--until-typical <share>`, `--until-author <p>`, `--shape-rounds <n>` | more rounds until an output is as typical of you as that share of your own pieces, or until the detector reads it as yours; a REQUIRED rule is never traded for it | the detector does not carry across model families; typicality misread long texts |
| `--select sample` | among drafts the rules cannot separate, draw one by how likely it is yours | not measured |
| `--context local` | your range on the request's subject, from your nearest pieces | an offline test found it no better than the usual range |
| `--nearness reader` | your nearest pieces found by subject, read by a small model | not measured on an outcome |
| `--structure plan`, `--sections` | drafts written against a skeleton of your paragraph moves, or section by section | not measured |
| `--examples-first` | your pieces, method and rules served with no description of how you sound | not measured |
| `--voice incontext` | the voice pass from a pair bank (next section) | whether it moves your voice has not been measured |

### Voice, and other registers (opt-in)

A skill built from blog posts is evidence about blog posts. Ask it for a contract and nothing in the corpus
says which of your habits belong there. So the voice layer starts from a declaration, and does nothing until
you make one:

```bash
atelier voice register --skill posts post            # the register your pieces are written in
atelier voice transfer --skill posts --add c3        # this rule carries to any register (your ruling)
atelier voice pairs --skill posts                    # build the pair bank: one model call per paragraph
atelier fidelity --skill posts --set voice=incontext # turn the voice pass on
atelier fidelity --skill posts --set voiceGate=reader # only once the gate is qualified: a small model reads each rewrite in place of the word lists
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
not been measured; that takes a blind read by people.

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
