# Pre-registration: voice round 7 — confirmation, with the owner's blind read

**Status: SEALED by the commit that adds this file, before any round-7 output exists.**

## Why a seventh round

Round 6 (VOICE_ROUND6_PREREGISTRATION.md) failed its gate narrowly: machine-writing moves 0.26 per 1,000
words against a bar of 0.22, one invented story, stylometry 0.005 below RAW. Each miss traced to an
enforcement defect, fixed without changing the design (commits e631338, and after):

- a pooled cap let a long piece spend the author's small budget on moves they never make; families the
  author never uses are now banned, the rest held to their rate;
- a model offered a placeholder where it was told to cut an invented story; the prompt no longer offers
  slots, and a story whose rewrites all fail is cut outright;
- a sentence that is only a machine move could not be cut because it held a "not"; now it can, when it
  carries no figure and no name.

Post hoc, round 6's own drafts through the fixed guard met criteria 1 to 5. That is not a confirmation;
this round is.

## Criterion 6 replaced, and why

Round 6's criterion 6 (stylometry above RAW) could not discriminate: after the guard, RAW, CONTEXT and
ATELIER sat within 0.012 of each other, and the same measure put CONTEXT (the reader's favourite) level
with RAW. No model-free instrument available here separates these texts on voice, and the model judges
reward copying and fabrication. So the voice criterion is the owner's blind read. Stylometry and the
model judge are reported, not gating.

## Materials and arms

Same corpus, six reserved pieces, five briefs, length target and writer as rounds 5 and 6. The skill is
the round-7 store (the current code), its tell lexicon learned before the run from six probe drafts on the
author's own titles.

| arm | what |
|---|---|
| RAW | "in the voice of <author>" |
| CONTEXT | the readable pieces in the prompt |
| ATELIER | `atelier invoke` (two drafts, the fewer machine moves kept, check and repair) |

## The gate (ATELIER)

1. Machine-writing moves at most **2×** the author's corpus rate.
2. **0** invented first-person stories and **0** bracketed placeholders.
3. Under **10** shared 6-grams with the corpus per piece.
4. Every REQUIRED measured rule held in at least **4 of 5** pieces.
5. At least **6 of 7** positive features inside the author's range (10th to 90th percentile piece).
6. **The owner's blind read of briefs 1 and 5** (three versions each, letters shuffled): ATELIER ranked above
   RAW in **both**, and above CONTEXT in **at least one**.

**Tracked, not gating:** stylometry (all 20 author pieces as reference); the `claude-fable-5` ranking.

**Pass on all six:** Atelier generates with the guard; the README claims the six measures. **Pass on 1–5,
fail on 6:** Atelier is sold as the guard and the learning loop, over whichever generator the owner
prefers, and the README says so. **Fail on any of 1–5:** reported as a failure of the machine-tell layer.
