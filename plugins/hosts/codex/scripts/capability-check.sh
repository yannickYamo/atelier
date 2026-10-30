#!/usr/bin/env bash
# FAIL CLOSED if the host cannot support the protocol.
#
# Atelier's guarantees are enforced by a CLI the skills invoke. If that binary is absent the skills
# would still "work" -- an assistant would improvise the steps, produce something plausible, and none
# of the invariants would hold. A silently unenforced protocol is worse than an absent one, because
# its output is indistinguishable from a correct run.
set -euo pipefail
# RUN it, not just find it: a rebuild once left the linked binary without its executable bit, so
# `command -v` succeeded and every hook failed.
if ! atelier --version >/dev/null 2>&1; then
  echo "Atelier: 'atelier' is not on PATH or will not run. The protocol guarantees (ratification-before-build," >&2
  echo "corpus-freeze, reveal-after-preference) are enforced by that binary, not by instructions." >&2
  echo "Install it first:  npm install -g @yannickyamo/atelier" >&2
  echo "or from source:    git clone https://github.com/yannickYamo/atelier && cd atelier && npm install && npm run build && npm link" >&2
  exit 2
fi
exit 0
