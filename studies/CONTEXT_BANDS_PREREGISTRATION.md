# Pre-registration: does holding a draft to the author's range on the request's subject tell the model apart better?

**Written and sealed before any reading of the data below. Offline: no model call.**

## The question

A steering band is the author's 10th to 90th percentile over all their pieces of one length. With
`context=local` ([core/fidelity/context.ts](../core/fidelity/context.ts)), each SIGNAL band is moved toward the
author's pieces nearest the request, by λ = n_eff / (n_eff + 6). RULE bands never move.

The in-band share (steering bands a text sits inside, over those it measures) is what selection and repair steer
on. If the author's taste depends on context, a band conditioned on the request should separate the author's
unseen pieces from the model's text on the same request better than the band for all their pieces. If it does
not, conditioning is only narrowing, and it stays an opt-in setting with that result beside it.

## Data (already collected, nothing new is written)

The outputs of the indistinguishability study ([INDISTINGUISHABILITY_RESULT](INDISTINGUISHABILITY_RESULT.md)),
two corpora:

| corpus | skill's read pieces | held-out author pieces | requests |
|---|---|---|---|
| author-posts | 12 | 8 | one per held-out piece: its title and a length |
| newsletters | 24 | 12 | the same |

- **Positives:** the held-out author pieces. No instrument of the skill read them.
- **Negatives:** the outputs of the `plain` and `pasted` arms on the same requests (the model with no Atelier
  steering, so neither was selected on any band).
- **Request:** each text is read with the request its brief was written from (`Write a blog post titled "<title>".
  About <n> words.`). An author piece is read with the request of its own title.
- Each text is read against the skill's active release: its profile, its typicality calibration (the source of
  the per-piece values) and its retrieval index. The harness refuses to run if a held-out piece is among the
  calibration's pieces.

## Measures

For every text, two scores: the in-band share under the base bands (`base`) and under the local bands (`local`).
A text with no local target (near too few pieces) scores the same both ways.

**Primary.** AUC of the in-band share, author pieces over model outputs, pooled over both corpora, under each
scoring. The statistic is the difference AUC(local) − AUC(base), with a 95% interval from a paired bootstrap that
draws texts within each corpus and side (`aucDifferenceWithCi`, core/fidelity/qualify.ts; 2,000 resamples, seed 1).

**Guard.** The median in-band share of the held-out author pieces must not fall by more than 0.05 under `local`:
a target that rejects the author is not a better target.

**Secondary (reported, decide nothing).** The same difference per corpus; the in-band share of the Atelier arms
(`atelier`, `plan`, `steered`) under both scorings; the share of requests given a local target; the median n_eff
and λ.

## The rule

- **PASS:** the pooled difference is at least **+0.05**, its interval excludes 0, neither corpus's difference is
  below −0.05, and the guard holds. Then `context=local` is recorded as a qualified conditioning of the steering
  bands, and the instrument card says so. It stays opt-in until a generation study measures it on outputs.
- **FAIL:** anything else. Recorded as such in the CHANGELOG Studies and the instrument card; the setting stays an
  opt-in research preview.

## Power, said before

20 author pieces against 40 outputs. Unpaired, the standard error of one AUC near 0.8 is about 0.07; pairing the
two scorings on the same texts removes most of it, but a true difference below about 0.05 will likely not be seen.
A FAIL here is "not shown on 60 texts", not "no effect".

## What this does not test

Whether drafts held to local bands read more like the author to people, or are told apart less by an evaluation
instrument. Those need new outputs and model calls, and are left to a generation study.
