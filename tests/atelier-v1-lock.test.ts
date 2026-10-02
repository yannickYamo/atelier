// tests/atelier-v1-lock.test.ts — 1.0 IS THE FLOOR: NO LATER BUILD MAY BREAK IT.
//
// The CHANGELOG promises that a 1.x release reads every store a 1.0 release wrote. Nothing held that
// promise. tests/fixtures/v1-store is a store written by the 1.0.1 build and never regenerated, and
// LOCK.json beside it records what that build did with it. Every later build must read the same
// store, reach the same verdicts on the same texts, keep the same default cost, and still accept every
// command, option and tool 1.0 accepted. Adding is free. Removing or changing fails here, and the only
// way past is a new major version and a decision record (docs/decisions/0008-one-point-zero-is-the-floor.md).
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { standardHashOf } from '../core/state/canonical-state.js';
import { DEFAULT_SETTINGS } from '../core/fidelity/types.js';

interface Lock {
  commands: string[]; valuedOptions: string[]; booleanOptions: string[]; mcpTools: string[];
  defaultSettings: Record<string, number>;
  standard: { skill: string; id: string };
  verdicts: Record<string, { exit: number; rules: [string, string][] }>;
}

const FIXTURE = resolve('tests/fixtures/v1-store');
const CLI = resolve('dist/cli/atelier.mjs');
const lock = JSON.parse(readFileSync(join(FIXTURE, 'LOCK.json'), 'utf8')) as Lock;
const read = (p: string): string => readFileSync(p, 'utf8');
const missing = (locked: readonly string[], now: readonly string[]): string[] => locked.filter((x) => !now.includes(x));

/** Every file under `dir`, with its content, so a store can be compared before and after. */
const snapshot = (dir: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p); else out[p.slice(dir.length)] = read(p);
    }
  };
  walk(dir);
  return out;
};

describe('the surface 1.0 accepted is still accepted', () => {
  const declared = (name: string): string[] => {
    const m = new RegExp(`export const ${name}: readonly string\\[\\] = \\[([\\s\\S]*?)\\];`).exec(read('cli/runtime.ts'));
    return m ? [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]) : [];
  };

  it('every command', () => {
    const now = [...read('cli/atelier.mts').matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]);
    expect(lock.commands.length).toBeGreaterThan(40);
    expect(missing(lock.commands, now), 'commands 1.0 dispatched that this build does not').toEqual([]);
  });

  it('every option', () => {
    expect(missing(lock.valuedOptions, declared('VALUED_OPTIONS')), 'valued options removed since 1.0').toEqual([]);
    expect(missing(lock.booleanOptions, declared('BOOLEAN_OPTIONS')), 'boolean options removed since 1.0').toEqual([]);
  });

  it('every MCP tool', () => {
    const now = [...read('cli/commands/mcp.ts').matchAll(/name: '(atelier_[a-z_]+)'/g)].map((m) => m[1]);
    expect(missing(lock.mcpTools, now), 'MCP tools removed since 1.0').toEqual([]);
  });
});

describe('the default costs what 1.0 cost', () => {
  it('a new mode is opt-in: the default release settings have not moved', () => {
    for (const [k, v] of Object.entries(lock.defaultSettings)) {
      expect((DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k], `default ${k} moved from 1.0's`).toBe(v);
    }
  });
});

describe('a store 1.0 wrote', () => {
  let data = '';
  const run = (...a: string[]): { code: number; out: string } => {
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: data };
    try {
      return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: data, env, stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      return { code: err.status ?? -1, out: err.stdout ?? '' };
    }
  };

  beforeAll(() => {
    if (!existsSync(CLI)) throw new Error('build first');
    data = mkdtempSync(join(tmpdir(), 'atelier-v1-lock-'));
    cpSync(FIXTURE, data, { recursive: true });
  });

  it('holds a standard whose content still hashes to its name', () => {
    const stored = JSON.parse(read(join(FIXTURE, 'skills', lock.standard.skill, 'standards', `${lock.standard.id}.json`))) as
      Parameters<typeof standardHashOf>[0];
    expect(standardHashOf(stored), 'the hash of a standard changed: every 1.0 standard would be refused').toBe(lock.standard.id);
  });

  it('is read by status, inspect and export', () => {
    for (const cmd of [['status'], ['inspect'], ['export', '--out', join(data, 'exported.md')]]) {
      expect(run(cmd[0], '--skill', lock.standard.skill, ...cmd.slice(1)).code, `atelier ${cmd[0]} on a 1.0 store`).toBe(0);
    }
  });

  it('gives the verdicts 1.0 gave, rule by rule, with the same exit code', () => {
    for (const [text, was] of Object.entries(lock.verdicts)) {
      const r = run('verify', '--skill', lock.standard.skill, '--claims', 'pattern', join(FIXTURE, 'texts', text));
      const rules = [...r.out.matchAll(/^(ok|FAIL|n\/a)\s+(\S+)/gm)].map((m) => [m[1], m[2]]);
      expect(rules, `${text}: verdicts differ from 1.0's`).toEqual(was.rules);
      expect(r.code, `${text}: exit code differs from 1.0's`).toBe(was.exit);
    }
  });

  it('and reading it moved nothing the owner approved', () => {
    const before = snapshot(join(FIXTURE, 'skills', lock.standard.skill, 'standards'));
    expect(snapshot(join(data, 'skills', lock.standard.skill, 'standards'))).toEqual(before);
  });
});
