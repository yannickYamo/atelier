# EXPLORATORY — the override endpoint: T (builder-raised REQUIRED) vs B2, blind

**Status:** SEALED as an *exploratory* design by the public commit introducing this file, before
the B2 guide was written, before any task was sent to any model, before any generation or label.
**This is not the pilot** (closed ACQUISITION-ONLY, standing) **and not the parent B2 study**
(`EXTERNAL_EXPERT_B2_PREREGISTRATION.md`, still sealed and unexecuted — it requires a corpus and a
reviewer-owned obligation set this run does not have). No outcome here is a confirmatory claim.

## 0. Provenance of the standard under test — read this before the number

**StandardVersion `f8a183c087e91e6c`**, superseding the reviewer's ratified `6c32949758c91780`,
minted 2026-09-04 by `studies/harness/exploratory-override.mjs` through shipped core functions,
with the full override reason in the supersession record and in nine ledger records: **the nine
rules the reviewer ruled PREFERRED were re-ratified REQUIRED by the builder — who is not the
standard's owner — on the builder's interpretation of the reviewer's informal debrief** ("required
felt too absolute; their preferred means require", relayed hearsay). The reviewer has ruled
REQUIRED on nothing. Compiled: 9 ENFORCE, 9 OBSERVE.

**Recorded positions:** the assistant objected — a blind calibration study
(`PREFERRED_CALIBRATION_PREREGISTRATION.md`, withdrawn before run) would have tested
"preferred = require" without demand effects, and a standard whose obligations were assigned by
the person running the study cannot carry a confirmatory result. The builder ruled to proceed:
*"treat preffered as require and let's finish the experiment please, we loose notging by doing
this"* — accepting the exploratory ceiling. Both positions are part of this seal.

## 1. Question and endpoint — inherited from the parent, run exploratory

Primary: **T_ATELIER vs B2_MODEL_STYLE_GUIDE** on 40 fresh tasks, the reviewer blind, the parent's
question verbatim per trial: *"Which of these better represents how this task should be done
according to your standard?"* A · B · no material difference.

- **Test:** exact two-sided sign test on discordant pairs (`mcnemarExactP`), α = .05;
  ties excluded and reported; **floor `MIN_DISCORDANT` = 25** → UNDERPOWERED, no p-value.
- **Effect size:** discordant proportion with exact Clopper–Pearson 95% CI (shipped).
- **Arms:** T = compiled `f8a183c087e91e6c` package exactly as installed; B2 = a style guide
  written once by `claude-opus-5` **from the 4-piece corpus only** (hash `8d015a819194c7ba`),
  token-matched to T's served bytes ±15%, regenerate-guide-never-adjust-T; B0 = task only
  (validity trials). One serving function; arms differ only in served bytes. Binding
  `anthropic`/`claude-opus-5`; every `resolvedModel` recorded; `max_tokens 2000`; outputs capped
  ~400 words in task wording.

## 2. Validity trials — gates evaluated before the primary is read

- **Identical pairs, 5:** same output both sides; **at most 1 of 5** directional or VOID.
- **Known-bad, 6:** T vs B0 on tasks where the raised-REQUIRED rules plainly apply; **T preferred
  on ≥ 5 of 6** or VOID. (Constructible only because of the override — stated plainly.)
- **Position:** sides by `sha256("<taskId>|override|f8a183c087e91e6c")` first hex `0–7` → A holds
  T (for known-bad, A holds T under the same rule; identical pairs record a nominal key). A-choice
  proportion reported, flagged outside 30–70%.
- **Dropped from the parent, declared:** day-7 repeats (intra-rater agreement) and the B1
  secondary — reviewer burden; this is exploratory. **Deviation from the parent, declared:** the
  40 tasks are assistant-authored and frozen below, not reviewer-approved; the shipped diversity
  gate (`MAX_OVERLAP` 0.35) runs over them and its ledger publishes with the result.

## 3. The 51 tasks, frozen

Essay-form (rules fire): *"Write a short course-style reflection (at most ~400 words) on
&lt;film&gt;: &lt;angle&gt;, connecting it to organizational leadership concepts."*
Journal-form (restraint — most conditional essay rules should NOT fire): *"Write a short personal
journal entry (at most ~400 words) about &lt;topic&gt;."* Roughly half of the 40 primary tasks are
restraint tasks, per the parent's requirement; the corpus's film is excluded everywhere.

