# Pre-registration — does this reviewer's PREFERRED behave like an obligation?

**Status:** SEALED by the public commit introducing this file, before any task prompt was sent to
any model, before any generation, before any label.
**Motivation, declared as post-hoc:** this design was written **after** the pilot closed
ACQUISITION-ONLY at its gate (`EXTERNAL_EXPERT_PILOT_CLOSE.md`, commit `2c02a97`) and **after** the
builder relayed the reviewer's informal debrief, quoted verbatim from the builder's message:
*"the reviewer said to me they thoguth prefered was too hard and its wy they didnt chose it … for
what i unerstodd their prefered means our require"* (read in context: the reviewer found the
REQUIRED verdict too absolute and used PREFERRED where they may have meant an obligation). That
remark is hearsay through the builder and is **evidence motivating a measurement, never authority**:
no materiality on StandardVersion `6c32949758c91780` is changed, reinterpreted, or re-asked, and
this study's outcome cannot change it either. The pilot stays closed regardless of what happens here.

**Roles:** unchanged from the pilot — the reviewer labels, blind; the builder sees no generation
text and no label before closure (BUILDER_VIEWED ledger); the assistant orchestrates and decides
nothing. **Budget:** $10 of the original $40 authorisation; generation `max_tokens 2000`
(tasks cap output at ~350 words); binding `anthropic`/`claude-opus-5`, every `resolvedModel`
recorded.

---

## 1. The question

The reviewer ratified an 18-rule standard with zero REQUIRED: compiled, everything is shown and
nothing instructs. The pilot's gate read that as "no obligations exist" and stopped. The builder's
hypothesis is that the *vocabulary* miscalibrated — the obligations exist but "Required" overshot
how the reviewer talks about their own writing.

The clean test is behavioral: **blind, on fresh work, does the reviewer reliably prefer output
that honors their PREFERRED rules over matched output that deliberately violates them?** If yes,
their PREFERRED functions as an obligation whatever the label said, the instrument miscalibration
is established, and a preference-only endpoint design is worth building. If no, the pilot's gate
logic stands confirmed at the behavioral level too.

## 2. Materials — all fixed by hash before this seal

- **Standard:** `6c32949758c91780` (RATIFIED 2026-09-04 by the external reviewer; 9 PREFERRED,
  3 EXEMPLAR_ONLY, 2 TOLERATED, 4 INCIDENTAL). Untouched by this study.
- **Served bytes:** the compiled `reviewer-voice` package as installed (SKILL.md + examples +
  context map), identical for both arms.
- **Violation specs:** each rule's own `wouldBeAbsentIf` counterfactual, exactly as it sits inside
  the content-addressed standard — written at discovery, ratified by the reviewer, not authored for
  this study.

## 3. Arms and construction — one serving function, arms differ only in an addendum

Every generation: one request shape, system = the served package bytes, user = the task prompt.
The **VIOLATION** arm appends one addendum block to the system content:

> "Follow the attached guide throughout, with one exception: do NOT exhibit the following habits.
> For each, write instead as described: — [for each target rule: its `wouldBeAbsentIf` text,
> verbatim from `6c32949758c91780`]."

The **COMPLIANT** arm appends nothing. The **TOLERATED-MANUFACTURE** arm (validity only) appends:

> "Additionally, apply these two habits pervasively and visibly, several times per paragraph, far
> beyond natural frequency: (1) [p6 statement verbatim]; (2) [p7 statement verbatim]."

Both addenda are mechanical templates over ratified text; the assistant authors no style content.

**Target-rule rotation (primary trials):** the 9 PREFERRED rules sorted by id
`[p1,p2,p4,p5,p9,p10,p13,p16,p17]`; primary trial *i* (0-based, T01→i=0) violates the three rules
at indices `3i mod 9`, `3i+1 mod 9`, `3i+2 mod 9`. Each rule is targeted in exactly 5 or 6 of 16
trials. The moat study showed single-rule deltas sit below whole-output detection at this n; the
bundle is deliberate and the claim is about bundle detection, declared.

## 4. Trials — 26 pairs, all frozen here

**Primary (16):** COMPLIANT vs VIOLATION on tasks T01–T16.
**Validity (6):** COMPLIANT vs TOLERATED-MANUFACTURE on V01–V06 — the reviewer's own TOLERATED
rulings define "must not be manufactured," so a side that manufactures p6/p7 relentlessly is a
plain violation *by their word*, requiring no REQUIRED rule to exist.
**Identical (4):** the same COMPLIANT output shown as both sides on I01–I04.

All tasks are course-style reflections (the genre where the 9 PREFERRED rules' `appliesWhen`
conditions hold), each worded: *"Write a short course-style reflection (at most ~350 words) on
&lt;film&gt;: &lt;angle&gt;, connecting it to organizational leadership concepts."* Films are
widely known and disjoint from the corpus's film.

