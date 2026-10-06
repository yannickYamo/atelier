# Pre-registration (draft): does the in-context voice pass read more like the author than pasted examples, to people?

**Status:** DRAFT, not sealed. Run only after the [voice gate study](VOICE_GATE_PREREGISTRATION.md), with the gate
that study qualifies; if no gate qualifies, this claim is UNRESOLVED and closed. Sealed by the tester with a public
commit of this file and the sha256 of `harness/voice-pass-score.mjs` before the first output.
[Decision 0012](../docs/decisions/0012-the-closing-rules.md), claim C.

## The question

[Decision 0009](../docs/decisions/0009-voice-below-the-standard.md) built an in-context voice pass, off by default,
and set its first test: it must win a sealed blind read by people against pasted examples before any trained voice
model is considered. This is that read, and the last voice round of the 1.x line. Explicit voice (punctuation,
typography, banned moves) is already measured and claimed; this is about the implicit layer, rhythm and word choice,
which every earlier attempt failed to move.

## Readiness comes before the seal

The voice pass has never been run on a real model, and its gate, as shipped, refuses most faithful rewrites. Before
this read is sealed, on one development author who is not in the test:

1. the gate study names the gate to use;
2. the pass is run on development requests and every refused or flat paragraph is read and grouped by cause (too few
   near pairs, the gate, a rewrite that changes nothing a reader hears);
3. what a published study of 50 authors found is applied: readers penalise prompted text for its machine-writing
   quirks more than for any missing habit of the author ([arXiv 2510.13939](https://arxiv.org/abs/2510.13939)), so a
   rewrite is kept for removing a machine tell the author never uses before it is kept for adding a mannerism;
4. three people read ten development pairs blind. **The read is sealed when they choose the voice output in at least
   18 of 30 judgments.** Below that the claim is not sealed and voice stays unclaimed, as it is today.

## Material

**Two authors** who agreed, each with a skill built from their pieces, a declared register and a pair bank.
**Fifteen sealed requests per author**, on subjects the skill never saw.

| Arm | What writes |
|---|---|
| pasted | the model with four of the author's pieces in the prompt |
| voice | the skill with the voice pass on (`invoke --voice incontext`) |

**Both arms are written in the same run** by the same model (`harness/voice-pass.mjs`), never read from an earlier
study. **Every voice output is shown, rewritten or not**: it is what a person who turned the pass on would get. The
share with no paragraph rewritten is reported.

## The read

**One panel of five readers per author**, each reading all fifteen pairs of that author. For each request a reader
sees two excerpts of the author's pieces, never one of the four the pasted arm was shown, then the two outputs
cleaned and cut to one length, sides seeded per reader. The question: which reads more like the author of the
excerpts? The key stays sealed until every reader has answered.

## The rule (`harness/voice-pass-score.mjs`; the unit is the request)

Each request gives one number: the share of its five readers who chose the voice output. **PASS needs all three:**

1. the pooled mean over the thirty requests is above one half, by a sign-flip randomisation test over requests
   (one-sided 5%, 10,000 seeded flips);
2. the pooled mean is at least 0.60;
3. each author's own mean is at least 0.55.

And no invented claim is delivered in any voice output. **Minimum valid units:** 13 requests per author with both
outputs and every reader's answer; below that, UNRESOLVED.

Reported beside it, deciding nothing: the evaluation family's AUC of each arm against the author's unseen pieces,
with the author's own floor at that size ([AUTHOR_FLOOR_RESULT](AUTHOR_FLOOR_RESULT.md)); paragraphs rewritten and
refused; REQUIRED rules held.

## Sentences

- **PASS:** "For two authors, blind readers preferred the voice pass to the author's pieces pasted into the prompt,
  [x]% of the time." The pass stays opt-in.
- **FAIL:** "For these two authors, the in-context voice pass did not read more like the author than pasted examples."
- **UNRESOLVED:** "The voice read did not run: [cause]. It is closed without a result."

After a FAIL or a final UNRESOLVED, implicit voice returns only as a different generator (a model trained on the
author's work), under its own decision and the four conditions of 0009.

## Limits

Two authors, thirty requests, ten readers. The design is the reviewer's, who reports simulating it with reader and
request effects: a false pass about 3% of the time, and a pass about three times in four when readers truly prefer
the voice output 65% of the time. Those figures are theirs and were not recomputed here. The arms differ in content
as well as voice.

## What changed before sealing

- Two authors and fifteen requests each, in place of one author and eight; one panel per author.
- The unit is the request and the test is over requests: forty judgments on eight requests were not forty results.
- Every voice output is shown. Dropping the ones with no rewrite made the old bar unreachable when any was dropped.
- An answer that cannot be read is never left out: the scoring script lists each one, and while any remains the
  result is UNRESOLVED. A reader writes `A` or `B` after each `ANSWER <id>:`.
- Both arms are written in the same run.
