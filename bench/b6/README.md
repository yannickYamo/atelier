# B6: the closed-loop fidelity study

The procedure for [studies/B6_PREREGISTRATION.md](../../studies/B6_PREREGISTRATION.md). You bring the
corpora and the key; the script does the rest, and only `build` and `generate` spend.

```bash
npm install && npm run build
export ANTHROPIC_API_KEY=...          # yours
export B6_MODEL=claude-opus-5-5       # the writer for every arm
export B6_PRICE_IN=… B6_PRICE_OUT=…   # its rate, USD per million tokens, when providers/pricing.ts has none
export B6_EVAL_MODEL=claude-sonnet-5-5  # another model, for the evaluator's imitations (B6_EVAL_PRICE_IN/OUT likewise)

node bench/b6/selftest.mjs                                         # offline: every refusal below fires
node bench/b6/run.mjs prepare  --corpora ./corpora --work ./b6     # seeded split, briefs, sha256 of every text; no spend
git add b6/plan.json && git commit    # seal the split before generating on the test split
node bench/b6/run.mjs build    --work ./b6                         # one skill per register, training pieces only
node bench/b6/run.mjs generate --work ./b6 --split validation      # trains the evaluator, never scored
node bench/b6/run.mjs generate --work ./b6 --split test --repeats 3 [--shard 1/4] [--briefs a,b]
node bench/b6/run.mjs evaluate --work ./b6                         # offline: results.json
node bench/b6/run.mjs blind    --work ./b6 --readers r1,r2,r3      # a packet and labels file per reader, KEY.json and its hash
node bench/b6/run.mjs score    --work ./b6 --labels b6/blind/labels-r1.csv,b6/blind/labels-r2.csv,b6/blind/labels-r3.csv
```

The writer needs a price, or the cap cannot hold: `build` and `generate` refuse to start with a model that has
no entry in `providers/pricing.ts` unless `B6_PRICE_IN` and `B6_PRICE_OUT` are set (no price is guessed). The
evaluator's model must not be the writer; both steps that use it refuse when it is.

Several `generate` processes can share one work directory: `--shard k/n` takes a fixed slice of the work
list (shards 1/n to n/n cover it exactly once), `--briefs` limits it to named pieces, and `--dry-run` prints
it. Each output is claimed, written under a temporary name and renamed, and skipped once it exists. The cap
is per process.

`score` refuses any design that is not the pre-registered one: fewer readers than `--readers-required` (3),
a reader missing, a pair not judged by every reader, a judgment given twice or left empty, orders not
balanced across readers. Every step after `prepare` refuses a text whose sha256 changed, naming it.

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
- **Fact coverage**: the brief's facts an output uses, per 100 words, beside the author's own density of
  specifics on the validation pieces. Reported, not a bar.
- **Detector bar**: decided only when the evaluator's detector separates its own validation material
  (cross-validated AUC of at least 0.65); otherwise null, with the reason in `results.json`.
- **Manifest gaps**: rules an Atelier output waived without a reason. Should be zero.
- **Spread**: how much the length of repeated outputs on one brief varies.
- **Human read**: masked pairs, three readers or more, each judging every pair once with the order balanced
  across readers; the share that prefers Atelier, with an interval that resamples briefs.

## Qualifying a sensor first

`bench/fidelity/qualify.mjs` checks whether a sensor separates an author from model imitations with sources,
topics and generators held out. Run it on validation material before trusting any sensor to steer. For a
built skill, `atelier qualify --skill <name>` runs the same test on the skill's own pieces and drafts.
