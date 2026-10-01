"""Rollout: the target model answers each task with the candidate skill as its system prompt, and is scored.

The target model is called through skillopt.model.chat_target, so it is whatever target backend the config
names (openai_compatible for this benchmark). The score comes from one of the two compare evaluators
(compare_common.py): "ihaveadhd", the outside benchmark's own judge, or "atelier", `atelier score --json`.
`soft` is that score in [0, 1]; `hard` is 1 when it reaches the configured pass threshold, which is what
SkillOpt's reflection splits failures from successes on.
"""
from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable

from skillopt.model import chat_target
from skillopt.envs.atelier_compare import compare_common as cc


def _feedback_text(score: float, feedback: dict[str, Any]) -> str:
    if feedback.get("broken"):
        return f"score {score:.3f}; broken: " + "; ".join(feedback["broken"])
    if "notes" in feedback:
        return f"score {score:.3f}; judge: {feedback['notes']}"
    return f"score {score:.3f}"


def _rollout_one(item: dict, skill_content: str, *, evaluate: Callable, prediction_dir: Path,
                 max_completion_tokens: int, pass_threshold: float) -> dict:
    task = item["task"]
    # Front matter dropped, as run.mjs and the benchmark's harness drop it before the skill reaches a model.
    system = cc.strip_frontmatter(skill_content)
    user = cc.user_message(task)
    prediction, _usage = chat_target(system=system, user=user, max_completion_tokens=max_completion_tokens)
    prediction = (prediction or "").strip()
    score, feedback = evaluate(task, prediction)
    hard = int(score >= pass_threshold)

    # EnvAdapter.reflect() reads this exact path.
    task_dir = prediction_dir / str(item["id"])
    task_dir.mkdir(parents=True, exist_ok=True)
    conversation = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
        {"role": "assistant", "content": prediction},
    ]
    (task_dir / "conversation.json").write_text(json.dumps(conversation, ensure_ascii=False, indent=2), encoding="utf-8")

    result = {
        "id": str(item["id"]),
        "hard": hard,
        "soft": float(score),
        "predicted_answer": prediction,
        "task_description": task["prompt"],
        "question": task["prompt"],
        "task_type": item.get("task_type", "atelier_compare"),
        "target_system_prompt": system,
        "target_user_prompt": user,
        "n_turns": 1,
        "evaluator_feedback": feedback,
    }
    if not hard:
        result["fail_reason"] = _feedback_text(score, feedback)
    return result


def run_batch(*, items: list[dict], skill_content: str, out_root: str, evaluate: Callable, workers: int = 4,
              max_completion_tokens: int = 4096, pass_threshold: float = 0.8) -> list[dict]:
    os.makedirs(out_root, exist_ok=True)
    prediction_dir = Path(out_root, "predictions")

    def one(item: dict) -> dict:
        return _rollout_one(item, skill_content, evaluate=evaluate, prediction_dir=prediction_dir,
                            max_completion_tokens=max_completion_tokens, pass_threshold=pass_threshold)

    with ThreadPoolExecutor(max_workers=max(1, int(workers))) as pool:
        results = list(pool.map(one, items))
    Path(out_root, "rollouts.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    return results
