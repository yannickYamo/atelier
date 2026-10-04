# Pre-registration (draft): does the in-context voice pass read more like the author than pasted examples, to people?

**Status:** DRAFT, not sealed. Run only after the [voice gate study](VOICE_GATE_PREREGISTRATION.md), with the gate
that study qualifies. Sealed by a public commit of this file before the first new output. Estimated cost: under $12
(the harness cap), and five people's reading.

## The question

[Decision 0009](../docs/decisions/0009-voice-below-the-standard.md) built an in-context voice pass, off by default,
and set its first test: it must win a sealed blind read by people against pasted examples before any trained voice
model is considered. That read has not happened. This is it, and it is the last voice round planned: a pass keeps
the voice pass as an option worth turning on; a fail leaves voice unclaimed and the work goes elsewhere.

## Material

The technical author's corpus of the indistinguishability study: 12 pieces the skill read, 8 it never read. The
requests are the titles of the 8, in that study's brief form.

| Arm | What writes | Source |
|---|---|---|
| pasted | the model with four of the author's pieces pasted in | the outputs that study recorded, unchanged |
| atelier | the skill as shipped | the outputs that study recorded, unchanged (machine reading only) |
| voice | the skill with the voice pass on (`invoke --voice incontext`), nearness as the release has it | written new |

A voice output in which no paragraph was rewritten is the atelier arm under another name: it is recorded and not
counted. If fewer than 6 of 8 voice outputs count, the study is VOID, not failed.

## The human read (primary)

Five readers, one packet each (`harness/voice-pass.mjs`). For each request a reader sees two excerpts of the
author's read pieces, then the pasted and the voice output for that request, cleaned, cut to the same length, sides
seeded and the key sealed apart. The question: which of the two reads more like the author of the excerpts?

**PASS:** the voice output is chosen in at least 26 of 40 judgments (one-sided binomial against one half,
p = 0.040), and no invented claim is delivered in any counted voice output.

Reported beside it, deciding nothing: the count per request (judgments on one request are not independent), and
each reader's own count.

## The machine reading (secondary, never a pass on its own)

The evaluation family's AUC of each arm against the 8 unseen pieces, beside the author's own floor at 8 a side
(0.813, [AUTHOR_FLOOR_RESULT](AUTHOR_FLOOR_RESULT.md)). An arm at or below the floor is unresolved at this size, and
is said so. Also reported: paragraphs rewritten and refused, REQUIRED rules held.

## What changes with the result

- **PASS:** the README may say the voice pass was preferred to pasted examples by people on one author, with the
  numbers. Decision 0009's first condition is met. The pass stays opt-in.
- **FAIL or VOID:** the README's "voice is not claimed" stands. No further voice round is planned, and the trained
  model stays unbuilt.

## Limits

One author, one register, eight requests, five readers: enough to see a clear preference, not a small one (the read
finds a true preference of 0.70 about four times in five, and one of 0.60 about one time in three). The arms differ in content as well as voice, as every arm of the
earlier study did.
