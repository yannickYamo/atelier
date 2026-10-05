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
| Nearness, by shared words | chooses the passages shown and the pieces a reading weighs; shown on every panel | not measured against anyone's judgement of subject | a title shares few words with anything |
| Nearness, by subject (`nearness=reader`) | the same, read by a small model (opt-in) | not yet: sealed qualification drafted | unmeasured |
| Register reading (context judge) | names the document type a request asks for; the word table is its floor | not yet: in the same qualification | unmeasured; the word table is right on 25 of 40 labelled requests |
| Scope reading | what example answers add beyond what was asked; a carrier in the compiled skill | not as an instrument; its effect is tested in the closing test | states no length from answers alone |
| Coverage reading | under strict delivery: which parts of the request the reply gives; triggers one completion draft | not yet: sealed qualification drafted | unmeasured |
| Voice gate | refuses a voice rewrite that changed a fact or a claim (the voice pass is opt-in) | not yet: sealed qualification drafted | keeps 32 of 112 faithful pairs on one author |
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
- **Past your farthest piece it says so.** The share cannot go below 1 in (pieces + 1): with six pieces a text reads
  14% however far it is. A text farther than every piece reads "beyond every piece of yours", with its distance and
  your farthest piece's. The panel also says how many pieces the reading rests on, the step it moves in when there
  are fewer than 12, and whether the pieces nearest the request counted more.
- **Calibrated on every piece that is not reserved** (the pieces discovery read and the ones it held back), as
  `fidelity --calibrate-from` does. The held-back pieces enter as feature values only.
- **Known failures:** it reads one text at a time. On one author, an older Atelier's drafts had a median typicality of
  62% while the set was told apart at AUC 0.975. A text measuring too few features gets no reading.

## Two-sample test, counted features

**Can a run of outputs be told from your pieces?** It reports a held-out classifier's AUC (0.5 means it cannot), a
kernel test (MMD with a permutation p-value), and the Vendi score of each side at equal size.

- **Validated by construction:** in tests, AUC about 0.5 for two draws of one distribution and about 1 for separable
  ones.
- **Role:** evaluation over a run, `atelier fidelity --typicality`.
- **Read against your own floor.** The report also tells your own pieces from each other, at random halves, 40
  times, and prints the median and the 95th percentile of those AUCs (it needs 12 pieces). On two authors, with the
  evaluation family, that floor was 0.813 at 8 a side and 0.722 at 12 a side
  ([studies/AUTHOR_FLOOR_RESULT.md](../studies/AUTHOR_FLOOR_RESULT.md)): an AUC at or below it is one your own
  pieces give, and is unresolved, not a pass.
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

## Nearness

**Which of your pieces a request is near.** One reading per run, recorded with it and shown in the panel's CONTEXT
block: how many pieces are near, which, how they were found and what the run used them for.

- **By shared words (the default):** a TF-IDF cosine between the request and your passages. The near pieces are
  the ones holding the request's six closest passages.
- **By subject (`nearness=reader`, opt-in):** a small model writes a subject card per piece, once, from its body
  (`atelier fidelity --read-subjects`), then grades each request against the cards: same subject, related, or left
  out. Code drops a card number that does not exist and a label outside the two; the grades are recorded, so a
  replay reads the record. With no model, no cards or no answer, the words are used and the panel says so.
- **Role:** chooses which of your own passages the writer is shown, and which pieces count more in the
  typical-of-you reading, the range for the subject and the plan. It gates nothing and cuts nothing.
- **Validated:** not yet. The qualification is drafted with its bars fixed: the piece a title came from is found,
  not everything is called near, unseen titles are covered, subjects the corpus lacks are near nothing, and two
  reads agree ([studies/SUBJECT_READER_PREREGISTRATION.md](../studies/SUBJECT_READER_PREREGISTRATION.md)).
- **Known failures:** by words, a request that is only a title is often near nothing (12 of 36 newsletter texts
  got a local target in the context-bands study). Better nearness has not been shown to move outputs toward the
  author, and the context-bands result says not to expect it.

## Register reading

**The words of a request that name the kind of document it asks for.** The context judge quotes them; code checks
the quote is in the request and maps it to a register. "A post about our quarterly report" asks for a post, and
"report the bug" names no document, where a word table reads a report in both.

- **Role:** decides whether a request is in the register your pieces were written in, for a skill whose owner
  declared one. Out of register, only the traits your policy carries are applied. Your `--register` flag always wins.
- **Validated:** not yet. On 40 labelled requests written with the table's known traps in them, the word table is
  right on 25; the judge's reading is measured in the same qualification as nearness.
- **Floor:** with no judge, or a quote the request does not hold, the word table decides.

## Voice gate

**Whether a voice rewrite of a paragraph kept its facts and its claims.** A fact ledger and word lists in code,
then a small model's second read that must quote what changed and can only refuse.

- **Role:** a rewrite it refuses is dropped and the content paragraph kept whole. Only reached when the voice pass
  is on, which no release has by default.
- **Validated:** not yet. Offline, on the 112 faithful pairs of one skill's bank, the gate as shipped in 1.1 keeps
  32: the strength word lists read a hedge said in other words as a hedge lost. The qualification reads three
  gates against planted changes, including the reader in the word lists' place
  ([studies/VOICE_GATE_PREREGISTRATION.md](../studies/VOICE_GATE_PREREGISTRATION.md)).

## Scope reading

**What an example answer adds beyond what was asked,** and, when the example carries its request, whether the
request asked for detail or brevity. One call at build; each finding must be quoted from its own answer; code counts.

- **Role:** a carrier in the compiled skill, like the persona ("a preamble: never, 0 of 12"). It replaces the usual
  length a skill that answers used to state. It gates nothing.
- **Validated:** not as an instrument of its own. The behaviour it exists for is checked in the closing test: requests
  for depth are no longer cut short ([studies/CLOSING_A_PREREGISTRATION.md](../studies/CLOSING_A_PREREGISTRATION.md), P6).
- **Known limits:** a length is stated only as a record, for a kind of request seen three times or more in pairs.

## Coverage reading

**What a request explicitly asks for, and whether the reply gives each part.** A part must quote the request; a part
read as given must quote the reply, or it is unclear.

- **Role:** under strict delivery only. A missing part triggers one more draft with the parts named, kept only if it
  breaks no more REQUIRED rules and leaves fewer parts out. Shown on the panel as a monitor; it decides no verdict.
- **Validated:** not yet ([studies/COVERAGE_READER_PREREGISTRATION.md](../studies/COVERAGE_READER_PREREGISTRATION.md)).

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