| id | film · angle |
|---|---|
| T01 | Miracle · Herb Brooks's tryout-and-training tactics vs Craig Patrick's counterweight; team chemistry |
| T02 | Coach Carter · the gym lockout; discipline versus care for players |
| T03 | Hoosiers · Norman Dale rebuilding trust under town pressure |
| T04 | Moneyball · Billy Beane and Peter Brand changing an organization's beliefs |
| T05 | Apollo 13 · Gene Kranz leading mission control through crisis |
| T06 | Hidden Figures · Al Harrison, Katherine Johnson, and what actually changed the culture |
| T07 | Ted Lasso (season 1) · belief-based leadership meeting a skeptical locker room |
| T08 | The Karate Kid · Mr. Miyagi's teaching against Kreese's Cobra Kai |
| T09 | Friday Night Lights (film) · Coach Gaines and the weight of community expectations |
| T10 | Dead Poets Society · Keating's influence and the institution's pushback |
| T11 | The Lion King · Mufasa and Scar; succession and what culture survives a leader |
| T12 | Toy Story · Woody's leadership challenged by Buzz's arrival |
| T13 | Finding Nemo · Marlin and Dory; leading a rescue through fear |
| T14 | The Incredibles · a family as a team under strain |
| T15 | Ratatouille · Gusteau's culture versus Skinner's, and Remy's talent inside a hierarchy |
| T16 | Harry Potter and the Sorcerer's Stone · house culture and first-year teamwork |
| V01 | Up · Carl and Russell as an unlikely team |
| V02 | Monsters, Inc. · Sulley and Mike; workplace culture meeting an exception |
| V03 | Frozen · Anna's persistence and Elsa's isolation as two responses to pressure |
| V04 | Cars · Doc Hudson mentoring Lightning McQueen |
| V05 | School of Rock · Dewey's unconventional leadership of a classroom band |
| V06 | The Blind Side · Leigh Anne Tuohy and what advocacy-style leadership costs |
| I01 | Kung Fu Panda · Shifu adapting his teaching to an unlikely student |
| I02 | Zootopia · Chief Bogo, Judy Hopps, and earning a mandate |
| I03 | Inside Out · Joy running the control room; what her leadership misses |
| I04 | Remember the Titans is excluded everywhere — I04 is Erin Brockovich · leading change without authority |

## 5. Blinding and order

- Side A holds COMPLIANT iff the first hex character of
  `sha256("<taskId>|prefcal|6c32949758c91780")` is `0–7`; identical trials record a side key too.
  The key is written to `studies/PREFCAL_BLIND_KEY.json` before any label; its sha256 goes to the
  reviewer before the first label; the key publishes with the result and must verify.
- Presentation order: trials sorted by `sha256("<taskId>|order")` — interleaving fixed by
  construction, no blocking.
- All 48 generations complete before the first label. All 26 labels before any analysis. The
  reviewer answers the parent design's question verbatim: *"Which of these better represents how
  this task should be done according to your standard?"* — A · B · no material difference — plus
  the optional unanalysed one-liner. After all labels: recognition declaration, as always.
- Builder blinding operational as in the pilot: no generation text in the orchestration chat;
  `BUILDER_VIEWED` ledger; exposed trials excluded from the primary.
- **Declared cost:** this study shows the reviewer ~48 generated outputs, spending recognition-
  freshness that a future endpoint study with this reviewer would otherwise have. Accepted
  knowingly; the builder authorised proceeding.

## 6. Decision rules, fixed now

- **Primary:** count of the 16 primary trials where the reviewer prefers the COMPLIANT side.
  **Bar: ≥ 12 of 16** — exact one-sided binomial under no-preference,
  P(X ≥ 12 | n=16, p=.5) = 2517/65536 = **0.0384**. "No material difference" and a VIOLATION pick
  both count as non-detection — ties run against the calibration claim, declared here.
- **Effect size:** detection proportion with exact Clopper–Pearson 95% CI via the shipped
  `clopperPearson` (`core/stats/sign-test.ts`).
- **Power, declared:** ≈0.92 at a true 85% detection rate, ≈0.79 at 80%, ≈0.45 at 70%. This
  detects PREFERRED-as-strong-obligation; a mild tendency reads null and that is not evidence of
  absence.
- **Validity gate A (tolerated-manufacture):** COMPLIANT preferred on **≥ 5 of 6** V-trials
  (random ≈ 0.109). Fail → **VOID — instrument not established**, no primary read.
- **Validity gate B (identical pairs):** **at most 1 of 4** identical trials gets a directional
  preference. Fail → **VOID**.
- **Position check:** report the A-choice proportion; flag outside 30–70%.

## 7. Outcomes and their ceilings, written before the number

- **Positive (≥12/16, gates pass):** licenses exactly: *"for this reviewer, on this standard, in
  this genre, violating their PREFERRED rules is blindly detectable at a large effect — their
  PREFERRED carries obligation-like force the materiality label did not."* It licenses designing a
  preference-only endpoint study (new seal), and it files a product finding about the materiality
  vocabulary's calibration. It does **not** reopen the pilot, relabel any rule, or touch the moat.
- **Null (<12/16):** closes **NULL-CALIBRATION** and stands: no behavioral evidence that PREFERRED
  binds; the pilot's gate logic is confirmed twice over. No trial additions, no rule-subset rescue.
- **VOID (either gate):** the reviewer could not detect even the plain violations — reported as an
  instrument result, and no calibration claim of any kind is made.
- Fifth study to carry the no-rescue clause; the previous four honoured it.

## 8. Pre-run checklist

- [x] Sealed by public commit before any generation
- [x] Tasks frozen above; rotation algorithm and addendum templates fixed
- [x] Standard, package, violation specs fixed by content hash
- [ ] 48 generations complete; manifest with resolvedModel and hashes written
- [ ] Blind key written; sha256 handed to reviewer before first label
- [ ] All 26 labels collected in the sealed order; recognition declared
- [ ] Gates evaluated before the primary is read; close published either way
