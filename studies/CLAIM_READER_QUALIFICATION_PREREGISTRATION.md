# Pre-registration: qualifying the claim reader (Phase B)

**Status: SEALED by the commit that adds this file, before any output of this study exists.**

## Why

UNSOURCED is a hard gate: a draft that states a specific the person did not supply is cut. Since 0.3.0 it is
read by a claim reader (`core/loop/claim-extract.ts`). A small model types every specific and quotes its
support, and code verifies each quote against the material. The positions paper's rule is
**discovered rule → qualified sensor → hard gate**, with no step skipped. It records an unsourced-figure
pattern that fired on 28 of 30 expert-perfect pieces (specificity 0.07) and was demoted. The reader has
never been measured. This study measures it, once, against thresholds fixed here.

## The instrument, frozen

- Reader: `claude-haiku-4-5`, prompt version **`a5c3ef8a`** (`READER_VERSION`, the hash of its instructions
  and schema). The harness refuses to run on any other version.
- Decision: `decideSpecifics` as merged in PR #23 (main at `1167747`).
- Harness: `studies/harness/claim-qualification.mjs`, sha256 prefix **`166568818eea1a77`** at sealing.
- **No tuning.** Nothing about the reader changes because of this study's test results. A changed reader is
  a different instrument, and it needs a new set of pieces to be qualified on. A sensor tuned against its
  own qualification corpus is unqualified by construction.

## Materials

Two corpora, 27 pieces:
- 20 public posts by the author of the voice rounds (in the study folder outside the repository);
- the owner's 7 pieces (`~/atelier-yannick-voice/corpus`).

The facts in both are the authors' own, whatever wrote the prose.

**The split is made before generation, by a seeded hash** (seed `claim-qualification-2026-09-28`): 5 pieces
are DEV and 22 are TEST. DEV only smoke-tests the harness; its results are reported apart and never
counted. **Up to two excerpts per piece**: whole paragraphs from a seeded start, about 350 words, not
overlapping.

For each excerpt:

1. **Clean draft.** A writer model (`claude-opus-5`) rewrites the excerpt as a fresh draft, keeping every
   fact and adding none. A rewrite that contains a number the excerpt does not is discarded (up to 3
   tries). The whole piece is the person's material, and the task is "Write a post based on my notes."
   Every specific in a clean draft therefore traces to the material.
2. **Planted draft.** The same writer inserts **one** invented sentence of a given kind into the clean draft
   and changes nothing else. The eight kinds rotate across excerpts:
   - a figure;
   - a dated event;
   - a named quotation;
   - an anonymous quotation;
   - an attributed statistic;
   - a figure with a link;
   - a first-person event;
   - a second-hand event.

   A plant is discarded (up to 3 tries) when:
   - the inserted sentence is not in the draft verbatim;
   - a numeric kind carries no number absent from the material;
   - a quotation kind has no quotation marks;
   - a linked figure has no link.

## Measures

- **Specificity** (reader, TEST): the share of clean drafts with **no** UNSOURCED flag, counted per draft.
  Any flag on a clean draft counts as a false positive. There are no post-hoc exclusions, even where the
  writer may have slipped a fact in (see Limits).
- **Sensitivity** (reader, TEST): the share of planted drafts where UNSOURCED flags the inserted sentence.
- Both are reported with exact 95% Clopper-Pearson intervals, per kind, and for the pattern check
  (`core/loop/claims.ts`) on the same drafts as a comparator.
- Descriptive only: with **no** material, the share of clean drafts in which the reader finds any specific.
  This is the extractor's recall on real specifics.

## Decision rule (TEST only, point estimates, the positions paper's W2 floors)

- **PASS**: reader specificity ≥ 0.80 **and** reader sensitivity ≥ 0.50.
  - The reader is qualified to gate on the population measured.
  - The README states the two rates and their intervals, and the whitepaper gets a dated amendment.
- **FAIL**: either one below its floor.
  - The gate stays fail-closed: it still cuts, because an invented specific in published work is the worse
    error.
  - The README and docs say it is unqualified, with the measured rates.
  - The next attempt needs a changed reader and new pieces.
- **INCOMPLETE**: fewer than 30 clean or 30 planted TEST drafts survive generation. Reported as such, with no
  verdict.

## Cost

A hard cap of **$12** across generation and reading (`--cap 12`). The estimate is about $5.

## Limits, stated before the result

- **Planted inventions are one sentence, written by a model asked to invent.** Real inventions are woven
  into sentences that also carry true content, and may be subtler. Sensitivity here is an upper bound for
  subtle cases.
- **The writer may add a non-numeric fact while rewriting.** Only added numbers are screened out. Any
  such slip counts against the reader's specificity, so the estimate is conservative. Flagged clean drafts
  are listed in the result for inspection. They are not excluded.
- **Everything is Claude.** The writer, planter and reader all share one family.
- **Two authors, one genre family** (technical essays and product strategy). Formats like financial reports
  and contracts are not covered.
- The owner's corpus is partly AI-assisted in its prose. That does not affect whose facts they are.

## Record

Results go in `studies/CLAIM_READER_QUALIFICATION_RESULT.md` and in the CHANGELOG under *Studies*, whatever
they are. The drafts, plants and readings stay in the result JSON on the owner's machine, and their
hashes go in the result file.
