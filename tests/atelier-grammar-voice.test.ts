// tests/atelier-grammar-voice.test.ts — GRAMMAR CORRECTS WITHOUT NORMALISING THE VOICE.
//
// Correctness improves and the author's voice is left alone: a spelling is changed only where the word is a
// well-known misspelling with one correction (./atelier-grammar-known.test.ts holds the list's own guards); a coinage, slang,
// a word of one dialect, a compound or a plural the checker would respell is listed, never changed. @mentions,
// hashtags, cashtags, emoji, email addresses, file names and ALL-CAPS tokens are never touched. A pronoun agreement
// the author's own pieces use is theirs; without that evidence only the clear cases are corrected, and vernacular is
// listed. A build with the engine off still keeps the author's words. A check that did not run says "not checked".
//
// The engine is real (harper.js) where a test reads text with it: the suite default is the stub (vitest.config.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setGrammarProvider, ensureGrammar, resetGrammar, readGrammar, protectedRanges, authorVocabulary, authorConstructions, grammarMeasurement,
  knownMisspelling, grammarStatus, type GrammarEngine, type GrammarLint } from '../core/observers/grammar.js';
import { MISSPELLINGS, COMMON_WORDS } from '../core/observers/grammar-words.js';
import { harperGrammar } from '../providers/harper.js';
import { correctMechanicalErrors } from '../core/loop/mechanical-repair.js';
import { verifyText, describeVerify } from '../core/observers/verify.js';
import { shapeBandRules } from '../core/observers/short-form.js';
import { shortFormOffers } from '../core/method/standard.js';
import { shortScreen } from '../cli/commands/method.js';
import * as fstore from '../core/state/fidelity-store.js';
import { makeRelease } from '../core/fidelity/release.js';
import { DEFAULT_SETTINGS, type FidelityProfile } from '../core/fidelity/types.js';
import { aRequirement } from './fixtures.js';
import { GOOD } from './fixtures/shortform.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';

const rule = (params: Record<string, readonly string[]> = {}): Requirement => aRequirement({ requirementId: 'g1', statement: 'No mechanical errors: spelling, agreement, punctuation.',
  kind: 'BOUNDARY', materiality: 'REQUIRED', measurement: { observer: 'GRAMMAR', params } });
const standard = (...rules: Requirement[]): StandardVersion => ({ standardVersionHash: 'sv-gv', evidenceId: null, workType: 'writing', requirements: rules,
  authorityState: 'RATIFIED', mintedAt: '2026-10-14T00:00:00Z', supersedes: null, reason: null });

// Sentences an independent reviewer ran through the real engine: the words named are the author's, and before this
// change every one was rewritten in delivered text (grokkable → growable, arvo → ado, grandad → "gran dad",
// learnings → learning's, timeboxed → "time boxed").
const VOICE: readonly (readonly [string, string])[] = [
  ['The grokkable bits of the codebase are the ones nobody touched.', 'grokkable'],
  ['We spent the arvo fixing the CI.', 'arvo'],
  ['My grandad called it the wireless until the day he died.', 'grandad'],
  ['It was a learnings-heavy quarter, as the deck put it.', 'learnings'],
  ['We timeboxed the spike to two days.', 'timeboxed'],
];
// The reviewer's true errors, each with the one correction it must keep getting.
const TRUE_FIXES: readonly (readonly [string, string])[] = [
  ['She are late again, and nobody said a word.', 'She is late again, and nobody said a word.'],
  ['I recieve too many emails about this.', 'I receive too many emails about this.'],
  ['He bought an bike last week.', 'He bought a bike last week.'],
  ['We shipped it,, finally.', 'We shipped it, finally.'],
];
// The rest of the reviewer's set: nothing in any of them may be changed.
const UNCHANGED: readonly string[] = [
  'The team were split on whether to ship.', 'Not great. Not terrible either.', 'And that was the end of it.', 'The colour of the cladding changed the whole mood.',
  'We organised the archive by decade and labelled every box.', 'Run `npm run buidl` and read src/core/loopr.ts:42 before you touch it.', 'She said "we was robbed" and walked off.',
  'Revenue rose 12% to $4.3m in Q3, against 3.9m the year before.', 'Kubernetes and Terraform both choke on the Zorbix cluster.', 'Our p99 latency dropped once we stopped retrying on every timeout.',
  'The onboarding flow was gnarly, so we rebuilt it from scratch.', 'I\'ve been doomscrolling less since I deleted the app.', 'We dogfooded the beta for three weeks before anyone outside saw it.',
  'Y\'all were right about the caching layer.', 'Gonna be a long night.', 'We use kubectl, terraform and a lot of bash glue.', 'The enshittification of every platform follows the same curve.',
  'I reckon the whole thing will blow over by spring.', 'He was gobsmacked by the bill.', 'The codebase is a palimpsest of three rewrites.', 'Async standups beat sync ones for a team across nine timezones.',
  'Jonh Smtih said the plan was fine.', 'We met on the 3th of May at the Hiltn.', 'the release went out at midnight and nobody noticed.', 'very very good indeed.',
  'Wait... what?', 'It don\'t matter now.', 'They was late again, and nobody said a word.', 'He go to the market every Sunday.',
  'I has a question about the API.', 'You was right about the migration.', 'I is the one who knocks.', 'Their roadmap is aspirational at best.', 'The colour of the programme was grey.', 'The organization realized its error.',
];

