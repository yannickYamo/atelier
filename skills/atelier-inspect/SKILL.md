---
name: atelier-inspect
description: Show which approved standard currently owns a skill's behaviour, its version history, and roll back if needed.
---

# Inspect, history, rollback

## Before anything

Atelier's guarantees are enforced by the `atelier` command, not by these instructions. Run
`atelier --version` first. If it fails, stop, do not improvise the steps, and tell the user to install it:

```bash
npm install -g @yannickyamo/atelier
# or from source:
git clone https://github.com/yannickYamo/atelier && cd atelier && npm install && npm run build && npm link
```


```bash
atelier inspect  --skill <name>     # active version + the standard that owns it
atelier history  --skill <name>     # every version, newest first, active marked
atelier rollback --skill <name> --to <skillVersionHash>
```

`inspect` reads the standard the user approved, never the generated `SKILL.md`. If the two differ, Atelier says so
instead of trusting the file: the installed file is an output, and editing it must never change what the user is
recorded as having approved.

Rollback moves one pointer. **It never deletes history**, so a rollback can itself be rolled back.

To list every skill built on this machine, one line each with what it is for:

```bash
atelier status
```
