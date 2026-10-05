# Pre-registration (draft): under strict delivery, is anything that breaks a required rule delivered?

**Status:** DRAFT, not sealed. Sealed by the tester with a public commit of this file and the request file's hash
before the first run. [Decision 0012](../docs/decisions/0012-the-closing-rules.md), claim B.

## The claim, and its edges

`atelier invoke --strict` delivers an output only when its verdict is conformant: every REQUIRED rule that has a
measurement holds, no invented claim is delivered, nothing is copied. A draft that fails is written again, and what
still fails is refused with its reasons and exit code 3.

- **In scope:** the CLI under `--strict` (or a release set to `delivery=strict`).
- **Out of scope, and said in every sentence:** the default delivery of 1.x (the output with its verdict, exit 0);
  `--allow-nonconformant`; the MCP server, where `atelier_verify` advises and cannot stop a client; the Claude Code
  plug-in, whose Stop hook checks the reply and sends it back once for the spans that break a rule, and then lets
  the turn end.
- **What is guaranteed is what is measured.** A REQUIRED rule written in prose with no measurement is outside the
  claim. The tester lists such rules for each skill before the run, and the audit does not count them.

## Material

At least 120 requests written by someone who is not the builder, for at least two skills (one that writes, one that
answers), each built from its own corpus and ratified by its owner. A pilot of 20 other requests is run first, and
its refusal rate is recorded before the test requests are opened.

## Endpoints

| | Endpoint | Design | Pass |
|---|---|---|---|
| R1 | nothing nonconformant is delivered | every delivered output audited by a person against the measured REQUIRED rules (`harness/strict-delivery.mjs` writes them to one file); and no delivered output that the run's own verdict called not conformant | 0 audited failures (95% upper bound 2.5% at 120) |
| R2 | it still delivers | refusals over runs that completed | upper 95% bound under the bar sealed here after the pilot, and never above 15% |
| R3 | spread | 20 requests × 8 repetitions, Atelier strict against pasted examples; between-repetition SD of the counted metrics | Atelier's SD at most 0.70 of pasted's, 95% upper bound under 1.0 |
| R4 | long sessions | 20 ten-turn sessions through `invoke --strict`, each turn its own run with the session so far as material | slope of REQUIRED misses delivered: 0; slope of flagged specifics, 95% upper bound under 0.2 a turn |

**PASS:** R1 and R2 hold. R3 and R4 are reported with their own sentences and do not change R1's.

## Sentences

- **PASS:** "In [n] sealed requests through the CLI under strict delivery, no delivered output broke a measured
  required rule in a person's audit (95% upper bound [x]%), and Atelier refused [y]%."
- **R3 fails alone:** the PASS sentence, then "Across repeats it varied as much as pasted examples on these metrics."
- **FAIL:** "[Endpoint] failed: [estimate] against [threshold]."
- **UNRESOLVED:** "The delivery test did not complete: [cause]. It is closed without a result."

## Limits

A guarantee about measured rules is as wide as the measurements. Two skills, one model. A refusal is a safe failure
and still a failure to the person waiting: R2 exists so that "nothing bad was delivered" cannot be bought by
delivering nothing.
