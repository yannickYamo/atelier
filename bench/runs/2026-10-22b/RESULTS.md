# Tests A and C, 2026-10-22b

Head: phase-g at f6dd130, dist as built at that commit. Writer `claude-sonnet-5-5` on every build and run; context reader
`claude-haiku-5-5`, claim reader `claude-haiku-4-5` (defaults). Every model call passed through `meter.mjs` (one meter,
one ledger: `calls.jsonl`); `ledger.json` lists each step with what the meter booked. Every build ran in its own
`ATELIER_DATA`. **Spend for the whole study: $5.93** (cap $14).

Fixtures: `bench/standing/domains/claims`, `bench/standing/domains/labels`, and the public `i-have-adhd` skill, built
with `atelier skill` from its SKILL.md minus front matter (read as data; nothing in it was run).

Scripts (copied from the stopped provisional run of 2026-10-22 and fixed): a run stops on a connection error instead
of logging an empty output, and the meter is checked before every call; stderr is kept whole; every build has its own
data folder; a defect is "named by its own step" when a violated check's statement is that method step's words,
whatever id the build gave it. `build.mjs`, `run-builds.sh`, `run-series.sh` (A1), `analyse-a1.mjs`, `verify.mjs`
(A2, A3), `repair.mjs` (A7), `hook-ground-authority.mjs` (A6, grounding, authority), `consistency.mjs`, `run-a.sh`,
`run-r3.sh` (A4, A5), `score.mjs`, `deliver.mjs` (A4, A8), `latitude/bench.mjs` (C), `report.mjs` (prints
`report.md`, every table).

## Headline

| test | pass line | result | number |
|---|---|---|---|
| A1 | five builds, unchanged inputs, one hash; a reworded step changes only its requirement, same count | **pass** | claims 1 hash of 5, labels 1 of 5 (rebuilds $0.0006 to $0.0014 each); reword: claims 15 → 15 requirements, only x7 changed; labels 41 → 41, only x7 changed (words and its check) |
| (not A1) | the same inputs built from scratch in five fresh folders | 5 hashes of 5 on both | written checks are drawn anew in each folder; materiality and obligation of some steps move too |
| A2 | 0 held-out goldens blocked | **pass** | claims e10 NEEDS_REVIEW, labels e12 NEEDS_REVIEW; 0 of 2 blocked (labels on 10-21: 10 of 12 blocked by the copying check) |
| A3 | planted defects named by their own step, with passage, and the record state | reported | claims 3 of 5 named with passage, 1 blocked by its own step; labels 3 of 5, 1 blocked (10-21 by build: claims 2, 5, 4 named; labels 2, 3, 3) |
| A4 | delivered share above zero, and the every-rule margin over method + examples with a lower bound above zero | **fail** | delivered: claims 0 of 30, labels 0 of 30 (i-have-adhd 30 of 30); every oracle rule held: claims 29/30 vs 18/30 for method + examples, +36.7 points (18.0 to 55.3); labels 30/30 vs 30/30, no margin |
| A5 | progress lines in casual replies (report) | reported | Atelier 2 of 30 replies carry one, 0 of 6 on the casual and direct-answer cases (23 of 30 on 10-21); the model with SKILL.md alone: 3 of 30, 0 of 6 |
| A6 | hook on the held-out claims golden, no material: exit 0, unread rules named | **partial** | exit 0 in 1.3 s; nothing named: no rule that reads material is required in this build (see bug 2) |
| A7 | repair on the five claims defects: fixed; nothing added, dropped or negated | **fail** on effect, pass on safety | 0 of 5 fixed (0 of 5 on 10-21); 0 sentences added or dropped, 0 negations, 0 material figures lost |
| A8 | record head on every output, failures included | **pass** | 90 of 90 runs, 12 of 12 verifies, 8 of 8 repair and grounding outputs; an unknown skill and an unknown model each print `{schema, state: "ERROR", error}` |
| C | 27 of 30 right in 4 of 5 draws; never CREATIVE for STRICT | **pass** | 30 of 30 (150 of 150 draws right); 0 STRICT read CREATIVE; $0.017 |

## A1

