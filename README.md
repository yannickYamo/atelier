# Atelier

**Turn expert taste and judgment into an executable AI skill.**

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

Atelier learns the decisions behind an expert's work, writes them down as an explicit, versioned
standard, and compiles that standard into the smallest skill a model needs to reproduce it on new work.

The point is to treat a standard the way you already treat a schema or a test: versioned, owned by a
named person, compiled for whatever runtime is current, and changed only through an explicit act. Your
implementations can change forever underneath it. What good means moves only when you move it.

The thesis is simple. Expertise is more than knowledge, and the hard part is the judgment around it.
What matters, what to ignore, which trade-off wins, when a rule bends, and where the boundary sits.
That judgment usually lives in examples, corrections, habits, and thousands of small decisions an
expert makes without ever writing them down.

**Atelier makes that judgment explicit.**

```text
expert work
    ↓ discover contextual decisions
candidate standard
    ↓ human authority
StandardVersion        what good means
    ↓ compile
SkillVersion           how one model implements it
    ↓ use + evidence
SkillVersion v2        same standard, better implementation
```

**The expert owns what good means. Atelier owns the implementation.**

A model can propose what it sees. Only a person can decide what belongs in the standard. Once a
standard is frozen, Atelier can improve the implementation without quietly moving the target.

---

## The problem

Everyone in your company can name the person whose work is the standard. The strategy memo everyone
copies. The code review that catches the thing nobody else sees. The contract that closes.

Nobody can say what that person actually does.

Ask them and you get honest, useless answers. *I just know when a claim is earned.* *It depends.*
*You'd see it if I showed you.* They are not being evasive. The judgment is real and it has never
been written down, because it was never learned as rules. It accumulated.

So it stays with them. It does not survive their calendar, their notice period, or the fourth person
you hire. And when you hand their work to a model as examples, the model learns the wrong thing.

Show it four documents that all open with a concrete scene and it learns:

> Always open with a scene.

What the expert actually does is:

> Use a concrete scene when an abstract mechanism needs to become tangible. Lead directly with the
> decision when the reader already understands the context.

One of those is a rule. The other is a tic. The model cannot tell them apart, because **the examples
show what the expert did and never show what they decided.** The condition is invisible. The boundary
is invisible. The reason is invisible. You get a confident imitation with the judgment stripped out,
and it fails in the exact place judgment was needed.

That is the replication problem, and it does not go away with a better model. A stronger model
produces a more fluent imitation of the same missing thing.

This is the gap anywhere two qualified people could make different defensible choices and one team
needs those choices made consistently.

| | the judgment that gets lost |
|---|---|
| **Product and strategy** | which contradiction matters, when a claim is earned, what belongs above the fold |
| **Code and code review** | when duplication is acceptable, when an abstraction is premature, which shortcut is harmless and which becomes debt |
| **Legal work** | which ambiguity is intentional, which risk deserves escalation, where flexibility is worth preserving |
| **Research and diligence** | which evidence is decision-grade, what should stay uncertain, when a conclusion outruns the data |
| **Writing** | what to foreground, what to omit, how directly to argue, where tone or form is part of the standard |

Every approach to this problem loses the target somewhere. A prompt describes behaviour and cannot
say when the behaviour stops applying. Memory accumulates preferences until nobody can say which ones
define the standard. An optimizer improves against a score until the score becomes the objective. A
fine-tune buries the decisions in weights where no one can read, argue with, or version them.

They share one flaw. **None of them ever writes down what good means, so nothing can tell you when it
has drifted.**

Atelier starts somewhere else. What exactly does this expert mean by good, who has the authority to
change that definition, and can I read it?

---

## What makes Atelier different

Most systems collapse the definition of good into the machinery that produces it. A prompt gets tuned
against a score until the score becomes the objective. Preferences accumulate through feedback until
nobody can say which ones define the standard. A self-improving agent gets better according to an
evaluator until the evaluator's idea of better quietly replaces the expert's.

Atelier keeps the target and the implementation separate.

**The StandardVersion** is the human-owned definition of good. It captures the expert's knowledge,
judgment, taste, and the boundaries around them.

