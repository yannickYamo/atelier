# Result: steering bands held to the author's range on the request's subject

Pre-registration: [CONTEXT_BANDS_PREREGISTRATION.md](CONTEXT_BANDS_PREREGISTRATION.md), sealed in `9795542` before
any text was scored, with one amendment before any result was read (a calibration remade with its pieces' ids).
Harness `f4ce89d524550189`. Offline: no model call, nothing spent.

## Verdict: FAIL

Moving the SIGNAL bands toward the author's pieces nearest the request did not tell the author's unseen pieces from
the model's outputs better than the bands for all their pieces. The pooled difference was +0.0006, against a bar of
+0.05.

| | author pieces | model outputs | AUC base | AUC local | difference [95% CI] |
|---|---|---|---|---|---|
| author-posts | 8 | 16 | 0.656 | 0.676 | +0.020 [−0.055, 0.102] |
| newsletters | 12 | 24 | 0.892 | 0.892 | 0 [0, 0] |
| pooled | 20 | 40 | 0.803 | 0.803 | +0.001 [−0.025, 0.027] |

The guard held: the author pieces' median in-band share was 0.895 under both scorings. On author-posts it rose
(0.895 to 0.947) while the model's stayed at 0.842: the local band let the author's own pieces in a little more,
and let nothing more of the model's in. That is the direction conditioning should go, at a size this sample cannot
tell from chance.

## Why it did not move

- **A title is a thin request.** The requests were a title and a length. On the newsletters, a title shared enough
  terms with the author's pieces to give a local target on 12 of 36 texts (median n_eff 1.9, λ 0.24); on the
  others, nothing moved. On author-posts every text got one (median n_eff 8.0, λ 0.57), and the neighbourhood was
  most of the corpus.
- **Moving a band changes a reading only at its edge.** In-band share counts features inside or outside. A band
  moved by a quarter of the way changes the count only for a text near that edge, and few were.

## Secondary

| arm | author-posts in band, base to local | newsletters |
|---|---|---|
| atelier | 0.842 to 0.842 | 0.778 to 0.778 |
| plan | 0.882 to 0.833 | 0.889 to 0.833 |
| steered | 0.889 to 0.889 | 0.833 to 0.833 |

## What follows

`context=local` stays an opt-in setting, recorded as not shown to help. The lexical nearness every part of
Atelier uses (retrieval, the weighted typicality, the skeleton) is the same nearness this test found too thin on
title-only requests. A request that carries its material (`--with`) gives retrieval more to match. Whether that
changes the answer needs requests of that kind, and is not claimed here.
