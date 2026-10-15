// tests/atelier-short-work.test.ts — SHORT PIECES ARE FINISHED WORK, AND WHAT VERIFY SAYS ABOUT THEM IS WHOLE.
//
// Twenty posts on X build a skill on the default path, with a model, exactly as they do with none: the floor that
// drops a stub from a folder of long pieces does not refuse short work, and the build carries their shape bands and a
// rate pooled over them; a held-back piece passes and a bad one is blocked. `verify` names the check that blocked a
// text in its text output, and its profile reads a pooled rate as the card states it, never "n/a". The shape screen
// reads a heading's first word, says "1 sentence", and never states a habit band as if it held beside a lower limit.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { firstWordCaseOf, shapeOf, SHAPE } from '../core/observers/shape.js';
import { shapeBandRules } from '../core/observers/short-form.js';
import { GOOD, BAD } from './fixtures/shortform.js';

const CLI = resolve('dist/cli/atelier.mjs');

describe('the shape of a short piece', () => {
  it('a piece opening on a markdown heading is read from the heading\'s first word, not its marker', () => {
    expect(firstWordCaseOf('# A cosy launch\n\nWe shipped.')).toBe('capital');
    expect(shapeOf('## a quiet week\n\nnothing broke.').firstWord).toBe('lower');
    expect(firstWordCaseOf('#buildinpublic is a tag.')).toBe('symbol');
  });
  it('one of anything is said in the singular', () => {
    expect(SHAPE.observe('One sentence only here.', { shape: ['sentences'], max: 3 }).detail).toBe('1 sentence (at most 3)');
    expect(SHAPE.observe('One sentence only here.', { shape: ['sentences'], min: 2, max: 3 }).detail).toBe('1 sentence (2 to 3): short by 1');
    const one = shapeBandRules(['A single sentence of some length here.', 'Another single sentence of its own.', 'One more single sentence to read.']);
    const sentences = one.find((b) => b.shape === 'sentences');
    expect(sentences?.statement).toMatch(/^My pieces run 1 sentence;/);
  });
  it('a habit band that runs past a lower platform limit says the limit governs', () => {
    const band = shapeBandRules(GOOD.slice(0, 15), { limit: 100 }).find((b) => b.shape === 'characters' && !b.platform);
    expect(band?.statement).toMatch(/a new piece stays between \d+ and \d+; the platform's limit of 100 characters governs\.$/);
  });
});

describe('through the binary', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const x = /PORT (\d+)/.exec(d.toString()); if (x) ok(Number(x[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
    const factor = { description: 'Close on the shortest sentence.', appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['t00.md'], wouldBeAbsentIf: 'the opposite shows', needsFromUser: '', quote: '' };
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
      emit_factors: { factors: [factor] }, emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }] },
      emit_observation: { applicable: true, present: true, why: 'seen' }, emit_piece: { piece: GOOD[0] } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  const project = (tag: string) => {
    const data = mkdtempSync(join(tmpdir(), `atelier-sw-${tag}-data-`)); const proj = mkdtempSync(join(tmpdir(), `atelier-sw-${tag}-proj-`));
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    mkdirSync(join(proj, 'posts'));
    GOOD.forEach((t, i) => { writeFileSync(join(proj, 'posts', `t${String(i).padStart(2, '0')}.md`), t); });
    const run = (args: readonly string[], keyed = false): { code: number; out: string } => {
      const all = [...args, ...(keyed ? ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'] : [])];
      try { return { code: 0, out: execFileSync('sh', ['-c', `node "${CLI}" ${all.map((x) => `'${x.replace(/'/g, '\'\\\'\'')}'`).join(' ')} 2>&1`], { encoding: 'utf8', cwd: proj, env }) }; } catch (e) {
        const err = e as { status: number; stdout: string }; return { code: err.status, out: err.stdout };
      }
    };
    return { proj, run };
  };

  it('twenty posts build on the default path with a model: shape bands, a pooled rate, a held piece passes, a bad one is blocked', () => {
    const { proj, run } = project('keyed');
    const first = run(['new', 'posts', 'posts on X about building a database tool', '--class', 'x-post', '--name', 'tw'], true);
    expect(first.out).not.toMatch(/too short to read as one/);
    expect(first.out).not.toMatch(/Too short to read as finished work/);
    expect(first.code, first.out).toBe(0);
    expect(first.out).toMatch(/Held back before anything reads them/);
    expect(first.out).toMatch(/\d+ rule\(s\) of shape and pooled rate read from your short pieces/);
    expect(first.out).toMatch(/per 100 words in my pieces/);
    const built = run(['new', 'posts', '--accept'], true);
    expect(built.code).toBe(0);
    expect(existsSync(join(proj, '.claude', 'skills', 'tw', 'SKILL.md'))).toBe(true);
    // A new piece in the author's manner (an example itself would be blocked as copied).
    writeFileSync(join(proj, 'held.md'), 'Fixed the slow export today. It was one missing index on a table nobody owns. Check the plan before you blame the code.');
    const held = run(['verify', '--skill', 'tw', 'held.md', '--allow-unsourced']);
    expect(held.code, held.out).toBe(0);
    let blocked = 0;
    for (const [i, b] of BAD.entries()) { writeFileSync(join(proj, `bad${i}.md`), b.text); if (run(['verify', '--skill', 'tw', `bad${i}.md`, '--allow-unsourced']).code === 1) blocked++; }
    expect(blocked).toBeGreaterThanOrEqual(8);
  }, 300_000);

  it('without a class, pieces short as a set are examples too', () => {
    const { proj, run } = project('plain');
    const first = run(['new', 'posts', 'short posts about building a database tool', '--name', 'tw'], true);
    expect(first.code, first.out).toBe(0);
    expect(first.out).not.toMatch(/Too short to read as finished work/);
    expect(first.out).toMatch(/\d+ rule\(s\) of shape and pooled rate read from your short pieces/);
    expect(run(['new', 'posts', '--accept'], true).code).toBe(0);
    expect(existsSync(join(proj, '.claude', 'skills', 'tw', 'SKILL.md'))).toBe(true);
  }, 300_000);

  it('verify names what blocked a text in its text output', () => {
    const { proj, run } = project('verify');
    expect(run(['new', 'posts', '--no-model', '--name', 'tw', '--class', 'x-post']).code).toBe(0);
    // A text copied from one of the examples is blocked by the copying check, which no rule line names.
    writeFileSync(join(proj, 'copied.md'), GOOD[3]);
    const v = run(['verify', '--skill', 'tw', 'copied.md', '--allow-unsourced']);
    expect(v.code).toBe(1);
    expect(v.out).toMatch(/^BLOCKED · /m);
    expect(v.out).toMatch(/^ {2}✗ No passage is lifted from one of your examples: a run of \d+ words is shared/m);
  }, 300_000);

  it('verify --profile on a build with no model reads a pooled rate as the rule states it, never "n/a"', () => {
    const { proj, run } = project('profile');
    expect(run(['new', 'posts', '--no-model', '--name', 'tw', '--class', 'x-post']).code).toBe(0);
    writeFileSync(join(proj, 'own.md'), 'Fixed the slow export today. It was one missing index on a table nobody owns. Check the plan before you blame the code.');
    const p = run(['verify', '--skill', 'tw', 'own.md', '--allow-unsourced', '--profile']);
    expect(p.out).toMatch(/^profile \(/m);
    expect(p.out).not.toMatch(/n\/a {2}your range any value/);
    const rates = [...p.out.matchAll(/about ([\d.]+) per 100 words in my pieces/g)].map((m) => m[1]);
    expect(rates.length).toBeGreaterThan(0);
    for (const r of rates) expect(p.out).toContain(`your rate about ${r} per 100 words`);
  }, 300_000);
});
