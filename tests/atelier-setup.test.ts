// tests/atelier-setup.test.ts — SETUP ADDS ONE ENTRY AND NEVER REPLACES WHAT IS THERE.
//
// `atelier setup` writes into config files that belong to other tools, some of them in the person's home.
// So each promise is tried both ways: what it adds, and what it must leave alone.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { agentsFor, launchFor, withJsonServer, withTomlServer, PACKAGE } from '../cli/commands/setup.js';

const INSTALLED = { command: 'atelier', args: ['mcp'] };

describe('the entry it writes', () => {
  it('starts the installed binary when there is one, and npx when there is not', () => {
    const bin = mkdtempSync(join(tmpdir(), 'atelier-setup-bin-'));
    expect(launchFor(bin)).toEqual({ command: 'npx', args: ['-y', PACKAGE, 'mcp'] });
    writeFileSync(join(bin, 'atelier'), '');
    expect(launchFor(bin)).toEqual(INSTALLED);
    // npx's scratch install puts the binary on PATH only while the command runs: it does not count.
    const npx = join(mkdtempSync(join(tmpdir(), 'atelier-setup-npx-')), '_npx', 'abc', 'node_modules', '.bin');
    mkdirSync(npx, { recursive: true }); writeFileSync(join(npx, 'atelier'), '');
    expect(launchFor(npx)).toEqual({ command: 'npx', args: ['-y', PACKAGE, 'mcp'] });
    expect(PACKAGE).toBe((JSON.parse(readFileSync('package.json', 'utf8')) as { name: string }).name);
  });
  it('is added beside the servers and keys already there', () => {
    const out = withJsonServer(JSON.stringify({ mcpServers: { other: { command: 'x' } }, theme: 'dark' }), 'mcpServers', INSTALLED);
    expect(out.kind).toBe('added');
    expect(JSON.parse((out as { text: string }).text)).toEqual({ mcpServers: { other: { command: 'x' }, atelier: { command: 'atelier', args: ['mcp'] } }, theme: 'dark' });
    // VS Code keeps its servers under another key and names the transport.
    expect(JSON.parse((withJsonServer(null, 'servers', INSTALLED) as { text: string }).text)).toEqual({ servers: { atelier: { type: 'stdio', command: 'atelier', args: ['mcp'] } } });
  });
  it('is never written over an atelier entry, or into a file it cannot read', () => {
    expect(withJsonServer(JSON.stringify({ mcpServers: { atelier: { command: 'mine' } } }), 'mcpServers', INSTALLED)).toEqual({ kind: 'present' });
    expect(withJsonServer('{ not json', 'mcpServers', INSTALLED).kind).toBe('unreadable');
    expect(withJsonServer('{"mcpServers": []}', 'mcpServers', INSTALLED).kind).toBe('unreadable');
  });
  it('is appended to a TOML config, the rest kept byte for byte', () => {
    const before = 'model = "o"\n\n[mcp_servers.other]\ncommand = "x"\n';
    const out = withTomlServer(before, INSTALLED) as { kind: string; text: string };
    expect(out.kind).toBe('added');
    expect(out.text.startsWith(before)).toBe(true);
    expect(out.text).toContain('[mcp_servers.atelier]\ncommand = "atelier"\nargs = ["mcp"]\n');
    expect(withTomlServer(out.text, INSTALLED)).toEqual({ kind: 'present' });
  });
});

describe('through the binary', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  const fresh = (): { home: string; proj: string; run: (...a: string[]) => string } => {
    const home = mkdtempSync(join(tmpdir(), 'atelier-setup-home-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-setup-proj-'));
    const run = (...a: string[]): string => execFileSync('node', [CLI, 'setup', ...a], { encoding: 'utf8', cwd: proj, env: { ...process.env, HOME: home, USERPROFILE: home, ATELIER_DATA: join(home, 'data') } });
    return { home, proj, run };
  };

  it('finds only the agents that are there, and says so when there are none', () => {
    const { home, proj, run } = fresh();
    expect(agentsFor(proj, home).filter((a) => a.found)).toEqual([]);
    expect(run()).toMatch(/No coding agent found here/);
    expect(existsSync(join(proj, '.mcp.json'))).toBe(false);
  });
  it('a dry run writes nothing; a real run writes each agent\'s file and a second run changes nothing', () => {
    const { home, proj, run } = fresh();
    mkdirSync(join(home, '.claude')); mkdirSync(join(home, '.codex')); mkdirSync(join(proj, '.cursor'));
    writeFileSync(join(proj, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
    expect(run('--dry-run')).toMatch(/Claude Code {2}would add the server/);
    expect(existsSync(join(proj, '.mcp.json'))).toBe(false);
    const out = run();
    expect(out).toMatch(/Claude Code {2}added the server to .*\.mcp\.json \(new file\)/);
    expect(out).toMatch(/Cursor {7}added the server to .*mcp\.json, beside what was there/);
    expect(out).toMatch(/not found: VS Code/);
    expect(Object.keys((JSON.parse(readFileSync(join(proj, '.cursor', 'mcp.json'), 'utf8')) as { mcpServers: object }).mcpServers).sort()).toEqual(['atelier', 'other']);
    expect(readFileSync(join(home, '.codex', 'config.toml'), 'utf8')).toContain('[mcp_servers.atelier]');
    const files = [join(proj, '.mcp.json'), join(proj, '.cursor', 'mcp.json'), join(home, '.codex', 'config.toml')].map((f) => readFileSync(f, 'utf8'));
    expect(run()).toMatch(/already lists Atelier; left as it is/);
    expect([join(proj, '.mcp.json'), join(proj, '.cursor', 'mcp.json'), join(home, '.codex', 'config.toml')].map((f) => readFileSync(f, 'utf8'))).toEqual(files);
  });
  it('an agent that was not found can be named, and an unknown one is refused', () => {
    const { proj, run } = fresh();
    expect(run('--host', 'vscode')).toMatch(/VS Code {6}added the server/);
    expect(existsSync(join(proj, '.vscode', 'mcp.json'))).toBe(true);
    expect(() => run('--host', 'emacs')).toThrow(/unknown agent "emacs"/);
  });
});
