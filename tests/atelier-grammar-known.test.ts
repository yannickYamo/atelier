// tests/atelier-grammar-known.test.ts — A SPELLING IS CHANGED ONLY WHEN IT IS A KNOWN MISSPELLING; EVERYTHING ELSE IS LISTED.
//
// The owner's invariant: anything uncertain is listed, never changed. A guess at the word a writer meant is never
// certain, so no word is respelt by a keystroke model: "yeet", "vite", "mither", "cosy", "storey" stay as written in
// either dialect, and a slip the checker cannot name ("tokwn") is listed with what it suggests. In-place spelling
// fixes come only from the curated list of well-known misspellings, read by Atelier's own pass over the text, whatever
// the engine calls the word and at a sentence's start ("Thsi"). No spelling moves
// between British and American English. And a reading with items listed never says "no mechanical error". The in-place
// fixes are what --fix-grammar applies; by default every finding is only listed (tests/atelier-grammar-listonly.test.ts).
//
// The engine is real (harper.js) wherever a test reads text with it; the suite default is the stub (vitest.config.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { describeWithEngine } from './harper-engine.js';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setGrammarProvider, ensureGrammar, resetGrammar, readGrammar, grammarStatus, knownMisspelling, setGrammarFixing, GRAMMAR } from '../core/observers/grammar.js';
import { MISSPELLINGS } from '../core/observers/grammar-words.js';
import { harperGrammar } from '../providers/harper.js';
import { correctMechanicalErrors } from '../core/loop/mechanical-repair.js';

type Params = Record<string, readonly string[]>;
const DIALECTS: readonly Params[] = [{}, { dialect: ['british'] }, { dialect: ['american'] }];
const fixed = (text: string, p: Params): string => correctMechanicalErrors(text, readGrammar(text, p).confirmed).text;

// An independent reviewer's sentences, each correct as written (slang, a tool's name, a dialect's word or spelling):
// before this change the keyboard-slip rule rewrote them (yeet → yet, vite → vote, mithering → mothering, storey →
// story, cosy → cost, nett → net, licenced → licence, roubles, realises, organisations → organizations, pled → led).
const CORRECT: readonly string[] = [
  'Just yeet the old config into the bin and start again.',
  'We moved the frontend from webpack to vite last spring.',
  'Stop mithering me about the invoice, it\'s paid.',
  'The jungler kept trying to gank mid but never landed it.',
  'Their flat is on the third storey of a converted mill.',
  'It was a cosy little pub with a roaring fire.',
  'The firm reported a nett profit after tax.',
  'The venue is licenced until midnight on Fridays.',
  'Pay in roubles or not at all, the trader said.',
  'She realises now that the budget was centred on the wrong team.',
  'We sat awhile and watched the boats come in.',
  'Our organisations have catalogued every artefact since 1990.',
  'He pled guilty to all three counts.',
];
// Typos the engine flags but no list names: a guess at the word meant, so listed, never changed.
const SLIPS: readonly (readonly [string, string])[] = [
  ['The tokwn expired before the job finished.', 'tokwn'],
  ['Run the reploy script after the merge.', 'reploy'],
  ['I will be thete by noon.', 'thete'],
  ['We need more wotk on the parser.', 'wotk'],
];
// Every dictionary word the slip rule changed in the reviewer's scan of both word lists.
const DICTIONARY_WORDS = ['aline', 'ares', 'awhile', 'betted', 'bogy', 'cassino', 'chile', 'defensed', 'dopy', 'employes', 'fiord', 'gage', 'hared',
  'licenced', 'nighty', 'nite', 'nites', 'pled', 'revery', 'sera', 'shat', 'tike', 'tikes', 'defenced', 'nett', 'catalogued', 'cataloguer', 'cosy',
  'storey', 'arse', 'categorises', 'centred', 'organisations', 'organises', 'realises', 'rouble'];

