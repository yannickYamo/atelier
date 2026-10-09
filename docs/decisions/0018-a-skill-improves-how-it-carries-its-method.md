# 0018. A skill improves how it carries its method, unattended, and never its standard

**Status.** Proposed. Built on the branch `evolve`, on top of [0017](0017-a-skill-from-one-method-and-one-example.md),
for 2.0. The owner asked for it; the owner has not yet ruled on this record. No run of it against a real model has
been made.

**Context.** The owner's aim is that a person defines the ground truth and what they want, and guides nothing else.
After 0017 a person gives a method and one finished example, and the skill is held to them. What they still had to
do by hand was notice what the skill kept getting wrong and correct it, one `atelier fix` at a time.

Work on regularized self-improvement of agent harnesses (see [the comparison](../COMPARISON.md)) shows both halves of
this. An unattended search over how an agent is run does find gains. Left alone it also overfits the tasks it is
scored on, and its gains do not carry. What made them carry there was regularizing both ends of the search: what
may be proposed (a budget of edits, a history of what was tried, pruning) and what may be accepted (a measured noise
floor, a price on added cost, a critic that refuses a candidate carrying the tasks).

Atelier already separates the two things such a search must not confuse. The standard is what the owner approved,
hashed, and changed by nobody else. The implementation is how that standard is carried on a run, and may change.

**Decision.**

1. **`atelier evolve --skill <name> --briefs <folder>` improves a skill with nobody guiding it.** The owner gives
   briefs: the task, and the material it is made from. No reference answer is asked for. What a run is scored on is
   the standard they already approved.
2. **The standard is never in the search.** No rule is added, dropped, loosened or reworded. A search that could
   change what "good" means would improve its score by changing the question.
3. **What may change is how the method is carried, and only two things:** how many drafts are written, and a note
   to the writer naming what earlier drafts missed. The note is built in code from the required steps of the standard
   as approved, in the standard's words, with how often each was missed: up to six, the newest misses first. No model writes it. It is served under a
   heading that says it is not a rule of the standard, and a run records the note it was served by its hash.
4. **Six things hold the search back.** The first, third and fourth are RRSI's, at a much smaller size. One change
   at a time is stricter than its budget of edits. The briefs set aside are a validation gate of the kind skill
   optimizers use; RRSI reports its held-out tasks and does not accept on them.

   | | |
   |---|---|
   | Noise band | The unchanged skill is run twice first. A candidate must beat the better run by more than the two differed, and by more than one case. |
   | One change | Each candidate changes one thing, at most two candidates a round, one kept a round. Within a search, no way of carrying the method is run twice, the one it started from included. |
   | Cost | A change may cost a third more for each tenth of the cases it gains. A draft fewer is the one change kept without a gain: it must lose no case and save a tenth. Where the model is not priced, cost is not read as measured. |
   | Leakage | A candidate that names a brief, or repeats six words in a row of one that are not the standard's own, is refused before anything is spent on it. |
   | Memory | Under the same standard and version, what an earlier search ran on the same working briefs and did not keep is not run again, and the record says how many earlier searches read these same briefs set aside. |
   | Steady briefs | A change that breaks a brief both runs of the unchanged skill held is not kept, whatever it fixes elsewhere. |
   | Held-back briefs | A fifth of the briefs, at least two, are set aside before the first run, by a hash of their names. In a search they are run once, at the end, on the skill as it started and as the search left it. |

5. **A change is adopted only if it is no worse on the briefs set aside.** A gain on the working briefs that is a
   loss there is reported as not carried, and the skill is left as it was.
6. **Every search is kept, adopted or not,** with each candidate, what it was expected to do, what it scored, and
   why it was or was not kept. `--rollback` goes back one adoption at a time, to the skill as built.
7. **No run of the search is something the skill learns from elsewhere.** Each is marked as a test (see the
   changelog on test runs), so `tend`, `mine` and `eval` do not read it.
8. **A run that ends with no verdict stops the search.** A run that broke (no key, a backend error, a cap too
   small for it) is never read as a case that failed. The search stops, adopts nothing, says why, and exits 2. A
   round it stopped in keeps nothing. A signal stops it the same way: the run in flight is ended, what the search
   moved is put back, nothing is adopted, and no record is written.
9. **What was adopted is bound to the standard it was adopted under.** Its note quotes that standard's steps. When
   the owner changes the standard, the adoption is no longer used, and a new search starts from the skill as built.

**What it does not do.**
- It improves nothing a check does not read. A judgement step is scored by nothing, so no gain is claimed on one.
  For a method that is mostly judgement, the search has little to climb on, and says so when it has nothing.
- It does not rewrite the skill's instructions, its control flow or its tools. The search space is two settings.
  That is narrow on purpose: each added thing to search over is another way to fit the briefs.
- "No worse" on two held-back briefs is a weak test. It catches a change that breaks what worked. It does not show
  that a gain carries; with a fifth held back, more briefs make it say more.
- The adoption applies to runs made through `atelier invoke`, and so to `atelier reproduce`, which runs the skill
  as it now runs. A skill file already exported to a coding agent is not rewritten by it, and `atelier fix` compares
  its candidates without the note.
- The same briefs are set aside by every search over the same folder. Searching again and again over one folder
  reads them more than once; each record says how many earlier searches did. At six working briefs the working rule is about a
  5 to 7% test for each candidate, and finds a real gain of thirty points less than half the time. An unchanged
  skill passes the two-brief gate about seven times in ten. Only more briefs change that.
- Where the skill already holds all but the noise band of its working briefs, no gain could be shown, and the search
  runs nothing to look for a gain.
- An adoption is bound to the standard, not to the skill version: it stays in force after `atelier fix`.
- Where a skill has a release, the number of drafts is the release's: the search leaves it alone and searches the
  note only, and `--fidelity` and a later release keep their own number.
- `--cap` is what the search starts runs within. No run is started that what is left cannot cover. A run in flight
  can pass it by a call, and what a run spent is not known if it is killed from outside or ended for not answering
  in twenty minutes.
- The brief split is by name, so adding or renaming briefs between two searches can move a brief from one side to
  the other. Each record lists which briefs were on which side.

**How it will be tested.** Not by the builder. On a skill built by `atelier method`, with briefs the search never
saw kept by the tester outside the folder: the share of those that hold every required step before and after an
adoption, and what the search cost. The claim to test is small: that what it adopts is no worse on fresh briefs,
and better where drafts were leaving required things out.

**Consequences.**
- A person who gives a method, an example and briefs can leave the rest. What they approve is still only the
  standard.
- A new file beside the skill, `carry.json`, with its history, and a folder of search records. Neither is part of
  the standard or of a skill version, and a store without them reads as before.
