// tests/atelier-layout-guide.test.ts — ON THE DEFAULT RUN A PARAGRAPH LENGTH GUIDES THE WRITER AND NEVER HOLDS THE PIECE.
//
// The owner's ruling (25 Nov): "I keep paragraphs to 5 sentences at most" is mechanics, not what makes the taste, so it
// must not block. With the code split gone from the default run, that rule left broken ended 4 of 10 runs BLOCKED on
// a test of ten pieces. A paragraph-length rule is now set aside for the checks of a direct run, with its reason: the
// writer is still shown it among the author's rules, nothing rewrites paragraphs for it, and the report is not failed.
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { layoutGuides } from '../cli/direct.js';
import { checkDraftAsync } from '../core/loop/run-repair.js';

const req = (id: string, observer: string, params: Record<string, unknown>) => ({ requirementId: id, statement: id, materiality: 'REQUIRED', authority: 'EXPERT_RATIFIED', appliesWhen: 'GENERAL', measurement: { observer, params } });
const std = { standardVersionHash: 's', latitude: { level: 'GROUNDED' }, requirements: [req('m2', 'PARAGRAPH_LENGTH', { maxSentences: 2 }), req('c1', 'PATTERN_RATE', { pattern: ['BOLD_SPAN'], maxPer1000: 0 })] } as never;
const long = 'One thing first. Then a second. A third here. And a fourth.';

describe('a paragraph-length rule on the default run', () => {
  it('is the one rule set aside, with its reason', () => {
    const g = layoutGuides(std);
    expect([...g.keys()]).toEqual(['m2']);
    expect(g.get('m2')).toMatch(/guides the writer/);
  });
  it('a long paragraph breaks nothing then: the report is not failed, and the rule reads as set aside', async () => {
    const before = await checkDraftAsync('s', std, long, { guardClaims: false });
    expect(before.failed).toBe(true);
    const after = await checkDraftAsync('s', std, long, { guardClaims: false, waived: layoutGuides(std) });
    expect(after.failed).toBe(false);
    expect(after.checked.find((c) => c.requirementId === 'm2')?.result.verdict).toBe('NOT_APPLICABLE');
  });
  it('a rule of another kind still holds the piece: bold is still broken', async () => {
    const body = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1} says one plain thing about the work we ship each week.`).join('\n\n');
    const after = await checkDraftAsync('s', std, `**Bold.** ${long}\n\n${body}`, { guardClaims: false, waived: layoutGuides(std) });
    expect(after.checked.find((c) => c.requirementId === 'c1')?.result.verdict).toBe('VIOLATED');
    expect(after.failed).toBe(true);
  });
});