Build 1 of each fixture in a fresh folder; builds 2 to 5 and then the reworded step (claims step 7 "Never use the
words..." → "Do not write the words ... anywhere in the memo"; labels step 7 "Every flagged category carries
evidence..." → "Each flagged category comes with evidence...") in one folder, a copy of build 1's taken before any
rebuild, so build 1's own folder stayed the skill every later test used. The checks frozen at build 1 were kept on
every rebuild, and the reword read only its own step again. Latitude (STRICT on both) was kept.

Built from scratch five times, the same inputs gave five hashes on each fixture: every written check is a new draw,
and on several steps the materiality and obligation moved between builds (claims: the Decision step was a required
presence check in two builds, judgement in two, and a habit in one; labels: 14 differences per build). The freeze makes a skill stable once built; it does not
make two first builds agree.

## A2, A3

`verify --json` with the example's material bound, on build 1 of each fixture. Per defect, in `report.md`. Claims:
reserve (x5, reports), speculation (x7, blocks), uncited (x2, reports) named with passage; date (step 8) and
exclusion (step 3) not named by their step. Labels: firearms-floor (x5, reports; the run blocked on x3), paraphrase
(x17, reports), span (x12, blocks) named; high (step 4) and taxonomy (step 1) not.

## A4, A5

10 tasks by 3 runs by 3 arms; scored by each domain's `check.mjs` (i-have-adhd by `verify` on the code-decided rules).
The method-alone arm was run on every fixture (the budget allowed it). The method + examples arm was given the very
files the build installed in the skill's `examples/` folder (an exemplar and eight voice pieces on claims).

Every claims and labels run ended NEEDS_REVIEW, held by required rules no check read in full: on claims x1 ("one
paragraph" of the Summary step is not read), x4 and x6 (judgement), and the claims reader on 22 of 30; on labels,
twelve rules. On a STRICT skill no rule is accepted unmeasured by default, and x1, which has a measurement, could not
be accepted at all; so no claims or labels run could be delivered under the definition. i-have-adhd was read CREATIVE,
its six unmeasured rules accepted by default, and every run was held only by the claims reader: delivered 30 of 30.

Against the model given the method alone, Atelier held every claims oracle rule in 29 of 30 memos against 0 of 30
(+96.7, 90.2 to 103.1) and every labels rule in 30 of 30 against 25 of 30 (+16.7, 3.3 to 30.0). Against the method and
the same examples: claims +36.7 (18.0 to 55.3), the gain from figures the file does not give (30/30 vs 21/30) and
uncited facts (30/30 vs 25/30); labels no difference.

## A6, A7

The hook exits 2 on the speculation defect (Write and Stop events, 0.88 to 0.91 s) and 0 on every other defect, the
goldens and the held-out golden, with nothing on stderr. Repair: speculation was rewritten once and the rewrite refused
("added a negation (0 → 1)"), the four others had no enforced rule broken in a span, so no rewrite was attempted.

## Grounding and authority (not pass lines)

e02 with an invented figure and an invented citation: with material bound the run is BLOCKED (STRICT); without
material NEEDS_REVIEW with 12 specifics listed; `--repair` cut nothing. No standard file changed during the hook,
grounding and repair calls; the hash recomputed from the hashed body equals the file's name.

## Product bugs found

1. **Material is named one way at build and another at run.** At build an example's material file is named by its path
   from the examples folder (`e01.material/notice-of-loss.txt`, cli/corpus.ts `readCase`); at run, by the `--with`
   name (`notice of loss`). The citation check written for claims step 2 compared citations to those names and failed
   all nine of the owner's examples at build, so it never qualified; at run it reads correctly.
2. **An owner's method step with an unqualified written check is a habit.** Steps 2, 3, 5 and 8 of the claims method
   were stored with materiality null; the plan (core/plan/execution-plan.ts) makes a null-materiality, non-judgement
   rule a HABIT: not required, so it neither blocks nor sends a run to review. The owner's own step loses its authority
   because its check did not qualify. This also empties the hook's "unread required rules" note (A6).
3. **Repair cannot remove a banned word.** The rewrite of "The insured's account is suspicious and may be a scam." was
   refused for adding a negation; the defect stays (A7).
4. **A hook event that is not JSON exits 0** ("nothing to check"), where the documentation says 2.
5. **The suite fails at f6dd130**: `tests/atelier-verdict.test.ts` "an instruction written as a sentence is kept"
   (prose sentences of a method note are no longer read as steps since R2). Not changed here.

## What did not run

Nothing was cut. The provisional run's outputs (bench/runs/2026-10-22) were not used.
