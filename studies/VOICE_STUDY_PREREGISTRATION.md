# Pre-registration (DRAFT): does Atelier write in someone's voice?

**Status: DRAFT.** Sealed only by the owner's commit, after the readers are named (the one choice marked
**CONFIRM**) and the briefs and fact packs are written and hashed here. Nothing is generated
before that commit.

## Why this study, and why it is the last on voice

Two rewrite tests showed the guard working (no claim changed, no tell added) and the voice not moving:
every version kept most of its source's sentences and rhythm. A rewrite is anchored to its source, so it
cannot answer the question. This study asks it on **new pieces**, and its result closes the question
either way: Atelier is a voice engine with a guard, or a guard. No further voice round follows, whatever
it shows.

## Question

Given the same writer model and the same facts, does Atelier write a new piece that readers who know an
author's writing recognise as that author's more often than a plain prompt, or than the author's own
pieces pasted into the prompt, **without changing or inventing a claim**?

## The author

**A public company blog**: full essays, free to read, a company writing as "we". The corpus
is its product, engineering-practice and quality essays (22, fetched from its public RSS feed
and hashed here), excluding customer case studies, funding announcements, post-mortems and stubs.

- Three essays **outside** the corpus are set aside as the readers' reference (below).
- The corpus hash, the skill's StandardVersion and the discovery spend are recorded here before any brief
  is generated.

## Arms

All on `claude-opus-5`, one piece per brief per arm, the same facts bound to each:

| Arm | What it is |
|---|---|
| **PLAIN** | "Write a post for the company's blog…" with the brief and the fact pack |
| **CONTEXT** | the same, with the corpus essays pasted into the prompt |
| **ATELIER** | `atelier invoke` on a skill built from the same corpus, as shipped, facts bound with `--with facts=<file>` |

The skill is built with `atelier new … --accept`: its rulings are the evidence-based suggestions, and no
rule is chosen by hand.

**Rhythm (decided 2026-09-30, in the product, not for this study).** The sentence-mix rule is read off
the author's own pieces, with a tolerance of their 80th-percentile piece (about 12 to 14% of sentences on
the company blog and on the technical author), and instructs when their unread work bears it out. A flat 12% was considered
and rejected: only 11 of the company's 16 essays sit within it, so the rule would reject the company's own writing
and discovery would drop it. The skill in this study is built with that rule as shipped.

## Briefs

- **8 briefs**, each a new post in the corpus's territory (product practice, engineering practice,
  quality), none a rewrite. Written before any generation and hashed here.
- Each brief carries a **fact pack** of four to six facts, the only specifics any arm may use.
- A length target of 900 words; a draft more than 30% off is redrawn once.

## Blinding

`studies/harness/phase-c-package.mjs`: letters shuffled per reader and per brief from a cryptographic
source, keys sealed with their sha256 recorded before any reader starts, presentation normalised, only the
brief, the three pieces and the forms given to readers. After ranking each brief, the reader guesses which
letter is which; a blind guessed right significantly above chance is reported as broken.

## Readers

**Three**: the owner and two people the owner names. Each first reads the three reference essays, then
ranks each brief's three pieces by how much they sound like the company wrote them, with no model help, and
marks sentences that read machine-written. All forms are handed in before any key is opened.

**CONFIRM (readers):** the two outside readers, named here.

## Primary endpoint and decision rule

A **win** is a read (one reader, one brief) in which ATELIER is ranked first. There are 24 reads.

**Voice is shown if both hold:**
1. ATELIER is first in at least **13 of 24** reads. Against a chance rate of one in three, that has
   p = 0.028 (`binomialUpperTailP(13, 24, 1/3)`, core/stats). Power: 0.79 if ATELIER truly wins 60% of reads.
2. At least **2 of the 3 readers** rank ATELIER first in at least 5 of their 8 briefs, so one reader
   cannot carry the result.

**And the guard holds:** no ATELIER piece changes or invents a claim. Every piece in every arm is checked
against its fact pack by the claim reader and read by a person, before the key is opened. A changed or
invented claim in ATELIER fails the study whatever the ranks.

## Secondary (reported, deciding nothing)

- ATELIER against each baseline separately, per reader.
- Counted against the corpus, per arm: em dashes, runs of short sentences, contrastive verdicts, median
  sentence length, the share of sentences of eight words or fewer, contractions, "we" per 1,000 words.
- Claims changed or invented per arm.
- Sentences marked machine-written per 1,000 words, per arm.
- How often readers guessed ATELIER.

## Outcomes, fixed now

| Result | What follows |
|---|---|
| Voice shown and the guard holds | Atelier 1.0 as a voice engine with a guard; the README cites this study |
| Guard holds, voice not shown | Atelier 1.0 as a guard; voice listed as tested and not shown; no further voice round |
| The guard fails | recorded; fixed as a defect before any release claims the guard |

## Cost

Discovery for the skill about $1.5–5; generation about $5 (24 pieces); reading is the readers' time.
Each paid step runs on the owner's go-ahead.

## Limits

- One author, and a company voice, not a person's.
- One writer model.
- Readers chosen by the owner; the owner built the tool.
- 900-word pieces; longer forms are not tested.

[← studies](README.md)
