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
const OUT = join(HERE, 'dist');

interface HostSpec {
  readonly id: string;
  readonly manifestDir: string;
  readonly prefix: string;          // how a user invokes a plugin skill here
  readonly dataEnv: string;
}

const HOSTS: readonly HostSpec[] = [
  { id: 'claude-code', manifestDir: '.claude-plugin', prefix: '/atelier:', dataEnv: 'CLAUDE_PLUGIN_DATA' },
  { id: 'codex', manifestDir: '.codex-plugin', prefix: '$atelier:', dataEnv: 'CODEX_PLUGIN_DATA' },
];

const MANIFEST = (_h: HostSpec): string => JSON.stringify({
  name: 'atelier',
  displayName: 'Atelier Research Preview',
  version: '0.1.0',
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
  },
}, null, 2).replace('${CLAUDE_PLUGIN_ROOT}', h.id === 'codex' ? '${CODEX_PLUGIN_ROOT}' : '${CLAUDE_PLUGIN_ROOT}');

const CAPABILITY_CHECK = `#!/usr/bin/env bash
# FAIL CLOSED if the host cannot support the protocol.
#
# Atelier's guarantees are enforced by a CLI the skills invoke. If that binary is absent the skills
# would still "work" -- an assistant would improvise the steps, produce something plausible, and none
# of the invariants would hold. A silently unenforced protocol is worse than an absent one, because
# its output is indistinguishable from a correct run.
set -euo pipefail
if ! command -v atelier >/dev/null 2>&1; then
  echo "Atelier: 'atelier' is not on PATH. The protocol guarantees (ratification-before-build," >&2
  echo "corpus-freeze, reveal-after-preference) are enforced by that binary, not by instructions." >&2
  echo "Install it first:  npm install -g @yannickyamo/atelier" >&2
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

// marketplace entry, one file, both hosts
writeFileSync(join(OUT, 'marketplace.json'), `${JSON.stringify({
  plugins: [{ name: 'atelier', displayName: 'Atelier Research Preview',
    description: 'Turn your own work into a reusable skill you own. Portable across hosts.',
    source: { type: 'github', owner: 'yannickYamo', repo: 'atelier' } }],
}, null, 2)}\n`);
console.log(`built marketplace.json`);
