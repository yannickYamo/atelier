## A1: build 1 in a fresh data folder, builds 2 to 5 and then one reworded step in one data folder (a copy of build 1's)

| fixture | standard hashes (1, 2 to 5) | distinct | rebuild cost | requirements before / after the reword | changed by the reword | latitude kept |
|---|---|---|---|---|---|---|
| claims | 15ff9349666bb38a, 15ff9349666bb38a, 15ff9349666bb38a, 15ff9349666bb38a, 15ff9349666bb38a | 1 | see spend | 15 / 15 | x7: reworded step | true |
| labels | 9de6ca6a4326ee0e, 9de6ca6a4326ee0e, 9de6ca6a4326ee0e, 9de6ca6a4326ee0e, 9de6ca6a4326ee0e | 1 | see spend | 41 / 41 | x7: reworded step (measurement) | true |

### Not A1: the same inputs built from scratch, five fresh data folders

| fixture | standard hashes | distinct | requirements | latitude |
|---|---|---|---|---|
| claims | 15ff9349666bb38a, c13c04ae69b795b8, 2250f2e120335eda, 31c56e2e69584612, ec5470ccc9717938 | 5 | 15, 15, 15, 15, 14 | STRICT, STRICT, STRICT, STRICT, STRICT |
| labels | 9de6ca6a4326ee0e, acfc42101c17fa82, 3465622ff74c1ee9, a4ca9a968994cf54, dab58fde5ba24d8b | 5 | 41, 41, 41, 41, 41 | STRICT, STRICT, STRICT, STRICT, STRICT |

claims: against build 1, build 2: 5 difference(s) ("Then a Facts section. Every fact cites the documen" measurement; "Then a Coverage analysis section. The coverage con" measurement; "Then a Decision section: covered or not covered, a" materiality+measurement+obligation; "End with a Reserve section. The reserve equals the" measurement; "Take every date, name and figure from the file: ad" measurement). build 3: 6 difference(s) ("Then a Facts section. Every fact cites the documen" measurement; "Then a Coverage analysis section. The coverage con" measurement; "Then a Decision section: covered or not covered, a" materiality+measurement+obligation; "End with a Reserve section. The reserve equals the" measurement; "Never speculate about the insured's intent or hone" measurement+obligation; "Take every date, name and figure from the file: ad" measurement). build 4: 5 difference(s) ("Then a Facts section. Every fact cites the documen" materiality+measurement; "Then a Coverage analysis section. The coverage con" measurement+obligation; "End with a Reserve section. The reserve equals the" measurement; "Never speculate about the insured's intent or hone" measurement+obligation; "Take every date, name and figure from the file: ad" measurement). build 5: 6 difference(s) ("Then a Facts section. Every fact cites the documen" measurement; "Then a Coverage analysis section. The coverage con" measurement; "Then a Decision section: covered or not covered, a" measurement+obligation; "End with a Reserve section. The reserve equals the" measurement; "Take every date, name and figure from the file: ad" materiality+measurement+obligation; "Every figure in the work is one the request or the" missing (in build 1)).
labels: against build 1, build 2: 14 difference(s) ("Every category in a label is one of the 39 categor" materiality+measurement; "Every flagged category carries a timecode span, st" measurement; "Every flagged category carries a risk level: Low, " measurement; "A clip labelled "Firearms – depiction" or "Firearm" measurement; "A clip with no flagged category is labelled "Floor" measurement; "Every flagged category carries evidence: the words" materiality+measurement+obligation; ...). build 3: 14 difference(s) ("Every category in a label is one of the 39 categor" measurement; "Every flagged category carries a timecode span, st" measurement; "Every flagged category carries a risk level: Low, " materiality+measurement; "A clip labelled "Firearms – depiction" or "Firearm" measurement; "A clip with no flagged category is labelled "Floor" measurement; "Every flagged category carries evidence: the words" materiality+measurement+obligation; ...). build 4: 14 difference(s) ("Every category in a label is one of the 39 categor" materiality+measurement; "Every flagged category carries a timecode span, st" measurement; "Every flagged category carries a risk level: Low, " measurement; "A clip labelled "Firearms – depiction" or "Firearm" measurement; "A clip with no flagged category is labelled "Floor" measurement; "Every flagged category carries evidence: the words" materiality+measurement; ...). build 5: 14 difference(s) ("Every category in a label is one of the 39 categor" measurement; "Every flagged category carries a timecode span, st" materiality+measurement; "Every flagged category carries a risk level: Low, " measurement; "A clip labelled "Firearms – depiction" or "Firearm" measurement; "A clip with no flagged category is labelled "Floor" measurement; "Every flagged category carries evidence: the words" materiality+measurement; ...).

