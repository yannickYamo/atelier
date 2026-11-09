// THE DIRECT WRITER (cli/direct.ts): the author's pieces of the kind asked for, the material, the task, a draft as prose,
// one self-review, and the person's own rules and corrections where there are some. The parts that decide what the
// writer reads are tested as functions (which pieces, what fits, what a reading may answer, what each turn says, what a
// person's edit teaches); the run is tested through the shipped binary on the scripted backend: what each call carried,
// what the record says, and the ways out of it (`--pipeline legacy`, `--no-review`, a test run). Then `atelier keep`:
// a kept piece is written from first, and the sentences the person changed are shown to the next review as theirs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { catalogueOf, withinBudget, lexicalOrder, titleOf } from '../core/direct/pieces.js';
import { PIECE_ROUTE } from '../core/direct/route.js';
import { piecesBlock, taskBlock, reviewAsk, rulesBlock, EDITS_SHOWN, RULES_SHOWN } from '../core/direct/prompt.js';
import { editPairs, correctionsOf, sentencesOf, MAX_PAIRS, type KeptPiece } from '../core/direct/kept.js';
import { directWhyNot, builtPieces } from '../cli/direct.js';
import { argv } from '../cli/runtime.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import type { Voice } from '../core/compiler/voice.js';

// ── THE PIECES ────────────────────────────────────────────────────────────────────────────────────────────────────
describe('the catalogue and what fits', () => {
  it('kept pieces come first, a piece held twice is listed once, and ids follow the order', () => {
    const c = catalogueOf([{ text: '# A\n\nbuilt one', request: ' asked A ' }, { text: '# B\n\nbuilt two', request: null }], [{ text: '# B\n\nbuilt  two', request: 'kept B' }]);
    expect(c.map((p) => [p.id, titleOf(p.text), p.kept, p.request])).toEqual([['p1', 'B', true, 'kept B'], ['p2', 'A', false, 'asked A']]);
  });
  it('the first piece in the order is taken whole whatever its length; the rest only as they fit; unknown ids are skipped', () => {
    const c = catalogueOf([{ text: 'x'.repeat(500), request: null }, { text: 'y'.repeat(300), request: null }, { text: 'z'.repeat(100), request: null }]);
    expect(withinBudget(c, ['p1', 'p9', 'p2', 'p3', 'p1'], 200).map((p) => p.id)).toEqual(['p1']);
    expect(withinBudget(c, ['p2', 'p3', 'p1'], 450).map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(withinBudget(c, ['p9'], 450)).toEqual([]);
  });
  it('the floor ranks by the request\'s rare words: a word every piece holds decides nothing', () => {
    const c = catalogueOf([
      { text: '# Notes apps compared\n\nObsidian against Bear, the sync and the export, side by side.', request: null },
      { text: '# Why I quit\n\nThe sync was the reason, and the reason was me.', request: null },
      { text: '# On sync\n\nEvery sync tool fails the same way.', request: null }]);
    expect(lexicalOrder(c, 'Compare Obsidian and Bear for sync')[0]).toBe('p1');
  });
});

describe('which pieces a request is written from: a reading, grounded', () => {
  const pieces = catalogueOf([{ text: '# One\n\na', request: null }, { text: '# Two\n\nb', request: 'a comparison' }]);
  const input = { request: 'Compare two tools', material: '', pieces };
  it('one piece or none leaves nothing to choose: decided by code', () => {
    expect(PIECE_ROUTE.decide?.({ ...input, pieces: pieces.slice(0, 1) })).toEqual({ order: ['p1'], kind: null });
    expect(PIECE_ROUTE.decide?.(input)).toBeNull();
  });
  it('an id not in the catalogue is dropped, a repeat once; nothing grounded is no answer', () => {
    expect(PIECE_ROUTE.ground({ asks_for: ' a comparison ', pieces: ['p9', 'p2', 'p2', 'p1'] }, input)).toEqual({ order: ['p2', 'p1'], kind: 'a comparison' });
    expect(PIECE_ROUTE.ground({ asks_for: 'x', pieces: ['p9'] }, input)).toBeNull();
    expect(PIECE_ROUTE.ground({ asks_for: 'x' }, input)).toBeNull();
  });
  it('the catalogue it reads names each piece by title, opening and the request it answered; never a piece whole', () => {
    const long = catalogueOf([{ text: `# Long\n\n${'word '.repeat(400)}TAIL`, request: null }, { text: '# Two\n\nb', request: 'a comparison' }]);
    const p = PIECE_ROUTE.prompt({ ...input, pieces: long });
    expect(p).toContain('Title: Long'); expect(p).toContain('Request it answered: a comparison');
    expect(p).not.toContain('TAIL');
  });
});

// ── WHAT EACH TURN SAYS ───────────────────────────────────────────────────────────────────────────────────────────
describe('what the writer and the review are sent', () => {
  const pieces = catalogueOf([{ text: '# A post\n\nThe body.', request: 'Write "a" post' }]);
  it('the pieces whole, with the request each answered; the material and the task apart', () => {
    const s = piecesBlock(pieces);
    expect(s).toContain('<piece n="1" request="Write \'a\' post">\n# A post\n\nThe body.\n</piece>');
    const t = taskBlock({ material: [{ name: 'notes', text: ' the notes ' }], task: ' the task ' });
    expect(t).toBe('The material for this piece:\n\n<material name="notes">\nthe notes\n</material>\n\nThe task:\n\n<task>\nthe task\n</task>');
  });
  it('the author\'s own rules only where they stated some, at most RULES_SHOWN, and the review is told to hold them', () => {
    expect(rulesBlock([])).toBe(''); expect(rulesBlock(undefined)).toBe('');
    const many = Array.from({ length: RULES_SHOWN + 5 }, (_, i) => `Rule ${i + 1}.`);
    const b = rulesBlock(many);
    expect(b).toContain('- Rule 1.'); expect(b).toContain(`- Rule ${RULES_SHOWN}.`); expect(b).not.toContain(`- Rule ${RULES_SHOWN + 1}.`);
    expect(taskBlock({ material: [], task: 't', rules: ['No em dashes.'] })).toContain('<rules>\n- No em dashes.\n</rules>');
    expect(reviewAsk('d', { material: [], rules: ['No em dashes.'] })).toContain('anything that breaks one of the author\'s rules');
    expect(reviewAsk('d', { material: [] })).not.toContain('rules');
  });
  it('the review sees the draft, what it must come from, and the person\'s corrections as theirs, at most EDITS_SHOWN', () => {
    const edits = Array.from({ length: EDITS_SHOWN + 2 }, (_, i) => ({ before: `Old ${i}.`, after: i === 0 ? '' : `New ${i}.` }));
    const r = reviewAsk(' the draft ', { material: [{ name: 'n', text: 't' }], edits });
    expect(r).toContain('<draft>\nthe draft\n</draft>');
    expect(r).toContain('Fix anything they would not write, and any figure, name or story that does not come from the material and the task. Change only what needs changing; leave the rest of the draft as it is.');
    expect(r).toContain('- "Old 0." was cut'); expect(r).toContain('- "Old 1." became "New 1."');
    expect(r).not.toContain(`Old ${EDITS_SHOWN}.`);
    expect(reviewAsk('d', { material: [] })).toContain('that does not come from the task.');
  });
});

// ── WHAT A PERSON'S EDIT TEACHES ──────────────────────────────────────────────────────────────────────────────────
describe('the edits read off a kept piece: by code, sentence by sentence', () => {
  const delivered = 'We shipped the new sync engine today. It is faster in every way. Thanks to the team for the push. More soon.';
  it('a text kept as delivered teaches nothing', () => { expect(editPairs(delivered, delivered)).toEqual([]); });
  it('one sentence for one between unchanged neighbours is that sentence changed, however few words it kept', () => {
    const kept = 'We shipped the new sync engine today. It cut sync time from 9 seconds to 2 on my laptop. Thanks to the team for the push. More soon, and try it.';
    expect(editPairs(delivered, kept)).toEqual([
      { before: 'It is faster in every way.', after: 'It cut sync time from 9 seconds to 2 on my laptop.' },
      { before: 'More soon.', after: 'More soon, and try it.' }]);
  });
  it('a sentence cut is cut; a sentence added is no pair; several for several are paired by shared words', () => {
    expect(editPairs(delivered, 'We shipped the new sync engine today. It is faster in every way. More soon.')).toEqual([{ before: 'Thanks to the team for the push.', after: '' }]);
    expect(editPairs(delivered, `${delivered} Try it tonight.`)).toEqual([]);
    expect(editPairs('Intro. One thing about sync speed. Unrelated filler line. Outro.', 'Intro. A thing about sync speed today. Outro.'))
      .toEqual([{ before: 'One thing about sync speed.', after: 'A thing about sync speed today.' }, { before: 'Unrelated filler line.', after: '' }]);
  });
  it('a heading and a list item are sentences of their own, and the pairs stop at MAX_PAIRS', () => {
    expect(sentencesOf('# Title\n- one item\n- two item\n\nA line. Another.')).toEqual(['# Title', '- one item', '- two item', 'A line.', 'Another.']);
    const long = Array.from({ length: MAX_PAIRS + 5 }, (_, i) => `Sentence number ${i} here.`).join(' ');
    expect(editPairs(long, 'Nothing alike at all.').length).toBe(MAX_PAIRS);
  });
  it('the corrections the review is shown: the newest kept piece\'s first', () => {
    const k = (at: string, before: string): KeptPiece => ({ id: at, at, request: null, text: '', from: null, edits: [{ before, after: '' }] });
    expect(correctionsOf([k('2026-01-01', 'old'), k('2026-03-01', 'new')], 1)).toEqual([{ before: 'new', after: '' }]);
  });
});

// ── WHICH PATH A RUN TAKES ────────────────────────────────────────────────────────────────────────────────────────
describe('which path a run takes (directWhyNot), with no flag on the command line', () => {
  const std = { requirements: [], latitude: { level: 'GROUNDED' } } as unknown as StandardVersion;
  const voice = { wholePieces: [{ text: '# A\n\nbody', request: null }] } as unknown as Voice;
  const base = { voice, std, contract: false, strict: false };
  const withArgs = <T>(args: string[], f: () => T): T => { argv.push(...args); try { return f(); } finally { argv.splice(argv.length - args.length, args.length); } };
  it('a skill built from pieces, nothing else asked: direct', () => { expect(directWhyNot(base)).toBeNull(); });
  it('what only the compiled path can hold takes it, and says why', () => {
    expect(directWhyNot({ ...base, contract: true })).toMatch(/output contract/);
    expect(directWhyNot({ ...base, std: null })).toMatch(/no standard/);
    expect(directWhyNot({ ...base, strict: true })).toMatch(/strict delivery/);
    expect(directWhyNot({ ...base, shortForm: true })).toMatch(/short piece/);
    // a request held strict ("use only these figures") stays direct: its figures are held by the claim check at that level
    expect(directWhyNot({ ...base, held: 'STRICT' })).toBeNull();
    // a skill built from one example writes from it
    expect(directWhyNot({ ...base, voice: null, exemplar: { text: '# Memo\n\nbody' } })).toBeNull();
    expect(builtPieces(null, { text: '# Memo\n\nbody', request: 'Write the pricing memo.' })).toEqual([{ text: '# Memo\n\nbody', request: 'Write the pricing memo.' }]);
    expect(builtPieces(voice, { text: 'ignored' })).toEqual([{ text: '# A\n\nbody', request: null }]);
    expect(directWhyNot({ ...base, std: { ...std, latitude: { level: 'STRICT' } } as unknown as StandardVersion })).toMatch(/strict skill/);
    expect(directWhyNot({ ...base, voice: { ...voice, form: 'REPLY' } as unknown as Voice })).toMatch(/answers/);
    expect(directWhyNot({ ...base, voice: null })).toMatch(/none of the author's pieces/);
  });
  it('--pipeline direct overrides a strict skill and a reply skill, never strict delivery or a short piece', () => {
    withArgs(['--pipeline', 'direct'], () => {
      expect(directWhyNot({ ...base, held: 'STRICT' })).toBeNull();
      expect(directWhyNot({ ...base, voice: { ...voice, form: 'REPLY' } as unknown as Voice })).toBeNull();
      expect(directWhyNot({ ...base, strict: true })).toMatch(/strict delivery/);
      expect(directWhyNot({ ...base, shortForm: true })).toMatch(/short piece/);
    });
  });
  it('an unknown pipeline is refused before anything else is read; legacy and the compiled flags take the compiled path', () => {
    withArgs(['--pipeline', 'fast'], () => { expect(() => directWhyNot({ ...base, contract: true })).toThrow(/--pipeline takes direct or legacy/); });
    withArgs(['--pipeline', 'legacy'], () => { expect(directWhyNot(base)).toMatch(/--pipeline legacy/); });
    for (const f of ['--candidate', '--correcting', '--fix-of', '--corrections-of', '--moves', '--deep']) withArgs([f], () => { expect(directWhyNot(base), f).not.toBeNull(); });
    withArgs(['--drafts=3'], () => { expect(directWhyNot(base)).toMatch(/--drafts is read by the compiled path/); });
  });
});

// ── THROUGH THE BINARY ────────────────────────────────────────────────────────────────────────────────────────────
const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const setBackend = (payload: unknown): Promise<Response> => fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify(payload) });
interface Body { tools?: { function?: { name?: string } }[]; messages: { role: string; content: string }[]; max_tokens?: number }
const bodies = async (): Promise<Body[]> => ((await (await fetch(`${url()}/__log`)).json()) as { bodies: string[] }).bodies.map((b) => JSON.parse(b) as Body);
const textOf = (b: Body): string => b.messages.map((m) => m.content).join('\n');
/** The prose calls (no tool) served since `from` log entries: the log keeps every call of the backend's life. */
const plainSince = async (from: number): Promise<Body[]> => (await bodies()).slice(from).filter((b) => !b.tools?.length);
const mark = async (): Promise<number> => (await bodies()).length;

