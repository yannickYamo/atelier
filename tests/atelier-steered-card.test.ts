// tests/atelier-steered-card.test.ts — THE BUILD SCREEN NAMES WHAT IT STEERS.
//
// A build whose examples taught counted features lists them on its screen: each in plain words, with the band it is
// steered toward, where that band came from and why it acts. They steer every draft and are never required. The build
// shows the strongest few and points to `atelier report --skill` for the rest; the report shows every one.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderSkillCard, type SkillCard } from '../core/eval/skill-card.js';

type Steered = NonNullable<NonNullable<SkillCard['fidelity']>['steered']>;
const steered: Steered = [
  { id: 'colon', label: 'colons', unit: 'per1000', band: [-0.4, 3.2], n: 24, auc: 0.18 },
  { id: 'question', label: 'questions', unit: 'share', band: [0.051, 0.234], n: 24, auc: 0.9 },
  { id: 'sentenceCv', label: 'how much your sentence lengths vary (coefficient of variation)', unit: 'value', band: [0.412, 0.877], n: 20, auc: 0.7 },
];
const card = (s: Steered, ruled = 0): SkillCard => ({ schema: 1, skill: 'blog', skillVersion: 'a'.repeat(16), standardVersion: 'b'.repeat(16), builtAt: null,
  corpus: { pieces: 24, heldBack: 0 }, copying: false,
  rules: { total: 3, required: 2, counted: 3, read: 0, conditional: 0, needsMaterial: 0 }, claims: { instrument: 'pattern check', qualified: false, measured: null, answers: false },
  fidelity: { profile: 'c'.repeat(16), features: 53, steering: s.length + ruled, layers: [], classes: [], baseline: null, operators: false, detector: null, steered: s, ruled },
  release: null, taste: null, notMeasured: ['voice'], next: ['atelier invoke'] });

describe('the card names what it steers', () => {
  it('lists each steered feature with its band, where the band came from and why it acts, strongest first', () => {
    const text = renderSkillCard(card(steered), 140);
    expect(text).toContain('STEERED TOWARD YOUR RANGE ON EVERY DRAFT, NEVER REQUIRED');
    const lines = text.split('\n');
    const at = lines.findIndex((l) => l.includes('STEERED TOWARD'));
    // questions separate in 90 of 100 pairs, colons in 82, sentence variation in 70: that order
    expect(lines[at + 1]).toBe('    bands read from your 24 pieces; each acts because it tells your pieces from the model\'s drafts');
    expect(lines[at + 2]).toBe('    questions · 5% to 23% · more than the model\'s drafts (90 of 100 pairs)');
    expect(lines[at + 3]).toBe('    colons · 0 to 3.2 per 1,000 words · fewer than the model\'s drafts (82 of 100 pairs)');
    // a long line wraps at a separator; read whole, it says the same
    const whole = text.replace(/\n {22}/g, ' · ');
    expect(whole).toContain('how much your sentence lengths vary (coefficient of variation) · 0.41 to 0.88 · higher than the model\'s drafts (70 of 100 pairs) · read from 20 of your 24 pieces');
  });

  it('the build shows a few and points to the report for the rest; the report shows every one', () => {
    const many: Steered = Array.from({ length: 20 }, (_, k) => ({ id: `f${k}`, label: `feature ${k}`, unit: 'per1000' as const, band: [1, 2] as const, n: 24, auc: 0.6 + k / 100 }));
    const short = renderSkillCard(card(many), 110, { steered: 6 });
    const section = (t: string): string[] => { const ls = t.split('\n'); const i = ls.findIndex((l) => l.includes('STEERED TOWARD')); const out: string[] = []; for (let k = i; k < ls.length && ls[k].trim(); k++) out.push(ls[k]); return out; };
    const s = section(short);
    expect(s.length).toBeLessThanOrEqual(12);
    expect(s.filter((l) => /^ {4}feature \d+ · /.test(l))).toHaveLength(6);
    expect(s[s.length - 1]).toBe('    and 14 more: atelier report --skill blog');
    expect(s[2]).toMatch(/^ {4}feature 19 · /);
    const full = section(renderSkillCard(card(many)));
    expect(full.filter((l) => /^ {4}feature \d+ · /.test(l))).toHaveLength(20);
    expect(full.join('\n')).not.toMatch(/more: atelier report/);
  });

  it('a feature the owner made a rule is said once, as a rule, not as a preference', () => {
    expect(renderSkillCard(card(steered, 2))).toContain('2 more steer as your own rules, counted on every output above');
    expect(renderSkillCard(card(steered))).not.toMatch(/as your own rules/);
  });

  it('with nothing steered, no section', () => {
    expect(renderSkillCard(card([]))).not.toContain('STEERED TOWARD');
  });
});

// ── the build screen, through the shipped binary ─────────────────────────────────────────────────
// The blog example (six pieces) and a single author's twenty-four, each built against a scripted model whose drafts are
// one flat wall of a paragraph: what can be read off the pieces steers, and is named; what cannot, is not claimed.
const CLI = resolve('dist/cli/atelier.mjs');
const SENTENCES = [
  'We shipped the change on a Tuesday.', 'Nobody noticed for a week.', 'Then the support queue doubled.',
  'Why did it take so long?', 'The cause was a cache that never expired.', 'We had read the docs and still missed it.',
  'The fix took an hour.', 'Finding it took four days.', 'I keep a list of these now.', 'Most of it is boring on purpose.',
  'Boring is what lets you sleep.', 'Was the rollback worth the fight?', 'We kept the flag and moved on.', 'It was the right call, mostly.',
  'The graph went flat by Friday.', 'That silence was the real signal.',
];
const sentence = (i: number): string => SENTENCES[i % SENTENCES.length];
/** One author's piece: short paragraphs of one to three sentences, a question now and then. */
const authorPiece = (k: number): string => `# Note ${k + 1}\n\n${Array.from({ length: 12 + (k % 5) }, (_, p) =>
  Array.from({ length: 1 + ((p + k) % 3) }, (_, q) => sentence(k * 7 + p * 3 + q)).join(' ')).join('\n\n')}`;