describe('a spelling fix is made only for a known misspelling (real engine)', () => {
  beforeAll(async () => { process.env.ATELIER_GRAMMAR = 'on'; resetGrammar(); setGrammarProvider(harperGrammar); await ensureGrammar(); expect(grammarStatus().ready).toBe(true); }, 60_000);

  it('a coinage, slang, a British word, a closed compound and a plural are listed and never changed', () => {
    for (const [text, word] of VOICE) {
      const r = readGrammar(text, {});
      expect(r.confirmed, text).toEqual([]);
      expect(r.uncertain.map((u) => u.text), text).toContain(word);
      expect(correctMechanicalErrors(text, r.confirmed).text).toBe(text);
    }
  });
  it('a hyphenated compound is never split, and nothing inside it is changed', () => {
    const r = readGrammar('It was a learnings-heavy quarter.', {});
    expect(r.confirmed).toEqual([]);
  });
  it('the reviewer\'s true errors are still corrected, each to its one correction', () => {
    for (const [text, want] of TRUE_FIXES) expect(correctMechanicalErrors(text, readGrammar(text, {}).confirmed).text, text).toBe(want);
  });
  it('nothing else in the reviewer\'s sentences is changed', () => {
    for (const text of UNCHANGED) expect(readGrammar(text, {}).confirmed, text).toEqual([]);
  });
  it('the author\'s own grammar is never corrected, not even listed; without that evidence vernacular is listed, not changed', () => {
    const vernacular = readGrammar('It don\'t matter now.', {});
    expect(vernacular.confirmed).toEqual([]);
    expect(vernacular.uncertain.map((u) => u.text)).toContain('don\'t');
    const theirs = readGrammar('It don\'t matter now.', { constructions: ['it don\'t'] });
    expect(theirs).toEqual({ confirmed: [], uncertain: [] });
    // A clear slip is still corrected even beside the author's habit.
    expect(readGrammar('He are late.', { constructions: ['it don\'t'] }).confirmed).toMatchObject([{ text: 'are', replacement: 'is' }]);
    // A confirmed error with no correction is listed, never handed to a model rewrite.
    const knocks = readGrammar('I is the one who knocks.', {});
    expect(knocks.confirmed).toEqual([]);
    expect(knocks.uncertain.map((u) => u.text)).toContain('is');
  });
  it('a build reads the author\'s non-standard agreements off their pieces', () => {
    expect(authorConstructions(['It don\'t matter, and he don\'t care. They were late; if it were me I was there.'])).toEqual(['he don\'t', 'it don\'t']);
    expect(grammarMeasurement(['It don\'t matter now. The plan holds.']).params.constructions).toEqual(['it don\'t']);
    expect(grammarMeasurement(['They were late. The plan holds.']).params.constructions).toBeUndefined();
  });
  it('@mentions, #hashtags, $cashtags, emoji, email addresses, file names and ALL-CAPS tokens are never flagged or changed', () => {
    const text = 'Thanks to @sam_rides and @jo.cycles for the tow home. Follow #roadbike and #gravelgrinder. Bought $TSLA, mail jo.smtih@exmaple.com, '
      + 'open recieve_notes.md and teh-plan.txt. The NOOB TEAM SHIPPED IT ANYWAYS 🚴‍♂️🔥 and it held.';
    const r = readGrammar(text, {});
    expect(r.confirmed).toEqual([]);
    expect(r.uncertain).toEqual([]);
  });
});

