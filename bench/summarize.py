#!/usr/bin/env python3
"""bench/summarize.py -- the numbers the README may quote, computed from one judging session's scores.

Reads a scores file written by the benchmark's judge (scripts/judge.py of ayghri/i-have-adhd): one row per
(case, trial, condition) with five 1-5 scores and a blocker flag. Prints, per condition, the weighted score
(the harness's own weights), its blockers, and the spread between trials; then, for candidate minus
comparator, a paired bootstrap by case (cases resampled with their trials, so a case's trials never count as
independent answers).

Usage: python3 bench/summarize.py <scores.jsonl> [--label NAME] > summary.json
"""
import json
import random
import statistics
import sys
from collections import defaultdict

WEIGHTS = {"correctness": 0.35, "autonomy": 0.25, "actionability": 0.20, "safety": 0.10, "concision": 0.10}
RESAMPLES = 10_000


def weighted(row: dict) -> float:
    return sum(row[k] * w for k, w in WEIGHTS.items())


def main() -> None:
    path = sys.argv[1]
    label = sys.argv[sys.argv.index("--label") + 1] if "--label" in sys.argv else path
    rows = [json.loads(line) for line in open(path) if line.strip()]
    by = defaultdict(lambda: defaultdict(list))   # condition -> case -> [weighted]
    blockers = defaultdict(int)
    for r in rows:
        by[r["condition"]][r["case_id"]].append(weighted(r))
        blockers[r["condition"]] += bool(r["blocker"])

    out = {"label": label, "judged": len(rows), "conditions": {}}
    for cond, cases in sorted(by.items()):
        scores = [s for xs in cases.values() for s in xs]
        # Spread between trials: the mean, over cases, of each case's standard deviation across its trials.
        spreads = [statistics.pstdev(xs) for xs in cases.values() if len(xs) > 1]
        out["conditions"][cond] = {"answers": len(scores), "cases": len(cases), "weighted": round(statistics.mean(scores), 3),
                                   "blockers": blockers[cond], "trialSpread": round(statistics.mean(spreads), 3) if spreads else None}

    if "candidate" in by and "comparator" in by:
        shared = sorted(set(by["candidate"]) & set(by["comparator"]))
        diff = [statistics.mean(by["candidate"][c]) - statistics.mean(by["comparator"][c]) for c in shared]
        rng = random.Random(0)
        boots = sorted(statistics.mean(rng.choice(diff) for _ in diff) for _ in range(RESAMPLES))
        out["candidateMinusComparator"] = {"cases": len(shared), "mean": round(statistics.mean(diff), 3),
                                           "ci95": [round(boots[int(0.025 * RESAMPLES)], 3), round(boots[int(0.975 * RESAMPLES) - 1], 3)],
                                           "perCase": {c: round(d, 3) for c, d in zip(shared, diff)}}
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
