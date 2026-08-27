# Result — does discovery read selection, or does it read surface?

**Date:** 2026-08-24
**Pre-registration:** `ATELIER_DOMAIN_FAMILY_PROBE_PREREGISTRATION_v1.md`, sha1
`8b72201e848caac0cad552da5b522aaa688dde36`, sealed before the corpus was written.
**Corpus hash:** `d9a1bbc1455ed254` (5 items, ~1,216 tokens, work type `study-notes`)
**Standard of record:** `87f0785c95b27cea`, 12 requirements
**Model:** `anthropic/claude-opus-4.1` via OpenRouter, openai-compatible adapter
**Cost:** $1.844, metered, against a $3.00 cap

---

## 1. Headline

**Discovery recovered selection decisions, and it recovered an absence.** Six of twelve requirements
constrain what belongs on the page rather than how it is arranged, and one of them recovered three
things the corpus systematically leaves out.

**It recovered none of the three absences that had no positional boundary.** The corpus contains no
named discoverers, no numeric statistics, and no definitional openings, verified at zero occurrences
across all five documents. Discovery reported nothing about any of them.

The line separating the two is sharper than the one this probe set out to draw, and it follows from
how evidence is anchored.

---

## 2. Predictions, scored

| | prediction | outcome |
|---|---|---|
| **P1** | at least one SELECTION requirement | **HELD.** 6 of 12 |
| **P2** | at least one FORM requirement | **HELD.** 6 of 12 |
| **P3** | SELECTION anchored at a LOWER rate than FORM | **REFUTED, and reversed.** SELECTION 6/6 anchored; FORM 5/6 |
| **P4** | nothing describes the corpus as being ABOUT its topics | **HELD.** No requirement names photosynthesis, inflation, TCP, tectonics or vaccines as subject matter |

P3 was the wrong question. It assumed a selection decision would be harder to quote than a formatting
one. What actually happened is in §4.

---

## 3. The classification

Applied by the frozen rule in §4 of the pre-registration. Performed by the agent that ran the probe
and therefore contestable.

**SELECTION (6).**

| id | statement | anchored |
|---|---|---|
| p1 | Opens every piece by compressing the whole topic into a single governing claim, explicitly dismissing the rest as secondary | Y |
| p2 | Organises explanations under a fixed mechanism-then-failure-then-misconception scaffold rather than a topic-specific outline | Y |
| p3 | Teaches by naming a common wrong belief and correcting it with a single decisive piece of evidence | Y |
| p4 | Uses failure or edge cases as the explanation for why a real-world variant or hard historical episode exists | Y |
| p5 | Closes causal chains with a compact aphoristic sentence that restates the loop rather than adding new detail | Y |
| p12 | Strips pieces to a few short paragraphs with no hedging, no transitions between sections, and no concluding summary — the misconception correction is the last word | Y |

**FORM (6).** p6 causal chains of active verbs; p7 plain over discipline-standard vocabulary
(**the only unanchored requirement in the standard**); p8 the dismissive tag construction; p9 present
tense, one action per clause; p10 agentive personification; p11 jargon admitted only retrospectively.

p2 and p5 are the arguable rows. p2 is dominantly a scaffold, and it counts as SELECTION only because
it makes failure and misconception content mandatory. p5 is dominantly a sentence shape, and it counts
as SELECTION only because "rather than adding new detail" restricts what may appear there. A reviewer
who classified both as FORM would score 4 SELECTION and 8 FORM, and every conclusion below survives
that reading.

---

## 4. The real finding — how an absence gets anchored, and when it cannot be

An anchored span is a contiguous quotation from one document. An absence cannot be quoted. The obvious
inference is that discovery cannot recover an omission rule, and that inference is **wrong**.

p12 recovered three omissions at once: no hedging, no transitions between sections, no concluding
summary. Its anchor is `Tracing labelled oxygen through water settled this.`, the final sentence of
document 01. That span does not show the absence. It shows **what occupies the position where the
omitted thing would have been.**

That is the mechanism, stated generally:

> **An omission is recoverable when it has a positional boundary — when something else demonstrably
> stands where the missing thing would go. An omission distributed across a whole document, with no
> position that betrays it, leaves no span and is not recovered.**

