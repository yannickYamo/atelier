# 0008. 1.0 is the floor

**Status.** Accepted 2026-10-02. Changed only by a new decision record and a new major version.

**Context.** 1.0 states what the evidence supports: an owned standard, checked on every output, ahead of
plain prompting and of pasted examples on the counted dimensions. The next work (voice models, other
registers, search) is larger and less certain than anything before it. The CHANGELOG already promises that a
1.x release reads every store a 1.0 release wrote, and nothing held that promise.

**Decision.** Whatever is built next is added beside 1.0, never in place of it.

1. **A store 1.0 wrote is read by every 1.x build, with the same verdicts.** `tests/fixtures/v1-store` was
   written by the 1.0.1 build and is never regenerated. `tests/atelier-v1-lock.test.ts` reads it with the
   current build and compares each rule's verdict and the exit code with what 1.0.1 recorded.
2. **The hash of a standard does not change.** A standard approved under 1.0 keeps its name.
3. **The surface only grows.** Every command, option and MCP tool 1.0 accepted is still accepted.
4. **The default costs what 1.0 cost.** A new mode is off until a sealed study shows it helps
   ([0007](0007-taste-as-a-range.md)). The default release settings are pinned by the same test.
5. **The counted guarantees do not regress.** The release contract's blocking numbers
   ([0006](0006-release-contract.md)) apply to every release after 1.0.

**What is not locked.** Wording printed to the terminal, internal modules, and anything behind a flag that
1.0 did not have.

**Consequences.** A change that needs to break one of these waits for 2.0 and says why in a decision record.
The fixture is small on purpose: it pins the counted checks and the pattern claim check, which run offline.
It does not pin model-written output, which no test can hold still.
