# Instruments

**Every instrument Atelier reads text with, what it was validated on, and whether it may steer, gate, or only
report.**

An instrument that steers drafts cannot also judge them, because it would be measuring its own steering
([decision 0010](decisions/0010-closeness-is-a-two-sample-test.md)). An instrument that deletes text has to be
measured first ([decision 0003](decisions/0003-authority-by-measurement.md)). Each card says where an instrument sits
on both counts.

| Instrument | Role | Validated | Known failures |
|---|---|---|---|
| Claim reader v3 | gates: may cut | qualified | flags a fifth of clean drafts |
| Counted features and selection | gate (RULE) and select (SIGNAL) | replicated | one writer, one genre |
| Style detector | monitor; control for `--select sample`, `--until-author` | per skill, cross-validated | does not carry across model families |
| Typicality (conformal) | monitor; control for `--until-typical` | coverage by simulation | blind to a run that clusters |
| Two-sample test, counted features | evaluation over a run | by construction | partly steered on by default selection |
| Evaluation family (character 4-grams, word bigrams) | evaluation only | by construction | small samples give approximate intervals |
| Context bands (`context=local`) | moves SIGNAL bands toward the request's nearest pieces (opt-in) | FAIL as a sharper detector | title-only requests find too few near pieces |
| Structure reader | monitor; shapes plan-first drafts (research preview) | reliable, does not separate | FAIL as a separating sensor |
| Taste reader | monitor until your labels validate it | per skill | unvalidated by default |
| Move reader | parked | failed | reliable where it did not separate |

## Claim reader v3

**Reads a draft for invented specifics: stories told as lived, figures, quotations, claims of evidence.** A small
model lists the claims; code decides whether each is in the material.

- **Confusion matrix** on 25 product essays no test had used, one planted invention per draft, at production settings
  (temperature 0, two reads):

  | | flagged | not flagged |
  |---|---|---|
  | planted invention (46) | 46 | 0 |
  | clean draft (48) | 9 | 39 |

  Sensitivity 1.0 (95% CI 0.923–1); specificity 0.81 (0.674–0.911). A pattern check on the same drafts caught 11 of
  46.
- **Role:** the only instrument that may delete text. In published writing an invented claim is cut; in answers,
  general knowledge is listed and only work the agent never did is cut.
- **Known failures:** it flags about one clean draft in five, which is listed for you to check, not cut. One
  population (product essays), and every plant was one sentence long.
- **Records:** [studies/CLAIM_READER_V3_QUALIFICATION_RESULT.md](../studies/CLAIM_READER_V3_QUALIFICATION_RESULT.md),
  `bench/runs/0.7.0/claims`.

## Counted features and selection

**About fifty counted features (punctuation, sentence and paragraph shape, wording, pace), each kept only if it
separates your pieces from the model's drafts and holds on pieces nothing read.**

- **Validated:** on 40 unused newsletters, 9 of 10 kept features replicated on a second sample of pieces and drafts;
  both RULE bands held (88–100% of unseen pieces inside, 100% of unseen drafts outside).
- **Role:** a RULE band gates a draft; a SIGNAL chooses between drafts.
- **Known failures:** one house style, technical explainers. Separation is from the model's plain drafts, not from
  what a person hears.
- **Record:** [studies/SENSOR_QUALIFICATION_RESULT.md](../studies/SENSOR_QUALIFICATION_RESULT.md).

## Style detector

**A logistic regression on function-word and character-trigram rates, trained on your pieces against the model's
drafts.** Shown as P(model-written).

- **Validated:** cross-validated AUC per skill, printed on its card (0.972 on one author). `atelier qualify` holds
  out a piece, a topic and a generating model at a time.
- **Role:** a monitor on every run. With `--select sample` or `--until-author`, it is the control the run steers on.
  It never fails an output.
- **Known failures:** it does not carry across model families. Held-out generator AUCs were 0.37, 0.49 and 0.73 in
  one measurement, so it is valid only for the models it was trained against.

## Typicality

**One number per output: the share of your own pieces at least as far from the rest.** It is a shrinkage
Mahalanobis distance over the features that separate you from the model, turned into a conformal p-value. Each piece
is scored with the others' centre, scale and covariance, as a new text is. Weighted toward your pieces nearest the
request when the skill knows them.

