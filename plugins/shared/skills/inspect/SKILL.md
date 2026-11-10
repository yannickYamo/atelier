---
name: inspect
description: Show which approved standard currently owns a skill's behaviour, its version history, and roll back if needed.
---

# Inspect, history, rollback

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
