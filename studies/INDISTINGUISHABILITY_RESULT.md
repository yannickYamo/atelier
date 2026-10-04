# Result: can Atelier's outputs be told apart from the author's unseen pieces?

Pre-registration: [INDISTINGUISHABILITY_PREREGISTRATION.md](INDISTINGUISHABILITY_PREREGISTRATION.md), sealed before any
output and amended once before any analysis (a product bug and a harness fault, both recorded there). Spent: $31.54
on generation and integrity checks, plus about $2.10 to build the second skill and read structure.

## Verdict: FAIL (machine). Human read: pending

On both corpora, every arm's outputs were told apart from the author's held-out pieces by a classifier on a feature
family no arm steers on (character 4-grams and word bigrams). Neither plan-first arm came within the sealed 0.10 of
beating the best baseline: −0.156 on the first corpus and −0.021 on the second. A negative margin means the plan arm
was easier to tell apart than the best baseline.

## Told apart, by arm

AUC of the held-out classifier telling outputs from the author's unseen pieces. 0.5 means it cannot; intervals are
approximate at these sizes.

| arm | technical author (8 pieces) | newsletters (12 pieces) |
|---|---|---|
| plain | 0.750 [0.45–1] | 0.951 [0.85–1] |
| pasted examples | 0.922 [0.75–1] | 0.958 [0.85–1] |
| Atelier | 0.938 [0.77–1] | 0.951 [0.85–1] |
| plan-first | 0.906 [0.72–1] | 1.000 [1–1] |
| plan-first, steered | 0.906 [0.69–1] | 0.972 [0.90–1] |

Without n-grams made only of function words, the order barely changes: 0.67–0.80 on the first corpus and 0.87–0.94
on the second, every arm still told apart.

## Integrity, by arm

Specifics flagged by the claim reader on the gating line, with only the request as material, counted the same way for
every arm:

| arm | technical author | newsletters | REQUIRED rules held, all outputs |
|---|---|---|---|
| plain | 40 flagged in 8 | 67 in 12 | 0 of 20 |
| pasted examples | 37 in 8 | 63 in 12 | 0 of 20 |
| Atelier | 0 delivered | 0 delivered | 12 of 20 |
| plan-first | 0 delivered | 0 delivered | 9 of 20 |
| plan-first, steered | 0 delivered | 0 delivered | 12 of 20 |

The claim reader flags about one clean draft in five (docs/INSTRUMENTS.md), so a flag is a specific nobody supplied,
not a proven falsehood. The plain and pasted arms were checked against the skills' standards, which they were never
given, so "rules held" is a measure of distance from the standard, not of their quality.

## What it means

- **Atelier's outputs are still recognisably not the author's,** to a simple classifier on surface n-grams, after the
  counted rules, the claim check and the fidelity steering. So are plain prompting and pasted examples. Nothing here
  supports a claim of indistinguishable voice. The README's "voice is not claimed" stands.
- **Plan-first generation does not move outputs toward the author on this measure.** On the newsletters it moved them
  further away. A skeleton of moves read off the author's pieces did not survive into how the writer's sentences come
  out, and the structure reader had already found that paragraph moves do not separate author from model here
  (studies/STRUCTURE_READER_RESULT.md). It stays opt-in, labelled a research preview, with this result beside it.
- **Steering on the style detector did not carry over** to a family it does not read. That is what a disjoint
  evaluation is for: a control can be satisfied without the thing it stands for moving.
- **Integrity holds across all three Atelier arms:** no invented claim delivered in 60 outputs, against 37–67 flagged
  specifics per 20 plain or pasted outputs. This, with the REQUIRED rules held, is the measured difference. It is the
  one the README claims.
- **No re-run** (§8b.6). The next attempt at the implicit layer needs a different actuator, and a new
  pre-registration.

## The human read

Five blind packets are prepared (`human/reader-1.md` … `reader-5.md`, Latin square, key sealed apart). The rule is
sealed: an arm is indistinguishable to people if readers pick the author's piece at a rate whose 95% interval includes
50%. Until people read them, the human primary is open.
