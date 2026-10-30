// tests/atelier-grammar-reading.test.ts — ONLY AN ERROR WITH NO LEGITIMATE READING IS CHANGED IN PLACE.
//
// The rule at the head of core/observers/grammar.ts: a text is changed in place only where the error has no legitimate
// reading in any major English variety or register; anything with one is listed, never changed. An independent
// reviewer ran a hundred and fifty sentences and a probe set through the real engine, and every sentence below was
// rewritten in delivered text before this change: a name ("Wellcome", "Pharoah", "Untill Then"), a Malay or Singapore
// English word ("teh tarik"), a real word ("calender"), a loanword ("embarras"), a register's spelling ("dont",
// "thats"), a word said twice ("had had", "Bora Bora", "tsk tsk") and "an historian". The cost is accepted and pinned
// here too: "Tommorow" and "Thsi" at a sentence's start and an accidental "the the" are listed, no longer fixed.
//
// The engine is real (harper.js) wherever a test reads text with it; the suite default is the stub (vitest.config.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { describeWithEngine, itWithEngine } from './harper-engine.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setGrammarProvider, ensureGrammar, resetGrammar, readGrammar, grammarStatus, type GrammarEngine, type GrammarLint } from '../core/observers/grammar.js';
import { MISSPELLINGS } from '../core/observers/grammar-words.js';
import { observerFor } from '../core/observers/registry.js';
import { harperGrammar } from '../providers/harper.js';
import { grammarProvider } from '../providers/grammar.js';
import { correctMechanicalErrors } from '../core/loop/mechanical-repair.js';

type Params = Record<string, readonly string[]>;
const DIALECTS: readonly Params[] = [{}, { dialect: ['british'] }, { dialect: ['american'] }];
const fixed = (text: string, p: Params): string => correctMechanicalErrors(text, readGrammar(text, p).confirmed).text;
const listed = (text: string, p: Params): string[] => readGrammar(text, p).uncertain.map((u) => u.text.trim());

// Correct as written, each rewritten before this change by the real engine in every dialect.
const LEGITIMATE: readonly string[] = [
  // names, at a sentence's start or anywhere
  'Pharoah Sanders recorded Karma in 1969.', 'Wellcome Collection reopens on Thursday.', 'Grammer won an Emmy for playing Frasier.',
  'Sergent Pepper\'s is the band\'s tribute night at the pub.', 'Teh Hong Piow founded Public Bank.', 'Liason Street runs past the old station.',
  'Untill Then is the name of the band.', 'Wellcome Trust funds the lab.', 'Wich is a grammar-checker joke, not a word.',
  'Calender rolls press the rubber sheet flat.', 'Supercede is listed as a variant in some dictionaries.',
  // a word of a variety, a real word, a loanword
  'Two teh tarik and a kopi peng, thanks.', 'The tea stall sells teh halia and roti canai.', 'Kopi and teh are the two pillars of a kopitiam breakfast.',
  'The paper is smoothed by a calender before it is cut.', 'The menu was an embarras de richesses.',
  // a register's spelling: a contraction typed without its apostrophe
  'dont @ me, the sequel was better.', 'thats it, im done with this game tonight.', 'ok so youre telling me the patch is out already?',
  'The trophy is theirs, and theres no arguing.',
  // a word said twice
  'Vroom vroom, the toddler said, pushing the truck along the rug.', 'Tsk tsk, another missed standup.', 'I think that that is the right call.',
  'She had had enough of the meetings.', 'Knock knock, who\'s there?', 'Chop chop, the taxi is waiting.', 'Night night, sleep tight.',
  'Tut tut, the queue is out the door.', 'The toddler shouted choo choo at every train.', 'We flew to Bora Bora for the honeymoon.',
  'Duran Duran played the encore twice.', 'The mahi mahi was grilled with lime.', 'Yada yada yada, the usual excuses.',
  'Pago Pago is the capital of American Samoa.', 'He went to Walla Walla for the wine.',
  // "an" before h
  'He\'s an historian of the Raj and a one-off.', 'An hotel and an historic inn stood side by side, as the 1890 guide put it.',
];
// The true errors the rule still corrects in place, each to its one correction.
const STILL_FIXED: readonly (readonly [string, string])[] = [
  ['We definately need a bigger whiteboard.', 'We definitely need a bigger whiteboard.'],
  ['The enviroment variables were never set.', 'The environment variables were never set.'],
  ['The neighbours were embarassed by the noise.', 'The neighbours were embarrassed by the noise.'],
  ['The team acheived the goal early.', 'The team achieved the goal early.'],
  ['He are late for the standup again.', 'He is late for the standup again.'],
  ['She wrote a essay on the strike.', 'She wrote an essay on the strike.'],
  ['He bought an new bike for the commute.', 'He bought a new bike for the commute.'],
  ['It was an useful meeting.', 'It was a useful meeting.'],
  ['The cat licked its paw , then slept.', 'The cat licked its paw, then slept.'],
  ['The release went out,, and nobody noticed.', 'The release went out, and nobody noticed.'],
  ['A essay on the strike ran on Sunday.', 'An essay on the strike ran on Sunday.'],
];
// True errors the rule now lists instead of fixing: each has a reading, or a twin with one, that must not be touched.
const NOW_LISTED: readonly (readonly [string, string])[] = [
  ['Tommorow we ship the beta.', 'Tommorow'], ['Begining next week, the office opens at eight.', 'Begining'],
  ['Thsi is the last time I touch that migration.', 'Thsi'], ['The the server rebooted twice.', 'The the'],
  ['We need a a bigger budget.', 'a a'], ['Its a trap.', 'Its'], ['He dont know the password.', 'dont'],
  // a dialect's agreement: the levelled "was", a third person without "-s", the Northern "I has"
  ['They was late for the standup again.', 'was'], ['She go to the depot every Friday.', 'go'], ['He have two monitors and a laptop.', 'have'],
  ['I has a question about the invoice.', 'has'], ['We was never told about the outage.', 'was'],
];

