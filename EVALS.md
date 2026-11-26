# Evaluations

What has been measured, how, and what has not. The run records are not in this repository, so these figures cannot be reproduced from the tree alone; the method of each is stated so a reader can repeat it on their own writing.

## Results

| Claim | Result | How it was measured |
|---|---|---|
| The writing, November 2026 | Against the author's posts pasted with the brief and the notes (in the first run, the full sealed intent too), then one review: preferred on voice in 11 of 21 briefs, behind in 3, 7 split; on which piece the judge would publish, 10 to 4, 7 split. Against the bare model given the full brief and the notes: 10 of 11 won on voice and on publishing, 1 split | Two runs on the current version (25 Nov 2026). One of 11 briefs across four public voices: a company blog, a creator newsletter, an engineering blog and a PM newsletter. One of 10 further briefs for the company blog. The same writer model for every arm; a model judge read each pair in both orders, and a pair counts only when both orders agree. Development sets; no human readers yet |
| Details not in the notes, November 2026 | 52 in Atelier's pieces against 80 in the pasted pieces with a review, over the same 11 briefs | The same claim reader counted every figure, name and story not found in the notes, on both arms |
| Habits it finds | Every habit shown came with a sentence that is the author's own, word for word (12 of 12). Of the 9 that could be checked on pieces the build never read, 8 held fully and 1 partly | The four voices above; unseen pieces read by a model against each habit |
| The questions before a piece | With the person's answers, the piece carried what they wanted 7.45 of 8, against 5.70 without (point, goal, what goes on record, reader). The judge would publish the answered piece 6 to 3, 1 split; on voice the unanswered piece was preferred 5 to 3, 2 split | 10 briefs for the company blog, answers sealed before any piece was written, each piece scored blind to whether it was answered |
| The writing, October 2026 | Against the model asked bare: 24 of 25 briefs won, 1 tied. Against the author's posts pasted into one call: level (6 won, 12 tied, 7 lost). Against the posts pasted, then one review: 4 won, 11 tied, 10 lost | An earlier version. 25 briefs of one blog, the same model and settings for every arm, each pair read blind by model judges in both orders; a pair counts only when both orders agree |
| Invented specifics caught | 46 of 46 planted inventions caught; 39 of 48 clean drafts left untouched (about one in five falsely flagged); a pattern check on the same drafts caught 11 of 46 | Inventions planted in known-clean drafts; the check ran blind to which were planted |
| Counted rules hold | 31% of answers broke a counted rule, against 76% for a hand-written skill never shown Atelier's rule list | Code counts on every output; one development run |
| Against prompt and skill optimisers | On 30 contract clauses from one drafting house, no Atelier answer broke a counted rule; GEPA broke one in 7% of answers, SkillOpt 17%, a hand-written skill 10%, the bare model 23%. Across contracts, code review and speeches, Atelier broke fewer counted rules than GEPA or SkillOpt in 5 of 6 comparisons | One development run on 5 October 2026, on an earlier version of Atelier, one author per kind of writing, the same writer model for every arm. The optimisers ran at small budgets and searched on Atelier's own rule score, which favours Atelier on that score; a fair-budget run with an independent score has not been made. Voice was not compared here |
| Code review against a hand-written skill | 10% of Atelier answers broke a counted rule, against 95% for a careful hand-written review skill | 30 diffs of one maintainer; the same development run |

## What it does not do

- **Catch a claim made stronger than the notes, in true words.** Of 8 such sentences planted in a clean draft ("always refused", a roadmap item said as shipped), the check caught 1; it caught 4 of 4 planted figures, sources and names. It traces names and figures to your notes, not yet whole claims.
- **Hold the voice as well with answers as without.** Answered pieces carry what you mean far better and are more often the one a judge would publish, but on voice alone the unanswered piece was preferred 5 to 3 (see the results above). Part of it is that the judge does not see the answers, so your own story can read to it as invented.
- **Argument and decision quality.** The checks count what a standard says the output must contain; they do not make a diagnosis sharper or a call more right. On strategy documents (pricing, positioning, market entry) built from long worksheet methods, a model judge preferred the same method and one example pasted into a single call (21 to 11). An earlier independent run on structured documents had Atelier ahead of two hand-written skills (24 to 1 and 27 to 0); against pasting the method itself, it did not hold. Decision documents are outside what this release is for.
- **Short one-off work.** On short pieces the checking roughly doubles the cost of a plain call and adds little.

## The test suite

`npm test` runs the full suite offline (no model calls): the counted checks, the grounding of specifics, the repair rules, the record, the CLI through the built binary, and the plugins. `npm run preflight` runs typecheck, lint, tests and build.

Sample data in `tests/fixtures` is synthetic.
