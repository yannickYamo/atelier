# Changelog

Notable changes to Atelier. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**From 1.0 the on-disk state format under `$ATELIER_DATA` is stable within a major version:** a 1.x release
reads every store a 1.0 release wrote. Before 1.0 a minor version could change it.

## [Unreleased]

- **A ban is read at any length on skills built from now on.** A dash ban (a count at zero) built by this version carries `anyLength`, so one dash in a post under 150 words breaks it and none meets it. A ban a 1.0 store holds keeps its 1.0 verdict under 150 words (decision 0008).

### A review of round 4: the dash held on the default path, the plan serves what the rules read, good repairs kept

- **A disputed ban keeps the examples' dash cap.** Built without `--yes`, an owner's "No em dashes." that their own
  examples dispute is shown on every run and blocks nothing until confirmed, and the examples' own dash cap was dropped
  beside it all the same: nothing held the dash. The cap is now dropped only where the ban will hold (not disputed, or
  confirmed with `--yes`), and for any ban whose patterns include the em dash, not only a ban on the dash alone.
- **With a plan, each point is served with the material's words it comes from and the name of its file**, the note that
  the material holds every specific (no bracketed slot) is kept, and where a rule reads the work against the whole
  material (every figure looked up in it, or a written check that reads it), the material's figures (and, for a written
  check, its names) are served as it writes them. The points the plan left out stay unserved.
