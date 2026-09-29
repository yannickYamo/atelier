# Changelog

Notable changes to Atelier. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This project is pre-1.0. **Until 1.0, a minor version may change the on-disk state format under
`$ATELIER_DATA`.** A standard already minted is content-addressed and readable across such a change;
a run in progress may not be.

## [Unreleased] — voice defaults

### Changed: the voice defaults (Phase 1 of closing Atelier as a voice engine)

- **Rhythm instructs.** The author's sentence-length mix is suggested as required when their unread work
  bears it out, like any count; before, it only chose between drafts, so no draft's rhythm moved.
- **Contrastive verdicts held for every author** ("isn't X, it's Y", "not X but Y"), at their own rate,
  not only where a plain model overuses them: a rewrite inherits them from its source.
- **A restyle is said as one.** When a draft keeps most of a bound text's sentences, `invoke` says so
  and points to writing a new piece from notes. `atelier new` ends by asking for real stories and figures.

### Studies: the Phase 1 check (exploratory, $0.85)

Two new pieces (not rewrites) with the Linear skill, its sentence mix made required, each from a fact
pack. **Rhythm did not move.** Median sentence 10.5 and 11 words against Linear's 15; 29% and 36% of
sentences of eight words or fewer against Linear's 15%. The mix rule reported itself met, because its
tolerance lets 22% of sentences sit in the wrong band, wider than the whole gap. What did move: new pieces
use "we" at Linear's rate (22.5 per 1,000 words against 22.2; a rewrite of the same kind of post stayed
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
  [HOW-IT-WAS-BUILT](docs/HOW-IT-WAS-BUILT.md), [decisions/](docs/decisions/README.md) (five records,
  including the design of a search that cannot move the standard), a public [ROADMAP](docs/ROADMAP.md)
  with what is not being built, and [PRODUCT-METRICS](docs/PRODUCT-METRICS.md).
- **An example to run:** [examples/blog](examples/blog/README.md), six synthetic posts, declared AI-written.
- The new docs were written with Atelier's own guard: each passes `atelier verify` against a skill built
  from a public author's posts, with the repository's records bound as material.
- Removed committed browser-tool logs; fixed a test that leaked a stubbed `fetch` into later suites.

### Studies: two rewrite tests (exploratory, not pre-registered)

The owner asked for their company blog post (1,438 words, "we") rewritten in another publication's style.

- **Nate's Newsletter, 19 public previews** ($2.54). Failed. The rewrite kept most of the original's
  sentences and added em dashes (0 to 4.3 per 1,000 words, against the author's 1.1) and runs of very
  short sentences. Three reviews agreed it was a copyedit, not a voice transfer. Causes found: nothing in
  the catalogue held em dashes or staccato runs; the contraction rule was one-sided; repair could not split
  a paragraph; and 16 of the 19 previews ended in a paywall teaser, which discovery read as style. Fixed
  above (the tell floor, two-sided contractions, no-model repairs); the corpus lesson is to use full pieces.
- **Linear's Now blog, 16 full essays** ($4.21 including one rebuild after the fix below). Three arms on
  the same writer model, packaged blind for the owner: Atelier, a plain prompt, and 14 essays pasted into
  the prompt. Counted against Linear's essays (1.8 em dashes and 0.1 staccato runs per 1,000 words): the
  Atelier draft had 0 and 0, the plain prompt 4.0 and 1.3, the pasted essays 2.8 and 0.7. Atelier's
  contractions matched Linear's (25.3 against 22.2 per 1,000); the baselines stayed at the original's 7.
  No arm moved sentence length toward Linear's (median 15 words; every arm 11) or kept less than 72% of the
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
- **Corpus:** 30 Lenny's Newsletter product essays no study has used. How they were drawn was not
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
