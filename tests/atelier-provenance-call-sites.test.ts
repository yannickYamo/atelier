// tests/atelier-provenance-call-sites.test.ts — A LITERAL LAUNDERED THROUGH A STRING PARSER.
//
// `atelier reference prepare` shipped calling `resolveProvenance('HELD_OUT_REFERENCE', process.env)`.
// `HELD_OUT_REFERENCE` is not a member of `Provenance`, so that call threw on the FIRST reserved unit
// for every user who ever ran the command. It sat in a public repo, documented as working, while 819
// tests passed.
//
// WHY EVERYTHING MISSED IT. `resolveProvenance` takes `string | undefined`, because its job is to
// parse UNTRUSTED input — a `--provenance` flag, or the harness environment — and refuse rather than
// guess. That signature is correct for that job. It also means the type checker cannot see a bad
// literal, and `tests/atelier-reference-test.test.ts` covers `core/reference/reference-test.ts`, the
// scoring library, never the command that reaches it. The core was tested; the reachable path was not.
//
// THE RULE THIS ENFORCES. A call site that knows its provenance at compile time must state it as a
// typed `Provenance` constant, where TypeScript checks it forever. `resolveProvenance` is reserved for
// strings that genuinely arrive as strings. A string literal in that argument means someone already
// knew the answer and threw away the only check that would have caught them being wrong.
//
// This is a source census, and a census is a weaker witness than execution. It is here because there
// is no stub backend to drive `reference prepare` through a real generation, and because the failure
// class is exactly the kind a census catches: one call site, one literal, one enum.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_PROVENANCE, resolveProvenance, CERTIFICATION_GRADE } from '../core/fidelity/provenance.js';

const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage']);

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
};

// THIS FILE IS EXCLUDED FROM ITS OWN CENSUS, and that exclusion is the kind of thing that quietly
// makes a guard vacuous — so it is asserted, not assumed. This file must contain the bad literal,
// because the behavioural case below calls `resolveProvenance('HELD_OUT_REFERENCE', {})` on purpose to
// witness the throw, and the header quotes the defect verbatim. Exactly one file is skipped and the
// test proves it is this one.
const SELF = 'atelier-provenance-call-sites.test.ts';
const SOURCES = walk('.').filter((p) => !p.endsWith('provenance.ts') && !p.endsWith(SELF));

describe('resolveProvenance call sites', () => {
  it('the repository is actually being scanned', () => {
    // Guards the guard: a walk that silently returns nothing would make every assertion below vacuous.
    expect(SOURCES.length).toBeGreaterThan(50);
    expect(SOURCES.some((p) => p.includes('reference.ts'))).toBe(true);
    // the one skipped file is this one, and it really does hold the literal it is skipped for
    expect(SOURCES.some((p) => p.endsWith(SELF))).toBe(false);
    expect(readFileSync(join('tests', SELF), 'utf8')).toContain("resolveProvenance('HELD_OUT_REFERENCE'");
  });

  it('no call site passes a string LITERAL — a known answer must be a typed constant', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const src = readFileSync(file, 'utf8');
      const re = /resolveProvenance\(\s*(['"`])([^'"`]*)\1/g;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${file}:${line} passes the literal "${m[2]}"`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('and if one ever is added, it would at least have to name a real Provenance', () => {
    // The regression itself, stated as behaviour rather than as a pattern over a file.
    expect(() => resolveProvenance('HELD_OUT_REFERENCE', {})).toThrow(/not one of/);
    for (const p of ALL_PROVENANCE) expect(resolveProvenance(p, {})).toBe(p);
  });
});

describe('the held-out reference test', () => {
  const SRC = readFileSync('cli/commands/reference.ts', 'utf8');

  it('states its provenance as a typed constant, not a parsed string', () => {
    expect(SRC).toMatch(/const\s+provenance:\s*Provenance\s*=\s*'[A-Z_]+'/);
    expect(SRC).not.toMatch(/resolveProvenance\(/);
  });

  it('uses a provenance that is certification-grade, because that is what the test is for', () => {
    // The reference test is the measurement that may support a generalisation claim, and only
    // ORGANIC_USE can carry one. A reserved unit is real work the expert really did.
    const m = /const\s+provenance:\s*Provenance\s*=\s*'([A-Z_]+)'/.exec(SRC);
    if (!m) throw new Error('cli/commands/reference.ts no longer declares a typed Provenance constant');
    // Narrowed by lookup rather than asserted, so a value outside the taxonomy fails here as a
    // readable message instead of being cast into a type it does not belong to.
    const declared = ALL_PROVENANCE.find((p) => p === m[1]);
    if (!declared) throw new Error(`reference.ts declares "${m[1]}", which is not a Provenance`);
    expect(CERTIFICATION_GRADE.has(declared)).toBe(true);
  });

  it('does not let the shell environment redefine what a held-out artifact is', () => {
    // Pre-fix this value came from `process.env` via resolveProvenance, so a stray ATELIER_PROVENANCE
    // could have relabelled the expert's own reserved work as a probe.
    expect(SRC).not.toMatch(/provenance[^\n]*process\.env/);
  });
});
