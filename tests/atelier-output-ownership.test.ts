// A blind study found outputs that finished the work and then reproduced the skill's own
// requirement text. 31 of 74 carried a literal `# pN` line; 10 reproduced a served instance
// verbatim. The arm with one extra example did it 59% of the time against the other's 29%.
import { describe, it, expect } from 'vitest';
import { findOwnershipBreaches, describeBreaches } from '../core/state/output-ownership.js';
import { readFileSync } from 'node:fs';

describe('the skill\'s internals are not part of the user\'s work', () => {
  it('catches the exact shape that was measured', () => {
    const real = 'The board is not wrong that pops sells out.\n\n---\n\n# p18\n\n'
      + 'I attribute human emotional and cognitive states to systems, algorithms, and machines.';
    const b = findOwnershipBreaches(real);
    expect(b.length).toBeGreaterThan(0);
    expect(b[0]!.marker).toBe('# p18');
    expect(describeBreaches(b)).toMatch(/is a defect in how the skill was served/);
  });

  it('catches the bracketed label that replaced the heading', () => {
    // The fix changed the form; a detector keyed only to the old one would go blind on the new.
    expect(findOwnershipBreaches('An answer.\n\n[p6]\n\nAfter developing a point…').length)
      .toBeGreaterThan(0);
  });

  it('catches the fence markers themselves', () => {
    expect(findOwnershipBreaches('work\n=== REFERENCE MATERIAL — PRIVATE CONTEXT ===').length)
      .toBeGreaterThan(0);
  });

  it('POLARITY: ordinary prose is clean, including prose that talks about pricing', () => {
    expect(findOwnershipBreaches(
      'Pricing is an operating system, not a price tag. The p and l of it is simple enough.')).toEqual([]);
    expect(describeBreaches([])).toBe('');
  });

  it('says nothing when there is nothing to say', () => {
    expect(findOwnershipBreaches('A perfectly ordinary two paragraph answer.\n\nWith a second one.'))
      .toEqual([]);
  });
});

describe('the rendering no longer offers a structure to continue', () => {
  // COMMENTS STRIPPED. The explanation above each fix quotes the old form, so asserting over raw
  // source would find the description rather than the code — the same trap that has bitten this
  // suite before.
  const code = (u: URL): string => readFileSync(u, 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
  const render = code(new URL('../renderers/agent-skill/render.ts', import.meta.url));
  const invoke = code(new URL('../cli/commands/invoke.ts', import.meta.url));

  it('example bodies are labelled, not headed', () => {
    expect(render).toMatch(/`\[\$\{r\.requirementId\}\]/);
    expect(render).not.toMatch(/`# \$\{r\.requirementId\}/);
    expect(render).not.toMatch(/## How the author did it/);
  });

  it('the served block is fenced and states output ownership, not just authority', () => {
    // "instances, not instructions" settles whether the model must COMPLY. It says nothing about
    // whether the material belongs in the deliverable, which is what was going wrong.
    expect(invoke).toMatch(/PRIVATE CONTEXT, NOT PART OF YOUR OUTPUT/);
    expect(invoke).toMatch(/do not reproduce, continue, quote, enumerate/);
    expect(invoke).toMatch(/begins fresh from here/);
    expect(invoke).not.toMatch(/# How the author works — examples/);
  });

  it('and the check runs on the output, never on the served bytes', () => {
    // Served bytes legitimately contain every marker; checking them would fire on every invocation.
    expect(invoke).toMatch(/findOwnershipBreaches\(rec\.output\)/);
  });
});
