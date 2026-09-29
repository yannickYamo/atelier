# Result: the voice rounds (1 to 7), and where they leave Atelier

Seven blind rounds on one public author's Substack (20 posts), one writer model (`claude-opus-5`), the
product against baselines. Rounds 5, 6 and 7 were pre-registered
([5](VOICE_ROUND5_PREREGISTRATION.md), [6](VOICE_ROUND6_PREREGISTRATION.md), [7](VOICE_ROUND7_PREREGISTRATION.md));
rounds 1 to 4 were exploratory and are reported as such. Each round's conclusion, as it stood at the time, is
also in the CHANGELOG under *Studies*. The harnesses are `studies/harness/voice-round.mjs` and
`studies/harness/guard-offline.mjs`; the texts and keys stayed on the owner's machine.

## What was compared

| arm | what it is |
|---|---|
| RAW | the model asked to write in the author's voice |
| CONTEXT | the author's readable pieces pasted into the prompt |
| GUIDE | the model writes its own style guide from those pieces, then writes (rounds 4 and 5) |
| ATELIER | `atelier invoke` on a skill built from the corpus (standard, compiled skill, check and repair) |
| *_GUARD | a baseline's draft repaired by `atelier verify --repair` (round 5) |

Six pieces were reserved from every arm from round 5 on (three before). Every brief carried the author's
usual length.

## Results by round

| round | Atelier's standing (blind readers) | what it taught, and what changed |
|---|---|---|
| 1 | not preferred; style-guide arm read as most like the author | meeting the rules is not sounding like the author |
| 2 | still read machine-written in places | contrast rules removed the model's tells but not all of them |
| 3 | last of four, while holding 5 of 5 rules | the skill served none of the author's writing, enforced only negatives, dropped the first person, spelled British; a repair spliced text. Led to served author writing, positive bands, a voice layer, whole-sentence repair |
| 4 | fourth of five | 21 required rules produced a template. Led to a grounded persona, whole pieces spanning the author's modes, rules required only when nearly always followed |
| 5 | first on 3 of 5 briefs (mean 2.4 of 7); failed the sealed rule (stylometry level with raw) | every arm carried machine-written sentences at 3 to 7 times the author's rate; the guard was nearly a no-op. Led to the machine-tell catalogue, a learned lexicon, move-aware repair, two drafts |
| 6 | failed the gate narrowly (machine moves 0.26 vs 0.22; one invented story; stylometry 0.005 below raw) | each miss traced to an enforcement defect, fixed without a redesign; stylometry could not separate the arms |
| 7 | **the owner's blind read picked Atelier on both briefs read**, over CONTEXT; a second reader first on 4 of 5; the model judge agreed. Gate failed on machine moves (0.27 vs 0.22) and on one piece's range | the sensor pass: invented material in every shape readers caught, moves held to the author's typical piece |

Round 7, the arms against each other:

| | shared 6-grams with the corpus, per piece | invented stories | required rules held |
|---|---|---|---|
| ATELIER | 3.6 | 0 | 6 of 6, every piece |
| CONTEXT | 97 | 2 | 3 to 4 of 6 |
| RAW | 0.6 | 0 | 2 to 4 of 6 |

Offline, round 7's own drafts through the guard as it stands now (post hoc, not a confirmation): machine moves
0.64 → 0 per 1,000 words; six invented stories, quotations or figures that the older claim check missed, all
cut; every required rule held in 5 of 5. Still open: one piece writes fewer one-line paragraphs than the
author does.

## What is established, and what is not

**Established, for this author:** Atelier's output was preferred blind by the owner over a model given the
author's own pieces, without copying them or inventing material, while holding its standard in every piece.
The guard improves a draft on the measures it checks (with and without, on the same drafts).

**Not established:**
- any author but one (a favourable one: formulaic, thesis-driven, prolific);
- the invented-claim check's false-positive rate on an author's own true stories (it is a hard gate, and it
  has not been qualified against expert labels);
- respond mode (support replies): no evidence at all;
- the self-improving loop (`tend`, the regression floor, the taste reader) running on a live skill over time;
- any comparison with GEPA, SkillOpt, SSO or EvoSkill on a shared task.

**Instruments:** stylometry (Burrows' Delta) could not discriminate between the arms on this corpus, and the
model judges were the same family as the writer and rewarded copying and fabrication. The voice criterion
rests on human reads.

## Since then (note added 2026-09-29)

The two lists above and below are kept as they stood when the rounds closed. What has moved:

- **The invented-claim check was measured.** Version 1 failed on specificity
  ([result](CLAIM_READER_QUALIFICATION_RESULT.md)). Version 2 qualified on technical and marketing writing
  ([result](CLAIM_READER_V2_QUALIFICATION_RESULT.md)). Version 3, after the audit, is pre-registered and not
  run ([pre-registration](CLAIM_READER_V3_QUALIFICATION_PREREGISTRATION.md)); until it passes, it reports
  and the pattern check gates. Measured against planted inventions, not an expert's labels.
- **Item 1 below** was partly covered: version 1's study included the owner's 7 pieces, but as model
  rewrites with the whole piece supplied as material, not as the owner's own drafts.
- **Item 2 below** became Phase C ([draft pre-registration](PHASE_C_PREREGISTRATION.md)), not yet run.
- Items 3 and 4 are still open.

## Next, in order (as of the rounds' close)

1. Run the invented-claim check over the owner's own corpus, where every story is true, to measure how often
   it cuts a real one.
2. Build a skill from the owner's corpus and have the owner read it blind: the human-anchored generality test.
3. A support corpus, for respond mode.
4. One real skill tended weekly, with the reader labelled and the floor qualified.