- what they consistently choose
- when that choice applies
- what they deliberately avoid
- what is required versus merely preferred
- which observed forms are essential, and which are just one way of doing it

The system may discover candidates. It cannot make them authoritative on its own.

**The SkillVersion** is the model-specific implementation of that standard. Atelier selects the
smallest set of instructions, examples, contracts, checks and routing needed to carry the standard into
a particular runtime.

A stronger model may need less scaffolding. A smaller model may need more. A new runtime may support a
better carrier altogether. The StandardVersion stays where it is unless a person moves it.

That separation is the product. Expert judgment becomes an asset you can inspect, challenge, version,
transfer, and improve against, without giving the optimizer authority to redefine it.

---

## How it works, in depth

The README is the front door. These are the parts a reader evaluating the design will want, kept out
of the way of a reader who just wants to run it.

| | |
|---|---|
| [How Atelier learns taste](docs/DISCOVERY.md) | Reading decisions out of work, and why recurrence is not a standard |
| [Human authority](docs/AUTHORITY.md) | The decision verbs, materiality, and what a person alone may do |
| [From standard to skill](docs/COMPILATION.md) | Carriers, and how a requirement reaches a model |
| [The model is replaceable](docs/PORTABILITY.md) | Why the standard carries no model identity |
| [How a skill improves](docs/CONVERGENCE.md) | Getting better without moving the target |
| [Architecture](docs/ARCHITECTURE.md) | The five questions a requirement separates |
| [Preregistrations and study records](studies/README.md) | Every study, including the nulls |
| [Measurements in source comments](MEASUREMENTS.md) | Every figure quoted in a comment, and what it rests on |
| [Glossary](docs/GLOSSARY.md) | Terms and symbols the comments use |

---

## Quickstart

There are two ways in, and they end at the same compiler. Which one you want depends on a single
question: **can you already say what good means here?**

### If you can state your rules

No corpus, no API key, no discovery. You are exercising authority, not supplying evidence about
yourself, so Atelier records the rules as yours and compiles them.

```bash
atelier add --statement "Lead with the next action, before any explanation." \
            --kind GENERATIVE --applies-when GENERAL
atelier add --statement "Number multi-step work so the reader can stop and resume." \
            --kind GENERATIVE --applies-when "the answer has more than one step"
atelier add --statement "Never open with a preamble that restates the question." \
            --kind BOUNDARY --applies-when GENERAL

atelier ratify-close --work-type writing
atelier build --name focus

# What did it actually decide, and why?
atelier plan --skill focus
```

```text
id   source                   applies         carrier          watched    reaches the model
------------------------------------------------------------------------------------------
x1   you wrote it             everywhere      PROSE            instructs  SKILL.md
x2   you wrote it             on a condition  PROSE            instructs  SKILL.md
x3   you wrote it             everywhere      PROSE            instructs  SKILL.md
```

That table is the difference between a generated file and a compiled one. A rule can become an
instruction the model reads while writing, a check against the finished draft, an example nobody is
told to follow, a schema the runtime enforces, or **nothing at all** — and `plan` is where you see
which, per rule, with the reason. A requirement that reaches the model through nothing looks
identical to every other one in your standard; here it says so.

### Then check whether the implementation actually carries it

```bash
atelier contract --skill focus            # generate, seal, run the search half
atelier contract --skill focus --holdout  # once, at the end
```

Your standard decides what must be tested, not a model. Each rule places **obligations** derived from
its own typed fields: a positive rule owes a case where the behaviour must appear, a prohibition owes
one where it must not, a conditional rule owes a case where its condition is **absent** — the test
that catches a rule firing everywhere — and rules that both apply everywhere owe an interaction,
which is where skills usually break. A model is then asked to invent a realistic *situation* for each
obligation. It is never asked what passing means.

Two kinds of looking are reported separately and never merged:

```text
decided: 2 passed, 0 failed          (a machine-checkable shape; a verdict)
read by an unqualified reader: 5 appear to pass, 1 appears to fail
                                      (guides diagnosis; certifies nothing)
```

**These are constructed challenges, not samples of real work.** They tell you whether the
implementation carries the standard you authored. They do not estimate how often it will succeed in
deployment, and no confidence interval over them would mean anything — which is why the result
carries counts and no rate. Evidence about deployment comes from `atelier reference`, run against an
expert's real held-out work.

