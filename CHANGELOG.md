# Changelog

Notable changes to Atelier. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This project is pre-1.0. **Until 1.0, a minor version may change the on-disk state format under
`$ATELIER_DATA`.** A standard already minted is content-addressed and readable across such a change;
a run in progress may not be.

## [Unreleased]

### Fixed

- **A build could compile a standard the user never ratified.** The run in flight was per-project;
  the files it produced were not. `pending-standard.json` and nine other working files sat at the
  store root, so two projects sharing one store overwrote each other's pending standard and `build`
  in one project installed — and stamped as ratified — the standard the other had just closed.
  Working files now live under `runs/<project>/`, keyed exactly as the session is, and `build`
  refuses a pending standard whose hash is not the one this run ratified. Files left at the root by
  an older version are adopted only when the store holds a single run, which is the one case where
  their owner is unambiguous.
- **`--skill ../../elsewhere` read from, and wrote to, a directory outside the store.** `build`
  normalised names; the read-side commands (`inspect`, `history`, `rollback`, `feedback`, and
  eleven others) joined `--skill` onto `skills/` as given. Every `--skill` is now validated against
  the same rule `build --name` applies, refused rather than normalised, and the store layout itself
  rejects a name that would leave `skills/`.
- **A rule the person typed was silently dropped.** `add` numbered rules from the length of
  `decided`; a batch `ADD` numbered from a counter that restarted at 1 on every call; the front door
  numbered from the model's list position. All three minted `x1`, and `ratify-close` keys the
  standard by id, so the later rule replaced the earlier one while the CLI reported "2 kept". One
  allocator now hands out the successor of the highest `x<n>` anywhere in the run.
- **After its first build, a project was a dead end; `abort` made it permanent.** Adding a rule after
  `build` and closing again was refused as STANDARD_MUTATED with the advice to `abort`; `abort`
  marked the run terminal and left it in place, and nothing ever started a new run. Closing again
  now mints a version that records what it supersedes (and requires `--reason`, as every
  supersession does), `RATIFIED -> RATIFIED` is a legal transition for that purpose, and `abort`
  archives the session under `sessions/aborted/` so the next command starts clean. `build` also
  advances the run before it writes anything: a refused build used to install the skill and move the
  active pointer, then exit 1.

- **The skill emitted its own internals into the user's deliverable.** Example bodies were rendered
  with markdown headings (`# p6`, `## How the author did it`) and served under another heading.
  Served to a model as context, a heading is not a label — it is a document structure, and the model
  continued it: the answer finished and the skill's requirement text was appended underneath. Measured
  on 74 generations of a blind study, 31 outputs carried a literal `# pN` line and 10 reproduced a
  served example verbatim; the arm carrying one extra example did it 59% of the time against 29%.
  The framing sentence said "these are instances, not instructions", which settles AUTHORITY and says
  nothing about OUTPUT OWNERSHIP. Labels are now bracketed, the block is fenced with explicit start
  and end markers, and it states that the deliverable begins after it. Zero leaks in 8 live
  invocations afterwards.
- **A truncated generation was reported as the model's failure.** The Anthropic adapter read
  `stop_reason` only to interpolate into an error string, so a call the model was never allowed to
  finish surfaced as "the schema was not satisfied". Termination is now a provider-neutral value
  normalised at the adapter boundary, and an incomplete generation raises a typed error carrying it.
  A study built on this misattribution had to withdraw a published figure.
- **The contract runner was provisioned at a fifth of what the work needs.** `maxTokens` was
  hardcoded to 1200 against a measured 6606-token median for a bare answer, and completeness was
  inferred from the text — which cannot distinguish "the model chose not to" from "the model was cut
  off". The budget now comes from a probe that is REFUSED if anything in it was itself truncated: an
  estimate drawn from a censored sample is not a measurement.
- **Discovery discarded a completed run.** Proposals were saved AFTER an optional methodology check
  whose own comment says a failure there "must not cost the taste run that already succeeded and was
  paid for" — and the read that threw sat one line above that try. A stale file left in the global
  store by an unrelated project killed a fresh run after 39 held-out checks and lost all 13
  proposals. What is paid for is now written before anything optional runs.
- **A missing observation became evidence against a rule.** The discovery observer read
  `j?.applicable === true`, which is indistinguishable from a confident NO when the object never
  arrived, and its 500-token budget truncated in practice. Silent false negatives, in the direction
  that under-reports the author's own patterns. The free-text field is bounded at the schema, the
  budget has real headroom, and an unusable answer now refuses.
- **A rule the author wrote was described to the model as one nobody had confirmed.** The
  self-check section asserted "NO ONE HAS CONFIRMED yet" over everything in it, but the section is
  defined by ROLE and confirmation is a different property — so a confirmed PREFERRED requirement
  could be introduced as an unconfirmed guess the model must not act on. The preamble is now derived
  from what is actually in the section.
- **`build` with no standard printed a raw ENOENT and an absolute store path.** It now names both
  routes to a standard, which is what someone who has simply not minted one yet needs.

### Added

- **Corpus provenance is declared or loudly unknown.** `aiAssisted` carries the comment "declared,
  never inferred — it changes what any result means" and was hardcoded to `null`, so the one field
  documented as changing every downstream result was never asked for. Intake now takes
  `--ai-assisted` / `--no-ai-assist` and, absent either, says at seal time what is weaker about an
  undeclared corpus. `null` is kept as a state and never collapsed into `false`.
