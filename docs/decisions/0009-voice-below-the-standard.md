# 0009. Voice below the standard

**Status.** Accepted 2026-10-02. Its result is decided by a blind human read, not by this record.

**Context.** 1.0 claims the counted guarantees and does not claim voice. B6 found the 0.8 loop did not move an
author's range, and 1.0 replaced that actuator without a study behind the replacement. A brief proposed the
next step: traits that carry across registers, a register gate, and a voice model fine-tuned locally on
neutral-to-author paragraph pairs. This record says which parts of that were built, and why the rest waits.

**Decision.**

1. **Transfer is declared, never inferred.** From one register, a habit may be the author, the genre, the
   topic or the author in that genre, and no count separates them. Every rule and steering feature is
   `invariant` (measured across two or more of the author's registers), `owner-transfer` (the owner's ruling)
   or `unknown`. The policy is written under one standard and not applied under another.
2. **The register of a request is declared, never detected.** The person names it, or the request names a
   document type. A lexical distance is recorded as a monitor. It parses text and has been measured against
   nobody's judgement, so by [0003](0003-authority-by-measurement.md) it may not decide.
3. **Out of register, only what the policy carries is applied.** The rest is withheld for that run and named.
4. **The voice pass is in-context first.** Pairs of the same content, plain and as the author wrote it, are
   shown to the writing model per paragraph. No model is trained.
5. **A voice rewrite is gated per paragraph, and may only be refused.** Facts, claim strength, length and
   copying; a failure keeps the content paragraph whole. The assembled text is then read by the standard's
   own checks and the claim reader, and the pass is undone if anything got worse. The gate reads prose, so it
   is a detector and will miss phrasings; that is why it can only refuse.
6. **Everything is off by default** ([0008](0008-one-point-zero-is-the-floor.md)). No policy, no gate. No
   release has the voice pass on unless its owner set it.

**Not built, and what would change that.** A fine-tuned open-weight voice model (LoRA, then preference
tuning), activation steering, and a learned authorship embedding are not built. They add a base model, a
training run per author and a second writer of final words, for the one layer nothing has yet been shown to
move. They are reconsidered when all of these hold: the in-context pass wins a sealed blind read by people
against pasted examples; the voice integrity gate has been qualified against planted changes; the author has
at least 300 validated pairs; and the author agreed to their pieces being trained on.

**Consequences.** A skill whose owner declares a register gains a VOICE section on its panel and card. A
skill whose owner does not is unchanged. The claim in the README does not move: voice is not claimed.
