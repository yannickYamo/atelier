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

**Not in this record.** Any rule dropped. Any change to a standard that its owner did not make.

## Amended 2026-10-06, after the tester's acceptance

The tester accepted the parts above on stores built before this record and found four things. Each is a measured
failure, and each fix is inside what this record already decided. The owner approved them the same day. This is the
last change to the product in 1.x.

1. **A limit is fitted to the author before a rule is moved.** The first text moved a rule to PREFERRED when the
   author's pieces broke it, and left the limit alone. That kept the same too-tight number and only stopped
   enforcing it. Now, at discovery, a counted limit that fewer than 95% of the author's pieces meet is widened to the
   nearest value that 95% of them do meet (always allowing one piece; a ceiling at most doubled, a floor at most
   halved, a ban never moved), and the rule says its limit was fitted and to what. A rule that no limit can fit, or that still fails the set check, or that was fitted with no piece held out
   to check it on, is suggested PREFERRED. A build of a
   standard approved earlier offers the same, in this order: the command that widens the limit, then the command
   that makes the rule a preference. Both are the owner's rulings; neither is applied for them.
2. **The set check moves the fewest rules.** "The rule the most pieces break" could move three rules where moving
   one other rule was enough. The search now finds the smallest set of rules whose move brings the author's pieces
   to 90%, and among equal sets the one that leaves the fewest pieces failing. The message gives how many pieces pass once the
   moved rules are set aside.
3. **Pairs are never chosen unasked.** The first text chose "write this, not that" pairs on a rebuild while a skill
   had none. A store built earlier holds benchmark runs that nothing marked as tests, so a plain rebuild of such a
   skill took pairs from them and changed four exports of five. A rebuild now keeps the pairs the skill has, none
   included, and only `--contrast auto` chooses.
4. **The reading of what an author holds back is made once.** A rebuild read it again with a model call whenever
   the skill had rules that are not counted, which cost money and could change the skill. It is now kept with the
   rules it covered and read again only when one of them is new, or when `--persona auto` asks. Two cases still
   read: a skill built before the reading was kept reads it once, on its first rebuild, and a reading that failed
   (no model reachable) is not kept, is said, and is made again by the next build.

With these, a rebuild with no flag of a skill whose readings are kept makes no model call and writes the same
bytes, except where the compiler itself changed since the commit that built it, which the changelog lists.

**Approved:** the owner, 2026-10-06, on the condition stated at the top.
