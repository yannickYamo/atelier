// tests/atelier-grammar-repair-listed.test.ts — WHAT IS LISTED IS SAID AS LISTED, NEVER AS HELD.
//
// `verify --repair` on a text whose only grammar findings are listed changes nothing; it used to say "nothing to repair:
// every REQUIRED measured rule holds", and its --json carried no trace of the rule it left unverified. It now says
// nothing changed, counts and lists the possible slips, and the JSON names the rule as unverified with its items.
// And a space before a comma or a full stop is shown with the words around it, never as `"" → "(removed)"`.
//
// The engine is real (harper.js, offline).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setGrammarProvider, ensureGrammar, resetGrammar, setGrammarFixing, GRAMMAR } from '../core/observers/grammar.js';
import { harperGrammar } from '../providers/harper.js';

describe('a space before a comma or a full stop, as shown (real engine)', () => {
  beforeAll(async () => { resetGrammar(); setGrammarProvider(harperGrammar); await ensureGrammar(); }, 60_000);
  afterAll(() => { setGrammarFixing(false); });
  const text = 'We waited , and then left. It was done . Then we went home.';
  it('listed: the words around the space, and no "(removed)"', () => {
    setGrammarFixing(false);
    const r = GRAMMAR.observe(text, {});
    expect(r.detail).toContain('"waited , and" (a space before a comma)');
    expect(r.detail).toContain('"done . Then" (a space before punctuation)');
    expect(r.detail).not.toMatch(/removed|""/);
    for (const s of r.spans) expect(s.why).not.toMatch(/removed|""/);
  });
  it('under --fix-grammar: the same words, the kind counted by its name, and no "(removed)"', () => {
    setGrammarFixing(true);
    const r = GRAMMAR.observe(text, {});
    expect(r.verdict).toBe('VIOLATED');
    expect(r.detail).toBe('2 mechanical error(s): a space before a comma, a space before punctuation');
    expect(r.spans.map((s) => s.why)).toEqual(['a space before a comma in "waited , and"', 'a space before punctuation in "done . Then"']);
  });
});

describe('verify --repair with only listed grammar findings (through the binary)', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  const PIECES = [
    'The team shipped the fix on Monday, and the panel held. Nobody asked for more.\n\nThe plan was simple: ship, watch, write it down.',
    'A short note on the release. We watched the queue drain and the panel stay green.\n\nThen we wrote it down, as always.',
    'The outage lasted an hour. The panel went red, the queue filled, and we waited.\n\nWriting it down was the easy part.',
  ];
  let root = ''; let proj = '';
  const run = (...args: string[]): { out: string; err: string; code: number } => {
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: join(root, 'data'), ATELIER_PROJECT_DIR: proj, ATELIER_GRAMMAR: 'on' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const errFile = join(root, 'err.txt');
    try {
      const out = execFileSync('sh', ['-c', `node "${CLI}" ${args.map((x) => `'${x}'`).join(' ')} 2>"${errFile}"`], { encoding: 'utf8', cwd: proj, env });
      return { out, err: execFileSync('cat', [errFile], { encoding: 'utf8' }), code: 0 };
    } catch (e) {
      const x = e as { status?: number; stdout?: string };
      return { out: x.stdout ?? '', err: execFileSync('cat', [errFile], { encoding: 'utf8' }), code: x.status ?? 1 };
    }
  };
  beforeAll(() => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    root = mkdtempSync(join(tmpdir(), 'atelier-grammar-repair-listed-')); proj = join(root, 'proj');
    mkdirSync(proj); mkdirSync(join(proj, 'posts'));
    PIECES.forEach((p, i) => { writeFileSync(join(proj, 'posts', `p${i + 1}.md`), p); });
    expect(run('new', 'posts', '--no-model', '--name', 'posts').code).toBe(0);
    writeFileSync(join(proj, 't.md'), 'She are late again. We waited , and then left.\n');
  }, 120_000);
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it('says nothing changed, counts and lists the slips, and never says every rule holds', () => {
    const r = run('verify', '--skill', 'posts', 't.md', '--repair');
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('She are late again. We waited , and then left.');
    expect(r.err).not.toMatch(/every REQUIRED measured rule holds/);
    expect(r.err).toContain('(nothing changed: 2 possible slips are listed for you to check)');
    expect(r.err).toMatch(/unverified, listed for you to check: "are" \(subject–verb agreement: "are" → "is"\); "waited , and" \(a space before a comma\)/);
  }, 120_000);
  it('--json names the rule unverified and carries the listed items', () => {
    const r = run('verify', '--skill', 'posts', 't.md', '--repair', '--json');
    const j = JSON.parse(r.out) as { failed: boolean; repair: unknown; unverified?: string[]; listed?: { rule: string; items: { text: string; why: string }[] }[] };
    expect(j.failed).toBe(false);
    expect(j.repair).toBeNull();
    expect(j.unverified).toHaveLength(1);
    expect(j.listed?.[0].rule).toBe(j.unverified?.[0]);
    expect(j.listed?.[0].items.map((i) => i.text)).toEqual(['are', ' ']);
    expect(j.listed?.[0].items[1].why).toBe('a space before a comma in "waited , and"');
  }, 120_000);
});
