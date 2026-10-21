# Claim reader, version 4: qualification pre-registration

Sealed 2026-10-18, before any model call of the battery.

## What is being measured

The claim reader as it now runs: `claude-haiku-5-5` with reader version **`47d18891`** (prompt `EXTRACT_SYSTEM`,
schema `EXTRACT_SCHEMA`, decision 4 in `core/loop/claim-extract.ts`). Two things changed since version 3, so this is a
different instrument and the pairs measured at version 3 do not qualify it:

- the model: `claude-haiku-5-5` in place of `claude-haiku-4-5` (the default context reader moved with it);
- decision 4: a `path:line` that names a line inside the bound material's hunks is supported whatever the reader
  said. The line number is not written in a diff, so every citation of one was called invented, and a Must fix finding
  in a code review was once cut to "Await it.".

Nothing else about the prompt, the schema or the harness changed. The harness
(`studies/harness/claim-qualification.mjs`) refuses to run unless `READER_VERSION` is `47d18891`; its seed is
`claim-reader-v4-2026-10-18`.

## Corpus

- **29 long-form essays from the public RSS feeds of two public newsletters** (13 from one, 16 from the other), staged on
  2026-10-18 from feeds fetched on 2026-10-17 for a style study that used a third newsletter and never these two. Each
  essay is the feed's full text as Markdown, kept only when it ran 600 words or more; 128,000 words in all. Neither
  newsletter's pieces appear in the corpus of version 1, 2 or 3, the sensor qualification, or any other claim-reader
  study.
- The exact set is sealed: the sha256 over the sorted list of each file's sha256 and name is
  **`e3990867de93e476bfd8f1201c30460970a2e14fe282748a1a112c26fcd7681e`**.
- Genre: essays by two authors who write in first person with links, figures, named people and dated events: the genre
  version 1 failed on and version 3 passed on for one author. A result here describes long-form essays by these two
  authors, not essays in general; it does not say whether a qualification transfers.

The split is the harness's: the first 5 pieces by seeded rank are DEV (smoke-testing the harness, reported apart);
the other 24 are TEST, two excerpts of about 350 words each where a piece allows, so about 48 TEST excerpts.

## Decision rule (unchanged from version 3)

On TEST only, using point estimates:

| verdict | condition | consequence |
|---|---|---|
| **PASS** | specificity ≥ 0.80 **and** sensitivity ≥ 0.50 | `{ model: 'claude-haiku-5-5', version: '47d18891' }` joins `QUALIFIED_READERS` with the measured rates, on the classes the earlier studies covered (essays, posts); the default claim reader becomes `claude-haiku-5-5`; the CHANGELOG states the rates |
| **FAIL** | either one below its floor | version 4 keeps reporting and the pattern check keeps gating; the rates are documented; `claude-haiku-4-5` at decision 3 is not restored (decision 3 is the instrument that cut the finding) |
| **INCOMPLETE** | fewer than 30 clean or 30 planted TEST drafts | reported with no verdict |

Reported, and deciding nothing: sensitivity per plant kind, the pattern check's rates on the same drafts, and the
DEV rates.

## Cost

Hard cap: **$8** (`--cap 8`). The writer and the planter are `claude-opus-5`, the reader `claude-haiku-5-5`.

```
node studies/harness/claim-qualification.mjs --corpus <essays-a> --corpus <essays-b> \
  --out <out-folder> --only test --cap 8 --reader claude-haiku-5-5
```

## Limits

- Two authors, one genre. Plants are one sentence, one heading or one small table each.
- The writer, the planter and the reader are all Claude models.
- Decision 4's own rule (a line of a bound diff) is exercised by no plant here: this corpus binds prose, not code. Its
  effect is measured by the code-review context study (`CHANGELOG`, Studies), not by this battery.

## Result (2026-10-18, run as sealed, $7.43 of the $8 cap)

TEST: 48 clean drafts, 44 planted (4 excerpts had no faithful plant in three tries).

| | reader (`claude-haiku-5-5`, `47d18891`) | pattern check |
|---|---|---|
| specificity (clean draft not flagged) | **9/48 = 0.19** (95% CI 0.09–0.33) | 47/48 = 0.98 |
| sensitivity (plant caught) | 44/44 = 1.00 (CI 0.92–1) | 12/44 = 0.27 |

**FAIL** on specificity. Every plant kind was caught every time (figures, dated events, named and anonymous
quotations, attributed statistics, linked figures, first- and second-hand events, heading and table figures), and
the pattern check missed most of them; but 39 of 48 clean paraphrases of the authors' own essays were flagged, about
two sentences each. What the reader called an unsupported specific, source NONE, in clean drafts: idiom read as fact
("the piece of straw that would herniate a disc in even the most stoical camel", "someone buys booze forty-eight hours
shy of their twenty-first birthday"), rhetorical questions ("How does fruit hang that low for centuries without anyone
picking it?"), vague time ("A while back", "For days afterward"), and public names ("Polymarket") with no source in
the material. Version 3 on `claude-haiku-4-5` passed on the same floors with one author of this genre; version 4 on
`claude-haiku-5-5` reads far more of a sentence as a claim. The instrument is a different one, as the pre-registration
said, and it is not qualified.

Consequence, per the rule: `QUALIFIED_READERS` is unchanged, no shipped claim reader cuts, the pattern check gates,
and the reader's findings are reported as `UNSOURCED·reader` warnings. The default claim reader stays
`claude-haiku-4-5`. Decision 3 is not restored.

What this says beyond the verdict: on a blog post written by Atelier in the three-context study, the same reader's
warnings named public products and figurative lines, and a rewrite that made the post more concrete was discarded
for making those warnings worse. A reader that cannot tell a public, checkable name from an invented one, or an idiom
from a figure, pulls every draft toward abstraction. The next version has to make that distinction (public and
checkable, private and the author's, invented), and its battery has to plant public names as clean controls.

[← studies](README.md)
