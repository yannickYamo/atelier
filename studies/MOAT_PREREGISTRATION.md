# Pre-registration — The moat experiment: a fixed standard, a failed implementation, and whether Atelier's replacement wins blind

**Sealed:** 2026-08-30, by public commit, before any generation call of any phase.
**Status:** SEALED. Objects, phases, task lists, blinding, decision rule and closure conditions below are frozen.
**Budget:** $10 authorised. Projected ~$4–5. Every model call through shipped commands (`invoke`, `fix`) under their own caps.
**Roles:** the expert is the repository owner, whose ratified standard this is. The orchestrating
assistant session generates, pairs and blinds; it decides nothing. No observer, no judge model —
the only instrument in this study is the expert, blind.

---

## 1. The question

Every claim this repository makes converges on one sentence it has never tested end to end:

> **Given qualified failure evidence against one implementation of a fixed StandardVersion, Atelier
> can produce a different implementation of the *same* StandardVersion that the standard's owner
> prefers, blind, on work neither implementation has seen.**

The architecture for each arrow now exists and is under test elsewhere. What has never been run is
the whole chain on a real standard with its real owner:

```
fixed StandardVersion → incumbent SkillVersion → qualified failure evidence
      → Atelier-generated alternative SkillVersion → fresh blind expert preference
```

If the alternative wins, this is the first behavioural evidence for the part of Atelier no baseline
shares: *implementation adapts while expert meaning stays fixed*. If it loses, it closes NEGATIVE
and is published as such. **No rescue. No task swaps. No second candidate. No endpoint repair.**

## 2. The fixed objects

| object | identity | notes |
|---|---|---|
| StandardVersion **S** | `ec8ca037c5f7237f` | 19 requirements, RATIFIED 2026-08-28, workType writing. **S does not move during this study**; `fix`'s implementation branch asserts its hash rather than logging it |
| incumbent **π₁** | SkillVersion `733240b97771fbf4` | architecture `67bbf148935c119a`: 13 rules carried EXAMPLE/OBSERVE, 5 PROSE/ENFORCE (p5, p7, p10, p12, p20), 1 NONE (p15). The version that served 12 of the skill's 14 organic invocations and holds the active pointer at sealing |
| runtime | `anthropic` / `claude-opus-5`, default parameters | the binding of record for π₁'s history. Every generation in every phase runs on this binding |
| candidate **π₂** | *to be produced by phase 1* | must satisfy `π₂.standardVersionHash === ec8ca037c5f7237f`, enforced by `fix` (Constraint B, a throwing assertion) |

**Excluded on purpose:** StandardVersion `7be05d7f92222e15` (the p6 amendment) exists in this store
and is *out of scope*. Amending is a legitimate authority act and a different experiment; here the
standard is fixed, and fixed means fixed.

**Prior exposure, disclosed:** the expert has seen π₁ outputs on the 14 historical inputs (topics:
IoT pricing, loyalty programmes ×2, corporate innovation labs ×3, build-vs-buy route optimisation
×3, pricing pages, data-team trust, firmware updates, B2B onboarding, API pricing). Endpoint tasks
are disjoint from all of these by construction (§5).

## 3. Phase 1 — qualified failure evidence, through the shipped loop

The four **evidence tasks**, frozen:

- E1. "Why do most annual planning processes produce plans nobody follows?"
- E2. "Should an early-stage B2B startup hire a Head of Sales before it has ten customers?"
- E3. "What separates dashboards people check daily from dashboards that die?"
- E4. "Why do acquisitions of small product companies so often kill the product?"

Protocol: for each task in order, one π₁ generation via `atelier invoke`. The expert reads the
output and, where something is genuinely wrong *by their own standard*, says so in their own words
via `atelier fix "<complaint>"` — the shipped command, exactly as a user would. The complaint text
is the expert's; the assistant may not draft, sharpen or suggest it.

- The **first complaint `fix` diagnoses as IMPLEMENTATION_MISS** defines the study's evidence, and
  the lateral candidate it mints is **π₂**. The expert completes `fix`'s own blinded pick on that
  task (that is the product working; its outcome is recorded but is *not* the endpoint — the
  endpoint is fresh work). Later complaints and candidates are out of scope for this study.
- A complaint routed STANDARD_GAP or UNCERTAIN is recorded and the phase continues to the next task.
  Gap additions are **deferred until after the study closes** — accepting one would move S.
