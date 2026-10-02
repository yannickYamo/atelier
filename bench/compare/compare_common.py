#!/usr/bin/env python3
"""bench/compare/compare_common.py -- what the GEPA adapter and the SkillOpt environment share.

Standard library only, so it runs in any optimizer's environment (skillopt_env/install.py copies it into
the SkillOpt package next to the environment).

  - the task file and the sealed test split: refuse_sealed() is called before any optimizer reads a task
  - one OpenAI-compatible chat call per role (task model, reflection model, judge), from the environment:
      TASK_BASE_URL / TASK_API_KEY / TASK_MODEL
      REFLECTION_BASE_URL / REFLECTION_API_KEY / REFLECTION_MODEL
      JUDGE_BASE_URL / JUDGE_API_KEY / JUDGE_MODEL
    each falling back to OPENAI_COMPATIBLE_BASE_URL / OPENAI_COMPATIBLE_API_KEY
  - the two evaluators, each returning (score in [0, 1], feedback dict):
      ihaveadhd  "their metric": the i-have-adhd benchmark's own judge prompt, rubric slice and parser,
                 imported from a clone at the pinned commit, sent to the judge model; score = the harness's
                 weighted score / 5 (WEIGHTS from its run_evals.py), and 0 when the judge marks a blocker
      atelier    "the standard's metric": `atelier score --json` on the response (cli/commands/score.ts),
                 deterministic and offline
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable

PINNED_IHAVEADHD = "839872f9d1cd634fed642b4589ce7226199cc15f"


# ── tasks and the seal ────────────────────────────────────────────────────────────────────────────

def read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    rows = []
    for number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}: line {number}: {exc.msg}") from exc
    return rows


def sha256_file(path: str | Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def normalise_text(text: str) -> str:
    """lib.mjs normalise(): lower case, NFKC, every run of non-letters and non-digits to one space."""
    text = unicodedata.normalize("NFKC", str(text or "").lower())
    return re.sub(r"[\W_]+", " ", text).strip()


def task_key(task: dict[str, Any]) -> str:
    return normalise_text(f"{task.get('prompt', '')} {task.get('material', '') or ''}")


def load_tasks(path: str | Path) -> list[dict[str, Any]]:
    tasks = read_jsonl(path)
    seen: set[str] = set()
    for i, t in enumerate(tasks, start=1):
        if not isinstance(t.get("id"), str) or not t["id"]:
            raise ValueError(f"{path}: task {i}: id must be a non-empty string")
        if t["id"] in seen:
            raise ValueError(f"{path}: duplicate id {t['id']}")
        seen.add(t["id"])
        if not isinstance(t.get("prompt"), str) or not t["prompt"].strip():
            raise ValueError(f"{path}: task {t['id']}: prompt must be a non-empty string")
    return tasks


class SealedSplitError(RuntimeError):
    """An optimizer was handed the sealed test split, or a file sharing a task with it."""


def refuse_sealed(paths: list[str | Path], sealed_path: str | Path) -> dict[str, Any]:
    """Refuse when any file given for search is the sealed test file, by hash, or shares a task with it.

    Returns a record of what was checked (each file's sha256 and the sealed test's), for the run record.
    """
    sealed = json.loads(Path(sealed_path).read_text(encoding="utf-8"))
    test = sealed.get("test") or {}
    test_sha = test.get("sha256")
    if not test_sha:
        raise SealedSplitError(f"{sealed_path} names no test sha256: it is not a SEALED.json from split.mjs")
    test_file = Path(sealed_path).parent / str(test.get("file", "test.jsonl"))
    test_tasks = load_tasks(test_file) if test_file.exists() else []
    if test_file.exists() and sha256_file(test_file) != test_sha:
        raise SealedSplitError(f"{test_file} no longer hashes to the sealed {test_sha}: the test split was changed after sealing")
    test_keys = {task_key(t): t["id"] for t in test_tasks} | {normalise_text(t["prompt"]): t["id"] for t in test_tasks}
    checked = {}
    for p in paths:
        digest = sha256_file(p)
        if digest == test_sha:
            raise SealedSplitError(f"{p} is the sealed test split (sha256 {digest}). An optimizer never reads it.")
        clash = [(t["id"], test_keys.get(task_key(t)) or test_keys.get(normalise_text(t["prompt"])))
                 for t in load_tasks(p)
                 if task_key(t) in test_keys or normalise_text(t["prompt"]) in test_keys]
        if clash:
            raise SealedSplitError(f"{p} shares {len(clash)} task(s) with the sealed test split: "
                                   + ", ".join(f"{a}~{b}" for a, b in clash))
        checked[str(p)] = digest
    return {"sealed": str(sealed_path), "test_sha256": test_sha, "test_tasks_checked": len(test_tasks), "files": checked}


def user_message(task: dict[str, Any]) -> str:
    """The task as every model arm sends it (run.mjs withMaterial)."""
    material = task.get("material")
    return f"{task['prompt']}\n\n<material>\n{material}\n</material>" if material else task["prompt"]


def strip_frontmatter(text: str) -> str:
    """run_evals.py _strip_frontmatter: drop a leading YAML block; leave an unclosed one alone."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return text
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            return "\n".join(lines[index + 1:]).lstrip("\n")
    return text


