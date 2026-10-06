// tests/atelier-closing-harness.test.ts — THE CLOSING TEST'S OWN INSTRUMENTS, HELD BOTH WAYS, OFFLINE.
//
// The analysis that reads a closing claim is fixed before the run, so it is tested like product code: an arm that
// is truly equal passes, an arm that is clearly worse fails, a clear loss trips a guard, and too few cases is
// UNRESOLVED. The benchmark runner refuses to start when it could not see what a call costs.
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, symlinkSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
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
    verify: 'verify.jsonl', human: 'human.jsonl', depthCases: Array.from({ length: cases }, (_, c) => `c${c}`).filter((_, c) => c % 5 === 0), minUnits: 140, margins: { handwritten: -0.2 } }));
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
    expect(r.sentence).toMatch(/the Atelier plug-in built from 20 examples scored higher overall than the hand-written skill \(\+0\.\d+, lower bound \+0\.\d+\)/);
  });
  it('with the bar sealed at "scores higher", an equal arm fails and a clearly better one passes', () => {
    const sealed = (config: string): string => { const c = JSON.parse(readFileSync(config, 'utf8')) as { margins?: object }; c.margins = { handwritten: 0 }; writeFileSync(config, JSON.stringify(c)); return config; };
    const equal = analyse(sealed(fixture(300, 0, { candidate: 0.1, handwritten: 0.1 })));
    expect(equal.verdict).toBe('FAIL');
    expect(equal.sentence).toMatch(/failed "scores higher than the hand-written skill": .*where the bar was > 0\./);
    const better = analyse(sealed(fixture(300, 0.25, { candidate: 0.1, handwritten: 0.1 })));
    expect(better.verdict).toBe('PASS');
    expect(better.sentence).toMatch(/scored higher overall than the hand-written skill \(\+0\.\d+, lower bound \+0\.\d+\)/);
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

/** A script run with no key in its environment, stdout and stderr both kept. */
const bare = (script: string, args: readonly string[], env: Record<string, string> = {}): { code: number; out: string; err: string } => {
  const r = spawnSync('node', [resolve(script), ...args], { encoding: 'utf8', env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC|OPENAI)_/.test(k))), ...env } });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
};
/** What node prints for an error nobody caught: a line of the stack. A message for a tester never holds one. */
const STACK = /^\s+at .*\(?(node:|file:\/\/)/m;

describe('the closing analysis says what it could not read, names the arm it read, and never ends as if it had written', () => {
  const edit = (config: string, change: (c: Record<string, unknown>) => void): string => { const c = JSON.parse(readFileSync(config, 'utf8')) as Record<string, unknown>; change(c); writeFileSync(config, JSON.stringify(c)); return config; };
  const config = (): string => fixture(150, 0, { candidate: 0.1, handwritten: 0.1 });
  it('a file the config names that is not there is one line and exit 2, for every kind of file', () => {
    for (const field of ['verify', 'human']) {
      const r = bare('bench/compare/closing-quality.mjs', ['--config', edit(config(), (c) => { c[field] = 'not-there.jsonl'; })]);
      expect(r.code, field).toBe(2);
      expect(r.err, field).toMatch(/^closing-quality: the config names not-there\.jsonl, and it cannot be read \(ENOENT\)\. Paths are relative to the config \(.*\); check it and run again\. Nothing was written\.\n$/);
      expect(r.err, field).not.toMatch(STACK);
      expect(r.out, field).toBe('');
    }
    const scores = bare('bench/compare/closing-quality.mjs', ['--config', edit(config(), (c) => { c.scores = ['scores.jsonl', 'second-session.jsonl']; })]);
    expect(scores.code).toBe(2);
    expect(scores.err).toMatch(/the config names second-session\.jsonl, and it cannot be read \(ENOENT\)/);
    const none = bare('bench/compare/closing-quality.mjs', ['--config', join(tmpdir(), 'no-such-config.json')]);
    expect(none.code).toBe(2);
    expect(none.err).toMatch(/^closing-quality: the config .*no-such-config\.json cannot be read \(ENOENT\)\. Nothing was written\.\n$/);
    const broken = edit(config(), (c) => { c.verify = 'broken.jsonl'; });
    writeFileSync(join(broken, '..', 'broken.jsonl'), '{"case_id": "c0"\n');
    const notJson = bare('bench/compare/closing-quality.mjs', ['--config', broken, '--out', join(broken, '..', 'result.json')]);
    expect(notJson.code).toBe(2);
    expect(notJson.err).toMatch(/the config names broken\.jsonl, and it cannot be read \(/);
    expect(notJson.err).not.toMatch(STACK);
    expect(existsSync(join(broken, '..', 'result.json'))).toBe(false);
  });
  it('--disagreements without the two reads is refused, saying what to add; with them the file is written', () => {
    const c = config(); const file = join(c, '..', 'disagreements.jsonl');
    const r = bare('bench/compare/closing-quality.mjs', ['--config', c, '--disagreements', file, '--out', join(c, '..', 'result.json')]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/--disagreements writes the answers on which two judge reads disagree, and the config has no "reads": \[fileA, fileB\] to compare\. Add the two reads to .*config\.json, or leave --disagreements out\. Nothing was written\./);
    expect(existsSync(file)).toBe(false);
    expect(existsSync(join(c, '..', 'result.json'))).toBe(false);
    // a second read that differs on one answer's blocker: that answer is what a person is handed
    const first = readFileSync(join(c, '..', 'scores.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { blocker: boolean });
    writeFileSync(join(c, '..', 'second.jsonl'), jsonl(first.map((x, i) => (i === 4 ? { ...x, blocker: !x.blocker } : x))));
    const ok = bare('bench/compare/closing-quality.mjs', ['--config', edit(c, (x) => { x.reads = ['scores.jsonl', 'second.jsonl']; }), '--disagreements', file]);
    expect(ok.code, ok.err).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe('{"case_id":"c1","trial":1,"condition":"hand"}\n');
  });
  it('the sentence names the arm the config says is the candidate: the plug-in unless it is the runtime', () => {
    const runtime = analyse(edit(fixture(150, 0.4, { candidate: 0.1, handwritten: 0.1 }), (c) => { c.arm = 'runtime'; }));
    expect(runtime.verdict).toBe('PASS');
    expect(runtime.sentence).toMatch(/^On 150 coding tasks it never saw, the Atelier runtime built from 20 examples scored higher overall than the hand-written skill/);
    expect(runtime.sentence).not.toMatch(/plug-in/);
    const worse = analyse(edit(fixture(150, -0.4, { candidate: 0.1, handwritten: 0.1 }), (c) => { c.arm = 'runtime'; }));
    expect(worse.sentence).toMatch(/the Atelier runtime built from 20 examples failed "not worse than the hand-written skill"/);
    expect(analyse(edit(config(), (c) => { c.arm = 'plug-in'; })).sentence).toMatch(/the Atelier plug-in built from 20 examples/);
    // writing: "an Atelier skill" when the config does not say, the arm when it does
    expect(analyse(edit(config(), (c) => { c.claim = 'A-w'; })).sentence).toMatch(/^On 150 writing briefs it never saw, an Atelier skill built from 20 pieces/);
    expect(analyse(edit(config(), (c) => { c.claim = 'A-w'; c.arm = 'runtime'; })).sentence).toMatch(/^On 150 writing briefs it never saw, an Atelier runtime built from 20 pieces/);
    const bad = bare('bench/compare/closing-quality.mjs', ['--config', edit(config(), (c) => { c.arm = 'plugin'; })]);
    expect(bad.code).toBe(2);
    expect(bad.err).toMatch(/the config's "arm" is "plugin": it is "plug-in" or "runtime"/);
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
  it('with a second judge, agreement under 0.80 of the planted answers is UNRESOLVED; at 0.80 or more the first judge\'s reading stands', () => {
    run(2);
    const second = (disagreeOn: number, wrongFirst = 2): { verdict: string; agreement: { share: number; n: number } } => {
      // the second judge calls the first `disagreeOn` answers the other way from the first judge
      const first = rows(wrongFirst) as Record<string, unknown>[];
      writeFileSync(join(dir, `s${wrongFirst}.jsonl`), jsonl(first));
      writeFileSync(join(dir, `second${disagreeOn}.jsonl`), jsonl(first.map((r, i) => (i < disagreeOn ? { ...r, ...Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, r[k] === 2 ? 4.5 : 2])) } : r))));
      return JSON.parse(node('bench/compare/judge-qualification.mjs', '--scores', join(dir, `s${wrongFirst}.jsonl`), '--second', join(dir, `second${disagreeOn}.jsonl`), '--labels', join(dir, 'labels.jsonl'), '--weights', JSON.stringify(WEIGHTS), '--threshold', '3.5').out) as never;
    };
    expect(second(8)).toMatchObject({ verdict: 'QUALIFIED', agreement: { share: 0.8, n: 40 } });
    const apart = second(9);
    expect(apart.agreement.share).toBe(0.775);
    expect(apart.verdict).toBe('UNRESOLVED: the two judges agree on 0.775 of the 40 planted answers both judged, under the 0.80 the pre-registration sets. The claim cannot be read with this pair of judges');
    // a first judge that is not qualified is still said so when the two agree
    expect(second(0, 5).verdict).toBe('NOT QUALIFIED');
    expect(second(12, 5).verdict).toMatch(/^UNRESOLVED: the two judges agree on 0\.7 of the 40/);
  });
  it('a score row that lacks a finite number for a dimension stops the run, naming the row: it is never a correct "bad" call', () => {
    // A judge that calls every answer good: every good answer right, every bad one wrong. NOT QUALIFIED.
    const lenient = labels.map((l) => ({ case_id: l.case_id, trial: 1, condition: 'x', ...Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 4.5])), blocker: false })) as Record<string, unknown>[];
    const judge = (name: string, rowsOf: object[]): { code: number; out: string } => {
      writeFileSync(join(dir, name), jsonl(rowsOf));
      return node('bench/compare/judge-qualification.mjs', '--scores', join(dir, name), '--labels', join(dir, 'labels.jsonl'), '--weights', JSON.stringify(WEIGHTS), '--threshold', '3.5');
    };
    const whole = judge('lenient.jsonl', lenient);
    expect(whole.code).toBe(0);
    expect(JSON.parse(whole.out)).toMatchObject({ verdict: 'NOT QUALIFIED', judge: { goodCalledGood: { share: 1 }, badCalledBad: { share: 0 } } });
    // The same judge with the rows of its bad answers broken: each used to weigh as "not a number", which is under
    // any threshold, so all twenty counted as called bad and the judge qualified on them.
    const broken: [string, (r: Record<string, unknown>) => object, RegExp][] = [
      ['a dimension left out', ({ correctness: _c, ...r }) => r, /broken0\.jsonl: row 21 \(p20, x, trial 1\) has no value for "correctness", where --weights needs a finite number for every dimension\. The row was not counted and no verdict was given: have the judge score that answer again/],
      ['a dimension as text', (r) => ({ ...r, safety: 'high' }), /row 21 \(p20, x, trial 1\) has "high" for "safety"/],
      ['a dimension that is null', (r) => ({ ...r, concision: null }), /row 21 \(p20, x, trial 1\) has null for "concision"/],
    ];
    broken.forEach(([what, edit, why], n) => {
      const r = judge(`broken${n}.jsonl`, lenient.map((row, i) => (i >= 20 ? edit(row) : row)));
      expect(r.code, what).toBe(2);
      expect(r.out, what).toMatch(why);
      expect(r.out, what).not.toMatch(/QUALIFIED/);
    });
    // a broken row for an answer nobody labelled is not read, as before
    expect(JSON.parse(judge('stray.jsonl', [...lenient, { case_id: 'unlabelled', trial: 1, condition: 'x' }]).out)).toMatchObject({ verdict: 'NOT QUALIFIED' });
    // weights or a threshold that are not numbers are refused too, instead of making every score "not a number"
    expect(node('bench/compare/judge-qualification.mjs', '--scores', join(dir, 'lenient.jsonl'), '--labels', join(dir, 'labels.jsonl'), '--weights', '{"correctness":"heavy"}', '--threshold', '3.5')).toMatchObject({ code: 2 });
    expect(node('bench/compare/judge-qualification.mjs', '--scores', join(dir, 'lenient.jsonl'), '--labels', join(dir, 'labels.jsonl'), '--weights', JSON.stringify(WEIGHTS), '--threshold', 'high').out).toMatch(/--threshold is "high": it must be a number/);
  });
});

describe('the failure-mode reader is qualified on answers planted good and planted bad', () => {
  type Flag = boolean | null;
  interface Label { case_id: string; condition: string; label: string; mode?: string }
  interface Result { verdict: string; reader: { goodCalledGood: { k: number; n: number; share: number }; badCalledBad: { k: number; n: number; share: number }; noRow: number; unreadChecks: number; unlabelledRows: number; qualified: boolean }; byMode: Record<string, { planted: number; flagged: number; share: number }> }
  const MODES = ['F1', 'F2', 'F3', 'F4'];
  /** Twenty good answers, then twenty bad ones planted five to a mode. */
  const LABELS: Label[] = Array.from({ length: 40 }, (_, i) => (i < 20 ? { case_id: `p${i}`, condition: 'planted', label: 'good' } : { case_id: `p${i}`, condition: 'planted', label: 'bad', mode: MODES[i % 4] }));
  const row = (case_id: string, flags: Flag[]): object => ({ case_id, trial: 1, condition: 'planted', F1: flags[0], F2: flags[1], F3: flags[2], F4: flags[3], failed: flags.some((x) => x === true), unread: flags.filter((x) => x === null).length, by: { F1: 'code', F2: 'code', F3: 'reader', F4: 'code' } });
  /** The reader's rows: a good answer flagged nowhere and a bad one on its own mode, except the first `wrongGood` good answers (flagged F3) and the first `wrongBad` bad ones (flagged nowhere). */
  const reading = (wrongGood: number, wrongBad: number): object[] => LABELS.map((l, i) => row(l.case_id, l.label === 'good' ? [false, false, i < wrongGood, false] : MODES.map((m) => m === l.mode && i - 20 >= wrongBad)));
  let n = 0;
  const qualify = (modes: object[], labels: object[] = LABELS): { code: number; out: string; result: () => Result } => {
    const dir = mkdtempSync(join(tmpdir(), `atelier-modes-${n++}-`));
    writeFileSync(join(dir, 'modes.jsonl'), jsonl(modes)); writeFileSync(join(dir, 'labels.jsonl'), jsonl(labels));
    const r = nodeAll('bench/compare/modes-qualification.mjs', '--modes', join(dir, 'modes.jsonl'), '--labels', join(dir, 'labels.jsonl'), '--out', join(dir, 'result.json'));
    return { ...r, result: () => JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')) as Result };
  };
  const refusedBy = (r: { code: number; out: string }, why: RegExp): void => { expect(r.code, r.out).toBe(2); expect(r.out).toMatch(why); expect(r.out).not.toMatch(/"verdict"/); };

  it('0.85 of each class called right qualifies, at the bar exactly; one fewer of either class does not', () => {
    const at = qualify(reading(3, 3));
    expect(at.code, at.out).toBe(0);
    expect(at.result()).toMatchObject({ verdict: 'QUALIFIED', reader: { goodCalledGood: { k: 17, n: 20, share: 0.85 }, badCalledBad: { k: 17, n: 20, share: 0.85 }, noRow: 0, unreadChecks: 0, qualified: true } });
    expect(at.out).toMatch(/^QUALIFIED: 17 of 20 good answers and 17 of 20 bad answers called right\. The reader's rows may be used\.$/m);
    expect(qualify(reading(4, 0)).result()).toMatchObject({ verdict: 'NOT QUALIFIED', reader: { goodCalledGood: { share: 0.8 }, badCalledBad: { share: 1 }, qualified: false } });
    const blind = qualify(reading(0, 4));
    expect(blind.result().verdict).toBe('NOT QUALIFIED');
    expect(blind.out).toMatch(/^NOT QUALIFIED: 20 of 20 good answers and 16 of 20 bad answers called right, where 0\.85 of each is needed\. The rows of this reader are not used/m);
  });
  it('per mode named in the labels: how many answers planted with it had that mode\'s own flag true', () => {
    // every bad answer is caught, and the five planted as F3 are caught as F1: called right, with F3 never raised
    const modes = LABELS.map((l) => row(l.case_id, l.label === 'good' ? [false, false, false, false] : MODES.map((m) => (l.mode === 'F3' ? m === 'F1' : m === l.mode))));
    const r = qualify(modes).result();
    expect(r.verdict).toBe('QUALIFIED');
    expect(r.byMode).toEqual({ F1: { planted: 5, flagged: 5, share: 1 }, F2: { planted: 5, flagged: 5, share: 1 }, F3: { planted: 5, flagged: 0, share: 0 }, F4: { planted: 5, flagged: 5, share: 1 } });
    // a mode no label names is not reported
    expect(Object.keys(qualify(reading(0, 0), LABELS.map((l) => (l.mode === 'F4' ? { ...l, mode: 'F1' } : l))).result().byMode)).toEqual(['F1', 'F2', 'F3']);
  });
  it('a reading that is not whole is UNRESOLVED, never a verdict: too few of a class, an answer with no row, a check nobody read', () => {
    const few = qualify(reading(0, 0).slice(0, 39), LABELS.slice(0, 39));
    expect(few.code, few.out).toBe(0);
    expect(few.result().verdict).toMatch(/^UNRESOLVED: fewer than 20 answers of a class were read \(20 good, 19 bad\)\. Run bench\/compare\/failure-modes\.mjs again .*and plant at least 20 good and 20 bad answers; then run this again$/);
    const short = qualify(reading(0, 0).slice(1)).result();
    expect(short.verdict).toMatch(/^UNRESOLVED: 1 labelled answer\(s\) have no row in .*modes\.jsonl \(first: p0 \(planted\)\); fewer than 20 answers of a class were read \(19 good, 20 bad\)/);
    expect(short.reader).toMatchObject({ noRow: 1, qualified: false });
    // 21 good answers, one with a check nobody read: the classes are large enough, the counts would qualify, and it is still not read
    const labels = [...LABELS, { case_id: 'p40', condition: 'planted', label: 'good' }];
    const unread = qualify([...reading(0, 0), row('p40', [false, false, null, false])], labels).result();
    expect(unread.verdict).toMatch(/^UNRESOLVED: 1 labelled answer\(s\) have a check nobody read \(first: p40 \(planted\)\)\. Run bench\/compare\/failure-modes\.mjs again on the planted answers, with a reader, until every one has a row with every check read; then run this again$/);
    expect(unread.reader).toMatchObject({ goodCalledGood: { k: 21, n: 21 }, unreadChecks: 1, qualified: false });
    // a row for an answer nobody labelled is counted apart and decides nothing
    expect(qualify([...reading(0, 0), row('stray', [true, false, false, false])]).result()).toMatchObject({ verdict: 'QUALIFIED', reader: { unlabelledRows: 1 } });
  });
  it('a label or a row that is not what it should be stops the run (exit 2), naming it', () => {
    const labels = (edit: (l: Label[]) => object[]): object[] => edit(LABELS.map((l) => ({ ...l })));
    refusedBy(qualify(reading(0, 0), labels((l) => { l[3].label = 'fine'; return l; })), /labels\.jsonl: row 4 \(p3, planted\) has label "fine": it must be "good" or "bad"/);
    refusedBy(qualify(reading(0, 0), labels((l) => [...l, l[5]])), /labels\.jsonl: row 41: p5 \(planted\) is labelled twice\. Each planted answer has one label: remove one of the two rows\./);
    refusedBy(qualify(reading(0, 0), labels((l) => { l[25].mode = 'F9'; return l; })), /row 26 \(p25, planted\) has mode "F9": it must be one of F1, F2, F3, F4, or left out/);
    refusedBy(qualify(reading(0, 0), labels((l) => { l[2].mode = 'F1'; return l; })), /row 3 \(p2, planted\) is labelled good and names the failure mode F1/);
    const rows = (edit: (r: Record<string, unknown>[]) => object[]): object[] => edit(reading(0, 0).map((r) => ({ ...r })));
    refusedBy(qualify(rows((r) => { r[0].F2 = 'no'; return r; })), /modes\.jsonl: row 1 \(p0, planted\) has `F2` "no", which is not true, false or null/);
    refusedBy(qualify(rows((r) => { r[30].failed = false; return r; })), /row 31 \(p30, planted\) has `failed` false, which is not what its checks F1 to F4 say/);
    refusedBy(qualify(rows((r) => { delete r[7].failed; return r; })), /row 8 \(p7, planted\) has `failed` undefined, which is not true or false/);
    refusedBy(qualify(rows((r) => { r[9].F3 = null; return r; })), /row 10 \(p9, planted\) has `unread` 0 and 1 check\(s\) that are null: the two must agree/);
    refusedBy(qualify(rows((r) => { r[4].trial = '1'; return r; })), /row 5 \(p4, planted\) has trial "1"; trials are whole numbers from 1/);
    refusedBy(qualify(rows((r) => [...r, { ...r[12], trial: 2 }])), /row 41 \(p12, planted\) is a second row for one labelled answer \(the first is row 13\)/);
    refusedBy(qualify(rows((r) => [...r, 'not a row' as never])), /row 41 is not a row failure-modes\.mjs writes/);
    // a file that is not there, and a flag left out, say so in one line
    refusedBy(nodeAll('bench/compare/modes-qualification.mjs', '--modes', join(tmpdir(), 'no-such-modes.jsonl'), '--labels', join(tmpdir(), 'no-such-labels.jsonl')), /--labels .*no-such-labels\.jsonl: cannot be read \(ENOENT\)/);
    refusedBy(nodeAll('bench/compare/modes-qualification.mjs', '--modes', 'x'), /missing --labels\nusage: modes-qualification\.mjs --modes <modes\.jsonl> --labels <labels\.jsonl> \[--out <result\.json>\]/);
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
  it('with no key it says so in one line, with the flags of another backend, and exits 2; so does a runtime arm', () => {
    const none = bare('bench/compare/run.mjs', ['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', out]);
    expect(none.code).toBe(2);
    expect(none.err).toBe('compare: ANTHROPIC_API_KEY is not set. Set it, or name another backend: --provider openai-compatible --base-url <url> --model <id> --price-in <usd per M> --price-out <usd per M>. Nothing was spent.\n');
    writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ built: { cli: 'x', data: 'x', proj: 'x', skill: 'x' } }));
    const runtime = bare('bench/compare/run.mjs', ['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:built', '--runtimes', join(dir, 'runtimes.json'), '--out', out]);
    expect(runtime.code).toBe(2);
    expect(runtime.err).toMatch(/^compare: ANTHROPIC_API_KEY is not set, and the runtime arm "built" names no other backend\. Set it, or give the build its backend in the runtimes file: "args": \["--provider", "openai-compatible", "--base-url", "<url>", "--model", "<id>"\]\. Nothing was spent\.\n$/);
    expect(existsSync(out)).toBe(false);
  });
  it('--condition takes any label of lower-case letters, digits and hyphens, and the usage names every flag', () => {
    for (const label of ['handwritten', 'plug-in', 'gepa-2', 'baseline']) {
      // a good label gets as far as the client, which has no key
      const r = bare('bench/compare/run.mjs', ['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', out, '--condition', label]);
      expect(r.err, label).toMatch(/ANTHROPIC_API_KEY is not set/);
    }
    for (const label of ['Hand', 'plug_in', '-x', 'two words']) {
      const r = bare('bench/compare/run.mjs', ['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', out, '--condition', label]);
      expect(r.code, label).toBe(2);
      expect(r.err, label).toMatch(/is not a label: lower-case letters, digits and hyphens, starting with a letter or digit/);
    }
    const usage = bare('bench/compare/run.mjs', []);
    expect(usage.code).toBe(2);
    expect(usage.err).toBe('compare: usage: run.mjs --tasks <file> --arm none|skill:<file>|atelier-runtime:<build> --out <responses.jsonl> [--condition <label>] [--trials <n>] [--model <id>] [--max-tokens <n>] [--cap <usd>] [--per-call <usd>] [--placement system|harness] [--sealed <SEALED.json>] [--runtimes <file>] [--provider openai-compatible --base-url <url> --model <id> --price-in <usd per M> --price-out <usd per M>]\n');
  });
  it('the smoke run makes no temporary directory when --work names one', () => {
    const temp = mkdtempSync(join(tmpdir(), 'atelier-smoke-tmp-')); const work = mkdtempSync(join(tmpdir(), 'atelier-smoke-work-'));
    // it stops at the first thing it needs (a checkout that is not there); by then the old version had made its directory
    const r = bare('bench/compare/smoke/smoke.mjs', ['--work', work], { TMPDIR: temp, IHAVEADHD_DIR: '', GEPA_PYTHON: '', SKILLOPT_DIR: '', SKILLOPT_PYTHON: '' });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/smoke: set IHAVEADHD_DIR/);
    expect(readdirSync(temp)).toEqual([]);
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
  /** Rewrite every answer line of one reader's packet: `form` is given the letter the reader chose. */
  const rewrite = (dir: string, file: string, form: (letter: string, id: string) => string): void => {
    writeFileSync(join(dir, file), readFileSync(join(dir, file), 'utf8').replace(/^ANSWER ([^:\n]+): ([AB])$/gm, (_, id: string, letter: string) => form(letter, id)));
  };
  it('an answer is read in the forms readers write it: either case, in emphasis or brackets, or on the line under', () => {
    const plain = panel(15, 0.8, 1); const mixed = panel(15, 0.8, 1);
    rewrite(mixed, 'author-a-reader-1.md', (l, id) => `ANSWER ${id}: ${l.toLowerCase()}`);
    rewrite(mixed, 'author-a-reader-2.md', (l, id) => `ANSWER ${id}: **${l}**`);
    rewrite(mixed, 'author-a-reader-3.md', (l, id) => `ANSWER ${id}: (${l.toLowerCase()})`);
    rewrite(mixed, 'author-a-reader-4.md', (l, id) => `ANSWER ${id}:\n${l}`);
    rewrite(mixed, 'author-a-reader-5.md', (l, id) => `ANSWER ${id}: _${l}_, the second excerpt settles it`);
    rewrite(mixed, 'author-b-reader-1.md', (l, id) => `ANSWER ${id}:  \n  *${l.toLowerCase()}*.`);
    const r = bare('studies/harness/voice-pass-score.mjs', ['--dir', mixed]);
    expect(r.err).toBe('');
    expect(JSON.parse(r.out)).toEqual(score(plain));
    expect(JSON.parse(r.out)).toMatchObject({ verdict: 'PASS', requests: 30, unreadable: { answers: 0, of: 150 } });
  });
  it('an answer nobody could read is listed by reader and request, and the verdict is UNRESOLVED naming how many, never a smaller n', () => {
    const dir = panel(15, 0.8, 1);
    // one reader wrote a word, not a letter, on one line; another left one blank; a third wrote a sentence that starts with "a"
    rewrite(dir, 'author-a-reader-2.md', (l, id) => `ANSWER ${id}: ${id === 'author-a-03' ? 'first' : l}`);
    rewrite(dir, 'author-b-reader-4.md', (l, id) => `ANSWER ${id}: ${id === 'author-b-07' ? '' : l}`);
    rewrite(dir, 'author-b-reader-5.md', (l, id) => `ANSWER ${id}: ${id === 'author-b-07' ? 'a bit of both' : l}`);
    const r = bare('studies/harness/voice-pass-score.mjs', ['--dir', dir]);
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/^no readable answer: author-a reader 2, request author-a-03 \(no A or B could be read on its answer line\)$/m);
    expect(r.err).toMatch(/^no readable answer: author-b reader 4, request author-b-07 /m);
    expect(r.err).toMatch(/^no readable answer: author-b reader 5, request author-b-07 /m);
    expect(r.err).toMatch(/^3 of 150 answers could not be read \(3 reader packet\(s\), 2 request\(s\)\)\. The verdict is UNRESOLVED until each is "ANSWER <id>: A" or "ANSWER <id>: B"; then run the same command again\.$/m);
    const result = JSON.parse(r.out) as { verdict: string; sentence: string; requests: number; unreadable: { answers: number; list: object[] } };
    // without the three lines this panel passes on 28 requests: that is the quiet smaller n
    expect(result).toMatchObject({ verdict: 'UNRESOLVED', requests: 28, unreadable: { answers: 3 } });
    expect(result.sentence).toBe('The voice read is not scored yet: 3 of 150 answers could not be read (3 reader packet(s), 2 request(s)), and a request is never left out for an answer nobody could read. Each is listed on stderr; fix them and score again.');
    expect(result.unreadable.list[0]).toEqual({ author: 'author-a', reader: '2', request: 'author-a-03', why: 'no A or B could be read on its answer line' });
  });
  it('a packet that is not there counts for every request in it', () => {
    const dir = panel(15, 0.8, 1);
    rmSync(join(dir, 'author-b-reader-3.md'));
    const r = bare('studies/harness/voice-pass-score.mjs', ['--dir', dir]);
    expect(r.err).toMatch(/no readable answer: author-b reader 3, request author-b-01 \(author-b-reader-3\.md is not in /);
    expect(JSON.parse(r.out)).toMatchObject({ verdict: 'UNRESOLVED', unreadable: { answers: 15, of: 150 } });
  });
});

describe('the signed bar: 20% fewer failures than the hand-written skill, and clearly fewer', () => {
  /** An axis file: `cases` cases, the candidate failing `fc` of them and the hand-written skill `fh`. */
  function axis(cases: number, fc: number, fh: number, shared = fc): string {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-axis-'));
    const rows: object[] = []; const scores: object[] = [];
    for (let c = 0; c < cases; c++) {
      for (const [condition, n] of [['hand', fh], ['plugin', fc]] as const) {
        // the hand-written skill fails `shared` of the cases the candidate fails, and others of its own
        rows.push({ case_id: `c${c}`, trial: 1, condition, failed: condition === 'plugin' ? c < n : (c >= fc - shared && c < fc - shared + n) });
        scores.push({ case_id: `c${c}`, trial: 1, condition, ...Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 4])), blocker: false });
      }
    }
    writeFileSync(join(dir, 'axis.jsonl'), jsonl(rows)); writeFileSync(join(dir, 'scores.jsonl'), jsonl(scores));
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ claim: 'A', weights: WEIGHTS, scores: ['scores.jsonl'], conditions: { handwritten: 'hand', candidate: 'plugin' }, margins: { handwritten: -5 }, axes: [{ name: 'quality', file: 'axis.jsonl' }] }));
    return join(dir, 'config.json');
  }
  interface Axes { axes: string[]; endpoints: { AXES: { pass: boolean; reduction: number; candidate: number; handwritten: number }[] } }
  const run = (config: string): Axes => JSON.parse(node('bench/compare/closing-quality.mjs', '--config', config).out) as Axes;
  it('reached when the reduction is at least 20% and the difference is clearly above zero', () => {
    const r = run(axis(200, 30, 60));
    expect(r.endpoints.AXES[0]).toMatchObject({ pass: true, reduction: 0.5, candidate: 0.15, handwritten: 0.3 });
    expect(r.axes[0]).toBe('quality: 15% failed against 30% for the hand-written skill, 50% fewer (reached: the bar is 20% fewer and clearly fewer).');
  });
  it('an axis the hand-written skill never failed has nothing to reduce: not applicable when neither failed, a miss when only the candidate did', () => {
    const none = run(axis(50, 0, 0));
    expect(none.endpoints.AXES[0].pass).toBeNull();
    expect(none.axes[0]).toBe('quality: neither skill failed: nothing to reduce.');
    expect(run(axis(50, 5, 0)).endpoints.AXES[0].pass).toBe(false);
  });
  it('not reached when the reduction is under 20%, or when it is 20% and not clearly above zero', () => {
    expect(run(axis(200, 52, 60)).endpoints.AXES[0]).toMatchObject({ pass: false, reduction: 0.133 });
    // 25% fewer on forty tasks: the size cannot tell it from no difference
    const small = run(axis(40, 9, 12, 3));
    expect(small.endpoints.AXES[0]).toMatchObject({ pass: false, reduction: 0.25 });
    expect(small.axes[0]).toMatch(/25% fewer \(not reached/);
  });
});

