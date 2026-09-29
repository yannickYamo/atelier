# Taste across formats

Taste works at several depths, and the shallow ones are the easiest to fake. Each depth needs its own
sensors, measured against the author's own range. This page maps those depths to what Atelier measures
today, then says what changes from one format to the next.

## The sensor contract

Every feature below becomes a rule through the same path, whatever its depth:

1. **Extract.** A deterministic count (M), a reader following a written rubric (R), or both (H).
2. **Band.** The author's range comes from their own pieces of *this format*, measured per piece. The
   band is checked on both sides: a floor with no ceiling produced a first-person rate of 14.1 per
   1,000 words against the author's 6.5.
3. **Contrast.** A feature only carries taste where the author and the model differ, so it is compared
   with the model's plain drafts on the author's topics.
4. **Qualify.** The feature must pass the author's held-back pieces and catch the model's drafts.
5. **Earn authority.** OBSERVE, then VETO, then CERTIFY, each earned separately
   ([AUTHORITY.md](AUTHORITY.md)). A discovered rule becomes a qualified sensor before it becomes a
   hard gate, and never by skipping a step.

The owner approves the rule. A sensor never adds one.

Steps 1 to 4 are one pipeline for every counted feature (`core/observers/selection.ts`). A feature that
passes becomes a RULE if its band tells single drafts apart, or a SIGNAL if only the distributions differ
([MEASURED-RULES.md](MEASURED-RULES.md#counted-features-and-which-of-them-are-your-taste)). `atelier verify
--profile` reports a text layer by layer, not as one number.

## The eleven layers, and where Atelier stands

| layer | what is measured | how | in Atelier today |
|---|---|---|---|
| 1. Punctuation and typography | dashes, semicolons, question marks, contractions, spelling, bold, headings | M | `PATTERN_RATE`: dashes, dash asides, semicolons, rhetorical questions, contractions and full forms, spelling, bold spans. `HEADINGS`: case and tropes. `FEATURE`: colons, parentheses, exclamations, ellipses, questions, italics, quoted phrases, the serial comma, small numbers as digits |
| 2. Sentence architecture | length distribution, cadence, openers, fragments, parallelism | M/H | `SENTENCE_LENGTH`, `DISTRIBUTION` (length mix), `RHYTHM` (variation), repeated and stock openers. `FEATURE`: short and long sentence lengths, cadence (lag-one correlation), conjunction, self and deictic openers, passives, nominalisations, three-item lists. *Not yet:* syntax depth (needs a parser) |
| 3. Paragraph and document pace | paragraph lengths, one-line paragraphs, section shape, opening and closing moves, length | M/R | `PARAGRAPH_LENGTH`, one-line paragraphs, `OPENING`, `CLOSING`, `HEADINGS`, and the format's length band ([formats](#formats)). `FEATURE`: list items, links, code blocks, block quotations. The type of opening and closing move and register rotation are in the move reader (a candidate, below) |
| 4. Lexicon and wording | signature phrases, function words, hedges, boosters, pronouns, the author's verbs | M | `LEXICON`, `TERM_RATE` (connectives, the model's stock vocabulary), hedges, `FIRST_PERSON`, `STYLE_DISTANCE` (Burrows' Delta on function words). `FEATURE`: lexical diversity (MTLD), word length, "you", "we", tentative and firm modals, figures, names, spoken discourse markers. *Not yet:* the author's signature verbs |
| 5. Figures and rhetoric | metaphor families, analogy, antithesis, aphorism, humour, coinage | R/H | The contrast verdict (`CONTRAST_VERDICT`, `NOT_X_ITS_Y`) is counted. The move reader (a candidate) types figures and their domains, aphorisms and humour, but its figures were unstable on a re-read in development. The rest go to the taste reader ([TASTE.md](TASTE.md)), which reports until your labels qualify it |
| 6. Argument engine | the author's moves and how often they make them, what counts as proof, what they refuse | R | Reading rules, served with their frequency ("moves I sometimes make", capped per piece). Checked by the taste reader |
| 7. Narrator and stance | person and tense, self-disclosure, authority style, directness | M/R | First person as a band. Candour prefaces are counted in the machine-tell catalogue. The rest goes to the reader |
| 8. Content signature | obsessions, where examples come from, callbacks, the bridge back to the home thesis | R | Served through whole pieces and the persona. *Not yet counted* |
| 9. Sound and prosody | readability, comma density, runs of monosyllables | M | `FEATURE`: reading ease, commas per sentence, runs of five one-syllable words. *Not measured:* sentence-final stress and alliteration (they need a pronunciation dictionary) |
| 10. Irregularity | polish variance, idiosyncratic errors, unevenness between sections | M | `FEATURE`: how uneven sections and paragraphs are. *Not measured:* polish variance and consistent misuses (they need a grammar checker) |
| 11. Negative space and model contrast | the learned tell lexicon, the author-to-model ratio, substitute forms, weighting by position | M | Machine-tell catalogue (14 families) held to your rate. Learned lexicon (`atelier tells --learn`). Every capped mark carries its substitute forms (a dash aside, whatever the character). Opening and closing are weighted by position |

**The move reader** (`core/taste/moves.ts`) is a candidate for layers 3, 5, 6, 7 and 8. A small model types
each paragraph: its register, its figures and where they come from, whether it concedes, lands an
aphorism, calls back or jokes, and how it gives evidence. It also types how the piece opens and closes, and
which argumentative moves it makes. Code verifies every quote and counts. It was qualified and **failed**
([result](../studies/SENSOR_QUALIFICATION_RESULT.md)). Some of its features are reliable but don't
separate (openings, closings). Others separate but aren't reliable (figures). It stays parked. Whether any
sensor tracks what a reader hears in these layers is Phase C's question.

The deep layers (5, 6 and 8) are where "sounds like them" lives, and a count cannot reach them. They
are read, and the reading gains authority only from your blind labels. The shallow layers are cheap
and necessary; they are also the ones a model fakes first.

## Formats

A standard describes one class of document, because its thresholds were read off your pieces of that
class. **Genre conditioning is one standard per format, built from your pieces of that format**, and
declared with `atelier build --class <format>`. When the class names a known format, its profile adds
the facts no author's taste decides:

| format (`--class`) | a hard limit (fails the check) | usual length (warns) | specifics |
|---|---|---|---|
| `x-post` | 280 characters | 5 to 60 words | the person's, or public |
| `linkedin-post` | 3,000 characters; the hook should land before the fold (about 210 characters, warns) | 60 to 600 words | the person's, or public |
| `blog-post` | none | 500 to 5,000 words | the person's, or public |
| `book-chapter` | none | 1,500 to 12,000 words | the person's, or public |
| `one-pager` | none | 200 to 1,000 words | **the person's only** |
| `white-paper` | none | 2,000 to 12,000 words | **the person's only** |
| `financial-report` | none | none | **the person's only** |
| `contract` | none | none | **the person's only** |

In a format marked "the person's only", the claim check cuts a figure, date or fact unless your material
or your task supplies it, even when it reads as general knowledge. A profile never adds a rule to your
standard and never changes what the model is told: it changes how a draft is checked.

### Where each format's taste mostly lives

| format | layers that carry most of the taste | what is still to build, and would need evidence first |
|---|---|---|
| X post, LinkedIn post | 1, 2, 4, 11, and the opening move (3) | the hook read as its own position; hashtag and emoji rates |
| blog post | all eleven | register rotation; callbacks to your earlier pieces |
| book chapter | 2, 5, 7, 8, and consistency across chapters | a continuity ledger: names, dates and facts checked against the book's own bible (the invention floor for fiction and memoir) |
| one-pager | 3 (sections, calls to action), 4 | social proof (logos, counts, testimonials) held to the person's material, which the strict claim check already covers |
| white paper | 6 (argument), the evidence habit, 3 | citation shape: a named source, n, date and caveat for each claim |
| financial report | the evidence habit, hedging and forward-looking language | arithmetic consistency (totals, deltas, percentages), which is deterministic |
| contract | defined terms, cross-references, clause inventory, fallback positions | defined-term consistency and cross-reference resolution, which are deterministic; the clause playbook read against the owner's own |
| code | naming, function size, comment voice, error idioms, test style, a never-list | reuse the compiler, the tests and the linter as sensors (they are objective); an unresolvable import is the invention floor |

None of the rows in the last column is claimed yet. Each one ships when it can be qualified, following
the order above.

[← back to the README](../README.md)
