# Pre-registration (draft): does a small model find an author's pieces on a request's subject, and the document a request names, better than word matching?

**Status:** DRAFT, not sealed. Sealed by a public commit of this file and of `harness/subject-reader-sets.json`
before the first model call. After that no line changes. Estimated cost: under $2 (the harness cap).

## The question

Five parts of a run weigh "the author's pieces nearest the request": the passages shown to the writer, the
typical-of-you reading, the range for the subject, the plan-first skeleton and the register monitor. All five used
a TF-IDF cosine. In the context-bands study, title-only requests were near anything at all for 12 of 36 newsletter
texts ([CONTEXT_BANDS_RESULT](CONTEXT_BANDS_RESULT.md)).

`nearness=reader` has a small model read the subject instead (`core/fidelity/subject-reader.ts`): a subject card per
piece, written once from its body, and one graded reading per request (`same`, `related`, or left out), validated
in code. The same small model, through the context judge, quotes the document type a request names
(`core/voice/register.ts`), where a nine-pattern word table decided before.

By [decision 0003](../docs/decisions/0003-authority-by-measurement.md) a reader is measured before it is relied
on. This measures both readings. Neither gates or cuts: nearness chooses which of the author's own passages are
shown and which pieces a reading weighs; the register reading decides which traits are withheld out of register.

## Material

The two corpora of the indistinguishability study, the pieces each skill read (12 and 24). Each piece's title line
is removed before its card is read, and the grader sees numbered cards with no file name.

Three request sets per corpus, each in the study's brief form (`Write a blog post titled "<title>". About <n> words.`):

- **Known item:** the title of each read piece. That piece is on the request's subject by construction.
- **Unseen:** the titles of the held-out pieces (8 and 12): the requests the earlier studies ran.
- **Far:** ten titles on subjects neither corpus holds, listed in `harness/subject-reader-sets.json`.

And one set for the register: 40 requests with the document type each names, or none, in the same file. It was
written by the people who built the reader, with traps the word table is known to fall for (a document type named
as the subject, a document word used as a verb). That is a limit, stated here: the set favours the reader on the
traps and is fair on the rest.

**Observed before sealing, offline:** on that set the word table is right on 25 of 40.

## Readings and bars

Each request is graded twice by the reader (temperature 0, no cache between the two).

| Reading | Measure | Bar |
|---|---|---|
| Known item | share of requests whose own piece is graded `same` (reader), or is among the near pieces (words) | reader at least 0.80, and at least the words' share |
| Selectivity | median share of the corpus the reader calls near on a known-item request | at most one third (a reader that calls everything near passes the first bar and fails this one) |
| Coverage | share of unseen requests near two or more pieces | reader at least 0.80, and above the words' share |
| False near | on far requests, share of (request, piece) pairs graded `same` | at most 0.05 |
| Repeatability | Cohen's kappa of near or not, first read against second, over every (request, piece) pair | at least 0.80 |
| Register | share of the 40 requests whose document type is read right | reader at least 0.90, and at least the table's share |

A grading that fails is counted, never skipped. If more than one reading in twenty fails, both verdicts are
**UNRESOLVED**, whatever the bars say of what came back; a share that could not be computed holds no bar.

**Subject reader: PASS** when the first five bars all hold. **Register reading: PASS** when the sixth holds. The two
verdicts are separate.

## What changes with the result

- **Subject PASS:** `nearness=reader` is listed in docs/INSTRUMENTS.md as qualified on these two corpora. It stays
  opt-in: the default release is pinned ([decision 0008](../docs/decisions/0008-one-point-zero-is-the-floor.md)).
- **Subject FAIL:** it stays opt-in with this result beside it, or is removed if it is worse than words on the known
  item.
- **Register PASS:** the judge's reading stays as built (it already decides when there is a judge).
  **Register FAIL:** the word table decides again and the judge's reading is recorded as a monitor only.
- Whether better nearness moves outputs toward the author is not this study's question. The context-bands study
  found it does not move the machine reading, and nothing here claims otherwise.

## Limits

Two authors, both technical writing. Known-item retrieval is the easy case. Coverage has no ground truth: a request
may honestly be near nothing, which is why the far set and selectivity sit beside it.
