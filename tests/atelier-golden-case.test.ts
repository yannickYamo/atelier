// tests/atelier-golden-case.test.ts — A GOLDEN CASE IS A TASK, ITS MATERIAL AND A REFERENCE, AND THE REFERENCE IS NEVER SERVED.
//
// What a held-back example can test depends on what it carries (core/golden/case.ts). These hold the classes, the
// two ways an example names its material, the one function that builds what a candidate is given, the audit that
// catches a reference's wording in it, and the intake that reads all of it from a folder.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { classOf, goldenCase, splitMaterialRefs, servedFor, leakedRun, LEAK_RUN, describeCases, inMaterialDir, materialDirOf, countClasses, preferredForReserve, namedAsMaterial, isFileRef, staysInside } from '../core/golden/case.js';
import { extract } from '../core/intake/extract.js';
import { autoReserveIds } from '../cli/commands/intake.js';
import { openFiles } from '../cli/commands/reference.js';

describe('a case has a class, and the class says what it can be used for', () => {
  const m = [{ name: 'filing.md', text: 'Revenue was 12.4 million in the year.' }];
  it('the finished work alone, with its task, and with its task and material', () => {
    expect(classOf(null, [])).toBe('REFERENCE_ONLY');
    expect(classOf('   ', m)).toBe('REFERENCE_ONLY');
    expect(classOf('Analyse Acme against its two rivals.', [])).toBe('TASK_AND_REFERENCE');
    expect(classOf('Analyse Acme against its two rivals.', [{ name: 'empty.md', text: '  ' }])).toBe('TASK_AND_REFERENCE');
    expect(classOf('Analyse Acme against its two rivals.', m)).toBe('FULL_REPRO_CASE');
    expect(goldenCase('a', 'The report.', ' Analyse Acme. ', [...m, { name: 'blank.md', text: '' }])).toEqual({ id: 'a', task: 'Analyse Acme.', material: m, reference: 'The report.', caseClass: 'FULL_REPRO_CASE' });
  });
  it('material without a task is not a case that can be served: nothing says what was asked', () => {
    expect(goldenCase('a', 'The report.', null, m).caseClass).toBe('REFERENCE_ONLY');
    expect(servedFor(goldenCase('a', 'The report.', null, m))).toBeNull();
  });
  it('one line says what was given and what it can test', () => {
    const cases = [goldenCase('a', 'r', 't', m), goldenCase('b', 'r', 't'), goldenCase('c', 'r'), goldenCase('d', 'r')];
    expect(countClasses(cases)).toEqual({ FULL_REPRO_CASE: 1, TASK_AND_REFERENCE: 1, REFERENCE_ONLY: 2 });
    expect(describeCases(cases)).toBe('4 examples: 1 with the task and the material it was made from, 1 with the task, 2 finished work only. Reproduction can be tested on the first kind, on those held back.');
    expect(describeCases([goldenCase('b', 'r', 't')])).toBe('1 example: 1 with the task. None carries both its task and its material, so reproduction cannot be tested yet: every example still teaches the standard.');
  });
});

describe('what a candidate is given is built from the task and the material, and from nothing else', () => {
  const reference = 'Acme leads on price only because the comparison ignores the seat minimum, and once that is counted the order reverses in favour of Borealis.';
  const material = [{ name: 'pricing.md', text: 'Acme lists 12 dollars a seat with a 50 seat minimum. Borealis lists 15 dollars a seat with no minimum.' }];
  const c = goldenCase('acme', reference, 'Compare Acme and Borealis on price for a team of ten.', material);
  it('servedFor returns the task and the material; it takes no reference and cannot return one', () => {
    const served = servedFor(c);
    expect(served).toEqual({ task: 'Compare Acme and Borealis on price for a team of ten.', material });
    expect(JSON.stringify(served)).not.toContain('the order reverses');
    expect(Object.keys(served ?? {})).toEqual(['task', 'material']);
  });
  it('the audit finds a reference\'s wording in a served text, and leaves the material\'s own wording alone', () => {
    const honest = `${c.task}\n\n${material[0].text}`;
    expect(leakedRun(honest, reference, material.map((x) => x.text))).toBeLessThan(LEAK_RUN);
    // a brief written from the finished work carries its conclusion
    const leaked = `${c.task} Note that the comparison ignores the seat minimum, and once that is counted the order reverses.`;
    expect(leakedRun(leaked, reference, material.map((x) => x.text))).toBeGreaterThanOrEqual(LEAK_RUN);
    // a reference that quotes its source shares those words honestly
    const quoting = `${reference} Acme lists 12 dollars a seat with a 50 seat minimum.`;
    expect(leakedRun(material[0].text, quoting, material.map((x) => x.text))).toBe(0);
    expect(leakedRun(material[0].text, quoting)).toBeGreaterThanOrEqual(LEAK_RUN);
    // a run that begins in the material's words and goes on into the reference's own is counted whole
    const through = 'Borealis lists 15 dollars a seat with no minimum and so the order reverses in favour of Borealis for a small team.';
    expect(leakedRun('with no minimum and so the order reverses in favour of Borealis', through, material.map((x) => x.text))).toBe(12);
  });
  it('the audit reads any script, and a long text in a moment', () => {
    const cyr = 'Компания лидирует по цене только потому что сравнение не учитывает минимальное число мест в договоре';
    expect(leakedRun(cyr, cyr)).toBeGreaterThanOrEqual(LEAK_RUN);
    const han = '该公司仅因比较忽略了最低席位数才在价格上领先';
    expect(leakedRun(han, han)).toBeGreaterThanOrEqual(LEAK_RUN);
    const long = Array.from({ length: 3000 }, (_, i) => `w${i % 97}x${i}`).join(' ');
    const t0 = Date.now();
    expect(leakedRun(long, long)).toBe(3000);
    expect(leakedRun(long, long, [long])).toBe(0);
    expect(Date.now() - t0).toBeLessThan(20_000);
  });
});

