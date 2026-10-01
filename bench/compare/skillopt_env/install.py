#!/usr/bin/env python3
"""Install the atelier_compare environment into a SkillOpt checkout, following its new-benchmark guide.

    python bench/compare/skillopt_env/install.py --skillopt ./SkillOpt

  Step 1-4  copies atelier_compare/ (data loader, rollout, adapter) to skillopt/envs/atelier_compare/,
            with compare_common.py beside them
  Step 5    adds the lazy registration block to _register_builtins() in scripts/train.py and
            scripts/eval_only.py
  Step 6    copies configs/default.yaml and configs/smoke.yaml to configs/atelier_compare/

Running it again replaces the copied files and leaves an existing registration alone.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARK = "atelier_compare"
BLOCK = """    try:
        from skillopt.envs.atelier_compare.adapter import AtelierCompareAdapter
        _ENV_REGISTRY["atelier_compare"] = AtelierCompareAdapter
    except ImportError:
        pass
"""


def register(script: Path) -> str:
    src = script.read_text(encoding="utf-8")
    if MARK in src:
        return f"{script.name}: already registered"
    head = "def _register_builtins() -> None:\n"
    at = src.find(head)
    if at < 0:
        raise SystemExit(f"{script}: no _register_builtins() to register in; has SkillOpt's entry point changed?")
    body = at + len(head)
    # After the docstring when there is one, so the block sits with the others.
    rest = src[body:]
    stripped = rest.lstrip()
    if stripped.startswith('"""'):
        close = rest.find('"""', rest.find('"""') + 3)
        body += rest.find("\n", close) + 1
    script.write_text(src[:body] + BLOCK + src[body:], encoding="utf-8")
    return f"{script.name}: registered atelier_compare"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--skillopt", required=True, help="the SkillOpt checkout")
    args = p.parse_args(argv)
    root = Path(args.skillopt).resolve()
    if not (root / "skillopt" / "envs" / "base.py").exists():
        raise SystemExit(f"{root} is not a SkillOpt checkout (no skillopt/envs/base.py)")
    env = root / "skillopt" / "envs" / "atelier_compare"
    if env.exists():
        shutil.rmtree(env)
    shutil.copytree(HERE / "atelier_compare", env, ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copyfile(HERE.parent / "compare_common.py", env / "compare_common.py")
    configs = root / "configs" / "atelier_compare"
    configs.mkdir(parents=True, exist_ok=True)
    for name in ("default.yaml", "smoke.yaml"):
        shutil.copyfile(HERE / "configs" / name, configs / name)
    print(f"environment → {env}")
    print(f"configs → {configs}")
    for script in ("train.py", "eval_only.py"):
        print(register(root / "scripts" / script))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
