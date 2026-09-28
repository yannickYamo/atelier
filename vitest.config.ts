import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // MOST OF THIS SUITE SPAWNS THE SHIPPED BINARY, and vitest's default per-test budget is 5s.
    // A build-and-run e2e finishes in well under a second of real work and still blew that budget
    // under full-suite parallel load — `atelier-p0-regressions` timed out in CI-shaped runs and
    // passed alone in the same tree, which is a flake in the harness, not a defect in the product.
    // The bound is kept (a hung child must still fail rather than hang the run), just set to a
    // figure that measures the code instead of the scheduler.
    testTimeout: 30_000,
    // THE SUITE IS OFFLINE. A developer's ANTHROPIC_API_KEY would otherwise let every spawned command
    // call the claim reader for real. Tests of the reader set ATELIER_CLAIMS=model and script it.
    env: { ATELIER_CLAIMS: 'pattern' },
    // Source imports use .js specifiers (NodeNext), which is what `tsc` emits and what Node runs.
    // Vitest resolves them back to the .ts on disk, so the tests exercise the same module graph the
    // build produces rather than a parallel one.
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1.ts' }],
  },
});