describeWithEngine('spelling, with the real engine', () => {
  beforeAll(async () => { process.env.ATELIER_GRAMMAR = 'on'; resetGrammar(); setGrammarProvider(harperGrammar); await ensureGrammar(); expect(grammarStatus().ready).toBe(true); }, 60_000);

  it('a correct word of slang, a tool, or either dialect is never changed, with or without a dialect recorded', () => {
    for (const p of DIALECTS) for (const text of CORRECT) expect(fixed(text, p), `${JSON.stringify(p)} ${text}`).toBe(text);
  });
  it('no dictionary word is changed in either dialect', () => {
    for (const p of DIALECTS.slice(1)) {
      for (const w of DICTIONARY_WORDS) { const text = `They said the ${w} was there.`; expect(fixed(text, p), `${p.dialect[0]} ${w}`).toBe(text); }
    }
  });
  it('a slip no list names is listed with what the checker suggests, and never changed', () => {
    for (const [text, word] of SLIPS) {
      for (const p of DIALECTS) {
        const r = readGrammar(text, p);
        expect(r.confirmed, text).toEqual([]);
        expect(r.uncertain.find((u) => u.text === word)?.why, text).toMatch(/^a word the checker does not know/);
      }
    }
  });
  it('a known misspelling in lower case is corrected whatever the engine calls it; a capitalised one, even opening a sentence, is listed', () => {
    expect(fixed('We will recieve it on Friday.', {})).toBe('We will receive it on Friday.');
    expect(fixed('We need to seperate the billing logic.', { dialect: ['american'] })).toBe('We need to separate the billing logic.');
    for (const text of ['Acheive more, we said.', 'Thsi is the last time I touch that migration.', '# Recieve plan\n\nIt held. Recieve the rest.']) {
      expect(fixed(text, {}), text).toBe(text);
      expect(readGrammar(text, {}).uncertain.some((u) => u.why.includes('may be a name')), text).toBe(true);
    }
  });
  it('a capitalised misspelling in mid-sentence may be a name: listed, not changed; so is one the author uses or a protected one', () => {
    const name = readGrammar('We met Acheive at the station.', {});
    expect(name.confirmed).toEqual([]);
    expect(name.uncertain.find((u) => u.text === 'Acheive')?.why).toMatch(/may be a name/);
    expect(readGrammar('Our acheive step runs nightly.', { vocabulary: ['acheive'] }).confirmed).toEqual([]);
    expect(fixed('Run `acheive --now` and read acheive.md first.', {})).toBe('Run `acheive --now` and read acheive.md first.');
  });
  it('no spelling moves between British and American English', () => {
    expect(fixed('The colour of the organisation changed.', { dialect: ['american'] })).toBe('The colour of the organisation changed.');
    expect(fixed('The color of the organization changed.', { dialect: ['british'] })).toBe('The color of the organization changed.');
  });
  it('by default a reading with items listed is the person\'s to read, never met; with nothing found it is met', () => {
    const listed = GRAMMAR.observe('Just yeet the old config.', {});
    expect(listed.verdict).toBe('NOT_APPLICABLE');
    expect(listed.detail).toMatch(/^listed for you to check: \d+ possible slips?: "yeet"/);
    expect(listed.spans.map((sp) => sp.text)).toContain('yeet');
    expect(GRAMMAR.observe('The plan held.', {})).toMatchObject({ verdict: 'MET', detail: 'no possible slip found' });
  });
  it('under --fix-grammar a reading with items listed says "held" with the count, never "no mechanical error"', () => {
    setGrammarFixing(true);
    try {
      const listed = GRAMMAR.observe('Just yeet the old config.', {});
      expect(listed.verdict).toBe('MET');
      expect(listed.detail).toMatch(/^held; \d+ listed to check: "yeet"/);
      expect(listed.detail).not.toMatch(/no mechanical error/);
      expect(GRAMMAR.observe('The plan held.', {}).detail).toBe('no mechanical error');
    } finally { setGrammarFixing(false); }
  });
});

