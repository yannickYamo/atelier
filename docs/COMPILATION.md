# From standard to skill

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

The compiler chooses a deterministic initial implementation for each ratified requirement — a
policy, not a proof. Semantic weight does not determine mechanism (the carrier study watched
EXAMPLE lose to plain prose on a PREFERRED rule), so the arrangement is a first guess made
auditable per rule, and the correction loop may replace a carrier laterally under the same
StandardVersion when evidence says so.

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

---

[← back to the README](../README.md)
