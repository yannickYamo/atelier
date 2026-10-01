# B6: the closed-loop fidelity study

The procedure for [studies/B6_PREREGISTRATION.md](../../studies/B6_PREREGISTRATION.md). You bring the
corpora and the key; the script does the rest, and only `build` and `generate` spend.

```bash
npm install && npm run build
export ANTHROPIC_API_KEY=...          # yours
export B6_MODEL=claude-opus-5-5       # the writer for every arm

node bench/b6/run.mjs prepare  --corpora ./corpora --work ./b6     # seeded split and briefs, no spend
git add b6/plan.json && git commit    # seal the split before generating on the test split
node bench/b6/run.mjs build    --work ./b6                         # one skill per register, training pieces only
node bench/b6/run.mjs generate --work ./b6 --split validation      # trains the evaluator, never scored
node bench/b6/run.mjs generate --work ./b6 --split test --repeats 3
node bench/b6/run.mjs evaluate --work ./b6                         # offline: results.json
node bench/b6/run.mjs blind    --work ./b6 --against pasted        # packet.md, labels.csv, KEY.json and its hash
node bench/b6/run.mjs score    --work ./b6 --labels labels.csv     # the pre-registered decision
```

`./corpora/<register>/*.md` holds one source's pieces per register. Put a human-written outline at
`./corpora/<register>/briefs/<piece>.md` where you can: a generated brief gives the title, the length and the
piece's facts, and nothing of its form.

Every step can be stopped and run again; finished outputs are kept. `generate` stops at `--cap` dollars and
continues where it stopped on the next run.

## What each number is

- **In-band share**: of every counted feature the evaluator's bands cover, how many an output sits inside.
  The bands come from the validation pieces, not from what the skill was built on.
- **Detector AUC**: how well a stylometric detector, trained only on validation material, tells the real
  test pieces from the arm's outputs. 0.5 means it cannot.
- **Specifics outside the brief**: figures, names, dates and quotations an output has that the brief did not
  give. Counted, not judged.
- **Manifest gaps**: rules an Atelier output waived without a reason. Should be zero.
- **Spread**: how much the length of repeated outputs on one brief varies.
- **Human read**: masked pairs, both orders, three readers; the share that prefers Atelier, with an interval
  that resamples briefs.

## Qualifying a sensor first

`bench/fidelity/qualify.mjs` checks whether a sensor separates an author from model imitations with sources,
topics and generators held out. Run it on validation material before trusting any sensor to steer.
