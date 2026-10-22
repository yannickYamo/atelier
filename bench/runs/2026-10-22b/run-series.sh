#!/bin/bash
# Test A1 as the pass line reads it: builds 2 to 5 and the reworded step in ONE data folder (a copy of build 1's).
# The caller loads the key.
cd "$(dirname "$0")"
for fx in claims labels; do
  for n in s2 s3 s4 s5 sreword; do node build.mjs $fx $n || exit $?; done
done
echo SERIES-DONE
