# Evaluations

What has been measured, how, and what has not. The run records are not in this repository, so these figures cannot be reproduced from the tree alone; the method of each is stated so a reader can repeat it on their own writing.

## Results

| Claim | Result | How it was measured |
|---|---|---|
| Nothing invented | Specifics with no source in the supplied material: 0 in 60 Atelier outputs across two corpora; 37 to 67 per corpus for plain prompting and for pasted examples | One grounded reading of every output, the same for every arm, tracing each specific to the material; the analysis was fixed before the outputs were read |
| Invented specifics caught | 46 of 46 planted inventions caught; 39 of 48 clean drafts left untouched (about one in five falsely flagged); a pattern check on the same drafts caught 11 of 46 | Inventions planted in known-clean drafts; the check ran blind to which were planted |
| Counted rules hold | 31% of answers broke a counted rule, against 76% for a hand-written skill never shown Atelier's rule list | Code counts on every output; one development run |

## What it does not do

- **Rhythm from a few pieces.** Blind readers ranked Atelier's pieces first on single reads, but reproducing an author's rhythm from a handful of pieces is not established.
- **Argument and decision quality.** The checks count what a standard says the output must contain; they do not make a diagnosis sharper or a call more right. On strategy documents (pricing, positioning, market entry) built from long worksheet methods, a model judge preferred the same method and one example pasted into a single call (21 to 11). An earlier independent run on structured documents had Atelier ahead of two hand-written skills (24 to 1 and 27 to 0); against pasting the method itself, it did not hold. Decision documents are outside what this release is for.
- **Short one-off work.** On short pieces the checking roughly doubles the cost of a plain call and adds little.

## The test suite

`npm test` runs the full suite offline (no model calls): the counted checks, the grounding of specifics, the repair rules, the record, the CLI through the built binary, and the plugins. `npm run preflight` runs typecheck, lint, tests and build.

Sample data in `tests/fixtures` is synthetic.
