---
name: improve
description: Add new evidence or change the standard for an existing skill. Use when the user wants their skill to behave differently.
---

# Improve — mints a new version, never edits the old one

```bash
atelier improve --skill <name> --evidence <path>   # new examples
atelier improve --skill <name>                     # revise the standard directly
```

Both operate on the canonical **StandardVersion**, not on the generated file. Editing `SKILL.md` would
change what is served without changing what was ratified, and the two would diverge with no record of
which one the user meant.

Every improvement requires a **reason**, in the user's words, recorded on the new version. Ask for it if
they have not said it. A version history without reasons can be counted but not audited.

Ratification runs again for anything new. **A change to the standard is a change to authority, and
authority only ever comes from the person.**
