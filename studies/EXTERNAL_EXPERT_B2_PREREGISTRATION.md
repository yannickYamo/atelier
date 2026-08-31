# Pre-registration — does a ratified, compiled standard beat a model's own guide to the same corpus?

**Status:** SEALED by the public commit introducing this file, **before any corpus was read, before
the reviewer's one-pager was collected, before any task existed.**
**Design owner (builder):** the repository owner. Must not see held-out tasks, any generation, or
any label until labelling closes (§6.6).
**Expert / judge:** one external reviewer — the first non-builder participant in this repository's
history. Their writing is the corpus; their ratified standard is the target; they label.
**Orchestration:** the assistant session generates, pairs, blinds and tallies; it decides nothing
and never drafts a ratification, a task edit, or a label.
**Budget:** $40 authorised. Projected $15–25. `--max-tokens 12000` on every generation.

---

## 1. The claim, and why this comparison and not another

**The moat claim.** A standard recovered from an expert's work, *ratified by that expert*, and
compiled by Atelier produces writing that expert prefers to what a capable model writes after
reading the same corpus and composing its own guide.

The primary is **T_ATELIER vs B2_MODEL_STYLE_GUIDE**, and the choice matters more than anything
else in this document:

- If T beats **B1** (corpus pasted in) but loses to **B2**, the product is "a model read your
  work," which anyone reproduces in one prompt. No moat.
- If T beats **B2**, ratification plus compilation is doing work that a competent summary of the
  same corpus does not do. That is the moat, and nothing else in the arm set tests it.

`PAIR_KINDS` in `core/reference/arms.ts` marks `T_vs_B2` primary **as of the commit that seals this
file** — changed deliberately, before any corpus was read, exactly as that code's own comment
demands.

**Single-subject design.** The unit of analysis is the *task*, not the person. A positive licenses
"for this expert, this corpus, this work type" — nothing about experts in general. Declared here,
before the data exists.

## 2. Arms

| arm | served text | notes |
|---|---|---|
| **T_ATELIER** | the compiled package, exactly as `invoke` serves it | |
| **B2_MODEL_STYLE_GUIDE** | a guide written by a capable model that read the same discovery corpus | token-matched, §2a |
| B1_CORPUS_IN_PROMPT | the discovery corpus pasted in, task appended | secondary, 16-task subset |
| B0_BARE | task only | validity trials only |

Every arm's generation goes through **one serving function** with an identical request shape; only
the served bytes differ. The runner lives in `studies/harness/` and chooses parameters only; every
decision (the test, the interval, the floor, the diversity gate) imports from shipped `core/`.

### 2a. Token-matching, and who writes the guide

1. Compile T. Count the tokens actually served (SKILL.md plus every file a run reads).
2. The guide-writer produces a guide of that length ±15%, **from the corpus only — never from the
   ratified standard**, once, before any task is generated. If the gap exceeds 15%, regenerate the
   guide; **never adjust T.**
3. Both counts are recorded in the result.

**Guide-writer: `claude-opus-5`** — the strongest model available to this study, which is the
pro-baseline conservative choice: a weak guide-writer would hand T a strawman. **Declared
limitation:** discovery and the guide-writer share a vendor (one API key exists); cross-vendor
diversification is unavailable and the result must say so. Generations for all arms run on the same
binding, and the `resolvedModel` of every generation is recorded; a provider-side model revision
mid-study is reported, not smoothed.

## 3. Materials, in collection order — the order is a rule, not a preference

1. **The reviewer's one-pager first.** Thirty minutes, one page, their own rules, before they see
   any candidate rule or any output. Not judged in this study; it is `B4` for the next one, and it
   can only be collected uncontaminated once.
2. **Corpus:** 8–12 pieces of the reviewer's own writing, one work type, `--ai-assisted` or
   `--no-ai-assist` declared, sealed by hash before discovery reads anything.
