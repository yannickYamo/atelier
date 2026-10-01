#!/usr/bin/env python3
"""Write the SkillOpt split directory from the compare train and validation files.

    python bench/compare/skillopt_env/prepare_split.py --train splits/train.jsonl \
        --val splits/validation.jsonl --sealed splits/SEALED.json --out splits-skillopt

    splits-skillopt/train/tasks.jsonl   the training tasks, byte for byte (so their sha256 is unchanged)
    splits-skillopt/val/tasks.jsonl     the validation tasks, byte for byte
    splits-skillopt/test/tasks.jsonl    empty: the sealed test split is answered and judged with run.mjs

Refuses before writing anything when either file is the sealed test file or shares a task with it.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import compare_common as cc  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--train", required=True)
    p.add_argument("--val", required=True)
    p.add_argument("--sealed", required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args(argv)
    try:
        cc.refuse_sealed([args.train, args.val], args.sealed)
    except cc.SealedSplitError as exc:
        print(f"prepare_split: refused: {exc}", file=sys.stderr)
        return 2
    cc.load_tasks(args.train)
    cc.load_tasks(args.val)
    out = Path(args.out)
    for name, src in (("train", args.train), ("val", args.val)):
        (out / name).mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, out / name / "tasks.jsonl")
    (out / "test").mkdir(parents=True, exist_ok=True)
    (out / "test" / "tasks.jsonl").write_text("", encoding="utf-8")
    print(f"split directory for SkillOpt → {out} (test/ left empty on purpose)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
