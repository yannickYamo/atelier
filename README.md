# Atelier

**You own what good means. The model is the part you can replace.**

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

## Why this exists

Every AI system that learns from you keeps what it learned somewhere you cannot read: a prompt, a
pile of memory, a scalar reward, a set of weights. None of them can tell you when your definition
of good has drifted, because none of them ever wrote it down.

Atelier writes it down. It reads the decisions behind an expert's work, turns them into an explicit
standard the expert ratifies rule by rule, and compiles that standard into a skill any model can
run. The standard is owned by a named person and versioned like code. The implementation under it
can be rebuilt forever without the target moving.

```text
expert work
    |  discover the decisions, with their conditions
candidate rules
    |  you rule on every one
StandardVersion      what good means                 <- yours, readable, versioned
    |  compile
SkillVersion         how one model implements it     <- disposable
    |  use, then correct
SkillVersion v2      same standard, better implementation
```

A model may propose. Only a person decides what belongs in the standard.

## The problem it solves

Everyone at your company can name the person whose work is the standard. Nobody can say what that
person actually does. Ask, and you get honest, useless answers: *I just know when a claim is
earned.* *It depends.* The judgment is real, it was never learned as rules, and it leaves with them.

Handing their work to a model as examples does not recover it. Show a model four documents that all
open with a scene and it learns *always open with a scene*. What the expert does is *open with a
scene when an abstract point needs to become tangible, and lead with the decision when the reader
already has the context*. One of those is a rule. The other is a tic. Examples show what the expert
did and never what they decided, so the condition and the boundary are invisible and the model
guesses them, differently on every run. A stronger model guesses more fluently, not less often.

This bites anywhere two qualified people could make different defensible choices and one team needs
those choices made consistently: editorial voice, code review, legal drafting, research standards,
strategy memos.

## How it compares

Nearly every system in this space optimizes an artifact toward a score. Atelier is not an optimizer.
It is the layer that decides **what the score is allowed to be, and who may change it.**

### Against a strong model you already pay for

| | a model on its own | Atelier compiled onto that model |
|---|---|---|
| where good is defined | implicitly, in a prompt or memory | an explicit StandardVersion you ratified |
| when a rule applies | re-inferred from examples on every run | written down as an `applies when` condition |
| required vs preferred | not distinguished | declared by you, rule by rule |
| who can change the target | whoever edits the prompt | only you, through a recorded act |
| switching models | re-prompt and hope | recompile the same standard |

### Against skill and prompt optimizers: SkillOpt, SSO, GEPA

