#!/usr/bin/env bash
# INVISIBLE EVIDENCE CAPTURE. A skill used through the host produces the same canonical
# InvocationRecord as `atelier invoke` -- that is what makes /atelier:fix possible without anyone
# copying an id. Absent binary = silent no-op: recording is a convenience, never a gate.
set -euo pipefail
command -v atelier >/dev/null 2>&1 || exit 0
exec atelier record --from-hook "${1:-}"
