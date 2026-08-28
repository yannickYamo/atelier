# The model is replaceable

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

---

[← back to the README](../README.md)