describe('an example names what it was made from in its front matter, and the names are not its text', () => {
  it('one line, a bracketed list and a YAML list; with the request beside it', () => {
    expect(splitMaterialRefs('---\nmaterial: filing.md, notes/call.txt\n---\nThe report.')).toEqual({ text: 'The report.', refs: ['filing.md', 'notes/call.txt'] });
    expect(splitMaterialRefs('---\nmaterials: ["a b.md", c.md]\ntitle: Acme\n---\nThe report.')).toEqual({ text: '---\ntitle: Acme\n---\nThe report.', refs: ['a b.md', 'c.md'] });
    expect(splitMaterialRefs('---\ntitle: Acme\nmaterial:\n  - filing.md\n  - call.txt\nrequest: Analyse Acme.\n---\nThe report.')).toEqual({ text: '---\ntitle: Acme\nrequest: Analyse Acme.\n---\nThe report.', refs: ['filing.md', 'call.txt'] });
  });
  it('a `materials:` key of the author\'s own is theirs: only values that all name files are read as material', () => {
    for (const raw of ['---\nmaterials: wood, glue\n---\nThe bench.', '---\nmaterial: |\n  oak\n---\nThe bench.', '---\nmaterial: a.md # the filing\n---\nThe report.', '---\nmaterial: https://example.com/a.md\n---\nThe report.']) {
      expect(splitMaterialRefs(raw)).toEqual({ text: raw, refs: [] });
    }
    expect([isFileRef('notes/call.txt'), isFileRef('wood'), isFileRef('|'), isFileRef('a b.md')]).toEqual([true, false, false, true]);
    expect([staysInside('sources/a.md'), staysInside('../a.md'), staysInside('/etc/hostname'), staysInside('C:/x.md')]).toEqual([true, false, false, false]);
  });
  it('taking the key out leaves the rest of the front matter as it was, blank lines included', () => {
    const raw = '---\nrequest: |\n  First paragraph.\n\n  Second paragraph.\nmaterial: filing.md\n---\nThe report.';
    expect(splitMaterialRefs(raw).text).toBe('---\nrequest: |\n  First paragraph.\n\n  Second paragraph.\n---\nThe report.');
    expect(splitMaterialRefs('---\nmaterial: sources\\filing.md\n---\nx').refs).toEqual(['sources/filing.md']);
  });
  it('in one flat folder, a file another names as its material is not a piece', () => {
    const files = [{ name: 'acme.md', raw: '---\nmaterial: Filing.md\n---\nThe report.' }, { name: 'filing.md', raw: 'Revenue.' }, { name: 'self.md', raw: '---\nmaterial: ./self.md\n---\nx' }];
    expect([...namedAsMaterial(files)]).toEqual(['filing.md']);
  });
  it('a file with no such key is returned byte for byte', () => {
    for (const raw of ['The report.', '---\ntitle: Acme\n---\nThe report.', '---\nmaterial:\n---\nThe report.', 'material: not front matter\n\nThe report.', '\uFEFF---\r\ntitle: Acme\r\n---\r\nThe report.']) {
      expect(splitMaterialRefs(raw)).toEqual({ text: raw, refs: [] });
    }
  });
  it('extract returns the request and the names apart from the text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-case-'));
    writeFileSync(join(dir, 'acme.md'), '---\nrequest: Analyse Acme against its rivals.\nmaterial: filing.md\n---\nAcme leads on price.');
    expect(extract(join(dir, 'acme.md'))).toEqual({ ok: true, text: 'Acme leads on price.', via: 'utf8', request: 'Analyse Acme against its rivals.', materialRefs: ['filing.md'] });
  });
  it('a `.material` folder beside an example is that example\'s', () => {
    expect(materialDirOf('reports/acme.md')).toBe('reports/acme.material');
    expect(inMaterialDir('reports/acme.material/filing.md')).toBe(true);
    expect(inMaterialDir('reports/acme.md')).toBe(false);
    expect(inMaterialDir('reports/raw.material.md')).toBe(false);
  });
});

