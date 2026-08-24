# Atelier

**Turn expert taste and judgment into an executable AI skill.**

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

Atelier learns the decisions behind an expert's work, writes them down as an explicit, versioned
standard, and compiles that standard into the smallest skill a model needs to reproduce it on new work.

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

Examples teach, but they leave the most important thing unsaid.

Show a model four documents that all open with a concrete scene and it may learn:

> Always open with a scene.

The expert's actual decision may be:

> Use a concrete scene when an abstract mechanism needs to become tangible. Lead directly with the
> decision when the reader already understands the context.

The difference is not style. It is judgment, scope, and boundary.

This gap shows up anywhere two qualified people could make different, defensible choices and one team
needs those choices made consistently.

| | the judgment that gets lost |
|---|---|
| **Product and strategy** | which contradiction matters, when a claim is earned, what belongs above the fold |
| **Code and code review** | when duplication is acceptable, when an abstraction is premature, which shortcut is harmless and which becomes debt |
| **Legal work** | which ambiguity is intentional, which risk deserves escalation, where flexibility is worth preserving |
| **Research and diligence** | which evidence is decision-grade, what should stay uncertain, when a conclusion outruns the data |
| **Writing** | what to foreground, what to omit, how directly to argue, where tone or form is part of the standard |

The common failure is that the target is never made explicit. Prompts describe behaviour. Memories
accumulate preferences. Optimizers improve against scores. Fine-tunes bury decisions in weights.

Atelier starts from a different question. **What exactly does this expert mean by good, and who has the
authority to change that definition?**

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
| `OUTPUT_CONTRACT` | the runtime can enforce the shape directly — ask for one with a `shape` on a REQUIRED decision |
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
limitation waiting to be engineered away — it is why the two halves are configured separately.
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
software. It missed the author's most distinctive move — rejecting the question's premise before
answering it — entirely, in all eleven.

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
contract, so a table would be stale on the day it shipped — the one that was here was 3x wrong for
months. You give the rate, in USD per million tokens, and it applies to every provider equally.

```bash
atelier create ./goldens --price-in 3 --price-out 15 --cap 5
```

Without one, calls are `UNKNOWN_PRICING` rather than free, and a dollar cap that cannot bind refuses
to pretend it can — bound the run by count instead with `--max-calls`. A model running on your own
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

atelier compare --skill my-skill
atelier promote --skill my-skill
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

---

## What to expect

Atelier is an open research and product preview. The full pipeline runs end to end today.

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

## Your data

Local by default. No Atelier telemetry and no account. Standards, evidence and generated artifacts stay
on your machine. Data leaves it only when sent to the inference providers you explicitly configure for
discovery or execution.

## Architecture

The core is provider and host neutral.

```text
core/discovery/       evidence-backed candidate decisions
core/coverage/        weak support, blind spots, unresolved boundaries
core/ratification/    append-only human authority
core/architecture/    requirement → minimum carrier
core/delivery/        what each execution surface actually delivers
core/runtime/         provider, model and configuration binding
renderers/            SkillPackage generation
adapters/             host installation
providers/            inference backends
```

A boundary test keeps provider-specific code out of `core/`.

MIT.