describe('one binary check per failure mode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-modes-'));
  writeFileSync(join(dir, 'tasks.jsonl'), jsonl([{ id: 't1', prompt: 'Write the test for parseDate.', wants: 'code' }, { id: 't2', prompt: 'Give me the command to reset the branch.', wants: 'command' }, { id: 't3', prompt: 'Is the migration done?', wants: 'status' }]));
  writeFileSync(join(dir, 'responses.jsonl'), jsonl([
    { case_id: 't1', trial: 1, condition: 'a', response: 'You should cover the leap year and the empty string. Want me to write it?' },
    { case_id: 't1', trial: 1, condition: 'b', response: '```ts\nit("parses", () => expect(parseDate("2024-02-29")).toBeTruthy());\n```' },
    { case_id: 't2', trial: 1, condition: 'a', response: 'I won\'t hand over a command that rewrites history.' },
    { case_id: 't2', trial: 1, condition: 'b', response: 'I won\'t force it blindly: use `git push --force-with-lease`, which stops if someone else pushed.' },
    { case_id: 't3', trial: 1, condition: 'a', response: 'Migrations are a delicate topic and there are several things to consider first.' },
    { case_id: 't3', trial: 1, condition: 'b', response: 'Done: 3 of 3 tables migrated.' },
    { case_id: 't3', trial: 1, condition: 'c', response: null },
  ]));
  it('withholding, refusing without a safe path and action-not-first are decided by code; a strict refusal is a failed answer', () => {
    const out = join(dir, 'modes.jsonl');
    expect(node('bench/compare/failure-modes.mjs', '--responses', join(dir, 'responses.jsonl'), '--tasks', join(dir, 'tasks.jsonl'), '--out', out, '--code-only').code).toBe(0);
    const rows = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { case_id: string; condition: string; F1: boolean | null; F2: boolean; F4: boolean; failed: boolean });
    const of = (c: string, a: string): typeof rows[number] => rows.find((r) => r.case_id === c && r.condition === a)!;
    expect(of('t1', 'a')).toMatchObject({ F1: true, failed: true });
    expect(of('t1', 'b')).toMatchObject({ F1: false, failed: false });
    expect(of('t2', 'a')).toMatchObject({ F1: true, F2: true });
    expect(of('t2', 'b')).toMatchObject({ F1: false, F2: false, failed: false });
    expect(of('t3', 'a')).toMatchObject({ F4: true, failed: true });
    expect(of('t3', 'b')).toMatchObject({ F4: false });
    expect(of('t3', 'c')).toMatchObject({ F1: true, F2: true, failed: true });
  });
});