describe('half the full cases are first in line for the reserve, and the rest stay to be learned from', () => {
  const unit = (unitId: string, caseClass?: 'FULL_REPRO_CASE' | 'TASK_AND_REFERENCE'): { unitId: string; caseClass?: 'FULL_REPRO_CASE' | 'TASK_AND_REFERENCE' } => ({ unitId, ...(caseClass ? { caseClass } : {}) });
  const order = (id: string): string => id;
  it('among pieces of one kind the order is the one it always was', () => {
    const ids = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md', 'g.md', 'h.md'];
    expect(autoReserveIds(ids, () => 0)).toEqual(autoReserveIds(ids));
    expect(autoReserveIds(ids.slice(0, 5), () => 0)).toEqual([]);
    for (const first of ids) expect(autoReserveIds(ids, (id) => (id === first ? 0 : 1))).toEqual([first]);
  });
  it('half, rounded up: one of two, two of three, two of four', () => {
    const full = (n: number): ReturnType<typeof unit>[] => Array.from({ length: n }, (_, i) => unit(`f${i}.md`, 'FULL_REPRO_CASE'));
    expect([2, 3, 4].map((n) => preferredForReserve([...full(n), unit('p.md')], order).size)).toEqual([1, 2, 2]);
    expect([...preferredForReserve([...full(3), unit('p.md')], order)]).toEqual(['f0.md', 'f1.md']);
  });
  it('a single full case is first in line when another example carries a request, and stays to teach when none does', () => {
    expect([...preferredForReserve([unit('f.md', 'FULL_REPRO_CASE'), unit('t.md', 'TASK_AND_REFERENCE'), unit('p.md')], order)]).toEqual(['f.md']);
    expect(preferredForReserve([unit('f.md', 'FULL_REPRO_CASE'), unit('p.md')], order).size).toBe(0);
    // an example with its task alone is never put first: a skill that answers learns from those pairs
    expect(preferredForReserve([unit('t.md', 'TASK_AND_REFERENCE'), unit('p.md')], order).size).toBe(0);
  });
});

