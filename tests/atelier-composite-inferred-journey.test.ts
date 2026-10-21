// tests/atelier-composite-inferred-journey.test.ts — "HERE ARE TEN PIECES I LIKE", NOBODY SAYS WHO WROTE WHICH, AND NOTHING IS ASKED.
//
// `atelier new` on ten pieces by five invented writers, with no front matter, no folder per author and no --authors,
// through the shipped binary, against a scripted backend that answers each voice's reading with that voice's rules
// (and, from the effect vantage, one more for the fragment writer). The voices are found from the writing, each is read
// on its own, the combination is inferred and built in one call that says one line. The full table is in the run's
// record and `atelier report --skill`; a rebuild changes nothing and calls no model; a stated liking weighs its rules up.
// Then the same with no model set up, and a folder of one voice, which behaves as it always did.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FIVE_VOICES, FIVE_GROUPS, ONE_VOICE } from './fixtures/composite/five-voices.js';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;

const ASK_OPEN = 'Open with a question the reader is already asking.';
const ASK_CONTRACT = 'Use contractions throughout, in a casual register.';
const FIG_EVIDENCE = 'Back every claim with a figure and its source in the same sentence.';
const RUN_PACE = 'Keep the pace fast with sentence fragments.';
const RUN_EFFECT = 'Leave the reader breathless by cutting each line before it settles.';
const LAW_FORMAL = 'Never use contractions; keep a formal register.';
const TALE_FIGURE = 'Carry one image across the whole piece as its metaphor.';
const PLAIN = Array.from({ length: 6 }, (_, i) => `Meetings are a common part of working life, and teams often wonder how to make them more effective. One useful approach is to set a clear agenda before point ${i + 1}, share it in advance, and keep the discussion focused on decisions rather than updates.`).join('\n\n');

const rule = (statement: string, from: string) => ({ statement, appliesWhen: 'GENERAL', evidence: '', evidenceItemId: from, kind: 'GENERATIVE', wouldBeAbsentIf: 'the opposite shows' });
const EFFECT = 'Work backwards from EFFECT';
const FIGURE = 'Formal and figurative choices COUNT as decisions';

beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
  // A voice's reading carries only its pieces, so a phrase of theirs routes it; the first match wins.
  const by = (words: string[], rules: object[]) => ({ containsAll: ['emit_rules', ...words], answer: { rules } });
  await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({
    byTool: { emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }] }, emit_piece: { piece: PLAIN } },
    when: [
      // the casual writer: the opening from every vantage, contractions from the first alone
      by([EFFECT, "nobody's"], [rule(ASK_OPEN, 'a-meetings.md')]),
      by([FIGURE, "nobody's"], [rule(ASK_OPEN, 'a-meetings.md')]),
      by(["nobody's"], [rule(ASK_OPEN, 'a-meetings.md'), rule(ASK_CONTRACT, 'a-meetings.md')]),
      by(['statistics office'], [rule(FIG_EVIDENCE, 'b-harbour.md')]),
      // the fragment writer: the effect vantage also reads what the lines do to a reader
      by([EFFECT, 'Breath short'], [rule(RUN_PACE, 'c-sprint.md'), rule(RUN_EFFECT, 'c-sprint.md')]),
      by(['Breath short'], [rule(RUN_PACE, 'c-sprint.md')]),
      by(['not permitted'], [rule(LAW_FORMAL, 'd-committee.md')]),
      by(['gone cold'], [rule(TALE_FIGURE, 'e-kitchen.md')]),
    ],
  }) });
});
afterAll(() => { backend.kill(); });

const viaModel = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
      encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' },
    });
  } catch (e) { const err = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`; }
};
const keyless = (data: string, proj: string, ...args: string[]): string => {
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_PROVIDER;
  try { return execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env }); } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};
const calls = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${port}/__count`)).json()) as { count: number }).count;

