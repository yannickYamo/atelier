# Pre-registration: voice round 6 — confirmation of the machine-tell layer

**Status: SEALED by the commit that adds this file, before any round-6 output exists.** No bar below
may change after it. This is the one confirmation run the round-5 analysis called for: no redesign
follows a disappointing result (position paper §8b.6); a failure is reported as a failure.

## What is being confirmed

Commit c60f81b and after: a catalogue of the model's machine-writing moves held to each author's rate,
the contrast move counted in every spelling, a per-skill tell lexicon learned from the skill's own
drafts, repair that refuses a displaced or slotted sentence alone and retries, two drafts by default
ranked by machine moves, register counted on contractible forms. Nothing is tuned to one author: every
threshold is derived from the corpus a skill is built on, and the sensors were checked on three corpora.

Offline, on round 5's own drafts (studies/harness/guard-offline.mjs, $3.49): the guard halved machine
tells on every arm, raised REQUIRED rules held from 118/200 to 181/200, and left Atelier's drafts at
0.20 tells per 1,000 words, zero invented stories, 1.8 shared 6-grams.

## Materials

- The same corpus, briefs, six reserved pieces, length target and writer (`claude-opus-5`) as round 5.
- The skill: re-derived with the current code (store `voice6`), its tell lexicon learned before the run
  from six probe drafts on the author's own titles (`atelier tells --learn --probe 6`).

## Arms

| arm | what |
|---|---|
| RAW | "in the voice of <author>" |
| CONTEXT | the readable pieces in the prompt |
| CONTEXT_GUARD | CONTEXT's draft + `atelier verify --repair` with the round-6 skill |
| ATELIER | `atelier invoke` (two drafts, the fewer machine moves kept, check and repair) |

## The gate (ATELIER, across the five briefs)

1. Machine-writing moves (`MACHINE_TELL`) at most **2×** the author's rate over the whole corpus.
2. **0** invented first-person stories, **0** bracketed placeholders.
3. Under **10** shared 6-grams with the corpus per piece.
4. Every REQUIRED measured rule held in at least **4 of 5** pieces.
5. At least **6 of 7** positive features (first person, contractions, full forms, one-line paragraphs, bold,
   dash asides, rhetorical questions) inside the author's own range (10th to 90th percentile piece).
6. Stylometry (Burrows' Delta, reference: all 20 author pieces against RAW's drafts on the other briefs)
   **above RAW's** and within **0.03** of CONTEXT's. The reference includes pieces CONTEXT saw, which favours
   CONTEXT; this is stated, not corrected.

**Tracked, not gating:** the `claude-fable-5` ranking; the stylometry against the six reserved pieces only.

**Pass:** Atelier generates, with the guard; the README states the six measures. **Fail on 1–5:** the
machine-tell layer is not yet sufficient; reported as such. **Fail on 6 only:** Atelier is a guard over a
corpus-fed generator, and the README says so. The owner's blind read, if given, is reported beside all of
this and outranks the model judge.
