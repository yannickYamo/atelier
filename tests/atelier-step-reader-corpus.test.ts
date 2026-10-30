// tests/atelier-step-reader-corpus.test.ts — THE READING OF CITATION AND TEST STEPS IS HELD TO A LABELLED CORPUS.
//
// `fixtures/readers/steps.jsonl` holds method steps, each labelled with what it asks of the work: a citation of the
// lines it speaks of (LINES), one on every finding (LINES_EACH), a named test (NAMES_TEST), the longest a paragraph may
// run (PARAGRAPH_LENGTH:<sentences>), or none of these (null).
// Forbidden and conditional wordings are in it beside the plain ones. `steps-baseline.json` is how the method reader
// fares on each today. A change may move a step to `agree`; it may never move one away from it, and it may never give
// a step a check its words do not ask for (a false check is the harmful error). Grow the corpus; never trim it.
import { describe, it, expect } from 'vitest';
import { mp } from './helpers/step-plan.js';
import { readFileSync } from 'node:fs';
import { } from '../core/method/standard.js';

type Label = 'LINES' | 'LINES_EACH' | 'NAMES_TEST' | `PARAGRAPH_LENGTH:${number}` | null;
interface Item { id: string; step: string; sections: string[]; check: Label }
type Fate = 'agree' | 'falseCheck' | 'wrongCheck' | 'miss';

const items: Item[] = readFileSync(new URL('./fixtures/readers/steps.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Item);
const baseline = JSON.parse(readFileSync(new URL('./fixtures/readers/steps-baseline.json', import.meta.url), 'utf8')) as Record<string, Fate>;
const DIFF = '--- a/src/client.ts\n+++ b/src/client.ts\n@@ -80,0 +81,2 @@\n+export function send(req) {\n+}\n';

/** The reading the method reader gives the step, in the corpus's terms. */
export function readingOf(x: Item): Label {
  const reference = x.sections.map((s) => `## ${s}\nSomething here.\n`).join('\n');
  const m = mp(`- ${x.step}\n`, { task: 'Review this change.', material: [{ name: 'diff', text: DIFF }], reference })[0]?.measurement;
  if (m?.observer === 'LINES') return m.params.perItem ? 'LINES_EACH' : 'LINES';
  if (m?.observer === 'PARAGRAPH_LENGTH') return `PARAGRAPH_LENGTH:${Number(m.params.maxSentences)}`;
  return m?.observer === 'NAMES_TEST' ? 'NAMES_TEST' : null;
}
function fateOf(x: Item): Fate {
  const r = readingOf(x);
  if (r === x.check) return 'agree';
  if (x.check === null) return 'falseCheck';
  return r === null ? 'miss' : 'wrongCheck';
}

describe('the citation and test step reader against the labelled corpus', () => {
  const now = Object.fromEntries(items.map((x) => [x.id, fateOf(x)])) as Record<string, Fate>;
  it('every step has a recorded fate, and the corpus only grows', () => {
    expect(items.map((x) => x.id).filter((id) => !(id in baseline))).toEqual([]);
    expect(Object.keys(baseline).filter((id) => !items.some((x) => x.id === id))).toEqual([]);
  });
  it('no step the reader read right is read wrong now', () => {
    expect(items.filter((x) => baseline[x.id] === 'agree' && now[x.id] !== 'agree').map((x) => `${x.id} ${now[x.id]}: ${x.step}`)).toEqual([]);
  });
  it('no step is given a check its words do not ask for, beyond the ones already known', () => {
    expect(items.filter((x) => now[x.id] === 'falseCheck' && baseline[x.id] !== 'falseCheck').map((x) => `${x.id}: ${x.step}`)).toEqual([]);
  });
  it('the corpus holds both kinds: wordings that ask, and wordings that forbid or condition', () => {
    expect(items.filter((x) => x.check !== null).length).toBeGreaterThanOrEqual(12);
    expect(items.filter((x) => x.check === null).length).toBeGreaterThanOrEqual(12);
  });
  it('where it stands, said in numbers', () => {
    const count = (f: Fate): number => Object.values(now).filter((v) => v === f).length;
    // a step moved to agree is a gain: record it in steps-baseline.json so it is held from then on
    expect({ agree: count('agree'), falseCheck: count('falseCheck') }).toEqual({ agree: Object.values(baseline).filter((v) => v === 'agree').length, falseCheck: Object.values(baseline).filter((v) => v === 'falseCheck').length });
  });
});
