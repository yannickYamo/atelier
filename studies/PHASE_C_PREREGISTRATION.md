# Pre-registration (DRAFT): Phase C, the external blind confirmation

**Status: DRAFT.** It is sealed only by the owner's commit, and only after:

- the three corpora exist;
- the two outside readers are named;
- the briefs and facts are written;
- the pilot has run;
- the two decisions marked **CONFIRM** below have been made.

## Question

Does Atelier's output sound more like an expert than the same model given the expert's own pieces and the
same guard, when read blind by someone who knows that expert's writing?

A second question, exploratory and deciding nothing: which of Atelier's counted features and profiles track
what the readers prefer and mark?

## Pairs

Three expert × skill pairs:

- the owner;
- two people the owner names.

For each expert:

- 15–20 pieces they wrote without AI help, in **one format** (the one they have most of);
- a skill built with `atelier new` from those pieces, with the expert ratifying the rules themselves;
- the pre-registration records who ratified, how many suggestions they took or overrode (`atelier status --skill`), the corpus hash and the skill version.

**CONFIRM (format):** one format per expert. Recommended: the format of which each has 15 or more pieces. Mixing formats in 15–20 pieces would give no format enough pieces for its own standard.

## Briefs and facts

- 12 briefs per expert, 36 in total, written before any generation and hashed here.
- Per expert:
  - 8 on the expert's usual topics;
  - 2 off-topic;
  - 2 thin-material (few facts).
- Each brief has a length target in the expert's usual range for the format.
- **Facts:** each brief carries a facts file (`facts/<brief>.md`), bound to every arm. For ATELIER, with `--with facts=<file>`. For CONTEXT_GUARD and GUIDE, pasted into the prompt, with the guard using the same file. The skill's stored material must be empty, so facts reach every arm the same way.

## Arms

`studies/harness/phase-c-generate.mjs`, writer `claude-opus-5`:

| Arm | What it is |
|---|---|
| **ATELIER** | `atelier invoke` as shipped: two drafts, the count-based choice, check and repair, the taste reader reporting only |
| **CONTEXT_GUARD** | the expert's readable pieces in the prompt, then `atelier verify --repair` on the same skill with the same facts |
| **GUIDE** | the model's own style guide from the same pieces, then a draft (secondary comparison) |

**Unequal on purpose.** ATELIER runs as shipped (two drafts and its selection). CONTEXT_GUARD gets the
same guard but one draft. Every arm's compute and cost is recorded.

**Length.** A draft more than 30% off its target is redrawn once. The final length is recorded, and
nothing is trimmed.

## Blinding

`studies/harness/phase-c-package.mjs`:

- Letters are shuffled freshly per reader and per brief from a cryptographic source.
- Keys are written to `sealed/keys.json`. Its sha256 is recorded here before any reader starts.
- Presentation is normalised (line endings, blank runs, HTML comments). The writing is not: tells are part
  of what is compared.
- Readers receive only `BRIEF.md`, `A.md`, `B.md`, `C.md`, `FORM.md` and `GUESS.md`. The packager refuses
  any other file.
- After ranking each brief, the reader guesses which letter is which. If ATELIER is guessed right
  significantly above chance (one-sided exact test at p = 1/3, level 0.05), the blind is reported as
  **broken**, and the primary result is read accordingly.

## Readers

For each expert:

1. **The primary reader** reads first: someone who knows that expert's writing and has not seen the standard.
2. **Then the expert** reads their own 12.

Readers use no model help, and hand in every form before any key is opened.

**CONFIRM (primary reader):** recommended, the outside reader with the standard withheld (the positions
paper, §8). The expert's own ranking is secondary.

## Primary endpoint and decision rule

- **The endpoint.** For each brief, a **win** if the primary reader ranks ATELIER above CONTEXT_GUARD.
  Rankings are strict, so there are no ties.
- **The rule.** H1 is supported if wins ≥ **24 of 36**: `signTestOneSidedP(24, 36) = 0.0326 ≤ 0.05`
  (core/stats/sign-test.ts). A missing or incomplete brief counts as a loss.
- **Power.** About 0.74 at a true 70% win rate, and 0.91 at 75%.
- **Clustering.** Briefs sit within three experts. Wins are reported per expert, with Clopper–Pearson
  intervals.

## Secondary (reported, not deciding)

- ATELIER against GUIDE.
- The experts' own rankings.
- Blinding: how often ATELIER was guessed right.
- Sentences marked machine-written, per 1,000 words, by arm.
- **Exploratory: which counted features and profile layers track the human ranks**, within arm. ATELIER's
  draft choice already uses its signals, so across-arm correlation would be circular.

## Pilot (before sealing, not counted)

One brief, about 4,000 words, three arms, packaged and read by one reader. This checks the pipeline, the
form and the reading load. Changes after the pilot are recorded here.

## Cost

Generation is about $60–110 for 36 briefs, and the pilot about $4. Building the two new skills is about
$10–30.

## Limits

- Three writers.
- One writer model.
- Readers chosen by the owner.
- The owner is one of the three experts.

[← studies](README.md)
