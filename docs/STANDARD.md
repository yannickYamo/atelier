# The standard

A standard is the record of how one person or one team judges a kind of work, taken from pieces they finished and
would sign. Atelier writes from it, and holds every new piece to it. Models change every few months. The standard
does not: it is yours, it has a version, and it moves with you.

## What it holds

| Part | What it is | Where it comes from |
|---|---|---|
| Your pieces | The finished work the skill was built from, kept whole | The folder you pointed at |
| Your method | Your steps, in your words, never reworded | The method note, when you gave one |
| What the work is | Its kind, its reader, what it is for, what each piece settles | Read from your pieces, and from your answers at the build |
| Your rules | What every piece is held to, each with the check that reads it, or marked as yours to judge | Your method, your stated rules, and what every one of your pieces does |
| Your habits | How you write, counted on your own pieces: steering, never blocking | Your pieces |
| Your reference set | The pieces you accepted from the skill, and what you changed in them | The build's samples, and `atelier keep` |

## It has a version

Every build writes a new version and keeps the earlier ones. A run records the version it was written under, so a
piece can always be traced to the standard that held it. Nothing rewrites a version in place: a change you make
(`atelier fix "<what was wrong>" --always`, a new build) makes the next one.

## It is checkable

`atelier verify --skill <name> <file>` reads any text against the standard, whoever wrote it: you, a model, or an
agent in another tool. Rules a check can read are read by code on every piece. Rules only a person can judge are
listed as yours, never reported as met.

## It moves

- **To a coding agent in a project:** every build installs the skill for Claude Code (`.claude/skills/<name>/`), or
  for Codex with `--host codex`. `atelier setup` adds the Atelier tools to the agents in the project.
- **To any tool that takes a prompt:** `atelier export --skill <name> --out <file>` writes the skill as one file, your
  pieces included.
- **To another machine:** a standard lives in one folder, `~/.atelier/skills/<name>` (or under `ATELIER_DATA`). Copy
  the folder, or point `ATELIER_DATA` at a shared place, and the skill, its versions and its reference set come with
  it.
- **To another model:** run it with `--model`, `--provider` and `--base-url`. The run goes on and the record says
  which model wrote the piece.

## One standard, three uses

1. **Writing.** New pieces written from your own, in your method. This is what Atelier ships today.
2. **Reviewing.** Reading someone else's draft against the same standard. `atelier verify` is the start of it.
3. **Grading.** The same rules and reference set as the grader when you train or choose a model. Not built yet.
