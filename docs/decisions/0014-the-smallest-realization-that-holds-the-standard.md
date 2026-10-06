# 0014. The smallest realization that holds the standard

**Status.** Approved by the owner on 2026-10-05. It amends [0012](0012-the-closing-rules.md) in two sentences, named
below, and leaves the rest of that record as signed: its bar, its four claims, and how a claim closes. It changes how
a standard is carried, never the standard: no standard's hash moves.

**What it amends in 0012, plainly.** 0012 says the paragraph repair "is the last change to the product before the
seals", and that "no other brief enters the loop". This record admits one more change and one more brief: a study of
size, and a build of what it selects, between the second and third development rounds. That is one more cycle of
measure and build than 0012 allowed. It is counted here as what it is and is not called a round, and it is the only
one.

**Context.** After the second development round the reviewer measured a weakness nobody had counted: the size of an
exported Atelier skill.

| Domain | Hand-written seed | GEPA | SkillOpt | Atelier |
|---|---|---|---|---|
| Contracts | 361 | 935 | 361 | 5,760 |
| Code review | 189 | 863 | 308 | 5,035 |
| Speeches | 361 | 1,240 | 1,037 | 13,818 |

Words in the exported skill: 16 to 38 times the hand-written seed, and 6 to 11 times the skill GEPA produced. One
skill, built from a technical author's posts, was then measured part by part (`atelier export`, 13,173 words): the
author's whole pieces are 9,201 words in three files, the rule examples 1,954, the rules and instructions 682, the
persona and voice guidance 471, the moves 396, the list naming the example files 282, and the fence around the
inlined files 187. On that skill seven words in ten are whole pieces, set by one constant, a budget of 9,000 words.
The share in the other skills has not been measured.

The whole pieces were added after exploratory blind rounds on one author, in which a skill of rules alone was ranked
least like the author and a later one with a description and whole pieces was preferred on the two briefs read.
That is the whole of the evidence for them, and voice remains unclaimed. What nobody has measured is how much of the
rule holding and of the voice those words buy.

0012 says nothing new is built unless it fixes a failure the tester measured. Size is measured, and it was measured
before any seal. It is not a failure on any of the four signed axes, so 0012 as written does not admit work on it.

**Decision.**

1. **The rule for choosing between realizations.** Holding the standard is the condition for being considered at
   all. Among realizations that are not measurably worse at it, within tolerances written in advance, the default is
   the smallest. Size is never a reason to keep a rule out of what the model is served.

2. **One study of size is permitted, with these limits.** The reviewer measures the arms of
   [the pre-registration](../../studies/EFFICIENCY_ABLATION_PREREGISTRATION.md) once.
   - A realization may only be made smaller. No behaviour is added to a run.
   - No standard is changed, and no closing endpoint, margin or bar of 0012 is touched.
   - Only development tasks are used. Nothing held out for the third round or written for a seal is opened.

3. **Every realization that might ship is an arm, named before the run.** What is built afterwards is exactly the
   arm the rule selects. A result that disappoints is not answered with a new strategy: that is the loop 0012 was
   written to stop.

4. **Which arms may become the default.** Serving none of the author's pieces, or whole pieces within 3,000 words.
   Excerpts (an opening and a middle passage of each piece) are measured and stay opt-in: they are a new mode, and
   [0008](0008-one-point-zero-is-the-floor.md) keeps a new mode off in 1.x until a sealed study shows it helps, which
   this study cannot show. The export without its file index is an option and is not in the study.

5. **The selection rule is fixed in two scripts sealed with the pre-registration**
   (`bench/compare/efficiency-rows.mjs` builds the rows, `bench/compare/efficiency-select.mjs` reads them). Each
   domain is read on its own and domains are never pooled. Against today's skill, an arm is rejected in a domain when
   it breaks the author's required rules in more than five more answers in a hundred, when it scores more than one
   point of fifty lower on the comparator's own score, or, where a reader was qualified on that domain, when today's
   skill is clearly preferred on voice. The smallest arm that may become the default and is rejected nowhere is
   selected. If there is none, today's size stays.

