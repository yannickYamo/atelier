# Atelier — Research Preview

Atelier reads work you have already done, **proposes what it thinks makes it yours**, and asks you to
approve, rewrite or reject each item. What you approve becomes an explicit standard **you own**. It then
builds a reusable skill you invoke like any other.

```
/atelier:create ./my-best-work
  → it proposes rules, you ratify them
  → "Your skill is ready: /my-voice"

/my-voice write a launch post about the pricing change
```

## What we do not claim

**We do not yet know how broadly this works.** The experiment ships with the tool.

Atelier does not "learn your taste" as an established fact. It proposes what it thinks makes your work
yours; you ratify it; the tool builds a reusable skill; and an optional blind test lets you check
whether the explicit standard actually helped compared with simply showing a model your examples.

## Your data

**Local by default. No telemetry, no account, no upload.** Your corpus, your standard and everything
generated stay on your machine. Two optional studies exist; both are explicit opt-in, and neither is
required to use the tool.

## Authority

The standard is an **authority record**. The tool may change *how* it is implemented; it may never
change *what you approved*. Editing the generated `SKILL.md` by hand changes what is served without
changing what you ratified — Atelier detects that and tells you. Say what was wrong with `/atelier:fix` instead —
it repairs the implementation, or mints a new standard version with your reason and keeps the old one.
