// eslint.config.js — the rules that catch what `tsc --strict` cannot.
//
// TypeScript checks that types line up. It has nothing to say about a floating promise, an `any`
// smuggled in through a JSON.parse, a condition that is always true because the value is an object,
// or a `catch` that swallows what it caught. Those are the defects this project has actually shipped,
// so the type-aware ruleset is on rather than the syntactic one.
//
// TYPE-AWARE IS THE POINT. `projectService` gives every rule the checker, which is what makes
// `no-unnecessary-condition` and `no-floating-promises` possible at all. It costs a few seconds per
// run and finds a class of bug a syntax-only linter cannot see.
//
// Where a rule is turned off below, the reason is written down. A disabled rule with no reason is
// indistinguishable from one nobody understood.

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', 'plugins/dist/**'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Config and script files sit outside the app tsconfig on purpose — they are tooling, not
        // shipped code. `allowDefaultProject` lets them be linted without widening what gets built.
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'vitest.config.ts', 'scripts/*.mts', 'plugins/*.mts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── CORRECTNESS ───────────────────────────────────────────────────────────────────────────
      // An unawaited promise in a CLI means the process can exit before the work lands. Every
      // command here is async and every one of them is awaited by dispatch; this keeps it that way.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // `catch (e) { }` and `catch { }` are how a refusal becomes a silent success. This project
      // has already shipped one guard that could not fail; an empty catch is the same defect.
      'no-empty': ['error', { allowEmptyCatch: false }],

      // ── HONEST TYPES ──────────────────────────────────────────────────────────────────────────
      // `any` defeats every other rule in this file. JSON.parse returns `any`, which is exactly
      // where it enters, so this is the boundary worth policing.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // A non-null assertion is a claim the compiler cannot check and the reader cannot verify. It
      // is a warning rather than an error because a few are genuinely load-bearing here, and each
      // one should be visible rather than banned into a comment.
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // ── READABILITY ───────────────────────────────────────────────────────────────────────────
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',   // this IS a CLI; console is the output device

      // ── DELIBERATELY OFF, WITH THE REASON ─────────────────────────────────────────────────────
      // Enum-like string unions are used throughout as domain vocabulary (`DELIVERED`,
      // `UNKNOWN_PRICING`). Template-literal restrictions fight that idiom for no benefit here.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],

      // `no-unnecessary-condition` IS OFF, AND THE REASON IS THE INTERESTING PART.
      //
      // It flagged 35 conditions as provably unnecessary. Nearly every one guards a value whose type
      // was ASSERTED rather than proven: fields read off a provider's JSON through an `as`, or fields
      // read off a record persisted by an older version that may not carry them. `p.evidenceBasis ??
      // WEAKEST_EVIDENCE` is a migration guard; `j?.applicable` guards a model that returned
      // something other than the shape it was asked for. The type says they cannot be null. The
      // network and the disk disagree, and the type is the thing that is wrong.
      //
      // Turning the rule on would mean deleting those guards, which is how a cast becomes a crash.
      // Three cases where the guard was real and the compiler called it dead were repaired rather
      // than deleted — see `cli/runtime.ts` backendFor, `core/comparison/resolution.ts` tCrit, and
      // `cli/commands/check.ts` role — by making the TYPE honest instead of removing the check.
      //
      // The durable fix is to parse-and-validate at every provider and store boundary so the types
      // stop lying, at which point this rule becomes true and should be turned back on. Until then
      // it would be a rule that removes safety.
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },

  {
    // Tests reach into internals on purpose: they load modules dynamically to reset state, cast to
    // shapes the production code never exposes, and assert on `unknown` from parsed JSON. Holding
    // them to the production boundary rules would produce suppressions, not safety.
    files: ['tests/**/*.ts'],
    rules: {
      // A stub implementing an async interface has nothing to await. Requiring one would mean
      // writing `await Promise.resolve()` in every fake client, which is noise pretending to be rigor.
      '@typescript-eslint/require-await': 'off',
      // Saving `console.log` and `process.exit` to restore them afterwards is what a harness does.
      // The rule is warning about calling them detached from their object, which is not what this is.
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    // Build tooling and one-off scripts run under tsx, outside the app's tsconfig.
    files: ['scripts/**/*.mts', 'plugins/**/*.mts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
