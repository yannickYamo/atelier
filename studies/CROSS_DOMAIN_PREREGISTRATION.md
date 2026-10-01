# Pre-registration (draft): taste reproduced across five domains, read blind

**Status:** DRAFT, not sealed. It is sealed by the owner signing [decision 0006](../docs/decisions/0006-release-contract.md)
and a public commit of this file before any generation call. Until then any line may change; after, none.
**Answers to:** the measurable claim in decision 0006. Nothing in the README states that claim until this
study passes.
**Builds on:** [MOAT_RESULT](MOAT_RESULT.md) (one owner as the only reader, 9 of 16, closed negative),
[decision 0004](../docs/decisions/0004-search-under-a-fixed-standard.md) (how a judge may be used), and the
claim reader's qualification ([v3](CLAIM_READER_V3_QUALIFICATION_RESULT.md)).

---

## 1. The question

Given at least 30 pieces of one person's or team's best work in a domain, does a skill Atelier builds
(under 10 minutes, under $2) write new pieces that readers prefer, blind, over the strongest thing they
could have done instead, without inventing more, and with less variation between runs?

## 2. Domains and corpora

Five domains: blog posts, LinkedIn posts, contract clauses, financial report sections, customer-support
replies. One corpus per domain, from one source whose consent covers this use, at least 30 pieces each.
A domain without 30 pieces is run as exploratory and reported as such; it cannot count toward the four of
five.

Each corpus is split once, by a seeded shuffle recorded here at sealing, into **training** (examples the
arms may see), **validation** (used only for the judge's qualification, section 5) and **sealed test**
(15 briefs, each one an outline of a real held-out piece, so every brief has a true answer). No arm, judge
or person building the arms sees a sealed brief before generation.

## 3. Arms (all on the same model, the same briefs, the same budget per piece)

| arm | what writes |
|---|---|
| A. examples in the prompt | the model with the training pieces pasted in, a fresh call per brief |
| B. induced skill | a skill a frontier model writes from the training pieces, used as a system prompt |
| C. edited induced skill | B after twenty minutes of editing by a domain expert who is not the owner |
| D. Atelier | `atelier new` on the training pieces, rules approved by the source, then `atelier invoke` |

The **strongest baseline** for a domain is whichever of A, B and C scores best on validation briefs by the
qualified judge (section 5): the judge may choose the opponent, never the winner.

## 4. Primary endpoint and decision rule

Per domain: 15 sealed briefs × 3 readers × 2 presentations (each order once) = **90 pairwise reads** of
D against the strongest baseline. Readers are not the owner, are not shown the standard, and see each pair
with names, figures, dates and links masked identically on both sides.

A domain **passes** when the share of reads preferring D is at least 0.60 and the 95% lower bound,
from a bootstrap that resamples briefs with their reads (reads of one brief are not independent), is above
0.50. If reads were independent, at a true preference of 0.65 this design would pass about 81% of the time,
and at 0.60 about 46%; clustering by brief lowers both. Those
odds are accepted in advance: a weaker effect is reported as not shown.

The claim holds when **at least four of the five domains pass and no domain's point estimate is below
0.50**. Anything else is reported as the result, at the same size.

## 5. The judge, qualified before it is used

A judge (a model from a different family than the writer) compares a draft with the real held-out piece
on the same brief, masked as in section 4. On the validation briefs, three readers rank the same pairs;
the judge is **qualified** for that domain if its agreement with the readers' majority is at least 0.75
with a 95% lower bound above 0.60, and its preference for the side with an invented claim is no higher
than the readers'. A qualified judge may: choose the strongest baseline, screen a change before it reaches
readers, and block a release. It may never decide the endpoint.

## 6. Secondary endpoints (each must hold for the claim; none can rescue it)

- **Invented claims:** planted-claim battery and the claim reader on every sealed output; D may not have
  more invented specifics per piece than the strongest baseline (exact one-sided test, α = 0.05).
- **Spread:** each arm writes every sealed brief five times; the between-run standard deviation of the
  counted metrics (required rules held, length, machine tells) must be at least 30% lower for D, by a
  bootstrap over briefs.
- **Cost and time:** building D under 10 minutes and $2, metered.

## 7. What closes it

Pass, fail or not shown, the result is published with the blind key's hash handed over before the first
read, every read, and every spend line. No second candidate, no swapped briefs, no new endpoint after
sealing.

## 8. What this needs that does not exist yet

Five consented corpora of 30+ pieces; fifteen paid readers (three per domain) and one expert editor per
domain; a model budget of about $150 to $250. None of it is in this repository, and none of it is claimed.
