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

## Quickstart

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

## How Atelier learns taste

Atelier does not start from a fixed taxonomy of style. It looks for contextual decisions in the work.
Depending on the domain those may show up as framing, methodology, evidence thresholds, abstraction
boundaries, risk allocation, word choice, omission, pacing, error semantics, or something the system
had no name for beforehand.

The object is the decision, not the category.

A candidate looks like this:

```text
Observed
  The author challenges the premise before answering,
  in 4 of 6 pieces.

Candidate
  Correct the frame before solving when the requested decision
  rests on an assumption the evidence does not support.

Applies when
  the question embeds an unsupported assumption

If absent, expect
  answers that solve the question exactly as asked,
  even when it was the wrong question
```

The counterfactual matters because flattering descriptions are easy to accept. A prediction about what
the expert would do differently is easier to check and to reject.

Atelier also looks for the edge of each behaviour. When would this expert deliberately not do this? A
standard without boundaries becomes a caricature.

And it tells you where its own evidence is thin, rather than leaving you to guess which candidates are
well supported.

| what it found | what it asks for |
|---|---|
| the rule appears in one document and nowhere else | another piece of work |
| the evidence is thin and the rule would sound plausible either way | a question built to separate the two answers |
| the rule claims to hold everywhere and nothing has tested its edge | a boundary probe |
| two candidates contradict each other | which one is yours |

It also reports recurring behaviour that no candidate accounts for, and it distinguishes "nothing was
found" from "this was not computed".

### Taste is what you choose, and how you make the choice land

Half of anyone's standard is judgment. The other half is expression, and most systems throw it away
or copy it blindly.

Atelier looks for both, and keeps the relationship between them. From one real run on a corpus of
decision memos, two of the fourteen candidates were:

```text
p7   I drop in one concrete scene of a single user at a single moment
     to carry the argument's weight, then leave it without elaboration.

p12  When I use an image I end the beat on a short declarative that
     renames the thing, so the emphasis lands on the reframing.
```

Read as two rules, p12 is a fussy habit about sentence length and you would reject it. It is not a
rule. It is **how p7 lands**, and when you say so the pair becomes something a model can actually
reproduce:

```text
DECISION          p7   make the abstract mechanism concrete through a scene
                       REQUIRED

  realized as     p12  end the beat on a short declarative that renames the thing
                       FUNCTIONALLY_EQUIVALENT

  observed        "They do not file a ticket. They close the tab.
                   That silence is the product."
```

The decision carries the obligation. The realization carries the form. You are never asked whether a
form is REQUIRED, because that question puts two commands on one choice. You are asked **how tightly
the form binds**: STRICT if the exact realization is part of what you mean, FUNCTIONALLY_EQUIVALENT
if another form doing the same work is fine, FLEXIBLE if it is characteristic and nothing turns on it.

Expressive preferences that serve no deeper decision stay standalone. Not everything is a realization
of something, and pretending otherwise is how a system over-intellectualizes style.

**Atelier never infers this link on its own.** That was measured: asked to derive the relationships
across three independent runs, a model gave one rule three different parents, captured a standalone
preference into an unrelated one, and produced chains nobody authored. A machine may propose an edge.
Only you make it structure.

Every example the compiled skill receives is an anchored quote from your own work, checked verbatim
against the piece it came from. Showing beats telling for form, and a description of a rhythm is not
a rhythm.

---

## Human authority

Doing something repeatedly does not make it a requirement. For every candidate, a person decides
whether it belongs in the standard.

```text
APPROVE       it is mine, as stated
REWRITE       it is mine, but not in those words
CONTEXTUAL    it is mine only under a condition
REJECT        it is not part of the standard
```

For anything kept, Atelier records how much it matters.

| materiality | meaning |
|---|---|
| `REQUIRED` | violating it materially worsens the work |
| `PREFERRED` | wanted, but other valid realizations are acceptable |
| `EXEMPLAR_ONLY` | characteristic evidence, not an obligation |
| `TOLERATED` | preserve it where present, do not generate it deliberately |
| `INCIDENTAL` | observed, but not part of the standard |

Separately, whether the exact form matters.

```text
STRICT · FUNCTIONALLY_EQUIVALENT · FLEXIBLE
```

This is what stops a recurring habit from becoming a hard rule by accident.

### When a rule needs something the runtime does not have

Some rules depend on evidence as well as judgment. *Cite one counted observation from our own
records* is a real standard and it cannot be followed honestly by a model with no records.

