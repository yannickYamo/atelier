# Pre-registration: can Atelier's outputs be told apart from the author's unseen pieces?

**Status: SEALED by the commit that adds this file, before any output of this study exists.**

## Why

A study of AI fiction told human from model stories at 93% F1 on structure alone, and found model text clustered
where human text spreads (arXiv 2604.03136). On one author, an older Atelier's drafts each looked typical while the
set was told apart from the author at AUC 0.975 (decision 0010). Plan-first generation (a skeleton of moves sampled
from the author's own pieces) and the sampled, detector-steered selection are meant to move a run of outputs
toward the author's own spread. This study asks whether they do, measured by an instrument none of them steers on.

## The instrument, frozen

- **Primary: the classifier two-sample test** (`core/fidelity/twosample.ts` `c2st`, ridge logistic regression,
  5-fold out-of-fold scores, AUC with a 1,000-resample bootstrap interval). Each arm's outputs are tested against the
  held-out author pieces.
- **The features** (`core/fidelity/evaluation.ts`): character 4-grams and word bigrams. The vocabulary (300 and 200)
  comes from the skill's read pieces only, and is standardised by them. Nothing in Atelier reads this family.
- **Integrity:** invented claims delivered, by the claim reader at its production settings, on the gating line
  only, with the request as material, the same way for every arm: the Atelier arms in their own run, the plain and
  pasted arms by `atelier verify --task` on the text as written. A text the reader could not read counts as unknown,
  never as clean.
- **Secondary readings of the same family** with every n-gram made only of function words removed, since the steered
  arm steers on function-word rates.
- **Secondary, reported:**
  - conformal typicality (an Atelier-arm monitor, steered on by no arm here);
  - the Vendi score of each side at equal size;
  - REQUIRED rules held.
- **Harness:** `studies/harness/indistinguishability.mjs`, sha256 prefix **`e7227d98e9740608`**.

## Materials

- **Corpus 1: a technical author's posts.** The skill built from 12 of the author's 20 posts (rules accepted as
  suggested, two demoted by the owner before this study). Held out: the 8 posts the skill never read (5 used only in
  rule validation, 3 reserved). One brief per held-out post: its title.
- **Corpus 2: the sensor study's newsletters.** A skill built for this study from the 24 INNER and INNER HELD
  pieces (`atelier new`, rules accepted as suggested, no edits). Held out: the first 12 OUTER pieces by the sensor
  study's seed. One brief per piece: its title.
- **Request, every arm:** `Write a blog post titled "<title>". About 900 words.` The plain and pasted arms get it with
  discovery's plain-draft framing; the pasted arm adds four of the skill's read pieces.
- **Writer:** `claude-opus-5`, the model the skills were built against.

## Arms

| arm | what |
|---|---|
| plain | the model alone |
| pasted | the model with four of the author's pieces |
| atelier | `atelier invoke`, the skill's default release |
| plan | `atelier invoke --structure plan` |
| steered | `--structure plan --select sample --until-author 0.5 --shape-rounds 1` |

## Decision rule

| verdict | condition |
|---|---|
| **PASS (machine)** | on both corpora, the better of plan and steered (the winner) has a C2ST AUC at least 0.10 below the best of plain, pasted and atelier; and the winner delivered no invented claim, with every one of its outputs read |
| **FAIL (machine)** | anything less, including a corpus where any arm has too few outputs to test |

- AUCs below 0.5 are clamped to 0.5 before the difference: landing below chance by chance is not a better result.
- A run that fails is recorded at its cap and not retried. A plan or steered run that wrote no skeleton (a request
  read as short or as a format) counts as failed, never as a plan.
- The intervals are approximate: in simulation at these sizes they cover 0.5 about 82–85% of the time under no
  difference. The decision rule's false-pass rate there was about 4.5%.

The human read is a separate primary and is not run here. Five packets are prepared, one per reader, by a Latin
square: each reader sees each author piece once, beside one arm's output on its title, so every arm is read about
equally and no author piece repeats. Both sides are cleaned the same way and cut to the same length at a paragraph
boundary; pair order and sides are seeded; the key is sealed apart. Rule: an arm is indistinguishable to people if
readers pick the author's piece at a rate whose 95% interval includes 50%.

## Cost

Hard cap: **$60** across generation, integrity checks, building the second skill and reading structure. Estimated:
about $45–55.

## Limits

- 8 and 12 held-out pieces per corpus: the AUC intervals will be wide. A difference of 0.10 is a direction, not a rate.
- Each arm writes about 900 words. The held-out pieces are their own length, so length shows in every arm alike;
  the evaluation family is made of rates.
- Everything is Claude: the author's skills, the writers and the claim reader.
- The plan arms differ from the atelier arm in two ways: the skeleton, and a skeleton length set by the request's word
  count. The atelier arm also serves the skill's learned length line beside "About 900 words".
- The second skill's rules are accepted as suggested, without an owner reading them.

## Record

The result goes in `studies/INDISTINGUISHABILITY_RESULT.md` and the CHANGELOG, whatever it is.

## Amendment, 2026-10-04, before any analysis

The first run stopped after two briefs of the first corpus. It had produced 10 outputs and exposed two faults; no
result had been computed.

1. **A product bug: amending a rule dropped the skill's fidelity layer.** The first corpus's skill had two rules
   reweighed by its owner before the study. That minted a new standard, and `releaseFor` returned no release for it,
   so the skill ran with no profile, no detector, no retrieval and no calibration, without saying so. The two
   `atelier` outputs were written that way and are discarded. The plan and steered runs were refused before spending
   anything. Fixed in the product: a changed standard now starts a new release line that carries the author's
   profile (re-ratified against the new rules), passages, calibration and structure, and nothing the loop learned.
2. **The harness booked a refused run at its full cap.** A refusal before any model call now costs nothing and stops
   the study, since every later run of that arm would be refused the same way.

The harness is now sha256 prefix **`6c4d591b01529784`**. The plain and pasted outputs already written are kept: nothing
about them changed. The decision rule, the instrument and the materials are unchanged.
