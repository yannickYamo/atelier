# Atelier

**Your definition of good, written down, owned by you, enforced on every output.**
**The model is the part you can replace.**

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

Give Atelier a folder of your best work and one sentence about what the skill is for. It finds the
decisions behind the work, shows them to you on one screen, and once you say yes, compiles them into
a skill that any model runs, checks every draft against, and repairs where it breaks.

```bash
atelier new ./my-best-posts "write me a blog post in the voice and style of these"
```

## The moat, in one paragraph

Every other way of teaching a model what good means keeps the lesson somewhere you cannot read or
control: a prompt, a memory, a reward score, a set of weights. Prompt and skill optimizers go further
and improve the artifact automatically, but toward an objective they were handed, or one their own
judge invents. **Atelier is the only one where the objective is an explicit, versioned standard that
a named person ratified rule by rule, and where everything below that standard runs itself.**
Discovery, compilation, checking, repair and re-implementation are automatic. Changing what good
*means* is not: it takes your recorded decision, and the code asserts the standard's hash on every
automated change. You can diff it, audit who approved each rule, and recompile it onto a different
model tomorrow.

```text
your work ──► discovered + measured rules ──► YOU RULE ON THEM (one screen) ──► StandardVersion
                                                                                  │  yours, readable,
                                                                                  │  versioned
            ┌─────────────────────────────── automatic ─────────────────────────┐ ▼
            compile ─► generate ─► check every measured rule ─► rewrite only the broken spans
               ▲                                                        │
               └──── `fix`: a different implementation, same standard ◄──┘
```

## What it looks like

```text
$ atelier new ./posts "write me a blog post in the voice and style of these"

22 rule(s) read from your work. Nothing is part of your standard until you accept.
Strongest evidence first. REQUIRED rules instruct the model; the others are shown to it.

  m1   I keep sentences short: a median under 16 words, and nine in ten under 30.
       measured: median sentence ≤ 16 words, nine in ten ≤ 30
       → REQUIRED — instructs   2 of 2 held-out pieces meet it; checked on every output

  p3   I open by naming the comfortable consensus and declaring it wrong.
       when: the topic has a widely held default view
       → REQUIRED — instructs   followed in 1 of 2 unread pieces; two independent readings found it

  p7   I quantify with the real figure, even a rough one, rather than an adjective.
       needs from you: real costs, timelines, adoption numbers
       → PREFERRED — shown      needs your material, so shown until you make it required
  …
Enter to accept all as shown · or type changes (p3=reject p5=preferred) · q to stop:
```

Then use it, check anything against it, and correct it in your own words:

```bash
/posts write the launch post                     # in Claude Code
atelier invoke --skill posts "…"                 # or the CLI: drafted, checked, repaired
atelier verify --skill posts someone-elses.md    # any text; exits 1 on a broken REQUIRED rule
atelier fix "the answer buried the recommendation"
```

## How it compares

### Against a strong model you already pay for

A frontier model can read your work and write something plausible in its style. What it cannot do is
say which of your habits are decisions and which are accidents, keep that distinction the same on
every run, or show you what it decided.

| | a model on its own (or with your examples pasted in) | Atelier compiled onto that model |
|---|---|---|
| where good is defined | implicitly, re-inferred from examples on every run | an explicit StandardVersion you ratified |
| when a rule applies | guessed, differently each time | written down as an `applies when` condition |
| required vs preferred | not distinguished | declared by you, rule by rule |
| after the draft | nothing checks it | every measured rule counted, broken spans rewritten; judgement rules read by a reader your labels calibrate |
| inventing facts a rule needs | it will | the rule is marked; the skill asks you instead |
| who can change the target | whoever edits the prompt | only you, through a recorded act |
| switching models | re-prompt and hope | recompile the same standard |

### Against skill and prompt optimizers: GEPA, SkillOpt, SSO, EvoSkill

