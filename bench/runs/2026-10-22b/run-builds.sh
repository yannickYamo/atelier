#!/bin/bash
# Test A1: the builds in sequence (the meter books calls by one tag at a time). The caller loads the key.
cd "$(dirname "$0")"
for n in 1 2 3 4 5; do node build.mjs claims $n || exit $?; done
for n in 1 2 3 4 5; do node build.mjs labels $n || exit $?; done
node build.mjs adhd 1 || exit $?
node build.mjs claims reword || exit $?
node build.mjs labels reword || exit $?
echo BUILDS-DONE
