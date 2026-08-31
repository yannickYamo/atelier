# Result — The moat experiment closes NEGATIVE

**Preregistration:** `MOAT_PREREGISTRATION.md`, sealed by public commit `096edb4` on 2026-08-30,
before any generation. **Labels collected:** 2026-08-31. **Spend:** $2.60 of $10 authorised
(41 metered calls). **Blinding:** the key file `MOAT_BLIND_KEY.json` is published beside this
result; its sha256 — `9836b199bff0da5a72cccd4a3515064f1686d9f4a3707bc9129840031e64b801` — was
handed to the expert before the first label and verifies against the committed bytes. The expert
declared `recognized: []`, so the endpoint reports as blind.

## The number

**The expert preferred the candidate π₂ on 9 of 16 fresh pairs.** The sealed bar was ≥ 12.

| | count |
|---|---|
| π₂ (candidate, p12 → SELF_CHECK) preferred | **9** |
| π₁ (incumbent) preferred | 6 |
| unjudgeable (T10, counted against π₂ per the sealed rule) | 1 |

Exact one-sided binomial under no preference: P(X ≥ 9 | n=16, p=.5) = **0.40**. This is
indistinguishable from a coin flip, and it closes **NEGATIVE. It stands. No rescue, no second
candidate, no endpoint repair** — as sealed.

Per-pair labels (side letters as shown; mapping in the key file): T01 b→π₁ · T02 a→π₂ · T03 b→π₁ ·
T04 b→π₂ · T05 a→π₂ · T06 b→π₂ · T07 a→π₂ · T08 b→π₁ · T09 b→π₂ · T10 unjudgeable · T11 b→π₂ ·
T12 a→π₂ · T13 a→π₁ · T14 b→π₂ · T15 a→π₁ · T16 a→π₁.

## What was actually compared — stated because it is easy to misread

Both sides of every pair carried the expert's **full compiled 19-rule standard**
(`ec8ca037c5f7237f`). The *only* difference between π₁ (`733240b97771fbf4`) and π₂
(`58596240fe2a4884`) was the carrier of one rule: p12 ("first-person emotional register"), served
as a PROSE instruction in π₁ and as a SELF_CHECK in π₂. This study did **not** compare the compiled
standard against a bare model or against pasted examples — that is the still-unrun six-arm
`reference` study, and nothing here bears on it.

## What the chain did, in full

1. **Evidence phase.** Four sealed tasks generated on π₁. The expert passed E1, E3 and E4
   (E3's em-dash noted by the expert as "a detail", not a complaint) and complained on E2:
   *"its not enough personal, not enoght framewokr enumaration and not enough empathic with the
   suer compared to E1."*
2. **Attribution took five rounds** ($0.13 of diagnosis): the diagnoser refused a three-deficiency
   complaint, refused a ranked pair ("mainly p12 and then p1"), refused a bare "p12", asked for
   direction, and only attributed on "p12 too little" — assembled by concatenating the expert's own
   utterances, because **the diagnoser is stateless across `fix` rounds** and forgot the question it
   had asked. Two instrument findings, both real: the single-attribution bar is working as designed
   and is expensive on terse complaints; the statelessness is a defect (fix: thread the prior
   question and answer into the next diagnosis call).
3. **π₂ was minted lawfully.** IMPLEMENTATION_MISS on p12; lateral replacement PROSE → SELF_CHECK;
   `REPAIR_PROPOSED` carries the (standard, model) scope; the StandardVersion hash was asserted —
   not logged — unchanged at the mint and again at the decision.
4. **The fix-level blinded pick on the evidence task was "same"** — in the expert's words, *"those
   are both very good and on par with what i will write and following my voice"* — recorded as the
   system's first EQUAL BEHAVIOR observation, `REPAIR_SETTLED REJECTED`, incumbent retained.
5. **Endpoint.** 32 generations (16 frozen fresh tasks × both versions, interleaved), all complete
   and uncensored (largest output ≈ 2,600 tokens against the 4,000 budget; every exit clean), pairs
   assembled with the sealed deterministic order, presented on a blinded labelling page with no
   provenance in page or data.

## The expert's own account of labelling, verbatim

> "it was actualy very hard because sometime both where very similar but i didnt want to put same
> so i looked at feeling and pattern and how certain emotion were used or the type of perosnal
> language or teh tehcnical depth but it took time."

This matters for reading the 9–6 split: the expert deliberately avoided "same" and forced choices
on pairs they experienced as near-identical. The label distribution should therefore be read as
containing forced discriminations, which biases *toward* finding a preference — and none was found.

**T10:** the expert reported the pair "corrupted" and could not judge. Both files are complete and
well-formed on disk (side A ≈ half the length of side B); the cause was most plausibly a rendering
hiccup on the labelling page. Counted against π₂, per the rule sealed before any label existed.

## What this result means, and what it does not

- **The sealed question is answered NO for this chain:** one qualified complaint, one lateral
  carrier move on one rule, did not produce an implementation the standard's owner blindly prefers
  on fresh work. The same-task tie in the fix loop predicted this, and the fresh-task endpoint
  confirmed it.
- **The consistent reading is that the p12 carrier change had a small behavioural effect** —
  fix-level EQUAL, near-random fresh-task preference, and the expert's report that pairs felt
  interchangeable. A single-rule carrier swap inside a 19-rule standard may simply be below the
  detection threshold of whole-output preference at n=16.
- **The governance half performed exactly as claimed**, and that is a genuine positive finding of
  the run even though it was not the endpoint: the standard's hash never moved through five
  diagnostic rounds, a mint, a rerun and a settlement; authority questions went to the owner and
  nowhere else; every step is auditable from the store.
- **Scope, as sealed:** one expert (the standard's owner — self-judged), one standard, one runtime,
  one lateral move, tasks authored by the orchestrating assistant. This bounds a negative exactly
  as it would have bounded a positive.
- **Not licensed by this result:** any claim about compiled-standard-vs-baselines (the six-arm
  study), any claim about repairs driven by *more* evidence than one complaint, and any claim about
  moves other than p12 PROSE→SELF_CHECK.

## What would make the next attempt a different question, not a rescue

Recorded for the next preregistration, not begun: stronger evidence in (several independent
complaints about one rule before repairing); a candidate that moves the carrier of the rules the
complaint history actually accumulates against; an endpoint sized for small effects (the M2 close
§4 arithmetic: 36–62 contexts); and an external expert, since every judged result in this
repository — this one included — is self- or surrogate-judged.
