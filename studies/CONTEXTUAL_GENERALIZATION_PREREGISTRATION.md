# Pre-registration — contextual generalization. Does a compiled standard reproduce an expert's decision boundary better than the examples it was inferred from?

**Status:** DRAFT FOR FOUNDER APPROVAL. **Nothing fires until the open items in §12 are answered and
this document is sealed.** No inference spend is authorised by this document.
**Supersedes as primary estimand:** `ATELIER_ARM_E_RESULT_v1.md`, marked
`INVALID_FOR_PRIMARY_ESTIMAND` (§11).

---

## 1. The estimand, frozen

> Whether an explicit human-ratified StandardVersion causes a target model to reproduce an expert's
> contextual decisions on unseen situations — **including correctly withholding a behaviour when its
> `appliesWhen` condition is false** — more reliably than the same model given the raw expert evidence
> from which that standard was inferred.

Not format adherence. Not aggregate rule counts. Not whether a judge liked the output.

**The hypothesis is not that examples cannot carry conditionality.** Raw examples can carry it when the
corpus contains varied positive and negative contexts. The hypothesis is that explicit `appliesWhen`
structure improves its *reliable recovery*. The baseline is to be made as strong as we can afford, and
a result obtained by weakening it is void.

---

## 2. Primary endpoint — PAIRED conditional correctness

For each decision pair, built around one expert decision boundary:

| | situation | correct behaviour |
|---|---|---|
| TRUE arm of the pair | condition holds | apply behaviour X |
| FALSE arm of the pair | condition does not hold | **withhold** X, answer directly |

**PAIR SUCCESS = both correct.**

False-application rate alone is not the primary endpoint and must never be reported as one. A model
that never applies X scores perfectly on withholding, so conservatism would win the study. Pair
success cannot be gamed in either direction.

**Reported separately, never pooled into the primary:**

1. true-condition success rate
2. false-application rate (the caricature failure)
3. pair success — **primary**
4. complete-answer acceptability, expert-judged, on a subset
5. blind S-vs-E preference, on a subset
6. within-pair consistency across repeated generations

---

## 3. Statistical unit, resolved

**The decision pair is the independent unit for every boundary claim.** Generations are nested
observations and never inflate N.

| | count |
|---|---|
| decision pairs, primary | **P** (see §12; proposed 20) |
| situations | 2P |
| arms, primary | 3 (A, E, S) |
| generations per situation per arm | 3 |
| total generated outputs | **6P × 3 = 18P** (at P=20: 360) |

Expert judgment is deliberately not applied to all 18P. See §6.

**Power, stated honestly in advance.** With one rater and P ≈ 20, a paired exact McNemar test detects
roughly a 30 percentage-point difference in pair success and nothing smaller. **This is a pilot that
validates the instrument and sizes a confirmatory study**, which is the same posture the existing ABC
pilot takes. It is not powered to establish a modest effect, and §9 exists so that an ambiguous result
still carries information.

---

## 4. Sealing order — held-out cases are frozen BEFORE discovery

The previous plan had discovery and ratification happening before the tasks were authored. Having seen
the requirements, an author naturally writes tasks that exercise them, and task selection is then
contaminated by the model under test.

```
                 SEALED BEFORE ANY DISCOVERY RUN
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   CORPUS A              SET C (calibration)   SET B (held-out)
   expert's real work    real situations       real situations
   Atelier learns here   + expert's decision   + expert's decision
        │                     │                     │
        ▼                     │                     │
    DISCOVERY                 │                     │
        ▼                     │                     │
   RATIFICATION               │                     │
        ▼                     │                     │
  StandardVersion             │                     │
        ▼                     │                     │
   SkillVersion               │                     │
        │                     │                     │
        │              qualifies cheap        FINAL EVALUATION
        │              instruments only              │
        └─────────────────────┴─────────────────────┘
                              ▼
                       A / E / S outputs
                              ▼
                     BLIND EXPERT JUDGMENT
```

A, B and C are **disjoint** and all three are sealed by content hash before the first discovery call.

**After ratification**, and before any generation, the expert classifies each already-sealed Set B
situation as *requirement R applies here* or *R does not apply here*. The situations themselves are
never edited, added to, or dropped at this step. The classification is recorded and sealed separately
so the edit history is auditable.