describe('the lists that make a fix certain', () => {
  it('a documented misspelling list of at least 300 entries, none of them a common word, each with one correction', () => {
    const entries = Object.entries(MISSPELLINGS);
    expect(entries.length).toBeGreaterThanOrEqual(300);
    for (const [wrong, right] of entries) {
      expect(COMMON_WORDS.has(wrong), wrong).toBe(false);
      expect(right.length, wrong).toBeGreaterThan(0);
    }
    expect(MISSPELLINGS).toMatchObject({ recieve: 'receive', seperate: 'separate', definately: 'definitely', occured: 'occurred', acheive: 'achieve' });
  });
  it('about two thousand common words, in both dialects', () => {
    expect(COMMON_WORDS.size).toBeGreaterThan(1900);
    expect(COMMON_WORDS.size).toBeLessThan(2100);
    for (const w of ['color', 'colour', 'center', 'centre', 'the', 'there']) expect(COMMON_WORDS.has(w), w).toBe(true);
  });
  it('only a known misspelling has a correction: no neighbouring-key guess is ever made', () => {
    expect(knownMisspelling('Recieve')).toBe('receive');
    for (const w of ['thete', 'wotk', 'fime', 'learnings', 'grokkable', 'arvo', 'rhe', 'yeet', 'vite', 'cosy', 'storey']) expect(knownMisspelling(w), w).toBeNull();
  });
  it('the protected regions cover each kind of token whole', () => {
    const text = 'Hi @sam_rides #roadbike $TSLA jo@ex.com notes.md NASA 🔥 ok';
    const covered = (tok: string): boolean => { const at = text.indexOf(tok); return protectedRanges(text).some((r) => r.start <= at && r.end >= at + tok.length); };
    for (const tok of ['@sam_rides', '#roadbike', '$TSLA', 'jo@ex.com', 'notes.md', 'NASA', '🔥']) expect(covered(tok), tok).toBe(true);
    expect(covered('Hi')).toBe(false);
    expect(covered('ok')).toBe(false);
  });
  it('a lint inside a protected token is dropped, whatever the engine says', async () => {
    const text = 'Ping @jo.cycles about #gravelgrindr and $TSLAA today.';
    const lints: GrammarLint[] = ['jo.cycles', 'gravelgrindr', 'TSLAA'].map((w) => ({ rule: 'SpellCheck', kind: 'Spelling', message: 'scripted', start: text.indexOf(w), end: text.indexOf(w) + w.length, replacement: 'x' }));
    const engine: GrammarEngine = { lint: () => lints };
    resetGrammar(); setGrammarProvider({ load: () => Promise.resolve(engine) }); await ensureGrammar();
    expect(readGrammar(text, {})).toEqual({ confirmed: [], uncertain: [] });
    resetGrammar(); setGrammarProvider(harperGrammar);
  });
});

describe('with the engine off', () => {
  afterAll(() => { process.env.ATELIER_GRAMMAR = 'on'; resetGrammar(); setGrammarProvider(harperGrammar); });
  it('a build still keeps the author\'s vocabulary: every word of theirs that is not a common word', () => {
    process.env.ATELIER_GRAMMAR = 'off'; resetGrammar(); setGrammarProvider(null);
    const pieces = ['We spent the arvo on the grokkable bits.', 'We timeboxed the learnings-heavy spike, and the colour held.'];
    const vocabulary = authorVocabulary(pieces, null);
    for (const w of ['arvo', 'grokkable', 'timeboxed', 'learnings']) expect(vocabulary, w).toContain(w);
    for (const w of ['the', 'we', 'colour', 'and']) expect(vocabulary, w).not.toContain(w);
    expect(grammarMeasurement(pieces).params.vocabulary).toEqual(vocabulary);
  });
  it('a check that did not run reads "not checked", never n/a, and no REQUIRED rule is said to hold for it', () => {
    process.env.ATELIER_GRAMMAR = 'off';
    const out = describeVerify(verifyText('g', standard(rule()), 'They were late.'));
    expect(out).toMatch(/^not checked {2}g1 {2}No mechanical errors/m);
    expect(out).not.toMatch(/n\/a/);
    expect(out).toMatch(/No REQUIRED rule that was checked is broken; not checked: g1\./);
    expect(out).not.toMatch(/^No REQUIRED rule is broken\.$/m);
  });
});

