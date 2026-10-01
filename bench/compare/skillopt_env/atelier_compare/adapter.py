"""SkillOpt adapter for compare tasks, scored by the outside benchmark's judge or by `atelier score`."""
from __future__ import annotations

import os

from skillopt.datasets.base import BatchSpec
from skillopt.envs.base import EnvAdapter
from skillopt.envs.atelier_compare import compare_common as cc
from skillopt.envs.atelier_compare.dataloader import AtelierCompareDataLoader
from skillopt.envs.atelier_compare.rollout import run_batch


class AtelierCompareAdapter(EnvAdapter):
    """Rolls out a candidate skill on compare tasks and scores each answer with one evaluator.

    The sealed test split never reaches SkillOpt: `sealed_file` (SEALED.json from tasks/split.mjs) is
    required, the train and val task files are refused when either hashes to the sealed test file or shares
    a task with it, and a non-empty test/ split is refused.
    """

    def __init__(
        self,
        split_dir: str = "",
        data_path: str = "",
        split_mode: str = "split_dir",
        split_ratio: str = "2:1:7",
        split_seed: int = 42,
        split_output_dir: str = "",
        workers: int = 4,
        analyst_workers: int = 4,
        failure_only: bool = False,
        minibatch_size: int = 8,
        edit_budget: int = 4,
        seed: int = 42,
        limit: int = 0,
        max_completion_tokens: int = 4096,
        evaluator: str = "",
        pass_threshold: float = 0.8,
        sealed_file: str = "",
        ihaveadhd_dir: str = "",
        any_commit: bool = False,
        atelier_cli: str = "",
        atelier_data: str = "",
        atelier_skill: str = "",
    ) -> None:
        self.workers = workers
        self.analyst_workers = analyst_workers
        self.failure_only = failure_only
        self.minibatch_size = minibatch_size
        self.edit_budget = edit_budget
        self.max_completion_tokens = int(max_completion_tokens)
        self.evaluator_name = evaluator
        self.pass_threshold = float(pass_threshold)
        self.sealed_file = sealed_file
        self.ihaveadhd_dir = ihaveadhd_dir
        self.any_commit = bool(any_commit)
        self.atelier_cli = atelier_cli
        self.atelier_data = atelier_data
        self.atelier_skill = atelier_skill
        self.evaluate = None
        self.dataloader = AtelierCompareDataLoader(
            split_dir=split_dir,
            data_path=data_path,
            split_mode=split_mode,
            split_ratio=split_ratio,
            split_seed=split_seed,
            split_output_dir=split_output_dir,
            seed=seed,
            limit=limit,
        )

    # ── Lifecycle ───────────────────────────────────────────────────────

    def setup(self, cfg: dict) -> None:
        super().setup(cfg)
        if not self.sealed_file:
            raise ValueError("atelier_compare needs env.sealed_file: the SEALED.json whose test split SkillOpt must never read")
        if (self.dataloader.split_mode or "split_dir") != "split_dir":
            raise ValueError("atelier_compare reads a prepared split directory (split_mode: split_dir), never a ratio split")
        split_dir = self.dataloader.split_dir or cfg.get("split_dir", "")
        files = []
        for name in ("train", "val", "test"):
            found = sorted(p for p in os.listdir(os.path.join(split_dir, name)) if p.endswith(".jsonl"))
            if not found:
                raise ValueError(f"{split_dir}/{name}/ holds no .jsonl task file")
            files.append(os.path.join(split_dir, name, found[0]))
        if cc.read_jsonl(files[2]):
            raise ValueError(f"{files[2]} is not empty: the test split is judged outside SkillOpt (bench/compare/run.mjs)")
        self.seal = cc.refuse_sealed(files[:2], self.sealed_file)
        self.dataloader.setup(cfg)
        self.evaluate, self.evaluator_info = cc.make_evaluator(
            self.evaluator_name, ihaveadhd_dir=self.ihaveadhd_dir or None, atelier_cli=self.atelier_cli or None,
            atelier_data=self.atelier_data or None, atelier_skill=self.atelier_skill or None, any_commit=self.any_commit)

    def get_dataloader(self):
        return self.dataloader

    # ── Env construction ────────────────────────────────────────────────

    def build_env_from_batch(self, batch: BatchSpec, **kwargs):
        return list(batch.payload or [])

    def build_train_env(self, batch_size: int, seed: int, **kwargs):
        batch = self.dataloader.build_train_batch(batch_size=batch_size, seed=seed, **kwargs)
        return self.build_env_from_batch(batch, **kwargs)

    def build_eval_env(self, env_num: int, split: str, seed: int, **kwargs):
        batch = self.dataloader.build_eval_batch(env_num=env_num, split=split, seed=seed, **kwargs)
        return self.build_env_from_batch(batch, **kwargs)

    # ── Rollout (reflect is inherited) ──────────────────────────────────

    def rollout(self, env_manager, skill_content: str, out_dir: str, **kwargs) -> list[dict]:
        if self.evaluate is None:
            raise RuntimeError("atelier_compare: setup() was not called, so there is no evaluator")
        return run_batch(
            items=list(env_manager),
            skill_content=skill_content,
            out_root=out_dir,
            evaluate=self.evaluate,
            workers=self.workers,
            max_completion_tokens=self.max_completion_tokens,
            pass_threshold=self.pass_threshold,
        )

    def get_task_types(self) -> list[str]:
        seen: list[str] = []
        for item in self.dataloader.train_items + self.dataloader.val_items + self.dataloader.test_items:
            tt = str(item.get("task_type") or "atelier_compare")
            if tt not in seen:
                seen.append(tt)
        return seen or ["atelier_compare"]