[GEPA](https://arxiv.org/abs/2507.19457) evolves prompt text by reflecting on rollouts against a
metric. [SkillOpt](https://arxiv.org/abs/2605.23904) trains a skill file through trajectory-driven
edits behind a validation gate. **SSO** (arXiv:2607.28777) optimizes a skill without labels, accepting
a candidate when its judge's wins exceed its losses. **EvoSkill** (arXiv:2603.02766) discovers and
refines skills from execution failures. All four close their own loop, and all four need a score
someone else wrote. For taste there is no such score: nobody can write `reward(essay)` for *sounds
like me*.

| | what it optimizes | where the objective comes from | who may change the objective | closes its own loop |
|---|---|---|---|---|
| GEPA | prompt text | a metric you supply | the metric's author | yes, given the metric |
| SkillOpt | a skill file | a validation gate you supply | the gate's author | yes |
| SSO | a skill, unlabeled | the judge's own win margin | the judge | yes, circularly |
| EvoSkill | the skill set | execution failures | the task's success signal | yes |
| **Atelier** | **the implementation only** | **your work, ratified by you rule by rule** | **only the named owner** | **yes, below the standard** |

The last row is the product. Atelier's loop rewrites outputs and swaps how a rule is carried, and it
**asserts** the standard's hash is unchanged while doing it. The acceptance rule SSO uses, one
instrument producing the signal and holding the authority to act on it, is the rule this codebase
refuses (`core/convergence/promotion.ts`); where a decision is automated, the instrument is a count
the owner ratified, never a judge's opinion. Any of these optimizers handed a ratified StandardVersion
gets a better objective, so Atelier sits upstream of them, not against them. It also closes the hole
a red-team of autonomous skill generation exploits (arXiv:2608.30429): nothing becomes a rule without
a person.

Atelier runs the same kind of search inside that boundary. `atelier optimize` takes GEPA's reflective
mutation (a model reads real failures and chooses the change) and its Pareto front over objectives.
From SkillOpt it takes one edit per candidate and a small history budget, and it screens on a cheap
model before confirming on the real one. The search space is everything the compiler derives from the
standard (how each rule reaches the model, whether the exemplar and contrast examples ship), never the
standard's text. A candidate is installed only by the promotion gate, and only when all of these
hold:
- the candidate changed a rule you measure
- the regression floor's false-alarm rate and its sensitivity were measured on this skill
- that rule improved across your tasks
- every other rule you enforce held

Anything else is left for you. Where SSO trusts a model reader outright, Atelier's reader is cut to one
direction: the taste reader may block a candidate that misses the rules nothing counts, and only after your own blind
labels have shown its misses hold up; it can never approve one. `atelier optimize --report` shows whether reflection's
proposals are kept more often than the fixed ordering's, which is an open question here.

Atelier has not been benchmarked against these systems on a shared task yet. The difference above is
architectural and checkable in the code; the benchmark is drafted (see [Evidence](#evidence)).

### Against fine-tuning

Owning the weights is not owning the definition of good they were moved toward. You cannot diff
weights against your intent; you can diff a StandardVersion. And because a standard carries no model
identity, it compiles onto a frontier API today and a local open model tomorrow with no retraining.

## Install

```bash
git clone https://github.com/yannickYamo/atelier
cd atelier && npm install && npm run build && npm link
```

Then, in Claude Code, install the plugin. It records each `/skill` use so `atelier fix` can find it,
checks and repairs answers at the end of the turn, and registers the checker as an MCP tool:

```text
/plugin marketplace add yannickYamo/atelier
/plugin install atelier@atelier
```

Node 22 or later. No account, no telemetry. An `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN` behind a
gateway, or any OpenAI-compatible backend via `--provider openai-compatible --base-url ...`) is needed
only for steps that call a model. `atelier check` verifies the backend before you spend on it. The npm
package is not published yet; the source install is the real one.

## Using it

**Create.** `atelier new <folder> "<what it is for>"`. The sentence sets how rules are weighed:
producing new work ("write me a blog post like these"), holding outputs to the standard ("ensure all
our copy follows these"), or answering people ("customer support always answers this way"). Some of
the work is held back before anything reads it (six pieces or more; name your own with `--reserve`),
the rest is read from two independent vantages, and each rule is checked against the pieces the
reader never saw. The countable part of your voice (sentence and paragraph length, hedging, stock
phrases you never use) is measured rather than read. Then the model writes a few plain drafts on your
own topics, and Atelier counts what it does that you don't: em dashes where you write a spaced hyphen,
five-word fragments, "that's not X, it's Y", "here's the thing", "quietly". Each wide gap is proposed as
a rule with both numbers ("you: none in 42,605 words; the model on its own: 8.4 per 1,000"), and only
if your own held-out work passes it. Proportions count too: which of two competing words you reach for
("but" or "however"), the connectives you lean on, the stock vocabulary the model leans on, and the mix
of short and long sentences. Each is proposed only if most of the model's drafts fail it. So do the
edges: how you open and close, and what your headings never say ("The thing everyone gets wrong about…"). This is the part of a voice no reader, human or model, thinks to
write down, and the part a reader recognises as machine-written. **Nothing compiles until you accept**, and the
same command continues wherever you stopped. Prefer to state your rules? `atelier skill "lead with the
action, number the steps when there are steps"`.

**Use.** Every draft is checked before you see it. The measured rules are counted on the finished
piece, and when a REQUIRED one is broken, only the sentences that broke it are rewritten: the rest of
the draft cannot change, because the model never holds the pen for it, and a rewrite that makes
anything worse is thrown away. In Claude Code the plugin does the same at the end of the turn; there
the host holds the pen for the whole answer, so "only these spans" is an instruction, and the record
says whether anything outside them changed. A voice may not invent your life or your numbers: a first-person
story or a cited figure that is not in the material you vouch for (`atelier material --skill <name>
notes.md`) is replaced with a visible placeholder, `[your story: …]`, for you to fill or cut. A rewrite
may change how something is said, never what it claims: one that drops a figure, a negation, a name or
a qualifier ("may", "most", "roughly") is refused and the original sentence kept, unless the broken rule
named that very word. Rules marked `--phase ACCURACY` are repaired before any style rule.

**It carries how you sound, not just rules about you.** Four blind rounds on one author's corpus
taught the same thing: rules about a writer never made a model sound like them. So a build now serves:

- a **persona**: how you sound (who is speaking, register, how you hedge and argue, your devices), each
  point with **how often** you do it and a quote from your own pieces. A point whose quote is not
  verbatim in your work is dropped, so none of it is the model's imagination of you;
- a few of your **whole pieces**, chosen to span the different ways you write, and your usual length;
- the moves you only **sometimes** make, with their rate and a cap per piece, never as rules every
  piece must follow (stacked, they became a template a blind reader recognised across five topics).

**No sentence that marks the text as machine-written.** Every skill catches the model's own moves
(announcing an insight others "miss", grading its own list, "the single most", "let me be blunt",
"that's the whole game", one problem "wearing another's clothes") at your rate, which is usually never,
and learns more from its own drafts: a phrase it repeats across unrelated topics that you never write
(`atelier tells`). Repair removes the move rather than re-spelling it.

The standard then **guards the edges**: what you nearly always do or never do is checked and repaired;
your habits that vary piece to piece are held within your own range and used to choose between drafts,
not to steer every piece toward your average. `build --voice none` or `--persona none` turns either off.

Counts are half of a voice. The other half is how you argue, what you concede, which figure carries a
piece, how a section closes, when a conversational aside stands: the rules discovery finds by reading,
not counting. **The taste reader** reads every output against those, twice (the second time with the
formatting stripped and the rules reordered, so a verdict that follows presentation is thrown away),
and every verdict must quote the passage it rests on. At first it only reports. You teach it what it
may do with `atelier taste --skill <name> --calibrate`: it shows a rule and a passage, never its own
verdict, and you answer followed, broken or can't tell. So that you never label a passage right after
seeing what the reader thought of it, about a third of readings are held back: acted on as usual, not
shown, and those are the ones you are asked about. Once its misses hold up against your answers (a
bar fixed in advance, in [docs/TASTE.md](docs/TASTE.md)), it can rewrite a passage it quotes, prefer the
draft that misses fewer of your rules, and block an optimizer candidate. It can never approve anything.
`atelier plan` shows which parts of good writing your standard covers, and which it doesn't. The
reader costs two or three model calls per output (on the discovery model unless `--reader-model` or
`ATELIER_READER_MODEL` names a cheaper one), and about three per draft once it acts; `--no-taste` turns
it off for a call.

`--drafts 3` writes three drafts and keeps the best: by the taste reader where it has earned it, then by
the counts. To give the model your whole
voice rather than rule fragments, ship one of your own pieces with the skill: `atelier build --name <name> --exemplar
./my-best-piece.md`. A host does not always deliver everything the CLI does; `atelier carriers --skill
<name> --host codex` reports the gap instead of hiding it.

**Check.** `atelier verify --skill <name> <file>` holds any text to the standard, with the span behind
every violation, and exits 1 when a REQUIRED rule is broken (2 when it could not check), so it can
gate a pipeline. It runs the same UNSOURCED check as the loop, against the skill's material. A
standard measures one kind of document: `build --class blog-post` records it, and `verify`, `invoke`
and the MCP tool refuse a text declared (`--class`) as another kind rather than hold a support reply to
thresholds read off essays. Declare your own checkable rules, including substitutions, with `atelier add
--statement "…" --kind BOUNDARY --measure "LEXICON:leverage=>use|utilize=>use"`. The same check is an
MCP tool (`atelier_verify`, `atelier_rules`, `atelier_list_skills`), so another agent writing your
support replies or docs can hold its own output to your standard. Rules about when or why are not
counted; `verify --taste` (and `taste: true` on the MCP tool) has the taste reader read them, and a
miss on a rule where it has earned VETO fails the check.

**Correct.** `atelier fix "<what was wrong>"`. No ids. If your standard already covers the complaint,
it is an implementation problem: Atelier tries a different way of carrying the rule, reruns your task,
and shows you both, blind. When the rule is measured, a count that says the new version is worse
rejects it on its own; a count that says it is better is shown to you as the count's view, and the new
version is installed only when you pick it, because one draft on one input cannot speak for what the
rules do not count. The count goes through the same promotion gate whether you pick or it does: a
pick of a version the count says is worse is refused, and the rule is amended instead if it is wrong.
To let a repair install itself, earn a regression floor, once: `atelier floor --skill <name> --setup`
proposes, from your own pieces, how much each measured rule may move, takes tasks from their titles,
drafts the current version once per task, and measures the floor's own sensitivity and false-alarm
rate. Once it catches at least 80% of planted regressions and its false alarms are bounded (at most 25%
at the upper 95% bound, over eleven or more trials), for this exact version, baseline and setup, a repair whose rule improves across
your tasks while every other rule you enforce holds is installed without asking. Each step is explained in
[docs/MEASURED-RULES.md](docs/MEASURED-RULES.md#the-regression-floor). If your standard does not cover it, that is an authority question and it is yours alone:
add as required, add as preferred, or do not add. `atelier amend` rewords, reweighs or re-targets a
rule as a recorded supersession. `atelier mine` reads every complaint and repair on record and lists
what keeps recurring: a gap no rule covers, a rule that keeps being missed, a rule the first draft keeps
breaking, a rule whose repairs keep being refused for changing meaning. Each comes with its remedy, and
nothing is added without you. `atelier tend --skill <name> [--auto]` runs all of this in one go (mine,
the reader's status, the floor, one optimizer round) and is meant for cron; `atelier status --skill
<name>` is the one-page view of where a skill stands.

Every rule has a key (`R-3f9a1c`) that survives new versions and rewording, so `--rule` takes the id,
the key or the rule's number, and `atelier history` shows which rules moved in each version. Repairs
the loop has made become "write this, not that" examples the next build ships with the skill. The
reference for every measured rule, and what the loop guarantees, is [docs/MEASURED-RULES.md](docs/MEASURED-RULES.md).

`atelier plan --skill <name>` shows every rule and the mechanism carrying it. `atelier --help` lists
everything; the design is in [docs/](docs/ARCHITECTURE.md).

| setting | what it does |
|---|---|
| `ATELIER_DATA` | where standards, skills and runs live (default `~/.atelier`) |
| `ATELIER_MODEL` | the model for every role, unless a more specific setting names one |
| `ATELIER_DISCOVERY_MODEL`, `ATELIER_TARGET_MODEL` | the model for one role: reading and diagnosing, or running the skill |
| `ATELIER_PROPOSER_MODEL` | the model discovery proposes rules with (a refusal falls back to the discovery model, said out loud) |
| `ATELIER_PROVIDER` | `anthropic` (default) or `openai-compatible`; per role as `ATELIER_DISCOVERY_PROVIDER` / `ATELIER_TARGET_PROVIDER` |
| `ATELIER_BACKEND`, `ATELIER_BASE_URL` | a named backend preset, and the endpoint for an OpenAI-compatible provider |
| `ATELIER_PRICE_IN`, `ATELIER_PRICE_OUT` | your per-million-token rates, when the shipped table does not know the model |
| `ATELIER_HOST` | `claude-code` (default) or `codex`: where a built skill is installed |
| `ATELIER_PROJECT_DIR` | the project a run belongs to, when not the current directory |

## Evidence

Atelier is an open research and product preview, and it reports its failures at the same volume as
its wins.

**Supported.** Ratification measurably changes what a model does: identical statements served as
ratified requirements produced the required structure 29 times out of 30, against 11 out of 30 as
unratified observations. On code review, a recovered standard beat raw examples on 15 of 17 held-out
cases with a fraction of the context, with three limits the [study](studies/MAINTAINER_A_STUDY_CLOSE.md)
attaches: the standard was adopted by a surrogate, not ratified by the author whose public work it
came from; a model judged, against the standard the winning arm had been given; and the
preregistered primary endpoint failed, so the result rests on a secondary one. The governance layer
has held under every test, including one where its author overrode a preregistered stop and the
override reproduced the gate's verdict at eight times the cost.

**Not supported.** Where few rules apply to any given case, a compiled standard scored exactly what a
bare model scored, a preregistered null left unrepaired: compilation kept *what* to say and lost *when
not to* say it. That is why answering-people skills weigh conditional rules conservatively. The
end-to-end repair loop lost its own earlier test, 9 of 16 against a bar of 12.

**Not yet measured.** The comparison that matters most, the shipped loop against a strong model's own
guide to the same corpus, and discovery's recall against an author's own hand-kept house standard. The
design is drafted in [studies/](studies/README.md) with a deterministic measured-rule table any other
system can be run against; it runs when its owner seals it. Point Atelier at work where your rules
apply most of the time; where the judgment is mostly about *when* a rule applies, it has no advantage
to claim yet.

Thirty-six preregistrations and results, sealed before generation and published as sealed, and one
draft awaiting its seal, are in [studies/](studies/README.md). Every figure quoted in a source comment is listed in
[MEASUREMENTS.md](MEASUREMENTS.md) with what it rests on. The suite is 103 files and 1556 tests, runs
offline, and drives the shipped binary through the whole loop.

## Contributing

The most valuable contribution is evidence, not a feature. Point Atelier at work where you know the
standard well, reserve some of it before discovery reads anything, then run the compiled skill
against what it has never seen. Tell us what it got right, what sounded plausible and was wrong, and
whether simply handing the model your examples did just as well. Negative results stay negative. See
[CONTRIBUTING.md](CONTRIBUTING.md).

Your data stays local: standards, evidence and outputs live under `~/.atelier` and leave only for the
inference provider you configure.
