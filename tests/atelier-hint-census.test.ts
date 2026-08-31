// tests/atelier-hint-census.test.ts — EVERY PRINTED NEXT STEP IS RUNNABLE AS PRINTED.
//
// Four of the audit's findings were the same defect wearing different lines: a hint naming a flag
// the command dies without, a hint naming a command with the wrong flags, advice that was stale the
// moment it printed, and plugin prose documenting flags that never existed. Documentation review
// did not catch them; this census does, mechanically, for every `atelier …` invocation the CLI or
// the plugin skills put in front of a person.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { VALUED_OPTIONS, BOOLEAN_OPTIONS } from '../cli/runtime.js';

const walk = (dir: string, ext: RegExp): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (f === 'node_modules' || f === 'dist') return [];
  return statSync(p).isDirectory() ? walk(p, ext) : ext.test(p) ? [p] : [];
});

const dispatched = new Set(
  [...readFileSync('cli/atelier.mts', 'utf8').matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]),
);
const flags = new Set([...VALUED_OPTIONS, ...BOOLEAN_OPTIONS]);

/** Every `atelier <cmd> [--flag …]` a file puts in front of a person. Comments are prose about the
 *  system, not hints to a person — the census's very first run flagged a comment RECOUNTING an old
 *  typo defect, which is history, not advice. Stripped, same expression as the other censuses. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const hintsIn = (src: string, isTs: boolean): { cmd: string; flags: string[]; raw: string }[] =>
  [...(isTs ? stripComments(src) : src).matchAll(/\batelier ([a-z][a-z-]*)((?:\s+--[a-z-]+(?:[= ][^\s`'"\\]+)?)*)/g)]
    .map((m) => ({ cmd: m[1], raw: m[0], flags: [...m[2].matchAll(/--([a-z-]+)/g)].map((f) => f[1]) }));

describe('every atelier invocation printed by the CLI or the plugin skills', () => {
  const files = [
    ...walk('cli', /\.m?ts$/),
    ...walk(join('plugins', 'shared'), /\.md$/),
  ];

  it('names a command the dispatcher answers', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const h of hintsIn(readFileSync(f, 'utf8'), f.endsWith('ts'))) {
        if (!dispatched.has(h.cmd)) offenders.push(`${f}: "${h.raw}"`);
      }
    }
    expect(offenders, `hints naming commands nobody dispatches:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('names only flags the command grammar declares', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const h of hintsIn(readFileSync(f, 'utf8'), f.endsWith('ts'))) {
        for (const fl of h.flags) {
          if (!flags.has(fl)) offenders.push(`${f}: "${h.raw}" (--${fl})`);
        }
      }
    }
    expect(offenders, `hints naming undeclared flags:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the census sees enough hints to be policing anything', () => {
    const total = files.reduce((n, f) => n + hintsIn(readFileSync(f, 'utf8'), f.endsWith('ts')).length, 0);
    expect(total).toBeGreaterThan(40);
  });
});

describe('the specific lines the audit caught, pinned', () => {
  it("invoke's footer names the one correction path, complete", () => {
    const src = readFileSync('cli/commands/invoke.ts', 'utf8');
    expect(src).toContain('atelier fix');
    expect(src).not.toMatch(/improve --skill \$\{name\} --invocation \$\{rec\.invocationId\}`\);/);
  });

  it('the ready banner is earned: it prints only over a package that instructs something', () => {
    const src = readFileSync('cli/commands/build.ts', 'utf8');
    const gate = src.indexOf("gateRole === 'ENFORCE'");
    const banner = src.indexOf('Your skill is ready');
    expect(gate).toBeGreaterThan(-1);
    expect(gate, 'the banner is not gated on an instructing component').toBeLessThan(banner);
    expect(src).toContain('INSTRUCTS NOTHING until you rule');
  });

  it('no staged command tells a person to run a step create is already running', () => {
    for (const f of ['cli/commands/discover.ts', 'cli/commands/ratify.ts']) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/^.*Run \\`atelier .*$/gm)) {
        expect(m[0], `${f} prints a next step without the orchestration guard`).toContain('ATELIER_ORCHESTRATED');
      }
    }
  });

  it('the plugin skills document no flag the CLI does not declare (the improve --evidence defect)', () => {
    for (const f of walk(join('plugins', 'shared'), /\.md$/)) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} mentions --evidence, which no command reads`).not.toContain('--evidence');
    }
  });
});

describe('generation budgets are not literals below the measured median (reviewer F1)', () => {
  it('runOnce carries no hardcoded maxTokens — the basis is a flag with a measured default', () => {
    const src = readFileSync('cli/commands/improve.ts', 'utf8');
    expect(src).not.toMatch(/maxTokens: [0-9]/);
    expect(src).toContain("numericFlag('--max-tokens'");
  });

  it("the help's first line teaches the documented front door, not the staged spelling", () => {
    const src = readFileSync('cli/atelier.mts', 'utf8');
    const firstHelp = /console\.log\('atelier ([a-z-]+)/.exec(src);
    expect(firstHelp?.[1], 'bare `atelier` must lead with the README front door').toBe('skill');
  });
});
