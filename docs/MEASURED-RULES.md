# Measured rules

Most of a standard is judgement: when to concede a point, what counts as enough evidence, how a
piece should end. That part is read, not counted (see [TASTE.md](TASTE.md)). Some of it is countable.
A measured rule is a rule the owner ratified *with* a deterministic check, and for those rules whether
an output follows the rule is a fact, not an opinion.
This page is the reference for what can be measured, how rules are proposed, and what the loop does
with them.

The observers live in `core/observers/`, the repair loop in `core/loop/`, the regression floor in
`core/distinctiveness/`, the optimizer in `core/optimizer/` and failure mining in `core/mining/`. No
observer calls a model.

## The observers

Each observer returns a verdict (`MET`, `VIOLATED`, `NOT_APPLICABLE`), the measured value, and the
exact spans of text that broke the rule. The spans are what a repair rewrites. A verdict with no spans
(a floor that was not reached, a style distance) still counts. Draft selection prefers texts that meet
it, but there is nothing specific to rewrite.

| observer | what it counts | `--measure` syntax |
|---|---|---|
| `LEXICON` | banned words and phrases, optionally with a substitute | `LEXICON:leverage=>use\|utilize=>use` |
| `SENTENCE_LENGTH` | median and 90th-percentile sentence length | `SENTENCE_LENGTH:medianMax=15,p90Max=28` |
| `PARAGRAPH_LENGTH` | sentences per paragraph | `PARAGRAPH_LENGTH:maxSentences=4` |
| `HEDGE_RATE` | hedging words per 1,000 | `HEDGE_RATE:maxPer1000=3` |
| `PATTERN_RATE` | a named construction per 1,000 words, capped or floored (see below) | `PATTERN_RATE:pattern=EM_DASH,maxPer1000=0,prefer= - ` |
| `FRAGMENT_SHARE` | the share of very short sentences | `FRAGMENT_SHARE:maxWords=5,maxShare=0.2` |
| `TERM_RATE` | any of a word list per 1,000 words, capped or floored | `TERM_RATE:terms=but\|so,minPer1000=4` |
| `RATIO` | the share one word list takes of two competing lists | `RATIO:numerator=but,denominator=however\|thus,minShare=0.8` |
| `DISTRIBUTION` | the mix of sentence lengths across bands | `DISTRIBUTION:edges=8/18/30,shares=0.3/0.4/0.2/0.1,tolerance=0.2` |
| `OPENING` | the first prose paragraph: phrases it must not use, and a length band | `OPENING:avoid=in today's\|imagine,maxWords=80` |
| `CLOSING` | the last prose paragraph: the same | `CLOSING:avoid=ultimately\|in conclusion` |
| `HEADINGS` | section headings: phrases, sentence or title case, length, how many per 1,000 words | `HEADINGS:avoid=the thing\|gets wrong,case=SENTENCE,maxWords=8` |
| `RHYTHM` | how much sentence, paragraph or section lengths vary (standard deviation over mean): pace, not length | `RHYTHM:unit=SENTENCE,minCv=0.4` |
| `STYLE_DISTANCE` | Burrows' Delta: closer to the author's function-word profile than to the model's | computed by discovery, never declared by hand |

Named patterns for `PATTERN_RATE`: `EM_DASH`, `SPACED_HYPHEN`, `SEMICOLON`, `NOT_X_ITS_Y`,
`THAT_OPENER`, `HERES_OPENER`, `SIGNPOST`, `INTENSIFIER`, `SHORT_VERDICT`, `BOLD_SPAN`,
`ONE_LINE_PARAGRAPH`, `RHETORICAL_QUESTION`, `REPEATED_OPENER`.

Each observer states when it cannot measure, rather than returning a number that means nothing:
- a per-1,000 rate needs 150 words
- a ratio needs four uses of either list
- a mix needs ten sentences
- an opening or closing rule needs two prose paragraphs
- a heading rule needs a section heading, and a heading rate needs 300 words