### Did the skill change anything, and did repairing it help?

```bash
atelier contract --skill focus --bare --repair
```

```text
                                  BARE      INITIAL   CANDIDATE
------------------------------------------------------------
decided — passed                  0         0         0
decided — failed                  0         0         0
unqualified read — appears ok     2         5         6
unqualified read — appears wrong  4         1         0
nothing looked                    3         3         3

  what the standard added (initial - bare): decided n/a, unqualified read +3
  what optimization added (candidate - initial): decided n/a, unqualified read +1
```

`BARE` is the same task, tools, schema and token budget with **no Atelier-derived carrier at all** —
so the two columns differ in exactly one thing, and a test enforces that as Atelier grows more
carriers. It is instrumentation, not a participant: it never reaches the diagnosis, because what to
repair is a function of your standard and what the implementation did. A rule the runtime already
satisfies is still a rule the implementation owes, since the next model may not satisfy it.

If `BARE` matches or beats the compiled skill, Atelier says so, and suggests you may not need a skill
here. That answer is worth more than an artifact nobody required.

`--repair` escalates a rule's carrier when a case shows the implementation missed it, rebuilds, and
re-runs. **Only an implementation miss may repair an implementation** — a gap in the standard is a
proposal for its owner, not a change to make, and a case naming two rules cannot attribute the miss
to either. Nothing is promoted. A loop that runs, measures, and changes nothing is a closed loop
rather than a failed one.

`--kind` is asked rather than defaulted, because there is no safe guess: a rule meaning *do this*
recorded as a prohibition reaches the model as a rule against doing it, and nothing would tell you.

The close reports `discovered 0%`. That is accurate rather than a shortfall — the machine found none
of it because you wrote all of it — and it is printed so a standard nobody observed can never later
be mistaken for one that was.

### If you can only recognise good work when you see it

This is the harder case and the one the research is about. Point Atelier at the work.

```bash
git clone https://github.com/yannickYamo/atelier
cd atelier && npm install && npm run build
npm link                       # puts `atelier` on your PATH

export ANTHROPIC_API_KEY=sk-...

# 1. Read expert work, and reserve evidence before discovery sees it.
atelier create ./goldens --reserve held-out.md

# Learning from someone else's public work?
atelier create ./their-repo \
  --public-source \
  --source-author "their name"

# 2. Inspect the candidate standard.
atelier pending

# 3. Decide what actually belongs. One batch, every proposal answered.
#    A REQUIRED rule that is really about the SHAPE of the output carries a `shape`,
#    and the runtime holds that shape instead of asking the model to.
atelier ratify --decisions '[
  {"id":"p1","decision":"APPROVE","materiality":"REQUIRED"},
  {"id":"p2","decision":"REJECT"},
  {"id":"p3","decision":"APPROVE","materiality":"REQUIRED",
   "shape":{"verdict":{"type":"string"},"confidence":{"type":"number"}}}
]'
atelier ratify-close

# 4. Compile it.
atelier build --name my-skill

# 5. Use it.
atelier invoke --skill my-skill "Write the recommendation."
```

A small corpus is enough to draft a provisional standard. It is not evidence that the standard is
complete or validated. Atelier keeps those two questions separate.

Compiled skills can also be installed into supported agent hosts.

| host | invoke |
|---|---|
| Claude Code | `/my-skill` |
| Codex | `$my-skill` |

Host-native execution and `atelier invoke` do not always enforce the same carriers. Atelier reports the
difference instead of silently weakening the standard. Run `atelier carriers --skill my-skill --host
codex` to see it.

---

## What to expect

Atelier is an open research and product preview. The full pipeline runs end to end today, and one honest caveat on that sentence: the automated suite covers the governance spine and the CLI surface, while the path from a folder of work to a served generation is exercised by hand rather than by a test that calls a model.

```text
corpus
  → discovery
  → human ratification
  → StandardVersion
  → compiled SkillVersion
  → execution
  → evidence
  → governed improvement
```

The architecture already enforces the parts that should not depend on a research result.

