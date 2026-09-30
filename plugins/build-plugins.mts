#!/usr/bin/env node
/**
 * build-plugins.mts — emit the Claude and Codex plugin trees from ONE source.
 *
 * The plugin skills are prose telling an assistant which `atelier` commands to run, in what order,
 * and what not to do. That prose is host-agnostic; only the manifest, the hook wiring and the
 * invocation punctuation differ.
 *
 * Two hand-maintained plugin directories would drift — and the drift would be silent, because both
 * would keep working. The version that fell behind would simply enforce an older protocol while
 * looking current. So they are generated, and the generator is the only place a host is named.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'shared', 'skills');
// COMMITTED, not gitignored. A marketplace install clones the repository and reads the plugin from a
// path inside it; the tree used to be emitted into gitignored `plugins/dist`, so the one install route
// a user has fetched a checkout with no plugin in it. CI rebuilds and fails on any diff.
const OUT = join(HERE, 'hosts');
const REPO = join(HERE, '..');
// One version, the package's. The manifest was a hand-typed 0.1.0 against a 0.2.0 package.
const VERSION = (JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { version: string }).version;

interface HostSpec {
  readonly id: string;
  readonly manifestDir: string;
  readonly prefix: string;          // how a user invokes a plugin skill here
}

const HOSTS: readonly HostSpec[] = [
  { id: 'claude-code', manifestDir: '.claude-plugin', prefix: '/atelier:' },
  { id: 'codex', manifestDir: '.codex-plugin', prefix: '$atelier:' },
];

const MANIFEST = (_h: HostSpec): string => JSON.stringify({
  name: 'atelier',
  version: VERSION,
  description: 'Proposes what makes your work yours, you ratify it, and it builds a portable skill. Ships with an optional experiment.',
  author: { name: 'Atelier' },
  license: 'MIT',
  keywords: ['writing', 'standards', 'authorship', 'agent-skills'],
  skills: './skills/',
  hooks: './hooks/hooks.json',
}, null, 2);

const HOOKS = (h: HostSpec): string => JSON.stringify({
  hooks: {
    SessionStart: [{ hooks: [{ type: 'command', command: `"\${CLAUDE_PLUGIN_ROOT}"/scripts/capability-check.sh` }] }],
    // Claude Code only: its documented hook payloads are what `atelier record` parses. Codex gets
    // these when its own events are confirmed — abstracting three hosts before one works is how
    // none of them does.
    ...(h.id === 'claude-code' ? {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: `"\${CLAUDE_PLUGIN_ROOT}"/scripts/record-hook.sh prompt` }] }],
      Stop: [{ hooks: [{ type: 'command', command: `"\${CLAUDE_PLUGIN_ROOT}"/scripts/record-hook.sh stop` }] }],
    } : {}),
  },
}, null, 2).replaceAll('${CLAUDE_PLUGIN_ROOT}', h.id === 'codex' ? '${CODEX_PLUGIN_ROOT}' : '${CLAUDE_PLUGIN_ROOT}');

const RECORD_HOOK = [
  '#!/usr/bin/env bash',
  '# INVISIBLE EVIDENCE CAPTURE. A skill used through the host produces the same canonical',
  '# InvocationRecord as `atelier invoke` -- that is what makes /atelier:fix possible without anyone',
  '# copying an id. Absent binary = silent no-op: recording is a convenience, never a gate.',
  'set -euo pipefail',
  'command -v atelier >/dev/null 2>&1 || exit 0',
  'exec atelier record --from-hook "${1:-}"',
  '',
].join('\n');

const CAPABILITY_CHECK = `#!/usr/bin/env bash
# FAIL CLOSED if the host cannot support the protocol.
#
# Atelier's guarantees are enforced by a CLI the skills invoke. If that binary is absent the skills
# would still "work" -- an assistant would improvise the steps, produce something plausible, and none
# of the invariants would hold. A silently unenforced protocol is worse than an absent one, because
# its output is indistinguishable from a correct run.
set -euo pipefail
# RUN it, not just find it: a rebuild once left the linked binary without its executable bit, so
# \`command -v\` succeeded and every hook failed.
if ! atelier --version >/dev/null 2>&1; then
  echo "Atelier: 'atelier' is not on PATH or will not run. The protocol guarantees (ratification-before-build," >&2
  echo "corpus-freeze, reveal-after-preference) are enforced by that binary, not by instructions." >&2
  echo "Install it first:  git clone https://github.com/yannickYamo/atelier && cd atelier && npm install && npm run build && npm link" >&2
  exit 2
fi
exit 0
`;

rmSync(OUT, { recursive: true, force: true });
for (const h of HOSTS) {
  const root = join(OUT, h.id);
  mkdirSync(join(root, h.manifestDir), { recursive: true });
  mkdirSync(join(root, 'hooks'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, h.manifestDir, 'plugin.json'), `${MANIFEST(h)}\n`);
  writeFileSync(join(root, 'hooks', 'hooks.json'), `${HOOKS(h)}\n`);
  writeFileSync(join(root, 'scripts', 'capability-check.sh'), CAPABILITY_CHECK, { mode: 0o755 });
  // The checker as a tool any agent in the session can call: `atelier mcp` over stdio. Declared at
  // the plugin root, where Claude Code reads a plugin's servers.
  if (h.id === 'claude-code') {
    writeFileSync(join(root, '.mcp.json'), `${JSON.stringify({ mcpServers: { atelier: { command: 'atelier', args: ['mcp'] } } }, null, 2)}\n`);
  }
  if (h.id === 'claude-code') writeFileSync(join(root, 'scripts', 'record-hook.sh'), RECORD_HOOK, { mode: 0o755 });

  for (const skill of readdirSync(SRC)) {
    const dst = join(root, 'skills', skill);
    mkdirSync(dst, { recursive: true });
    // The ONLY host substitution: how a user types a plugin skill. Everything else is identical prose,
    // so a reviewer diffing the two trees sees exactly the surface that legitimately differs.
    const body = readFileSync(join(SRC, skill, 'SKILL.md'), 'utf8').replace(/\/atelier:/g, h.prefix);
    writeFileSync(join(dst, 'SKILL.md'), body);
  }
  console.log(`built ${h.id}: ${readdirSync(join(root, 'skills')).length} skills, manifest ${h.manifestDir}/plugin.json`);
}

// The marketplace Claude Code reads: `.claude-plugin/marketplace.json` at the repository root, naming
// the committed plugin tree by relative path. `/plugin marketplace add yannickYamo/atelier` then
// `/plugin install atelier@atelier` is the whole install.
mkdirSync(join(REPO, '.claude-plugin'), { recursive: true });
writeFileSync(join(REPO, '.claude-plugin', 'marketplace.json'), `${JSON.stringify({
  name: 'atelier',
  owner: { name: 'Yannick Maurice' },
  description: 'Atelier: a standard you ratify, compiled into a skill any model can run.',
  plugins: [{ name: 'atelier', source: './plugins/hosts/claude-code', version: VERSION,
    description: 'Learn a writing standard from the pieces you choose, approve it once, and hold every draft to it. Portable across hosts.' }],
}, null, 2)}\n`);
console.log(`built .claude-plugin/marketplace.json`);
