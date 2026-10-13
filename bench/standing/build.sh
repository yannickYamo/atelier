#!/usr/bin/env bash
# bench/standing/build.sh <domain> <workdir>: builds the Atelier skill the comparison runs, from the domain's method
# and its examples, with no model and nothing accepted by hand. Then the two Atelier arms can be run on it:
#
#   bench/standing/build.sh contract /tmp/standing
#   node bench/standing/run.mjs --domain contract --arm export --label export-folder --skill contract-folder --proj /tmp/standing/contract/proj --data /tmp/standing/contract/store --out <out> --runs 2
#   node bench/standing/run.mjs --domain contract --arm invoke --label invoke-folder --skill contract-folder --proj /tmp/standing/contract/proj --data /tmp/standing/contract/store --out <out>
set -euo pipefail
domain="${1:?a domain: explainer, code-review, contract or analysis}"; work="${2:?a directory to build in}"
here="$(cd "$(dirname "$0")" && pwd)"; cli="$here/../../dist/cli/atelier.mjs"
[ -f "$cli" ] || { echo "build the CLI first: npm run build" >&2; exit 1; }
mkdir -p "$work/$domain/proj" "$work/$domain/store"
cd "$work/$domain/proj"
ATELIER_DATA="$work/$domain/store" node "$cli" new "$here/domains/$domain/examples" --method "$here/domains/$domain/method.md" --name "$domain-folder" --yes
