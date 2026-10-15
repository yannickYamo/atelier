// tests/atelier-composite-quantity-journey.test.ts — A RULE'S NUMBERS READ TWO WAYS, THROUGH THE SHIPPED BINARY.
//
// Two authors, against a scripted backend. Ada asks for at least eight hundred words; Bram to keep it to a quick read,
// which names no number the quantity grammar can read. The model, reading the final instructions once, reads Bram's
// rule as at most 500 words. The two readings disagree, so the record says the rule is read two ways, and the pair the
// model's reading cannot follow is settled by which side is more characteristic: exactly one length instructs. When the
// request names the length itself, neither does, and the skill states no length band of its own. The reading is kept
// with the run: a rebuild asks the model nothing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
const LONG = 'Write at least eight hundred words.';
const QUICK = 'Keep it to a quick read.';
const OPEN_Q = 'Open with a question the reader is already asking.';
const CASUAL = 'Use contractions freely.';

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
      emit_admired: { picks: [{ author: 'Ada', classes: ['opening', 'structure', 'voice', 'method'] }, { author: 'Bram', classes: ['opening', 'structure', 'voice', 'method'] }] },
      emit_contradictions: { quantitiesByText: [[QUICK, 'piece', 'words', null, 500], [LONG, 'piece', 'words', 800, null]] },
    },
    when: [
      by('lighthouse', [rule(LONG, 'ada.md'), rule(OPEN_Q, 'ada.md')]),
      by('tribunal', [rule(QUICK, 'bram.md'), rule(CASUAL, 'bram.md')]),
    ],
  }) });
});
afterAll(() => { backend.kill(); });

// Pieces of one length class, so a band from the authors' medians would be stated if nothing about length were open.
const fm = (who: string, body: string): string => `---\nauthor: ${who}\n---\n${body}\n`;
const ada = (k: number): string => fm('Ada', Array.from({ length: 12 }, (_, i) => `Why does the lighthouse keeper count the ships at dusk, night ${i + k}? Because the harbour master asks him to.`).join('\n\n'));
const bram = (k: number): string => fm('Bram', Array.from({ length: 12 }, (_, i) => `The tribunal sat again on day ${i + k}, and the clerk read the charge to a room that wasn't full.`).join('\n\n'));
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
const findFile = (dir: string, name: string): string | null => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const f = findFile(p, name); if (f) return f; } else if (e.name === name) return p;
  }
  return null;
};

const build = (request: string): { data: string; proj: string; out: string; md: string; comp: { notes?: string[]; conflicts: { provenance?: string; reason?: string; resolvedBy: string; answer: string | null }[] } } => {
  const base = mkdtempSync(join(tmpdir(), 'atelier-quantity-'));
  const data = join(base, 'data'); const proj = join(base, 'proj');
  mkdirSync(join(proj, 'writers'), { recursive: true });
  for (const [f, t] of Object.entries(PIECES)) writeFileSync(join(proj, 'writers', f), t);
  const out = run(data, proj, 'new', 'writers', request, '--name', 'mix');
  const skill = join(proj, '.claude', 'skills', 'mix', 'SKILL.md');
  const c = join(data, 'skills', 'mix', 'composite.json');
  return { data, proj, out, md: existsSync(skill) ? readFileSync(skill, 'utf8') : '', comp: existsSync(c) ? JSON.parse(readFileSync(c, 'utf8')) as ReturnType<typeof build>['comp'] : { conflicts: [] } };
};
const whatToDo = (md: string): string => md.slice(md.indexOf('## What to do'), md.indexOf('## What not to do'));

describe('a rule whose numbers the model reads differently from its words', () => {
  let first: ReturnType<typeof build>; let asked: ReturnType<typeof build>; let stored = ''; let callsAfterBuild = 0; let callsAfterRebuild = 0;
  beforeAll(async () => {
    first = build('a weekly newsletter');
    const f = findFile(first.data, 'composite-contradictions.json');
    stored = f ? readFileSync(f, 'utf8') : '';
    callsAfterBuild = await contradictionCalls();
    run(first.data, first.proj, 'build', '--name', 'mix');
    callsAfterRebuild = await contradictionCalls();
    asked = build('a weekly newsletter of about 600 words');
  }, 300_000);
  it('the record says the rule is read two ways, and the pair its reading cannot follow is settled, asking nothing', () => {
    expect(first.out).not.toMatch(/^EXIT/);
    expect(first.out).not.toMatch(/--conflict|open question|What do you like/);
    expect(first.comp.notes?.join('\n')).toMatch(/read two ways: p\d+ "Keep it to a quick read\." is no quantity by its words, and at most 500 words in the piece by the model/);
    expect(first.comp.notes?.join('\n')).not.toMatch(/read two ways: p\d+ "Write at least eight hundred words\."/);
    const pair = first.comp.conflicts.find((c) => c.provenance === 'read by the model at build');
    expect(pair).toMatchObject({ resolvedBy: 'INFERENCE', reason: expect.stringMatching(/^p\d+ read two ways/) as unknown });
  });
  it('exactly one length instructs; with a length in the request, neither does and the skill states no band of its own', () => {
    expect(first.md).not.toBe('');
    expect([LONG, QUICK].filter((r) => whatToDo(first.md).includes(r))).toHaveLength(1);
    expect(whatToDo(first.md)).toContain(OPEN_Q);
    expect(asked.out).not.toMatch(/^EXIT/);
    expect(whatToDo(asked.md)).not.toContain(LONG);
    expect(whatToDo(asked.md)).not.toContain(QUICK);
    expect(whatToDo(asked.md)).toContain(OPEN_Q);
    expect(asked.md).not.toMatch(/My pieces of this kind run about/);
  });
  it('the reading is kept with the run, and a rebuild asks the model nothing', () => {
    expect(JSON.parse(stored)).toMatchObject({ via: 'MODEL', quantities: expect.arrayContaining([expect.objectContaining({ quantity: { measure: 'piece', unit: 'words', min: null, max: 500 } })]) });
    expect(callsAfterBuild).toBeGreaterThan(0);
    expect(callsAfterRebuild).toBe(callsAfterBuild);
  });
});
