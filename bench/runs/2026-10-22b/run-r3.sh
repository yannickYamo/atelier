#!/bin/bash
# The third run per task (the budget allowed it), and the labels method-alone arm; resumable. The caller loads the key.
cd "$(dirname "$0")"
for a in "claims atelier" "claims plainx" "claims plain" "labels atelier" "labels plainx" "adhd atelier" "adhd plain" "labels plain"; do node consistency.mjs $a 3 || exit $?; done
echo R3-DONE
