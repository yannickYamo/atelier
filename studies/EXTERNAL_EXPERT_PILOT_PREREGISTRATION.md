# Pre-registration — PILOT: overall voice from a minimum corpus

**Status:** SEALED by the public commit introducing this file, before discovery reads any corpus
byte, before any candidate rule, task, or generation exists.
**Relationship to `EXTERNAL_EXPERT_B2_PREREGISTRATION.md`:** that design remains sealed and
**unexecuted** — it required 8–12 pieces of one work type and the corpus never reached it. This
pilot does not amend it, execute it, or borrow its status. It is a smaller study, honestly labelled,
run because the available corpus is the corpus that exists. Everything not restated here —
arms, token-matching, guide-writer, sample-size table, validity trials, blinding, the reviewer
question, analysis plan, failure protocol — is **inherited unchanged** from the parent document.

**Decision to run at this corpus size:** the builder's, made 2026-09-02 after the assistant twice
flagged the shortfall and once refused a corpus-splitting workaround. Recorded so the record shows
who decided what: the builder chose to proceed; the assistant chose the pilot framing over silent
execution of the parent seal.

---

## 1. What changed, and the reframed claim

The corpus is **4 pieces, two genres**: three university-essay sections (possibly sections of one
assignment — see §2) and one personal journal entry. The parent design's claim — a ratified
standard for one work type — is not testable on this material and is **not claimed**.

The pilot claim, the builder's own hypothesis, stated before any rule exists:

> **An overall voice — patterns of this writer that survive across genres — can be recovered from a
> minimum corpus, ratified by the writer, and compiled into a standard whose output the writer
> prefers blind over a token-matched model-written guide to the same corpus.**

Genre mixture is a declared weakness for the parent claim and a **structural test** for this one:
a candidate pattern proposed from the essays that is merely an essay-genre artifact should fail on
the journal entry, and the split (§3) guarantees the journal entry sits where failure counts.

## 2. Corpus, sealed by hash

| id | sha256 | bytes | genre |
|---|---|---|---|
| piece-01 | `1f3cfa23ca43062a09c2324d2d506889e489dcfb3c8d52f06246cbdc8851913a` | 2481 | course essay (Remember the Titans / leadership) |
| piece-02 | `10d2d1e19be0e6213dacc94f30d07157abcbde24283bd3be8984759993c3f30c` | 2908 | course essay (same source work) |
| piece-03 | `dacee741fb4223e96b4c8d66f73f3eea1bf8a54895eae510865a804da988ac74` | 1563 | course essay (conclusion section, same source work) |
| piece-04 | `8692a3029c40e9c4b92be7f12451283f78262353252ab1e32936727479a74ee2` | 1699 | personal journal entry |

Hashes computed directly from the study-workspace bytes at seal time; the bytes never change
after this commit.

**Declared limitations, in full:**

- Pieces 01–03 carry section-style titles ("Leadership Styles" / "Stress, Emotions, & Resilience" /
  "Conclusion & Application…") over one source work — they are plausibly **three sections of a
  single assignment**. The builder has been asked; the answer is recorded in the intake ledger
  either way. If they are one assignment, the proposal side of this study is effectively one
  document, and every claim below is bounded accordingly.
- Work type declared to the tool: personal reflective writing. That is an umbrella, not a genre;
  the mixture is the point of §1 and is never presented as a homogeneous corpus.
- AI-assistance: pieces 01–03 declared not-AI-written by the builder relaying the reviewer
  (2026-08-31). Piece-04's declaration is **pending**; discovery does not run until the intake
  ledger records it. If it cannot be obtained, piece-04 is excluded and the study cannot run
  (corpus falls below the product floor of 4).

## 3. The split, computed before sealing

`assignRoles` (shipped, content-blind, sorted): **pieces 01–02 → PROPOSAL; pieces 03–04 →
HELD_OUT** (`MIN_PROPOSAL_GOLDENS = 2`, `MIN_HELD_OUT_GOLDENS = 2`).

Read honestly: piece-03 shares its source assignment with the proposal pieces, so recurrence on it
is weak evidence. **The load-bearing held-out signal is piece-04**, the cross-genre journal entry —
a pattern that recurs there has survived the hardest check this corpus can offer. A pattern
validated *only* by piece-03 is flagged as within-assignment recurrence in the ratification
material shown to the reviewer.

## 4. Two stages, with a gate sealed before stage 1 runs

**Stage 1 — discovery + ratification.** Discovery on the sealed corpus; the reviewer rules on every
candidate exactly as the parent §3.3 specifies (boundary question, materiality per kept rule).

**Gate, fixed now:** the endpoint (stage 2) runs only if **all three** hold:

1. The reviewer ratifies (keeps, in any materiality) **at least 6 requirements**.
2. **At least 2** ratified requirements are REQUIRED.
3. The reviewer answers one question, asked verbatim after ratification and recorded before they
   see any generated text: *"Does this set substantially capture how you write, across both kinds
   of pieces you gave us — yes or no?"* — and the answer is yes.

Gate fails → the study closes **ACQUISITION-ONLY**: the ratified standard (whatever survived) is
the deliverable, the reviewer's 59 trials are not spent, no preference claim of any kind is made,
and the result says the corpus was insufficient — which is itself the pilot answering honestly.

**Stage 2 — the endpoint**, only past the gate: identical to the parent — 40 reviewer-approved
primary tasks, T_vs_B2 primary, token-matched opus-5 guide from corpus only, 59 trials, same
validity gates, same blinding including builder blinding, same analysis via shipped
`core/stats/sign-test.ts`, same failure protocol. Task statistics are unaffected by corpus size;
what the thin corpus weakens is T itself, which is exactly what the gate screens.

## 5. Claims ceiling, written before any number exists

- **Best possible outcome licenses:** "for this writer, an overall-voice standard recovered from 4
  mixed-genre pieces beat a token-matched guide, blind, at a large effect — the full 8-piece
  one-work-type study is worth running." Nothing about experts, work types, or Atelier in general.
- **A null or gate-fail licenses:** "4 mixed pieces were not enough for this chain" — and is
  reported at the same prominence. It does **not** license "the moat is disproved"; the parent
  design remains the test of that, when its corpus exists.
- The parent's §10 sentence about the governance claim is inherited: no outcome here moves it,
  because no study here tests it.

## 6. Pre-run checklist

- [x] This file sealed by public commit; parent design left intact and unexecuted
- [x] Corpus bytes frozen; hashes above; split computed and stated
- [x] Gate criteria fixed before discovery
- [ ] Piece-04 AI-assistance declaration recorded in the intake ledger
- [ ] Builder's answer on one-assignment-vs-three recorded (either answer; before ratification)
- [ ] Stage 1: discovery run, ratification page delivered, reviewer rulings + gate question recorded
- [ ] Gate verdict recorded before any task or generation exists
- [ ] Stage 2 (only past gate): parent checklist items from "40 tasks" onward, unchanged
- [ ] Cap $40 total across both stages; `--max-tokens 12000`
