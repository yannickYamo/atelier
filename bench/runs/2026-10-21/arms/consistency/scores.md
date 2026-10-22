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