- **Repair memory is bounded and kept off the executor.** History informs proposals; what was tried
  on the way to a skill is not part of the skill. Under a budget, PROMOTIONS are dropped before
  rejections — a promotion is already encoded in the artifact, a rejection exists nowhere else — and
  nothing is truncated silently.

### Fixed (earlier)

- **The clustered confidence interval was 26% too narrow at n=3**, the smallest sample it admits and
  the most common one. A second t-table keyed from df=3 fell back to t(3)=3.182 where t(2)=4.303 is
  correct, so an interval that honestly crosses zero was reported as a decided direction — and that
  moves `REGRESSED` and `IMPROVED` verdicts. `compare()` compounded it by dividing by one table's
  value and multiplying by another's for the same quantile.
- **The t distribution had two implementations**, byte-identical across ninety lines, one of which
  declared itself the sole owner. They had already drifted at the exact site the project documents as
  repaired. Both now import `core/stats/t.ts`.
- **`assertNotAuthority` did not refuse the claims it exists to refuse.** It ANDed its regex with a
  substring test whose tokens were `this`, `this` and `promotion`, so it fired only on claims
  containing the stopword. Its own test passed vacuously.
- **A PREFERRED requirement could fail the primary endpoint**, which its own documentation forbids,
  because the unscorable-push happened one branch before the REQUIRED guard.
- **`getArchitecture` returned null after any amend of a confirmed rule**, and the caller read that as
  "never persisted" and silently recompiled the default arrangement. Ambiguity now refuses.
- **`--required-n 0`, `--questions abc` and `--cap abc` were silently replaced by defaults**, the same
  `Number(x) || fallback` bug the runtime documents a fix for, reintroduced in a file that imports it.
- **A mistyped command exited 0.** `atelier discovr` printed help and reported success, so a script
  could run a typo in a loop and never learn the work had not happened.
- **The post-build screen asked the author to re-confirm rules they had already decided.** An optional
  standard parameter was passed by neither caller, so the filter fell back to selecting on carrier —
  which is the shape of a TOLERATED component, not an unconfirmed prohibition.
- A regex alternative that could never match (`\b` is defined over ASCII word characters, so a CJK
  term inside word boundaries was unreachable rather than supported).

- **A candidate measured worse was authorised for promotion.** `decide()` had no `REGRESSED` branch,
  so a comparison that found the candidate worse fell through to the promotion gates on the same
  terms as one that found it better. `REJECT` was declared in the terminal union and returned from
  nowhere, which is what a missing branch looks like from outside the file.
- **`core/compiler/placement.ts` was a binary file.** A sentinel written as a raw `0x00` rather than
  the escape `'\0'` made `grep -r` skip all 249 lines without saying so, and made the diff
  unrenderable. Same value, two visible characters, and the reason for the sentinel is now written
  down.
- **The plugin told every user to install a package that does not exist** (`atelier-cli`), on
  `SessionStart`, as the first thing a user with a missing binary reads.
- **`npm run typecheck` failed on a clean checkout** while `npm test` was green, because the build
  config excludes `tests/` and vitest does not typecheck. CI's first step was red.

## [0.1.0]

First public release. The pipeline runs end to end: read a corpus, propose candidate requirements
anchored to the spans they came from, rule on each one, mint an immutable `StandardVersion`, compile
it to an installable skill, serve it with the bytes recorded, and improve the implementation under a
frozen standard.

### Added

- **Acquisition** with the corpus sealed by hash, a proposer that never sees what it is scored
  against, multi-vantage discovery, and every candidate carrying a verbatim span or being dropped.
- **Per-requirement ratification** as the only path to authority, on an append-only ledger that
  records what was shown as well as what was decided.
- **Content-addressed identities** for evidence, standard, architecture, skill, runtime binding and
  invocation, with the standard's hash excluding the model.
- **Compilation** to five carriers by a deterministic function of the ratified fields, with the gate
  role derived from authority rather than chosen.
- **Delivery proof** at the byte and at the wire: the served package is re-hashed before spend, and
  the structured-output schema handed to the provider is hashed against the compiled contract.
- **A convergence loop** that improves the implementation under a fixed standard, routes complaints
  to one of four causes, and stops rather than writing a rule the expert has not ratified.
- **A held-out reference test** with two-phase blinding and a side assignment derived from a hash, so
  it is fixed before generation and auditable afterwards.
- **A baseline arm set** as an enum rather than a flag, so a comparison cannot silently omit the arm
  most likely to win, sealed with the pairs by `armSetHash`.
- **`BUILDER_VIEWED`**, the one consumption recordable against the reserve, so a held-out unit the
  builder has read is refused at audit instead of counted clean.
- **Atomic writes** for every persisted file, and a ledger reader that reports a torn tail while
  refusing to read past corruption in the middle.
- **Multi-provider support**: Anthropic and any OpenAI-compatible backend, with five conformance
  probes including one whose pass condition is a thrown error.

### Known limits

- The expert-ratified effectiveness claim is **not established**. See the evidence section of the
  README, including a preregistered null reported unrepaired.
- Autonomous promotion is reachable in code and unreachable in fact: no gate has been earned, so the
  loop routes to a person.
- Behavioural equality across runtime bindings is unshown; only object portability is demonstrated.

[Unreleased]: https://github.com/yannickYamo/atelier/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yannickYamo/atelier/releases/tag/v0.1.0