describeWithEngine('the one rule, with the real engine', () => {
  const was = process.env.ATELIER_GRAMMAR;
  beforeAll(async () => { process.env.ATELIER_GRAMMAR = 'on'; resetGrammar(); setGrammarProvider(harperGrammar); await ensureGrammar(); expect(grammarStatus().ready).toBe(true); }, 60_000);
  afterAll(() => { if (was === undefined) delete process.env.ATELIER_GRAMMAR; else process.env.ATELIER_GRAMMAR = was; resetGrammar(); setGrammarProvider(grammarProvider()); });

  it('nothing with a legitimate reading is changed, in any dialect', () => {
    for (const p of DIALECTS) for (const text of LEGITIMATE) expect(fixed(text, p), `${JSON.stringify(p)} ${text}`).toBe(text);
  });
  it('the errors with no legitimate reading are still corrected in place', () => {
    for (const p of DIALECTS) for (const [text, want] of STILL_FIXED) expect(fixed(text, p), `${JSON.stringify(p)} ${text}`).toBe(want);
  });
  it('a capitalised misspelling, a repeated word, "its" and "dont" are listed for the person, never changed', () => {
    for (const p of DIALECTS) {
      for (const [text, word] of NOW_LISTED) {
        expect(fixed(text, p), text).toBe(text);
        expect(listed(text, p), text).toContain(word);
      }
    }
  });
  it('"an" before h is listed with its reason; a repeated word is listed as one, not collapsed', () => {
    const h = readGrammar('He\'s an historian of the Raj.', {});
    expect(h.confirmed).toEqual([]);
    expect(h.uncertain.find((u) => u.text === 'an')?.why).toMatch(/before a word in h/);
    expect(readGrammar('She had had enough.', {}).confirmed).toEqual([]);
    expect(readGrammar('Bora Bora was hot.', {}).uncertain.find((u) => u.text === 'Bora Bora')?.why).toMatch(/^a word repeated/);
  });
  it('a full-width comma is the author\'s: listed, not rewritten', () => {
    const text = 'We left early，then slept.';
    for (const p of DIALECTS) expect(fixed(text, p)).toBe(text);
  });
});

