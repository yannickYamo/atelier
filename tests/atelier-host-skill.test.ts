// tests/atelier-host-skill.test.ts — THE SKILL A HOST LOADS IS THE PIECES, THE METHOD AND THE RULES, NOT A DESCRIPTION.
//
// Claude Code's /skill hands SKILL.md to its own model as instructions. The description of how the author sounds and the
// moves read off their pieces are left out of what is installed, as the direct writer leaves them out; the stored
// package keeps them for the compiled path. The install verifies against what it wrote, and a skill installed before
// still verifies. Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostFiles } from '../renderers/agent-skill/host.js';
import { installTree, verifyTree, MARKER } from '../adapters/install-tree.js';
import { packageHashOf } from '../core/state/receipt.js';

const SKILL = ['---\nname: posts\n---\n# posts', '## How I sound',
  'How I sound (each point is quoted from my own pieces, and holds across them; where a count is given, it is how many of my pieces show it):', '- Opens on a stance. e.g. "I would start here."',
  'Moves I make in some pieces, not most (what I do when a piece calls for it):', '- Sometimes a list.',
  '`examples/voice-1.md` is a whole piece of mine. Read it before drafting and take the voice from it, not the content.',
  '## Moves I sometimes make\n\nNot rules: things I do in some pieces and not others.\n\n- Name the trade-off.',
  '## My method\n\n1. Open with the problem.'].join('\n\n') + '\n';
const files = { 'SKILL.md': SKILL, 'examples/voice-1.md': '# A piece\n\nbody\n' };
const pkg = { skillId: 'posts', files, packageHash: packageHashOf(files) };

describe('what a host is given', () => {
  it('no description of the author and no moves read off the pieces; the pieces, the method and the length stay', () => {
    const md = hostFiles(files)['SKILL.md'];
    expect(md).toBe(['---\nname: posts\n---\n# posts', '## How I sound',
      '`examples/voice-1.md` is a whole piece of mine. Read it before drafting and take the voice from it, not the content.',
      '## My method\n\n1. Open with the problem.'].join('\n\n') + '\n');
    expect(hostFiles(files)['examples/voice-1.md']).toBe(files['examples/voice-1.md']);
    expect(hostFiles({ 'a.md': 'x' })).toEqual({ 'a.md': 'x' });
  });
  it('installed so, and verified against what was installed; an install from before still verifies, an edit does not', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'atelier-host-')), '.claude', 'skills', 'posts');
    expect(installTree(dir, pkg).ok).toBe(true);
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).not.toContain('Opens on a stance');
    expect(verifyTree(dir, pkg)).toMatchObject({ matchesPackage: true });
    // a second install over it is the same install: nothing is kept aside
    expect(installTree(dir, pkg)).toMatchObject({ ok: true, backedUp: null });
    // the whole package, as an install from before wrote it
    writeFileSync(join(dir, 'SKILL.md'), SKILL);
    expect(verifyTree(dir, pkg)).toMatchObject({ matchesPackage: true });
    writeFileSync(join(dir, 'SKILL.md'), SKILL + 'edited\n');
    expect(verifyTree(dir, pkg)).toMatchObject({ matchesPackage: false });
    expect(JSON.parse(readFileSync(join(dir, MARKER), 'utf8'))).toMatchObject({ packageHash: pkg.packageHash, hostHash: packageHashOf(hostFiles(files)) });
  });
});