- machine-discovered behaviour does not become authority by itself
- public-source inference cannot masquerade as expert ratification
- standard and implementation are versioned separately
- runtime identity is tracked separately from both
- compilation selects among explicit carriers instead of stuffing everything into one prompt
- delivery claims require an execution mechanism, not a file on disk
- feedback can trigger an implementation repair but cannot redefine the standard

The broader product thesis is still being tested, deliberately.

---

## What has been tested, including what failed

Three behavioural studies, reported in full because the shape of the result tells you where this helps
and where it does not.

**Where most rules apply most of the time, a compiled standard beat raw examples.** A standard
recovered from one maintainer's public review comments, adopted by a language model standing in for
that maintainer rather than ratified by them, was the majority winner in 15 of 17 held-out pull
requests under blind comparison, using one eighteenth of the context that the raw examples needed.
That is the strongest result here and it carries real limits: the maintainer ratified nothing, a
surrogate both adopted the standard and judged adherence to it, the preregistered primary endpoint
failed as non-discriminating and was not repaired, and raw examples are a weak baseline. The
comparison that would separate compiling a ratified standard from competently summarising a corpus,
a skill induced by pointing a frontier model at the same work at matched token budget, has not been
run.

**The arms for that comparison now exist, and none of them is optional.** `atelier reference` fixes
its arm set in code rather than taking it as a flag, because an omitted arm leaves no trace in a
result and the arm most likely to be dropped is the one most likely to win. Six arms, every one of
them compared:

| arm | what it is | what a comparison against it answers |
|---|---|---|
| `B0_BARE` | the task alone | the floor: does any of this beat asking with no standard |
| `B1_CORPUS_IN_PROMPT` | the same corpus, pasted in | does the pipeline beat the cheapest thing a competent person would try |
| `B2_MODEL_STYLE_GUIDE` | a model reads the corpus and writes its own guide | **is this a ratified standard working, or any competent summary working** |
| `B3_STANDARD_AS_PROSE` | the ratified rules as flat text, no carriers | does compiling add anything over the standard itself |
| `B4_EXPERT_ONE_PAGER` | what the expert writes in half an hour | does it beat the person's own attempt at their rules |
| `T_ATELIER` | the compiled package, served as bytes | — |

Two of these need an input the system cannot invent. `B4` requires `--one-pager`, and the run refuses
rather than generating a stand-in: a baseline authored by the thing being measured is not a baseline.
`B2` costs one extra call to write the guide, counted in the estimate before anything is spent.

These arms have never been run against a real expert. That run is the next thing that would move any
claim here, and the arithmetic for sizing it is in
[M2_PRICING_STUDY_CLOSE.md](studies/M2_PRICING_STUDY_CLOSE.md) §4: 17 contexts resolved Δ ≥ 0.24
while the effects worth finding were 0.13–0.24, so the next design needs roughly 36 to 62.

**Ratification demonstrably changes what a model does.** Twelve identical statements compiled twice,
once as unratified observations and once as ratified requirements, served to the same model on 30
unseen topics: the required structure appeared 11 of 30 times against 29 of 30. Everything but one
governance field was byte-identical. This is why `create` alone builds a skill that instructs the
model to do nothing, and it is the mechanism behind that behaviour rather than a policy.

**Where few rules apply to any given case, it did not help.** On early-stage pricing under incomplete
evidence, with a participating expert who ratified nine required rules and sealed which rules apply to
which case before any output existed, the compiled standard scored exactly what a bare model scored,
and exactly what retrieval scored. The result is a preregistered null and it stands unrepaired.

**We tested the obvious repair before building it, and it did not reproduce.** If serving many rules
at once erodes a model's restraint, selective activation would be the fix. On public data, adding 4,
11 and 23 irrelevant provisions left restraint statistically intact and pushed errors toward
*under*-application instead. So the router is not built, unresolved conditions stay marked
unresolved, and the gap stays visible.

**What that means if you are deciding whether to try this.** Point it at work where your rules apply
most of the time, which is where the positive result lives: code review, editorial standards, a house
voice, a report format. Where your judgment is mostly about *when* a rule applies rather than what it
says, this has no advantage to claim yet, and the honest reason is in the null above.

