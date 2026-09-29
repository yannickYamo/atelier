# What building this taught me about making LLM features trustworthy

**Seven lessons, each with the evidence behind it. Most came from a result I did not want.**

## 1. Measure the instrument before you let it act

An unsourced-figure check fired on 28 of 30 pieces an expert had rated perfect. It measured how many
numbers a text had, not whether they were invented. It was a live gate until it was measured, and then
it was demoted to reporting only. Now no model instrument gates until it has passed a battery with its
floors fixed in advance, and the product says which instrument ran on every line. ([MEASUREMENTS.md](../MEASUREMENTS.md))

## 2. A precise gate can still be blind

The pattern check for invented facts flagged 3 true drafts in 129 across three studies. It also missed
54%, 74% and 76% of planted inventions. A small model that reads and types each claim, with code checking the type
against the source, caught 35 of 35 on fresh pieces. The fix was splitting the job: **a model reads, code
decides**. ([v2 result](../studies/CLAIM_READER_V2_QUALIFICATION_RESULT.md))

## 3. A qualification belongs to one version of the instrument

Version 1 of that reader failed: it trusted its own sentence numbers and cut plain sentences beside the
one holding the claim. Version 2 passed. An audit then taught it to read headings and tables, which made
it a new instrument, so it lost its qualification until measured again. The product says so, and the
older gate cut meanwhile. Measured again on fresh essays, it passed. ([v1](../studies/CLAIM_READER_QUALIFICATION_RESULT.md),
[v3](../studies/CLAIM_READER_V3_QUALIFICATION_RESULT.md))

## 4. Same-family judges reward the wrong things

In the voice rounds, model judges from the writer's own family preferred drafts that copied the author
and invented stories. Stylometry could not separate the arms at all. The voice verdict rests on human
reads; the judges are tracked, never trusted. ([voice rounds](../studies/VOICE_ROUNDS_RESULT.md))

## 5. Silence scores perfectly on conditional rules

A rule that does not apply cannot be violated. So an adherence score over conditional rules rated
silence as perfect: 138 outputs had 3 violations in all, and two repetitions scored every arm at 100%,
including a base model. The fix moved who decides applicability: the expert sealed it per case before
any output existed. ([close](../studies/MAINTAINER_A_STUDY_CLOSE.md),
[the redesign](../studies/M2_PRICING_STUDY_DESIGN.md))

## 6. Compiling rules keeps what to say and loses when not to

A compiled standard scored exactly what a bare model scored on pricing decisions. Underneath, the arms
traded off: coverage went up, restraint went down, though that drop did not survive correction for
multiple tests. On a second standard, stating each rule's otherwise-branch restored the restraint the
compiled skill had lost (+0.250, replicated). It fixed the compiler; it did not beat a bare model. ([null](../studies/M2_PRICING_STUDY_CLOSE.md),
[fix](../studies/NEGATIVE_BRANCH_CLOSE.md))

## 7. When Enter accepts everything, the suggestion is the decision

On the review screen, Enter accepts every suggestion at once. Rejection was suggested when two unread
pieces lacked a rule, and on a six-post corpus that would have dropped moves the author plainly makes.
It now takes four, and below that the rule is shown for the person to judge. ([CHANGELOG](../CHANGELOG.md))

The pattern under all seven: an instrument earns authority by measurement, and loses it by changing.
