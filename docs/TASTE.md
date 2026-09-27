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
3. **Checked, not trusted.** A quote must appear verbatim in the text it was taken from, whitespace
   aside; a verdict whose quote is not there becomes UNCLEAR. A rule whose two passes disagree is
   UNSTABLE. Only FOLLOWED and MISSED that agree across both passes are readings.

Cost: two calls per output, plus one when any rule has a condition.

## How it earns authority (`core/taste/calibration.ts`)

The reader starts at OBSERVE: its readings are shown and recorded, and they change nothing.

**Labels come from the owner, blind.** `atelier taste --skill <name> --calibrate` shows a rule and the
passage a reading quoted, *without the reader's verdict*, and asks: followed, broken, or can't tell.
- **Sampled blind to outcome:** every recorded reading with a quote, oldest first.
- **Readings labelled once:** each is labelled only once.
- **Labels on the record:** labels are stored as events.
- **Author's work as a control, not ground truth:** an author's own pieces are *not* taken as
  ground truth for a rule, since a rule found in their work is followed in three of five pieces, not
  every one. They are reported as a control, never counted as labels.

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

Only readings that quote a passage can be labelled quickly, so only they earn or use VETO:
- a FOLLOWED with its evidence
- a MISSED of kind PRESENCE, where a passage goes against the rule

A MISSED of kind OMISSION ("the text never does this") has no passage to show the owner and none to
rewrite. It is always reported, and never acts.

## What VETO lets it do

- **Repair.** A MISSED reading with a quoted passage, on a rule holding VETO, becomes a repair target:
  the sentence or paragraph containing the quote. The rewrite goes through the same splice and the same
  meaning guard as every other repair, and it is kept only if all of these hold:
  - the counted rules do not get worse
  - the reader, asked again, no longer reads that rule as missed
  - no rule the reader had read as followed now reads as missed

  The meaning guard applies in full. A rewrite may not add or drop a "not" even to build the antithesis
  a rule asks for, so some taste repairs are refused and reported rather than made.
- **Draft selection.** With `--drafts N`, drafts are ranked first by how many VETO-holding rules they
  miss, then by the counts.
- **The optimizer.** A finalist the reader reads as missing a VETO-holding rule more often than the
  current version is rejected.

Without VETO it does none of these. Its readings are shown after every `invoke`, returned by
`verify --taste` and the MCP tool, and recorded, and that is all.

## Where it runs

| Surface | What happens |
|---|---|
| `atelier invoke` | every output is read; the reading is printed, recorded as an event and as a behavioural observation per rule (with the authority the reader held) |
| `atelier verify --taste`, MCP `atelier_verify` with `taste: true` | the reading is returned; a quoted miss on a VETO rule fails `verify` |
| `atelier taste --skill <name>` | where each rule stands, the coverage map, and labelling (`--calibrate`, `--list`, `--label`) |
| `atelier optimize` | a finalist that misses VETO rules more often than the current version is rejected |
| `atelier improve` | the recorded MISSED readings are behavioural evidence for the convergence loop, at the authority they were taken with |

`--no-taste` turns the reader off for one `invoke`. `--reader-model` or `ATELIER_READER_MODEL` chooses
the reader model, and permissions are scoped to it.

## The coverage map

`atelier plan` and the review screen sort every rule into what it is about: argument, evidence,
vocabulary, figure, pace, structure, register, cadence. They name the dimensions nothing covers. The
sort is a fixed, published keyword map (`core/taste/dimensions.ts`), not a model's opinion, so it can
be wrong about an unusual rule. When it is, it says so ("unsorted") instead of guessing.
