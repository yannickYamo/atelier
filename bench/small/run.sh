#!/usr/bin/env bash
# bench/small/run.sh — THE SMALL BENCH (decision 0006): the 14 coding cases of the outside benchmark, one trial,
# for no skill and for an Atelier skill built from bench/data/answers-12 by this build. It writes responses and
# `atelier score` results to $OUT (default ./small-bench) and spends roughly $3 on the key in ANTHROPIC_API_KEY.
#
# Judging the two arms with the benchmark's own judge, side by side with the previous release, is the second
# half of the contract and is run by hand (bench/README.md): it needs the judge's own CLI.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${OUT:-$PWD/small-bench}"
# A priced model, so every --cap binds (a model missing from providers/pricing.ts is metered at nothing).
MODEL="${BENCH_MODEL:-claude-opus-5}"
: "${ANTHROPIC_API_KEY:?the small bench needs ANTHROPIC_API_KEY}"
mkdir -p "$OUT/proj" "$OUT/data"
[ -d "$OUT/i-have-adhd" ] || git clone -q https://github.com/ayghri/i-have-adhd "$OUT/i-have-adhd"
git -C "$OUT/i-have-adhd" checkout -q 839872f9d1cd634fed642b4589ce7226199cc15f
node "$REPO/bench/compare/tasks/from-ihaveadhd.mjs" "$OUT/i-have-adhd" --out "$OUT/tasks.jsonl"

# The skill, built by THIS build from the 12 example answers, rulings accepted as shown.
( cd "$OUT/proj" && ATELIER_DATA="$OUT/data" node "$REPO/dist/cli/atelier.mjs" new "$REPO/bench/data/answers-12" \
    "answer a developer's requests in a coding assistant, the way these answers do" --mode respond --name dev-answers \
    --accept --no-ai-assist --cap 2 --model "$MODEL" > "$OUT/build.log" )
( cd "$OUT/proj" && ATELIER_DATA="$OUT/data" node "$REPO/dist/cli/atelier.mjs" export --skill dev-answers --out "$OUT/plugin.md" )

for arm in none "skill:$OUT/plugin.md"; do
  name="${arm%%:*}"; [ "$name" = skill ] && name=plugin
  node "$REPO/bench/compare/run.mjs" --tasks "$OUT/tasks.jsonl" --model "$MODEL" --max-tokens 4096 --trials 1 --arm "$arm" --out "$OUT/$name.jsonl"
  node "$REPO/bench/compare/score.mjs" --responses "$OUT/$name.jsonl" --tasks "$OUT/tasks.jsonl" --data "$OUT/data" --skill dev-answers --out "$OUT/$name.score.jsonl"
done
echo "small bench written to $OUT"
