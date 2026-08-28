# Human authority

Doing something repeatedly does not make it a requirement. For every candidate, a person decides
whether it belongs in the standard.

```text
APPROVE       it is mine, as stated
REWRITE       it is mine, but not in those words
CONTEXTUAL    it is mine only under a condition
REJECT        it is not part of the standard
```

For anything kept, Atelier records how much it matters.

| materiality | meaning |
|---|---|
| `REQUIRED` | violating it materially worsens the work |
| `PREFERRED` | wanted, but other valid realizations are acceptable |
| `EXEMPLAR_ONLY` | characteristic evidence, not an obligation |
| `TOLERATED` | preserve it where present, do not generate it deliberately |
| `INCIDENTAL` | observed, but not part of the standard |

Separately, whether the exact form matters.

```text
STRICT · FUNCTIONALLY_EQUIVALENT · FLEXIBLE
```

This is what stops a recurring habit from becoming a hard rule by accident.

### When a rule needs something the runtime does not have

Some rules depend on evidence as well as judgment. *Cite one counted observation from our own
records* is a real standard and it cannot be followed honestly by a model with no records.

Ask it anyway and you do not get a refusal. You get *"I pulled our last 200 tickets, 63% of them
were…"* Specific, confident, in your voice, and invented. The rule was followed. The condition that
makes following it truthful was absent.

So a requirement can name what it needs, and the run stops before the model is asked to solve an
impossible problem.

```bash
atelier invoke --skill my-skill "Should we approve two more support agents?"

atelier: MISSING_REQUIRED_EVIDENCE — nothing was generated.

  p2  [REQUIRED]  needs RECORDS("support-ticket-history")
      rule: I cite one specific counted observation from our own records

  Bind the source:   --with support-ticket-history=./tickets.csv
```

Nothing was spent, because the absence was knowable before the call. A rule you marked PREFERRED in
the same position does not stop the run; the behaviour simply does not fire, and Atelier says so
rather than dropping it silently.

Public work keeps its provenance too. If you adopt a behaviour inferred from someone else's work,
Atelier records that you adopted it. It does not pretend you ratified that person's standard on their
behalf.

Every one of these decisions is written to an append-only ledger beside the standard, and the ledger
stores **what you were shown**, not what survived. A rewrite keeps the original wording next to your
replacement. A rejection is recorded as a rejection rather than as an absence. The standard can
already tell you what is in it; only the ledger can tell you what a person was looking at and what
they did about it, and that is not reconstructable afterwards.

> **Atelier may discover a candidate. Only a person can make it authoritative.**

---

---

[← back to the README](../README.md)
