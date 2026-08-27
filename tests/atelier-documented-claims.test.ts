// tests/atelier-documented-claims.test.ts — THE README IS A CLAIM, SO IT GETS CHECKED.
//
// This project's whole argument is that a claim should be verifiable and that a status report is not
// a fact. The README, CONTRIBUTING and ACCEPTANCE are full of claims — commands a reader will type,
// paths a reviewer will open, vocabulary the compiler is supposed to accept — and none of them was
// checked by anything. CONTRIBUTING said "539 tests" against a suite of 640 and had been wrong for
// long enough that nobody could say when it stopped being right.
//
// A number in prose is the least of it. The expensive failure is a documented command that does not
// exist, because the reader who tries it concludes the project does not work and is correct to.
//
// So: everything a reader can act on is pinned here, against the code rather than against a copy.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string): string => readFileSync(f, 'utf8');
const DOCS = ['README.md', 'CONTRIBUTING.md', 'ACCEPTANCE.md'] as const;
const allDocs = DOCS.map(read).join('\n');

const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

describe('every command the docs tell a reader to type is dispatched by the CLI', () => {
  const dispatched = new Set(
    [...read('cli/atelier.mts').matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]),
  );

  it('the CLI dispatches the commands it is documented to have', () => {
    const documented = new Set([...allDocs.matchAll(/\batelier ([a-z][a-z-]*)/g)].map((m) => m[1]));
    // `atelier <path>` and prose like "atelier and" are not commands; only check words the CLI could
    // plausibly own, which is any word that is not obviously an argument.
    const claimed = [...documented].filter((c) => !['a', 'the', 'and', 'is', 'to', 'on'].includes(c));
    const missing = claimed.filter((c) => !dispatched.has(c));
    expect(missing, `documented but not dispatched: ${missing.join(', ')}`).toEqual([]);
  });

  it('and the reverse gap is visible: a command nobody can find is a command nobody uses', () => {
    // NOT a failure — some commands are deliberately internal (`intake`, `discover` are steps
    // `create` runs for you). This pins the ones a user is expected to reach on their own.
    const userFacing = ['create', 'pending', 'ratify', 'ratify-close', 'build', 'invoke',
      'improve', 'compare', 'promote', 'rollback', 'check', 'carriers', 'reference'];
    const undocumented = userFacing.filter((c) => !allDocs.includes(`atelier ${c}`));
    expect(undocumented, `implemented and user-facing, but named in no document: ${undocumented.join(', ')}`).toEqual([]);
  });
});