- **Validated:** under exchangeable draws, the share of p-values at or below k/(n+1) stayed at or below k/(n+1) in
  3,000 simulated trials per setting (n 6 to 30, d 4 to 20, heavy tails, 5% missing).
- **Role:** a monitor on every run. It is the control for `--until-typical`, and `fidelity --typicality` leaves out
  runs steered on it.
- **Known failures:** it reads one text at a time. On one author, an older Atelier's drafts had a median typicality of
  62% while the set was told apart at AUC 0.975. A text measuring too few features gets no reading.

## Two-sample test, counted features

**Can a run of outputs be told from your pieces?** It reports a held-out classifier's AUC (0.5 means it cannot), a
kernel test (MMD with a permutation p-value), and the Vendi score of each side at equal size.

- **Validated by construction:** in tests, AUC about 0.5 for two draws of one distribution and about 1 for separable
  ones.
- **Role:** evaluation over a run, `atelier fidelity --typicality`.
- **Known failures:** default draft selection already ranks on these features, so this reading is only partly
  independent of what produced the outputs.

## Evaluation family

**Character 4-grams and word bigrams, with the vocabulary fixed from the reference pieces before any output is
read.** Nothing in the product reads them.

- **Role:** evaluation only, in the sealed study of indistinguishability.
- **Known failures:** at 8 to 12 texts a side, the bootstrap intervals cover 0.5 about 82–85% of the time under no
  difference, so they are approximate. The most frequent n-grams are fragments of function words, which the style
  detector also reads; the study reports a reading without them.

## Context bands

**The SIGNAL bands a draft is held to, moved toward the author's pieces nearest the request.** Each piece is weighted
by its TF-IDF nearness to the request; the local band is the weighted 10th to 90th percentile, and the band used is
λ · local + (1 − λ) · usual, with λ = n_eff / (n_eff + 6). RULE bands never move.

- **Did not pass:** on 20 unseen author pieces and 40 model outputs, the in-band share separated them at AUC 0.803
  with the usual bands and 0.803 with local ones. The author's own pieces stayed in range (median 0.895 both ways).
- **Role:** opt-in (`invoke --context local`, `fidelity --set context=local`). It steers selection and edits for the
  runs that ask for it, and is recorded with them.
- **Known failures:** on a request that is only a title, few pieces are near (12 of 36 newsletter texts got a
  target at all). A per-piece value the calibration did not measure sits at the author's centre.
- **Record:** [studies/CONTEXT_BANDS_RESULT.md](../studies/CONTEXT_BANDS_RESULT.md).

## Structure reader

**One move per paragraph from eleven (claim, explain, example, evidence, story, concession, definition, instruction,
question, turn, summary).** Each text is read twice, and a move is kept only where both reads agree.

- **Validated:** two-read κ median 0.867; 11 of 12 sequence features reproduce at 0.94 or better on an independent
  re-read.
- **Did not pass as a sensor:** no feature separated the author from the model by the product's bar. The strongest,
  switch rate and entropy rate (AUC about 0.71), say authors are less predictable.
- **Role:** a monitor. With `--structure plan`, the moves it read from your pieces shape each draft's skeleton, as an
  opt-in research preview; none of its features selects or gates.
- **Record:** [studies/STRUCTURE_READER_RESULT.md](../studies/STRUCTURE_READER_RESULT.md).

## Taste reader

**Reads the rules no count can check (argument, figure, register, cadence), twice and with quotes.**

- **Validated:** per skill, by your own blind labels (`atelier taste --calibrate`). Until then it is a monitor.
- **Role:** with enough agreeing labels it earns VETO on a rule; it never outranks a REQUIRED counted rule.

## Move reader

**The first reader of the deep layers: openings, closings, figures and argumentative moves.**

- **Failed its qualification.** What it read reliably did not separate the author from the model, and what separated
  could not be read the same way twice. It is parked.
- **Record:** [studies/SENSOR_QUALIFICATION_RESULT.md](../studies/SENSOR_QUALIFICATION_RESULT.md), C2.
