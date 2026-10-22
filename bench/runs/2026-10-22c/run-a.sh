#!/bin/bash
# The pass lines after the builds and the owner's acceptances, in sequence on one meter (the caller loads the key):
# verify (D6), repair (D4), hook (D5), then the runs (D1, D2, D3) at two runs per task.
cd "$(dirname "$0")"
RUNS=${RUNS:-2}
node verify.mjs || exit $?
node repair.mjs 1 || exit $?
node hook-ground-authority.mjs 1 || exit $?
node consistency.mjs claims atelier $RUNS || exit $?
node consistency.mjs labels atelier $RUNS || exit $?
node consistency.mjs claims plainx $RUNS || exit $?
node consistency.mjs labels plainx $RUNS || exit $?
echo A-DONE
