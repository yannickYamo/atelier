# Preregistrations and study records

Every study this project has run that bears on a claim in the paper, including the ones that failed
and the one whose headline figure was withdrawn. Preregistrations were sealed before generation and
are published as sealed, not as they would read with hindsight.

**What is here is the design and the analysis. What is not here is the corpora.** The raw work of the
maintainers studied, the pricing cases, and the scored outputs live in a private tree and are not
published. So the method is checkable and most of the numbers are not recomputable from this
repository alone. That distinction is the honest boundary of "public" for this work, and
[MEASUREMENTS.md](../MEASUREMENTS.md) draws the same line for figures quoted in source comments.

## Anonymisation

Two studies use the public review comments of real maintainers. **Neither person was contacted and
neither has ratified anything.** Their comments are public; the characterisation of their judgment in
these records is ours, not theirs. They appear as **Maintainer A** and **Maintainer B**, their
projects as **repository A** and **repository B**, and the paper uses the same convention. Nothing
else in these records has been altered, and no result depends on the identities.

## The studies

### Sealed, with results (September 2026)

| | |
|---|---|
| [CLAIM_READER_V3_QUALIFICATION_RESULT.md](CLAIM_READER_V3_QUALIFICATION_RESULT.md) | **Result: PASS.** On 25 unused product essays, version 3 left 41 of 48 clean drafts alone (0.854, 95% CI 0.722–0.939) and caught 45 of 45 plants it read, including every figure planted in a heading or a table; the pattern check caught 11 of 46. Most false flags were the author's own true stories. Qualified to gate on this population. |
| [CLAIM_READER_V3_QUALIFICATION_PREREGISTRATION.md](CLAIM_READER_V3_QUALIFICATION_PREREGISTRATION.md) | **SEALED.** The audit's fixes made version 3 (`a173339d`) a new instrument, so version 2's pass does not carry over. It breaks version 2's "no third attempt before Phase C", and says why: an implementation bug invalidated the evidence (§8b.6). 30 unused product essays, the same floors, and heading and table plants because version 3 now reads both. The last attempt before Phase C. |
| [SENSOR_QUALIFICATION_RESULT.md](SENSOR_QUALIFICATION_RESULT.md) | **Result: counted features PASS, move reader FAIL.** On 40 unused newsletters, 9 of the 10 features selection kept replicated on unseen pieces and drafts (2 as per-draft rules, bands held). The move reader had one feature reliable, kept and replicating (the floor was two), and stays parked. |
| [SENSOR_QUALIFICATION_PREREGISTRATION.md](SENSOR_QUALIFICATION_PREREGISTRATION.md) | **SEALED.** Phase A2: do the counted features selection keeps separate an author from the model on pieces and drafts it never saw (40 unused newsletters, split before generation)? Is the move reader reliable on a re-read, and does it separate? C1: 70% of kept features replicate. C2: 2 move features reliable, kept and replicating. |
| [STRUCTURE_READER_PREREGISTRATION.md](STRUCTURE_READER_PREREGISTRATION.md) | **SEALED.** Is a paragraph-level structure reader (eleven moves, two reads, kept where they agree) reliable on a re-read, and do its sequence features separate the author from the model on the corpus the move reader failed on? PASS: 3 features reliable, kept and replicating. |
| [STRUCTURE_READER_RESULT.md](STRUCTURE_READER_RESULT.md) | **FAIL.** Reliable (two-read κ median 0.867; re-read ≥ 0.94 on 11 of 12 features), but no feature separated author from model by the bar; the strongest, switch rate and entropy rate (AUC ~0.71), point the way the fiction study found. The reader stays a monitor. |
| [INDISTINGUISHABILITY_PREREGISTRATION.md](INDISTINGUISHABILITY_PREREGISTRATION.md) | **SEALED.** Can each arm's outputs (plain, pasted, Atelier, plan-first, plan-first steered) be told apart from the author's unseen pieces by a classifier on a feature family no arm steers on? PASS: the better plan arm 0.10 AUC below every baseline on both corpora, with no invented claim. |
| [INDISTINGUISHABILITY_RESULT.md](INDISTINGUISHABILITY_RESULT.md) | **FAIL (machine); human read pending.** Every arm, plain to plan-first steered, was told apart from the authors' unseen pieces (AUC 0.75–1.0); plan-first did not help (−0.156 and −0.021 against the best baseline). The Atelier arms delivered no invented claim in 60 outputs, against 37–67 flagged specifics per corpus for plain and pasted. |
| [CONTEXT_BANDS_PREREGISTRATION.md](CONTEXT_BANDS_PREREGISTRATION.md) | **SEALED.** Offline, on the indistinguishability study's texts: do steering bands moved toward the author's pieces nearest the request tell the author's unseen pieces from the model's outputs better than the bands for all their pieces? PASS: +0.05 AUC pooled, interval above 0, no corpus worse by 0.05, the author's own median in-band share not down by more than 0.05. |
| [CONTEXT_BANDS_RESULT.md](CONTEXT_BANDS_RESULT.md) | **FAIL.** Bands moved toward the request's nearest pieces told the author from the model no better (pooled +0.0006 AUC [−0.025, 0.027]; bar +0.05). The author's own pieces were not rejected. On title-only requests, lexical nearness found near pieces for only 12 of 36 newsletter texts. `context=local` stays opt-in. |
| [AUTHOR_FLOOR_PREREGISTRATION.md](AUTHOR_FLOOR_PREREGISTRATION.md) | **SEALED.** Offline, on the indistinguishability study's two authors: how well does the same classifier tell an author's own pieces from each other at the study's sample sizes? The floor is the 95th percentile of 200 random splits; an arm whose AUC is at or below it was not resolved at that size. |
| [AUTHOR_FLOOR_RESULT.md](AUTHOR_FLOOR_RESULT.md) | **The floor is 0.72 to 0.81, not 0.5.** An author's own pieces are told from each other at AUC 0.813 (8 a side) and 0.722 (12 a side) one time in twenty. Every Atelier arm of the indistinguishability study sits above its floor, so that FAIL stands; the plain arm on the technical author, and that author's reading without function-word n-grams, were not resolved at 8 a side. |
| [INDEPENDENT_TEST_BRIEF.md](INDEPENDENT_TEST_BRIEF.md) | **The brief for an outside tester.** What to check on `main`, the three instruments to qualify, the three closing claims, the rules, and what to send back. |
| [CLOSING_A_PREREGISTRATION.md](CLOSING_A_PREREGISTRATION.md) | **DRAFT, not sealed.** Decision 0012, claim A: on 150 new coding tasks, the Atelier plug-in built from examples against i-have-adhd, as published and with the examples pasted. PASS: the owner's required rules held more often, not worse on that skill's own judge, and no clear loss on any dimension, on blockers or on requested depth. |
| [CLOSING_AW_PREREGISTRATION.md](CLOSING_AW_PREREGISTRATION.md) | **DRAFT, not sealed.** Decision 0012, claim A-w: on 30 writing briefs for each of two authors, the Atelier plug-in built from the author's pieces against stop-slop, as published and with the pieces pasted. PASS: the author's required rules held more often, not worse on stop-slop's own score, readers not preferring the comparator by a clear margin, no more invented specifics. |
| [CLOSING_B_PREREGISTRATION.md](CLOSING_B_PREREGISTRATION.md) | **DRAFT, not sealed.** Decision 0012, claim B: under `--strict`, across three or more kinds of work with 60 sealed requests each, no delivered output breaks a measured required rule in a person's audit, and it still delivers. Repeatability against pasted examples and long sessions have verdicts of their own. |
| [EFFICIENCY_ABLATION_PREREGISTRATION.md](EFFICIENCY_ABLATION_PREREGISTRATION.md) | **DRAFT, not sealed.** Decision 0014: can a skill serve less of the author's writing and still hold its standard? Four smaller configurations of each of two writing skills against today's (none of the author's pieces, whole pieces within 3,000 words, excerpts within 1,500 and 3,000), on 30 or more development tasks per domain. The smaller of the first two becomes the default if it is rejected in neither domain on rules or on quality; excerpts are measured only, and voice is read by the owner in the last round, not by a model. A selection with stated error rates, not a proof of equivalence, measured again beside today's skill in the last round. |
| [COVERAGE_READER_PREREGISTRATION.md](COVERAGE_READER_PREREGISTRATION.md) | **DRAFT, not sealed.** Does the coverage reading see a part of the request a reply left out? Planted omissions against full replies: sensitivity 0.85, false alarms at most 0.10. |
| [SUBJECT_READER_PREREGISTRATION.md](SUBJECT_READER_PREREGISTRATION.md) | **DRAFT, not sealed.** Does a small model's reading find an author's pieces on a request's subject (known item, coverage, false near, selectivity, repeatability), and the document type a request names, better than word matching? Two verdicts, with the bars fixed here. Under $2. |
| [VOICE_GATE_PREREGISTRATION.md](VOICE_GATE_PREREGISTRATION.md) | **DRAFT, not sealed.** The voice integrity gate against planted changes, the condition decision 0009 set: three gates (the word lists, the lists with a small model's second read, the reader in the lists' place) on 112 clean pairs and 360 plants of six kinds. Offline, before sealing: the shipped gate keeps 32 of 112 faithful pairs. Under $4. |
| [VOICE_PASS_PREREGISTRATION.md](VOICE_PASS_PREREGISTRATION.md) | **DRAFT, not sealed.** Decision 0012, claim C: the in-context voice pass against pasted examples, both written in one run, for two authors and fifteen requests each, read blind by a panel of five per author and scored over requests. The last voice round of 1.x; run only after the gate study. |
| [CLAIM_READER_V2_QUALIFICATION_RESULT.md](CLAIM_READER_V2_QUALIFICATION_RESULT.md) | **Result: PASS.** On 28 TEST pieces no study had used, the claim reader v2 left 35 of 38 clean drafts alone (0.921, 95% CI 0.786–0.983) and caught 35 of 35 planted inventions (the pattern check: 9 of 35). Qualified to gate on this population; the interval is wide, and version 1 failed on essays. |
| [CLAIM_READER_V2_QUALIFICATION_PREREGISTRATION.md](CLAIM_READER_V2_QUALIFICATION_PREREGISTRATION.md) | **SEALED.** The one approved second attempt: decision version 2 (location checked, verbatim trace to the material, spelled-out numbers), the prompt unchanged, qualified on 33 pieces no study had used. Same floors; no third attempt before Phase C. |
| [CLAIM_READER_QUALIFICATION_RESULT.md](CLAIM_READER_QUALIFICATION_RESULT.md) | **Result: FAIL on specificity.** The claim reader caught 39 of 39 planted inventions (the pattern check 18 of 39) but flagged true material in 11 of 43 clean drafts (specificity 0.744 against a floor of 0.80). Not qualified to gate; the gate stays fail-closed. The false positives, read after unblinding, point at mislocated sentences. |
| [CLAIM_READER_QUALIFICATION_PREREGISTRATION.md](CLAIM_READER_QUALIFICATION_PREREGISTRATION.md) | **SEALED.** Phase B: the claim reader behind UNSOURCED (a hard gate) measured once against fixed floors. Specificity ≥ 0.80 on clean rewrites of real pieces with their material supplied; sensitivity ≥ 0.50 on one planted invention of eight kinds. The pattern check is a comparator; no tuning. Run with `studies/harness/claim-qualification.mjs`. |
| [VOICE_ROUNDS_RESULT.md](VOICE_ROUNDS_RESULT.md) | **Result of the voice rounds 1 to 7.** Round 7: the owner's blind read preferred Atelier over a model given the author's own pieces, with almost no copying and no invented material; the sealed gate still failed on machine moves and one piece's range. What is established, what is not, and what comes next. |
| [VOICE_ROUND7_PREREGISTRATION.md](VOICE_ROUND7_PREREGISTRATION.md) | **SEALED.** Confirmation after round 6's narrow fail and the enforcement fixes it exposed: criteria 1-5 unchanged, the voice criterion is the owner's blind read of two briefs (stylometry could not discriminate). |
| [VOICE_ROUND6_PREREGISTRATION.md](VOICE_ROUND6_PREREGISTRATION.md) | **SEALED.** The one confirmation run after the round-5 analysis: the machine-tell layer (catalogue at the author's rate, learned lexicon, move-aware repair, two drafts) against raw and corpus-fed arms, with a six-part gate and the model judge tracked only. Offline evidence from `studies/harness/guard-offline.mjs`. |
| [VOICE_ROUND5_PREREGISTRATION.md](VOICE_ROUND5_PREREGISTRATION.md) | **SEALED.** After four blind voice rounds on one public author's corpus: seven arms (raw, corpus in context with and without Atelier's guard, a model's guide with and without it, Atelier with and without its persona), six reserved pieces as the stylometric reference, and the decision rule for whether Atelier generates or guards. Run with `studies/harness/voice-round.mjs`. |

### Drafted, not yet sealed

| | |
|---|---|
| [VOICE_STUDY_PREREGISTRATION.md](VOICE_STUDY_PREREGISTRATION.md) | **DRAFT.** The study that closes the voice question: new pieces in the company blog's voice, Atelier against a plain prompt and the essays pasted, same model and facts, 8 briefs, 3 blind readers. Voice is shown if Atelier is first in 13 of 24 reads (p = 0.028 against one in three) and for 2 of 3 readers, and no Atelier piece changes a claim. Either result closes it. |
| [PHASE_C_PREREGISTRATION.md](PHASE_C_PREREGISTRATION.md) | **DRAFT.** The external blind confirmation: three experts, 36 briefs, ATELIER against the expert's pieces plus the same guard, read first by someone who knows the expert and has not seen the standard. Win if 24 of 36 (one-sided exact). It also asks which sensors track what readers prefer. Harness: `studies/harness/phase-c-*.mjs`. |
| [PROOF_STUDY_PREREGISTRATION.md](PROOF_STUDY_PREREGISTRATION.md) | **DRAFT.** Recall of discovery against the owner's hand-built house standard (sealed answer key), and the shipped loop against a model's own guide to the same corpus, with a deterministic measured-rule table anyone can recompute (`scripts/measured-conformance.mts`, `scripts/recall-sheet.mts`). Sealed only by the owner's commit, before discovery reads the corpus. |

### The one reproducible study

| | |
|---|---|
| [CARRIER_ABLATION_PREREGISTRATION.md](CARRIER_ABLATION_PREREGISTRATION.md) | Judge-free carrier ablation. Run it: `npm run ablation:carrier`. Measures structural conformance mechanically across three arms; its own header states which arms are conformant by construction and what a passing verdict does not mean. |

### Compilation against baselines

| | |
|---|---|
| [M2_PRICING_STUDY_DESIGN.md](M2_PRICING_STUDY_DESIGN.md) | The sealed design for the pricing study. |
| [M2_PRICING_STUDY_CLOSE.md](M2_PRICING_STUDY_CLOSE.md) | **The null.** A compiled standard scored exactly what a bare model scored, 17 clusters, sign-flip permutation. Not repaired, not rerun, per the preregistered failure protocol. The components are not null and they oppose each other: compilation improved coverage and destroyed restraint. |
| [MAINTAINER_A_STUDY_CLOSE.md](MAINTAINER_A_STUDY_CLOSE.md) | **The positive result, and a withdrawn figure.** 15 of 17 held-out contexts. The first published p-value pooled 46 nested observations as independent; it is withdrawn and replaced by a context-level analysis. Read §"statistical correction" before quoting anything here. |
| [MAINTAINER_A_ENDTOEND_RESULT.md](MAINTAINER_A_ENDTOEND_RESULT.md) | The end-to-end run behind that close. |

### What discovery can and cannot recover

| | |
|---|---|
| [ACQUISITION_STUDY_B_PREREGISTRATION.md](ACQUISITION_STUDY_B_PREREGISTRATION.md) · [RESULT](ACQUISITION_STUDY_B_RESULT.md) | Which work yields decision rules. Review conversation returned 0 clean rules of 8; implementation critique returned 4 of 9. |
| [MAINTAINER_B_RESULT.md](MAINTAINER_B_RESULT.md) | **A gate that failed and was not excepted.** 2 clean candidates against a threshold of 3, so the generation study did not run. Contains a selection confound the author introduced, reported rather than acted on. |
| [DECISION_SITE_INTERVENTION_RESULT.md](DECISION_SITE_INTERVENTION_RESULT.md) | Making decision sites visible in the evidence. |
| [DOMAIN_FAMILY_PROBE_PREREGISTRATION.md](DOMAIN_FAMILY_PROBE_PREREGISTRATION.md) · [RESULT](DOMAIN_FAMILY_PROBE_RESULT.md) | Whether findings hold across domain families. |
| [ARM_E_PREREGISTRATION.md](ARM_E_PREREGISTRATION.md) · [RESULT](ARM_E_RESULT.md) | The expert-selected-examples arm. |
| [CONTEXTUAL_GENERALIZATION_PREREGISTRATION.md](CONTEXTUAL_GENERALIZATION_PREREGISTRATION.md) | Generalization to unseen contexts. |

### Does a compiled skill beat the bare model?

| | |
|---|---|
| [CONTRACT_LIFT_PREREGISTRATION.md](CONTRACT_LIFT_PREREGISTRATION.md) | Sealed before any context was generated. 24 contexts x 3 generations x 2 arms, endpoints and stopping rules fixed in advance, one amendment recorded before the freeze. |
| [CONTRACT_LIFT_CLOSE.md](CONTRACT_LIFT_CLOSE.md) | **Coverage figures WITHDRAWN — see the negative-branch close.** **The M2 result reproduced on a different standard, task family and model.** Primary null (Δ = −0.021), and its components oppose: coverage +0.167, restraint −0.208. The bare model was perfect on restraint and the compiled skill broke it. More regressions than recoveries. The model reader abstains 29% of the time and is systematically permissive — 17 false passes, zero false fails — which is why it certifies nothing. |
| [CONTRACT_LIFT_SUITE.json](CONTRACT_LIFT_SUITE.json) · [RESULTS](CONTRACT_LIFT_RESULTS.json) | The frozen contexts and the per-generation structural labels. Reproducible from these. |

### Can static prose carry a conditional rule?

| | |
|---|---|
| [NEGATIVE_BRANCH_PREREGISTRATION.md](NEGATIVE_BRANCH_PREREGISTRATION.md) | Sealed before any context existed. The contract-lift study compiled a conditional rule that said when to apply and never what to do otherwise, so it tested a one-sided rendering rather than static prose as such. Three arms — BARE, STATIC, EXPLICIT — on 16 fresh contexts, with the success condition and the failure shape to watch for both stated in advance. |
| [NEGATIVE_BRANCH_CLOSE.md](NEGATIVE_BRANCH_CLOSE.md) | **The primary passed: stating the otherwise-branch fully restored restraint** (0.708 → 1.000, Δ +0.292, CI [+0.083, +0.500], three recoveries and no regressions), for a one-sentence renderer change and no applicability engine. It also found the defect that **withdraws every coverage figure in both studies**: generations truncated by the thinking budget before an answer was written. Restraint outputs were never truncated, so those findings stand. |
| [EXTERNAL_EXPERT_ONE_PAGER_TEMPLATE.md](EXTERNAL_EXPERT_ONE_PAGER_TEMPLATE.md) | The exact prompt handed to the external reviewer for their B4 one-pager, versioned so the record shows how much scaffolding the "expert's own half hour" received. Open questions only — teaching our structure would make the baseline partly ours. |
| [EXTERNAL_EXPERT_B2_PREREGISTRATION.md](EXTERNAL_EXPERT_B2_PREREGISTRATION.md) | SEALED, not yet run: the first study with a non-builder expert. Primary T_vs_B2 — does the ratified, compiled standard beat a token-matched guide a capable model writes from the same corpus? 40 primary pairs, exact sign test with the power table pinned by shipped tests, identical-pair and known-bad validity gates, day-7 repeats for intra-rater agreement, and the failure protocol declared before any corpus was read. |
| [EXTERNAL_EXPERT_PILOT_PREREGISTRATION.md](EXTERNAL_EXPERT_PILOT_PREREGISTRATION.md) | SEALED: the pilot actually being run, because the reviewer's corpus stopped at 4 mixed-genre pieces. Reframed claim (overall voice across genres, not a one-work-type standard), corpus sealed by hash with its limitations stated in full, a ratification gate that stops the study before the endpoint if the standard comes out thin, and a claims ceiling written before any number exists. The B2 design above stays sealed and unexecuted, waiting for the corpus it specified. |
| [EXTERNAL_EXPERT_PILOT_CLOSE.md](EXTERNAL_EXPERT_PILOT_CLOSE.md) | **Closed ACQUISITION-ONLY at its own gate.** The first non-builder ratification in this repository: 18 of 18 rules kept — and zero REQUIRED, so the compiled standard instructs nothing, the known-bad validity trials cannot be constructed, and the sealed gate stopped the endpoint before any generation existed. $0.52 spent, the reviewer's 59 trials never spent. Deliverable: their ratified standard. |
| [PREFERRED_CALIBRATION_PREREGISTRATION.md](PREFERRED_CALIBRATION_PREREGISTRATION.md) | SEALED: the behavioral answer to the pilot's zero-REQUIRED close. Declared post-hoc, motivated by the reviewer's own debrief ("required felt too absolute"). Blind, 26 pairs: does violating the rules this reviewer marked PREFERRED get caught? Validity gates built from their own TOLERATED rulings and identical pairs; bar 12/16, one-sided exact p=0.038; no rule is relabeled by anyone but the reviewer, whatever the result. |
| [PREFERRED_CALIBRATION_CLOSE.md](PREFERRED_CALIBRATION_CLOSE.md) | WITHDRAWN BEFORE RUN, same day, zero data — the builder chose the override endpoint instead. The design stays runnable. |
| [EXPLORATORY_OVERRIDE_ENDPOINT.md](EXPLORATORY_OVERRIDE_ENDPOINT.md) | **EXPLORATORY, never confirmatory, by construction:** the builder — not the reviewer — raised the nine PREFERRED rules to REQUIRED (supersession and all nine ledger records say so), against the assistant's recorded objection, and the T-vs-B2 endpoint runs blind on that standard. Full rigor kept: 51 frozen tasks (~half restraint), token-matched guide, identical-pair and known-bad gates, sealed sides, shipped stats. The ceiling is sealed with the design: a win licenses only a proper reviewer-ruled confirmation. |
| [EXPLORATORY_OVERRIDE_CLOSE.md](EXPLORATORY_OVERRIDE_CLOSE.md) · [key](OVERRIDE_BLIND_KEY.json) · [labels](OVERRIDE_LABELS.json) | **VOID at the sealed gate — and the sharpest result here.** The judge was flawless on identical pairs (5 of 5 called "no material difference") yet could not prefer the compiled skill to a bare model (3 of 6), so no p-value is quoted. Reported as description only: the model-written guide was preferred on 39 of 40 blind pairs. The pilot's preregistered gate had already reached this verdict for $0.52; overriding it cost ~$4 and the reviewer's whole session to arrive at the same place. |
| [MOAT_PREREGISTRATION.md](MOAT_PREREGISTRATION.md) | The moat experiment, sealed before any generation: fixed StandardVersion, incumbent implementation, qualified failure evidence through the shipped `fix` loop, one lateral candidate, and a blind fresh-task expert preference with the bar (≥12/16) and UNCERTAIN-against-candidate declared up front. |
| [CROSS_DOMAIN_PREREGISTRATION.md](CROSS_DOMAIN_PREREGISTRATION.md) | **DRAFT, not sealed.** The measurable target of decision 0006: five domains, at least 30 pieces each, Atelier against the strongest of examples-in-prompt, an induced skill and an expert-edited induced skill, 90 blind pairwise reads per domain by readers who are not the owner. A judge may choose the opponent and block, never decide. Needs corpora, readers and budget that do not exist yet. |
| [B6_PREREGISTRATION.md](B6_PREREGISTRATION.md) | **DRAFT, not sealed.** The closed-loop fidelity study, run by an independent reviewer with `bench/b6/run.mjs`: plain, pasted, Atelier without the loop and with it, on the reviewer's corpora; counted endpoints on an evaluator built apart from the steering (validation bands, a detector trained on validation material only), plus the blind human read of the cross-domain study. |
| [MOAT_RESULT.md](MOAT_RESULT.md) | **Closes NEGATIVE and stands: 9/16, p=0.40.** A single-rule carrier swap (p12 PROSE→SELF_CHECK) inside a 19-rule standard was below the detection threshold of whole-output preference — the fix-level pick was already "same". The governance half held throughout: the standard hash never moved, asserted at every step. Blind key verified against the hash published before the first label. Self-judged by the standard's owner, and says so. |
| [MOAT_BLIND_KEY.json](MOAT_BLIND_KEY.json) | The sealed A/B order for the 16 endpoint pairs, published with the result; its sha256 was handed to the expert before the first label. |
| [MOAT_SESSION_LOG.md](MOAT_SESSION_LOG.md) | The running log of the session that executed the study: every complaint verbatim, all five diagnostic rounds, the two instrument findings (single-attribution cost; stateless diagnoser), spend. |
| [P6_REFINEMENT_RULING.md](P6_REFINEMENT_RULING.md) | **The author rejected the machine s refinement as an overcorrection and wrote his own.** Having correctly found that the original named a realization (brevity) as the invariant, the proposal overcorrected into law-like judgment — equally unsupported. The ratified discriminant is new evidence or forward motion vs interpretive landing of what was just established. Four residuals are DECLARED rather than encoded, because fitting two single instances is the overfitting the proposal was rejected for. The 24 passages are now development data. |
| [P6_CARRIER_CLOSE.md](P6_CARRIER_CLOSE.md) | **The carrier LOST, and the study found a product bug bigger than the comparison.** Blind expert preference went 13-3 to the prose ablation (sign test p=0.021), and the EXAMPLE arm produced the target behaviour LESS often (0.57 vs 0.92). The cause is a rendering defect: examples are appended as markdown sections and the model continues them, so **59% of EXAMPLE-arm outputs contain the skill's own internals**. Stratified by contamination the direction holds in every stratum. A negative result, closed rather than rescued. |
| [P6_OBSERVER_PROBE.md](P6_OBSERVER_PROBE.md) | **Run before building a suite, and it found something better than it was looking for.** No structural detector reaches the 0.60 majority baseline on a clean human key; a frozen model judge reaches kappa **0.257**. But the disagreements are not noise: two careful readers and the author disagree about which sentences a rule the author ratified actually covers. **Ratifying a STATEMENT is not agreeing on its EXTENSION** — the machine's paraphrase kept a frequent realization (brevity) and dropped the invariant. Cost: two labelling sessions and $0.11, against a sealed suite and several hundred generations. |

### Why the obvious repair was not built

| | |
|---|---|
| [M3A_PREREGISTRATION.md](M3A_PREREGISTRATION.md) · [RESULT](M3A_RESULT.md) | The rule-load hypothesis. |
| [M3A_DILUTION_PREREG.md](M3A_DILUTION_PREREG.md) · [RESULTS](M3A_DILUTION_RESULTS.md) | **A supported effect that still did not license the fix.** Adding 23 irrelevant provisions costs ~10 points of restraint, preregistered McNemar p = 0.0043. But it degrades discrimination with flat response bias, where the pricing study showed the opposite endpoint pattern, so rule-load does not explain that null. A plausible architectural fix was removed from consideration before anyone built it. Its co-endpoint is reported **unadjudicated**, because the margin was omitted from the preregistration and picking one afterwards is the flexibility a preregistration exists to remove. |

## How to read these

Three things recur and are worth knowing before quoting any figure.

**Withdrawn numbers stay in the record.** Where a figure was wrong it is marked withdrawn next to
what replaced it, rather than being quietly corrected. The pooled binomial in the Maintainer A close
is the clearest case.

**A preregistered gate that fails is not renegotiated.** The Maintainer B run missed its threshold
with a plausible excuse available, and the excuse was recorded instead of used.

**An unadjudicated endpoint is not a passed one.** M3a's primary passed and its co-condition had no
frozen margin, so the conjunction is reported as not satisfied even though the headline held.
