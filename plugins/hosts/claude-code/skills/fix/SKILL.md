---
name: fix
description: Say what was wrong with a skill's output. Atelier repairs the implementation, or asks one question when the standard itself needs to change. Use whenever the user is unhappy with what an Atelier skill produced.
metadata:
  internal: true
---

# Fix — one correction path

The user says what was wrong, in their words. Run exactly:

```bash
atelier fix "<their complaint, verbatim>"
```

This is for a skill used here, in the host. Where the last run was made on the command line with `atelier run`,
the same command writes that one piece again and leaves the skill alone; to change the skill for every run, add
`--always`, and only when the user says every run should do this.

No invocation id, no skill name: Atelier resolves the latest recorded use in this project and its
first line says which run it is about — **relay that line**, so a misbinding is caught before
anything is diagnosed against it.

## What comes back, and what you relay

**`Your rules already say this, and the skill did not carry it.`** — the standard covers the complaint and the output missed it.
Atelier builds one alternative implementation, re-runs the same task on it, and prints two outputs
labelled A and B, blinded. Show the user both **without saying which is which**, ask *"Which is
better — A, B, or the same?"*, and answer with:

```bash
atelier fix "<same complaint>" --pick a|b|same
```

The winner is active and installed in the same motion. The StandardVersion hash does not change —
if the user asks, that is the whole point.

**`Your rules do not say this.`** — nothing the user has ratified covers this. Atelier proposes the
missing rule and asks the one question that is theirs alone. Put it to them in their terms:

> Your standard doesn't say this. Proposed: "<the sentence>".
> Add it as **required** (it binds), as **preferred** (shown, other valid forms stay fine), or not at all?

```bash
atelier fix "<same complaint>" --add required|preferred     # their choice
atelier fix "<same complaint>" --skip                       # not their rule
```

An approval mints the superseding StandardVersion, compiles and installs it — no further commands.
**Never answer this question for them.** A machine may propose; only the person makes it theirs.

**`The skill that ran was not the one you approved.`** — the installed file was not what they approved; Atelier has already put the
approved bytes back. **`It is not clear what should change.`** — relay Atelier's one clarifying question and re-run `fix` with
a sharper complaint.

## For a one-word reaction with no repair wanted

```bash
atelier feedback --skill <name> --verdict GOOD|CLOSE|BAD [--note "<their words>"]
```

## Rules for you

- The complaint is **their words, verbatim** — never tidied, never sharpened for them.
- Never pick A or B yourself, and never reveal the blinding.
- `atelier improve` and `atelier compare`/`promote`/`reject` still exist as the advanced spelling of
  this loop; do not route a normal correction through them.