# ── one chat call, OpenAI-compatible ─────────────────────────────────────────────────────────────

class Endpoint:
    """One role's backend, read from the environment (see the module docstring)."""

    def __init__(self, role: str, model: str | None = None):
        role_up = role.upper()
        self.role = role
        self.base_url = (os.environ.get(f"{role_up}_BASE_URL") or os.environ.get("OPENAI_COMPATIBLE_BASE_URL") or "").rstrip("/")
        self.api_key = os.environ.get(f"{role_up}_API_KEY") or os.environ.get("OPENAI_COMPATIBLE_API_KEY") or ""
        self.model = model or os.environ.get(f"{role_up}_MODEL") or os.environ.get("OPENAI_COMPATIBLE_MODEL") or ""
        if not self.base_url or not self.model:
            raise RuntimeError(f"the {role} endpoint needs {role_up}_BASE_URL and {role_up}_MODEL "
                               "(or OPENAI_COMPATIBLE_BASE_URL and OPENAI_COMPATIBLE_MODEL)")
        self.calls = 0

    def describe(self) -> dict[str, str]:
        return {"role": self.role, "base_url": self.base_url, "model": self.model}

    def chat(self, messages: list[dict[str, Any]], max_tokens: int, temperature: float | None = None,
             retries: int = 3, timeout: float = 600) -> str:
        body: dict[str, Any] = {"model": self.model, "messages": messages, "max_tokens": max_tokens}
        if temperature is not None:
            body["temperature"] = temperature
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        last: Exception | None = None
        for attempt in range(retries):
            try:
                req = urllib.request.Request(f"{self.base_url}/chat/completions", data=json.dumps(body).encode(),
                                             headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=timeout) as res:
                    payload = json.loads(res.read().decode())
                self.calls += 1
                content = payload["choices"][0]["message"].get("content")
                if isinstance(content, list):
                    content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
                return str(content or "")
            except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError, TimeoutError) as exc:
                last = exc
                time.sleep(min(2 ** attempt, 8))
        raise RuntimeError(f"{self.role} call to {self.base_url} failed {retries} times: {last}")


def answer(endpoint: Endpoint, skill: str, task: dict[str, Any], max_tokens: int) -> str:
    """The task model answering one task with the candidate skill as its system prompt."""
    messages = ([{"role": "system", "content": skill}] if skill.strip() else []) + [{"role": "user", "content": user_message(task)}]
    return endpoint.chat(messages, max_tokens=max_tokens).strip()


# ── the two evaluators ───────────────────────────────────────────────────────────────────────────

Evaluator = Callable[[dict[str, Any], str], tuple[float, dict[str, Any]]]