describe('every path the docs name exists', () => {
  it('source files cited in prose resolve', () => {
    const cited = new Set([...allDocs.matchAll(
      /\b((?:core|cli|adapters|renderers|providers|tests|scripts|plugins)\/[A-Za-z0-9/_.-]+\.(?:ts|mts|json|md))/g,
    )].map((m) => m[1]));
    // A low bar on purpose: prose cites few paths by full name. The assertion that matters is that
    // every one it does cite resolves; this only guards against the regex silently matching nothing.
    expect(cited.size, 'no paths cited at all — the regex has stopped matching').toBeGreaterThanOrEqual(1);
    const missing = [...cited].filter((p) => !existsSync(p));
    expect(missing, `cited in a document, absent from the tree: ${missing.join(', ')}`).toEqual([]);
  });

  it('npm scripts the docs tell a reader to run exist', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const cited = new Set([...allDocs.matchAll(/npm run ([a-z:]+)/g)].map((m) => m[1]));
    const missing = [...cited].filter((s) => !(s in pkg.scripts));
    expect(missing, `documented npm scripts that do not exist: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('the vocabulary the docs teach is the vocabulary the compiler accepts', () => {
  const ratify = read('cli/commands/discover.ts');
  const listFrom = (src: string, decl: string): string[] => {
    const m = new RegExp(`const ${decl} = \\[([^\\]]+)\\]`).exec(src);
    return m ? [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]) : [];
  };

  it('materiality', () => {
    const code = listFrom(ratify, 'MAT');
    expect(code.length, 'MAT no longer parses out of the source').toBe(5);
    for (const v of code) expect(read('README.md'), `${v} is accepted and undocumented`).toContain(v);
  });

  it('realization tolerance', () => {
    const code = listFrom(ratify, 'FORM');
    expect(code.length).toBe(3);
    for (const v of code) expect(read('README.md')).toContain(v);
  });

  it('carriers, and all five are named where a reader chooses between them', () => {
    const carriers = [...read('core/delivery/carrier-delivery.ts')
      .matchAll(/export type Carrier =\s*((?:\s*\|?\s*'[A-Z_]+')+)/g)]
      .flatMap((m) => [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]));
    expect(carriers.sort()).toEqual(['EXAMPLE', 'NONE', 'OUTPUT_CONTRACT', 'PROSE', 'SELF_CHECK']);
    for (const c of carriers) expect(read('README.md'), `carrier ${c} is undocumented`).toContain(c);
  });

  it('the decision verbs a reader is offered are the ones ratify accepts', () => {
    const accepted = /\[('APPROVE', 'REWRITE', 'CONTEXTUAL')\]\.includes\(dec\)/.exec(ratify);
    expect(accepted, 'the accepted-decision list has moved; re-point this test').not.toBeNull();
    for (const v of ['APPROVE', 'REWRITE', 'CONTEXTUAL', 'REJECT']) expect(read('README.md')).toContain(v);
  });
});

describe('the numbers in prose', () => {
  it('the documented test count tracks the suite', () => {
    // Counted statically, which undercounts by however many `it`s are generated in a loop. So this
    // asserts a BAND rather than an equality: wide enough to survive a loop, narrow enough that
    // "539" against a suite of 640 fails, which is the drift that actually happened.
    // EVERY doc that states a count, not just CONTRIBUTING. The narrow version of this test shipped
    // while README carried "52 files and 825 tests" against a suite of 54 and 855 — the same drift it
    // was written to catch, in the one section that tells a reader what they can reproduce.
    const written = walk('tests').filter((f) => f.endsWith('.ts'))
      .reduce((acc, f) => acc + [...read(f).matchAll(/^\s*(?:it|test)\(/gm)].length, 0);
    expect(written, 'no tests found — the counter has stopped counting').toBeGreaterThan(100);

    const stating = DOCS.filter((d) => /([0-9]{3,}) tests/.test(read(d)));
    expect(stating.length, 'no document states a test count any more').toBeGreaterThan(0);
    for (const doc of stating) {
      for (const m of read(doc).matchAll(/([0-9]{3,}) tests/g)) {
        const n = Number(m[1]);
        expect(n, `${doc} says ${n} tests; ${written} are written in tests/`).toBeGreaterThanOrEqual(written);
        expect(n - written, `${doc} says ${n}, only ${written} are written`).toBeLessThanOrEqual(15);
      }
    }

    // File counts drift the same way and were never pinned at all.
    const files = walk('tests').filter((f) => f.endsWith('.test.ts')).length;
    for (const doc of DOCS) {
      for (const m of read(doc).matchAll(/([0-9]{2,}) files and [0-9]{3,} tests/g)) {
        expect(Number(m[1]), `${doc} says ${m[1]} test files; there are ${files}`).toBe(files);
      }
    }
  });

  it('the node badge matches the engine the package declares', () => {
    const pkg = JSON.parse(read('package.json')) as { engines: { node: string } };
    const major = /(\d+)/.exec(pkg.engines.node)![1];
    expect(read('README.md'), `badge and engines disagree about Node ${major}`).toContain(`node-%3E%3D${major}`);
  });
});

describe('the CI a contributor is promised is the CI that runs', () => {
  it('every check CONTRIBUTING lists is a step in the workflow', () => {
    const ci = read('.github/workflows/ci.yml');
    const promised = [...read('CONTRIBUTING.md').matchAll(/^npm (run [a-z:]+|test|ci)/gm)].map((m) => m[0]);
    expect(promised.length).toBeGreaterThan(2);
    const absent = promised.filter((c) => !ci.includes(c));
    expect(absent, `CONTRIBUTING tells contributors to run checks CI does not: ${absent.join(', ')}`).toEqual([]);
  });

  it('and the workflow file is where package.json says the entry point is', () => {
    const pkg = JSON.parse(read('package.json')) as { bin: Record<string, string> };
    const bin = pkg.bin.atelier;
    expect(read('.github/workflows/ci.yml'), 'CI does not run the binary it ships').toContain(bin.replace('./', ''));
    // and the source it is built from is really there
    expect(existsSync('cli/atelier.mts')).toBe(true);
    expect(statSync('cli/atelier.mts').size).toBeGreaterThan(0);
  });
});
