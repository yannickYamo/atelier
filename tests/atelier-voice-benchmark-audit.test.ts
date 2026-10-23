// tests/atelier-voice-benchmark-audit.test.ts — THE ROUND-0 AUDIT COUNTS WHAT IT SAYS, ON AN INVENTED FIXTURE.
//
// bench/voice-benchmark/audit.mjs reads outputs against an author's pieces, the material and the brief, by form only.
// The fixture (bench/voice-benchmark/fixture) is two invented harbour pieces, one line of notes, a three-point brief and
// two outputs; every expected number below was counted by hand from those files. Runs on dist/: build first.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIX = resolve('bench/voice-benchmark/fixture');
interface Row { output: string; opens: Record<string, unknown>; tells: Record<string, number>; rhythm: Record<string, { value: number; authorLo?: number; authorHi?: number; inside?: boolean }>;
  copied: { runs: number; shown: string[] }; length: { words: number; inside?: boolean }; points?: { given: number; carried: number } }
// Run as a person runs it: the script on its own, in its own process, reading dist/.
const audit = async (): Promise<{ rows: Row[]; text: string }> => {
  const json = join(mkdtempSync(join(tmpdir(), 'atelier-vb-')), 'rows.jsonl');
  const text = execFileSync('node', [resolve('bench/voice-benchmark/audit.mjs'), '--author', `${FIX}/author`, '--outputs', `${FIX}/outputs`, '--material', `${FIX}/material`,
    '--range', '20-30', '--brief', `${FIX}/brief.md`, '--json', json], { encoding: 'utf8' });
  return Promise.resolve({ rows: readFileSync(json, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Row), text });
};

describe('the audit of the invented fixture', () => {
  it('an output that came inside its field: the record says so, and the lines set aside are counted', async () => {
    const [o1] = (await audit()).rows;
    expect(o1.output).toBe('o1.md');
    // every arm alike: the first paragraph for a person; the record's field beside it, as extra information
    expect(o1.opens).toEqual({ forAPerson: 'The new ferry timetable starts on Monday. I will be on the quay -- coffee in hand -- for the first crossing at six.', field: 'inside', setAside: 4 });
    expect(o1.tells).toEqual({ EM_DASH: 2 });
    expect(o1.length).toMatchObject({ words: 22, inside: true });
    // one copied stretch of 7 words, not three overlapping 5-word windows
    expect(o1.copied).toEqual({ runs: 1, longest: 7, shown: ['The new ferry timetable starts on Monday'] });
    expect(o1.points).toEqual({ given: 3, carried: 1 });
    expect(o1.rhythm.medianSentence).toEqual({ value: 11, authorLo: 6, authorHi: 8.5, inside: false });
    expect(o1.rhythm.iPer1000).toEqual({ value: 45.45, authorLo: 58.82, authorHi: 100, inside: false });
  });
  it('an output with no record: its first paragraph is listed for a person, never judged by a pattern', async () => {
    const o2 = (await audit()).rows[1];
    expect(o2.opens).toEqual({ forAPerson: 'Here is a post on the brief.', field: 'no record' });
    expect(o2.tells).toEqual({ CONTRAST_VERDICT: 1, SIGNPOST: 1 });
    expect(o2.length).toMatchObject({ words: 21, inside: true });
    expect(o2.points).toEqual({ given: 3, carried: 0 });
    expect(o2.rhythm.paragraphs).toEqual({ value: 2, authorLo: 1, authorHi: 1, inside: false });
  });
  it('the summary line totals the rows', async () => {
    expect((await audit()).text).toContain('total: tells 4; inside the range 2 of 2; copied runs 1');
  });
  it('the screen lists every output\'s opening for a person, whatever the record says', async () => {
    const t = (await audit()).text;
    expect(t).toContain('o1.md: opens "The new ferry timetable starts on Monday.');
    expect(t).toContain('o2.md: opens "Here is a post on the brief."');
  });
  it('"I\'m", "I\'ve", "I\'d" and "I\'ll" count as I', async () => {
    // in its own process, as the script runs: it reads dist/
    const js = `import(${JSON.stringify(pathToFileURL(resolve('bench/voice-benchmark/audit.mjs')).href)}).then((m) => console.log(m.rhythmOf("I'm here. I've gone. I'd stay. I'll walk. You run.").iPer1000))`;
    expect(await Promise.resolve(execFileSync('node', ['--input-type=module', '-e', js], { encoding: 'utf8' }).trim())).toBe('400');
  });
});

describe('round 4, item 9: the judge protocol the README freezes', () => {
  // A forced choice between two posts with "one thesis" and "problem before product" saturated: every arm passed both, so
  // they told nothing apart. Each post is now scored on its own against frozen criteria, a judge is used only after a
  // position test, the saturated measures give way to points used and copied runs, and close wins are reported apart.
  const readme = readFileSync(resolve('bench/voice-benchmark/README.md'), 'utf8');
  it('scores each post from 1 to 10 on its own, after a position test, with close and clear wins apart', () => {
    for (const s of ['scored on its own from 1 to 10', 'position test', 'at least 80%', 'points used', 'copied runs', 'Close wins and clear wins are reported apart']) expect(readme).toContain(s);
  });
  it('no forced choice, and no thesis or problem-before-product question', () => {
    for (const s of ['Which post would the author have published? (A, B, or neither)', 'Does the post state one thesis?', 'problem before the product?']) expect(readme).not.toContain(s);
  });
});
