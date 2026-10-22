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

