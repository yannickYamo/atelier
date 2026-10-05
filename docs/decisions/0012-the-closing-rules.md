# 0012. The closing rules

**Status.** Proposed 2026-10-04; binding once the owner signs below. It amends [0006](0006-release-contract.md):
0006's four-of-five-domain claim stays a stated goal and gets its first counted test in claim B; its table of what
blocks a release stands.

**Context.** Two weeks of tests moved the product without closing a question. Three causes, all in the repository.
The target was never signed: 0006 says "binding once the owner signs" and the line is blank. A failed test led to a
new mechanism for the same claim, never to a closed claim. And several tests could not decide: fourteen benchmark
cases cannot see a difference of two tenths of a point, and a machine reading of voice was compared with 0.5 when an
author's own pieces give 0.72 to 0.81.

**The bar, in the owner's words.** From a corpus and a prompt, a person gets a better skill than a hand-crafted one.
The hand-crafted skills are [i-have-adhd](https://github.com/ayghri/i-have-adhd) for answers and
[stop-slop](https://github.com/hardikpandya/stop-slop) for writing. "Better" on coding answers means it scores higher on i-have-adhd's own judge and holds the owner's rules more often:
a tie fails. On writing it means the author's rules are held more often with no clear loss on stop-slop's own score,
and the sentence says "scored higher" only where that was shown. For voice, the in-context pass is taken as far as
it goes and read once by people.

**Decision.**

1. **Four claims, one sealed run each**, by a tester who is not the builder:
   - **A. Coding answers against i-have-adhd** ([CLOSING_A](../../studies/CLOSING_A_PREREGISTRATION.md)). The primary
     arm is the better Atelier configuration on validation: the exported plug-in or the strict runtime.
   - **A-w. Writing against stop-slop** ([CLOSING_AW](../../studies/CLOSING_AW_PREREGISTRATION.md)). The primary arm
     is the exported plug-in.
   - **B. Delivery and repeatability across domains, under strict delivery**
     ([CLOSING_B](../../studies/CLOSING_B_PREREGISTRATION.md)): at least three kinds of work. The strict runtime's
     answer quality is reported here.
   - **C. Implicit voice, one last in-context read** ([VOICE_GATE](../../studies/VOICE_GATE_PREREGISTRATION.md),
     then [VOICE_PASS](../../studies/VOICE_PASS_PREREGISTRATION.md)).

   Each pre-registration carries its PASS, FAIL and UNRESOLVED sentences, written before the run.
2. **Readiness comes before a seal.** A claim whose FAIL is final is sealed only when development material, which
   never enters the test, says the product is ready: losses read one by one, grouped into failure modes, fixed in how
   a skill is built and never for one task, then measured again on a held-out half. Each pre-registration states its
   readiness line. A claim that never reaches it is not sealed, and the README keeps its present sentence. Not
   sealing is not a FAIL, and it may not be dressed as a pass.
3. **Instruments are qualified first.** The judges of A and A-w (`bench/compare/judge-qualification.mjs`), the subject
   reader and the register reading, the coverage reading, and the voice gate. An instrument that fails stays a
   monitor or is removed; a claim that depends on it becomes UNRESOLVED, never passed.
4. **Frozen before any test material is opened:** the product commit, every arm's configuration, the model ids, the
   analysis scripts (their sha256 sealed with the pre-registration), the margins, and the rules for excluding a unit.
   The builder never sees test material before the run: the tester writes it, hashes it and holds it. The tester
   pins a commit; a release tag is not required.
5. **UNRESOLVED has three causes and no others:** the run's stated cap was reached; an instrument failed its
   qualification; fewer valid units than the minimum (280 tasks for A, 27 briefs per author for A-w, 55 requests per
   skill for B, 13 requests per author for C). The second is final at once. For the other two the claim may run once
   more on the same design, and is then final.
6. **A show must clear its bar; a guard fails only on a clear loss.** Which endpoint is which is written in each
   pre-registration. A guard is never widened to a margin: it is read at 97.5% against zero.
7. **A FAIL is final for the 1.x line.** The README states the sentence the day it lands. No record may reopen the
   claim in 1.x, swap in another instrument, or relabel it; a change of prompts, carriers, retrieval, rules or
   settings is the same product. A new major version may run the same sealed design once, with new test material.
   Implicit voice may come back only as a different generator (a model trained on the author's work), under its own
   decision and the conditions of [0009](0009-voice-below-the-standard.md).
8. **Strict delivery is opt-in in 1.x and the default from 2.0.** 1.0 delivers every output with its verdict and exit
   0, and [0008](0008-one-point-zero-is-the-floor.md) pins that. Claim B is a claim about strict delivery and says so.
9. **What is guaranteed is what is measured.** Strict delivery holds the REQUIRED rules that have a measurement and
   the claim check. A REQUIRED rule in prose with no measurement is read by the taste reader, a monitor, and is
   outside the guarantee.
10. **The optimizer comparison never blocks.** GEPA and SkillOpt may be run at any time with `bench/compare`; the
   result is reported either way and does not open, delay or close these claims.
11. **Every result, pass or fail, goes into `docs/RESULTS.md` and the CHANGELOG the day it lands.**

**Not in this record.** A trained voice model. Any new voice mechanism. A claim for each quality dimension
separately, which would need several hundred tasks per dimension.

**Signed:** _(owner, date)_
