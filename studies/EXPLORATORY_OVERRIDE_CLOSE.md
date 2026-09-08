# Close — VOID by the sealed gate, and the clearest negative signal this repository has produced

**Design:** `EXPLORATORY_OVERRIDE_ENDPOINT.md`, sealed exploratory by public commit `1143be3` on
2026-09-04, before the B2 guide existed and before any generation. **Labels collected:** 2026-09-08,
all 51 in one delivery, none seen by the builder before collection closed. **Spend:** ~$4 of $15.
**Blinding:** `OVERRIDE_BLIND_KEY.json` sha256
`781746f9859feee3bf98dea6851c8ebcf45f4d167bd6b41faff29b4ba9017d9a`, handed to the reviewer before
the first label and verifying against the committed bytes. Recognition declaration: **empty**, so
the endpoint reports as blind.

## Verdict, in the order the seal requires

**Gate B — identical pairs: PASS, perfectly.** Five trials showed the reviewer the same output on
both sides. They answered "no material difference" on **all five**. The bar was *at most one*
directional; they produced zero.

**Gate A — known-bad (T vs a bare model on tasks where the raised-REQUIRED rules plainly apply):
FAIL.** T was preferred on **3 of 6**; the bar was 5. Exactly chance.

**Gate A fails ⇒ the study closes VOID, and no primary p-value is quoted.** That is the sealed rule
and it is honoured here without exception.

**Position check:** side A chosen on 23 of 46 directional trials — 50.0%, inside the 30–70% band.

## What was observed, reported as description and not as an endpoint

The seal forbids reading the primary as a result. It does not license hiding what the reviewer said,
and the direction is too extreme to omit without dishonesty. **No p-value is computed, and no
confirmatory claim of any kind is made from these counts:**

| primary, 40 pairs | count |
|---|---|
| B2 (model-written guide) preferred | **39** |
| T (compiled, builder-overridden standard) preferred | **1** (trial J18) |
| no material difference | 0 |

T won no essay-form trial at all — zero of twenty — on exactly the task family the enforced rules
were derived from.

## Why the VOID here does not mean "the instrument failed"

A failed known-bad gate normally says the judge cannot detect the effect, so nothing else can be
read. **That reading is contradicted by Gate B in this run.** The reviewer answered "no material
difference" on five identical pairs and on none of the forty real ones — they used the tie option
exactly where it belonged and nowhere else. This is the best-behaved judge in this repository's
history; the moat study's expert, by contrast, avoided "same" and forced discriminations.

So the honest reading of these two gates together is **not** "the measurement was broken." It is
that the reviewer discriminated reliably, and **the artifact under test could not beat a bare
model.** The gate was written on the assumption that T works and the judge might be noise. Here the
judge was signal and T was the failure — which the gate correctly refused to let become a p-value.

## What this says about the override — and the limit on saying it

The standard under test was **not the reviewer's**. Nine rules they ruled PREFERRED were re-ratified
REQUIRED by the builder, over the assistant's recorded objection, on the builder's reading of an
informal debrief. Compiled, those nine became ENFORCE obligations. Mechanical fingerprinting of the
outputs confirms the arms were what they claimed: T carries the enforced signature more heavily than
B2 (2.1 vs 0.9 signalling phrases per essay; 6.3 vs 5.6 coursework-vocabulary hits), and on
journal-form tasks — where those essay rules should not fire — T still emitted them (0.8 per piece
against B2's 0.0) and ran 28% longer.

**The limit, stated plainly: there is no arm for the reviewer's own ratified standard**
(`6c32949758c91780`, everything shown, nothing instructed). This run compared *overridden-T* against
B2. It cannot isolate the override as the cause, because the un-overridden skill was never served.
"The override made it worse" is the most plausible reading of these numbers and it is **not**
established by them.

What can be said, and is enough: **treating this reviewer's PREFERRED rules as REQUIRED produced a
skill they rejected on 39 of 40 blind comparisons and could not prefer to a bare model.** The
builder's hypothesis — that their PREFERRED meant REQUIRED — is not supported; the evidence runs
against it.

## The pilot's gate was right

[`EXTERNAL_EXPERT_PILOT_CLOSE.md`](EXTERNAL_EXPERT_PILOT_CLOSE.md) stopped this reviewer's study at
ACQUISITION-ONLY because zero rules were ruled REQUIRED, spending $0.52 rather than 59 reviewer
trials. That gate was overridden, the endpoint ran anyway, and it cost ~$4 and the reviewer's full
labelling session to arrive at VOID. **The preregistered gate reached the correct conclusion first,
for one eighth of one percent of the cost of overruling it.** This is recorded as the strongest
evidence in this repository that the governance layer earns its keep — including, and especially,
when it is inconvenient to the person who built it.

## Recorded oddities and deviations

- **All six known-bad labels were "b".** Their presented positions were 8, 24, 27, 35, 39 and 49 —
  spread across the whole session, not a run — and with T on side A in 3 of those 6, an all-"b"
  answer yields exactly the 3/6 observed. Under a coin flip, six identical letters has probability
  1/32. The global position check is clean at 50.0%, so no session-wide bias is present. Reported as
  an anomaly, not adjudicated.
- **Serving-shape deviation**, disclosed in §4a of the design before labels reached the builder: the
  97 generations were produced by a plain text completion, while the product's own serving function
  wraps generation in a forced tool call. Both arms went through one identical path, so the
  comparison's internal validity is unaffected; external validity is narrower than "exactly as
  `invoke` serves it."
- **Zero ties on the primary and 100% ties on identical pairs** is itself a finding about the
  instrument, and it is the reason the tie-rate risk declared in the parent design did not
  materialise.

## What is licensed, and what closes here

- **Licensed:** the negative reading above, bounded to this reviewer, this corpus, this overridden
  standard. And a methodological finding with teeth: a preregistered gate stopped a study that a
  human then overrode, and the override reproduced the gate's verdict at ~8× the cost.
- **Not licensed:** any claim about the moat (`EXTERNAL_EXPERT_B2_PREREGISTRATION.md` remains sealed
  and unexecuted), any claim about Atelier's compiled standards in general (the standard here was
  not owner-ruled), and any p-value from this data, now or later.
- **No rescue.** Per §5 of the seal: VOID stands. No arm is added, no subset is mined, no gate is
  re-cut. The clean follow-up — the reviewer's *own* ratified standard against B2, which would
  isolate what the override cost — is a **new preregistration**, sealed before data, or it is
  nothing.
