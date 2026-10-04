# 0011. Context is read, recorded and shown

**Status.** Accepted 2026-10-04. The small-model readings named here are opt-in or report their own floor until
their sealed qualifications are run ([SUBJECT_READER](../../studies/SUBJECT_READER_PREREGISTRATION.md),
[VOICE_GATE](../../studies/VOICE_GATE_PREREGISTRATION.md)); nothing here is a claim about voice.

**Context.** A review proposed making voice conditional on context with a locally trained voice model, authorship
embeddings and per-context training. Those stay unbuilt ([0009](0009-voice-below-the-standard.md)): they add a
second writer of final words for the one layer nothing has moved, and they put at risk the part that is measured.
The review was right about three smaller things. Nearness was lexical, and starved on short requests. Which words
of a request name its document type was decided by a word table. And a run weighed "your pieces nearest this
request" without ever showing which pieces those were.

**Decision.**

1. **A small model reads context; code counts and decides.** Whether two texts are on one subject, which words
   of a request name the document it asks for, and whether a rewrite kept its claims are readings: a word list
   catches the phrasings someone listed. Each is asked of a small model at temperature 0, its answer is validated
   in code (a quote must be in the text it names, an index must exist, an unknown label is dropped), and it is
   recorded with the run. With no model, the word patterns decide as before. Counted features, machine tells and
   copying stay in code: they give the same answer twice, and a model reader does not.
2. **The register is still declared, never detected** ([0009](0009-voice-below-the-standard.md)). The judge may
   only quote the request's own words for its document type; a quote the request does not hold is no reading.
3. **Nearness is one recorded reading per run** (`core/fidelity/nearness.ts`), used by every step that weighs the
   author's pieces. By shared words by default; by subject (`nearness=reader`) for a release that asks, from
   subject cards read once per piece, with the words as its floor.
4. **What the request was read as is on the panel of every run** (the CONTEXT block): the register and how it was
   read, how many of the author's pieces are near, which, how they were found, what the run used them for, and
   when there are too few. `atelier eval` lists the requests the corpus is thin on.
5. **The voice gate's second read can only refuse.** Whether it may take the word lists' place is decided by the
   gate study, not here.
6. **An AUC is read against the author's own floor.** `fidelity --typicality` reports how well the author's own
   pieces are told from each other at the same size ([AUTHOR_FLOOR_RESULT](../../studies/AUTHOR_FLOOR_RESULT.md):
   0.72 to 0.81 at 8 to 12 a side, not 0.5).
7. **Opt-in or additive** ([0008](0008-one-point-zero-is-the-floor.md)). The default release is unchanged: words
   find the nearest pieces, and no setting moved.

**Not built, on purpose.** A local voice model, activation steering, per-author LoRA or preference tuning, a
learned authorship embedding, per-context training from ratings, a library of register conventions written by
hand, and public "voice packs" for a layer that is not claimed.

**Consequences.** A person sees what a reading rests on before trusting it. A corpus with nothing on a subject says
so instead of returning a confident number. The readings that need context have a measured path to authority, and
none of them has it yet.