Ask it anyway and you do not get a refusal. You get *"I pulled our last 200 tickets, 63% of them
were…"* Specific, confident, in your voice, and invented. The rule was followed. The condition that
makes following it truthful was absent.

So a requirement can name what it needs, and the run stops before the model is asked to solve an
impossible problem.

```bash
atelier invoke --skill my-skill "Should we approve two more support agents?"

atelier: MISSING_REQUIRED_EVIDENCE — nothing was generated.

  p2  [REQUIRED]  needs RECORDS("support-ticket-history")
      rule: I cite one specific counted observation from our own records

  Bind the source:   --with support-ticket-history=./tickets.csv
```

Nothing was spent, because the absence was knowable before the call. A rule you marked PREFERRED in
the same position does not stop the run; the behaviour simply does not fire, and Atelier says so
rather than dropping it silently.

Public work keeps its provenance too. If you adopt a behaviour inferred from someone else's work,
Atelier records that you adopted it. It does not pretend you ratified that person's standard on their
behalf.

Every one of these decisions is written to an append-only ledger beside the standard, and the ledger
stores **what you were shown**, not what survived. A rewrite keeps the original wording next to your
replacement. A rejection is recorded as a rejection rather than as an absence. The standard can
already tell you what is in it; only the ledger can tell you what a person was looking at and what
they did about it, and that is not reconstructable afterwards.

> **Atelier may discover a candidate. Only a person can make it authoritative.**

---

## From standard to skill

Atelier is a compiler, not a prompt template.

Most standards need only:

```text
my-skill/
└── SKILL.md
```

When the standard demands more, Atelier emits additional carriers:

```text
my-skill/
├── SKILL.md
├── examples/
│   └── p4.md
├── contracts/
│   └── output.schema.json
└── context-map.json
```

The compiler chooses the minimum implementation each ratified requirement needs.

| carrier | used when |
|---|---|
| `PROSE` | the model should hold the behaviour while it works |
| `SELF_CHECK` | the model should inspect its own draft before finishing |
| `EXAMPLE` | showing the behaviour is more faithful than stating it |
| `OUTPUT_CONTRACT` | the runtime can enforce the shape directly. Ask for one with a `shape` on a REQUIRED decision |
| `NONE` | the human decided the behaviour is not part of the standard |

Alongside the package, never inside it:

```text
assurance/
└── manifest.json    requirement → carrier → emitted artifact
```

The manifest records what the compiler emitted. Delivery is measured separately, on the execution
surface that actually ran. **A file existing on disk is not evidence that a model consumed it.** That
distinction is enforced, because a system can look correct on disk while serving something materially
different to the model.

### Which parts of your standard this system can keep honest

Not all of it, and `atelier build` tells you which is which instead of implying it can watch
everything.

```text
How this standard can be maintained

  p1    I open by rejecting the question's premise rather than answering it
          observation: you read it
  p2    I cite one counted observation from our own records
          observation: no qualified check  (unblocks when "company-records" is bound)
  p5    Every recommendation carries a verdict and a confidence
          observation: automatic check

  1 with an automatic check · 6 you would read yourself · 3 with no qualified check
```

This is not a quality score. A standard about judgment is mostly judgment, and a person is a valid
way to check one. What it tells you is where Atelier can catch drift on its own and where it cannot,
which is also what decides whether a repair can be adopted without you.

**How a behaviour is caused and how it is measured are separate questions.** An output contract
enforces a shape and says nothing about whether a number in it is true. A prose rule may be checkable
by a test, by you, or by nothing at all. Atelier keeps the two apart rather than assuming a carrier
implies a sensor.

---

## The model is replaceable

Discovery and execution are different jobs. You can learn a standard with one model and run it with
another.

```bash
# Discover with the most capable model you can reach...
atelier create ./goldens \
  --discovery-provider anthropic \
  --discovery-model claude-fable-5

# ...then execute the compiled standard somewhere else, for a fraction of the cost.
atelier invoke --skill my-skill \
  --target-provider openai-compatible \
  --target-base-url http://localhost:11434/v1 \
  --target-model llama3.1 \
  "Write the recommendation."
```

**Spend the capability on discovery.** Atelier is provider-agnostic by construction, and exactly one
thing about it depends on the model: recovering tacit judgment from a corpus is a hard inference
problem, and how much of it a run recovers tracks how capable the reading model is. That is not a
limitation waiting to be engineered away. It is why the two halves are configured separately.
Discovery happens once. Execution happens forever, and a small model running a compiled standard is
a legitimate and much cheaper target.

