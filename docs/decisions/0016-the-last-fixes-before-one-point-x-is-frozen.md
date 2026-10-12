# 0016. The last fixes before 1.x is frozen

**Status.** Approved by the owner on 2026-10-07, with the plan of that date. It amends
[0012](0012-the-closing-rules.md) once more, in one sentence named below, and leaves the rest as signed: the bar, the
four claims, and how a claim closes. No standard's hash moves.

**What it amends in 0012, plainly.** 0012 allows three development rounds and says that after the last one the
product does not change. The third round has been run. This record admits one more set of changes before the commit
the claims are tested on is frozen: the defects listed here, by name, and no others. A seventh fix does not enter
1.x. It is counted here as what it is: a change after the last round, made once.

**Context.** The third round and a read of the whole product found two kinds of defect.

The first kind is in shipped behaviour: the product says one thing and does another.

| Defect | What was measured |
|---|---|
| A length stated in numbers was not seen | Chapters asked at 2,000 words averaged about 1,550. The run recognised "detailed" and "brief", and no number, so the author's usual length stayed in the prompt |
| An em dash the author writes was banned | An author with about two per 1,000 words, in a minority of pieces, was read as never using one. Every dash in an output was replaced |
| A refusal with one model named for every role ended the discovery | The fallback resolved to the model that had just declined |
| A reply with no text was delivered as a clean draft; exactly 20% fewer failures read as a miss; a cached row was believed by its id; a judge qualified on part of its planted set | Found by reading, each reproduced, and fixed in the change before this one |

The second kind is a gap that made a signed claim unreadable or a run fail for a reason that is not the user's.

| Gap | What was measured |
|---|---|
| A dropped connection ended a paid discovery | Three builds at once on one gateway |
| An author's standard wording counted as copying | 44 of 100 contract clauses refused under strict delivery, most for wording the author uses in every contract |
| Section headings where the author writes none | Chapters of a long document, against an author with no heading in any piece |

**Decision.**

1. **The length a request states belongs to the request.** It is read off the request in code (the words as written,
   the unit, and whether it is a target, a range, a floor, a ceiling or exact), said to the writer after the author's
   pieces, and reported against what was written. It is never an author's rule, and no rule on total length is added.
   A number counts as a length only where the request introduces it as one: "the 500 words I pasted" and "chapter
   12" state none. The reading is narrow on purpose, and a length said some other way is not seen.
2. **An em dash is banned only for an author who never writes one.** A dash found in any piece, read or held out, is
   the author's: it is held to their own rate by a cap of its own, and removed from an output only where the standard
   bans it. An author with dashes in most pieces, who had no rule on them unless the model overused them, now has
   that cap too. Other moves of the same catalogue keep the rule they had.
3. **A refusal falls back to the next model that is not the one that declined**, and the run says which model read
   the work.
4. **A dropped connection is tried again, slowly, at the one place every call passes.** A backend that is not there,
   an error it answered with, a refusal, and a call that ran out its own time limit are reported as they were. The
   budget is held before each attempt.
5. **Wording found in three or more separate pieces of the author's is their standard wording**, read at build over
   the whole corpus, left out of the copying count and reported apart. Words lifted from one or two pieces are still
   copying, at any length, and a standard phrase inside a lifted sentence does not cut it in two. A skill built
   before this gains it at its next build.
6. **"No section headings" is read from absence, so it is proposed as shown.** That none of a few pieces has a
   heading does not make one forbidden: the rule is counted on every output and used to choose between drafts, and
   is required only when the owner says so. A ban that rests on a measured gap (the model does it in its plain
   drafts, the author in no piece) is suggested as it was; whether those should also wait for the owner's word is a
   question for the next version, and is not changed here.

**What does not change.** A standard approved before this reads and checks exactly as it did
([0008](0008-one-point-zero-is-the-floor.md)). Items 2, 5 and 6 change what a new discovery proposes and what a new
run counts as copying; items 1, 3 and 4 change a run and no standard.

**After this.** The commit that carries these is the one the closing claims are tested on. A defect found later in
1.x is a finding, published with the result it touches. Work on a skill built from a method and examples of good
output begins as a new version with its own tests, and takes nothing from this record.

**Consequences.**
- Results measured before this commit on dashes, length, contract refusals and headings are development readings of
  an earlier product, and are labelled so.
- An author whose few dashes were being removed will see them again, up to their own rate.
- A contract skill under strict delivery refuses less. How much less is measured on the frozen commit, not assumed.

**Amended, 8 October 2026: one more fix, by the owner's ruling.** A defect found after the freeze is a finding, and
this one was reported as one. The owner reopened 1.x for it alone, because it can stop a sealed run:

7. **The copying check is read in one pass, in any script.** Each shared run was extended a word at a time by
   searching every piece again, so the output the check exists for, a long copied stretch, was the one it was
   slowest on: 600 copied words took seconds, and 4,000 did not finish. Under strict delivery that check runs on
   every output. It also read only unaccented Latin letters, so an exact copy in another script read as no copy.
   On unaccented text the numbers are the same, held by generated cases against the earlier reading.
   Three pieces that are one clause ending three ways are now three pieces.

Nothing else enters. The commit that carries this amendment is the one the closing claims are tested on.
