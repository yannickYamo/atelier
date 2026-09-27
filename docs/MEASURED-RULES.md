# Measured rules

Most of a standard is judgement: when to concede a point, what counts as enough evidence, how a
piece should end. Some of it is countable. A measured rule is a rule the owner ratified *with* a
deterministic check, and for those rules whether an output follows the rule is a fact, not an opinion.
This page is the reference for what can be measured, how rules are proposed, and what the loop does
with them.

Everything here lives in `core/observers/` and `core/loop/`. No observer calls a model.

## The observers

Each observer returns a verdict (`MET`, `VIOLATED`, `NOT_APPLICABLE`), the measured value, and the
exact spans of text that broke the rule. The spans are what a repair rewrites. A verdict with no spans
(a floor that was not reached, a style distance) still counts. Draft selection prefers texts that meet
it, but there is nothing specific to rewrite.

| observer | what it counts | `--measure` syntax |
|---|---|---|
| `LEXICON` | banned words and phrases, optionally with a substitute | `LEXICON:leverage=>use\|utilize=>use` |
| `SENTENCE_LENGTH` | median and 90th-percentile sentence length | `SENTENCE_LENGTH:medianMax=15,p90Max=28` |
| `PARAGRAPH_LENGTH` | sentences per paragraph | `PARAGRAPH_LENGTH:maxSentences=4` |
| `HEDGE_RATE` | hedging words per 1,000 | `HEDGE_RATE:maxPer1000=3` |
| `PATTERN_RATE` | a named construction per 1,000 words, capped or floored (see below) | `PATTERN_RATE:pattern=EM_DASH,maxPer1000=0,prefer= - ` |
| `FRAGMENT_SHARE` | the share of very short sentences | `FRAGMENT_SHARE:maxWords=5,maxShare=0.2` |
| `TERM_RATE` | any of a word list per 1,000 words, capped or floored | `TERM_RATE:terms=but\|so,minPer1000=4` |
| `RATIO` | the share one word list takes of two competing lists | `RATIO:numerator=but,denominator=however\|thus,minShare=0.8` |
| `DISTRIBUTION` | the mix of sentence lengths across bands | `DISTRIBUTION:edges=8/18/30,shares=0.3/0.4/0.2/0.1,tolerance=0.2` |
| `STYLE_DISTANCE` | Burrows' Delta: closer to the author's function-word profile than to the model's | computed by discovery, never declared by hand |

Named patterns for `PATTERN_RATE`: `EM_DASH`, `SPACED_HYPHEN`, `SEMICOLON`, `NOT_X_ITS_Y`,
`THAT_OPENER`, `HERES_OPENER`, `SIGNPOST`, `INTENSIFIER`, `SHORT_VERDICT`, `BOLD_SPAN`,
`ONE_LINE_PARAGRAPH`, `RHETORICAL_QUESTION`, `REPEATED_OPENER`.

Each observer states when it cannot measure, rather than returning a number that means nothing. A
per-1,000 rate needs 150 words, a ratio needs four uses of either list, and a mix needs ten sentences.

Declare one on your own rule with `atelier add --statement "…" --kind BOUNDARY --measure "<spec>"`,
or add one to an existing rule with `atelier amend --rule <rule> --measure "<spec>" --reason "…"`. The
parser is strict: a target you did not mean is worse than a refusal, because it is enforced on every
output from then on.

## Where proposed rules come from

`atelier new` and `atelier discover` propose measured rules in two ways. They go on the same review
screen as every other rule, and nothing is enforced until you accept it.

1. **From your work alone** (`core/observers/derive.ts`). Discovery measures sentence and paragraph
   length, hedging, and stock phrases on the pieces it reads, then checks each target on pieces it
   never read.
2. **From the gap between you and the model** (`core/observers/contrast.ts`). The model writes a few
   plain drafts on your own topics with no skill. The contrast pass then counts the same things in
   both:
   - the named patterns
   - which of two competing words each side reaches for ("but" or "however", "it's" or "it is")
   - the connectives you lean on
   - the stock vocabulary the model leans on
   - the sentence-length mix
   - the function-word profile

   Each proposal carries both numbers ("you: 13.2 per 1,000; the model on its own: 5.2").

Two guards apply to every proposal.

- **It must not fail you.** At least four in five of your held-out pieces must meet it. A rule your
  own unseen work breaks is a rule against you, and it is dropped.
- **It must separate you from the model.** Floors and mixes are proposed only if most of the model's
  drafts fail them. A rule that passes everything measures nothing.

## What the loop does with them

`invoke` and the Claude Code plugin check every draft. When a REQUIRED rule is broken, only the spans
that broke it are rewritten (`core/loop/repair.ts`). The guarantees are:

- **The splice is deterministic.** The model returns replacement text for numbered spans, and the
  code puts them back. Nothing outside a span can change.
- **A rewrite never makes a measured rule worse.** A pass is kept only if every rule that held still
  holds, and the broken REQUIRED rules are fewer or broken in fewer places.
- **A rewrite may change how something is said, never what it claims** (`core/loop/integrity.ts`).
  Every rewritten span must keep its figures, negations, qualifiers ("may", "most", "roughly"), proper
  names and `[placeholders]`, unless the broken rule named that very word. A rewrite that loses one is
  refused, and the original sentence is kept.
- **Accuracy comes before style.** Rules marked `--phase ACCURACY` and invented claims (UNSOURCED, see
  `core/loop/claims.ts`) get their own first pass.
- **It changes the output, never the standard.** The loop has no authority to relax a target.

## Rule keys

A rule's id (`p3`, `c2`) is its position in one discovery run. A second run numbers again from 1. The
**key** (`R-3f9a1c`) is the rule's identity across versions (`core/state/rule-key.ts`):

- **Measured rules:** the key comes from the observer and what it counts, never the threshold.
  Tightening a cap is the same rule.
- **Other rules:** the key comes from the kind and the folded statement.
- **Amendments:** an amendment carries the key onto the new wording.

`--rule` accepts the id, the key (any case, with or without `R-`), or the rule's number in
`atelier plan`. `atelier history` lists, under each version, which rules were added, removed or
changed, and how.

## Write this, not that

When the loop repairs a span and the pass is accepted, the before/after pair is recorded with the
broken rule's key. At build, up to six recent pairs (two per rule) that still teach the current
standard ship with the skill as `examples/contrast.md`. Each pair is re-checked against the current
standard before it ships. Pairs come from model output only, never from your corpus or a held-out
piece. They do not come from the ratification ledger either: the ledger holds rule wordings, and a
rejected rule must never reach the model. Turn them off with `atelier build --contrast none`.

## Document class

Every threshold was read off one kind of document. `atelier build --class blog-post` records that
kind. `verify`, `invoke` and the MCP tool refuse text declared (`--class`) as another kind, and say
what they assumed when nothing was declared.