**If Set B does not contain enough clean boundary pairs**, a targeted boundary suite may be constructed
afterwards. It is reported as a **separate secondary result**, explicitly labelled as constructed after
the standard was visible, and it may not be pooled with the natural held-out result.

---

## 5. Arms

| arm | contents |
|---|---|
| **A** | task only. Control |
| **E** | raw expert evidence. At SMALL, the entire Corpus A. At LARGE, a preregistered retrieval policy |
| **S** | the ratified Atelier SkillVersion |

At LARGE, arm E splits and the two answer different questions, which must not be conflated:

| | question it answers |
|---|---|
| **E_topk** | can a practical retrieval-based example system compete with a compiled standard? |
| **E_oracle** | with the best possible precedents hand-selected by the expert for this exact situation, does explicit compilation still add value? |

**Interpretation rule, frozen:** `S > E_topk` with `S ≈ E_oracle` means we have solved expensive
precedent selection. That is commercially real and it is **not** evidence that explicit abstraction
adds behavioural value. Only `S > E_oracle` supports the stronger claim. The two readings are reported
separately and the weaker one is never described as the stronger.

**S_draft** is a secondary mechanistic comparison on a subset only, at most 6 pairs, and may not enter
the primary analysis. Its previously reported authority effect came from an instrument with no
semantic sensitivity and is treated as unreplicated for decisions.

---

## 6. Instruments, and what may be machine-scored

**Standing rule.** Mechanical constructs may be machine-scored. Expert semantic judgment stays
human-scored unless a specific instrument has earned authority **prospectively** on an independent
calibration set.

Three disjoint stages, in order, no backtracking:

1. **Design + polarity fixtures.** For each requirement, six hand-written answers: three correct
   applications or withholdings, three wrong in a named way, one of which must be the caricature
   failure of applying X when the condition is false. **Any check that cannot separate deliberately
   correct from deliberately wrong is cut here, before any spend.**
2. **Independent calibration on Set C.** Expert labels Set C. Each candidate instrument is scored
   against those labels through the judgement ledger. An instrument that agrees is qualified for that
   requirement and may score all generations. An instrument that does not is discarded, and that
   requirement stays expert-only.
3. **Freeze.** No instrument is tuned after this point, and **no Set B item may have contributed to
   designing, tuning or qualifying any instrument.**

Saving expert minutes may not be allowed to recreate G1 by the back door. If no cheap instrument
qualifies, the study runs smaller rather than running on an unqualified one.

**Expert workload, budgeted.**

| judgment | items | est. |
|---|---|---|
| Set C calibration labels | ~2 × 12 situations | ~40 min |
| pair correctness, generation #1, all pairs × 3 arms | 6P at P=20 → 120 | ~90 min |
| pair correctness, generations #2–3, subset of 8 pairs × S and E | 96 | ~70 min |
| blind complete acceptability, S vs E, 10 pairs | 20 | ~40 min |

Roughly four hours total, splittable. Blinding uses the existing sealed side assignment in
`atelier reference`: `prepare` seals an assignment derived from a hash of the unit id, `score`
unblinds, so which arm produced which text is fixed before generation and auditable afterwards.

---

## 7. Copyable versus generalization, classified before firing

Every outcome measure is classified in advance:

**SURFACE_COPYABLE** — reproducible by direct imitation. Heading names, opening formulae, punctuation
form, specific phrases.

**CONTEXTUAL_GENERALIZATION** — requires abstraction. When to apply a behaviour, what evidence
threshold changes the call, when to withhold a standard move, which trade-off controls the answer.

Reported separately and never summed. **A literal string or heading may never be cited as evidence of
semantic generalization.** The previous run scored a verbatim copy and a correct paraphrase with the
same binary and called the result a tie; that must be structurally impossible here.

---

## 8. Scale, and what LARGE actually means

**SMALL** — all expert evidence fits comfortably in context, and arm E receives the entire corpus. No
straw man. Question: does compiling a standard add behavioural value at all when carrying the examples
is free?

**LARGE** — evidence is substantial enough that selection is necessary, and it must contain **real
contextual contradiction**, verified present before firing:

```
context A  →  expert does X
context B  →  expert deliberately does NOT do X
context C  →  expert does Y instead
```

More tokens alone is only a compression test. Atelier's claim is conditional abstraction, so without
genuine contradiction LARGE tests nothing the product is about.

---

## 9. Economics, measured as a full curve

Per arm, both conditions:

**Acquisition, once.** Discovery inference cost, expert ratification minutes, compilation cost.

**Runtime, per invocation.** Input tokens, output tokens, dollars, wall-clock latency.

**Break-even.** The N at which cumulative Atelier cost crosses cumulative raw-example cost.

If quality ties, *"reaches equivalent expert fidelity and repays its acquisition cost after N uses"* is
a real product result and it is only available if this is instrumented from the first cell.

---

## 10. Success thresholds and interpretation rules, frozen before firing

`p < 0.05` is not the definition of success. Two thresholds, set by the founder in §12:

| | meaning |
|---|---|
| **Δ_meaningful** | pair-success advantage of S over the strongest E arm at which the behavioural claim is commercially real. Proposed **+15pp** |
| **Δ_null** | if the CI upper bound falls below this, a behavioural advantage is effectively ruled out at this scale. Proposed **+10pp** |

Reported together: paired effect, confidence interval, and both thresholds. A study can be
statistically ambiguous and still rule out a commercially interesting effect, or fail significance
while remaining consistent with one.

**Kill criterion, both branches, frozen.**

> If S produces no meaningful quality or reliability advantage over a strong raw-example baseline at
> LARGE, **but** materially reduces cost or improves governance and portability, then reposition
> Atelier around explicit standards, portability, governance and economics, and change the marketing
> the same day.
>
> If S shows neither a behavioural nor a meaningful operational advantage, the core product thesis is
> weakened and must be reconsidered.

This is written down now so it cannot be renegotiated once the number exists.

---

## 11. The previous run

`ATELIER_ARM_E_RESULT_v1.md` is marked **`INVALID_FOR_PRIMARY_ESTIMAND`**. Reason, stated in that
document: the arms were rewarded for different behaviours — arm E passed the discriminating check by
reproducing corpus headings verbatim 30 times out of 30 while arm S passed by paraphrasing 29 times out
of 30, and the primary instrument had no sensitivity to expert-level semantic correctness. It is not
rerun under that rubric. The S_draft versus S_req comparison within it is uncontaminated by copying but
speaks only to format adherence.

---

## 12. OPEN — founder decisions required before sealing

1. **Which expert.** A cooperative external expert is strongly preferred over the founder's own work,
   and the founder's own work is strongly preferred over anything synthetic. **Recommended
   acquisition: a senior engineer's code-review history.** Engineering judgment is maximally
   context-dependent — sometimes abstract, sometimes deliberately duplicate; sometimes demand a test,
   sometimes judge it unnecessary — which is a brutal test of `appliesWhen`. It is also the rare corpus
   where the FALSE cases are naturally recorded, because what a reviewer deliberately let go is in the
   history alongside what they flagged.
2. **P**, the number of decision pairs. Proposed 20. Drives burden, spend and power.
3. **Δ_meaningful and Δ_null.** Proposed +15pp and +10pp.
4. **Spend ceiling.** Phases 1–2 estimated $15–30. Phase 3 is dominated by arm E context at LARGE and
   could reach $60–150, which is itself a reportable finding.
5. **Provider credentials.** The OpenRouter key is at its account limit. Nothing can fire until it is
   raised or replaced.

**Nothing is generated until these are answered, this document is sealed by hash, the polarity
fixtures pass, and the spend ceiling is explicitly approved.**

---

## AMENDMENT 1 — the external expert, frozen. 2026-08-24, before sealing and before any spend.

### A1.1 Expert 1 target, frozen

An **external senior, staff or principal engineer** with substantial decision-rich review history in
**one coherent codebase**. Required properties:

- repeatedly reviews the same *classes of decision*, not syntax
- has instances of **both intervention and deliberate acceptance** on comparable code
- can articulate why one implementation passed and a superficially similar one did not
- has **authored code and behaviour-preserving refactors**, so the corpus is more than review comments
- available for roughly 60–90 minutes of ratification and a separate session of blinded judging
- **is not involved in building Atelier**

**One expert, not several.** The unit of the product is an individual's standard, so one deeply
characterised expert beats five shallow ones. Cross-expert generalization is a later question and does
not belong in this study.

### A1.2 REVIEW SILENCE IS NOT NEGATIVE EVIDENCE

**This is a binding rule and it corrects a false claim in §12 of the sealed draft.**

