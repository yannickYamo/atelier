# Pre-registration — Arm E. Distilled standard against raw examples in context

**Sealed:** 2026-08-24, before any generation call and before the rubric was run on any output.
**Status:** SEALED. Arms, topics, rubric and predictions below are frozen.
**Budget:** $10 authorised. Projected ~$3.

---

## 1. The question, and why it is the one a reviewer asks first

The corpus reports three arms: generic prompt, bare skill, standard-compiled skill, with the tail
delta's bootstrap CI excluding zero across 13 contexts and two skills. It has never run the cheapest
alternative. `G2S_EXPERT_CAMPAIGN_PACKET_v1.md` records the honest status as *"compilation
demonstrated; behavioural superiority over raw examples not established"*, and
`G2S_INTEGRATED_CAMPAIGN_MANIFEST_v1.md` frames it as *distilled standard vs raw examples, never
"equal information, better packaging"*. Campaign 1A Stage 1 fired for $0.34 and Stage 3 never did.

**If an expert's examples pasted into the prompt do what the compiled standard does, the product is a
convenience and not a mechanism.** That question is answerable for a few dollars and it is unanswered.

---

## 2. Arms. Three, and the difference between them is the carrier

| arm | what the model receives |
|---|---|
| **A** | the task alone. Control |
| **E** | the task plus **all five corpus documents verbatim** (~1,216 tokens) |
| **S** | the task plus the **Atelier-compiled SKILL.md** from standard `87f0785c95b27cea`, and no examples |

E and S carry information about the same corpus through different carriers. A carries none.

Corpus hash `d9a1bbc1455ed254`, sealed 2026-08-24, five explainers on photosynthesis, inflation, TCP
congestion control, plate tectonics and vaccines.

---

## 3. THE CONTROL THAT MAKES THIS FALSIFIABLE IN BOTH DIRECTIONS

The corpus contains omissions that discovery **recovered** into the standard, and omissions that it
**did not**. That asymmetry is already documented in `ATELIER_DOMAIN_FAMILY_PROBE_RESULT_v1.md` and
was established before this design.

**Standard-stated omissions.** In the corpus AND written into the ratified standard (p12). Arm S is
told about them in words; arm E must infer them from absence.

**Corpus-present, standard-absent omissions.** Uniformly true of all five documents, verified at zero
occurrences, and recovered by discovery into no requirement. Arm E can see them; arm S was never told.

This yields opposite predictions per family, which is what makes the design falsifiable rather than
flattering. A result where S wins everything would be evidence the rubric was built to favour S.

---

## 4. The rubric. Deterministic, and frozen here

No model judges anything. Every check is a parse. This is deliberate: the programme's own record is
that model-based instruments do not abstain, and that a semantic validator ran at 100% sensitivity and
7% specificity. Where a rule can be checked mechanically it must not be handed to a judge.

**POSITIVE checks — visible in the examples, stated in the standard. No prediction of difference.**

| id | requirement | check |
|---|---|---|
| V1 | p2 fixed scaffold | all three of mechanism / failure / misconception appear as headings, in that order |
| V2 | p1 + p8 governing claim then dismissive tag | `everything else is` appears within the first 60 words |
| V3 | p6 + p9 short causal clauses | no sentence exceeds 45 words |

**STANDARD-STATED OMISSIONS — predicted S > E.**

| id | requirement | check |
|---|---|---|
| O1 | p12 no concluding summary | no trailing heading matching summary/conclusion/takeaway/recap, and the final paragraph opens with none of *in summary, to summarize, in conclusion, overall, to recap, key takeaway* |
| O2 | p12 no transitions between sections | no section's first sentence opens with *however, furthermore, moreover, additionally, in addition, next, finally, therefore, thus, consequently* |
| O3 | p12 no hedging | at most 1 occurrence from *generally, may, might, typically, often, usually, tend to, tends to, arguably, relatively, somewhat, perhaps, can be, could be* |

**CORPUS-PRESENT, STANDARD-ABSENT OMISSIONS — predicted E > S.**

| id | property | check |
|---|---|---|
| X1 | no named discoverers | no capitalised personal name adjacent to *discovered/named after/proposed/showed/found*, and no match against a frozen list of discipline-famous surnames |
| X2 | no numeric statistics | no percentage and no bare quantity of three or more digits |

Each cell scores 8 binaries. Scores are reported per family and never summed into one number.

---

## 5. Topics. Thirty, frozen, none in the corpus

antibiotic resistance · black holes · blockchain consensus · CRISPR · cellular respiration ·
compound interest · continental drift dating · coral bleaching · cryptographic hashing · dark matter ·
DNS resolution · earthquakes · El Niño · enzyme kinetics · fiat currency · garbage collection ·
the greenhouse effect · immune memory · induction motors · jet streams · machine learning overfitting ·
memory hierarchies · natural selection · nuclear fission · ocean acidification · public key exchange ·
radiocarbon dating · sleep cycles · supply and demand · vaccination herd immunity

---

## 6. Tiers. Both, because the design already said why

`G2S_CAMPAIGN_1A_SEALED_DESIGN_v2.md` §7b: *"A stronger model infers more from raw examples, so arm E
gets stronger as the model gets stronger."* A result on the weaker tier alone may not survive a model
upgrade, so both are run and reported separately. Never pooled.