const COMPARE = (n: number): string => `# Obsidian against Bear, round ${n}\n\nI ran both for a month on the same notes. Obsidian keeps plain files; Bear keeps a database you cannot open. Sync on Bear was faster, export on Obsidian was honest.\n\n## Where each one wins\n\nBear wins on the phone. Obsidian wins the day you leave. That is the whole trade, and I would make it again.\n`;
const ESSAY = '# Why I stopped chasing tools\n\nFor years I changed notes apps every spring, as if the next one would make me think better. It never did. The habit was the problem, and the habit was mine.\n\nWhat changed was small: I stopped reading launch posts. The notes stayed where they were, and so did I.\n';
const PERSONA = { points: [{ aspect: 'close', description: 'Closes on a short plain sentence.', frequency: 'OFTEN', quote: 'That is the whole trade.' }] };

interface Seed { data: string; proj: string; run: (...a: string[]) => { code: number; out: string } }
const seed = (files: Readonly<Record<string, string>>, extraEnv: Readonly<Record<string, string>> = {}): Seed => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-direct-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-direct-proj-'));
  for (const [name, text] of Object.entries(files)) { mkdirSync(join(proj, name, '..'), { recursive: true }); writeFileSync(join(proj, name), text); }
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ...extraEnv };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  if (!extraEnv.ATELIER_CONTEXT_READER) delete env.ATELIER_CONTEXT_READER;
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  return { data, proj, run };
};
interface Direct { version: string; asked: string; from: number; pieces: { id: string; title: string; kept: boolean }[]; route: { by: string; kind: string | null }; effort: string; review: { ran: boolean; why?: string }; corrections: number }
interface Out { output: string; invocationId: string; direct?: Direct | null; eval?: unknown; certificate?: unknown }
const jsonOf = (out: string): Out => JSON.parse(out.slice(out.indexOf('\n{') + 1)) as Out;
const FILES = { 'posts/compare-1.md': COMPARE(1), 'posts/compare-2.md': COMPARE(2), 'posts/essay.md': ESSAY, 'notes.md': 'Notes: Logseq is local-first and free; Craft is paid and syncs through its own cloud.' };
const DRAFT = '# Logseq against Craft\n\nA first draft.';
const REVIEWED = '# Logseq against Craft\n\nI ran both for a week on the same notes. Logseq is local-first and free. Craft is paid and syncs through its own cloud. That is the whole trade.';

