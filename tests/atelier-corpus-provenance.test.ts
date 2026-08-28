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
