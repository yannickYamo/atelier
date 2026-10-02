#!/usr/bin/env python3
"""bench/compare/gepa_adapter.py -- GEPA's optimize_anything on a skill file, under a fixed metric-call budget.

    python bench/compare/gepa_adapter.py \
        --seed-skill seed/SKILL.md --train splits/train.jsonl --val splits/validation.jsonl \
        --sealed splits/SEALED.json --evaluator ihaveadhd --ihaveadhd-dir ./i-have-adhd \
        --max-metric-calls 150 --out out/gepa-ihaveadhd.md

The candidate is the skill's text (front matter stripped, as the benchmark's harness strips it before it
reaches a model). GEPA runs in its generalization mode: `dataset` is the training tasks, `valset` the
validation tasks, and the evaluator is called once per (candidate, task) pair:

    the task model answers the task with the candidate as its system prompt
    the evaluator scores the answer          ihaveadhd: the benchmark's judge (compare_common.py)
                                             atelier:   `atelier score --json` against a built skill
    (score, side_info) goes back to GEPA     side_info: the task, the answer, and the evaluator's feedback

Both models are reached through an OpenAI-compatible endpoint named in the environment (compare_common.py):
TASK_* for the task model, REFLECTION_* for GEPA's reflection model, JUDGE_* for the ihaveadhd judge. The
task model should be the writer every other arm uses (run.mjs --model), at the same max tokens.

The sealed test split is refused before anything is read: --sealed is required, and a --train or --val file
that hashes to the sealed test file, or shares a task with it, stops the run (compare_common.refuse_sealed).

Writes the best candidate to --out and a run record to --out + ".run.json": every hash, the budget, the
models, the metric calls made and the validation score of each candidate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from importlib import metadata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import compare_common as cc  # noqa: E402

OBJECTIVE = ("Improve this response-style skill. A model reads it as its system prompt and then answers a "
             "user's task; a higher score means the answers serve the user better under the evaluator. "
             "Return the complete skill.")
BACKGROUND = ("The skill is used on tasks the optimizer never sees. Keep it general: no rule that names a "
              "particular task, and no content copied from the evaluation feedback.")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--seed-skill", required=True, help="the skill file the search starts from")
    p.add_argument("--train", required=True, help="training tasks (tasks.jsonl)")
    p.add_argument("--val", required=True, help="validation tasks (tasks.jsonl)")
    p.add_argument("--sealed", required=True, help="SEALED.json from tasks/split.mjs; its test split is refused")
    p.add_argument("--evaluator", required=True, choices=["ihaveadhd", "atelier"])
    p.add_argument("--max-metric-calls", required=True, type=int, help="the fixed budget: evaluator calls, in total")
    p.add_argument("--out", required=True, help="where the optimized skill is written")
    p.add_argument("--ihaveadhd-dir", help="a clone of ayghri/i-have-adhd at the pinned commit")
    p.add_argument("--any-commit", action="store_true", help="accept an i-have-adhd clone at another commit")
    p.add_argument("--atelier-cli", default=str(Path(__file__).resolve().parents[2] / "dist" / "cli" / "atelier.mjs"))
    p.add_argument("--atelier-data", help="ATELIER_DATA holding the built skill the atelier evaluator scores against")
    p.add_argument("--atelier-skill", help="the built skill's name")
    p.add_argument("--task-max-tokens", type=int, default=4096, help="max tokens per answer (the same as every arm)")
    p.add_argument("--reflection-minibatch", type=int, default=3)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--run-dir", help="GEPA's own run directory (state, for resuming)")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.max_metric_calls < 1:
        raise SystemExit("--max-metric-calls must be at least 1")
    try:
        seal = cc.refuse_sealed([args.train, args.val], args.sealed)
    except cc.SealedSplitError as exc:
        print(f"gepa_adapter: refused: {exc}", file=sys.stderr)
        return 2
    train = cc.load_tasks(args.train)
    val = cc.load_tasks(args.val)
    seed_text = cc.strip_frontmatter(Path(args.seed_skill).read_text(encoding="utf-8"))

    from gepa.optimize_anything import EngineConfig, GEPAConfig, ReflectionConfig, optimize_anything

    task_model = cc.Endpoint("task")
    reflection_model = cc.Endpoint("reflection")
    evaluate_text, evaluator_info = cc.make_evaluator(
        args.evaluator, ihaveadhd_dir=args.ihaveadhd_dir, atelier_cli=args.atelier_cli,
        atelier_data=args.atelier_data, atelier_skill=args.atelier_skill, any_commit=args.any_commit)

    def evaluator(candidate: str, example: dict) -> tuple[float, dict]:
        response = cc.answer(task_model, candidate, example, args.task_max_tokens)
        score, feedback = evaluate_text(example, response)
        return score, {"Task": cc.user_message(example), "Response": response, "Score": score, "Feedback": feedback}

    def reflection_lm(prompt: str | list[dict]) -> str:
        messages = prompt if isinstance(prompt, list) else [{"role": "user", "content": prompt}]
        return reflection_model.chat(messages, max_tokens=8192)

    config = GEPAConfig(
        engine=EngineConfig(max_metric_calls=args.max_metric_calls, seed=args.seed, run_dir=args.run_dir,
                            max_workers=args.workers, use_cloudpickle=False, display_progress_bar=False),
        reflection=ReflectionConfig(reflection_lm=reflection_lm, reflection_minibatch_size=args.reflection_minibatch),
    )
    result = optimize_anything(seed_candidate=seed_text, evaluator=evaluator, dataset=train, valset=val,
                               objective=OBJECTIVE, background=BACKGROUND, config=config)
    best = result.best_candidate if isinstance(result.best_candidate, str) else json.dumps(result.best_candidate)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(best if best.endswith("\n") else f"{best}\n", encoding="utf-8")
    record = {
        "optimizer": "gepa.optimize_anything", "gepa_version": metadata.version("gepa"),
        "seed_skill": {"file": args.seed_skill, "sha256": hashlib.sha256(seed_text.encode()).hexdigest()},
        "train": {"file": args.train, "sha256": cc.sha256_file(args.train), "n": len(train)},
        "validation": {"file": args.val, "sha256": cc.sha256_file(args.val), "n": len(val)},
        "seal": seal, "evaluator": evaluator_info, "task_model": task_model.describe(),
        "reflection_model": reflection_model.describe(), "task_max_tokens": args.task_max_tokens,
        "budget": {"max_metric_calls": args.max_metric_calls, "total_metric_calls": result.total_metric_calls,
                   "task_calls": task_model.calls, "reflection_calls": reflection_model.calls},
        "seed": args.seed, "num_candidates": result.num_candidates, "best_idx": result.best_idx,
        "val_aggregate_scores": result.val_aggregate_scores,
        "best": {"file": str(out), "sha256": hashlib.sha256(best.encode()).hexdigest()},
    }
    Path(f"{out}.run.json").write_text(json.dumps(record, indent=1), encoding="utf-8")
    print(f"best candidate {result.best_idx} of {result.num_candidates}, validation "
          f"{result.val_aggregate_scores[result.best_idx]:.4f} (seed {result.val_aggregate_scores[0]:.4f}); "
          f"{result.total_metric_calls} metric calls → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
