// tests/atelier-step-corpus.test.ts — THE METHOD READER IS HELD TO THE BLIND-LABELLED STEPS, NOT TO THE STEP THAT PROMPTED A FIX.
//
// Four method notes of forty steps each (studies/coverage-labels), compiled by the method reader and labelled by
// someone who never saw its answers: for each step given a check, does the check read the whole step, part of it, or
// none of it. The harmful error is a check called FULL that reads less (a tick on a rule nobody read whole). A change
// may never make one, may never lose an agreement, and a step that newly compiles to a check must be labelled first.
import { describe, it, expect } from 'vitest';
import { mp } from './helpers/step-plan.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { observesOf } from '../core/eval/observes.js';

const DIR = join(import.meta.dirname, '..', 'studies', 'coverage-labels');
const labels = new Map((JSON.parse(readFileSync(join(DIR, 'labels.json'), 'utf8')) as { id: string; label: string }[]).map((l) => [l.id, l.label]));
const split = (text: string): { task: string; reference: string } => { const m = /^---\n([\s\S]*?)\n---\n/.exec(text); return { task: m ? (/^request:\s*(.+)$/m.exec(m[1])?.[1] ?? '') : '', reference: m ? text.slice(m[0].length) : text }; };

function compiled(): { id: string; coverage: string }[] {
  const out: { id: string; coverage: string }[] = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.note.md')).sort()) {
    const domain = f.replace('.note.md', '');
    const { task, reference } = split(readFileSync(join(DIR, `${domain}.example.md`), 'utf8'));
    mp(readFileSync(join(DIR, f), 'utf8'), { task, material: [], reference }).filter((p) => p.origin === 'STATED').forEach((p, i) => {
      if (!p.measurement) return;
      out.push({ id: `${domain}-${String(i + 1).padStart(2, '0')}`, coverage: observesOf(p.statement, p.measurement, false)?.coverage ?? 'NONE' });
    });
  }
  return out;
}

// How the reader fares today on the labelled steps: the floor every change is held to.
const AGREE_FLOOR = 12;

describe('the method reader against the blind-labelled steps', () => {
  const now = compiled();
  it('every step given a check has a label (label a newly compiled step before it ships)', () => {
    expect(now.filter((c) => !labels.has(c.id)).map((c) => c.id)).toEqual([]);
  });
  it('no check is called FULL where the label says it reads less', () => {
    expect(now.filter((c) => c.coverage === 'FULL' && labels.get(c.id) !== 'FULL').map((c) => `${c.id} (label ${labels.get(c.id)})`)).toEqual([]);
  });
  it('agreement with the labels does not fall', () => {
    expect(now.filter((c) => labels.get(c.id) === c.coverage).length).toBeGreaterThanOrEqual(AGREE_FLOOR);
  });
});
