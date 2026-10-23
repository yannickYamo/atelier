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
    expect(o1.opens).toEqual({ by: 'record', reasoningDelivered: false, setAside: 4 });
    expect(o1.tells).toEqual({ EM_DASH: 2 });
    expect(o1.length).toMatchObject({ words: 22, inside: true });
    expect(o1.copied).toEqual({ runs: 3, shown: ['the new ferry timetable starts', 'new ferry timetable starts on', 'ferry timetable starts on monday'] });
    expect(o1.points).toEqual({ given: 3, carried: 1 });
    expect(o1.rhythm.medianSentence).toEqual({ value: 11, authorLo: 6, authorHi: 8.5, inside: false });
    expect(o1.rhythm.iPer1000).toEqual({ value: 45.45, authorLo: 58.82, authorHi: 100, inside: false });
  });
  it('an output with no record: its first paragraph is listed for a person, never judged by a pattern', async () => {
    const o2 = (await audit()).rows[1];
    expect(o2.opens).toEqual({ by: 'no record', forAPerson: 'Here is a post on the brief.' });
    expect(o2.tells).toEqual({ CONTRAST_VERDICT: 1, SIGNPOST: 1 });
    expect(o2.length).toMatchObject({ words: 21, inside: true });
    expect(o2.points).toEqual({ given: 3, carried: 0 });
    expect(o2.rhythm.paragraphs).toEqual({ value: 2, authorLo: 1, authorHi: 1, inside: false });
  });
  it('the summary line totals the rows', async () => {
    expect((await audit()).text).toContain('total: tells 4; inside the range 2 of 2; copied runs 3');
  });
});
