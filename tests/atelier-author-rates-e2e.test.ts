// tests/atelier-author-rates-e2e.test.ts — THE AUTHOR'S RATES, STEERED ON A RUN (round 3, item 3), THROUGH THE BINARY.
//
// A skill built by `atelier new` from five invented pieces (one long, four of 12 to 18 sentences; about 4.6 "I" per 1,000
// words, sentences around 15 words, 1 in 8 under 6) is asked for a long post. The writer is told the author's rates before
// the draft; the scripted draft is off all three (no "I", sentences around 7 words, a third of them five words or fewer);
// the run's graded repair targets all three, and the record says so. Against the scripted backend, offline.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { piece, WORDS } from './fixtures/author-rates-corpus.js';

const CLI = resolve('dist/cli/atelier.mjs');
const OFF = Array.from({ length: 10 }, (_, p) => Array.from({ length: 6 }, (_, j) => `${Array.from({ length: [7, 8, 4, 7, 9, 3][j] }, (_, k) => WORDS[(p + j + k) % 10]).join(' ').replace(/^./, (c) => c.toUpperCase())}.`).join(' ')).join('\n\n');

describe('the author\'s rates on a run', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  });
  afterAll(() => { backend.kill(); });

  it('told before the draft, and a draft off them has all three targeted by the graded repair', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-ar-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-ar-proj-'));
    const pieces = join(proj, 'pieces'); mkdirSync(pieces);
    [80, 12, 14, 16, 18].forEach((n, i) => { writeFileSync(join(pieces, `post-${i + 1}.md`), piece(n)); });
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' };
    const cli = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    cli('new', pieces, 'long posts in my voice', '--name', 'tides');
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: `<work>${OFF}</work>` }, emit_draft: { text: OFF } } }) });
    cli('run', 'Write a long post about the tide tables.', '--skill', 'tides', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', '--claims', 'pattern', '--no-questions', '--no-plan', '--no-taste');
    const writer = ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies.find((b) => b.includes('emit_piece')) ?? '';
    expect(writer).toContain('How I write, counted over my own pieces: about 4 to 5 \\"I\\" per 1,000 words; sentences around 15 words; about 1 in 8 under 6 words. Write at these rates.');
    const [rec] = store.listInvocations({ root: data, skillName: 'tides' });
    const g = rec.repair?.graded;
    expect(g?.values.firstSingular).toMatchObject({ before: 0, lo: 1, hi: 9, source: 'profile' });
    expect(g?.values.sentenceP50).toMatchObject({ before: 7, lo: 13.5, hi: 16.5, source: 'profile' });
    expect(g?.values.shortSentence).toMatchObject({ before: 0.333, lo: 0.068, hi: 0.158, source: 'profile' });
    // the graded repair hands all three to one draft written again, told each one's direction and distance
    const handed = rec.repair?.controller?.decisions.find((d) => d.action === 'redraft' && d.outcome === 'handed to a redraft');
    expect([...(handed?.targets ?? [])].sort()).toEqual(['firstSingular', 'sentenceP50', 'shortSentence']);
    expect(g?.redrafts).toBe(1);
    const redraft = ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies.filter((b) => b.includes('emit_piece'))[1] ?? '';
    for (const f of ['the length of your typical sentence (median, words)', 'sentences of five words or fewer', '\\"I\\", \\"my\\" and \\"me\\"']) expect(redraft).toContain(f);
  });
});
