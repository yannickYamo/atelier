# Measured rules

Most of a standard is judgement: when to concede a point, what counts as enough evidence, how a
piece should end. Some of it is countable. A measured rule is a rule the owner ratified *with* a
deterministic check, and for those rules whether an output follows the rule is a fact, not an opinion.
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
   - the sentence-length mix
   - the function-word profile
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
- **It must separate you from the model.** Floors and mixes are proposed only if most of the model's
  drafts fail them. A rule that passes everything measures nothing.

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
  rewrite that loses one is refused, and the original sentence is kept.
- **Accuracy comes before style.** Rules marked `--phase ACCURACY` and invented claims (UNSOURCED, see
  `core/loop/claims.ts`) get their own first pass.
- **It changes the output, never the standard.** The loop has no authority to relax a target.

## The regression floor

A new implementation that fixes the rule you complained about can quietly make three others worse.
The floor notices (`atelier floor`, `core/distinctiveness/measured.ts`). Every measured rule that
applies everywhere is a dimension, scored by its own observer and turned so that higher is always
better.

| step | command | what it does |
|---|---|---|
| margins | `--corpus <folder>` (done by `atelier new`) | proposes a margin per rule: half the interquartile range of your own pieces on it. A change smaller than the difference between two of your typical pieces is not a regression of your voice. Every rule starts OBSERVE. |
| your call | `--margin <rule>=<n>`, `--enforce <rule>`, `--observe <rule>` | which rules may block a new version, and by how much |
| tasks | `--tasks <file>` | the tasks it is measured on, separated by blank lines; at least three |
| baseline | `--baseline` | fires the active version several times per task and freezes its scores |
| qualify | `--qualify` | A/A runs: the same version drafts twice as many times per task, and one half is compared with the other. Both halves are fresh in every run, so runs are independent, and each task is one trial. A task that regresses is a false alarm. The floor is EARNED when the exact upper 95% bound on false alarms is at most 5% and it catches planted regressions (below). With no false alarm at all, that bound takes 59 resolved task comparisons (twenty tasks over three runs, say). |
| check | `--check <version> [--target <rule>] [--promote]` | fires a candidate the same way. Each task gets a three-state verdict (REGRESSION, NONINFERIOR, INCONCLUSIVE), and the worst task decides. |

Counts are sparse, so two drafts that both used a word zero times show no spread at all. Each side's
spread is therefore taken as at least half the rule's margin. With three drafts a side, a drop of one
margin stays INCONCLUSIVE and a drop of two resolves.

A false-alarm rate says how often the floor blocks a version that is no worse, and that errs toward
safety. The failure that matters for letting it act alone is the other one: a worse version passed. So
qualification also plants a regression of **two margins** on each enforced rule in the same fresh A/A
draws, and requires the floor to catch at least 80% of at least 20 such plantings. A floor whose margins
are tighter than the writing's own variation fails this, and says so.

A qualification is a rate **of** one situation:
- this version of the skill and its standard
- the floor's margins and roles
- its frozen baseline
- the task set
- the runtime (provider, model, temperature)
- the number of drafts per task

Change any of them and the floor is no longer EARNED until it is re-qualified. That includes a
promotion, which changes the version.

What it authorises is the promotion gate's decision (`core/convergence/promotion.ts`), not the
floor's. A candidate installs itself only when all of these hold:
- the floor is EARNED
- the rule the repair was about improved **across tasks**. Each task counts once, however many drafts
  it had, and it takes at least three tasks.
- that rule is left out of the floor's verdict, since guarding the target with the floor would count
  it twice
- at least one **other** enforced rule is watching, and it held (NONINFERIOR) on every task. An
  INCONCLUSIVE task blocks as surely as a regression.

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
   - A reader that has earned VETO may block a finalist on a REQUIRED rule nothing measures (the
     first three such rules, on three of the floor's tasks). To earn it, it needs 30 comparisons with
     your own rulings on those rules, at least 5 each way, and agreement beyond chance: Cohen's kappa
     of 0.6, with a 95% lower bound of 0.4. A reader that always says "keep the old one" never earns
     it. It never clears a finalist.
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