[SkillOpt](https://arxiv.org/abs/2605.23904) trains a `skill.md` through trajectory-driven edits
behind a validation gate. **SSO** (Self-Supervised Skill Optimization, arXiv:2607.28777) does it
without labels, accepting a candidate when a judge's wins exceed its losses.
[GEPA](https://arxiv.org/abs/2507.19457) evolves prompt text by reflecting on rollouts.

All three share one shape: a frozen model, a text artifact, a search strategy, and a scoring
function. **None of them asks where the objective came from.** On a benchmark it is given, because
accuracy is not a matter of taste. For taste there is no such function. Nobody can write
`reward(essay) -> 0.0 | 1.0` for *sounds like me*. The hard part is not the search. It is producing
an objective at all, from a person who cannot state their own rules, and then keeping the optimizer
from editing it.

|  | what it optimizes | where the objective comes from | who may change it |
|---|---|---|---|
| GEPA | prompt text | a metric you supply | the metric's author |
| SkillOpt | a skill file | a validation gate you supply | the gate's author |
| SSO | a skill, no labels | the judge's own win margin | the judge |
| **Atelier** | the implementation only | **a human ratifies every rule** | **only the named owner** |

That last row is the product. Atelier's correction loop swaps how a rule is carried, reruns your
task and installs the winner, and while doing so **asserts** the standard's hash is unchanged. SSO's
acceptance rule, one instrument both producing the signal and holding the authority to act on it,
is the rule this codebase explicitly refuses in `core/convergence/promotion.ts`. Hand any of these
optimizers a ratified StandardVersion and they get a better input. Atelier sits upstream of them.

Atelier has not been benchmarked against any of them. The difference is architectural and
verifiable by reading the code. It is not a performance claim.

### Against fine-tuning and owning the weights

Owning weights is not the same as owning the definition of good those weights were moved toward. If
a fine-tune's picture of you drifts there is no artifact to inspect, because you cannot diff weights
against your intent. You can diff a StandardVersion. And because a standard carries no model
identity, it compiles onto a frontier API today and a local open model tomorrow with no retraining.

## How to use it

```bash
git clone https://github.com/yannickYamo/atelier
cd atelier && npm install && npm run build && npm link
```

Then, in Claude Code, install the plugin. Its hooks are what record a `/my-skill` use so that
`atelier fix` can find it:

```text
/plugin marketplace add yannickYamo/atelier
/plugin install atelier@atelier
```

Node 22 or later. No account, no telemetry. An `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN` behind
a gateway, or any OpenAI-compatible backend via `--provider openai-compatible --base-url ...`) is
needed only for steps that call a model. The npm package is not published yet; the source install is
the real one.

| setting | what it does |
|---|---|
| `ATELIER_DATA` | where standards, skills and runs live (default `~/.atelier`) |
| `ATELIER_MODEL` | the model for every role, unless a more specific setting names one |
| `ATELIER_DISCOVERY_MODEL`, `ATELIER_TARGET_MODEL` | the model for one role: reading and diagnosing, or running the skill |
| `ATELIER_PROPOSER_MODEL` | the model discovery proposes rules with; wins over `ATELIER_MODEL` for that one call |
| `ATELIER_PROVIDER` | `anthropic` (default) or `openai-compatible`; per role as `ATELIER_DISCOVERY_PROVIDER` / `ATELIER_TARGET_PROVIDER` |
| `ATELIER_BACKEND`, `ATELIER_BASE_URL` | a named backend preset, and the endpoint for an OpenAI-compatible provider |
| `ATELIER_PRICE_IN`, `ATELIER_PRICE_OUT` | your per-million-token rates, when the shipped table does not know the model |
| `ATELIER_HOST` | `claude-code` (default) or `codex`: where a built skill is installed |
| `ATELIER_PROJECT_DIR` | the project a run belongs to, when not the current directory |

`atelier check` verifies the configured backend actually works before you spend on it.

Three verbs. Everything else is machinery you can inspect and never have to operate.

**Create.** A folder of your best work, and a sentence saying what the skill is for:

```bash
atelier new ./my-best-work "write me a blog post in the voice and style of these"
atelier new ./support-replies "customer support needs to always answer this way"
atelier new ./approved-copy "ensure all content outputs follow these"
```

Atelier holds some of the work back before anything reads it (when there are six or more pieces;
name your own with `--reserve`), reads the rest for the decisions
behind it, and shows you every rule it found on one screen, strongest evidence first, each with the
ruling the evidence suggests and why ("followed in 4 of 5 pieces it never read"). **Nothing is
compiled until you accept.** Press Enter to accept them as shown, or change any on the same line
(`p3=reject p5=preferred`). A REQUIRED rule instructs the model; the others are shown to it as
examples. A rule that needs material only you have ("the real figures") is marked, and the skill
asks for it instead of inventing it. Accepting builds and installs the skill. Run the same command
again to pick up wherever you stopped.

If you would rather state the rules than show them: `atelier skill "lead with the action, number the
steps when there are steps"`. Rules grounded in your own words instruct the model; anything that is
the machine's reading is labelled as such and shown without instructing, until you declare otherwise.

**Use.** Invoke it like any skill:

```bash
/my-skill write the launch post        # Claude Code, recorded by the plugin's hooks
atelier invoke --skill my-skill "..."  # or the CLI
```

A host does not always deliver every carrier the CLI does. Atelier reports the gap instead of
silently weakening your standard: `atelier carriers --skill my-skill --host codex`.

**Check.** Hold any text to the standard, a draft, a reply, a page someone else wrote:

```bash
atelier verify --skill my-skill draft.md
```

Every rule that carries a measurement (sentence and paragraph length, hedging, words you never use,
or a list you declare with `add --measure LEXICON:leverage|utilize`) is counted against the text, and
each violation is printed with the span that caused it. It exits non-zero when a REQUIRED rule is
broken, so it can gate a pipeline. Rules about when or why are listed as not checked: those stay a
person's call.

**Correct.** Say what was wrong, in your own words:

```bash
atelier fix "the answer buried the recommendation"
```

No ids, no hashes. `fix` resolves your latest run and routes the complaint itself. If your standard
already covers it, that is an implementation problem: one alternative, a rerun, a blinded A/B, and
one keystroke installs the winner with the standard's hash asserted unchanged. If your standard does
not cover it, that is an authority question and it is yours alone: add as required, add as
preferred, or do not add. Approving mints, compiles and installs the new version inside the one
command.

To see what the compiler decided and why, `atelier plan --skill <name>` lists every rule with the
mechanism carrying it. To check the skill against no skill at all, `atelier contract --skill <name> --bare`.
To test it blind against work you reserved, `atelier reference --skill <name>`. The full command list is
`atelier --help`; the design is in [docs/](docs/ARCHITECTURE.md).

## Results so far

Atelier is an open research and product preview, and it reports its failures at the same volume as
its wins.

**Supported.** Ratification measurably changes what a model does: identical statements served as
ratified requirements produced the required structure 29 times out of 30, against 11 out of 30 as
unratified observations. On code review, a recovered standard beat raw examples on 15 of 17 held-out
cases with a fraction of the context, with three limits the [study](studies/MAINTAINER_A_STUDY_CLOSE.md)
attaches: the standard was adopted by a surrogate, not ratified by the author whose public work it
came from; a model judged, against the standard the winning arm had been given; and the
preregistered primary endpoint failed, so the result rests on a secondary one. The governance layer has held under every test, including one
where its author overrode a preregistered stop and the override reproduced the gate's verdict at
eight times the cost.

**Not supported.** Where few rules apply to any given case, a compiled standard scored exactly what
a bare model scored, a preregistered null left unrepaired. The end-to-end repair loop lost its own
test, 9 of 16 against a bar of 12. The comparison that matters most, a ratified standard against a
strong model's own summary of the same corpus, has not produced a number yet. Point Atelier at work
where your rules apply most of the time. Where the judgment is mostly about *when* a rule applies,
it has no advantage to claim.

Thirty-six preregistrations and results, sealed before generation and published as sealed, are in
[studies/](studies/README.md). Every figure quoted in a source comment is listed in
[MEASUREMENTS.md](MEASUREMENTS.md) with what it rests on. The suite is 91 files and 1298 tests,
runs offline, and drives the shipped binary through the whole loop.

## Contributing

The most valuable contribution is evidence, not a feature. Point Atelier at work where you know the
standard well, reserve some of it before discovery reads anything, then run the compiled skill
against what it has never seen. Tell us what it got right, what sounded plausible and was wrong,
and whether simply handing the model your examples did just as well. Negative results stay
negative. See [CONTRIBUTING.md](CONTRIBUTING.md).

Your data stays local: standards, evidence and outputs live under `~/.atelier` and leave only for
the inference provider you configure.