describe('a run through the binary, written the direct way', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('the claim reader reads the delivered piece once: nothing is cut on this path, so a second read buys nothing', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const s = seed(FILES, { ATELIER_CLAIMS: 'model', ATELIER_CLAIMS_MODEL: 'scripted' });
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED], emit_specifics: { specifics: [] } } });
    const m0 = await mark();
    const r = s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft for my notes.', '--with', 'notes=notes.md', '--json', ...BACKEND());
    expect([0, 1], r.out).toContain(r.code);
    expect(jsonOf(r.out).direct).toBeTruthy();
    const reads = (await bodies()).slice(m0).filter((b) => b.tools?.some((t) => t.function?.name === 'emit_specifics'));
    expect(reads.length).toBe(1);
  }, 120_000);

  it('a count in words the claim reader missed is still listed beside the piece', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const s = seed(FILES, { ATELIER_CLAIMS: 'model', ATELIER_CLAIMS_MODEL: 'scripted' });
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    const COUNTED = `${REVIEWED} We moved eleven or twelve teams over to it.`;
    await setBackend({ byTool: { __plain: [DRAFT, COUNTED], emit_specifics: { specifics: [] } } });
    const r = s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft for my notes.', '--with', 'notes=notes.md', '--json', ...BACKEND());
    const j = jsonOf(r.out) as Out & { toCheck: unknown };
    expect(JSON.stringify(j.toCheck)).toContain('We moved eleven or twelve teams over to it.');
  }, 120_000);

  it('the draft and the review are prose with no tool; the pieces travel whole; the reviewed piece is delivered; the record says so', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const s = seed(FILES);
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED] } });
    const m0 = await mark();
    const r = s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft for my notes.', '--with', 'notes=notes.md', '--json', '--claims', 'pattern', ...BACKEND());
    expect([0, 1], r.out).toContain(r.code);
    const j = jsonOf(r.out);
    expect(j.output).toBe(REVIEWED);
    expect(j.direct).toMatchObject({ version: '1', asked: 'Compare Logseq and Craft for my notes.', from: 3, effort: 'high', review: { ran: true }, corrections: 0 });
    // no reader set up: the shared-words floor chose, said as such, and the comparisons rank above the essay
    expect(j.direct?.route.by).toBe('floor');
    expect(j.direct?.pieces[0].title).toMatch(/^Obsidian against Bear/);
    expect(j.eval).toBeTruthy();
    const plain = await plainSince(m0);
    expect(plain.length).toBe(2);
    // the writer reads the pieces whole, the material and the task; the review reads the draft against the same
    expect(textOf(plain[0])).toContain(COMPARE(1).trim()); expect(textOf(plain[0])).toContain('<material name="notes">'); expect(textOf(plain[0])).toContain('<task>\nCompare Logseq and Craft');
    expect(textOf(plain[1])).toContain(`<draft>\n${DRAFT}\n</draft>`); expect(textOf(plain[1])).toContain(COMPARE(1).trim());
    // the record is a run like any other: the first draft kept, the record read back by the store
    const rec = store.getInvocation({ root: s.data, skillName: 'posts' }, j.invocationId);
    expect(rec?.direct?.version).toBe('1'); expect(rec?.repair?.draft).toBe(DRAFT); expect(rec?.settings?.flags.testRun).toBeUndefined();

    // A TEST RUN is marked as one, so nothing that learns from runs reads it
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED] } });
    const t = jsonOf(s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft.', '--json', '--claims', 'pattern', '--test-run', ...BACKEND()).out);
    expect(store.getInvocation({ root: s.data, skillName: 'posts' }, t.invocationId)?.settings?.flags.testRun).toBe(true);

    // --no-review: one call, the draft delivered, and the record says why
    await setBackend({ byTool: { __plain: [DRAFT] } });
    const m1 = await mark();
    const n = jsonOf(s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft.', '--json', '--claims', 'pattern', '--no-review', ...BACKEND()).out);
    expect(n.output).toBe(DRAFT); expect(n.direct?.review).toEqual({ ran: false, why: 'turned off (--no-review)' });
    expect((await plainSince(m1)).length).toBe(1);

    // --pipeline legacy: the compiled path, with no direct record; an unknown pipeline is refused
    await setBackend({ byTool: { emit_piece: { piece: REVIEWED } } });
    const l = jsonOf(s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft.', '--json', '--claims', 'pattern', '--pipeline', 'legacy', '--no-questions', ...BACKEND()).out);
    expect(l.direct ?? null).toBeNull();
    const bad = s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft.', '--pipeline', 'fast', ...BACKEND());
    expect(bad.code).not.toBe(0); expect(bad.out).toContain('--pipeline takes direct or legacy');
  }, 180_000);

  it('a reading of the request chooses the pieces when one is set up; an answer it cannot ground falls to the floor', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const s = seed(FILES, { ATELIER_CONTEXT_READER: 'scripted' });
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    const essayId = (j: Out): string | undefined => j.direct?.pieces.find((p) => p.title.startsWith('Why I stopped'))?.id;
    // the reading names the essay alone: only the essay is shown
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED], emit_piece_route: { asks_for: 'an essay', pieces: ['p1', 'p2', 'p3'].slice(2) } } });
    const first = jsonOf(s.run('invoke', '--skill', 'posts', 'Write an essay on why I stopped changing tools.', '--json', '--claims', 'pattern', ...BACKEND()).out);
    expect(first.direct?.route).toMatchObject({ by: 'model', kind: 'an essay' });
    expect(first.direct?.pieces.length).toBe(1); expect(first.direct?.pieces[0].id).toBe('p3');
    // ids the catalogue does not hold: the floor, and every piece in its order
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED], emit_piece_route: { asks_for: 'x', pieces: ['p9'] } } });
    const floor = jsonOf(s.run('invoke', '--skill', 'posts', 'Write an essay on why I stopped changing tools.', '--json', '--claims', 'pattern', ...BACKEND()).out);
    expect(floor.direct?.route.by).toBe('floor'); expect(floor.direct?.pieces.length).toBe(3);
    expect(essayId(floor)).toBeDefined();
  }, 180_000);

  it('a request held strict ("use only these figures") stays direct, and a figure the notes lack blocks the piece', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const s = seed(FILES, { ATELIER_CONTEXT_READER: 'scripted' });
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    const INVENTED = `${REVIEWED} Craft costs 40 dollars a month.`;
    const task = 'Compare Logseq and Craft for my notes. Use only the figures in the notes.';
    // held at the skill's own level: the invented figure is listed beside the piece, and the piece goes out
    await setBackend({ byTool: { __plain: [DRAFT, INVENTED], emit_request_latitude: { level: 'NONE', quote: null } } });
    const free = s.run('invoke', '--skill', 'posts', task, '--with', 'notes=notes.md', '--json', '--claims', 'pattern', ...BACKEND());
    expect(free.code, free.out.slice(-1500)).toBe(0);
    expect(jsonOf(free.out).direct).toBeTruthy();
    // held strict by the request: still direct, and the figure nothing given holds blocks the piece (exit 1)
    await setBackend({ byTool: { __plain: [DRAFT, INVENTED], emit_request_latitude: { level: 'STRICT', quote: 'Use only the figures in the notes' } } });
    const held = s.run('invoke', '--skill', 'posts', task, '--with', 'notes=notes.md', '--json', '--claims', 'pattern', ...BACKEND());
    // a run that exits 1 carries its stderr after the JSON
    const j = JSON.parse(held.out.slice(held.out.indexOf('\n{') + 1, held.out.lastIndexOf('\n}') + 2)) as Out & { record?: { latitude?: string } };
    expect(j.direct).toBeTruthy();
    expect(j.record?.latitude).toBe('STRICT');
    expect(held.code, held.out).toBe(1);
  }, 180_000);

  it('how the author writes is read after the draft: beside the piece by default; with --style-review only the misses reach the review; never the writer', async () => {
    await setBackend({ byTool: { emit_persona: { points: [{ ...PERSONA.points[0], quote: 'That is the whole trade' }] }, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const s = seed(FILES, { ATELIER_CONTEXT_READER: 'scripted' });
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    const go = (...more: string[]): Out => jsonOf(s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft for my notes.', '--with', 'notes=notes.md', '--json', '--claims', 'pattern', '--no-questions', ...more, ...BACKEND()).out);
    type Styled = Out & { direct: { style?: { on: string; steered: boolean; by: string; found: { id: string; held: boolean | null; quote?: string }[] } } };
    // report only: read on the delivered piece, held with the piece's own words; the review and the writer are told nothing
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED], emit_style_read: { items: [{ id: 'h1', held: true, quote: 'That is the whole trade.' }] } } });
    let m0 = await mark();
    const r = go() as Styled;
    expect(r.output).toBe(REVIEWED);
    expect(r.direct.style).toMatchObject({ on: 'piece', steered: false, by: 'model', found: [{ id: 'h1', kind: 'habit', text: 'Closes on a short plain sentence.', held: true, quote: 'That is the whole trade.' }] });
    let plain = await plainSince(m0);
    expect(plain.map(textOf).join('\n')).not.toContain('Where the draft does not yet write as the author does');
    expect(textOf(plain[0])).not.toContain('Closes on a short plain sentence');
    // --style-review: read on the first draft; what it does not hold is told to the review, with the author's sentence
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED], emit_style_read: { items: [{ id: 'h1', held: false, quote: null }] } } });
    m0 = await mark();
    const st = go('--style-review') as Styled & { direct: { style?: { draft?: unknown } } };
    // then read again on the piece the review returned: the record keeps both, so what the review fixed is shown
    expect(st.direct.style).toMatchObject({ on: 'piece', steered: true, found: [{ id: 'h1', held: false }], draft: [{ id: 'h1', held: false }] });
    expect((await bodies()).slice(m0).filter((b) => b.tools?.[0]?.function?.name === 'emit_style_read')).toHaveLength(2);
    plain = await plainSince(m0);
    expect(textOf(plain[1])).toContain('Where the draft does not yet write as the author does:\n- Closes on a short plain sentence (theirs: "That is the whole trade"): the draft does not.');
    expect(textOf(plain[0])).not.toContain('Closes on a short plain sentence');
    // with no method of the author's, the steps the build read off their pieces are read on the piece as their method
    store.setInferredMethod({ root: s.data, skillName: 'posts' }, { schema: 1, reader: 'scripted', reading: 'x', builtAt: '2026-11-08', steps: [{ id: 'i1', text: 'End on the trade-off, in one line.', piece: 'piece-1', quote: 'That is the whole trade', unit: null }] });
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED], emit_style_read: { items: [{ id: 's1', held: true, quote: 'That is the whole trade.' }] } } });
    m0 = await mark();
    expect((go() as Styled).direct.style?.found).toMatchObject([{ id: 'h1' }, { id: 's1', kind: 'step', text: 'End on the trade-off, in one line.', held: true }]);
    expect(textOf((await bodies()).slice(m0).find((b) => b.tools?.[0]?.function?.name === 'emit_style_read')!)).toContain('- [s1] End on the trade-off, in one line.');
    // --no-style: nothing read
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED] } });
    expect((go('--no-style') as Styled).direct.style).toBeUndefined();
  }, 180_000);

  it('a fact only one of the author\'s pieces held is rewritten where it stands to state only what was given', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    // one of the author's pieces names a file of its own case
    const s = seed({ ...FILES, 'posts/compare-1.md': COMPARE(1).replace('Obsidian keeps plain files;', 'Obsidian keeps plain files in `vault.json`;') }, { ATELIER_CONTEXT_READER: 'scripted' });
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    const BORROWED = `${REVIEWED}\n\nMy notes sync through vault.json every hour.`;
    await setBackend({ byTool: { __plain: [DRAFT, BORROWED], emit_rewrites: { rewrites: [{ id: 1, text: 'Sync speed is the one thing I did not measure.' }] } } });
    const r = jsonOf(s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft for my notes.', '--with', 'notes=notes.md', '--json', '--claims', 'pattern', '--no-style', ...BACKEND()).out) as Out & { direct: { grounded?: { found: number; rewritten: number } } };
    expect(r.output).not.toContain('vault.json');
    expect(r.output).toContain('Sync speed is the one thing I did not measure.');
    expect(r.direct.grounded).toMatchObject({ found: 1, rewritten: 1 });
  }, 180_000);

  it('the editor\'s questions: asked where nothing states them, unanswered they change nothing, answered they reach the writer; the method is shown whole', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const s = seed(FILES, { ATELIER_CONTEXT_READER: 'scripted' });
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    const METHOD = 'Open on the pain the reader lives with. Give every feature its reason. End on the idea, never an ask.';
    writeFileSync(join(s.data, 'skills', 'posts', 'method.md'), METHOD);
    const EDITOR = {
      idea: { statedIn: 'NONE', quote: null, ask: 'What one idea should the reader leave with?', options: ['Local files outlive any app', 'Paying buys sync, not freedom'], default: 'Local files outlive any app' },
      pain: { statedIn: 'material', quote: 'Craft is paid and syncs through its own cloud', ask: null, options: [], default: null },
      proof: { statedIn: 'NONE', quote: null, ask: 'What shows it?', options: ['A week of my own notes', 'An export test'], default: 'A week of my own notes' },
    };
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED], emit_editor_questions: EDITOR } });
    let m0 = await mark();
    const quiet = s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft for my notes.', '--with', 'notes=notes.md', '--json', '--claims', 'pattern', ...BACKEND());
    const j = jsonOf(quiet.out) as Out & { questions: { id: string }[]; answers: unknown[] };
    // the pain is stated in the notes, so only the idea and the proof are asked
    expect(j.questions.map((q) => q.id)).toEqual(['idea', 'proof']);
    expect(j.answers).toEqual([]);
    expect((j.direct as unknown as { questions: unknown }).questions).toEqual({ by: 'model', asked: ['idea', 'proof'], answered: [] });
    let plain = await plainSince(m0);
    // nobody answered: the writer reads no suggestion, and the method whole
    expect(textOf(plain[0])).not.toContain('Before writing, the author settled');
    expect(textOf(plain[0])).not.toContain('Local files outlive any app');
    expect(textOf(plain[0])).toContain(`<method>\n${METHOD}\n</method>`);
    expect(textOf(plain[1])).toContain('anything that goes against their method');
    expect(JSON.stringify(JSON.parse(quiet.out.slice(quiet.out.indexOf('\n{') + 1)))).toContain('--answers \\"idea=<letter or your words>,proof=<letter or your words>\\"');
    // answered (a letter, and the person's own words): the direct path still writes it, and the writer reads the answers
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED], emit_editor_questions: EDITOR } });
    m0 = await mark();
    const answered = jsonOf(s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft for my notes.', '--with', 'notes=notes.md', '--json', '--claims', 'pattern',
      '--answers', 'idea=b,proof=I exported 400 notes from both last spring', ...BACKEND()).out);
    expect(answered.direct).toBeTruthy();
    plain = await plainSince(m0);
    expect(textOf(plain[0])).toContain('- The one idea the reader should leave with: Paying buys sync, not freedom');
    expect(textOf(plain[0])).toContain('- What shows it (a case, a figure, or something the reader can try): I exported 400 notes from both last spring');
    // kept as next time's suggestion
    expect(store.getTold({ root: s.data, skillName: 'posts' }).map((t) => t.id)).toEqual(['idea', 'proof']);
  }, 180_000);

  it('the editor\'s questions are the same on the same notes, and an answer belongs to the request it was given for', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const s = seed(FILES, { ATELIER_CONTEXT_READER: 'scripted' });
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    const ask = (idea: string): Record<string, unknown> => ({
      idea: { statedIn: 'NONE', quote: null, ask: idea, options: ['Local files outlive any app', 'Paying buys sync, not freedom'], default: 'Local files outlive any app' },
      pain: { statedIn: 'NONE', quote: null, ask: 'What do they live with?', options: ['Lost notes', 'A bill'], default: 'Lost notes' },
      proof: { statedIn: 'NONE', quote: null, ask: 'What shows it?', options: ['A week of my notes', 'An export test'], default: 'A week of my notes' },
    });
    const T = 'Compare Logseq and Craft for my notes.';
    type Q = Out & { questions: { id: string; ask: string }[]; answers: { id: string; answer: string }[] };
    const run = async (task: string, editor: Record<string, unknown>, ...more: string[]): Promise<Q> => {
      await setBackend({ byTool: { __plain: [DRAFT, REVIEWED], emit_editor_questions: editor } });
      return jsonOf(s.run('invoke', '--skill', 'posts', task, '--with', 'notes=notes.md', '--json', '--claims', 'pattern', ...more, ...BACKEND()).out) as Q;
    };
    // the second draw of the reader words its question otherwise: the same input asks what it asked the first time
    const first = await run(T, ask('What one idea should the reader leave with?'));
    const again = await run(T, ask('Which single idea matters most here?'));
    expect(again.questions).toEqual(first.questions);
    expect(again.questions[0].ask).toBe('What one idea should the reader leave with?');
    // answered once for this request: on the next run of it, the answer reaches the writer again and is not asked
    await run(T, ask('x'), '--answers', 'idea=b');
    const m0 = await mark();
    const later = await run(T, ask('What one idea should the reader leave with?'));
    expect(later.answers).toEqual([{ id: 'idea', answer: 'Paying buys sync, not freedom' }]);
    expect(textOf((await plainSince(m0))[0])).toContain('- The one idea the reader should leave with: Paying buys sync, not freedom');
    // another request is another piece: last request's idea is neither its answer nor its suggestion
    const other = await run('Why I keep my notes in plain files.', ask('What one idea should the reader leave with?'));
    expect(other.answers).toEqual([]);
    expect((other.questions as unknown as { id: string; default: string }[]).find((q) => q.id === 'idea')?.default).toBe('Local files outlive any app');
  }, 180_000);

  it('atelier keep: a kept piece is written from first, and what the person changed is shown to the next review as theirs', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const s = seed(FILES);
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    expect(s.run('keep', '--skill', 'posts').out).toContain('has no run to keep yet');
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED] } });
    const j = jsonOf(s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft.', '--json', '--claims', 'pattern', ...BACKEND()).out);
    // the person published it with one sentence changed and one cut
    const edited = REVIEWED.replace('I ran both for a week on the same notes.', 'I gave each of them one full week of my real notes.').replace(' That is the whole trade.', '');
    writeFileSync(join(s.proj, 'published.md'), edited);
    const k = s.run('keep', '--skill', 'posts', j.invocationId, 'published.md');
    expect(k.code, k.out).toBe(0); expect(k.out).toMatch(/kept k[0-9a-f]{8}: "Logseq against Craft" from run .*, with 2 correction\(s\) read from your edits/);
    const kept = store.getKept({ root: s.data, skillName: 'posts' });
    expect(kept.length).toBe(1); expect(kept[0].request).toBe('Compare Logseq and Craft.');
    expect(kept[0].edits).toEqual([{ before: 'I ran both for a week on the same notes.', after: 'I gave each of them one full week of my real notes.' }, { before: 'That is the whole trade.', after: '' }]);
    expect(s.run('keep', '--skill', 'posts', '--list').out).toContain(kept[0].id);
    // the next run: the kept piece first in the catalogue, the corrections in the review's turn
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED] } });
    const m2 = await mark();
    const next = jsonOf(s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft again.', '--json', '--claims', 'pattern', ...BACKEND()).out);
    expect(next.direct?.from).toBe(4); expect(next.direct?.corrections).toBe(2);
    expect(next.direct?.pieces.some((p) => p.kept)).toBe(true);
    const review = (await plainSince(m2))[1];
    expect(textOf(review)).toContain('- "I ran both for a week on the same notes." became "I gave each of them one full week of my real notes."');
    expect(textOf(review)).toContain('- "That is the whole trade." was cut');
    // removed: gone from the catalogue
    expect(s.run('keep', '--skill', 'posts', '--remove', kept[0].id).out).toContain('0 kept piece(s) left');
    expect(store.getKept({ root: s.data, skillName: 'posts' })).toEqual([]);
    expect(s.run('keep', '--skill', 'posts', '--remove', 'k00000000').code).not.toBe(0);
  }, 180_000);
});

