// tests/atelier-atomic-writes.test.ts — C14. A GUARANTEE THAT LIVES ONLY IN PROSE FAILS SILENTLY.
//
// Two properties, and the tests are deliberately different in kind because the properties are.
//
// The first is a CENSUS, not a behaviour: nothing in the shipped tree may call `writeFileSync`
// directly. That cannot be tested by exercising a code path, because the failure it prevents is a
// site nobody thought to exercise. The whole point is the write that gets added next month.
//
// The second is BEHAVIOUR: `readEvents` must survive a torn tail and must refuse a torn middle.
// Those are opposite handlings of superficially identical damage, and asserting them costs nothing
// next to the cost of learning the difference from a real ledger.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, appendFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeAtomic } from '../core/state/fs-atomic.js';
import { readEvents, appendEvent, initStore } from '../core/state/store.js';

const walkTree = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return entry === 'node_modules' ? [] : walkTree(p);
    return [p];
  });
};

const shipped = (): string[] => ['core', 'cli', 'renderers', 'adapters', 'providers']
  .flatMap((d) => walkTree(d)).filter((f) => f.endsWith('.ts'));

const roots: string[] = [];
const scratch = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'atelier-atomic-'));
  roots.push(d);
  return d;
};
afterEach(() => { roots.splice(0).forEach((d) => { rmSync(d, { recursive: true, force: true }); }); });

describe('C14 — every persisted write is atomic', () => {
  it('no shipped module calls writeFileSync directly', () => {
    const offenders = shipped()
      .filter((f) => f !== join('core', 'state', 'fs-atomic.ts'))
      .filter((f) => /\bwriteFileSync\(/.test(readFileSync(f, 'utf8')));
    expect(
      offenders,
      `use writeAtomic from core/state/fs-atomic.ts instead:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('the census can actually see the tree it is policing', () => {
    // A filter that silently matched nothing would pass the test above forever.
    expect(shipped().length).toBeGreaterThan(80);
    expect(shipped()).toContain(join('core', 'state', 'store.ts'));
  });

  it('writeAtomic replaces existing contents whole and leaves no scratch file behind', () => {
    const dir = scratch();
    const target = join(dir, 'nested', 'active.json');
    writeAtomic(target, '{"v":1}');
    writeAtomic(target, '{"v":2}');
    expect(readFileSync(target, 'utf8')).toBe('{"v":2}');
    expect(readdirSync(join(dir, 'nested'))).toEqual(['active.json']);
  });

  it('a failed write does not destroy the previous file', () => {
    const dir = scratch();
    const target = join(dir, 'ledger.json');
    writeAtomic(target, 'ORIGINAL');
    // A directory where the temp file wants to be: the write throws, and the point is what survives.
    const tmpName = `.ledger.json.${process.pid}.tmp`;
    mkdirSync(join(dir, tmpName));
    expect(() => { writeAtomic(target, 'REPLACEMENT'); }).toThrow();
    expect(readFileSync(target, 'utf8')).toBe('ORIGINAL');
  });
});

describe('C14 — a torn ledger tail is reported, a torn middle refuses', () => {
  const layout = (root: string) => ({ root, skillName: 'demo' });

  it('reads every intact event and does not throw on a truncated final line', () => {
    const root = scratch();
    const l = layout(root);
    initStore(l);
    appendEvent(l, { kind: 'ONE' });
    appendEvent(l, { kind: 'TWO' });
    // Simulate a crash mid-append: a partial JSON object with no newline.
    appendFileSync(findLedger(root), '{"kind":"THR');

    const events = readEvents(l);
    expect(events.map((e) => e.kind)).toEqual(['ONE', 'TWO']);
  });

  it('refuses to read past damage that is not the final line', () => {
    const root = scratch();
    const l = layout(root);
    initStore(l);
    appendEvent(l, { kind: 'ONE' });
    appendEvent(l, { kind: 'TWO' });
    const ledger = findLedger(root);
    const good = readFileSync(ledger, 'utf8').split('\n').filter(Boolean);
    writeFileSync(ledger, `${good[0]}\nNOT JSON AT ALL\n${good[1]}\n`);

    expect(() => { readEvents(l); }).toThrow(/corruption in the middle of an append-only history/);
  });
});

/** The store owns its own layout; find the ledger rather than restating the path here. */
function findLedger(root: string): string {
  const hit = walkTree(root).find((f) => f.endsWith('events.jsonl'));
  if (!hit) throw new Error(`no events.jsonl written under ${root}`);
  return hit;
}
