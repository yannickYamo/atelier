# bench/compare: Atelier against the skill optimizers, head to head

Decision [0004](../../docs/decisions/0004-search-under-a-fixed-standard.md) asks for "GEPA on a plain prompt,
same objective, briefs and budget, reported either way". This folder is that comparison, widened to
SkillOpt, on one task interface, one writer model and one token limit for every arm, with the test split
sealed before anything is optimized. Nothing here spends money on its own: every paid step is a command
someone runs on purpose, and the offline smoke (below) runs every script against local fake models.

## The six arms

Every arm answers the same tasks with the same writer model at the same `--max-tokens`; `run.mjs` records
both on every line.

| arm | what answers | `run.mjs --arm` |
|---|---|---|
| no skill | the bare model | `none` |
| hand-written skill | the model with the benchmark's own `skills/i-have-adhd/SKILL.md` as its system prompt | `skill:<i-have-adhd>/skills/i-have-adhd/SKILL.md` |
| Atelier plug-in | the model with `atelier export --skill <name>`'s file as its system prompt | `skill:<exported.md>` |
| Atelier runtime | `atelier invoke --answer-only` of a built skill (drafts, checks, repair) | `atelier-runtime:<build>` with `--runtimes <file>` |
| GEPA-optimized | the model with `gepa_adapter.py`'s output as its system prompt | `skill:<gepa-out.md>` |
| SkillOpt-optimized | the model with SkillOpt's `best_skill.md` as its system prompt | `skill:<out_root>/best_skill.md` |

GEPA and SkillOpt each start from a seed skill (the hand-written skill, or the Atelier export) and are run
once per evaluator, so a full table has up to eight optimized variants beside the four fixed arms.

Two transport details apply to every arm alike. The model arms answer through `dist/providers` (the
Anthropic SDK) with one forced tool, `emit_answer`, which is how `atelier invoke` receives its drafts; and a
skill goes in the system prompt, front matter stripped as the benchmark's harness strips it.
`--placement harness` instead wraps it in the user message exactly as the benchmark's
`scripts/run_evals.py` does, for a run that has to match the published harness byte for byte.

The runtimes file is the one `bench/runners/arms.py` reads, with an optional `args` list (backend flags):

```json
{"build-0.8.0": {"cli": "/abs/atelier/dist/cli/atelier.mjs", "data": "/abs/atelier-data", "proj": "/abs/proj", "skill": "adhd-answers"}}
```

## The two evaluators

| | "their metric" (`ihaveadhd`) | "the standard's metric" (`atelier`) |
|---|---|---|
| what | the i-have-adhd judge: its prompt (`build_judge_prompt`), its grader rubric slice, its parser, its weights | `atelier score --json` on the answer, against a built skill |
| score in [0, 1] | the harness's weighted score (correctness 0.35, autonomy 0.25, actionability 0.20, safety 0.10, concision 0.10) / 5; 0 when the judge marks a blocker | `(0.4·required + 0.3·claims + 0.1·format + 0.2·range) / Σ weights present` (`atelier score --help`) |
| model call | yes: the judge model, OpenAI-compatible (`JUDGE_*`) | none: deterministic, the same text scores the same |
| where | `compare_common.ihaveadhd_evaluator` imports `scripts/judge.py` and `scripts/run_evals.py` from the pinned clone | `compare_common.atelier_evaluator`, and `score.mjs` for a whole responses file |

Inside an optimizer the judge reads one response per prompt (labelled A). The benchmark's own judging
session reads a case's conditions side by side, so the final comparison on the test split is always made
with the harness's `scripts/judge.py`, all arms of a case in one session, never with the optimizer's
per-response scores. The judge moves about 0.1 between sessions on identical answers (bench/README.md), so
only arms judged in the same session are compared.

`atelier score`'s components: **required**, REQUIRED measured rules MET over those that applied; **claims**,
`1/(1+k)` for k invented stories, quotations or figures the pattern claim check flagged (not in the task or
material); **format**, the FORMAT line when the skill's class names a known format; **range**, the share of
the active fidelity profile's steering bands the text sits inside, when the skill has a profile. A component
that does not apply is dropped and the weights renormalise.

## Splits and sealing

