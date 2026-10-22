#!/bin/bash
# Test A after the builds, in sequence on one meter (the caller loads the key): verify (A2, A3), repair (A7),
# hook/grounding/authority (A6), then consistency (A4, A5) at two runs per task, cheapest cut last.
cd "$(dirname "$0")"
RUNS=${RUNS:-2}
node verify.mjs || exit $?
node repair.mjs 1 || exit $?
node hook-ground-authority.mjs 1 || exit $?
node consistency.mjs claims atelier $RUNS || exit $?
node consistency.mjs claims plainx $RUNS || exit $?
node consistency.mjs claims plain $RUNS || exit $?
node consistency.mjs labels atelier $RUNS || exit $?
node consistency.mjs labels plainx $RUNS || exit $?
node consistency.mjs adhd atelier $RUNS || exit $?
node consistency.mjs adhd plain $RUNS || exit $?
echo A-DONE
