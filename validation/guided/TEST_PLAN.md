# Guided build: one capped run on a real model

For the machine (or the agent on it) that runs the test. Everything a first user meets, in one script, with a hard
budget. The code under test is `main` at the commit this branch was cut from; this branch adds only `validation/guided/`.

## Rules

- The model key is read from the environment only (`ANTHROPIC_API_KEY`). Never print it, write it to a file or a log.
- Budget: `--budget 20` by default. The script stops before a step it cannot afford. Runs report their own cost; the two
  builds, the lasting fix and the rules route print none and are charged fixed allowances set high. The provider's
  console is the true figure: stop by hand if it nears the budget.
- Do not change the code under test. If something breaks, stop and report the command, the exit code and the last
  lines of the transcript in `out/`.
- Nothing from the run (pieces, results) is committed to the repository.

## 1. Free checks (about 15 minutes, $0)

```bash
git clone -b guided-test https://github.com/yannickYamo/atelier atelier-guided && cd atelier-guided
git diff --stat origin/main -- . ':!validation'      # must print nothing
npm ci && npm run build && npm test && npm run lint  # the suite is offline; all green
node dist/cli/atelier.mjs --help                     # four commands: new, run, fix, setup
```

Read `plugins/shared/skills/create/SKILL.md` and `fix/SKILL.md` as a host agent would: every command they name exists
(`node dist/cli/atelier.mjs <command> --help`), and a preview is never kept.

## 2. The paid run

```bash
export ANTHROPIC_API_KEY=...          # however the machine keeps it; never echo it
node dist/cli/atelier.mjs check       # the backend answers, before anything is spent
node validation/guided/run.mjs --budget 20 --out out
```

The case in `validation/guided/case/` uses the repository's six sample posts (`examples/blog/posts`, synthetic), a
five-step method note, four requests with notes, and one complaint meant for every piece. To test a real voice, copy the
folder, point `corpus` in `case.json` at the pieces, replace the method, the requests and the notes, and pass
`--case <folder>`. A real voice is the test that matters; the sample case checks the flow.

## 3. What it answers

Read `out/results.json` first, then the transcripts.

| Question | Where | Pass line |
|---|---|---|
| Does a guided build end ready, in plain words? | `steps.A`, `A-guided-build.txt` | exit 0, `ready`, 2 previews, `understood`, `howYouWrite` (each point with a sentence of the author's), no `internalWords`, `titleListedAsStep` false, `disputedStepShown` false |
| Does a folder with no method get the same build? | `steps.B`, `B-folder-only-build.txt` | the same line as A, and no rule-proposal screen |
| Are prompts few and answered in place? | `steps.A.prompts` | at most five before the first preview; none repeated |
| Are pieces near the author's length when none is asked? | `arms.base` against `corpus` | mean words within the corpus range, or close above it; `lengthGuideTold` 3 |
| Does a declined call end a run? | `arms.*.failed`, `declinedAskedAgain` | `failed` empty; any decline shows as asked again |
| Do the person's purpose answers help the writer? | `arms.card` against `arms.base`; `blind/pair-x-*` | a person prefers `card` in at least 2 of 3 pairs, and the measures do not move away from the corpus |
| Does a kept piece pull the voice away? | `arms.kept` against `arms.base`; `blind/pair-y-*` | measures stay as close to the corpus as `base` |
| Does a lasting correction work? | `steps.F`, `F-lasting-fix.txt` | a rule proposed in the person's sense, added, on the skill page, and undone by the page's command |
| Does the rules route reach its review screen? | `steps.G`, `G-rules-route.txt` | `reachedReview`, `callBoundHit` false |

Three pieces per arm is a first look: it can show a large effect and cannot rule out a small one. On the first run of
this case the same arm run twice differed as much as the arms did. The blind pairs are for a person to read before
opening `blind/key.json`.

## 4. Report back

`out/results.json`, `out/ledger.json`, the provider console's total, the first transcript that failed if one did, and
for each row above: pass, fail, or not shown. Say plainly what was not run.
