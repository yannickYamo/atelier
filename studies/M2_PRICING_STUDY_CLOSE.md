# Milestone 2 — participating-expert pricing study · CLOSE

**Status: CLOSED. The primary comparison is a NULL. Per the pre-registered failure protocol this
StandardVersion is not repaired and Set B is not rerun.**

Study: early-stage B2B pricing judgment under incomplete evidence. Expert 1 = the founder.
Model `claude-opus-5`, temperature 1, thinking disabled, `max_tokens` 2000, 3 generations per
context per arm, 444 outputs, $12.09 of the $20 authorised.

Frozen chain (`GENERATION_FREEZE.json`, nothing generated before it):
StandardVersion `cde2ac38261f0819` · architecture `5743d52307426c46` ·
materialized package `b4937a4708bf5b0d` · SkillVersion `d91ddd7000db833a` ·
set-B `ef9f5c2a479d4d6d` · E_oracle `e3464a56b5379ef7` · E_topk `2633b3db413e338f`.

---

## 1. The result

`PASS(x) = D(x) ∧ ⋀_{r∈A(x)} S_r ∧ ⋀_{r∉A(x)} ¬F_r`, unit = context, R = passes/3,
paired on the **17 independent clusters** in the 20 sealed B cases, sign-flip permutation, 20k draws.

| predeclared comparison | Δ | 95% CI | p |
|---|---|---|---|
| **PRIMARY** S vs E_oracle | +0.069 | [−0.069, +0.206] | 0.441 |
| SECONDARY S vs E_topk | −0.000 | [−0.196, +0.196] | 1.000 |
| BASELINE S vs A | **+0.000** | [−0.167, +0.157] | 1.000 |
| DIAGNOSTIC E_oracle vs E_topk | −0.069 | [−0.206, +0.039] | 0.503 |

Arm means: **A 0.431 · E_topk 0.431 · E_oracle 0.363 · S 0.431.**

This lands on the pre-registered row **"all ≈ A → little transferable signal, or the model already
holds the policy."** It is not a near-miss. S − A is exactly zero: S won 5 clusters, A won 3, 9 tied.

**The compiled standard did not beat a bare model on unseen situations. That is the finding.**

## 2. The components are not null, and they oppose each other

The conjunctive endpoint hides three effects that point in different directions.

| component (cluster means) | A | E_topk | E_oracle | S |
|---|---|---|---|---|
| decision correct | 0.716 | **0.882** | **0.882** | 0.735 |
| no applicable rule missed | 0.578 | 0.647 | 0.608 | **0.706** |
| no false application | 0.775 | 0.765 | 0.696 | **0.539** |

- **Evidence improves the call.** Both example arms gain ≈ +0.167 decision accuracy over A. Four
  prior cases — retrieved *or* expert-selected — move the verdict; the compiled rules do not (S +0.020).
- **Compilation improves coverage.** S expresses applicable requirements best, ≈ +0.127 over A.
- **Compilation destroys restraint.** S falsely invokes inapplicable requirements far more than the
  bare model: **Δ = −0.235, CI [−0.412, −0.078], p = 0.030.**

The third is the only test below 0.05 out of twelve run, and **it does not survive multiple-comparison
correction** (Bonferroni 0.36). It is reported as the largest observed effect and a mechanism
hypothesis for M3 — handing a model nine explicit rules appears to invite it to apply them where they
do not belong — **not as an established finding.**

Net: coverage gain and restraint loss cancel, and the decision term does not favour S. Hence zero.

## 3. The endpoint measured restraint, not coverage

**41 of 180 rule-cells (23%) are applicable; 139 (77%) are inapplicable.** Across all 240 B outputs:
CORRECT_RESTRAINT 1586 · SATISFIED 412 · FALSE_APPLICATION 82 · MISSED 80.

Each context carries ~2 applicable rules and ~7 inapplicable ones, so the conjunction is dominated by
the seven chances to over-apply. This is a property of the sealed grid, not a design intent, and it is
the mechanical reason S's coverage advantage cannot reach the endpoint. Sensitivity analysis — no
variant rescues the claim:

| endpoint variant | A | E_topk | E_oracle | S | S−A p |
|---|---|---|---|---|---|
| predeclared `D ∧ S_r ∧ ¬F_r` | 0.431 | 0.431 | 0.363 | 0.431 | 1.000 |
| drop restraint `D ∧ S_r` | 0.431 | 0.588 | 0.549 | 0.559 | 0.198 |
| drop decision `S_r ∧ ¬F_r` | 0.431 | 0.431 | 0.363 | 0.441 | 1.000 |
| coverage only `S_r` | 0.578 | 0.647 | 0.608 | 0.706 | 0.149 |
| decision only `D` | 0.716 | 0.882 | 0.882 | 0.735 | 0.927 |

