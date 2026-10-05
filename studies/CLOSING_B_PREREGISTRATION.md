# Pre-registration (draft): under strict delivery, across domains, is anything that breaks a required rule delivered, and is the output repeatable?

**Status:** DRAFT, not sealed. Sealed by the tester with a public commit of this file and the request files' hashes
before the first test run. [Decision 0012](../docs/decisions/0012-the-closing-rules.md), claim B.

## The claim, and its edges

`atelier invoke --strict` delivers an output only when its verdict is conformant: every REQUIRED rule that has a
measurement holds, no invented claim is delivered, nothing is copied. A draft that fails is written again, and what
still fails is refused with its reasons and exit code 3.

- **In scope:** the CLI under `--strict` (or a release set to `delivery=strict`).
- **Out of scope, and said in every sentence:** the default delivery of 1.x; `--allow-nonconformant`; the MCP server,
  where `atelier_verify` advises and cannot stop a client; the Claude Code plug-in, whose Stop hook checks the reply
  and sends it back once, and then lets the turn end.
- **What is guaranteed is what is measured.** A REQUIRED rule written in prose with no measurement is outside the
  claim. The tester lists such rules for each skill before the run, and the audit does not count them.

## Domains

This is the one closing claim that is counted, so it is the one tested across domains. **At least three skills from
three different kinds of work**, at least one that writes and one that answers (for example: blog posts, coding
answers, support replies, contract clauses, financial report sections), each built from its own corpus and ratified
by its owner. **At least 60 sealed requests per skill**, written by someone who is not the builder. The sentence
names the domains tested and claims nothing about any other.

## The pilot

Twenty other requests per skill, run first with `harness/strict-delivery.mjs --pilot`. It reports what was not
delivered **by reason** (a broken rule, an invented claim, unconfirmed specifics, a copied run, a check that could
not run). The R2 bar is sealed after the pilot and before the test requests are opened, and never above 15%.

For a skill that answers, a specific that is not in the task or the material is listed for the reader and is no
reason to refuse; invented work or results are cut. For a skill that writes, a draft with a third or more of its
sentences flagged keeps its specifics as unconfirmed and is refused: that is the floor of published writing, and the
pilot shows how much of the refusal rate it is.

## Endpoints, each with its own verdict

| | Endpoint | Design | Pass |
|---|---|---|---|
| R1 | nothing nonconformant is delivered | every delivered output audited by a person against the measured REQUIRED rules; and no delivered output that the run's own verdict called not conformant | 0 audited failures, in every skill |
| R2 | it still delivers | not delivered over **all** requests: a refusal, and an error that survives two retries, both count | per skill, upper 95% bound under the bar sealed after the pilot |
| R3 | repeatability | 20 requests × 8 repetitions per skill, strict against the same model with the examples pasted; between-repetition SD of counted features that strict delivery does **not** gate (length, sentence and paragraph shape, the steering features), and separately of the gated ones | on the ungated features, Atelier's SD at most 0.80 of pasted's with the 95% upper bound under 1.0, request-level bootstrap |
| R4 | long sessions | 20 ten-turn sessions per answering skill, each turn its own strict run with the session so far as material | REQUIRED misses delivered: 0; slope of flagged specifics per turn, 95% upper bound under 0.2 |

**Claim B PASSES** when R1 and R2 hold for every skill. R3 and R4 have their own sentences, said beside it either way.
**Minimum valid units:** 55 requests per skill after retries.

**Reported, deciding nothing:** the 150 tasks of [claim A](CLOSING_A_PREREGISTRATION.md) run once under `--strict`
with the answering skill, judged with the other arms: quality on the answers delivered, and over all requests with a
refusal scored as a failed answer.

## Sentences

- **PASS:** "In [n] sealed requests across [the domains], through the CLI under strict delivery, no delivered output
  broke a measured required rule in a person's audit, and Atelier delivered [y]% of requests."
- **R3:** "Across repeats, on features strict delivery does not gate, it varied [x]% as much as pasted examples." or
  "... it varied as much as pasted examples."
- **R4:** "Over ten-turn sessions no required rule was missed and flagged specifics did not grow." or what did.
- **FAIL:** "[Endpoint] failed for [skill]: [estimate] against [threshold]."
- **UNRESOLVED:** "The delivery test did not complete: [cause]. It is closed without a result."

## Limits

A guarantee about measured rules is as wide as the measurements. On gated features strict delivery is repeatable by
construction, which is why R3 is read on the ungated ones. A refusal is a safe failure and still a failure to the
person waiting: R2 exists so that "nothing bad was delivered" cannot be bought by delivering nothing.

## What changed before sealing

- Per skill, across at least three domains, 60 requests each: the domain goal of decision 0006 gets its first
  counted test here.
- Availability is over all requests, with errors after two retries counted as not delivered: the first harness left
  errored runs out of the rate.
- Repeatability and long sessions have verdicts and sentences of their own. Repeatability is read on features strict
  delivery does not gate.
- The strict runtime's answer quality is reported here, not as a pass in claim A.
