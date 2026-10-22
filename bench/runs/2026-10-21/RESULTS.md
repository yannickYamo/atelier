# Acceptance study, 2026-10-21: ten tests on three fixtures

Head: phase-g at 3f1b0dc, dist as built at that commit. Writer `claude-sonnet-5-5` on every build and run; the context
reader is `claude-haiku-5-5` (default) and the claim reader `claude-haiku-4-5` (default). Each build and its runs used a
fresh `ATELIER_DATA`. Every model call passed through `meter.mjs`, which books the provider's reported usage at
Atelier's own rate card; `calls.jsonl` is that record and `ledger.json` lists each step beside the command's own
`costUsd`. Spend for the whole study: **$5.93** (the first claims build, $0 on the meter, was not metered: see below).

Fixtures: `bench/standing/domains/claims` (eight-step memo method, ten examples, five planted defects of e01),
`bench/standing/domains/labels` (twenty-rule JSON label policy, twelve examples, five planted defects of e01), and the
public `i-have-adhd` skill (SKILL.md and its evals' cases). i-have-adhd has no finished example answers (its evals hold
criteria, not reference answers), so it was built with `atelier skill "<SKILL.md text>" --yes`, front matter removed.

The builds used for tests 4, 6, 7, 9 and 5 are claims build 2, labels build 2 and i-have-adhd build 1. For claims and
labels these are the builds with the most qualified written checks (1 and 6), the build a best-of-k choice would keep;
build 2 is not otherwise better on any measure here.

Scripts: `build.mjs` (tests 1, 11), `analyse-builds.mjs`, `verify.mjs` (2, 3), `repair.mjs` (4),
`hook-ground-authority.mjs` (6, 7, 9), `consistency.mjs` and `run-t5.sh` (5), `score.mjs`, `report.mjs`; `lib.mjs` and
`meter.mjs` are shared (`STUDY_SCRATCH` names the scratch folder, `STUDY_ADHD` the i-have-adhd checkout; the meter
listens on 127.0.0.1:8765 and is pointed at with `ANTHROPIC_BASE_URL`). Every output is kept under `arms/`.

## Headline

| test | pass line | result | number |
|---|---|---|---|
| 1 coverage | a step's column the same in every build | **fail** | claims 7 of 8 steps stable, labels 18 of 20; written checks qualified 0/1/0 (claims), 2/6/4 (labels); no written check qualified in all three builds |
| 11 reproducible | same inputs, same hash | **fail** | 3 distinct hashes of 3 builds on every fixture |
| 2 recall, named | every planted defect named with its passage | **fail** | named by its own step: claims 2, 5, 4 of 5; labels 2, 3, 3 of 5 (by build) |
| 2 recall, blocked | blocked where the check is qualified | as designed | blocked by its own step: claims 1, 2, 1 of 5; labels 0, 1, 2 of 5; every block came from a counted rule or a qualified check |
| 3 no false blocks | no golden blocked | claims **pass**, labels **fail** | claims 0 of 30 golden verifies blocked; labels 30 of 36 blocked, all by the copying check (`lifted`) |
| 4 repair safety | nothing added, dropped or negated | **pass** on safety, **fail** on effect | 0 figures lost, 0 sentences added or dropped, 0 negations; 0 of 5 defects repaired; one record says "every REQUIRED measured rule now holds" while it reads BLOCKED |
| 7 grounding | on a memo: flagged or listed, never cut | **pass**, one gap | with material: figure and citation listed; without: figure listed, citation not; nothing cut by `--repair` |
| 8 record head | six keys on verify and run | **pass** | 96 of 96 verify outputs with state, standard and certificate; 95 of 95 repair and run outputs with all six keys |
| 12 certificate | errorBound null with why; claims reader named | **pass** | 191 of 191 certificates |
| 6 hook | exit 2 on a planted defect, seconds measured | **pass**, with false blocks | exit 2 in 0.86 to 0.88 s on Write and Stop events; the golden e01 also exits 2, and the reserve defect blocks for the wrong rule: a hook event binds no material, so the qualified citation check (x2) fails on every memo |
| 9 authority | hash unchanged at run time; qualifications beside the hash | **pass** | standards byte-identical after every verify, repair, hook and run on the builds used (claims b2, labels b2, i-have-adhd b1: 90 runs); hash recomputed from `{evidenceId, workType, requirements}` equals the name |
| 5 consistency | lower bound of the difference above zero | claims, labels: **pass** against the method alone; against the method with examples, claims passes narrowly and labels does not; i-have-adhd: no gain counted | claims every rule 29/30 vs 0/30; with R8 read against the material, 30/30 vs 25/30 for method + examples (+16.7%, 3.3 to 30.0). Labels 30/30 vs 24/30 (method), 30/30 (method + examples). i-have-adhd: the one code-decided difference (x7) is a manufactured progress line |

