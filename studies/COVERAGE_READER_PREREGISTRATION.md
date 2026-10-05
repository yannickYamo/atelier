# Pre-registration (draft): does the coverage reading see a part of the request the reply left out?

**Status:** DRAFT, not sealed. Sealed by a public commit of this file and the task file's hash before the first
model call.

## The question

Under strict delivery a small model reads the request for what it explicitly asks, and the reply for whether it gives
each part (`core/loop/context-judge.ts`, `covers`). A part must be quoted from the request, and a part read as given
must quote the reply. When a part is missing the reply is written once more with those parts named. The reading is
shown on the panel as a monitor. This measures it before it is relied on
([decision 0003](../docs/decisions/0003-authority-by-measurement.md)).

## Material

At least 60 requests that ask for two to five named parts, written by someone who is not the builder, each with the
request's own words for every part (`harness/coverage-qualification.mjs` checks they are).

- **Full:** a writer model's reply giving every part. A part read as missing is a false alarm.
- **Omitted:** the same reply written again with one part left out, the part fixed by the task's position before any
  reply exists. Reading that part as given is a miss. A person confirms, on **every** omitted reply, that the part
  is really gone (`omissions-for-review.md`); one that still gives the part is rejected and reported apart. Until a
  person has been through them the verdict is UNRESOLVED.

## Bars

| Reading | Bar |
|---|---|
| Sensitivity: omitted parts read as missing | at least 0.85, lower end of the 95% interval at 0.75 or above |
| False alarms: parts of full replies read as missing | at most 0.10 |
| Enough | at least 40 omissions a person confirmed |
| Complete | at most one reading in twenty failed or unread; otherwise UNRESOLVED |

A part the reader did not list, or marked unclear, counts against sensitivity.

## What changes with the result

- **PASS:** the reading keeps its place in strict delivery (one completion draft) and is listed as qualified on this
  population. It still decides no verdict.
- **FAIL:** the completion draft is removed from strict delivery; the reading stays on the panel as a monitor, with
  this result beside it.
