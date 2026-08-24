---
name: feedback
description: Record how a generated output turned out. Use after the user has used their Atelier skill on a real task.
---

# Feedback becomes evidence, never an edit

```bash
atelier feedback --skill <name> --verdict GOOD|CLOSE|BAD [--note "<their words>"]
```

If they explain what was wrong, capture it verbatim as the note.

## If they want it changed

Feedback may **propose** a change. It may never apply one.

- **The standard was wrong or incomplete** → `/atelier:improve`. That mints a **new StandardVersion**
  with an explicit reason, and keeps the old one. Their previous standard is never overwritten, because
  a record of what they approved that changes without their approval is not a record.
- **The standard was right and the output missed it** → that is an implementation problem. Say so; it
  does not need a new version.

Telling those apart is worth the extra question: *"Is that something your standard doesn't say, or
something it says and the output ignored?"*
