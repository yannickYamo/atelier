# 0010. Closeness is a two-sample test

**Status.** Accepted 2026-10-03. Instruments only: nothing here gates an output, and nothing in it is a claim
until a sealed study says so.

**Context.** A study of AI fiction (arXiv 2604.03136) told human from model stories at 93% F1 on narrative
structure alone, and found model stories clustered in one region while human ones spread out. Atelier
measured closeness one feature at a time, with bands that compound (an author's own piece is rarely inside
all of them), and chose the draft most inside them, which pushes outputs toward the typical: the region a
detector finds.

**Decision.**

1. **Whether outputs can be told from the author is a two-sample question.** The evaluation reading is a
   classifier two-sample test (held-out AUC; 0.5 means indistinguishable), a kernel test (MMD with a
   permutation p-value) and the Vendi score of each side at equal size (`core/fidelity/twosample.ts`,
   `atelier fidelity --typicality`).
2. **One text's closeness is one calibrated number.** A shrinkage Mahalanobis distance over the features that
   separate this author from the model, turned into a conformal p-value against the author's own pieces left
   out one at a time: "as typical as p of your own pieces" (`core/fidelity/typicality.ts`). It is on every
   run's panel.
3. **The loop may steer on typicality; the evaluation may not use it.** `invoke --until-typical <p>` writes
   more rounds until an output is that typical, keeping the one that breaks the fewest REQUIRED rules and then
   the most typical. Rules always outrank shape. The two-sample test that evaluates is a separate instrument
   on separate data.
4. **Opt-in** ([0008](0008-one-point-zero-is-the-floor.md)). A skill without a calibration behaves as before.

**Not decided here.** Structure (how a piece introduces, explains, evidences and closes) needs a reader that
passes qualification first; that is the next study.
