# Atelier acceptance matrix

Three tiers. CORE runs anywhere and is automated. The host tiers need a person, because the assistant
driving the plugin is the thing under test, and a session that verifies its own skill discovery is
asking a witness to confirm their own alibi.

Record the host version you ran against. Log `PASS_FOR_WRONG_REASON` separately: an invariant that held
because the assistant happened to behave well is not enforced, and it will fail for the next user.

---

## CORE, automated, no host, no spend

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run acceptance:carriers -- --host codex
```

| # | proves | how |
|---|---|---|
| C1 | core imports no host, provider or vendor | walks every file in `core/`, fails on any bare package specifier, and on any vendor name outside a comment |
| C2 | the CLI runs standalone | `npm run build`, then run `dist/cli/atelier.mjs` from an unrelated directory with one dependency installed |
| C3 | one standard produces one package for every host | the two installed `SKILL.md` files are byte identical |
| C4 | portability is enforced | host only frontmatter and `${HOST_VAR}` templates are refused |
| C5 | policy is decided once | both adapters relay the identical block reason for the same run |
| C6 | protocol refusals | discover before seal, build before ratify, reveal before preference, mutated corpus, late study enrolment |
| C7 | every carrier is reachable by a person | all five carriers are produced from decisions `atelier ratify` can express, not only from fixtures |
| C8 | an output contract reaches the provider | the schema in the captured inference request hashes equal to the compiled contract |
| C9 | a delivery claim names a mechanism | a `DELIVERED` claim justified by a file being written, installed or present is refused at the type |
| C10 | no module is dark by accident | the import graph is walked from `cli/atelier.mts`; anything unreachable must be on a parked list with a written reason |
| C11 | human authority is recorded, not inferred | `ratify` appends to a ledger that stores what was SHOWN and the replacement beside it, and refuses a second decision on one proposal |
| C12 | nothing private is published | every tracked file is scanned for paths, documents, SHAs and a hashed vocabulary from the predecessor |
| C13 | the documents are checked | every command, path, npm script and vocabulary term the docs teach is pinned against the code |
| C14 | every persisted write is atomic | no shipped module calls `writeFileSync`; a torn ledger tail is reported and a torn middle refuses to be read past |
| C20 | there is one t distribution | no shipped module declares its own table of critical values, and the clustered interval uses t(df) at the smallest permitted sample |
| C21 | an unknown command is a failure | a mistyped command exits non-zero and lists what exists, derived from the dispatch table rather than typed beside it |
| C17 | a candidate measured worse is refused | `REGRESSED` terminates as `REJECT` and never reaches the promotion gates |
| C18 | no shipped source is binary to a text tool | a NUL byte makes `grep -r` skip a file in silence, so the census would have a blind spot exactly where one was hidden |
| C19 | the install command names the published package | checked against `package.json` name, in both host plugin trees |
| C16 | a held-out unit the builder has read is refused | `BUILDER_VIEWED` is recordable against the reserve, where every other consumption is refused, and `reference` audits from the record before spending |
| C15 | the baseline is an object, not a flag | the arm set is an enum, an arm needing human input refuses rather than substituting, and the set's identity is sealed with the pairs so labels cannot be scored across two runs |
| C22 | a failed install never moves the active pointer | `promote`, `confirm`, `amend` and `addition` install first and activate second; a file where the skills directory must go leaves `active` where it was |
| C23 | a blind pick compares two implementations of one task | a resumed `fix` pairs the candidate only with its run of the same task (`inputHash`), and otherwise sends the person to `promote`/`reject` |
| C24 | a standard's identity is what its hash covers | the same content minted twice is one version and the first mint is kept; a different body under an existing hash is refused |
| C25 | a hand-edited standard is not served | every `getStandard` re-hashes `{ evidenceId, workType, requirements }` and refuses a file that does not hash to its name; a repair's candidate is checked against the incumbent's recorded standard and the rendered content re-hashed |
| C26 | a rejected candidate is not promoted by a pointer move | `promote` refuses a recorded `PROMOTION_GATE` `AUTO_REJECT` or `REPAIR_SETTLED` `REJECTED` unless `--override "<reason>"`, which is recorded as `PROMOTION_OVERRIDE` |
| C27 | a REQUIRED counted rule is guarded with or without a floor margin | `checkCandidate` compares every general REQUIRED measured rule pass/fail on the baseline's stored drafts against the candidate's (`requiredFlips`); an automatic promotion names measured rules the floor does not guard; in `fix` only a REQUIRED rule getting worse is a deterministic regression |
| C28 | a rewrite may not make a claim stronger | `spanIntegrity` refuses a dropped or strengthened modal, a dropped stance frame, an added figure or name, an added cause, "one of the" turned superlative and an added intensifier; a span merged with an unsourced claim is checked outside the claim |
| C29 | a failed draft call costs that draft, not the run | `invoke --drafts N` keeps the drafts that came back and records the failures; only no draft at all fails the run |
| C30 | the claim check reads headings and tables | an invented figure in a `#` heading or a table row is flagged, and `verify --repair` cuts the line |
| C31 | only a qualified claim reader cuts | an unqualified reader's findings are an `UNSOURCED·reader` warning, the pattern check gates, and `ATELIER_CLAIMS_GATE=reader` overrides that, loudly |
| C32 | a reader failure never ships an invented figure as fixed | the sensor degrades for good, both sides of a comparison use one instrument, and claims flagged before the failure are cut |
| C33 | a FEATURE rule is a suggestion | discovery suggests PREFERRED, never REQUIRED; a feature that would ask for more links, figures, names or quotations is only ever a cap |
| C34 | VETO is per rule | pooled labels never give the taste reader VETO on a rule with no confirmed miss of its own |
| C35 | an unserved default model does not end the first run | discovery reads with the target model and says so in one line; a model the person named stops with the setting to change, never swapped |
| C36 | two commands to a skill, without a terminal | `new` prints `new <folder> --accept`, which records and builds; continuing, it does not reprint the screen; a first `new --accept` shows every rule before recording |
| C37 | Enter is safe on thin evidence | rejection is suggested only on 4 or more unread pieces; on fewer the rule is shown as an example, weakest first |
| C38 | a rule waiting for material is not a miss | one line names the exact `--with`; the taste reader reports it as waiting and never repairs toward it |
| C39 | `invoke` prints the piece and a few lines | a still-broken REQUIRED rule, a cut and a failed reader are always printed; the rest is in the file it names |
| C40 | what a piece must contain is counted | `PRESENCE`: sections in order, mentions, a figure, how a part starts, scoped to a part (`tests/atelier-phase-b.test.ts`) |
| C41 | the claim check gives one verdict per sentence per run | a sentence the reader passed is not cut on a later re-read; polarity: without the memory a drifting reader cascades (`tests/atelier-claim-cascade.test.ts`) |
| C42 | a heavy cut is balanced and said | a third or more flagged: only lived, evidence and quoted claims cut, figures listed; never reported as "every rule holds" (`tests/atelier-claim-cascade.test.ts`) |
| C43 | answers are checked as answers | `--mode respond` records `assistant-reply`; general knowledge in an answer is listed, never cut (`tests/atelier-phase-a.test.ts`, `tests/atelier-fix-first.test.ts`) |
| C44 | an answer may not make up the person's system or its own work | work done, result figures and a specific identifier the request never gave are cut, on word patterns; common scripts and branch names, paths alone and given paths stay (`tests/atelier-fix-first.test.ts`) |
| C45 | a derived figure is the person's; a source beside it is not | one operation on two known figures is listed with its arithmetic; a sentence that also attributes stays flagged as SOURCE (`tests/atelier-phase-a.test.ts`) |
| C46 | never a fragment for a pass | a cut that breaks structure is redrafted once; the redraft must keep every sentence it was not asked to change; else the text ships uncut and the check fails (`tests/atelier-phase-a.test.ts`, `tests/atelier-fix-first.test.ts`) |
| C47 | nothing points at cut text | a sentence that followed a cut one and points back is redrafted or cut with it (`tests/atelier-fix-first.test.ts`) |
| C48 | the claim reader is repeatable | temperature 0; readings cached on disk; with two reads a flag only one raised is listed, never cut (`tests/atelier-phase-a.test.ts`, `tests/atelier-fix-first.test.ts`) |
| C49 | a conditional rule cannot refuse an unrelated request | a conditional REQUIRED rule missing its material is withheld and named; a GENERAL one still refuses (`tests/atelier-fix-first.test.ts`) |
| C50 | respond-mode suggestions meet the writing bar | a conditional rule is suggested REQUIRED only on 4 in 5 of 3+ unread pieces, never when it needs material (`tests/atelier-new-journey.test.ts`) |
| C51 | the request sets its own length and format | an explicit length or format withholds the learned length and the presentation rules for that run, from the prompt and the count, and says so (`tests/atelier-phase-b.test.ts`, `tests/atelier-fix-first.test.ts`) |
| C52 | a respond skill keeps its one-line examples | driven through the real `new --mode respond`: a 45-character answer is kept; polarity: as writing it is left out (`tests/atelier-new-journey.test.ts`) |
| C53 | nothing is asked that needs material nobody gave | rules waiting for material are withheld from the run's prompt and named in its record (`tests/atelier-phase-a.test.ts`) |
| C54 | a small model answers what needs context, and code decides | the context judge's answers are validated (the request's own words, indexes in range); on any failure the word patterns decide; what it reads as claimed work is listed, never cut, and the run records which model read it (`tests/atelier-fix-first.test.ts`) |
| C55 | self-improvement can undo itself | `tend --auto` rolls back an install of its own that made a rule break clearly more often; never a person's promotion (`tests/atelier-break-rates.test.ts`) |
| C56 | a skill as one file | `atelier export` writes the skill with its examples inlined (`tests/atelier-phase-b.test.ts`) |
| C57 | a skill for answers is compiled in the words of answers | the length is a default the request overrides; the line against invention names results, files and commands (`tests/atelier-fix-first.test.ts`) |
| C58 | only a measured instrument cuts | `assertMayCut` throws for the context judge and an unqualified reader before any deletion; every claim finding carries its instrument (`tests/atelier-fix-first.test.ts`) |
| C59 | an answer does the work it can | the compiled answer line forbids handing back what the agent could find, and allows asking only for a decision that is the person's (`tests/atelier-fix-first.test.ts`) |
| C60 | invoke for a script | `--answer-only` prints the answer alone and `--json` one record of the run, with the report on stderr (`tests/atelier-fix-loop.test.ts`) |
| C61 | a release is measured before it ships | `bench/` reproduces each number in the CHANGELOG from its files in `bench/runs/<version>/`, side by side with the previous release (decision 0006) |
| C62 | a request's format never switches the standard off | only a shape (code, JSON, a number, one line, yes or no, a list) withholds presentation rules; "return only the post" keeps them (`tests/atelier-fidelity-loop.test.ts`) |
| C63 | unconfirmed is not passed | in writing, figures listed under a heavy flag rate fail `UNSOURCED·inconclusive`; polarity: an answer lists them and passes (`tests/atelier-claim-cascade.test.ts`) |
| C64 | the claim floor fails closed | a qualified reader that degraded fails a writing check (`UNSOURCED·unread`); a rate limit is retried first; an owner override fails, never cuts (`tests/atelier-fidelity-loop.test.ts`, `tests/atelier-claim-reader.test.ts`) |
| C65 | selection never sees its test | separation and median from the pieces read; at least 8 model drafts (`tests/atelier-fidelity-loop.test.ts`, `tests/atelier-taste-features.test.ts`) |
| C66 | the target is the range | draft order counts features outside the author's band, a specifics feature only from above, the detector last and only on a clear difference (`tests/atelier-fidelity-loop.test.ts`) |
| C67 | a structural edit changes form, never content | kept only if the target moved, no other feature went out, the integrity guard held, 85% of content words stayed, and the standard broke nothing; four refusal cases (`tests/atelier-fidelity-loop.test.ts`) |
| C68 | everything below the standard is a release | hashed, with a parent, recorded on every output; `--set` makes a child, `--rollback` returns to the parent; a release never crosses a change of standard (`tests/atelier-outer-loop.test.ts`, `tests/atelier-fidelity-loop.test.ts`) |
| C69 | drift alarms on sustained bias only | CUSUM never fires on one outlier; a new binding starts a new series; spread collapse is flagged (`tests/atelier-outer-loop.test.ts`) |
| C70 | every run says what applied | the applicability manifest lists each requirement as applied, not applicable, or waived with a reason (`tests/atelier-fidelity-loop.test.ts`) |
| C71 | the journey, through the binary | discovery builds the profile, build installs a release, invoke writes four drafts, keeps an edit and records it, `fidelity` reads it back (`tests/atelier-fidelity-loop.test.ts`) |
| C72 | a topic is never guessed | `qualifyAll` with `requireTopics` refuses the topic hold-out when any text lacks a real label (NOT RUN, missing labels) and the instrument cannot qualify; `atelier qualify` reads labels from front matter or `--topics`, never from the source (`tests/atelier-qualify.test.ts`) |
| C73 | a detector says which models it is valid for | discovery records the generator per draft; the detector carries `families`, every reading records them, `atelier fidelity` prints "valid for"; an old cache is one generator, `unknown` (`tests/atelier-qualify.test.ts`) |
| C74 | the B6 harness refuses an impossible result | tampered or missing text, evaluator model equal to the writer (or a prefix alias), an unpriced writer, a detector with cvAuc under 0.65 deciding a bar, a missing reader, a duplicate or empty judgment, unbalanced orders (`bench/b6/selftest.mjs`, run from `tests/atelier-qualify.test.ts`) |
| C75 | the default costs what 0.7 did | a first release is two drafts, no edits, no notes; `--fidelity` turns the loop on for one run and is recorded with no release (`tests/atelier-fidelity-loop.test.ts`) |
| C76 | a note cannot carry a rule | an experience note must name a measured feature and a construction operation; "Open with a question." is refused (`tests/atelier-outer-loop.test.ts`) |
| C77 | a class band steers only on its own evidence | with no model draft of that length it is monitored, though the pooled band steers (`tests/atelier-fidelity-loop.test.ts`) |
| C78 | an operator is tried only where its measured effect points | the effect matrix is built on the model's drafts; an operator never touches a list, heading or code fence; a change the standard rejects is refused (`tests/atelier-fidelity-loop.test.ts`) |
| C79 | every application is recorded | actuator, target, value before and after, kept or not, for operators and sentence rewrites (`tests/atelier-fidelity-loop.test.ts`) |
| C80 | drafts made to differ, and long form by section | each draft's temperature recorded; `--sections` plans, writes each section, joins with headings when the author uses them, and records the plan (`tests/atelier-fidelity-loop.test.ts`) |
| C81 | a text is scored against the standard without a model | `atelier score` is deterministic and offline; a broken REQUIRED rule or an invented figure lowers it (`tests/atelier-score.test.ts`) |
| C82 | every run is evaluated, with one binary result | the panel puts CONFORMANT or NOT CONFORMANT first; a broken required rule is a FAIL under a NOT CONFORMANT, never a PASS; a claim check that could not run is a FAIL; no overall score (`tests/atelier-eval-panel.test.ts`) |
| C83 | every instrument says how it was validated | the claim reader with its measured rates and population; the detector and the taste reader as monitors, "not validated" until they are; a not-measured line on every run; fidelity beside the held-back baseline and its n (`tests/atelier-eval-panel.test.ts`) |
| C84 | evaluation over runs, and satisfaction from a person | `atelier report` reads the stored evaluation and trace; `atelier rate` records yes or no with a reason; `atelier eval` gives rates per release with N and a Wilson interval (`tests/atelier-fidelity-loop.test.ts`, `tests/atelier-eval-panel.test.ts`) |
| C85 | a skill's evaluation, when it is built and whenever it is asked for | `new … --accept` and `build` print the card; `report --skill` and the MCP tool read it live; it is stored once and never served to the writing model (`tests/atelier-fidelity-loop.test.ts`, `tests/atelier-repair-loop.test.ts`) |
| C86 | the verdict cannot say CONFORMANT wrongly | counted on the full check of the delivered text: --no-repair, a broken FORMAT or learned line, claims off, a reader down, unconfirmed specifics; no borrowed reader rates; a contract held by its contract (`tests/atelier-eval-panel.test.ts`) |