describe('what the direct path must not lose (found in review)', () => {
  beforeAll(async () => {
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  }, 60_000);
  afterAll(() => { backend.kill(); });
  const INVENTED = `${REVIEWED} It cost me 49 dollars in its first year, and 3,000 readers wrote in.`;

  it('a fix replayed whole, a candidate, a short piece, strict delivery even under --pipeline direct: the compiled path, said', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, emit_piece: { piece: REVIEWED }, __plain: [DRAFT, REVIEWED] } });
    const s = seed(FILES);
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    // a short class names no compiled flag
    for (const extra of [['--correcting', 'far too long'], ['--limit', '280'], ['--class', 'x-post'], ['--strict', '--pipeline', 'direct']]) {
      const r = s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft.', '--json', '--claims', 'pattern', '--no-questions', ...extra, ...BACKEND());
      expect(r.out, extra.join(' ')).toContain('{');
      expect(jsonOf(r.out).direct ?? null, extra.join(' ')).toBeNull();
    }
    const bad = s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft.', '--pipeline', 'fast', '--deep', ...BACKEND());
    expect(bad.out).toContain('--pipeline takes direct or legacy');
  }, 180_000);

  it('the record carries how the run was asked; `atelier run` shows the specifics to check; --no-repair still reads the piece', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, __plain: [DRAFT, INVENTED] } });
    const s = seed(FILES);
    expect(s.run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()).code).toBe(0);
    const L = { root: s.data, skillName: 'posts' };
    await setBackend({ byTool: { __plain: [DRAFT, INVENTED] } });
    const j = jsonOf(s.run('invoke', '--skill', 'posts', '--task', 'Compare Logseq and Craft.', '--with', 'notes=notes.md', '--json', '--claims', 'pattern', '--provenance', 'DEV_PROBE', '--max-tokens', '4000', ...BACKEND()).out) as Out & { inferred: { kind: string; what: string }[]; answer: string; toCheck: string[]; maxTokens: number };
    const rec = store.getInvocation(L, j.invocationId);
    expect(rec?.provenance).toBe('DEV_PROBE');
    expect(rec?.request?.source).toBe('FLAG');
    // --max-tokens lowers the ceiling of a prose call, and the record says what was sent
    expect(j.maxTokens).toBe(4000); expect(rec?.settings?.maxTokens).toBe(4000);
    expect((await bodies()).filter((b) => !b.tools?.length).at(-1)).toMatchObject({ max_tokens: 4000 });
    // the specifics not in what was given: listed as `inferred`, and under the answer
    expect(j.toCheck.length).toBeGreaterThan(0);
    expect(j.inferred.some((i) => i.kind === 'specific')).toBe(true);
    // the text handed back is the piece itself: a note in it would be published
    expect(j.answer).toBe(j.output);
    // `atelier run`, the person's command, shows them
    await setBackend({ byTool: { __plain: [DRAFT, INVENTED] } });
    const shown = s.run('run', 'Compare Logseq and Craft.', '--skill', 'posts', '--with', 'notes=notes.md', '--claims', 'pattern', ...BACKEND());
    expect(shown.out).toMatch(/49 dollars|3,000 readers/);
    expect(shown.out).toMatch(/not given/);
    // --no-repair: nothing changed, and the evaluation still read the piece
    await setBackend({ byTool: { __plain: [DRAFT, INVENTED] } });
    const n = jsonOf(s.run('invoke', '--skill', 'posts', 'Compare Logseq and Craft.', '--with', 'notes=notes.md', '--json', '--claims', 'pattern', '--no-repair', ...BACKEND()).out) as Out & { toCheck: string[]; state?: string };
    expect(n.output).toBe(INVENTED);
    expect(n.toCheck.length).toBeGreaterThan(0);
  }, 180_000);
});
