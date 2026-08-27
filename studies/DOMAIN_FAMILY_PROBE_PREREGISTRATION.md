# Pre-registration — does discovery read selection, or does it read surface?

**Sealed:** 2026-08-24, before the corpus was written and before any call was made.
**Status:** SEALED. Predictions below are frozen. Result goes in a separate document.

---

## 1. Why this probe exists

The locked claim ledger records the dominant weakness as **one author, one rater, one domain family**.
Every corpus this programme has run through discovery is prose written by the founder, and the
requirements it recovers are about voice. Nothing establishes that the machinery reads anything other
than the surface of prose.

Study notes are a different family. The artifact is structured rather than flowing, and the expertise
that makes one set better than another is **selection**: what got included, at what grain, in what
order, for which learner. A perfectly accurate sheet carrying the wrong forty facts is useless.

If discovery on such a corpus returns only "uses three columns" and "bolds key terms," it is reading
what is literally visible and the domain family count stays at one. If it returns constraints on what
belongs on the page, the count goes to two.

---

## 2. Scope, stated honestly and in advance

**This does not test whether Atelier captures a real teacher's taste.** There is no teacher here. The
corpus is authored for the probe, which makes the author of the corpus the same agent running the
probe, and that is a contamination this design cannot remove.

**What it does test** is narrower and still worth knowing: given a corpus that contains a uniform
formatting pattern AND a uniform selection pattern, which of the two does discovery surface, and does
it anchor them to evidence at the same rate.

The corpus is deliberately built to carry both signals. A corpus carrying only selection signal would
rig the result.

---

## 3. The corpus, specified before it is written

Three study-note documents, different topics, authored to embody both of the following consistently.

**A uniform FORM pattern.** Every document uses the same visible structure, so a reader looking only
at surface has an obvious pattern to report.

**A uniform SELECTION pattern.** Every document obeys the same rules about what earns a place, so a
reader attending to content has an equally consistent pattern available.

Neither pattern is stated anywhere in the corpus. Both must be inferred.

---

## 4. Classification rule, fixed now so it cannot be chosen after seeing the output

Each recovered requirement is classified by its statement alone:

- **SELECTION** if it constrains WHICH content appears. Markers: include, omit, only, skip, name,
  leave out, prefer one piece of content over another.
- **FORM** if it constrains how content is arranged or marked. Markers: order, heading, bullet, bold,
  length, column, layout, sentence shape.
- If a statement does both, it counts as **SELECTION**.
- Otherwise **OTHER**.

The classification is performed by the agent running the probe and is therefore reviewable and
contestable by the founder. The rule is frozen here so that the classification cannot be tuned to the
result.

---

## 5. Predictions, frozen

**P1.** Discovery returns at least one SELECTION requirement.

**P2.** Discovery returns at least one FORM requirement.

**P3 (the interesting one).** SELECTION requirements carry an anchored evidence span at a **lower**
rate than FORM requirements.

P3 is the prediction worth running. A selection decision is visible only as an absence or as a pattern
across documents, and an anchored span is a contiguous quotation from one document. If P3 holds, the
anchoring mechanism shipped on 2026-08-24 is structurally better at capturing form than at capturing
judgment, which is a real limitation of the evidence model and not a tuning problem.

**P4.** No requirement recovered will describe the corpus as being ABOUT its topics. Recovering
"explains Hellenistic history" would mean discovery read the subject matter as the standard.

---

## 6. What would count as a failure of the probe itself

If discovery returns fewer than three requirements total, the run is uninformative and reports nothing
about any prediction.

If the corpus turns out to carry an unintended third pattern that dominates the output, the probe is
void and must be rebuilt. This is recorded in advance because the temptation after seeing a surprising
result is to discover a reason the corpus was flawed.

---

## 7. What no outcome licenses

No result here moves any claim tier. A single authored corpus, classified by the agent that wrote it,
supports a statement about the MECHANISM and supports nothing about expert taste, pedagogy, or
whether Atelier works for teachers. The cooperating-expert item stays open regardless of the outcome.