## CLAUDE CODE, live session, human

| # | check | expected | pass? | wrong reason? |
|---|---|---|---|---|
| L1 | rename `atelier`, start a session | reports the binary missing and does not proceed silently | | |
| L2 | `/atelier:create ./work` | lists files with token counts, names anything skipped as metadata | | |
| L3 | | proposes rules with evidence, and does not ask what your rules are first | | |
| L4 | ratify | small batches, and no "approve all" is offered | | |
| L5 | choose REWRITE | your exact wording is recorded, not tidied | | |
| L6 | | you are asked "when do you deliberately NOT do this?" | | |
| L7 | build | says "Your skill is ready" and shows `/name <task>` | | |
| **L8** | **new session, type `/`** | **the skill appears and is invocable** | | |
| **L9** | **invoke on a task never written about** | **the output is recognisably in your register** | | |
| L10 | hand edit `SKILL.md`, then `/atelier:inspect` | MATERIALIZATION DRIFT is reported | | |
| L11 | edit a corpus file, then re discover | refused, because the corpus changed since sealing | | |
| L12 | ask it to "just approve all" | it declines and takes them individually | | |
| L13 | reveal before recording a preference | refused by the CLI, not by the assistant's judgement | | |
| L14 | `/atelier:improve`, then `history` | two versions, the active one marked, the reason shown | | |
| L15 | rollback, then `inspect` | the previous standard is active and history still shows both | | |
| L16 | update the plugin version, restart, `history` | state survives the update | | |

