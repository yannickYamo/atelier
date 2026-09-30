# Pre-registration: voice round 5 — describe the voice, guard the edges

**Status: SEALED by the commit that adds this file, before any round-5 output exists.** Nothing below
may change after it.

## Why this round

Four blind rounds on one public author's corpus (20 Substack posts) found:

- rules alone never produced the author's voice (rounds 1–4);
- the version given the author's pieces in its prompt was ranked first every time, partly by lifting
  their lines (round 4: longest shared run 25 words, 68 shared 6-grams per piece);
- a model-written style guide came second with almost no copying (round 4);
- the rebuilt skill (21 required rules) was ranked fourth of five and read as a template;
- every repair pass that banned a tell displaced it onto a sibling at least once.

The design under test (commit 24d9d5f): a grounded persona with frequencies, whole pieces spanning the
author's modes, reading rules required only when nearly always followed, weak signature bands, a
register rule, a displacement guard, invented stories cut rather than slotted. Nothing in it is tuned to
this author: every threshold is derived from whatever corpus a skill is built on.

## Materials

- Corpus: the same 20 posts. **Six reserved** before discovery (the three of round 4, plus three chosen
  by `seededShuffle(rest, 5)`): no arm sees them; they are the stylometric reference and the judge's.
- Briefs: the five of round 4 (two on the author's topics, two adjacent, one off-topic), each with the
  author's usual length (the middle half of the readable pieces) written into it.
- Writer: `claude-opus-5` for every arm. Second-opinion judge: `claude-fable-5`.

## Arms

| arm | what | isolates |
|---|---|---|
| RAW | "in the voice of <author>" | floor |
| CONTEXT | the 14 readable pieces in the prompt | ceiling, with copying |
| CONTEXT_GUARD | CONTEXT's draft + `atelier verify --repair` | does the guard keep a voice and add hygiene? |
| GUIDE | a model-written style guide, then the piece | description without grounding |
| GUIDE_GUARD | GUIDE's draft + `atelier verify --repair` | the same, on the guide |
| ATELIER | `atelier invoke` on the round-5 build | the product |
| ATELIER_NO_PERSONA | the same build with `--persona none` | what the persona adds |

The guarded arms are the unguarded drafts, repaired: paired by construction.

## Measures (per output)

1. Stylometry: Burrows' Delta to the six reserved pieces against the model's own voice (RAW on the other
   briefs); positive is closer to the author.
2. Model judge: `claude-fable-5` ranks all arms of a brief against the reserved pieces, twice, in
   shuffled orders; mean rank.
3. Copying: shared 6-grams and the longest shared run with the corpus (`core/observers/overlap.ts`).
4. Honesty: invented first-person stories and unsourced figures (`core/loop/claims.ts`); bracketed
   placeholders.
5. Register and moves: contraction share, the contrast family and opener family per 1,000 words.
6. For the guarded arms: displaced families between draft and repair (`displacedFamilies`).
7. The skill's REQUIRED rules held.

## Decision rule

**Atelier is the generator** if ATELIER or ATELIER_NO_PERSONA, across the five briefs, meets all of:

- (a) a better mean judge rank than RAW **and** a higher mean stylometry than RAW;
- (b) a mean judge rank within **1.0** of the best of CONTEXT and GUIDE, and a mean stylometry within
  **0.03** of it;
- (c) under **10** shared 6-grams per piece, **0** invented stories and **0** placeholders across all briefs.

**The guard is kept** (on any generator) if CONTEXT_GUARD and GUIDE_GUARD each: hold more REQUIRED rules
than their unguarded drafts; lose no more than **0.5** mean judge rank and **0.02** mean stylometry to them;
and show **no** displaced family.

**Otherwise** the product generates from the corpus or a guide, with Atelier as the guard and the
learning loop, and the README says so.

A result below its bar is reported at the same volume as a pass. The judges are one model family; the
owner's blind read of two briefs, if given, is reported beside them and outranks them where they disagree.
