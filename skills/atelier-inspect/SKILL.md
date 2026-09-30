---
name: atelier-inspect
description: Show which approved standard currently owns a skill's behaviour, its version history, and roll back if needed.
---

# Inspect, history, rollback

## Before anything

Atelier's guarantees are enforced by the `atelier` command, not by these instructions. Run
`atelier --version` first. If it fails, stop, do not improvise the steps, and tell the user to install it:

```bash
git clone https://github.com/yannickYamo/atelier && cd atelier && npm install && npm run build && npm link
```


```bash
atelier inspect  --skill <name>     # active version + the standard that owns it
atelier history  --skill <name>     # every version, newest first, active marked
atelier rollback --skill <name> --to <skillVersionHash>
```

`inspect` reads the **StandardVersion**, never the generated `SKILL.md`. If they diverge, Atelier says
so rather than trusting the file — the installed file is a compiled output, and if it were treated as
the source of truth then editing it would silently change what the user is recorded as having approved.

Rollback moves one pointer. **It never deletes history**, so a rollback can itself be rolled back.
