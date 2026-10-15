// tests/atelier-composite-instructions-journey.test.ts — THE FINAL INSTRUCTIONS OF A COMPOSITE, THROUGH THE SHIPPED BINARY.
//
// Two authors, against a scripted backend. Ada asks for headings and for a column of crisp fragments; Bram for continuous
// prose with no headings and for sentences that earn their subordinate clauses. The keywords see the headings conflict;
// only a reading sees that fragments and subordinate clauses cannot both be followed. Nothing is asked: each pair is
// settled by which side is more characteristic, the model's pair recorded with where it came from, and exactly one side
// of each ships. A person who makes Bram's rule required with --set outranks the inference, and only it ships. A rebuild
// asks the model nothing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
const HEADINGS = 'Use headings to break up the piece.';
const PROSE = 'Write in continuous prose with no headings and no lists.';
const FRAGMENTS = 'Write as a column of crisp fragments.';
const CLAUSES = 'Let every sentence earn its subordinate clause.';
const REASON = '"crisp fragments" against "every sentence earn its subordinate clause"';

const rule = (statement: string, from: string) => ({ statement, appliesWhen: 'GENERAL', evidence: '', evidenceItemId: from, kind: 'GENERATIVE', wouldBeAbsentIf: 'the opposite shows' });
beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
  const by = (word: string, rules: object[]) => ({ containsAll: ['emit_rules', word], answer: { rules } });
  await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({
    byTool: {
      emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }, { leftIndex: 1, matchedRightIndex: 1 }] },
      emit_admired: { picks: [{ author: 'Ada', classes: ['structure', 'pace'] }, { author: 'Bram', classes: ['structure', 'pace'] }] },
      emit_contradictions: { pairsByText: [[FRAGMENTS, CLAUSES, REASON]] },
    },
    when: [
      by('lighthouse', [rule(HEADINGS, 'ada.md'), rule(FRAGMENTS, 'ada.md')]),
      by('tribunal', [rule(PROSE, 'bram.md'), rule(CLAUSES, 'bram.md')]),
    ],
  }) });
});
afterAll(() => { backend.kill(); });

const fm = (who: string, body: string): string => `---\nauthor: ${who}\n---\n${body}\n`;
const ada = (k: number): string => fm('Ada', `## The lighthouse, ${k}\n\n${Array.from({ length: 10 }, (_, i) => `Night ${i + k}. The lighthouse keeper counts ships. Dusk again.`).join('\n\n')}`);
const bram = (k: number): string => fm('Bram', Array.from({ length: 10 }, (_, i) => `When the tribunal sat for the ${i + k}th time, the clerk, who had kept the record since the spring, read the charge slowly, because the room was full and the windows were open.`).join('\n\n'));
const PIECES: Record<string, string> = { 'ada.md': ada(1), 'ada-2.md': ada(20), 'bram.md': bram(1), 'bram-2.md': bram(20) };
const run = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
      encoding: 'utf8', cwd: proj, env: { ...process.env, ANTHROPIC_API_KEY: '', ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' },
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};
const contradictionCalls = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies.filter((b) => b.includes('"emit_contradictions"')).length;

const whatToDo = (md: string): string => md.slice(md.indexOf('## What to do'), md.indexOf('## What not to do'));
const served = (md: string, dir: string): string => [md, ...(existsSync(join(dir, 'examples')) ? readdirSync(join(dir, 'examples')).sort().map((f) => readFileSync(join(dir, 'examples', f), 'utf8')) : [])].join('\n');
const project = (): { data: string; proj: string } => {
  const base = mkdtempSync(join(tmpdir(), 'atelier-instructions-'));
  const data = join(base, 'data'); const proj = join(base, 'proj');
  mkdirSync(join(proj, 'writers'), { recursive: true });
  for (const [f, t] of Object.entries(PIECES)) writeFileSync(join(proj, 'writers', f), t);
  return { data, proj };
};
const skillOf = (proj: string): string => { const f = join(proj, '.claude', 'skills', 'mix', 'SKILL.md'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };

describe('a composite\'s final instructions', () => {
  let first = ''; let second = ''; let md = ''; let md2 = ''; let all = ''; let callsAfterBuild = 0; let callsAfterRebuild = 0;
  let comp: { conflicts: { provenance?: string; reason?: string; resolvedBy: string; answer: string | null; settledWhy?: string }[] } = { conflicts: [] };
  beforeAll(async () => {
    const one = project();
    first = run(one.data, one.proj, 'new', 'writers', 'a weekly newsletter', '--name', 'mix');
    md = skillOf(one.proj);
    all = served(md, join(one.proj, '.claude', 'skills', 'mix'));
    comp = existsSync(join(one.data, 'skills', 'mix', 'composite.json')) ? JSON.parse(readFileSync(join(one.data, 'skills', 'mix', 'composite.json'), 'utf8')) as typeof comp : comp;
    callsAfterBuild = await contradictionCalls();
    run(one.data, one.proj, 'build', '--name', 'mix');
    callsAfterRebuild = await contradictionCalls();
    // the same pieces, with the person's word on Bram's rule given on the call that builds
    const session = readdirSync(join(one.data, 'sessions')).map((f) => JSON.parse(readFileSync(join(one.data, 'sessions', f), 'utf8')) as { proposals?: { requirementId: string; statement: string }[] })[0];
    const id = session?.proposals?.find((p) => p.statement === PROSE)?.requirementId ?? 'missing';
    const two = project();
    second = run(two.data, two.proj, 'new', 'writers', 'a weekly newsletter', '--name', 'mix', '--set', `${id}=required`);
    md2 = skillOf(two.proj);
  }, 300_000);
  it('the model\'s pair is settled by which side is more characteristic, recorded with where it came from, and only one side is served, as preferred steering', () => {
    expect(first).not.toMatch(/^EXIT/);
    expect(first).not.toMatch(/What do you like|--conflict|open question/);
    expect(first).not.toContain('found by keyword only');
    const pair = comp.conflicts.find((c) => c.provenance === 'read by the model at build');
    expect(pair).toMatchObject({ reason: REASON, resolvedBy: 'INFERENCE', answer: expect.stringMatching(/^[AB]$/) as unknown });
    expect([FRAGMENTS, CLAUSES].filter((r) => all.includes(r))).toHaveLength(1);
    expect([HEADINGS, PROSE].filter((r) => all.includes(r))).toHaveLength(1);
    // inferred, so none of them is a hard instruction
    for (const r of [FRAGMENTS, CLAUSES, HEADINGS, PROSE]) expect(whatToDo(md)).not.toContain(r);
  });
  it('--set outranks the inference: only the rule it made required ships', () => {
    expect(second).not.toMatch(/^EXIT/);
    expect(whatToDo(md2)).toContain(PROSE);
    expect(whatToDo(md2)).not.toContain(HEADINGS);
  });
  it('the reading is kept with the run: a rebuild asks the model nothing', () => {
    expect(callsAfterBuild).toBeGreaterThan(0);
    expect(callsAfterRebuild).toBe(callsAfterBuild);
  });
});
