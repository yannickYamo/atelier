// The one field documented as changing every result was hardcoded to null.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const intake = readFileSync(new URL('../cli/commands/intake.ts', import.meta.url), 'utf8');
const state = readFileSync(new URL('../core/state/canonical-state.ts', import.meta.url), 'utf8');

describe('corpus provenance is declared, never assumed', () => {
  it('the field still carries its contract', () => {
    expect(state).toMatch(/declared, never inferred — it changes what any result means/);
  });

  it('intake no longer hardcodes it', () => {
    // A corpus was sealed, a standard discovered from it, and the author mentioned only afterwards
    // that roughly half the prose was AI-assisted.
    expect(intake).not.toMatch(/aiAssisted: null, published: null/);
    expect(intake).toMatch(/argv\.includes\('--ai-assisted'\)/);
    expect(intake).toMatch(/argv\.includes\('--no-ai-assist'\)/);
  });

  it('UNDECLARED is not silently recorded as NOT AI-ASSISTED', () => {
    // "Nobody asked" and "the author says no" are different facts. Collapsing them would let an
    // undeclared corpus be reported as clean.
    expect(intake).toMatch(/: null;/);
    expect(intake).toMatch(/provenance UNDECLARED/);
  });

  it('and an undeclared corpus says what is weaker about it, at seal time', () => {
    // Not a footnote discovered later: the person sealing is the person who can answer.
    expect(intake).toMatch(/may\\n\s*\/\/\s*be the assistant|assistant\\'s habit rather than yours/);
    expect(intake).toMatch(/weaker claim/);
  });

  it('declares both flags in the command grammar', () => {
    const runtime = readFileSync(new URL('../cli/runtime.ts', import.meta.url), 'utf8');
    expect(runtime).toMatch(/'ai-assisted'/);
    expect(runtime).toMatch(/'no-ai-assist'/);
  });
});

describe('the observe section describes what is actually in it', () => {
  const render = readFileSync(new URL('../renderers/agent-skill/render.ts', import.meta.url), 'utf8');

  it('does not assert "nobody confirmed" over a section defined by ROLE', () => {
    // A requirement the author wrote in their own words, marked PREFERRED, can land here. Telling
    // the model it is an unconfirmed guess it must not act on is a false statement about the
    // author's own rule, and it suppresses a behaviour they asked for.
    expect(render).toMatch(/const observePreamble = observed\.every\(\(r\) => isConfirmed\(r\)\)/);
    expect(render).toMatch(/anyConfirmed/);
  });

  it('keeps the suppressing wording ONLY for the all-unconfirmed case', () => {
    // That wording is right when everything in the section really is a guess; it is the blanket
    // application that was wrong.
    // Assert on STRUCTURE, not on string positions: the comment above the code quotes the old
    // wording, so an indexOf would find the explanation rather than the branch.
    const preamble = render.slice(render.indexOf('const observePreamble'),
      render.indexOf('const observeSection'));
    expect(preamble).toMatch(/NOT obligations/);          // all-confirmed branch
    expect(preamble).toMatch(/CONFIRMED BY NOBODY/);      // mixed branch
    expect(preamble).toMatch(/NO ONE HAS CONFIRMED/);     // all-unconfirmed fallback, kept
    // and the suppressing sentence survives ONLY alongside that last one
    expect(preamble.slice(preamble.indexOf('NO ONE HAS CONFIRMED'))).toMatch(/Do not let them/);
  });

  it('one definition of confirmed, shared with the compiler', () => {
    // Two answers to "did the author stand behind this" would drift, and it is the seam the whole
    // authority model rests on.
    expect(render).toMatch(/import \{ isConfirmed \} from '\.\.\/\.\.\/core\/architecture\/compile\.js'/);
    const compile = readFileSync(new URL('../core/architecture/compile.ts', import.meta.url), 'utf8');
    expect(compile).toMatch(/export const isConfirmed/);
  });
});