/** Like `node`, with what the script said on stderr kept when it succeeds too: a summary line is output. */
const nodeAll = (script: string, ...args: string[]): { code: number; out: string } => {
  const r = spawnSync('node', [resolve(script), ...args], { encoding: 'utf8' });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
};

// ── THE AXES DECIDE THE CLAIM, AND ONLY WHEN EACH COVERS ITS SEALED TASKS ───────────────────────────
describe('with axes given, the verdict comes from the axes alone, each held against the sealed tasks', () => {
  type Rows = Record<'quality' | 'rule anchor' | 'repeatability' | 'voice', Record<string, unknown>[]>;
  interface Opts { fail?: Partial<Record<keyof Rows, [candidate: number, handwritten: number]>>; edit?: (rows: Rows) => void; config?: (c: Record<string, unknown>) => void }
  const NAMES = ['quality', 'rule anchor', 'repeatability', 'voice'] as const;
  /**
   * Forty sealed tasks, two outputs each, three voice readers. On each axis the candidate fails the first `c` tasks
   * and the hand-written skill the first `h`; on voice a task is lost by the arm two of its three readers passed over.
   * The judge's scores put the candidate two points under the hand-written skill, so the retired endpoint P2 fails.
   */
  function sealed(o: Opts = {}): string {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-sealed-'));
    const rows: Rows = { quality: [], 'rule anchor': [], repeatability: [], voice: [] }; const scores: object[] = [];
    const of = (name: keyof Rows): [number, number] => o.fail?.[name] ?? [4, 20];
    for (let t = 0; t < 40; t++) {
      for (const [condition, arm] of [['plugin', 0], ['hand', 1]] as const) {
        for (const trial of [1, 2]) {
          rows.quality.push({ case_id: `t${t}`, trial, condition, failed: t < of('quality')[arm] });
          rows['rule anchor'].push({ case_id: `t${t}`, trial, condition, failed: t < of('rule anchor')[arm] });
          scores.push({ case_id: `t${t}`, trial, condition, ...Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, arm === 0 ? 2 : 4])), blocker: false });
        }
        rows.repeatability.push({ case_id: `t${t}`, trial: 1, condition, failed: t < of('repeatability')[arm] });
      }
      const lost = t < of('voice')[0];
      for (const reader of [1, 2, 3]) rows.voice.push({ case_id: `t${t}`, reader, chose: (reader === 3) !== lost ? 'comparator' : 'candidate' });
    }
    o.edit?.(rows);
    for (const n of NAMES) writeFileSync(join(dir, `${n.replace(' ', '-')}.jsonl`), jsonl(rows[n]));
    writeFileSync(join(dir, 'scores.jsonl'), jsonl(scores));
    writeFileSync(join(dir, 'tasks.jsonl'), jsonl(Array.from({ length: 40 }, (_, t) => ({ id: `t${t}`, prompt: 'x' }))));
    const c: Record<string, unknown> = { claim: 'A', k: 20, weights: WEIGHTS, scores: ['scores.jsonl'], conditions: { handwritten: 'hand', candidate: 'plugin' }, margins: { handwritten: 0 },
      axes: NAMES.map((name) => ({ name, file: `${name.replace(' ', '-')}.jsonl` })), requiredAxes: [...NAMES], tasks: 'tasks.jsonl', trials: 2, readers: 3 };
    o.config?.(c);
    writeFileSync(join(dir, 'config.json'), JSON.stringify(c));
    return join(dir, 'config.json');
  }
  interface Axis { axis: string; pass: boolean | null; state: string; candidate: number | null; handwritten: number | null; problem?: string }
  interface Verdict { verdict: string; sentence: string; axes: string[]; endpoints: { P2: { pass: boolean }[]; AXES: Axis[] } }
  const run = (o: Opts = {}): Verdict => JSON.parse(node('bench/compare/closing-quality.mjs', '--config', sealed(o)).out) as Verdict;
  const axisOf = (r: Verdict, name: string): Axis => r.endpoints.AXES.find((x) => x.axis === name)!;

  it('every required axis reached is a PASS though a retired endpoint is low, and the sentence is built from the axes', () => {
    const r = run();
    expect(r.endpoints.P2[0].pass).toBe(false);
    expect(r.endpoints.AXES.map((x) => x.state)).toEqual(['reached', 'reached', 'reached', 'reached']);
    expect(axisOf(r, 'voice')).toMatchObject({ candidate: 0.1, handwritten: 0.9 });
    expect(r.verdict).toBe('PASS');
    expect(r.sentence).toMatch(/^On 40 coding tasks it never saw, the Atelier plug-in built from 20 examples met the signed bar against the hand-written skill on all 4 required axes\. Quality: 10% failed against 50% for the hand-written skill, 80% fewer \(reached/);
    expect(r.sentence).not.toMatch(/scored higher|not worse overall/);
    // the same files with no axes are read on the endpoints, as before: the low endpoint fails the claim
    const before = run({ config: (c) => { delete c.axes; delete c.requiredAxes; } });
    expect(before.verdict).toBe('FAIL');
    expect(before.sentence).toMatch(/failed "scores higher than the hand-written skill"/);
  });
  it('a required axis with no file is UNRESOLVED and named; so is a config that requires none', () => {
    const r = run({ config: (c) => { c.axes = (c.axes as { name: string }[]).filter((a) => a.name !== 'voice'); } });
    expect(r.verdict).toBe('UNRESOLVED');
    expect(r.sentence).toBe('The quality comparison did not complete: the required axis "voice" is missing from `axes`. It is closed without a result.');
    expect(r.axes.at(-1)).toBe('voice: required, and not given.');
    const none = run({ config: (c) => { delete c.requiredAxes; } });
    expect(none.verdict).toBe('UNRESOLVED');
    expect(none.sentence).toMatch(/the config names no `requiredAxes`/);
    // an axis nobody requires does not decide: three required and reached is a PASS with the fourth left out
    expect(run({ config: (c) => { c.requiredAxes = ['quality', 'rule anchor', 'repeatability']; c.axes = (c.axes as { name: string }[]).filter((a) => a.name !== 'voice'); } }).verdict).toBe('PASS');
  });
  it('an axis that does not cover exactly the sealed tasks is UNRESOLVED, naming the axis and the first row at fault', () => {
    const short = run({ edit: (f) => { f.quality.splice(1, 1); } });
    expect(short.verdict).toBe('UNRESOLVED');
    expect(short.sentence).toMatch(/the quality axis does not cover its sealed tasks: 1 of 160 rows are missing \(first: t0 trial 2 for "plugin"\)/);
    expect(axisOf(short, 'quality')).toMatchObject({ state: 'not covered', pass: null, candidate: null });
    const twice = run({ edit: (f) => { f['rule anchor'].push(f['rule anchor'][0]); } });
    expect(twice.verdict).toBe('UNRESOLVED');
    expect(twice.sentence).toMatch(/the rule anchor axis does not cover its sealed tasks: a row appears twice: \{"case_id":"t0","trial":1,"condition":"plugin","failed":true\}/);
    const unknown = run({ edit: (f) => { f.repeatability.push({ case_id: 't99', trial: 1, condition: 'hand', failed: false }); } });
    expect(unknown.verdict).toBe('UNRESOLVED');
    expect(unknown.sentence).toMatch(/the repeatability axis does not cover its sealed tasks: a row is for a task that is not sealed for this axis: \{"case_id":"t99"/);
    const untyped = run({ edit: (f) => { f.quality[5].failed = 'no'; } });
    expect(untyped.verdict).toBe('UNRESOLVED');
    expect(untyped.sentence).toMatch(/the quality axis .* `failed` is not true or false/);
    const readers = run({ edit: (f) => { f.voice.pop(); } });
    expect(readers.verdict).toBe('UNRESOLVED');
    expect(readers.sentence).toMatch(/the voice axis does not cover its sealed tasks: 1 of 40 tasks do not have 3 readers' choices \(first: t39 has 2\)/);
    // with no sealed tasks to hold the files against, nothing can be called covered
    expect(run({ config: (c) => { delete c.tasks; } }).sentence).toMatch(/no readable `tasks` and whole-number `trials`/);
  });
  it('an axis read on part of the tasks names them, and is held to exactly those', () => {
    const part = Array.from({ length: 20 }, (_, t) => `t${t}`);
    const onPart = (rows: Rows): void => { rows.voice = rows.voice.filter((r) => part.includes(r.case_id as string)); };
    const voiceTasks = (c: Record<string, unknown>): void => { (c.axes as { name: string; tasks?: string[] }[]).find((a) => a.name === 'voice')!.tasks = part; };
    const r = run({ edit: onPart, config: voiceTasks });
    expect(r.verdict).toBe('PASS');
    expect(axisOf(r, 'voice')).toMatchObject({ state: 'reached', candidate: 0.2, handwritten: 0.8 });
    expect(run({ edit: onPart }).verdict).toBe('UNRESOLVED');
  });
  it('a required axis that is covered and not reached is a FAIL, with every axis in the sentence', () => {
    const r = run({ fail: { quality: [18, 20] } });
    expect(axisOf(r, 'quality')).toMatchObject({ state: 'not reached', pass: false });
    expect(r.verdict).toBe('FAIL');
    expect(r.sentence).toMatch(/did not meet the signed bar against the hand-written skill: quality not reached\. Quality: 45% failed against 50% for the hand-written skill, 10% fewer \(not reached.*Voice: 10% failed against 90%/);
  });
  it('an axis the hand-written skill never failed is not applicable only when fully covered, and then does not block a PASS', () => {
    const r = run({ fail: { quality: [0, 0] } });
    expect(axisOf(r, 'quality')).toMatchObject({ state: 'not applicable', pass: null });
    expect(r.verdict).toBe('PASS');
    expect(r.axes[0]).toBe('quality: the hand-written skill never failed on the 40 tasks, all covered: nothing to reduce, so the axis is not applicable and does not block a pass.');
    // the candidate failing where the hand-written skill never did is a miss
    expect(run({ fail: { quality: [3, 0] } }).verdict).toBe('FAIL');
    // and short of its tasks the same axis is not read at all
    const short = run({ fail: { quality: [0, 0] }, edit: (f) => { f.quality.pop(); } });
    expect(axisOf(short, 'quality').state).toBe('not covered');
    expect(short.verdict).toBe('UNRESOLVED');
  });
  it('fewer judged cases than the sealed minimum is UNRESOLVED whatever the axes say', () => {
    expect(run({ config: (c) => { c.minUnits = 30; } }).verdict).toBe('PASS');
    const r = run({ config: (c) => { c.minUnits = 280; } });
    expect(r.verdict).toBe('UNRESOLVED');
    expect(r.sentence).toMatch(/only 40 cases have every arm judged, under the minimum of 280/);
  });
});

// ── THE AXIS FILES ARE BUILT BY A SEALED SCRIPT, NOT BY HAND ────────────────────────────────────────
describe('the axis files are built from the raw readings by a rule fixed before the run', () => {
  type Row = Record<string, unknown>;
  interface Inputs { tasks: Row[]; one: Row[]; two: Row[]; modes: Row[]; resolutions: Row[]; verify: Row[] }
  type Failed = { case_id: string; trial: number; condition: string; failed: boolean }[];
  const mode = (case_id: string, trial: number, condition: string, F1: boolean): Row => ({ case_id, trial, condition, F1, F2: false, F3: false, F4: false, failed: F1, unread: 0, by: { F1: 'code', F2: 'code', F3: 'reader', F4: 'code' } });
  /** Claim A, five tasks, two outputs. The hand-written skill is clean and breaks a rule everywhere; the candidate's rows are set by `plugin`. */
  function claimA(plugin: Record<string, { blocker: [boolean, boolean][]; decided?: (boolean | null)[]; mode?: boolean[]; broken: boolean[] }>): Inputs {
    const f: Inputs = { tasks: [], one: [], two: [], modes: [], resolutions: [], verify: [] };
    for (const [id, p] of Object.entries(plugin)) {
      f.tasks.push({ id, prompt: 'x', wants: 'code' });
      for (const trial of [1, 2]) {
        const [a, b] = p.blocker[trial - 1]; const who = p.decided?.[trial - 1] ?? null;
        f.one.push({ case_id: id, trial, condition: 'plugin', blocker: a }, { case_id: id, trial, condition: 'hand', blocker: false }, { case_id: id, trial, condition: 'bare', blocker: true });
        f.two.push({ case_id: id, trial, condition: 'plugin', blocker: b }, { case_id: id, trial, condition: 'hand', blocker: false });
        if (who !== null) f.resolutions.push({ case_id: id, trial, condition: 'plugin', blocker: who });
        f.modes.push(mode(id, trial, 'plugin', p.mode?.[trial - 1] ?? false), mode(id, trial, 'hand', false));
        f.verify.push({ case_id: id, trial, condition: 'plugin', broken: p.broken[trial - 1] }, { case_id: id, trial, condition: 'hand', broken: true });
      }
    }
    return f;
  }
  const SMALL = {
    t1: { blocker: [[false, false], [false, false]] as [boolean, boolean][], broken: [false, false] },                                   // clean twice
    t2: { blocker: [[true, true], [false, false]] as [boolean, boolean][], broken: [false, false] },                                     // a blocker both reads agree on, once
    t3: { blocker: [[true, false], [false, true]] as [boolean, boolean][], decided: [true, false], broken: [false, false] },             // the reads disagree: the person decides
    t4: { blocker: [[false, false], [false, false]] as [boolean, boolean][], mode: [true, true], broken: [true, true] },                 // a named failure mode alone, both times
    t5: { blocker: [[false, false], [false, false]] as [boolean, boolean][], broken: [true, false] },                                    // a rule broken once
  };
  /** Writes the inputs and the config, runs the script. `out` is beside the inputs unless given. */
  function build(f: Inputs, more: Record<string, unknown> = {}, outOf: (dir: string) => string = (dir) => join(dir, 'axes')): { code: number; out: string; dir: string; read: (file: string, arm: string) => boolean[] } {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-axes-'));
    for (const [name, rows] of Object.entries(f)) writeFileSync(join(dir, `${name}.jsonl`), jsonl(rows as Row[]));
    const claim = more.claim ?? 'A';
    writeFileSync(join(dir, 'axes.json'), JSON.stringify({ claim, tasks: 'tasks.jsonl', trials: 2, candidate: 'plugin', handwritten: 'hand', others: ['bare'], reads: ['one.jsonl', 'two.jsonl'], verify: 'verify.jsonl',
      ...(claim === 'A' ? { modes: 'modes.jsonl', resolutions: 'resolutions.jsonl' } : { rubric: resolve('bench/compare/rubrics/stop-slop.json') }), ...more }));
    const r = nodeAll('bench/compare/axes.mjs', '--config', join(dir, 'axes.json'), '--out', outOf(dir));
    const read = (file: string, arm: string): boolean[] => (readFileSync(join(outOf(dir), file), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Failed[number])).filter((x) => x.condition === arm).map((x) => x.failed);
    return { ...r, dir, read };
  }
  const refused = (r: { code: number; out: string; dir: string }, why: RegExp): void => {
    expect(r.code, r.out).toBe(2);
    expect(r.out).toMatch(why);
    for (const file of ['quality.jsonl', 'rule-anchor.jsonl', 'repeatability.jsonl']) expect(existsSync(join(r.dir, 'axes', file))).toBe(false);
  };

  it('claim A: an agreed blocker, a disagreement a person decided, and a named failure mode alone each fail quality', () => {
    const r = build(claimA(SMALL));
    expect(r.code, r.out).toBe(0);
    //                                             t1            t2           t3           t4          t5
    expect(r.read('quality.jsonl', 'plugin')).toEqual([false, false, true, false, true, false, true, true, false, false]);
    expect(r.read('quality.jsonl', 'hand')).toEqual(Array.from({ length: 10 }, () => false));
    expect(r.read('rule-anchor.jsonl', 'plugin')).toEqual([false, false, false, false, false, false, true, true, true, false]);
    expect(r.read('rule-anchor.jsonl', 'hand')).toEqual(Array.from({ length: 10 }, () => true));
    expect(r.out).toMatch(/quality: "plugin" 4 of 10 answers failed, "hand" 0 of 10 answers failed · 2 of 20 blockers decided by a person/);
    expect(r.out).toMatch(/voice is not built here/);
  });
  it('repeatability fails exactly the tasks whose two outputs differ, on quality or on the rule verdict', () => {
    const r = build(claimA(SMALL));
    // t2 and t3 differ on quality, t5 on the rule; t4 fails both times and is repeated
    expect(r.read('repeatability.jsonl', 'plugin')).toEqual([false, true, true, false, true]);
    expect(r.read('repeatability.jsonl', 'hand')).toEqual([false, false, false, false, false]);
    // two outputs that each break a rule, and not the same rule, differ on a rule's verdict
    const f = claimA(SMALL);
    for (const v of f.verify) v.rules = v.broken === true ? [v.condition === 'plugin' && v.case_id === 't4' ? `R${String(v.trial)}` : 'R1'] : [];
    expect(build(f).read('repeatability.jsonl', 'plugin')).toEqual([false, true, true, true, true]);
  });
  it('claim A-w: a piece under the rubric\'s line on both reads fails quality; under it on one read does not', () => {
    const f = claimA({ t1: SMALL.t1, t2: SMALL.t1 });
    const scored = (rows: Row[], totals: Record<string, number>): Row[] => rows.filter((r) => r.condition !== 'bare').map(({ blocker: _blocker, ...r }) => {
      const total = r.condition === 'plugin' ? totals[`${String(r.case_id)}.${String(r.trial)}`] : 40;
      return { ...r, Directness: total - 28, Rhythm: 7, Trust: 7, Authenticity: 7, Density: 7 };
    });
    f.one = scored(f.one, { 't1.1': 30, 't1.2': 30, 't2.1': 34, 't2.2': 35 });
    f.two = scored(f.two, { 't1.1': 32, 't1.2': 36, 't2.1': 34, 't2.2': 34 });
    const r = build(f, { claim: 'A-w' });
    expect(r.code, r.out).toBe(0);
    // t1: under 35 twice, then under on one read only. t2: 34 and 34, then exactly 35 on one read
    expect(r.read('quality.jsonl', 'plugin')).toEqual([true, false, true, false]);
    expect(r.read('quality.jsonl', 'hand')).toEqual([false, false, false, false]);
    // in writing a brief's pieces are held to the rule verdict alone: these differ on quality and on no rule
    expect(r.read('repeatability.jsonl', 'plugin')).toEqual([false, false]);
    const unscored = claimA({ t1: SMALL.t1 });
    refused(build(unscored, { claim: 'A-w' }), /judge read 1 one\.jsonl: t1 trial 1 \(plugin\) has no number for "Directness"/);
  });
  it('input that is not whole is refused, naming the row, and nothing is written', () => {
    const drop = (rows: Row[], id: string, trial: number, arm: string): Row[] => rows.filter((r) => !(r.case_id === id && r.trial === trial && r.condition === arm));
    const f = (edit: (x: Inputs) => void): Inputs => { const x = claimA(SMALL); edit(x); return x; };
    refused(build(f((x) => { x.verify = drop(x.verify, 't2', 2, 'plugin'); })), /verify verify\.jsonl: t2 trial 2 is missing for "plugin"/);
    refused(build(f((x) => { x.one = drop(x.one, 't4', 1, 'hand'); })), /judge read 1 one\.jsonl: t4 trial 1 is missing for "hand"/);
    refused(build(f((x) => { x.modes.push(x.modes[0]); })), /failure modes modes\.jsonl: t1 trial 1 \(plugin\) appears twice/);
    refused(build(f((x) => { x.resolutions = drop(x.resolutions, 't3', 2, 'plugin'); })), /t3 trial 2 \(plugin\): the two judge reads disagree on the blocker and resolutions\.jsonl has no row for it/);
    refused(build(f((x) => { x.resolutions.push({ case_id: 't1', trial: 1, condition: 'plugin', blocker: true }); })), /t1 trial 1 \(plugin\) is resolved, and the two judge reads agree/);
    refused(build(f((x) => { x.verify[0].broken = 'yes'; })), /verify verify\.jsonl: t1 trial 1 \(plugin\) has `broken` "yes", which is not true or false/);
    refused(build(f((x) => { x.two.push({ case_id: 't9', trial: 1, condition: 'hand', blocker: false }); })), /"t9", which is not a task of tasks\.jsonl/);
    refused(build(f((x) => { x.modes[0] = { ...x.modes[0], F3: null, unread: 1 }; })), /t1 trial 1 \(plugin\) has a check that nobody read/);
    // "bare" is in the judge's file: it is passed over only because the config lists it
    refused(build(claimA(SMALL), { others: [] }), /condition "bare", which is neither arm \("plugin", "hand"\) nor listed in "others"/);
  });
  it('--out may not be the inputs\' directory, nor hold an input', () => {
    const own = build(claimA(SMALL), {}, (dir) => dir);
    expect(own.code).toBe(2);
    expect(own.out).toMatch(/--out must be a directory of its own/);
    expect(existsSync(join(own.dir, 'quality.jsonl'))).toBe(false);
    const dir = mkdtempSync(join(tmpdir(), 'atelier-axes-in-'));
    mkdirSync(join(dir, 'in')); mkdirSync(join(dir, 'out'));
    const f = claimA(SMALL);
    for (const [name, rows] of Object.entries(f)) writeFileSync(join(dir, name === 'verify' ? 'out' : 'in', `${name}.jsonl`), jsonl(rows as Row[]));
    writeFileSync(join(dir, 'in', 'axes.json'), JSON.stringify({ claim: 'A', tasks: 'tasks.jsonl', trials: 2, candidate: 'plugin', handwritten: 'hand', others: ['bare'], reads: ['one.jsonl', 'two.jsonl'], modes: 'modes.jsonl', resolutions: 'resolutions.jsonl', verify: '../out/verify.jsonl' }));
    const held = node('bench/compare/axes.mjs', '--config', join(dir, 'in', 'axes.json'), '--out', join(dir, 'out'));
    expect(held.code).toBe(2);
    expect(held.out).toMatch(/\.\.\/out\/verify\.jsonl is inside --out/);
    expect(existsSync(join(dir, 'out', 'verify.jsonl'))).toBe(true);
  });
  it('--out that is a link to the inputs\' folder is that folder: refused, and every input is left byte for byte', () => {
    // The tester's case: the judge read is called quality.jsonl, which is also a file this script writes. Through a
    // link the two path strings differ, the folder is one, and the read was replaced by the axis file.
    const dir = mkdtempSync(join(tmpdir(), 'atelier-axes-link-'));
    mkdirSync(join(dir, 'in')); mkdirSync(join(dir, 'elsewhere'));
    const f = claimA(SMALL);
    const files: Record<string, string> = { 'tasks.jsonl': jsonl(f.tasks), 'quality.jsonl': jsonl(f.one), 'two.jsonl': jsonl(f.two), 'modes.jsonl': jsonl(f.modes), 'resolutions.jsonl': jsonl(f.resolutions), 'verify.jsonl': jsonl(f.verify) };
    files['axes.json'] = JSON.stringify({ claim: 'A', tasks: 'tasks.jsonl', trials: 2, candidate: 'plugin', handwritten: 'hand', others: ['bare'], reads: ['quality.jsonl', 'two.jsonl'], modes: 'modes.jsonl', resolutions: 'resolutions.jsonl', verify: 'verify.jsonl' });
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'in', name), text);
    const unchanged = (): void => {
      expect(readdirSync(join(dir, 'in')).sort()).toEqual(Object.keys(files).sort());
      for (const [name, text] of Object.entries(files)) expect(readFileSync(join(dir, 'in', name), 'utf8'), name).toBe(text);
    };
    symlinkSync(join(dir, 'in'), join(dir, 'out'), 'dir');
    const linked = node('bench/compare/axes.mjs', '--config', join(dir, 'in', 'axes.json'), '--out', join(dir, 'out'));
    expect(linked.code, linked.out).toBe(2);
    expect(linked.out).toMatch(/--out must be a directory of its own \(through a link, --out is .*in\): this script clears and rewrites what it finds there.* Name a new directory/);
    unchanged();
    // a link to a folder above the inputs holds them too
    symlinkSync(dir, join(dir, 'elsewhere', 'up'), 'dir');
    expect(node('bench/compare/axes.mjs', '--config', join(dir, 'in', 'axes.json'), '--out', join(dir, 'elsewhere', 'up')).code).toBe(2);
    unchanged();
    // an input reached through a link is where it really is: here, inside --out
    mkdirSync(join(dir, 'axes'));
    writeFileSync(join(dir, 'axes', 'verify.jsonl'), files['verify.jsonl']);
    symlinkSync(join(dir, 'axes'), join(dir, 'in', 'kept'), 'dir');
    writeFileSync(join(dir, 'in', 'axes2.json'), files['axes.json'].replace('"verify":"verify.jsonl"', '"verify":"kept/verify.jsonl"'));
    const through = node('bench/compare/axes.mjs', '--config', join(dir, 'in', 'axes2.json'), '--out', join(dir, 'axes'));
    expect(through.code, through.out).toBe(2);
    expect(through.out).toMatch(/kept\/verify\.jsonl is inside --out(?: \(through a link[^)]*\))?, which this script clears and rewrites/);
    expect(readFileSync(join(dir, 'axes', 'verify.jsonl'), 'utf8')).toBe(files['verify.jsonl']);
    // an output name that is a link to an input kept elsewhere would be written through to it
    mkdirSync(join(dir, 'axes3'));
    symlinkSync(join(dir, 'in', 'quality.jsonl'), join(dir, 'axes3', 'quality.jsonl'), 'file');
    const name = node('bench/compare/axes.mjs', '--config', join(dir, 'in', 'axes.json'), '--out', join(dir, 'axes3'));
    expect(name.code, name.out).toBe(2);
    expect(name.out).toMatch(/quality\.jsonl is .*in\/quality\.jsonl, which is also one of the files this script writes in --out(?: \(through a link[^)]*\))?\. Nothing was written\. Name another --out\./);
    expect(readFileSync(join(dir, 'in', 'quality.jsonl'), 'utf8')).toBe(files['quality.jsonl']);
    // and a link to a folder of its own is a folder of its own: the run is made, and the inputs are as they were
    mkdirSync(join(dir, 'real-out'));
    symlinkSync(join(dir, 'real-out'), join(dir, 'elsewhere', 'fine'), 'dir');
    const fine = node('bench/compare/axes.mjs', '--config', join(dir, 'in', 'axes.json'), '--out', join(dir, 'elsewhere', 'fine'));
    expect(fine.code, fine.out).toBe(0);
    expect(readdirSync(join(dir, 'real-out')).sort()).toEqual(['quality.jsonl', 'repeatability.jsonl', 'rule-anchor.jsonl']);
    expect(readFileSync(join(dir, 'in', 'quality.jsonl'), 'utf8')).toBe(files['quality.jsonl']);
  });
  it('under strict delivery, a task delivered once and refused once is not repeated, whatever its verdicts; refused twice it is in one state', () => {
    const clean: [boolean, boolean][] = [[false, false], [false, false]];
    // every task of the candidate fails its named failure mode and breaks a rule on both outputs: alike on every verdict
    const f = claimA({ t1: { blocker: clean, mode: [true, true], broken: [true, true] }, t2: { blocker: clean, mode: [true, true], broken: [true, true] }, t3: { blocker: clean, mode: [true, true], broken: [true, true] }, t4: { blocker: clean, broken: [false, false] } });
    const refuse = (id: string, trial: number): void => {
      Object.assign(f.verify.find((r) => r.case_id === id && r.trial === trial && r.condition === 'plugin')!, { broken: true, delivered: false });
      // the benchmark's scorer skips a refusal: the judge reads hold no row for it
      f.one = f.one.filter((r) => !(r.case_id === id && r.trial === trial && r.condition === 'plugin'));
      f.two = f.two.filter((r) => !(r.case_id === id && r.trial === trial && r.condition === 'plugin'));
    };
    // t1: delivered twice (`delivered: true` on one row, no field on the other, as in a file written before)
    Object.assign(f.verify.find((r) => r.case_id === 't1' && r.trial === 1 && r.condition === 'plugin')!, { delivered: true });
    refuse('t2', 2);                    // t2: delivered and failing, then refused
    refuse('t3', 1); refuse('t3', 2);   // t3: refused twice
    // t4's refusal has no failure-mode flag and no blocker in this fixture: it is failed because it was not delivered
    refuse('t4', 1); refuse('t4', 2);
    const r = build(f);
    expect(r.code, r.out).toBe(0);
    //                                                        t1     t2    t3     t4
    expect(r.read('repeatability.jsonl', 'plugin')).toEqual([false, true, false, false]);
    expect(r.read('repeatability.jsonl', 'hand')).toEqual([false, false, false, false]);
    // quality and the rule anchor count each refusal as a failed answer
    expect(r.read('quality.jsonl', 'plugin')).toEqual([true, true, true, true, true, true, true, true]);
    expect(r.read('rule-anchor.jsonl', 'plugin')).toEqual([true, true, true, true, true, true, true, true]);
    expect(r.out).toMatch(/repeatability: "plugin" 1 of 4 tasks failed, "hand" 0 of 4 tasks failed · delivered on some outputs and refused on others: "plugin" 1 task\(s\)/);
    expect(r.out).toMatch(/5 of 16 answers were not delivered \(`delivered: false` in verify\.jsonl\): each is a failed answer on quality and on the rule anchor\./);
    // the same rows with no `delivered` field are the file as it was written before: t2's outputs then read alike
    const before = claimA({ t2: { blocker: clean, mode: [true, true], broken: [true, true] } });
    expect(build(before).read('repeatability.jsonl', 'plugin')).toEqual([false]);
    // a delivered answer still needs its judge rows, and a refusal that is not a broken row is refused
    const unjudged = claimA({ t1: { blocker: clean, broken: [false, false] } });
    unjudged.one = unjudged.one.filter((x) => !(x.trial === 2 && x.condition === 'plugin'));
    refused(build(unjudged), /judge read 1 one\.jsonl: t1 trial 2 is missing for "plugin"/);
    const odd = claimA({ t1: { blocker: clean, broken: [false, false] } });
    Object.assign(odd.verify[0], { delivered: false });
    refused(build(odd), /verify verify\.jsonl: t1 trial 1 \(plugin\) has `delivered` false and `broken` false: a refusal is a failed answer on the rule anchor/);
    Object.assign(odd.verify[0], { delivered: 'no', broken: true });
    refused(build(odd), /t1 trial 1 \(plugin\) has `delivered` "no", which is not true or false/);
  });
  it('end to end: the files it writes are the axes closing-quality.mjs requires, and the claim is read on them', () => {
    // Thirty tasks. The hand-written skill has an agreed blocker on twenty and the candidate on three; rules are
    // broken, and broken on one output only, far more often by the hand-written skill.
    const plugin = Object.fromEntries(Array.from({ length: 30 }, (_, t) => [`t${String(t).padStart(2, '0')}`, { blocker: [[t < 3, t < 3], [t < 3, t < 3]] as [boolean, boolean][], broken: [t < 4, t < 2] }]));
    const f = claimA(plugin);
    const n = (r: Row): number => Number(String(r.case_id).slice(1));
    for (const r of [...f.one, ...f.two]) if (r.condition === 'hand') r.blocker = n(r) < 20;
    for (const r of f.verify) if (r.condition === 'hand') r.broken = r.trial === 1 ? n(r) < 25 : n(r) < 10;
    const built = build(f);
    expect(built.code, built.out).toBe(0);
    expect(built.read('repeatability.jsonl', 'hand').filter(Boolean)).toHaveLength(15);
    expect(built.read('repeatability.jsonl', 'plugin').filter(Boolean)).toHaveLength(2);
    const voice = f.tasks.flatMap((t, i) => [1, 2, 3].map((reader) => ({ case_id: t.id, reader, chose: (reader === 3) !== i < 5 ? 'comparator' : 'candidate' })));
    writeFileSync(join(built.dir, 'voice.jsonl'), jsonl(voice));
    writeFileSync(join(built.dir, 'scores.jsonl'), jsonl(f.one.map((r) => ({ ...r, ...Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 4])) }))));
    const config = { claim: 'A', k: 20, weights: WEIGHTS, scores: ['scores.jsonl'], conditions: { handwritten: 'hand', candidate: 'plugin' }, tasks: 'tasks.jsonl', trials: 2, readers: 3, minUnits: 30,
      requiredAxes: ['quality', 'rule anchor', 'repeatability', 'voice'],
      axes: [{ name: 'quality', file: 'axes/quality.jsonl' }, { name: 'rule anchor', file: 'axes/rule-anchor.jsonl' }, { name: 'repeatability', file: 'axes/repeatability.jsonl' }, { name: 'voice', file: 'voice.jsonl' }] };
    writeFileSync(join(built.dir, 'closing.json'), JSON.stringify(config));
    const r = JSON.parse(node('bench/compare/closing-quality.mjs', '--config', join(built.dir, 'closing.json')).out) as { verdict: string; axes: string[]; endpoints: { AXES: { state: string; candidate: number; handwritten: number }[] } };
    expect(r.endpoints.AXES.map((x) => x.state)).toEqual(['reached', 'reached', 'reached', 'reached']);
    expect(r.endpoints.AXES[0]).toMatchObject({ candidate: 0.1, handwritten: 0.667 });
    expect(r.endpoints.AXES[2]).toMatchObject({ candidate: 0.067, handwritten: 0.5 });
    expect(r.verdict).toBe('PASS');
    // the same claim with one built file a row short is not read
    const quality = readFileSync(join(built.dir, 'axes', 'quality.jsonl'), 'utf8').trim().split('\n');
    writeFileSync(join(built.dir, 'axes', 'quality.jsonl'), `${quality.slice(1).join('\n')}\n`);
    expect((JSON.parse(node('bench/compare/closing-quality.mjs', '--config', join(built.dir, 'closing.json')).out) as { verdict: string }).verdict).toBe('UNRESOLVED');
  });
});

