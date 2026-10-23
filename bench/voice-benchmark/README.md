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

```bash
npm run build            # the counts are Atelier's own, read from dist/
node bench/voice-benchmark/audit.mjs --author <pieces> --outputs <arm-folder> \
  --material <notes-folder-or-file>[,…] --range 600-900 --brief <brief.md> --json <arm>.jsonl
```

Per output it reports:

| measure | how it is read |
|---|---|
| opens with reasoning about the task | from the record's `work` field where there is one; otherwise the first paragraph is listed for a person to read. No pattern decides it. |
| tells delivered | Atelier's own counted features: the machine-tell families (fragment runs are `STACCATO_RUN`), the contrastive verdict, signposting, dashes (an em dash or a typed double hyphen) |
| rhythm against the author | median sentence length, share of sentences of 5 words or fewer, "I"/"my" per 1,000 words, paragraphs; each beside the lowest and highest of the author's pieces |
| copied from the material | 5-word runs the output shares with the material, with up to three shown |
| length | words written, and whether that is inside `--range` |
| points used | for a brief given as a list, the points carried: any 5 consecutive words of a point in the output (the whole point if it is shorter) |

`--json` writes one line per output; the screen shows one line per output and the totals. The test
(`tests/atelier-voice-benchmark-audit.test.ts`) runs it on the invented fixture in `fixture/`.

## The judge (run elsewhere, with approval for the spend)

- **Blind**: the judge sees two outputs for the same task as A and B, never an arm's name, a file name or a record.
- **Both orders**: every pair is judged twice, A/B and B/A; a preference that flips with the order counts as a tie.
- **Frozen prompts**: the three questions are fixed before the first call and not edited during the round:
  1. Which post would the author have published? (A, B, or neither)
  2. Does the post state one thesis? (for each: yes or no, with the sentence)
  3. Does the reader meet the problem before the product? (for each: yes or no, with the two sentences)
- **The owner's pick** on a sample of pairs, read the same way, is the check on the judge.

Record the model, the prompts' hash and the date with the results, and put the round's numbers in the CHANGELOG's
Studies section.
