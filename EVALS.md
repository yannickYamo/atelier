# Evaluations

What has been measured, how, and what has not. The run records are not in this repository, so these figures cannot be reproduced from the tree alone; the method of each is stated so a reader can repeat it on their own writing.

## Results

| Claim | Result | How it was measured |
|---|---|---|
| The writing | Against the model asked bare: 24 of 25 briefs won, 1 tied. Against the author's posts pasted into one call: level (6 won, 12 tied, 7 lost). Against the posts pasted, then one review: 4 won, 11 tied, 10 lost | 25 briefs of one blog, the same model and settings for every arm, each pair read blind by model judges in both orders; a pair counts only when both orders agree |
| Invented specifics caught | 46 of 46 planted inventions caught; 39 of 48 clean drafts left untouched (about one in five falsely flagged); a pattern check on the same drafts caught 11 of 46 | Inventions planted in known-clean drafts; the check ran blind to which were planted |
| Counted rules hold | 31% of answers broke a counted rule, against 76% for a hand-written skill never shown Atelier's rule list | Code counts on every output; one development run |

## What it does not do

- **Write better than a paste.** On the writing itself, Atelier is level with pasting the author's posts into the same model, not ahead of it. What it adds is the check of every draft, your rules held, fixes of only what you name, and the record.
- **Argument and decision quality.** The checks count what a standard says the output must contain; they do not make a diagnosis sharper or a call more right. On strategy documents (pricing, positioning, market entry) built from long worksheet methods, a model judge preferred the same method and one example pasted into a single call (21 to 11). An earlier independent run on structured documents had Atelier ahead of two hand-written skills (24 to 1 and 27 to 0); against pasting the method itself, it did not hold. Decision documents are outside what this release is for.
- **Short one-off work.** On short pieces the checking roughly doubles the cost of a plain call and adds little.

## The test suite

`npm test` runs the full suite offline (no model calls): the counted checks, the grounding of specifics, the repair rules, the record, the CLI through the built binary, and the plugins. `npm run preflight` runs typecheck, lint, tests and build.

Sample data in `tests/fixtures` is synthetic.
