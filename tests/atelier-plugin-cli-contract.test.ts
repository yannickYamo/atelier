import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const cliSource = (): string => {
  // The CLI is a TREE now — dispatch in atelier.mts, one file per command group, shared ground in
  // runtime.ts. These assertions are about what the CLI DOES, not which file it happens to live in,
  // so they read the whole tree and stay true across a refactor.
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  return walk('cli').filter((f) => /\.(ts|mts)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
};

/**
 * The plugin's SKILL.md files instruct an assistant to run `atelier` commands. If one does not exist,
 * the assistant gets "unknown command" and improvises the step — producing something plausible with
 * none of the protocol enforced. That failure is invisible: the output looks like a correct run.
 *
 * This drifted once already: the plugin called `improve` and `study`, neither of which existed, and the
 * study skill promised "reveal is blocked by the CLI" when there was no CLI command to block it.
 */
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
});

const called = new Set<string>();
for (const f of walk('plugins/shared/skills')) {
  for (const m of readFileSync(f, 'utf8').matchAll(/atelier ([a-z-]+)/g)) called.add(m[1]);
}
const cli = cliSource();
const implemented = new Set([...cli.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]));

describe('the plugin may only call commands the CLI implements', () => {
  it('every command named in a SKILL.md exists in the CLI', () => {
    const missing = [...called].filter((c) => !implemented.has(c)).sort();
    expect(missing, `plugin calls commands the CLI lacks: ${missing.join(', ')}`).toEqual([]);
  });

  it('every command the CLI TELLS A USER to run also exists', () => {
    // The plugin is not the only thing that promises commands. The CLI's own output does too — the
    // post-build disclosure ends by telling someone to run `atelier confirm`. A printed instruction
    // for a command that does not exist is the same defect on a shorter path.
    const advertised = new Set([...cli.matchAll(/atelier ([a-z-]+)/g)].map((m) => m[1]));
    const known = new Set([...implemented, 'improve', 'ratify-close']);
    const missing = [...advertised].filter((c) => !known.has(c)).sort();
    expect(missing, `the CLI prints instructions for commands it does not implement: ${missing.join(', ')}`).toEqual([]);
  });

  // The `study` skill and its guard were retired together when the blind A/B study left the product
  // for the research side. A guard kept alive after the thing it guards is deleted does not fail —
  // it passes vacuously, which is worse than absent.

  it('both generated plugin trees stay in sync with the same source', () => {
    const c = walk('plugins/dist/claude-code/skills').map((p) => p.split('/').slice(-2).join('/')).sort();
    const x = walk('plugins/dist/codex/skills').map((p) => p.split('/').slice(-2).join('/')).sort();
    expect(c).toEqual(x);
  });
});
