// cli/commands/setup.ts — ONE COMMAND FROM NOTHING TO AN AGENT THAT CAN CHECK ITS OWN OUTPUT.
//
//   npx @yannickyamo/atelier setup              find the coding agents here and give each the Atelier MCP server
//   atelier setup --dry-run                     say what would be written, write nothing
//   atelier setup --host cursor,codex           these agents, whether or not they were found
//
// The MCP server (`atelier mcp`) is how an agent checks a text against a skill's rules without being told
// to. Wiring it by hand means knowing where each agent keeps its config and in which shape. This finds the
// agents that are present and adds one entry to each.
//
// IT ADDS, IT NEVER REPLACES. An existing config is read and written back with one more server in it; a
// file that cannot be parsed is left alone and named; an `atelier` entry already there is left as it is,
// whatever it says. Nothing outside the listed files is touched, and no model is called.
//
// Where each agent reads its servers from:
//   Claude Code   <project>/.mcp.json            { "mcpServers": { … } }
//   Cursor        <project>/.cursor/mcp.json     { "mcpServers": { … } }
//   VS Code       <project>/.vscode/mcp.json     { "servers": { … } }
//   Codex         ~/.codex/config.toml           [mcp_servers.<name>]

import { version } from '../help.js';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { argv, die, flag } from '../runtime.js';

export const PACKAGE = '@yannickyamo/atelier';

export interface Launch { readonly command: string; readonly args: readonly string[] }

export interface Agent {
  readonly id: 'claude-code' | 'cursor' | 'vscode' | 'codex';
  readonly label: string;
  /** the file the server is added to */
  readonly file: string;
  readonly format: 'json' | 'toml';
  /** the key the servers sit under, in a JSON config */
  readonly key?: 'mcpServers' | 'servers';
  /** whether this agent looks present here */
  readonly found: boolean;
}

const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

/** The agents Atelier can wire, and whether each is present for this project and this user. */
export function agentsFor(project: string, home: string): Agent[] {
  return [
    { id: 'claude-code', label: 'Claude Code', file: join(project, '.mcp.json'), format: 'json', key: 'mcpServers',
      found: isDir(join(home, '.claude')) || isDir(join(project, '.claude')) || existsSync(join(project, '.mcp.json')) },
    { id: 'cursor', label: 'Cursor', file: join(project, '.cursor', 'mcp.json'), format: 'json', key: 'mcpServers',
      found: isDir(join(home, '.cursor')) || isDir(join(project, '.cursor')) },
    { id: 'vscode', label: 'VS Code', file: join(project, '.vscode', 'mcp.json'), format: 'json', key: 'servers',
      found: isDir(join(project, '.vscode')) },
    { id: 'codex', label: 'Codex', file: join(home, '.codex', 'config.toml'), format: 'toml', found: isDir(join(home, '.codex')) },
  ];
}

/**
 * How an agent should start the server: the installed binary when `atelier` is on PATH, otherwise through
 * npx, which fetches the published package on first use. A config naming a binary that is not there would
 * fail silently inside the agent, where nobody reads the error.
 */
export function launchFor(pathEnv: string | undefined): Launch {
  // NOT npx's own scratch install, and not a project's node_modules: under `npx … setup` the binary is on PATH
  // only for as long as this command runs, and a config naming it would break the moment it returns.
  const transient = (d: string): boolean => /[\\/]_npx[\\/]/.test(d) || /[\\/]node_modules[\\/]\.bin[\\/]?$/.test(d);
  const onPath = (pathEnv ?? '').split(delimiter).filter((d) => d && !transient(d))
    .some((d) => ['atelier', 'atelier.cmd'].some((b) => existsSync(join(d, b))));
  // PINNED TO THE VERSION THAT WROTE THE CONFIG. An unpinned `npx -y <package>` starts whatever is newest on the day
  // the agent launches it, so a config written under one version would run another without anyone choosing that.
  const v = version();
  return onPath ? { command: 'atelier', args: ['mcp'] } : { command: 'npx', args: ['-y', /^\d+\.\d+\.\d+/.test(v) ? `${PACKAGE}@${v}` : PACKAGE, 'mcp'] };
}

export type Outcome =
  | { readonly kind: 'added'; readonly text: string }
  | { readonly kind: 'present' }
  | { readonly kind: 'unreadable'; readonly why: string };

