# Close — the pilot stops at its own gate: ACQUISITION-ONLY

**Preregistration:** `EXTERNAL_EXPERT_PILOT_PREREGISTRATION.md`, sealed by public commit `5202e92`
on 2026-09-02, before discovery read any corpus byte. **Closed:** 2026-09-04, at the stage-1 gate,
before any task, any generation, or any preference label existed. **Spend:** $0.52 of $40
authorised. **The reviewer's 59 endpoint trials were never spent** — which is what the gate was for.

## What happened, in order

1. **Corpus sealed** — hash `8d015a819194c7ba`, 4 pieces (3 course essays + 1 personal journal
   entry), no-AI declared per piece, 4 separate clusters per the builder's declaration. The
   content-blind split put the essays' pieces 01–02 on the proposal side and 03–04 — including the
   cross-genre journal entry — on the held-out side, as computed in the preregistration.
2. **Discovery** proposed 18 rules from 2 pieces; all 18 survived structural validation; 7 recurred
   in held-out work the proposer never saw. Cost $0.52.
3. **Ratification, by the external reviewer** — the first non-builder ratification in this
   repository's history, the step every prior study lacked. The reviewer ruled on all 18 through
   the shipped six-verdict page: **18 kept, 0 rejected — 9 PREFERRED, 3 EXEMPLAR_ONLY, 2 TOLERATED,
   4 INCIDENTAL, 0 REQUIRED.** No boundary answers were offered. Gate question ("does this set
   substantially capture how you write?") — **yes**.
4. **StandardVersion `6c32949758c91780` minted, RATIFIED**, 18 requirements, decision ledger
   recorded; package `reviewer-voice` compiled and installed. That standard is the study's
   deliverable and it is real.

## The gate, evaluated exactly as sealed

| criterion | sealed bar | observed | verdict |
|---|---|---|---|
| rules kept | ≥ 6 | 18 | pass |
| REQUIRED among them | ≥ 2 | **0** | **fail** |
| "substantially captures how I write" | yes | yes | pass |

All three had to hold. **The gate fails, and the study closes ACQUISITION-ONLY**: no stage 2, no
tasks, no generations, no preference claim in either direction.

## Why zero REQUIRED ends it — the substantive point, not a technicality

The reviewer ratified a standard made entirely of preferences, exemplars, tolerances and
incidentals. Compiled, **every one of its 18 rules is *shown* to the model and none *instructs***
— the compiler's own summary line for this standard. Two consequences, both fatal to the endpoint
and both foreseen by the sealed design:

- **T would carry no obligation a baseline lacks.** The moat claim needs ratification-plus-
  compilation to do work a corpus summary cannot; a standard that commands nothing competes on
  vibes, and a null would be uninterpretable between "no moat" and "nothing was enforced."
- **The validity instrument would be undefined.** The known-bad gate (parent §5b) requires tasks
  "where a REQUIRED rule plainly applies." With zero REQUIRED rules those trials cannot be
  constructed, so the endpoint could not even establish that the reviewer can detect the skill
  working — the precondition for reading any other number.

Stopping here is the design functioning, spending $0.52 and one reviewer-hour to avoid spending 59
reviewer-trials on a result that could not have meant anything.

## Observations recorded with the close

- **The reviewer discriminated.** Four of six verdict categories used, in a plausible pattern
  (structural habits PREFERRED; single instances EXEMPLAR_ONLY; roster-and-list tics INCIDENTAL;
  two TOLERATED "don't manufacture this" rulings). This does not look like rubber-stamping — though
  18/18 kept with zero boundary answers is also consistent with leniency, and nothing in this data
  adjudicates between "my voice is genuinely all preference" and "REQUIRED felt too strong to
  click." Both readings are recorded; neither is claimed.
- **A voice with no obligations is a finding about the product's assumption space.** Atelier's
  materiality vocabulary assumes experts hold some rules as obligations. The first external expert
  to use it held none. Whether that generalises is exactly the kind of question the parent design
  exists to reach.
- **Deviation (model):** the default proposer `claude-fable-5` refused the profiling call twice;
  the proposer was pinned to `claude-opus-5` by supported override, recorded in the binding.
- **Instrument defect (filed):** the chain computes per-rule, per-piece held-out observations and
  the CLI persists only the aggregate, so the preregistration's per-rule cross-genre flag could not
  be produced from the recorded run and was omitted, disclosed at the time in the intake ledger.
  Fix: persist `chain.hypotheses[].golden`.

## What this licenses, per the sealed claims ceiling

- Licensed: **"4 mixed-genre pieces were not enough for this chain to reach its endpoint"** — the
  corpus produced a ratified, preference-only standard, not a testable obligation-bearing one.
- Not licensed: anything about the moat (the parent `EXTERNAL_EXPERT_B2_PREREGISTRATION.md` stays
  sealed and unexecuted, awaiting its 8–12 one-work-type corpus), anything about experts in
  general, and any reading of this close as a preference result — no preference was measured.
- The governance claim is untouched and, once again, exercised: the standard's authority sat with
  its owner end to end — an external human ratified every rule, the machine proposed and never
  decided, and the whole chain is auditable from the store.

## If there is a next attempt

A next attempt is a **new preregistration**, not a reopening: re-asking this reviewer for REQUIRED
rulings after watching this gate fail would be result-shopping, and is forbidden to the builder and
the assistant alike. Legitimate next designs: the parent study on its full corpus, one work type,
where obligations have room to surface (a "never do X in an essay" cannot be REQUIRED when the
corpus mixes genres and the rule must survive a journal entry); or a design whose endpoint is
built for preference-only standards, with a validity gate that does not require REQUIRED rules —
which does not currently exist and would need to be designed from scratch, sealed before any data.