const folder = (proj: string, pieces: Readonly<Record<string, string>>): string => {
  const dir = join(proj, 'pieces'); mkdirSync(dir, { recursive: true });
  for (const [f, t] of Object.entries(pieces)) writeFileSync(join(dir, f), t);
  return dir;
};
const runsFile = (data: string, name: string): string => { const r = join(data, 'runs'); const d = readdirSync(r).find((x) => existsSync(join(r, x, name))); return d ? join(r, d, name) : ''; };
const skillFiles = (proj: string, name: string): Record<string, string> => {
  const base = join(proj, '.claude', 'skills', name); const ex = join(base, 'examples');
  return { 'SKILL.md': readFileSync(join(base, 'SKILL.md'), 'utf8'), ...Object.fromEntries((existsSync(ex) ? readdirSync(ex) : []).sort().map((f) => [f, readFileSync(join(ex, f), 'utf8')])) };
};
interface Inference { grouping: { how: string; voices: { name: string; pieces: string[] }[]; confidence: number }; weights: { id: string; voice: string; statement: string; weight: number; chosen: boolean; effectReading: boolean; preference: number }[];
  settled: { n: number; stands: { id: string }[]; aside: { id: string }[]; by: string; why: string }[]; effectReadings: string[]; line: string; preference: unknown }
const PURPOSE = 'a column that combines these';
const QUESTIONS = /What do you like|--admire|--conflict|answer with|Nothing was decided|Enter to accept|open question/;

