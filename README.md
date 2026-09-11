# Atelier

**You own what good means. The model is the part you can replace.**

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

Atelier reads the decisions behind an expert's work, writes them down as an explicit versioned
standard, and compiles that standard into a skill a model can run. The standard is owned by a named
person. The implementation underneath it can be rebuilt forever without the target moving.

```text
expert work
    |  discover the decisions, with their conditions
candidate rules
    |  human authority: you rule on every one
StandardVersion      what good means                 <- yours, readable, versioned
    |  compile
SkillVersion         how one model implements it     <- disposable
    |  use, then correct
SkillVersion v2      same standard, better implementation
```

A model can propose what it sees. Only a person decides what belongs in the standard. Once the
standard is frozen, Atelier improves the implementation without quietly moving the target.

---

## How this differs from what you already have

This is the question everyone asks first, so it goes first.

Nearly every system in this space optimizes an artifact toward a score. Atelier is not an optimizer.
It is the layer that decides **what the score is allowed to be, and who may change it.**

### Against a strong model you already pay for

Pasting your best work into Claude or ChatGPT works, up to a point. The limit is not intelligence.
It is that the model has nowhere to keep your definition of good, and your examples never contained
it.

Show a model four documents that all open with a concrete scene and it learns *always open with a
scene*. What you actually do is *open with a scene when an abstract mechanism needs to become
tangible, and lead with the decision when the reader already has the context*. One of those is a
rule. The other is a tic. Examples show what you did and never show what you decided, so the
condition, the boundary and the reason are all invisible. The model fills them in by guessing,
differently on every run and on every model version. A stronger model guesses more fluently, not
less often.

| | a model on its own | Atelier compiled onto that model |
|---|---|---|
| where good is defined | implicitly, in a prompt or in memory | an explicit StandardVersion you ratified |
| when a rule applies | re-inferred from examples on every run | written down as an `applies when` condition |
| required vs preferred | not distinguished | declared by you, rule by rule |
| who can change the target | whoever edits the prompt | only you, through a recorded act |
| switching models | re-prompt and hope | recompile the same standard |

### Against skill and prompt optimizers: SkillOpt, SSO, GEPA

These are good systems, and Atelier is not competing with them. They answer a different question.

