# Changelog

Notable changes to Atelier. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**From 1.0 the on-disk state format under `$ATELIER_DATA` is stable within a major version:** a 1.x release
reads every store a 1.0 release wrote. Before 1.0 a minor version could change it.

## [Unreleased]

### Fixed, for 2.0: a verdict that can be met by an empty shell or an invented number is not one

Found by running both ways in from end to end as a new user would, and by an audit of the statistics.

- **A section must hold something, and be where the method says.** A heading with nothing under it counted as the
  section, so a draft sent back for a missing section returned with the bare heading and read as complete. "Open
  with" and "end with" are now held to the first and the last section. A table needs a row that says something.
- **A figure is sourced when it was given.** It counted as sourced when any two numbers in the material added up
  to it, whatever they counted: a dose passed because a chart held an age and a breathing rate. A sum or a
  difference is now of two amounts of the same thing, where at least one says what it counts, exact or rounded as
  a figure of two significant figures or more is; a share is of one count in a larger one of the same thing, and
  two cells of one row of a table are the same thing. An amount in a unit of measure
  matches that unit, however it is written ("40 mg", "40 milligrams"), or the number in a table whose heading
  carries the unit. With no material bound the rule did not run at all; it now runs against the request alone. A
  blood pressure written with a slash and a single digit with its unit are figures. A bare day beside a month's
  name, and a bare number after "line" or "clause", are not; a percentage or a sum of money always is.
- **An invented figure can be cut, and only it.** The rewrite that removed it was refused for losing a figure, and
  the figure was delivered. The rest of its sentence is held as in any rewrite.
- **A reproduction has the shape of the work held back.** `atelier reproduce` counted the run's own verdict, and a
  skill with two rules of style gives that verdict to anything tidy. The held-back piece is never served; it is now
  read in code beside the output, and a case is reproduced only when the output also has two thirds or more of that
  piece's top sections (where it has two or more), each saying something, however either marks them. A section is
  matched by the words of its name: one renamed altogether is not found.