describe('atelier new on ten pieces by five unnamed voices, with a model', () => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-infer-data-'));
  const proj = mkdtempSync(join(tmpdir(), 'atelier-infer-proj-'));
  let out = ''; let inf: Inference;
  const id = (statement: string): string => inf.weights.find((w) => w.statement === statement)?.id ?? `(no rule "${statement}")`;
  beforeAll(() => {
    out = viaModel(data, proj, 'new', folder(proj, FIVE_VOICES), PURPOSE, '--name', 'mix');
    inf = JSON.parse(readFileSync(runsFile(data, 'composite-inference.json'), 'utf8')) as Inference;
    if (process.env.INFER_DUMP) writeFileSync(process.env.INFER_DUMP, out);
  }, 300_000);

  it('finds the five voices from the writing, with its confidence, in one line', () => {
    expect(out).not.toMatch(/^EXIT/);
    expect(out).toMatch(/5 voices found in 10 pieces, by how they are written \(confidence [01]\.\d\d\): each is read on its own first\./);
    expect(inf.grouping.how).toBe('INFERRED');
    expect(inf.grouping.voices.map((v) => [...v.pieces].sort())).toEqual(FIVE_GROUPS.map((g) => [...g]));
    expect(inf.grouping.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('builds in one call, says one line, and asks nothing', () => {
    expect(existsSync(join(proj, '.claude', 'skills', 'mix', 'SKILL.md'))).toBe(true);
    expect(out).not.toMatch(QUESTIONS);
    const lines = out.split('\n').filter((l) => l.startsWith("Combined "));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Combined 5 voices: .+ from the first, .+; 1 clash settled by which was more characteristic\. Say `atelier fix` to change any of it\.$/);
    expect(lines[0]).toBe(inf.line);
  });

  it('each voice\'s most characteristic traits steer through preferred examples, never hard instructions', () => {
    const files = skillFiles(proj, 'mix');
    const md = files['SKILL.md'];
    const todo = /## What to do\n([\s\S]*?)\n## /.exec(md)?.[1] ?? '';
    const served = Object.values(files).join('\n');
    for (const r of [ASK_OPEN, FIG_EVIDENCE, RUN_PACE, LAW_FORMAL, TALE_FIGURE]) {
      expect(served).toContain(r);
      expect(todo).not.toContain(r);
      expect(inf.weights.find((w) => w.statement === r)?.chosen).toBe(true);
    }
    // the ruling says it was inferred, from which voice
    const ledgers = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? ledgers(join(dir, e.name)) : /ledger/i.test(join(dir, e.name)) ? [readFileSync(join(dir, e.name), 'utf8')] : []));
    expect(ledgers(join(data, 'skills', 'mix')).join('\n')).toMatch(/inferred from voice 1 \(a-meetings\.md, f-inbox\.md\)/);
  });

  it('the inferred traits ship as preferred steering; only the editorial grammar rule is required', () => {
    const dir = join(data, 'skills', 'mix', 'standards');
    const standards = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { requirements: { materiality: string | null; measurement?: { observer: string } }[] });
    const requirements = standards.flatMap((s) => s.requirements);
    expect(requirements.filter((r) => r.materiality === 'REQUIRED' && r.measurement?.observer !== 'GRAMMAR')).toEqual([]);
    expect(requirements.filter((r) => r.materiality === 'REQUIRED' && r.measurement?.observer === 'GRAMMAR')).toHaveLength(1);
    expect(requirements.filter((r) => r.materiality === 'PREFERRED').length).toBeGreaterThan(0);
  });

  it('the clash is settled one way, with its reason, and never both sides ship', () => {
    const md = readFileSync(join(proj, '.claude', 'skills', 'mix', 'SKILL.md'), 'utf8');
    const clash = inf.settled.find((c) => [...c.stands, ...c.aside].some((x) => x.id === id(ASK_CONTRACT)));
    expect(clash).toBeDefined();
    expect(clash?.by).toBe('INFERENCE');
    expect(clash?.stands.map((x) => x.id)).toEqual([id(LAW_FORMAL)]);
    expect(clash?.aside.map((x) => x.id)).toEqual([id(ASK_CONTRACT)]);
    expect(clash?.why).toBe("voice 4's was more characteristic (weight 0.80 against 0.40)");
    expect(md).not.toContain(ASK_CONTRACT);
    for (const c of inf.settled) expect(c.stands.length === 1 || c.by === 'REQUEST').toBe(true);
  });

  it('a rule only the effect vantage reached carries that provenance, and is said not to be measured', () => {
    expect(inf.effectReadings).toEqual([id(RUN_EFFECT)]);
    const report = viaModel(data, proj, 'report', '--skill', 'mix');
    expect(report).toContain('HOW THE VOICES WERE COMBINED (inferred from the pieces; nothing was asked)');
    // what stands from whom, and how the clash stands, in the composite's own words
    expect(report).toMatch(/THE COMPOSITE\n {2}The composite: \d+ rule\(s\) taken from 5 of 5 voices, each voice's most characteristic\./);
    expect(report).toMatch(/A {2}voice 1: Use contractions throughout, in a casual register\.\n {8}B {2}voice 4: Never use contractions; keep a formal register\.\n {8}→ voice 4 \(the more characteristic\)/);
    expect(report).not.toMatch(/you chose|you admired|answer with --conflict/);
    expect(report).toMatch(new RegExp(`${id(RUN_EFFECT)} +0\\.\\d\\d = [^\\n]*${RUN_EFFECT.replace('.', '\\.')} +\\(effect reading, not yet measured\\)`));
    expect(report).toMatch(/Read from what the writing does to a reader \(the effect reading\): p\d+\. Not yet measured/);
    expect(report).toMatch(/\d\. [^\n]*: voice 4's p\d+ stands, voice 1's p\d+ set aside\. voice 4's was more characteristic \(weight 0\.80 against 0\.40\)\./);
  });

  it('a rebuild reads the stored inference: byte for byte, with no model call', async () => {
    const before = skillFiles(proj, 'mix'); const n = await calls();
    const again = viaModel(data, proj, 'build', '--name', 'mix');
    expect(again).not.toMatch(/^EXIT/);
    expect(await calls()).toBe(n);
    expect(skillFiles(proj, 'mix')).toEqual(before);
  });

  it('a sentence of liking in the request weighs the rules it names up, by one and a half', () => {
    const d2 = mkdtempSync(join(tmpdir(), 'atelier-infer-data-')); const p2 = mkdtempSync(join(tmpdir(), 'atelier-infer-proj-'));
    const out2 = viaModel(d2, p2, 'new', folder(p2, FIVE_VOICES), `${PURPOSE}. I love the imagery.`, '--name', 'mix');
    expect(out2).not.toMatch(QUESTIONS);
    const inf2 = JSON.parse(readFileSync(runsFile(d2, 'composite-inference.json'), 'utf8')) as Inference;
    const before = inf.weights.find((w) => w.statement === TALE_FIGURE); const after = inf2.weights.find((w) => w.statement === TALE_FIGURE);
    expect(after?.preference).toBe(1.5);
    expect(after?.weight).toBeCloseTo((before?.weight ?? 0) * 1.5, 3);
    // nothing else it does not name moves
    expect(inf2.weights.find((w) => w.statement === ASK_OPEN)?.weight).toBe(inf.weights.find((w) => w.statement === ASK_OPEN)?.weight);
  }, 300_000);
});

