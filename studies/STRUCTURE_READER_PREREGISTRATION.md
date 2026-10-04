# Pre-registration: qualifying the structure reader

**Status: SEALED by the commit that adds this file, before any output of this study exists.**

## Why

A study of AI fiction told human from model stories at 93% F1 on narrative structure alone, and found model
stories clustered in one region (arXiv 2604.03136). Atelier's counted features sit at the level of words and
sentences, where model drafts already look typical one at a time (decision 0010). The first reader of the deeper
layers, the move reader, failed its qualification: what it read reliably did not separate the author from the
model, and what separated could not be read twice the same way
([SENSOR_QUALIFICATION_RESULT](SENSOR_QUALIFICATION_RESULT.md), C2).

The structure reader asks a narrower question, per paragraph instead of per piece: which of eleven moves the
paragraph makes (claim, explain, example, evidence, story, concession, definition, instruction, question, turn,
summary). It reads every text twice and keeps only the moves both reads agree on. Features come from the
sequence: the share of explaining, of showing, of each move, the entropy rate of the move chain, how often the
move changes, how often a claim is followed by something shown, whether the piece ends by summing up.

Before any of these features may steer a draft, they have to be read the same way twice and separate the author
from the model on pieces and drafts nothing chose them on.

## Development, stated

- The reader was developed on two documents outside every study (a design document and a documentation page):
  the label set, the two-read rule, the mapping of near-miss labels ("EXPLANATION" to EXPLAIN), and the entropy
  rate's prior (lowered from 0.5 to 0.05 when every short text read near the maximum).
- None of the study's texts were read before this file was committed.

## The instrument, frozen

- Structure reader `9a0bb843` (`claude-haiku-4-5`, temperature 0, two reads, the second with the moves listed in
  reverse). The harness refuses any other version.
- Features as in `core/structure/features.ts` at the sealing commit.
- Harness: `studies/harness/structure-qualification.mjs`, sha256 prefix **`7922f9dd1737173d`**.

## Materials

- **Primary.** The sensor study's 40 newsletters and its 40 model drafts, from its cache: nothing new is
  written. The split is the sensor study's, by its seed: INNER 16, INNER HELD 8, OUTER 16; drafts A 24 (beside
  INNER and INNER HELD) and B 16 (beside OUTER). This is the corpus the move reader failed on.
- **Secondary, reported without a verdict.** A technical author's 20 posts, split as a skill's discovery split them
  (12 read, 5 held back, 3 reserved), the 12 model drafts discovery wrote beside them (A), and 20 drafts of the same
  author's briefs written plain or with the author's posts pasted in (B).

## Measures and decision rules

- **Reliability.** 20 texts (10 INNER pieces and 10 A drafts) are read a second time, independently. A feature is
  reliable if its rank correlation between the two readings is at least 0.70. The two-read κ per text is reported.
- **Selection and replication.** Features go through the product's selection (INNER, INNER HELD, A; |AUC − 0.5| ≥
  0.25 and the other thresholds of `core/observers/selection.ts`). A kept feature replicates if its AUC on OUTER
  against B lies on the same side of 0.5 and at least 0.15 from it.

| verdict | condition |
|---|---|
| **PASS** | at least 3 features are reliable, kept and replicate. They may then join a skill's profile as signals (never rules), in a later change |
| **FAIL** | anything less. The reader stays a monitor, and plan-first generation is built without a qualified structure target |

## Cost

Hard cap: **$6**. Estimated: about $3 (about 250 reads by a small model).

## Limits

- One house style for the verdict; the second author is descriptive only, with 8 unseen pieces.
- Everything is Claude: the author's drafts, the model's drafts and the reader.
- Separation is from one model's plain drafts. Whether a person hears these features as "written by them" is the
  sealed study's question.

## Record

The result goes in `studies/STRUCTURE_READER_RESULT.md` and the CHANGELOG, whatever it is.
