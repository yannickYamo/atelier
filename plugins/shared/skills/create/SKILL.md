---
name: create
description: Point Atelier at a folder of your best work and get back a reusable skill. Use when the user wants to build a skill from examples of their own writing or work.
---

# Create a skill from your work

The user gives a path to their own work. You orchestrate the whole path and they never invoke an
internal stage by hand.

## Run this, in order

```bash
atelier create <path>        # lists what it will read, freezes the corpus, proposes rules
```

Add `--dry-run` first if the folder might contain files that are *about* the work rather than examples
of it — it prints the exact manifest without sealing anything.

Then **ratify with the user** (see `/atelier:ratify` — it is the same flow, inline here).
Then:

```bash
atelier build --name <kebab-name>
```

## Rules for you, the assistant

**Do not tell the user what you think their rules are before `discover` runs, and do not ask them.**
If they volunteer it, thank them and do not put it in the prompt. The whole question is whether the
machine can recover their judgment from their work; a hint makes the answer unfalsifiable. If they
enrolled in the discovery study, their sealed list is compared afterwards.

**Do not paraphrase a proposed rule into something more flattering.** The rules that are worth having
are frequently unflattering, and the person is the only one who can tell you whether one is true.

**One work type per skill.** If the folder mixes screenplays and blog posts, say so and offer to build
two — a standard induced from a mixture is the intersection of two crafts, not the union.

**When it finishes**, say exactly:

> Your skill is ready: `/<name>`
>
> Try it: `/<name> <a concrete example task in their domain>`

Give an invocation example that fits their actual work, not a generic one.