The corpus was built with both kinds, and the result splits exactly along that line.

| omission | has a positional boundary? | recovered |
|---|---|---|
| no concluding summary | yes, the last sentence is something else | **yes**, p12 |
| no transitions between sections | yes, each section opens cold | **yes**, p12 |
| no hedging | partly, hedges would sit inside claims that are unhedged | **yes**, p12 |
| no named discoverers | no | **no** |
| no numeric statistics | no | **no** |
| no definitional opening | yes in principle, the opening is something else | **no** |

Five of six absences behaved as the rule predicts. The sixth, the definitional opening, has a boundary
and was still missed, and p1 arguably covers its positive half without ever stating the negative.

**Honest weakening of this claim.** The pre-registration specified that the corpus would carry a
uniform selection pattern. It did NOT enumerate these six omissions in advance. They were built in
deliberately and are verified present at zero occurrences after the fact, but naming them after seeing
the output is weaker than pre-registering them. A replication should enumerate the omission set in the
sealed document before writing the corpus.

---

## 5. What else the run established

**All twelve rules reappeared in work the proposer never read.** Proposed from 2 documents
(01, 02), checked against 3 held out (03, 04, 05), 36 checks, 12 of 12 seen again. On this corpus the
recovered standard generalised completely.

**Discovery is not stable across runs at this corpus size.** An earlier run over the identical sealed
corpus with the identical model proposed **14** rules where this one proposed **12**, and the two sets
are similar in substance but not identical. One corpus, one model, two runs, two standards. This is a
stability observation, not a defect, and it belongs beside the existing discovery-stability record.

**A guard fired on a fabricated filename.** A third run's proposer cited golden `01-inflation.md`,
which does not exist; the real file is `02-inflation.md`. Atelier refused to validate against it and
fell back to a single pass with an explicit warning that no rule had been checked against unseen work.
The invented citation did not become evidence. That is the fabrication class caught at the point it
would have entered the record.

**The cost gate refused to run unmetered.** With no published rate for the model, the run stopped and
demanded either a price or a call bound before spending anything. Supplied with $15/$75 it estimated
$0.94 to $2.50 and spent $1.844.

**A third-party gateway policy-refused mid-run.** The third run died on an OpenRouter content-policy
block. Atelier surfaced the provider's message verbatim and produced nothing rather than degrading.
This is an availability property of a gateway, recorded because it will recur.

---

## 6. What this does and does not license

**Does.** The machinery reads content and not only surface. On a structured non-prose corpus it
recovered six selection constraints, and it recovered omissions of the boundaried kind. That is a
statement about the MECHANISM and it is new.

**Does not.** It says nothing about pedagogy, about teachers, or about whether Atelier works for
education. The domain family count does not move to two on this evidence, because:

- the corpus was authored by the agent running the probe, which the pre-registration recorded in
  advance as a contamination this design cannot remove;
- the classification was performed by that same agent;
- n = 1 corpus, 1 model, 1 usable run;
- the corpus was specified as three documents and the tool requires four so that some can be held
  back, so five were written to the same spec. Deviation recorded.

**No claim tier moves.** The cooperating-expert item stays open and this probe does not touch it.

---

## 7. What a replication should change

Enumerate the omission set in the sealed document before writing the corpus, so §4 becomes a
pre-registered result rather than an observed one.

Have someone who did not write the corpus perform the SELECTION/FORM classification.

Run discovery three times over one sealed corpus and report the rule-count spread, since two runs
already disagree.

Use a corpus written by a person who is not the author of the probe. That is the same cooperating-expert
problem in a cheaper form, and it is the only version of this probe whose result would be about taste
rather than about the mechanism.

---

## 8. Reproduction

```
atelier create <corpus> --work-type study-notes \
  --discovery-provider openai-compatible --discovery-backend openrouter \
  --discovery-model anthropic/claude-opus-4.1 --api-key-env OPENROUTER_API_KEY \
  --discovery-price-in 15 --discovery-price-out 75 --cap 3.00
```

Corpus hash `d9a1bbc1455ed254` binds the run. The five documents are five explainers on
photosynthesis, inflation, TCP congestion control, plate tectonics and vaccines, each carrying the
same visible scaffold and the same content rules, with neither stated anywhere in the text.