## Tests 1 and 11: coverage and reproducibility (3 builds per fixture)

| fixture | build | steps | measure | written | written qualified | judgement | standard hash |
|---|---|---|---|---|---|---|---|
| claims | 1 | 8 | 2 | 5 | 0 | 1 | d3431f98a24a1f0e |
| claims | 2 | 8 | 2 | 5 | 1 | 1 | 8e9fa261657f5f22 |
| claims | 3 | 8 | 2 | 4 | 0 | 2 | 4f9bee7711912f2c |
| labels | 1 | 20 | 0 | 11 | 2 | 9 | e83251c579f44c09 |
| labels | 2 | 20 | 0 | 13 | 6 | 7 | d0f9945acba80cad |
| labels | 3 | 20 | 0 | 12 | 4 | 8 | dea79e2ab37879be |
| i-have-adhd (atelier skill) | 1 | 12 rules | 0 | 6 | 0 | 6 | 03fcfcea922b8e6a |
| i-have-adhd (atelier skill) | 2 | 12 rules | 0 | 6 | 0 | 6 | da6e9d17d41bf71b |
| i-have-adhd (atelier skill) | 3 | 12 rules | 0 | 3 | 0 | 9 | 37d03a25d6689656 |

claims: 7 of 8 steps in the same column in all three builds; 3 distinct hashes from the same inputs.
- step 4 moved: written / written / judgement
- of 4 steps written in all three builds, the qualification agreed in 3; qualified in all three: 0.
labels: 18 of 20 steps in the same column in all three builds; 3 distinct hashes from the same inputs.
- step 17 moved: judgement / written / written
- step 20 moved: judgement / written / judgement
- of 11 steps written in all three builds, the qualification agreed in 4; qualified in all three: 0.

## Tests 2 and 3: planted defects named and blocked; goldens not blocked

| fixture | build | defect | oracle finds it | named by its step (with passage) | its check enforced | blocked by its step | record state |
|---|---|---|---|---|---|---|---|
| claims | 1 | date | yes | no | - | no | NEEDS_REVIEW |
| claims | 1 | exclusion | yes | no | - | no | NEEDS_REVIEW |
| claims | 1 | reserve | yes | no | - | no | NEEDS_REVIEW |
| claims | 1 | speculation | yes | yes, with passage | yes | yes | BLOCKED |
| claims | 1 | uncited | yes | yes, with passage | no (reports) | no | NEEDS_REVIEW |
| claims | 2 | date | yes | yes, with passage | no (reports) | no | NEEDS_REVIEW |
| claims | 2 | exclusion | yes | yes, with passage | no (reports) | no | NEEDS_REVIEW |
| claims | 2 | reserve | yes | yes, with passage | no (reports) | no | NEEDS_REVIEW |
| claims | 2 | speculation | yes | yes, with passage | yes | yes | BLOCKED |
| claims | 2 | uncited | yes | yes, with passage | yes | yes | BLOCKED |
| claims | 3 | date | yes | yes, with passage | no (reports) | no | NEEDS_REVIEW |
| claims | 3 | exclusion | yes | no | - | no | NEEDS_REVIEW |
| claims | 3 | reserve | yes | yes, with passage | no (reports) | no | NEEDS_REVIEW |
| claims | 3 | speculation | yes | yes, with passage | yes | yes | BLOCKED |
| claims | 3 | uncited | yes | yes, with passage | no (reports) | no | NEEDS_REVIEW |
| labels | 1 | firearms-floor | yes | yes, with passage | no (reports) | no | BLOCKED |
| labels | 1 | high | yes | no | - | no | BLOCKED |
| labels | 1 | paraphrase | yes | no | - | no | BLOCKED |
| labels | 1 | span | yes | yes, with passage | no (reports) | no | BLOCKED |
| labels | 1 | taxonomy | yes | no | - | no | BLOCKED |
| labels | 2 | firearms-floor | yes | yes, with passage | no (reports) | no | BLOCKED |
| labels | 2 | high | yes | no | - | no | BLOCKED |
| labels | 2 | paraphrase | yes | yes, with passage | no (reports) | no | BLOCKED |
| labels | 2 | span | yes | yes, with passage | yes | yes | BLOCKED |
| labels | 2 | taxonomy | yes | no | - | no | BLOCKED |
| labels | 3 | firearms-floor | yes | yes, with passage | no (reports) | no | BLOCKED |
| labels | 3 | high | yes | no | - | no | BLOCKED |
| labels | 3 | paraphrase | yes | yes, no passage | yes | yes | BLOCKED |
| labels | 3 | span | yes | yes, no passage | yes | yes | BLOCKED |
| labels | 3 | taxonomy | yes | no | - | no | BLOCKED |

