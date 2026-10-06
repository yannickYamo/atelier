# 0015. A golden corpus passes its own standard

**Status.** Approved by the owner on 2026-10-06, on one condition, in the owner's words: "if it truly moves the
needle for performance and our users". The section "What is known, and what the condition waits on" says which half
of that is shown and which is still to be measured. It is one more product change after the one
[0014](0014-the-smallest-realization-that-holds-the-standard.md) admitted, and it is outside what 0014 permits. It
fixes failures the tester measured, which is what [0012](0012-the-closing-rules.md) allows. No standard's hash moves:
a standard already approved is unchanged until its owner rules on it again.

**Context.** The tester ran the product as a user would, from a corpus and a prompt, and could not start the paid
tests. Three things stood in the way, all measured, none new to the size work.

1. **An author's own pieces failed their own standard.** Each counted rule is set a little tighter than the author's
   average (the median times 1.2, plus one) and is suggested REQUIRED when it holds on four in five of the few
   pieces held out. Nothing read the rules together, or against the rest of the author's work. Pieces the skill was
   built from that break a REQUIRED rule: 13 of 24 on a company blog, 8 of 24 on a speaker's speeches, 2 of 24 on
   code reviews, none on contract clauses or coding answers. On a second blog skill, checked here, 11 of the author's
   20 posts break one. Thirteen rules that each hold in nineteen pieces of twenty hold together in about half.
   The consequence reached the tests: on the blog, 98% of Atelier's own answers broke a REQUIRED rule, so no
   comparison on rules could be read there.
2. **A project folder that moved lost its skill.** A run's working files are keyed by the project's path. Renamed,
   moved or copied with its store, the project was answered "there is no standard to build from yet".
3. **A rebuild that asked for nothing changed the skill.** It chose its "write this, not that" pairs again from every
   run in the store, benchmark runs included, and it replaced the skill's description with the default one.

**Decision.**

1. **The suggestions are read once more, together, against the author's own pieces** (those discovery read and those
   it held out; never the reserve, which nothing may consult).
   - A counted rule is suggested REQUIRED only if at least 95% of the author's pieces meet it.
   - The rules suggested REQUIRED must, together, be met by at least 90% of the pieces. While they are not, the rule
     the most pieces break is suggested PREFERRED instead.
   - Each check always allows one piece. Under twenty pieces a share alone would mean "every piece", and one unusual
     post would move a rule the rest of the author's work keeps.
   - A rule moved this way is still approved, still shown, still counted on every output and still used to choose
     between drafts. It no longer fails an output on its own.
   - This changes a suggestion, never a ruling. The owner can make any rule required on the same screen.
2. **Every build says how the author's own pieces fare:** how many meet every REQUIRED rule that is counted. Under
   nine in ten, it names the rules they break most and the command that makes each a preference. For a skill built
   before this record, that is how its owner brings it in line, one ruling at a time, with no new discovery.
3. **A project that moved keeps its skill.** When a folder has no run of its own, the run that built its skill is
   found in the store, by the skill installed in the folder or the pieces that came with it, before any command
   concludes there is none. A folder that moved carries the run on; a copy takes a copy of it. Several live projects
   that built a skill of one name are not guessed between: they are named.
4. **A rebuild changes nothing unasked.** Once a skill has "write this, not that" pairs it keeps them; `--contrast
   auto`, given, chooses again. The pairs of a run marked as a test (`invoke --test-run`, which the benchmark runner
   passes) are never taken. Such a run is still recorded, and still counted by `tend`, `fidelity` and `eval`. The
   description is kept while the skill is read from the same pieces.

**What the numbers are.** 95% and 90% are a rule about a corpus, fixed here before any new output is read. They
were not tuned on a test. The tester replayed them on stored development answers: on the blog, Atelier answers
breaking a REQUIRED rule fall from 98% to at most 52%, against 78% for the hand-written skill; on the speeches they
stay at 95% against 98%, because the model still breaks four rules the author keeps. That replay is development
evidence about answers already read under another standard. It says the blog can now be read. It is not a result.

**What is known, and what the condition waits on.**

- *For users, shown.* An author's own pieces failing their own standard was reproduced on two blog skills by two
  people. After this record the review suggests as required only rules the author's pieces meet, and every build
  states the share. That part does not depend on a model.
- *For performance, not yet shown.* Whether answers held to the adjusted standard break the author's rules less
  often than a hand-written skill's is a measurement on new answers. The replay above is not one. The outside tester
  reads it in the last development round, on the blog skill as its owner adjusts it. If the rule axis is no better
  there than before, this record's second claim is withdrawn in the results page and the first stands alone.

**What this costs.** A standard with fewer REQUIRED rules fails fewer outputs. That is the point where the author's
own work breaks the rule, and it is also a way to look better against a comparator by asking for less. So the
comparison on rules in every later test is read on the standard as approved after this record, and each report
states how many rules were REQUIRED before and after and which were moved.

**What it does not touch.** A corpus that already meets its rules gets the same suggestions as before: the coding,
contract and code-review standards are in that case, and their exports stay as they were, which the tester confirms
byte for byte before anything else. [0008](0008-one-point-zero-is-the-floor.md) is kept: stores are read as before,
no option is removed, and a run costs what it did. Two defaults of a rebuild change (the pairs and the description),
each from "changes the skill without being asked" to "keeps it".

**Not in this record.** Any change to how a limit is derived. Any rule dropped. Any change to a standard that its
owner did not make.

**Approved:** the owner, 2026-10-06, on the condition stated at the top.
