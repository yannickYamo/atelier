---
name: create
description: Point Atelier at a folder of your best work and get back a reusable skill. Use when the user wants to build a skill from examples of their own writing or work.
---

# Create a skill from your work

The user gives a path to their own work. You orchestrate the whole path and they never invoke an
internal stage by hand.

## Run this

Ask the user, in one sentence, what the skill is for (for example "write blog posts in this voice",
"customer support answers", "check all our copy against these"). Then:

```bash
atelier new <path> "<what they said it is for>" --name <kebab-name>
```

It reserves part of the work, reads the rest, and prints every rule it found with a suggested ruling.
**It stops there and compiles nothing.** Show the user the list exactly as printed, and ask:
accept all as shown, or change some? Only after they answer, run the same command again with their
answer — it continues from the review, records their rulings and builds:

```bash
atelier new <path> --name <kebab-name> --accept                          # accept all as shown
atelier new <path> --name <kebab-name> --accept --set p3=reject --set p5=required   # with their changes
```

Never run `--accept` on the user's behalf without their answer: that one decision is theirs.

Add `--dry-run` to `atelier intake <path>` first if the folder might contain files that are *about*
the work rather than examples of it — it prints the exact manifest without sealing anything.

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