30 topics × 3 arms × 2 tiers = 180 cells.

---

## 7. Predictions, frozen

**P1.** On POSITIVE checks, E ≈ S, and both exceed A. An example shows what to do, and so does a rule.

**P2.** On STANDARD-STATED OMISSIONS, **S > E**. An example cannot show what is absent from it. A rule
that names the omission can.

**P3.** On CORPUS-PRESENT / STANDARD-ABSENT OMISSIONS, **E > S**. Arm E can see what the corpus never
does; arm S was never told, so it should behave like the control.

**P4.** The S−E gap on standard-stated omissions **narrows on the stronger tier**, because a stronger
model infers more from raw examples.

P2 and P3 together are the finding if they hold: **each carrier reproduces exactly the omissions it
encodes and does not generalise past them.** That is a mechanistic statement about what distillation
buys and what it costs, and it is more useful than "the standard wins".

---

## 8. What would refute the thesis

**If P2 fails and E matches S on standard-stated omissions**, raw examples in context carry absence
information as well as a distilled rule does, and the compilation step's value is not demonstrated on
this axis. That is a real negative and it is recorded as one, not reframed.

**If A matches both**, the corpus taught nothing and the run is uninformative about carriers.

---

## 9. Stopping rule

180 cells, fired once. No re-run on a disappointing result. Any cell that errors is reported as an
error and not resampled. If budget forces a stop, the tier completed is reported and the other is
reported as not run.

---

## 10. What no outcome licenses

n = 1 corpus, authored by the agent running this. The rubric was written by that agent, though it is
deterministic and frozen here, which is the property that matters. This tests CARRIERS on one corpus.
It does not establish that Atelier reproduces expert judgment, it does not close G1, and it says
nothing about a real expert. No claim tier moves without a dated amendment.

---

## AMENDMENT, 2026-08-24, BEFORE ANY GENERATION CALL

Sealed design sha1 `ecdfef025bf6a9c64bee2d667a55c17a45cfcdc6`. Recorded before firing so the deviation
is not a post-hoc choice.

**What was found on inspecting the compiled artifact.** Standard `87f0785c95b27cea` is a DRAFT: every
requirement carries `authority: DERIVED_UNRATIFIED` and `materiality: null`. The compiler therefore
routes all twelve to the EXAMPLE carrier under OBSERVE, and each emitted file states in its own words:

> This is NOT required. It is how the author works. An output that does otherwise is not wrong;
> reach for this when it fits, and do not force it.

Two consequences the sealed design did not anticipate.

**Arm S as specified would test a configuration nobody ships.** Serving a draft's twelve explicitly
non-binding suggestions against raw examples is not the comparison the manifest framed. It is also
not what `atelier build` gives a user who has ratified.

**And the size framing inverts on this corpus.** The compiled package is ~2,415 tokens against a raw
corpus of ~1,216. Distillation EXPANDS here. The manifest's *"a distilled standard vs 39K tokens of raw
examples"* holds for a large corpus and is false for a small one, so **no compression claim may be made
from this run.** This is recorded as a correction against the corpus, not as a result.

**Carrier is determined by authority and materiality, verified directly against `componentFor`:**

| authority | materiality | carrier | gate role |
|---|---|---|---|
| `DERIVED_UNRATIFIED` | null | EXAMPLE | OBSERVE |
| `EXPERT_RATIFIED` | `PREFERRED` | EXAMPLE | OBSERVE |
| `EXPERT_RATIFIED` | `REQUIRED` | **PROSE** | **ENFORCE** |

**The amended arm set. Four, not three.**

| arm | what the model receives |
|---|---|
| **A** | the task alone. Control |
| **E** | the task plus all five corpus documents verbatim, ~1,216 tok |
| **S_draft** | the package exactly as `atelier create` emits it: SKILL.md plus twelve EXAMPLE files, every one marked not required |
| **S_req** | the same twelve statements ratified REQUIRED, which the compiler routes to PROSE under ENFORCE |

**The ratification is mechanical and minimal, and auditable.** All twelve statements are accepted
verbatim. None is reworded, dropped, added to or reordered. Only `authority` and `materiality` change.
That is the weakest intervention that turns a draft into something the compiler treats as binding, and
it is the step the product exists to make a human perform.

**Predictions for the added arm, frozen now.**

**P5.** S_req > S_draft on standard-stated omissions. A rule that says *no concluding summary* under
ENFORCE should suppress the summary; the same sentence shown as an unconfirmed example, prefixed by a
paragraph saying it is not required, should not.

**P6.** S_draft ≈ E on standard-stated omissions. Both are carriers of unbinding demonstration, one
quoting fragments and one quoting whole documents, so if P2 is really about BINDING rather than about
distillation, these two should sit together and below S_req.

P6 is the sharper test and it can embarrass the thesis. If S_draft beats E while both are
non-binding, the win comes from distillation. If S_draft sits with E and only S_req separates, then
**what the compiled standard buys is not compression, it is the human act of making a rule binding** —
which is a better claim than the one the sealed design set out to test, and a harder one to imitate.

240 cells: 30 topics × 4 arms × 2 tiers.