## A2 and A3: held-out goldens and planted defects (build 1 of each fixture, material bound)

| fixture | defect | oracle finds it | its step (method) | named by its step | with passage | its check enforced | record state |
|---|---|---|---|---|---|---|---|
| claims | date | yes | 8 | no | no | - | NEEDS_REVIEW |
| claims | exclusion | yes | 3 | no | no | - | NEEDS_REVIEW |
| claims | reserve | yes | 5 | yes (x5) | yes | no (reports) | NEEDS_REVIEW |
| claims | speculation | yes | 7 | yes (x7) | yes | yes | BLOCKED |
| claims | uncited | yes | 2 | yes (x2) | yes | no (reports) | NEEDS_REVIEW |
| labels | firearms-floor | yes | 5 | yes (x5) | yes | no (reports) | BLOCKED |
| labels | high | yes | 4 | no | no | - | NEEDS_REVIEW |
| labels | paraphrase | yes | 17 | yes (x17) | yes | no (reports) | NEEDS_REVIEW |
| labels | span | yes | 12 | yes (x12) | yes | yes | BLOCKED |
| labels | taxonomy | yes | 1 | no | no | - | NEEDS_REVIEW |

| fixture | named by its own step | with passage | blocked by its own step | held-out goldens (state) |
|---|---|---|---|---|
| claims | 3 of 5 | 3 | 1 | e10: NEEDS_REVIEW |
| labels | 3 of 5 | 3 | 1 | e12: NEEDS_REVIEW |

On 2026-10-21 (build 2, the build the later tests used): claims named 5 of 5 with passage, blocked 2; labels named 3, blocked 1; goldens: claims 0 of 10 blocked, labels 10 of 12 blocked (copying check).

## A4: delivery (Atelier arm, each run's own record)

| fixture | outputs | delivered | states | latitude | accepted unmeasured | head on every output (A8) |
|---|---|---|---|---|---|---|
| claims | 30 | 0 | {"NEEDS_REVIEW":30} | STRICT | none | 30 full + 0 ERROR heads of 30 |
| labels | 30 | 0 | {"NEEDS_REVIEW":30} | STRICT | none | 30 full + 0 ERROR heads of 30 |
| adhd | 30 | 30 | {"NEEDS_REVIEW":30} | CREATIVE | x1, x3, x4, x5, x7, x12 | 30 full + 0 ERROR heads of 30 |

claims, what sent a run to review: x1 PARTLY_CHECKED: Open with a Summary section: one paragraph on who, what, whe (30); x4 NOT_MACHINE_CHECKABLE: Then a Decision section: covered or not covered, and under w (30); x6 NOT_MACHINE_CHECKABLE: Never speculate about the insured's intent or honesty. (30); specifics PARTLY_CHECKED: Every specific in the work is found in what you supplied (22).

labels, what sent a run to review: x1 PARTLY_CHECKED: Every category in a label is one of the 39 categories of the (30); x3 PARTLY_CHECKED: Every flagged category carries a risk level: Low, Medium or  (30); x4 NOT_MACHINE_CHECKABLE: "High" risk requires an explicit depiction in the clip: a de (30); x7 PARTLY_CHECKED: Every flagged category carries evidence: the words of the tr (30); x8 NOT_MACHINE_CHECKABLE: "Violence – graphic" requires described injury or blood; a s (30); x9 NOT_MACHINE_CHECKABLE: "Language – strong" requires a word of the strong list in th (30); x10 NOT_MACHINE_CHECKABLE: A label carries no category the transcript does not support  (30); x12 PARTLY_CHECKED: A span's end is after its start, and no span runs past the d (30); x13 NOT_MACHINE_CHECKABLE: Where the same act is both "Violence" and "Dangerous acts",  (30); x14 NOT_MACHINE_CHECKABLE: A news report of a disaster is "Disaster – news", Medium at  (30); x15 NOT_MACHINE_CHECKABLE: A reference to alcohol in passing is "Alcohol – reference",  (30); x16 PARTLY_CHECKED: Numbers in a span are seconds and minutes only: no frame cou (30); specifics PARTLY_CHECKED: Every specific in the work is found in what you supplied (18).

