# The taste reader

Most of what makes writing someone's is not countable: how they argue, what they concede, which
figure carries a piece, how a section closes, when they let a conversational aside stand. Discovery
finds these as **reading-based rules** (every rule without a measurement). For a long time nothing
checked them after the model wrote: they were handed to the model as instructions or examples, and
the check, the repair loop, the regression floor and the optimizer all saw only the counted rules.
A draft could pass every count and still read as machine-written, and one did.

The taste reader is the instrument for those rules. This page is its design and its pre-registered
bars, written before any measurement and not to be retuned after one.

## What earlier attempts taught

Earlier LLM judges in this line of work failed in recorded ways, and the design follows from them.
The abstention result is in [MEASUREMENTS.md](../MEASUREMENTS.md). The others come from the private
predecessor's qualification runs and are reported here as findings, not as numbers this repository can
reproduce:

- **Rules with a checkable surface agreed with an expert; interpretive rules did not.** Four or five
  of five against one or two of five. So the reader must be able to say it cannot tell, and permission
  is earned rule by rule.
- **Asked to abstain, models do not.** Three prompt wordings produced no abstentions in 150
  observations. So abstention here is *computed*: a verdict that changes when the same text is shown
  differently is no verdict.
- **Verdicts moved under reformatting alone.** Two of nine changed when only headings or whitespace
  changed. So every reading is taken twice, once with the text reformatted and the rules reordered, and
  only agreement counts.
- **A judge that both scores and approves approves what it was optimised against.** So the reader can
  block and trigger a repair, never approve, and only after it has earned that on the owner's own
  rulings.

## How a reading is taken (`core/taste/reader.ts`)