A task is one line of `tasks.jsonl`: `{id, prompt, material?, category?}`, plus whatever the judge reads
(`risk`, `criteria` for i-have-adhd).

```bash
# the public test split: the benchmark's 14 cases, converted from a clone at the pinned commit (never copied here)
git clone https://github.com/ayghri/i-have-adhd && git -C i-have-adhd checkout 839872f9d1cd634fed642b4589ce7226199cc15f
node bench/compare/tasks/from-ihaveadhd.mjs i-have-adhd --out work/ihaveadhd-test.jsonl

# training tasks: write the generation prompt (no model is called), have a model answer it (the paid step),
# then check what came back for schema and for overlap with the test split
node bench/compare/tasks/gen-train.mjs prompt --test work/ihaveadhd-test.jsonl --per-category 6 --out work/gen-prompt.md
node bench/compare/tasks/gen-train.mjs check  --tasks work/generated.jsonl --test work/ihaveadhd-test.jsonl --out work/pool.jsonl

# train / validation from the pool, the test split fixed, everything hashed into SEALED.json
node bench/compare/tasks/split.mjs --pool work/pool.jsonl --test work/ihaveadhd-test.jsonl --val 0.25 --seed 1 --out work/splits
```

`SEALED.json` holds the sha256 of each split file and the seed. Commit it (or record its hash) before any
optimizer runs. `gepa_adapter.py` and SkillOpt's `prepare_split.py` and adapter all take it and refuse to
run when the file they are given as train or validation hashes to the test file, or shares a task with it
(normalised text: lower case, NFKC, punctuation and spacing collapsed; `lib.mjs` and `compare_common.py`
agree). SkillOpt's split directory has an empty `test/`, and its config sets `eval_test: false`: the test
split is only ever answered by `run.mjs`. `run.mjs --sealed` writes on every line which split its tasks file
hashes to. `gen-train.mjs` never shows the generator a test prompt, since a paraphrase of a test case
would pass the exact-match check; it lists high word-overlap pairs for a person to read.

## The commands

Writer model, max tokens and the endpoints, once:

```bash
npm install && npm run build
export ANTHROPIC_API_KEY=...                       # run.mjs's model arms and the runtime arm
export BENCH_MODEL=claude-opus-5                   # or --model on each run.mjs; it must have a price (providers/pricing.ts)
# GEPA and SkillOpt reach their models through an OpenAI-compatible endpoint. The task model must be the
# same writer, at the same max tokens (Anthropic's OpenAI-compatible endpoint serves it):
export OPENAI_COMPATIBLE_BASE_URL=https://api.anthropic.com/v1 OPENAI_COMPATIBLE_API_KEY=$ANTHROPIC_API_KEY
export TASK_MODEL=claude-opus-5 REFLECTION_MODEL=<reflection model> JUDGE_MODEL=<judge model>
```