def ihaveadhd_evaluator(clone_dir: str | Path, judge: Endpoint, max_tokens: int = 2048, any_commit: bool = False) -> Evaluator:
    """The benchmark's own judge, one response at a time.

    Imports scripts/judge.py and scripts/run_evals.py from the clone, so the prompt (build_judge_prompt), the
    grader-facing rubric slice (grader_rubric), the parser (parse_judge_scores) and the weights (WEIGHTS) are
    the harness's, not a copy. Two differences from a full judging session, both stated in the README: one
    response is judged per prompt (labelled A), where the harness judges a case's conditions side by side;
    and the call goes to an OpenAI-compatible endpoint instead of the harness's runner command.
    """
    clone = Path(clone_dir)
    head = clone / ".git" / "HEAD"
    if not any_commit and head.exists():
        ref = head.read_text().strip()
        commit = (clone / ".git" / ref[5:]).read_text().strip() if ref.startswith("ref: ") and (clone / ".git" / ref[5:]).exists() else ref
        if commit != PINNED_IHAVEADHD:
            raise RuntimeError(f"{clone} is at {commit}, not the pinned {PINNED_IHAVEADHD}")
    sys.path.insert(0, str(clone / "scripts"))
    import judge as ih_judge  # type: ignore  # noqa: E402
    import run_evals as ih_run  # type: ignore  # noqa: E402
    rubric = ih_judge.grader_rubric((clone / "evals" / "rubric.md").read_text(encoding="utf-8"))
    weights = dict(ih_run.WEIGHTS)

    def evaluate(task: dict[str, Any], response: str) -> tuple[float, dict[str, Any]]:
        case = {"prompt": task["prompt"], "criteria": task.get("criteria") or []}
        labels = {"candidate": "A"}
        prompt = ih_judge.build_judge_prompt(case, {"candidate": response}, labels, rubric)
        last: Exception | None = None
        for _ in range(3):
            text = judge.chat([{"role": "user", "content": prompt}], max_tokens=max_tokens)
            try:
                row = ih_judge.parse_judge_scores(text, (task["id"], 1), labels)[0]
                break
            except (ValueError, json.JSONDecodeError) as exc:
                last = exc
        else:
            raise RuntimeError(f"the judge returned no parseable verdict for {task['id']}: {last}")
        weighted = sum(weights[d] * row[d] for d in weights)
        score = 0.0 if row["blocker"] else weighted / 5.0
        return score, {"weighted_1_to_5": round(weighted, 4), "blocker": row["blocker"], "notes": row["notes"],
                       **{d: row[d] for d in weights}}

    return evaluate


def atelier_evaluator(cli: str | Path, data: str | Path, skill: str, node: str = "node") -> Evaluator:
    """`atelier score --json`: the standard's metric. No model is called, so the same text scores the same."""
    cli = str(Path(cli).resolve())

    def evaluate(task: dict[str, Any], response: str) -> tuple[float, dict[str, Any]]:
        if not response.strip():
            return 0.0, {"note": "empty response"}
        with tempfile.TemporaryDirectory(prefix="compare-score-") as tmp:
            text_file = Path(tmp, "response.md")
            task_file = Path(tmp, "task.md")
            text_file.write_text(response, encoding="utf-8")
            task_file.write_text(task["prompt"], encoding="utf-8")
            cmd = [node, cli, "score", "--skill", skill, "--task", str(task_file)]
            if task.get("material"):
                material_file = Path(tmp, "material.md")
                material_file.write_text(task["material"], encoding="utf-8")
                cmd += ["--material", str(material_file)]
            cmd += [str(text_file), "--json"]
            done = subprocess.run(cmd, capture_output=True, text=True, cwd=tmp, timeout=120,
                                  env={**os.environ, "ATELIER_DATA": str(data), "ATELIER_PROJECT_DIR": tmp})
        if done.returncode != 0:
            raise RuntimeError(f"atelier score failed ({done.returncode}): {done.stderr.strip() or done.stdout.strip()}")
        result = json.loads(done.stdout)
        broken = [f"{line['id']}: {line['statement']} ({line['detail']})" for line in result["perRequirement"]
                  if line.get("counts") and line["verdict"] == "VIOLATED"]
        return float(result["score"]), {"components": result["components"], "broken": broken}

    return evaluate


def make_evaluator(name: str, *, ihaveadhd_dir: str | None = None, judge_model: str | None = None,
                   atelier_cli: str | None = None, atelier_data: str | None = None, atelier_skill: str | None = None,
                   any_commit: bool = False) -> tuple[Evaluator, dict[str, Any]]:
    """The evaluator by name, and a description of it for the run record."""
    if name == "ihaveadhd":
        if not ihaveadhd_dir:
            raise ValueError("the ihaveadhd evaluator needs the i-have-adhd clone (--ihaveadhd-dir)")
        judge = Endpoint("judge", judge_model)
        return ihaveadhd_evaluator(ihaveadhd_dir, judge, any_commit=any_commit), {"evaluator": "ihaveadhd", "clone": ihaveadhd_dir, **judge.describe()}
    if name == "atelier":
        if not (atelier_cli and atelier_data and atelier_skill):
            raise ValueError("the atelier evaluator needs --atelier-cli, --atelier-data and --atelier-skill")
        return atelier_evaluator(atelier_cli, atelier_data, atelier_skill), {"evaluator": "atelier", "cli": atelier_cli, "data": atelier_data, "skill": atelier_skill}
    raise ValueError(f"unknown evaluator {name!r}: ihaveadhd or atelier")