/** A JSON config with the server added under `key`, every other entry and key kept as it was. */
export function withJsonServer(existing: string | null, key: 'mcpServers' | 'servers', launch: Launch): Outcome {
  let config: Record<string, unknown> = {};
  if (existing?.trim()) {
    let parsed: unknown;
    try { parsed = JSON.parse(existing); } catch (e) { return { kind: 'unreadable', why: `it is not valid JSON (${(e as Error).message.split('\n')[0]})` }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'unreadable', why: 'it does not hold a JSON object' };
    config = parsed as Record<string, unknown>;
  }
  const servers = config[key];
  if (servers !== undefined && (!servers || typeof servers !== 'object' || Array.isArray(servers))) return { kind: 'unreadable', why: `its "${key}" is not an object` };
  if (servers && 'atelier' in servers) return { kind: 'present' };
  const entry = key === 'servers' ? { type: 'stdio', command: launch.command, args: launch.args } : { command: launch.command, args: launch.args };
  return { kind: 'added', text: `${JSON.stringify({ ...config, [key]: { ...(servers as Record<string, unknown> | undefined), atelier: entry } }, null, 2)}\n` };
}

/** A TOML config with the server's table appended; the rest of the file is kept byte for byte. */
export function withTomlServer(existing: string | null, launch: Launch): Outcome {
  const text = existing ?? '';
  // The table's header in any spelling TOML allows: a trailing comment, a quoted key, spaces inside the brackets.
  // The bare-header test missed `[mcp_servers.atelier] # mine` and `[mcp_servers."atelier"]`, appended a second
  // table, and a duplicate table is a parse error that takes the whole config down.
  if (/^\s*\[\s*mcp_servers\s*\.\s*(?:atelier|"atelier"|'atelier')\s*\]\s*(?:#.*)?$/m.test(text)) return { kind: 'present' };
  const block = `[mcp_servers.atelier]\ncommand = ${JSON.stringify(launch.command)}\nargs = [${launch.args.map((a) => JSON.stringify(a)).join(', ')}]\n`;
  return { kind: 'added', text: `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text.trim() ? '\n' : ''}${block}` };
}

export function setup(): void {
  const project = process.cwd();
  const dry = argv.includes('--dry-run');
  const all = agentsFor(project, homedir());
  const asked = (flag('--host') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  for (const a of asked) if (!all.some((x) => x.id === a)) die(`unknown agent "${a}". Atelier can set up: ${all.map((x) => x.id).join(', ')}.`);
  const targets = asked.length ? all.filter((a) => asked.includes(a.id)) : all.filter((a) => a.found);
  const launch = launchFor(process.env.PATH);
  if (!targets.length) {
    console.log(`No coding agent found here (looked for ${all.map((a) => a.label).join(', ')}). Name one to set it up anyway: atelier setup --host claude-code`);
    return;
  }
  console.log(`The Atelier MCP server, started with: ${launch.command} ${launch.args.join(' ')}${dry ? '   (dry run: nothing is written)' : ''}`);
  let added = 0;
  for (const a of targets) {
    const existing = existsSync(a.file) ? readFileSync(a.file, 'utf8') : null;
    const out = a.format === 'toml' ? withTomlServer(existing, launch) : withJsonServer(existing, a.key ?? 'mcpServers', launch);
    if (out.kind === 'present') { console.log(`  ${a.label.padEnd(12)} ${a.file} already lists Atelier; left as it is`); continue; }
    if (out.kind === 'unreadable') { console.log(`  ${a.label.padEnd(12)} ${a.file} was left alone: ${out.why}`); continue; }
    if (!dry) writeAtomic(a.file, out.text);
    added += 1;
    console.log(`  ${a.label.padEnd(12)} ${dry ? 'would add' : 'added'} the server to ${a.file}${existing === null ? ' (new file)' : ', beside what was there'}`);
  }
  const skipped = all.filter((a) => !targets.includes(a));
  if (skipped.length) console.log(`  not found: ${skipped.map((a) => a.label).join(', ')}`);
  console.log('');
  if (added && !dry) console.log('Restart the agent, or reload its MCP servers, to pick it up.');
  if (targets.some((a) => a.id === 'claude-code')) console.log('In Claude Code, for the slash commands too: /plugin marketplace add yannickYamo/atelier   then   /plugin install atelier@atelier');
  console.log('Next: atelier check   (tests your model backend before anything is spent), then   atelier new <folder> "<what it is for>"');
}