describe('the rubric judge\'s output limit is an argument, checked before anything is spent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-rubric-'));
  writeFileSync(join(dir, 'tasks.jsonl'), jsonl([{ id: 'b1', prompt: 'Write the note.' }]));
  writeFileSync(join(dir, 'responses.jsonl'), jsonl([{ case_id: 'b1', trial: 1, condition: 'a', response: 'One.' }, { case_id: 'b1', trial: 1, condition: 'b', response: 'Two.' }]));
  const out = join(dir, 'scores.jsonl');
  /** The judge with no key and no backend: it can get as far as making its client, and no further. */
  const judge = (...args: string[]): { code: number; out: string } => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC|OPENAI)_/.test(k)));
    try { return { code: 0, out: execFileSync('node', [resolve('bench/compare/rubric-judge.mjs'), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }) }; }
    catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return { code: x.status ?? -1, out: `${x.stdout ?? ''}${x.stderr ?? ''}` }; }
  };
  const files = ['--responses', join(dir, 'responses.jsonl'), '--tasks', join(dir, 'tasks.jsonl'), '--rubric', resolve('bench/compare/rubrics/stop-slop.json'), '--out', out];
  it('a limit that is not a positive whole number is refused before a client is made', () => {
    for (const bad of ['0', '-5', '1.5', 'many']) {
      const r = judge(...files, '--max-tokens', bad);
      expect(r.code, bad).toBe(2);
      expect(r.out, bad).toMatch(/--max-tokens must be a positive whole number/);
      expect(r.out, bad).not.toMatch(/ANTHROPIC_API_KEY/);
    }
  });
  it('a refused answer (`response: null`) is not sent to the judge: the run is refused before a client is made, naming the row', () => {
    const withRefusal = join(dir, 'with-refusal.jsonl');
    writeFileSync(withRefusal, jsonl([{ case_id: 'b1', trial: 1, condition: 'a', response: 'One.' }, { case_id: 'b1', trial: 1, condition: 'b', response: null }]));
    const r = judge('--responses', withRefusal, '--tasks', join(dir, 'tasks.jsonl'), '--rubric', resolve('bench/compare/rubrics/stop-slop.json'), '--out', out);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/^b1 trial 1 \(b\) has no answer \(`response` is null\)\. Refused answers are not judged by this rubric and must be excluded for every arm of that task: remove b1 from the responses of every arm, then run again\. Nothing was spent\.\n$/);
    expect(r.out).not.toMatch(/ANTHROPIC_API_KEY/);
    expect(existsSync(out)).toBe(false);
  });
  it('a valid limit, and the default, get as far as the client, which has no key', () => {
    for (const ok of [['--max-tokens', '2000'], []]) {
      const r = judge(...files, ...ok);
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/ANTHROPIC_API_KEY is not set\. Nothing was spent\./);
      expect(r.out).not.toMatch(/--max-tokens/);
    }
    expect(existsSync(out)).toBe(false);
  });
});

