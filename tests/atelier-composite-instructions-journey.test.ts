// tests/atelier-composite-instructions-journey.test.ts — THE FINAL INSTRUCTIONS OF A COMPOSITE, THROUGH THE SHIPPED BINARY.
//
// Two authors, against a scripted backend. Ada asks for headings and for a column of crisp fragments; Bram for continuous
// prose with no headings and for sentences that earn their subordinate clauses. The keywords see the headings conflict;
// only a reading sees that fragments and subordinate clauses cannot both be followed. The person answers the headings
// conflict for Ada, then makes Bram's rule required with --set: their latest word wins, the screen says so, and only it
// ships. The model's pair is asked on the screen and neither side of it ships. A rebuild asks the model nothing.
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

describe('a composite\'s final instructions', () => {
  let first = ''; let second = ''; let md = ''; let callsAfterBuild = 0; let callsAfterRebuild = 0; let proj = ''; let data = '';
  beforeAll(async () => {
    const base = mkdtempSync(join(tmpdir(), 'atelier-instructions-'));
    data = join(base, 'data'); proj = join(base, 'proj');
    mkdirSync(join(proj, 'writers'), { recursive: true });
    for (const [f, t] of Object.entries(PIECES)) writeFileSync(join(proj, 'writers', f), t);
    first = run(data, proj, 'new', 'writers', 'a weekly newsletter', '--name', 'mix', '--admire', 'Ada=everything', '--admire', 'Bram=everything');
    const n = /\n {2}(\d+)\. headings[^\n]*\n {6}A {2}Ada: Use headings/.exec(first)?.[1] ?? 'missing';
    const session = readdirSync(join(data, 'sessions')).map((f) => JSON.parse(readFileSync(join(data, 'sessions', f), 'utf8')) as { proposals?: { requirementId: string; statement: string }[] })[0];
    const id = session?.proposals?.find((p) => p.statement === PROSE)?.requirementId ?? 'missing';
    second = run(data, proj, 'new', 'writers', '--accept', '--conflict', `${n}=A`, '--set', `${id}=required`);
    const skill = join(proj, '.claude', 'skills', 'mix', 'SKILL.md');
    md = existsSync(skill) ? readFileSync(skill, 'utf8') : '';
    callsAfterBuild = await contradictionCalls();
    run(data, proj, 'build', '--name', 'mix');
    callsAfterRebuild = await contradictionCalls();
  });
  it('the model\'s pair is an open question on the screen, from where it came, and neither side instructs', () => {
    expect(first).not.toMatch(/^EXIT/);
    expect(first).toContain(`(read by the model at build: ${REASON})`);
    expect(first).not.toContain('checked by keyword only');
    const whatToDo = md.slice(md.indexOf('## What to do'), md.indexOf('## What not to do'));
    expect(whatToDo).not.toContain(FRAGMENTS);
    expect(whatToDo).not.toContain(CLAUSES);
  });
  it('--set after an answer: the screen says so in one line, and only the rule it made required ships', () => {
    expect(second).not.toMatch(/^EXIT/);
    expect(second.split('\n').filter((l) => /^--set p\d+=required: Bram's "Write in continuous prose/.test(l))).toHaveLength(1);
    expect(second).toMatch(/your --set is your latest word, so p\d+ is set aside\./);
    const whatToDo = md.slice(md.indexOf('## What to do'), md.indexOf('## What not to do'));
    expect(whatToDo).toContain(PROSE);
    expect(whatToDo).not.toContain(HEADINGS);
  });
  it('the reading is kept with the run: a rebuild asks the model nothing', () => {
    expect(callsAfterBuild).toBeGreaterThan(0);
    expect(callsAfterRebuild).toBe(callsAfterBuild);
  });
});

