# Pre-registration (DRAFT) — recall against a hand-built house standard, and the loop against a model's own guide

**Status: DRAFT, NOT SEALED.** It becomes sealed by the commit that changes this line to SEALED, made
by the owner **before** discovery reads the corpus and before any task exists. Until then every number
below is a proposal and may change; after it, none may.

**Why this study.** The comparison that matters most has not produced a number: a ratified standard
against a strong model's own summary of the same corpus. The owner keeps, by hand, a house writing
standard — numbered rules amended over months, a named exemplar, worked before-and-after examples, a
quantitative table — which is a hand-built instance of exactly what Atelier is meant to emit. That
document is the only sealed, expert-authored ground truth available, and it has never been read by the
system. It is the answer key.

## 1. Materials, and what is sealed from what

| material | who may read it, and when |
|---|---|
| the corpus (the owner's published pieces) | discovery, after `intake` seals it |
| the reserve (≥ 19 held-out pieces or tasks, see §4) | nobody until generation; the judge at labelling |
| **the house standard** (numbered rules) | **nobody in the pipeline, ever.** The owner, at scoring only |
| the house standard's exemplar document | excluded from the corpus; never an `--exemplar` |

The house standard's path is given to `scripts/recall-sheet.mts` only after the run has reached
PROPOSED, and that script refuses otherwise.

## 2. Primary A — recall (does discovery find what the owner wrote down?)

Procedure: `atelier new <corpus> "<purpose>"` up to the review screen; nothing ratified. Then
`scripts/recall-sheet.mts` writes a sheet listing every discovered and measured proposal beside the
house standard's numbered rules. The owner marks each numbered rule **RECOVERED** (a proposal states
it), **PARTIAL** (a proposal states part of it, or its condition is wrong), or **MISSED**, without being
told which vantage produced which proposal.

Endpoint: recall = (RECOVERED + ½·PARTIAL) / N over the numbered rules that are about the writing
(rules about process or tooling are excluded, and the exclusion list is fixed before discovery).

Bar (proposed): **≥ 0.50**. Reference points, recorded before this study: two single framings
recovered 3/9 and 4/9 of one author's sealed rules; their union ~7/9.

## 3. Primary B — the moat (ratified + compiled + checked vs a model's own guide)

Arms, all on the same target model and binding:

| arm | what is served |
|---|---|
| **T_LOOP** | the compiled skill, with `invoke`'s check-and-repair loop on (the product as shipped) |
| **B2_MODEL_STYLE_GUIDE** | a guide the model writes after reading the same corpus (the sealed B2 arm) |
| T_RAW (secondary) | the compiled skill with `--no-repair` |
| BARE (secondary) | no skill |

Endpoint: blind pairwise preference by the owner on held-out tasks, T_LOOP vs B2, per
`atelier reference` (order randomised per pair, arm identity hidden, "recognised the original" recorded).
Exact McNemar on discordant pairs. **Bar (proposed): T_LOOP preferred in ≥ 60% of discordant pairs,
one-sided p < 0.05, n ≥ 19 tasks** (the holdout bound of `core/reference`).

## 4. Secondary — deterministic, and reproducible by anyone

`scripts/measured-conformance.mts` counts every measured rule of the ratified standard on every arm's
output (no judge, no model): the share of outputs meeting each REQUIRED measured rule, per arm, and the
same share on the **last third** of each output against the first third — the drift-over-length the
loop exists to prevent. Reported for all four arms. This is the number another system can be run
against on the same tasks without access to the owner.

## 5. Stopping, failure, and what is not claimed

- A primary below its bar is reported as a null, at the same volume as a pass, and not repaired or rerun.
- A positive licenses "for this owner, this corpus, this work type" and nothing about writers in general.
- Neither primary compares against GEPA, SkillOpt or SSO directly; §4's deterministic table is the
  shared-task number that makes such a comparison possible later.

## 6. Owed before sealing (the owner's)

1. The corpus path and the house standard's path (the latter used only by the recall script).
2. The exclusion list for §2 (numbered rules not about the writing).
3. The held-out task set (≥ 19) or the reserve of pieces it is built from.
4. A budget ceiling and an API key for the run.