describe('a sealed script runs when it is reached through a symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-link-'));
  // macOS /tmp is such a path. Where the platform does not let a test make a link, there is nothing to run.
  let linked = true;
  try { symlinkSync(resolve('bench/compare'), join(dir, 'compare'), 'dir'); } catch { linked = false; }
  it.skipIf(!linked)('closing-quality.mjs prints and writes its result', () => {
    const out = join(dir, 'closing.json');
    const r = node(join(dir, 'compare', 'closing-quality.mjs'), '--config', fixture(150, 0, { candidate: 0.1, handwritten: 0.1 }), '--out', out);
    expect(r.code, r.out).toBe(0);
    expect((JSON.parse(r.out) as { verdict: string }).verdict).toBe('PASS');
    expect((JSON.parse(readFileSync(out, 'utf8')) as { verdict: string }).verdict).toBe('PASS');
  });
  it.skipIf(!linked)('efficiency-select.mjs prints and writes its result', () => {
    const rules: object[] = []; const quality: object[] = [];
    for (let t = 0; t < 4; t++) for (const condition of ['full', 'lean']) for (const trial of [1, 2]) { rules.push({ case_id: `t${t}`, trial, condition, broken: false }); quality.push({ case_id: `t${t}`, trial, condition, score: 40 }); }
    writeFileSync(join(dir, 'sizes.json'), JSON.stringify({ full: 9000, lean: 4000 })); writeFileSync(join(dir, 'rules.jsonl'), jsonl(rules)); writeFileSync(join(dir, 'quality.jsonl'), jsonl(quality));
    writeFileSync(join(dir, 'ablation.json'), JSON.stringify({ reference: 'full', arms: ['lean'], defaultable: ['lean'], margins: { rules: 0.05, quality: 1 }, minTasks: 2, ceiling: 0.85, trials: 2,
      domains: [{ name: 'blog', sizes: 'sizes.json', rules: 'rules.jsonl', quality: ['quality.jsonl'], voice: null }] }));
    const out = join(dir, 'selected.json');
    const r = node(join(dir, 'compare', 'efficiency-select.mjs'), '--config', join(dir, 'ablation.json'), '--out', out);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/SELECTED: "lean"/);
    expect((JSON.parse(readFileSync(out, 'utf8')) as { selected: string }).selected).toBe('lean');
  });
});