- **More of a method is checked.** A step is linked to a section check however its sentence opens ("Include a
  Background section"), with the name in quotation marks, or as "a section called X". Work that marks its sections
  with labels and not headings (a handover note, a contract clause) is read as it is written. A sentence that
  describes the work is not a step for holding the word "never".
- **`atelier method` builds in one call** when every step is one your example holds. Where your method and your
  example disagree, it stops and asks that. `--review` only shows.
- **`atelier method` no longer replaces a skill of the same name built in another folder.**
- **The copying check is read in one pass, in every script.** A long copied stretch, the case the check exists
  for, was the one it was slowest on: 600 copied words took seconds and 4,000 did not finish. An exact copy in
  Cyrillic read as no copy. Same numbers as before on unaccented text. An accented word is now one word, so a skill
  built from accented work gains its standard wording at its next build. Wording that repeats the same six words
  hundreds of times still takes seconds.
- **A length is read the way people say it.** A number in a title is not a length ("10 words that changed our
  roadmap" was read as a post of ten words). "Write a 20,000 word book", "roughly two thousand words" and "a
  two-page brief" are read. A request that states words and paragraphs tells the writer both; the one a draft is
  held to is the last said. A count is not a length where it describes text that exists, an edit to make or a
  rate. A small number spelled out is read only after a word that asks for it ("write three paragraphs", "about
  two pages"): read from prose, a false length does harm, and one missed costs nothing that was not already so.
- **The exact interval and the paired test hold at any size.** From n = 90 an exact interval came back as {1, 1},
  and a paired test on a thousand pairs as p = 0, with no error. No published figure was affected: every one was
  recomputed, and all were at smaller sizes.
- **The screen of candidates no longer loses all of them to a cycle,** a threshold is compared with the number and
  not the number rounded for the screen, and the rhythm reading takes the middle of an even number of drafts.
- **The search remembers.** `atelier evolve` reads the searches kept beside the skill and does not run again what
  they ran on the same working briefs and did not keep. A change that breaks a brief both runs of the unchanged
  skill held is not kept. Where no gain could be shown at the size given, nothing is run to look for a gain.

Known and not fixed here:
- The two ways in still cannot build one standard together.
- **The figure check reads numbers, not what they are about.** Two reviews of it found errors in both directions,
  and fixed most. What remains: the sum of two unrelated amounts in the same unit passes (two doses in mg); a figure
  moved from one subject to another passes; currency and time units are not compared ("€500" meets "$500", "47
  minutes" meets "47 hours"); no unit is converted (1 g and 1,000 mg); a decimal comma is misread; a figure the
  writer proposes ("cap the delay at 30 seconds") is flagged like one it claims.
- **The length reader still reads some counts that are not lengths** ("We indexed 1,200 pages. Write the changelog
  entry.", "Find 10 words that rhyme"), as 1.x did, and misses some plain ones ("Give me two paragraphs.").
- Sections in a format no reader here knows (tracked changes, comments anchored to a line of a diff) are not seen.
  A speaker's name before a colon can be read as a label.

One erratum, in a pre-registration that is left as
sealed: `studies/EXTERNAL_EXPERT_B2_PREREGISTRATION.md` says a 60/40 split at 0.80 power needs about 150
discordant pairs. That is the one-sided figure; for the two-sided exact test the study declares it is about 200 to
210.

### Added, for 2.0: a skill improves how it carries its method, with nobody guiding it

On top of `atelier method` ([decision 0018](docs/decisions/0018-a-skill-improves-how-it-carries-its-method.md)).
Built and tested offline against a scripted model. It has not been run against a real one.

- **`atelier evolve --skill <name> --briefs <folder>`** runs the skill on briefs you give (a task and its material
  each, no reference answer), reads what its drafts keep leaving out, tries one change at a time and keeps a change
  only when it is plainly better. `--dry-run` says what it would run and calls nothing. No run is started that
  what is left of `--cap` cannot cover.
- **Your standard is never changed by it.** What changes is how many drafts are written, and a note to the writer
  naming what earlier drafts missed, in the words of your standard's required steps. No model writes the note.
- **It is held back from fooling itself.** The unchanged skill is run twice, and a gain inside what those two runs
  differ by is not a gain. A change that costs more must buy it with cases. A candidate that carries a brief is
  refused before it is run. A fifth of the briefs are set aside before the first run and read once at the end, and a
  change is adopted only if it is no worse there.
- **Every search is kept, adopted or not,** with what was tried and why each change was or was not kept.
  `atelier evolve --skill <name> --rollback` goes back one adoption at a time.
- **A run that breaks stops the search.** It is never counted as a case that failed, nothing is adopted, and the
  command exits 2. A signal stops it the same way and puts back what the search moved.
- Where a skill has a release, the number of drafts stays the release's and only the note is searched.
- **What it cannot improve, it says.** It is scored on what the checks read. A judgement step is scored by nothing.
- An adoption is bound to the standard it was made under, and is not used after you change the standard.

### Added, for 2.0: a skill from one method and one finished example

A second way in, beside `atelier new` ([decision 0017](docs/decisions/0017-a-skill-from-one-method-and-one-example.md)).
Nothing changes for a skill built from a body of work.

- **`atelier method <note> --golden <example>`** reads what you say is done (steps, a template, both) and one piece
  of work where it was done, and builds a skill held to the method. It calls no model, and `--yes` accepts exactly
  what the screen showed.
- **Each step is yours, in your words, and is one of three things.** Something the work must contain (these
  sections, this table), read by code on every output. Something it must be made from (every figure is in the
  material), read against what was bound. Or a judgement, shown to the writer and reported as not measured.
- **A step gets a check only when your own example passes it.** A step your example does not hold is kept as yours
  and asked about: your template and your finished work disagree, and only you know which is right.
- **What your example shows and your method did not say is proposed, and shown, never required.**
- **No taste is read from one piece.** How you sound is read from a body of work, with `atelier new`.
- **Every run says what was held:** "Method: contains 3 of 3 thing(s) it must · made from what was given 1 of 1 · 1
  judgement step(s) not measured."
- **What a draft left out is written again with it named.** A missing section or table is never patched into a
  sentence. An output that follows the easy rules and says nothing is not conformant: it lacks what the work must
  contain.
- Two new checks, usable by any standard: `TABLE` (a table with these columns) and `CITED` (every figure is in the
  request or the material). A check may now read the request and the named material, not only the output.

### Fixed, for 2.0: a test run is never something a skill learns from

- **A run marked as a test is a measurement, and nothing that learns reads it.** A held-back case run by `atelier
  reproduce`, or a benchmark answer, was recorded with every other run, and `tend`, `mine`, the learned list of
  machine-writing phrases, the search over implementations, the optimizer and `eval` all read it. A skill changed
  on what a held-back case showed has seen that case, and its next run of it tested nothing. The runs a skill may
  learn from are now read in one place, which leaves test runs out; `eval` leaves them out of its counts.
- **A reproduction is bound to the run that held its cases back.** The skill under test must hold the standard that
  run closed, or one that supersedes it; otherwise nothing is run. The record carries the run, its sealed corpus, a
  hash of the cases as they stood, and how many times they have been run on each version.
- **`--cap` is the total for the command.** Each case's run is given what is left of it, split between the run and
  its claim reader, and a case is not started on less than sixty cents. It was checked only between cases, so the
  last run could pass it. A run that stops partway is counted at what it had spent.
- **A reading of a test run by the taste reader is not kept,** `atelier fix` refuses a run marked as a test, and
  observations made on one are not evidence a skill is changed on.
- **A held-back piece that has been read is never run as reproduction,** and whether one has been read is part of
  what the reserve is identified by.
- **Every reproduction is kept and none is written over.** Each run is its own file; the first look at a set of
  cases is the only one that is a test, and a later run says it is a repeat and where the first is kept. Exposure is
  counted for one set of cases and never carried to another.
- **Each case can be walked back to its run:** the invocation, the output by hash, the rules it broke by id, the
  longest run it shares with a piece the skill carries. Where a rule the output broke is one the expert's own
  held-back piece breaks too, the record says the standard asked more than the work does.
- **A case on which no required rule is checked by code is "not observed",** never "reproduced".
- **A reproduction never accepts a new runtime for the skill.** A measurement does not change how a skill is run.
- **`--bare` is called what it is: a one-shot floor.** One plain call a case, checked afterwards. The skill's run
  drafts more than once, chooses, repairs and has its claims read, so the gap between the two is the runtime and
  the skill together and is never offered as what the skill adds. Each case now records its own cost.

### Changed, for 2.0: sentence length is a rule only where it is the writer's own rhythm

- **A count is not a style.** How long sentences run follows the piece: its format, its reader, what it is for. A
  rule on sentence length, on the share of short sentences, on the mix of lengths or on how much they vary is now
  suggested as required only when the writer's rhythm is detected as theirs: the same in piece after piece, and
  apart from what the model writes on the same topics (a monologue that runs a hundred words before it stops, or
  prose cut to the bone). Otherwise the rule is counted, shown and used to choose between drafts, and the review
  says why: "how long your sentences run changes from piece to piece, so it follows the piece". You can still make
  it required.
- The rhythm is read on prose sentences only. A heading, a line that is only a bold label, a list item and a table
  row are not sentences of the writer's prose.
- Found on a real corpus: every output written to a standard, and the author's own held-back piece, failed on a
  required mix of sentence lengths that the format, not the author, had set.
- Applies to a new discovery. A standard approved before is unchanged; `atelier amend --rule <id> --materiality
  PREFERRED` makes the same ruling on it. The counted checks themselves still read a bold label line as a
  sentence: changing what an approved rule counts needs its own decision.

### Added, for 2.0: `atelier reproduce`, whether a skill reproduces work it never saw

- **`atelier reproduce --skill <name>`** runs each piece that was held back with its task and its material: the
  skill is given the task and the material and never the piece, writes through the same checked path as any run,
  and the output is read by that run's own verdict.
- **A case is checked before it is run and its output after.** A case whose task repeats the finished work's own
  wording, or whose material holds the finished work, is not run and is said. An output that carries wording of the
  held-back piece that its material does not hold is not a reproduction, whatever else it met.
- **What it reports is a count of cases.** A case is reproduced when the run's verdict was "conformant"; a refusal
  under strict delivery is a case that was run and not reproduced. Under the count: unsupported specifics (read
  only when a qualified reader read every case, and "not read" otherwise), required rules met, and your own
  held-back work on the counted rules that apply to every piece. There is no total and no label, and the number of
  cases is beside every count. Required rules no code can check are counted apart and are in none of it.
- **It counts how many times the held-back cases have been run on a skill**, and says so from the second time: a
  piece held back is unseen once.
- **`--bare` is a one-shot floor:** the same cases, one plain call each, given the task and the material alone and
  read with `atelier verify` against the same standard. Its record is kept apart.
- `--dry-run` shows what each case would be given and calls nothing. `--cap <usd>` holds the total (5 by default).
  The record is kept with the skill and shown by `atelier report --skill <name>`. A reproduction does not become
  "the last run" that `atelier fix` and `atelier report` point at.
- Run it from the project the skill was built in: the held-back pieces are kept with that run.
- Known limit: `atelier_skill_report` (MCP) does not carry the record yet.

### Added, for 2.0: an example may carry its task and what it was made from

The first step toward a skill built from a method and examples of good output. Nothing changes for a folder of
finished work alone.

- **An example can say what was asked and what it was made from.** The task as before (`request:` in the front
  matter, or the `## Request` / `## Answer` layouts). The material in a folder named after the example
  (`acme.md` and `acme.material/`), or named in the front matter (`material: filing.md, notes/call.txt`, paths from
  the example's own folder). Material is read as that example's sources and never as your finished work.
- **Each example has a class, and intake says what you gave:** "8 examples: 2 with the task and the material it was
  made from, 1 with the task, 5 finished work only." Every example teaches the standard. Only one that carries both
  its task and its material can test whether a skill reproduces your work, because only then can a candidate be
  given what you were given and nothing of what you wrote.
- **A piece held back is one that can be tested.** The automatic reserve puts half of the examples that carry both
  their task and their material first in line, and leaves the rest to be learned from; among examples of one kind
  it chooses as it always did.
- **A held-back example that carries its request is tested on that request.** `atelier reference` gives each arm,
  and shows the blind reader, what was actually asked, where it gave "produce <file>". A skill built before is
  unchanged.
- Material stays inside the folder you point at: a name that leaves it is said and not read. A `materials:` key of
  your own, whose values are not file names, is left alone.

### Fixed

- **`atelier reference` pasted the held-back pieces into the arm it compared them with.** The arm that is given
  your work in its prompt read every piece intake had sealed, those held back included, so each held-back reference
  was in front of the model that was then asked to reproduce it. That arm is now given the pieces discovery read
  and no others. A comparison made with it before this is not a blind one for that arm.

### Fixed: the last fixes before 1.x is frozen

Six defects, named in [decision 0016](docs/decisions/0016-the-last-fixes-before-one-point-x-is-frozen.md), and no
others. A standard approved before this reads and checks exactly as it did.

- **A length stated in numbers sets the length.** "About 2,000 words" was not seen: a run recognised "detailed" and
  "brief" and no number, so the author's usual length stayed in the prompt and chapters asked at 2,000 words came
  back at about 1,550. A stated length (a target, a range, "at least", "at most", "exactly"; words, sentences,
  paragraphs, pages) is read off the request where the request introduces it as a length ("the 500 words I pasted"
  states none), said to the writer after the author's pieces, and the run reports
  "Length asked: 2,000 words. Written: 1,960 words."
- **An em dash you write is yours.** A dash found in fewer than half your pieces was read as one you never use: it
  was banned, and every dash in an output was replaced. It is banned now only if no piece of yours has one, the
  pieces held out included; otherwise a rule of its own holds it to your rate. Applies to a new discovery.
- **A refusal no longer ends a discovery when one model is named for every role.** The retry went to the model that
  had just declined. It goes to the next model that is not that one, and the run says which model read the work.
- **A dropped connection is tried again.** Up to three more times, waiting longer each time, wherever a call is
  made. A backend that is not there, an error it answers with, a refusal and a call that timed out are reported as
  before.
- **Your standard wording is not copying.** A run of words found in three or more separate pieces of yours (a clause
  you use in every contract) is left out of the copying count and listed apart in the run's details. It is read at
  build over all your pieces, so a skill built before gains it at its next build. Words lifted from one or two
  pieces are still copying. Under strict delivery 44 of 100 contract clauses had been refused, most for
  wording of this kind.
- **"No section headings" is proposed where you write none**, as shown: it is counted on every output and used to
  choose between drafts, and it is required only if you say so.

### Fixed: a read of the whole product and of the scripts that decide the closing claims

- **A reply with no text was delivered as a draft that broke no rule.** When the model's reply held no piece, the run
  took it as an empty draft, checked it clean and delivered it, under `--strict` too. It is now a failed draft call:
  with several drafts the others stand, and with none the run says so and delivers nothing.
- **With one piece or two, "one piece is always allowed" allowed every piece.** A rule the only piece broke stayed
  required. One piece is allowed from three pieces up, and none below.
- **A command printed to fit a limit could not be pasted when the rule quoted both `"` and `'`.** It carried a
  placeholder where the rule's words go, and run as printed the placeholder became the rule. The words are now
  quoted in a form any shell reads back as written.
- **The skill's card said two things about reserved pieces.** "3 more reserved unseen, for the baseline below" and
  "no reserved piece to compare with" could stand together. With pieces reserved and nothing steering yet, the card
  says that.
- **`atelier new --accept` ended on three lists of what to do next.** It ends on one.

The scripts, each sealed with a study before it runs:

- **Exactly 20% fewer failures read as a miss** (`bench/compare/closing-quality.mjs`). 40 failures against 50 is 20%
  fewer and is 0.19999999999999996 in floating point. The bar "at least 20%" now includes 20%.
- **`studies/harness/strict-delivery.mjs` believed a cached row by its id.** Given the folder of another run (the
  pilot's, for the sealed run), it took that run's rows for every id the two shared and made fewer runs than it
  reported. Each row now holds its skill, its request and whether it was a pilot's, and a folder whose rows are
  another run's is refused before anything is spent. The pilot and the sealed run each take a folder of their own.
- **It printed FAIL while runs were still to be tried again.** A run that ends on a busy provider is tried again once
  by the same command. Until it has been, the verdict is UNRESOLVED; busy again, it is final and counts as not
  delivered.
- **A judge qualified on part of the planted answers** (`bench/compare/judge-qualification.mjs`). Every labelled answer
  must now have a row, from the judge and from the second judge, or the verdict is UNRESOLVED. A label given twice
  stops the run. In both qualification scripts the bar is read on the counts, where it was read on a share rounded to
  three places.
- **`closing-quality.mjs` and `efficiency-select.mjs` could write over their own inputs.** `--out` (and
  `--disagreements`) naming the config or a file it names, under any name for it, is refused with the file intact, as
  the other scripts already did.
- **A reader's choice under a label no arm has was left out** (`bench/compare/efficiency-rows.mjs`). It stops the run,
  naming the row.
- A file that is not there, or a flag with no value, is one line and exit 2 in `judge-qualification.mjs`,
  `strict-delivery.mjs` and `efficiency-rows.mjs`, where it was a stack trace and exit 1.

### Changed: a golden corpus passes its own standard

From an outside tester who ran the product as a user would and could not start the paid tests
([decision 0015](docs/decisions/0015-a-golden-corpus-passes-its-own-standard.md)).

- **Your own pieces are held against the rules suggested as required, together.** Each counted rule was checked
  alone, on the few pieces held out, and set a little tighter than your average. The rules together could then fail
  the work they were read from: 13 of 24 of one author's own posts broke a REQUIRED rule of their own standard. A
  counted rule is now suggested REQUIRED only if at least 95% of your pieces meet it, and the rules suggested
  REQUIRED must together be met by at least 90% of them (one piece is always allowed, so a small corpus is not held
  to "every piece"); the rule most of your pieces break is suggested as shown instead, and says why. It is still counted on every output and still used to choose between drafts. You can make
  it required on the same screen.
- **The review screen and every build say how your own pieces fare.** "Your own pieces: 22 of 24 meet every required
  rule that is counted." Under nine in ten, the build names the rules they break most and the command that makes
  each a preference: that is how a skill built before this is brought in line, with no new discovery.
- **A limit is set where your own pieces meet it, before any rule is moved.** At discovery a counted limit that
  fewer than 95% of your pieces meet is widened to the nearest value they do meet (a ceiling at most doubled, a
  floor at most halved; a ban is never moved), and the rule says what it was set to and why. For a skill built
  earlier, the build prints the `atelier amend --measure` command that does the same, ready to run, and only where
  no limit can be moved the command that makes the rule a preference. Before this a too-tight limit was kept and
  simply no longer enforced.
- **The build names the rulings that get there, and no others.** Under nine in ten it said which rules your pieces
  break most and gave a command for each, which left you to find the right set by trial. It now gives the limits
  that can be widened, then the fewest rules to make preferences, and says what the count becomes.
- **Fewer rules are moved.** When your pieces fail the rules together, the smallest set of rules whose move brings
  them to nine in ten is suggested as shown, where before the most-broken rule went first and more could follow
  than were needed. The message says how many of your pieces pass once those rules are set aside.
- **A rebuild takes no "write this, not that" pairs unless you ask** (`atelier build --contrast auto`). The first
  version of this change chose them while a skill had none. A store built earlier holds benchmark runs that nothing
  marks as tests, and the tester's plain rebuild of five such skills changed four of them. A rebuild now keeps what
  the skill has, none included.
- **A rebuild of a skill that answers calls no model.** Which of its moves hold back was read again on every build.
  It is kept with the moves it covered and read again only when one is new, or when `--persona auto` asks. (A skill
  built before the reading was kept reads it once more; a reading that failed is said and made again next build.)

### Added: a second voice gate, off by default

- **`atelier fidelity --skill <name> --set voiceGate=reader`.** A voice rewrite is held by a fact ledger in code and
  by word lists that read the strength of each claim. Offline, those lists refuse most faithful rewrites (32 of 112
  kept on one author). With this setting a small model reads the rewrite for changed claims in their place, and the
  word lists stay as the floor when no small model answers. It exists so that the voice-gate study
  (studies/VOICE_GATE_PREREGISTRATION.md) can be acted on if that is the only gate it qualifies; it is not to be
  turned on before.

### Fixed

- **One empty answer no longer ends a discovery.** A rule check that came back with no usable answer stopped the
  whole run, after it had been paid for. It is asked again, up to three times, and only then refused; the answer is
  still never invented. A run that stops partway now says what it had spent.
- **A reader was reported as "could not run" on a model that takes no temperature.** Its calls go out together
  and are all refused at once; only the first was sent again. Each is now.

- **A project folder that moved lost its skill.** Renamed, moved or copied with its store, a project was answered
  "there is no standard to build from yet", and `atelier new` started a second, paid discovery of the same pieces.
  The run that built the folder's skill is now found in the store before any command concludes there is none: a
  folder that moved carries it on, a copy takes a copy.
- **A rebuild that asked for nothing changed the skill.** It chose its "write this, not that" pairs again from every
  run in the store, so a rebuild after a benchmark carried pairs from benchmark answers, and it replaced the
  skill's description with the default one. Once a skill has pairs it now keeps them until `--contrast auto` is
  given; the description is kept; and `atelier invoke --test-run` marks a run whose pairs are never taken (the
  benchmark runner passes it).
- **`atelier report` with nothing named shows the last run made in the project.** A run printed no id, and the
  command asked for one.
- **A first run prints less.** Under `atelier new`, how discovery got to its rules, an empty persona and a range
  measured on no feature are no longer printed; the example of how to change a ruling names a rule that is on the
  screen.

### Added: how big a skill is, and where a run's cost went

Measuring tools only: no default of a build or a run changes, and a skill built before is served byte for byte as
it was ([decision 0014](docs/decisions/0014-the-smallest-realization-that-holds-the-standard.md)).

- **A skill states its size three ways.** Stored (every file of the package), exported (what a run is served and
  what `atelier export` writes) and per run (what one run sent the writer). The first two are on the skill's card,
  printed at build and by `atelier report --skill <name>`, with the export split by part: your pieces, the rule
  examples, the rules and instructions, how you sound, the moves, the reference index, the framing.
  `atelier export --out` prints the same split.
- **A run says where its cost went.** Each model call on the path of a run names its purpose: writing, repair, the
  claim reader, the taste reader, the context judge, steering, the voice pass, nearness, structure.
  `atelier report <run>` and `invoke --json` give one line per purpose with its calls and the tokens the provider
  counted, and the words the writer was sent: the skill, what was added for the request, the request. A call that
  names no purpose is counted under `other`, and a difference between the lines and the total is printed.

### Added: how much of your own writing a skill serves is yours to set (opt-in)

- **`atelier build --piece-budget <words>`** chooses your pieces again with that many words as a ceiling on what the
  export counts for them: each piece with the line that opens its file, in any script, code and tables included.
  `0` serves none of them and keeps the persona and your usual length; `default` gives the budget up, and with
  `--pieces whole` is the default choice again.
  Choosing again reads the pieces the skill was built from and calls no model. For a skill that answers, it is the
  budget of the examples shown: one of each kind of request whatever the budget, none at 0. On `atelier new`, give
  it on the call that carries `--accept`.
- **`--pieces excerpts`** shows each chosen piece by its opening and a passage from its middle, about 250 words each.
  Each passage is one unbroken stretch of your text, with `[…]` where text is left out; a paragraph longer than a
  passage is taken apart at its line breaks, then its sentence ends, and code is never cut. The same budget reaches
  more of your pieces. A piece too short to cut is served whole, and each file says which it holds. For a skill that
  writes: answers are short and shown whole.
- **`atelier export --no-index`** leaves out the list that names each example file: an export has already inlined
  those files, each with its own condition.
- A build keeps the budget and the form until you give others, `--voice auto` included; `--voice none` gives them up
  with the voice. Without these options a
  build chooses exactly as before: the default choice is unchanged, down to what it counts.

### Fixed

- **A rebuild could undo an amendment.** `atelier build` compiled the standard its run had closed. If a rule had been
  amended, confirmed or added since, the rebuild put the earlier rules back and said nothing. A rebuild now compiles
  the standard as amended, under the skill's name or another, and says so. A standard ratified afresh under the
  same name replaces the old one, as before.
- **A run's cost could leave out the reading of the request.** What a run spent was counted from its first draft,
  and the request is read before that. When the claim reader, on a meter of its own, cost more than those first
  calls, they were in no figure. The total and the lines by purpose are now both counted from where the run's budget
  is made.

### Changed: what is printed

Wording only, for anyone who reads these lines with a script. The card at the end of a build has a SIZE block.
`atelier export --out` prints a second line with the export by part, counts words as `wc -w` does (it can be one
lower than before), and its note for a long export names `--piece-budget`. `atelier export` without `--out` prints
the skill and nothing else, as before.

### Fixed: strict delivery refused answers a mechanical fix should have saved

- **The paragraph split now reads the text as the paragraph rule does.** The rule that flags a long paragraph and
  the fix that splits one each found paragraphs and sentences their own way. Where they disagreed (a paragraph with
  a list directly under it, a hard-wrapped paragraph, a block quote) the fix saw nothing to split, the rule stayed
  broken, and under `--strict` the answer was refused: 7 of 80 answers in a development run, all on one rule. The
  split now uses the rule's own paragraphs and sentences, changes no word, and after it the rule holds.
- **A fix that needs no model is never dropped in silence.** When it cannot be kept because it would break another
  rule, the run says which fix and why.
- **The build says how moves are carried in one line,** not one per move.

### Changed: a move is carried no more widely than your examples support

For a skill that answers requests ([decision 0013](docs/decisions/0013-carried-no-wider-than-the-corpus.md)). In a
first development round against a careful hand-written skill, fourteen of fifteen lost cases had one cause: the
Atelier skill withheld what was asked. A habit of three examples in twenty-four had been compiled as a trait, two
moves and a built-in paragraph. Rebuild a skill to get these.

- **A move is stated only on evidence:** at least three pieces where it could apply and a lower bound of 0.3 on how
  often it was made. Below that your own words are shown as one instance and no instruction is written from them.
- **A stated move carries its condition,** and what to do when it does not hold.
- **A move that holds back what was asked is yours to rule on.** A refusal, or a question before any answer, is shown
  as an instance until you say when it applies (`atelier amend --rule <id> --applies-when "<when>"`). The build names
  each one.
- **A move is served with its example, or not at all.** The export used to name example files it did not carry.
- **"How I sound" holds only what holds across your pieces.** A "sometimes" is no longer served as a trait.
- **The built-in guidance gives what was asked first:** against stated assumptions when something was not shown, and
  with the safe path when the action is destructive.
- **The examples shown are spread across the kinds of request you answer,** within a word budget (`--full` for all).
- The build prints how each move is carried and why. Writing skills are unchanged.

### Added: the closing bar's instruments

- **`bench/compare/modes-qualification.mjs`:** qualifies the failure-mode reader on planted good and bad answers,
  0.85 of each class of twenty, UNRESOLVED when a planted answer was not read.
- **`studies/harness/strict-delivery.mjs --repeats <n>`** reads claim B's repeatability, and the script now gives a
  verdict against the fixed bars. The axes read delivered against refused; the size study refuses arms built from
  different standards and reads rules broken per answer; a study planned at 60 tasks is not read on far fewer.
- **Fixed in the harness:** a script given an `--out` that reached its own inputs through a link cleared them; a
  judge row with a missing score was counted as a low one.
- **`bench/compare/failure-modes.mjs`:** one yes or no per failure mode on every answer (withholds the deliverable,
  refuses without a safe path, invents context, action not first), by code where code can tell.
- **`bench/compare/closing-quality.mjs` reads the signed bar:** per axis, both arms' failure rates, the reduction,
  and whether it was reached; and the judge's own disagreement between two reads, with the answers to send a person.

### Fixed

- **The benchmark runner treated a strict refusal as an error,** retried it twice and ended the run, so a refusal
  cost three runs and a refused task was never recorded. It is now one row, with its reasons, and never retried.

### Ready for the closing test

Defects found by an outside review of the build, each with what it broke.

- **The count under "What I add beyond what was asked" used the wrong denominator.** A habit was counted over the
  examples the reader returned, so a reader that answered for two of twelve printed "never (0 of 2)". It is now
  counted over every example it could be read on; an example the reader did not return is unread, and with more than
  one in five unread no frequency is stated.
- **Two request layouts were read as the author's text:** bold labels (`**Request:**` / `**Answer:**`) and `Q:` /
  `A:`. Both now split when the file begins with the request label; an answer label inside a code fence never splits.
  A file that looks like a request and an answer and is not split is named at build, and stays whole.
- **`atelier setup` could append a second `[mcp_servers.atelier]` table** to a Codex config whose header carried a
  comment or a quoted key, and a duplicate table breaks the file. Every spelling of the header is now recognised.
  The `npx` launch it writes is pinned to the running version.
- **The benchmark runner could not see cost.** Its default model had no price, a call's cost came back unknown, the
  loop added 0, and `--cap` never bound. `bench/compare/run.mjs` now defaults to a priced model, refuses a model with
  no price (and another backend without `--price-in` and `--price-out`) before any call, checks the cap before each
  call with room for it, and stops on a call whose cost is unknown.
- **The strict-delivery harness left errored runs out of its rate.** Not delivered is now counted over every request:
  a refusal, and an error that survives two retries. It reports per skill and by reason, and needs two skills of 60
  requests each unless `--pilot`.
- **Planted material is confirmed by a person before a bar is read:** every omission in the coverage study, every
  clean pair in the voice-gate study.
- **The voice-pass harness dropped outputs with no rewritten paragraph,** which could put its pass bar out of reach.
  Every voice output is now shown; both arms are written in one run; it takes two authors.
- **Strict delivery on a skill that answers is held by a test:** a specific that is not in the request is no reason
  to refuse, and a claim of work nobody did is cut before delivery.

### Added: the instruments of the closing test

- `bench/compare/closing-quality.mjs`: the analysis of a quality claim, fixed before the run (case-level paired
  differences, shows and guards, the sentence filled in). `bench/compare/judge-qualification.mjs`: a judge read on
  planted good and bad answers. `bench/compare/rubric-judge.mjs` with `rubrics/stop-slop.json`: a blind judge for a
  hand-written skill's own score. `studies/harness/voice-pass-score.mjs`: the voice read scored over requests.

### Changed: how much a skill writes follows the request, never a learned length

- **A skill that answers states no usual length.** A skill built from twelve answers of 9 to 108 words said "my
  answers usually run about 100 words", and on a request that said "I explicitly want a detailed explanation" it
  wrote a third of what the bare model wrote. The number was the size of twelve questions the skill had never seen.
  A length is not detectable from answers alone, so it is no longer stated: the skill says the request sets the
  length, that a request for a walkthrough, a comparison or a plan gets every part it asks for, and never to shorten
  one to match shorter examples.
- **What is detectable is read instead: what an answer adds beyond what was asked.** A preamble, the request said
  back, a caveat, an unasked alternative, a next step, an offer of more, a recap. Read per example by one model call
  at build, each finding quoted from its own answer and counted in code ("a preamble: never, 0 of 12"). This is the
  author's economy, and it holds at any length. Rebuild a skill to get it.
- **An example may carry the request it answers:** front matter `request:` or a `## Request` then `## Answer`
  section. The request is kept apart, so no rule, band, passage or persona is learned from the asker's words. With
  three or more examples of one kind of request (asked for detail, asked for brevity, neither), the length they ran
  is stated as a record, never a target.
- **The usual length of writing has no floor of 100 words.**
- **A skill that answers is told what to do with an empty context:** say what it looked for and ask for the one thing
  that blocks it, and never describe a project, a file or a result it has not seen.

### Added: strict delivery

- **`atelier invoke --strict`** (or `fidelity --set delivery=strict`) delivers an output only when its verdict is
  conformant. The request is read for what it explicitly asks, and a reply that leaves a part out is written once
  more with those parts named; a draft that breaks a REQUIRED rule is written again (`--redraws`, default 2); what
  still does not conform is refused with its reasons and exit code 3, and the text stays with the record.
  `--allow-nonconformant` delivers it anyway, marked, still exiting 3. Without `--strict` nothing changes: 1.x
  delivers every output with its verdict ([decision 0012](docs/decisions/0012-the-closing-rules.md)).
- **Request coverage on the panel** under strict delivery: how many of the things the request asks for the delivered
  text gives, and which it does not. A monitor; not yet qualified (studies/COVERAGE_READER_PREREGISTRATION.md).

### Fixed

- **`fidelity --typicality` computed the author's floor on halves of the pieces,** smaller than either side of the
  reading it is compared with, so it read high. It is now computed at the size of the comparison.

### Added: what a request was read as, on every run

- **A CONTEXT block on the panel.** Every run of a skill built from a corpus says what its request was read as and
  which of your pieces it was measured against: the register the request names and how that was read, how many of
  your pieces are near its subject, which ones, how they were found, and what the run used them for (the passages
  shown to the writer, the typical-of-you reading, your range for the subject, the plan). With fewer than two near
  pieces it says the readings rest on your whole range. The same data is in `--json` and `atelier report`.
- **`atelier eval` lists where your pieces are thin:** the requests that were near fewer than two of them.
- **Nearest pieces by subject, opt-in.** `atelier fidelity --skill <name> --read-subjects` has a small model read
  what each piece is about, once. With `fidelity --set nearness=reader` (or `invoke --nearness reader`) it then
  grades each request against those cards: same subject, related, or neither. Code validates every answer, the
  grades are recorded with the run, and with no model the shared words decide as before. A request that is only a
  title shares few words with anything; read by subject, it still reaches the pieces on its subject and their
  passages. Not yet qualified (studies/SUBJECT_READER_PREREGISTRATION.md).
- **The register a request names is read, not matched.** The context judge quotes the request's own words for the
  kind of document it asks for, and code checks the quote. "A post about our quarterly report" asks for a post and
  "report the bug" names no document; the word table read a report in both, and is now the offline floor. Your
  `--register` flag still wins ([decision 0011](docs/decisions/0011-context-is-read-recorded-and-shown.md)).
- **The voice gate gets a second read.** After the fact ledger and the word lists, a small model reads whether the
  rewrite changed what is claimed. It must quote what changed, and it can only refuse.
- **`fidelity --typicality` reports your own floor:** how well the same classifier tells your own pieces from each
  other at random halves. An AUC is read against that, not against 0.5.

### Changed

- **Typicality says when a text is beyond every piece of yours.** The share cannot go below 1 in (pieces + 1), so
  a text far outside still read "as typical as 14%" on six pieces. Past your farthest piece the panel now says so,
  with both distances, and it says how many pieces the reading rests on and the step it moves in.
- **Typicality is calibrated on every piece that is not reserved,** the held-back ones included, as
  `fidelity --calibrate-from` already did. A skill built before keeps its calibration until it is rebuilt or
  recalibrated.

### Added: how close to the author, as a distribution

- **Typicality on every run.** A text is read as one point in feature space, over the features that separate the
  author from the model: a shrinkage Mahalanobis distance, turned into a conformal p-value against the author's
  own pieces. The panel says "as typical as N% of your own pieces". Calibrated at discovery from the pieces read;
  `atelier fidelity --skill <name> --calibrate-from <folder>` calibrates a skill built before.
- **Typical of you on this kind of subject.** The per-run reading is a weighted conformal p-value: the author's pieces
  nearest the request count more in the reference, so a post about a failure is read against how the author writes
  about failures. With equal weights it is the plain p-value.
- **Can the outputs be told apart from the author?** `atelier fidelity --skill <name> --typicality`: a held-out
  classifier's AUC (0.5 means it cannot), a kernel two-sample test, and how varied each side is at equal size.
- **`invoke --until-typical <share>` and `--until-author <p>`** write more rounds (up to `--shape-rounds`, default 3)
  until the output is that typical of the author, or until the style detector reads it as theirs with that
  probability. The round kept breaks the fewest REQUIRED rules, then reads most likely the author's, then is most
  typical. Each round keeps its own trace, and the kept round's draft is recorded.
- **`--select sample`** (or `fidelity --set selection=sample`): among drafts the rules cannot separate, one is drawn
  in proportion to how much likelier it is the author's than the model's (the style detector's density ratio),
  seeded and recorded, instead of the most typical one. Decision 0010.

- **Plan-first generation** (`invoke --structure plan`), opt-in: `atelier fidelity --read-structure-from <folder>`
  reads how the author's pieces are built, one move per paragraph (claim, explain, example, evidence, story,
  concession, definition, instruction, question, turn, summary; two reads, kept where they agree). Each draft is then
  written against its own skeleton of moves, sampled from the author's chain with the pieces nearest the request
  counted more and at a length drawn from the author's own; the delivered text is read back and the panel says how
  much of its own skeleton it followed (aligned, so one cut paragraph does not zero the rest). A request that states
  its own length or format gets no skeleton. A research preview: the reader's moves shape the drafts you opt into
  while its features are under a sealed qualification (studies/STRUCTURE_READER_PREREGISTRATION.md), and no
  feature of it steers selection or fails an output.

- **`--context local`** (or `fidelity --set context=local`), opt-in: the SIGNAL bands a draft is held to move toward
  the author's pieces nearest the request, by λ = n_eff / (n_eff + 6), so a few near pieces count for little and
  many for most. RULE bands, the owner's ratified ranges, never move. The panel says how far the range moved and
  which pieces were nearest; the target is recorded with the run. A request near too few pieces keeps the usual range,
  and says so.

### Studies

- **A skill from one method and one finished example, on a real model, once** (exploratory, by the builder; $1.60;
  no sealed result). One house method for a kind of analysis, written as a template of 16 steps, and one finished
  example of it; two new subjects, each with a page of material written for another purpose. Of the 16 steps, 2
  could be checked on the output (the example held them), 11 were judgement, and 3 template tables the finished
  example does not hold were left as questions. Against the same method and example pasted into one plain call:
  both met the 2 required things on both subjects, so **on what is enforced the two did not differ.** Beside
  that: the skill's outputs were longer (2,765 and 3,209 words against 2,027 and 1,674), carried more of the
  example's own section headings (5 and 4 of 17 against 2 and 0) and of the tables the example shows (1 and 2 of 5
  against none), and the qualified claim reader cut 7 and 13 invented specifics from them; the pasted outputs were
  read by the pattern check only, which found none. What it does not show: that either is better work. Nobody
  read them, two subjects is two, and a method whose steps are mostly judgement gives the checks little to hold.
  It found one defect, fixed: the build's closing line counted what the example shows as if it were required.

- **The user path on a real model, once** (acceptance by the builder with the owner's key; $4.79 recorded, and two
  discovery attempts that failed before any cost was recorded; no sealed result). A skill that answers, from twelve examples: discovery $0.55, one answer
  $0.18, conformant, the cost block adding up, and a rebuild with and without a key identical with no call made. A
  blog skill from twenty posts of a technical author: discovery $2.33 against an estimate of $3.47 to $9.24, 16 of
  the 17 pieces read meeting every rule suggested as required with no ruling from the owner, two posts written at
  $0.79 and $0.94, both conformant, and a rebuild identical. It found three defects, fixed below: one rule check
  that came back empty stopped a discovery that had already cost dollars; a reader's calls made side by side to a
  model that takes no temperature were reported as "could not run"; and the build's advice named every rule a
  piece broke, not the rulings that reach nine in ten. On an older skill of the same author, those rulings (one
  limit widened, three rules made preferences) take its own pieces from 9 of 17 to 16 of 17, with 12 rules
  required where 15 were. Not learned: anything about quality against another skill.
- **The tester's acceptance of the first 0015 change, on stores built before it** (no spend; no sealed result). A
  plain rebuild of five skills changed the export of four, because pairs were taken from benchmark runs nothing had
  marked as tests; rebuilding a skill that answers made a model call; one harness script could clear its own inputs
  through a link; the failure-mode reader had no qualification script; and claim B named a repeatability it did not
  measure. Reproduced here on a store built by the round-two commit and fixed: that store, rebuilt online and
  offline, exports the same bytes for a writing skill and an answering one. The reuse of the hold-back reading was
  not exercised against a discovered move offline, and the tester's own stores are the ones that decide. Conclusion:
  the product had been tested on fresh stores only, and is now also tested on a store an earlier commit built.
- **Decided before the size study is run** (the owner, 2026-10-06): 60 tasks a domain and no reading under 55; a
  second guard on the number of rules broken per answer; the rubric judge qualified first; twenty blind pairs for
  the owner in the last round, today's size kept at fourteen or more; claim B's refusal bar fixed at 15% before its
  pilot and its repeatability read as requests answered on some of five runs and refused on others, at most 10%.

- **Size, measured** (development, by the reviewer and offline here; no sealed result). Exported Atelier skills ran
  5,035 words (code review), 5,760 (contracts) and 13,818 (speeches), against 189 to 361 for the hand-written seeds,
  863 to 1,240 for GEPA's and 308 to 1,037 for SkillOpt's: 16 to 38 times the seed. On one skill built from a technical author's posts, part
  by part: your pieces 9,201 of 13,173 words (three whole pieces), rule examples 1,954, rules and instructions 682,
  how I sound 471, moves 396, the reference index 282, framing 187.
- **Drafted, not run: can a skill serve less of the author's writing and still hold its standard**
  (studies/EFFICIENCY_ABLATION_PREREGISTRATION.md, decision 0014). Four smaller configurations of each of two
  writing skills against today's, on 60 development tasks per domain. Two scripts hold the rule:
  `bench/compare/efficiency-rows.mjs` builds the rows (each arm's answers under its own label, a broken rule by
  `atelier verify` offline, the score as the sum of the rubric's dimensions) and `bench/compare/efficiency-select.mjs`
  reads them: each domain on its own, the rule count in whole answers against a tolerance of five in a hundred, the
  score against one point of fifty. Voice is not read by a model in it. Rows it does not expect stop the run: an
  unknown label, a judge's file that does not cover the answers merged, answers filed under another skill's export. It
  selects a configuration and states its error rates, which are large both ways at this size; the selected arm is
  measured again beside today's skill in the last development round, with today's prepared as the fallback.

- **Development against hand-crafted skills, round 2** (run by the reviewer on 5 October 2026; readiness evidence
  under decision 0012, not a sealed result; one author per domain; model judges, each qualified on known pairs
  first; a `claude-opus-5` writer for every arm).
  - *Coding answers, 60 held-out tasks, against i-have-adhd:* failed answers 15.0% against 25.4% (41% fewer, lower
    bound above zero); answers breaking a counted rule 31% against 76%; blockers level (7.5% against 7.9%); rule
    verdict differing between two runs 15% against 20%, not clearly fewer. Before the compiler change of decision
    0013 the same comparison was 25.0% against 28.9%.
  - *Strict runtime, 40 working tasks:* no better than i-have-adhd (26.9% failed against 25.6%), with 7 of 80
    answers refused on one paragraph rule (fixed above) and about seven times the plug-in's cost per answer.
  - *Contracts, 30 clauses of one drafting house:* no Atelier answer broke a counted rule (stop-slop 10%, GEPA 7%,
    SkillOpt 17%, bare 23%); level with stop-slop on stop-slop's own score (36.1 against 37.3 of 50).
  - *Code review, 30 diffs of one maintainer:* 10% of Atelier answers broke a counted rule against 95% for a careful
    hand-written review skill.
  - *Speeches, 21 openings of one speaker:* every arm broke at least one of thirteen counted rules in every answer;
    Atelier broke 4.1 a piece against 6.8 for stop-slop, and scored 3.5 points lower on stop-slop's own score.
  - *A company blog, 20 posts:* 2.05 counted rules broken a piece against 2.65 for stop-slop and 2.60 for four
    pieces pasted; 2.4 points lower than stop-slop on its own score; a model judge preferred Atelier's voice to
    stop-slop's and could not separate it from pasted pieces (54%).
  - *GEPA and SkillOpt,* at small budgets and searching on Atelier's own rule score: Atelier broke fewer rules in 5
    of 6 comparisons. Reported as it stands; a fair-budget run has not been made.
  - Voice here was read by a model judge and decides nothing: people decide it, in the sealed read.

- **The author floor: 0.72 to 0.81, not 0.5** (studies/AUTHOR_FLOOR_RESULT.md, sealed in advance, offline, $0). The
  classifier of the indistinguishability study, asked to tell one random set of an author's own pieces from another,
  reaches AUC 0.813 at 8 a side and 0.722 at 12 a side one time in twenty. Every Atelier arm of that study sits above
  its floor on both corpora, so its FAIL stands. Two readings were not resolved at 8 a side and are restated: the
  plain arm on the technical author (0.750), and that author's reading without function-word n-grams (every arm).
  Later machine readings are compared with the floor.
- **The closing test, drafted for an independent tester** (studies/INDEPENDENT_TEST_BRIEF.md, decision 0012): answer
  quality against a careful hand-written skill on 100 or more new tasks (CLOSING_A), delivery under `--strict`
  (CLOSING_B), the coverage reading against planted omissions (COVERAGE_READER). Five defects in the study harnesses
  were fixed first: plants made by removing words were discarded; a model with no known price billed $0.00 so a cap
  could not hold; a share that could not be computed passed a "at most" bar; failed readings were skipped instead of
  counted; and a reader's excerpts could come from the pasted arm's own source pieces.
- **Drafted, not run:** the subject reader and the register reading against word matching
  (studies/SUBJECT_READER_PREREGISTRATION.md), the voice gate against planted changes
  (studies/VOICE_GATE_PREREGISTRATION.md), and the in-context voice pass against pasted examples read blind by
  people (studies/VOICE_PASS_PREREGISTRATION.md). Two offline observations are recorded in them before sealing: the
  word table names the right document type on 25 of 40 labelled requests, and the voice gate as shipped keeps 32 of
  112 faithful pairs.

- **Context bands: FAIL** (studies/CONTEXT_BANDS_RESULT.md, sealed in advance, offline, $0). On the indistinguishability
  study's texts, bands moved toward the request's nearest pieces told the authors' unseen pieces from the model's
  outputs no better than the usual bands (pooled AUC 0.803 both ways; difference +0.0006 [−0.025, 0.027], bar +0.05).
  They did not reject the author's own pieces. Title-only requests gave lexical nearness too little to match: 12 of 36
  newsletter texts got a local target at all.

- **Indistinguishability: FAIL on the machine measure; the human read is pending** (studies/INDISTINGUISHABILITY_RESULT.md,
  sealed in advance, $31.54). On two corpora, a classifier on a feature family no arm steers on told every arm's outputs
  from the authors' unseen pieces (AUC 0.75–1.0): plain, pasted examples, Atelier, plan-first and plan-first steered.
  Plan-first did not move outputs toward the author; on the newsletters it moved them further away. The three Atelier
  arms delivered no invented claim in 60 outputs; the plain and pasted arms carried 37 to 67 flagged specifics per
  corpus. Voice stays unclaimed.
- **The structure reader: FAIL** (studies/STRUCTURE_READER_RESULT.md, sealed in advance, $1.97). Reliability is
  solved: the two reads agree at a median κ of 0.867, and 11 of 12 features reproduce at 0.94 or better on an
  independent re-read, where the move reader failed. Separation is not. On the corpus the move reader failed on, no
  structure feature told the author from the model by the product's bar; the strongest (switch rate 0.718, entropy
  rate 0.713) say the authors are less predictable, as the fiction study found, but below the bar. The reader stays
  a monitor.

### Fixed

- **Amending a rule no longer drops the skill's fidelity layer.** A changed standard (`amend`, `confirm`, `add`) left
  the skill with no profile, detector, retrieval or calibration, said nowhere. It now starts a new release line that
  carries the author's profile (re-ratified against the new rules), passages, calibration and structure, and nothing
  the loop learned under the old standard.
- **The taste reader ran on no current model.** A model that refuses forced tool choice and temperature, one 400 at
  a time, now gets both retries; an instrument asking for temperature 0 answers again.
- **`--with <file>` bound nothing.** A bare path is refused with the form that binds it (`--with notes=<file>`).

## [1.1.0] — 2026-10-02 (install from npm; the voice layer, off by default)

### Added: install from npm, and one command to set up

- **`atelier setup`** (`npx @yannickyamo/atelier setup` with nothing installed) finds the coding agents in a
  project (Claude Code, Cursor, VS Code, Codex) and adds the Atelier MCP server to each one's config. It adds
  one entry and never replaces what is there: a config it cannot parse is left alone and named, and an
  `atelier` entry already present is kept as it is. `--dry-run` says what it would write.
- **`npm install -g @yannickyamo/atelier`** is the install the README, the skills and the plugin's own check
  name first; building from source is still documented beside it.

### Added: the voice layer, below the standard and off by default

Nothing here runs until the owner declares the register their pieces are written in, and the voice pass is a
setting nobody has on. Whether it moves an author's voice is not measured and not claimed
([decision 0009](docs/decisions/0009-voice-below-the-standard.md)).

- **Transfer is a policy.** Each rule and steering feature is `invariant` (measured: its median holds still
  between two or more of the author's registers), `owner-transfer` (the owner's ruling) or `unknown`. One
  register can show nothing, so everything starts `unknown`. `atelier voice register`, `atelier voice transfer`.
- **The register of a request is declared.** `invoke --register <name>`, or a document type named in the
  request. Out of register, only the traits the policy carries are applied; the rest are withheld for the run
  and named. A lexical distance from the author's pieces is recorded as a monitor and never decides.
- **A pair bank** (`atelier voice pairs`): each of the author's paragraphs beside the same facts in plain
  English, kept only when both sides carry the same facts. Built from the pieces discovery read, never the
  reserved ones.
- **The voice pass** (`atelier fidelity --set voice=incontext`, or `invoke --voice incontext`): after the
  standard's checks, each paragraph is rewritten from the nearest pairs and gated alone on facts, claim
  strength, length and copying. The assembled text is read in full and the pass undone if anything got worse.
  Never run out of register.
- **The panel and the skill card** carry a VOICE section: the register decision, what carried, paragraphs
  rewritten and refused.

## [1.0.1] — 2026-10-02 (one claim verdict per run)

### Fixed

- **One claim verdict per run.** The panel read the delivered text again for invented claims, and a fresh read is
  another sample of a reader that varies: in a live run the report line said every REQUIRED rule held while the
  panel listed 5 invented claims, and repeated reads of the same text flagged 7, 2 and 5. The panel now uses the
  report the repair counted on the text it delivered (two reads, each sentence's verdict held for the run). A
  fresh read happens only when no repair ran (`--no-repair`) or the text changed after it.
- **A flag only one of the two reads raised is shown as disputed,** beside the claims delivered and cut, listed
  for you to check and never a failure. Before, it was counted with the public facts.
- **The claim reader's repeatability is on the panel:** "reads agreed on 1 of 3 flags" for this text.
- **A broken rule is named by what it is:** `c9 "Keep every paragraph under four sentences, so…"`, not `c9` alone.
- **B6 harness:** the `loop` arm passes `--fidelity`. Since 1.0 the default release costs what 0.7 did, so an
  arm that passed nothing ran the same as `open`.

### Added

- **1.0 is the floor** ([decision 0008](docs/decisions/0008-one-point-zero-is-the-floor.md)). A store written by
  this build is kept as a fixture and read by every later build, which must give the same verdict per rule and
  the same exit code, keep the standard's hash, keep every command, option and MCP tool, and keep the default
  release settings. Later work is added beside 1.0 and is off by default.

## [1.0.0] — 2026-10-02 (what the evidence supports, and the instruments to test the rest)

1.0 is the claim the evidence supports, stated plainly, and a stable state format. A skill Atelier builds from
your examples holds a standard only you can change, and is ahead of plain prompting and of pasting your
examples on every counted dimension measured: rules held, machine tells, invented specifics, copying, code
house style, answer quality. Voice, the implicit fingerprint of an author, is not claimed: the 0.8 loop did not
move it in B6 (20 whole-text edits tried, none kept; in range 0.733 against 0.738 for 0.7, at 3.3 times the
cost), and this release replaces that actuator and keeps the loop opt-in until a study says otherwise. Nothing
here is compared with an optimizer yet; the kit to do it is.

### Changed

- **The loop is opt-in; the default costs what 0.7 did.** A release starts at two drafts, no edits, retrieval
  on, no notes (decision 0007). `invoke --fidelity` runs the full loop for one request;
  `atelier fidelity --set drafts=4,editBudget=2,notesCap=6,diversity=on` makes it a skill's default. A run
  whose flags override its release is recorded with no release, so it is never that release's evidence.
- **Experience notes follow a grammar, not a denylist.** A note names one measured feature the compared drafts
  differed on, one operation from a closed list (split, joined, shortened, lengthened, merged, broke, used,
  dropped), and how, in one clause about construction (sentences, paragraphs, clauses, connectives, supplied
  facts). "Open with a question." and "used a question to open each piece" are refused: each would be a rule the
  owner never ratified.
- **A length-class band steers only on its own evidence.** It must pass selection on that class's own pieces,
  held-back pieces and model drafts; otherwise it is monitored. Discovery writes its drafts at the median length
  of every class the author has a band for.

- **A 0.8 skill moves to the 1.0 default on its next run**, through a child release that says why, when nobody
  chose its loop settings (no release in its line was set by hand or by the search, and it was not rolled back to).
  A candidate carried from those settings runs at the default too.
- **A length-class band that did not qualify never hides a pooled band that did**: a text is read against the
  class's own band where it qualified and the pooled one otherwise.
- **Discovery's drafts are crossed, not confounded**: every model and every length gets plain drafts and
  imitations alike, and there are at least eight per length class.

### Added: actuators for the implicit layer

- **Operators chosen by measured effect** (`core/fidelity/operators.ts`): split at a conjunction, join two short
  sentences, break or merge paragraphs, parentheses to commas, a semicolon to a full stop. Each re-punctuates the
  words already there. At discovery each is applied to the model's own drafts and its effect on every feature
  is measured (the effect matrix); at invoke only an operator known to move the furthest-out feature toward the
  author's range is tried, and a change is kept only if it did and nothing else left its band. No model call.
- **What an operator may touch.** Prose paragraphs only (never a list, heading, quotation, table, code, or a
  hard-wrapped paragraph); inline code, links, URLs and entities are masked; an abbreviation ("Mr.", "e.g.") does
  not end a sentence; a list is never split at its "and", nor a sentence at "so that"; a join never lower-cases
  a word that might be a name. Every application must keep the words (one "and" aside) and pass the integrity
  guard, and is screened by the deterministic checks; the delivered text is read in full once, and the steering
  is undone if that read finds anything worse.
- **A one-sentence rewrite for over-explaining** ("than", "that's", explanatory and contrastive connectives),
  which no re-punctuation reaches: the sentence that carries most of it is rewritten as a plain assertion under
  the span integrity guard every repair passes. These replace 0.8's whole-text redraft.
- **Drafts that differ.** With the loop on, each draft is written at its own temperature (0.7, 0.9, 1.0) with
  its own slice of the author's closest passages, so selection has variation to choose from. Recorded per draft
  that came back, with the temperature the provider was actually sent (none, for a model that refuses one).
- **Long form by section** (`invoke --sections`): one plan, each section written with the whole standard, joined,
  then checked and steered as one piece. The plan is recorded.
- **Several model families at discovery** (`--contrast-models a,b`), so the detector is trained against, and
  valid for, more than one family. Every application of every actuator is recorded with the feature before and
  after, so a study can attribute movement to operators, rewrites, selection or retrieval.

### Added: an evaluation of every run

- **One binary result, then the evidence, on every run.** After `invoke`, a short panel (on a terminal, or with
  `--panel`; `--quiet` leaves it out; always in `--json` as `eval`) says CONFORMANT or NOT CONFORMANT, then:
  - **gates**, binary: required rules held, invented claims (the claim reader shown with the rates it was measured
    at, and where), copying, format, applicability;
  - **fidelity**, descriptive: features in the author's range beside the author's own held-back pieces read the
    same way, with their n (pieces the bands were built from would be a circular baseline);
  - **monitors**, never gating: the style detector and the taste reader, each with how it has been validated, or
    "not validated";
  - **not measured**, on every run.
  No overall score: gates, fidelity and monitors are different kinds of evidence. A claim check that could not
  run is a FAIL, never a pass. The evaluation is stored beside the run record, written once.
- **The verdict is counted on what ships.** Every gate is read from one full check of the delivered text, as
  `verify` runs it: a run with `--no-repair` is still checked, a broken REQUIRED format or learned-phrase line
  counts, invented claims are counted span by span, and `--allow-unsourced` or a claim check that could not run is
  NOT CONFORMANT. A structured output is held by its contract. The claim reader's measured rates are shown only
  when that model at that prompt version is the one deciding. Building the evaluation never costs the output: if
  it fails, the run is delivered and says so.
- **The baseline is out of sample**: the author's reserved pieces, which nothing read, kept as feature values
  only and recounted with the ratified roles the run is read with.
- **The skill's own evaluation, the moment it is built.** `atelier new … --accept` and every `build` (the
  improve-in-place path included) end with the skill's card: your rules (counted and read), the invented-claim
  check with the rates it was measured at, your range with its baseline, the style detector and what it is valid
  for, the release, and what is not measured. Stored with the version, read live (a new release or a
  qualification shows at once) by `atelier report --skill <name> [--json]` and the MCP tool
  `atelier_skill_report`, for an agent to read before it tells you a run can ship. Never served to the model that
  writes: a measure written toward stops measuring.
- **`atelier report <run>`**: the panel and the trace, component by component (drafts and selection, the claim
  check, repair, steering, retrieval, release, applicability), read from the record.
- **`atelier rate <run> yes|no "why"`**: would you ship it as is? The one satisfaction measure, given by a person.
- **`atelier eval --skill <name>`**: per release, the conformant share and the share you would ship, each with its
  N and a 95% Wilson interval; cost and time; failures by kind (rules broken, reasons, complaints from `fix`,
  why runs were not shipped); and the unrated runs worth reading, chosen by count.

### Added: instruments

- **The writing-task family is runnable**: `bench/compare/tasks/from-b6.mjs` turns a B6 plan's sealed briefs into
  comparison tasks, so the same arms and adapters run on writing.
- Operators never touch a quotation; experience notes stored under 0.8 are held to the new grammar before they
  are served; a B6 evaluator detector trained on the comparator arms decides no bar.

- **`atelier score`**: one deterministic number in [0, 1] for how well a text meets a skill's ratified
  standard, with no model call: `(0.4·required + 0.3·claims + 0.1·format + 0.2·range)` over the components
  that apply (REQUIRED measured rules held, invented specifics by the pattern claim check, the FORMAT line,
  the in-range share on the active fidelity profile). `--json` gives the components and every rule's line.
- **`bench/compare/`**: one task interface for answer arms (no skill, a skill file in the system prompt, the
  Atelier runtime), train/validation/test splits with a sealed test hash, a GEPA adapter and a SkillOpt
  environment that refuse the sealed split, both scored by the benchmark's own judge or by `atelier score`,
  and an offline smoke against local fake models. No results yet: the comparison itself is a paid run.
- **`atelier qualify --skill <name>`.** Measures the style detector and every steering feature of the active
  profile on the skill's own data (the pieces discovery read and the drafts it wrote), with one piece, one
  topic and one generating model held out at a time, and stores the result with the skill, keyed by the
  profile. Topic labels come from each piece's front matter (`topic: …`) or `--topics <file>`; a topic is
  never defaulted to the source, and without labels the topic hold-out is NOT RUN and nothing qualifies.
- **A detector names the models it is valid for.** Discovery records which model wrote each contrast draft;
  the detector carries them as `families`, every reading records them, and `atelier fidelity` prints
  "valid for: …". A detector does not generalise across model families (held-out generator AUCs of 0.37,
  0.49 and 0.73 in one measurement). Drafts cached before this are one generator, `unknown`.
- **The small bench in CI** (`.github/workflows/bench.yml`, `bench/small/run.sh`): the 14 coding cases, one trial,
  no skill against an Atelier skill this build makes, on any change to generation, checking, repair, compilation
  or fidelity. It runs where the repository has an `ANTHROPIC_API_KEY` secret and is skipped, never failed,
  where it has none.

### Fixed: the B6 harness

- `prepare` copies every validation, test and training text into the work directory and records its
  sha256; every later step checks them and refuses on any change, naming the file.
- The evaluator's model is refused when it is the writer, in any case or as a prefix alias, both as set
  and as recorded on the outputs.
- An evaluator detector with a cross-validated AUC under 0.65 (or none) decides no bar: the detector bar is
  null and `results.json` says why. Grounded fact coverage is reported per arm beside the author's density.
- `build` and `generate` refuse to start with a writer that has no price, unless `B6_PRICE_IN` and
  `B6_PRICE_OUT` give one (the default writer has no entry in the price table, and none is invented).
- `generate --briefs` and `--shard k/n` split a run across processes in one work directory; an output is
  claimed, written under a temporary name and renamed, so two writers never share one.
- `blind --readers r1,r2,r3` writes one packet and one labels file per reader, orders balanced across
  readers; `score` refuses any design that is not the pre-registered one (a missing reader, a duplicate or
  empty judgment, an unjudged pair, unbalanced orders). `bench/b6/selftest.mjs` fires each refusal offline.

## [0.8.0] — 2026-10-01 (taste as a range: a closed loop below the standard)

Outside studies of 0.7 found the explicit layer of taste reproduced at the author's level and the implicit
layer missed: paragraph pace, how sentences sound, the fingerprint a detector reads. This release closes the
loop on those layers, below the standard and never able to move it ([decision 0007](docs/decisions/0007-taste-as-a-range.md)).
Nothing in it is measured yet: [B6](studies/B6_PREREGISTRATION.md) is the study, run by an independent
reviewer with `bench/b6/run.mjs`.

### Fixed: the floor

- **A request's format no longer switches the standard off.** "Return only the post" read as a format and
  withheld every pace and rhythm rule, on exactly the pieces those rules exist for. Now only a shape (code,
  JSON, a number, one line, yes or no, a list) withholds presentation rules; a bare request drops the
  preamble and keeps the standard.
- **Unconfirmed is not passed.** When a third or more of a piece was flagged, figures were listed and the
  claim line read as met, so an invented figure could ship behind "every rule holds". In writing they now
  fail the check (`UNSOURCED·inconclusive`) until the person confirms them or binds their material. Answers,
  which list specifics by design, are unchanged.
- **The claim reader waits out a rate limit and fails closed.** A 429 or an overloaded backend is retried
  with a longer wait; if the qualified reader still cannot run on writing, the check fails
  (`UNSOURCED·unread`) instead of passing on the weaker pattern check.
- **An owner's override fails the check, never deletes.** `ATELIER_CLAIMS_GATE=reader` makes an unqualified
  reader's findings a failure the owner sees; only a measured instrument cuts.
- **Feature selection no longer sees its own test.** Separation and the median come from the pieces read;
  the held-back pieces only test the band. A feature needs at least 8 model drafts to qualify, and discovery
  now writes 12, half of them with two of the author's pieces pasted in (the stronger adversary).
- **The target is the range, not the mean.** A signal scores distance outside the author's band (zero
  inside), and style distance is capped at the author's own margin: a draft more typical of the author than
  any piece they wrote earns nothing more.
- **Paragraph features measure a wall of text.** They needed four paragraphs, so a 250-word single
  paragraph (the commonest way a model misses an author who breaks often) measured nothing.

### Added: the loop

- **A fidelity profile per skill**, built at discovery at no extra cost: every counted feature's band on the
  author's pieces, per length class where there are enough, its role (RULE, SIGNAL or MONITOR), and a
  stylometric detector trained against the model's drafts. A feature offered to the owner as a rule steers
  only if the owner ratified it, with the band they ratified; rejected, it is only monitored.
- **New sensors**: paragraph length (10th, 50th, 90th percentile), one-sentence paragraphs, sentences per
  paragraph, sentence-length variation, the over-articulation imitations show ("than", negation, "that's",
  "let's", explanatory and contrastive connectives), a lexical measure of how far each sentence moves from
  the last and of returns to earlier topics, and specifics density (only ever a cap).
- **The inner loop.** A writing skill writes four drafts and keeps the one that breaks the fewest rules, then
  lands the most measured features inside the author's range, then uses the most of the facts supplied. The
  chosen draft is redrafted for form against the band furthest outside, at most twice, each redraft kept only
  if it moved the target, kept every figure, negation, qualifier and name and 85% of the content words, and
  made nothing the standard counts worse, on the same terms as a repair; the report is recounted on the text
  that ships. No edit runs while the claim reader is down or the taste reader holds VETO. A skill too short
  to steer keeps two drafts and no edits.
- **Implementation releases.** Drafts, edit budget, the author's passages retrieved for each request, and
  experience notes are a hashed release with a parent, recorded on every output.
- **`atelier fidelity`**: the profile, drift alarms per feature and length class (EWMA and CUSUM, never on one
  output), outcomes by release, the next settings to try (`--next`), settings by hand (`--set`), experience
  notes from compared drafts (`--distill`, one model call), `--rollback`, `--read <file>` offline, and the
  outputs worth the owner's reading, chosen by count.
- **Every run records** the release, every draft's reading, the edits tried, the passages retrieved, the
  facts used, and an applicability manifest: each requirement applied, not applicable, or waived with a reason.
- **Grounded fact coverage** (`core/loop/fact-ledger.ts`): the facts the request and material supplied, and
  how many an output uses, against the author's own density.
- **The study kit**: `bench/fidelity/qualify.mjs` (a sensor qualified with sources, topics and generators held
  out) and `bench/b6/run.mjs` (split, build, generate, evaluate with an evaluator kept apart from the steering,
  a masked blind-read packet, and the pre-registered decision).

### Known limits

- **The style detector is tied to the model the skill was built with.** It learns that model's habits, and an
  outside study found a detector trained on one model family does not recognise another family's imitations.
  The author's range, which does most of the steering, holds on any model. Running a skill on another model
  says so; rebuild with that model to retrain the detector.

### Cost

A writing skill now costs about twice what it did per output (four drafts and up to two edits).
`atelier fidelity --skill <name> --set drafts=2,editBudget=0` restores 0.7's settings for that skill; B6
measures whether the loop is worth it.

## [0.7.0] — 2026-09-30 (only a measured instrument may cut; every release measured before it ships)

### Changed: what may delete text

- **Only a measured instrument may cut** (`core/loop/cut-authority.ts`). The qualified claim reader, a
  word pattern, or an owner override may delete a sentence; an unqualified reader and the context judge
  may only list what they find. The repair loop asserts this before every cut, and each finding carries
  the instrument that made it.
- **The context judge reports, it never decides.** It reads whether an answer claims work it did not do
  and lists that for the person to check; the run records which model read it (`contextJudge` in the
  run's settings). Claims of work done and results seen are cut on word patterns alone.
- **Identifiers are narrower.** A common script (`build`, `test`), a common branch (`main`, `staging`)
  or a path on its own is no longer treated as a made-up detail of the person's system; a specific name
  beside a word like "table" or "branch" still is. "102." is an answer, not an empty list item.
- **Short pieces get the machine-tell floor.** A corpus of answers or replies under 150 words had no
  piece long enough for the rate check, so the rule against machine-writing moves was never proposed, and
  an answer skill built from examples with no em dash shipped answers with them (15 of 42 on the coding
  benchmark). A move the author never makes is checked at any length, so a short piece without one now
  counts as meeting the rule, and the floor is proposed. Long-form corpora are unchanged.
- **Answers do the work.** The compiled line for answers tells the model to do what the request allows,
  report only what tools returned, and ask only for a decision that is the person's to make, never for
  what it could find itself.

### Added

- **`atelier invoke --json` and `--answer-only`**: the answer alone on stdout, or the answer with its
  cost, broken rules, cuts and items to check as JSON, for a script or another agent.
- **The release contract** ([decision 0006](docs/decisions/0006-release-contract.md)): the numbers that
  block a release, measured side by side with the previous release, and the measurable form of the
  project's target. `bench/` produces those numbers from a pinned outside benchmark.
- A pre-registration draft for the cross-domain blind read the target needs
  ([studies/CROSS_DOMAIN_PREREGISTRATION.md](studies/CROSS_DOMAIN_PREREGISTRATION.md)).

### Measured (bench/runs/0.7.0/)

- **Coding answers** (the 14 cases of an outside benchmark, one trial, judged in one session beside the
  answers of 0650801, the last build an outside test measured, before 0.6.0; `bench/runs/0.7.0/small/`):
  the runtime scored 4.39 against 4.13 for 0650801 and 3.99 with no skill (difference
  +0.26, 95% CI +0.07 to +0.51, bootstrap by case), with 1 blocking finding
  against 2. The plug-in held level: 4.52 against 4.57 (-0.05, -0.29 to +0.16).
  The runtime's answers carried no em dash (0 of 14, against 15 of 42 before the short-piece fix).
  The one blocking finding: asked to fix a typo in a file it could not see, the runtime asked which typo
  instead of saying what it would search for. Open.
- **Against the hand-written skill tuned for that benchmark** (first candidate, three trials,
  `bench/runs/0.7.0/full-rc1/`): the plug-in scored 4.53 against 4.35 (+0.18, -0.03 to +0.41),
  with 1 blocking finding against 4, and a lower spread between trials (0.18 against 0.33).

- **The claim reader at its production settings** (temperature 0, one and two reads), on the drafts of its
  qualification study: all 46 planted inventions caught (95% CI 0.923 to 1); 39 of 48 clean drafts left
  alone (0.674 to 0.911), against 41 of 48 when qualified (paired McNemar p = 0.69, no detectable change).
  The reader's output limit was raised after a 25-name piece ran past it.

## [0.6.0] — 2026-09-30 (outside the blog: answers, code review, reports)

### Fixed: an outside re-test of the runtime (all five blockers, three of its five follow-ups)

An outside re-test measured the earlier fixes: the plug-in beat a hand-tuned skill on that skill's own
benchmark in three judge runs, and the runtime rose from 3.21 to 4.26 against its 4.32. It also found four
regressions. Fixed, each with a test that reproduces it and one for the opposite polarity:

- **An invented source no longer rides on correct arithmetic.** The derived-figure exemption covers the
  number, not the sentence: "According to a 2024 report, revenue grew 25% from 80 to 100" is flagged as a
  source. A remark attributed to a role ("our CFO said") is a source too.
- **An answer may not make up the person's system or its own work.** In `assistant-reply`, a claim of work
  done or a result seen ("Checked this against the failing case: … returns 200", "2.3M rows, 40 min") and an
  identifier the request never gave (a file path, an `npm run` script, a table or branch) are cut; general
  knowledge is still listed. A redraft that loses its point asks the question it needs instead.
- **Short answers are kept on the real path.** `new --mode respond` passes its mode to intake, which ran
  before the mode was saved and dropped one-line answers at 200 characters.
- **A conditional rule cannot refuse an unrelated request.** A REQUIRED rule that applies under a
  condition and lacks its material is withheld from that run and named; only a rule that applies to every
  output refuses. Respond-mode suggestions meet the bar new writing uses (4 in 5 of 3+ unread pieces), and
  a rule that needs material is never suggested REQUIRED there.
- **The request's own format wins.** "Return only the code block" withholds the skill's presentation rules
  from that run's prompt and its count, and says so.
- **A repeatable reader, as a gate.** Each new text is read twice; a flag both reads raise is acted on, a
  flag only one raised is listed, never cut. Not yet re-qualified at these settings.
- **A redraft keeps what it was not asked to change,** and **nothing points at cut text**: a sentence left
  pointing back is redrafted or cut with it.
- **A small model for what needs context.** Whether a sentence still stands alone, what a request dictates,
  and whether an answer claims its own work are read by a small model (validated in code, temperature 0),
  with the word patterns as the floor when it cannot run.
- **Skills for answers are compiled in the words of answers**: a typical length the request overrides, and
  "never state a result, file, command or system detail the request did not give" in place of the essay line.

Known limits: multi-step figures (a market size built in two steps) are still judged as untraced; the claim
reader has not been re-qualified at temperature 0 with two reads; neither the runtime nor the blog test has
been re-run on this build.

### Added: skills that fit other domains

- **What a piece must contain is counted.** `PRESENCE` checks sections in order, mentions of given phrases,
  a figure, and how a part starts, in the whole text or one part: a report's Recommendation before its
  Bets, a figure in every kill criterion, an answer that ends on its next step.
- **The request sets the length when it says one.** "A detailed explanation" or "one line" withholds the
  learned length from that run; a correct two-line answer is no longer held to an opening minimum meant for
  pieces long enough to have one.
- **Short answers are examples.** A skill that answers people keeps examples down to 20 characters at
  intake (writing keeps 200): the one-line answers are the ones that teach brevity.
- **`atelier export`** writes a skill as one file with its examples inlined, for an agent or a system
  prompt with no skill folder.

### Fixed: the runtime never makes an answer worse (from an outside test)

A skill built from 12 coding answers matched a hand-tuned skill as a plug-in, and scored below no skill at
all through `atelier invoke`: the claim check cut 189 sentences from 31 of 42 answers, and 17 went out with
empty bullets. Fixed:

- **Answers are checked as answers.** `atelier new --mode respond` records the `assistant-reply` class
  (skills built in respond mode before this: `atelier build --class assistant-reply` once). A `code-review`
  class joins it. Specifics are listed to check, never cut; claims of work done or results come first.
- **Never a fragment for a pass.** A cut that leaves an empty bullet, a bare label or no answer is
  redrafted once without the flagged statements (never reworded) and kept only if it reads whole and
  nothing in it is flagged. Otherwise the draft goes out uncut, the claims listed, and the check fails.
- **A repeatable reader.** Checking calls (the claim reader, the taste reader) ask for temperature 0;
  `--temperature` is now sent to Anthropic, not only recorded; a claim reading is kept on disk, so the same
  text, material and task get the same reading on the next run.
- **Derived figures are the person's.** A figure one operation away from two of theirs (a total, a ratio,
  a growth rate), at its own precision, is listed with its arithmetic to check, not cut.
- **Nothing asked that needs material nobody gave.** Rules waiting for material are withheld from that
  run's prompt and named in its record; a decision told as made ("we considered X and rejected it") is a
  claim. On the three claim studies' saved drafts, the offline check's false flags went from 5 to 6 of 129.

### Added: self-improvement that can undo itself

- `tend --auto` now undoes an install it made itself when later uses show that version breaking a
  measured rule clearly more often than the one it replaced (at least 3 uses of each, a rise of 25 points
  or more in first drafts that break it). A version a person promoted is never undone.

### Fixed: the claim check no longer takes an answer apart

- **One verdict per sentence.** After each cut the text was read again, and the reader flagged sentences it
  had passed the time before. On a technical explanation that cascaded to 14 of 16 sentences cut, two empty
  list items delivered, and a report saying every rule held. A sentence passed once now keeps that verdict
  for the run.
- **The balance.** When the check flags a third or more of a draft, only what is unambiguously invented is
  cut: a story told as lived, a claim of evidence, a quotation. Figures and facts are listed to check.
- **Honest about a heavy cut.** A cut that takes a third or more of a draft is said as that, never as
  "every rule holds".
- **Assistant replies.** A new class, `assistant-reply`, lists untraced specifics instead of cutting them:
  an answer's versions, costs and time estimates are the reader's to check, not claims about the person.
  `atelier skill` uses it when its rules are about replies or answers.
- **The skill's own words are known.** Wording from the approved rules is no longer flagged as invented.
- **`atelier skill` shows what it dropped.** A section of the stated rules that became no rule is listed
  before anything binds.

### Studies: an answer-style skill, head to head (exploratory, $4.63)

A popular hand-written skill of ten rules for coding-assistant answers, against the same rules built with
`atelier skill`, over one scripted 10-turn session on the same model, scored in code (pre-registered).
**As shipped, Atelier lost**: 8 counted violations to the hand-written skill's 5, because its claim check
cut technical content, including every closing next step. With the check off it had 0, and every answer
ended on one concrete next step; its answers were also about 80% longer. A plain model with a neutral system
prompt refused 8 of the 10 turns. The run also found that `atelier skill` dropped one of the ten rules and
bound only the 3 it could ground in the text. **On the fixed build, as an `assistant-reply` skill, the
full session scored 1 violation to the hand-written skill's 5**, with nothing cut and 2 to 11 specifics
per answer listed for checking; its answers stayed about 80% longer. One session, one model: a signal,
not a result. Total spend $5.51.

### Changed: the README, written by Atelier

- **What it is, from the evidence.** The README leads with building a standard from examples and checking
  every output against it, for writing and for answers. It states the outside test's result (a skill built
  from 12 answers matched a hand-tuned one), the runtime failure that test found and its fix, and that voice
  is not settled: a fresh call with the author's essays pasted in was as steady and scored higher on voice.
- **Written with its own skill.** The prose is an `atelier invoke` with a technical author's voice skill
  over a fact sheet ($0.65); badges, commands, the table and links were added by hand, and the whole passes
  that skill's checks.
### Fixed: an invented claim is deleted, never reworded (from an outside review)

- **Cut in code, not rewritten.** The repair used to ask the model to rewrite an invented story "without it,
  keeping the point it made", with the meaning checks off for that span. "I pulled 200 tickets" could come
  back as "when we looked at our tickets", and the vaguer claim passed. Now every flagged sentence is deleted
  in code (or slotted, with `--placeholders`) before any rewrite and again on the final text. No model sees it.
- **No other rule can keep it.** The last-resort cut used to be dropped when it made another rule worse (a
  paragraph too short, a count too low), and the claim shipped. The cut now stands; a rule it breaks is said.
- **The report is the delivered text's.** After a taste rewrite, the text is checked again, claims are cut
  again, and "still broken" and the cut list are counted on what you receive.
- **Vague evidence is a claim.** The offline check now flags a first person gathering evidence with nothing
  shown: "I checked our logs and…", "we tested this internally", "a customer told me…". Views ("in my
  experience") and counterfactuals ("we should have tested") are left alone.
- A rewrite that slips in a new claim of any kind makes the claim check worse, and is refused.
- The voice study's draft states its power with both pass conditions: 0.63, not 0.79 (a false pass at
  chance is 0.014).

### Studies: the vague-evidence patterns, replayed on the three qualification studies (offline, $0)

The new offline patterns, run on the saved drafts of all three claim-reader studies with each draft's own
material. **Clean drafts wrongly flagged: 3 of 129 before, 5 after** (first study 0 → 2 of 43, second 0 of
38, third 3 of 48 unchanged). Both new flags are the author's own "I've seen teams…" stories, paraphrased
far enough from the material that support was not found. **Planted inventions caught: 38 of 120 before,
41 after.** The model reader, which gates by default when a key is set, is unchanged; how it reads vague
evidence is not yet measured.

### Changed: the voice defaults (Phase 1 of closing Atelier as a voice engine)

- **Rhythm instructs.** The author's sentence-length mix is suggested as required when their unread work
  bears it out, like any count; before, it only chose between drafts, so no draft's rhythm moved.
- **Contrastive verdicts held for every author** ("isn't X, it's Y", "not X but Y"), at their own rate,
  not only where a plain model overuses them: a rewrite inherits them from its source.
- **A restyle is said as one.** When a draft keeps most of a bound text's sentences, `invoke` says so
  and points to writing a new piece from notes. `atelier new` ends by asking for real stories and figures.

### Changed: rhythm from the author's own pieces, and a restyle lists what it added

- **The sentence mix is read off the author's pieces alone.** It was proposed only where it separated the
  author from a plain model's drafts, but a rewrite's short sentences come from its source: the technical
  author's skill had no mix rule at all, and both rewrites kept 38% of sentences at eight words or fewer against
  the authors' typical 19 to 20%. Its tolerance is now the author's 80th-percentile piece (about 12 to
  14% for both authors) instead of the 90th, rounded up (22% for the company blog).
- **A restyle lists the sentences it added.** Every sentence with no counterpart in the source (under 35%
  of its words shared with any source sentence) is listed for the person to approve or cut: the claim
  check stops invented facts, not invented arguments.

### Studies: the second rewrite, a technical author (exploratory, $4.83 including a build discarded for a bug)

The same post and instruction as the company-blog test, three versions on the same model, read blind by an
outside reviewer against 20 of the author's posts. **The reviewer ranked Atelier's version first**, and picked
it out as Atelier's from its signature. It was the only version without em dashes (the author writes none; the
plain prompt had 7.2 per 1,000 words, the pasted posts 3.3), used the author's hyphen style and contraction
register, and borrowed how he reasons without copying a six-word run. Rhythm did not move (a median
sentence of 12 words against the author's 16), and it added three arguments the post never made, one a design
rationale for the product. Both led to the changes above. One post, one reviewer, a rewrite: the voice
study of new pieces is what decides.

### Studies: the Phase 1 check (exploratory, $0.85)

Two new pieces (not rewrites) with the company-blog skill, its sentence mix made required, each from a fact
pack. **Rhythm did not move.** Median sentence 10.5 and 11 words against the company's 15; 29% and 36% of
sentences of eight words or fewer against the company's 15%. The mix rule reported itself met, because its
tolerance lets 22% of sentences sit in the wrong band, wider than the whole gap. What did move: new pieces
use "we" at the company's rate (22.5 per 1,000 words against 22.2; a rewrite of the same kind of post stayed
at 2.8), with no em dash and no invented fact shipped. As the plan requires, there is no second iteration:
the tolerance is a choice to be fixed in the voice study's pre-registration, before any output.

## [0.5.0] — 2026-09-29 (an easy first run, no added AI tells, and the claim reader qualified again)

A full audit before Phase C covered detection, the loop, the moat and the competitor claims, and whether
the study harness was ready. It found holes that would have made the study's measurements wrong. They are
fixed here. No new feature.

### Fixed: the invented-claim check (decision version 3, reader `a173339d`)

- **Headings and table rows are read.** A figure in a heading or a table was never seen before.
- **True stories are kept.** Markdown is stripped before matching, a story may span the sentences of one
  paragraph, and compound and scaled numbers are read: "twenty-five" is 25; "fourteen" is not "four";
  "one million" is not "3 million".
- **A reader failure mid-repair no longer ships an invented figure as fixed.** The sensor degrades for
  good, both sides of every comparison use one instrument, and claims the reader had flagged are cut.
- **Only a qualified reader may cut.** Version 3 reported until it was re-qualified, and the pattern check
  gated meanwhile. It qualified in this release (see *Studies* below) and now cuts by default. The record keeps the instrument, its version, whether it was qualified, whether it
  degraded, and what it spent.

### Fixed: the moat and the loop

- **The standard's hash is checked on every load.** A hand-edited standard is refused.
  `assertStandardUnchanged` now compares the incumbent with the candidate instead of a standard with
  itself.
- **A rejected habit no longer comes back through the persona.**
- **Only a rule you made REQUIRED and confirmed can become an output schema.**
- **`promote` refuses a candidate the gate or you already rejected**, unless `--override "<reason>"`, which
  is recorded.
- **Runs made by `fix` are recorded as FIX_EVALUATION, not organic use.** `STUDY` provenance exists for
  studies.
- **A REQUIRED measured rule that flips from pass to fail on a task blocks an automatic promotion**,
  margin or not. Rules the floor does not guard are named. In `fix`, only REQUIRED regressions reject.
- **Draft choice puts REQUIRED rules first, then taste**, and a draft too short to measure ranks last on
  signals.
- **A failed draft call keeps the drafts that came back.**
- **The meaning check refuses seven more ways a rewrite can overstate:**
  - a modal hardened ("can reduce" → "reduces");
  - a stance dropped ("we think X" → "X");
  - an added figure;
  - an added name;
  - correlation turned into cause;
  - "one of the best" → "the best";
  - an added intensifier.

  A style span merged with a claim is still checked.
- **The record can reproduce a study arm**: the claim instrument, the taste VETO set, the learned-tells
  hash, the format, the version, the token limit and temperature, the flags, and the drafts not chosen.
  The printed cost includes the claim reader.
- **A run on a new surface names the earlier binding.**
- `rollback` is recorded, and an accepted new binding sticks.

### Fixed: detection and discovery

- Front matter and code no longer inflate the counted features; the digit and serial-comma counts are no
  longer biased.
- **FEATURE rules are suggested PREFERRED, never REQUIRED.** A zero-width band becomes a cap. Features that
  would ask for more links, figures, names or quotations are proposed only as caps, so they can't
  contradict the claim check. Rules and signals are capped separately.
- **The taste reader needs a confirmed miss on a rule itself to hold VETO on it.** Pooled labels no longer
  grant it to a rule nobody labelled.
- The learned phrase list no longer reads the reserved pieces (`--include-reserved` to opt in).
- **Discovery's comparison drafts are written in the skill's format and at the author's length**, not as
  900-word blog posts. Stale signals are cleared.
- Class aliases (`blog`, `linkedin`, `whitepaper`, `x`). An X post counts a link as 23 characters.
- A one-sided exact sign test, and a binomial tail for the blinding check, in `core/stats`.
- A key with no credit, or refused, gets one plain line with the request id, not raw JSON.

### Claims corrected

- **Not every study was pre-registered.** The confirmations and qualifications were; the early rounds and
  development runs were exploratory.
- **Round 7's "invented nothing"** is now stated with the stricter check that found six invented details
  afterwards.
- **The comparison table says what exists.** Atelier borrows two ideas from GEPA-style search, applied to
  how rules are carried. "Nothing else gets worse" is now "no measured rule regresses beyond its margin;
  rules no count reads are listed, not guarded".
- **Populations are stated** for every result.

### Added: Phase C, built and not run

- `studies/harness/phase-c-generate.mjs`, `phase-c-package.mjs` and `phase-c-score.mjs`, and the draft
  pre-registration.
- Fresh letters per reader and per brief, and sealed keys.
- The packager refuses any file beside the letters: round 7's log sat next to its letter file.
- The same facts go to every arm, and every counted feature of every draft is recorded, to test which
  sensors track what readers prefer.

### Changed: the first run, made short and safe (the ease-of-use brief)

A first run by a new user took five commands and about 10,800 words of output to get one 498-word post, and
died on a default model name. No feature was added: every change is a default, a merged step, a message, or
something moved out of the default output. Measured offline on the brief's six-post corpus against the
scripted backend: the first screen went from 1,992 to 960 words, the accept step from 4,100 to 228, and the
text around an `invoke` post from 256 to 55.

- **The first run no longer dies on a model name.** A backend that does not serve a model now answers as
  one plain line naming the setting to change (`ATELIER_MODEL`, or `ATELIER_DISCOVERY_MODEL` /
  `ATELIER_TARGET_MODEL`), on both providers. When the model that reads your work is the built-in default,
  discovery reads with the target model instead and says so, the same way a refused request already
  retried, and so does the persona at build. A model you named is never swapped. A 429 is one line too.
  Fixed on the way: after such a retry, the degraded single-pass path still called the model that had failed.
- **Two commands to a skill.** Without a terminal, `atelier new` printed `atelier review --accept`, which only
  recorded and reprinted the whole screen. It now prints `atelier new <folder> --accept`, which records and
  builds. Continuing a run whose screen was already printed, `--accept` does not print it again; a first
  `new --accept` still shows every rule before recording it, since only the person may make a rule theirs.
- **The review screen shows what deserves attention.** The rules that will instruct the model and the ones
  with the thinnest evidence are shown in full; rules shown only as examples take one line each, with what
  they need from you. `atelier pending` and the page still show every rule with its evidence.
- **Pressing Enter is safe on thin evidence.** Rejection was suggested when a rule failed in two pieces
  discovery never read; on a six-post corpus that rejected moves the author plainly makes. It now needs four
  (`MIN_PIECES_TO_REJECT`); on fewer, the rule is shown as an example, weakest first. The brief also asked
  that no counted rule be suggested as an instruction when the author's reserved piece breaks it. Not done:
  consulting the reserved pieces while building the standard would spend the blind check, so `atelier new`
  reports how they fare after the build, as before.
- **Under `atelier new`, each step reports in a line or two** (intake, discovery, ratify-close, build): what
  was held back, what was minted and which rules instruct, where the skill is, what the host does not
  deliver. The full reports remain on the standalone commands and in the run's files. A refusal, a failure
  or a rule that binds is never shortened.
- **A rule waiting for material is not a missed rule.** One line near the top names the exact
  `--with <name>=<file>` that lets it fire (a prerequisite is matched by name, so "bind your notes" would not
  have cleared it). The taste reader reports such a rule as waiting, and it is left out of the reader's VETO:
  with nothing bound, a repair toward it could only invent.
- **`invoke` prints the piece and a few lines**: any REQUIRED measured rule still broken, what was cut, what the taste
  reader saw, and anything that failed. The full account (draft choice, repair passes, every cut, the claim
  instrument, the taste reading, the cost) is written to `last-invocation.txt` in the run's directory, and the
  path is printed.
- The README said the pattern check "misses about half" of inventions. It missed 54% and then 74%.

### Changed: polish (current API usage, clean lint, a front door a stranger can read)

Product behaviour changed only where a fix is named here.

- **Current Claude API usage.** Claude Opus 5.5, Sonnet 5.5 and Fable 5.1 reject forced tool choice with a
  400, so a person who set one of them got an error on every call. The provider keeps forcing the call
  wherever a model accepts it (the measured instruments are unchanged) and, on the models that refuse,
  asks with `auto` and an instruction, still failing closed without a tool call
  ([decision 0005](docs/decisions/0005-forced-tool-choice.md)).
- **Zero lint warnings**, from 64: every non-null assertion replaced with real narrowing, none suppressed.
- **Generated skills read cleanly.** "About 200 to 200 words" reads "about 200 words", and a test pins that
  a condition with no words in it renders as general, never as "When , …".
- **`invoke` split** from one 215-line function into its phases; the taste reader's shared state is one
  class, and its client is still made before any draft is paid for. **`--help`** shows the six verbs first, then every command on one line.
- **The README is under 1,000 words** (from about 2,900). The detail moved, none of it removed:
  [USAGE](docs/USAGE.md), [COMPARISON](docs/COMPARISON.md), [RESULTS](docs/RESULTS.md) (wins and
  failures side by side, with populations), [LESSONS](docs/LESSONS.md),
  [decisions/](docs/decisions/README.md) (five records,
  including the design of a search that cannot move the standard), a public [ROADMAP](docs/ROADMAP.md)
  with what is not being built, and [PRODUCT-METRICS](docs/PRODUCT-METRICS.md).
- **An example to run:** [examples/blog](examples/blog/README.md), six synthetic posts, declared AI-written.
- The new docs were written with Atelier's own guard: each passes `atelier verify` against a skill built
  from a public author's posts, with the repository's records bound as material.
- Removed committed browser-tool logs; fixed a test that leaked a stubbed `fetch` into later suites.

### Studies: two rewrite tests (exploratory, not pre-registered)

The owner asked for their company blog post (1,438 words, "we") rewritten in another publication's style.

- **A newsletter, 19 public previews** ($2.54). Failed. The rewrite kept most of the original's
  sentences and added em dashes (0 to 4.3 per 1,000 words, against the author's 1.1) and runs of very
  short sentences. Three reviews agreed it was a copyedit, not a voice transfer. Causes found: nothing in
  the catalogue held em dashes or staccato runs; the contraction rule was one-sided; repair could not split
  a paragraph; and 16 of the 19 previews ended in a paywall teaser, which discovery read as style. Fixed
  above (the tell floor, two-sided contractions, no-model repairs); the corpus lesson is to use full pieces.
- **A company blog, 16 full essays** ($4.21 including one rebuild after the fix below). Three arms on
  the same writer model, packaged blind for the owner: Atelier, a plain prompt, and 14 essays pasted into
  the prompt. Counted against the company's essays (1.8 em dashes and 0.1 staccato runs per 1,000 words): the
  Atelier draft had 0 and 0, the plain prompt 4.0 and 1.3, the pasted essays 2.8 and 0.7. Atelier's
  contractions matched the company's (25.3 against 22.2 per 1,000); the baselines stayed at the original's 7.
  No arm moved sentence length toward the company's (median 15 words; every arm 11) or kept less than 72% of the
  original's sentences. **What it shows:** the tell floor and register now hold; voice beyond register did
  not transfer in any arm, because a rewrite anchors to its source and the sentence-length rule only caps.
  Found and fixed during the run: an author's own em dashes had raised the cap on every other tell.

### Studies: the claim reader, version 3, qualified (pre-registered, 25 unused product essays, $7.98)

**PASS.** Version 3 left 41 of 48 clean drafts alone (0.854, 95% CI 0.722–0.939, floor 0.80) and caught all
45 plants it read, including every figure planted in a heading or a table (floor 0.50). The pattern check
caught 11 of 46, none in a heading or table, and flagged 3 true drafts, its first false flags in three
studies. Five of the reader's seven false flags were the author's own true first-person stories: bind them
as material. The $8 cap ran out on the last planted draft, which the pattern check read; it is reported
apart. `{ claude-haiku-4-5, a173339d }` joins `QUALIFIED_READERS`, so version 3 cuts by default
([result](studies/CLAIM_READER_V3_QUALIFICATION_RESULT.md)).

The pre-registration, as sealed:

`studies/CLAIM_READER_V3_QUALIFICATION_PREREGISTRATION.md` is sealed by the commit that adds it. It waits on
the owner's go-ahead for about $5 (cap $8).

- **It breaks a promise, and says so.** Version 2's pre-registration said there would be no third attempt
  before Phase C. Version 2 passed. The audit then found defects version 2's study could not see
  (headings, tables, markdown stories, failing closed), and fixing them made a new instrument. It runs
  under the positions paper's exception for an implementation bug, not because a result disappointed. It
  is the last attempt before Phase C. Phase C does not wait on it: it decides only whether version 3 may
  cut in the product.
- **The harness now tests what changed.** The sealed version is `a173339d` and the seed
  `claim-reader-v3-2026-09-29`. Excerpts keep their headings (39 of the 50 TEST excerpts carry one), and
  two plant kinds put the invention in a heading or a table.
- **Corpus:** 30 product essays from a public newsletter no study has used. How they were drawn was not
  recorded, so the exact set is sealed by hash instead.
- Same floors: specificity ≥ 0.80, sensitivity ≥ 0.50.

### Fixed: the records

- This *Unreleased* section had been pasted twice.
- The voice-rounds result's "not established" list and its "next" list predated the claim reader's
  qualification; a dated note now says what has moved since.

## [0.4.0] — 2026-09-28 (taste detection)

### Added

- **Counted features, selected per author** (`core/observers/features.ts`, `core/observers/selection.ts`).
  - 37 deterministic features across punctuation, sentence shape, the page, lexicon, stance, sound and
    unevenness, none assumed to matter.
  - Discovery measures each one on the author's pieces and on the model's plain drafts. A feature is kept
    only if it separates the two (AUC at least 0.75 either way) and holds on held-back pieces.
  - A kept feature is a **RULE** when the author's band tells single drafts apart. It is proposed as a
    `FEATURE` rule, checked on both sides.
  - Or it is a **SIGNAL** when only the distributions differ. Signals are kept with the skill, break ties
    between drafts, and are never a gate.
- **`atelier verify --profile`**: where a text sits on each counted feature the skill holds, layer by
  layer, not one number.
- **The move reader** (`core/taste/moves.ts`), a candidate for the deep layers: typed readings of figures,
  argumentative moves, openings and closings, register, evidence, callbacks and humour. Every quote is
  verified in code. It is parked until it qualifies.

### Studies: taste detection in development

- On the voice rounds' author against the rounds' model drafts, 7 counted features were kept, all as
  signals: commas per sentence (AUC 0.92), three-item lists (0.89), the length of short sentences (0.88),
  cadence (0.84), the length of long sentences (0.78), block quotations, and deictic openers. Single
  drafts sat inside the author's wide range, so none could be a rule.
- The move reader barely separated that author from the model (AUCs 0.45–0.71). Several of its features
  were unstable on a re-read, and many quoted figures were not verbatim, so it was parked.
- None of this is evidence. The sealed test is studies/SENSOR_QUALIFICATION_PREREGISTRATION.md.

### Studies: qualifying the taste sensors (pre-registered, 40 unused newsletters, $3.75)

- **Counted features: PASS.** Selection kept 10 features, and 9 of them replicated on unseen pieces
  against unseen drafts.
  - Two were rules (links, block quotations). Their bands held: 88–100% of unseen pieces inside, and 100%
    of unseen drafts outside.
  - Seven were signals: names, list items, figures, "you", digits, quoted phrases, long-sentence length.
- **The move reader: FAIL.** Only concession was reliable, kept and replicating; the floor was two. Opening
  and closing moves were reliable (0.93, 0.87) but did not separate this author from the model, and
  figures separated but were unreliable. The reader stays parked.
- The deep layers still have no qualified instrument. Phase C records every draft's profile beside the
  human ranks, to test whether any sensor tracks what a reader hears.

## [0.3.0] — 2026-09-28

The close-out release. What it contains is below.

What it rests on:
- the voice rounds: encouraging, one author, the owner as reader;
- the claim reader's qualification: passed on unseen technical and marketing writing, failed on essays in
  version 1.

What it does not yet show is in the README under *What has been tested, and what hasn't*. The next piece
of evidence is an external blind study, with readers other than the owner and more than one writer.

### Changed (the invented-claim check: read by a small model, decided in code)

- **UNSOURCED is read by a claim reader** (`core/loop/claim-extract.ts`). A small model (`claude-haiku-4-5`
  on Anthropic, or `ATELIER_CLAIMS_MODEL` on any backend, including the person's own API) lists every
  specific in the draft (figure, date, quotation, attribution, link, story told as lived) with its kind,
  whether it is attributed, and where it claims it came from, quoting the support. Code verifies the
  quote is in the material and the numbers are there. Attributed claims, quotations, links and lived
  events can never pass as "public". Unattributed general knowledge is listed to check, not cut.
- Why: the pattern check missed ordinary invented specifics ("94 minutes", "nine people", "went from 22%
  to 91%": 0 of 6 caught on the audit's probe), let any link excuse a figure, and let a named quotation
  through. Widening the patterns was ruled out: the positions paper records an unsourced-figure pattern
  that fired on 28 of 30 expert-perfect pieces, and a gate on the model's typed provenance that did
  discriminate. This follows the second design.
- With no reader configured (no key, or a non-Anthropic backend without `ATELIER_CLAIMS_MODEL`), the
  pattern check runs and the report says so. A reader that fails falls back to it and says so; a failed
  read is never reported as clean. Every UNSOURCED line names its instrument and the reader's prompt
  version. `--claims pattern` keeps a run offline; the test suite runs that way.
- **Not yet qualified.** The reader's sensitivity (planted inventions in real pieces) and specificity
  (true pieces checked with their own material) have not been measured. Until they are, it is a strong
  filter, not a proof, and the README says so.

### Fixed (Phase A: the audit's findings)

- **A skill with an output contract was never checked for invented claims.** A structured answer is now
  read field by field; on a finding it is generated once more with the findings named, and refused if it
  still invents (`--allow-unsourced` to override).
- **The meaning check accepted added strength.** A rewrite may no longer add a universal ("any",
  "every") or certainty verb ("eliminates", "ensures"), or drop an intention ("we expect to"). Causality
  and dropped scope clauses remain uncaught, and the docs say so.
- **A REQUIRED rule marked OBSERVE could regress under an automatic promotion** (the regression flag was
  hard-wired false). Any REQUIRED rule the floor measures regressing is now a deterministic regression.
- **An automatic promotion did not say what no instrument read.** It now names, by id, every ratified
  rule neither a count nor a reader with VETO checked.
- **An under-used pattern was proposed as a floor with no ceiling**, which a model overshoots. It is now
  a band.
- **Using a skill in Claude Code blocked `atelier invoke` afterwards.** The first runtime binding ever
  recorded was the baseline for every surface, and the Stop hook records `claude-code`. The baseline is
  now the first binding on the same surface: another model on that surface is still flagged.
- **Re-minting an identical standard threw** (after `abort`, or a confirm → rollback → confirm), because
  the store compared the mint time. It now compares what the hash covers, and keeps the stored file.
- **`confirm` and `amend` moved the active pointer before installing**, so a failed install left the
  store naming a version the host was not serving. Both now install first.
- **A resumed `fix` could show a run of a different task** beside the current one. It now pairs only a
  run of the same task, or sends the person to `promote` / `reject`.
- **The "not checked against unseen work" caveat never rendered**: the flag was set on a copy that was
  not saved.
- **The staged `ratify --decisions` path dropped a discovered need** when the ruling said nothing about
  it. It now keeps it (`"needs":"none"` waives), and says which.
- **A scope change alone was refused by `amend`**, and a skipped conditional rule gave no remedy. Both
  fixed: `verify` prints the exact `amend` command.
- **A quantified noun-phrase condition rendered as a non-sentence** ("When any statement about…, I…").
  It now reads "For …, … Elsewhere, do not." Clauses keep the "When" frame.
- **The suite failed on macOS** (temp paths through `/private`). CI now runs macOS as well.
- **The pattern fallback let any link excuse a figure.** A link now supports a figure only when the person
  supplied that link.
- **`atelier status --skill` now says what the one human act was**: how many suggested rulings were
  taken, how many overridden, and how many had none. The ledger already recorded it; nothing reported it.
- `--help` opens with the common workflow (`new`, `invoke`, `verify`, `material`, `fix`, `status`), then
  lists every command.

### Added

- **Format profiles** (`core/observers/formats.ts`, docs/FORMATS.md). A skill whose class names a known
  format (`x-post`, `linkedin-post`, `blog-post`, `book-chapter`, `one-pager`, `white-paper`,
  `financial-report`, `contract`) holds each draft to that format's fixed facts: a hard limit fails the
  check (FORMAT); the usual length and LinkedIn's fold warn; in white papers, one-pagers, reports and
  contracts nothing passes as general knowledge. A profile never adds a rule to the standard.
- **docs/FORMATS.md**: the eleven layers of taste mapped to what is measured today and what is not, and
  for each format what would need evidence before it is built.


### Fixed (install)

- Two installs over hand-edited files in the same millisecond chose the same backup folder name; the move onto
  it failed, and an install that had already put the new skill in place reported failure, leaving the old copy
  in staging. Backup names are now made unique. Found by a CI run on Node 24.

### Changed (README)

- Rewritten around what Atelier does that a model or an optimizer doesn't: how it reads taste along eight
  dimensions (counted, or read by a calibrated reader), the harness it builds around the model (standard,
  compiled skill, runtime, guard, record, loop), exactly when it asks the person (once, at creation), and
  the comparison with a plain model and with GEPA, SkillOpt, SSO and EvoSkill.

### Added (for coding agents)

- **`AGENTS.md`** (and `CLAUDE.md`, which imports it): what an agent pointed at this repository should do to
  set Atelier up and use it for someone, and what it must leave to the person (approving the standard,
  editing compiled skills, supplying real material). Its commands are checked against the CLI by the tests.

### Changed (the claim reader, version 2)

- The decision now checks the reader's location too. A specific must be in the sentence the reader
  names; otherwise it is moved to the sentence that holds it, and if no sentence does, nothing is cut.
- A specific that traces to the material verbatim is supported, whatever the reader said.
- Spelled-out numbers are the same figure as their digits.
- The prompt is unchanged. The instrument version is `0279163b`, and readings now keep the reader's typed
  specifics for audit.

### Studies: qualifying the claim reader, version 2 (the one approved second attempt)

- Pre-registered (studies/CLAIM_READER_V2_QUALIFICATION_PREREGISTRATION.md, sealed before output) on 33
  pieces no study had used: 25 technical newsletters and 8 marketing and study pieces. Same floors. $3.45.
- **PASS.** Specificity 35 / 38 = 0.921 (95% CI 0.786–0.983). Sensitivity 35 / 35 = 1.00 (0.90–1.00).
  The pattern check on the same drafts: 38 / 38 and 9 / 35.
- The interval is wide, and its lower bound is below the floor. Version 1 failed on essays. The result
  holds for this population.
- v2 was developed on v1's spent test set (36 / 43 there), which is not counted as evidence.

### Studies: qualifying the claim reader (Phase B)

- Pre-registered (studies/CLAIM_READER_QUALIFICATION_PREREGISTRATION.md, sealed before any output):
  specificity ≥ 0.80 on clean rewrites of 22 real pieces with their material, and sensitivity ≥ 0.50 on
  one planted invention of eight kinds. Reader `claude-haiku-4-5`, prompt `a5c3ef8a`, frozen. $4.95.
- **FAIL on specificity.** Sensitivity 39 / 39 = 1.00 (95% CI 0.91–1.00), against the pattern check's
  18 / 39. Specificity 32 / 43 = 0.744 (0.59–0.87), against the pattern check's 43 / 43.
- The gate stays fail-closed, and the README and docs state the rates.
- Read after unblinding: most false positives are sentences with no specific, beside one that has it. The
  reader appears to mislocate specifics, and the decision trusts its sentence number. That is a hypothesis
  for the next reader, which must be qualified on pieces this study did not use.

### Studies: blind voice rounds on one public author's corpus (what each found, and what changed)

One public author's Substack (20 posts, reserved pieces never read by any arm), one writer model
(`claude-opus-5`), the product against baselines. The rankings in rounds 1–5 came from readers of the same
model family as the writer; the owner's blind read is round 7's voice criterion. Each round's conclusion,
as it stood at the time:

- **Round 1** (one brief; raw model, the model's own style guide, Atelier). The measured table favoured
  Atelier (the only arm meeting every REQUIRED rule after one repaired paragraph); the style-guide arm read
  as most like the author. Showed: meeting the rules is not sounding like the author.
- **Round 2** (the same brief; the anti-generic skill against rounds 1's arms). Contrast rules removed the
  model's tells (em dashes, fragments, "not X, it's Y"), but the output still read machine-written in places.
- **Round 3** (four arms). Atelier ranked last by the reader and by a model judge while holding 5 of 5 rules.
  Root cause: the skill served no writing of the author's, enforced negatives and left positives optional,
  had no first person, spelled British, and a repair left a splice ("coupling: coupling:"). Led to: served
  author passages, signature bands, a voice layer (first person, dialect), whole-sentence repair spans.
- **Round 4** (five briefs, five arms). The rebuilt skill (21 required rules) ranked fourth of five and read
  as a template; a corpus-in-context arm won partly by lifting lines (68 shared 6-grams per piece).
  Led to: a grounded persona with frequencies, whole pieces spanning the author's modes, reading rules
  required only when nearly always followed, weak (selection-only) bands, register and displacement rules.
- **Round 5** (pre-registered: VOICE_ROUND5_PREREGISTRATION.md; seven arms). Atelier won 3 of 5 briefs for
  the reader (mean rank 2.4 of 7) but failed the sealed rule: stylometry level with raw. The guard was
  close to a no-op (one full style pass in ten). Every arm carried machine-written sentences at 3–7× the
  author's rate. An audit found the cause of the whack-a-mole: tells were hand-written strings learned from
  plain drafts although they appear under the skill; the rules that could catch them were never enforced;
  repair could not remove a move. Led to: the machine-tell catalogue, the learned lexicon, move-aware repair,
  two drafts by default.
- **Offline, on round 5's drafts** (studies/harness/guard-offline.mjs, $3.49): the new guard halved machine
  tells on every arm and raised REQUIRED rules held from 118/200 to 181/200.
- **Round 6** (pre-registered: VOICE_ROUND6_PREREGISTRATION.md). Failed its gate narrowly: machine tells 0.26
  per 1,000 words against 0.22, one invented story, stylometry 0.005 below raw. Criteria 3–5 passed. Each miss
  traced to an enforcement defect (a pooled cap; a model offering slots where told to cut; a "not" blocking
  the cut of a pure machine sentence), fixed without changing the design. Post hoc, round 6's own drafts
  through the fixed guard met criteria 1–5 (tells 0.21, no invented stories or slots, 2.4 shared 6-grams,
  every REQUIRED rule held, habits in the author's range). Stylometry could not separate any arm (within
  0.012), so it cannot serve as the voice criterion.
- **The record of all seven rounds, what is established and what is not:** studies/VOICE_ROUNDS_RESULT.md.
- **Round 7** (pre-registered: VOICE_ROUND7_PREREGISTRATION.md; RAW, CONTEXT, ATELIER; $13.88). **The voice
  criterion passed; the sealed gate as a whole did not.**
  - Criterion 6, the owner's blind read: Atelier ranked first on both briefs read (1, on the author's topic,
    and 5, off-topic), above the corpus-in-context arm both times. A same-family reader, blind, ranked it
    first on 4 of 5 briefs (mean 1.2 of 3) and above RAW on all 5; the model judge agreed (1.4, against
    CONTEXT 1.8 and RAW 2.8). Stylometry, tracked: Atelier -0.29, between RAW -0.33 and CONTEXT -0.25. First
    round in which the product beat the arm with the author's pieces in its prompt, without lifting lines
    (3.6 shared 6-grams per piece against CONTEXT's 97) or inventing a story (0 against 2).
  - Criteria 2-4 passed: no invented stories or slots, 3.6 shared 6-grams, every REQUIRED rule held in all
    five pieces (CONTEXT held 3-4 of 6, RAW 2-4 of 6).
  - Criterion 1 failed: machine-writing moves 0.27 per 1,000 words against 0.22, one per piece, each from a
    family the author uses in at most 4 of 20 pieces, which the rule held to his rate instead of banning.
  - Criterion 5 failed in one piece: one-line paragraphs and contractions just outside the author's range
    (5 of 7 features in band; the gate asked 6).
  - Readers' remaining gaps: announcing and signposting sentences beyond the catalogue; a contrastive verdict
    as the opening line; invented incidents without a time marker (the claim check keys on one); one-line
    paragraphs well under the author's typical rate; no references to the author's own earlier pieces.
- **Offline, round 7's own drafts through the sensor pass** (post hoc, $2.26): machine moves 0.64 -> 0 per
  1,000 words; the widened claim check found 6 invented stories, quotations or figures the old one missed, and
  all 6 were cut (none left, no slots); shared 6-grams 2.8; every REQUIRED rule held in 5 of 5. Still open:
  one piece keeps one-line paragraphs under the author's range (criterion 5). Stylometry, tracked: Atelier
  -0.305, raw -0.345, corpus-in-context -0.294.

### Added (Phase 8: search the implementation, never the standard)

- **The genome** (`core/optimizer/genome.ts`): everything the compiler derives from a ratified
  standard (each rule's carrier, whether the exemplar and contrast examples ship), with legal
  single-gene mutations taken from each rule's own typed properties.
- **Reflective proposals** (`core/optimizer/reflect.ts`), GEPA's step. A model reads bounded recent
  failures and attempts (SkillOpt's history budget) and chooses among legal changes by number;
  invalid choices are discarded and counted.
- **Pareto selection** (`core/optimizer/pareto.ts`) over the measured rules, with a cheap-model screen
  before the confirmation (successive halving).
- **`atelier optimize`**: propose, build, screen, confirm on the regression floor, and adopt only on
  AUTO_PROMOTE with `--promote`. Rounds are recorded, and `--report` compares the reflective and the
  fixed proposers' keep rates. **`atelier fix --reflect`** runs the same experiment one complaint at a
  time.

### Added (Phase 9: structure, and what keeps going wrong)

- **Position-aware observers** (`core/observers/structure.ts`):
  - `OPENING` and `CLOSING`: phrases the first and last prose paragraph must not use, and a length
    band.
  - `HEADINGS`: tropes, sentence or Title Case, length, and headings per 1,000 words, over a section
    model that ignores the title, code and front matter.
- **The contrast pass proposes edge rules.** Stock openings, closings and heading tropes the author
  never uses are proposed firm where the model's plain drafts use them, and weak otherwise, since
  these often appear only under a voice instruction. It also proposes heading case and opening length.
  On a real 20-post corpus, the heading rule passed every held-out post and flagged three headings in
  an output a reader had called AI-written.
- **`atelier mine`** (`core/mining/recurrence.ts`): recurring gaps, missed rules, rules the draft
  keeps breaking, and repairs refused for changing meaning, each with its remedy. `--add` turns a
  recurring gap into a rule on the owner's word, through the same path as `fix` (now shared in
  `cli/commands/addition.ts`). `--phrase` asks a model to propose a wording.

### Added (plan phase D: the loop runs itself; a simpler front door)

- **The regression floor takes tasks as the unit.** One paired test per rule across tasks (a one-sided
  95% t-interval on the per-task differences, spread at least half the margin, at least five tasks),
  one draft per task by default. A floor on ten tasks now costs ten drafts per version instead of about
  sixty.
- **Qualification is sensitivity first.** The floor must catch at least 80% of at least 10 planted
  regressions of two margins, and its false alarms must stay under an upper 95% bound of 25% over at
  least 11 trials (one per enforced rule per fresh A/A run).
- **`atelier floor --setup`**: margins and tasks from your own titled pieces, the REQUIRED counted
  rules enforced, a baseline frozen and A/A runs until earned, with the spend said first.
- **`atelier tend`**: mining, the taste reader's status, the floor and one optimizer round in one
  command, with a digest; `--auto` lets the promotion gate install a winner. Written for cron.
- **`atelier status --skill <name>`**: where a skill stands, on one page.
- **The front door** (`atelier` with no command) lists the everyday verbs first: create, use,
  correct, status, calibrate, set up the floor, tend.

### Changed (sensor pass after round 7: truthfulness first, then the last machine moves)

- **Invented material, in the shapes readers caught** (`core/loop/claims.ts`): an anecdote without a date
  ("I had an agent consolidate…"), a second-hand story ("a team I worked with shipped…", "teams I've talked
  to…"), and an unnamed authority ("a legal scholar put it…", kind `SOURCE`). The claim check used to key on a
  time marker, so these passed as clean. A view in the first person is never flagged.
- **Asked for, not invented**: `invoke` says before writing when no material of the person's is bound, and how
  to bind it; what the draft invents is cut and listed.
- **Held to the author's typical piece**: a machine-move family used in fewer than half the author's pieces is
  banned in ours (round 7 allowed one per piece from families the author used in at most 4 of 20). The
  author's own occasional move is tolerated when the rule is qualified on their unread work.
- **A move the author never makes is banned at any length**: a rate needs 150 words, but a two-line support
  reply that opens "Let me be blunt" has made the move.
- **Four more families, each measured first**: announced reframes, "I keep coming back to", "the awkward
  middle", and a contrastive verdict as the opening line (found by position). Measured with the product's own
  sensor: 0 to 0.07 per 1,000 words in three authors' corpora, 0.03 to 0.33 in model drafts (roughly 3 to 10
  times); three other candidates separated nothing and stay out. (A first count read 0 for the authors: it
  matched only straight apostrophes, and one author writes curly ones.)
- **An author's own occasional moves**: one corpus held such moves in 8 of 20 pieces, one piece with four. When
  the rule is checked on the author's unread work, their pieces are tolerated up to what their own
  90th-percentile piece carries; output is still held to their typical piece.

### Changed (after the fifth blind voice round: catch machine-written sentences as moves, from data)

Every version in round five, including the product's, carried sentences that read as machine-written.
An audit found why each fix had been a whack-a-mole: tells were hand-written strings added after each
round; they were learned from plain drafts although they appear under the skill; the rules that could
catch them were routed to "shown, never checked"; and repair could not remove a move. The changes:

- **`MACHINE_TELL`**: a catalogue of ten families of the model's moves (`core/observers/tells.ts`), proposed
  for every corpus as a cap at the author's own rate. **`CONTRAST_VERDICT`**: the contrast move in every
  spelling, capped only where the model overuses it against this author.
- **A learned lexicon** (`core/observers/tell-lexicon.ts`, `atelier tells`): 4-5-word phrases the skill's own
  drafts repeat across three or more topics, absent from the corpus beyond chance (Poisson). Learned by
  `atelier tend` from the skill's uses; owner can add or strike. Checked under the ratified machine-tell rule.
- **Repair removes the move**: a sentence that recasts a move as its sibling, or leaves a bracketed slot, is
  refused alone (not the whole pass); the loop retries with the forbidden forms named; the negation in a
  contrast may go.
- **Draft selection is live**: a corpus skill writes two drafts by default and keeps the one with fewer
  machine moves.
- **Register** counts only contractible forms, and applies both ways (a cap on contractions for a formal author).
- **The persona is checked against every cap**, shown or required, and the whole contrast family.
- Fixed: the "stories cut" note printed only when the taste reader ran.

### Changed (after the fourth blind voice round: describe the voice, guard the edges)

The fourth round (five briefs, five versions) ranked the rebuilt skill fourth of five: 21 required rules
bought compliance and a recognisable Atelier house style, and no voice. A model-written style guide came
second with almost no copying. The changes, all derived from the corpus, none tuned to one author:

- **A persona brief** (`core/compiler/persona.ts`): how the author sounds, each point with how often and a
  verbatim quote; a point whose quote is not in the corpus is dropped. Derived at build (one model call).
- **Whole pieces** chosen to span the author's modes (farthest-point sampling on mode features, within a
  word budget) replace the three short passages.
- **Required means nearly always**: a reading rule instructs only when followed in four of five unread
  pieces; the rest compile as "moves I sometimes make", with their rate and a per-piece cap
  (`Requirement.observedRate`).
- **Signature and first-person bands are weak**: checked and used to choose drafts, never instructed.
- **Register**: `CONTRACTION` / `FULL_FORM` patterns and a contraction rule for authors who contract.
- **Displacement**: pattern families (contrast, opener) with `RATHER_THAN`, `REFRAME`, `ORDINAL_CATALOGUE`;
  a rewrite that lowers one member and raises another is refused (per sentence since the round-5 fixes
  below; at first the whole pass was refused).
- **Invented stories are cut by default**, and listed after the output; `--placeholders` restores slots.
- **`verify --repair`**: the guard for text written anywhere else.
- `build` is async (it may call the model for the persona); `--voice` and `--persona` take none|auto.

### Changed (after the third blind voice round: sound like the author, not just unlike a model)

A skill that met every one of its rules was ranked least like the author of four versions. The causes,
and what changed:

- **The skill served no writing of the author's.** A build now serves three of the author's own passages
  inline (`core/compiler/voice.ts`: the most stylistically typical window of each piece by Burrows'
  Delta, from different pieces with the least topic overlap, never a reserved piece) and the author's
  usual piece length. They travel through every rebuild. `build --voice none` turns them off.
- **The negatives were enforced and the positives optional.** The author's own habits (bold, one-line
  paragraphs, rhetorical questions, semicolons) are now proposed as two-sided bands around their rate,
  which can be required, instead of lax floors shown as optional examples.
- **Nothing held the first person or the dialect.** A voice layer proposes a first-person band (a view
  needs no source; a story does) and a cap on the other dialect's spellings. New patterns:
  `FIRST_PERSON`, `BRITISH_SPELLING`, `AMERICAN_SPELLING`.
- **Banning the em dash moved the aside onto " - ".** The cap is now on `DASH_ASIDE`, every dash that sets
  off an aside, whatever the mark.
- **One-line paragraphs counted captions and link lines,** inflating an author's rate about fourfold;
  only prose lines count now.
- **A repair left a stutter** ("moral suasion: coupling: make market access"): a span that ended inside
  the next sentence stopped mid-sentence. Spans now grow to whole sentences at both ends, and a
  replacement that repeats or absorbs the words at its join is refused.
- **Compiled rules read "When , I close…"** for conditions with no words in them, and "When A, when B"
  where the statement had its own condition. Both fixed.
- `studies/harness/voice-round.mjs` runs the comparison over several briefs, judged first by stylometry
  against the reserved pieces, a copying measure and invented-claim counts, with a model ranking as a
  second opinion only.

### Fixed (gap audit of phase D)

- A baseline frozen under another model, or before the tasks changed, killed `optimize` and `tend` halfway,
  after the screen had spent, leaving candidates PENDING that blocked later rounds. It is now refused before
  anything is spent, and the floor throws rather than exits mid-round.
- After an automatic install, the round's other candidates (built on the replaced version) were left
  waiting, and promoting one would have silently reverted the install. They are now set aside as never
  judged. `tend` runs a round only on an EARNED floor, says why it did not, and says the floor must be
  re-earned after an install.
- The reader's fallback to the target model now uses the target runtime's provider and base URL.
- Held-back readings no longer leak through the taste-repair line or a count of misses, and only labels on
  held-back readings earn anything (labels given before hold-back existed no longer count).
- The taste reader's VETO applied only in `optimize`; `fix` and `floor --check --promote` could install
  past it. It now lives in the one check every automatic install goes through.
- `floor --setup` refuses, before spending, when fewer than two rules can be enforced.
- `verify --json --taste` printed text after the JSON; it is now one object, and `failed` includes a
  VETO miss. MCP says when the reader could not run.
- A baseline with a different number of drafts per task is refused rather than compared; how drafts are
  scored is part of what a qualification is a rate of; a qualification for another draft count is kept.
- `status --skill` and `floor` no longer die without a target model; `status --help` mentions `--skill`.
- Docs say what the A/A and planted checks really measure, and the cron example keeps stderr.

### Fixed (gap audit of phases A to C)

- `invoke` on a runtime with only a target model died resolving the reader model, even with
  `--no-taste`. The reader model is resolved only when the reader runs, and falls back to the target
  model.
- A reader failure (rate limit, budget) inside the repair or the draft ranking aborted `invoke` after
  the drafts were paid for. It now delivers the counted result and says why.
- **Labels were not blind in practice**: the owner was asked to label passages whose verdicts had just
  been printed. About a third of readings are now held back (acted on, never displayed), and only
  those are put to the owner.
- `--label` took a position in a list that shifted as items were labelled, so a later label could land
  on the wrong reading. Labels now use a stable token, and a reading labelled twice in one command is
  refused.
- The call ceiling undercounted the reader once it had VETO, silently dropping repairs. Applicability
  is decided once per task, a draft already read is not read again, and the ceiling is 3 per draft
  plus 7.
- OBSERVE-only readings, and readings of other people's text, were recorded as behavioural evidence
  for `improve`. Only readings of the skill's own output on rules holding VETO are now.
- A taste rewrite was kept when the reader could no longer tell (UNCLEAR, UNSTABLE); it now needs a
  FOLLOWED. A quote that cannot be located no longer spends a rewrite call, and a quote across a
  paragraph break is not spliced.
- The MCP verify reply now fails on a VETO miss, marks VETO only on misses, and keeps the counted report
  when the reader fails.
- The passage shown for labelling is a window centred on the quote, so a quote late in a long
  paragraph, or across paragraphs, can be labelled.
- The optimizer's taste block needs a rule missed on at least two more of four tasks, not one more of
  three.
- RHYTHM counts sentences of prose only: bullets no longer read as varied pace.
- The dash-substitute cap is based on the author's median piece and proposed only when the model's
  dashes, moved over, would exceed it.
- Flattening leaves code alone, keeps link words and a year that starts a line; a quote matches with
  or without emphasis markers. Function-word profiles are computed once per text.
- Docs: TASTE.md on costs, hold-back, what earns VETO and what becomes evidence; README on SSO, verify
  --taste and the floor; MEASURED-RULES on the floor, pace and tending.

### Added (plan phases A and B: the taste reader)

- **The taste reader** (`core/taste/reader.ts`, design and pre-registered bar in docs/TASTE.md). Every
  output is read against the rules no count can check:
  - applicability is decided from the task alone
  - behaviour is read twice, the second time with the markdown flattened and the rules reversed
  - verdicts must quote real passages, and a verdict that moves between the two readings is UNSTABLE
- **Calibration from the owner, blind** (`core/taste/calibration.ts`, `atelier taste --calibrate`):
  - labels are taken without showing the reader's verdict
  - VETO requires the exact upper bound on false blocks to be at most 15%, pooled, with per-rule
    revocation
  - scoped to the reader model and the rule's wording; never CERTIFY
- **Wired everywhere the loop runs:**
  - `invoke` reads and records every output
  - with VETO, `invoke` repairs quoted misses (`core/taste/repair.ts`), kept only when the reader
    confirms and no count regresses
  - with VETO, `--drafts` prefers the draft missing the fewest taste rules
  - `verify --taste` and the MCP `taste` flag
  - the optimizer blocks candidates that miss VETO rules more often
  - readings feed `improve` as behavioural observations
- **The coverage map** (`core/taste/dimensions.ts`): every rule sorted into argument, evidence,
  vocabulary, figure, pace, structure, register and cadence, shown on the review screen and in
  `atelier plan`, with the gaps named.
- **Already in the code, now serving.** A wiring audit found much of a taste instrument built but
  unwired: a quoting single-output reader, a both-orders comparator, permission types, and the
  judgement ledger. The new reader follows their contracts (the observation store's `VETO_QUALIFIED`
  authority, `MISSED` as a miss verdict for the convergence loop).
- **Replaced:** the optimizer's pooled pairwise reader (`core/optimizer/veto.ts`), which could only
  earn VETO from `compare` followed by `promote`, is gone. Its role is the taste reader's.
- **Fixed:** `fix` recorded count-decided picks and "same" into the judgement ledger as if they were
  the owner's preferences. Only a person's actual preference is recorded now.

### Added (plan phase C: more of the taste measured, honestly)

- **`RHYTHM`**: pace as variation of sentence, paragraph or section length. It is proposed from the
  author against the model only where most model drafts fail it.
- **The em-dash rule's substitute is capped** at the author's own rate of spaced hyphens.
- **Style distance must recognise the author's own pieces left out in turn**, not only the model's
  drafts. Without this check the measure passed held-out work and then failed two of three reserved
  pieces.
- **A positive-vocabulary floor was tried and deliberately not shipped.** On a single-domain corpus it
  learns the topic, not the voice (see docs/MEASURED-RULES.md).

### Fixed (real end-to-end run on a public author's corpus)

- **`new` lost `--name` on continuation**, and built a skill named after the folder. The class set on
  the first call went to a skill that was never built. The name is now the run's from the first call.
- **Floor margins are never finer than one occurrence** at the author's length. An author who never
  uses a pattern has no spread, and a margin of 0.05 per 1,000 words sat far below the ~0.4 that one
  occurrence is, so no difference could resolve. Re-proposing margins no longer overwrites a role or a
  margin the owner set.
- **Complaints that say the same thing in different words now group.** Mining compares shared content
  words against the shorter complaint (at least two shared) instead of Jaccard, which scored a real
  paraphrase pair 0.22.
- `atelier floor` and `atelier optimize` report the calls and dollars they spent.

### Fixed (final audit)

- **The floor now scores an OPENING or CLOSING rule by what is wrong.** It counts banned phrases plus
  words outside the band. Before, it scored word count, so a short opening with a trope counted as
  "better".
- **A heading can be recased.** Its capitals no longer read as names the rewrite lost, but only for
  a heading case repair; elsewhere names are still compared exactly.
- **An optimizer round that stops leaves nothing pending but its finalists.** Any candidate never
  evaluated blocks nothing. An optimizer's cheap screen is never held against `fix` as if you had
  rejected the move.
- **The edge observers ignore non-prose at the edges.** They read setext headings, keep a `#` that
  belongs to a heading ("Learn C#"), and skip images, footnote definitions and link references.
- **Heading case is read from common words**, not names, acronyms or product words. ALL CAPS reads as
  Title Case.
- **Mining:**
  - Complaints cluster by average link, so unrelated complaints no longer chain together, and
    two-letter words ("em") count.
  - A proposal is matched to its own complaint's timestamp. A wording ever declined is not offered
    again, and neither is a gap a rule was already added for.
  - Drafts are counted on the current standard, with repairs checked.
  - A refused rewrite is charged to the rule it was for.
  - `mine --add` refuses a report made before the standard changed.
  - `--phrase` has one budget.
- **Additions install before they activate**, so a failed install leaves the previous version
  serving.
- **Edge rules count only the drafts they apply to.** An opening and a close with both a trope and a
  length problem send both to be fixed.
- **The reader's kappa must clear a lower confidence bound** as well as its point estimate.

### Fixed (Phase 8 audit)

- Repair memory now judges optimizer retries against the round's first test (a one-draft screen), and
  records the evidence it claims: a move rejected at confirmation or screened out is not re-proposed
  on the same grounds.
- Every candidate a round builds ends settled, untested (a round that stopped), or explicitly waiting
  for a person. `fix` no longer dies on a waiting candidate; it says where to decide it.
- `--cap` is one budget for the whole round, with a call ceiling. A round that runs out stops cleanly
  and is recorded.
- Only a change to a measured rule can install itself. Changes to unmeasured rules, and exemplar or
  examples toggles, are left for a person.
- The screen counts a change only beyond each rule's margin.
- The reader earns VETO by agreeing beyond chance (Cohen's kappa), in both directions, on the
  unmeasured rules it reads.
- Qualification now also requires sensitivity: the floor must catch at least 80% of 20 or more planted
  regressions of two margins. The frozen baseline is part of what a qualification is of.
- Legacy contrast pairs without a check are kept where the passage proves them (and stamped), rather
  than silently dropped.
- "Ship the contrast examples" can be proposed, and toggles are not retried on the same version.
- Reflection's history is the most recent attempts on the rules in play.
- `fix --reflect` falls back to the fixed ordering when repair memory refuses reflection's choice.

### Added (Phase 7: the regression floor, fed and earned)

- **The floor has a producer** (`core/distinctiveness/measured.ts`). Every measured rule is a floor
  dimension, scored by its own observer and oriented so that higher is better.
  - **Margins:** proposed from the author's own spread (half the interquartile range across their
    pieces). `atelier new` proposes them automatically. Every dimension starts OBSERVE.
  - **Verdicts:** tasks are the unit. A per-task three-state verdict (an unscorable enforced dimension
    is INCONCLUSIVE, never "held") and a paired, across-tasks comparison on the repaired rule.
  - **Qualification:** exact Clopper–Pearson false-alarm bounds from accumulating A/A runs.
- **`atelier floor`**: `--corpus`, `--tasks`, `--margin`, `--enforce`, `--observe`, `--baseline`,
  `--qualify`, and `--check <version> [--target] [--promote]`. Changing the contract, tasks or model
  voids the qualification.
- **The gate's automatic path is reachable.** When a count favours the candidate and the floor is
  EARNED, `fix` confirms the count on the floor's tasks, and the promotion gate may install it
  (AUTO_PROMOTE), reject it, or hand it to the person. A promoted version's scores become the next
  baseline.
- **`improve`** reads the floor's real state instead of assuming nothing is earned, and points at
  `atelier floor`.
- Audit remediation:
  - A qualification is a rate of one situation: version, standard, contract, task set, runtime and
    draft count. Any change, a promotion included, voids it.
  - A/A runs compare two fresh halves, so runs are independent; the task is the unit. Before this,
    every run was compared with one frozen baseline, which overstated the evidence roughly tenfold.
  - A variance floor stops sparse counts from resolving a one-margin blip as a proven regression.
  - The repaired rule is left out of the floor's verdict, and at least one other enforced rule must
    hold.
  - A promotion's check scores are not reused as the next baseline.
  - The gate treats a missing floor verdict as unmet.
  - `fix` falls back to a person if the floor run cannot finish.
  - Baselines are refused if they do not cover the tasks or were frozen under another model.
  - Pairs keep their check id, and a pair without one is stale.
  - A candidate built from a package stored before pairs travelled with it still carries them.
  - Margins come only from the author's own (GOLDEN) pieces, and `--corpus` skips reserved pieces.
  - A swapped qualifier may change but not vanish, and the host path passes its swaps.

### Added (Phase 6: more of the standard measured)

- **Proportion observers** (`core/observers/balance.ts`): `TERM_RATE` (a word list per 1,000 words,
  with floors as well as caps), `RATIO` (which of two competing word lists, as a share) and
  `DISTRIBUTION` (the sentence-length mix, as a total-variation distance from a target). Each can be
  declared with `--measure`, and each points a repair at the spans to change.
- **The contrast pass proposes proportions**: competing-word ratios, one floor over the connectives
  the author leans on, one cap over the model's stock vocabulary, and the sentence-length mix. Each
  is proposed only if the author's held-out work meets it and most of the model's drafts fail it. On
  a real 20-post corpus the connective floor passed 5 of 5 held-out posts and failed every AI draft;
  the mix did not separate there, and was not proposed.
- **Rule keys** (`core/state/rule-key.ts`): a rule's identity across versions, derived from what it
  counts (never its threshold) or its statement, and carried through rewording by `amend`. `--rule`
  accepts an id, a key or a number from `atelier plan`; `plan` shows keys; `history` lists which rules
  were added, removed or changed in each version.
- **Write this, not that** (`core/compiler/contrast-examples.ts`): accepted repairs are recorded as
  before/after pairs; `build` ships up to six that still teach the current standard as
  `examples/contrast.md` (`--contrast none` to turn off).
- **docs/MEASURED-RULES.md**: the reference for every observer, its `--measure` syntax, how rules are
  proposed and what the loop guarantees.

### Fixed (Phase 6)

- Audit remediation:
  - A ratio's competing word is now a swap, not a drop: "is not" → "is" is refused as a lost
    negation, while "is not" → "isn't" passes.
  - Runs on held-back tasks (`reference --loop`) no longer record pairs, and `build` skips any pair
    written for, or quoting, a held-back piece.
  - A pair ships only under the same check it was recorded with, and word-counting checks are
    re-counted on the passage.
  - Keys distinguish a floor from a cap, carry a `role` for corpus-picked lists, and are made unique
    within a standard, so a diff reports a removal as a removal.
  - Every contrast proportion must fail at least three in five model drafts.
  - The held-out guard falls back to the read pieces instead of passing vacuously.
  - Mixes never propose negative shares.
  - A mix repair sends no more sentences to a band than it lacks.
  - A ratio counts "it is not" once and suggests the matching counterpart.
  - Candidates carry the exemplar and pairs of the version they are rebuilt from.
  - `fix` now serves candidates, and re-runs the champion, exactly as `invoke` serves them, example
    files included. Before this, the blind A/B compared a champion that saw examples with a candidate
    that did not.
- `build --review` wrote the exemplar (and, since Phase 5, the document class) before stopping. Every
  build-time choice is now held in memory and written only when the build commits.

### Changed (Phase 5)

- **`fix` no longer installs on a count alone.** Its counted decision goes through `resolvePromotion`:
  a count showing the candidate worse rejects it automatically (AUTO_REJECT); a count favouring it is
  HUMAN_GATED (no qualified distinctiveness floor, one generation) and waits for the person's pick. The
  gate's decision is recorded as a `PROMOTION_GATE` event.
  A `--pick` of a candidate the count rejects is refused, and the count's preference is not shown
  until after the blind pick.
- **`verify` now fails invented stories and figures (UNSOURCED) by default.** A pipeline that checks
  a person's own first-person drafts should add their stories and figures to the skill's material
  (`atelier material --skill <name> <file>`) or pass `--allow-unsourced`.
- **The repair loop keeps a pass that fixes a broken rule in fewer places**, not only one that clears
  a rule, so fixing one of two invented figures is progress instead of a discarded pass.

### Added

- **A rewrite may change how something is said, never what it claims** (`core/loop/integrity.ts`).
  Every rewritten span is compared with the one it replaces: figures, negations, qualifiers ("may",
  "most", "roughly"), proper names and earlier `[placeholders]` must survive, except a word the broken
  rule itself named, and the specifics of a flagged invented claim. A failing rewrite is reverted per
  span and listed in the invocation's `repair.integrityReverted`; in Claude Code, where the host holds
  the pen, what was lost is recorded as `repair.meaningLost`.
- **Accuracy before style.** `Requirement.phase` (`add` / `amend --phase ACCURACY|STYLE`); the loop
  repairs ACCURACY rules, and UNSOURCED claims, in their own pass before any STYLE rule.
- **Document class.** `build --class <kind>` / `new --class <kind>` records the kind of document a
  standard measures; `verify`, `invoke` and the MCP `atelier_verify` refuse text declared as another
  kind and say what they assumed when nothing was declared.
- **`verify` and `atelier_verify` run the UNSOURCED check** against the skill's material (plus `--with`,
  or the tool's `material` argument); `--allow-unsourced` turns it off.

- **`atelier new <folder> "<what it is for>"` — the whole journey in one command.** Reserves part of
  the work before anything reads it, discovers, and puts every rule on ONE review screen, strongest
  evidence first, each with a suggested ruling and the reason ("followed in 4 of 5 pieces it never
  read"). Nothing compiles until the person accepts (Enter, or `p3=reject p5=preferred` on the same
  line; `--accept` / `--set` for an assistant relaying the person's answer). Accepting mints, builds
  and installs. Re-entrant: running it again continues from wherever the run stopped.
- **Suggestions from evidence, never decisions** (`core/ratification/suggest.ts`): the purpose sentence
  sets a mode (generate / guard / respond) that moves only the default weight; held-out recurrence and
  cross-vantage agreement set the rest. A conditional rule for a support-style skill is suggested as
  shown, not instructed, unless the evidence is strong — the measured restraint weak spot.
- **Prerequisites have a writer.** Discovery asks what each rule needs from the person; ruling on it
  declares a prerequisite; `invoke` refuses a REQUIRED rule without it, `--with name=file` now sends
  the file's contents, and SKILL.md tells a host to ask rather than invent.
- **`amend --materiality`**: a closed PREFERRED rule can be made REQUIRED (recorded supersession).
- **`<command> --help`, `--version`**, answered before dispatch.
- **The plugin installs**: `/plugin marketplace add yannickYamo/atelier`, `/plugin install atelier@atelier`.

- **Measured rules** (`core/observers/`): deterministic observers whose verdict is a fact about the
  text — banned words and substitution lists (LEXICON), sentence length, paragraph length, hedging —
  each returning the exact spans that broke the rule. Discovery counts the measurable part of the
  corpus and proposes it on the review screen with how many of the author's own pieces meet it,
  including a stock-phrase ban built only from phrases the author never uses. `add --measure` lets an
  author declare one on their own rule. A measured rule is tested by a count, never a reader, and its
  target is stated in SKILL.md.
- **`atelier verify --skill <name> <file>`** (or stdin, `--json`): any text against every measured
  rule, with spans; exits 1 on a broken REQUIRED rule. After `atelier new` builds, the measured rules
  are checked for free against the pieces held back.
- **A census for dark fields**: every optional Requirement field must have a writer on a reachable path.

- **Generate, check, repair** (`core/loop/`): every `invoke` counts the draft against each measured
  rule and rewrites ONLY the spans that break a REQUIRED one (sentence-grown, spliced back
  deterministically, at most two passes); a rewrite that breaks anything that held is discarded. The
  record keeps what the model first wrote and what changed. `--no-repair` opts out.
- **The same loop in Claude Code**: the plugin's Stop hook counts the answer and, once, sends it back
  with only the spans to rewrite (verified live against a real Claude Code session).
- **`atelier mcp`**: the checker as MCP tools (`atelier_verify`, `atelier_rules`,
  `atelier_list_skills`), registered by the plugin; read-only, no model called.
- **`fix` decides by count when the rule is measured**: a candidate implementation is kept only if it
  meets the moved rule where the current one did not and breaks nothing that held; recorded as a
  DETERMINISTIC observation. Only ties go to a person.
- **Exemplar carrier**: `build --exemplar <file>` ships one complete piece of the owner's, read first
  for voice and never for content; carried through every rebuild; a reserved piece is refused.

- **The proof study, drafted** (`studies/PROOF_STUDY_PREREGISTRATION.md`, DRAFT until the owner seals
  it): recall of discovery against the owner's hand-built house standard as a sealed answer key
  (`scripts/recall-sheet.mts`, which refuses to open the key before discovery has finished), the
  shipped loop against a model's own guide (`atelier reference --loop`), and a deterministic
  measured-rule table per arm, whole piece and first vs last third (`scripts/measured-conformance.mts`).

- **What the model does that the author doesn't** (`core/observers/style.ts`, `contrast.ts`): discovery
  has the serving model write plain drafts on the author's own topics and counts named constructions in
  both — em dashes, spaced hyphens, "not X, it's Y", "That's"/"Here's" openers, signposting,
  intensifiers, short verdicts, bold, one-line paragraphs, repeated openers, fragment share — proposing
  caps and floors from wide gaps (and caps on model-typical constructions the author almost never uses),
  each only if the author's held-out work passes it; plus a Burrows' Delta style distance. Found by the
  owner reading a skill's output: the author uses no em dashes in 20 posts; the skill used 7.3 per 1,000.
- **A voice may not invent the person's life or numbers** (`core/loop/claims.ts`): a first-person story
  or a figure presented as a finding, not supported by the person's material, is repaired into a
  placeholder. `atelier material` keeps what they vouch for per skill; `--allow-unsourced` opts out.
- **`invoke --drafts N`**: several drafts, the one with the fewest REQUIRED breaks (then the best style
  margin) delivered, recorded as a selection.

### Changed (product phases, 2026-09-26)

- **The discovery split scales with the corpus**: about a third held out (capped at 8), everything
  else read up to a one-pass token cap, overflow named. It was two pieces proposed, whatever the size.
- **Discovery, `reference` and `contract` run calls concurrently**, with the budget reserving in-flight
  estimates. `contract` prints each case as it lands and resumes from a progress file; `reference`
  isolates a failed arm and reports every comparison that could not run instead of discarding all six.
- **`check` verifies the models discovery actually runs**; every diagnosing command resolves its model
  through one function.
- The review, `pending` and coverage views read discovery's grouping and held-out recurrence, which
  were computed and then dropped.

### Removed (product phases, 2026-09-26)

- **The taste-discovery ladder** (priority fold, blueprint assembly, the dark discrimination channel,
  the methodology fold and the method-registry class): reachable only through `import type`, never
  executed, and capped at ADVISORY by construction. Evidence to weight now runs through the review
  screen's suggestion and the person's ruling.

### Fixed (product phases, 2026-09-26)

- **Rejected rules shipped inside the installed skill.** Installs were additive; the directory is now
  exactly the package, and `inspect` fails on any file the package does not name. Nothing Atelier did
  not write is ever deleted: it is moved to `.atelier-backups/` and named.
- `--reserve a --reserve b` kept only `b`; a single-valued option given twice is now refused.
- `abort --help` aborted the run; `discover --help` spent budget.
- A re-entered `fix`/`improve` complaint lost its record in a bare `catch`.
- `npm run build` left the linked binary non-executable, silently breaking every hook.
- A `/skill` use from a subdirectory was dropped; `fix` in a subdirectory found nothing.
- The ratification ledger is kept beside the standard it produced and shown by `history`.
- `ANTHROPIC_AUTH_TOKEN` is accepted.
- A second `ratify-close` on a standard you wrote yourself asked for `--work-type` again.

### Added (earlier in this release)

- **`atelier fix` — one correction path.** A complaint goes in; Atelier resolves the latest
  recorded use (and says which), diagnoses, and either repairs the implementation — one lateral
  carrier candidate, the same task re-run, a blinded A/B, one keystroke, the winner active AND
  installed with the StandardVersion hash asserted immovable — or, on a standard gap, asks the one
  authority question (add as required / preferred / don't) and an approval mints, compiles and
  installs the superseding StandardVersion in the same motion. The pick lands in the judgement
  ledger and as the first BEHAVIOR-domain observation; a refusal is remembered and not re-asked.
- **A `/skill` use in Claude Code becomes a canonical invocation record.** The plugin's prompt/stop
  hooks pipe the host's own payloads into a hidden `atelier record`; delivery is checked against the
  store at the moment of use, the model is read from the transcript or recorded UNREPORTED, and
  `last-invocation.json` is what lets `fix` need no id from anyone. Core stays host-agnostic: the
  surface value is HOST_PLUGIN, and which host lives in the runtime binding.
- **Grounded direct authority.** The front door persists exactly the proposal it showed; `--yes`
  ratifies those bytes with zero further model calls. A rule becomes EXPERT_AUTHORED only when its
  normative content is mechanically grounded in the person's own text (verbatim span, content words,
  numbers) — the model's `faithful` flag is display evidence, never an authority input.
- **One canonical authority function.** Every surface — batch ratify, ratify-one, add, the front
  door, amend, confirm, fix — assigns authority through `decide()`, which validates obligations and
  enforces the public-source ceiling on every path; amend and confirm now leave ledger records.
  Writing its ceiling test caught the first draft laundering provenance through AMEND.
- **A hint census.** Every `atelier …` line the CLI or plugin skills print must name a dispatched
  command and declared flags. Its first run caught a live typo in the dispatcher's own help.

### Changed

- **Undeclared materiality is source-aware.** A rule the person WROTE instructs with no
  questionnaire; a discovered rule they merely approved is SHOWN until they declare how much it
  matters. The close prints instructs/shown per rule by calling the compiler, so the text cannot
  disagree with the build again. Materiality remains semantic metadata and never selects a carrier.
- **Repair memory is (standard, model)-scoped.** A carrier move rejected under one model never
  suppresses the same move under another; a superseding StandardVersion inherits no verdicts; a
  human TRANSITION_FORBIDDEN holds across runtimes but not across standard versions. The repair
  primitive is lateral replacement under a fixed, recorded ordering — carriers are mechanisms, not
  strengths, which the carrier study demonstrated.
- **`promote` installs.** Adopting a candidate leaves the store, the pointer and the host's bytes
  agreeing, or refuses without moving anything. "Your skill is ready." prints only over a package
  that instructs something; a DRAFT preview says so and names the next step.

### Fixed

- **A build could compile a standard the user never ratified.** The run in flight was per-project;
  the files it produced were not. `pending-standard.json` and nine other working files sat at the
  store root, so two projects sharing one store overwrote each other's pending standard and `build`
  in one project installed — and stamped as ratified — the standard the other had just closed.
  Working files now live under `runs/<project>/`, keyed exactly as the session is, and `build`
  refuses a pending standard whose hash is not the one this run ratified. Files left at the root by
  an older version are adopted only when the store holds a single run, which is the one case where
  their owner is unambiguous.
- **`--skill ../../elsewhere` read from, and wrote to, a directory outside the store.** `build`
  normalised names; the read-side commands (`inspect`, `history`, `rollback`, `feedback`, and
  eleven others) joined `--skill` onto `skills/` as given. Every `--skill` is now validated against
  the same rule `build --name` applies, refused rather than normalised, and the store layout itself
  rejects a name that would leave `skills/`.
- **A rule the person typed was silently dropped.** `add` numbered rules from the length of
  `decided`; a batch `ADD` numbered from a counter that restarted at 1 on every call; the front door
  numbered from the model's list position. All three minted `x1`, and `ratify-close` keys the
  standard by id, so the later rule replaced the earlier one while the CLI reported "2 kept". One
  allocator now hands out the successor of the highest `x<n>` anywhere in the run.
- **After its first build, a project was a dead end; `abort` made it permanent.** Adding a rule after
  `build` and closing again was refused as STANDARD_MUTATED with the advice to `abort`; `abort`
  marked the run terminal and left it in place, and nothing ever started a new run. Closing again
  now mints a version that records what it supersedes (and requires `--reason`, as every
  supersession does), `RATIFIED -> RATIFIED` is a legal transition for that purpose, and `abort`
  archives the session under `sessions/aborted/` so the next command starts clean. `build` also
  advances the run before it writes anything: a refused build used to install the skill and move the
  active pointer, then exit 1.

- **The skill emitted its own internals into the user's deliverable.** Example bodies were rendered
  with markdown headings (`# p6`, `## How the author did it`) and served under another heading.
  Served to a model as context, a heading is not a label — it is a document structure, and the model
  continued it: the answer finished and the skill's requirement text was appended underneath. Measured
  on 74 generations of a blind study, 31 outputs carried a literal `# pN` line and 10 reproduced a
  served example verbatim; the arm carrying one extra example did it 59% of the time against 29%.
  The framing sentence said "these are instances, not instructions", which settles AUTHORITY and says
  nothing about OUTPUT OWNERSHIP. Labels are now bracketed, the block is fenced with explicit start
  and end markers, and it states that the deliverable begins after it. Zero leaks in 8 live
  invocations afterwards.
- **A truncated generation was reported as the model's failure.** The Anthropic adapter read
  `stop_reason` only to interpolate into an error string, so a call the model was never allowed to
  finish surfaced as "the schema was not satisfied". Termination is now a provider-neutral value
  normalised at the adapter boundary, and an incomplete generation raises a typed error carrying it.
  A study built on this misattribution had to withdraw a published figure.
- **The contract runner was provisioned at a fifth of what the work needs.** `maxTokens` was
  hardcoded to 1200 against a measured 6606-token median for a bare answer, and completeness was
  inferred from the text — which cannot distinguish "the model chose not to" from "the model was cut
  off". The budget now comes from a probe that is REFUSED if anything in it was itself truncated: an
  estimate drawn from a censored sample is not a measurement.
- **Discovery discarded a completed run.** Proposals were saved AFTER an optional methodology check
  whose own comment says a failure there "must not cost the taste run that already succeeded and was
  paid for" — and the read that threw sat one line above that try. A stale file left in the global
  store by an unrelated project killed a fresh run after 39 held-out checks and lost all 13
  proposals. What is paid for is now written before anything optional runs.
- **A missing observation became evidence against a rule.** The discovery observer read
  `j?.applicable === true`, which is indistinguishable from a confident NO when the object never
  arrived, and its 500-token budget truncated in practice. Silent false negatives, in the direction
  that under-reports the author's own patterns. The free-text field is bounded at the schema, the
  budget has real headroom, and an unusable answer now refuses.
- **A rule the author wrote was described to the model as one nobody had confirmed.** The
  self-check section asserted "NO ONE HAS CONFIRMED yet" over everything in it, but the section is
  defined by ROLE and confirmation is a different property — so a confirmed PREFERRED requirement
  could be introduced as an unconfirmed guess the model must not act on. The preamble is now derived
  from what is actually in the section.
- **`build` with no standard printed a raw ENOENT and an absolute store path.** It now names both
  routes to a standard, which is what someone who has simply not minted one yet needs.

### Added

- **Corpus provenance is declared or loudly unknown.** `aiAssisted` carries the comment "declared,
  never inferred — it changes what any result means" and was hardcoded to `null`, so the one field
  documented as changing every downstream result was never asked for. Intake now takes
  `--ai-assisted` / `--no-ai-assist` and, absent either, says at seal time what is weaker about an
  undeclared corpus. `null` is kept as a state and never collapsed into `false`.
- **Repair memory is bounded and kept off the executor.** History informs proposals; what was tried
  on the way to a skill is not part of the skill. Under a budget, PROMOTIONS are dropped before
  rejections — a promotion is already encoded in the artifact, a rejection exists nowhere else — and
  nothing is truncated silently.

### Fixed (earlier)

- **The clustered confidence interval was 26% too narrow at n=3**, the smallest sample it admits and
  the most common one. A second t-table keyed from df=3 fell back to t(3)=3.182 where t(2)=4.303 is
  correct, so an interval that honestly crosses zero was reported as a decided direction — and that
  moves `REGRESSED` and `IMPROVED` verdicts. `compare()` compounded it by dividing by one table's
  value and multiplying by another's for the same quantile.
- **The t distribution had two implementations**, byte-identical across ninety lines, one of which
  declared itself the sole owner. They had already drifted at the exact site the project documents as
  repaired. Both now import `core/stats/t.ts`.
- **`assertNotAuthority` did not refuse the claims it exists to refuse.** It ANDed its regex with a
  substring test whose tokens were `this`, `this` and `promotion`, so it fired only on claims
  containing the stopword. Its own test passed vacuously.
- **A PREFERRED requirement could fail the primary endpoint**, which its own documentation forbids,
  because the unscorable-push happened one branch before the REQUIRED guard.
- **`getArchitecture` returned null after any amend of a confirmed rule**, and the caller read that as
  "never persisted" and silently recompiled the default arrangement. Ambiguity now refuses.
- **`--required-n 0`, `--questions abc` and `--cap abc` were silently replaced by defaults**, the same
  `Number(x) || fallback` bug the runtime documents a fix for, reintroduced in a file that imports it.
- **A mistyped command exited 0.** `atelier discovr` printed help and reported success, so a script
  could run a typo in a loop and never learn the work had not happened.
- **The post-build screen asked the author to re-confirm rules they had already decided.** An optional
  standard parameter was passed by neither caller, so the filter fell back to selecting on carrier —
  which is the shape of a TOLERATED component, not an unconfirmed prohibition.
- A regex alternative that could never match (`\b` is defined over ASCII word characters, so a CJK
  term inside word boundaries was unreachable rather than supported).

- **A candidate measured worse was authorised for promotion.** `decide()` had no `REGRESSED` branch,
  so a comparison that found the candidate worse fell through to the promotion gates on the same
  terms as one that found it better. `REJECT` was declared in the terminal union and returned from
  nowhere, which is what a missing branch looks like from outside the file.
- **`core/compiler/placement.ts` was a binary file.** A sentinel written as a raw `0x00` rather than
  the escape `'\0'` made `grep -r` skip all 249 lines without saying so, and made the diff
  unrenderable. Same value, two visible characters, and the reason for the sentinel is now written
  down.
- **The plugin told every user to install a package that does not exist** (`atelier-cli`), on
  `SessionStart`, as the first thing a user with a missing binary reads.
- **`npm run typecheck` failed on a clean checkout** while `npm test` was green, because the build
  config excludes `tests/` and vitest does not typecheck. CI's first step was red.

## [0.1.0]

First public release. The pipeline runs end to end: read a corpus, propose candidate requirements
anchored to the spans they came from, rule on each one, mint an immutable `StandardVersion`, compile
it to an installable skill, serve it with the bytes recorded, and improve the implementation under a
frozen standard.

### Added

- **Acquisition** with the corpus sealed by hash, a proposer that never sees what it is scored
  against, multi-vantage discovery, and every candidate carrying a verbatim span or being dropped.
- **Per-requirement ratification** as the only path to authority, on an append-only ledger that
  records what was shown as well as what was decided.
- **Content-addressed identities** for evidence, standard, architecture, skill, runtime binding and
  invocation, with the standard's hash excluding the model.
- **Compilation** to five carriers by a deterministic function of the ratified fields, with the gate
  role derived from authority rather than chosen.
- **Delivery proof** at the byte and at the wire: the served package is re-hashed before spend, and
  the structured-output schema handed to the provider is hashed against the compiled contract.
- **A convergence loop** that improves the implementation under a fixed standard, routes complaints
  to one of four causes, and stops rather than writing a rule the expert has not ratified.
- **A held-out reference test** with two-phase blinding and a side assignment derived from a hash, so
  it is fixed before generation and auditable afterwards.
- **A baseline arm set** as an enum rather than a flag, so a comparison cannot silently omit the arm
  most likely to win, sealed with the pairs by `armSetHash`.
- **`BUILDER_VIEWED`**, the one consumption recordable against the reserve, so a held-out unit the
  builder has read is refused at audit instead of counted clean.
- **Atomic writes** for every persisted file, and a ledger reader that reports a torn tail while
  refusing to read past corruption in the middle.
- **Multi-provider support**: Anthropic and any OpenAI-compatible backend, with five conformance
  probes including one whose pass condition is a thrown error.

### Known limits

- The expert-ratified effectiveness claim is **not established**. See the evidence section of the
  README, including a preregistered null reported unrepaired.
- Autonomous promotion is reachable in code and unreachable in fact: no gate has been earned, so the
  loop routes to a person.
- Behavioural equality across runtime bindings is unshown; only object portability is demonstrated.

[Unreleased]: https://github.com/yannickYamo/atelier/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yannickYamo/atelier/releases/tag/v0.1.0