A weaker reader does not fail loudly. Two discovery runs over one corpus of five decision memos,
same prompts, same held-out reserve, different reading model:

| | capable reader | weaker reader |
|---|---|---|
| rules proposed | 14 | 11 |
| the author's signature moves recovered | 4 of 4 | 2 of 4 |
| rules stated as a decision the author makes | 14 of 14 | 3 of 11 |
| cost | $0.52 | $0.005 |

The weaker run returned a full set of confident, well-formed, plausible rules. What it returned was
mostly the *subject matter*: prefer async paths, fix the form before hiring, treat budget as
secondary. Those describe what the memos were about. Compiled, they produce a skill that applies
"prefer async solutions" to a legal opinion, because nothing in the rule says it was ever about
software. In all eleven it missed the author's most distinctive move, rejecting the question's
premise before answering it.

It also proposed a rule the author does not hold: *treat absence of evidence as evidence of absence*.
The corpus does the opposite. A fallacy had been written in the author's voice, ready to be ratified
because it reads plausibly.

**This is the reason ratification is a gate and not a formality.** None of those eleven bind
anything until a person says so, so a weak reader costs you a longer review rather than a confidently
wrong standard. The protection is real and it is not total: the architecture stops an unratified rule
from binding, and it cannot stop a person from approving a plausible one. Discover with the best
model you can reach, and read the counterfactual on every candidate before you keep it.

Any OpenAI-compatible backend works for either half. Named backends save you a URL.

```bash
atelier check --provider openai-compatible --backend openrouter \
  --model anthropic/claude-opus-4 --api-key-env OPENROUTER_API_KEY
```

`openai` · `openrouter` · `groq` · `together` · `deepseek` · `fireworks` · `ollama` · `vllm` ·
`llama-cpp`, and anything else through `--base-url`.

Two flags exist because backends genuinely differ, and neither is guessed for you.

| flag | when |
|---|---|
| `--strict-schema off` | the backend rejects `strict` schema enforcement. Many self-hosted servers do. The schema then instructs the model rather than validating it, which is weaker, and the run records which you used |
| `--structured-output json-schema` | the backend accepts a tools array and ignores `tool_choice` |

### What a call costs

Atelier ships no rate card it can keep current. Prices change without notice and differ by region and
contract, so a table would be stale on the day it shipped. The one that was here was 3x wrong for
months. You give the rate, in USD per million tokens, and it applies to every provider equally.

```bash
atelier create ./goldens --price-in 3 --price-out 15 --cap 5
```

Without one, calls are `UNKNOWN_PRICING` rather than free, and a dollar cap that cannot bind refuses
to pretend it can. Bound the run by count instead with `--max-calls`. A model running on your own
machine is `LOCAL_UNMETERED`: nobody is billing, which is not the same as costing nothing.

`StandardVersion` contains no provider and no model identity. The runtime that served a skill is
tracked separately, so evidence earned by one model cannot silently transfer to another.

That makes the standard portable. Discover with the best model available today, keep the standard, and
move the implementation when models and runtimes change.

Protocol compatibility is not proof of behavioural quality. Atelier keeps four questions separate.

1. Can it reach the model?
2. Does the model return the required structure?
3. Is the cited evidence actually present in the source material?
4. Is the inferred expert standard any good?

The first three can be checked mechanically, and `atelier check` does exactly that against one backend.
The fourth still needs human authority.

---

## How a skill improves without moving the target

The implementation can change. The standard cannot change itself.

```bash
atelier invoke --skill my-skill "..."        # produces an invocation id

atelier improve --skill my-skill \
  --invocation <id> \
  --complaint "the opening is too abstract"

atelier compare --skill my-skill --rule <requirementId>
atelier promote --skill my-skill --candidate <hash> --why "it kept the concrete noun"
atelier rollback --skill my-skill --to <version>
```

A repair starts from a real output and a concrete complaint. Atelier asks first whether the failure is
already covered by the ratified standard.

If it is, the implementation is at fault, and Atelier builds a new `SkillVersion`. If it is not, the
desired target may have changed, and that decision goes back to the human.

**Feedback is evidence, not authority.**

Stability comes from the same separation. One bad output opens a candidate and cannot promote one. Ten
regenerations of the same task count as one situation. A carrier only escalates when the same miss
recurs across independent situations. And when the evidence cannot separate two candidates, Atelier
asks for more instead of declaring a plateau.

The long-term hypothesis is that this lets the implementation improve while the target stays stable.
Models get better, scaffolding can shrink, and a skill can evolve without quietly changing what the
expert meant by good.