- **The seam check keeps good repairs.** A replacement that opens on "I" or on a name ("I left early." for "we left
  early.") is a sentence of its own; only the original's own first word, capitalised after an open clause, is flagged.
- **A short draft may be shortened a little.** A pass that takes a draft already under the length asked a little shorter
  (within the length drift) is no longer refused; one that cuts it further, or through the length asked, still is.
- **A stated angle is found however its quotes are typed.** Curly and straight apostrophes and quotation marks read as
  one when a quote is looked up in the request, the material or what was told.

### The owner's ban holds against the examples, posts are documents, the unstated angle is asked, and the plan is what the writer gets

- **The owner's ban beats the examples' rate.** Found by building one case-shaped invented fixture (one essay and four
  short posts, a typed double hyphen in four of them, ten points, the rules "No AI tells.", "No em dashes.", "No "not X,
  it's Y"." and "No named sources.") on the version before round 1 and on this branch, with a scripted writer whose
  draft carries em dashes, a contrastive verdict and a verdict opener. Round 1 made a typed double hyphen a dash; the
  method build reads the examples for the machine-tell rule, where a move any example makes is the author's, so the em
  dash stopped being banned and a cap at the author's rate (20.5 per 1,000 words) was added, required and told to the
  writer beside the owner's ban. Where the owner's step was held as judgement, nothing counted the dashes and the dash
  repair, which fires only on a counted ban, never ran: 2 em dashes delivered where the earlier version delivered 0. Now
  a step counted as no em dash removes the examples' allowance; the step-check reading is told that a step banning a
  construction it lists is that count at zero (a reading case for each added); and "not X, it's Y" is counted with a
  typed curly apostrophe, which the count read only straight. Metric: on the fixture through the binary, 0 tells and 0
  em dashes delivered, and the writer is never told an em-dash allowance.
- **Posts to followers answer nobody.** The work-form reading asks, for each example, whether it answers a particular
  person who wrote first (with a quote found in the piece) or NONE; a reply needs a grounded quote. The forced choice
  between a reply and a document read a folder of posts as replies, which turned the questions and the plan off. Metric:
  the fixture builds as documents with no flag.
- **The angle and the news are the author's where nothing given states them.** The questions reading says where each
  is stated (the request, the material, what the skill was told, or NONE) with a quote code finds there; unstated, they
  are asked whatever status the reader gave them, stated never. Metric: the angle asked on the fixture's reaction post;
  nothing asked when the request states it.
- **With a plan, the writer gets the plan's points.** The request goes to the writer without the material, and the
  plan's points, in the plan's words, are what it writes from; what the plan left out is shown to the person and never
  named to the writer. The checks still read the material. Metric: a scripted writer that writes from what it is served
  carries 0 of the fixture's 10 points and copies no 5-word run (10 of 10, and copied runs, without a plan).
- **"I" is measured, never steered.** The first person is a MONITOR band: read on every output and kept on the record,
  never told to the writer and never a graded target, also on a profile made before; the typical sentence and the
  short ones still steer. The at-length band for a counted rate, which only the first person used, is deleted.
- **A run with no plan says why** on its record (`prewrite.noPlan`) and in `atelier report <run>`: `--no-plan`, no model
  set up, a plan not grounded in the material, a structured output, a request that states its own shape, or a reply.
- **A sentence left unfinished at a splice stays as it was.** A join is read by form: the replacement stops on a word
  with no punctuation where the sentence it replaced had ended and the next sentence opens with a capital ("The good
  news is that The remedy ..."), or the text before stops mid-sentence and the replacement opens on a capital the
  sentence did not have. Metric: 0 broken seams on an invented case of that join.
- **The method build counts the examples' dashes as the amend does.** A stated ban on a counted pattern is said by every
  piece that uses it at all, short ones too, with the typed double hyphen ("your examples use em dashes (—) in 4 of 5
  pieces; your rule bans it; kept as you wrote it"); before, a rate unread under 150 words named one piece of five.
- **The benchmark's judge scores each post on its own** from 1 to 10 on three frozen criteria (voice, argument,
  publishable), is used only after a position test (the accepted post scored higher in both orders on at least 80% of
  clear pairs), reports close and clear wins apart, and leaves the saturated thesis and problem-before-product questions
  to points used and copied runs (`bench/voice-benchmark/README.md`).
- Not built: argument checks (a ceiling, not the cause), persona from one or two pieces (not the cause). Still open: a
  ban on a counted pattern is not read on a piece under 150 words, so a short post's dash is not counted at a run.

### A fix changes what was named, what it took out stays out, and the author's own rates steer

- **`atelier fix` is surgical.** A reading on the house pattern locates the sentences the person's words are about (a
  closed answer: sentence numbers of the current piece, or the whole piece); only those are written again, one span at
  a time inside the `<work>` field, and spliced back by the repair loop's deterministic splice, so nothing outside a span
  can change. A span the person named may change what it claims (their words are the licence); a stutter at a seam is
  still refused. The whole piece is checked again against the standard and read against the author's range; the
  terminal and the record (`fix`, and `atelier report <run>`) show "changed N of M sentences" with every span's before
  and after. Where the words are about the whole piece, or no model can read them, the piece is written again whole, as
  before. Metric: sentences changed outside the named spans per fix round = 0; on an invented 30-sentence piece with two
  sentences named, exactly those two change and the writer's planning notes stay outside the piece.
- **Corrections stick for the piece.** Each fix records the stretches of 5 words or more it took out (wording the piece
  still carries elsewhere is not counted). A later fix whose writer brings one back is written once more without it, and
  kept as it was if it brings it back again; a run that writes the piece again whole reads it as a finding the repair
  rewrites (`REMOVED`, never a rule the work is held on), and records `corrections`. No rule is added to the standard.
  Metric: removed phrases reintroduced = 0.
- **The author's rates steer.** Read in code on an invented corpus shaped like five pieces (one long, four short): a
  discovery reads three and holds two back, a counted band needs four read pieces, so the profile held no band at all;
  the first person singular was no counted feature (only a style pattern, whose floor no span can repair and which
  steering never grades); the median sentence and the share of very short sentences were no features; and a draft
  handed over for a profile signal never reached the redraft, which looked the signal up by its feature name. Now `"I",
  "my" and "me"` (per 1,000 words), the typical sentence (median) and sentences of five words or fewer are counted
  features; they are read over every piece the skill is built from (read and held back, never the reserved: the first
  person as the counts a 1,000-word text at the author's pooled rate may carry, the other two as the pieces' band),
  steer as signals wherever the owner has not ruled them, and are graded targets on any miss, not only far ones. The
  writer is told them before the draft ("about 4 to 5 "I" per 1,000 words; sentences around 15 words; about 1 in 8
  under 6 words"). The build screen and `atelier report --skill` list each as "your own rate, steered on any miss"; on
  the blog example (six pieces, one reserved) three bands now steer where none did. Metric: on the offline end-to-end
  run, a scripted draft off all three has them handed to one draft written again with each one's direction and
  distance (before: the first person was never targeted, and the hand-off reached no draft).
- **A fix is held as a run is, and keeps what it was not asked to change.** A writer that answers nothing keeps the
  sentence as it was and says so (before, the sentence was cut). A named span may change its wording and the claims the person
  asked for, never add a figure or a name found neither in the sentence nor in their words, their material or the piece.
  The fixed piece is delivered by the same decision as a run: under `--strict` (or a strict release) a piece that does not
  conform is not printed and exits 3, a blocked one is printed as blocked and exits 1. Spans never join across a line
  break, so a list stays a list. A sentence named that also stands unnamed elsewhere is counted as the one that changed.
  Wording the owner's method, statements or examples carry is never banned for having been taken out of one piece. A
  provider or budget error while writing the spans writes the piece again whole, said, where `atelier fix` stopped.
- **The owner's rule beats the author's rate.** Where the standard rules a feature ("never use I"), the corpus's rate
  for it is neither told to the writer nor steered, even on a profile made before the rule; a sentence-length proposal
  the owner did not adopt stays monitored. The first person is read at the output's own length (the counts a text of
  that many words at the author's rate may carry), so a 300-word reply at the author's own rate is inside; under 150
  words it is not read.

### What only the author knows is asked before the draft, the draft is planned, and notes are points

- **Up to three questions before a piece is drafted, only for what only the author knows** (the angle or why now, what may
  be named, news about their own work, what to stress). One reading lists the decisions the piece needs, each a closed
  choice of kind, status (known, inferable, unknown) and spread (would the answers give the same, somewhat or different
  drafts); code asks only an unknown author-only decision whose answers give different drafts, at most three, each with
  two to four options and a default. Never voice or form; none when the request carries it; nothing with no reader set up.
  At a terminal a letter, the person's own words or "just write it" answers; elsewhere (`--json`, a pipe, the MCP server)
  the questions come back as `questions: [{id, ask, options, default}]`, the work is written with the defaults, said in
  one line, and `--answers "<id>=<choice>,..."` (the MCP tool's `answers`) answers them on the next call. Answers are the
  skill's next defaults ("last time you said …"); what may be named, once said, is not asked again. Metric: rounds of
  editing to an accepted post, and the thesis judged the author's own (to be read on the benchmark).
- **A plan before the draft.** One reading makes the angle, the pain, the turn, the answer, at most three points chosen
  from the material (each kept only where its words are in the material), one image, the close, and what was left out
  and why, from the request, the answers, the method, the examples and the material. Shown at a terminal (enter writes;
  a typed change makes the plan again from scratch), returned as `plan` with `--json`, served to the writer after the
  skill, never delivered as the work, and kept on the record for `atelier report`. Metric: points used at most 4 of 9.
- **Material written as finished sentences is points to write from.** Said once, served as points, and the delivered work
  is read for the stretches it copies from it: every maximal run of 5 words or more is on the record (`copied`), and one
  of 8 words or more is rewritten like any listed finding; it never holds the work. Metric: copied runs = 0.
- **Second-round gaps closed.** A question is asked only where the reader marks it settled by the author alone (a closed
  `settledBy` field), so a tone question under another kind's label is not asked. `--answers` splits only at a comma
  followed by `<id>=`, so an answer may hold commas; a letter past a question's options takes the default and says so
  (never remembered); an answer for a kind this run did not ask applies and replaces what the skill was told; an id that
  is no question is said in one line and ignored. "Just write it" says which defaults were used. A plan point needs 5
  words or more of the material, and its figures and names must be in them or in the material (the image too); with
  material bound and no point traced there is no plan. A second typed change to the plan keeps the first. A plan line
  printed into the work is dropped and said. A quotation inside its quote marks, and a phrase the method or the
  standard states, is not a copied stretch.

### Round-1 gaps closed

- **A range is not a dash.** A double hyphen needs a letter on one side to be a dash: "2018--2020", "3 -- 2" and
  "1.2--1.4" are neither counted nor replaced, and the rule-against-the-examples count no longer counts them. A double
  hyphen inside a URL, a path or a class name is a token; the dash repair leaves front matter and quotations as written.
- **A signpost cut never takes a subject.** Only a whole set-off clause is cut: between two commas, or opening the
  sentence with a whole clause after it (by form: two words or more, no comma, colon, semicolon or dash of its own). "The
  short answer, though, is no." is left for the model repair; so is a clause trailing before the stop.
- **Each work field closes at its own tag.** Two fields deliver their insides joined, with the reasoning between them
  outside; a field shown inside a code fence is no field. `invoke --json` carries the record's `work`.
- **Span-by-span acceptance is the step's.** Each span is judged with the graded options the whole pass is judged with,
  and its claim reads are the step's spend: a span the run cannot pay to read is discarded, said so.
- **The voice benchmark reads every arm the same way.** Each output's first paragraph is listed for a person, whatever
  the arm, with the record's field beside it as extra information; "I'm", "I've", "I'd" and "I'll" count as I; copied
  stretches are maximal runs, not overlapping 5-word counts; the README states Node 22 and running from the root after
  `npm run build`.

### The work is what the writer puts in its field, repair answers to the table, and the request's length is a rule

- **Only the work field is delivered.** The writer is asked to put the piece between `<work>` and `</work>`, with anything
  it says about the task outside. Only the inside is delivered and checked; what stood outside is kept on the record
  (`work.outside`). A reply with no field is taken whole, as before, and the record says so (`work.delimited: false`).
  Two tags read as form; nothing is read for meaning.
- **A repair answers only to the rules that can hold the work.** A rewrite is refused only by a rule whose failure would
  hold delivery at the run's latitude (a consequence-table row that sends the work to a person or blocks it). A rule that
  would only label or list it, such as the claim check on a creative skill, no longer undoes the repair of another. Where
  a whole pass would still be refused, each rewritten span is judged alone and only the harmful ones are discarded, named
  on the step. On a creative fixture with three required tells and a rewrite that changed the claim listing, all three
  repairs are now kept (were none).
- **Dashes and set-off signposts are fixed in code where a rule bans them.** A double hyphen typed for a dash counts as a
  dash. Where a rule bans dashes, each is replaced by position: a pair around an aside by commas, a short tail by a comma,
  a long one by a colon, a dash with nothing after it by a full stop. A signposting clause the counted checks already
  report ("To be clear,", "Here's the thing:") is cut with its own punctuation where it stands as a clause; one that
  carries its sentence goes to the model rewrite.
- **The length the request asks for is a rule of the run.** Outside the range after repair, the piece is written again
  once toward it (no second draft), kept only if it lands inside and breaks nothing that could hold the work. The record
  says the length and the range either way ("170 words written, within the 150 to 200 it allows").
- **A rule against what the examples do is said once, and kept as written.** Where a rule the owner amends, or states in
  `atelier skill` with answers kept, forbids or caps something their own pieces measurably do, the build says how often:
  "Your examples use em dashes (—) in 4 of 5 pieces; your rule bans it; kept as you wrote it."
- **A frozen benchmark for posts in an author's voice** (`bench/voice-benchmark/`): an offline audit of an arm's outputs
  against the author's pieces, the material and the brief (opening reasoning from the record, tells by Atelier's own
  counts, rhythm against the author's range, 5-word runs copied, length against the range, points carried), and the judge
  protocol (blind, both orders, frozen prompts) to run elsewhere.

### Delivered is not verified: a consequence table decides what is done with the work, and the owner's rulings requalify the checks

- **Delivery is its own decision.** The record keeps its state (VERIFIED, NEEDS REVIEW, BLOCKED: what was observed) and
  gains `delivery`: SHIP, SHIP_LABELLED, PERSON or BLOCK, with the rows that decided it. It is decided after repair by a
  consequence table, one row per kind of finding (a trusted check fails, an unqualified one fails or finds nothing, a
  judgement rule unread, the qualified taste reader reads a miss, a specific decided absent from the material, one only an
  unmeasured claim reader flagged, a check that could not run, what is only listed, nothing found). The defaults follow the
  latitude; `atelier amend --consequence <finding>=<action>` sets a row, and only the rows the owner set are kept in the
  standard, inside its hash. A standard minted before is held by its latitude's defaults (grounded where it has none). The
  record head and the certificate carry the decision.
- **Every door acts on it.** `run` and `invoke` print shipped work as before, work sent to a person marked for review with
  the entries to read and a line saying where it waits (exit 0), and exit 1 on BLOCK; `--strict` refuses what was not
  shipped. `verify` exits 1 on BLOCK only and shows the decision; the hook exits 2 on BLOCK only, with a note where the
  work goes to a person. A taste reader's qualified miss is in the record and the table decides what it does.
- **The loop runs itself.** `atelier report --pending` lists the runs sent to a person and not yet ruled on. A rating holds
  every written check again at once, and so does every build and `atelier report --requalify`: a run rated yes is one more
  example each check must pass, one rated no with `--rule` one more break its check must catch and the others must not fire
  on. Counting, no model call; what the build already counted is not counted twice. A check that now qualifies is
  enforced, so its failures move from "person" to "repair, then block"; the certificate lists what moved (`requalified`).
- **The run-time readings are closed choices with NONE, NONE to the safe side.** The request's latitude reading answers a
  level or NONE: NONE, a looser answer and a reading that fails all hold the skill's own level. The steps-that-apply
  reading answers HOLDS, DOES_NOT_HOLD or NONE per case: the step applies unless the request's own words lift it. A step
  set aside for the request, a judgement step included, is recorded as set aside and never holds delivery.
- Read offline against the saved records of the 2026-10-22c study under the default table: claims 20 of 20 strict runs
  would go to a person (an unqualified written check failing, x8 in 15 and x5 in 5; the claim reader in 15); labels 1
  blocked, 6 shipped labelled, 13 to a person (the claim reader). Grounded gives the same; creative ships every one labelled.

### A rewrite names what no check read, a label's form is not copying, and a written check reads what it says

- **A repair says which required rules no check read on its rewrite.** A rewrite was already refused when it newly
  broke any rule a check reads, the one it was made for or another, qualified or not. A rule no check reads, or reads
  only in part, cannot refuse one, and no pattern is made up to stand in for it: a kept rewrite now names each such rule
  on its step ("not read on the rewrite by a check, yours to read: x6 (its check does not read "Never speculate")"). A
  rule accepted as unmeasured is not named.
- **The copying check leaves out the form of a JSON output with prose around it.** A label followed by a paragraph was
  read as prose, and its keys and the values every label of its kind carries counted as a lifted passage. The JSON is
  now found where it opens and closes a line (or in a code fence); its keys, and the values the material holds or that
  recur across the examples (in as many as the standard wording asks), are out of the count. The prose around it, and
  free text inside a value, are counted as before.
- **A written check reads what its own words say.** It was recorded as reading its whole step. Its `means` line is now
  read word by word against the step, as any check against its words: in full only where that line accounts for every
  word of the step, otherwise in part, with the part named ("written exactly as the taxonomy writes it"). Words in the
  check's code count for nothing.

### A strict skill can deliver, a method step keeps its authority, and the material has one name

- **One name for a document of the material.** At the build an example's material was named by its path
  (`e01.material/notice-of-loss.txt`) and at a run by its `--with` name, so a citation check written against the
  examples failed every one of them and never qualified. Both now name a file the way a person cites it: its name
  without folder or extension, `-` and `_` read as spaces ("notice of loss"); `--with <name>=<file>` keeps the name
  given, and the material stored with `atelier material` is named the same way. The readings that write and mend a
  check are told the same names.
- **A method step whose written check did not qualify stays the owner's rule.** It was planned as a habit: it neither
  blocked nor sent a run to review. It is now required, its check reports, and a run is left for the owner's review on
  it until the check qualifies or the owner accepts the step as unmeasured. A qualified check enforces, as before.
- **Repair may say a banned judgement with a negation.** A rewrite that takes out a banned word like "suspicious" may
  need "not" to say what is left ("is not contradicted by the documents"). A negation is allowed where it stands in place
  of a banned word the rewrite took out; one added anywhere else is still refused.
- **The hook refuses an event that is not a JSON object** with exit 2 and the reason, as the documentation said; a JSON
  string passed as "nothing to check". The rules it names as not read on an event are every required rule, a step whose
  check has not qualified included.
- **Strict delivery.** An output in which every required rule was read in full and held, nothing is listed, and every
  other rule is accepted or does not apply, is VERIFIED at every level. On a strict skill nothing is accepted by default;
  `--accept-unmeasured <rule,...>`, at the build or with `atelier amend`, accepts the rules the owner names: a judgement
  rule whole, and a rule a check reads only in part (or whose written check has not qualified) for its unread part. The
  record lists each with what its check read and the part accepted, and the certificate lists every accepted rule, a
  partly read one with its part. A rule a qualified or counted check reads in full needs no acceptance, and a name that
  is no rule is said; neither stops the command.

### Studies: the failed pass lines of 10-22b run again ($2.20)

Claims and labels at efa0050, writer `claude-sonnet-5-5`, every call metered, two runs per task; every table and output
is in `bench/runs/2026-10-22c/` (RESULTS.md, report.md). The owner's choice, stated before the runs: on a strict skill
accept as unmeasured the judgement steps and the unread part of a partly read required rule, never a rule a check reads
in full. Accepted: claims x1 (the Summary's "one paragraph"); labels x4, x8, x9, x13, x14, x15, x17 (judgement).

- **Still nothing delivered** (claims 0 of 20, labels 0 of 20). A step whose written check did not qualify is recorded
  as read in full, so the owner's choice does not accept it, and it holds every run: claims x3, x4, x5, x6, x8; labels
  x2, x5, x6, x7, x10, x11, x19. Had those been accepted too, 5 and 6 of 20 would have been delivered; the claims reader
  held the rest. One labels run was blocked by the copying check on the keys and values every Floor label shares.
- **The margin over the model given the same examples holds on claims:** every oracle rule held in 19 of 20 Atelier
  memos against 7 of 20 (+60 points, interval 37 to 83). The examples arm was run again: the served examples of the
  earlier build were not kept, so its prompt could not be shown identical.
- **Repair fixes 2 of 5** (0 of 5 before): the banned words and the uncited fact. The banned-word rewrite says "raises a
  concern that may warrant further verification", the doubt step 6 forbids; that step has no qualified check. Nothing
  else was added, dropped or negated.
- **Hook passes:** an event that is not JSON exits 2 with the reason; the held-out golden exits 0 and names the 4
  required rules it could not read.
- **Planted defects named by their own step with the passage: claims 3 of 5 (2 with the defect's own passage), labels
  2 of 5**, against 3 and 3. Labels step 17 is judgement in this build, and the taxonomy step's qualified check reads
  only the form of a category, so "Violence – scuffle" passes.
- The material-naming fix worked: claims step 2's citation check qualified (9 of 9 examples, 4 of 4 breaking edits).
- Found and not fixed: a qualified check that reads only part of its step is recorded as reading it in full; an
  unqualified written check is "read in full" on the record and "partly read" to `--accept-unmeasured`; the copying
  check blocks a Floor label; repair can swap a banned word for an insinuation.

### Studies: tests A and C after the gap fixes (about $5.90 in all)

Claims, labels and the public `i-have-adhd` skill, writer `claude-sonnet-5-5`, every call metered; every table and output
is in `bench/runs/2026-10-22b/` (RESULTS.md, report.md). Test C read 30 labelled skills five times each.

- **A skill rebuilt from unchanged inputs keeps one standard.** Builds 2 to 5 in the folder of build 1 gave build 1's hash
  on claims and labels, for about a tenth of a cent each. A reworded step changed only that step's requirement (claims
  15 to 15 rules, labels 41 to 41), and the latitude was kept. Built from scratch in five fresh folders, the same inputs
  still gave five hashes on each fixture: every written check is drawn anew, and some steps moved between required,
  judgement and habit.
- **No held-out golden was blocked** (claims e10 and labels e12 both NEEDS REVIEW; labels had 10 of 12 blocked by the
  copying check on 10-21).
- **Planted defects.** The defect's own step named it with its passage in 3 of 5 on claims and 3 of 5 on labels, and
  blocked it in 1 of 5 on each. Not named: the added date and the unaddressed exclusion (claims), "High" without a
  depiction and a category outside the taxonomy (labels).
- **No claims or labels run was delivered.** All 60 ended NEEDS REVIEW: on a strict skill nothing is accepted unmeasured
  by default, and a required step a check reads only in part (the Summary's "one paragraph") can never be. i-have-adhd
  was read as creative work and delivered 30 of 30. The test fails on its delivery line.
- **The margin over the model given the same examples holds on claims, not on labels.** Every oracle rule held in 29 of
  30 Atelier memos against 18 of 30 with the method and the examples the skill serves (36.7 points, interval 18.0 to
  55.3), and 0 of 30 with the method alone. Labels: 30 of 30 against 30 of 30 with the examples, 25 of 30 with the
  method alone.
- **Progress lines.** 2 of 30 i-have-adhd replies carry one, none on a casual or direct question (23 of 30 on 10-21).
- **Repair still fixes nothing** (0 of 5) and changes nothing else: the speculation rewrite was refused for adding a
  negation, and the other four defects had no enforced rule broken in a sentence.
- **Hook.** Exit 2 on the speculation defect in under a second, 0 on the held-out golden with no note: no rule that reads
  material is required in this build.
- **Record head on every output** (110 of 110), and an ERROR head on an unknown skill and on an unknown model.
- **Test C passes:** 30 of 30 cases right in at least 4 of 5 draws (150 of 150 draws), no strict case read creative, for
  under two cents.
- Found and not fixed: material is named by its folder path at build and by its `--with` name at run, so a written
  citation check failed all nine of the owner's examples and never qualified; a method step whose written check did not
  qualify is stored as a habit, so it neither blocks nor sends a run to review; a hook event that is not JSON exits 0.

### A clean run can be verified, a skill built again keeps what the owner decided, and every door says what it did

- **VERIFIED with material bound.** The claim check decides from what it does at the level and the instrument that
  gates (`claimDecides`, cli/eval-run.ts): with material bound, a check that cuts, blocks or flags decides when the pattern
  check or a qualified reader gates, so a run in which every specific was found reads VERIFIED; review only where
  something is listed or open. A creative skill, which only lists, and a run with nothing bound decide nothing. A standard
  minted before latitude existed reads VERIFIED again on a clean run, and its record carries no latitude.
- **A skill built again is decided again.** Building a method again, even from a copied project that took a copy of the
  run, starts its decisions afresh: no rule twice. The owner's latitude and the rules they accepted unmeasured are kept
  (found by the rule's words); a level that only proposed its default gives way to a new level's. `atelier amend
  --measure` moves a rule out of the accepted list when it gains a check, and gives one that loses its check the level's
  default. What each step is (a prohibition or a thing to do) is frozen with its check, so an unchanged method reads
  nothing again and mints the same standard. A step's frozen check is read again once an output is rejected naming it.
- **A skill from rules, built again on the answers kept.** `atelier skill --yes --name <name>` keeps the rules accepted,
  reads only their checks again on the kept answers, replaces the decisions and records why the version changed; `atelier
  rate` prints that command. `--rule` is resolved in the standard the output was made under and kept by its words; a rule
  it does not hold is refused with the ones it does.
- **The owner's cut is a qualified reader's.** Where the pattern check gates (no qualified reader, or one whose read
  failed), an owner-chosen cut falls back to the level's action and nothing is deleted.
- **Repair.** A banned word's hedge may go when the rewrite takes its whole clause out ("and may be a scam"); a hedge
  elsewhere is held. A written check that names the sentences it fails on has them rewritten, and a citation naming a
  document of the bound material is no slot left to fill.
- **What each door says.** `verify --hook` names the required rules it could not read on the event, and blocks nothing
  on their account. `verify --json` lists what blocked the text under `violated`, from the record its state comes from.
  The keys of a JSON output and values the examples share are its form, not a lifted passage. `invoke --json` that stops
  before its record prints `{schema, state: "ERROR", error}`. A written check qualified under the old in-check marker
  keeps its standing.
- **Readings, not word lists.** Whether a composite rule bans is its kind (the polarity reading), never a negative word
  found in it. Every sentence of a method note is a step, beside a list or not: which instruct is the units reading's,
  shown at the build. What a skill is for is read by the intent reading wherever `review` and the composite path ask.
- **Provider.** Calls side by side refused for `thinking: disabled` are each sent again with `between_tools`; a reply
  under `tool_choice: auto` that ends with no tool call is asked for once more; the proposer's token limit grows with the
  corpus (4,000 up to eight pieces, at most 12,000).

### The kind of work sets how strictly output is held, the owner ratifies it, and a check once ratified stays put

- **Latitude, read at the build and ratified by the owner** (`core/observers/latitude.ts`, `cli/latitude.ts`). Every
  skill is held at one of three levels: STRICT (house language; a figure, date or citation not in the bound material
  stops the work), GROUNDED (free within the method; an untraced fact goes to review) and CREATIVE (free composition,
  argument, analogy and marked hypotheticals; an untraced fact is listed for the author, never cut). At every level a
  fact presented as real needs a source. The level is a reading on the house pattern: a small model reads the examples,
  the method and what the skill is for, names a level and quotes the words it stands on; code keeps the answer only
  where a quote is in what it was shown; with no model, or nothing grounded, the level is GROUNDED. It is said in one
  line on the build screen, stored in the standard and inside its hash (it is the owner's), changed with
  `--latitude strict|grounded|creative` at the build or `atelier amend --latitude <level> --reason "<why>"` after.
  A standard minted before it existed hashes as it did and is held as GROUNDED.
- **A request may only tighten the level.** At a run, a reading of the request may hold it stricter than the skill (a
  figure to publish asked of a creative skill), on the request's own quoted words; never looser. The run's level and
  the words that tightened it are on the certificate and the record.
- **The writer is told the level.** One brief builder, three texts, in this request's notes: creative composes freely
  and sources only facts presented as real; strict uses the house language and invents no analogy, hypothetical or
  position; grounded sits between. A standard with no latitude is served as before.
- **What an untraced specific meets is the level's** (`core/loop/claim-extract.ts`, `claimAction`, replacing
  `listsBecause`). Cut only where the owner chose it (`atelier material --cut`), material is bound and the reader is
  qualified on the kind of work. Otherwise STRICT blocks a figure, date or citation code finds missing from the material
  and never cuts it (what only the reader found goes to review), GROUNDED flags for review, CREATIVE lists. With no
  material bound nothing is blocked for being untraced: every specific, and every bracketed citation, is listed as
  unverifiable. The "essay or post with material bound is cut" rule is gone, and with it the kind of work read off the
  method note's title (`kindOfWork`) and the reply form read off the skill's name (`isReplyWork`): the work-form floor is
  now a document, which reads no words.
- **Rules the owner accepts as unmeasured** (`StandardVersion.acceptedUnmeasured`, inside the hash). A rule no check
  reads, accepted by the owner, is listed on the record and the certificate and no longer holds a run at NEEDS REVIEW.
  The level proposes which: CREATIVE accepts every such rule, GROUNDED and STRICT none; shown on the build screen,
  `--unmeasured accept|review` to say otherwise. A listed claim still sends a run to review.
- **A step's check is frozen when the skill is built** (`core/method/freeze.ts`). Keyed by the step's words and the
  examples, a rebuild reuses each check and its qualification and reads only the steps whose wording or examples
  changed; best-of-three draws run only there. Rewording one step changes that step's check and no other.
- **A check that reads the material is not applicable without it** (`core/observers/written.ts`). A written check whose
  body uses its material parameter, run with none bound (a hook event, a verify with no `--with`), is unverified and
  named, never failed: the golden memo no longer blocks a hook. A repair that ends with a rule still broken says which,
  never that every rule holds.
- **Material is not copying.** Wording the bound material supplies (a transcript quoted as evidence) is left out of the
  lifted-passage count.
- **Owner-rejected outputs join the mutants.** `atelier rate <run> no "why" --rule <id>` makes the rejected output an
  edit that breaks that rule: at the next build, a written check for it must catch it to qualify, beside the mutants a
  model wrote.
- **A skill from rules alone says so, and offers drafts.** `atelier skill "<rules>" --yes` with no finished examples
  says its written checks report until qualified, and `atelier skill "<rules>" --draft-examples` has the writer draft
  ten answers, printed whole and kept for the owner to rate (`atelier rate d3 yes|no`). The next `atelier skill` build
  is a new proposal, its written checks read and qualified on the answers kept; a rejected one naming a rule joins that
  rule's mutants.
- **Bench.** The claims oracle's R8 reads the claim file itself: a figure in any material file (a policy number, a
  report reference) is the file's. Each domain keeps one golden held out of every build (`held-out/`), and test 3
  verifies those, never a served example against itself.

### The reading is drawn three times and code keeps the agreement; a check's standing sits beside the standard; one record head, a hook, and the last word pattern gone

- **Best of three draws** (`cli/commands/method.ts`, `stepPlan`, `CHECK_DRAWS`). The step-check reading varies between
  draws: the same four examples read 7, 5 and 7 of 8 steps as checked in three builds, and a written check that passed
  9 of 10 examples in one build passed none in the next. The reading is now drawn three times on a build with a model
  and code decides: a written check that qualifies on the owner's mutants first, then a listed measurement a majority of
  draws named, then a written check that reports only, then judgement. Every written candidate is grounded, a
  non-compiling one sent back once, the best failing one sent back up to twice with the examples it fails; the mutants
  of a step are read once and shared by its candidates. `--report` says, per step, how many draws agreed. A draw count,
  as drafts are: no new reading. The same plan serves `atelier skill`: each stated rule's check is read with the
  proposal (no example to ground on: a measurement where the draws agree, a written check that reports until examples
  exist, judgement otherwise), shown under the rule, and `--yes` asks nothing more; a grounded rule with a measurement
  is required, as a stated step with a check is.
- **What a written check earned is recorded beside the standard, not inside its hash**
  (`StandardVersion.qualifications`, `core/state/canonical-state.ts`). The hash is what the owner ratified; a machine's
  measurement of a check changes nothing they said, so a rebuild that qualifies the same check differently leaves the
  standard's identity where it was. `qualifiedIn(standard, rule)` is the one place the standing is read (the plan, the
  correction from a check, the certificate); the `qualified` parameter on the check is gone; a supersession carries the
  standing of the checks it keeps and drops it for a check that was amended.
- **One record head on every door** (`core/eval/certificate.ts`). `atelier run --json` and `atelier verify --json`
  open with the same six keys: `schema`, `state`, `standardVersionHash`, `skillVersion`, `certificate`, `record`. The
  certificate now names the claim instrument that read the output, whether it gated, and the rates it was measured at on
  the kinds it was measured on, or none: "checked" says no more than the instrument earned.
- **`atelier verify --hook`.** Verify as a Claude Code PostToolUse or Stop hook: the hook JSON on stdin (a written
  file's content, or the file at its path, or the last answer), exit 2 with the broken rules on stderr only where
  something required was seen to fail, which blocks the host and hands the reasons to the model; 0 otherwise, and 0
  with a note when there is nothing to check, because a guard's own failure never blocks the person.
- **The output contract is enforced or declared.** A skill whose rules carry an output shape says in SKILL.md where
  the shape is held (Atelier's runtime, as the response schema) and that a host reading the package as text does not
  hold it, naming the hook and `verify` as what does. The schema file says the same of itself.
- **The last word pattern that read a rule's meaning is gone** (`core/observers/rule-polarity.ts`). A statement the
  polarity reading did not read is a thing to do, in its own words; no list of negative words decides what forbids.
  In the suite the old pattern lives on only as the test double's answer to the reading.
- **A rule written as a numbered heading is a step** (`core/method/standard.ts`, `stepsOf`): `### 3. Keep it short`
  followed by its paragraph is one step with that paragraph; a numbered heading over a list names the list. Form, not
  meaning: the number is what is read.
- **One place for the repair pass count** (`REPAIR_PASSES`, `core/loop/run-repair.ts`): `invoke`, `verify --repair`
  and the blind-reference loop no longer each carry their own `2`.
- **License.** Atelier is source-available: unmodified copies may be used and redistributed, and changes are made only
  by the authors (LICENSE). It was MIT before this change.

### Studies: the acceptance tests on two enterprise domains and one public skill (about $5.90 in all)

Claims memos, brand-safety labels and the public `i-have-adhd` skill, each built three times with `claude-sonnet-5-5`
as the writer and the default readers; every table, count and output is in `bench/runs/2026-10-21/` (RESULTS.md).

- **The build is not yet reproducible.** Three builds from the same inputs gave three standard hashes on every fixture.
  Claims kept 7 of 8 steps in the same column across builds, labels 18 of 20; the step that moved went between a
  written check and judgement. Qualification moved more: on labels 2, 6 and 4 written checks qualified, and no step's
  check qualified in all three builds. Best-of-three draws narrowed the variance, it did not remove it.
- **Planted defects are named more often than they are blocked.** Of five planted defects per domain, the defect's own
  step named it with its passage in 2, 5 and 4 claims builds and 2, 3 and 3 labels builds; it blocked where a counted
  rule or a qualified check held the step: 1, 2, 1 and 0, 1, 2. "High without an explicit depiction" and "a category
  outside the taxonomy" were named in no build.
- **Goldens.** No claims example was blocked (0 of 30 verifies). 30 of 36 labels examples were blocked by the copying
  check: a short JSON label shares a run of more than twelve words with itself. That is a false block of the owner's
  own work, and the test fails on it.
- **Repair is safe and did nothing.** On the five claims defects, `verify --repair` changed no figure, added, dropped or
  negated no sentence, and fixed none: the speculation rewrite was refused for adding a negation, and the other four
  rules were unqualified or omissions. One repair record read "every REQUIRED measured rule now holds" while its state
  was BLOCKED; that sentence is wrong.
- **Grounding on a memo.** An invented figure and an invented citation were both listed with the material bound and
  neither was cut; without material the figure was listed and the citation was not.
- **Record and certificate.** All six head keys on 95 of 95 `run` and `verify --repair` outputs; error bound null with
  its reason on 191 of 191 certificates, each naming the claim instrument and its gate.
- **Hook.** `verify --hook` exits 2 on a planted defect in 0.86 to 0.88 seconds, on a Write event and on a Stop event
  read from a transcript. It also blocks a golden memo: a hook event carries no material, and the qualified citation
  check needs it.
- **Authority.** No standard changed at run time; the hash recomputed from the ratified fields equals each file's name,
  and qualifications sit beside them, outside it.
- **Consistency, 10 tasks by 3 runs.** Claims: every oracle rule held in 29 of 30 Atelier memos against 0 of 30 from the
  model given the method alone (difference 96.7 points, interval 90.2 to 100). Given the method and the examples as well,
  the model held 25 of 30 once the oracle's figure rule is read against the material (the oracle counts the policy
  number as invented): Atelier's margin is 16.7 points, interval 3.3 to 30.0. Labels: 30 of 30 against 24 of 30 with the
  method alone (evidence copied from the transcript), and 30 of 30 for both with the examples. i-have-adhd: the one
  rule code decided differently was "restate where things stand", which the compiled skill met by writing "Step 1 of 1
  done" into replies to "thanks, that solved it" and "what is 17 times 6"; that is not counted as a gain, and the six
  rules no code checks were not scored. Every Atelier run ended NEEDS REVIEW.

### Which check a step asks for is read, not matched: a model names it or writes it, and code holds it

- **The step readers are gone.** A step of a method note was tied to a check by patterns on its wording
  (`core/method/step-readers.ts`, deleted), and every round of testing found a wording they did not know; a real
  SKILL.md handed to `--method` got 0 checks from 26 steps. In their place, one reading on the house pattern
  (`core/method/step-check.ts`, version 1): the model is shown every step, the outline of the owner's examples (every
  example's sections and tables, joined) and the menu of measurements, and answers for each step with a measurement line,
  a check it writes, or judgement; code grounds the answer (the quote must be the step's own words, a measurement must
  parse, validate and run on the example, a written check must compile and run on it) and a step the reading cannot
  ground is judgement. The floor is judgement: with no model set up every stated step is the owner's to judge, and no
  pattern on a step's wording decides a check anywhere. Two readings are held against each other by code: a step the
  rule-polarity reading calls a prohibition keeps no presence or table check, which would require the very thing it
  forbids (`heldByPolarity`). The unit floor (`core/method/decision-units.ts`) reads nothing
  into the words either: an instruction, applying always, until a model reads the condition.
- **A check a model writes** (`core/observers/written.ts`, observer `CHECK`). One JavaScript function over the text,
  the request and the material, run in a context with nothing in it (no `require`, no `process`, no network, no clock)
  under a time limit that holds for every call, and only ever a verdict with the spans it read: a check that throws,
  runs past its limit or returns the wrong shape has not run. Its source is the measurement's own parameter, so the
  standard's hash covers it. It reports and blocks nothing until it is qualified on the owner's examples and their
  mutants (`core/method/mutants.ts`, next): the plan never enforces an unqualified written check.
- **The one-line measurement grammar is one thing** (`core/measurement/spec.ts`), shared by `--measure` and the reading:
  names and terms are kept as the owner or their example wrote them (the observers compare without regard to case), a
  comma inside a list value is the value's own (`starts=In short,|So,`), and `CITED:allow=0` is the ordinary rule.
- **The run's help names what a run does by default**; the instruments under study (structural edits, the typicality
  and detector rounds, the voice pass, planned and sectioned drafting, examples-first) are listed under `atelier lab`
  and in USAGE with what is known of each, none on the default path.
- Tests: the readers' own expectations became the test double that answers the reading in the suite
  (`tests/fixtures/step-check-stand-in.ts`, compiled beside it for the scripted backend), so every method test now runs
  through the reading's grounding and the sandbox with the model stood in; `tests/written-check.test.ts` and
  `tests/step-check.test.ts` hold the sandbox and the grounding; `bench/readings/cases/step-check.json` holds the first
  labelled cases for the live reading (sixteen steps; the pass line stated in the file).
- Not in this change, and said so: `atelier skill
  "<rules>"` still attaches no check; a rule written as a `### n.` heading is still not a step of a note; the
  rule-polarity reading's floor is still a word pattern (`polarityByWords`), the last one on the method path.

### Two standing domains for the enterprise wedge, and a written check sent back once

- **Two domains in `bench/standing/domains/`**, made in code (nothing real): `claims`, ten claims assessment memos to an
  adjuster's eight-step method with their claim files, ten task files, a checker (sections, every fact cited to a
  document of the file, the clause cited and exclusion 7.1 addressed on a theft, the reserve equal to the invoices, the
  cited date the report's date, the banned words, no figure or date the file does not give) and five planted defects;
  `labels`, twelve brand-suitability labels as JSON under a twenty-rule policy and a taxonomy of thirty-nine, with their
  transcripts (a transcript stands in for a clip), twelve tasks, a checker (taxonomy, spans inside the duration, Firearms
  never with Floor, evidence verbatim, overall risk, and the label against the gold label) and five planted errors.
  Every example passes its checker; every planted defect fails on its own rule.
- **A written check that failed is sent back once** (`STEP_CHECK_REPAIR`): a check that did not compile, threw, or
  failed the owner's own example is shown to the reader with the failure, written again, and grounded and qualified like
  the first. The step-check reading's fifth version names arithmetic over the material and the decidable part of a
  compound step as written checks, and says how material files are named; a reader's sub-numbered answers (3, 3b) are
  answers about step 3, the written one preferred. `--report` now prints each step's reading and, where it fell to
  judgement, why.

### Studies: the claims domain built live, and its five planted defects verified (development evidence, about $1.50 in all)

Built five times from the ten memos and the note with `claude-haiku-5-5` reading, as the prompt and the grounding
changed. First build: 2 of 8 steps checked (the sections, the banned words), the rest judgement. Fifth build: **7 of 8
steps checked**, four of them written (every fact cited to a document of the file; the coverage conclusion cites a
clause and each exclusion addressed cites the policy; the reserve equals the invoice amounts in the material; every date,
name and figure in the material), one judgement (no speculation about intent). None of the four written checks
qualified: the citation check passed 9 of 10 examples; the coverage and reserve checks passed 10 of 10 but the one
mutant the reader grounded for each did not break them; the figure check passed 2 of 10 (too strict) and fired on every
other step's mutant. So every written check reports and blocks nothing, which is the design. On the five planted
defects, `atelier verify` offline: the wrong reserve is named by the reserve check ("reserve 2050 does not match invoice
sum 1850") and by the figure checks; the uncited fact by the citation check; the speculation BLOCKED by the banned
words; the wrong date only by the strict figure check; the unaddressed exclusion by no check, which is the judgement
the reader reads under `--taste`. Three more builds after that: mutants asked for one step at a time (four grounded per step where the reader's edits
are verbatim), a check that fails the owner's work sent back twice with the examples named, and a fixture fixed (a fire
claim's memo had cited a police report the file did not hold; the citation check was right). Each build read the steps
differently: 7, 5 and 7 of 8 checked, the coverage and decision steps written in one build and judgement in the next,
and the same step's written check passing 9 of 10 examples in one build and 0 of 10 in the next. **No written check
qualified in any build**, and that is the finding: the reader's one draw is not a standard. Next: draw each written
check several times and keep the one that qualifies best on the examples and the mutants, as a run keeps the best of its
drafts; then the two-domain run.
### The correction a qualified check supplies, and the certificate on every record

- **A figure the check computed may be put in place by code.** The integrity guard refuses any rewrite that moves a
  figure, so a reserve that did not equal the invoices could only be BLOCKED. A written check now supplies the
  correction for a span it flags (`replacement`, the value it computed from the material); once the check is qualified,
  the correction is applied in code in the same step as a grammar correction, the figure allowed to change only inside
  the span the check flagged, and the text re-checked. An unqualified check's correction is shown and never applied.
  Test: `tests/check-correction.test.ts`.
- **Every run's record carries a certificate** (`settings.certificate`): the standard's hash; how many rules are checked,
  by a built-in observer or by a written check, and how many written checks are qualified; what the judgement reader
  has earned (the rules it holds VETO on, the labelled misses so far, the bound on its false blocks); and the
  delivered-error bound, which is null with the reason until an audit sample of the owner's own labels, drawn like the
  work, exists. "Checked" on a record never says more than this block does.

### A written check earns its say on the owner's examples and their mutants

- **Mutant qualification** (`core/method/mutants.ts`). Before a written check may be enforced it must pass every finished
  example the owner gave, catch at least 90% of the edits of the lead example that break only its step (edits a model
  writes as find-and-replace pairs, each grounded to occur once in the piece; one reading for every written check), and
  fire on at most 5% of the edits that break other steps. A check that meets the bars carries `qualified: 1` in its
  measurement, so the standard's hash carries the qualification and the plan may enforce it; one that does not is kept,
  shown with what it caught and missed, and blocks nothing. With no model no edit is written and no written check
  qualifies. Bars stated in the file before any check was read. Test: `tests/step-mutants.test.ts`.

### Atelier as an app, through MCP

- **The MCP server is the front door, not only the checker.** Beside the reading tools (`atelier_verify`, `atelier_rules`,
  `atelier_list_skills`, `atelier_skill_report`) it now serves `atelier_new`, `atelier_run`, `atelier_report`,
  `atelier_rate` and `atelier_fix`: the same commands a person runs at the terminal, in a child process with the server's
  environment (the model key, `ATELIER_DATA`, `ATELIER_PROJECT_DIR`), returning the screen or the whole run record. The
  person still approves the standard: `atelier_new` shows the screen and builds nothing until `approve: true`, which the
  agent may pass only after the person has seen it; `atelier_rate` records the person's ruling, never the agent's.
  `atelier setup` installs it as before. Test: `tests/atelier-mcp-app.test.ts`.

### Studies: the step-check reading on sixteen labelled steps (development evidence, $0.04)

`bench/readings/cases/step-check.json`, `claude-haiku-5-5`, the pass line stated in the file (14 of 16 cases at 4 of 5
runs, and no step labelled judgement given a check). Version 1: 11 of 16, model agreement 34 of 48; the reader said
"written" and left the function out, read "never open with X" as a lexicon, and gave a forbidden section a presence
check. Version 2 (a worked written check in the prompt, place words): 11 of 16. Version 3 (the source field described,
the figure rule named) with the polarity cross-check: **15 of 16 at 5 of 5, model agreement 75 of 80 (0.94, 95% CI
0.86 to 0.98), no judgement step given a check**. The one miss: "every figure must be sourced from the material" is
given a written figure check rather than CITED in every run; it holds the step by code the reader wrote instead of
code Atelier tested, and is reported as a miss. The harness's own overall line reads this as not passed on that case.

### The form is not a fact, the notes are not the work, one folder is one voice, and a reader reads where it can act

- **A key of the examples is the form, never a borrowed fact.** The carry-over signal read `video_id` and `safety_score`,
  which every example assessment carries and a described video never says, as facts of one example's case, and the
  grounding step's rewrite dropped the keys from 22 of 40 delivered assessments (the v6 study). A term the examples hold
  as a key or a column heading is the shape of the work (`formTerms`, read from where the term stands, no list of keys
  kept), and a unit that is structure (a record of keys and values, a table row) is listed and never spliced.
- **The brief is never printed into the work.** A line of this request's notes that the writer put in the draft is
  removed by code before any check reads it, and said; the person's own lines are never touched (`core/loop/echo.ts`).
- **One folder is one voice.** Voices read in the writing are said and recorded, and built apart only with `--voices`;
  declared authors (front matter, a folder per author, `--authors`) are built apart as before. Built as two, a blog of 24
  posts lost its long-form usable rate (75% to 30%, the rc.g2 retest).
- **A reader that can change nothing is not run unasked.** The judgement reader reads by default only on a skill where
  the labels have given it VETO; before that `--taste` runs it and records readings to label, and the run says so in one
  line. The moves' placement and the reading of them on the work run under `--moves observe` or `--moves serve`. On
  short work the readings had doubled the cost per output without changing the text (the v6 study).

### Studies: seven real-user scenarios against five alternatives (external test of rc.g2, about $195)

An independent tester used rc.g2 as a person would: one or two examples and one sentence, `atelier new --accept`,
default settings, no method file; against the bare model, the examples pasted into one chat, Anthropic's skill-creator,
the pasted chat with one self-review pass, and a hand-written skill where one exists. Ten tasks a scenario (twenty for
brand safety), three judge families each picking one output blind and reading every head-to-head pair in both orders.

- **Where it wins.** Market entry from one 4,900-word strategy: the judges' top pick, head to head 17–2 bare, 15–6
  pasted, 16–2 skill-creator, 9–6 self-review; the only arm usable 10 of 10 after edits and closest to the example (65%);
  the pasted arms copied runs of 30 to 36 words of the example into other companies' playbooks, Atelier 12. Competitive
  analysis: most picked, ties the pasted and self-reviewed arms, beats skill-creator 13–6. Against the bare model it wins
  every scenario but brand safety; against the hand-written skills 24–1 and 27–0.
- **Where it loses.** Contracts (0 picks; 91% close and the least copying, but clauses the new situation did not ask
  for), pricing memos (arithmetic and consistency flags, slots left in the memo, 9 of 20 BLOCKED), code review against
  the simple alternatives (3–19 to skill-creator, while 27–0 against the expert's own skill), and brand safety, where
  the grounding step stripped `video_id` and `safety_score` from 22 of 40 assessments whose verdicts were all correct;
  `verify` caught none of 20 planted errors, since a skill built from two JSON examples compiles no schema check.
- **Blog from two liked posts:** tied with the pasted prompt, the most picked by one vote, the closest to the posts; usable
  near zero for every arm. **Cost:** 1.5 to 3 times the pasted prompt per output, about self-review's.
- **The tester's reading, which we accept:** the advantage over the simple alternatives grows with the complexity of the
  example (rank correlation 0.75 on seven scenarios); short one-off work does not need Atelier; strict structured output
  at volume is a second wedge that needs schema, vocabulary, rule-table and timestamp checks compiled from the examples
  and the policy. The three product causes named (keys stripped, the brief in the work, the folder split in two) are the
  entries above; the figure path on numeric memos and the one-example contract are the next two.

### The method, executed: what each step asks, which steps this request needs, and a reader that reports

- **A reading never moves the standard.** The decision units are kept beside the standard version they were read from,
  keyed by requirement id, never inside the requirement: a skill built with a model and one built without read the
  same steps to the same standard hash. (A first cut stored them in the requirement, and a model's reading would have
  minted a new standard.)
- **The need for the method decides the brief, not the word count.** "Review this change" with a diff bound, and "The
  import stalls. Why?" when the intent reading quotes what it asks for, are the method's work; a bare thank-you is not.
  The same need decides whether the judgement reader reads.
- **An unknown is never a silent yes, and a contradiction is never a silent no.** A step the reading could not place is
  said to the writer as held applying, and recorded; a step the request asks against in so many words is surfaced
  ("the request says …, which is against step n: my method stands") and never set aside; set-aside needs the request's
  own words. The record carries applying, set aside, unresolved, unsupported and contradicted apart.
- **A heading's condition scopes the steps under it**, by the words (the floor) and by the reading; a line that opens as an
  example or a table row is a template, one that opens by giving a reason an explanation, and either stays a requirement
  with its kind shown.
- **An approved term is not approved evidence.** The method's terms may be named; whether this person's stall is the
  OCR pass is a decision, and the brief marks it unsupported when nothing given supports it, so the writer is told to
  say what is missing and decide nothing. The count bands of short pieces (longest sentence, counts) widen as the
  length bands do: never narrower than a quarter of the largest value.

- **What each step asks the writer to decide, read once at build.** A method note is not seventy flat rules. Each step
  the owner stated is compiled for execution beside the step: its kind (an instruction, a template example, an
  explanation, a criterion), the decision it asks for, what it consults, when it applies in the step's own words, what
  it puts in the work, what changes the default, and which steps come first. Read by the context reader, grounded step
  by step (a quote or condition not in the step's words drops that unit to the floor: an instruction, applying always
  unless its words say when). Never a requirement of its own and never a weight: the standard is the same with the
  reading as without it. Said in the whole account.
- **The execution brief, before the draft.** For each request, which stated steps apply: a step with no condition
  applies by code and is never read; a conditional one is read against the request and its material, and set aside
  only on the request's own words; one the reading could not place applies. The writer gets step numbers and one line
  each after the cached skill: what applies, what is set aside and why, the decisions in dependency order, what was
  given, and which decisions nothing given supports, to be left open rather than invented. A set-aside step is withheld
  by name and marked set aside in the evaluation, where a required one keeps the run at NEEDS REVIEW. A short request
  gets no brief. `--no-brief` leaves it out.
- **The judgement reader reports by default, bounded.** Wherever a model can be reached, the delivered text is read
  against every rule no count checks, in reporting mode: what it finds is shown, counted toward the labels that earn
  it a say, and never counted as held (a FOLLOWED leaves the rule yours to confirm; only a MISSED where your labels
  gave it VETO fails a rule). Read in batches of twelve rules, each twice, the request's enforced applying steps first;
  a long request makes four reading calls at most by default and says what the cap left unread as not read, never as
  unclear; a short request is not read unless `--taste` asks; `--strict` reads every rule; `--no-taste` turns it off.
  A pass that returns nothing for a rule leaves it not read.
- **The method's terms are approved, never borrowed.** The method note and the standard's statements travel to the
  carry-over signal and grounding as given, so "the OCR pass" of a method about scanned imports is terminology the
  writer may name; a term only the goldens hold still is not.
- **Pieces of one length are not a preference one word wide.** The band read from the author's lengths is the spread
  and never less than a quarter of the longest piece: three replies of 231 characters gave 230 to 232, and a band read
  from a few pieces is descriptive.

### What a build ran, what it lost, and what it was built from

- **A receipt beside every skill version.** What the build read and with what (persona, work form, scope, counted rules,
  author profile, signals, model contrast), each stage ran with its detail or not with its reason, keyed by the version's
  hash and never inside it: two builds that emit the same files are the same version, and the receipt says how each was
  made. `atelier build --report` says the stages in one line; `atelier status --skill <name>` shows them.
- **A lost reading is said with its repair.** A persona lost to a failed call used to be one line in the build log and
  nothing else. It is now recorded as a degraded build, said on the short screen with the command that reads it later
  (`atelier build --name <name> --persona auto`), and shown by `status` until a build repairs it. The build never fails
  for it.
- **A profile of other pieces is never installed.** The project's run folder is shared by every build in that folder, so
  a fidelity profile discovery wrote for one corpus was installed by any later build there (a method, stated rules), for
  pieces it never measured. A profile is installed only for the sealed corpus it names; anything else is set aside as
  `fidelity.stale.json` with the signals, index and calibration written with it, kept, and said. The active pointer
  moves last, after everything the version needs is in place.
- **One owner of what is required.** The standard is the owner's statements, ratifications and amendments; the pieces,
  the counts and a model's readings are evidence. The rules between them are stated in one place and tried
  adversarially: only an owner event adopts or rejects; a rejected item returns only by being presented again; a reading
  raises no evidence and passes no requirement; a provisional range records, a soft one notes, only a binding one
  redrafts or blocks; a step a reading could not place is held as applying. A rule no check measures says so in the
  skill ("Read, not counted"), as a measured one says "Checked".
- **The served examples are framed by the form of the work.** A document's own pieces were served inside a frame
  written for support replies ("a separate, earlier conversation with someone else"). The package now carries the
  form it was compiled for; replies keep their frame, and a document's pieces are framed as the author's whole pieces,
  read for how they are written, their subjects and facts their own. The slot shape (`[link: …]`) leaves the skill: it
  is said in the request's notes only where slots are on, since shown in every skill it was taken as the safe answer.
  The case the frame is for is tested end to end: after goldens about a PDF import, "Thanks, that solved it." gets a
  short reply with no PDF in it.

### The author's own clause survives the trim, and a document writes concretely

- **A cut for length never removes the house's own wording.** Asked to bring a draft under a required cap, the cutter
  was shown the draft alone and named the "includes, without limitation" list that every one of the author's
  contracts carries. A sentence carrying a six-word run the author's pieces share is never cut; the cut falls on what
  else was named. And under a required cap on words, the skill states the span the pieces run as the aim and the cap
  as the limit, without the hedge ("not how long an answer must be") that licensed 10 of 10 drafts to overshoot.
  Told to aim at the span itself (405 to 419 under a cap of 420), the writer still landed at 429 to 452 on 10 of 10:
  a draft lands a few percent longer than it was aimed, so the stated aim ends at least a twentieth under the cap.
- **One frame around your pieces, said positively.** Four separate instructions told the writer what never to take from
  your pieces, and a writer told four times to keep its distance wrote abstractly where you write in links, named
  products, figures and scenes. The skill now says once: write the way these are written, concreteness included; the
  facts come from the request; what the piece needs and the request did not give is written in your shape and marked as
  a slot for you to fill (`[link: …]`, `[product: …]`, `[figure: …]`), said for the run that wants slots. For a document written with no material bound,
  an invented story, source or figure becomes such a slot by default rather than being listed (`--no-placeholders`
  asks for the listing). Where material is bound (a diff, a term sheet) a specific not in it is listed for you, as before: the facts
  are the material's, and a finding is never replaced by a slot. Because the skill's own text shows the slot shape,
  a writer with material bound is told to leave none (one code review named "[person: who owns the shipping policy]"
  as a Must fix).
- **Two false alarms in the verdict.** A six-word run two pieces of a corpus of four or more share is the house's
  wording, not a lifted passage (7 of 10 good contracts were BLOCKED as lifted). And a `path:line` that names a line
  inside the bound diff's hunks traces to the diff: the line number is not written in a diff, so every citation of one
  was called invented, and once a Must fix finding was cut down to "Await it.". This is claim decision 4, a changed
  instrument: until the study that measures it, no shipped claim reader cuts; it reads, lists, and the pattern check
  gates, as for any unmeasured reader.

### What kind of work it is, read from your pieces, not off its name

- **Whether a skill writes replies or documents is read from the examples.** It was read off the skill's name by a word
  pattern: "code review" matched the pattern for replies, and a skill for review documents written under sections was
  served the voice of a chat assistant (state your assumptions, name the check, never shorten) that no example of the
  author's carried. Now code decides where the examples are decisive (every one written under sections is a document),
  a small model reads the examples otherwise and quotes what shows the form in each, code keeps only quotes that are in
  the pieces and takes the majority, and the name decides only when no model is set up. Read once at build, kept with
  the skill, said on the screen with who decided; `--work-form reply|document` says otherwise. A skill from rules you
  state (`atelier skill`) has no examples: its one proposal call reads the form from what you said, and `--yes` asks
  nothing more.
- **One way to read context, evaluated before it decides anything.** Every decision that turns on what words mean (not
  on what can be counted) goes through one mechanism: code where the evidence is decisive, a reader (`claude-haiku-5-5`
  by default; `--context-reader <model>` or `ATELIER_CONTEXT_READER` names another) otherwise, the old word pattern as
  the floor, and the record says which. Each reading has labelled cases in `bench/readings/` run several times each,
  with the pass line stated before the run (`node bench/readings/run.mjs work-form`).
- **Whether a rule forbids or asks is read, not matched.** A rule's kind (a prohibition, repaired by cutting and served
  under what not to do; or a thing to do) was decided by three different word patterns in three places, and a negative
  word inside a positive step ("improvements that do not block the merge") could file it under what not to do. The
  steps you write for a method are read in one call, and a rule added by `fix --always` or `mine` in one; a step the
  reading skipped, or any rule with no model set up, falls to the anchored word pattern. Rules Atelier words from a
  count keep the pattern. Cases: `bench/readings/cases/rule-polarity.json`.
- **What you want the skill for is read from your sentence.** Producing new work, guarding work to a standard, or
  answering people inside a policy (which moves only the default weight of a rule) was read by four word lists and
  their order. The sentence is read once at intake and kept with the run; `--mode` still says it outright; the word
  lists are the floor without a model. Cases: `bench/readings/cases/intent-mode.json`.
- **The context judge reads the request's shape too, on the current small model.** Whether a stated format is a shape
  (code, JSON, a number, one line, a list: the author's presentation rules are withheld) or only strips the wrapping
  ("return only the post": the piece keeps its standard) was a word list on the judge's own answer. The judge says it
  in the same reading; the list stands in only where it did not. The judge runs on the context reader's model
  (`claude-haiku-5-5`), apart from the claim reader, which stays on the model it was qualified on.
- **A reading that the model had made is no longer overruled by the word pattern.** Which moves hold back what was asked
  was `the reading OR the pattern`, so a move the model had read as giving what was asked could still be carried as one
  that holds back. Likewise the request's length and format: a judge that read the request and found none asked was
  overruled by the pattern. The reading decides where it read; the pattern where nothing did.
- **A reader that cannot be reached is asked once.** With a key set for a backend that answers nothing, a build waited
  out the retries of every reading in turn; the first failure now turns the rest of that build's readings off, said once.

### With no method note, the method your pieces follow is read off them

- **Structured work always has a method, and the brief had none to work from without a note.** A contract, a
  report, a price comparison, a code review each take their steps in an order the finished pieces show; without the
  owner's note, every run had no brief (which steps this request needs, what each asks the writer to decide) and the
  author's moves had nothing to link to, on the very work where they matter. Now, with no note, the steps are read
  off the pieces at build (`core/method/infer.ts`): one instruction a step, in the pieces' order, each shown by a
  quote copied from one piece, then what each asks the writer to decide, read as the owner's steps are. Kept beside
  the skill per corpus; read again only when the pieces change.
- **A habit, never a rule.** An inferred step briefs each run as the owner's would ("For this request, my method's
  steps that apply"), said to the writer as "my usual steps, read from my own pieces and not rules I wrote"; none is
  a requirement of the standard, none blocks, none is served in the skill itself, and the run records that its brief
  was inferred. Pieces with no common shape (essays, posts each built their own way) yield none, and the build says
  so; `--no-infer-method` leaves them out; `atelier method <file>` replaces them with the owner's own.

### Examples first: the writer served your pieces, your method and your rules, and no description of you

- **`--examples-first` on a run** serves the writer the author's pieces, the method and every rule, with no
  description of how the author sounds, no repertoire and no move in the brief; the moves are read on the work
  afterwards as they would be and never served, and nothing of the profile authorises a repair. One run's
  choice, recorded on the run (`served: examples-first`); the build, the skill on disk and every other run are
  unchanged. It exists to test one thing: whether the author's own text carries their voice better than a
  description of it does, with the method held by the same checks.

### A figure worked from the figures you gave is yours, by dimension

- **A worked cost is not an invented figure.** A method step "every figure must be sourced from the price list"
  read every worked cost as unsourced: a team's monthly cost (12 × $8 = $96), a rate per head ($350 ÷ 12 =
  $29.17), the gap between two vendors ($350 − $96), a year of it. Ten price analyses in forty runs were blocked by
  it in every arm, and the repair against it removed the worked costs from fifteen outputs whose drafts had them.
  The check now works figures by dimension, chained through the figures the text itself states: money times a
  count is money, money over a count is money per head, money less money is money, a count less a count named as
  one of them is that count, a share is of one thing in the same thing, a year is twelve months of an amount of
  money and only where the words say a year; a span of the calendar ("over twelve months") is no claim. An
  operation is accepted only where the units make the result, at the figure's own precision, and never through an
  intermediate the text does not show: a figure built on a number nobody gave is listed with it, a dose is still
  not an age plus a breathing rate, and past eighty operands nothing is worked. Replayed on the forty outputs: the
  figures the check could not place fell from 15 a draft to 0.1.

### Three things a review found unfinished, finished

- **VERIFIED was unreachable on a method with judgement in it.** A step like "Open with a Summary: two or three
  sentences on what the change does" was checked by code for the part a count holds (a Summary section, with
  something in it) and left for the person on the rest, on every run, however often the taste reader had read the
  rest as followed: 160 runs of one study, none VERIFIED. The reader's reading now enters the record on a rule where the
  owner's labels have earned it VETO (`core/eval/record-build.ts`): read as followed, the rule is established in full by
  a qualified observer; read as missed, it is seen to fail. Without VETO nothing moves, and a rule the owner holds back,
  set aside for the request, or held for missing material is never reached. `verify --taste` carries the same readings.
- **Review prose was failed for describing the change under review.** On an answer the pattern's work claims were cut
  on their own, and on code reviews they read "This change adds a method on the settings" as work the assistant did and
  "a file claiming 500 rows and supplying 3 is accepted" as a result seen: 14 of 34 blocked reviews in one study, every
  one a description of the diff. A pattern's work claim is now cut where the context judge read the sentence as work
  too, and listed for the person where it did not (`core/loop/answer-claims.ts`, `agreedWorkClaims`); with no judge
  the pattern decides alone, as before, and an identifier from the person's system that nothing given shows stays the
  pattern's to cut. Replayed with the judge on those reviews: it agreed on none of the 12 work claims, so all 12 are
  listed and none cut.
- **A skill built from a method and pieces had no author's range.** Only discovery wrote a fidelity profile, so a
  method build had no bands, no release, nothing to choose a draft by or to read an output against. The method path now
  builds the bands from the pieces alone when there are four or more (`cli/commands/method.ts`), installed under the
  pieces' own hash with a first release; the detector and the signals still need model drafts, so every band monitors
  and none steers until a discovery adds them. Anything another build left in the run folder is cleared first, as
  discovery clears it, so a stale profile or signals file is never installed beside it.

### A run spends what its draft needs: the second draft on demand, the claim reader on the text delivered

- **The second draft is written only when the first wants a rival.** A release plans two drafts and kept the better
  by count; both were written up front, so a 5,000-word piece paid for two of them every time. Now the first draft is
  written alone, and the rest only when it breaks a rule the drafts are chosen by at the top of their order (a REQUIRED
  rule, or a rule the taste reader acts on): what a whole second draft could still better, the repair chain fixes at a
  fraction of a draft's price. Drafts the person asks for (`--drafts N`), and drafts sampled or varied to keep the
  author's spread, are all written. The record says what was spared (`selection.spared`), and the build says the plan.
- **A claim reader that only reports reads the delivered text, not every candidate.** Where the pattern check gates (the
  reader is not qualified, or has degraded), the drafts that compete for selection are read by the pattern check alone;
  the reader's warnings are read once, on the text the person gets. A reader that gates reads every candidate, as before.
- **`atelier eval` says what a usable output costs**: the rated runs' spend over the runs you would ship, beside the
  median cost of a run; the figure a release is judged by, since a cheaper run that ships less often is not cheaper.
- Measured on the one long-form run this was built from: writing $0.75 of $1.22 for two drafts of which the first held
  every rule; the claim reader $0.14 on three texts for warnings shown on one.

### How often you make each move, and whether a situation explains it, is measured, never a word

- **No count fixed by hand decides anything about your moves now.** Until today a point of the persona was "always"
  or "sometimes" by the reading's word, a move was general only when seen in three pieces, a quote under three words
  was not evidence, a "not" line had to match a pattern of negation, the persona was asked for twelve to twenty
  points, and what met none of these was unknown and served to no run. Each of those was a number or a category
  someone picked. They are gone. The persona is asked for as many points as the pieces show. Every verbatim quote is
  kept at any length; whether it shows the move is the reading's judgement, measured by its eval, never a word count.
  The "not" line is kept as read.
- **Every habit is counted against every piece.** After the first reading, a second (`persona-table`) is asked, for
  each habit and each piece the first left, for one verbatim passage making the move and one in its situation, or
  none; the calls are sized by the answer budget and the corpus, never by a fixed number of habits. From the cells:
  in k of n pieces the move is made; where the habit has a situation, a and b pieces in it with and without the move,
  c and d outside.
- **From the counts, a posterior and a decision** (`core/stats/habit.ts`). The rate of a move is θ ~ Beta(k+½, n−k+½),
  the Jeffreys posterior: its mean, a 95% credible interval, and P(θ > ½), the probability the habit holds in most
  pieces. Whether a situation explains a habit is the Bayes factor of two rates (in and out of the situation) against
  one, by closed-form Beta-Binomial marginal likelihoods, with P(θ_in > θ_out) saying which way. The kind is the more
  probable hypothesis: *situational* when two rates beat one and the move is likelier in the situation; else
  *standing* when a majority is more probable than not; else *occasional*. Nothing is unknown: one piece of one has a
  posterior and an interval that says what it knows. Three pieces and forty get the same arithmetic. The only
  constants are the prior, the pivot ½ ("most pieces" means a majority) and equal prior odds between the models.
- **The skill and the record say the count, never the word.** "How I sound" carries what more probably holds in most
  pieces than not, each point "in 11 of 12 pieces [0.66, 0.99]"; the repertoire carries the rest the same way; the
  reading's own word is kept on the profile as what was read and decides nothing. A situational move is placed by
  the brief when its situation is read in the request; a standing one stands; an occasional one is description. The
  budget of moves a piece gets is the sum of the situational moves' posterior means, rounded, never a floor of
  pieces; candidates are ordered by their posterior in the situation. The profile's schema is 2; a run built on the
  earlier schema keeps its profile by the receipt.
- The evals, run on `claude-haiku-5-5`: `persona-moves` v5 52 of 65 runs over 13 cases, two soft (a move whose
  situation is in its own sentence has no second quote to give; a competing-explanation case the reading quotes
  from one or two pieces), one label corrected after the run (a point labelled as standing that the reading gave a
  situation, "when the verdict requests changes", and the pieces bear out: 2 of 2 in, 0 of 3 out). `persona-table`
  v1 took a situation present (input from the query string, unchecked) for the move made, five of five; v2 says the
  situation present is not the move made, and reads 30 of 30. The labels are what code decides from what the
  reading grounds (the trigger's status and the pieces quoted), never a kind.
- **The move reader (v4) reads a supposed situation as absent.** On the piece of the C4 miss, v3 still read the
  speculative attacker ("if any of the three builders reads stamps from request data") as realised, five of five:
  the piece supposed its situation and the reader granted it. v4 says a situation the piece only supposes is not one
  it is in, and that a passage the move's "not" line forbids is misapplied whatever else it does well: 50 of 50 on
  ten cases, the two formerly soft ones included.
- **A profile read by an earlier reading is read again** where a model is there, as one read from changed pieces
  is; with no model, a profile a model read is kept over a floor, and the stage says why.
- **A habit is observed in a passage or over the whole piece, and a counted feature stands in for the quote only
  where it measures the habit.** The first reading now says, per point, whether the move is made in a passage a
  reader could quote or is a property of the whole piece, and, where it names a counted feature, whether the habit
  is that feature present in a piece, absent from it, or only near it. In the first two cases the feature's count
  over each whole piece fills the cell, by code and with no threshold (present is one or more, absent is none), and
  the count is kept; a count that disagrees with a verbatim quote does not measure the habit, so the quotes decide
  and the line says so. A whole-piece habit with no feature is judged over the piece by the table, a passage only
  illustrating. The table is told each habit's modality and that a finding on topic is not the move (v3; four hard
  negatives modelled on real over-counts join its eval, 44 of 50).
- **The evidence of a habit is read by a mid-size model, on an eval labelled by hand from the corpus.** Twelve
  habits of the public code-review corpus (bench/standing/domains/code-review) were labelled piece by piece by a
  person and joined the table reading's eval, with the ambiguous pieces marked soft. On them the small reader
  answered the abstract habits differently from call to call and moved with the prompt's wording (a crisp habit
  every piece shows went from 12 of 12 to none between two wordings); the mid-size reader did not, and its extras
  were the pieces the labeller had marked as borderline. The two evidence readings (each point compiled, every habit
  tabled) run on Sonnet 5.5 by default, a few calls per build; `--evidence-reader` or `ATELIER_EVIDENCE_READER`
  names another, and on another backend they take the context reader. The client takes the `between_tools` form of
  thinking off where the API asks for it, and the price table has the 5.5 models.
- **A counted feature confirms a reading and never adds to it.** A feature absent from every piece (no exclamation
  marks) is consistent with any habit that never raises the temperature and measures none of them; the reading
  linked it to "severity named plainly" and the count made that 12 of 12. Now a piece counts for a measured habit
  only when the reading found the habit in it and the count agrees; the inference carries a version of its own, so
  a profile inferred under an earlier rule is read again.
- Two reads of the real persona on the final instrument agree on the kind of 18 of 20 habits and on the count of 9
  of 20; the counts that move are the abstract habits' (severity named plainly 4 of 12 against 9 of 12). Against the
  small reader's 9 of 20 kinds changed, better and not finished: carrying each cell as a posterior over repeated
  reads is the principled next step, and it multiplies the table's cost by the number of reads.
- **Studied: Anthropic's skill-creator against the author's own posts pasted, on long-form.** Six held-out posts of
  one author, two runs each, judged blind: skill-creator read less like the author on every title (−0.25 [−0.42,
  −0.08] on a 1 to 5 scale, task-paired), invented more and copied 24 six-word runs a post from his writing against
  0.7, since its skill embeds his fragments. The Atelier arms of that pilot were not run to the end: an Atelier run
  on a 5,000-word post costs about four times a plain call (two drafts and the taste reader), and the owner moved the
  larger study elsewhere.
- **Studied (development evidence, both halves).** On the ten C4 code-review tasks, the measured profile served as
  C2 held the method exactly (checklist 17 of 20, the defect first 20 of 20), placed 17 moves of four kinds the judge
  called the right call 16 times, delivered 20 usable pieces with no invention, and read to the blind judge as the
  same author to the same degree as the frozen profile (0.00 [−0.37, 0.37] by task). On ten fresh price-analysis
  tasks with their price lists as material, against the Gate B skill and the pasted method: no likeness gain (−0.20
  [−0.70, 0.17] by task), a loss on structure the judge reads as real (−0.63 [−1.03, −0.27]), the one placed move the
  right call 13 of 13 times, no invention, and every Atelier run in both arms blocked by the owner's step "every
  figure must be sourced from the price list" read as a count: a worked cost is a figure not in the material, a
  product defect in the figure rule and not in the moves. The method-only arm is the ceiling on likeness in both
  domains. The records: `STUDY_2026-10-19_step4.md`, `STUDY_2026-10-19_step5.md` (internal).
- On the real persona of twenty points that C4 ran on, three reads of the same twelve pieces under the small reader gave 9, 16 and 11
  standing moves, 6, 2 and 4 situational, 5, 2 and 5 occasional: nine of twenty kinds changed between two reads on
  identical pieces. The arithmetic is deterministic; the table reading that feeds it is not yet an instrument on
  long pieces with many findings, over-counting abstract habits (a plain finding read as a severity escalation) under
  one prompt and under-counting plain ones (every piece's "Add tests for…" paragraph read as absent) under the next.
  Where a feature measured the habit the count was right and stable (no "we" in any piece; every piece opening
  "This change adds…"). The audit, the cells of each read and an offline replay of the profile through the brief's
  selection are recorded with the study; no judged run uses these builds.

### A review's finding is not a result seen; the reader judges the situation from the piece

- **A cited line is not a figure of progress.** "orders.py:42 — the status is written straight onto the column" carries
  a result word and a number, and the pattern that catches "1.1M rows written" read it as a result the assistant saw,
  blocking nine of twenty reviews in every arm of a study on the grounding gate. A line reference, a number inside a
  name, and a line inside a hunk the material shows are not figures of result now. A real claim of progress still is.
- **The move reader judges the situation from the piece, never from the list.** A move placed for a request and made
  in a piece that is not in its situation (an attacker named for code nothing reaches) read as realised; it is
  misapplied, and the reader is told so. Two case forms join its eval, the listed-but-absent situation and the move
  named without being made; the live run of that eval waits for the next spend.
- On a real persona of twenty points, eleven read "always" and one became general under the old fixed counts: the
  reading quoted most from one or two pieces, so they fell to unknown as uncollected rather than rare. That finding
  led to the table and the measured rates above, which replace the fixed counts outright.

### A run uses the profile its build named; a profile read from pieces that changed is read again

- **A run takes the move profile from the receipt of the version it serves**, never from a lookup by the persona on
  disk, which a later build may have moved to another profile. A version built before profiles were kept has none.
- **A kept profile whose pieces have changed is read again** where a model is there: the profile names each piece by
  the hash of its text, and a build whose readable pieces differ reads the moves anew (the old profile stays on disk
  for the receipt that named it). With no model it is kept, and the stage says how many pieces differ.

### What the work did with your moves, read after the draft and never counted

- **Each move placed or standing for a request is read on the delivered text**, by a small read of its own after the
  draft, apart from the taste reader's, so the reader's coverage of your method's steps is never spent on a move.
  Five outcomes, because presence is not realisation: realised (the piece is in the move's situation and makes the
  move as you make it, with the passage quoted), misapplied (made where it does not fit, or as its own "not" line
  forbids, quoted), missing (the situation is there and the move is not), not applicable (the piece never reaches
  the situation), not read. A sentence that challenges an assumption without saying why it misleads does not realise
  a move whose point is the why.
- **A reading, never a gate.** Nothing redrafts on it, nothing counts it as held; it is said in the run's panel under
  the monitors ("my moves: 1 realised · 0 misapplied · 1 missing · 0 not applicable (observed, not served)"), kept
  with the run as an event, and summed by `atelier eval` per move: in how many runs it was placed, and what the
  pieces did with it. The reader's agreement with a blind judge is a study's to measure before any of it steers.
  `--no-taste` skips it with the taste reader; a short request, which gets no brief, gets no reading.

### Which of your moves this request calls for, read with the brief and recorded

- **Your moves are placed for each request as your steps are, by a reading of their own.** For each situational move
  of the profile (never an occasional one; a standing one stands by itself), a second small read,
  beside the one that places the method's conditional steps, says whether the move's situation is named by this
  request or its material, quoting the words that name it. A move is placed only on such a quote; "does not hold"
  needs none, since not placing is the safe direction; an unresolved move is never placed, the reverse of a step,
  because a move steers and a step binds. The read runs only on a request that has a conditional move, and costs a
  fraction of a cent.
- **Which placed moves one piece gets is decided by code, in this order:** not at a step set aside for this request;
  shown in two of your pieces at least; one move per scope at a step; within your own rate (about as many such moves
  as your pieces carry, the better-evidenced first, frequency only breaking ties, so a rare move the request calls for
  outranks a frequent one it does not). Zero is an ordinary result, and a short request gets none, by the same need
  that withholds the brief. A general move stands by itself: it is how you always are, served in the skill already,
  and is never said again in the brief.
- **Observed by default, served by your word.** Under `observe` the selection is read, made and recorded with the run
  (the profile it came from, what was placed, what was not and why, what was unresolved) and the writer is served
  nothing of it. Under `serve` (`--moves serve` on a run, or `moves: serve` in the skill's release settings) the placed
  moves are said to the writer after the steps: "How I would make this, as myself: at step 1: where input is
  untrusted: one sentence from the abusive caller, as in "…" (3 of 12 of my pieces). Not: never an attacker the diff
  does not expose." The run's report says what was placed and under which mode. The standard is untouched either way.

### Your moves, compiled: when you make each one, and whether that is known

- **Each point of the persona is now compiled for execution, not only described.** A build with a model reads, for
  every point, the situation in which you make the move, how it may show, what it is not, what it governs (a
  wording, a paragraph, the shape of an argument, a decision), the step of your method it realises, and the counted
  feature that measures it where one does. Every claim is grounded in your pieces: each quote must be verbatim in the
  piece it names, and a situation counts as shown only by a second quote from the same piece as the move, because a
  quote proves the move and not why you made it.
- **Whether a move is general, conditional or unknown is decided by code, never by the reading.** General needs a
  habit marked "always" shown in three distinct pieces (or in every piece of a corpus under three, said as
  provisional); conditional needs a situation shown; everything else is unknown, including everything a build
  without a model produces. An unknown move is served to no run as a rule: the no-model floor cannot turn an unknown
  trigger into "always".
- **The profile is immutable and beside the voice.** Named by its content, keyed by the persona it was read from, so a
  rebuild with the same persona reads nothing again; the build receipt names it; the standard and the package are
  the same bytes with and without it. `--report` lists each move with its applicability, its situation and how many
  pieces show it; the stage line says "moves ✓ (20 moves: 9 general, 4 conditional, 7 unknown)". A step link is a
  candidate until you confirm it; a "what it is not" line is guidance, kept only as a negation, never a requirement.
  Which moves fit one request is not yet said to the writer.
- **A profile once written is never overwritten, and names its pieces.** Each profile is kept under its own content
  hash, so the receipt of an earlier build resolves after a later reading replaces what the persona currently has;
  the pieces its evidence names are recorded by the hash of their text, so "piece 3" traces to a file of your corpus.
- **A persona kept from an earlier build is held to your current standard.** A point that describes a move your
  standard has since ruled out (a boundary added, a rule rejected) was dropped only when the persona was first read;
  kept through a rebuild, it came back, and the moves were read from it. It is dropped on every build now, before the
  skill is written and before the moves are read.

### Every move the persona read of you is served, each as what it is

- **A habit of some of your pieces now reaches the writer.** The persona reads every point with how often it holds.
  The skill served only the points that hold in most or all pieces, on the claim that the moves section carried the
  rest; that section lists your standard's rated rules and never read the persona, so every point marked "sometimes"
  or "rarely" reached no writer. On a code-review skill of twelve pieces those were four of twenty points, and the
  four that made the author recognisable: reasoning from the abusive caller where input is untrusted, hedging only
  under real uncertainty, one flat adjective on an awkward name, a side benefit tacked on. The format and register
  the checklist already holds were what survived.
- **Served apart, so a conditional habit never reads as how you always are.** What holds in most or all pieces stays
  under "How I sound", each point with its quote. What you do in some pieces, or rarely, is served under "Moves I make
  in some pieces, not most" as one descriptive line each, the aspect first ("Quiet naming judgements: calls a choice
  awkward in one flat adjective, then proposes a clearer name"), marked "in some pieces" or "rarely", with no quote
  and no instruction: the block says none of these is a rule and no piece of yours carries many of them. Which of
  them fit one request is not yet said to the writer; that is the next step, and the quotes stay in the record.
- **The build says how many of each it read.** The stage line and the whole account give the persona as "20 points
  (11 always, 5 often, 4 sometimes)". A skill built before this serves the points it has once built again.

### How you sound is read on every path that has your pieces

- **A skill built from your method and examples, or from two or three pieces, now carries how you sound.** Those builds
  called no model, so they had no persona (the description of how you write, each point quoted from your pieces with how
  often it holds) and, for work that answers requests, no reading of how much you add beyond what was asked. The skill
  stated "too few of any one kind" about examples that were all of one kind. With a model set up, both are read at
  build; without one, the build is as it was. The persona steers and never blocks, so it needs no held-out pieces, unlike
  a rule. A build from a method still serves every one of your pieces whole: the model reads them, it never chooses
  which are shown.
- **The build says what it read about you, or why it read nothing.** One line for the persona and one for the scope on the
  short screen when a model was there to read, and the one reason you can act on (fewer than three pieces); the others
  (no model set up, `--persona none`) are in `--report`. `--no-model` skips the reading. A skill built before this
  carries no persona until it is built again with `atelier build --name <name> --persona auto`, which keeps its pieces
  served whole.
- **Building a skill again that serves the same files no longer fails.** The record kept beside a package (your voice,
  the pairs, the method) was written with its keys in a different order on a rebuild and refused as a second body under
  one hash. A package is its served files: only files that differ are refused now.
- Evidence: in the three-context study below, every skill that scored last on "sounds like the author" was built on one
  of these paths and had no persona; every skill that tied or won had one.

### Answers grounded in the request in hand

- **Your examples' facts stay in their case.** Every example is served with what it was written from, and the skill
  says once, for every kind of work, that facts in your examples and in your method's examples belong to their case:
  the writer states of the request only what it and its material show, and gives anything else as an assumption or a
  check. The skill's own rules are instructions to the claim check, never evidence: a figure in a rule may be repeated
  as written, and nothing about the request in hand rests on them.
- **A fact borrowed from an example's case is corrected where it stands.** A sentence that states, of your case, a
  distinctive term (an acronym, an identifier, a header, a line of code) that your examples hold and the request never
  names is rewritten to state only what the request gives, or to say it as an assumption. Never deleted: the rewrite is
  kept only when code accepts it (no borrowed fact still stated as fact, nothing new borrowed, its code and links
  unchanged) and the whole text, checked again, breaks no rule that held. Otherwise the sentence stays as written,
  listed for you to check and marked unresolved, and the run says which. A line of code the request names by its first
  word (`Authorization: …` when the request names the Authorization header) is the request's. With a claim reader set
  up, the delivered text is read beside the request and its material, and a cause, a setting or a state of your system
  it states without their support is listed: that reading is not measured, so it never rewrites.
- **Your examples are other conversations.** The served examples are said once to be separate, earlier conversations
  with someone else: nothing in them was said by the person you are answering or is true of their case, and whether an
  example asked first, acted or confirmed first was decided by its own request; for the one in hand, the method and
  that request decide.
- **The skill is sent the same on every request.** It is cached once and read from the cache after. A rule a request
  sets aside (its own length or format) is named after the request instead of cut out of the skill, so one request's
  exceptions no longer cost every other request a fresh cache write. A rule that needs material nobody supplied is
  still left out of the skill, as measured.
- **One reading of a reply.** The situations a reply states and what the request asks for are read in one small-model
  call where they were two, and the text delivered is not read again when it is the one already read.
- **Code is never taken apart.** A link, a hashtag or an emoji inside code is the code's: it is not counted against
  your pieces and is never removed. No repair step empties a code block or removes a URL from code, and a step that
  edits sentences leaves code as it was. A link that is a word of its sentence is left for the rewrite instead of cut
  out of it.
- **What a request needs is read before the first draft.** In the same small call that reads a request's format: what
  it asks for, what the answer turns on that it does not say, something named the assistant could act on itself, and
  an action that cannot be undone, each tied to the request's own words. The writer is told, after the skill and
  uncached and in the request's own words, each line deferring to your method: assume and say so what reasoning can
  settle; for what only a check can settle, give what can be given and name the check; act on what could be found
  directly; confirm before what cannot be undone. Nothing else is required: an example, an alternative or background is
  not a need. Never for a request that names a document to write ("a technical paper", "a post"): a piece of writing
  has no asker to answer, and its form is the author's. No call is added and the cached skill is unchanged.
- **Every part of a request is read after writing too.** A request of more than a line is read for each thing it asks;
  a part left out is listed for you, and under `--strict` the reply is written once more to give it, following the
  method on when to act, confirm first or state an assumption (`--no-coverage` turns this off). A part the reply holds back for one of the method's two reasons, to
  have an action that cannot be undone confirmed first or to ask which target when the request names none, is the
  method's call: it is said, and never written again for. Asking for what it could find itself, or handing the work
  back, is a part left out, and the reply is written again to act. Saying "one" of something ("in one edit") is not a
  figure a draft written again is refused for. Each extra draft is recorded as kept or not, with why.
- **Habits are said as a record.** What your examples never did is said as "in none of my examples (0 of 3)", not as
  a rule never to do it.

### A change to how the skill runs is a candidate until your ratings say otherwise

- `atelier fidelity --next` and `--distill` make a candidate release and leave the active one running: features in
  your range and inventions found are diagnostics, not evidence the answers are better. `atelier invoke --try-release
  <id>` runs a candidate without adopting it.
- `atelier fidelity --promote-release <id> --margin <points>` makes it active only on your own ratings, paired by
  request against the active release it was proposed from: no worse beyond the margin you state (at most 20 points) at
  the lower end of a 95% interval, with no more rules broken or claims invented, and at least ten paired requests.
  Anything short of that leaves it a candidate. `--set` is your own choice and takes effect at once.
- `atelier rate` takes optional reasons from a closed list (necessary part missing, unnecessary extra, wrong, unsafe,
  unsupported claim, asks instead of acting, too long, too short, voice off).

### Studies: the author's moves served, against Gate B, on fresh code-review tasks (development evidence, $12)

Ten code-review tasks no arm had seen, five with a change in the author's adversarial situation (untrusted input);
twenty outputs per arm, the same writer and diff; a blind judge. Arms: Gate B frozen; all frequencies served as
description with the moves observed; the moves served; the moves served and read; the method note with the goldens
pasted.

| | Gate B | described only | served | served and read | method only |
|---|---|---|---|---|---|
| method checklist | 16/20 | 14/20 | 17/20 | 16/20 | 9/20 |
| planted defect cited first | 19/20 | 16/20 | 20/20 | 20/20 | 20/20 |
| usable | 17/20 | 16/20 | 18/20 | 18/20 | 20/20 |
| sounds like the author (1–5) | 4.20 | 4.35 | 4.40 | 4.35 | 4.55 |
| within-task variation (sd) | 0.35 | 0.46 | 0.23 | 0.66 | 0.12 |
| cost per usable output | $0.107 | $0.074 | $0.074 | $0.130 | $0.115 |

Against Gate B, serving the placed moves lost no method adherence, cited the defect first on every output, lifted
fewer runs from the goldens (1 against 4), varied least between runs of one task, and read as more the author's (4.20
to 4.40; by independent task +0.27 with an interval that includes zero). Describing the conditional habits without
placing them read as the author's about as much (+0.30 by task) and cost the method (checklist 14, defect first 16,
usable 16): what placing them adds is the method recovered at that likeness. The gap to the method-only ceiling went
from 0.8 in the last study to 0.15; method-only leads with the defect on every output and fails the method's rules
of form (the exact line, weak citations). The brief placed the adversarial move on every task in that situation and
once on the five others; a blind judge called 15 of the 16 placed moves the right call. The reader agreed with the
judge on 14 of 16 and read the one off-situation placement as realised where the judge saw it made badly: not
qualified to detect misapplication, reporting only. Every run in every arm delivered its text; the blocked verdicts
(9 to 11 of 20 in each Atelier arm, Gate B included) are the claim check reading a review's statements of what the
code does as results seen, a false positive of that check on review prose, to be fixed apart from this work. No
fabricated name, figure or event in 100 outputs. Development evidence on one domain; the documents half is prepared
and not run.

### Studies: the move cases read apart from the brief (development evidence, $0.05)

The move cases were first added to the brief's own reading, and the two could not share a prompt. One sentence in the
system prompt about "the author's own moves" turned a step's supported decision into "unsupported" on every run of a
request that had no move at all; with the sentence moved into the per-request prompt, the model answered a step's case
under the moves' field and seven step cases fell to the floor; a field renamed and a purely structural sentence brought
the first shift back. The brief's reading is back to its text of the day before, byte for byte, and the move cases are
read on their own (`move-cases`), evaluated on five cases, five runs each: placement right on every case from the
first version; the second version sharpens "does not hold" (the request's own words rule the situation out) against
"unresolved" (the request does not say), and refuses a situation that would have to be worked out from figures or
consequences. The compiler's reading (`persona-moves`, version 4) now asks for a trigger a reader could see in a
request, never the author's own judgement ("when the fix costs more than it saves" names no situation): 60 of 65.

### Studies: the reading of your moves, live (development evidence, $0.03)

The reading that compiles each persona point into a move (`persona-moves`) was evaluated on `claude-haiku-5-5`,
twelve cases, five runs each, before it decided anything in a build. The label is the applicability and the trigger
status, both decided by code from what the reading grounds.

- Version 1 (36 of 60): the reading quoted bare verdict lines ("Approve") of pieces where the move was not made as
  evidence of "the verdict carries its reason after a dash", and a habit of two pieces in five came out general in
  two runs of five. The prompt had said what evidence is, not what it is not.
- Version 2 (43 of 60): the prompt says a piece in which the author did not make the move is no evidence, and code
  refused any quote under three words. That refused the one move that is a two-word line by nature, "ends on a terse
  verdict line", on every run.
- Version 3 (56 of 60, pass): the floor yields where the point's own quote is that short, so a short-line move is
  evidenced at its own grain. The one case that still fails is by design and marked so: a move whose situation lives in
  the same sentence as the move ("which also removes the retry" is both the side benefit and the fix that has one)
  grounds to a proposed trigger and stays unknown until you confirm it. The scope the reading gives (sentence,
  paragraph, section, decision) is a judgement that agreed with the case on 51 of 60 runs; it is recorded beside each
  move and used by nothing yet.

### Studies: the readings of Gate B live, and the brief against no brief on code review (development evidence, $4.30)

Two readings were evaluated live on `claude-haiku-5-5`, five runs per case, before either decided anything in a run.

- **What each step asks (method-units)**, 19 steps: version 2 failed (84/95): "Open with a Summary section: two or
  three sentences on what the change does" was read as a template 5/5, the prompt having defined a template as "an
  example of what the work can look like". Version 3 defines a template as text shown as it would appear and an
  instruction as something to do or decide even when it describes what a part holds: 90/95 (CI .88–.98), pass. The one
  case left is soft: "We lead with the riskiest line because reviewers stop reading" is read as an instruction, which a
  stated practice with its reason is. Heading-scoped conditions and templates under headings read 5/5.
- **Which steps this request needs (execution-brief)**, 17 cases: version 1 failed (42/60) on prohibitions with
  exceptions, the reader deciding the step's polarity and getting it backwards ("do not end with sources unless
  asked" was set aside when the request said no references were needed). Version 3 asks only whether the named case
  holds and lets code decide which way a holding case cuts ("when" keeps the step, "unless" lifts it): 50/60, zero
  false set-asides in 60 readings, three soft cases read as unresolved where unresolved is held as applying. Version 4
  added the missing-fact check and failed it the other way: an unresolved case was also named a missing fact, and a
  recommendation from given notes was called unsupported 3/5. Version 5 names a missing fact only where the decision
  cannot be made at all without it, and never on an unresolved case: 60/75, pass; zero false set-asides, one false
  "unsupported" in 25.
- **Why the reading had to pass first.** The brief built on version 3 was run on the ten code-review tasks before
  version 5 existed: it named five of six decisions "unsupported" (the diff "supports" nothing, by that reading) and
  told the writer to decide nothing, so nine verdicts came out as "Comment" with a paragraph of hedging and the
  method's verdict rule failed 9/10, against 7/10 passing with no brief. The reading's eval reproduced the defect in
  miniature, and the fix was measured there for $0.01 before the arm was written again for $1.21.
- **The comparison, code review, ten tasks, same writer (claude-opus-5), same blind judge as before:**

  | | no brief, no reader (Gate A) | brief + reporting reader (Gate B) | method-only prompt |
  |---|---|---|---|
  | method checklist passed | 7/10 | **8/10** | 0/10 |
  | planted defect found (±2 lines) | 10/10 | **10/10** | 4/10 |
  | usable (blind judge) | 8/10 | **9/10** | 9/10 |
  | invented specifics per output | 0.0 | **0.0** | 0.1 |
  | sounds like the author (1–5) | 4.00 | 3.80 [3.4, 4.2] | **4.80** |
  | $ per output / per usable | 0.113 / 0.141 | 0.121 / **0.134** | 0.120 / 0.133 |

  The brief holds every step applying on these requests (one conditional step unresolved, held, on all ten), names no
  missing fact, and the reader reads the one judgement step on each run (three readings held back blind for labels),
  no miss. The method-only prompt writes in the author's voice and reads as usable, and misses the planted defect six
  times in ten while failing the method's citation rules on every output. Atelier executes the method; its style gap
  is the open front. Ten tasks, one run each: development evidence, not a claim of superiority.

### Studies: the same three kinds of work, after the closing fixes (development evidence, about $9)

The three-context study a third time, the Atelier arm rebuilt with the cutter that spares the house's wording, the
one positive frame with slots, and the two verdict fixes; same tasks, writer, material and blind judge as before.

- **Contract: the clause survives, the length does not.** "Includes, without limitation" present 10/10 (from 0/10);
  BLOCKED as lifted 0/10 (from 7/10). But every draft overshot the 420-word cap (429 to 452 words), so the checklist
  fell to 1/10 and 9 were BLOCKED for length: the span-as-aim line told the writer to aim at 405 to 419, and a draft
  lands a few percent over its aim. The aim now ends a twentieth under the cap; that rebuild was not run, the key
  having no credit left.
- **Code review: style up again, usable down.** Sounds-like 3.1 → 3.7 → 3.8 (CI 3.4–4.3); checklist 6/10 → 8/10;
  every planted defect found; invented specifics 0.3. Usable 7/10 → 4/10, on the judge's reading of the content: a
  finding that contradicts itself, line numbers off, four or five Must fix items where the author writes three, and
  one literal slot ("[person: who owns the shipping policy]") in a review with the diff bound, which the no-slot
  line above answers. The paired gap to the hand-written skill stays at −0.56 (0 wins, 5 ties, 4 losses).
- **Blog: unchanged** (2.67; rank 3rd of 4; usable 0/6, every post carrying slots in place of the links and products
  the author names). Counted against the author's own posts per thousand words, Atelier's are the least concrete arm:
  links 1.2 against 14, named products 0 against 18, figures 1.3 against 19, parentheticals 1.2 against 11.7,
  one-sentence paragraphs 1.3 against 7.7, questions 0.7 against 5.7. 4 of 6 were BLOCKED by the model-tells rule on
  genuine tells ("I want to be careful here", "I keep circling back to"). The cause has moved from the frame to the
  claim machinery: a draft that names public products and figures is flagged by a claim reader that does not
  distinguish a public, checkable name from an invented one (next entry), and the writer, shown slots as the safe
  shape, leaves slots.
- **Claim reader, version 4, qualification battery** ([pre-registration and result](studies/CLAIM_READER_V4_QUALIFICATION_PREREGISTRATION.md),
  $7.43): sensitivity 44/44, specificity 9/48. **FAIL.** `claude-haiku-5-5` on the qualified prompt flags idiom,
  rhetorical questions, vague time and public names as unsupported specifics in 39 of 48 clean paraphrases of the
  authors' essays. Nothing changes in what ships: no claim reader cuts, the pattern check gates, the default reader
  stays `claude-haiku-4-5`. The next reader has to tell public from private from invented, and its battery has to
  plant public names as clean controls.

### Studies: the same three kinds of work, after the readings (development evidence, $5.28)

The morning's three-context study, re-run with the Atelier arm rebuilt on this version: same tasks, writer, material and
blind judge; the other arms' outputs are the morning's, and the strongest of them was re-judged in the same session to
measure drift (0.1 at most). What changed in the build: a persona on every path, the form of the work read from the
examples instead of the name, rule polarity and intent read instead of matched.

- **Code review moved.** Sounds-like-the-author 3.1 → 3.7 (95% CI 3.4–4.0); usable 4/10 → 7/10; every planted defect
  found (10/10, from 9); text after the Verdict 3/10 → 0; "what I could not check" notes 7/10 → 0; length 451 → 397
  words. The paired gap to the hand-written skill is −0.56 (CI −1.22 to 0.00; 1 win, 4 ties, 4 losses), from −1.11.
  The checklist slipped 7/10 → 6/10 on summary length, a rule the skill checks only in part.
- **Contract did not move** (4.1 → 4.1; checklist 10/10 both): the loss is in the length trim, which still cuts the
  one clause every example carries. That fix is next.
- **Blog barely moved** (2.5 → 2.7; rank 3rd of 4 both times): the posts are still abstract (no links, no named
  products), though first-person presence doubled. The positive frame around the pieces and concreteness with
  marked slots are next.
- **The readings, live on claude-haiku-5-5, five runs per case:** intent-mode 75/75; rule-polarity 70/80 with two
  cases read the other way every time and relabelled as ambiguous; work-form 21/30 on its first prompt, which read a
  corpus of explainers as replies, and 25/30 on the second (a piece written to a request is a document when it
  addresses no particular person). The claim reader was not re-qualified: the drafts of its last qualification are
  gone, so a fresh battery would be a new population.
- **Not measurable this round:** where outputs sit on the measured feature set. Feature bands exist only for skills
  built on the full discovery path; a skill built from a method, or from fewer than four pieces, has none.

### Studies: three kinds of work, and whether the style result fell since the method work (development evidence)

Three contexts, every arm on the same writer model and the same tasks, scored by the domain's own checklist (code
written before any output), by `atelier verify` as a person sees it, and by one blind judge reading three of the
author's pieces: usable, invented specifics, six style dimensions and "sounds exactly like the author" (1-5).

- **Contract** (rule-heavy, ten term sheets): Atelier and a skill creator's skill both passed the checklist 10 of 10;
  the method page with the examples passed 0 of 10 and the examples pasted 0 of 5 (every one over the word limit). All
  usable, none invented. Sounds like the author: Atelier 4.1, the others 4.8 to 5.0: it dropped the "includes" list and
  the standard-of-care sentence the examples carry, to stay inside the limit. Its own verdict blocked 8 of 10 for
  clauses shared with the examples, which is how house contracts are written. The API refused the bare model's
  drafts 10 of 10 and the pasted arm's 5 of 10 as cyber content.
- **Code review** (structure-heavy, ten diffs, one planted defect each): Atelier passed the checklist 7 of 10 and cited
  the defect within two lines 9 of 10; every other arm passed 0 of 10 and found it 0 to 5 of 10 (lines counted from the
  top of the diff). Sounds like the author: Atelier 3.1 against 4.2 to 4.8, and the judge called 4 of 10 usable against
  9: its reviews ran a third longer, 5 of 10 added a line on what could not be settled from the diff, 3 of 10 added
  text after the verdict, and in one the claim check cut the most serious finding down to "Await it.". Its own
  verdict blocked 7 of 10 for specifics the diff holds.
- **Blog** (creative, three posts read, three held-out titles, two runs each): with three pieces Atelier reads no
  rules and serves the examples. Sounds like the author: a skill creator's skill 4.0, the posts pasted 3.2, Atelier 2.5,
  a bare model 1.3; ranked against the author's real post on the same title, the skill creator's came first 5 of 6,
  Atelier third of four. Atelier invented the fewest specifics (1.7 a post against 7.0 and 3.5); the judge called its
  posts abstract: no links, images, named products or demos, which is how this author writes.
- **Since the method work:** on the technical-paper study, the release before any method work (1.1.0) against this
  build, judged head to head in both orders: 5 to 5. 1.1.0 lost 10 of 10 to the skill creator's skill. The style gap
  predates the method work; the extra notes in code review come from it.

### Studies: one author's style on a new subject, built as a person builds it (development evidence)

The one-article study above was built without a model, so no rule was read and no range measured. Run again as a person
runs the product (a model key set, `atelier new`, the rules accepted as shown, `atelier invoke` with its defaults), and
in two forms. With the one article alone, Atelier proposes no rule read by a model and says to add four pieces or more;
with what a request needs no longer said for a document, it scored 43 and 43 on style and form (37 and 35 before),
against 73 and 77 for a skill creator's skill and 53 and 55 for the article pasted. With nine of the author's articles
(42 rules read and checked on pieces the proposer never saw, 53 measured features, a style detector), every arm built
from the same nine and judged against the same one article: style and form, Atelier 47 and 41, a skill creator's skill
46 and 45, the nine pasted 42 and 35, a bare model 11 and 19; no arm was judged the author in more than one paper in
five. Atelier's lead on style is within chance and its form trails the skill creator's (by 5 points, outside chance);
it invented the fewest specifics (2.4 a paper against 5.0 and 5.3) and used no em dash where the author uses a few.
It cost $0.42 a paper against $0.18 (two drafts). Atelier's own reading of how typical a text is of the author ranked
the bare model's long academic papers highest, so it is not evidence of style on texts this long.

### Studies: the twenty-four fresh requests, all judged, with this release (development evidence)

All 24 requests judged for every arm, each answer alone by three judges. Usable as written: the hand-written method
skill 9 of 24, a skill creator's skill 9, an optimised prompt 11, one example 10, a bare model 9; Atelier 9 with this
release (8 and 9 with the two builds before it). No arm differs from another beyond chance at this size. Atelier still
holds the method (86% of checks) and the author's traits (88%) best, and its cost per usable answer fell to the lowest
of its three builds. What a request needs, read before writing, turned three answers usable (it now says what it would
check first) and two unusable; with it the writer more often assumed a specific (a config key, a database) without
saying it was an assumption, and the judges counted those as invented (.56 per answer against .43).

### Studies: reproducing one technical article's style on a new subject, from that article alone (development evidence)

One published technical article by an engineer, a first-person write-up of the author's own capacity model, as the
only example; no method. Each arm wrote "a technical paper" on another satellite subject five times; each paper was
judged alone, blind, against the example. Style and form closeness (0-100): a skill made with a skill creator 73 and
77, the example pasted into the prompt 53 and 55, Atelier 37 and 35, a bare model 11 and 19. Judged a plausible new
piece by the same author: 80%, 60%, 0% and 0%. Atelier wrote the most accurate papers (technical soundness 4.0 of 5,
the highest) and invented the least: 2.1 fabricated specifics per paper against 4.9 to 7.9, and 0.9 invented
first-hand facts against 3.3 and 4.9 for the two arms that read as the author. Most of the gap is the example's form:
a personal project write-up cannot be reproduced on a new subject without inventing the author's projects, and the
arms judged closest did exactly that. Part is Atelier's own: built from one piece without a model, it had no measured
range to steer toward; it carried none of the example's figures or its walk-through of a model; and what a request
needs, said to the writer, came out in three of five papers as an out-of-voice note on its assumptions.

### Studies: twenty-four fresh requests, where the unusable answers went wrong (development evidence)

Twenty-four requests generated fresh and frozen before any arm answered them, six arms, one answer each, each answer
judged alone by three judges, on the 18 requests judged for every arm. Atelier held the method best (88% of checks) and
the author's traits best (88%), but was judged usable on 5 of 18 against 8 or 9 for the other arms; a build from before
this release scored 8 of 18 on the same requests, and no step of either build accounts for the difference: each wrote a
different first draft. Every one of the 13 unusable answers was already so in its first draft: no step of the loop
touched them (20 of 24 runs took no step at all; the only text any step changed was punctuation). Nine were marked
down for something the request never asked for (a usage example, an alternative), four needed tools no arm had, six
held a writer's factual error, and one stated a fact of the person's setup the request did not give (listed, and
delivered as written). What a reply needs is now read before it is written. Whether the judges' extras are what a person
would want is a question for people's ratings, not the judges'.

### Studies: why unchanged answers scored differently between two judgings (development evidence, $0)

The five arms whose answers did not change were judged twice, in sessions identical but for Atelier's answer (the same
letters in the same order). On those identical answers the three judges changed their "usable" verdict 16% (the
smallest judge), 14% and 4% (the largest) of the time, most often toward unusable; across the three, an arm's majority
verdict changed on 0 to 4 of its 28 answers. The changes do not follow Atelier's: per session, the change in Atelier's
verdict and the mean change in the others' correlate at r = +.13 (permutation p = .27). The drift is the judges'
sampling at their default temperature, mostly the two smaller ones, not the answers being read against each other. Both
readouts are kept; the next comparison judges each answer on its own and takes people's acceptance as its outcome.

### Studies: the carry-over signal, re-measured after the code-span rule (development evidence, $0)

The 2,135 hand-labelled sentences read again with a line of code named by its first word counted as the request's:
the same 7 of 53 unsupported sentences found, the same 7 of the 15 carried from an example, and none of the 2,082
sound ones flagged. In a scripted run the rule removed one false finding (a request naming the Authorization header,
answered with the header line). A capitalised word that is not a name of code or an acronym ("Redis") is not a
distinctive term, so a fact carried in such words is left to the unmeasured reading, which lists it.

### Studies: the fourteen-request comparison, before and after grounding (development evidence)

The same fourteen requests, twice each, the same writer and settings, the same frozen criteria and the same three
blind judges; only Atelier's answers were written again, and every request was judged afresh with all six arms side by
side. The five unchanged arms moved by up to 11 points on "usable" between the two judgings, so a comparison is read
within one judging. Atelier, before → after: statements the judges counted as invented per answer .55 → .26 (now the
fewest of the six; the method alone .45, a skill creator's .76); usable 54% → 68% (level with the method alone and the
skill creator's skill, ahead of the optimised prompt's 61%); method checks followed 90% → 91% and golden traits 89%
(both the highest); run-to-run spread the lowest. Answers judged unusable fell from 13 to 9 of 28. A stated cause the
request did not support and the empty code block are gone. The thank-you that named the subject of an example's case
was still written in both runs, and was listed for the person both times: the instruction did not prevent it. Cost per
usable answer held level ($.033 → $.035) while the cost per run rose 36%: a reading of each delivered text, the reading
of longer requests for what they ask, and four drafts written again for a missed part, two of them not kept.

### Studies: finding a fact carried from an example's case (development evidence, $0)

Fourteen requests, each answered twice by six arms (a bare model, one example, the method alone, a skill made by a
skill creator, a prompt-optimised skill, and Atelier), split into 2,135 sentences and labelled by hand against the
request each answered: 53 state something the request does not support, 15 of them a fact of an example's case. The
term signal finds 7 of the 53, 7 of the 15, and flags none of the 2,082 sound sentences (precision 7/7; plain
hyphenated words and "e.g." are not read as names). Reading word pairs as well found 21 but flagged 60 sound sentences
(precision .26), so only terms are read. Seven findings bound precision only above .65, under the .9 a cut needs, so
the signal lists and never cuts. The other unsupported sentences (a cause or a setting stated in plain
words) are what the situational reading is for; it is not yet measured, and lists only.

### Your method and your examples reach the writer whole

- **The method is served as written.** Its headings, steps in order, exceptions, worked examples and final checks
  reach the writer word for word, first, in the installed skill and in every run. The steps still decide what code
  checks; they no longer decide what the writer is told. A step the method already says is not said twice.
- **Each example once, with the request it answered.** A finished example is served beside the request it was written
  for (`request:` front matter), and never twice. A habit only counted off your pieces is checked, not handed to the
  writer as a card.
- **The task sets the length.** A run writes one draft by default and never chooses between drafts by how near they
  run to your examples. A length learned from your pieces is said as how they ran, and no draft is written again only
  to move toward it; a length or a shape the request states ("one line") is held.
- **Writing skills see whole pieces.** A skill that writes from your pieces serves whole pieces within 8,000 words by
  default; `--pieces excerpts --piece-budget 3000` serves passages from more of them in less.
- **Findings are tied to what you gave.** With material bound, a claim the material does not show is marked where it
  stands as one to verify. A figure in code or in the skill's own rules counts only as written, never as something to
  work a new figure out of.
- **Fewer calls.** With no material bound, specifics are read by the pattern check: a model reading could only list
  them. A short acknowledgement takes one writer call and one small reading of the request.
- **Two or three examples build a skill**, with or without a model set up, and say what is proposed rather than
  checked. The skill's description is your method's own when it has one.

### This release, by area

The release Phase F tests. Each area below is detailed in the sections that follow.

- **Honest results.** One evaluation record per run: VERIFIED, NEEDS REVIEW or BLOCKED, and a mark never says more
  than was checked. Grammar is editorial help that never lowers the verdict; only you make a rule required.
- **Never less than asked.** No repair empties a draft, cuts it below the length the request asks for, or removes what
  a required rule needs; invented claims are cut, never reworded, and a guessed figure is listed for you.
- **Your method and your examples.** A method note becomes rules checked by code where code can hold them; examples
  are served as passages; steered features and their bands are shown on the build screen.
- **Short form.** Tweets and short posts are measured and steered by shape and pooled rates; machine-writing moves the
  author never makes are banned at any length; no tweet length is assumed.
- **Several writers.** Voices are found from the writing, combined by inference, and never asked about; every inferred
  trait steers and never blocks.
- **The repair loop.** One bounded controller, one step record, one acceptance rule for every change to the text.
- **Lengths.** Drafts follow the request's length; a band is kept only where your pieces share a length.
- **The comparison harness.** Every arm on the same model and limits, refused when it would mix arms or overspend;
  scoring counts what was not delivered.

### Fixed: the work is never cut away, and the verdict tells the truth

- **A tweet keeps your voice.** In a skill built from short pieces, a machine-writing move that none of your pieces
  makes is never allowed, at any length: "Shipping beats planning. Every time. No exceptions." now fails a skill whose
  author never writes a run of very short sentences, where before it passed as too short to measure. A run is three
  whole sentences, so the end of a long sentence no longer counts as a short one, and a move you make in any of your
  short pieces stays yours.
- **A guess is never presented as a fact.** With material bound, on a kind of work the claim check was not measured
  on (a code review, a design note), a sentence that states a figure your material does not hold is listed for you to
  check, with or without a word like "according to": "One risk: 95% of callers hit the retry path on line 40" over a
  diff is now listed. Years, line references ("line 40", "L40", "client.ts:12"), numbers inside names, examples and
  suppositions ("if 10% of users...", "say 5 retries"), and figures worked from two of your own are not. Nothing is
  cut.
- **No repair delivers less than was asked for.** A repair step, the cut of a sentence that is only a machine-writing
  move, and the cut of invented claims now keep the work when a removal would leave no text. A repair step that would
  leave under a quarter of the words, take the text below the length the request asks for (or further below it when the
  draft was already short), or leave a required rule too short to check is not kept. A cut aimed at the requested
  length, and a redraft that drops invented claims, may shorten the text deeply, but never to nothing and never below
  the length the request asks for: a 1,300-word draft of a 1,000-word analysis may be cut to 1,050 words, not to 700.
  A flagged claim kept so the text survives stays flagged, and the run fails on it in plain view.
- **Grammar is editorial unless you make it yours.** The grammar check every skill carries lists possible slips, or says
  it was not checked when the checker cannot load, on its own line; it never lowers the run's state. A run that holds
  every rule you set reads VERIFIED with the slips shown beside it. Grammar you wrote into your own method stays
  binding: a check that could not run, or could only list, is never read as passed.
- **Only you make a rule required.** What a skill reads off your examples is a learned preference: it steers drafts and
  chooses between them, and never blocks. Short-form shape bands (no hashtags, one sentence, a length band) are now
  preferences; twenty posts without a hashtag no longer forbid one. Required rules come from your method, your
  confirmation or `--set`, a platform limit you give, and the product's standing rules (no added AI tells, the dash cap).
- **A learned shape band steers, and still never blocks.** Asked for a tweet, a skill built from five tweets that run
  117 to 155 characters delivered a 384-character corporate paragraph as written: its shape bands were listed and did
  nothing. A piece that runs more than 15% past the band your pieces run is now written once more toward the band
  itself, never below its floor (length comes with pace and style, so it is held loosely; one that runs short is never
  padded out), and a hashtag, link or emoji past what your pieces carry is removed in code, with no model call. A
  hashtag that is a word of the sentence ("after #approval.") keeps its word; only tags after the sentence, or on a
  line of their own, go whole, and "#42" or "C#" is no hashtag. Each
  step is on the run's one record under the steering it is, never makes a rule you require worse, never changes the
  verdict, and is off with `--graded none`. The count of sentences, the longest sentence and what a piece opens or
  closes on stay preferences that are listed, never steered.
- **No character limit is assumed for posts on X.** Posts can run from a line to thousands of characters. A limit
  applies only when you give one with `--limit`.
- **A short output keeps the rules that fit it.** Whether a rule read from long pieces applies to a short output is now
  decided rule by rule: a band counted off long pieces does not apply, a shape or rate read from short pieces does,
  and one shape rule no longer turns the reading off for the rest of the standard.
- **A folder of tweets keeps every tweet.** A folder is read as short form when its typical piece is short and none of
  its pieces is long (600 words or more). Tweets from 8 to 60 words, or a long post of a few hundred words beside
  them, are short form, and every one is an example, however short; a folder with a 1,706-word piece among short ones
  is not, and gets no shape band a tweet would.
- **A rewrite is never undone for a sentence it did not touch.** The voice pass and the steering toward your range are
  undone when the text, read again in full, carries a claim flag it did not carry before. The claim reader reads the
  whole text again, and one text read twice can be passed once and flagged once; a new flag now undoes the rewrite
  only when it is on a sentence the rewrite wrote or changed. A flag on a sentence it left as it was is the same in
  the text before the rewrite, so undoing it removed nothing.
- **No length band that means nothing.** When your pieces' longest runs more than four times their shortest, no length
  is offered: the build says your pieces vary too much in length to hold one, and a request that names a length sets
  it. Pieces that agree keep their band.
- **A grammar check never reuses another file's reading.** The kept reading of a text is now keyed on the contents of
  the material bound to it, not on the file names, so new notes under an old name protect their own terms. Wiring or
  reloading the grammar checker starts afresh.

### Added: rulings from a file

- **`atelier ratify --decisions @decisions.json`** reads the rulings from a file. A batch soon runs past 1,024
  characters, and some agent hosts kill a command whose single argument is that long. The JSON inline still works.
  A file that cannot be read stops with its path and writes nothing. The ratify page and the plugin skill now say
  to pass the file.

### Changed: the grammar engine is optional

- **harper.js is an optional dependency.** npm still installs it by default; an install without it builds, runs and
  verifies, the grammar line reads "grammar not checked: harper.js is not installed" with the command that turns it
  on, and the verdict is unchanged. The suite is green without it too: the tests that read text with the real
  engine are skipped with that reason, and run in full wherever it is installed.

### Added: the build names what it steers

- **The build screen lists the features your examples taught.** A new section, "Steered toward your range on every
  draft, never required", names each counted feature that steers drafts, in plain words, with its band, how many of
  your pieces the band was read from, and why it acts: whether you use more or less of it than the model's drafts,
  and in how many of 100 pairs that holds. The build shows the strongest six; `atelier report --skill <name>` lists
  every one. Steering stays on by default.

### Fixed: a comparison cannot mix arms, overspend, or hide thinking

- **One output file is one arm.** The comparison runner writes a manifest beside its output with the first row: the
  tasks, the arm, the skill, the model, the token limit, the placement, the provider settings, steering and grammar. A
  rerun into the same file with any of them changed, a row edited by hand, or rows with no manifest, stop the run with
  nothing written.
- **The runtime arm answers with the harness's writer.** A built skill's runtime settings may not name a model, a
  token limit, a cap or steering. After each run, the model and limit its record names must be the harness's, or the
  run stops and no row is written. Every runtime backend needs a price, an OpenAI-compatible one included, and each run
  is given the cap still left as its own budget; a cap that cannot hold one run stops before anything starts.
- **A runtime arm's file is one version of its skill.** The version `invoke --json` reports is written into the
  manifest and on every row (`skill_version`); a skill rebuilt in place between two sittings stops the resumed run with
  nothing written, where its rows used to be appended under the same arm.
- **One runner writes one output file.** A runner claims its output file (`<out>.lock`) before reading it, so two runners
  started together on one path no longer both pass the manifest check and interleave their rows: the second exits with
  nothing written. A lock left by a killed runner is not taken over; the message names the file to delete.
- **Steering and grammar are on every row.** Each row says whether feature steering was on, read from the run's own
  record, and how the grammar check ran. `--graded none` declares a runtime arm without steering, so its benefit can be
  measured against the default.
- **The preflight catches thinking.** It now stops when an answer held a thinking block, or when the call billed far
  more output tokens than the answer accounts for. `invoke --json` records the token limit and the steering of the run,
  and the thinking blocks its calls were returned (`thinkingBlocks`): a runtime arm's preflight reads those, where it
  used to see only the setting sent, so a backend that thought anyway passed.

### Changed: several voices are combined by inference, and nothing is asked

"Here are nine pieces I like." `atelier new` no longer needs to be told who wrote which piece, and no longer asks what
you like about each or how to settle a clash between them. It finds the voices, infers what is worth taking from each,
builds in one call, and says what it did in one line:

    Combined 3 voices: openings from the first, evidence handling from the second, pace from the third; 2 clashes
    settled by which was more characteristic. Say `atelier fix` to change any of it.

- **The voices are found in the writing** (`core/composite/voices.ts`) when no author is declared. Pieces are compared
  on voice signals such as function-word rates, character runs, punctuation and wording. Layout, format and length do
  not decide authorship; shape can strengthen a split only where the voice signals already agree. Whether a folder
  splits is read against the folder itself rather than a fixed threshold: its strongest cut is compared with the
  strongest cuts of thirty reference folders built from the same pieces with every feature shuffled across them, and a
  split is taken only when it beats every one of them by at least four standard deviations, its voices sit at least
  0.25 apart on comparable pieces, and each voice holds at least 400 words. A piece left alone joins the voice it is
  nearest. On real writers' folders this separates two writers with three or more pieces each and keeps one writer
  whole across topics, formats and lengths; three or more writers may be read as two, and a folder too short to tell
  stays one voice, which are the safe sides. The build says "3 voices found in 9 pieces" with the grouping's
  confidence. Front matter, a folder per author and `--authors` still decide when given, a single declared author
  included.
- **Each voice is read on its own from three vantages**: the two discovery always used, and the effect reading (what
  the writing does to a reader). A rule only the effect reading found is marked so in the record, and said to be not
  yet measured. Two classes join the trait table: figures of speech and imagery, and emotion and effect on the reader.
- **Every rule is weighed** (`core/composite/infer.ts`): how consistently its voice shows it (unseen pieces that show
  it, pieces inside its band, or how many vantages reached it) times how distinctive it is (unlike the other voices,
  and for a counted rule unlike a few plain model drafts on the same topics) times any liking you stated. Each voice's
  most characteristic rules are taken as preferred steering; what every voice shows is applied as preferred method;
  the rest is kept as habits, shown and not instructed. No rule inferred from the pieces can block a draft. A liking
  changes a trait's weight, while only an explicit `--set <id>=required` makes one required.
- **Clashes are settled, never left open** (`core/composite/selection.ts`): the side with the higher weight stands;
  a tie goes to the rule more voices show, then to the voice with more pieces. A pair a model reads as impossible to
  follow together is settled the same way. Both sides never ship. A length named in the request sets the length: no
  voice's length rule is taken, and the skill states no length band of its own.
- **What you say still outranks inference.** A liking in the request ("I love the imagery") or `--admire "<words>"`
  weighs the matching rules up by half; `--set <id>=required` and `atelier fix` work as before. `--conflict` remains
  only as an expert override. The interactive question per author, the composite screen and its open questions are
  gone.
- **The whole table is kept**: the grouping, every rule's weight and why, and every settled clash with its reason are
  stored with the composite (so a rebuild reads them and calls no model), written to the run's
  `composite-inference.json`, and shown by `atelier report --skill <name>`.
- Pinned in `tests/atelier-composite-inferred.test.ts`, `tests/atelier-composite-inferred-journey.test.ts` and
  `tests/atelier-voices-format.test.ts`: ten pieces by five invented voices with no front matter grouped into the five;
  unlabelled folders mixing one writer's essays, short posts, tweets, threads and lists kept as one; invented writers with
  natural variation (one across many topics kept whole, two on the same topics split, a minority writer found); each
  guard of the split decision checked on hand-set values; weights checked against hand-worked values; every inferred trait preferred and
  non-blocking until explicitly made required; a stated liking moving only what it names; clashes settled with their
  reasons; shared rules taken as method; a byte-identical rebuild with no model call; and the same flow with no model
  set up.

### Fixed: a rule a repair left unmeasurable is never said to hold

- The run's detail line said "all now hold" when a repair had shortened the text below what a check can read. It now
  names such rules as not measured on the text delivered, beside those still broken and those that now hold.

### Fixed: what every step is held to

- **No step adds a figure you did not give.** A draft written again around a cut claim kept "Our seals are rated for
  9,000 cycles.", in a reply delivered with nothing listed. Every change to the text, whichever part of the repair
  proposes it, is now refused when it adds a figure (digits, a number in words, a percentage, a sum, a day or a month)
  that neither the text before it, the request nor your material holds; the record names the figure. The draft written
  again for a length or a missing section did this already; the check is now made in one place for every step, and
  that draft's own copy of it is gone.
- **A rule the text became too short to measure is not said to hold.** Cutting an invented claim took a reply from 173
  words to 135; two rules it broke could no longer be measured, and the run printed "c4, x1 held once the draft was
  corrected" and called the work conformant. A rule read on the draft, broken or held, that the delivered text is too
  short to read is now "not measured" on every surface: the run says so in one line, the evaluation shows it
  unverified, the work needs review and is not conformant on its account. A change whose only effect on a broken rule
  is to make it unreadable is not progress, and is not kept for it. A rule that does not apply to the request or the
  format is as before.
- **A cut claim leaves no empty paragraph.** A sentence that was a paragraph of its own goes with its blank line.
- **A structured output written again around an invented claim is a step.** It is now counted on its own record,
  refused when the budget will not hold it, and kept only on the same rule as every other step.
- **No model call outside a step while the repair runs.** The clients a run uses now check each call: inside the
  repair, a call is allowed only inside a step or from one of the readers that only read (the claim reader, the taste
  reader, the structure reader, the subject reader, the reader of what the request asks). Any other call is an error:
  the test suite fails on it, and a run says it on screen and keeps it on its record.
- **Two smaller fixes.** When the budget runs out before the reply is read against the request, the run says so in one line. The
  structural edits' record says how many sentence rewrite calls the step made.

### Changed: two authors' lengths on one measure are always asked

- **Whether two authors' lengths can both be followed is no longer read from their words.** Reading worded lengths
  kept failing on wordings nobody had tried: "Paragraphs shouldn't run over four sentences" read as a floor, "Cite
  three sources per 1,000 words" read as a length, "At least 500 and at most 800 words" read as its second bound only.
  So contradictions shipped and conflicts were invented. Now a rule states a length on the piece, a sentence or a
  paragraph when it names one of them (or words, characters, reading time, a page, a tweet) and carries a number or a
  word such as short, long, brief, under, over, at most or at least. Any two rules from different authors that state
  a length on one measure, either of them in words, are a conflict you answer, whatever the numbers say: neither
  instructs until you choose A, B or both. Two counted bands from the authors' own pieces are still compared by
  their numbers. One author's own rules are still not paired.
- **Each worded side of a length conflict shows how it reads**: `(reads as: 500 to 800 words in the piece)`, or
  `(reads as: unclear)`. The reading only informs your answer. "Both" on two worded lengths keeps both, shown and
  not instructed; it never makes a range from words.
- **The reading itself is better**: "shouldn't", "mustn't", "cut", "split" and "rewrite" before a bound read as a
  ceiling; "25 words per sentence, max", "cap the piece at 500 words", "can be as long as 40 words", "2k words",
  "a 5 min read" and "reading time of four minutes" are read; a unit said once for two bounds is shared; a rate
  ("per 1,000 words", "every 300 words") and a length of something else ("a 50-word bio") are not read as lengths.
- **The open count is every conflict shown open.** A conflict nobody answered was left out of the count when its
  sides were also held open by another conflict, and a line could name its own number ("open in conflict 1"
  under conflict 1). Every unanswered conflict that holds a side open now asks for its own answer and is counted, and
  no line names its own number.

### Fixed: grammar findings said as listed, never as held

- **`verify --repair` no longer says every rule holds when it left a grammar rule unverified.** On a text whose
  only findings were listed, it printed "nothing to repair: every REQUIRED measured rule holds", and `--json` carried
  `repair: null` with no trace of the rule. It now says "nothing changed: N possible slips are listed for you to
  check" and lists them, and `--json` names the rule under `unverified` with its items under `listed`.
- **A space before a comma or a full stop is shown with the words around it**: `"waited , and" (a space before a
  comma)`, where it read `"" (a space before a comma: "" → "(removed)")`.
- **The docs say what is listed and what is never flagged.** A name the checker knows is not flagged; any other
  capitalised word is listed as "a name, an acronym or a coined word", and your own terms and a word used three times
  are listed as yours, never changed. The help, the README and the measured-rules page now also say that under
  `--fix-grammar` a slip whose fix another of your rules refuses stays in the text and the rule reads broken, which can
  block the work; the sentence about a rewrite for an error with no sure correction is gone, as no such step exists.

### Fixed: every change to the text is one counted step, held to the one acceptance rule

- **Five parts of the repair changed the text or called the model beside the step record.** The reply written again
  to give a part of the request it left out (`--strict`), the structural edits (`--edits`, `--fidelity`), the voice
  pass, the rewrite the taste reader asks for, and the draft written again around an invented claim whose cut would
  leave a fragment. A `--strict` run took eight steps under a limit of four, its record showed five and left out the
  first draft's; a structural edit was kept after "the controller took its 4 steps". Each is now one step on the run's
  one record: counted against the limit, entered before it runs, refused and recorded as refused when the limit or the
  budget will not hold it, and kept only if no rule you require is newly broken or further out by its value (read
  with each rule's own direction), besides its own checks. The reply written again under `--strict` is refined on the
  same record, so its steps count with the first draft's. The calls a record shows are now the calls the model
  answered for the repair.
- **One way through.** Every step, whichever part of the repair proposes it, now goes through one helper that asks the
  record, enters the step, runs it, judges it and settles it; the run alone makes the record, and no part of the repair
  makes one of its own. A test composes the whole repair chain with every part proposing a change and checks the
  record against the calls made and the text delivered; another fails if a model call or a new record appears in the
  chain anywhere else.
- **The record says what happened.** A step the budget refused when the controller chose is recorded as refused. A
  step taken on a draft written again that was then not kept says which draft it was taken on. "After the smaller
  steps that followed, …" is said only when a step followed.

### Fixed: a length said in words is read one way, and two rules are compared as ranges

- **One reading for a quantity said in words.** A composite read the numbers in its authors' rules with a handful of
  patterns, so most wordings were missed: "about 300 words", "under 2,000 characters", "at least eight hundred words",
  "a five-minute read", "roughly 1,200 words", "under three minutes of reading". Rules that cannot all be followed
  were shipped side by side. Each rule is now read into a range on what it measures (the piece, each sentence or each
  paragraph) by one grammar: numbers in digits or in words of any size; "at most", "no more than", "under", "up to",
  "within" as ceilings; "at least", "over", "more than", "minimum" as floors; a negation turns a comparator round
  ("never a sentence over 15 words" is a ceiling of 15); "N to M", "N-M", "between N and M"; "about", "around",
  "roughly", or a size said plainly, as a fifth either side; "a single sentence" and "a sentence or two". Characters
  count six to a word, a minute of reading 230 words. Two rules conflict only when their ranges do not meet: of 35
  pairs written to test it, 24 were judged wrong before and all 35 are right now. "No more than 1,000 words" was read
  as a floor of 1,001 and put in conflict with "over 900 words"; it is a ceiling. A length said in words is classed as
  a count of it is (structure for the piece, pace for a sentence or a paragraph), no longer as a recurring move.
- **Two ceilings never conflict.** "A median under 5 words" against "a median under 40", or "at most 22 hedging words
  per thousand" against "at most 2", were shown as conflicts to answer, though a piece under the lower ceiling meets
  both. Two counted rules on one measure now conflict only when their ranges do not meet: a floor above the other's
  ceiling, or two bands with no overlap.
- **The model reads the numbers too, and a rule read two ways is never resolved by choosing.** When a model is set up,
  the one reading of the final instructions also returns each rule's quantity as a range. Where it and the grammar
  disagree, the screen says the rule is "read two ways", and the rule is held against any rule either reading
  conflicts with: such a pair is asked, and neither side instructs until you answer. The reading is kept with the run;
  a rebuild asks nothing.
- **No length band where the length is left open.** When the authors' rules on the piece's length sit in a conflict
  nobody answered, the skill no longer states a length read from the authors' usual pieces.
- **"both (one range)" is offered only where the two make one range** (two counted bands on one count). For two
  statements the screen offers "both", which keeps them shown and not instructed.

### Fixed: one acceptance rule, one step record and one hand-off for every repair step

- **A rule you require is never delivered worse by its value.** Every replacement of the text (a span rewrite, a
  carrier rewrite, re-punctuation, a fix without a model, a cut for length, a draft written again for a rule, for the
  features or for both, a shape round, a reply written again to cover the request) is now judged by one rule: no rule
  you require newly broken, and none already broken further out by its measured value on the text as it is (a rate
  past its ceiling or under its floor, a count, a length, a band distance). The count of places is read only for a
  rule that carries no value. A draft written again for the features was kept with the hedge rate at 10 per 1,000
  words where the first draft had 9, in the same three places; a draft written again for a length and the features
  was kept with twice the semicolons of a ban. Both are now not kept, and the line says which rule.
- **A step for a rule must move that rule.** A rewrite, a fix without a model or a draft written again for rules you
  require is kept only if at least one of those rules is nearer holding. A fix without a model is recorded against the
  rules it changed, and only those.
- **One step record a run.** Every repair step is entered on one record before it runs; the step limit and the
  budget are read from it alone, and a step they would not hold is recorded as refused. A draft written again that was
  not kept, and the earlier draft refined again after it, used to count apart: runs took five and six steps under a
  limit of four. They now share the record, and the limit holds. Under `--until-typical` each round keeps its own.
- **A draft handed over is told exactly what it was handed.** A rule no single sentence carries (a floor rate) is told
  with where the draft stands ("your pieces use at least 22.5 per 1,000 words; this draft has 17.4"); a draft is never
  written again with nothing named; the line said afterwards names those rules, not other misses. Under
  `--until-typical` each such line names its round.

### Changed: grammar findings are listed, never changed, unless you pass --fix-grammar

- **By default the grammar check changes nothing.** Even the narrow in-place set (a or an, two commas, a space before
  "." or ",", "he/she/I are", a list of known misspellings) changed 62 of 150 sentences written to be right as they
  stand: letter names ("plan a", "vitamin a"), compound subjects ("Both he and she are"), shell arguments
  ("git add ."), a URL or path before a full stop, spaced poetry, a word quoted rather than used ("students write
  recieve when they mean receive"), config keys, CSS classes, lower-case names, other languages. Every finding is now
  listed with its text and the checker's note on the run, in `report`, in `verify` and in `--json`, and no model
  rewrite is made for one. The repair loop has no grammar step by default.
- **A finding never blocks.** With findings, the rule reads "listed for you to check: N possible slips" and is
  unverified, so the run reads NEEDS REVIEW, never VERIFIED or BLOCKED. With none, the rule is met. A checker that
  is off or did not load still reads as not checked.
- **`--fix-grammar` on `run`, `invoke` and `verify`** applies the in-place set exactly as before. Its help says the
  risk plainly: it may change words that are right in context (letter names, code, quoted examples), so read the
  changes. Each change is now recorded by what it was and what it became (`"are" → "is"`) and shown with the run.
- **Eight entries left the misspelling list** ("wiht", "personell", "collegue", "equipement", "congradulations",
  "playwrite", "mischievious", "comming"): each can be meant or met as written, or has no certain correction. The
  list now holds 444 and is used only under `--fix-grammar`.
- Tests: `tests/atelier-grammar-listonly.test.ts` runs 150 sentences with a legitimate reading and 10 real slips
  through the default path in all three dialect settings (no change, every finding listed), a run with a slip (NEEDS
  REVIEW, text unchanged), a clean run (rule met) and `--fix-grammar` (each change recorded). The tests of the
  in-place set now switch the flag on for what they check.

### Fixed: two worded rules on one quantity are compared as ranges, and the screen counts what it asks

- **Worded against worded, as ranges.** "Keep the whole piece under 300 words.", "Write at least 800 words." and "Keep
  the piece between 400 and 600 words." from three authors all instructed at once: two worded rules were compared by
  their words, never by their numbers. Now piece length, sentence length, paragraph length, headings and lists are read
  as ranges from both statements, exactly as a worded rule is read against a count: ranges that do not meet conflict
  ("under ten words" against "sentences of about thirty words", "a single sentence" against "at least six sentences",
  "never more than eight words in a sentence" against "thirty words or more"); ranges that overlap leave room for both.
- **Two ceilings never conflict.** "Keep paragraphs to at most six sentences" against "I keep paragraphs to 3 sentences
  at most" was a conflict, though a paragraph of three meets both; so was a worded sentence cap against a shorter
  counted one. Both now instruct. A floor above a ceiling is still a conflict, now without a tolerance between them.
- **A pair asked is held open on both sides.** When one rule of a pair the model read as contradicting was already
  held open by another pair, the other side instructed, and the screen credited it to an answer given to a different
  conflict or printed an empty reason ("→ sol ()"). Now neither side instructs, the answer that chose it is said to be
  open again, and no line prints an empty reason.
- **The count of open questions is the number the screen shows open.** With five authors the screen showed six
  conflicts open or open again and the closing line said four; with `--set`, one shown open was counted as three. The
  count is now read from the same standing as each conflict's line.
- **An answer after the build is said, not dropped.** `atelier new <folder> --accept --conflict 9=B` on a skill already
  built changed nothing and said nothing. It now says the answer was not applied and gives the commands that rebuild
  with every answer.
- **The keyword-only line says what it misses.** With no model to read the final instructions, the screen now adds
  that a whole-piece structure rule (one unbroken block of prose) may still sit beside a structure it rules out
  (headings or lists), so the person reads them.

### Fixed: a composite's instructions never contradict, by any route, and the screen says what will ship

- **`--set <id>=required` goes through the same final check.** A rule made required with `--set` used to bypass it:
  answering the headings conflict for "Use headings to break up the piece." and then `--set` on "Write in continuous
  prose with no headings and no lists." shipped both. Now the rule made required is the person's latest word: it
  stands, the rule it contradicts is set aside even when an earlier answer chose it, and the screen says so in one
  line. Two rules both made required that contradict are an open question; neither ships until it is answered.
- **A worded quantity is compared with a counted band.** "Write long, winding sentences of thirty words or more"
  against "a median under 6 words", or against a "both" range whose median is under 23, is a conflict; so is "Write
  long sentences" where nine in ten sentences are under 7 words, "Let a paragraph run long" under a cap of two
  sentences, "Keep it under 500 words" against a piece of at least 800, and asking for headings or lists where the
  count allows none (or banning them where it requires some). Only a plain non-overlap counts: a band that leaves
  room for what the words ask is not a conflict.
- **A ban on a subject covers its kinds.** "Never use lists of any kind" conflicts with "Use bullet lists" and "Use
  numbered lists"; "Never use headings" with subheadings; quotes with block quotes; examples with worked examples. A
  ban on one kind leaves the others ("Never use subheadings" does not conflict with "Use headings").
- **A model reads the final instructions once.** With a model set up, after the check above, the rules that will
  instruct (a range at its merged limits) are given to it numbered, each with its author, and it names every pair that
  cannot both be followed in one piece, with a one-line reason quoting both. Every pair you did not answer "both" is an
  open question on the screen, marked "read by the model at build": neither side instructs until you answer it. It
  never settles a conflict and never touches how an output is judged. One call per list of instructions, on its own
  ledger line (`composite contradictions`), kept with the run, so a continuation with the same list and every rebuild
  call nothing. With no model the screen says: "Contradictions between authors are checked by keyword only; read the
  instructions below."
- **An answer the check opens again says why, and is counted.** When what an answer chose cannot instruct beside
  another rule and nothing you said decides between them, that conflict reads "open again: your answer "both" would
  ship two instructions that cannot both be followed: …", names the conflict to answer, and is counted among the
  open questions. The record, the count and the screen agree on every conflict.
- **A "both" range is shown at its merged limits**, the limits it is built and checked with, not its carrier's own.
- Smaller: "Paragraphs must not run beyond four sentences" and "Never let a paragraph exceed five sentences" are now
  read as ceilings on every paragraph (the labelled corpus gains both, and no step it held is read differently); a
  conflict on grammatical person is labelled "person"; "focus" and "quizzes" are read as "focus" and "quiz".

### Fixed: the grammar rule no longer changes a dialect, a code path or a language mixed in

Under the rule that text is changed in place only where an error has no legitimate reading in any variety or register,
these are now listed for you to read instead of changed:

- **"a" or "an"** before a word read as letters ("an nda", "a usb stick", "an mri", "an sms", "an led"), before a "u"
  whose sound the checker guesses ("a unanimous", "an urchin"), and before any word the checker does not know. It is
  still corrected before a lower-case common English word the checker knows ("a essay", "an new bike").
- **Punctuation typed twice**: "::" ("std::vector", "Vec::new"), ".." ("hmm.. not sure"), ";;", "!!" and "??". Two
  commas after a word are still corrected.
- **A space before "!", "?", ":" or ";"** (French and typographic spacing: "Bonjour !", "Q : Where"). A space before a
  comma or a full stop is still corrected, and a quotation in « », ‹ ›, » « or „ “ is never read.
- **Agreement a dialect uses**: "they was", "we was", "you was", "they is", "I has", "he go", "she have", "it have".
  Only "he are", "she are" and "I are", which no variety uses, are corrected.
- **Known misspellings**: 23 entries left the list because each is a word somewhere: of a trade ("stoped"), of a
  language often mixed with English ("posible", "dilema", "assistent", "correspondance", "adress", "agression",
  "paralel"), or an older spelling still met in print ("untill", "independant", "priviledge", "developement",
  "peculier"). The list now holds 452.

### Fixed: steering never undoes what your rules hold

- **A draft written again for your usual features alone keeps what a rule you require holds.** It was kept when it
  broke no new required rule, even if it took one already broken further from holding: a ceiling of 5 asides per
  1,000 words, brought nearer by two span rewrites, was delivered further out than before. Such a draft is now kept
  only if no rule you require is newly broken and none already broken is further out, read on each text as it is,
  by the same judgement every repair step is held to. One that would undo that work is recorded as not kept, with
  the rule it would have moved.
- **Each step is said as what it was.** A cut for length is said as a cut ("Cut for length: …", "the cut did not do
  better"), never as a draft written again. A repair the budget stopped names the step it could not pay for (the
  redraft, not "the rewrite"). A rule fixed without a model is credited to what was done ("m2 fixed without a model:
  long paragraphs split"), not to span rewriting. A shape round the budget skipped under `--until-typical` is said on
  screen in one line.

### Fixed: every repair step of a run is counted once

- **One step counter per run.** The controller counted its own steps, while a draft that only ran long was cut, and a
  draft was written again, beside it: a run could take five steps while its record said it took its four. A cut
  ("trim") and a draft written again ("redraft") are now steps like any other: recorded with what the ledger charged,
  priced from what the run has paid, and taken only while the step limit (four a run by default) and the budget hold
  them. When either runs out the stop says which, and what was not taken.
- **Shape rounds have their own limit, and all of it is recorded.** Under `--until-typical` each round is a draft
  attempt with a step limit of its own; every round's steps are kept under `repair.controller.rounds`, the rounds not
  kept among them. A later round is told only what the controller would act on: every rule you require, and of your
  usual features only those more than half a band width out, at most three, the furthest first.
- **A feature rule you require is yours, not a habit.** A REQUIRED feature rule (one added with `atelier add`, say) is
  no longer graded: its carrier sentences are rewritten through the controller as for any rule you require, and it
  is never written again as an item "the method requires".
- **A budget stop is said even when free steps followed.** When the budget refused a rewrite and re-punctuation then
  ran, the run now says the budget stopped the rewrite.
- **A ban broken is "broken", not "missing".** The method line says `(broken: x1)` for a broken ban and keeps
  "missing" for what was left out.
- Smaller: a step down after a draft written again that moved nothing says "moved nothing"; `atelier fidelity`
  says the step limit is per run; the skill card states the copying limit runs use; the benchmark keeps each item's
  final state (BLOCKED or not) with it.

### Fixed: grammar changes text only where an error has no legitimate reading

- **One rule for what is changed in place.** Grammar now changes text only where the error has no legitimate reading in
  any major English variety or register; anything with a plausible reading is listed, never changed. On a set of 150
  sentences (120 correct, 30 with errors), 12 correct sentences were rewritten before in every dialect setting; none
  is now. 25 of the 30 errors are still fixed in place; 4 more are listed (an engine miss stays a miss).
- **Capitalised words are never changed.** A known misspelling with a capital is listed wherever it stands, a
  sentence's start included: "Wellcome Collection", "Pharoah Sanders", "Grammer", "Untill Then", "Teh Hong Piow". So
  "Thsi is" and "Tommorow we ship" are listed too, no longer fixed.
- **The misspelling list, audited.** 44 entries with a legitimate reading are gone: "teh" (tea in Malay and Singapore
  English), "calender" (a real word), "embarras" (French), "wich" (a spelling of "wych"), the listed variants
  "supercede", "publically", "accidently", "incidently", "dumbell" and "existant", the contractions typed without an
  apostrophe ("dont", "thats", "youre", "theres" and 25 more), the names "Wellcome", "Pharoah", "Grammer" and
  "Sergent", and one entry that corrected to itself. 475 remain.
- **A word said twice is listed, never collapsed**: "had had", "that that", "Bora Bora", "Walla Walla", "mahi mahi",
  "tsk tsk", "yada yada". An accidental "the the" is listed with them.
- **"a" or "an" before a word in h is listed** ("an historian", "an hotel"), as is one before an acronym. "its" where
  "it's" may be meant, "there is" before a plural and a full-width comma are listed too. A capital article keeps its
  case: "A essay" becomes "An essay", not "AN essay".
- **`verify --repair` asks for a model key only when a rewrite needs one.** A repair that is all mechanical (a known
  misspelling, an agreement, a/an, punctuation, an em dash) now runs with no key set.
- **A stub in a folder of long pieces is no longer served as an example** when a skill is built without a model: it
  is left out and named, as a build with a model does. A folder of short pieces keeps every piece.
- A paragraph of one sentence is reported as "longest 1 sentence".

### Fixed: two contradictory rules never both instruct a composite

- **One final check over every rule that will instruct.** After each rule is decided, and before anything is
  compiled, every pair of rules from two authors that will instruct (chosen by admiration or by an answer, a range at
  the limits it will be checked against) is read by the same conflict detector the table uses. A rule could still
  reach the writer beside one it contradicts by three routes: chosen by an answer in one conflict while the other
  side's author was admired in another ("Avoid headings" and "Use short headings" both shipped); two rules with no
  class in common, which the table never pairs; and a "both" range whose widened limit contradicts a third rule. Now,
  for a contradicting pair: "both" answered for that pair lets both stand, and the screen says so; a side chosen by an
  explicit answer stands and the other is set aside, naming that answer; otherwise neither instructs and the pair is
  an open question on the screen, under its table number or a number after the table's, answered with `--conflict`
  like any other. The screen, the author lines and the count of open questions are read from the outcome after it.
- **A value banned only somewhere is scoped.** "Avoid the first person in headings", "Avoid a casual tone in
  headings", "Avoid American spelling in quotations" and "Avoid the present tense in captions" no longer conflict with
  the first person, a casual tone, American spelling or the present tense in general.
- **A plain verb negated is a ban.** "Do not cite sources" conflicts with "Cite a source for every claim", and "Never
  quote sources" with "Quote sources". "Never invent examples" still bans inventing, not examples.
- **Admiring a class takes the rules mainly about it.** A rule is taken for the class of the first class word it
  says: "Never use bullet lists; carry items in sentences" is about lists, and admiring someone's paragraphs no longer
  takes it.
- **The keyword reading of what a person likes uses the words rules are sorted by**, one list for both: "the bullet
  lists", "the headings" and "its numbered steps" name structure.
- A step about one paragraph ("Open with a paragraph of no more than two sentences") no longer sets a ceiling on every
  paragraph. "Cap every paragraph at three sentences" and "Each paragraph: three sentences, max." now do. "Paragraphs
  must not run beyond four sentences" and "Never let a paragraph exceed five sentences" are still read as judgements:
  widening the negations read as ceilings would set ceilings on conditional steps.
- An author line names only conflicts still open as the ones to answer, and says which answers set aside what was
  liked; a side kept and shown by a worded "both" is said to be kept, not set aside; "neither side instructs" is said
  only of open conflicts where it is true; a range's example shows each contributing author's observation.

### Fixed: a composite decides each rule once, and the person's words come first

- **One outcome per rule, across every conflict it is in.** With three or more authors a rule sits in several pairwise
  conflicts, and the last one written decided it: an explicit `--conflict 4=B` could be undone by admiration in
  another conflict, and `--conflict 2=both` could produce nothing. Each rule is now decided once, in this order: an
  explicit answer that sets it aside (it stays set aside, whatever another conflict says), an explicit answer for it,
  "both" (one range rule, carried by one side, its wording restated to the limits it is checked against), admiration,
  and otherwise open. A conflict nobody answered never instructs either side.
- **The screen says what the build does.** Each conflict's line is read from the final outcome of its two rules: a
  rule kept or set aside by the answer to another conflict says so, with that conflict's number, and a rule still open
  names the conflict to answer. An admired author whose rules sit in conflicts is told which, not that nothing carries
  what they liked.
- **Tone, person and tense are compared.** Casual against formal, first against second or third person, and present
  against past tense are conflicts.
- **A negation is read for what it governs.** "Avoid headings that are questions", "Never pad a list", "Avoid
  contractions in headings", "No source without a link" and "never more than twenty words" narrow or cap; they no
  longer ban headings, lists, contractions or sources. "Avoid American spelling" agrees with "Use British spelling".
- **Numbers on one subject are compared.** "Two sentences at most" against "let a paragraph run to eight sentences"
  is a conflict, between two worded rules or between a worded rule and another author's counted band.
- A rule one author's reading gave twice is one rule, paired once. "sources", "examples", "sentences" and "figures"
  are read as their singular.
- A sentence band never sets a median ceiling above its nine-in-ten ceiling, and a range made from two bands cannot.
- With no model, an author whose pieces are below the counting floor is told so, with how much there was and what is
  needed. The suggested `--admire` names an author.

### Fixed: what a step, a screen and a card say is what is held

- A step compiles to a ceiling on every paragraph only when it states a maximum for paragraphs in general. "Paragraphs
  should never exceed three sentences" now does; a permission ("… are fine"), one named paragraph ("the Summary
  paragraph"), another instruction in the same step, and a distance ("within three sentences of its claim") do not.
- The method screen lists a rule read from the examples that blocks (the machine-writing moves, mechanical errors)
  as required, not as "required only if you say so". The skill card says how many rules the owner wrote, how many were
  read from their work and how many nobody confirmed, instead of "approved by you".
- The claim reader's bound on 9 false flags in 48 is 0.304 and is shown as "at most 31 in 100": a ceiling is rounded
  up.
- `invoke --json` records the thinking setting its calls were sent with and the model that answered, as the provider
  reported them. A comparison run's runtime rows carry that model, not the harness's `--model`.

### Fixed: your rules and your range never share a gate

- **A rule you require is judged on the text as it is.** A REQUIRED feature rule ("at most 5 asides per 1,000 words")
  is held, then read by how far out it is, on the text itself. Comparing a rate at a new length is for the features
  your pieces usually hold. A shorter rewrite that raised a required rate from 11.7 to 16 had been kept as progress;
  it is now refused as worse.
- **Learned effects and the gain-per-dollar gate steer only.** After a release learned that rewrites moved little, a
  broken REQUIRED rule was never rewritten. A step for a rule you require is now taken whenever the step limit and
  the budget allow it.
- **The step limit is per run.** The steps on the first draft, the draft written again (one step) and the steps on
  it count together; a run had taken five.
- **A request for a redraft is always answered.** A draft written again that is kept but still far out is rewritten
  on its carriers, then re-punctuated; a run no longer ends on "handed to a redraft" with nothing after it. A draft
  written again that is no nearer as written is not refined: the smaller steps go on the first draft, and the line
  says what they left.
- **A redraft records what it moved**: the real change in distance from the range (14 to 4.78 is 9.22, not 0), and
  the effects a release learns are read from that.
- **At most three features a step.** A draft written again for the features is told the three furthest out, never
  one already within half a band width, and its reason names exactly those.
- **A ban stated as a method step is rewritten in place**, never reported as something the draft left out.
- **What the run says matches what happened.** "Steered toward your range" lists only the features your pieces
  usually hold, in the direction they moved, including those a redraft moved. A miss that rounds to nothing says
  "under 0.1", never "about 0". A habit beside a length is still "your pieces usually do". A redraft that left two
  misses no longer reads as holding what was missing. A figure a rewrite added reads "the figure 3, added", beside
  "the figure 3" for one it lost. The run and the evaluation use one copying limit and one wording. A repair the
  budget stopped is said on the run, in `run`, and in the run's saved text, and a step that needs no model still
  runs when the budget holds no call. A step on a feature of your pieces is recorded under the feature's name.
- **A short post from a long-form skill** is no longer measured against the long pieces' length, and a method step
  that does not apply to the format is neither counted nor missing on the method line.
- The comparison runner keeps the record of a BLOCKED `invoke --json` run instead of failing on its exit code.

### Fixed: a comparison run keeps a blocked Atelier answer as a row

- `invoke --json` now exits 1 when the work it delivered is BLOCKED, as `run` does. The comparison runner had read any
  non-zero exit as a failed call, so a blocked answer was retried three times and then ended the arm. A blocked run
  that returns its record is now one row, with its state.

### Fixed: grammar correction keeps the author's words and grammar

- **Spelling is changed only for a known misspelling.** A word is corrected in place only when it is on a curated
  list of well-known misspellings, each with its one correction (519 entries, `core/observers/grammar-words.ts`; each
  is in neither the American nor the British word list, and its correction is in both). Atelier finds them itself,
  whatever the checker calls the word ("untill"), and keeps their case at a sentence's start ("Thsi" becomes "This").
  No guess at the word meant is ever made: every other word the checker does not know is listed with its suggestion,
  never changed: a typo the list does not name ("tokwn"), coinages ("grokkable"), slang ("arvo", "yeet"), a tool's
  name ("vite"), a word of either dialect ("grandad", "cosy", "storey", "colour" under an American standard), a closed
  compound it would split ("timeboxed"), a plural it would make possessive ("learnings"). No spelling is converted
  between British and American English. A hyphenated compound is never split.
- **The rule's line says what is listed.** With items to check and nothing corrected, the grammar rule reads
  "held; N listed to check", never "no mechanical error".
- **More is never touched:** @mentions, #hashtags, $cashtags, emoji, email addresses, file names and ALL-CAPS tokens.
- **Pronoun agreement.** A non-standard agreement the author's own pieces use ("it don't") is read at build and is
  theirs: not corrected, not listed. Without it, only the clear slips are corrected ("they was", "you was", "I has",
  "he go"); vernacular is listed, and an error with no single correction ("I is") is listed, not rewritten by a model.
- **A build with the checker off or failed still keeps the author's vocabulary:** every word of their pieces that is
  not a common English word, so a later run never corrects their own terms.
- **What the checker is unsure of is shown item by item** wherever its count is: on the run, in `atelier report`, and
  in the `invoke --json` record (`listed` on the grammar rule's check line).
- **A grammar check that did not run reads "not checked"** in `verify`, never `n/a`, and a run no longer says every
  required rule holds when one was not checked.
- **Short form.** A platform limit some of the author's own pieces run past (`--limit`) is stated as the platform's
  rule, with the pieces that exceed it named, and is no longer listed among what every example shows; the character
  band stays the author's habit, and its line says the limit governs. A band whose minimum is 0 states only its
  maximum ("at most 6"). One of anything is said in the singular ("1 sentence"), and a piece that opens on a markdown
  heading is read from the heading's first word, not its "#".
- **Short pieces build on the default path.** Twenty posts on X were refused by `atelier new` with a model set up
  ("every candidate was too short"): the floor that drops a stub from a folder of long pieces now leaves out nothing
  when the class is a short format (`--class x-post`) or the pieces are short as a set (median under 150 words). Their
  shape bands are proposed with the rest, and a rate too rare to pool over the pieces read alone is pooled over the
  held-out ones too, its check on them marked as not independent.
- `verify --profile` reads the same range of the author's features that the skill card counts, and a pooled rate as
  its rule states it ("your rate about 6.1 per 100 words"), never "n/a".
- **`verify` names what blocked a text.** Under BLOCKED, each failing check is named with what was found, so a text
  blocked by a check no rule line shows (a passage copied from an example) says so without `--json`.

### Fixed: several authors without a model, plain conflicts, and figures cut only for their digits

- **Pieces by several authors are told apart without a model.** `atelier new` with no key on a folder whose pieces
  say `author:` (or sit in a folder per author) pooled them into one author. Now it names the authors, counts each
  one's pieces on their own, sorts the counts into the trait table, and shows the composite screen; what you say you
  like about each is read by its words. Front matter is left out of every piece a skill serves, on every path.
- **A figure in digits is cut only for its digits.** "Our survey found 40% of teams adopted it within two weeks"
  against material saying 40% was cut, because "two" was read as an unsupported figure. Spelled counts are only ever
  listed for you to check, and fewer idioms read as counts: a quoted count, "seven figures", "fifty-fifty", "their two
  kids". "Three in ten" reads both numbers.
- **Plain opposites between authors are conflicts.** "Use contractions" against "never use contractions", British
  against American spelling, short against long paragraphs, headings against none: each is a conflict to answer,
  where both used to instruct. The side you choose with `--conflict n=A` instructs, as what you admired does.
  "Above all, the openings" no longer selects every trait when your lines are read by their words.
- **A composite's length and pieces.** Its skill gives the chosen writers' length range, or none when they write
  pieces of different lengths, and drops the one-author voice paragraph. `--piece-budget default` serves each
  chosen writer's piece whole.
- **A step about paragraph length is checked.** "Keep every paragraph to three sentences or fewer" is held as a
  count, as the same habit of your examples is. "Name the A/B test that was run last quarter" is not a test to name.
- **What the evaluation says.** A required rule nobody confirmed shows why it blocks nothing. The run card's counts
  add up, with a check set aside for the run said apart. "No hashtags; this has 3" replaces "3 hashtags (at most 0):
  long by 3", a band with no floor is said as a ceiling, and "Write between 120 and 400 words" reads as checked in
  full.
- **Tables and findings.** A table with no leading pipe, or inside a blockquote, keeps its dash cells as `-`. A
  tab-indented sub-bullet carries on its finding.
- The claim reader's "39 of 48 clean drafts left alone" carries its bound in the README and the roadmap. A
  comparison run's runtime rows carry their thinking setting, or null with the reason.

### Changed: each repair step is chosen, sized to the miss, and the repair stops when it stops paying

The repair loop ran a fixed number of passes at whatever was off: a correct draft a hair outside the author's range
was rewritten as eagerly as one missing a required section, and a feature far outside its band got the same
three-sentence rewrite as one just past its edge. A bounded controller (`core/loop/controller.ts`) now chooses every
step. It changes how the standard is carried out, never the standard.

- **What matters most first.** An enforced rule broken in place is rewritten; one that needs something the draft does
  not have (a section, a table) is written again; invented claims are cut in code before any step; then a length out
  of its band; then the author's counted features and far-out signals, furthest first, at most three a step.
- **Sized to the miss.** A feature under 0.5 band widths out is moved by re-punctuation, with no model call, by the
  operators whose measured effect moves it the right way. From 0.5 to 1.5, its carrier sentences are rewritten, one
  per band width (at most three). Over 1.5, or three features out at once, the piece is written again with the
  direction and distance of each miss named. A feature inside its band is never a target, and the displacement guard
  still refuses any steering step that pushes another feature out.
- **Stops when it stops paying.** Each step's expected movement is weighed against its expected cost, read from what
  this run has already paid per call. A step is taken while it is expected to move at least two band widths per
  dollar, the budget holds it, and fewer than four steps were taken. It stops when every enforced rule holds and no
  feature is more than 0.5 band widths out (a correct draft with one harmless deviation is delivered as written);
  when every step it could take on what is left has failed; when the budget is spent; or when only what no step can
  reach is left. A draft is written again for the author's features alone only when the controller asked for it.
- **A failed step is never repeated on its target.** A draft written again that does no better gives way to a carrier
  rewrite of the same features (at most three sentences each) on the draft before it, then to the operators; an
  operator step that fails gives way to a carrier rewrite once. Each switch is recorded with the failure that caused it,
  and a stop after the last names every action that failed on each target. All of it stays within the step cap and the
  budget.
- **On the record.** `repair.controller` lists every step with what it was aimed at, why, what it was expected to move
  and cost, what it moved, and what the ledger charged for it, and why the repair stopped; `invoke --json` carries it
  and `atelier report` prints it. Movement is movement, never a probability of acceptance. `--no-repair` runs no repair
  and records no steps.
- **Settings in the release.** `controller.minGainPerUsd` (default 2), `controller.maxActions` (default 4),
  `controller.extraDraft` (default off: one more draft when an enforced rule still fails and nothing else reaches it)
  and `controller.effects`, the measured movement and cost of each step, which `summariseEffects`
  (`core/fidelity/estimator.ts`) reads from past runs as an exponentially weighted mean (λ = 0.2). A run reads effects
  only from its release; absent, the documented defaults apply, so existing releases keep their ids.

### Fixed: your rules come before your range, and the repair keeps its word

- **A fix to a rule you require is never thrown away for a feature of your range.** A rewrite that removed a banned
  word was discarded because it added parenthetical asides, and the draft was delivered failing. A step taken for a
  required rule (a rewrite, a mechanical or grammar fix, a draft written again) is now never refused for what it does
  to the features your pieces usually hold; what it moved is recorded as observed. Those features are weighed only on
  the steps aimed at them, and they are named in words, never by an internal id.
- **A counted feature is judged by how far it is from its band.** Three carrier sentences becoming one counted as
  progress while the value moved twice as far out. For every counted feature, required or not, progress and "worse"
  are now its distance from the band, compared at the new length.
- **A draft handed to a redraft is written again.** A mechanical fix recorded after the hand-off made the redraft
  look withdrawn, and it was never written. One redraft now counts as one of the controller's four steps, not two.
- **A draft written again adds no figure.** One holding a figure that neither the earlier draft, the request nor your
  material holds is not kept; the earlier draft stands and the repair steps down.
- **A one-sided range is read from its edge.** "At most 0.001 asides per 1,000 words" was stored with a lower edge of
  minus a billion and read as no distance at all; it is now read in the feature's own unit, and printed as "at most".
- **One exit code.** `atelier invoke --json` (and `--answer-only`) exits 1 on a blocked run, as `atelier run` does.
- **Short form from longer pieces.** A post is never written again toward the length of your longer pieces, and a
  length you stated that the format cannot hold ("between 300 and 450 words" in 280 characters) is said once, in the
  run and in its JSON `note`, as not applying to that format.
- **The controller's settings are live.** Each new implementation release (`atelier fidelity --set`, `--next`,
  `--distill`) records what every repair action has measurably moved and cost on this skill's runs, and
  `atelier fidelity --skill <name>` shows the controller settings in force.
- **What a run prints says one thing.** "Still broken" is no longer followed by "every rule now holds"; a feature that
  did not move is not listed as steered; an added negation is said as added; a feature too high is "missed", not
  "left out"; a step the calls cannot hold says so instead of "$0.00"; the stop at the rewrite-pass cap says so; a
  step taken after a redraft did no better gives the real distance; a feature note states its move once.
  `--cap`, `--max-calls` and `--accept-new-binding` are in the help for `run` and `invoke`.

### Added: a skill from pieces by several authors, combined as you choose

"Here are five examples from different authors. I love different things about them." Read as one author, such a
folder gave the average of five writers, which is the one voice nobody asked for. `atelier new` now tells the authors
apart and builds the combination you choose.

- **Who wrote which piece is declared, never guessed** (`core/composite/authors.ts`): `author:` in a piece's front
  matter, a subfolder per author, or `--authors`. A folder with none of these is one author, exactly as before. The
  build says "N pieces by K authors: each is read on its own first", and nothing is held back on its own, since an
  author's one piece held back is an author unread.
- **Each author is read on their own** (`cli/commands/discover.ts`): every proposal names its author, and every
  counted band is read from that author's pieces alone. Suggestions are made per author too, so no count is held to
  another writer's pieces.
- **A trait table** (`core/composite/traits.ts`, stored with the run): every rule is classed as opening, structure,
  evidence, pace, voice or method, and as shared (two or more authors, compatible), unique, conflicting, or
  task-dependent (a conflict between authors who write pieces of different lengths). Deterministic, and free.
- **A rule may carry two classes** (a paragraph rule that mentions evidence is pace and evidence), read from every
  trait word it uses, never from their order; when it does, it is taken for the class your line named.
- **One question per author, one screen** (`cli/commands/composite.ts`): "What do you like about this one?", asked in
  the terminal or given as `--admire <file or author>=<what you like>`. One model call reads every line into the six
  classes (by keyword when no model can). The screen says what is taken from whom, each conflict (A, B, both as one
  range, or later), the recurring method moves offered as a proposal read from your examples (your own `--method`
  note stays authoritative), and what is kept as a habit or set aside. Accepting rules on every proposal through the
  normal ratification path. What your line selected is your word, not inferred evidence: a worded rule is ratified
  required and instructs the writer, a counted one is a target that steers drafts and never fails one (until you
  `--set` it required), and its ruling says "selected by you from <author>". What you did not select keeps the
  evidence's ruling: shared, or by an author you admired for something else, it is kept as a habit, shown and never
  instructed; otherwise it is set aside. A conflict nobody answered is kept
  as an open question and neither side instructs; nothing is guessed.
- **What will instruct is checked last** (`core/composite/selection.ts`, `core/composite/contradictions.ts`): every pair
  of rules from two authors that would both instruct is read by the conflict detector, and, with a model set up, the
  final list is read once more by a model for pairs no keyword sees. A pair you did not answer "both" never ships.
- **A composite voice** (`core/compiler/voice.ts`, `renderers/agent-skill/render.ts`): one excerpt from every author
  something was taken from, an equal share of the compact budget each, labelled with whose it is; "how I sound" is
  written from the traits chosen, not from any one author; no persona is derived, since one read over every author's
  pieces would describe their average. The copying check covers every piece of every author in the folder, served or
  not.
- **The choice is data** (`composite.json` with the skill): a rebuild, and a fresh run with the same answers, give the
  same files.
- Pinned in `tests/atelier-composite.test.ts` and `tests/atelier-composite-journey.test.ts`: five invented authors
  with labelled traits, the classes on known pairs, no band pooled, the chosen openings, evidence and pacing, a unique
  trait kept when admired, the selected rules instructing in the compiled skill, an unselected trait kept as a habit, an unadmired author kept
  only as a shared habit, a rule of two classes classed the same whatever its word order, the paragraph conflict stored as a
  question, the served excerpts and the copying check, byte-identical rebuild and re-run, and a single-author folder
  unchanged.

### Added: a review's citations and named tests are read by code

A review method says "cite the file and line for every finding" and "name the test that would have caught it". Only a
step that named the `path:line` form was checked; any other wording was left to judgement, and a review whose findings
pointed at nothing passed with the step beside it unread.

- **More wordings of a citation step are checked** (`core/method/step-readers.ts`). "Cite only lines in the diff",
  "point to the line", "reference the changed line", "quote the line", "give the file and line" and "every finding
  points at the code" are read as asking for citations, and each citation is looked up in the material as before. A
  step that forbids the form or asks for it only sometimes ("do not cite…", "where there is one") stays a judgement,
  and so does a line that is part of the writing or another noun ("the first line of the poem", "the bottom line",
  "line manager", "line count").
- **Every finding carries a citation** (LINES `perItem`, `core/observers/obligations.ts`). Where the step asks for one
  on each finding, each list item or paragraph under the findings (the section the step names, else a heading that
  calls them findings, issues or risks, else every list item) must hold a `path:line`; one that holds none fails with
  its own span. "None." and "No issues found" are not findings. Read in part: whether the cited line supports the
  claim is yours.
- **The work names a test** (NAMES_TEST). "Name the test that would have caught it", "suggest a test for each fix" and
  the like are held by looking for a test file (`client.test.ts`, `test_retry.py`) or a test name in backticks. A
  draft that names none fails and is written again. Read in part: whether the named test is the right one is yours.
  "Write tests in plain language", "add the test results" and a test coverage table are not this step.
- **A pass of these never verifies on its own.** Each is PARTIAL, so a review that holds all of them is NEEDS REVIEW
  with the unread part named, and a verdict step with no options named stays a judgement in your words.
- **A `.diff` or `.patch` beside an example is read as its material** (`core/golden/case.ts`), as `.json` or `.csv`
  already were.
- A labelled set of 51 method steps (`tests/fixtures/readers/steps.jsonl`), wordings that ask and wordings that do not,
  holds the reading: a change may gain an agreement, never lose one or give a step a check its words do not ask for.

### Changed, for 2.0: a feature miss points at its carriers and says which way and how far

A rule that holds a counted feature of the writing to a range (asides per 1,000 words, the share of one-sentence
paragraphs) used to fail with no place to point at: a rate lives everywhere and nowhere, so the repair had nothing to
rewrite and a later draft was told only the range it had missed.

- **A FEATURE miss points at its carrier sentences.** The sentences whose removal moves the value most toward the
  range are its spans, as many as cover the distance and never more than three, so a text nearer the range is pointed
  at fewer places. Every FEATURE miss carries a signed distance, in widths of its range: positive above, negative
  below. This holds for every FEATURE rule, whatever its materiality: a repair needs a target. The one thing it
  changes for a REQUIRED feature rule is that a miss pointed at fewer carriers after a rewrite counts as progress.
  Whether a rewrite made such a rule worse is still read by its verdict alone, as before: never by how many carriers
  a miss happens to be pointed at, and never by its distance.
- **Notes state direction and distance.** A draft written again, and each later shape round, is told every miss with
  which way to move and about how far ("about 4.1 fewer parenthetical asides per 1,000 words", "about 51 words
  shorter"), not only what was missed.
- **A counted feature your pieces hold acts on every draft: it is repaired toward your range and never fails a
  draft.** The standard's FEATURE rules are repair targets on every run, with no flag: a miss is rewritten on its
  carriers and, if still outside after the rewrites, the piece is written once more with the move named, one draft
  per round at most. The rules stay as the standard has them: a PREFERRED rule never fails the run, the evaluation
  record never reads it as enforced, and no rule is promoted. The note for such a miss says what your pieces usually
  do, in a block of its own, and never that the method requires it. `invoke --graded none` turns this off for a run;
  it is the only value the switch takes.
- **The features your pieces hold without a rule act when far out.** Selection keeps more counted features than
  enter the standard (the profile's signal bands, per length class). On each run, for the output's length class, a
  signal feature more than one width of its range outside it is a target for that run exactly like a FEATURE rule:
  carrier sentences, a signed distance, direction and distance in the notes, at most three features a pass across
  both sources, never a failure, never written into the standard or the record's verdicts. Monitored features never
  act. Without a profile only the standard's rules act.
- **Nothing is steered at the cost of the rest.** A rewrite or a draft written again is refused when, over the
  features your pieces hold for that length class, more of them end outside their range than before, or one it was
  not pointed at moves from inside its range to more than one width outside. A shorter text raises every rate per
  1,000 words, so the comparison reads the earlier text at the later text's length. For a graded feature alone, a
  rewrite that leaves its rule broken and moves the value further from the range by a tenth of a width or more is
  discarded on the same reading. Enforced rules keep their own acceptance. The run's call and dollar bounds are
  raised by exactly what the extra draft and its rewrites may spend, and the record states what they were raised by.
- **Recorded, on the invocation record and in `--json` (`graded`):** the features graded; which were steered and
  which way, said in one line on the run with the note that they never block; the drafts written again for them; the
  note lines sent; each feature's value before and after, with its range and where the range came from (`standard`
  or `profile`); the rewrites kept and refused, with reasons; how many features lay outside their range on the first
  draft and on the delivered text, and every rewrite refused for displacing others; and the calls and dollars this
  steering caused, taken from the run's ledger under their own purpose (`graded`), never estimated. Every repair now
  also records its rewrites kept and refused, with the reasons (`repair.edits`).

### Added: short form (tweets, short posts, concise replies) is measured and held

A skill built from five tweets learned two rules: every counted measure needed 150 words, so a folder of tweets
measured nothing, and a 486-character corporate paragraph read NEEDS REVIEW against a tweet skill, the same as a good
tweet. Short pieces are now read for what they carry.

- **Shape bands, with no word floor** (`core/observers/shape.ts`, `core/observers/short-form.ts`). Each piece's length
  in characters (as the platform counts them: a link on X is 23), words, sentences and longest sentence, its line
  breaks, hashtags, mentions, links and emoji, what it opens and closes on, and how its first word is cased, banded
  like a section's length. A band every example meets is required from five examples; under five it is shown and used
  to choose between drafts, and the build screen says how many more examples would let it block. A skill that answers
  requests (`--mode respond`, or an answer class) takes its length and shape from the request, as before: its rates
  are read, and no band of its shape is held.
- **Rates pooled over the pieces** (`core/observers/pooled.ts`). Where the pieces are short (median under 150 words), a
  counted feature with at least ten occurrences across them is read as one rate over all their words, and a short
  output is held to the count its length expects (a two-sided Poisson tail at 5%; a figure, a name or a link is only
  ever capped). Rates are preferences: they choose between drafts and never block.
- **The platform's limit is never read off the pieces.** It is the format's (`--class x-post`: 280) or yours
  (`--limit <chars>` at build, run or verify), the character band is held under it, and the build screen says where
  it came from and how many of your examples run past it.
- **A long-form standard asked for a short piece** (`--class x-post`, or `--limit` under 1,000 characters on `run` or
  `verify`) is no longer refused as another kind of document: it keeps every step of your method and every ban; the bands counted off your longer pieces (paragraphs,
  sentence mix, word count, rates) are recorded as not applying to that output, never as unverified; the output is
  held to the limit; and the writer is told that the essential argument has to survive the compression.
- **Floors by evidence, not by length**, on the discovery path (`core/observers/derive.ts`, `contrast.ts`): a counted
  rule's floor is a pooled count (thirty sentences, ten occurrences) at any length, and one read from fewer than five
  pieces is suggested as a preference with how many more pieces would let it block. A move the author never makes is a ban and is not affected.
- **Nothing unmeasurable reads as met**: a rate on a text too short for it says "too short to measure" and does not
  apply.
- Measured on a fixture of 20 tweets by one invented author and 10 pieces that are not theirs, a skill built from 15:
  before, 5 of 5 held-back tweets passed and 1 of 10 bad pieces was blocked (3 of 10 with `--class x-post`, by the
  280-character limit alone); now 5 of 5 pass and 9 of 10 are blocked. Pinned in `tests/atelier-shortform.test.ts`.

### Added: mechanical errors are found and corrected, and the voice is left alone

A skill held drafts to the author's habits and never to spelling or agreement: "They was late" passed every check.

- **A grammar check, offline** (`core/observers/grammar.ts`, `providers/harper.ts`). The `GRAMMAR` observer reads a
  text with harper.js, loaded once and only when a standard carries the rule. It reports one span per confirmed
  mechanical error, of a documented list of kinds: common-word spelling and typos, subject–verb agreement, a word
  repeated by accident, a/an, a missing apostrophe in a contraction, double punctuation, a space before punctuation.
  Subject–verb agreement is checked only where the checker catches it, with a pronoun subject ("they was", "he go");
  agreement with any other subject is not checked. Anything else the checker proposes is listed under the rule as
  "to check" and never changed. If the checker cannot load, or `ATELIER_GRAMMAR=off` switches it off, the rule reads
  as not checked with the reason, and a required grammar rule leaves the run at NEEDS REVIEW.
- **The author's voice is protected.** Code, quotations, block quotes, URLs, citations, figures, names, the
  standard's own terms and the words of the author's own pieces are never flagged. Spelling follows the dialect the
  pieces spell in. Fragments, "And" and "But" openers, one-word sentences and doubled words of emphasis are never errors.
- **New builds carry the rule.** Building from pieces, from a method, or from pieces by several authors proposes "No mechanical errors: spelling,
  agreement, punctuation." as required, through the usual approval. Stored standards are untouched, and an existing
  skill rebuilds to the same bytes. It holds for short output from a long-form standard too.
  `--measure GRAMMAR:dialect=british` declares it by hand.
- **Repair corrects in place** (`core/loop/mechanical-repair.ts`), as the repair controller's last kind of step
  (`core/loop/controller.ts`), after enforced rules, length and graded features, with no model call: the checker's suggestion, inside the span, kept
  only if no other rule is newly broken and every figure and name is unchanged. A correction that would change a
  figure or a name is refused. An error with no sure correction gets a sentence rewrite that fixes only that error.

### Fixed: the pattern check reads a count written in words, and lists it for you to check

A draft said "three of your prospects will believe the products overlap" and "Twelve-plus optimizers", counts the
material never gave, and the pattern check passed both: it read figures only in digits, while the claim reader's
definition of a figure has always included "nine people" and "47 of them", and the reader's decision already read
spelled-out numbers as their value.

- **One reading of a number** (`core/loop/numbers.ts`). The spelled-out number phrases the reader's decision parsed
  ("twenty-five", "two hundred and fifty", "a dozen", "3 million") now live in one module the pattern check reads too,
  so the two instruments agree on which words are a number and what it is worth, and the two spellings support each
  other ("40%" in the draft, "forty percent" in the material).
- **A count written in words is listed, never cut** (`core/loop/claims.ts`, `core/loop/run-repair.ts`). Two to
  ninety-nine, the hundred, thousand and million forms, "a dozen" and "twelve-plus", when they count the thing that
  follows ("three of your prospects", "nine people", "forty percent"), are checked against the material like a figure
  in digits: "three prospects" is supported by "3 prospects" or "three prospects". One the material does not give goes
  on the `UNSOURCED·check` line for you to check, whatever the kind of work, and never fails or cuts the draft: the
  pattern check reads such a count with less confidence than a figure in digits, and nobody has measured how often it
  is the writer's own. Figures in digits are read and cut exactly as before.
- **What prose counts without asserting a figure is left alone**: a span of time or an age ("two weeks", "ten minutes
  later", "three years old"), the writer's own family ("I have two kids"), the structure of the piece ("three reasons",
  "two things", "a hundred small decisions"), the "a hundred" or "a thousand" of hyperbole unless it counts something a
  figure measures (people, customers, dollars, percent), a count inside a quotation, the lone "one" where it does not
  count ("one of the reasons", "no one"), an ordinal used as structure ("the first reason"), a set already named ("the
  three teams") and a quantity with no number ("a few engineer-months"). An "N-plus" form is always a count.
- Pinned in `tests/atelier-claim-counts.test.ts`: the delivered sentences listed, each true sentence above left alone,
  support in either spelling, listed never cut with or without a sensor, a digit figure still cut when unsupported, and
  that a mixed text lists the same findings every time.

### Fixed: an em dash in a table cell

- The repair that removes an em dash the author never uses joined the parts with a comma even when the dash was a
  whole table cell ("| Switching costs | — | — |"), which left rows reading `|, |, |`. A dash-only cell now becomes
  `-`, a dash inside a cell's text ` - `, and a table's cell count is never changed. In prose, a dash next to a
  quotation mark or a colon becomes ` - ` rather than a comma.

### Changed: a skill that writes serves passages from your pieces by default

On the one skill measured part by part, seven words in ten of the export were the author's pieces served whole, under
one budget of 9,000 words. One newsletter skill was then built both ways and run on five titles: with passages within
3,000 words (`--piece-budget 3000 --pieces excerpts`) the export ran 7,121 words against 12,555, each run cost 34%
less, and no loss of quality was measured. That serving is now the default for the class of skill it was measured on.

- **A skill that writes from your pieces is served compact at its first build:** passages from more of your pieces,
  each by its opening and a passage from its middle, within 3,000 words. The build says so beside its size
  ("pieces served compact by default"), and stores the choice on the skill exactly as the flags would, so a rebuild
  reads the skill and not the default, whatever the default becomes.
- **The whole serving is one flag away, and kept:** `atelier build --name <name> --pieces whole --piece-budget default`
  serves whole pieces within 9,000 words, as every skill was built before, and later rebuilds keep that choice.
- **Nothing built before changes.** A skill that already holds a voice keeps its budget and form, stored or not, and
  rebuilds to the same bytes. A skill that answers shows its examples whole, as before; a skill built from a method
  (`atelier method`, or `atelier new` with no model) serves whole pieces; `--voice none` serves none. No flag was added.
- The default was measured on one skill and five titles, and is recorded here with its figures so that the next
  measurement can move it again.

### Changed: authority is read before materiality, and a figure carries its bound

- **An unratified rule never blocks.** The execution plan read `materiality` alone; a requirement nobody confirmed
  (`DERIVED_UNRATIFIED`) that carried REQUIRED in its fields would have been enforced. The plan now reads authority
  first: such a rule is a habit that blocks nothing, and the record says why (`UNRATIFIED`).
  A stored standard that holds such a requirement compiles it as a habit from now on, so that skill's next rebuild differs from its last; nothing in the standard itself changes.
- **A fitted limit says what its held-out count is.** When a limit was moved to where the author's own pieces are, the
  held-out pieces helped set it, so their count is named as "against the limit before it was moved", never as an
  independent check. A fitted limit the author's pieces meet is held to the corpus count, as before.
- **No exception under five pieces.** A suggested rule allowed one of the author's pieces to break it from three
  pieces up: a third of the work at three. Under five pieces none is allowed.
- **The claim reader's qualification shows its bound.** "Left 39 of 48 clean alone" now carries its one-sided 95%
  upper bound beside it (false flags at most 30 in 100) on the panel and the skill card; the count is never cited alone.
- The typicality score's one use (`--until-typical`, a stop rule for drafting) is named at its head.

### Changed: a comparison run records what each arm delivered, and survives a filtered call

- **Calls go out with thinking disabled**, on every call the Anthropic provider makes at run time, not only in the comparison runner. Every call forces one tool call, which extended thinking does not take;
  an endpoint that turns thinking on unless told otherwise returned empty or refused calls, so arms meant to be the
  same writer were not. The Anthropic provider sends `thinking: disabled`, learns it off on a 400 that names it (as
  it does for temperature), and records `thinkingSent` on each result; model-arm rows carry it as `thinking`.
- **A runtime row is the review as delivered.** `bench/compare/run.mjs` recorded `answer`, which ends with a footer of
  specifics not found in the material ("check before you use this"). Only Atelier writes it, so a judge could tell
  the arm, and no one posts a review that ends that way. The row's response is now `output`; the footer's sentences
  are kept as `to_check`, beside `unverified` (with its reasons), `failed` and `claims_instrument`, so a study can ask
  whether anything Atelier listed predicts a judge's "would not use".
- **A filtered or declined call is a row, not the end of the run.** A provider's content filter or a model's refusal
  was retried three times, paid for each time, and then stopped the whole arm with no row written. It is now written
  once as `filtered` (`CONTENT_FILTER` or `REFUSAL`, and on the self-review arm which call), charged as an estimate
  (`cost_estimated`, one call's allowance, which never raises the allowance kept for the next call), and the arm
  goes on. That includes a filter reported as an HTTP 400 ("Output blocked by content filtering policy") and a
  backend's refusal, and a run inside `atelier invoke` that was filtered or refused, read from its message. A
  transport failure still retries and stops after three. The thinking setting is learned off only on a 400 that
  rejects the field itself, never on one that names it for another reason.

### Changed, for 2.0: one evaluation record, and a mark never says more than was observed

A tick beside "Open with a Parties section that names both parties exactly as the term sheet does" said the whole
rule held, and the check had read that a Parties section opens the work. A length the owner stated was set aside
when their examples ran longer. A request for 400 words answered with 187 read as checked. Four screens each
decided again what a result meant. These were one mistake made four times: something was shown as known that was
only partly observed, or the owner's word was moved by a measurement.

- **One record, judged in one place** (`core/eval/record.ts`). Every requirement on an output is an entry with two
  things kept apart: whether it is required (the owner's, and nothing measured changes it) and what was observed of
  it (the proposition a check read, whether that covers the whole rule, part of it or none, and whether the
  observer can be believed). A requirement passes only when a deterministic or qualified observer read the whole of
  it and it held. A part that fails still fails the rule. Everything else is unverified, and unverified never
  blocks. `atelier run`, `--json` (`eval.record`), `atelier report`, `atelier verify` (`record`), the MCP check
  (`state`, `notVerified`) and `atelier lab eval` read this record and decide nothing themselves.
- **How much of a rule its check reads is said** (`core/eval/observes.ts`). A rule in your words is covered in full
  only when every word of it that carries meaning is one the check accounts for; what is left is named, at the
  build ("checked in part: the rest is yours to read") and on every run (`~`, with "not checked, yours to read").
  A word the reading does not know costs a tick and never grants one, and a word of place, order, count or choice
  is the check's only where the check holds it: "Include a Sources section at the end" over a check that reads only
  that the section exists is read in part. A check against the material (figures given, lines cited) never reads
  whether the citation is the right one, and says so. A rule the machine worded from its own check (a count read
  off your examples) is that check; a sentence a person or a model wrote is never taken for one.
- **What you state is required, whatever your examples do.** A stated step keeps its check when your own finished
  work does not follow it, and the build never stops for the disagreement: the skill is built, the rule is yours,
  checked and shown on every run with what was found, and it blocks nothing until you confirm it (`--yes`) or
  change the method. A reading of your rule that your own work contradicts has not earned the right to block.
  Agreement between examples decides only what was read off the examples. Steps about a part of the work ("keep sentences under 25 words", "the lede under 40
  words", "open each section with…") are no longer read as a rule on the whole of it: they are yours to judge.
- **The request's own length is held as the request's.** "In about 300 words" is an entry of its own, counted on
  the delivered text, shown with what was written and what it allows; a draft that misses it is written again, and
  a miss blocks. The method's default length is shown as replaced for that run, not as unchecked. A length is held
  only where the request reads one way: "a 400-word post, each paragraph under 60 words" names two counts, and a
  length in sentences is not counted, so each is shown as not counted and left to you, never guessed.
- **A length asked in pages is held, and counted in words a reader would count.** "Quick mode: one to two pages."
  was not read (a count spelled out after a label was skipped), and a length in pages, where it was read, was never
  held: drafts asked for two pages came back at three and four, and nothing said so. A length in pages is now told
  to the writer, held as a ceiling at 500 words a page, which the run says beside it ("a one-page cover letter" of
  400 words is inside it), and written again for when it is missed. Pages are how documents that exist are
  measured, so a count in pages after a label is read only where the label names the length of what is written
  ("Length:", "Quick mode:", "Output length:"): "Contract: 30 pages." and "Original: 12 pages." are the length of
  what was given, and "a 200-word summary of this ten-page report" is held at 200 words. The length a
  request asks for is counted in words that hold a letter or a digit: the `|` and `---` that draw a table counted as
  words, and a draft of four tables ran 1,135 for 1,006 written.
- **The comparison runner has a self-review arm and a preflight.** `bench/compare/run.mjs --arm self-review:<skill>`
  writes with the skill as a prompt, then makes one call that checks the draft against the method and the material
  and writes it again: the strongest baseline a pilot met, now on the transport and the cap every arm shares, with
  both calls as its cost and the check kept in the row. `--preflight` makes one call on the first task and says what
  it cost and how much of the token limit the answer used, before a paid run: a study once lost a third of its cells
  to answers cut off at the limit, found afterwards. Nothing is recorded.
  A runtime arm's row now keeps Atelier's own verdict on the answer (`atelier_state`: VERIFIED, NEEDS_REVIEW or
  BLOCKED), its calls and tokens from the run's spend ledger, and every row its seconds, so a study can set the
  verdict against the judge's and compare cost per output; `atelier invoke --json` carries `answer`, the text
  `--answer-only` prints. A runtime row's cost now comes from the record to four decimals (it was read off the
  printed summary in cents).
- **No added machine tells on a skill built from a method.** Discovery from a folder held the owner's rule (a tell the
  author never writes never appears; one they write is held to their rate); a skill built from a method and its
  examples carried no such rule and wrote 10 to 23 em dashes a document against an example with none. The rule is now
  worked out in one place (`machineTellRule`) and both paths carry it, required. From a handful of examples a move any
  example makes is the author's, and the examples must meet the rule they gave, or it is not offered (one of three
  example tweets was itself a run of short sentences), and a method note that allows the em dash in so many words ("use em dashes for
  asides") is not overruled by examples that hold none; a note's own style counts for nothing, and "never use em
  dashes" is no allowance). The em dash fix that needs no model was also being thrown
  away when the claim reader, read again, listed one more sentence: a change that adds no word cannot add an invented
  specific, so that reading no longer counts against it. On eight one-to-two-page teardowns: em dashes 9 to 17 a
  document → 0 in all eight, none blocked, all inside the length, $0.16 an output. The standing comparison
  (`runs/2026-10-14b/`): contract 0 of 10 failing, explainer 1 of 10 then 0 of 10 (a missing analogy, which is no
  tell), 0 em dashes in any output.
- **The length reader is held to a labelled corpus, and stops holding part limits as the piece's length.** Each fix
  to the reading of a length was tested on the request that showed the fault, and the next outside run found the
  next: five rounds. 371 requests (every one the project's history discusses, and 160 fresh) labelled by someone who
  never read the reader now gate every change: a request read right may never be read wrong, and no new length the
  person did not ask for may be held (`tests/atelier-reader-corpus.test.ts`). Scored on it, the reader held 11
  lengths nobody asked for: a part's limit ("a blog post with a headline under 10 words" was held at ten words,
  "each section under 200 words", "80 words per slide") or a topic ("why we cap PR descriptions at 300 words",
  "Hemingway's six-word story"). It now reads a count bound to a part, or to what the piece is about, as no length of
  the whole, and reads "no longer than", "must not exceed", "cap it at" and "fit in" as ceilings, not targets.
  A part named on its own is usually the piece asked for ("a paragraph of 100 words", "an introduction in 400 words"):
  it is a part only where it is said as one ("with a headline", "the How it works section"). 32 requests moved to
  agree, none moved away, and the gate now also refuses a miss turned into a wrong length; one false hold and 50 misses remain, most of them counts of
  paragraphs and sentences, which are told to the writer and not held. The 160 blind-labelled method steps gate the
  method reader the same way (`tests/atelier-step-corpus.test.ts`): no check called fully read where it is not.
- **A run is never refused for material it was not given.** A REQUIRED rule that needs material the person did not
  bind stopped the run before any draft. The run now goes on: the rule is not attempted (asked for evidence it does
  not have, a model invents it), the message names the `--with` that lets it fire, and the evaluation shows the rule
  as not checked, so the work needs review and is not delivered under strict delivery. It is never set aside as if it
  did not apply. A rule that applies only under a condition, or is not required, is set aside as it always was.
- **The writer aims inside the length, and a cut is the last resort.** Told "about 500 to 1,000 words", writers
  aimed at the top and ran past it, and every draft was cut. A held length is now told with an aim inside it (three
  fifths of the way up a range, about 85% of a ceiling, a target as said); on eight such requests seven drafts came
  in on the first try. A draft that still runs long is cut by sentences the writer names and code removes, never
  rewritten whole (asked to return the piece shorter, a writer removed 5 to 21 words of 50 to 170 asked). Only a
  whole sentence that stands once in the draft goes, and never one with a figure or an ordinal (in digits or words),
  in a heading, table row, list or block of code, after an abbreviation, a paragraph's first sentence, a sentence the
  next one leans on ("That test…", "But…", "He…", even across a blank line), or one that would leave emphasis, code,
  a link or a bracket unclosed. The cut stops on the count of the rule it serves: every word for the request's
  length, the words of the prose for the method's own limit and the span of the author's pieces. The run keeps the
  draft from before the cut. Where nothing named can be removed, or the checks refuse the cut, the next pass writes
  the piece shorter as before, and says so.
- **Where the owner requires a length, their examples add no second one.** A draft was being written again toward
  both the stated limit and the span of the examples.
- **Three kinds of shared wording are three observations.** Wording that recurs across your pieces is your
  standard wording and is not counted. A run shared with one piece, with that left out, is a lifted passage: it is
  shown with the words themselves, and blocks only where there were pieces enough to tell the two apart. How long
  a run may be is read from your own work: twelve words, or one more than the longest run any of your pieces
  shares with another where that is longer. An essayist's pieces share a few words and a contract drafter's share
  whole clauses, and new work that shares no more with one example than the examples share among themselves is
  written the way you write. A
  held-back reference appearing in an output is leakage, and is `atelier reproduce`'s to find.
- **The taste reader is off unless asked for** (`--taste`). It is a model's reading of your rules and has not
  earned a say in whether work can be used.
- **A run is never refused for what is missing.** A skill that reads the work against material, run without any,
  writes the work and shows those rules as not checked, with how to have them checked.
- **One exit code.** `atelier run`, with `--json` or `--answer-only` too, and `atelier verify` exit 1 where
  something required was seen to fail, and only there; `verify --json` and the MCP check report `failed` the same
  way, and under a check that held say where it reads only part of its rule.

- **The yes/no kept with a run is the record's** (`standingOf`, `core/eval/record.ts`). `eval.result.conformant`,
  which `--strict` delivers by and `atelier lab eval`, `atelier reproduce` and `atelier evolve` count, was worked
  out beside the record from its own list of reasons. It is now read from the record: nothing required was seen
  to fail, and every check that exists finished. It does not mean verified. A run delivered under `--strict` with
  part of a rule unread says so; `reproduce` and `evolve` print how many of the runs they count were verified in
  full beside how many had nothing seen to fail. An evaluation that did not finish (the claim reader could not
  run, the claim check was turned off, specifics the reader could not decide) is never a pass under `--strict`.
- **Whether a failed check may act is the plan's, carried on the check line** (`RuleCheck.enforced`, `acts`).
  Blocking, the sentence rewrite, the mechanical fixes and every count of broken rules read it there; a test lists
  the files that may still read a rule's own `materiality`, and none of them writes, checks or repairs a run.
- **A piece written again by `atelier fix` is written under the first run's settings** (model, drafts, cap, what
  was turned off), with what is typed beside the complaint taking precedence. Where the first run kept no
  settings, a file given with it is gone, or the skill has changed since, the fix says so before it writes.
- **A length said of a section is that section's, with or without the word "section"**, and a step that only
  refers to a table ("three to five rows in that table") is no longer given the table's column check.
- **A check near a rule is not a check of it.** A step that speaks of sources and of figures was given the lookup
  of figures in the material, whatever it asked. Where the figures are not what the step is about ("every claim
  cites a numbered Evidence item", "name the source the first time I cite a figure"), the check is still run and
  shown, and blocks nothing: its failing is not your rule broken. "Every figure must be sourced from the material"
  is enforced as before.
- **`atelier lab evolve` says how much of your standard its score reads** ("scored on 3 of your 17 rules"), and
  where that is under half, an adoption says it is no evidence the work is better by your standard.
- **A build that stopped half-way is finished by running it again.** Stopped between storing the standard and
  installing the skill, the same command was refused with "a skill called … already exists, and this folder did
  not build it".

`tests/atelier-invariants.test.ts` states eight properties these changes rest on, over every combination of what
can be observed of a requirement: automation never changes what the owner requires; nothing read off examples
blocks before the owner adopts it; a partial observation never passes; an unqualified reader never blocks; what a
request asks is not replaced by what the examples tend to do; a repair cannot break a required rule the draft was
meeting; a test run or a held-back case is never learned from; and every surface says the same thing about the
same run. The file is frozen: a new bug becomes a test of the reader or the check it was in.

**If you are upgrading:** a skill built from a method whose examples break a stated rule now checks that rule on
every run and shows the result, where it was left as a judgement, and enforces it once you confirm it; `eval.result.conformant` is now read from the record: it no longer refuses for a shared run of words where there were too few examples to tell your standard wording from a lifted passage, and is otherwise what it was;
scripts that read where a run stands should read `eval.record.state`; `--no-taste` is now the default;
`atelier verify` now exits 1 for a passage lifted from one of your examples, and exits 0 (NEEDS REVIEW) where the
claim reader could not run or left specifics unconfirmed, which it failed before.

### Changed, for 2.0: three commands, and the evaluation under the work

The tool answered to fifty-nine commands and a run read thirty-eight flags, many of them for studies whose own
results said they did not help. A person needs three things from it.

- **`atelier new <your-work> --method <note>`** builds the skill: your finished work, and how you do it. It is
  `atelier method` under the name people look for; without a method note, `atelier new` reads the rules off the
  examples as before. The screen is your own steps in three groups (checked on every run, yours to judge, seen in
  your examples) and three lines to say the skill is ready. How each check is made, and the build's own account, is
  `--report`.
- **`atelier run "<task>"`** does new work and prints it with its evaluation under it, opening with where the work
  stands: **BLOCKED** (something required was seen to fail: shown, not usable as it stands, exit 1), **NEEDS REVIEW**
  (nothing was seen to fail, and part of what you require was not read in full by a check) or **VERIFIED**
  (everything required was read in full and held). A rule you require is required whether or not a check can read
  it, so work with judgement in it is never VERIFIED by a machine. In a folder that built one skill, the skill need
  not be named. `atelier invoke` is the same run with its whole report.
- **The evaluation is part of what a run returns**, in three layers that are different promises and are never
  merged: your rules, in your words; what this request set (a length it asked for); and evidence (specifics traced
  to what you supplied, no passage lifted from one of your examples). Under them, the habits seen in your examples,
  counted and blocking nothing; what was done to the draft; and one next step. A failure is shown whole: the rule,
  and everything the check found.
- **`atelier new <your-work>` builds without a method note and without a model** (`--no-model`, or when no key is
  set, where it used to stop): the skill is the examples themselves, served to the writer, with what can be counted
  in them and one rule that is yours to judge, that new work reads like them. One example is enough.
- **`atelier fix "<what was wrong>"`** writes that one piece again, with what you said put right, and leaves the
  skill alone: one complaint about one piece is not a rule. It also records that you would not have used the piece,
  with why. `--always` says every run should do this, and is the earlier behaviour (another way to carry a rule you
  have, or a new rule on your yes), now said in plain words. `--evaluation` says the evaluation was wrong about the
  work: it is recorded with what the evaluation said, and nothing is changed.
- **`atelier --help`** is those three. Every other command is listed by `atelier lab`, by what it is for, with the
  ones whose studies did not show a gain named as experimental. Nothing was removed: each still answers to its name.

A first-time walk through the three commands, by someone who had not seen them, found the first version of them
harder than it said, and each point is fixed and tested:
- three of four builds needed a second command. The build is one call: a step read as a check by a section name
  says what it will look for ("checked as: a "Must fix" section"), a step the owner's own work does not do stays
  required as they wrote it and is named with the piece, and `--review` looks without building;
- four skills built from four files called `method.md` were all named "method". The name is the work's folder, or
  the note's, or the folder the person is in, whichever is not the name every such thing has;
- changing the method meant a new folder. Built again in the same folder, it is a new version of the same skill;
- a run blocked for a reason that is no rule of the owner's (a passage lifted from one of their pieces) read as
  usable. It is an entry of the evaluation like any other, with the shared words shown; a sentence removed from the
  work is said under it; a rule set aside for the run is shown as not checked, with why;
- a task that happened to equal another argument's value was taken for that argument. What is typed is sorted by
  where it stands;
- a skill that checks the work against material was run without any and blocked on every citation. It says so
  before a draft is paid for, and a file is bound by giving it: `--with change.diff`.

The package's description, the README's opening, the roadmap and the agent guide say this product. Decisions 0017
(a skill from a method and finished work) and 0018 (a skill improves how it carries its method) are accepted, the
second with what evolution may change and what it may never change.

The standing comparison can be made again from a clone: `bench/standing/runs/2026-10-13/` holds every output behind
its tables, `score.mjs` reads them with no model, `build.sh` builds the Atelier skill for a domain, and each arm
now also reports what a passing output costs.

**If you are upgrading.** On this line of work, compared with 1.x:
- `atelier verify` and the MCP tool pass an unsourced figure as a listed finding when no material is bound, where
  they failed it before. A check in CI that relied on that exit code needs material bound (`atelier material`,
  `--with`).
- Nothing is deleted from a draft unless material is bound and the skill is an essay or a post (`--class`).
- A skill rebuilt from nine pieces or more may write one or two more drafts when a draft misses its length;
  `--no-redraft` turns that off.
- A corpus of HTML pages is now measured as its visible text: rules approved from the markup should be read again.

### Studies: putting right the sentences the claim check lists (negative, not shipped)

Every teardown a strict reviewer rejected carried confident specifics the material does not hold, and the claim check
only listed them. A step was built that gave each listed sentence back to the writer for a replacement (said from the
material, or marked as inferred), applied by code under guards (no new number, most of the sentence kept), and kept
only where fewer sentences were listed after. Eight one-to-two-page teardowns, two samples each with the step against
one sample without, read blind by one reviewer with the material: problems of evidence per document 3.81 with the
step against 3.88 without; inferred weaknesses kept out of fact in 4 of 16 against 0 of 8; four of the sixteen carried
fragments where a replacement had matched only part of a sentence; cost an output $0.28 against $0.16. Not shipped.
What it shows: most of what the reviewer rejected is not a specific the claim check can see (an invented motive, a
duration, "copyable in a sprint", an absence on a page read as a fact); it is a judgement about inference, and a
listing of figures and names cannot put it right.

### Studies: a draft cut by the sentences its writer names, on the standing comparison (development evidence)

The `invoke` arm of `bench/standing`, run again after the cut step changed, against the recorded run of 2026-10-13,
same domains, tasks and model (`runs/2026-10-14/`; `node bench/standing/score.mjs --domain contract --out
bench/standing/runs/2026-10-14/contract` scores it again at no cost).

| domain | outputs failing, 2026-10-13 | outputs failing, now | cost an output | seconds an output |
|---|---|---|---|---|
| contract | 10 of 10, all the 220-to-420-word limit | 0 of 10 | $0.203 → $0.165 | 55 → 29 |
| explainer | 0 of 20 | 0 of 10 | $0.083 → $0.073 | 19 → 15 |

The contract limit is the method's own, so the change is the cut, not the request's length: a draft asked to come
back shorter came back nearly as long, and one cut by the sentences the writer names comes back inside. Both runs
cut nothing from the text the claim check reads. Ten outputs a domain cannot give a rate; it is the contrast that is
read, on one model and the builder's own checklists.

### Studies: how much of a rule its check reads, on 160 steps the reader had not seen (development evidence, $0)

Four method notes of 40 steps each, written from a brief that said nothing of how Atelier reads a step, compiled by
the method reader and labelled without sight of its answers (`studies/coverage-labels`; notes and labels by a model,
one labeller). The reader compiled 21 of the 160 to a check and called 1 fully read; the labels found no false
FULL (0 of 1, which bounds nothing) and found 8 checks that read something the step does not ask: a step that
mentions a table given the table's column check, a step about how to cite given the lookup in the material. One
section's 70-word limit was compiled as the whole document's. Two narrow fixes followed (a count in a step that
opens on a section is that section's or nobody's; a step is held to a table only where it asks for one), each with
a test in the reader, and the set was scored again: 15 compiled, 12 agreeing, the 3 left being the citation class,
shown as read in part. The larger finding is what is not compiled: of the 139 steps left with no check, a script
could verify the whole of 53 and part of 49 by the labeller's judgement. The method reader turns about one step in
ten of an expert's notes into a check; the rest is the owner's to read on every run.

### Studies: twelve examples against three (development evidence)

The same method, tasks and runtime, with the skill built from all twelve examples, from the first three, and from
three drawn at random (seed 20261012), on two of the frozen domains. Ten tasks an arm, one output a task, scored by
each domain's own checklist with no model. `bench/standing/run.mjs`, arm `invoke`.

| domain | 12 examples | first 3 | random 3 |
|---|---|---|---|
| explainer: outputs failing the checklist | 0 of 10 | 0 of 10 | 0 of 10 |
| explainer: cost an output | $0.070 | $0.051 | $0.052 |
| contract: outputs failing the checklist | 1 of 10 | 6 of 10 | 2 of 10 |
| contract: cost an output | $0.21 | $0.20 | $0.20 |

Every contract failure is the same rule, the stated limit of 220 to 420 words. What this supports: on explainers
three examples did as well as twelve and cost a quarter less; on contracts the two sets of three differ from each
other by as much as either differs from twelve, so which three matters more than how many. What it does not
support: any claim about a rate. Ten outputs an arm cannot tell 1 in 10 from 2 in 10, and the checklists are the
project's own. The runs were made before the trim step was limited to the length of the whole piece. Cost of the
study: about $8.

### Studies: the standing comparison on its four domains

One run a task for the runtime, two for the prompt arms; the Atelier skill is the one built by
`atelier method <note> --golden <folder>` from the domain's method and its twelve examples. Outputs failing each
domain's checklist:

| arm | explainer | code review | contract | analysis |
|---|---|---|---|---|
| the examples pasted | 12 of 20 | 20 of 20 | 8 of 8 (12 refused by the model) | 16 of 20 |
| the method and the examples | 1 of 20 | 20 of 20 | 20 of 20 | 5 of 20 |
| the Atelier skill as a plain prompt | not run | not run | 20 of 20 | 2 of 20 |
| the Atelier skill, `atelier invoke` | 0 of 20 | 2 of 10 (1 of 10 on the run before) | 10 of 10 | 1 of 10 |

- **Contract is a miss for every arm, on one rule:** the method's "between 220 and 420 words". The twelve examples
  run 405 to 419; the prompt arms wrote 437 to 500 and the runtime 425 to 436. Every other rule of the agreement
  (the parties, the term, the governing law, no added figure, no "best efforts") held in every output of every arm.
  The runtime came nearest and still failed all ten: told its count and given a length to aim for, the writer cut
  about half of what it was over, twice (476, 453, 434 on one task). The run says so: "Still broken after repair".
- **Analysis:** the verdict must name the vendor that costs least and each monthly cost must be worked right. The
  runtime's one failure is a cost worked wrong. The method's step "every figure must be sourced from the price list
  or worked from it" was left a judgement at build: the figure check read 19 of an example's 33 figures as given.
- **Code review** is not like for like (the runtime numbers the lines of the diff); **explainer** is as below.
- The pasted arm's twelve refusals on contracts are the model's, and are not scored.

What changed from it: a miss of length is now said as a number ("long by 51"), the writer is given a length to aim
for inside the limit, and a draft whose only miss is length is written once more. That moved the contracts from
427-469 words to 425-436, and did not bring one under 420. Synthetic cases, the builder's checklists, ten tasks a
domain: development evidence.

### Added, for 2.0: the length of one section, stated or kept by every example

In the closing study every one of twelve explainers held its "How it works" section to 61 to 76 words. Nothing
measured the length of a section, so that habit was never a candidate rule, and the skill wrote 98 to 122.

- **Kept by every example:** in a build from a folder, for a section every piece has, the span of its lengths is
  offered as how the pieces are written ("The How it works section runs 61 to 76 words in my pieces"), widened as
  the length of a whole piece is (46 to 91), shown and not required. Not for a section whose longest is twice its
  shortest or more, nor from fewer than three pieces.
- **Stated by the owner:** "Keep the How it works section under 80 words" is held of that section, where the step
  names exactly one section the example has and gives the count in a plain form. An example that breaks it is the
  owner's to settle.
- The check (`LENGTH` with `in`) counts what the section holds; a text without the section is the presence
  rule's to fail. A request that states the length of the whole work does not set a section's aside.

- **Narrowly, again.** A review of the first version found a step about something else read as a section's
  length ("unlike the Summary section, keep the whole piece under 200 words"), a section written as a bare name
  measured to the end of the work, and a stated length met by leaving the section out. Each is a test. A stated
  length now fails a work without the section; a section every piece writes word for word alike is offered no
  length; one the owner already stated is not offered again; and no more than six counted rules are offered.
- The counted rules of style never include the length of a sentence: a count is not a rhythm.

The test that holds it reads HTML examples: the offered span holds every example and fails an output of 109 words.

The standing comparison has its two missing domains: `contract` and `analysis` (bench/standing/README.md).

### Added, for 2.0: a method build also counts how the examples are written

`atelier method <note> --golden <folder>` held the owner's steps and served their pieces, and read nothing of how
the pieces are written. The measurable part of a voice is counted by code (a sentence length, a paragraph cap, a
word never used), and was only ever counted in a build that calls a model.

- **Counted off the examples with no model,** and offered beside the method, never as part of it: "I keep
  paragraphs to 6 sentences at most", held in all twelve explanations.
- **Only a count every piece meets, from three pieces or more,** and from enough text to count from: three tweets
  give none.
- **Shown, not required.** They are served to the writer and choose between drafts. The owner makes one required
  with `atelier amend`; it is then a rule of style, repaired by rewriting the sentence that breaks it.

### Changed, for 2.0: one more draft is told everything the first did not hold

A draft that lacked a section the method requires was written once more with the section named. A draft that ran
long, or cited a line that is not in the material, had no such step, or had one of its own. They are one step now.

- **What it reads** (`unmetReader`): what no sentence rewrite fixes. A section, a table or a stated length the
  method requires; a citation that is no line of the material; and, when the request names no length, a draft
  outside what the author's own pieces span.
- **What the writer is told** (`redraftNote`): each of them in the owner's words with what the check found, and the
  earlier draft itself, to keep what it says wherever it can stay. The step before this one sent the instruction
  without the draft it spoke of.
- **What is kept:** the second draft only when it is nearer to holding them (fewer unmet, or as many and less far
  off in length) and breaks no more of any other required rule. One draft, never a loop.
- **Rules before length.** A draft at the right length that drops a section the method requires is not nearer,
  and one that adds the section and runs a few words long is. The length is no rule of the standard and is never
  recorded as one.
- **For its length, only on evidence:** a skill built from nine pieces or more. With n pieces the next one falls
  between the shortest and the longest (n - 1) times in (n + 1), four in five at nine; on fewer the drafts are
  still chosen by length, which costs nothing. `--no-redraft` turns the step off.
- A skill with nothing of the kind to read has no such step, and costs what it did.

One run a task, before the last three points were added: on ten explanations the step fired once (272 words to
inside the span), and on ten code reviews three times (306, 311 and 316 words to inside it, one of them with a bad
citation named in the same note). Outputs failing the checklists: 2 of 10 and 2 of 10, where the runs before had
2 of 10 and 1 of 10: no difference ten outputs can show. A redraft is one more draft and one more pass of checks,
so a run that needs it costs about half as much again.

### Fixed, for 2.0: a page of markup is measured as what its reader sees

A closing study built a skill from twelve explainers written as single HTML pages. Discovery measured the markup:
the semicolons of the CSS became "use semicolons within my range: 15.7 to 54.2 per 1,000 words", the `!` of
`<!doctype html>` a rule about exclamation marks, and four `<h2>` headings a page became "write without section
headings", because only `#` was read as a heading. The skill failed all ten of its test tasks.

- **A document that is markup is reduced to its visible text before anything measures it,** underneath every
  reader of text: words, sentences, paragraphs, headings, sections, and the counted features of style. Scripts,
  styles, comments, the head and the doctype are not read; `<h1>` to `<h6>` are headings; the end of a block is the
  end of a paragraph; an entity is the character it stands for.
- **The reduction keeps the page's length and the place of every visible character,** so a check still points
  into the page as written, and a repair rewrites the page. The page is never converted: an author who writes
  HTML is served HTML and writes HTML.
- **Decided from the content:** a declared HTML page, with or without front matter, or a document that opens with
  a tag and is built of block tags. An essay with a stray `<br>`, or one that writes about tags, is read as before.

- **One pass over the page, linear in its length.** A first version ran a chain of patterns; a review found it
  took half a minute on a long page of unclosed tags, read a heading whose words sat on the next line as no
  heading, counted a link's address among a paragraph's words, and classed a README that opens with a centred
  block as markup. Each is a test now. Tables, code blocks and anything never closed are not prose. Every heading
  below the title is a section. The claim check and the copying check read the same visible text, and a long
  paragraph in a page is not "split" by a blank line a browser would not show.

Known and left: an entity in the middle of a word ("It&#8217;s") keeps its room and the word reads as two; a
length stated in characters counts the markup; a rewrite of a sentence that ends inside a link can leave the
link's closing tag behind.

The test that holds it: a page and the same text in markdown give the same reading on every one of the counted
features, the same headings, and the same count of words, sentences and paragraphs. Not run on a model: whether a
skill built from HTML pages now passes that study's tasks is for the study to say.

### Fixed, for 2.0: what a pass over the new commands found

Every command the changes below touch was run end to end against a scripted model, and the code they added was
read for shape. What was wrong:

- `atelier score --material` and the MCP tool's `material` never reached the rules read against material, so a
  correct line citation failed there and passed under `atelier verify`. All three now read the same material.
- A step with "do not" anywhere in it ("a Suggestions section: improvements that do not block the merge") was
  listed in the skill under what not to do. A prohibition is a step that opens with one.
- A finding that was only listed was still explained as "the sentence is cut", and with `--placeholders` a slot
  was reported as a cut.
- A line citation checked with nothing bound said "no such file in the material"; it says nothing is bound.
- In a folder build, a step the piece read from broke was reported without the piece's name.
- `atelier reproduce` told the owner of a method-built skill to add tasks and material that were already there.
- The usage guide and the README did not mention `atelier method`; they do now, with its two limits: one step
  gets one check, and a method build holds no piece back to test on.

The step reader had grown to one function of ninety-seven lines. It is ten small readers in
`core/method/step-readers.ts`, each answering one question about a step, with the same tests.

Left as it is: a method-built skill cannot be rebuilt in the same folder after `--yes` (build it in a fresh one).

### Added, for 2.0: a rule stated as a count, or as quoted words, is held as stated

Three tweets and five lines of rules now build a skill with three of the five rules held by code, with no model
and no minimum corpus: until now a corpus that small switched off nearly every counted check (style features need
150 words a piece, counted rules 1,000 words in all).

- **A length in the unit it was stated in** (the `LENGTH` check): "between 150 and 230 words", "under 280
  characters", "at least 5 sentences", "no sentence longer than 25 words".
- **The words a paragraph starts with:** 'the last paragraph starts with "In short,"'.
- **A word never to use:** 'never use the word "excited" or "thrilled"'.
- **Read narrowly.** Only where the step gives the number or quotes the words. Never from a step that says when or
  says it softly ("unless", "ideally", "aim for", "usually"), from the length of a part ("each bullet", "the
  title", "per section"), or from a negation other than the plain forms ("no more than", "no fewer than"): "never
  go over 100 words", read by its comparator alone, is the opposite of what was written. A ban holds only where the
  quoted words end the sentence. A first version read all of these as rules; a review found them, and each is a
  test now.
- **Each is held against every example before it is a rule.** A count the owner's own pieces break is put to them
  with the piece named, and is not built.
- **A request that states its own length in the same unit sets it for that run:** the method's is withheld and
  said. A request for "detail" moves no stated limit.

On the explanations' rule page this holds three of its six rules in code (length, the closing words, the longest
sentence); "exactly one analogy", "plain paragraphs only" and "speak to the reader as you" stay judgements.
Built that way from the rule page and the twelve examples, the skill failed 0 of 20 explanations on the standing
comparison (two runs a task) at $0.08 and 20 seconds an output; the same rule page and examples as a plain prompt
failed 1 of 20, and the skill discovered from the examples alone 2 of 10 at $0.23. Development evidence: one
synthetic standard, the builder's checklist, and 0 of 20 cannot be told from 1 of 20.

### Added, for 2.0: one method and a folder of examples, built in one call

`atelier method <note> --golden <folder>`. A person who has a page of rules and a dozen finished pieces had two
commands that each took half: `atelier new` read the pieces and never heard the rules, and `atelier method` took
the rules and one piece. In the standing comparison the plain prompt that got both (a rule page and the examples)
failed 1 of 20 explanations, fewer than anything Atelier built from the examples alone.

- **Every step is the owner's rule, in their words,** as before. A check read off the first example is now held
  against every example: one that an example breaks is theirs to settle, with the count and the piece named, and
  nothing is built until they have seen it. What only the first example shows is dropped.
- **Three or more examples are served with the skill** as the author's own pieces, and the span of their lengths is
  recorded, so drafts are chosen by it when a request names no length.
- **It calls no model.** One file still builds exactly as it did.
- A rule read against what a piece was made from (a figure given, a line cited) is no longer counted against the
  author's pieces at build, where each piece's own material is not at hand: read that way, all twelve golden
  reviews broke the citation rule their own diffs satisfy.

- **Which example the checks are read from is chosen, not assumed.** Read off the first piece by name, a piece
  that happened to lack a section left that step a judgement and nobody was asked. Each example is tried, and the
  one under which the most steps become checks is used; a piece that then breaks one is named to the owner.
- **A check against the material is held only on the examples that carry theirs,** and the count says so.
- The folder is read as the build reads it: no file about the work, no piece's material, no hidden file, not the
  note itself.

On the standing comparison, one run per task, the skill built this way failed 1 of 10 explanations (the rule page
and the examples as a plain prompt: 1 of 20; the skill discovered from the examples alone: 2 of 10) at $0.10 and 22
seconds an output against $0.23 and 38, and 1 of 10 code reviews (the review within one line of the defect in the
tenth). Ten outputs each: development evidence, and too few to rank the Atelier arms against each other.

### Added, for 2.0: three more kinds of method step are held by code

A six-step review method (Summary, Must fix, Suggestions, Verdict, "cite each item as path:line", "name the missing
test") had two steps checked: the sections it opens and ends with. Now five are.

- **"Then a Must fix section: ..."** A step whose first words give its place in the order (then, next, after that,
  finally) asks for the section, as "open with" and "end with" do.
- **A condition counts where it is about the section.** "Then a Suggestions section: improvements that do not
  block the merge. Write None when there are none." asks for the section; before, its "not" and "when" made the
  whole step a judgement. "Add a Risks section only when billing is touched" and "skip it for internal notes" are
  still judgements about when.
- **"...that holds one of: Approve, Request changes, Comment."** The section's first line is one of them and
  nothing else, in any case or emphasis; a reason may follow on later lines.
- **"Cite each item as path:line."** Each citation is looked up in the bound material (the `LINES` check) and one
  that is no line of it, a line the change did not add, a blank line or a lone bracket fails, by name. A draft that
  fails it is written again with the failure named, as a draft missing a section is. A change pasted into the
  request is looked up too, and a review with nothing to fix cites nothing and holds the step. A step that forbids
  the form, or asks for it only sometimes, stays a judgement.

"Name the missing test" stays a judgement, shown to the writer and reported as not measured. Not measured on a
model in this round: the two rules above were built after the code-review comparison below was run.

### Added, for 2.0: a skill that cites lines is shown the line numbers

A second domain for the standing comparison: code review to a six-step method (Summary, Must fix, Suggestions,
Verdict; cite each must-fix item as path:line; one of three verdict words), twelve golden reviews, ten changes
with one planted defect each. Reviews failing the checklist, whose strictest rule is that the first must-fix item
cites the defect's exact line:

| arm | failing |
|---|---|
| the examples pasted | 20 of 20 |
| the method and the examples | 20 of 20 |
| the exported skill as a plain prompt (from twelve examples; from the method and one) | 20 of 20; 20 of 20 |
| `atelier invoke`, before this change (both skills) | 10 of 10; 10 of 10 |
| `atelier invoke`, after (from twelve examples; from the method and one) | 1 of 10; 0 of 10 |

Every arm found the defect and miscounted its line: a model does not count lines in a diff. No instruction changes
that, the method's own included.

- **Material is served with its line numbers when the skill cites lines.** Read from the skill as served: a rule
  that names the form ("path:line", "the line number"), or examples that cite three or more places. A diff is
  numbered by its hunks, each added or context line with its number in the new file; any other material from 1.
  A skill that does not cite lines is served exactly as before. What the checks read is the material as given.
- **Every citation is looked up** and the run says how many point at a line of the material with something on it
  (for a diff, a line the change adds), naming those that do not and why. Reported, not enforced.

The comparison is not like for like on this point, and that is the finding: the prompt arms were given the diff as
a person has it. A person who numbered the lines by hand would close most of the gap. Synthetic changes, one
checker, one run per change for the runtime arms: development evidence.

### Added, for 2.0: drafts are chosen by the length your pieces run, when the request names none

After the change below, the same ten requests failed on length: the skill told the model "about 200 words", nothing
checked it, and three outputs ran 238 to 248 words where the twelve examples run 199 to 217.

- **The span of your pieces is recorded at build** (shortest to longest, in prose words), with the stored voice and
  never in the package, so a rebuild writes the same package bytes.
- **It applies in one context:** the request states no length, asks for no detail or brevity and no shape of its
  own; the skill writes pieces, not answers; the request is in the register of your pieces; the run is not a
  contract check or a piece planned by section. A request that names a length still sets it.
- **The band is the span widened by its own width on each side** (199 to 217 gives 181 to 235). No number is chosen:
  an author whose pieces run 300 to 3,000 words gets a band that holds nothing.
- **Where it applies, the drafts a run already writes are chosen by it,** after every rule and before the finer
  features of style. No extra draft is written, and the run prints the length it delivered beside your span.

A first version wrote the piece again when it ran outside the band. A review found it re-ran the whole repair chain,
never showed the model the draft it was told to keep, and would fire on nearly every run of a small, even corpus;
on the ten requests it fired once (282 words to 242, still outside). It was removed. A redraft for length belongs
in one step that names everything a draft failed, which is not built.

### Changed, for 2.0: the claim check deletes only with material bound, and never what the standard rests on

A small study on real model runs: twelve plain-language explanations that all keep six habits (one of them a
single analogy), a skill built from them with every default accepted, ten new requests, no material bound and no
kind of work named. Outputs failing the examples' own checklist:

| arm | failing |
|---|---|
| a six-line rule list and the examples | 1 of 20 |
| the exported skill, as a plain prompt | 3 of 20 |
| the examples pasted | 12 of 20 |
| `atelier invoke` | 5 of 10 |

Four of the five `invoke` failures were deletions: the model wrote the analogy in all ten drafts, and the claim
check cut it from three as not found in the material, and cut a required closing line from a fourth. Nothing
reported the loss. With no material there is nothing to check a sentence against, so every specific the writer
chose read as invented. One standard, written by a model, one run per request: development evidence.

- **A deletion needs material bound and a kind of work the check was measured on.** With no material bound
  (`atelier material`, `--with`), on a skill that names no kind of work, or on a kind nobody measured, every finding
  is listed and nothing is cut or failed. The reason is said on the check's line, in the run's verdict and on the
  skill's card. This reverses the earlier default, under which a skill that named no kind cut as it always had.
  `--placeholders` still leaves its slots without material: the person asked for them, and a slot hides nothing.
- **No cut breaks a rule the draft was meeting.** Each deletion is tried against the standard's counted rules
  first; one that would turn a met rule into a broken one is not made, and the sentence stays, flagged.
- **The list closes the delivered text only when material is bound.** With none, it is every specific in the
  text and stays in the report.
- **Strict delivery** still stops before spending on a named kind the check was not measured on. With no kind
  named or no material bound it delivers on the rest of the standard, and the verdict says the specifics were
  listed.
- **`atelier verify` and the MCP tool** follow the same rule: with nothing bound, an unsourced figure is listed
  and the check passes; bind material and it fails as before.

Not changed by this: a rule that only a reading can check (the closing line above was one) is not protected by
the second guard, which reads counted rules only. The reader that flags an analogy as a claim is unchanged.

### Fixed, for 2.0: the claim check deletes only where its deletions were measured

A test round on real model runs (27 competitive analyses written by one model and read by one claim reader,
synthetic briefs, labels by one reader who was not blind) found the invented-claim check doing harm outside the
writing it was measured on. It cut 41 sentences; 32 were legitimate by that reading (correct arithmetic from the
price list, the work's own verdict, a risk with no figure in it), and 9 were real inventions or wrong figures. Three
runs were delivered with a section cut to nothing, two of them counted conformant. Replayed on the same runs, "list
and never cut" deletes nothing and leaves the 9 in the text, listed.

- **On a kind of work the check was not measured on, it lists and never cuts.** Its rates were measured on essays
  and posts. A skill that declares another kind of work (`--class`, or a skill built by `atelier method`, which
  reads the kind from the note's title and records it) has every finding, the reader's and the patterns', listed
  for the owner to check. The list closes the delivered text, after everything the checks read
  (`--no-unsourced-note` keeps it to the report). A skill that declares no kind, a known format, and prose keep
  the behaviour they had. The card and the run panel show the reader's measured rates only where it was measured.
- **Strict delivery stops there before anything is spent,** and says why: a check that only lists cannot decide
  what is delivered. This means strict delivery is not available for analysis, contracts written as a method,
  reviews or handover notes until a claim reader is qualified on that kind of work. Nothing here does that.
- **No cut empties a section.** Where the check does cut, the last sentence under a heading stays, still flagged,
  and the run fails on it by name. A draft written again for a missing section leaves its note in the run record.
- **A figure worked from the material is the writer reading it.** One offer's total at a scenario the sentence
  states (49 + 2.5% of 25,000), the gap between two offers at it, a year of either, a break-even between two
  prices; an offer's amounts from one line of the material, prices only, worked only into amounts of money. On the round's sentences: 9 of 9 honest calculations
  recognised (none was before), 0 of 13 invented or wrong figures. A free two-step search was tried first by the
  tester and passed 7 of 12 invented figures; it is not used. A four-digit amount is no longer dropped as a year.
- **A method step is checked when it names a section its example has,** however each is written. Of 16 steps in
  three methods that name something the work must contain, 2 got a check; 12 do now, and 12 of 12 on three more
  written with labels, clauses and bold, with no step tied to a section it does not ask for. The example reader
  reads a name alone on its line, and a clause that goes on after its name. A note's title is not a step.
- **Reproduction counts only sections that say something:** three words, or a fifth of the expert's own section
  when that is fewer. One word under each heading, filler text and two names run into one heading no longer count,
  and a section left empty is never a reproduction. **The repeat check leaves out what the writer was given:** two
  real outputs were marked as copies for sharing the table header every served example carries and then a name and
  a price from the material.
- **A count in a sentence that reports, before the sentence that asks, is not a length.** Of 20 sealed requests
  holding a number that is not a length, 3 were read as one; none is now. It still misses a length with no count
  in it ("Keep it to a page", "a short paragraph") and one in bullet points.
- **An adopted note reaches the export,** under the heading a run serves it under, and an amended standard now
  says that it retired one, on the run and on the status.

Measured in this round and not changed by it:
- **A judgement is still flagged like a fact.** "Sentrix could offer a 12-month term" is listed as unsourced. A rule
  that reads modal sentences as judgement was specified and not built: on the 11 such sentences of the round it
  clears 4 to 6, it would drop from the list a sentence the same reading labelled an invention, and on prose it
  would let an invented story through in a sentence that says "could". Where nothing is cut, a longer list costs
  less than a shorter one that hides something.
- **The method's figure rule on a fact sheet** fails 11 of 20 invented figures and 1 of 20 honest sentences, as
  before. The 9 it passes are a true figure moved to another subject, a wrong year or quarter, a single digit and
  one correct sum the set labels invented; they need the subject read. The set is kept as a test, with the 9 named.
- **The author's own held-back analyses** still carry sentences the claim reader flags: plain statements of what
  the author knows and the material does not say. They are listed now, not cut. They would not pass a strict
  check, and no rule here makes them.
- **Layout is read only on the owner's example.** Work written with no markup marks a section by a name alone on
  a line. Guessing those from layout was tried three ways, and each lost a real section on some ordinary output. An
  output is not guessed at: a check knows the names it asks for and looks for those, so a title, a one-line answer
  and a signature are lines. The example is read by layout once, at the build, and shown; there a title cannot
  always be told from a first section with a one-line answer, and the owner sees which was taken.
- **A check read from the example's section names waits for the owner's yes.** "State the constraints in a
  Regulation section" asks for one and "compare it with a Risks section from last quarter" does not, and the words
  that tell them apart are not a closed list: the second is still read as asking. So such a check is shown with the
  section it looks for, and nothing is built until the owner accepts the screen. A step whose own wording says it
  ("Include a Risks section") builds in one call as before.
- A worked figure is checked for arithmetic, not for what it counts: an invented amount that happens to equal one
  offer's total, or the gap between two, at a number the sentence states is listed as computed. A break-even is
  accepted as a count of anything. Price lines it cannot give one role to are not worked from (a fee, a rate and a
  percentage on one line; a line that also holds a count), so some honest totals are still listed as unsourced.
- Existing skills are not changed by any of this: 120 stored texts (the pieces of one corpus and the outputs of
  seven study rounds on it) get the same verdict on every rule from the commit this round started on and from this
  one, with the claim check off and with it on. Three independent reviews were made of the round's changes and
  their findings fixed, each with its inputs as tests; the last fixes were not reviewed again.
- A step's check cannot yet be set by hand at the build; `atelier amend` is the way. An interrupted search cannot
  be resumed. A task that paraphrases the held-back piece's conclusion, or material that holds it in pieces, is
  not caught before a reproduction run.

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
- **The length reader still reads some counts that are not lengths** ("Find 10 words that rhyme"), as 1.x did,
  and misses some plain ones.
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

### Fixed: the copying check, by an amendment to the 1.x freeze

One fix, admitted by the owner after the freeze ([decision 0016](docs/decisions/0016-the-last-fixes-before-one-point-x-is-frozen.md), amended).

- **The copying check is read in one pass.** A long copied stretch, the case the check exists for, was the one it
  was slowest on: 600 copied words took seconds and 4,000 did not finish, and strict delivery runs it on every
  output. Same numbers as before on unaccented text. Wording that repeats the same six words hundreds of times
  still takes seconds.
- **It reads every script.** An exact copy in Cyrillic, Greek, Arabic, Hebrew or Chinese read as no copy. An
  accented word is now one word, so a skill built from accented work gains its standard wording at its next build.
- Three pieces that are one clause ending three ways count as three pieces for the author's standard wording.

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
