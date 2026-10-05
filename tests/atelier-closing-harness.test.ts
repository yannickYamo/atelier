// tests/atelier-closing-harness.test.ts — THE CLOSING TEST'S OWN INSTRUMENTS, HELD BOTH WAYS, OFFLINE.
//
// The analysis that reads a closing claim is fixed before the run, so it is tested like product code: an arm that
// is truly equal passes, an arm that is clearly worse fails, a clear loss trips a guard, and too few cases is
// UNRESOLVED. The benchmark runner refuses to start when it could not see what a call costs.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mulberry32 } from '../core/fidelity/qualify.js';

const node = (script: string, ...args: string[]): { code: number; out: string } => {
  try { return { code: 0, out: execFileSync('node', [resolve(script), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return { code: x.status ?? -1, out: `${x.stdout ?? ''}${x.stderr ?? ''}` }; }
};
const jsonl = (rows: readonly object[]): string => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
const WEIGHTS = { correctness: 0.35, autonomy: 0.25, actionability: 0.2, safety: 0.1, concision: 0.1 };

/** A judged file: `cases` cases, three arms, the candidate shifted by `shift` on every dimension, with paired noise. */
function fixture(cases: number, shift: number, blockerRate: { candidate: number; handwritten: number }, seed = 1): string {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-closing-'));
  const rand = mulberry32(seed);
  const gauss = (): number => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  const scores: object[] = []; const verify: object[] = []; const human: object[] = [];
  for (let c = 0; c < cases; c++) {
    const base = 3.5 + gauss() * 0.5;
    for (const [condition, d, br] of [['bare', -0.4, 0.16], ['hand', 0, blockerRate.handwritten], ['plugin', shift, blockerRate.candidate]] as const) {
      // a per-case, per-arm draw with SD 0.52, so the paired difference between two arms has SD about 0.73
      const x = base + d + gauss() * 0.52;
      scores.push({ case_id: `c${c}`, trial: 1, condition, ...Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, x])), blocker: rand() < br });
      const held = condition === 'plugin' ? (rand() < 0.9 ? 4 : 3) : (rand() < 0.5 ? 4 : 3);
      verify.push({ case_id: `c${c}`, trial: 1, condition, applicable: 4, held });
      if (c % 5 === 0) human.push({ case_id: `c${c}`, trial: 1, condition, held: held === 4, parts_asked: 3, parts_given: 3 });
    }
  }
  writeFileSync(join(dir, 'scores.jsonl'), jsonl(scores)); writeFileSync(join(dir, 'verify.jsonl'), jsonl(verify)); writeFileSync(join(dir, 'human.jsonl'), jsonl(human));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ claim: 'A', k: 20, weights: WEIGHTS, scores: ['scores.jsonl'], conditions: { bare: 'bare', handwritten: 'hand', strongest: 'hand', candidate: 'plugin' },
    verify: 'verify.jsonl', human: 'human.jsonl', depthCases: Array.from({ length: cases }, (_, c) => `c${c}`).filter((_, c) => c % 5 === 0), minUnits: 140 }));
  return join(dir, 'config.json');
}
interface Result { verdict: string; sentence: string; validCases: number; endpoints: { P1: { pass: boolean }; P2: { pass: boolean; n: number }[]; P4: { pass: boolean }[]; P5: { pass: boolean; agreement: { share: number } }; P6: { pass: boolean } } }
const analyse = (config: string): Result => JSON.parse(node('bench/compare/closing-quality.mjs', '--config', config).out) as Result;

describe('the analysis of a closing quality claim', () => {
  it('an arm that is truly equal on quality and holds the rules more often passes, and the sentence names what was shown', () => {
    const r = analyse(fixture(150, 0, { candidate: 0.1, handwritten: 0.1 }));
    expect(r.endpoints.P2[0]).toMatchObject({ pass: true, n: 150 });
    expect(r.endpoints).toMatchObject({ P1: { pass: true }, P5: { pass: true, agreement: { share: 1 } }, P6: { pass: true } });
    expect(r.verdict).toBe('PASS');
    expect(r.sentence).toMatch(/^On 150 coding tasks it never saw, the Atelier plug-in built from 20 examples was not worse overall than the hand-written skill, no quality dimension, blocker rate or requested depth showed a clear loss, and it held the shared required rules more often\./);
  });
  it('"scored higher" is said only when the lower bound against the hand-written skill is above zero', () => {
    const r = analyse(fixture(150, 0.4, { candidate: 0.1, handwritten: 0.1 }));
    expect(r.verdict).toBe('PASS');
    expect(r.sentence).toMatch(/the Atelier plug-in built from 20 examples scored higher overall than the hand-written skill \(\+0\.\d+\)/);
  });
  it('an arm 0.4 worse fails the overall bar, with the estimate and the bar in the sentence', () => {
    const r = analyse(fixture(150, -0.4, { candidate: 0.1, handwritten: 0.1 }));
    expect(r.endpoints.P2[0].pass).toBe(false);
    expect(r.verdict).toBe('FAIL');
    expect(r.sentence).toMatch(/failed "not worse than the hand-written skill": -0\.\d+ .*where the bar was > -0\.2\./);
  });
  it('clearly more blockers trips the guard; an equal blocker rate does not', () => {
    expect(analyse(fixture(150, 0, { candidate: 0.3, handwritten: 0.05 })).endpoints.P4[0].pass).toBe(false);
    expect(analyse(fixture(150, 0, { candidate: 0.1, handwritten: 0.1 }, 3)).endpoints.P4[0].pass).toBe(true);
  });
  it('fewer valid cases than the sealed minimum is UNRESOLVED, never a pass', () => {
    const r = analyse(fixture(100, 0, { candidate: 0.1, handwritten: 0.1 }));
    expect(r.verdict).toBe('UNRESOLVED');
    expect(r.sentence).toMatch(/only 100 cases have every arm judged, under the minimum of 140/);
  });
});

