# Atelier: instructions for coding agents

You've been pointed at this repository, probably to use Atelier on someone's writing. This file is the
short version of what to do. The README explains why; `docs/` explains how it works.

## What it is

A command-line tool (`atelier`) that reads a folder of someone's best work, proposes the rules behind it,
and, once the person approves them, compiles a skill that writes, checks and repairs new work to that
standard. It installs the skill for Claude Code (`.claude/skills/<name>/`) or Codex.

## Set it up

```bash
git clone https://github.com/yannickYamo/atelier && cd atelier
npm install && npm run build
npm link            # optional: puts `atelier` on PATH; otherwise use `node dist/cli/atelier.mjs`
```

Node 22 or later. Anything that calls a model needs `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`, or an
OpenAI-compatible backend: `--provider openai-compatible --base-url <url> --model <id>`). Run
`atelier check` first: it tests the backend before anything is spent. Checking text with an existing
skill (`atelier verify`) needs no key. With a key, `verify` and `invoke` also have a small model read the
draft for invented specifics: `claude-haiku-4-5` by default, or `ATELIER_CLAIMS_MODEL` on the person's own
backend. Pass `--claims pattern` to stay offline.

Run commands from the **user's project directory**, not from this repository: skills are installed
relative to the current directory, and state lives in `~/.atelier` (or `ATELIER_DATA`).

## Do what the user asked

| the user wants | run |
|---|---|
| a skill from their writing | `atelier new <folder-of-their-work> "<what it is for>"`, show them the rules it proposes, then `atelier new <folder> --accept` once **they** approve (or `--set p3=reject` for their changes) |
| a skill from rules they state | `atelier skill "<their rules, in their words>"` |
| new work in that voice | `atelier invoke --skill <name> "<the task>"` (written, checked, repaired, recorded) |
| to check or fix a text | `atelier verify --skill <name> <file>` (exit 1 = a required rule broken); add `--repair` to fix only what broke |
| their real stories and figures used | `atelier material --skill <name> <notes.md>`: anything invented is otherwise cut |
| to correct the skill | `atelier fix "<what was wrong, in their words>"` |
| to see where a skill stands | `atelier status --skill <name>` |
| an agent to check its own output | `atelier mcp` is an MCP server with `atelier_verify`, `atelier_rules`, `atelier_list_skills` |
| whether a run can ship, and why | `atelier report <run>` (the evaluation and the trace); ask the person, then `atelier rate <run> yes|no "why"`; `atelier eval --skill <name>` over runs |
| where outputs sit against the author's range, and the releases that steer them | `atelier fidelity --skill <name>` (`--read <file>` for one text, `--rollback` to undo a release) |
| whether the skill's detector and steering features hold on texts they never saw | `atelier qualify --skill <name>` (topic labels in each piece's front matter, or `--topics <file>`) |

`atelier --help` lists everything; `atelier <command> --help` explains one command.

## Rules for agents

- **The person approves the standard, never you.** Show them the proposed rules and let them accept or
  change them. Don't pass `--accept` on their behalf without asking.
- **Don't edit files under `.claude/skills/<name>/` by hand.** They are compiled output: a change there
  isn't recorded and the next build overwrites it. To change what "good" means, use `atelier confirm` or
  `atelier amend`; to change how it's carried, `atelier fix`.
- **Don't invent material to satisfy a rule.** If a rule needs the person's own stories, figures or sources,
  ask them for it and bind it with `atelier material`.
- Discovery costs a few dollars (it prints an estimate and stops if it's over `--cap`). Tell the person
  before raising the cap.

## Contributing to Atelier itself

```bash
npm test        # the whole suite, offline, against a scripted model
npm run lint
```

Read `CONTRIBUTING.md` first. The end-to-end tests drive `dist/`, so run `npm run build` before `npm test`.
Every study and its result is in `studies/` and the CHANGELOG; negative results stay in.