1. **Applicability, blind to the output.** For a rule with a condition ("when the piece gives advice
   about a tool"), a separate call sees only the task and the condition, never the draft, so a reader
   cannot excuse its own miss as "did not apply". A rule without a condition applies.
2. **Behaviour, twice.** For each applicable rule the reader answers FOLLOWED, MISSED or UNCLEAR:
   - FOLLOWED must quote the passage that shows it.
   - MISSED either quotes the passage that breaks the rule (**presence**) or quotes nothing, when the
     text simply never does what the rule asks (**omission**).

   The second pass shows the same text with its markdown flattened and the rules in reverse order.
   Flattening removes heading, list and quote markers, emphasis and link syntax. Code (fenced blocks
   and inline spans) is left as it is.
3. **Checked, not trusted.** A quote must appear verbatim in the text it was taken from, whitespace
   and emphasis markers aside; a verdict whose quote is not there becomes UNCLEAR. A rule whose two passes disagree is
   UNSTABLE. Only FOLLOWED and MISSED that agree across both passes are readings.

**Cost.** Reading one text takes two calls, plus one when any rule has a condition. Once the reader
has earned VETO on some rule, `invoke` also reads each draft, the chosen draft after the counted
repair, and a taste rewrite again: at most three calls per draft plus seven, all inside the call
ceiling set before anything is spent. Applicability is decided once per task and reused. The reader
runs on the discovery model unless `--reader-model` or `ATELIER_READER_MODEL` names another (a
cheaper one is a reasonable choice), and on the target model when the discovery runtime has none.
If the reader fails (a rate limit, the budget), the output is still delivered, as the counted checks
left it, and the failure is said.

## How it earns authority (`core/taste/calibration.ts`)

The reader starts at OBSERVE: its readings are shown and recorded, and they change nothing.

**Labels come from the owner, blind.** `atelier taste --skill <name> --calibrate` shows a rule and the
passage a reading quoted, *without the reader's verdict*, and asks: followed, broken, or can't tell.
- **Held back, so the owner has not already seen the verdict:** a label is worthless if the owner
  saw the reader's opinion of the same passage a minute earlier. So about a third of readings
  (`ATELIER_TASTE_HOLDBACK`, decided from the reading's id alone) are held back: acted on exactly as
  usual, but no verdict is displayed; the output says the reading was held back. Only held-back
  readings are put to the owner.
- **Sampled blind to outcome:** every held-back reading with a quote, FOLLOWED and MISSED alike,
  oldest first.
- **Readings labelled once:** each is labelled only once. From a script, `--list` prints each reading
  under a stable token (`<reading>:<rule key>`) and `--label <token>=followed|missed|unsure` records
  it; a token is never reused, and one labelled twice in one command is refused.
- **Labels on the record:** labels are stored as events.
- **The author's own pieces are not labels:** a rule found in their work is followed in three of five
  pieces, not every one, so their pieces are never taken as ground truth for it.
- **Only blind labels count:** a label on a reading whose verdict was displayed (including every
  reading recorded before hold-back existed) earns nothing.
- **The one thing a held-back reading still shows:** whether a check failed. `verify --taste` exits 1
  and the MCP reply says `failed` when a rule the reader holds VETO on was missed, because a guard
  cannot hide that. With a single VETO rule that says which rule; nothing says where.

**The pre-registered bar for VETO**, fixed here before any data:

| | bar |
|---|---|
| What is bounded | the **false-block rate**: of the reader's MISSED readings the owner labelled, the share they labelled followed |
| Statistic | exact one-sided 95% upper bound (Clopper–Pearson) |
| Bar | at most **0.15** |
| Pooling | across all of a standard's reading-based rules, because no single rule gathers enough MISSED readings. Any rule whose own labelled MISSED readings are wrong in more than a third of at least three cases loses VETO on its own. |
| Also required | at least one confirmed MISSED reading: a reader that never blocks has earned nothing |
| Scope | the reader model, and each rule's exact wording. Change either and that rule is OBSERVE again. |

With no false block at all, 19 labelled MISSED readings meet the bar. CERTIFY is not available to the
reader at any bar: it can block, never approve.

## What counts toward VETO, and what never does

Only readings that quote a passage can be labelled quickly, so only they are put to the owner:
- a FOLLOWED with its evidence
- a MISSED of kind PRESENCE, where a passage goes against the rule

Only the second kind earns VETO: VETO bounds false blocks, and a false block is a PRESENCE miss the
owner says was followed. A FOLLOWED the owner says was missed is counted and shown, never used, since
the reader is never given authority to approve.

A MISSED of kind OMISSION ("the text never does this") has no passage to show the owner and none to
rewrite. It is always reported, and never acts.

## What VETO lets it do

- **Repair.** A MISSED reading with a quoted passage, on a rule holding VETO, becomes a repair target:
  the sentence or paragraph containing the quote. The rewrite goes through the same splice and the same
  meaning guard as every other repair, and it is kept only if all of these hold:
  - the counted rules do not get worse
  - the reader, asked again, reads that rule as FOLLOWED (a reader that can no longer tell has not
    confirmed anything)
  - no rule the reader had read as followed now reads as missed

  The meaning guard applies in full. A rewrite may not add or drop a "not" even to build the antithesis
  a rule asks for, so some taste repairs are refused and reported rather than made.
- **Draft selection.** With `--drafts N`, drafts are ranked first by how many VETO-holding rules they
  miss, then by the counts.
- **The optimizer.** Both versions draft once on four of the floor's tasks, and a finalist that misses
  a VETO-holding rule on at least two more tasks than the current version is rejected. VETO bounds the
  reader's error per reading, not per comparison, and with one draft per task a single extra miss is
  within chance.

Without VETO it does none of these. Its readings are shown after every `invoke`, returned by
`verify --taste` and the MCP tool, and recorded, and that is all.

## Where it runs

| Surface | What happens |
|---|---|
| `atelier invoke` | every output is read; the reading is printed (unless held back) and recorded as an event |
| `atelier verify --taste`, MCP `atelier_verify` with `taste: true` | the reading is returned (unless held back); a quoted miss on a VETO rule fails `verify` and sets `failed` in the MCP reply. If the reader cannot run, the counted report still comes back. |
| `atelier taste --skill <name>` | where each rule stands, the coverage map, and labelling (`--calibrate`, `--list`, `--label`) |
| `atelier optimize`, `atelier fix`, `atelier floor --check --promote` | a candidate that misses VETO rules on at least two more of four tasks than the current version is rejected instead of installed; if the reader cannot run, the choice goes back to you |
| `atelier improve` | readings of the skill's own output (an invocation) on rules where the reader holds VETO become behavioural observations for the convergence loop. An OBSERVE-only verdict is a report, not evidence, and a reading of someone else's text (verify, `--read`, MCP) is never evidence about what this skill does. |

`--no-taste` turns the reader off for one `invoke`. `--reader-model` or `ATELIER_READER_MODEL` chooses
the reader model, and permissions are scoped to it.

## The coverage map

`atelier plan` and the review screen sort every rule into what it is about: argument, evidence,
vocabulary, figure, pace, structure, register, cadence. They name the dimensions nothing covers. The
sort is a fixed, published keyword map (`core/taste/dimensions.ts`), not a model's opinion, so it can
be wrong about an unusual rule. When it is, it says so ("unsorted") instead of guessing.
