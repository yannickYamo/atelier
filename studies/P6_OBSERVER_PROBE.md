# Can anything tell when this rule fired? — observer probe, p6

**Run before building a suite, on the principle that an endpoint nothing can observe is a study
blocked on instrument design rather than on budget.**

The target is p6 from a discovered, author-ratified standard (`ec8ca037c5f7237f`), materiality
PREFERRED, carrier EXAMPLE, GENERAL scope:

> I restate the thesis as a compressed aphorism at section boundaries, even after the point has
> already been argued in full.

## The key

24 passages sampled from the author's own essays **by position** — last sentence of a section, or
one from the middle — never by whether they resemble the move. Deduplicated. Each shown with the
sentences it follows, because "restates the thesis" is unanswerable without the thesis visible.

Labelled by the author: **12 YES, 8 NO, 4 UNSURE.**

A first attempt was discarded. It showed single sentences with no context and pinned the rule only
at the top of the page; the author answered *"does this sound like me"* — a coherent question, and
not the one asked. 30% abstention and a 17:4 imbalance. **That was a defect in the elicitation, and
reporting its numbers as evidence about p6 would have been reporting an instrument failure as a
result.**

## Structural detectors, frozen before the key existed

| detector | agreement | recall | precision |
|---|---|---|---|
| BREVITY | 0.40 | 0.50 | 0.50 |
| CONTRASTIVE | 0.45 | 0.08 | 1.00 |
| REDEFINITION | 0.40 | 0.00 | 0.00 |
| COMBINED | 0.40 | 0.00 | 0.00 |

**Majority baseline: 0.60.** Every detector is below it. BREVITY is a coin flip; two caught none of
the twelve positives.

Compression alone does not identify the move, and that is informative rather than merely negative:
p6 is a claim about a sentence's **relationship to the argument before it**, which no pattern over
the sentence itself can reach.

`CONTRASTIVE` was included precisely because it is a word list standing in for a grammatical
property — the failure this programme has paid for twice. It demonstrated the failure on itself
before any label existed: the first draft matched `it's` but not bare `it`.

## The model judge

19 cases where both the author and the judge ruled. **Agreement 0.63 against a 0.58 baseline.**

| | |
|---|---|
| false pass (judge YES, author NO) | 3 |
| false fail (judge NO, author YES) | 4 |
| judge abstained | 1 of 24 (4%) |
| author abstained | 4 of 24 (17%) |

**It is not systematically permissive, and that is a real readout-design result.** The last
model-based reader here produced **17 false passes against zero false fails**. This one is balanced.
Three things differ: it sees the preceding text, abstention is offered as an answer rather than an
escape, and it is asked what the sentence *does* rather than whether it is *good*.

But it abstained at 4% where the author abstained at 17% — more confident than the expert on a task
the expert found hard. And five points over baseline on n=19 is not an instrument.

## The finding, which is not about the instrument

The disagreements are not noise. The judge calls *"One month, one feature, real traction"* a
compressed slogan; the author says no. It calls *"You just need the language to see them"* a punchier
restatement; the author says no. On one case the author says YES where both the judge and a second
careful reader said NO.

**The wording's implied boundary did not match 12 of the author's 20 case-level judgments.**

Said precisely, because the loose version misleads. p6 was never a classifier — it is a
natural-language hypothesis about a behaviour. The 24-card exercise operationalised ONE reading of
it and found that reading did not match the author's extension. "Ratification was 50% accurate" is
not what happened and would be a damaging thing for the paper to imply: what was measured is that an
approved *description* underdetermines its own *cases*.

p6's statement is a machine's paraphrase of a pattern. The author ratified it because it read
truly — and **ratifying a STATEMENT is not the same as agreeing on its EXTENSION.** An author can
approve the wording and still disagree with every careful reader about which sentences it picks out.

That is a property of discovered standards, not of this observer, and it explains why nothing scores:
there is no stable target to score against.

## What it changes

p6 cannot be the carrier study's target — not because its endpoint is hard to measure, but because
it is not agreed. **A requirement qualifies only if its extension is agreed as well as its wording**,
which is a ninth exposure condition and one that none of the existing eight checks.

Cost: two labelling sessions and $0.11, against a sealed suite and several hundred generations.

n=19, one requirement, one author. The pattern is clear; the sample is small.