describe('intake reads cases from a folder', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  beforeAll(() => { if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`); });
  const run = (data: string, proj: string, ...args: string[]): string => {
    try { return execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj } }); }
    catch (e) { const err = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`; }
  };
  const body = (i: number): string => Array.from({ length: 30 }, (_, k) => `The team reviewed competitor ${i} on criterion ${k} and recorded what the filing said about it.`).join(' ');
  const corpus = (): { data: string; proj: string; dir: string } => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'atelier-cases-')));
    const data = join(root, 'data'); const proj = join(root, 'proj'); const dir = join(proj, 'reports');
    mkdirSync(data); mkdirSync(join(dir, 'acme.material'), { recursive: true }); mkdirSync(join(dir, 'sources'));
    // two full cases (one by folder, one by name), one with its task only, five of finished work alone
    writeFileSync(join(dir, 'acme.md'), `---\nrequest: Analyse Acme against its two rivals.\n---\n${body(0)}`);
    writeFileSync(join(dir, 'acme.material', 'filing.md'), 'Acme reported revenue of 12.4 million and 310 customers in the year. '.repeat(8));
    writeFileSync(join(dir, 'borealis.md'), `---\nrequest: Analyse Borealis against its two rivals.\nmaterial: sources/borealis-filing.md\n---\n${body(1)}`);
    writeFileSync(join(dir, 'sources', 'borealis-filing.md'), 'Borealis reported revenue of 9.1 million and 120 customers in the year. '.repeat(8));
    writeFileSync(join(dir, 'cygnus.md'), `---\nrequest: Analyse Cygnus against its two rivals.\n---\n${body(2)}`);
    for (let i = 3; i < 8; i++) writeFileSync(join(dir, `plain-${i}.md`), body(i));
    return { data, proj, dir };
  };

  it('says what was given, counts material as no example, and holds a full case back first', () => {
    const { data, proj, dir } = corpus();
    const out = run(data, proj, 'intake', dir, '--auto-reserve');
    expect(out).not.toMatch(/^EXIT:/);
    expect(out).toMatch(/8 examples: 2 with the task and the material it was made from, 1 with the task, 5 finished work only\. Reproduction can be tested on the first kind, on those held back\./);
    // neither the file in the .material folder nor the one an example names is read as finished work
    expect(out).not.toMatch(/^\s+acme\.material\/filing\.md\b/m);
    expect(out).not.toMatch(/Reading 10|Reading 9/);
    // eight pieces spare one for the reserve: it is one of the two full cases
    expect(out).toMatch(/RESERVED, before anything read them: (acme|borealis)\.md$/m);
    expect(out).toMatch(/Material read for 2 example\(s\): 2 file\(s\)\. It is what the work was made from, and is never read as your finished work\./);
  });
  it('material is read as the data it is; a folder with no example, and a name outside the folder, are said and not read', () => {
    const { data, proj, dir } = corpus();
    writeFileSync(join(dir, 'acme.material', 'prices.csv'), 'vendor,seat\nAcme,12\nBorealis,15\n');
    mkdirSync(join(dir, 'orphan.material')); writeFileSync(join(dir, 'orphan.material', 'x.md'), 'Nothing claims this. '.repeat(10));
    writeFileSync(join(proj, 'outside.md'), 'Outside the folder. '.repeat(10));
    writeFileSync(join(dir, 'cygnus.md'), `---\nrequest: Analyse Cygnus against its two rivals.\nmaterial: ../outside.md\n---\n${body(2)}`);
    const out = run(data, proj, 'intake', dir, '--dry-run');
    expect(out).toMatch(/Material read for 2 example\(s\): 3 file\(s\)/);
    expect(out).toMatch(/Material folder\(s\) with no example of the same name beside them, not read: orphan\.material\./);
    expect(out).toMatch(/Material named outside the folder you pointed at, not read: \.\.\/outside\.md \(for cygnus\.md\)\. Put it inside the folder\./);
    expect(out).toMatch(/2 with the task and the material it was made from, 1 with the task/);
  });
  it('a piece with a `materials:` key of its own is read whole, and nothing is said about files', () => {
    const { data, proj } = corpus();
    const plain = join(proj, 'benches'); mkdirSync(plain);
    for (let i = 0; i < 6; i++) writeFileSync(join(plain, `bench-${i}.md`), `---\nmaterials: wood, glue\n---\n${body(i)}`);
    const out = run(data, proj, 'intake', plain, '--dry-run');
    expect(out).not.toMatch(/could not be read|with the task|Material read/);
  });
  it('a folder of finished work alone reads as it always did: no line about cases', () => {
    const { data, proj, dir } = corpus();
    const plain = join(proj, 'plain'); mkdirSync(plain);
    for (let i = 0; i < 8; i++) writeFileSync(join(plain, `post-${i}.md`), body(i));
    void dir;
    const out = run(data, proj, 'intake', plain, '--auto-reserve');
    expect(out).not.toMatch(/with the task|finished work only/);
    expect(out).toMatch(/RESERVED, before anything read them: post-\d\.md$/m);
  });
  it('material that cannot be read is said, and its example is not counted as having it', () => {
    const { data, proj, dir } = corpus();
    writeFileSync(join(dir, 'cygnus.md'), `---\nrequest: Analyse Cygnus against its two rivals.\nmaterial: sources/missing.md\n---\n${body(2)}`);
    const out = run(data, proj, 'intake', dir, '--dry-run');
    expect(out).toMatch(/Material that could not be read, so its example is not counted as having it: sources\/missing\.md \(for cygnus\.md\)/);
    expect(out).toMatch(/2 with the task and the material it was made from, 1 with the task/);
  });
});

describe('an arm that is shown the author\'s work is never shown a piece held back', () => {
  it('the sealed list lists every piece; the arm reads those that are not reserved', () => {
    const sealed = [{ id: 'a.md', path: '/x/a.md' }, { id: 'b.md', path: '/x/b.md' }, { id: 'c.md', path: '/x/c.md' }];
    expect(openFiles(sealed, ['b.md'])).toEqual([sealed[0], sealed[2]]);
    expect(openFiles(sealed, [])).toEqual(sealed);
    expect(openFiles(sealed, ['a.md', 'b.md', 'c.md'])).toEqual([]);
  });
});
