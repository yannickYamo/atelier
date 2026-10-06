# Pre-registration (draft): can a skill serve less of the author's writing and still hold its standard?

**Status:** DRAFT, not sealed. Sealed by the tester with a public commit holding this file, the product commit, the
`plan.json` of section "The plan file", and the sha256 of `bench/compare/efficiency-rows.mjs` and
`bench/compare/efficiency-select.mjs`, before any arm writes an output.
[Decision 0014](../docs/decisions/0014-the-smallest-realization-that-holds-the-standard.md).

## What this is, and what it is not

A development measurement that chooses a configuration. On the one skill measured part by part, 9,201 of 13,173
exported words are the author's own pieces, served whole. They are there because of an early, exploratory finding
about voice on one author. Nobody has measured how much of the rule holding and the voice they buy. This study
serves fewer of them, or none, and reads what changes.

It does not show that a smaller skill is equivalent to today's, and it cannot: section "What the sample can and
cannot show" gives its error rates, which are large both ways. The arm it selects is measured once more, beside
today's skill, in the last development round.

## Material

- **Domains.** Two kinds of writing the reviewer holds skills and development tasks for: one company blog, and one
  drafting house's contract clauses. One author each, described and never named.
- **Skills that answer are not in this study.** A skill that answers is built to show its examples within 1,200
  words, spread over the kinds of request, so the 9,000-word budget this study varies does not shape it, and the
  3,000-word arm would make it longer. Record the coding skill's export size by part to confirm it. Whatever is selected applies to skills that write and leaves a skill that answers
  byte-identical, which the last round confirms by sha256.
- **Tasks.** 30 development tasks per domain, never used for a held-out reading and not written for a seal. 60 per
  domain is better: it changes nothing but the noise (see the error rates below). Say which was run. With fewer than
  20 tasks in a domain no arm is read there, and an arm unread anywhere cannot be selected.
- **The plug-in only.** Every arm is the exported file as a system prompt
  (`bench/compare/run.mjs --arm skill:<file>`). `atelier invoke` is not measured here: with none of the author's
  pieces a skill that has no release writes one draft where it wrote two, which would change two things at once.
- **Outputs.** Two per task per arm (`--trials 2`), with the writer model, `--max-tokens` and placement of the second
  round, named in the sealing commit.

## Arms

Each arm rebuilds the same approved standard in the project the skill was built in. Give every rebuild the skill's
own `--description`: a rebuild without it writes the default one, and the arms must differ in nothing else.

| Arm | Build, then `atelier export --skill <skill> --out <arm>.md` | May become the 1.x default |
|---|---|---|
| `full` (reference) | the skill as it stands, exported before any rebuild | it is the default |
| `no-pieces` | `atelier build --name <skill> --piece-budget 0` | yes |
| `lean-3000` | `--piece-budget 3000` | yes |
| `excerpts-1500` | `--piece-budget 1500 --pieces excerpts` | no: measured only |
| `excerpts-3000` | `--piece-budget 3000 --pieces excerpts` | no: measured only |

The order of this table is the sealed order of `arms`. On equal size, the arm listed first is taken.

**Why these budgets.** A whole piece longer than half the budget is never chosen, so that one piece cannot use it
all. On a corpus of twenty long posts (1,400 to 7,100 words each), measured offline: 9,000 words chooses three whole
pieces; 3,000 chooses the two shortest (about 2,800 words); 1,500 chooses none, which is `no-pieces`, so there is no
whole-piece arm at 1,500. Excerpts reach five pieces within 3,000 words and two within 1,500.

**Why the excerpt arms cannot become the default.** Excerpts are a new mode, and
[decision 0008](../docs/decisions/0008-one-point-zero-is-the-floor.md) keeps a new mode off in 1.x until a sealed
study shows it helps. This study can show only that an arm was not rejected. The excerpt arms are measured so the
next major version starts from a number.

**Before any output is written:**

1. Record each arm's export size line (`atelier export --out` prints the words and the words by part) and sha256.
2. `full` must equal the second round's export byte for byte. If it does not, stop and report: the compiler has
   moved, and the study would not be about the skill the second round measured.
3. After the last arm, `atelier build --name <skill> --piece-budget 9000 --pieces whole --description "<the skill's>"`
   must give `full` back byte for byte. If it does not, stop and report.
4. Two arms whose exports are byte-identical in a domain are one skill there. Declare it in the plan
   (`"sameAs": {"lean-3000": "no-pieces"}`): the export is then read once, on one set of answers, under both labels.
   `efficiency-rows.mjs` refuses identical exports that are not declared.

## Readings