## What you can reproduce here, and what you cannot

**Reproducible from this repository, no API key, offline:** the full test suite, `npm test`,
68 files and 1023 tests. It exercises the governance spine, the compiler, the renderer, delivery
claims, and the promote/reject/inspect/rollback surface against the shipped binary.

**Reproducible from this repository with a key:** `npm run ablation:carrier`, a judge-free carrier
ablation that measures structural conformance mechanically across three arms. Its own header states
which arms are conformant by construction and what a passing verdict does not mean.

**Numbers stated in source comments:** several comments cite a figure from a run whose record is not
public. Every one of them is listed in [MEASUREMENTS.md](MEASUREMENTS.md) with what it rests on. No
test asserts any of those numbers and no behaviour depends on one, which
`tests/atelier-measurements-disclosure.test.ts` keeps honest in both directions. Terms and symbols
the comments use without spelling out are in [docs/GLOSSARY.md](docs/GLOSSARY.md).

**The preregistrations and study records are in [studies/](studies/README.md).** Eighteen documents,
sealed before generation and published as sealed: the null, the positive result, the gate that failed
and was not excepted, and the effect that was real and still did not license the fix it suggested.
Read them for what they refuse as much as for what they show. One published figure was wrong and is
marked withdrawn beside what replaced it, because a pooled binomial treated 46 nested observations as
independent. Two studies use the public comments of real maintainers who were **never contacted and
have ratified nothing**; they appear as Maintainer A and Maintainer B, as they do in the paper.

**Not in this repository:** the corpora and scored outputs for the three behavioural studies above.
The code review corpus is public but its adjudication is not reproducible and the generation model was
not recorded. The pricing corpus is not publishable. The public rule-load control ran against
LegalBench `sara_entailment` and is reproducible in principle for under nine dollars per variant, but
its harness is not part of this package.

**What you need to run the pipeline for real:** Node 22 or later, and an API key for one provider.
A first pass over roughly twenty pieces of work costs single-digit dollars of inference, and
`create` prices the run and refuses before spending anything if the estimate exceeds `--cap`.


> A small corpus of expert work can reveal enough of a person's tacit judgment to build an explicit,
> human-ratified standard, and that standard can be compiled into a skill that reproduces the person's
> decisions with low behavioural divergence on new situations and repeated generations.

The second thesis follows from the architecture.

> The implementation can keep improving as models and tools change, without giving the optimizer
> authority to silently redefine the target.

Those are strong claims. This repository exists to test them in public. If simply handing a strong model
the examples works just as well, that matters. If Atelier succeeds in one domain and fails in another,
that matters too. **Negative results stay negative.**

---

## Try it on something we did not design for

The most valuable contribution is not another feature. It is evidence.

Use Atelier on work where you know the standard well. Your own writing. A codebase you have shaped. A
review process. A strategy practice. A contract corpus. Any domain where good depends on judgment and
not only on correctness.

Hold evidence back before discovery sees it. Inspect what Atelier inferred. Reject what is wrong.
Rewrite what is close. Then run the resulting skill on work it has not seen.

That last step has a command, and it is deliberately two of them.

```bash
atelier create ./goldens --reserve held-out.md    # reserved BEFORE discovery reads anything

atelier reference --skill my-skill                # generates against the held-out tasks,
                                                  # seals which side is yours, prints neither
atelier reference --score --labels '[{"contextId":"held-out.md","judgement":"A_BETTER","recognizedOriginal":"NO"}]'
```

The question it asks is not "which one did you write". That would measure how memorable your own
prose is to you. It asks which output better represents how the task should be done according to
your standard, and it records afterwards whether you recognised one, so the result can be reported
as blind only when it was.

UNCERTAIN counts as a failure, declared before any data exists, because it is the only handling that
cannot be chosen afterwards to improve the number.

Then tell us:

- what it discovered correctly
- what sounded plausible and was wrong
- what important judgment it missed
- which rules became caricatures
- whether the compiled skill changed the output in a way you would actually keep
- whether simply giving the model the examples did just as well

That is the research program. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Command reference