adhd, what sent a run to review: specifics NOT_MACHINE_CHECKABLE: Every specific in the work is found in what you supplied (30).

## A4 and A5: rules held, by arm (domain check.mjs; i-have-adhd by verify)

### claims

outputs: atelier 30 (0 without text; states {"NEEDS_REVIEW":30}), plain 30 (0 without text)

| rule (check.mjs) | atelier held | plain (method) held | atelier - plain, 95% interval | plain (method + examples) held | atelier - plain+examples, 95% interval |
|---|---|---|---|---|---|
| R1 the five sections, in order | 30/30 | 0/30 | 100.0% (100.0% to 100.0%) | 30/30 | 0.0% (0.0% to 0.0%) |
| R2 every fact cites a document in the file | 30/30 | 2/30 | 93.3% (84.4% to 102.3%) | 25/30 | 16.7% (3.3% to 30.0%) |
| R2b a citation names a document that is not in the file | 30/30 | 0/30 | 100.0% (100.0% to 100.0%) | 30/30 | 0.0% (0.0% to 0.0%) |
| R3 the coverage conclusion cites the policy clause | 30/30 | 1/30 | 96.7% (90.2% to 103.1%) | 28/30 | 6.7% (-2.3% to 15.6%) |
| R3b exclusion 7.1 is addressed on a theft | 30/30 | 14/30 | 53.3% (35.5% to 71.2%) | 30/30 | 0.0% (0.0% to 0.0%) |
| R3c the clause the loss falls under (4.2) | 30/30 | 9/30 | 70.0% (53.6% to 86.4%) | 28/30 | 6.7% (-2.3% to 15.6%) |
| R5 the reserve equals the invoices | 29/30 | 10/30 | 63.3% (45.3% to 81.4%) | 30/30 | -3.3% (-9.8% to 3.1%) |
| R8* (re-read) a figure R8 names that is in no material file | 30/30 | 9/30 | 70.0% (53.6% to 86.4%) | 21/30 | 30.0% (13.6% to 46.4%) |
| R8 figure(s) the file does not give | 30/30 | 9/30 | 70.0% (53.6% to 86.4%) | 21/30 | 30.0% (13.6% to 46.4%) |
| R8b a date the file does not give | 30/30 | 25/30 | 16.7% (3.3% to 30.0%) | 28/30 | 6.7% (-2.3% to 15.6%) |
| **every oracle rule held** | 29/30 | 0/30 | 96.7% (90.2% to 103.1%) | 18/30 | 36.7% (18.0% to 55.3%) |

Rules not listed held in every output of every arm. R8* is the study's re-read, not the oracle, and is left out of the every-rule row. Intervals are the normal approximation; a bound past 100% is its artefact. Cost: atelier $0.740, plain $0.865, plain + examples $0.874.

### labels

outputs: atelier 30 (0 without text; states {"NEEDS_REVIEW":30}), plain 30 (0 without text)

| rule (check.mjs) | atelier held | plain (method) held | atelier - plain, 95% interval | plain (method + examples) held | atelier - plain+examples, 95% interval |
|---|---|---|---|---|---|
| R17 evidence is copied from the transcript | 30/30 | 27/30 | 10.0% (-0.7% to 20.7%) | 30/30 | 0.0% (0.0% to 0.0%) |
| R7 every flagged category carries evidence | 30/30 | 28/30 | 6.7% (-2.3% to 15.6%) | 30/30 | 0.0% (0.0% to 0.0%) |
| **every oracle rule held** | 30/30 | 25/30 | 16.7% (3.3% to 30.0%) | 30/30 | 0.0% (0.0% to 0.0%) |

Rules not listed held in every output of every arm. R8* is the study's re-read, not the oracle, and is left out of the every-rule row. Intervals are the normal approximation; a bound past 100% is its artefact. Cost: atelier $0.563, plain $0.317, plain + examples $0.440.