| Reading | Read by | What a failure is |
|---|---|---|
| Rules | `bench/compare/efficiency-rows.mjs`, which runs `atelier verify --skill <skill> --json --claims pattern --allow-unsourced` on every answer, offline | the answer breaks a REQUIRED rule that verify measured |
| Quality | `bench/compare/rubric-judge.mjs` with `rubrics/stop-slop.json`, every arm of a task in one session, two sessions (`--pass 1`, `--pass 2`), the judge of the second round | the sum of the five dimensions, out of 50 |
| Voice | a blind choice between an arm's answer and `full`'s, by a reader **qualified on that domain** (below); otherwise not read | `full`'s answer chosen |
| Size | the words of each export | |
| Cost | `cost_usd` per answer, as `run.mjs` records it | |

- **The claim check is left out of the rules reading on purpose.** A plug-in answer is written with no material
  bound, so the check for invented specifics flags most answers of every arm alike and would drown the reading.
- **An answer verify cannot check stops the run.** Exclude that task for every arm (`excluded`) and say why.
- **A reader is qualified on a domain** when that exact reader (model, prompt, settings) chose correctly on at least
  0.85 of known pairs of each class from that author, as `bench/compare/judge-qualification.mjs` reads it
  ([decision 0012](../docs/decisions/0012-the-closing-rules.md), item 3). Name the domains where voice is read, and
  the qualification file each rests on, in the sealing commit. For the choice, the first answer of each arm
  (trial 1) is paired with `full`'s first, order randomised per task, rows written as
  `{case_id, condition: <arm>, chose: "arm" | "reference"}`.

## From answers to rows (the scripts decide; nothing here is done by hand)

`run.mjs` labels every skill arm `candidate` and resumes by case, trial and that label, so two arms written to one
file are one arm. Run each arm to its own `--out` file. Then:

```bash
node bench/compare/efficiency-rows.mjs --plan plan.json --stage merge --out out     # every answer under its arm's label
node bench/compare/rubric-judge.mjs --responses out/<domain>-responses.jsonl --tasks <tasks> --rubric bench/compare/rubrics/stop-slop.json --out <domain>-judged-1.jsonl --pass 1
node bench/compare/rubric-judge.mjs ... --out <domain>-judged-2.jsonl --pass 2
node bench/compare/efficiency-rows.mjs --plan plan.json --stage rows --out out      # sizes, rules, quality, ablation.json
node bench/compare/efficiency-select.mjs --config out/ablation.json --out out/result.json
```

A judging session that did not score every piece is not written by the judge; run it again until every task and
trial is there. The selection script refuses rows it does not expect (an unknown label, a missing task, a duplicate,
a value of the wrong type) instead of reading what is left.

## The plan file

Sealed as written, with the files' paths filled in:

```json
{
  "reference": "full",
  "arms": ["no-pieces", "lean-3000", "excerpts-1500", "excerpts-3000"],
  "defaultable": ["no-pieces", "lean-3000"],
  "margins": { "rules": 0.05, "quality": 1 },
  "minTasks": 20,
  "ceiling": 0.85,
  "trials": 2,
  "domains": [
    { "name": "blog", "skill": "<skill>", "data": "<ATELIER_DATA>", "tasks": "blog/tasks.jsonl",
      "exports": { "full": "blog/full.md", "no-pieces": "blog/no-pieces.md", "lean-3000": "blog/lean-3000.md", "excerpts-1500": "blog/excerpts-1500.md", "excerpts-3000": "blog/excerpts-3000.md" },
      "responses": { "full": "blog/full.jsonl", "no-pieces": "blog/no-pieces.jsonl", "lean-3000": "blog/lean-3000.jsonl", "excerpts-1500": "blog/excerpts-1500.jsonl", "excerpts-3000": "blog/excerpts-3000.jsonl" },
      "judged": ["blog-judged-1.jsonl", "blog-judged-2.jsonl"], "rubric": "<repo>/bench/compare/rubrics/stop-slop.json",
      "voice": null, "excluded": [] },
    { "name": "contracts", "...": "the same fields" }
  ]
}
```

## The rule that selects

Each domain is read on its own. Against `full`, an arm is **rejected in a domain** when any of these holds:

- **rules:** it breaks a required rule in more answers than `full` by more than 5 in a hundred of the answers
  compared. Counted in whole answers: at 60 answers, four or more extra; at 120, seven or more;
- **quality:** its mean score over tasks is more than 1 point of 50 lower. The margin is a tolerance: a smaller loss
  does not reject, however steady;
- **voice, where read:** `full`'s answer is chosen clearly more often, by an exact one-sided sign test at 0.05 over
  the tasks.