| fixture | build | named (of 5) | named with passage | blocked by its own step | goldens blocked | cause of the golden blocks | reporting checks firing on goldens |
|---|---|---|---|---|---|---|---|
| claims | 1 | 2 | 2 | 1 | 0 of 10 (oracle: 0 with a fail) | - | 2 |
| claims | 2 | 5 | 5 | 2 | 0 of 10 (oracle: 0 with a fail) | - | 28 |
| claims | 3 | 4 | 4 | 1 | 0 of 10 (oracle: 0 with a fail) | - | 10 |
| labels | 1 | 2 | 2 | 0 | 10 of 12 (oracle: 0 with a fail) | lifted | 0 |
| labels | 2 | 3 | 3 | 1 | 10 of 12 (oracle: 0 with a fail) | lifted | 0 |
| labels | 3 | 3 | 1 | 2 | 10 of 12 (oracle: 0 with a fail) | lifted | 2 |

## Test 4: repair safety (claims build 2, material bound)

| defect | oracle before | oracle after | state after | rewrites kept / refused | material figures lost | sentences added / dropped | why |
|---|---|---|---|---|---|---|---|
| e01.date.md | R8c the date cited to the report is the report's date | R8c the date cited to the report is the report's date | NEEDS_REVIEW | 0 / 0 | 0 | 0 / 0 | every REQUIRED measured rule holds |
| e01.exclusion.md | R3b exclusion 7.1 is addressed on a theft | R3b exclusion 7.1 is addressed on a theft | NEEDS_REVIEW | 0 / 0 | 0 | 0 / 0 | every REQUIRED measured rule holds |
| e01.reserve.md | R5 the reserve equals the invoices | R5 the reserve equals the invoices | NEEDS_REVIEW | 0 / 0 | 0 | 0 / 0 | every REQUIRED measured rule holds |
| e01.speculation.md | R7 never "fraud", "scam", "liar" or "suspicious" | R7 never "fraud", "scam", "liar" or "suspicious" | BLOCKED | 0 / 1 | 0 | 0 / 0 | a rewrite was discarded: every rewrite was refused (added a negation (0 → 1)) |
| e01.uncited.md | R2 every fact cites a document in the file | R2 every fact cites a document in the file | BLOCKED | 0 / 0 | 0 | 0 / 0 | every REQUIRED measured rule now holds |

## Test 6: the hook (claims build 2)

| event | exit | seconds |
|---|---|---|
| write:speculation | 2 | 0.86 |
| stop:speculation | 2 | 0.87 |
| write:uncited | 2 | 0.86 |
| stop:uncited | 2 | 0.86 |
| write:reserve | 2 | 0.87 |
| stop:reserve | 2 | 0.88 |
| write:golden-e01 | 2 | 0.86 |
| not-json | 0 | 0.14 |

## Test 7: grounding (claims build 2, golden e02 with an invented figure and an invented citation)

- with material: state BLOCKED; figure listed as unsourced: true; citation listed: true; 2 sentence(s) listed in all; flagged by rules: x2 (enforced), x8, x9, x10, UNSOURCED·check; claim instrument: pattern check, with claim reader (claude-haiku-4-5, prompt 47d18891) reporting only: not qualified
- without material: state BLOCKED; figure listed as unsourced: true; citation listed: false; 8 sentence(s) listed in all; flagged by rules: x2 (enforced), x9, x10, UNSOURCED·check; claim instrument: pattern check (no material bound: a model reading of specifics could only list them)
- repair with material: state BLOCKED; invented figure kept in the text: true; invented citation kept: true (nothing cut)

## Tests 8 and 12: record head and certificate

- verify --json outputs: 96, each with a certificate: 96.
- verify --repair --json and run --json outputs with all six head keys: 95 of 95.
- certificates with errorBound null and a why: 191 of 191.
- certificates whose readers.claims names an instrument and a gate: 191 of 191; instruments seen: pattern check, with claim reader (claude-haiku-4-5, prompt 47d18891) reporting only: not qualified | pattern check (claim reader (claude-haiku-4-5, prompt 47d18891) degraded after it failed: the reader returned no list of specifics; every text is read by the pattern check since) | pattern check (no material bound: a model reading of specifics could only list them)
- why (one): "no delivered-error bound: it needs an audit sample of your own labels, drawn like the work this skill does; the checks and readers above are what this output was held to"

