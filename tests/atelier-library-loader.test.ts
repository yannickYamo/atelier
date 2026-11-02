// THE LIBRARY IS READ FROM DISK: THE SHIPPED CORE, AND A PACK OVER IT BY ID. A library is user data, so a broken
// file or entry is left out and said, never thrown; a pack replaces an entry where the ids meet and adds the rest.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadLibrary, packageRoot, coreLibraryDir, cardsFor, anglesFor, rubricFor, beatsFor, tellsActive } from '../core/library/loader.js';

const dir = (files: Record<string, unknown>): string => {
  const d = mkdtempSync(join(tmpdir(), 'atelier-library-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(d, name), typeof body === 'string' ? body : JSON.stringify(body));
  return d;
};
const card = (id: string, kind = 'blog', theCall = `call of ${id}`) => ({ id, kind, appliesWhen: 'always', theCall, strong: ['a', 'b'], nearMiss: 'n', weak: 'w', antiPatterns: ['x'], evidence: 'principle' });
const tell = (id: string, status = 'banned') => ({ id, since: '2025-03', description: 'd', instead: 'i', status });
const beat = (b: string, position: number) => ({ kind: 'blog', beat: b, position, concentration: 4, job: 'j' });
const prior = process.env.ATELIER_LIBRARY;
afterEach(() => { if (prior === undefined) delete process.env.ATELIER_LIBRARY; else process.env.ATELIER_LIBRARY = prior; });

describe('the core', () => {
  it('is found in the package, and every entry it ships reads clean', () => {
    expect(packageRoot()).toBe(resolve('.'));
    expect(coreLibraryDir()).toBe(resolve('library/core'));
    delete process.env.ATELIER_LIBRARY;
    const lib = loadLibrary();
    expect(lib.problems).toEqual([]);
    expect(lib.sources).toEqual(['core']);
    expect(cardsFor(lib, 'blog')).toHaveLength(3);
    expect(anglesFor(lib, 'blog')).toHaveLength(6);
    expect(tellsActive(lib).length).toBeGreaterThanOrEqual(10);
    const r = rubricFor(lib, 'blog');
    expect(r?.criteria.length).toBeGreaterThanOrEqual(4);
    expect(r?.caps.length).toBeGreaterThanOrEqual(2);
    expect(beatsFor(lib, 'blog').map((b) => b.beat)).toEqual(['hook', 'stakes', 'turn', 'payoff', 'echo']);
    expect(lib.questions.map((q) => q.gap)).toEqual(expect.arrayContaining(['angle', 'proof', 'reader', 'stakes', 'example']));
  });
  it('a kind it holds nothing for is empty, not an error', () => {
    const lib = loadLibrary({ coreDir: dir({ 'cards.json': [card('c1')] }) });
    expect(cardsFor(lib, 'newsletter')).toEqual([]);
    expect(rubricFor(lib, 'newsletter')).toBeNull();
  });
});

describe('the pack', () => {
  const core = () => dir({ 'cards.json': [card('c1'), card('c2')], 'tells.json': [tell('t1')], 'beats.json': [beat('turn', 0.5), beat('hook', 0)] });
  it('is merged over the core by id: a meeting id is replaced in place, a new one is added after', () => {
    const pack = dir({ 'cards.json': [card('c2', 'blog', 'the pack\'s call'), card('p1')], 'tells.json': [tell('t1', 'warned')] });
    const lib = loadLibrary({ coreDir: core(), packDir: pack });
    expect(lib.cards.map((c) => [c.id, c.theCall])).toEqual([['c1', 'call of c1'], ['c2', 'the pack\'s call'], ['p1', 'call of p1']]);
    expect(lib.tells).toEqual([tell('t1', 'warned')]);
    expect(lib.sources).toEqual(['core', pack]);
    expect(lib.problems).toEqual([]);
  });
  it('is read from ATELIER_LIBRARY when none is passed', () => {
    process.env.ATELIER_LIBRARY = dir({ 'cards.json': [card('env')] });
    expect(loadLibrary({ coreDir: core() }).cards.map((c) => c.id)).toEqual(['c1', 'c2', 'env']);
  });
  it('named but absent, it is said and not read', () => {
    const lib = loadLibrary({ coreDir: core(), packDir: join(tmpdir(), 'no-such-atelier-pack') });
    expect(lib.cards.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(lib.problems.join('\n')).toMatch(/no-such-atelier-pack is not a directory/);
  });
  it('beat priors merge by kind and beat, and come back in the order they fall', () => {
    const lib = loadLibrary({ coreDir: core(), packDir: dir({ 'beats.json': [beat('turn', 0.6)] }) });
    expect(beatsFor(lib, 'blog').map((b) => [b.beat, b.position])).toEqual([['hook', 0], ['turn', 0.6]]);
  });
});

describe('user mistakes are left out and said, never thrown', () => {
  it('a file that is not JSON, or not a list, is left out', () => {
    const lib = loadLibrary({ coreDir: dir({ 'cards.json': '{ not json', 'tells.json': { id: 't' } }) });
    expect(lib.cards).toEqual([]);
    expect(lib.tells).toEqual([]);
    expect(lib.problems).toHaveLength(2);
    expect(lib.problems[0]).toMatch(/^core\/cards\.json at .* is not valid JSON.* Left out\.$/);
    expect(lib.problems[1]).toMatch(/^core\/tells\.json at .* should be a JSON array.* Left out\.$/);
  });
  it('an entry of the wrong shape is left out by name, the rest of its file stands', () => {
    const bad = [card('ok'), { ...card('no-call'), theCall: '' }, { ...card('bad-ev'), evidence: 'hearsay' }, 'text', card('ok')];
    const lib = loadLibrary({ coreDir: dir({
      'cards.json': bad,
      'tells.json': [tell('t'), { ...tell('t2'), since: '2025' }, { ...tell('t3'), status: 'maybe' }],
      'rubrics.json': [{ kind: 'blog', criteria: [{ id: 'a', weight: 0, question: 'q' }], caps: [] }, { kind: 'essay', criteria: [{ id: 'a', weight: 1, question: 'q' }], caps: [{ when: 'w', max: 11 }] }],
      'beats.json': [{ ...beat('hook', 1.5) }],
    }) });
    expect(lib.cards.map((c) => c.id)).toEqual(['ok']);
    expect(lib.tells.map((t) => t.id)).toEqual(['t']);
    expect(lib.rubrics).toEqual([]);
    expect(lib.beats).toEqual([]);
    expect(lib.problems).toEqual([
      'core/cards.json: no-call left out (theCall missing or of the wrong kind)',
      'core/cards.json: bad-ev left out (evidence missing or of the wrong kind)',
      'core/cards.json: entry 4 left out (the entry missing or of the wrong kind)',
      'core/cards.json: ok repeated; the first one stands',
      'core/tells.json: t2 left out (since missing or of the wrong kind)',
      'core/tells.json: t3 left out (status missing or of the wrong kind)',
      'core/rubrics.json: entry 1 left out (criteria missing or of the wrong kind)',
      'core/rubrics.json: entry 2 left out (caps missing or of the wrong kind)',
      'core/beats.json: entry 1 left out (position missing or of the wrong kind)',
    ]);
  });
  it('no core at all is said; a pack alone still reads', () => {
    const empty = join(mkdtempSync(join(tmpdir(), 'atelier-library-')), 'missing');
    const pack = dir({ 'angles.json': [] });
    mkdirSync(join(pack, 'sub'));
    const lib = loadLibrary({ coreDir: empty, packDir: pack });
    expect(lib.sources).toEqual([pack]);
    expect(lib.problems).toEqual(['the public core library was not found; only a pack is read']);
  });
});

describe('through the binary: atelier library', () => {
  it('says what the core and a pack hold, and what was left out', async () => {
    const { spawnSync } = await import('node:child_process');
    const pack = dir({ 'cards.json': [card('blog-one-idea'), card('extra'), { id: 'broken' }] });
    const r = spawnSync(process.execPath, [resolve('dist/cli/atelier.mjs'), 'library'], { encoding: 'utf8', env: { ...process.env, ATELIER_LIBRARY: pack } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`Library: core + ${pack}`);
    expect(r.stdout).toContain('blog: 4 card(s), 6 angle(s)');   // three in the core, one replaced, one added
    expect(r.stdout).toContain('pack/cards.json: broken left out');
  });
});
