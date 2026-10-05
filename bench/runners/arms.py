#!/usr/bin/env python3
"""bench/runners/arms.py -- one runner for every arm of the coding-answers benchmark.

The external harness (github.com/ayghri/i-have-adhd, scripts/run_evals.py) runs one command per call and
wants one runner per results file. So this runner routes by what the harness puts in the prompt:

  - no <response_style>          -> the bare model (baseline)
  - a skill in <response_style>  -> the same model with that skill injected (plug-in arms, hand-written skill)
  - ATELIER_RUNTIME:<name> as the "skill" -> `atelier invoke` of that build on the <task> alone (runtime arms)

Every arm answers with the same model (MODEL below), and the output is the Claude CLI's JSON shape
(result, usage, total_cost_usd) so the harness meters every arm the same way.

Runtime builds are named in RUNTIMES_FILE (JSON: {name: {"cli": path, "data": dir, "proj": dir,
"skill": name}}), set by the bench script, so no path is hard-coded here.
"""
import json
import os
import re
import subprocess
import sys

MODEL = os.environ.get("BENCH_MODEL", "claude-opus-5")
CLAUDE = ["claude", "--disable-slash-commands", "--print", "--output-format", "json", "--no-session-persistence",
          "--setting-sources", "", "--model", MODEL, "--tools", ""]


def runtime(name: str, task: str) -> dict:
    spec = json.load(open(os.environ["RUNTIMES_FILE"]))[name]
    env = {**os.environ, "ATELIER_DATA": spec["data"]}
    cmd = ["node", spec["cli"], "invoke", "--skill", spec["skill"], "--target-model", MODEL, "--cap", "0.6", task]
    done = subprocess.run(cmd, cwd=spec["proj"], env=env, capture_output=True, text=True, timeout=900)
    if done.returncode:
        raise SystemExit(done.stderr.strip() or done.stdout.strip())
    # Read the answer from the run's own record, the same way for every version: older builds print the
    # report around the answer and have no --json.
    inv = os.path.join(spec["data"], "skills", spec["skill"], "invocations")
    newest = max((os.path.join(inv, f) for f in os.listdir(inv) if f.endswith(".json")), key=os.path.getmtime)
    record = json.load(open(newest))
    cost = re.findall(r"\$(\d+\.\d+) · everything this run checked", done.stdout + done.stderr)
    return {"result": record["output"], "usage": {}, "total_cost_usd": float(cost[-1]) if cost else None}


def main() -> None:
    args = sys.argv[1:]
    prompt = args[-1]
    budget = args[args.index("--max-budget-usd") + 1] if "--max-budget-usd" in args else None
    style = re.search(r"<response_style>\n(.*?)\n</response_style>", prompt, re.S)
    marker = re.search(r"ATELIER_RUNTIME:(\S+)", style.group(1)) if style else None
    if marker:
        task = re.search(r"<task>\n(.*)\n</task>", prompt, re.S)
        print(json.dumps(runtime(marker.group(1), task.group(1) if task else prompt)))
        return
    cmd = CLAUDE + (["--max-budget-usd", budget] if budget else []) + [prompt]
    done = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if done.returncode:
        raise SystemExit(done.stderr.strip() or done.stdout.strip())
    sys.stdout.write(done.stdout)


if __name__ == "__main__":
    main()
