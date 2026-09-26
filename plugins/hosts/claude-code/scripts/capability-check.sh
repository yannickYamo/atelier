#!/usr/bin/env bash
# FAIL CLOSED if the host cannot support the protocol.
#
# Atelier's guarantees are enforced by a CLI the skills invoke. If that binary is absent the skills
# would still "work" -- an assistant would improvise the steps, produce something plausible, and none
# of the invariants would hold. A silently unenforced protocol is worse than an absent one, because
# its output is indistinguishable from a correct run.
set -euo pipefail
if ! command -v atelier >/dev/null 2>&1; then
  echo "Atelier: 'atelier' is not on PATH. The protocol guarantees (ratification-before-build," >&2
  echo "corpus-freeze, reveal-after-preference) are enforced by that binary, not by instructions." >&2
  echo "Install it first:  git clone https://github.com/yannickYamo/atelier && cd atelier && npm install && npm run build && npm link" >&2
  exit 2
fi
exit 0