### Why `promote` makes you type a reason

`compare` asks a model to order two outputs on one rule, blind, twice, with the sides exchanged. That
model has never been checked against you. Its preference is one opinion, and the second run only
establishes that it is a stable opinion rather than a reading of which text came first.

`promote --why` is where that gets checked. Your choice and your sentence are written against the same
pair the observer read, and `atelier judgements` shows where the two landed:

```bash
atelier judgements --skill my-skill              # the whole ledger
atelier judgements --skill my-skill --rule p3    # one rule
```

```
  agreed              34
  disagreed           6
  observer declined   5   (said EQUAL or that neither complied)
  order-dependent     3   (its verdict flipped when the sides were exchanged)

  85% agreement over 40 comparable pairs.
```

Three things about that report are deliberate.

It prints no rate below thirty comparable pairs. A fraction over four decisions reads as a rate and is
not one.

It excludes the comparisons whose verdict flipped when the sides were exchanged. There the instrument
has already told you its answer tracked position, and scoring that against your pick would move the
count on a coin flip.

It does not treat the rate as a qualification, and says so on the same screen. A pair only enters the
ledger because the repair loop generated it and you ruled on it, so the number describes the observer
on those pairs and not on your standard. Easy pairs dominate any such count, and an instrument that is
really reading length or fluency will agree on most easy ones.

The disagreements are the part worth reading. Six rows where the observer preferred one output, you
preferred the other, and your own sentence sits underneath saying why will tell you what the instrument
is actually measuring. In the run above, every disagreement had the observer preferring a candidate
between 1.35× and 2.10× longer than the champion.

The ledger fills from ordinary use. There is nothing to set up and no labelling session to schedule.

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
52 files and 825 tests. It exercises the governance spine, the compiler, the renderer, delivery
claims, and the promote/reject/inspect/rollback surface against the shipped binary.

**Reproducible from this repository with a key:** `npm run ablation:carrier`, a judge-free carrier
ablation that measures structural conformance mechanically across three arms. Its own header states
which arms are conformant by construction and what a passing verdict does not mean.

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

## Architecture

A requirement is five separate questions, and keeping them separate is most of the design. Each
column arrived from something that went wrong rather than from a diagram drawn in advance.

```text
                            REQUIREMENT
   ┌────────────┬─────────────┬───────────────┬────────────┬──────────────┐
   ▼            ▼             ▼               ▼            ▼
authority   appliesWhen   prerequisites    carrier     observation
who says    when it       what must        how the     how anyone
it binds    applies       exist first      behaviour   would know it
                                           is caused   happened
```

Collapse any two and you get a familiar failure. Fold observation into carrier and a schema starts
claiming a citation is true. Fold prerequisites into judgment and a model invents the evidence a rule
demanded. Fold authority into recurrence and a habit becomes law.

The core is provider and host neutral, and a boundary test keeps it that way.

```text
core/discovery/       evidence-backed candidate decisions, across framings
core/coverage/        weak support, blind spots, unresolved boundaries
core/ratification/    append-only human authority: what you saw, and what you did
core/architecture/    requirement → minimum carrier, and decisions apart from their realizations
core/delivery/        what each execution surface actually delivers, per carrier
core/state/           the six objects, prerequisites, and the request binding
core/runtime/         provider, model and configuration binding
core/inference/       the one seam a model reaches through, and the budget that bounds it
renderers/            SkillPackage generation
adapters/             host installation
providers/            inference backends
```

Four identities, and every one of them exists because assuming it was the same as another cost
something.

```text
StandardVersion     what good means             human-owned, immutable, content-addressed
SkillVersion        how one model produces it   machine-owned, replaceable
RuntimeBinding      what actually served it     observed, never inherited across a change
InvocationRequest   what was actually asked     bound, and proven equal to what was served
```

### Contributing, and what the checks are for

```bash
npm ci
npm run typecheck     # strict, plus four flags beyond it
npm run lint          # type-aware; every disabled rule states its reason
npm test              # the suite
npm run build         # what a user installs
```

CI runs exactly those four and then runs the built binary. The tests worth reading first are
witnesses rather than units. `tests/atelier-carrier-delivery.test.ts` proves a compiled contract
reaches the provider. `tests/atelier-reachability.test.ts` walks the import graph and refuses to let
a module go dark without someone writing down why. `tests/atelier-documented-claims.test.ts` holds
this file to what the code actually does, which is why the commands above are the commands that exist.

MIT.