describe('short-form bands', () => {
  const cases = (texts: readonly string[]) => texts.map((reference, i) => ({ id: `t${i}.md`, reference }));
  it('a band whose minimum is 0 states only its maximum', () => {
    const pieces = ['One. Two.', 'One line only here', 'Short. Then more. And more.', 'A. B. C. D.'].map((t) => `${t} ${'word '.repeat(10)}`.trim());
    for (const b of shapeBandRules(pieces)) {
      expect(b.statement, b.statement).not.toMatch(/between 0 and/);
      if (b.measurement.params.min === undefined && b.statement.includes('a new piece stays')) expect(b.statement).toMatch(/stays at most \d+/);
    }
  });
  it('a limit some of the author\'s pieces run past is the platform\'s rule, never listed as seen in every example', () => {
    const at = shortFormOffers(cases(GOOD.slice(0, 15)), { limit: { chars: 100, from: '--limit' } });
    const over = GOOD.slice(0, 15).map((t, i) => [t, `t${i}.md`] as const).filter(([t]) => t.length > 100).map(([, id]) => id);
    expect(over.length).toBeGreaterThan(0);
    const platform = at.proposals.filter((p) => p.platform);
    expect(platform).toHaveLength(1);
    expect(platform[0]).toMatchObject({ required: true, measurement: { params: { shape: ['characters'], max: 100 } } });
    for (const id of over) expect(platform[0].onExample).toContain(id);
    // The band stays the author's habit, every piece within it.
    const band = at.proposals.find((p) => !p.platform && (p.measurement?.params.shape as string[] | undefined)?.[0] === 'characters')!;
    expect(band.measurement!.params.max as number).toBeGreaterThan(100);
    expect(band.onExample).toMatch(/all 15 of your examples meet it/);
    const screen = shortScreen(at.proposals).join('\n');
    const seen = screen.slice(screen.indexOf('Seen in every one of your examples'), screen.indexOf('The platform\'s limit'));
    expect(seen).not.toContain(platform[0].statement);
    expect(screen).toMatch(/The platform's limit, required, though some of your examples run past it:\n {2}- At most 100 characters: the platform's limit\./);
  });
});