That draft asserted that code review is a corpus where FALSE cases are naturally recorded, because
what a reviewer let go sits beside what they flagged. **That is wrong.** Silence is unlabeled, not
negative. It can mean acceptable, and it can equally mean missed, out of scope for that review, low
priority, already settled in another channel, deferred, or covered by another reviewer.

The failure this prevents is not a mislabelled row. It **inverts the primary endpoint on the affected
cells**: if some fraction of silences are missed defects, an arm that correctly flags one is scored as
a false application, so the arm that best reproduces the expert's ideal judgment is penalised for
exceeding their actual attention on the day.

**The rule.** A FALSE case enters the primary boundary set **only when the expert explicitly confirms
that withholding intervention is the intended judgment.** Absence of a comment never converts to a
negative label by any inference, at any stage, for any reason.

### A1.3 The Set B classification, and the third option that must exist

After discovery and ratification, before any generation, the expert classifies each **already-sealed**
Set B situation into exactly one of:

| | becomes |
|---|---|
| *I would intervene here* | TRUE arm of a boundary pair |
| *I would deliberately let this pass* | FALSE arm of a boundary pair |
| **UNCERTAIN, or I may simply have missed it** | **EXCLUDED** |

UNCERTAIN is excluded under this preregistered rule and is **never converted into a negative**. The
exclusion count is reported, because a high exclusion rate is itself information about how much of the
history carries recoverable judgment.

Situations are not edited, added to or dropped at this step. Only the classification is added.

### A1.4 Evidence hierarchy for boundary cases, frozen

| tier | shape | admissible |
|---|---|---|
| **1, strongest** | the expert historically objected in case 1, and confirms deliberate acceptance in a comparable case 2 | primary |
| **2, valid** | a historical situation sealed before the standard existed; the expert now states *I would intervene* or *I would deliberately leave this* | primary |
| **3, weakest** | a snippet written after the rule was visible, designed to switch it on or off | **secondary constructed suite only**, reported apart, never pooled |

Tier 2 is admissible in the primary precisely because the situation was sealed before Atelier's
standard existed. Tier 3 is not, for the same reason it was excluded in §4.

### A1.5 Deterministic correctness is filtered out BEFORE the expert sees anything

Atelier gets no credit for rediscovering *tests must pass* or *this violates the type checker*. Before
Set B is assembled, every candidate situation is run through the repository's own deterministic tools —
compiler, type checker, linter, test suite, formatter. **Any situation a deterministic tool already
decides is excluded.**

What remains is the target: two technically valid implementations where this engineer consistently
prefers one. That is the only region where a standard can be doing work.

### A1.6 Why engineering is the right first domain, and what follows it

Engineering attacks the moat claim where it is supposed to live. A good reviewer says *abstract this*
in one place and *do not abstract this yet* in another; *this duplication is fine* here and *this
duplication is now dangerous* there; *this edge case deserves a test* against *a test here would only
freeze an implementation detail*. The raw history contains **apparently contradictory behaviour**, and
recovering `do X WHEN A / do not do X WHEN B` from it is a far harder and more valuable problem than
reproducing prose rhythm.

If Atelier succeeds there, `appliesWhen` is demonstrated to be capturing judgment rather than being
decorative metadata.

**Expert 2, a later study, is deliberately a prose-heavy expert**, to test judgment plus lexical,
figurative and emotional realization. Engineering first because it is the stronger falsification test;
the pair together is what would make the taste story hard to dismiss.

### A1.7 Expert time, reconciled — the draft asked for four hours and the budget is ninety minutes

§6 of the sealed draft budgeted roughly four hours. That conflicts with the recruitment constraint and
four hours will not be granted by a working principal engineer. Resolved as follows.

**Two sessions, each ~75 minutes, which is far more askable than one four-hour block.**

*Session 1 — ratify and classify.* Ratification of discovered candidates, then Set B classification
under A1.3.

*Session 2 — judge, blinded.* Pair correctness on S and E only.

**Arm A is dropped from expert judgment.** It is a control; it is machine-scored, plus a six-item
expert spot check to confirm it is as weak as the checks say. That removes a third of the judging load
at no cost to the primary comparison, which is S against E.

**Consequence for power, stated now.** The judged set becomes 4P judgments. At ~45 seconds each,
50 minutes of judging supports **P ≈ 15**. A paired exact test at P=15 detects roughly a 40 percentage
point difference and nothing smaller. **This is explicitly an instrument-validating pilot that sizes a
confirmatory study.** It is not powered to establish a modest effect, and §10's minimum meaningful
effect is what keeps an ambiguous result informative. If the expert grants more time, P rises and this
is renegotiated before sealing, never after seeing outputs.