/** The model's draft on the same stories: every paragraph two joined sentences, no question. */
const JOINED = [
  'We shipped the change on a Tuesday, and nobody noticed for a week.', 'Then the support queue doubled, and we looked again.',
  'The cause was a cache that never expired, which we had missed.', 'The fix took an hour, but finding it took four days.',
  'I keep a list of these now, and most of it is boring.', 'We kept the flag and moved on, which was the right call.',
  'The graph went flat by Friday, and that was the signal.',
];
const wall = `# Note\n\n${Array.from({ length: 10 }, (_, p) => `${JOINED[(p * 2) % JOINED.length]} ${JOINED[(p * 2 + 1) % JOINED.length]}`).join('\n\n')}`;

describe('through the binary: the build screen lists what it steers', () => {
  let backend: ChildProcess; let port = 0;
  const data = mkdtempSync(join(tmpdir(), 'atelier-steer-data-'));
  const proj = mkdtempSync(join(tmpdir(), 'atelier-steer-proj-'));
  const blogProj = mkdtempSync(join(tmpdir(), 'atelier-steer-blog-'));
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
      emit_factors: { factors: [] }, emit_matches: { matches: [] }, emit_observation: { applicable: false, present: false, why: 'n/a' },
      emit_piece: { piece: wall }, emit_text: { text: wall },
    } }) });
    cpSync(resolve('examples/blog/posts'), join(blogProj, 'posts'), { recursive: true });
    mkdirSync(join(proj, 'notes'), { recursive: true });
    for (let k = 0; k < 24; k++) writeFileSync(join(proj, 'notes', `note-${String(k + 1).padStart(2, '0')}.md`), authorPiece(k));
  });
  afterAll(() => { backend.kill(); });
  const run = (...args: string[]): string => runIn(proj, ...args);
  const runIn = (dir: string, ...args: string[]): string => execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
    encoding: 'utf8', cwd: dir, env: { ...process.env, ANTHROPIC_API_KEY: '', ATELIER_DATA: data, ATELIER_PROJECT_DIR: dir, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' } });
  /** The card's lines, a wrapped line read whole. */
  const linesOf = (out: string): string[] => out.replace(/\n {22}/g, ' · ').split('\n');
  const LINE = /^ {4}\S.* · [-0-9.%]+ to [-0-9.%]+(?: per 1,000 words)? · (?:(?:more|fewer|higher|lower) than the model's drafts \(\d+ of 100 pairs\)|your own rate, steered on any miss)(?: · read from (?:\d+ of )?your \d+ pieces?)?$/;

  it('a single author\'s 24 pieces: the strongest steered features, with bands, where they came from and why', () => {
    const out = run('new', join(proj, 'notes'), 'write a note like these', '--name', 'notes', '--accept', '--no-ai-assist');
    const lines = linesOf(out);
    const at = lines.findIndex((l) => l === '  STEERED TOWARD YOUR RANGE ON EVERY DRAFT, NEVER REQUIRED');
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 1]).toMatch(/^ {4}bands read from (?:\d+ of )?your \d+ pieces; (?:each acts because it tells your pieces from the model's drafts|each acts for the reason its line gives)$/);
    const section: string[] = [];
    for (let k = at; k < lines.length && lines[k].trim(); k++) section.push(lines[k]);
    const listed = section.filter((l) => LINE.test(l));
    const steering = Number(/features\s+\d+ measured on your pieces, (\d+) steer drafts/.exec(out)?.[1] ?? NaN);
    const ruled = Number(/(\d+) more steer as your own rules/.exec(out)?.[1] ?? 0);
    expect(steering - ruled).toBeGreaterThan(0);
    expect(listed.length).toBe(Math.min(6, steering - ruled));
    expect(section.length).toBeLessThanOrEqual(12);
    if (steering - ruled > 6) expect(section).toContain(`    and ${steering - ruled - 6} more: atelier report --skill notes`);
    // the report lists every one
    const report = linesOf(run('report', '--skill', 'notes'));
    expect(report.filter((l) => LINE.test(l))).toHaveLength(steering - ruled);
    expect(report.join('\n')).not.toMatch(/more: atelier report --skill notes/);
  }, 180_000);

  it('the blog example\'s six pieces read no band that tells them from the model: only the author\'s own rates steer, said as theirs', () => {
    const out = runIn(blogProj, 'new', join(blogProj, 'posts'), 'write a post like these', '--name', 'blog', '--accept', '--no-ai-assist');
    // one piece is reserved: the three rates are read over the five left (core/fidelity/profile.ts, `AUTHOR_RATES`)
    expect(out).toMatch(/features\s+3 measured on your pieces, 3 steer drafts/);
    expect(out).toContain('bands read from your 5 pieces; each is your own rate, read over all your pieces');
    for (const label of ['"I", "my" and "me"', 'the length of your typical sentence (median, words)', 'sentences of five words or fewer']) expect(out).toMatch(new RegExp(`${label.replace(/[()]/g, '\\$&').replace(/"/g, '\\\\?"')} · .* · your own rate, steered on any miss`));
    expect(out).not.toContain('tells your pieces from the model');
  }, 180_000);
});