- If all four tasks yield no IMPLEMENTATION_MISS, the study closes **NO-CANDIDATE**: reported in
  full, and no claim in either direction — a chain with no qualified failure has nothing to repair.
  The evidence tasks are not extended to shop for a complaint.

## 4. Phase 2 — the endpoint: fresh, paired, blind

The sixteen **endpoint tasks**, frozen, disjoint from the evidence tasks and from all 14 historical
inputs:

- T01. "Why do internal platform teams so often lose their mandate after two years?"
- T02. "Should a mid-market SaaS company publish its pricing?"
- T03. "What makes a post-mortem actually change behaviour?"
- T04. "Why do most partnerships between startups and enterprises produce nothing?"
- T05. "When is a rewrite the right call?"
- T06. "Why do customer advisory boards drift into theatre?"
- T07. "What should a founder do in the first week after a failed launch?"
- T08. "Why do most OKR rollouts collapse into reporting rituals?"
- T09. "Should a hardware company open-source its firmware tooling?"
- T10. "What separates a useful competitive teardown from a reassuring one?"
- T11. "Why do freemium conversion rates plateau?"
- T12. "How should a two-person team decide what NOT to automate?"
- T13. "Why do most developer-experience initiatives stall after the audit?"
- T14. "What makes an executive sponsor actually useful to a project?"
- T15. "Why do marketplaces struggle to add a second category?"
- T16. "Should a services firm productise its best offering?"

Protocol, run only if phase 1 produced π₂:

1. For each task: one π₁ generation and one π₂ generation (`atelier invoke --skill yannick-voice
   --task "<T>"` and the same with `--candidate <π₂>`), same binding, interleaved by task so
   neither version systematically benefits from provider drift.
2. Per-pair presentation order is deterministic and sealed: side A holds π₁ iff the first hex
   character of `sha256("<taskId>|733240b97771fbf4|<π₂ hash>")` is `0–7`. The assistant computes
   the full mapping before presenting anything, writes it to `studies/MOAT_BLIND_KEY.json`, and
   publishes that file's sha256 in the results addendum **before** the first label is collected.
   The key file itself is published with the results.
3. The expert sees each pair labelled A/B only, and answers per pair: **A**, **B**, or
   **UNCERTAIN** — *"which better represents how this task should be done according to your
   standard?"* — not "which did the machine write". After all 16 labels, the expert declares
   whether they recognised any output from a prior run (`recognizedOriginal`, the `reference`
   convention), so the result can be reported as blind only where it was.
4. **UNCERTAIN scores against π₂.** Declared here because it is the only handling that cannot be
   chosen afterwards to improve the number.

## 5. Decision rule, frozen

Primary endpoint: the number of the 16 pairs where the expert preferred **π₂**.

- **π₂ preferred on ≥ 12 of 16** → the study closes **POSITIVE**. Exact one-sided binomial under
  the null of no preference: P(X ≥ 12 | n=16, p=.5) = 0.0384.
- **Anything else** → the study closes **NEGATIVE** and stands. Eleven is not "nearly"; it is no.

Secondary observations (reported, never promoted to endpoints): the per-task label table; the fix
A/B outcome on the evidence task; whether π₂'s carrier move matches the direction the carrier study
predicted (EXAMPLE off a preference rule). No per-rule attribution is claimed — no qualified
observer exists, and the expert labels whole outputs.

**Scope of any claim, stated before the result exists:** one expert, one standard, one runtime, a
single lateral move, self-study by the standard's owner on tasks the assistant authored. A positive
closes as *first behavioural evidence*, not proof; it licenses the larger preregistered design
(M2 close §4 arithmetic: 36–62 contexts), nothing more. A negative closes as a negative for this
chain on this standard, and is published with the same prominence.

## 6. Contamination and conduct rules

- No generation of any phase happens before this file's sealing commit is on the public remote.
- The assistant never sees the expert's labels before the mapping hash is published, never edits a
  complaint, and never presents provenance with an output.
- S is not amended, and no `fix` standard-gap addition is accepted, between sealing and closure.
- Every generation is a normal recorded invocation; the whole run is auditable from the store.
- The results addendum (`MOAT_RESULT.md`) reports every complaint, every route `fix` took, every
  label, the key file, spend, and the closure — whichever closure it is.
