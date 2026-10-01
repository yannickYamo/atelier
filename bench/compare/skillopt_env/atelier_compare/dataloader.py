"""Data loader: compare tasks.jsonl files in a train/ val/ test/ split directory.

The split directory is written by bench/compare/skillopt_env/prepare_split.py from the train and validation
files of tasks/split.mjs. Its test/ holds an empty file: the sealed test split is answered and judged outside
SkillOpt, with bench/compare/run.mjs, so no SkillOpt stage can read it.
"""
from __future__ import annotations

import json
from pathlib import Path

from skillopt.datasets.base import SplitDataLoader


def _normalize_item(raw: dict) -> dict:
    """One compare task as a SkillOpt item. The full task rides along for the evaluators."""
    return {
        "id": str(raw["id"]),
        "question": str(raw["prompt"]),
        "task_type": str(raw.get("category") or "atelier_compare"),
        "task": dict(raw),
    }


class AtelierCompareDataLoader(SplitDataLoader):
    """Loads tasks.jsonl (one compare task per line) from each split directory."""

    def load_split_items(self, split_path: str) -> list[dict]:
        files = sorted(Path(split_path).glob("*.jsonl"))
        if not files:
            raise FileNotFoundError(f"No .jsonl task file found in {split_path}")
        items: list[dict] = []
        with files[0].open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    items.append(_normalize_item(json.loads(line)))
        return items
