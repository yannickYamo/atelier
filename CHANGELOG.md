# Changelog

## [Unreleased]

Atelier learns how you write from the pieces you would sign, writes new pieces that way, and reads each one for anything made up or copied before you see it.

- `atelier new` builds the check from your finished pieces, with or without a note of your own rules, and shows every rule for approval before it binds.
- `atelier verify` checks any text for invented specifics, passages copied from your examples and broken rules; as a Claude Code hook it blocks the break and hands the agent the reason.
- `atelier setup` lets the agents in a project call it through an MCP server, for Claude Code and Codex.
- It also writes to the standard: `atelier run`, then `atelier fix` in your own words.
- A skill built from your pieces now writes from them: your pieces of the kind asked for, whole, with your material, the task and your own stated rules, then one review against the same. `atelier keep` keeps the piece you published, so the next runs write from it and learn from each sentence you changed. `--pipeline legacy` keeps the compiled path.
- A run never stops or leaves a gap for what it was not given: it decides on what you gave, and lists beside the piece what it decided, what it was not given and what to add (`inferred`). The piece itself never talks about its notes or its gaps.