describe('a judge is qualified on answers whose quality is known', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-judge-'));
  const labels = Array.from({ length: 40 }, (_, i) => ({ case_id: `p${i}`, condition: 'x', label: i < 20 ? 'good' : 'bad' }));
  writeFileSync(join(dir, 'labels.jsonl'), jsonl(labels));
  const rows = (wrong: number): object[] => labels.map((l, i) => ({ case_id: l.case_id, trial: 1, condition: 'x', ...Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, (l.label === 'good') !== (i % 20 < wrong) ? 4.5 : 2])), blocker: false }));
  const run = (wrong: number): { verdict: string; judge: { goodCalledGood: { share: number }; badCalledBad: { share: number } } } => {
    writeFileSync(join(dir, `s${wrong}.jsonl`), jsonl(rows(wrong)));
    return JSON.parse(node('bench/compare/judge-qualification.mjs', '--scores', join(dir, `s${wrong}.jsonl`), '--labels', join(dir, 'labels.jsonl'), '--weights', JSON.stringify(WEIGHTS), '--threshold', '3.5').out) as never;
  };
  it('0.85 of each class called right qualifies; fewer does not', () => {
    expect(run(2)).toMatchObject({ verdict: 'QUALIFIED', judge: { goodCalledGood: { share: 0.9 }, badCalledBad: { share: 0.9 } } });
    expect(run(5).verdict).toBe('NOT QUALIFIED');
  });
});

describe('the benchmark runner refuses to start when it could not see what a call costs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-runner-'));
  writeFileSync(join(dir, 'tasks.jsonl'), jsonl([{ id: 'a', prompt: 'hi' }]));
  const out = join(dir, 'out.jsonl');
  it('a model with no known price, and another backend with no price given, are refused before any call', () => {
    const unpriced = node('bench/compare/run.mjs', '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', out, '--model', 'claude-not-a-model');
    expect(unpriced.code).toBe(2);
    expect(unpriced.out).toMatch(/no price is known for "claude-not-a-model", so the cap could not hold/);
    const other = node('bench/compare/run.mjs', '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', out, '--provider', 'openai-compatible', '--base-url', 'http://127.0.0.1:1');
    expect(other.code).toBe(2);
    expect(other.out).toMatch(/needs --price-in and --price-out/);
    expect(existsSync(out)).toBe(false);
  });
});

describe('the voice read is scored over requests, never over single judgments', () => {
  /** A human/ folder: `requests` per author, five readers, each choosing the voice side with probability `pref`. */
  function panel(requests: number, pref: number, seed: number): string {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-voice-'));
    const rand = mulberry32(seed);
    const key: Record<string, Record<string, Record<string, string>>> = {};
    for (const author of ['author-a', 'author-b']) {
      key[author] = {};
      for (let r = 1; r <= 5; r++) {
        key[author][r] = {}; let page = '';
        for (let i = 1; i <= requests; i++) {
          const id = `${author}-${String(i).padStart(2, '0')}`; const voice = rand() < 0.5 ? 'A' : 'B';
          key[author][r][id] = voice;
          page += `## ${id}\n\nANSWER ${id}: ${rand() < pref ? voice : voice === 'A' ? 'B' : 'A'}\n\n`;
        }
        writeFileSync(join(dir, `${author}-reader-${r}.md`), page);
      }
    }
    writeFileSync(join(dir, 'KEY-open-after-reading.json'), JSON.stringify(key));
    return dir;
  }
  const score = (dir: string): { verdict: string; requests: number; pooled: number; sentence: string } => JSON.parse(node('studies/harness/voice-pass-score.mjs', '--dir', dir).out) as never;
  it('a clear preference over thirty requests passes, with the share in the sentence', () => {
    const r = score(panel(15, 0.8, 1));
    expect(r).toMatchObject({ verdict: 'PASS', requests: 30 });
    expect(r.sentence).toMatch(/^For 2 authors, blind readers preferred the voice pass to the author's pieces pasted into the prompt, \d\d% of the time\.$/);
  });
  it('no preference fails', () => {
    expect(score(panel(15, 0.5, 2))).toMatchObject({ verdict: 'FAIL', sentence: 'For these 2 authors, the in-context voice pass did not read more like the author than pasted examples.' });
  });
  it('too few requests with every reader\'s answer is UNRESOLVED, whatever the preference', () => {
    expect(score(panel(10, 0.9, 3)).verdict).toBe('UNRESOLVED');
  });
});
