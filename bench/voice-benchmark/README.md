# voice-benchmark: long posts in an author's voice, measured the same way for every arm

One frozen benchmark, read before any change is judged. Each change to how Atelier writes names the one number here
it must move; a change that does not move it is reverted.

## What it needs

- **The author's pieces**: a folder of five or more of their posts (`.md` or `.txt`), never shown to the judge with
  an arm's name.
- **The tasks**: 8 to 10 reaction posts, each a news hook and a brief of 8 to 10 points. Held-out pieces of the same
  author make good tasks: the title and a two-line brief taken from the first paragraph.
- **The material** each task was written from (the notes the brief came from).
- **The outputs of each arm**, one folder per arm, one file per task, the same file names in every arm. Arms:
  pasted examples plus the method; Atelier at the frozen commit; Atelier after each round. Where an arm is Atelier,
  save each run's record beside its output as `<output>.record.json` (`atelier invoke --json`): its `work` field says
  whether the piece came inside its `<work>` field.

## The counts (offline, no model call)

Node 22 or later. Run from the repository's root, after `npm run build`: the counts are Atelier's own, read from `dist/`.

```bash
npm run build            # the counts are Atelier's own, read from dist/
node bench/voice-benchmark/audit.mjs --author <pieces> --outputs <arm-folder> \
  --material <notes-folder-or-file>[,…] --range 600-900 --brief <brief.md> --json <arm>.jsonl
```

Per output it reports:

| measure | how it is read |
|---|---|
| opens with reasoning about the task | the first paragraph of every output is listed for a person to read, for every arm alike; no pattern decides it. Beside it, as extra information, the record's `work` field: inside its field (and the words set aside), no field, or no record |
| tells delivered | Atelier's own counted features: the machine-tell families (fragment runs are `STACCATO_RUN`), the contrastive verdict, signposting, dashes (an em dash or a typed double hyphen) |
| rhythm against the author | median sentence length, share of sentences of 5 words or fewer, "I" (with "I'm", "I've", "I'd", "I'll") and "my" per 1,000 words, paragraphs; each beside the lowest and highest of the author's pieces |
| copied from the material | the stretches copied from the material: maximal runs of 5 words or more (overlapping windows joined into one stretch), the longest, and up to three shown |
| length | words written, and whether that is inside `--range` |
| points used | for a brief given as a list, the points carried: any 5 consecutive words of a point in the output (the whole point if it is shorter) |

`--json` writes one line per output; the screen shows one line per output and the totals. The test
(`tests/atelier-voice-benchmark-audit.test.ts`) runs it on the invented fixture in `fixture/`.

## The questions and the plan on the benchmark (round 2)

An Atelier arm run with `--json` writes with the defaults of any questions it asks, and returns them with the plan:

```bash
atelier invoke --skill <name> "<task>" --with notes=<notes.md> --json > <arm>/<task>.record.json
```

Save the work (`output`) as `<arm>/<task>.md` beside its record. The record carries `questions` (and `answers`, each
`by: 'default'` on this first call), `plan` (its `points` are the material it chose; `leftOut` the rest) and `copied`.
For the arm with the author's answers, run each task again with the author's own choices:
`--answers "angle=<letter or their words>,..."` (never answered by anyone but the author). Read with the audit:
points used is `points` of `--brief` (the plan's metric: at most 4 of 9), copied runs is `copied` (the material
metric: 0). The questions' metric (rounds of editing to an accepted post, the argument judged the author's own) is read
by the judge's scores and the owner below, not by a count. `--no-questions --no-plan` gives the round-1 arm on the same commit.

## Fix rounds on the benchmark (round 3)

For a fix round, run `atelier fix "<what to change>" --json`-free at a terminal (or through the MCP's `atelier_fix`) on
the arm's last run, then read the record of the new run (`atelier report <run>`, or `fix` in its stored record):

| measure | how it is read |
|---|---|
| sentences changed outside the named spans, per fix round | `fix.diff.outside`: sentences of the piece before that no longer stand word for word, outside the sentences the reading named (0 is the bar); beside it `fix.diff.changed` of `fix.diff.total` |
| removed phrases reintroduced | on a later fix, `fix.reintroduced.found` (brought back by the writer and written again) and `corrections.reintroduced` on a run that wrote the piece again whole: what is still in the delivered work (0 is the bar) |

A fix the reading places on the whole piece writes it again whole: its record has no `fix`, only `corrections`.

## The plan's points and the case-shaped fixture (round 4)

With a plan, an Atelier arm's writer is served the plan's points in the plan's words, never the notes: points used is
read against that (at most 4 of 10), and copied runs fall with it. A run with no plan says why in its record
(`prewrite.noPlan`); count those runs apart. `tests/fixtures/reaction-case/` is an invented case of the same shape (one
essay and four short posts by an invented author, ten points, four owner rules, a reaction-post request with no stated
angle) on which the offline tests hold these: 0 tells and 0 em dashes delivered under the owner's ban, the skill built
as documents, the angle asked, 0 of 10 points carried and no run copied by a writer that uses what it is served.

## The judge (run elsewhere, with approval for the spend)

A forced choice between two posts, with "does it state one thesis" and "does the reader meet the problem before the
product", saturated in round 3: every arm passed both, and the preference flipped with the order. From round 4:

- **Each post is scored on its own from 1 to 10** on three frozen criteria, never as one of a pair: the judge sees one
  post, the author's pieces and the task, never an arm's name, a file name, a record or another arm's post.
  1. Voice: does it read as the author wrote it (their sentences, their register, their way into a subject)?
  2. Argument: does it make one case the author would make, from the points it was given, and hold together?
  3. Publishable: would the author post it as it is, or after light edits only?
  The post's score is the mean of the three. The prompts are fixed before the first call and not edited during the
  round; record the model, the prompts' hash and the date with the results.
- **A judge is used only after a position test.** Before any arm is scored, the judge scores a set of clear pairs (one
  post the owner accepted, one they rejected, for the same task) twice, each pair presented in both orders. It is used
  for the round only if it scores the accepted post higher in both orders on at least 80% of the clear pairs; a judge
  that fails is not used, and the round reports the counts below and the owner's read alone.
- **The counts replace the saturated measures**: points used (of the brief, at most 4 of 10 on a plan) and copied runs
  (0 is the bar), read by `audit.mjs` above, stand where the thesis and the problem-before-product questions stood.
- **Close wins and clear wins are reported apart.** For the same task, an arm's win is clear where its score is 2 points
  or more above the other's, close where it is 0.5 to under 2, and a tie under 0.5; a table of wins gives clear and close
  in separate columns, never one total.
- **The owner's read** on a sample of posts, scored the same way, is the check on the judge.

Put the round's numbers in the CHANGELOG's Studies section.