describe('the list of known misspellings', () => {
  it('holds at least 300 entries, each a lower-case misspelling with one correction that is not itself', () => {
    const entries = Object.entries(MISSPELLINGS);
    expect(entries.length).toBeGreaterThanOrEqual(300);
    for (const [wrong, right] of entries) {
      expect(wrong, wrong).toMatch(/^[a-z]+$/);
      expect(right, wrong).not.toBe(wrong);
      expect(knownMisspelling(wrong)).toBe(right);
    }
    expect(knownMisspelling('Recieve')).toBe('receive');
    expect(knownMisspelling('thete')).toBeNull();
  });
  const AM = '/usr/share/dict/american-english'; const BR = '/usr/share/dict/british-english';
  it.skipIf(!existsSync(AM) || !existsSync(BR))('no entry is a word of either dialect, and every correction is a word of both', async () => {
    const { readFileSync } = await import('node:fs');
    const load = (f: string): Set<string> => new Set(readFileSync(f, 'utf8').split('\n'));
    const us = load(AM); const uk = load(BR);
    const inEither = (w: string): boolean => [w, w[0].toUpperCase() + w.slice(1)].some((x) => us.has(x) || uk.has(x));
    for (const [wrong, right] of Object.entries(MISSPELLINGS)) {
      expect(inEither(wrong), wrong).toBe(false);
      for (const part of right.split(' ')) expect(us.has(part) && uk.has(part), `${wrong} → ${right}`).toBe(true);
    }
  });
});

describeWithEngine('through the binary: a run keeps the author\'s words, and its evaluation says what is listed', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  // An American author: ten and more American spellings, so the build records the dialect.
  const PIECES = [
    'We organized the team around one color: the gray of the old dashboard. The behavior we wanted was simple, and we realized it took a year.\n\nNobody apologized. We traveled light, labeled every box, and canceled the meetings that did not matter.',
    'The neighbor\'s catalog had a favorite color for every season. We recognized the behavior early and prioritized the fix.\n\nWe modeled the flavor of the launch on a theater opening. Everyone realized it worked, and the humor held up.',
    'The labor was real. We analyzed the logs, organized the backlog and colored the charts gray.\n\nIt was a fiber issue, as it often is. We emphasized the honor of the work, centered the plan and canceled the rest.',
  ];
  const PIECE = '# A cosy launch\n\nWe moved the frontend from webpack to vite and our build got fast. The team was in a cosy room on the third storey, '
    + 'and we organized the release around one color.\n\nJust yeet the old config. It is done, and the logs are clean.';
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const x = /PORT (\d+)/.exec(d.toString()); if (x) ok(Number(x[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('`atelier run` delivers vite, cosy, storey and yeet as written, and the grammar line lists them for the person to check', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-gk-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gk-proj-'));
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_GRAMMAR: 'on', ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    mkdirSync(join(proj, 'posts'));
    PIECES.forEach((p, i) => { writeFileSync(join(proj, 'posts', `p${i + 1}.md`), p); });
    execFileSync('node', [CLI, 'new', 'posts', '--no-model', '--name', 'us'], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: PIECE } } }) });
    let out: string;
    try {
      out = execFileSync('sh', ['-c', `node "${CLI}" run 'a short launch note' --skill us --allow-unsourced --provider openai-compatible --base-url http://127.0.0.1:${port} --model scripted 2>&1`], { encoding: 'utf8', cwd: proj, env });
    } catch (e) { out = (e as { stdout: string }).stdout; }
    for (const w of ['vite', 'cosy room', 'third storey', 'Just yeet']) expect(out, w).toContain(w);
    for (const w of ['vote', 'cost room', 'third story', 'Just yet']) expect(out, w).not.toContain(w);
    const flat = out.replace(/\s+/g, ' ');
    expect(flat).toMatch(/No mechanical errors: spelling, agreement, punctuation\. listed for you to check: \d+ possible slips?: /);
    expect(flat).not.toMatch(/no mechanical error/);
  }, 240_000);
});
