// tests/atelier-fix-in-place-e2e.test.ts — `atelier fix` THROUGH THE BINARY: WHAT WAS NAMED CHANGES, NOTHING ELSE (round 3, items 1-2).
//
// A 30-sentence piece is written by `atelier run`; `atelier fix "<what to change>"` names two sentences of it (the reading,
// scripted, locates them). Exactly those two change, the writer's planning notes never reach the piece, the terminal and
// the record say "changed 2 of 30", and nothing outside them moved. A second fix whose writer brings back what the first
// took out is written again without it; a fix about the whole piece writes it again whole and the repair keeps the removed
// wording out. Against the scripted backend; expected values are the fixture's own strings, written out by hand.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { sentencesOf } from '../core/observers/text.js';

const CLI = resolve('dist/cli/atelier.mjs');
const S = Array.from({ length: 30 }, (_, i) => `Barge ${i + 1} carries ${['coal', 'grain', 'timber', 'salt', 'wool', 'brick'][i % 6]} past the mill before ${['dawn', 'noon', 'dusk'][i % 3]} on day ${i + 1}.`);
const PIECE = [S.slice(0, 10).join(' '), S.slice(10, 20).join(' '), S.slice(20).join(' ')].join('\n\n');
const NEW5 = 'Barge 5 now waits at the lock until the evening bell.';
const NEW17 = 'Barge 17 now waits at the lock until the evening bell.';
/** The JSON-escaped text a writer's request carries before the passage it is asked to change. */
const passage = (s: string): string => JSON.stringify(`THE PASSAGE TO CHANGE\n"""\n${s}`).slice(1, -1);

describe('atelier fix, in place, through the binary', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  });
  afterAll(() => { backend.kill(); });
  const set = (body: object) => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(body) });
  const setup = () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-fx-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-fx-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CONTEXT_READER: 'scripted' };
    const cli = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    cli('add', '--statement', 'Name the barge in every sentence.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--materiality', 'PREFERRED');
    cli('ratify-close', '--work-type', 'writing');
    cli('build', '--name', 'barges');
    return { L: { root: data, skillName: 'barges' }, cli, be: ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', '--claims', 'pattern', '--no-questions', '--no-plan', '--no-taste'] };
  };
  const latest = (L: store.StoreLayout) => store.listInvocations(L)[0];

  it('two sentences named of thirty: those two change, nothing else; the diff is shown and recorded; notes stay out', async () => {
    const { L, cli, be } = setup();
    await set({ byTool: { emit_piece: { piece: `<work>${PIECE}</work>` } } });
    cli('run', 'Write the barge log for the month.', ...be);
    expect(latest(L).output).toBe(PIECE);
    await set({ byTool: { emit_fix_scope: { sentences: [5, 17], whole: false } },
      when: [{ contains: passage(S[4]), answer: { reply: `Step 1: find the barge. Step 2: make it wait.\n<work>${NEW5}</work>` } },
        { contains: passage(S[16]), answer: { reply: `<work>${NEW17}</work>` } }] });
    const shown = cli('fix', 'barges 5 and 17 should wait at the lock', ...be);
    const fixed = latest(L);
    const after = sentencesOf(fixed.output).map((x) => x.text);
    expect(after).toHaveLength(30);
    expect([after[4], after[16]]).toEqual([NEW5, NEW17]);
    for (let i = 0; i < 30; i++) if (i !== 4 && i !== 16) expect(after[i]).toBe(S[i]);
    expect(fixed.output).not.toContain('Step 1');
    expect(fixed.work?.outside).toBe('Step 1: find the barge. Step 2: make it wait.');
    expect(fixed.fix?.diff).toEqual({ total: 30, changed: 2, outside: 0 });
    expect(fixed.fix?.sentences).toEqual([5, 17]);
    expect(fixed.fix?.spans).toEqual([{ before: S[4], after: NEW5 }, { before: S[16], after: NEW17 }]);
    expect(fixed.provenance).toBe('FIX_EVALUATION');
    expect(shown).toContain('Changed 2 of 30 sentences (you named sentences 5, 17); nothing outside them changed.');
    expect(shown).toContain(`- ${S[4]}`);
    expect(shown).toContain(`+ ${NEW5}`);
    // `atelier report <run>` shows the same
    const trace = cli('report', fixed.invocationId, '--skill', 'barges');
    expect(trace).toContain('fixed in place');
    expect(trace).toContain('changed 2 of 30 sentences; 0 outside the sentences named');
  });

  it('a second fix whose writer brings back what the first took out: written again without it; then the whole piece, kept clear by the repair', async () => {
    const { L, cli, be } = setup();
    await set({ byTool: { emit_piece: { piece: `<work>${PIECE}</work>` } } });
    cli('run', 'Write the barge log for the month.', ...be);
    await set({ byTool: { emit_fix_scope: { sentences: [5], whole: false } }, when: [{ contains: passage(S[4]), answer: { reply: `<work>${NEW5}</work>` } }] });
    cli('fix', 'barge 5 should wait at the lock', ...be);
    const first = latest(L);
    // Barge 11 also carries wool past the mill before noon: only what no other sentence still carries was taken out.
    expect(first.fix?.removed).toEqual(['Barge 5 carries wool past the', 'before noon on day 5']);
    // the writer first brings the removed wording back, then, told not to, writes it another way
    await set({ byTool: { emit_fix_scope: { sentences: [5], whole: false } }, when: [
      { containsAll: [passage(NEW5), 'do not bring back'], answer: { reply: '<work>Barge 5 waits at the lock until the evening bell, as it always has.</work>' } },
      { contains: passage(NEW5), answer: { reply: `<work>${S[4]}</work>` } }] });
    const shown = cli('fix', 'make barge 5 sound like it always waited', ...be);
    const second = latest(L);
    expect(sentencesOf(second.output)[4].text).toBe('Barge 5 waits at the lock until the evening bell, as it always has.');
    expect(second.fix?.of).toBe(first.fix?.of);
    expect(second.fix?.reintroduced).toEqual({ found: ['Barge 5 carries wool past the', 'before noon on day 5'], rewritten: 1, keptAsItWas: 0 });
    expect(second.fix?.diff).toEqual({ total: 30, changed: 1, outside: 0 });
    expect(shown).toContain('Wording an earlier fix took out came back in 1 span(s) and was written again');
    // about the whole piece: written again whole; the draft brings the removed wording back and the repair rewrites it
    await set({ byTool: { emit_fix_scope: { sentences: [], whole: true }, emit_piece: { piece: `<work>${PIECE}</work>` },
      emit_replacements: { replacements: [{ id: 1, text: 'Barge 5 rests by the mill on day 5.' }] } } });
    cli('fix', 'make the whole log shorter in tone', ...be);
    const whole = latest(L);
    expect(whole.fix).toBeUndefined();
    expect(whole.output).not.toContain(S[4]);
    expect(whole.output).toContain('Barge 5 rests by the mill on day 5.');
    // three stretches kept out: two by the first fix, "Barge 5 now waits at the" by the second
    expect(whole.corrections).toEqual({ removed: 3, reintroduced: [] });
    expect(whole.repair?.violatedBefore).toEqual(['REMOVED']);
  });
});
