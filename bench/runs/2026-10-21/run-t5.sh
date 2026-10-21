#!/bin/bash
# Test 5 and the consumer comparison, every arm in sequence (the meter books calls by one tag at a time).
cd "$(dirname "$0")"
: "${ANTHROPIC_API_KEY:?set ANTHROPIC_API_KEY first}"
for fx in claims labels adhd; do
  for arm in atelier plain; do node consistency.mjs $fx $arm 3; done
done
echo T5-DONE