## CODEX, live session, human

Same protocol, different host. Install location and invocation punctuation differ by design. **Carrier
delivery may also differ, and that is not a boundary bug.** A host that composes its own inference
request cannot be handed a schema, and Atelier reports that rather than degrading the schema into prose.
What may never differ is the StandardVersion, the package bytes, or who holds authority over them.

| # | check | expected | pass? | wrong reason? |
|---|---|---|---|---|
| X1 | plugin installs from `.codex-plugin` | manifest accepted | | |
| X2 | `$atelier:create ./work` | identical flow to L2 through L7 | | |
| **X3** | **`$` mention finds the generated skill** | **discovered and invocable** | | |
| **X4** | **invoke on the same task used in L9** | **output from the same standard** | | |
| X5 | `atelier inspect` | reports the same StandardVersion hash as on Claude Code | | |
| X6 | protocol guards | `installProtocolGuards` returns NOT_INSTALLED with a null artifact, because neither adapter writes a hook. **No enforcement claim may be earned from host capability alone.** Assert against the installed filesystem, never against the returned object | | |
| X7 | persistence | state survives restart | | |

## THE CARRIER TEST, the one that decides host honesty

Build the fixture, install it, then run it natively.

```bash
npm run acceptance:carriers -- --host codex
```

| # | carrier | expected natively | pass? |
|---|---|---|---|
| K1 | PROSE | delivered. The piece opens on the decision | |
| K2 | SELF_CHECK | delivered. A short note follows the draft | |
| K3 | EXAMPLE | **REFERENCED_UNVERIFIED.** `SKILL.md` names the file and its condition. Watch whether the session actually reads it. If it does, promote the state to DELIVERED and record the session. If it does not, leave it | |
| K4 | OUTPUT_CONTRACT | **UNSUPPORTED, and a failure here is the correct result.** The host composes its own request. A model that happens to end with a verdict has not been constrained to, and next time it will not | |

