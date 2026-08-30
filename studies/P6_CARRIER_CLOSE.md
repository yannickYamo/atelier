# Does the EXAMPLE carrier beat a prose realization of the same rule? — CLOSE

> **Two disclosures, because a reader would otherwise assume otherwise.**
>
> **The expert is this tool's author.** This is a self-study: the person whose standard was
> discovered, who ratified it, labelled the cases and scored these outputs is the person who built
> Atelier. A legitimate case study, and not an independent evaluation. Weight it as first-party.
>
> **The corpus is AI-assisted.** The seven essays were published by the author under his own name; he
> declared that roughly half the prose was written with AI assistance, and the evidence record
> carries `aiAssisted: true`.

**Status: CLOSED, and the carrier LOST.** Preregistered primary was blind expert preference. The
prose ablation was preferred **13 to 3** with one tie, exact two-sided sign test **p = 0.021**.

**But the headline is a defect the study found rather than the comparison it was built to make.**

---

## 1. What ran

StandardVersion `7be05d7f92222e15` (p6 refined and author-authored). 20 sealed contexts
`eb52d496b4df5fb5`, worst-pair overlap 0.138. Two arms differing in exactly one carrier — p6 as
EXAMPLE (FULL) against p6 as semantically complete PROSE (ABLATION), 18 components held constant.
80 generations, `max_tokens 7652` from an uncensored probe, $5.50. Run `a7b43182e723bcec`.

Six generations truncated, **all six in ABLATION** — under equal rates a 1-in-32 split, so the
surviving ABLATION sample is missing its longest outputs. Declared, not corrected.

The author judged 17 of 20 pairs blind. Three were unjudgeable, which is where the real finding is.

## 2. THE FINDING: the EXAMPLE carrier leaks the skill's internals into the user's work

The three unjudgeable pairs were not truncated. Their outputs **finish the answer and then reproduce
the skill package's own example files** — a `---`, a `# p18` heading, and the requirement text
verbatim:

> …essay closes with an italicized aphorism that lands the judgment—reframing the board's evidence
> rather than adding new information.
>
> \-\-\-
>
> **# p18**
>
> I attribute human emotional and cognitive states to systems, algorithms, and machines…

Measured across all 74 valid generations: **31 outputs contain a literal `# pN` heading and 10
reproduce a served example instance verbatim.**

| arm | judged outputs containing skill internals |
|---|---|
| **FULL** (p6 as EXAMPLE) | **10 / 17 — 59%** |
| ABLATION (p6 as PROSE) | 5 / 17 — 29% |

Both arms carry other EXAMPLE-compiled requirements, which is why the ablation leaks at all. The arm
with one more example leaks nearly twice as often.

**Diagnosis.** The examples are appended to `SKILL.md` as markdown sections — `# p3`, `# p6`, under a
`# How the author works — examples` heading. The model treats that as a document to continue rather
than as reference material. The block's own framing sentence tells it these are instances and not
instructions; nothing tells it they are not part of the artifact being written.

**This is a rendering defect, not a property of showing rather than telling.** It is a defect of the
EXAMPLE carrier *as Atelier currently implements it*, and it is severe enough to be a product bug on
its own terms — a user's deliverable containing the skill's guts, in roughly half of generations.

## 3. The primary, and what it can carry

| | FULL | ABLATION | |
|---|---|---|---|
| **preferred** | **3** | **13** | 1 tie, n=16 decisive, **p = 0.021** |

Stratified by contamination, because the leak plainly influences a preference judgment:

| stratum | FULL | ABLATION | n | p |
|---|---|---|---|---|
| neither side leaked | 2 | 4 | 6 | 0.688 |
| exactly one side leaked | 1 | 5 | 6 | 0.219 |
| both sides leaked | 0 | 4 | 4 | 0.125 |

**Where exactly one side leaked, the author preferred the clean one 6 times out of 6.**

No stratum reaches significance on its own; each is n≤6, and this is not a test the study was
powered for. The direction is the same in all three, which is worth noting and is not evidence.

**An earlier draft of this close said the result "is not explained by leakage alone" because the
clean stratum is 4–2. That overstated it.** At n=6, 4–2 has p = 0.688 — a fair coin produces that
split or worse about seven times in ten. It is consistent with the overall finding and it supports
nothing on its own. The honest statement is that **the clean-pair evidence is uninformative**, and
whether the carrier would still lose without the leak is unmeasured.

**What this licenses:** on this standard, this requirement and these contexts, the EXAMPLE carrier as
implemented produced work the author preferred less than an otherwise identical prose realization.

**What it does not license:** any claim that showing beats telling in general, or that a repaired
EXAMPLE carrier would lose. The leak is fixable and was not fixed before measuring.

## 4. The secondary is the sharpest result

Did the ending re-land the argument's meaning — the refined p6 move?

| arm | YES | NO | UNSURE | rate |
|---|---|---|---|---|
| FULL (EXAMPLE) | 8 | 6 | 2 | **0.57** |
| ABLATION (PROSE) | 12 | 1 | 3 | **0.92** |

**The example carrier produced the target behaviour LESS often than prose.** Not "raised occurrence
without raising quality" — it did not raise occurrence at all. Whatever the example is doing, it is
not making the model land the point more reliably; a plainly stated instruction did that better.

This closes the third of the four outcomes the design anticipated, and it is the one nobody expected.

## 5. What closes, and what this settles

The workflow ran end to end: corpus → discovery → ratification → **extension calibration** → refined
StandardVersion → carrier selection → proven runtime delivery → fresh sealed contexts → blind
expert judgment. Every stage held. The result at the end is negative, and that is a complete result.

**Atelier reconstructed a latent preference from prior work, exposed a mismatch between the ratified
description and the author's case-level boundary, refined the standard under explicit expert
authority, compiled it into a nontrivial carrier, proved that carrier reached execution — and the
carrier it chose produced worse work than the simpler alternative.**

The compiler chose EXAMPLE from `materiality: PREFERRED` by a fixed rule. On this requirement that
choice was wrong. An adaptive compiler is supposed to be able to learn that, and this is the first
measurement that would let it.

**Not opened:** p7, p8, p9. A null or a loss is closure, not permission for a rescue loop.
