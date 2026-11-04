# Changelog

## [Unreleased]

Atelier learns how you write from the pieces you would sign, writes new pieces that way, and reads each one for anything made up or copied before you see it.

- `atelier new` builds the check from your finished pieces, with or without a note of your own rules, and shows every rule for approval before it binds.
- `atelier verify` checks any text for invented specifics, passages copied from your examples and broken rules; as a Claude Code hook it blocks the break and hands the agent the reason.
- `atelier setup` lets the agents in a project call it through an MCP server, for Claude Code and Codex.
- It also writes to the standard: `atelier run`, then `atelier fix` in your own words.
- A skill built from your pieces now writes from them: your pieces of the kind asked for, whole, with your material, the task and your own stated rules, then one review against the same. `atelier keep` keeps the piece you published, so the next runs write from it and learn from each sentence you changed. `--pipeline legacy` keeps the compiled path.
- The text a run hands back is clean: a specific to check is listed beside it, never marked in it (`--mark-unverified` marks it in place, for a draft you will read, not publish). A sentence your notes hold is never listed as not given, and where a reader found part of a sentence untraced, that part is named.
- `atelier fix` reaches a table cell: every table row is one unit it can change, and a row comes back as one row with the same cells. A run whose required rule failed but that your consequence table still sends out says so in one line.
- A banned word inside a link address, or one your request itself uses, is not a break of the list; a word your rule allows a number of times (`mcp<=1`) is on the list from its next use.
- A run never stops or leaves a gap for what it was not given: it decides on what you gave, and lists beside the piece what it decided, what it was not given and what to add (`inferred`). The piece itself never talks about its notes or its gaps.