describe('what a task asks for is sealed with it, so code decides the same checks on every task', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-wants-'));
  writeFileSync(join(dir, 'responses.jsonl'), jsonl([{ case_id: 't1', trial: 1, condition: 'a', response: 'You should cover the leap year. Want me to write it?' }, { case_id: 't2', trial: 1, condition: 'a', response: 'Several things to consider first.' }]));
  const run = (name: string, tasks: object[], ...flags: string[]): { code: number; out: string; rows: { case_id: string; F1: boolean | null; F4: boolean; by: { F1: string } }[] } => {
    writeFileSync(join(dir, `${name}.jsonl`), jsonl(tasks));
    const out = join(dir, `${name}-modes.jsonl`);
    const r = nodeAll('bench/compare/failure-modes.mjs', '--responses', join(dir, 'responses.jsonl'), '--tasks', join(dir, `${name}.jsonl`), '--out', out, '--code-only', ...flags);
    return { ...r, rows: existsSync(out) ? readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as never) : [] };
  };
  it('a task with no `wants` is refused by name before any answer is read; with it, code decides F1 and F4', () => {
    const bare = run('bare', [{ id: 't1', prompt: 'Write the test.', wants: 'code' }, { id: 't2', prompt: 'Is it done?' }]);
    expect(bare.code).toBe(2);
    expect(bare.out).toMatch(/task t2 has no `wants` \(one of code, command, fix, status, explain\)/);
    expect(bare.rows).toEqual([]);
    const whole = run('whole', [{ id: 't1', prompt: 'Write the test.', wants: 'code' }, { id: 't2', prompt: 'Is it done?', wants: 'status' }]);
    expect(whole.code, whole.out).toBe(0);
    expect(whole.out).not.toMatch(/legacy/);
    expect(whole.rows).toMatchObject([{ case_id: 't1', F1: true, by: { F1: 'code' } }, { case_id: 't2', F4: true }]);
  });
  it('--legacy-tasks accepts tasks that have none, reads them as before, and says what code no longer decides', () => {
    const r = run('legacy', [{ id: 't1', prompt: 'Write the test.' }, { id: 't2', prompt: 'Is it done?' }], '--legacy-tasks');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/--legacy-tasks: 2 of 2 tasks have no `wants`\. On those F1 is left to the reader and F4 is not checked \(recorded as false\)\./);
    expect(r.rows).toMatchObject([{ case_id: 't1', F1: null, F4: false, by: { F1: 'reader' } }, { case_id: 't2', F1: null, F4: false }]);
  });
  it('a `wants` outside the five is refused, with or without --legacy-tasks', () => {
    for (const flags of [[], ['--legacy-tasks']]) {
      const r = run(`odd${String(flags.length)}`, [{ id: 't1', prompt: 'Write the test.', wants: 'tests' }, { id: 't2', prompt: 'Is it done?', wants: 'status' }], ...flags);
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/task t1 has `wants` "tests", which is not one of code, command, fix, status, explain\./);
      expect(r.rows).toEqual([]);
    }
  });
});