describe('the one rule, on a scripted engine', () => {
  const under = async (lints: readonly GrammarLint[]): Promise<void> => {
    resetGrammar();
    setGrammarProvider({ load: () => Promise.resolve<GrammarEngine>({ lint: () => lints }) });
    await ensureGrammar();
  };
  const lint = (l: Partial<GrammarLint> & { rule: string; start: number; end: number; replacement: string | null }): GrammarLint => ({ kind: 'Miscellaneous', message: 'scripted', ...l });
  const was = process.env.ATELIER_GRAMMAR;
  beforeAll(() => { process.env.ATELIER_GRAMMAR = 'on'; });
  afterAll(() => { if (was === undefined) delete process.env.ATELIER_GRAMMAR; else process.env.ATELIER_GRAMMAR = was; resetGrammar(); setGrammarProvider(grammarProvider()); });

  it('a/an before an acronym is listed: it depends on how it is read aloud', async () => {
    const text = 'We need an URL for the docs.';
    await under([lint({ rule: 'AnA', start: 8, end: 10, replacement: 'a' })]);
    expect(readGrammar(text, {}).confirmed).toEqual([]);
    expect(readGrammar(text, {}).uncertain[0].why).toMatch(/acronym/);
  });
  it('"there is" before a plural is listed', async () => {
    const text = 'There is many bugs left.';
    await under([lint({ rule: 'ThereIsAgreement', kind: 'Agreement', start: 6, end: 8, replacement: 'are' })]);
    expect(readGrammar(text, {}).confirmed).toEqual([]);
    expect(readGrammar(text, {}).uncertain[0].why).toMatch(/there is/);
  });
});