3. **Ratification:** the reviewer rules on every candidate — the boundary question ("when do you
   deliberately NOT do this?") asked and answered, materiality declared per kept rule. **The step
   no previous study here has had a non-builder perform. It is the point of the whole exercise.**
4. **Tasks: 40 primary**, model-generated candidates **approved or edited by the reviewer in one
   sitting**, sealed after approval, before any generation. The diversity gate (`MAX_OVERLAP`,
   0.35) runs over them and the rejection ledger is published — a prior suite silently carried 13
   near-duplicate pairs. **Roughly half must be tasks where at least one conditional rule should
   NOT fire** — without them this measures coverage only, and restraint is the half that lost both
   prior nulls. Expected output length is capped in the task wording (~400–600 words). *Recorded
   caveat:* the task-candidate generator shares a family with the generator under test.
5. **Generation:** one per arm per task — nested generations never inflate n. **All 59 trials'
   outputs are generated before the first label is collected.**

## 4. Sample size, computed and now pinned by shipped tests

Exact two-sided sign test on discordant pairs, α = 0.05 — `mcnemarExactP` in
`core/stats/sign-test.ts`, whose tests pin every cell below (the table was recomputed independently
before sealing and matched exactly):

| discordant pairs | critical | power @70/30 | @75/25 | @80/20 |
|---|---|---|---|---|
| 20 | 15 | 0.42 | 0.62 | 0.80 |
| 26 | 19 | 0.46 | 0.69 | 0.87 |
| **30** | **21** | 0.59 | **0.80** | 0.94 |
| 40 | 27 | 0.70 | 0.90 | 0.98 |

**Target 30 discordant; plan 40 raw**, which yields 30 at a 25% tie rate. **Declared:** this design
detects a **large** preference (≈75/25 or stronger) and cannot detect a moderate one; a true 60/40
will read as null and that is not evidence of no difference (60/40 at 0.80 power needs ~150
discordant). **Declared tie-rate risk:** the moat-study expert avoided "no material difference"
even when pairs felt interchangeable; this design *legitimizes* it and the identical-pair trials
teach it — if the tie rate exceeds 37.5%, the floor triggers by construction. **Floor:** fewer than
**25** discordant pairs (`MIN_DISCORDANT`, shipped) → reported **UNDERPOWERED**, no p-value quoted,
no tasks added.

## 5. Validity trials — interleaved randomly, never blocked at the end

- **5a. Identical pairs, 5 trials.** Both sides the same output. Gate: **at most 1 of 5** gets a
  directional preference (random passes ≈4%).
- **5b. Known-bad, 6 trials.** T vs B0 on tasks where a REQUIRED rule plainly applies. Gate: **T
  preferred on ≥5 of 6** (random passes ≈11%). If the reviewer cannot prefer the compiled skill
  over a bare model, the primary is uninterpretable and this gate says so before a null gets
  published without an explanation.
- **5c. Repeats, 8 trials.** Eight of the 40 primary pairs re-shown **no sooner than day 7**, sides
  swapped, order changed. Reports **intra-rater agreement** — not a gate; the ceiling on every
  other number in the study, which nothing in this repository currently knows.
- **5d. Position bias.** Sides by `sideFor(hash)`, reproducible; report the A-choice proportion,
  flag outside 30–70%.

**Total 59 trials** across five sessions of ~12, ≥24h apart, repeats from day 7. If the reviewer's
budget cannot carry 59: cut output length and the B1 secondary — **never the 40 primary pairs.**

## 6. Blinding — the moat study's procedure, plus one hard rule for this setup

1. The side-assignment key is written before any labelling; its sha256 goes to the reviewer before
   the first label; the key publishes beside the result and must verify.
2. The reviewer never sees arm names, descriptions, or which comparison a trial belongs to.
3. After all labels: the reviewer declares any output recognised as their own; the result reports
   as blind only if that list is empty.
4. **All 59 trials are labelled before any analysis runs.** No interim look, no optional stopping.
5. The labelling surface is a private page delivered to the reviewer; trials are interleaved by the
   sealed order.
6. **Builder blinding, operational:** the orchestration happens in a session whose transcript the
   builder reads, so **no generation text ever enters that conversation** — outputs move only
   through files and the reviewer's page. The builder does not open the page; any exposure is
   recorded in the study's consumption ledger (`BUILDER_VIEWED`) and the affected trials are
   excluded from the primary. Enforcement is the ledger, not a promise.

## 7. What the reviewer is asked

Per trial, exactly one primary question:

> **Which of these better represents how this task should be done according to your standard?**
> A · B · no material difference

Then, optional and recorded but never analysed as an endpoint: *"In one line, what decided it?"*
Not "which did you write." Not "which is better writing." If every one-liner names length or
fluency, the primary means less than its p-value suggests, and the result will say so.

## 8. Analysis plan, fixed now

- **Primary:** exact two-sided sign test on discordant `T_vs_B2` pairs, α = 0.05, via
  `mcnemarExactP` (`core/stats/sign-test.ts`; tests pin the §4 criticals). Ties excluded from the
  test, reported with their rate. *Why ties count against the claim elsewhere and are excluded
  here:* non-inferiority conservatism runs against the claim, superiority's sign test is defined on
  discordant pairs — both handlings declared before data, each where it applies.
- **Effect size:** discordant proportion with exact Clopper–Pearson 95% interval
  (`clopperPearson`, same module), never the p-value alone.
- **Secondary, fixed-sequence at α=0.05, stop at first non-significant:** (1) T vs B2 — primary;
  (2) T vs B1 on the 16-task subset, reported as exploratory power.
- **Always reported:** tie rate, both validity gates, A-choice proportion, intra-rater agreement,
  discordant n, T and B2 token counts, the diversity rejection ledger, every truncated generation
  with its arm, and every `resolvedModel` observed.
- **One primary.** Everything else, including anything interesting noticed afterwards, is labelled
  exploratory.

## 9. Failure protocol, declared in advance

- Either validity gate fails → **VOID — instrument not established**; no p-value.
- Discordant < 25 → **UNDERPOWERED**; no p-value; no tasks added — that is optional stopping in a
  repair's clothes.
- Primary non-significant → **closes NULL and stands.** No second candidate, no endpoint
  substitution, no post-hoc subgroup. Fourth study here to carry this clause; the previous three
  honoured it.
- Defect discovered mid-run → the run is **voided and re-preregistered**, never repaired in flight.

## 10. What this can and cannot establish — written before the number exists

**Can:** that this expert prefers the compiled ratified standard's output to a token-matched
model-written guide from the same corpus, in this work type, at a large effect size, with a
measured reliability floor on their own judgement.

**Cannot:** anything about other experts, other work types, or moderate effects. It qualifies no
model judge and makes `promote` reachable by no machine.

**If it loses:** the fidelity claim narrows to exactly what the evidence supports, and the
governance claim — an inspectable, versioned, human-owned target an optimizer may not move — is
untouched, because no study here tests it and the architecture enforces it. This sentence is part
of the seal so the framing cannot be chosen after the number arrives.

## 11. Pre-run checklist

- [x] This file sealed by public commit
- [x] `PAIR_KINDS` primary = `T_vs_B2`, same commit
- [x] `mcnemarExactP` / `clopperPearson` / `MIN_DISCORDANT` shipped with tests pinning §4
- [ ] Reviewer's one-pager collected — **before discovery**
- [ ] Corpus sealed, `aiAssisted` declared
- [ ] Reviewer ratified every candidate; boundary questions answered; materiality declared
- [ ] 40 tasks reviewer-approved, ~half should-not-fire, diversity ledger published
- [ ] B2 guide generated from corpus only, token-matched ±15%, both counts recorded
- [ ] All 59 trials generated; blind key written; sha256 handed to the reviewer
- [ ] Builder-exposure ledger empty (or its exclusions listed)
- [ ] Cap $40; `--max-tokens 12000`
