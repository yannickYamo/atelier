---
name: create
description: Build a writing skill from a folder of pieces written the way the user wants to write, their own or a style they admire. Use when the user wants a skill that writes like a set of examples.
---

# Create a skill from writing you want to match

The user gives a folder of pieces written the way they want to write, and, if they have one, a note on how they work.
You carry the whole path: build, what was understood, the few questions only they can answer, two pieces to read, one
round of changes, ready. They never run a stage by hand and never read a term of the machinery.

## 1. Build

Ask the user, in one sentence, what the skill is for ("write blog posts in this voice", "client updates for Acme").
If they have a note on how they work (their steps, what a good piece must do), take its path too. Then:

```bash
atelier new <path> "<what they said it is for>" --name <kebab-name> --method <their-note.md>   # with a note
atelier new <path> "<what they said it is for>" --name <kebab-name>                            # without one
```

One skill per voice: for an agency or a team, each client or author is its own `--name`.

With a note, the skill is built in this one call. Without one, the command may stop and print the rules it found, each
with a suggested ruling, and **compile nothing**. Show the user the list exactly as printed and ask: accept all as
shown, or change some? Only after they answer, run the same command again with their answer:

```bash
atelier new <path> --name <kebab-name> --accept                                         # accept all as shown
atelier new <path> --name <kebab-name> --accept --set p3=reject --set p5=required       # with their changes
```

Never run `--accept` on the user's behalf without their answer: that one decision is theirs.

## 2. What was understood, and the few questions

The build prints a line starting `What this work is, read from your pieces:`. Tell the user that line in plain words.
Ask only for what it does not say, at most five questions in all, and skip any they leave unanswered:

- what the pieces are (a blog post, a newsletter, a memo),
- who reads them,
- what a reader should do or know after reading one.

Record their answers, in their words:

```bash
atelier amend --skill <kebab-name> --card "kind=<their words>; reader=<their words>; purpose=<their words>"
```

Leave out a field they did not answer. Do not fill one in for them.

## 3. Two pieces, one round

Ask for one request to try the skill on; take the second from the subject of one of their own pieces. For each:

```bash
atelier run "<the request>" --skill <kebab-name> --no-questions
```

Show the piece as printed and ask: "Anything to change? Say it in your words, or keep it." If they say what to change:

```bash
atelier fix "<their words, verbatim>"
```

Show the piece written again. Then, for the version they accept:

```bash
atelier keep --skill <kebab-name>
```

One round per piece, never a loop: a second complaint goes to `atelier fix` later, when they use the skill. What they
kept is what every later piece is written from first.

## 4. Ready

Say exactly:

> Your skill is ready: `/<name>`
>
> Try it: `/<name> <a concrete example task in their domain>`

Give an example that fits their actual work, not a generic one.

## Rules for you, the assistant

**Do not tell the user what you think their rules are before the build runs, and do not ask them.** If they volunteer
it, it belongs in their note (`--method`), in their words, not in your prompt.

**Do not paraphrase a proposed rule into something more flattering.** The person is the only one who can tell you
whether a rule is true of them.

**One kind of work per skill.** If the folder mixes screenplays and blog posts, say so and offer to build two.

**Never fail the build over the guided part.** If a sample cannot be written, say so in one line and go on: the skill
is built.

Add `--dry-run` to `atelier intake <path>` first if the folder might contain files that are *about* the work rather
than examples of it: it prints the exact list of what would be read.
