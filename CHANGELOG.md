# Changelog

Notable changes to Atelier. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This project is pre-1.0. **Until 1.0, a minor version may change the on-disk state format under
`$ATELIER_DATA`.** A standard already minted is content-addressed and readable across such a change;
a run in progress may not be.

## [Unreleased]

### Fixed

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