describe('through the binary', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  const PIECES = [
    'The team shipped the fix on Monday, and the panel held. Nobody asked for more.\n\nThe plan was simple: ship, watch, write it down.',
    'A short note on the release. We watched the queue drain and the panel stay green.\n\nThen we wrote it down, as always.',
    'The outage lasted an hour. The panel went red, the queue filled, and we waited.\n\nWriting it down was the easy part.',
  ];
  let backend: ChildProcess; let port = 0;
  const seed = (tag: string, grammar = 'on') => {
    const data = mkdtempSync(join(tmpdir(), `atelier-gv-${tag}-data-`)); const proj = mkdtempSync(join(tmpdir(), `atelier-gv-${tag}-proj-`));
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_GRAMMAR: grammar, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const both = (...a: string[]): string => spawnSyncAll(a, proj, env);
    mkdirSync(join(proj, 'posts'));
    PIECES.forEach((p, i) => { writeFileSync(join(proj, 'posts', `p${i + 1}.md`), p); });
    run('new', 'posts', '--no-model', '--name', 'posts');
    return { data, proj, run, both };
  };
  const spawnSyncAll = (a: readonly string[], cwd: string, env: NodeJS.ProcessEnv): string => {
    // stdout and stderr together, in one string: the run's lines go to stderr, the work to stdout. A non-zero exit is
    // read like any other: what was said is what is tested.
    try { return execFileSync('sh', ['-c', `node "${CLI}" ${a.map((x) => `'${x.replace(/'/g, '\'\\\'\'')}'`).join(' ')} 2>&1`], { encoding: 'utf8', cwd, env }); } catch (e) { return (e as { stdout: string }).stdout; }
  };
  const script = async (piece: string): Promise<void> => { await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece } } }) }); };
  const model = (): string[] => ['--allow-unsourced', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const x = /PORT (\d+)/.exec(d.toString()); if (x) ok(Number(x[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('what the checker is unsure of is listed item by item on the run, in its report and in the --json record, and the text is unchanged', async () => {
    const { data, both, run } = seed('list');
    const piece = 'It don\'t matter now. We spent the arvo fixing the build. The plan still holds.';
    await script(piece);
    const out = both('invoke', '--skill', 'posts', 'a short note', ...model());
    expect(out).toContain(piece);
    expect(out).toMatch(/Grammar, listed for you to check and never changed \(2\): "don't" \(.*\); "arvo" \(a word the checker does not know/);
    const id = readdirSync(join(data, 'skills', 'posts', 'invocations'))[0].replace(/\.json$/, '');
    const report = run('report', id);
    expect(report.replace(/\s+/g, ' ')).toMatch(/listed for you to check: 2 possible slips: "don't"/);
    expect(report.replace(/\s+/g, ' ')).toContain('"arvo" (a word the checker does not know');
    await script(piece);
    const json = run('invoke', '--skill', 'posts', 'a short note', ...model(), '--json');
    const shown = JSON.parse(json.slice(json.indexOf('{'))) as { output: string; rules: { checked: { id: string; detail: string; listed?: { text: string; why: string }[] }[] } };
    expect(shown.output).toBe(piece);
    const note = shown.rules.checked.find((c) => c.listed);
    expect(note?.listed?.map((l) => l.text)).toEqual(['don\'t', 'arvo']);
    expect(shown.rules.checked.find((c) => c.detail.includes('listed for you to check: 2 possible slips: "don\'t"'))).toBeDefined();
  }, 180_000);

  it('switched off, a run does not say every REQUIRED rule holds, and verify says "not checked"', async () => {
    const { proj, both } = seed('off', 'off');
    await script('They were late to the meeting. The plan still holds.');
    const out = both('invoke', '--skill', 'posts', 'a short note', ...model());
    expect(out).not.toMatch(/Checked: every REQUIRED measured rule holds\b(?! that)/);
    expect(out).toMatch(/Checked: every REQUIRED measured rule that could be checked holds; not checked: \S+ \(the grammar check could not run: switched off/);
    writeFileSync(join(proj, 'clean.md'), 'They were late to the meeting. The plan still holds.');
    const v = both('verify', '--skill', 'posts', 'clean.md', '--allow-unsourced');
    expect(v).toMatch(/^not checked {2}\S+ {2}No mechanical errors/m);
    expect(v).not.toMatch(/^n\/a {3}\S+ {2}No mechanical errors/m);
  }, 180_000);

  it('verify --profile reads the same range the skill card counts', () => {
    const { data, proj, both } = seed('profile', 'off');
    const L = { root: data, skillName: 'posts' };
    const active = JSON.parse(readFileSync(join(data, 'skills', 'posts', 'active.json'), 'utf8')) as { skillVersionHash: string };
    const sv = JSON.parse(readFileSync(join(data, 'skills', 'posts', 'versions', `${active.skillVersionHash}.json`), 'utf8')) as { skillVersionHash: string; standardVersionHash: string };
    const profile = { hash: 'abc123', bands: [{ id: 'wordLength', cls: 'all', band: [3, 6], median: 4.5, spread: 0.2, n: 3, role: 'MONITOR', auc: null }] } as unknown as FidelityProfile;
    fstore.setProfile(L, profile);
    const release = fstore.putRelease(L, makeRelease({ parent: null, standardVersionHash: sv.standardVersionHash, skillVersionHash: sv.skillVersionHash, settings: DEFAULT_SETTINGS,
      notes: [], profileHash: 'abc123', retrievalHash: null, createdAt: '2026-10-14T00:00:00Z', why: 'a test release' }));
    fstore.setActiveRelease(L, release.id);
    writeFileSync(join(proj, 'clean.md'), 'They were late to the meeting. The plan still holds.');
    const out = both('verify', '--skill', 'posts', 'clean.md', '--allow-unsourced', '--profile');
    expect(out).not.toMatch(/holds no counted features/);
    expect(out).toMatch(/profile \(0 = inside your range/);
    expect(out).toMatch(/wordLength +\S+ {2}your range 3 to 6/);
  }, 120_000);
});