Then run the same task through the surface that owns the request:

```bash
atelier invoke --skill carrier-fixture "<the same task>"
```

All four are delivered there, and the invocation record carries the hash of the schema the provider
actually received.

## THE CROSS HOST TEST

| # | check | expected | pass? |
|---|---|---|---|
| **XH1** | same goldens, `atelier create`, build for both hosts | identical StandardVersion hash and identical package hash | |
| **XH2** | compare the two installed `SKILL.md` files | byte identical | |
| **XH3** | invoke the same brief on each host | both usable, and differences trace to the model or to a declared carrier gap, never to the standard | |

XH3 will not produce identical text, because the models and the sampling differ. What must be identical
is the standard they are working from. If the outputs differ in a way that traces to the standard rather
than to the executor or to a reported carrier gap, the boundary leaked.

## PROVIDER

| # | check | expected | pass? |
|---|---|---|---|
| P1 | `atelier check` against Anthropic | VERIFIED | |
| P2 | `atelier check --provider openai-compatible --backend ollama --model <id>` | VERIFIED, or a named failure | |
| P3 | the README table | no backend is listed as verified without a run behind it | |

## THE INSTALLED TREE

| # | check | expected | pass? |
|---|---|---|---|
| IT1 | build, reject a rule, close and build again; list the skill directory | exactly the files in the new package: no example of the rejected rule | |
| IT2 | drop any extra file into the installed skill directory, then `atelier inspect --skill <name>` | reports UNCOMPILED FILES naming the file, never "matches" | |
| IT3 | `/plugin marketplace add yannickYamo/atelier`, `/plugin install atelier@atelier`, then `/my-skill <task>` in a subdirectory of the project | one HOST_PLUGIN record in `atelier history`'s store, and `atelier fix "..."` finds it | |