An arm is **unread in a domain**, and cannot be selected, when the domain has fewer than 20 tasks; when voice is read
there and the arm has fewer than 20 tasks of choices; or when `full` itself breaks a required rule in more than 85%
of its answers, because a yes-or-no reading then has no room to show an arm is worse. The rows script prints, per
arm, how many answers break a rule and how many rules an answer breaks, so a domain near that ceiling is seen.

**The arm selected** is the one with the fewest exported words summed over the two domains, among `no-pieces` and
`lean-3000`, read in both domains and rejected in neither. Domains are never pooled. If neither stands, `full` stays
the default. The smallest arm of all that stood is reported beside the selection.

## What the sample can and cannot show

Computed for this rule, with answers taken as independent (they are not quite: two answers share a task).

| | 30 tasks (60 answers) | 60 tasks (120 answers) |
|---|---|---|
| An arm truly level with `full` is rejected on rules, in one domain, when `full` breaks a rule in 10% of answers | 14% | 8% |
| the same, when `full` breaks a rule in 30% to 50% of answers | 24% to 26% | 18% to 20% |
| An arm truly 10 points worse on rules passes, in one domain | 26% to 32% | 16% to 24% |
| An arm truly 20 points worse passes | 2% to 5% | under 1% |
| A level arm is rejected on quality, when task-level differences have a spread (SD) of 3 points | 3% | under 1% |
| the same, with a spread of 5 points | 14% | 6% |

- **It errs toward keeping today's size.** An arm must stand in two domains on two readings. A truly level arm
  stands roughly half the time at 30 tasks. A result of "none selected" is therefore weak evidence: it says the study
  did not show that a smaller skill holds, not that the size buys something.
- **It can pass a real loss of ten points about three times in ten in a domain.** It must do so in both domains to
  be selected, and the last round measures the selected arm again on other tasks.
- **Every arm is compared with one set of `full` answers per domain.** An unlucky draw for `full` helps every arm
  at once. The last round writes `full` afresh.
- **The smallest standing arm is favoured by luck.** Taking the smallest of several noisy screens selects, more
  often than not, an arm that was lucky. This is the main reason for the second measurement.
- **Thirty clean answers do not show a small failure rate.** Thirty of thirty still leave about 9.5% possible at
  95%, and sixty of sixty about 4.9%, and that is one arm on its own; the difference of two arms is wider.
- **A model reader may not see a loss of voice,** which is what the pieces were put there for. In the second round
  one could not separate Atelier's answers from four pieces pasted (54%). Where no reader is qualified, voice does
  not enter this study at all, and the rule can then prefer `no-pieces` exactly where it cannot see. The owner's
  blind read in the last round is the only check on that, and it is one reader.

The result is stated as "selected", "stood" and "rejected in", never as "equivalent" or "non-inferior".

## What follows, fixed now

- **The build.** If an arm is selected, the default budget of a new build of a skill that writes becomes that arm's
  (0, or 3,000 words of whole pieces). Nothing else changes: not the export, not a skill that answers, not a skill
  already built, which keeps its pieces until they are chosen again. Today's configuration is
  `--piece-budget 9000`. If no arm is selected, nothing is built.
- **Two commits, prepared before the last round,** that differ in that one constant: one with the selected budget,
  one with today's. Both hashes go in the round's report.
- **The last round measures the selected arm beside `full`,** both written afresh, on 30 or more tasks per domain
  that this study did not use, through the same two scripts with the same plan values. If the selected arm is
  rejected or unread in a domain there, the commit with today's budget is the one sealed. Naming one of two commits
  prepared in advance is not a product change.
- **The owner reads ten blind pairs** from that round, the selected arm against `full`. If `full` is chosen in 8 or
  more of the 10, the commit with today's budget is the one sealed. Eight of ten happens by chance about one time
  in eighteen when the two are level, and a real preference of three in four reaches it only about half the time:
  the read catches a large loss of voice, not a small one.
- No arm is added, no margin is moved and no strategy is invented after the first answer is written.

## What to send back

1. The product commit, the sealing commit, the plan file, and the two scripts' sha256.
2. Per domain and arm: the export's size line and sha256, the two byte-identity checks, and any arms declared the
   same.
3. `out/result.json`, and what the selection script prints: each arm's standing, every rejection with its reason,
   any domain where rules were unread, and the sentence.
4. Per domain and arm: the share of answers breaking a rule and the rules broken per answer, as the rows script
   prints them.
5. Cost per answer, per arm.
6. The domains where voice was read, and the qualification each rests on.
7. Every excluded task with its reason, every deviation, and what you would not conclude.
