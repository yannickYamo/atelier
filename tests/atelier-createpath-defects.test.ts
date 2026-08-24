// The four real-path defects a live run surfaced. Each is asserted at the call site.
import { describe, it, expect, vi } from 'vitest';

// Type-only namespace import: it names the module's shape without creating a runtime dependency,
// so `vi.resetModules()` plus a dynamic import still gets a fresh copy per case.
import type * as RuntimeModule from '../cli/runtime.js';
import { assertRequestBound, type RequestBinding } from '../core/state/canonical-state.js';
import { createHash } from 'node:crypto';

const sha = (x: string): string => createHash('sha256').update(x).digest('hex').slice(0, 16);
import { readFileSync , readdirSync } from 'node:fs';
import { join } from 'node:path';

const cliSource = (): string => {
  // The CLI is a TREE now — dispatch in atelier.mts, one file per command group, shared ground in
  // runtime.ts. These assertions are about what the CLI DOES, not which file it happens to live in,
  // so they read the whole tree and stay true across a refactor.
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  return walk('cli').filter((f) => /\.(ts|mts)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
};
const cli = cliSource();

describe('a file\'s role depends on what is being learned', () => {
  it('README is metadata for prose, EVIDENCE for a documentation work type', () => {
    // The global filename rule discarded the single most relevant piece in a docs corpus, and the
    // remedy printed was "rename the file" — the product asking a user to work around it.
    expect(cli).toMatch(/const docsWorkType = /);
    expect(cli).toMatch(/META_NAME\.test\(basename\(f\)\) && !docsWorkType/);
    expect(cli).toMatch(/pass --work-type documentation/);
    expect(cli).toMatch(/Reading README\/CONTRIBUTING as EVIDENCE/);
  });
});

describe('a rerun does not crash, and never speaks in state-machine terms', () => {
  it('a stale session is caught at intake, with the command that clears it', () => {
    // NOT blanket idempotency — re-sealing a corpus and closing ratification twice are distinct
    // acts and must still refuse. What changed is that the user is told what to do.
    expect(cli).toMatch(/There is already a run in progress here/);
    expect(cli).toMatch(/Abandon it:\s+atelier abort/);
    expect(cli).not.toMatch(/if \(s\.run\.state === to\) return s;/);
  });

  it('a real refusal offers a way out instead of an internal transition name', () => {
    expect(cli).toMatch(/Start over:\s+atelier abort/);
    expect(cli).toMatch(/See where it is: atelier status/);
    expect(cli).not.toMatch(/t\.refusal/);          // no refusal CODE is ever printed to a user
  });
});

describe('cost is known before it is spent', () => {
  it('estimates, prints a range, and refuses BEFORE the first paid call', () => {
    expect(cli).toMatch(/Estimated discovery cost/);
    expect(cli).toMatch(/NOTHING HAS BEEN SPENT/);
    const est = cli.indexOf('Estimated discovery cost');
    const call = cli.indexOf('await runDiscoveryChain');
    expect(est).toBeGreaterThan(-1);
    expect(est).toBeLessThan(call);          // the order is the property
  });

  it('the refusal tells you the flag that fixes it', () => {
    expect(cli).toMatch(/Raise the limit:\s+--cap \$\{/);
  });
});

describe('public evidence enters as public', () => {
  it('provenance is declared, never guessed', () => {
    expect(cli).toMatch(/const sourceProvenance = /);
    expect(cli).toMatch(/--public-source/);
    expect(cli).toMatch(/PUBLIC_BEHAVIOUR_INFERRED/);
  });

  it('no proposal hardcodes MACHINE_DISCOVERED any more', () => {
    expect(cli).not.toMatch(/provenance: 'MACHINE_DISCOVERED' as const/);
    expect(cli).toMatch(/provenance: sourceProvenance\(\)/);
  });
});

// ── NOTHING IS SEALED BEFORE WE KNOW WE CAN REACH A MODEL ────────────────────────────────────
//
// The first thing anyone does with the quickstart is run `create`. Without a key it used to read the
// corpus, print the reserve, SEAL it, advance the run, and only then fail — so exporting the key and
// running the same command again was refused, because a run was already in progress. The product's
// own opening move left the user stuck.
describe('the credential check happens before anything is written down', () => {
  it('create asks whether a model is reachable BEFORE intake seals', async () => {
    const { create } = await import('../cli/commands/improve.js');
    const src = readFileSync('cli/commands/improve.ts', 'utf8');
    const body = src.slice(src.indexOf('export async function create'));
    const guard = body.indexOf('assertReachable');
    const seal = body.indexOf('intake(');
    expect(guard, 'create does not check reachability at all').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(seal);          // ordering IS the fix; both being present is not
    expect(typeof create).toBe('function');
  });

  it('and it refuses without spending or sealing, saying so', async () => {
    const prior = { key: process.env.ANTHROPIC_API_KEY, argv: process.argv, exit: process.exit };
    delete process.env.ANTHROPIC_API_KEY;
    process.argv = ['node', 'atelier', 'create', '.'];
    const errs: string[] = [];
    const priorErr = console.error;
    console.error = (...a: unknown[]): void => { errs.push(a.join(' ')); };
    process.exit = ((): never => { throw new Error('__EXIT__'); });
    vi.resetModules();
    const { assertReachable } = await import('../cli/runtime.js');
    expect(() => { assertReachable('discovery'); }).toThrow();
    console.error = priorErr; process.exit = prior.exit;
    process.env.ANTHROPIC_API_KEY = prior.key; process.argv = prior.argv;
    expect(errs.join('\n')).toMatch(/ANTHROPIC_API_KEY is not set/);
    expect(errs.join('\n')).toMatch(/Nothing has been read or sealed/);
  });

  it('POLARITY: with a key present it says nothing and gets out of the way', async () => {
    const prior = { key: process.env.ANTHROPIC_API_KEY, argv: process.argv };
    process.env.ANTHROPIC_API_KEY = 'not-a-real-key-just-a-non-empty-string';
    process.argv = ['node', 'atelier', 'create', '.'];
    vi.resetModules();
    const { assertReachable } = await import('../cli/runtime.js');
    expect(() => { assertReachable('discovery'); }).not.toThrow();
    process.env.ANTHROPIC_API_KEY = prior.key; process.argv = prior.argv;
  });
});

// ── A REFUSAL THAT NAMES THE WRONG COMMAND IS A DEAD END ─────────────────────────────────────
describe('a stale run is told how to continue, not just that it exists', () => {
  it('names the command that actually resumes each state', () => {
    const src = readFileSync('cli/commands/intake.ts', 'utf8');
    // `atelier status` only PRINTS the state. It was offered as "continue it" and continues nothing.
    expect(src).toMatch(/CORPUS_SEALED: 'atelier discover'/);
    expect(src).toMatch(/PROPOSED: 'atelier pending'/);
    expect(src).not.toMatch(/Continue it: {2}atelier status/);
  });
});

// ── A FLAG'S VALUE IS NOT THE POSITIONAL ARGUMENT ────────────────────────────────────────────
//
// `argv.find(a => !a.startsWith('--'))` reads like "find the positional" and is not: a flag's VALUE
// is also a token that does not start with `--`. So
//
//   atelier invoke --skill s --target-provider openai-compatible "Should we hire?"
//
// used "openai-compatible" as the writing task. Nothing failed, nothing warned, and the record
// faithfully hashed and stored the wrong task. The model, handed a meaningless brief plus a standard
// describing how the author writes, produced a fluent piece about the corpus's own subject matter —
// indistinguishable from a correct run unless you read the record.
//
// Found by running the real CLI against a real provider and noticing the answer was to a different
// question. No test could have caught it, because every test passed `--skill x "task"` with no
// value-taking flag in between.
describe('the task is the task, not the value of the flag before it', () => {
  const withArgv = <T>(args: string[], fn: (p: typeof RuntimeModule) => T): Promise<T> =>
    (async () => {
      const prior = process.argv;
      process.argv = ['node', 'atelier', ...args];
      vi.resetModules();
      const mod = await import('../cli/runtime.js');
      const out = fn(mod);
      process.argv = prior;
      return out;
    })();

  it('skips values of value-taking flags', async () => {
    const got = await withArgv(
      ['invoke', '--skill', 'author-standard', '--target-provider', 'openai-compatible',
        '--target-model', 'anthropic/claude-opus-5', '--price-in', '5', 'Should we approve two more agents?'],
      (m) => m.positional(['author-standard']));
    expect(got).toBe('Should we approve two more agents?');
  });

  it('POLARITY: the old rule picked a flag value, which is why this exists', () => {
    const argv = ['invoke', '--skill', 'author-standard', '--target-provider', 'openai-compatible',
      'Should we approve two more agents?'];
    const oldRule = argv.find((a, i) => i > 0 && !a.startsWith('--') && a !== 'author-standard');
    expect(oldRule).toBe('openai-compatible');          // the defect, pinned
  });

  it('still finds a task with no flags at all', async () => {
    expect(await withArgv(['invoke', 'my-skill', 'Write the recommendation.'],
      (m) => m.positional(['my-skill']))).toBe('Write the recommendation.');
  });

  it('and returns nothing when there is genuinely no positional, rather than a flag value', async () => {
    expect(await withArgv(['invoke', '--skill', 'my-skill', '--target-model', 'some/model'],
      (m) => m.positional(['my-skill']))).toBeUndefined();
  });

  it('a boolean flag does not swallow the task that follows it', async () => {
    expect(await withArgv(['invoke', '--skill', 's', '--accept-new-binding', 'Write it.'],
      (m) => m.positional(['s']))).toBe('Write it.');
  });

  // THE GRAMMAR CANNOT DRIFT. An option read by a command and absent from the declared table is
  // parsed by inference again, which is the bug this replaced — silently, one option at a time.
  it('every option the code reads is declared in the command grammar', async () => {
    const { VALUED_OPTIONS, BOOLEAN_OPTIONS } = await import('../cli/runtime.js');
    const declared = new Set([...VALUED_OPTIONS, ...BOOLEAN_OPTIONS]);
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const src = [...walk('cli'), ...walk('core')].filter((f) => /\.(ts|mts)$/.test(f))
      .map((f) => readFileSync(f, 'utf8')).join('\n');
    const read = new Set<string>();
    for (const m of src.matchAll(/(?:argv|process\.argv)\.includes\('--([a-z-]+)'\)/g)) read.add(m[1]);
    for (const m of src.matchAll(/\bflag\('--([a-z-]+)'\)/g)) read.add(m[1]);
    expect(read.size, 'no options found — the read pattern has changed').toBeGreaterThan(20);
    const undeclared = [...read].filter((o) => !declared.has(o));
    expect(undeclared, `read by a command, absent from the grammar: ${undeclared.join(', ')}`).toEqual([]);
  });
});

// ── I-REQUEST-BOUND — THE TASK RECORDED IS THE TASK THE MODEL RECEIVED ───────────────────────
//
// Three identities were tracked and a fourth was missing. Delivery proved the PACKAGE reached the
// model; nothing proved the REQUEST did. The parser handed a flag's value to inference as the brief,
// the record hashed it faithfully, and every existing guard passed on a run that answered a question
// nobody asked.
describe('the fourth binding', () => {
  const bound = (resolved: string, served: string): RequestBinding =>
    ({ resolvedTaskHash: sha(resolved), servedTaskHash: sha(served), source: 'POSITIONAL' });

  it('passes when the resolved task is the served task', () => {
    expect(() => { assertRequestBound(bound('Should we hire?', 'Should we hire?'), 'Should we hire?'); }).not.toThrow();
  });

  it('REFUSES when they differ — the exact shape of the defect', () => {
    // what actually happened: the parser resolved "openai-compatible" and that is what was served,
    // so the two AGREED. The binding catches the other half of the class — a task that changes
    // between resolution and transmission — and the parser census above catches this half.
    expect(() => { assertRequestBound(bound('Should we hire?', 'openai-compatible'), 'Should we hire?'); })
      .toThrow(/I-REQUEST-BOUND/);
  });

  it('and the refusal names both sides, so it can be acted on', () => {
    try {
      assertRequestBound(bound('Should we hire?', 'something else'), 'Should we hire?');
      expect.unreachable('should have thrown');
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toMatch(/resolved:/);
      expect(m).toMatch(/served:/);
      expect(m).toMatch(/Should we hire\?/);
      expect(m).toMatch(/POSITIONAL/);
    }
  });

  it('THE ORIGINAL BUG, end to end through the parser: a flag value is never the task', async () => {
    const prior = process.argv;
    process.argv = ['node', 'atelier', 'invoke', '--skill', 's',
      '--target-provider', 'openai-compatible', '--target-model', 'anthropic/claude-opus-5',
      '--price-in', '5', 'Should we hire?'];
    vi.resetModules();
    const { positional } = await import('../cli/runtime.js');
    const task = positional(['s']);
    process.argv = prior;
    expect(task).toBe('Should we hire?');
    expect(task).not.toBe('openai-compatible');
  });
});