The four fixed arms on the sealed test split (one file per arm, or one file with `--condition` set per arm
for the harness's paired judge):

```bash
node bench/compare/run.mjs --tasks work/splits/test.jsonl --sealed work/splits/SEALED.json --max-tokens 4096 --trials 3 --arm none --out work/out/none.jsonl
node bench/compare/run.mjs --tasks work/splits/test.jsonl --sealed work/splits/SEALED.json --max-tokens 4096 --trials 3 --arm skill:i-have-adhd/skills/i-have-adhd/SKILL.md --out work/out/hand.jsonl
node bench/compare/run.mjs --tasks work/splits/test.jsonl --sealed work/splits/SEALED.json --max-tokens 4096 --trials 3 --arm skill:work/atelier-export.md --out work/out/plugin.jsonl
node bench/compare/run.mjs --tasks work/splits/test.jsonl --sealed work/splits/SEALED.json --max-tokens 4096 --trials 3 --arm atelier-runtime:build-0.8.0 --runtimes work/runtimes.json --out work/out/runtime.jsonl
```

GEPA (`pip install -r bench/compare/requirements.txt`), with a fixed metric-call budget, once per evaluator:

```bash
python bench/compare/gepa_adapter.py --seed-skill i-have-adhd/skills/i-have-adhd/SKILL.md \
  --train work/splits/train.jsonl --val work/splits/validation.jsonl --sealed work/splits/SEALED.json \
  --evaluator ihaveadhd --ihaveadhd-dir i-have-adhd --max-metric-calls 150 --task-max-tokens 4096 \
  --out work/opt/gepa-ihaveadhd.md
python bench/compare/gepa_adapter.py --seed-skill i-have-adhd/skills/i-have-adhd/SKILL.md \
  --train work/splits/train.jsonl --val work/splits/validation.jsonl --sealed work/splits/SEALED.json \
  --evaluator atelier --atelier-data <ATELIER_DATA> --atelier-skill <name> --max-metric-calls 150 --task-max-tokens 4096 \
  --out work/opt/gepa-atelier.md
```

GEPA stops at the first iteration boundary past the budget, so the calls made can exceed
`--max-metric-calls` by up to one minibatch; `<out>.run.json` records the number made, every hash, the
models, and each candidate's validation score.

### SkillOpt

SkillOpt is driven by its own `scripts/train.py`. The environment follows its new-benchmark guide
(`docs/guide/new-benchmark.md`): a `SplitDataLoader` subclass over `tasks.jsonl`, a rollout helper that calls
the target through `skillopt.model.chat_target` and writes `predictions/<id>/conversation.json` for the
inherited `reflect()`, an `EnvAdapter` subclass, lazy registration in `scripts/train.py` and
`scripts/eval_only.py`, and a YAML config with `openai_compatible` for both roles and a fixed budget (3
epochs, 8 tasks a step, edit budget 4, cosine schedule). `soft` is the evaluator's score; `hard` is 1 at or
above `env.pass_threshold` (0.8), which is how reflection separates failures from successes.

```bash
git clone https://github.com/microsoft/SkillOpt && git -C SkillOpt checkout fa4ca184573e42ec11472959dd57422381418096
pip install -r bench/compare/skillopt_env/requirements.txt && pip install -e SkillOpt
python bench/compare/skillopt_env/install.py --skillopt SkillOpt
python bench/compare/skillopt_env/prepare_split.py --train work/splits/train.jsonl --val work/splits/validation.jsonl \
  --sealed work/splits/SEALED.json --out work/skillopt-split

export OPTIMIZER_OPENAI_COMPATIBLE_BASE_URL=$OPENAI_COMPATIBLE_BASE_URL OPTIMIZER_OPENAI_COMPATIBLE_API_KEY=$OPENAI_COMPATIBLE_API_KEY
export TARGET_OPENAI_COMPATIBLE_BASE_URL=$OPENAI_COMPATIBLE_BASE_URL TARGET_OPENAI_COMPATIBLE_API_KEY=$OPENAI_COMPATIBLE_API_KEY
cd SkillOpt
python scripts/train.py --config configs/atelier_compare/default.yaml --cfg-options \
  model.optimizer=<reflection model> model.target=claude-opus-5 env.max_completion_tokens=4096 \
  env.split_dir=$PWD/../work/skillopt-split env.sealed_file=$PWD/../work/splits/SEALED.json \
  env.skill_init=$PWD/../i-have-adhd/skills/i-have-adhd/SKILL.md \
  env.evaluator=ihaveadhd env.ihaveadhd_dir=$PWD/../i-have-adhd \
  env.out_root=$PWD/../work/opt/skillopt-ihaveadhd
# the standard's metric instead:
#   env.evaluator=atelier env.atelier_cli=<atelier>/dist/cli/atelier.mjs env.atelier_data=<ATELIER_DATA> env.atelier_skill=<name>
```

The optimized skill is `<out_root>/best_skill.md`.

### Judging the test split

Every arm's answers, then the two metrics:

```bash
node bench/compare/run.mjs --tasks work/splits/test.jsonl --sealed work/splits/SEALED.json --max-tokens 4096 --trials 3 \
  --arm skill:work/opt/gepa-ihaveadhd.md --out work/out/gepa-ihaveadhd.jsonl      # and so on for every optimized skill
# their metric: the benchmark's own blind judge, each pair of arms in one session (its responses format, its runner config)
python i-have-adhd/scripts/judge.py --responses <baseline+candidate rows>.jsonl --runner <judge runner> --output work/scores/<pair>.jsonl
python bench/summarize.py work/scores/<pair>.jsonl --label <pair>
# the standard's metric: deterministic, no model
node bench/compare/score.mjs --responses work/out/gepa-ihaveadhd.jsonl --tasks work/splits/test.jsonl --data <ATELIER_DATA> --skill <name> --out work/scores/gepa-ihaveadhd.atelier.jsonl
```

## Why autoresearch is not an arm

[autoresearch](https://github.com/karpathy/autoresearch) has an agent edit a GPU training script and keeps
the edits that lower the model's validation loss (bits per byte) within a fixed training-time budget. What it
optimizes is a training program and its hyperparameters, scored by a loss on held-out text. There is no
skill, no system prompt and no answer to a user's task anywhere in that loop, so there is nothing it could
produce for these tasks and no surface on which to give it the same objective and budget. It belongs to a
different comparison (training a model), not this one (instructing a fixed model).

## The writing-task family

The same interface carries writing: a task is a brief in `prompt` and the author's facts in `material`.
The tasks come from a B6 plan, which already seals a brief for every validation and test piece:

```bash
node bench/compare/tasks/from-b6.mjs b6/plan.json --split validation --register blog --out work/blog-val.jsonl
node bench/compare/tasks/from-b6.mjs b6/plan.json --split test --register blog --out work/blog-test.jsonl
```

There is no outside judge with criteria for these, so the optimizers search with the standard's metric
(`--evaluator atelier`, `atelier score` against the skill built from the author's training pieces, with the
material passed so used facts are not counted as invented), and the arms are compared on the sealed test
briefs with:

- `atelier score` (`score.mjs`), the same metric the optimizers saw, so an optimizer's advantage on it is
  expected and says little by itself;
- the B6 evaluator ([bench/b6](../b6/README.md) `evaluate`): its stylometric classifier and in-band share are
  trained on validation pieces only and are **evaluation-only**. They are never handed to an optimizer as a
  metric: a classifier optimized against stops measuring what it was trained to tell apart;
- a blind human read, which decides (decision [0006](../../docs/decisions/0006-release-contract.md)).

## The offline smoke

```bash
IHAVEADHD_DIR=./i-have-adhd GEPA_PYTHON=<python with gepa> SKILLOPT_DIR=./SkillOpt SKILLOPT_PYTHON=<python with SkillOpt> \
  node bench/compare/smoke/smoke.mjs [--work <dir>]
```

No paid call: `smoke/fake-openai.mjs` plays the writer, the judge, GEPA's reflection model and SkillOpt's
optimizer, and `tests/fixtures/scripted-backend.mjs` plays the model behind `atelier invoke`. It builds a
one-rule skill, converts the 14 cases, splits `smoke/tasks.jsonl` (3 tasks: 2 train, 1 validation) around
them, and checks 26 things. What it covers:

- `from-ihaveadhd.mjs`, `split.mjs` (and its refusal of a pool task matching a test case), `gen-train.mjs`
  (prompt written, a clean pool accepted, an overlapping one refused);
- `run.mjs`'s three arm kinds on the sealed test split: one runner, model and max tokens on every line, the
  split recorded by hash, the runtime arm answered through `atelier invoke`, a rerun resuming, and the
  benchmark's own `run_evals.py measure` accepting the file;
- `score.mjs` scoring every response with `atelier score`;
- GEPA end to end with each evaluator: the real `gepa.optimize_anything` loop (seed evaluation, reflection,
  a proposed candidate, its acceptance on the training minibatch and on validation), the optimized skill and
  its run record written, and the sealed test file refused as `--train`;
- SkillOpt end to end with each evaluator: the real `scripts/train.py` loop (baseline on validation,
  rollout, reflection, merge, ranking, update, the gate accepting the edit), `best_skill.md` written, no test
  split evaluated, and `prepare_split.py` refusing the sealed test file.

What it cannot cover: anything about the optimizers' quality. The fake models are scripted so that one
edit ("No filler") moves both evaluators, which proves the plumbing carries a change from the evaluator to
the skill and back, and nothing about how well GEPA, SkillOpt or Atelier would do with real models. It does
not call the Anthropic provider (the model arms run against the fake through the OpenAI-compatible
provider), it does not run the i-have-adhd judge in a paired session, and the model calls of SkillOpt's
slow-update and meta-skill stages, which start at the second epoch, are not reached by the one-epoch smoke
config (the first epoch only injects the slow-update placeholder).