describe('the same ten pieces with no model set up', () => {
  it('one folder is one voice unless asked: the voices read are said; --voices counts each one alone and builds in one call asking nothing', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-infer-k-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-infer-k-proj-'));
    // UNASKED: said, and built as one voice (the examples-only build)
    const one = keyless(mkdtempSync(join(tmpdir(), 'atelier-infer-k1-data-')), mkdtempSync(join(tmpdir(), 'atelier-infer-k1-proj-')), 'new', folder(proj, FIVE_VOICES), PURPOSE, '--name', 'one');
    expect(one).not.toMatch(/^EXIT/);
    expect(one).toMatch(/5 voices read in how the pieces are written \(2 piece\(s\), 2 piece\(s\), 2 piece\(s\), 2 piece\(s\), 2 piece\(s\)\): built as one voice/);
    expect(one).toMatch(/--voices/);
    expect(one).not.toMatch(/Combined 5 voices/);
    const out = keyless(data, proj, 'new', folder(proj, FIVE_VOICES), PURPOSE, '--name', 'mix', '--voices');
    expect(out).not.toMatch(/^EXIT/);
    expect(out).toMatch(/5 voices found in 10 pieces/);
    for (const v of ['voice 1', 'voice 2', 'voice 3', 'voice 4', 'voice 5']) expect(out).toMatch(new RegExp(`rule\\(s\\) counted from ${v}'s pieces alone`));
    expect(out).not.toMatch(QUESTIONS);
    expect(out.split('\n').filter((l) => l.startsWith("Combined 5 voices: "))).toHaveLength(1);
    expect(existsSync(join(proj, '.claude', 'skills', 'mix', 'SKILL.md'))).toBe(true);
    const inf = JSON.parse(readFileSync(runsFile(data, 'composite-inference.json'), 'utf8')) as Inference;
    // counted traits only, each weighed on its own voice's pieces
    expect(inf.weights.length).toBeGreaterThan(0);
    for (const w of inf.weights) expect(w.id).toMatch(/^m\d+$/);
    expect(inf.effectReadings).toEqual([]);
  });
});

describe('a folder of one voice behaves as it always did', () => {
  it('six unlabelled pieces by one writer take the same single-author path and compile identically apart from build time', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-infer-1-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-infer-1-proj-'));
    const out = keyless(data, proj, 'new', folder(proj, ONE_VOICE), 'a team blog post', '--name', 'one');
    expect(out).not.toMatch(/^EXIT/);
    expect(out).not.toMatch(/voices found|by \d+ authors|Combined/);
    expect(existsSync(join(proj, '.claude', 'skills', 'one', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(data, 'skills', 'one', 'composite.json'))).toBe(false);
    expect(readFileSync(join(proj, '.claude', 'skills', 'one', 'SKILL.md'), 'utf8')).not.toMatch(/composite/i);

    const labelledData = mkdtempSync(join(tmpdir(), 'atelier-infer-1-labelled-data-')); const labelledProj = mkdtempSync(join(tmpdir(), 'atelier-infer-1-labelled-proj-'));
    const labelled = Object.fromEntries(Object.entries(ONE_VOICE).map(([name, text]) => [name, `---\nauthor: Ann\n---\n${text}`]));
    const labelledOut = keyless(labelledData, labelledProj, 'new', folder(labelledProj, labelled), 'a team blog post', '--name', 'one');
    expect(labelledOut).not.toMatch(/^EXIT/);
    expect(labelledOut).not.toMatch(/voices found|by \d+ authors|Combined/);
    expect(existsSync(join(labelledData, 'skills', 'one', 'composite.json'))).toBe(false);
    const withoutBuildTime = (files: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(files).map(([name, text]) => [name, text.replace(/^mintedAt:\s+.*$/m, 'mintedAt:        <build time>')]));
    expect(withoutBuildTime(skillFiles(labelledProj, 'one'))).toEqual(withoutBuildTime(skillFiles(proj, 'one')));
  });
});