[SkillOpt](https://arxiv.org/abs/2605.23904) keeps the model frozen and trains a `skill.md` through
trajectory-driven edits behind a held-out selection gate. **SSO** (Self-Supervised Skill
Optimization, arXiv:2607.28777) does the same without labels at optimization time, accepting a
candidate when a judge's wins exceed its losses. [GEPA](https://arxiv.org/abs/2507.19457) evolves
prompt text by reflecting on rollouts in natural language and keeping a Pareto frontier of
candidates.

All three share one shape: a frozen model, a text artifact, a search strategy, and a scoring
function. They differ in how they search and when they accept. **None of them asks where the
objective came from.** They assume it is given, which on a benchmark it is. Accuracy is not a matter
of taste, and that is exactly why they can report benchmark gains.

For taste there is no such function. Nobody can write `reward(essay) -> 0.0 | 1.0` for *sounds like
me*. The hard part is not the search. It is producing an objective at all, from a person who cannot
state their own rules, and then stopping the optimizer from editing it.

|  | what it optimizes | where the objective comes from | who may change the objective |
|---|---|---|---|
| GEPA | prompt text, by reflection and Pareto search | a metric you supply | the metric's author |
| SkillOpt | a skill file, by patch edits | a validation gate you supply | the gate's author |
| SSO | a skill, without labels | the judge's own win margin | the judge |
| **Atelier** | the implementation only | **a human ratifies every rule** | **only the named owner** |

That last row is the whole product. Atelier's correction loop can swap how a rule is carried, rerun
your task and install the winner, and while doing it **asserts** that the standard's hash is
unchanged rather than logging that it hoped so. SSO's acceptance rule is the one Atelier explicitly
refuses in code: a single instrument should not both produce the optimization signal and hold the
authority to act on it. That refusal lives in `core/convergence/promotion.ts`, not in marketing.

An optimizer needs an objective, and somebody has to own it. Hand any of these systems a ratified
StandardVersion and they get a better input. Atelier sits upstream of them.

**Not yet done:** Atelier has not been benchmarked against SkillOpt, SSO or GEPA. The difference
above is architectural, and you can verify it by reading the code. It is not a performance claim.

### Against fine-tuning and owning the weights

Personal AI is a real movement. River AI raised $1.1B arguing intelligence should be yours rather
than rented, and that premise is correct. But "own your AI" hides an ambiguity, and everything turns
on which noun it attaches to.

Owning weights is not the same as owning the definition of good those weights were moved toward. If
a fine-tune's picture of you drifts there is no artifact to inspect, because you cannot diff weights
against your intent. You can diff a StandardVersion.

There is a practical consequence too. A standard carries no model identity, so it compiles onto a
frontier API today and a local open model tomorrow with no retraining and no migration. You are not
required to move your stack in order to keep your standard.

### Why the output stays consistent

Given the same standard, a compiled skill should make the same decisions across new situations and
repeated generations. That does not come from a better model. It comes from removing the decisions
the model would otherwise have to guess at.

1. **Rules carry their conditions.** Each rule is typed as something to do or avoid, with the
   situation it applies in, so the model stops sampling over readings of your examples.
2. **Only what you declared required instructs.** A discovered observation is shown but does not
   direct. Twelve identical statements on 30 unseen topics produced the required structure 11 times
   as unratified observations and 29 times as ratified requirements, with everything but one
   governance field byte-identical.
3. **Some rules never reach the model.** A required rule about output shape compiles to a schema the
   runtime holds, so there is nothing left to sample.
4. **The target cannot drift.** The correction loop asserts rather than logs that the hash is
   unchanged, so consistency holds across versions and not only within a run.

Consistency is not correctness. A standard can reproduce the wrong thing very reliably, which is why
the blinded held-out test matters more than any consistency figure.

### The one-sentence version

Every other approach keeps your judgment somewhere you cannot read: a prompt, a pile of memory, a
scalar reward, or a set of weights. None of them can tell you when the target drifted, because none
of them ever wrote it down.

---

## The problem it solves

Everyone at your company can name the person whose work is the standard. Nobody can say what that
person actually does. Ask, and you get honest, useless answers: *I just know when a claim is
earned.* *It depends.* The judgment is real, it was never learned as rules, and it does not survive
their notice period or your fourth hire.

This bites anywhere two qualified people could make different defensible choices and one team needs
those choices made consistently.

| | the judgment that gets lost |
|---|---|
| Product and strategy | which contradiction matters, when a claim is earned |
| Code review | when duplication is fine, when an abstraction is premature |
| Legal | which ambiguity is intentional, which risk deserves escalation |
| Research | which evidence is decision-grade, when a conclusion outruns the data |
| Writing | what to foreground, what to omit, how directly to argue |

---

## Install

```bash
git clone https://github.com/yannickYamo/atelier
cd atelier && npm install && npm run build
npm link                    # puts `atelier` on your PATH
```

Node 22 or later. No account, no telemetry. CI installs the packed tarball into a clean project on
every push, so the path above is tested rather than promised. The npm name `@yannickyamo/atelier` is
reserved but **not published yet**; until it is, the source install is the only real one.

An `ANTHROPIC_API_KEY` (or any OpenAI-compatible backend via `--provider openai-compatible
--base-url ...`) is needed only for steps that call a model. Stating your own rules and compiling
them costs nothing.

---

## Create, Use, Correct

Three verbs. Everything else is machinery you can inspect and never have to operate.

### Create

Two ways in, one system.

```bash
# "I know what I want": state it
atelier skill "answers should lead with the action, number the steps when there
               are steps, and never end with an offer of more help"

# "I know good when I see it": show it your best work
atelier skill --from ./my-best-work --reserve held-out.md
```

Atelier splits what you gave it into rules and **compiles nothing until you say yes**. What you are
shown is saved byte for byte, so a later `--yes` accepts exactly that with no second model call.

Rules mechanically grounded in your own words become yours and instruct the model. Anything that is
the machine's reading is labelled as such and is shown to the model without instructing it, until
you declare otherwise. The model's own opinion of its faithfulness is never an authority input.

```text
3 rule(s) from what you said, for writing:

  1. [do  ] Lead with the action.
  2. [do  ] Number the steps.
      applies when: the answer has more than one step
  3. [don't] Never end with an offer of more help.

3 of these are yours, in your own words.
```

On the taste path you rule on every proposal (mine, not mine, in my words, only when) plus the one
question that decides what binds: how much does it matter?

### Use

```bash
/my-skill write the launch post        # Claude Code, recorded by the plugin's hooks
atelier invoke --skill my-skill "..."  # or the CLI; same record either way
```

| host | invoke |
|---|---|
| Claude Code | `/my-skill` |
| Codex | `$my-skill` |

Host-native execution and `atelier invoke` do not always deliver the same carriers. Atelier reports
the difference instead of silently weakening your standard: `atelier carriers --skill my-skill
--host codex`.

### Correct

```bash
atelier fix "the answer buried the recommendation"
```

No ids, no hashes. `fix` resolves your latest run, prints which one it picked, then routes the
complaint itself:

- **Your standard already covers it.** That is an implementation problem. Atelier builds one
  alternative implementation of that rule, reruns your task, and shows you a blinded A/B. One
  keystroke installs the winner, and the StandardVersion hash is asserted unchanged throughout. A
  rejected mechanism is never proposed again for that rule on that model.
- **Your standard does not cover it.** That is an authority question, and it is yours alone. Atelier
  shows the proposed rule and asks: add as required, add as preferred, or do not add. Approving
  mints the superseding StandardVersion with your complaint recorded as its reason, compiles, and
  installs, inside the one command. A refusal is remembered and not re-asked.

That single approval is the product, not friction. A machine may propose. Only you decide what good
means.

---

## Looking inside

Atelier is meant to be argued with, so every decision it makes is inspectable.

```bash
atelier plan --skill focus        # per rule: how the compiler carried it
```

```text
id   source                   applies         carrier          watched    reaches the model
------------------------------------------------------------------------------------------
x1   you wrote it             everywhere      PROSE            instructs  SKILL.md
x2   you wrote it             on a condition  PROSE            instructs  SKILL.md
```

A rule can become an instruction the model reads, a check against the finished draft, an example
nobody is told to follow, a schema the runtime enforces, or nothing at all. A requirement that
reaches the model through nothing looks identical to every other one in your standard. Here it says
so.

```bash
atelier contract --skill focus --bare    # does the skill beat no skill at all?
atelier reference --skill focus          # blinded test against work you reserved
```

`contract` builds challenges from your standard's own typed obligations: a positive rule owes a case
where the behaviour must appear, a prohibition owes one where it must not, and a conditional rule
owes a case where its condition is **absent**, the test that catches a rule firing everywhere.
Results report counts and never rates, because these are constructed challenges rather than samples
of real work. If `BARE` matches or beats your compiled skill, Atelier says so and suggests you may
not need a skill here. That answer is worth more than an artifact nobody required.

More depth, kept out of the way:

| | |
|---|---|
| [How Atelier learns taste](docs/DISCOVERY.md) | Reading decisions out of work, and why recurrence is not a standard |
| [Human authority](docs/AUTHORITY.md) | The decision verbs, materiality, and what a person alone may do |
| [From standard to skill](docs/COMPILATION.md) | Carriers, and how a requirement reaches a model |
| [The model is replaceable](docs/PORTABILITY.md) | Why the standard carries no model identity |
| [How a skill improves](docs/CONVERGENCE.md) | Getting better without moving the target |
| [Architecture](docs/ARCHITECTURE.md) | The five questions a requirement separates |
| [Glossary](docs/GLOSSARY.md) | Terms the source comments use, including SSO and GEPA |

---

## What is proven and what is not

Atelier is an open research and product preview. Being straight about this is part of the pitch: a
tool claiming to make judgment inspectable should not ask you to take its own results on faith.

**Enforced by the architecture, checkable in the code:**

- machine-discovered behaviour does not become authority on its own
- inference from someone else's public work cannot masquerade as expert ratification
- standard and implementation are versioned separately, and runtime identity separately again
- feedback can trigger an implementation repair but cannot redefine the standard
- delivery claims require an execution mechanism, not a file sitting on disk

**What the studies support.** Ratification changes model behaviour, measurably, by the 11-of-30
against 29-of-30 result described above. Against raw examples on code review, a recovered standard
won 15 of 17 held-out cases while using a fraction of the context.

**What failed, stated as plainly.** On early-stage pricing, where few rules apply to any given case,
a compiled standard scored exactly what a bare model scored: a preregistered null, unrepaired. The
end-to-end repair loop was tested on its own terms and lost, 9 of 16 against a bar of 12. One
published figure was withdrawn after a pooled binomial treated nested observations as independent. A
study with the first external expert stopped at its own preregistered gate rather than spend the
reviewer's time on a result nobody could interpret.

**Where to point it.** Work where your rules apply most of the time, which is where the positive
results live: editorial standards, a house voice, code review, a report format. Where your judgment
is mostly about *when* a rule applies rather than what it says, this has no advantage to claim yet.

Thirty-six preregistrations and results, sealed before generation and published as sealed, are in
[studies/](studies/README.md). Every figure quoted in a source comment is listed in
[MEASUREMENTS.md](MEASUREMENTS.md) with what it rests on. The test suite is 89 files and 1264 tests,
runs offline with no API key, and drives the shipped binary through the whole loop.

---

## Command reference

| command | what it does |
|---|---|
| `skill "<rules>"` / `skill --from <path>` | the front door. Proposes, waits for you, then compiles |
| `create <path>` | fast first pass: read, reserve, discover, compile. Does **not** ratify, so the skill it builds instructs nothing until you rule |
| `intake <path>` | read and seal a corpus without discovering yet |
| `discover` | propose candidate decisions from a sealed corpus |
| `pending` | show the candidates, with evidence and counterfactuals, before you rule |
| `ratify --decisions <json>` / `ratify-one --id <id>` | rule on every candidate in one batch, or on one |
| `add --statement <text> --kind GENERATIVE\|BOUNDARY` | add a rule discovery never proposed. `--kind` is asked, never guessed |
| `ratify-close [--reason <why>]` | mint the StandardVersion from what you kept |
| `build --name <name>` | compile the standard into a skill and install it |
| `invoke --skill <name> "<task>"` | run it, or run a candidate without adopting it |
| `fix "<what was wrong>"` | the one correction path: diagnose, then repair or ask |
| `plan` / `inspect` / `history` / `rollback` | what it decided, what it serves, every version, how to go back |
| `contract [--bare] [--repair]` | constructed challenges from your own obligations |
| `reference [--score --labels <json>]` | the blinded held-out test |
| `amend --rule <id> --statement <text> --reason <why>` | change what a rule means. Mints a superseding version |
| `confirm` / `promote` / `reject` / `revert` | rule on an inferred behaviour, adopt or refuse a candidate, undo a build |
| `sharpen` / `answer` | probe a rule that claims to hold everywhere |
| `judgements` / `feedback` | what you said when you ruled, and a one-word verdict on a run |
| `check` / `profiles` / `carriers` | verify a backend, see what is verified, see what each host delivers |
| `status` / `abort` | where the run is, and how to abandon it |

Flags worth knowing: `--yes --name <n>` accepts exactly what you were shown; `--pick a|b|same`
settles a blinded comparison; `--add required|preferred` and `--skip` rule on a proposed addition;
`--reserve <file>` holds work back and is only available at intake; `--public-source --source-author
"<name>"` learns from someone else's public work with authority capped accordingly; `--cap <usd>`
and `--max-calls <n>` bound a run; `--discovery-model` and `--target-model` configure the two halves
separately.

---

## Your data

Local by default. No telemetry, no account. Standards, evidence and generated artifacts stay on your
machine. Data leaves it only when sent to inference providers you configure. With the Claude Code
plugin installed, a `/skill` use is recorded locally too, because that record is what lets a later
correction know what it is correcting.

```text
~/.atelier
|- skills/<name>/                    compiled skills, shared across projects
|- sessions/<project>-<hash>.json    one run in flight per project
\- runs/<project>-<hash>/            the sealed corpus list, pending standard, ledger
```

The run in progress is per-project, keyed by working directory, so a corpus started in one repository
does not disturb a half-finished ratification in another.

---

## Contributing

The most valuable contribution is not a feature. It is evidence.

Point Atelier at work where you know the standard well, reserve some of it before discovery reads
anything, then run the compiled skill against what it has never seen. Tell us what it got right,
what sounded plausible and was wrong, which rules became caricatures, and whether simply handing the
model your examples did just as well. Negative results stay negative. See
[CONTRIBUTING.md](CONTRIBUTING.md).