Headings are read by a section model that skips a lone title, code and front matter, and understands
setext (`===` / `---`) headings. Openings and closings skip images, footnote definitions and link
references.

Declare one on your own rule with `atelier add --statement "…" --kind BOUNDARY --measure "<spec>"`,
or add one to an existing rule with `atelier amend --rule <rule> --measure "<spec>" --reason "…"`. The
parser is strict: a target you did not mean is worse than a refusal, because it is enforced on every
output from then on.

## Where proposed rules come from

`atelier new` and `atelier discover` propose measured rules in two ways. They go on the same review
screen as every other rule, and nothing is enforced until you accept it.

1. **From your work alone** (`core/observers/derive.ts`). Discovery measures sentence and paragraph
   length, hedging, and stock phrases on the pieces it reads, then checks each target on pieces it
   never read.
2. **From the gap between you and the model** (`core/observers/contrast.ts`). The model writes a few
   plain drafts on your own topics with no skill. The contrast pass then counts the same things in
   both:
   - the named patterns
   - which of two competing words each side reaches for ("but" or "however", "it's" or "it is")
   - the connectives you lean on
   - the stock vocabulary the model leans on
   - the sentence-length mix, and how much sentence, paragraph and section lengths vary (pace)
   - the function-word profile, kept only if each of your own pieces and each model draft, left out in
     turn, lands on its own side
   - dash asides of any kind (—, – or " - "), capped near your own rate when the em dash is banned, so
     the aside cannot move onto another mark (it did: 8.9 spaced hyphens per 1,000 words against the
     author's 2.9)
   - **your positive signature, as two-sided bands**: bold phrases, one-sentence paragraphs (prose
     only: captions, link lines and bold labels do not count), rhetorical questions and semicolons,
     where you use them. Between 0.6× your lower-quartile piece and 1.5× your 90th-percentile piece (or twice your average).
   - **the voice layer**, true of every piece whatever the topic: your point of view (a first-person
     writer gets a band on "I", "my", "me", and the rule says a view in the first person needs no
     source while a first-hand story does) and your dialect (a cap on the other dialect's spellings)
   - stock moves at the edges: phrases models open and close with ("In today's…", "Ultimately,"), heading
     tropes ("The thing everyone gets wrong…", "Why this matters"), heading case and opening length

   Edge tropes often appear only once a skill asks for a voice, not in the model's plain drafts. So
   there is one rule per position listing every trope the author never uses there. It is firm when at
   least three in five of the plain drafts it applies to break it, and weak (shown, and used to choose
   between drafts) otherwise. If the author's held-out work uses one of the tropes, the whole rule is
   dropped: the list was wrong about them. On a real 20-post
   corpus, the heading rule passed every held-out post and flagged three headings in an output a reader
   had called AI-written.

   Each proposal carries both numbers ("you: 13.2 per 1,000; the model on its own: 5.2").

Two guards apply to every proposal.

- **It must not fail you.** At least four in five of your held-out pieces must meet it. A rule your
  own unseen work breaks is a rule against you, and it is dropped.
- **It must separate you from the model.** Mixes and pace are proposed only if most of the model's
  drafts fail them. A rule that passes everything measures nothing. Signature bands and the voice
  layer are the exception, on evidence: a model's plain drafts may meet them and a skill's output still
  lose them. In a blind round the skill's output had no first person at all and British spelling
  throughout, for an American first-person author, while every cap it carried held.

Why the positive half matters, and why it is checked rather than instructed: caps on the model's tells
alone produce a careful, de-AI'd writer, not this writer. But an author does not write at a rate: in
one corpus one-line paragraphs ran 0.4 to 10.4 per 1,000 words by piece, first person 0.7 to 36. A rule
that instructs the average steers every piece toward one the author never wrote. So signature bands
and the first-person band span the author's own range and are **weak**: checked on every output,
reported, used to choose between drafts, never instructed and never rewritten toward. The voice itself
is carried by the persona and the author's pieces (README, "It carries how you sound").

Also in the voice layer, **register**: an author who contracts at least 60% of the forms that can be
contracted gets a cap on forms left whole ("do not", "it is"), and one who contracts at most 40% a cap
on contractions. Only forms a speaker would contract are counted ("the code that is failing" is not).
Pronouns are not register; this is.

### Machine-written sentences

Some sentences mark text as machine-written whatever its topic: announcing an insight others supposedly
miss, grading your own list ("that last one deserves emphasis"), "the single most", announced candour
("let me be blunt"), totalisers ("that's the whole game"), reading the reader's mind ("you know the one"),
one thing "wearing another's clothes". In five blind rounds every model-written version carried them at
three to seven times the human author's rate. Three things catch them, none of them tuned to one author:

- **A catalogue of the model's moves** (`core/observers/tells.ts`, `MACHINE_TELL`): fourteen families, the
  same for every skill, including a contrastive verdict as the opening line (found by position). Every
  standard built from a corpus is proposed one rule over them, held to the author's **typical piece**: a
  family the author uses in fewer than half their pieces is banned outright; one they use in most is capped
  at 1.5 times their 90th-percentile piece. When the rule is checked on the author's unread work, their own
  pieces are tolerated up to the moves their 90th-percentile piece carries (one corpus had such moves in 8
  of 20 pieces). Measured with this sensor, the families ran 0 to 0.11 per 1,000 words in three authors'
  work and 0.4 to 1.0 in the model's.
- **A lexicon learned from the skill's own drafts** (`core/observers/tell-lexicon.ts`, `atelier tells`): a
  run of four or five words the skill's drafts repeat across three or more unrelated topics, that no
  piece of the author's contains, and whose absence cannot be chance (at the drafts' rate the corpus
  would hold it three times or more). Learned from the skill's own uses by `atelier tend`, or from probe
  drafts with `atelier tells --learn --probe <n>`; the owner can add or strike a phrase. Out of sample it
  flagged the author's withheld pieces 0.09 times per 1,000 words and the model's 0.5 to 1.1. It is
  implementation: the sensor behind the ratified machine-tell rule, never a rule of its own.
- **The contrastive verdict in every spelling** (`CONTRAST_VERDICT`): capped only where the model overuses
  it against this author. It is not a universal tell: one author wrote 2.3 per 1,000 words, more than
  most model drafts.

Required machine-tell rules are repaired like any other, and a skill built from a corpus writes two
drafts by default and keeps the one with fewer machine moves (`--drafts 1` turns this off).

### A banned move may not move

Some tells are one move with several spellings. The **contrast** family is "not X, it's Y", "X rather
than Y" and the reframes ("has little to do with", "what matters is"); the **opener** family is
"That's…", "Here's…", repeated openings and catalogue announcements ("is the first one", "is the next
one"). A rewrite that lowers one member of a family while raising another is refused, for that sentence
only; the rest of the pass stands, and the loop tries again with a reason that names the forms the move
may not take. The negation inside a contrast is the move itself, so it may go. (An earlier version
refused the whole pass, and in one round the guard kept only one style pass in ten.)

### Invented stories are cut, not left as slots

A first-person story or a figure that is not in your material is rewritten out of the text, keeping the
point it made, and the output lists where a story of your own would fit. A rewrite that leaves a
bracketed slot anyway is refused. `--placeholders` asks for slots instead. The better answer is real
material: `atelier material --skill <name> <file>` binds your own incidents, and a story found there is
yours to tell. A slot in the delivered text was honest, but every blind reader took it for a
broken draft.

### Required means nearly always

For new writing, a reading-based rule is suggested as REQUIRED only when the author followed it in at
least four in five unread pieces where it applied (three or more). The rest are compiled as moves the
author sometimes makes, each with its rate, and a piece may use about as many as the author's own
pieces carry on average.

## What the loop does with them

`invoke` and the Claude Code plugin check every draft. When a REQUIRED rule is broken, only the spans
that broke it are rewritten (`core/loop/repair.ts`). The guarantees are:

- **The splice is deterministic.** The model returns replacement text for numbered spans, and the
  code puts them back. Nothing outside a span can change.
- **A rewrite never makes a measured rule worse.** A pass is kept only if every rule that held still
  holds, and the broken REQUIRED rules are fewer or broken in fewer places.
- **A rewrite may change how something is said, never what it claims** (`core/loop/integrity.ts`).
  Every rewritten span must keep its figures, negations, qualifiers ("may", "most", "roughly"), proper
  names and `[placeholders]`, unless the broken rule named that very word. A ratio's competing word may
  be swapped, but the swap must keep what it asserted: "is not" may become "isn't", never "is". A
  rewrite that loses one is refused, and the original sentence is kept. Nor may a rewrite make a claim
  stronger by adding a word: a universal ("any", "every") or a certainty verb ("eliminates", "ensures")
  the original did not carry, or an intention ("we expect to") turned into a fact. Causality and a
  dropped scope clause are not caught; the list is kept short so ordinary rewrites still pass.
- **Accuracy comes before style.** Rules marked `--phase ACCURACY` and invented claims get their own
  first pass.
- **Invented claims are read by a small model and decided in code** (UNSOURCED,
  `core/loop/claim-extract.ts`). The reader lists every specific in the draft: a figure, a date, a
  quotation, an attribution, a link, a story told as lived. For each one it says what kind it is, whether
  it is attributed, and where it came from (your material, your task, general knowledge, or nowhere),
  quoting the passage that supports it. Code then checks the quote is really in your material and the
  numbers are really there. Nothing the reader says counts on its own. Something attributed, quoted,
  linked or lived can never pass as general knowledge. Unattributed general knowledge is listed for you
  to check, not cut, except in a strict format (see [FORMATS.md](FORMATS.md)). The reader is
  `claude-haiku-4-5` on Anthropic, or `ATELIER_CLAIMS_MODEL` on any backend. With no reader available,
  the older pattern check (`core/loop/claims.ts`) runs instead. A reader that fails also falls back to
  the pattern check and says so, so a failed read is never reported as clean. Every UNSOURCED line names
  the instrument that produced it, including the reader's version. **Qualified, version 2**: on 28 pieces
  no earlier study had used, it caught 35 of 35 planted inventions and left 35 of 38 clean drafts alone
  (specificity 0.921, 95% CI 0.786–0.983), clearing the pre-registered floors of 0.50 and 0.80
  ([result](../studies/CLAIM_READER_V2_QUALIFICATION_RESULT.md)). Version 1 failed on essays (0.744); the
  reason, a trusted sentence number, is why version 2 checks location in code.
- **It changes the output, never the standard.** The loop has no authority to relax a target.

### What is deliberately not proposed

- **Positive vocabulary beyond connectives.** Words you use far more than the model were tried as a
  floor on a real 20-post corpus. They turned out to be the author's topic ("verification", "loops",
  "quality"), not their voice, and a floor over them would push that vocabulary into an article on
  another subject. The connectives floor is the topic-free part. Coined labels and favoured verbs are
  left to the reading-based rules, which are judged in context.
- **Figure consistency.** Whether a piece keeps one governing metaphor is a reading-based rule. No
  count can tell a governing figure from a recurring topic word.

## The regression floor

A new implementation that fixes the rule you complained about can quietly make three others worse.
The floor notices (`atelier floor`, `core/distinctiveness/measured.ts`). Every measured rule that
applies everywhere is a dimension, scored by its own observer and turned so that higher is always
better.

**The quick way:** `atelier floor --skill <name> --setup` does every step below with its default, says
how many drafts it will spend first, and stops as soon as the floor is earned (`--runs`, default 6, caps
the A/A runs). It takes margins and tasks from your pieces (`--corpus <folder>`, or the folder
`atelier new` read): each task is `Write a piece titled "<title>"`, one per `# ` title, up to twelve. It
enforces every REQUIRED counted rule when nothing is enforced yet, and refuses, before spending anything,
when fewer than two rules can be enforced: a repair's own rule never guards itself. `atelier tend` (below) reports whether it is needed.

| step | command | what it does |
|---|---|---|
| margins | `--corpus <folder>` (done by `atelier new`) | proposes a margin per rule: half the interquartile range of your own pieces on it. A change smaller than the difference between two of your typical pieces is not a regression of your voice. Every rule starts OBSERVE. |
| your call | `--margin <rule>=<n>`, `--enforce <rule>`, `--observe <rule>` | which rules may block a new version, and by how much |
| tasks | `--tasks <file>` | the tasks it is measured on, separated by blank lines; at least five |
| baseline | `--baseline` | drafts the active version once per task (`--fires` for more) and freezes its scores |
| qualify | `--qualify` | one A/A run: the same version drafts twice per task, and one half is compared with the other, exactly as a candidate would be. Both halves are fresh in every run, so runs are independent of each other. Each enforced rule the comparison resolves (NONINFERIOR or REGRESSION) is one trial, and a REGRESSION is a false alarm. |
| check | `--check <version> [--target <rule>] [--promote]` | drafts a candidate the same way and gives each rule one verdict across tasks: REGRESSION, NONINFERIOR or INCONCLUSIVE |

**Tasks are the unit.** For each rule, the candidate's mean score on a task is paired with the
champion's on the same task, and one paired test runs over the per-task differences: a one-sided 95%
t-interval, NONINFERIOR when its lower bound is above minus the margin, REGRESSION when its upper bound
is below it. Counts are sparse (two drafts that both used a word zero times show no spread at all), so
the spread is taken as at least half the rule's margin. Fewer than five tasks gives no verdict. One
draft per task is enough, because the variation between tasks is what the test is about: a floor on
ten tasks costs ten drafts per version, where the earlier per-task design needed about sixty.

**Earned** means two pre-registered bars, both measured on this skill:

- **Sensitivity first.** The failure that matters for letting the floor act alone is a worse version
  passed. So every A/A run also plants a regression of **two margins** on each enforced rule in the same
  fresh draws, and the floor must catch at least **80% of at least 10** such plantings. What this
  measures, honestly, is how often a uniform two-margin drop *resolves* as REGRESSION. A regression
  concentrated on a few tasks tends to come out INCONCLUSIVE instead, which blocks just the same, since
  an enforced rule that is not NONINFERIOR holds the gate. A floor whose margins are tighter than the
  writing's own variation fails this, and says so.
- **Calibration.** False alarms, over at least **11** resolved trials, with the exact (Clopper–Pearson)
  upper 95% bound at most **25%**. With no false alarm at all, eleven trials clear it: for example six
  runs with two enforced rules that both resolve. This is a check against gross miscalibration, not an
  estimate of the test's size: in simulation the one-sided test (upper bound below minus the margin
  when the true change is zero) almost never calls a REGRESSION, and a false alarm only ever blocks,
  sending the choice back to you. Rules in the same run share drafts, so trials within a run are not
  fully independent; runs are.

