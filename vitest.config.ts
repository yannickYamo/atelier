import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Source imports use .js specifiers (NodeNext), which is what `tsc` emits and what Node runs.
    // Vitest resolves them back to the .ts on disk, so the tests exercise the same module graph the
    // build produces rather than a parallel one.
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1.ts' }],
  },
});
