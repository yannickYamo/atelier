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
| C16 | a held-out unit the builder has read is refused | `BUILDER_VIEWED` is recordable against the reserve, where every other consumption is refused, and `reference` audits from the record before spending |
| C15 | the baseline is an object, not a flag | the arm set is an enum, an arm needing human input refuses rather than substituting, and the set's identity is sealed with the pairs so labels cannot be scored across two runs |

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