A qualification is a rate **of** one situation:
- this version of the skill and its standard
- the floor's margins and roles
- its frozen baseline
- the task set
- the runtime (provider, model, temperature)
- the number of drafts per task (a baseline frozen with another number is refused, not compared)
- how drafts are scored (`FLOOR_SCORING_VERSION`, bumped whenever an observer's counting changes)

Change any of them and the floor is no longer EARNED until it is re-qualified. That includes a
promotion, which changes the version.

What it authorises is the promotion gate's decision (`core/convergence/promotion.ts`), not the
floor's. A candidate installs itself only when all of these hold:
- the floor is EARNED
- the rule the repair was about improved **across tasks**. Each task counts once, however many drafts
  it had, and it takes at least three tasks.
- that rule is left out of the floor's verdict, since guarding the target with the floor would count
  it twice
- at least one **other** enforced rule is watching, and every other enforced rule held (NONINFERIOR
  across tasks). An INCONCLUSIVE rule blocks as surely as a regression.

`atelier fix` does this for you when a count favours the candidate and the floor is earned. If the
floor run cannot finish (a budget, a refusal), the choice goes back to you. Otherwise a person decides,
as before. A promoted version's check scores are not reused as its baseline, because they were the draw
that made it look good. The floor is re-frozen and re-earned before it acts again. Floor runs are raw
drafts, not repaired output, so they measure the implementation, and they are never recorded as
invocations.

## Searching the implementation

`atelier optimize` (`cli/commands/optimize.ts`, `core/optimizer/`) runs one round of search over how
the skill is implemented. It needs a regression floor with margins, tasks and a baseline, because a
search with nothing guarding what it does not target makes the writing worse while reporting an
improvement. Only an EARNED floor lets it install anything.

1. **Propose.** The search space is the genome: each rule's carrier, and whether the exemplar and the
   contrast examples ship. Each candidate changes one gene.
   - A reflective proposer reads recent failures and the most recent attempts on the rules in play,
     both bounded, and chooses among the legal changes by number. Anything else it returns is discarded
     and counted.
   - The fixed ordering fills the remaining slots.
   - Repair memory removes moves already tried on evidence at least as strong as this round's first
     test. A shown-and-dropped exemplar or examples toggle is not re-proposed on the same version.
2. **Build.** Each candidate is rebuilt from the ratified standard, never edited. The standard's hash
   is asserted unchanged at the mint.
3. **Screen.** One draft per task on a cheap model (`--screen-model`), and each candidate is scored on
   every measured rule. A change counts only beyond that rule's margin. Candidates the champion
   dominates, or that beat it on nothing, are dropped. The Pareto front is ranked, and a few finalists
   go on.
4. **Confirm.** Only a change to a **measured** rule can be shown better by a count. Those finalists are
   fired on the real model against the floor, with that rule as the target, and the promotion gate
   reads the result.
   - A change to an unmeasured rule, or to whether the exemplar or examples ship, is left for you. It
     never installs itself.
   - The taste reader ([TASTE.md](TASTE.md)) may block a finalist, here and on every other path where a
     candidate could install itself (`fix`, `floor --check --promote`). Both versions draft once on four of
     the floor's tasks, and a finalist is blocked when it misses a rule on at least two more tasks than
     the current version. One extra miss is within what one draft per task does by chance. This applies
     only to rules where your blind labels have earned the reader VETO. It never clears a finalist.
5. **Adopt.** Only with `--promote`, only on AUTO_PROMOTE, and only one change per round.

`--cap` is the whole round's budget, with a call ceiling for runtimes that have no known prices. A
round that runs out stops cleanly. It is recorded, and anything it built but did not finish judging is
marked untested, so it is not held against a retry. A move the cheap screen dropped is not re-proposed
by `optimize` on the same evidence, but it is never held against `fix`: a screen of the floor's tasks
is not your judgement of a complaint. A candidate left for you waits for `atelier promote` or
`atelier reject`, and `atelier fix` points there instead of building another.

Every proposal records who proposed it. `atelier optimize --report` compares how often reflection's
proposals are kept with the fixed ordering's. `atelier fix --reflect` runs the same comparison one
complaint at a time, and falls back to the fixed ordering when repair memory refuses reflection's
choice.

## Tending: the loop on a schedule

`atelier tend --skill <name> [--cap <usd>] [--auto]` runs everything below the standard, in order, and
ends with a digest of what happened and what waits for you:

1. **mine** what keeps going wrong (next section), recorded for `atelier mine --add`;
2. **taste**: what the reader has earned, and how many held-back readings wait for your label;
3. **floor**: whether a change could install itself, or the one command that sets it up;
4. **optimize**: one round, only when the floor is EARNED (a round that could install nothing is yours to
   run with `atelier optimize`). With `--auto`, a winner the promotion gate allows is installed (the
   previous version stays one `atelier rollback` away) and the other candidates of that round, built on
   the replaced version, are set aside. The floor must then be re-earned for the new version
   (`atelier floor --setup` again), and the digest says so.

It never adds, removes or rewords a rule. Run it by hand or from cron, for example weekly:

```
0 9 * * 1  cd /path/to/project && atelier tend --skill house-style --cap 5 --auto >> ~/.atelier/tend.log 2>&1
```

`atelier status --skill <name>` is the one-page view: rules (counted and read), which of the eight
dimensions they cover, what the taste reader holds, the floor's state, uses, what waits, and when the
skill was last tended.

## What keeps going wrong

`atelier mine --skill <name>` (`core/mining/recurrence.ts`) reads everything the loop has recorded and
lists what recurs, strongest first, each with its remedy.

| recurrence | what it is | remedy |
|---|---|---|
| gap | two or more complaints that say the same thing, about no rule the standard has | a rule to add, in your words or a proposed wording you approve: `--add <n> --materiality required\|preferred [--statement "…"]` |
| missed rule | complaints attributed to the same rule, again and again | the rule is not reaching the model: `atelier optimize`, or reword it with `amend` |
| broken draft | a measured rule the first draft breaks in at least half the runs on the current standard (with how often the loop repaired it) | the loop pays for it on every run; a different carrier may prevent it |
| lost meaning | a rule whose repairs keep being refused for changing what the text claims, charged to the rule each refusal was for | the rule may conflict with how you qualify claims; look at it with `amend` |

Complaints are grouped by the content words they share: at least two, covering at least 40% of the
shorter complaint's words, with average-link clustering so a chain of loosely related complaints does
not become one group. A gap takes the
wording `fix` proposed for one of its own complaints, unless that wording was ever declined. A gap a
rule was already added for is not offered again, and `--add` refuses a report made before the
standard changed. Nothing here calls a model unless you pass
`--phrase`, which asks one to word a rule for a gap that has none; the wording is a proposal like any
other. Listing changes nothing, and a gap becomes a rule only with `--add`.

## Rule keys

A rule's id (`p3`, `c2`) is its position in one discovery run. A second run numbers again from 1. The
**key** (`R-3f9a1c`) is the rule's identity across versions (`core/state/rule-key.ts`):

- **Measured rules:** the key comes from the observer, what it counts and which bounds it sets, never
  the thresholds. Tightening a cap is the same rule; a floor and a cap on the same thing are two. A list
  the contrast pass picks from your corpus carries a `role` ("connectives"), so a later run that picks
  a slightly different list still names the same rule.
- **Duplicates:** two rules in one standard with the same content key get `-2`, `-3` in order, so no
  lookup by key can silently lose one.
- **Other rules:** the key comes from the kind and the folded statement.
- **Amendments:** an amendment carries the key onto the new wording.

`--rule` accepts the id, the key (any case, with or without `R-`), or the rule's number in
`atelier plan`. `atelier history` lists, under each version, which rules were added, removed or
changed, and how.

## Write this, not that

When the loop in `atelier invoke` repairs a span and the pass is accepted, the before/after pair is
recorded with the broken rule's key and its exact check. (In Claude Code the host rewrites the whole
answer, so there is no verified span pair to record.) At build, up to six recent pairs (two per rule)
ship with the skill as `examples/contrast.md`, and only pairs that still teach the current standard:
- the rule is still live
- its check is unchanged
- where the rule counts words, the "after" has fewer of them than the "before"

Pairs are model output only, and the file says so. They never come from your corpus, from a run on a
task held back for the blind comparison, or from text quoting a held-back piece. They do not come from
the ratification ledger either: the ledger holds rule wordings, and a rejected rule must never reach the
model.

The pairs travel with the package that served them. A candidate rebuilt from a version carries that
version's pairs and exemplar, never whatever the store holds now. Turn them off with
`atelier build --contrast none`.

## Document class

Every threshold was read off one kind of document. `atelier build --class blog-post` records that
kind. `verify`, `invoke` and the MCP tool refuse text declared (`--class`) as another kind, and say
what they assumed when nothing was declared.
