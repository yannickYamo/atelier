#!/bin/bash
# The two builds the pass lines run on, each in a fresh data folder (the caller loads the key).
cd "$(dirname "$0")"
node build.mjs claims 1 || exit $?
node build.mjs labels 1 || exit $?
echo BUILDS-DONE
