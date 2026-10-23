# Atelier: instructions for coding agents

You've been pointed at this repository, probably to use Atelier on someone's writing. This file is the
short version of what to do. The README explains why; `docs/` explains how it works.

## What it is

A command-line tool (`atelier`) that reads a folder of someone's best work, proposes the rules behind it,
and, once the person approves them, compiles a skill that writes, checks and repairs new work to that
standard. It installs the skill for Claude Code (`.claude/skills/<name>/`) or Codex.

## Set it up

```bash
git clone https://github.com/yannickYamo/atelier && cd atelier   # source-available: see LICENSE
npm install && npm run build
npm link            # optional: puts `atelier` on PATH; otherwise use `node dist/cli/atelier.mjs`
atelier setup       # adds the Atelier MCP server to the coding agents in this project
```

The npm package (`@yannickyamo/atelier`) is not published yet. Once it is, `npm install -g @yannickyamo/atelier`
replaces the clone, the build and the link.

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
| a skill from their writing | `atelier new <folder-of-their-work> "<what it is for>"` (with no model key set this builds at once from the examples alone, with nothing to approve: tell them so), show them the rules it proposes, then `atelier new <folder> --accept` once **they** approve (or `--set p3=reject` for their changes) |
| a skill combining what they like from several authors | `atelier new <folder> "<what it is for>"`: the voices are declared by `author:` front matter, a subfolder per author, or `--authors` (an unlabelled folder is one voice; where the writing shows several, the build says so and `--voices` builds the blend), what is most characteristic of each is taken, every clash is settled by which side is more characteristic, and the skill is built in one call that says one line. Format and length alone never make another voice. Every inferred trait is preferred steering and cannot block until the person explicitly makes it required. Nothing is asked: do not ask them to choose between authors. If they said what they like, pass it as `--admire "<their words>"` (it weighs those traits up). `atelier report --skill <name>` shows every weight and settled clash; `atelier fix "<what was wrong>"` changes it. `--conflict <n>=A\|B\|both` is an expert override only, never asked for |
| a skill from rules they state | `atelier skill "<their rules, in their words>"`: with a model set up, the check each rule carries is read with the proposal and shown under it; a listed measurement is required on every output, a written check reports until they give finished examples, the rest is theirs to judge. Built from rules alone, `--draft-examples` drafts ten answers: show them, and record **their** ruling on each with `atelier rate d1 yes` or `no "why" --rule <rule>`, never yours; `atelier skill --yes --name <name>` then builds again on the rules they accepted |
| a skill from their method and finished examples (start here) | `atelier new <example file or folder> --method <method note>`: each step they wrote is a rule, in their words. Which check holds a step is read by a small model and held by code (a measurement from the list Atelier counts, or a check the model writes for that step, grounded on their own example; judgement where neither holds; a written check reports and blocks nothing until it is qualified on their examples, and its step stays required: a run waits for their review on it). No step is added, dropped or reworded by a model; with no model set up every step is theirs to judge. With a key set, small reads at build say how they sound and what each step asks the writer to decide (its condition, in the step's own words); on each run, which steps apply to that request is read and said to the writer before the draft, which of the author's own moves it calls for is read and recorded (served to the writer only with `--moves serve`, or when the skill's release says so), and the delivered text is read against the steps no count checks once their labels have qualified the reader, or on a run with `--taste` (reporting only, recorded for them to label; `--no-model` at build and `--no-taste` on a run skip the readers). `--review` shows what it would check and builds nothing: show them that, and build once **they** agree. Where a step of theirs is not what their own examples do, the skill is still built and the step blocks nothing until confirmed: pass `--yes` only when **they** say to keep the step as written |
| new work to that standard | `atelier run "<the task>"` (written, checked, repaired, recorded). Under the work is its evaluation, rule by rule, opening with where it stands: BLOCKED (something required was seen to fail), NEEDS REVIEW (nothing seen to fail; part of what they require was not read in full by a check, and is named for them to read) or VERIFIED (everything required was read in full and held). A `~` marks a rule a check read only part of: never report such a rule as met. What is done with it is its **delivery**, decided by the skill's consequence table after repair: SHIP, SHIP LABELLED, PERSON (shown marked for review, exit 0: show it to them, it waits in `atelier report --pending`) or BLOCK (exit 1). `atelier invoke --skill <name> "<the task>" --json` is the same run with its whole record. Only what the writer puts inside its `<work>` field is delivered; what it said outside is on the record (`work`), never in the work. A length the request states is a rule of the run: one more draft toward the range, kept only inside it. Before a piece is drafted, `--json` may return up to three `questions` (`id`, `ask`, `options`, `default`) only the person can answer, and the `plan` the work was written from: the work was written with the defaults; **ask the person**, never answer for them, and pass their answers with `--answers "<id>=<choice>,..."` on the next run. Material written as finished sentences is served as points: a copied stretch of 8 words or more is rewritten, and every copied stretch is on the record (`copied`) |
| to check or fix a text | `atelier verify --skill <name> <file>` (exit 1 = the delivery is BLOCK); add `--repair` to fix only what broke; `--json` opens with the same record head as `run --json` (state, certificate, record) |
| a host to block work that breaks the standard | `atelier verify --skill <name> --hook` as a Claude Code PostToolUse or Stop hook: reads the hook JSON on stdin, exits 2 with the rules on stderr only where the skill's consequence table blocks the work, 0 otherwise (with a note where it goes to a person, when the event carries nothing to check, or names a required rule it could not read on the event; 2 when it cannot check at all, an event that is not a JSON object included, so a misconfigured guard is seen, never passed). A Stop event is checked by the last assistant message of the transcript |
| their real stories and figures used | `atelier material --skill <name> <notes.md>` (each file is named as a person cites it: `notice-of-loss.txt` is "notice of loss", at the build and at a run; `--with <name>=<file>` keeps the name given): with it bound, a specific not in it is blocked on a strict skill, flagged for review on a grounded one and listed on a creative one; it is cut only where **they** chose `--cut` and a qualified reader found it. With nothing bound every specific is listed as unverifiable |
| how strictly the work is held | every build says the skill's latitude in one line (strict: house language, an untraced figure stops the work; grounded; creative: free composition, untraced facts listed): show it to them. `--latitude strict\|grounded\|creative` at the build, or `atelier amend --skill <name> --latitude <level> --reason "<why>"` after, changes it, only when **they** say so; `--unmeasured accept\|review` says whether the rules no check reads hold a run for their review, and `--accept-unmeasured <rule,...>` (at the build or with `amend`) accepts the rules **they** name, a rule a check reads only in part for its unread part; on a strict skill nothing is accepted unless they say so; all of it is kept when the skill is built again and listed on every record and certificate |
| to correct a piece, or the skill | `atelier fix "<what was wrong, in their words>"` writes that piece again and leaves the skill alone; add `--always` only when **they** say every run should do this (it may then ask them to approve a new rule); `--evaluation` when they say the evaluation was wrong about the work |
| to see where a skill stands | `atelier status --skill <name>` |
| an agent to check its own output, or to use Atelier as an app | `atelier setup` adds the MCP server (`atelier mcp`) to the agents in the project; `--dry-run` shows what it would write. Reading tools: `atelier_verify`, `atelier_rules`, `atelier_list_skills`, `atelier_skill_report`. Building tools, the same front door as the terminal: `atelier_new` (shows the screen; builds only with `approve: true` after the **person** said so), `atelier_run` (the work and its whole record), `atelier_report`, `atelier_rate` (the person's ruling, never yours), `atelier_fix` |
| whether a run can ship, and why | `atelier report <run>` (the evaluation, its delivery and the trace); `atelier report --pending` lists the runs sent to the person; ask the person, then `atelier rate <run> yes "why"` (or `no "why" --rule <rule>`): their ruling holds the written checks again at once, with nothing more to run; `atelier eval --skill <name>` over runs. Change what a finding does only when **they** say so: `atelier amend --skill <name> --consequence <finding>=<action> --reason "<why>"` |
| where outputs sit against the author's range, and the releases that steer them | `atelier fidelity --skill <name>` (`--read <file>` for one text, `--rollback` to undo a release) |
| whether the skill's detector and steering features hold on texts they never saw | `atelier qualify --skill <name>` (topic labels in each piece's front matter, or `--topics <file>`) |

`atelier --help` shows the three commands a person needs (new, run, fix); `atelier lab` lists every other; `atelier <command> --help` explains one.

## Rules for agents

- **The person approves the standard, never you.** Show them the proposed rules and let them accept or
  change them. Don't pass `--accept` on their behalf without asking.
- **Don't edit files under `.claude/skills/<name>/` by hand.** They are compiled output: a change there
  isn't recorded and the next build overwrites it. To change what "good" means, use `atelier confirm` or
  `atelier amend`; to change how it's carried, `atelier fix "<what was wrong>" --always`.
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