## Test 9: authority (claims build 2)

- standard files byte-identical before and after the hook, grounding and repair calls: true; active standard unchanged: true (8e9fa261657f5f22).
- recomputed hash of { evidenceId, workType, requirements }: 8e9fa261657f5f22 (matches the file's name: true); with the qualifications folded in it would be 9a11a84e7c58f36f.
- qualifications sit in the standard file beside the hashed fields (keys: standardVersionHash, evidenceId, workType, requirements, authorityState, mintedAt, supersedes, reason, qualifications), for x2, x3, x4, x5, x8; qualified: x2; the requirements carry no qualification: true.
- after the test 5 runs: {"claims":{"build":2,"standardAtBuild":"8e9fa261657f5f22","activeAfterRuns":"8e9fa261657f5f22","standardFiles":1,"recomputed":"8e9fa261657f5f22","sameAsBuild":true,"fileByteIdenticalToBuildCopy":true,"qualificationsInFile":true},"labels":{"build":2,"standardAtBuild":"d0f9945acba80cad","activeAfterRuns":"d0f9945acba80cad","standardFiles":1,"recomputed":"d0f9945acba80cad","sameAsBuild":true,"fileByteIdenticalToBuildCopy":true,"qualificationsInFile":true},"adhd":{"build":1,"standardAtBuild":"03fcfcea","activeAfterRuns":"03fcfcea922b8e6a","standardFiles":1,"recomputed":"03fcfcea922b8e6a","sameAsBuild":true,"fileByteIdenticalToBuildCopy":null,"qualificationsInFile":false}}

Meter total at report time: $5.9280.

## Test 5: consistency (10 tasks x 3 runs per arm, Sonnet 5.5 writer)

### claims

outputs: atelier 30 (0 without text; states {"NEEDS_REVIEW":30}), plain 30 (0 without text)

| rule (check.mjs) | atelier held | plain (method) held | atelier - plain, 95% interval | plain (method + examples) held | atelier - plain+examples, 95% interval |
|---|---|---|---|---|---|
| R1 the five sections, in order | 30/30 | 0/30 | 100.0% (100.0% to 100.0%) | 30/30 | 0.0% (0.0% to 0.0%) |
| R2 every fact cites a document in the file | 30/30 | 1/30 | 96.7% (90.2% to 103.1%) | 28/30 | 6.7% (-2.3% to 15.6%) |
| R2b a citation names a document that is not in the file | 30/30 | 2/30 | 93.3% (84.4% to 102.3%) | 29/30 | 3.3% (-3.1% to 9.8%) |
| R3 the coverage conclusion cites the policy clause | 30/30 | 0/30 | 100.0% (100.0% to 100.0%) | 29/30 | 3.3% (-3.1% to 9.8%) |
| R3b exclusion 7.1 is addressed on a theft | 30/30 | 15/30 | 50.0% (32.1% to 67.9%) | 30/30 | 0.0% (0.0% to 0.0%) |
| R3c the clause the loss falls under (4.2) | 30/30 | 13/30 | 56.7% (38.9% to 74.4%) | 29/30 | 3.3% (-3.1% to 9.8%) |
| R5 the reserve equals the invoices | 30/30 | 17/30 | 43.3% (25.6% to 61.1%) | 30/30 | 0.0% (0.0% to 0.0%) |
| R5b no reserve on a declined claim | 30/30 | 29/30 | 3.3% (-3.1% to 9.8%) | 30/30 | 0.0% (0.0% to 0.0%) |
| R8* (re-read) a figure R8 names that is in no material file | 30/30 | 9/30 | 70.0% (53.6% to 86.4%) | 29/30 | 3.3% (-3.1% to 9.8%) |
| R8 figure(s) the file does not give | 29/30 | 0/30 | 96.7% (90.2% to 103.1%) | 1/30 | 93.3% (84.2% to 102.4%) |
| R8b a date the file does not give | 30/30 | 25/30 | 16.7% (3.3% to 30.0%) | 30/30 | 0.0% (0.0% to 0.0%) |
| **every oracle rule held** | 29/30 | 0/30 | 96.7% (90.2% to 103.1%) | 1/30 | 93.3% (84.2% to 102.4%) |

Rules not listed held in every output of every arm. R8* is the study's re-read, not the oracle, and is left out of the every-rule row. Intervals are the normal approximation; a bound past 100% is its artefact. Cost: atelier $0.663, plain $0.860, plain + examples $0.772.

### labels

outputs: atelier 30 (0 without text; states {"NEEDS_REVIEW":30}), plain 30 (0 without text)

| rule (check.mjs) | atelier held | plain (method) held | atelier - plain, 95% interval | plain (method + examples) held | atelier - plain+examples, 95% interval |
|---|---|---|---|---|---|
| R17 evidence is copied from the transcript | 30/30 | 24/30 | 20.0% (5.7% to 34.3%) | 30/30 | 0.0% (0.0% to 0.0%) |
| **every oracle rule held** | 30/30 | 24/30 | 20.0% (5.7% to 34.3%) | 30/30 | 0.0% (0.0% to 0.0%) |

Rules not listed held in every output of every arm. R8* is the study's re-read, not the oracle, and is left out of the every-rule row. Intervals are the normal approximation; a bound past 100% is its artefact. Cost: atelier $0.583, plain $0.314, plain + examples $0.385.

### i-have-adhd (code-decided rules only)

outputs: atelier 30 (0 without text), plain 30

| rule | check | atelier held | plain held | difference | 95% interval |
|---|---|---|---|---|---|
| FORMAT: What an assistant reply holds. | undefined | 30/30 | 30/30 | 0.0% | 0.0% to 0.0% |
| x12: No preamble, no recap, no closing pleasantries: start with the answer  | CHECK | 30/30 | 30/30 | 0.0% | 0.0% to 0.0% |
| x7: Restate where things stand every turn, for example "Step 3 of 5 done:  | CHECK | 23/30 | 0/30 | 76.7% | 61.5% to 91.8% |

Not scored (judgement, no check of code): 6 rule(s). Cost: atelier $0.235, plain $0.412.


Whole output with R8 read against the material (R8* in place of R8, every other oracle rule as is), claims: atelier
30/30, plain (method) 0/30, plain (method + examples) 25/30; atelier minus method + examples 16.7% (3.3% to 30.0%).

i-have-adhd, what the one code-decided difference is: the written check of x7 ("restate where things stand every
turn") passes when a reply carries a progress line. The Atelier arm wrote one in 23 of 30 replies, the pasted SKILL.md
in 2 of 30; on the direct-answer and casual-message cases the Atelier arm wrote "Step 1 of 1 done" in 4 of 6 replies
and the pasted SKILL.md in 0 of 6. The evals' own criterion for casual-message is "does not manufacture a task or
numbered workflow", so the 76.7-point "hold" on x7 is at least in part a harm, and is not counted as a gain. The six
rules no code checks (lead with the action, number the steps, one next action, tangents, time estimates, visible wins)
were not scored: no judge was run, by design of this study.

## Notes on the arms and the instruments

- The plan's second arm is the model with the method as its system prompt. A third arm was added for claims and labels:
  the method and the owner's finished examples pasted as the system prompt, which is what Atelier serves the writer,
  without its checks. Against it the per-rule differences are within noise on every rule except the oracle's R8.
- The oracle's R8 counts the policy number (CC-1370) and the police report reference (CR/2026/4130) as figures the file
  does not give; both are in the file. The examples arm quotes the policy number or the report reference in 29 of 30 memos,
  the Atelier arm in 1, so R8 alone separates those two arms. The Atelier arm's one R8 fail (t6 r1, 4208) is the incident report's
  reference, IR/2026/4208, which is in the file. R8* is the study's re-read of the figures R8 names against the material
  text; it is reported beside R8 and never replaces it in the oracle rows.
- Every Atelier run on every fixture ended NEEDS_REVIEW: none BLOCKED, none VERIFIED (90 of 90).
- `costUsd` on `invoke --json` was below the meter's booking for the same calls on claims ($0.663 against $0.684):
  the claim reader's calls are not all on the run's own cost line.
- In some runs the claim reader degraded to the pattern check after returning no list of specifics; the certificate
  said so (one of the instruments in the list above).
- The first claims build ran before the meter read compressed responses: its 21 calls are on `calls.jsonl` with no
  usage, so it is unmetered (about $0.05 by the other two builds). The dated id `claude-haiku-4-5-20251001` was priced
  at $0 until the verify pass, and `lib.mjs` re-prices every call from its usage, so the totals here include it.
- The challenge asks for five builds a fixture; this study ran three. Test 10 (another person) and the
  audit-label bound of test 12 were not run: the first needs a second person, the second the owner's labels.