describe('the list of known misspellings, audited', () => {
  // Each has a legitimate reading: a word of a variety, a real word, a loanword, a listed variant, a register's
  // spelling, or a common proper name; and "ofthe" was an entry that corrected to itself.
  const REMOVED = ['teh', 'calender', 'embarras', 'supercede', 'doesnt', 'dont', 'didnt', 'isnt', 'wasnt', 'werent', 'arent', 'couldnt',
    'shouldnt', 'wouldnt', 'havent', 'hasnt', 'hadnt', 'youre', 'theyre', 'thats', 'couldve', 'shouldve', 'wouldve', 'dosent', 'itll', 'mustnt',
    'neednt', 'theres', 'theyll', 'theyve', 'weve', 'youll', 'youve', 'wich', 'wellcome', 'pharoah', 'grammer', 'sergent', 'ofthe', 'accidently',
    'publically', 'incidently', 'dumbell', 'existant'];
  it('holds none of the 44 entries with a legitimate reading', () => {
    expect(REMOVED).toHaveLength(44);
    for (const w of REMOVED) expect(Object.hasOwn(MISSPELLINGS, w), w).toBe(false);
  });
  it('holds no contraction typed without its apostrophe, and no entry that corrects to itself', () => {
    for (const [wrong, right] of Object.entries(MISSPELLINGS)) {
      expect(right, wrong).not.toMatch(/'/);
      expect(right, wrong).not.toBe(wrong);
    }
  });
});

describe('a paragraph of one sentence', () => {
  it('is said in the singular', () => {
    expect(observerFor('PARAGRAPH_LENGTH').observe('One sentence here.', { maxSentences: 4 }).detail).toBe('longest 1 sentence');
    expect(observerFor('PARAGRAPH_LENGTH').observe('One here. Two here.', { maxSentences: 4 }).detail).toBe('longest 2 sentences');
  });
});

describe('through the binary, with no model key', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  const LINES = ['It was not nostalgia exactly, more a kind of bookkeeping.', 'Nobody asked why I had come, and I did not say.',
    'The place had changed less than I had.', 'The light was thin and yellow, the way it gets before rain.', 'On the way home I counted the windows still lit.',
    'My sister says I make too much of small things, and she is right.', 'I wrote a few lines in the notebook and then stopped.',
    'I went back there in the spring, expecting nothing much.', 'Some things are better kept than described.', 'A man was sweeping the same corner he swept twenty years ago.'];
  const essay = (k: number): string => `# Place ${'abcdef'[k]}\n\n` + [0, 1, 2, 3].map((p) => [0, 1, 2, 3].map((s) => LINES[(k + p * 3 + s * 7) % LINES.length]).join(' ')).join('\n\n') + '\n';
  let root = ''; let proj = ''; let data = '';
  const env = (cwd: string): NodeJS.ProcessEnv => {
    const e: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: cwd, ATELIER_GRAMMAR: 'on' };
    delete e.ANTHROPIC_API_KEY; delete e.ANTHROPIC_AUTH_TOKEN;
    return e;
  };
  const runIn = (cwd: string, ...args: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('sh', ['-c', `node "${CLI}" ${args.map((x) => `'${x.replace(/'/g, '\'\\\'\'')}'`).join(' ')} 2>&1`], { encoding: 'utf8', cwd, env: env(cwd) }) }; } catch (e) {
      const x = e as { status?: number; stdout?: string }; return { code: x.status ?? 1, out: x.stdout ?? '' };
    }
  };
  const run = (...args: string[]): { code: number; out: string } => runIn(proj, ...args);
  beforeAll(() => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    root = mkdtempSync(join(tmpdir(), 'atelier-grammar-reading-')); proj = join(root, 'proj'); data = join(root, 'data');
    mkdirSync(proj); mkdirSync(join(root, 'essays'));
    for (let k = 0; k < 6; k++) writeFileSync(join(root, 'essays', `e${k + 1}.md`), essay(k));
    writeFileSync(join(root, 'essays', 'stub1.md'), 'TODO: write about the ferry.\n');
    writeFileSync(join(root, 'essays', 'stub2.md'), 'TODO: write about the quay.\n');
  });
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it('a stub in a folder of long pieces is left out of the examples, and named', () => {
    const r = run('new', '../essays', 'short essays about places', '--name', 'walks');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/Too short to read as finished work \(200\+ characters\), left out:\n {2}stub1\.md {2}\(28 chars\)\n {2}stub2\.md {2}\(27 chars\)/);
    expect(r.out).toMatch(/6 examples from essays/);
  }, 120_000);
  it('a folder of short pieces keeps every one of them, however short', () => {
    mkdirSync(join(root, 'posts'));
    const posts = ['Shipped the fix.', 'The quay was empty at six, and the gulls had the whole of it to themselves.', 'Rain again.', 'We counted the boats and gave up at forty.'];
    posts.forEach((t, i) => { writeFileSync(join(root, 'posts', `p${i + 1}.md`), `${t}\n`); });
    // (a folder of its own: one project holds one standard)
    mkdirSync(join(root, 'proj2'));
    const r = runIn(join(root, 'proj2'), 'new', '../posts', 'short posts', '--name', 'posts');
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toMatch(/Too short to read/);
    expect(r.out).toMatch(/4 examples from posts/);
  }, 120_000);
  itWithEngine('verify --repair leaves every grammar finding as written by default; with --fix-grammar it makes the mechanical fixes with no key', () => {
    writeFileSync(join(proj, 'b4.md'), 'He are riding into the wind all morning and it dont stop, but the the views was worth it.\n');
    const kept = run('verify', '--skill', 'walks', 'b4.md', '--repair');
    expect(kept.code, kept.out).toBe(0);
    expect(kept.out).not.toMatch(/ANTHROPIC_API_KEY/);
    expect(kept.out).toMatch(/^He are riding into the wind all morning and it dont stop, but the the views was worth it\.$/m);
    const r = run('verify', '--skill', 'walks', 'b4.md', '--repair', '--fix-grammar');
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toMatch(/ANTHROPIC_API_KEY/);
    expect(r.out).toMatch(/^He is riding into the wind all morning and it dont stop, but the the views was worth it\.$/m);
  }, 120_000);
  it('verify --repair still asks for a key when a rewrite needs a model', () => {
    writeFileSync(join(proj, 'tells.md'), 'The thing most people miss about the pier is the wind. That\'s the whole game. Here\'s the honest truth: I loved it.\n');
    const r = run('verify', '--skill', 'walks', 'tells.md', '--repair');
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/ANTHROPIC_API_KEY/);
  }, 120_000);
});