### A1.8 Phase −1 — a pipeline check on code, before any expert is approached

**Every discovery run this programme has made has been over prose.** `run-chain`, span anchoring and
`locateSpan` are built for prose spans. Whether they behave on diffs, review comments and source is
**unknown and untested**, and finding out during a recruited expert's session would waste the one
resource this study is short of.

So before anyone is approached: run intake and discovery over a **public** repository's review history
and authored code. No expert, no judging, no measurement, no claim. The only questions are whether the
pipeline completes, whether anchoring produces spans that point at real code, and whether the recovered
candidates are decision-shaped rather than restating the diff.

This is an engineering smoke test, not a synthetic experiment, and it produces no result that could
enter any document as evidence. **If the founder prefers, it is skipped and the risk is carried into
the expert session instead.** Flagged as the one thing worth doing before recruitment.

### A1.9 What is now frozen

1. Expert 1 is an external senior/staff/principal engineer meeting A1.1. One person.
2. Review silence never becomes a negative label (A1.2).
3. UNCERTAIN is excluded, never converted (A1.3).
4. Tier 3 constructed snippets are secondary only (A1.4).
5. Deterministically decidable situations are filtered before Set B (A1.5).
6. Expert judges S and E; A is machine-scored with a spot check (A1.7).
7. **No further synthetic run is authorised while a suitable external engineer is reachable.**

---

## AMENDMENT 2 — from Phase −1, 2026-08-24. Before sealing, before the expert is engaged.

Phase −1 ran (`ATELIER_PHASE_MINUS_1_PIPELINE_ON_CODE_v1.md`, sha1 `90504b45`). The pipeline works on
code and anchoring reaches real diff lines. Three things change.

### A2.1 Set C is DROPPED from this pilot

Set C existed to qualify cheap instruments so they could scale scoring. At P≈15 there are ~60
judgments and nothing to scale, so it would spend ~40 minutes of the scarcest resource to buy capacity
we do not need.

**Every semantic judgment is the expert's.** Machine scoring is confined to arm A and to
SURFACE_COPYABLE checks, which are mechanical constructs and need no qualification. This is strictly
more conservative than the sealed design and removes a contamination surface. Set C returns for the
confirmatory study. This also resolves an inconsistency: §6 budgeted Set C labeling and A1.7's two
sessions had no slot for it.

### A2.2 Candidates are classified DECISION / VOICE / MIXED, and only DECISION generates boundary pairs

Discovery on review history returns two distinguishable classes. On the Phase −1 fixture, 4 of 9 were
decision rules with conditions, 3 of 9 were review-writing voice, 2 were mixed.

**Voice rules are surface-copyable.** *"Phrases requests as questions rather than directives"* is
reproduced from five examples trivially and correctly by arm E. If such a rule generates primary
boundary pairs, arm E wins cells that have nothing to do with judgment and the study repeats the exact
failure that invalidated the previous arm E run.

**Frozen.** After ratification and before Set B classification, the expert classifies each ratified
requirement:

| class | constrains | primary boundary pairs? |
|---|---|---|
| **DECISION** | what the engineer decides | **yes** |
| **VOICE** | how the review is written | no — reported separately under SURFACE_COPYABLE |
| **MIXED** | both | excluded by default; expert may promote one to DECISION with a stated reason |

The classification is recorded and sealed before any situation is classified or any output generated.

### A2.3 The call budget is sized from the corpus before firing, never left at the default

Validation cost is approximately `rules × held-out documents`. The default `--max-calls 60` aborted a
6-held-out corpus after paying for 60 calls and writing nothing. A 40-document expert slice implies
400+ calls.

**Before the discovery run: compute the expected call count from the sealed corpus and set
`--max-calls` above it, with the figure recorded here.** Treat an abort as a design error, not a
retry, because the calls are paid before the failure arrives.

### A2.4 Recruitment fact, measured

Roughly **0.25 substantive review comments per PR** from the single most active reviewer of a
high-velocity repo. Reaching ~30 boundary situations from one person implies scanning **120–150 PRs**.
The expert needs a long history *in one place*; having reviewed widely is not the same thing.
