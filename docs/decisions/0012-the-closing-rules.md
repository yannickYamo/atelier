# 0012. The closing rules

**Status.** Proposed 2026-10-04; binding once the owner signs below. It amends [0006](0006-release-contract.md):
0006's four-of-five-domain claim stays a stated goal, not established and not tested by this record; its table of
what blocks a release stands.

**Context.** Two weeks of tests moved the product without closing a question. Three causes, all in the repository.
The target was never signed: 0006 says "binding once the owner signs" and the line is blank. A failed test led to a
new mechanism for the same claim, never to a closed claim. And several tests could not decide: fourteen benchmark
cases cannot see a difference of two tenths of a point, and a machine reading of voice was compared with 0.5 when an
author's own pieces give 0.72 to 0.81.

One of the losses also showed a mistake in what was detected. A skill built from twelve short answers stated "about
100 words" as the author's habit, and cut a requested walkthrough to a third. The length was the size of twelve
questions the skill had never seen. That is fixed in the product before anything here is run
(`core/compiler/scope.ts`): a length is never read off answers alone.

**Decision.**

1. **Three claims, one sealed run each**, by a tester who is not the builder:
   - **A. Quality on coding answers** ([CLOSING_A](../../studies/CLOSING_A_PREREGISTRATION.md)).
   - **B. Delivery: under strict delivery, nothing that breaks a measured REQUIRED rule is delivered**
     ([CLOSING_B](../../studies/CLOSING_B_PREREGISTRATION.md)).
   - **C. Implicit voice, one last in-context read** ([VOICE_GATE](../../studies/VOICE_GATE_PREREGISTRATION.md),
     then [VOICE_PASS](../../studies/VOICE_PASS_PREREGISTRATION.md)).

   Each pre-registration carries its PASS, FAIL and UNRESOLVED sentences, written before the run.
2. **Instruments are qualified first.** The subject reader and the register reading
   ([SUBJECT_READER](../../studies/SUBJECT_READER_PREREGISTRATION.md)), the coverage reading
   ([COVERAGE_READER](../../studies/COVERAGE_READER_PREREGISTRATION.md)) and the voice gate. An instrument that fails
   stays a monitor or is removed; a claim that depends on it becomes UNRESOLVED, never passed.
3. **Frozen before any test material is opened:** the product tag, every arm's configuration, the model ids, the
   analysis scripts, the margins, and the rules for excluding a unit. The builder never sees test material before the
   run: the tester writes it, hashes it and holds it.
4. **UNRESOLVED has three causes and no others:** the run's stated cap was reached; an instrument failed its
   qualification; fewer valid units than the pre-registered minimum. The second is final at once. For the other two
   the claim may run once more on the same design, and is then final.
5. **A FAIL is final for the 1.x line.** The README states the sentence the day it lands. No record may reopen the
   claim in 1.x, swap in another instrument, or relabel it; a change of prompts, carriers, retrieval, rules or
   settings is the same product. A new major version may run the same sealed design once, with new test material.
   Implicit voice may come back only as a different generator (a model trained on the author's work), under its own
   decision and the conditions of [0009](0009-voice-below-the-standard.md).
6. **Strict delivery is opt-in in 1.x and the default from 2.0.** 1.0 delivers every output with its verdict and exit
   0, and [0008](0008-one-point-zero-is-the-floor.md) pins that. `--strict` (or `delivery=strict`) delivers only a
   conformant output and refuses the rest with a failing exit. Claim B is a claim about strict delivery and says so.
7. **What is guaranteed is what is measured.** Strict delivery holds the REQUIRED rules that have a measurement and
   the claim check. A REQUIRED rule written in prose with no measurement is read by the taste reader, a monitor, and
   is outside the guarantee; the skill card lists such rules.
8. **The optimizer comparison never blocks.** GEPA and SkillOpt may be run at any time with `bench/compare`; the
   result is reported either way and does not open, delay or close these claims.
9. **Every result, pass or fail, goes into `docs/RESULTS.md` and the CHANGELOG the day it lands.**

**Not in this record.** Writing quality against a hand-written writing skill as a claim of its own: the counted
results on writing (rules held, invented claims, copying) are already recorded, and a reader-preference claim of
"not much worse" would need some 150 human reads to say little. A trained voice model. Any new voice mechanism.

**Signed:** _(owner, date)_