Progress lines (study's count): atelier 2/30 (casual and direct-answer cases 0/6); plain 3/30 (casual and direct-answer cases 0/6).

### i-have-adhd (code-decided rules only)

outputs: atelier 30 (0 without text), plain 30

| rule | check | atelier held | plain held | difference | 95% interval |
|---|---|---|---|---|---|
| FORMAT: What an assistant reply holds. | undefined | 30/30 | 30/30 | 0.0% | 0.0% to 0.0% |
| x10: No preamble, no recap, no closing pleasantries: do not open with thing | CHECK | 30/30 | 30/30 | 0.0% | 0.0% to 0.0% |
| x11: Before sending, delete hedging adverbs that add no information, keepin | CHECK | 26/30 | 27/30 | -3.3% | -19.6% to 12.9% |

Not scored (judgement, no check of code): 6 rule(s). Cost: atelier $0.238, plain $0.418.


## A6 and the hook (claims build 1)

| event | exit | seconds | stderr (first line) |
|---|---|---|---|
| write:speculation | 2 | 0.88 | atelier: this breaks 1 required rule(s) of the "claims" standard. Rewrite only what each names, keep everything else as it is: |
| stop:speculation | 2 | 0.91 | atelier: this breaks 1 required rule(s) of the "claims" standard. Rewrite only what each names, keep everything else as it is: |
| write:uncited | 0 | 1.18 |  |
| stop:uncited | 0 | 1.26 |  |
| write:reserve | 0 | 1.21 |  |
| stop:reserve | 0 | 1.26 |  |
| write:golden-e01 | 0 | 1.23 |  |
| write:heldout-e10 | 0 | 1.3 |  |
| not-json | 0 | 0.22 | atelier: nothing to check in this hook event (no written content, no file at its path, no assistant text in the transcript) |

## A7: repair on the five claims defects (claims build 1, material bound)

| defect | oracle before | oracle after | fixed | state after | material figures lost | sentences added / dropped |
|---|---|---|---|---|---|---|
| e01.date.md | R8c the date cited to the report is the report's date | R8c the date cited to the report is the report's date | no | NEEDS_REVIEW | 0 | 0 / 0 |
| e01.exclusion.md | R3b exclusion 7.1 is addressed on a theft | R3b exclusion 7.1 is addressed on a theft | no | NEEDS_REVIEW | 0 | 0 / 0 |
| e01.reserve.md | R5 the reserve equals the invoices | R5 the reserve equals the invoices | no | NEEDS_REVIEW | 0 | 0 / 0 |
| e01.speculation.md | R7 never "fraud", "scam", "liar" or "suspicious" | R7 never "fraud", "scam", "liar" or "suspicious" | no | BLOCKED | 0 | 0 / 0 |
| e01.uncited.md | R2 every fact cites a document in the file | R2 every fact cites a document in the file | no | NEEDS_REVIEW | 0 | 0 / 0 |

## C: latitude reading, 30 cases by 5 draws (claude-haiku-5-5)

Right in at least 4 of 5 draws: 30 of 30 (STRICT 10, GROUNDED 10, CREATIVE 10); a STRICT case read CREATIVE: 0 draw(s); floors: 0; cost $0.0167. Wrong: none.

## Spend (meter)

| step | calls | USD |
|---|---|---|
| build:adhd | 10 | 0.0295 |
| build:claims | 144 | 0.7137 |
| build:labels | 179 | 0.5721 |
| grounding:with material | 2 | 0.0078 |
| repair:e01.speculation.md | 3 | 0.0048 |
| t5:adhd:atelier | 242 | 0.2375 |
| t5:adhd:plain | 30 | 0.4179 |
| t5:claims:atelier | 236 | 0.7401 |
| t5:claims:plain | 31 | 0.8649 |
| t5:claims:plainx | 30 | 0.8742 |
| t5:labels:atelier | 252 | 0.5628 |
| t5:labels:plain | 30 | 0.3167 |
| t5:labels:plainx | 31 | 0.4402 |
| testC:latitude | 151 | 0.0167 |
| verify:claims | 12 | 0.0759 |
| verify:labels | 12 | 0.0565 |
| **total** | | **5.9313** |