| command | what it does |
|---|---|
| `create <path>` | the fast first pass. Reads the work, reserves held-out evidence, discovers, compiles. It does **not** ratify: every rule stays `DERIVED_UNRATIFIED`, so the skill it builds instructs the model to do nothing under *What to do*. Use it to see what discovery found, then rule with `pending` and `ratify` |
| `intake <path>` | read and seal a corpus without discovering yet |
| `discover` | propose candidate decisions from a sealed corpus |
| `pending` | show the candidates, with evidence and counterfactuals, before you rule |
| `ratify --decisions <json>` | rule on every candidate in one batch. Nothing partial |
| `ratify-one --id <id>` | rule on a single candidate |
| `add --statement <text>` | add a rule of your own that discovery never proposed |
| `ratify-close` | mint the StandardVersion from what you kept |
| `build --name <name>` | compile the standard into a skill and install it |
| `invoke --skill <name> "<task>"` | run the compiled skill |
| `inspect --skill <name>` | what is in the standard, and what the package actually serves |
| `history` / `rollback --to <v>` | every version, and how to go back |
| `improve --skill <name> --invocation <id> --complaint "<text>"` | propose a repair from a real output |
| `compare --skill <name>` | put the candidate and the current version side by side |
| `promote` / `reject --skill <name>` | adopt the candidate, or refuse it and record why |
| `revert` | undo the last build's file writes, leaving the standard untouched |
| `confirm --rule <id>` | rule on one inferred behaviour after the skill already works |
| `reference --declare-viewed <ids>` | record that you have read a held-out unit. It is refused from then on, and there is no undo |
| `sharpen` | for a rule claiming to hold everywhere, write the same passage three ways, too little / about right / overdone, blinded |
| `answer --pick <n>` / `--none` / `--indifferent` | fold your choice into a typed consequence. A probe answer is evidence, never authority: it routes you to `confirm` or `amend` and never edits the rule |
| `amend --rule <id>` | change what a rule means. Mints a new StandardVersion with a required reason |
| `judgements --skill <name> [--rule <id>]` | what you said when you promoted, and how often the instrument agreed |
| `feedback --invocation <id>` | record a complaint against a real output |
| `reference --skill <name>` | generate against held-out work and seal the blinding |
| `reference --score --labels <json>` | unblind and score the held-out test |
| `check [--role discovery\|target]` | verify a backend actually works, and record what was proven |
| `profiles` | which backends have been verified, and to what stage |
| `carriers --skill <name> [--host codex]` | what each execution surface really delivers |
| `status` / `abort` | where the current run is, and how to abandon it |

Flags worth knowing.

| flag | when |
|---|---|
| `--reserve <file>` | hold work back before discovery reads it. Only reachable at intake |
| `--one-pager <file>` | the expert's own one-page attempt at their rules, for the baseline arm that competes with the product. There is no substitute and no default |
| `--arm-set <hash>` | at `--score`, refuses labels collected on a different arm set |
| `--with <name>=<path>` | bind a source a requirement depends on |
| `--cap <usd>` / `--max-calls <n>` | bound the run. A dollar cap refuses to run against a runtime it cannot bind |
| `--price-in` / `--price-out` | your rate, USD per million tokens, for any provider |
| `--discovery-model` / `--target-model` | configure the two halves separately |
| `--strict-schema off` | for a backend that rejects strict schema enforcement |
| `--public-source --source-author "<name>"` | learning from someone else's public work |

---

## Your data

Local by default. No Atelier telemetry and no account. Standards, evidence and generated artifacts stay
on your machine. Data leaves it only when sent to the inference providers you explicitly configure for
discovery or execution.

Everything lives under `~/.atelier`, or wherever `ATELIER_DATA` points. Compiled skills sit in
`skills/<name>/` and are shared: any project can invoke one. **The run in progress is per-project**,
keyed by the working directory, so starting a corpus in one repository does not disturb a
half-finished ratification in another. `ATELIER_PROJECT_DIR` overrides which project you are in.
Upgrading from a version with a single global run adopts it into the first project that asks and says
so.

```text
~/.atelier
├── skills/<name>/        compiled skills, shared across projects
└── sessions/<project>-<hash>.json    one run in flight per project
```

