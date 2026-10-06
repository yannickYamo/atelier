# Pre-registration (draft): does the voice integrity gate refuse a rewrite that changed a claim?

**Status:** DRAFT, not sealed. Sealed by a public commit of this file before the first model call. After that no
line changes. Estimated cost: under $4 (the harness cap).

## The question

The voice pass rewrites a paragraph in the author's voice and keeps the rewrite only if a gate passes it
(`core/voice/integrity.ts`): the same facts on both sides, no claim made stronger, weaker or opposite, no copied
run, a length in range. [Decision 0009](../docs/decisions/0009-voice-below-the-standard.md) holds any trained voice
model until this gate "has been qualified against planted changes". It never has been.

The gate reads prose with a fact ledger and word lists. A second read by a small model
(`core/voice/reader.ts`) was added behind it; it must quote the words it objects to, and it can only refuse.

**Observed before sealing, offline, with no model:** on the 112 pairs of one skill's bank (a plain paragraph and
the author's paragraph with the same facts), the gate as shipped keeps 32 and refuses 80: 76 on the strength word
lists, 4 on length. The word lists read a hedge said in other words as a hedge lost. A gate that refuses seven in
ten faithful rewrites leaves the voice pass little to do, so this study reads three gates, not one.

## Material

One skill's pair bank (112 pairs: the plain paragraph, and the author's own paragraph carrying the same facts).

- **Clean (112):** the plain paragraph as the content, the author's paragraph as the rewrite. A refusal is a false
  positive: a paragraph of voice lost, never a fact. The plain side was written by a model from the author's, so a
  few pairs may truly differ in a claim. A person reads every clean pair, plain beside author, before any gate's
  verdict is shown (`plants-for-review.md`); a pair that truly differs is disputed, reported apart, and never counted
  against specificity.
- **Planted (60 paragraphs × 6 kinds):** the author's paragraph with one change of a known kind, made by a writer
  model (`claude-sonnet-5`, seeded choice of paragraphs) that must return the words it changed. Code checks the
  words are where it says (new in the plant, or gone from it: a claim is made stronger by taking a hedge out) and
  that the length stayed in range; a plant that fails is discarded and counted. Then a person confirms each plant
  is the kind it declares and changes what is claimed (`plants-for-review.md`); a plant they reject is left out.

  | Kind | The change |
  |---|---|
  | FACT_CHANGED | a figure, date or name becomes a different one |
  | FACT_ADDED | a specific claim the paragraph does not make |
  | FACT_DROPPED | a fact, figure or condition removed |
  | STRONGER | a hedge removed, "some" to "all", "may" to "will" |
  | WEAKER | a hedge added, "all" to "some" |
  | NEGATED | a claim turned into its opposite |

## The three gates

| Gate | Facts and length | Strength |
|---|---|---|
| `lists` (shipped in 1.1) | fact ledger, in code | word lists |
| `listsAndReader` (built) | fact ledger, in code | word lists, then the reader, which can only add a refusal |
| `ledgerAndReader` | fact ledger, in code | the reader in place of the word lists |

A reader that could not answer counts as finding nothing.

## Bars, read on each gate

- **Sensitivity:** at least 0.90 of valid plants refused, with the lower end of the 95% interval at 0.80 or above.
- **Every kind:** at least 0.75 of each kind refused.
- **Specificity:** at least 0.60 of clean pairs kept. A refused paragraph costs voice, not truth, so this bar is the
  lower one; below it the voice pass changes too little to be worth running.
- **Enough:** at least 200 valid plants, and at least 30 of each kind.
- **Reviewed:** the plants were confirmed by a person before the bars are read.

A gate **PASSES** when it holds all four.

## What changes with the result

- If `listsAndReader` passes, the gate stays as built and decision 0009's second condition is met.
- If only `ledgerAndReader` passes, the reader takes the word lists' place when a small model is available, and
  the word lists stay as the offline floor. The product holds that gate behind a setting, off by default, and it is
  turned on only on this result: `atelier fidelity --skill <name> --set voiceGate=reader`, for each author's skill,
  before the voice pass is run. No code changes for it.
- If no gate passes, the voice pass stays off by default with this result beside it, and the
  [voice pass study](VOICE_PASS_PREREGISTRATION.md) is not run: a gate that lets changed claims through, or keeps
  almost nothing, gives it nothing to measure.

## Limits

One author, one register. Plants are one change each, made by a model; a change spread over two sentences is not
tested. The clean pairs were selected by the bank's own fact check, so the fact ledger's false positives are
undercounted here.