6. **The study selects; it does not prove, and it says how often it is wrong.** At thirty tasks a domain's rule
   reading rejects an arm that is truly level about one time in four, and passes one that is truly ten points worse
   about three times in ten. So "none selected" means the study did not show that a smaller skill holds. It does not
   mean the size was shown to buy something, and the README may not say so. The words for a result are "selected",
   "stood" and "rejected in", never "equivalent".

7. **An unqualified reader decides nothing.** Voice is read by a model only on a domain where that exact reader was
   qualified at 0012's bar for an instrument. Elsewhere it is unread and rejects no arm. The pieces are there for
   voice and a model may not see their loss, so the owner reads ten blind pairs in the third round, the selected arm
   against today's skill, and today's size is kept if today's skill is chosen in eight or more.

8. **The fallback is a commit prepared in advance.** Before the third round two commits exist that differ in one
   constant: the selected budget, and today's. The third round measures the selected arm beside today's skill, both
   written afresh, on tasks the study did not use, with the same scripts and the same tolerances. If the selected arm
   is rejected or unread there, or the owner's read goes against it, the commit with today's budget is the one
   sealed. Naming one of two prepared commits is not a product change.

9. **What a new default touches.** The budget of a new build of a skill that writes, and nothing else. A skill that
   answers shows its examples within its own budget and is exported byte for byte as before; the third round confirms
   it by sha256, and the second round's result on the held-out coding tasks stands only if that holds. A skill
   already built keeps its pieces until they are chosen again. Today's configuration is `--piece-budget 9000`.

10. **A skill states its size three ways:** stored (every file of the package), exported (what a run is served and
    what `atelier export` writes), and per run (what one run sent). The export is split by part. Sizes are counted
    in words and bytes; a token count is stated only where a provider reported it, which a run records.

11. **A run says where its cost went.** Each call on the path of a run names its purpose, and the lines and the
    total are counted from the same moment. The checked runtime costs about seven times the plug-in, and two drafts
    explain at most two of the seven. Until the rest is measured on real runs, no setting that changes how a run
    spends is built: one draft first, a second only on evidence; the taste reader off under strict delivery; the
    coverage reading only for a request with more than one part. Each is a change of behaviour and waits for the
    breakdown.

12. **[0006](0006-release-contract.md) was never signed.** 0012 is the binding record and amends it. Only what 0012
    keeps of 0006 operates: its goal of four domains in five, first counted in claim B, and its table of what blocks
    a release.

**Deferred to 2.0, each with its reason.**

| Idea | Why it waits |
|---|---|
| Excerpts as the default | A new mode, which 0008 keeps off in 1.x. This study gives 2.0 a first number for it. |
| Sending the model only the rules that apply to a request | On the one skill measured, the rules and their examples are a fifth of the export, so the payoff is small. Where applicability can be decided by code it may come first; a learned reading of "this required rule does not apply" needs a qualified reader, because a wrong answer silently drops a rule the owner required. |
| A search over how rules are carried, with a fixed set of permitted edits ([0004](0004-search-under-a-fixed-standard.md)) | No measured defect of 1.x needs it, and telling candidates apart takes more development data than this pass may use. Its best idea is kept: the search has no operation that edits the standard. |
| An optimisation over a graph of carriers | Built for hundreds of carriers. A skill has a few dozen pieces and rules, and a budget does the same work. |
| Another provider's classifier, and thresholds learned from run records | No measured bottleneck calls for one, and the records to learn from do not exist yet. The order is already code first, then a small model, then a strong one. |
| One draft first as the default; strict delivery as the default | Each changes a default 0008 pins. 0012 already names strict delivery as the default from 2.0. |
| A task's own measure of success (tests pass, a query is correct) optimised inside the standard | A sound extension that no claim of 1.x needs. |
| A trained voice adapter | A different generator, which 0012 leaves to a new major version under [0009](0009-voice-below-the-standard.md). |

**Consequences.** One study, one build of exactly what it selects, the third round, then the seals. If no smaller
skill is selected, 1.x ships at today's size and says that a smaller one was not shown to hold. Either way size is
not reopened in the 1.x line.

**Not in this record.** Any change to a standard. Any new instrument. Any mechanism added because an arm lost.

**Approved:** the owner, 2026-10-05, as "one bounded efficiency study before the last round". The arms, the
tolerances and the eight-of-ten rule above were written afterwards and are the owner's to confirm before the
pre-registration is sealed.
