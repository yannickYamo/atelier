# Pre-registration: qualifying the claim reader, version 3

**Status: SEALED by the commit that adds this file, before any output of this study exists.** It is run only
with the owner's go-ahead for the spend.

## Why a third attempt, when version 2 said there would be none

The [version 2 pre-registration](CLAIM_READER_V2_QUALIFICATION_PREREGISTRATION.md) said: "there is no third
attempt before Phase C." That promise is broken here, and the reason is stated rather than hidden.

Version 2 passed ([result](CLAIM_READER_V2_QUALIFICATION_RESULT.md)). This is not a retry of a failure. The
pre-Phase-C audit (CHANGELOG, *Unreleased*) then found defects in the instrument that version 2's study
could not see:

- it never read headings or table rows, so a figure there was never checked;
- it could cut a true story written in markdown;
- a reader failure partway through a repair could ship a flagged claim as fixed.

Fixing them changed the instrument (`DECISION_VERSION` 3). A changed instrument is a different instrument, so
version 2's qualification does not carry over, and the product already treats version 3 as unqualified: it
reports and the pattern check gates. This study falls under the positions paper's §8b.6 exception, "an
implementation bug invalidates existing evidence". It was not opened because a result disappointed.

**Phase C does not wait on it.** This study decides only whether version 3 may cut in the product.

**This is the last attempt before Phase C.** If version 3 fails, the pattern check keeps gating and the
failure is recorded. No fourth version is qualified before Phase C closes.

## What changed since version 2 (the decision in code)

`DECISION_VERSION` 3, in `core/loop/claim-extract.ts`:

- headings and table rows are units the reader reads (`claimUnitsOf`, `core/loop/claims.ts`);
- markdown is stripped before matching, and a story may span the sentences of one paragraph;
- compound and scaled numbers are read ("twenty-five" is 25; "fourteen" is not "four"; "one million" is not
  "3 million").

Instrument version: **`a173339d`** (`READER_VERSION`: the prompt, the schema and the decision version). The
reader is `claude-haiku-4-5`. The harness refuses any other reader version.

## What changed in the harness

`studies/harness/claim-qualification.mjs`, sha256 **`b36a546bfa97f8009c8bbb67317c9eb6bbf22f675c21b8d4d6542875ce637ce3`**:

- the sealed version is `a173339d` and the seed is `claim-reader-v3-2026-09-29`;
- **excerpts keep their headings.** A heading never starts an excerpt and does not count toward its length. On
  this corpus, 39 of the 50 TEST excerpts carry a heading, so true figures in headings reach the clean drafts
  (specificity);
- the paraphrase keeps headings as headings and tables as tables;
- **two plant kinds are added**: `HEADING_FIGURE` (an invented figure in a `##` heading) and `TABLE_FIGURE`
  (an invented figure in a cell of a small inserted table). There are ten kinds, assigned in rotation as
  before.

Everything else is version 1's protocol unchanged ([pre-registration](CLAIM_READER_QUALIFICATION_PREREGISTRATION.md)):
the DEV/TEST split (5 DEV pieces), two excerpts of about 350 words per piece, a clean paraphrase that must keep
every number, one planted invention per clean draft, the reader against the pattern check, TEST only for the
verdict.

## Materials: pieces no study has used

- **30 product essays from a public newsletter**, staged on 2026-09-29 in a local folder from the 349
  in a local archive of that newsletter. No record was kept of how the 30 were drawn, so the draw cannot be
  re-run; what is sealed instead is the exact set. The sha256 over the sorted list of each file's sha256 and
  name is **`5b0dfcdd99656609c3754adba3ea0d8f43b54b7306b9ab30a45a3129fcdba73c`**.
- None of the 30 file names appears in any earlier study's corpus (version 1, version 2, the sensor
  qualification).
- This is the essay genre, where version 1 failed. It is a different author from version 1's essays (one
  public technical author and the owner), so a result here describes product essays by one author, not
  essays in general.

A dry run of the split, offline and with no model call, gives 25 TEST pieces and 50 TEST excerpts.

## Decision rule (unchanged)

On TEST only, using point estimates:

| verdict | condition | consequence |
|---|---|---|
| **PASS** | specificity ≥ 0.80 **and** sensitivity ≥ 0.50 | `{ model: 'claude-haiku-4-5', version: 'a173339d' }` joins `QUALIFIED_READERS`; the README, docs/MEASURED-RULES.md and the CHANGELOG state the rates and the population; the whitepaper gets a dated amendment |
| **FAIL** | either one below its floor | version 3 keeps reporting and the pattern check keeps gating; both are documented with every version's rates; no further attempt before Phase C |
| **INCOMPLETE** | fewer than 30 clean or 30 planted TEST drafts | reported with no verdict |

Reported, and deciding nothing: sensitivity per plant kind, with the two new kinds named, and the pattern
check's rates on the same drafts.

## Cost

Hard cap: **$8** (`--cap 8`). Estimated: about $5.

```
node studies/harness/claim-qualification.mjs --corpus <essays-folder> \
  --out <out-folder> --only test --cap 8
```

## Limits

- One author and one genre, product essays with headings.
- Plants are one sentence, one heading or one small table each; real inventions can be subtler.
- The writer, the planter and the reader are all Claude models.
- Version 2 was qualified on technical and marketing writing, and version 1 failed on other essays. No
  instrument has yet been measured on two populations, so nothing here says whether a qualification transfers.

[← studies](README.md)
