// tests/atelier-skills-sh.test.ts — WHAT `npx skills add yannickYamo/atelier` INSTALLS.
//
// The `skills` CLI (skills.sh) copies skill folders alone: no plugin namespace, no SessionStart hook.
// It reads `skills/` at the repository root and, through the marketplace manifest, the plugin's own
// skills. These pin the three things that make such an install safe: each skill is named for Atelier,
// each checks for the CLI before doing anything, and the plugin copies stay hidden so nothing is listed
// twice.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SHARED = readdirSync('plugins/shared/skills');
const frontmatter = (text: string): string => /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';

describe('the standalone skills at skills/', () => {
  it('there is one per shared skill, named atelier-<skill>, in a folder of the same name', () => {
    expect(readdirSync('skills').sort()).toEqual(SHARED.map((s) => `atelier-${s}`).sort());
    for (const s of SHARED) {
      expect(frontmatter(readFileSync(join('skills', `atelier-${s}`, 'SKILL.md'), 'utf8'))).toMatch(new RegExp(`^name: atelier-${s}$`, 'm'));
    }
  });
  it('each checks that the atelier CLI runs before any step, and says how to install it', () => {
    for (const s of SHARED) {
      const text = readFileSync(join('skills', `atelier-${s}`, 'SKILL.md'), 'utf8');
      const check = text.indexOf('atelier --version');
      expect(check, s).toBeGreaterThan(-1);
      expect(text, s).toContain('npm link');
      // Before the first command the skill tells the assistant to run.
      const firstStep = text.indexOf('```bash\natelier ');
      if (firstStep !== -1) expect(check, s).toBeLessThan(firstStep);
    }
  });
  it('no reference to a plugin-namespaced skill survives: /atelier: becomes /atelier-', () => {
    for (const s of SHARED) expect(readFileSync(join('skills', `atelier-${s}`, 'SKILL.md'), 'utf8'), s).not.toContain('/atelier:');
  });
});

describe('the plugin copies', () => {
  it('are hidden from the skills CLI, so skills.sh lists each skill once', () => {
    for (const host of ['claude-code', 'codex']) {
      for (const s of SHARED) {
        const fm = frontmatter(readFileSync(join('plugins', 'hosts', host, 'skills', s, 'SKILL.md'), 'utf8'));
        expect(fm, `${host}/${s}`).toMatch(/^metadata:\n {2}internal: true$/m);
        expect(fm, `${host}/${s}`).toMatch(new RegExp(`^name: ${s}$`, 'm'));
      }
    }
  });
  it('the standalone skills are not hidden', () => {
    for (const s of SHARED) expect(readFileSync(join('skills', `atelier-${s}`, 'SKILL.md'), 'utf8')).not.toContain('internal: true');
  });
});