Per-rule: p9 was satisfied in only **0.29** of its 24 applicable cells — the worst-transmitted
requirement. p5 was falsely applied in **0.35** of its 48 inapplicable cells.

## 4. What this study could have detected

Paired S−A SD = 0.349 over 17 clusters → **MDE = 0.242** at 80% power, two-sided 0.05.

To detect the effects actually observed would require: S coverage gain (+0.127) → ~62 clusters;
evidence decision gain (+0.167) → ~36; S restraint loss (−0.235) → ~18. **We had 17.**

So the honest statement is two-part: the primary estimate is exactly zero rather than a small
positive we lacked power to see — but every component effect sits below this design's resolution.
**This is a null, not a demonstration that no effect exists.**

## 5. Separating the three misses (required by the protocol)

- **Acquisition miss** — partial. The standard's requirements are real and mostly transmissible
  (p2/p3/p13/p14 satisfied at 1.00 where applicable), but p9 at 0.29 was not acquired in usable form.
- **Compilation miss** — **the load-bearing one.** Compilation preserved *what* to say and lost
  *when not to say it*. Every requirement compiled to PROSE/ENFORCE with its condition stated, and the
  condition did not survive as a gate: rules fired where the sealed grid said they must not.
- **Evaluator miss** — the decision pass failed and was replaced (§6); the rules pass is sound.

## 6. Instrument failures found and resolved during analysis

**The decision pass was discarded.** Cross-checking the scorer's Set B run-1 decisions against the
output text gave 82.5% agreement, and every disagreement was an **exact pairwise swap inside one
context** (B05 O1↔O2, B07 O1↔O3, B09 O2↔O3, B10 O1↔O4, B19 O1↔O4) — the signature of verdicts landing
one row off in a 20×4 block grid, the same failure family as the rules pattern-fill. The packet did
offer DEFER, so this is transcription, not a menu gap. **The decision axis never needed a human**: the
task prompt requires the output to state one of five decisions, and the expected decision is sealed in
the case file. Decisions are now extracted structurally from the leading token of each output —
**444/444, zero fallbacks**, cross-validated against an independent word-list extractor with all 67
differences hand-inspected (all 67 were DEFER, which the word list omitted).

**A word list was again a proxy.** The first extractor missed DEFER entirely and matched `CHANGE`
inside the verb "doesn't change". The structural read — first line, leading token, strict, flag rather
than guess — resolved everything the word list could not.

**The rules rescore is sound and content-addressed.** 240 opaque item ids, exact set match against the
four scored packets, 60 per part; a positional swap is impossible by construction.

**The pattern-fill diagnosis was overstated.** Of the 5 contexts still showing identical rule vectors
across all four arms, **4 (B02, B08, B12, B16) are contexts where all 12 outputs made the same call** —
convergence, not fill. B02/B08/B16 are unanimous DEFER.

## 7. Not analysed

- **Set C is not reported.** Its rules pass exists only in the block format that failed for B, and it
  was never rescored. C is instrumentation, never evidence of natural generalization; `assertNotPooled`
  holds. Two C contexts (`C-p9-N2`, `C-p9-N3`) were never generated at the budget stop.
- The FORBIDDEN-decision term needs reading the reasoning and came only from the discarded pass, so
  boundary/action discipline is not reported.

## 8. What follows

Per the protocol, the next StandardVersion is validated on a **new sealed B2**, never on this B. Three
things this close hands to it:

1. **Carry the condition, not just the requirement.** The compilation miss is a gate that did not
   survive materialization. This is testable directly on the artifact, before any generation.
2. **Balance the grid.** A 23/77 applicable/inapplicable split makes the endpoint a restraint test.
   Either balance it or report coverage and restraint as separate primaries.
3. **Size for the effect.** 17 clusters resolves Δ ≥ 0.24. The effects here are 0.13–0.24.

**Provenance unchanged:** corpus A is AI-assisted (`PROVENANCE.md` `08dd50be207e4508`), which voids
all expressive findings and leaves the decision/rule findings standing. Nothing here is
EXPERT_RATIFIED beyond the sealed grid, the ratified requirements and the E_oracle selections.