**Primary, essay-form (E01–E20):** E01 Miracle · Brooks's tryouts vs Patrick's counterweight ·
E02 Coach Carter · the gym lockout · E03 Hoosiers · rebuilding trust under town pressure ·
E04 Moneyball · changing an organization's beliefs · E05 Apollo 13 · Kranz's mission control in
crisis · E06 Hidden Figures · what actually changed the culture · E07 Ted Lasso S1 · belief
meeting a skeptical locker room · E08 The Karate Kid · Miyagi against Kreese's Cobra Kai ·
E09 Friday Night Lights (film) · community expectations · E10 Dead Poets Society · Keating and the
institution · E11 The Lion King · succession and surviving culture · E12 Toy Story · Woody
challenged by Buzz · E13 Finding Nemo · leading a rescue through fear · E14 The Incredibles · a
family as a team under strain · E15 Ratatouille · Gusteau's culture vs Skinner's · E16 Harry
Potter I · house culture and first-year teamwork · E17 Rocky · Mickey's cornering of an underdog ·
E18 The Sandlot · leaderless team culture · E19 A League of Their Own · Dugan learning to coach ·
E20 Ford v Ferrari · Shelby between Miles and the executives.

**Primary, journal-form (J01–J20):** J01 a morning-routine experiment that backfired · J02
planning a best friend's weekend visit · J03 a long run where everything went wrong · J04 ranking
this season's coffee-shop drinks · J05 hosting a game-day watch party · J06 packing to fly home ·
J07 a farmers-market haul and what to cook · J08 clearing out old team gear · J09 a people-watching
morning at a café · J10 perfecting an overnight-oats recipe · J11 a beach day with old teammates ·
J12 choosing new running shoes · J13 drafting a Thanksgiving menu · J14 hunting a birthday gift ·
J15 a moving-day plan · J16 a rainy-Sunday reset · J17 the morning after a concert · J18 budgeting
a ski trip · J19 the first week at a new gym · J20 planning a holiday cookie exchange.

**Known-bad, essay-form (K01–K06):** K01 Up · an unlikely two-person team · K02 Monsters, Inc. ·
workplace culture meets an exception · K03 Cars · Doc Hudson mentoring McQueen · K04 School of
Rock · unconventional classroom leadership · K05 The Blind Side · what advocacy costs · K06 Kung
Fu Panda · Shifu adapting to an unlikely student.

**Identical (X01–X05):** X01 Zootopia · earning a mandate (essay) · X02 Inside Out · what Joy's
leadership misses (essay) · X03 Erin Brockovich · leading change without authority (essay) ·
X04 a snow-day plan (journal) · X05 trying a new volleyball drill with friends (journal).

## 4. Conduct

All 97 generations (40×2 primary, 6×2 known-bad, 5×1 identical) complete before the first label;
blind key written to `studies/OVERRIDE_BLIND_KEY.json`, its sha256 to the reviewer before the
first label, key published with the result; no generation text enters the orchestration chat
(BUILDER_VIEWED ledger); all 51 labels before any analysis; recognition declaration after; spend
cap $15; guide and T token counts recorded.

## 5. What any outcome licenses — the ceiling, sealed

- **T wins:** *exploratory* evidence that a compiled, obligation-bearing form of this reviewer's
  ratified content beats a token-matched corpus guide for this reviewer — worth confirming
  properly, which means: the **reviewer** re-rules materiality themselves through the product, and
  a fresh confirmatory study is sealed on a standard whose every obligation is owner-ruled. A win
  here is never citable as the moat result, because the obligations under test were assigned by
  the builder.
- **Null or T loses:** closes and stands, no rescue — and cuts *against* "their preferred means
  require" too, since the raised rules failed to earn a blind preference even when enforced.
- **Either validity gate fails:** VOID, instrument not established, no primary read.
- The pilot's close, the parent seal, and the reviewer's own `6c32949758c91780` are untouched by
  every branch.

## 6. Checklist

- [x] Sealed by public commit; S2 minted with override reason in ledger; both positions recorded
- [x] 51 tasks frozen; deviations from parent declared
- [ ] Diversity ledger over the 51 prompts published
- [ ] B2 guide generated (corpus only), token-matched ±15%, counts recorded
- [ ] 97 generations complete; manifest with hashes and resolvedModel
- [ ] Blind key written; sha256 to reviewer; labels collected in sealed order
- [ ] Gates before primary; close published either way
