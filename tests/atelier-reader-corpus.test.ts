// tests/atelier-reader-corpus.test.ts — THE LENGTH READER IS HELD TO A LABELLED CORPUS, NOT TO THE CASE THAT PROMPTED A FIX.
//
// Each fix to the reading of a length was tested on the request that showed the fault, and the next outside run found
// the next one: five rounds. `fixtures/readers/requests.jsonl` holds every request the project's history discusses and
// 160 fresh ones, labelled by someone who never read the reader, with what the person asks for. `baseline.json` is how
// the reader fares on each today. A change may move a request to `agree`; it may never move one away from it, and it
// may never hold a length the person did not ask for (a false hold is the harmful error). Grow the corpus; never trim it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { statedLength, notHeldBecause, type StatedLength } from '../core/intake/length.js';

type Label = { unit: string; min: number | null; max: number | null; about: number | null } | null;
interface Item { id: string; source: string; request: string; length: Label; whole: boolean | null; note?: string }
type Fate = 'agree' | 'falseHold' | 'wrongHold' | 'miss';

const items: Item[] = readFileSync(new URL('./fixtures/readers/requests.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Item);
const baseline = JSON.parse(readFileSync(new URL('./fixtures/readers/baseline.json', import.meta.url), 'utf8')) as Record<string, Fate>;

const norm = (s: StatedLength): Label => ({ unit: s.unit, min: s.kind === 'range' || s.kind === 'min' ? s.min : s.kind === 'exact' ? s.target : null,
  max: s.kind === 'range' || s.kind === 'max' ? s.max : s.kind === 'exact' ? s.target : null, about: s.kind === 'target' ? s.target : null });
const same = (a: Label, b: Label): boolean => a !== null && b !== null && a.unit === b.unit && a.min === b.min && a.max === b.max && a.about === b.about;
/** What a run does with the request: holds a length (and which), or holds none. Lengths in units no count is kept in are told, never held. */
export function fateOf(x: Item): Fate {
  const s = statedLength(x.request); const held = s !== null && notHeldBecause(x.request, s) === null;
  if (held && !x.length) return 'falseHold';
  if (held && !same(norm(s), x.length)) return 'wrongHold';
  if (!held && x.length) return 'miss';
  return 'agree';
}

describe('the length reader against the labelled corpus', () => {
  const now = Object.fromEntries(items.map((x) => [x.id, fateOf(x)])) as Record<string, Fate>;
  it('every request has a recorded fate, and the corpus only grows', () => {
    expect(items.map((x) => x.id).filter((id) => !(id in baseline))).toEqual([]);
    expect(Object.keys(baseline).filter((id) => !items.some((x) => x.id === id))).toEqual([]);
  });
  it('no request the reader read right is read wrong now', () => {
    const lost = items.filter((x) => baseline[x.id] === 'agree' && now[x.id] !== 'agree').map((x) => `${x.id} ${now[x.id]}: ${x.request}`);
    expect(lost).toEqual([]);
  });
  it('no length is held that the person did not ask for, beyond the ones already known', () => {
    const fresh = items.filter((x) => now[x.id] === 'falseHold' && baseline[x.id] !== 'falseHold').map((x) => `${x.id}: ${x.request}`);
    expect(fresh).toEqual([]);
  });
  it('no length is held wrong that was not held wrong before (a miss turned into a wrong length is a false one)', () => {
    const fresh = items.filter((x) => now[x.id] === 'wrongHold' && baseline[x.id] !== 'wrongHold').map((x) => `${x.id}: ${x.request}`);
    expect(fresh).toEqual([]);
  });
  it('where it stands, said in numbers', () => {
    const count = (f: Fate): number => Object.values(now).filter((v) => v === f).length;
    // a request moved to agree is a gain: record it in baseline.json so it is held from then on
    expect({ agree: count('agree'), falseHold: count('falseHold') }).toEqual({ agree: Object.values(baseline).filter((v) => v === 'agree').length, falseHold: Object.values(baseline).filter((v) => v === 'falseHold').length });
  });
});
