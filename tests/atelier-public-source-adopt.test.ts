// tests/atelier-public-source-adopt.test.ts — THE QUESTIONNAIRE IS SKIPPED FOR A STRANGER'S WORK.
//
// A user ran `create --public-source` on a third party's public site and was handed a ratification
// page asking "is this yours, and how much does it matter?" — a question with no answerer, since
// nobody in the room can ratify a stranger's voice. `create` now adopts every proposal through
// `decide`, at the ceiling the source can carry, and sends judgement to the output.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aRequirement } from './fixtures.js';
import { roleFor } from '../core/architecture/compile.js';

const data = mkdtempSync(join(tmpdir(), 'atelier-adopt-data-'));
const proj = mkdtempSync(join(tmpdir(), 'atelier-adopt-proj-'));
process.env.ATELIER_DATA = data;
process.env.ATELIER_PROJECT_DIR = proj;

const { loadSession, saveSession } = await import('../cli/runtime.js');
const { adoptAllFromPublicSource } = await import('../cli/commands/improve.js');

const publicProposal = (id: string, statement: string) => aRequirement({
  requirementId: id, statement, authority: 'DERIVED_UNRATIFIED', provenance: 'PUBLIC_BEHAVIOUR_INFERRED', materiality: null,
});

describe('create --public-source adopts every proposal instead of asking', () => {
  it('all proposals become USER_ADOPTED / PREFERRED with a ledger record each, and none instructs', () => {
    const s = loadSession();
    saveSession({ ...s, proposals: [publicProposal('p1', 'Pitch the category as infrastructure.'), publicProposal('p2', 'Define by negation first.')] });
    adoptAllFromPublicSource();
    const after = loadSession();
    expect(after.decided).toHaveLength(2);
    for (const r of after.decided) {
      expect(r.authority, 'public work cannot be ratified as the author\'s own').toBe('USER_ADOPTED');
      expect(r.provenance).toBe('PUBLIC_BEHAVIOUR_INFERRED');
      expect(r.materiality).toBe('PREFERRED');
      expect(roleFor(r), 'a stranger\'s recurrence is shown, never enforced').toBe('OBSERVE');
    }
    expect(after.ledger?.records).toHaveLength(2);
  });

  it('is idempotent: a session already decided is left alone', () => {
    const before = loadSession();
    adoptAllFromPublicSource();
    expect(loadSession().decided).toEqual(before.decided);
    expect(loadSession().ledger?.records).toHaveLength(2);
  });

  it('never fires on the author\'s own work: create only calls it under PUBLIC_BEHAVIOUR_INFERRED', () => {
    const src = readFileSync('cli/commands/improve.ts', 'utf8');
    expect(src).toContain("if (sourceProvenance() === 'PUBLIC_BEHAVIOUR_INFERRED') adoptAllFromPublicSource();");
  });
});
