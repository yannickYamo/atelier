# Results

**Every study this project ran, in one place: what held, what failed, and who it held for. The failures
are listed with the same weight as the wins, because they are the reason to trust the wins.**

Each row links to its record in [studies/](../studies/README.md). Confirmations and qualifications were
pre-registered and sealed before any output existed. The early voice rounds and development runs were
exploratory, and say so.

## What held

| Result | Number | Population | Record |
|---|---|---|---|
| The claim reader (version 2) catches invented specifics | caught 35 of 35 planted inventions; left 35 of 38 clean drafts alone. A pattern check on the same drafts caught 9 | 28 unused technical and marketing pieces; plants were one sentence each | [v2 result](../studies/CLAIM_READER_V2_QUALIFICATION_RESULT.md) |
| Counted style features chosen per author hold on unseen work | 9 of 10 kept features still separated new pieces from new model drafts | one writer, one genre, 40 unused newsletters | [sensor result](../studies/SENSOR_QUALIFICATION_RESULT.md) |
| A skill preferred over the model given the author's own pieces | ranked first on both briefs read blind; 3.6 six-word runs copied per piece against 97 | one public author, two briefs, one reader who built the tool | [voice rounds](../studies/VOICE_ROUNDS_RESULT.md) |
| A standard read from public review comments beats raw examples | majority winner in 15 of 17 held-out contexts, at about 18 times less context | one maintainer's public work, a surrogate judge, one study | [close](../studies/MAINTAINER_A_STUDY_CLOSE.md) |
| Stating when a rule does not apply restores restraint | +0.250 (95% CI +0.083 to +0.458), replicated on clean arms | one standard, one task family | [close](../studies/NEGATIVE_BRANCH_CLOSE.md) |
| Nothing below the standard moves it | the standard's hash never changed through diagnosis, a new version, a rerun and a settlement | the moat study's full chain | [moat result](../studies/MOAT_RESULT.md) |

## What failed, or came back null

| Result | Number | What it taught | Record |
|---|---|---|---|
| A compiled standard against a bare model, on pricing decisions | exactly 0.000 difference over 17 clusters | compilation kept *what* to say and lost *when not to say it*: coverage up, restraint down | [close](../studies/M2_PRICING_STUDY_CLOSE.md) |
| The same comparison on a second standard and model | Δ −0.021, a null; its coverage figures were withdrawn | the pricing result was not a one-off | [close](../studies/CONTRACT_LIFT_CLOSE.md) |
| One complaint, one change to how a rule is carried | preferred on 9 of 16 fresh pairs against a sealed bar of 12 (p = 0.40) | a single carrier change inside 19 rules is below what a person can see | [moat result](../studies/MOAT_RESULT.md) |
| The override study | VOID: the known-bad check scored 3 of 6 against a bar of 5 | a reader who cannot spot a known-bad arm cannot judge the real ones | [close](../studies/EXPLORATORY_OVERRIDE_CLOSE.md) |
| The claim reader, version 1 | specificity 0.744 against a floor of 0.80 | it trusted its own sentence numbers; version 2 checks where a claim really sits | [v1 result](../studies/CLAIM_READER_QUALIFICATION_RESULT.md) |
| A model reader for argument, figures and cadence | 1 reliable, separating feature against a floor of 2 | these layers have no qualified instrument yet, so they report and never gate | [sensor result](../studies/SENSOR_QUALIFICATION_RESULT.md) |
| Showing a rule as an example instead of stating it | the example carrier lost to prose | a carrier is chosen on evidence, not on taste | [close](../studies/P6_CARRIER_CLOSE.md) |
| More rules in context, two runs | restraint held on one model (p = 0.55) and fell on another (p = 0.0043) | rule load does not explain the pricing null | [run 1](../studies/M3A_RESULT.md), [run 2](../studies/M3A_DILUTION_RESULTS.md) |
| An outside expert's pilot | stopped at its own gate: 4 pieces, not enough to read rules from | corpus size is the first gate, not the last | [close](../studies/EXTERNAL_EXPERT_PILOT_CLOSE.md) |
| A second maintainer | 2 clean rules against a threshold of 3, so the study did not run | a gate that fails is not excepted | [result](../studies/MAINTAINER_B_RESULT.md) |

## Numbers withdrawn

- **p = 9.1 × 10⁻¹³** for the maintainer study pooled 46 nested observations as independent. The
  context-level figure is p = 6.1 × 10⁻⁵.
- **The expert-selected-examples arm** rewarded copying and paraphrase alike, so its headline is invalid
  ([record](../studies/ARM_E_RESULT.md)).
- **Any "100% adherence"**: over rules that did not apply, silence scored as perfect.

## Not established

- That it works for other writers, or read by other people. An external blind study is next.
- That it handles support replies.
- That the self-improving loop holds up on a live skill over weeks.
- How it compares with GEPA-style optimizers on a shared task.
- The claim reader on essays: version 3 is [pre-registered](../studies/CLAIM_READER_V3_QUALIFICATION_PREREGISTRATION.md)
  and not yet run. Until it passes, the pattern check does the cutting.

A result table with only wins would be the one number here you should not trust.
