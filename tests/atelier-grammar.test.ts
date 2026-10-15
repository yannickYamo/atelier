// tests/atelier-grammar.test.ts — MECHANICAL ERRORS CORRECTED; THE VOICE, THE CLAIMS AND THE CODE LEFT ALONE.
//
// The owner's acceptance examples, held as invariants: an unintended agreement error is corrected in place; a
// fragment the author writes is kept; no correction changes a figure, a product name or a conclusion; an ambiguous
// construction is listed, never rewritten; a British author keeps British spelling and an American one American;
// code, quotations, addresses and citations are never touched; an engine that cannot load leaves the check
// unverified with its reason; a skill built before this rule rebuilds to the same bytes; a new build carries it REQUIRED.
//
// The engine is real (harper.js, offline) and loaded once for this file: the suite sets it aside elsewhere
// (vitest.config.ts) because its dictionary costs seconds a process. Nothing here calls a model.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { measure } from '../core/observers/registry.js';
import { verifyText } from '../core/observers/verify.js';
import { setGrammarProvider, ensureGrammar, resetGrammar, readGrammar, protectedRanges, dialectOfPieces, authorVocabulary, grammarStatus,
  MECHANICAL_RULES, GRAMMAR_NOT_RUN, GRAMMAR_OFF, GRAMMAR_NOTE_SUFFIX, isGrammarNote, type GrammarEngine, type GrammarLint } from '../core/observers/grammar.js';
import { harperGrammar } from '../providers/harper.js';
import { grammarProvider, stubGrammar } from '../providers/grammar.js';
import { correctMechanicalErrors, mechanicalFixes } from '../core/loop/mechanical-repair.js';
import { planRepair, regressions, acceptRepair } from '../core/loop/repair.js';
import { checkDraft } from '../core/loop/run-repair.js';
import { suggest } from '../core/ratification/suggest.js';
import { grammarOffer } from '../core/method/standard.js';
import { buildRecord } from '../core/eval/record-build.js';
import { aRequirement } from './fixtures.js';
import { parseMeasure } from '../cli/commands/ratify.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';

process.env.ATELIER_GRAMMAR = 'on';

const rule = (params: Record<string, readonly string[]> = {}): Requirement => aRequirement({ requirementId: 'g1', statement: 'No mechanical errors: spelling, agreement, punctuation.',
  kind: 'BOUNDARY', materiality: 'REQUIRED', measurement: { observer: 'GRAMMAR', params } });
const standard = (...rules: Requirement[]): StandardVersion => ({ standardVersionHash: 'sv-g', evidenceId: null, workType: 'writing', requirements: rules,
  authorityState: 'RATIFIED', mintedAt: '2026-10-14T00:00:00Z', supersedes: null, reason: null });
const m = (params: Record<string, readonly string[]> = {}) => ({ observer: 'GRAMMAR' as const, params });

describe('the grammar rule, with the real engine', () => {
  beforeAll(async () => { resetGrammar(); setGrammarProvider(harperGrammar); await ensureGrammar(); expect(grammarStatus().ready).toBe(true); }, 60_000);

  it('an unintended subject–verb agreement error is found, with its correction, and corrected in place', () => {
    const text = 'They was late to the meeting. The plan still holds.';
    const r = measure(text, m());
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans).toMatchObject([{ text: 'was', replacement: 'were' }]);
    expect(r.spans[0].why).toMatch(/subject–verb agreement/);
    expect(r.error).toBe(1);
    const fixed = correctMechanicalErrors(text, r.spans);
    expect(fixed).toEqual({ text: 'They were late to the meeting. The plan still holds.', corrected: 1 });
    expect(measure(fixed.text, m()).verdict).toBe('MET');
  });
  it('a repeated word, a wrong article, a missing apostrophe and a space before a comma are corrected; nothing else moves', () => {
    const text = 'The the team shipped an bug fix. Its a plain gain, isnt it? Really , it is.';
    const out = correctMechanicalErrors(text, measure(text, m()).spans);
    expect(out.text).toBe('The team shipped a bug fix. It\'s a plain gain, isn\'t it? Really, it is.');
    expect(out.corrected).toBe(5);
  });
  it('the fix runs through the mechanical repair and is kept by the never-worse acceptance', () => {
    const v = standard(rule());
    const text = 'They was late to the meeting. The plan still holds.';
    const before = verifyText('g', v, text);
    const fixed = mechanicalFixes(v, before, text);
    expect(fixed.text).toBe('They were late to the meeting. The plan still holds.');
    expect(fixed.fixed).toEqual(['g1: 1 mechanical error(s) corrected']);
    const after = verifyText('g', v, fixed.text);
    expect(acceptRepair(before, after, { wordsAdded: true })).toMatchObject({ ok: true });
  });
  it('an intentional fragment, an "And" opener, a one-word sentence and a lower-case styling are the author\'s', () => {
    const text = 'Fragment. And yet. Nobody came, which was the point. One word. Then silence.\n\nwe ship on fridays. that is the whole rule.';
    const r = readGrammar(text, {});
    expect(r.confirmed).toEqual([]);
    expect(measure(text, m()).verdict).toBe('MET');
    // A capitalisation the checker proposes is listed, never made.
    expect(r.uncertain.some((s) => /SentenceCapitalization|Capitaliz/.test(s.why))).toBe(true);
  });
  it('double punctuation and a space before punctuation are corrected; an ellipsis, "!!" and a smiley are the author\'s', () => {
    const text = 'We shipped it,, and then we waited ; the queue drained. Done ? Yes.. It held!! Wait... then :) fine.';
    const r = measure(text, m());
    expect(r.spans.map((s) => s.text)).toEqual([',,', ' ;', ' ?', '..']);
    expect(correctMechanicalErrors(text, r.spans).text).toBe('We shipped it, and then we waited; the queue drained. Done? Yes. It held!! Wait... then :) fine.');
  });
  it('a word repeated for emphasis is kept', () => {
    expect(readGrammar('It was very very late. No no, not that.', {}).confirmed).toEqual([]);
  });
  it('a product name, a figure and a technical conclusion are never changed; a name the checker would respell is listed', () => {
    const text = 'The Widgit sold 2,000 units, a 15% rise, and Acme Corp\'s margin held at 42%. The cache reduces p99 latency by 30ms.';
    const r = readGrammar(text, {});
    expect(r.confirmed).toEqual([]);
    expect(r.uncertain.filter((s) => s.text === 'Widgit')).toHaveLength(1);
    expect(r.uncertain.find((s) => s.text === 'Widgit')?.why).toMatch(/a name, an acronym or a coined word is the author's/);
  });
  it('an ambiguous construction is listed to check, and the list is never rewritten or counted as worse', () => {
    const v = standard(rule());
    const text = 'It\'s Acme Corp\'s product, and the bug fix landed. Could of been worse.';
    const report = checkDraft('g', v, text, { guardClaims: false });
    const own = report.checked.find((c) => c.requirementId === 'g1');
    const note = report.checked.find((c) => c.requirementId === `g1${GRAMMAR_NOTE_SUFFIX}`);
    expect(own?.result.verdict).toBe('MET');
    expect(note).toBeDefined();
    expect(isGrammarNote(note!)).toBe(true);
    expect(note?.materiality).toBe('PREFERRED');
    expect(note?.result.spans.map((s) => s.text)).toContain('Could of');
    expect(report.failed).toBe(false);
    // Nothing points a rewrite at it, required or not.
    expect(planRepair(text, report, { requiredOnly: false })).toEqual([]);
    // A draft that gains one is not worse than one without.
    const clean = checkDraft('g', v, 'It landed.', { guardClaims: false });
    expect(regressions(clean, report)).toEqual([]);
  });
  it('a British author keeps British spelling, an American one American, and with no dialect recorded only a word wrong in both counts', () => {
    expect(measure('The colour of the harbour pleased the neighbours.', m({ dialect: ['british'] })).verdict).toBe('MET');
    expect(measure('The color of the harbor pleased the neighbors.', m({ dialect: ['american'] })).verdict).toBe('MET');
    const uk = measure('The color of the harbour pleased the neighbours.', m({ dialect: ['british'] }));
    expect(uk.spans).toMatchObject([{ text: 'color', replacement: 'colour' }]);
    const us = measure('The colour of the harbor pleased the neighbors.', m({ dialect: ['american'] }));
    expect(us.spans).toMatchObject([{ text: 'colour', replacement: 'color' }]);
    expect(measure('The colour of the harbor pleased everyone.', m()).verdict).toBe('MET');
    expect(measure('We recieve the harbor report.', m()).spans).toMatchObject([{ text: 'recieve', replacement: 'receive' }]);
  });
  it('the dialect and the vocabulary are read off the pieces', () => {
    const british = Array.from({ length: 4 }, () => 'We organise the colour of the centre and the harbour, and favour a labour of honour; the behaviour is realised.').join(' ');
    expect(dialectOfPieces([british])).toBe('british');
    expect(dialectOfPieces(['The colour and the color.'])).toBeNull();
    const vocabulary = authorVocabulary(['Our zorbletron pipeline runs nightly. The zorbletron is ours.'], null, ['leverage=>use']);
    expect(vocabulary).toEqual(['leverage', 'use', 'zorbletron']);
    // Unknown to the checker, the coinage is at least listed to check; known as the author's, it is nowhere.
    expect(readGrammar('The zorbletron ran.', {}).uncertain.map((x) => x.text)).toContain('zorbletron');
    const own = readGrammar('The zorbletron ran.', { vocabulary });
    expect(own.confirmed).toEqual([]);
    expect(own.uncertain.find((x) => x.text === 'zorbletron')?.why).toMatch(/a word of the author's own/);
    // A word the request or the material carries is the person's too.
    expect(readGrammar('The zorbletron ran.', {}, { request: 'Describe the zorbletron.' }).uncertain.find((x) => x.text === 'zorbletron')?.why).toMatch(/a word of the author's own/);
  });
  it('code, quotations, block quotes, URLs, paths, citations and figures are never touched', () => {
    const text = ['Visit https://example.com/recieve-the-the for the note.', 'In `the the code` nothing counts, nor in the fence below.',
      '```', 'recieve the the', '```', '"The the quote stays as they said it," she said.', '> The the quoted line stays.',
      'See src/foo.ts:12 and config.yaml:3, and [12], and (Smith 2020).', 'It cost $1,200 and 15% more.', 'The lenght here is wrong.'].join('\n');
    const ranges = protectedRanges(text);
    expect(ranges.length).toBeGreaterThan(6);
    const r = measure(text, m());
    expect(r.spans.map((s) => s.text)).toEqual(['lenght']);
    expect(correctMechanicalErrors(text, r.spans).text).toBe(text.replace('lenght', 'length'));
  });
  it('the allowed kinds are a documented list, and nothing outside it is corrected', () => {
    expect(Object.keys(MECHANICAL_RULES)).toEqual(['SpellCheck', 'PronounVerbAgreement', 'PronounInflectionBe', 'ThereIsAgreement', 'IAmAgreement', 'RepeatedWords', 'AnA', 'ItsContraction', 'CommaFixes', 'DoublePunctuation', 'SpaceBeforePunctuation']);
    for (const s of readGrammar('The bug fix could of been worse, and i think teh plan holds.  Fine.', {}).confirmed) {
      expect(Object.values(MECHANICAL_RULES).concat('a common typo').some((label) => s.why.startsWith(label))).toBe(true);
    }
  });
  it('a build offers the rule required, read from the examples', () => {
    const offer = grammarOffer([{ id: 'a.md', reference: 'They were late. The plan holds.' }, { id: 'b.md', reference: 'The zorbletron ran clean.' }]);
    expect(offer).toMatchObject([{ required: true, counted: true, origin: 'SHOWN_BY_EXAMPLE', measurement: { observer: 'GRAMMAR', params: { vocabulary: ['zorbletron'] } } }]);
    expect(offer[0].onExample).toMatch(/2 of 2 example\(s\) hold it/);
    expect(suggest(rule(), undefined, 'GENERATE')).toMatchObject({ decision: 'APPROVE', materiality: 'REQUIRED' });
  });
});

describe('the guards, on a scripted engine', () => {
  const lint = (l: Partial<GrammarLint> & Pick<GrammarLint, 'rule' | 'start' | 'end'>): GrammarLint => ({ kind: 'Grammar', message: 'scripted', replacement: null, ...l });
  const scripted = (lints: readonly GrammarLint[]): GrammarEngine => ({ lint: () => lints });
  const under = async (lints: readonly GrammarLint[]): Promise<void> => { resetGrammar(); setGrammarProvider({ load: () => Promise.resolve(scripted(lints)) }); await ensureGrammar(); };
  it('a correction that would change a figure is refused and listed, with the reason', async () => {
    const text = 'Pick a apple for the slot.';
    await under([lint({ rule: 'AnA', start: 5, end: 6, replacement: 'an 3' })]);
    const r = readGrammar(text, {});
    expect(r.confirmed).toEqual([]);
    expect(r.uncertain).toMatchObject([{ text: 'a', why: expect.stringMatching(/would change a figure/) }]);
  });
  it('a correction that would change a capitalised name is refused and listed', async () => {
    const text = 'Ask Acme , then decide.';
    await under([lint({ rule: 'CommaFixes', start: 4, end: 10, replacement: 'Bcme,' })]);
    const r = readGrammar(text, {});
    expect(r.confirmed).toEqual([]);
    expect(r.uncertain[0].why).toMatch(/would change a name/);
  });
  it('a spelling suggestion that is another word, not this one spelt right, is refused', async () => {
    const text = 'The grommit held.';
    await under([lint({ rule: 'SpellCheck', kind: 'Spelling', start: 4, end: 11, replacement: 'bracket' })]);
    expect(readGrammar(text, {}).confirmed).toEqual([]);
    expect(readGrammar(text, {}).uncertain[0].why).toMatch(/another word/);
  });
  it('a correction handed straight to the repair that would move a figure or drop a name is not made', () => {
    const text = 'We asked Acme for 40 units. They was pleased.';
    const at = (w: string, replacement: string) => ({ start: text.indexOf(w), end: text.indexOf(w) + w.length, text: w, why: 'scripted', replacement });
    expect(correctMechanicalErrors(text, [at('40', '14')])).toEqual({ text, corrected: 0 });
    expect(correctMechanicalErrors(text, [at('Acme', 'acne'), at('was', 'were')])).toEqual({ text, corrected: 0 });
    expect(correctMechanicalErrors(text, [at('was', 'were')]).text).toBe('We asked Acme for 40 units. They were pleased.');
  });
  it('the rule can be declared by hand, with a dialect and words of the author\'s own', () => {
    expect(parseMeasure('GRAMMAR:dialect=British,vocabulary=zorbletron|Widgit')).toEqual({ observer: 'GRAMMAR', params: { dialect: ['british'], vocabulary: ['zorbletron', 'widgit'] } });
    expect(parseMeasure('GRAMMAR')).toEqual({ observer: 'GRAMMAR', params: {} });
  });
  afterAll(() => { resetGrammar(); setGrammarProvider(harperGrammar); });
});

describe('the suite\'s fixed checker (ATELIER_GRAMMAR=stub)', () => {
  it('is what the suite wires in, through the same wiring point as harper', () => {
    expect(grammarProvider({ ATELIER_GRAMMAR: 'stub' })).toBe(stubGrammar);
    expect(grammarProvider({})).toBe(harperGrammar);
  });
  it('reads clean text as MET and its known slips as confirmed errors with corrections', async () => {
    resetGrammar(); setGrammarProvider(stubGrammar); await ensureGrammar();
    try {
      expect(measure('They were late to the meeting. The plan still holds.', m())).toMatchObject({ verdict: 'MET', detail: 'no mechanical error' });
      const r = measure('They was late. We recieve the the report.', m());
      expect(r.verdict).toBe('VIOLATED');
      expect(correctMechanicalErrors('They was late. We recieve the the report.', r.spans).text).toBe('They were late. We receive the report.');
    } finally { resetGrammar(); setGrammarProvider(harperGrammar); }
  });
});

describe('an engine that cannot load', () => {
  it('leaves the check NOT_APPLICABLE with the reason, and the record unverified, never passed', async () => {
    resetGrammar();
    setGrammarProvider({ load: () => Promise.reject(new Error('no wasm here')) });
    await ensureGrammar();
    const r = measure('They was late.', m());
    expect(r.verdict).toBe('NOT_APPLICABLE');
    expect(r.detail).toBe(`${GRAMMAR_NOT_RUN}: could not load: no wasm here`);
    const g = rule();
    const record = buildRecord({ requirements: [g], checked: [{ id: 'g1', statement: g.statement, required: true, verdict: 'NOT_APPLICABLE', detail: r.detail }],
      waived: new Map(), request: null, claims: null, copying: null });
    const e = record.entries.find((x) => x.id === 'g1');
    expect(e?.result).toBe('UNVERIFIED');
    expect(e?.observation.incomplete).toMatch(/not checked: g1 \(the grammar check could not run: could not load: no wasm here\)/);
    expect(record.state).toBe('NEEDS_REVIEW');
    // With no engine wired in at all, the same: a reason, never a pass.
    resetGrammar(); setGrammarProvider(null); await ensureGrammar();
    expect(measure('They was late.', m()).detail).toMatch(/could not load: no grammar checker is wired into this process/);
    resetGrammar(); setGrammarProvider(harperGrammar);
  });
  it('switched off by the owner, the check reads exactly like a load failure: unverified with the reason, a required rule needs review', () => {
    process.env.ATELIER_GRAMMAR = 'off';
    try {
      const r = measure('They was late.', m());
      expect(r.verdict).toBe('NOT_APPLICABLE');
      expect(r.detail).toBe(`${GRAMMAR_NOT_RUN}: ${GRAMMAR_OFF}`);
      expect(r.detail).toMatch(/switched off/);
      const g = rule();
      const record = buildRecord({ requirements: [g], checked: [{ id: 'g1', statement: g.statement, required: true, verdict: 'NOT_APPLICABLE', detail: r.detail }],
        waived: new Map(), request: null, claims: null, copying: null });
      const e = record.entries.find((x) => x.id === 'g1');
      expect(e?.result).toBe('UNVERIFIED');
      expect(e?.observation.incomplete).toMatch(/not checked: g1 \(the grammar check could not run: switched off/);
      expect(record.state).toBe('NEEDS_REVIEW');
    } finally { process.env.ATELIER_GRAMMAR = 'on'; }
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
  const seed = (tag: string): { data: string; proj: string; run: (...a: string[]) => string; tryRun: (...a: string[]) => { code: number; out: string } } => {
    const data = mkdtempSync(join(tmpdir(), `atelier-grammar-${tag}-data-`)); const proj = mkdtempSync(join(tmpdir(), `atelier-grammar-${tag}-proj-`));
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_GRAMMAR: 'on', ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const tryRun = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: run(...a) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: `${x.stdout}${x.stderr}` }; }
    };
    return { data, proj, run, tryRun };
  };
  const storedStandards = (data: string, skill: string): StandardVersion[] => {
    const dir = join(data, 'skills', skill, 'standards');
    return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as StandardVersion) : [];
  };
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const x = /PORT (\d+)/.exec(d.toString()); if (x) ok(Number(x[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('a new build from pieces carries the rule REQUIRED and ratified; verify holds a draft to it and lists what is uncertain', () => {
    const { data, proj, run, tryRun } = seed('new');
    mkdirSync(join(proj, 'posts'));
    PIECES.forEach((p, i) => { writeFileSync(join(proj, 'posts', `p${i + 1}.md`), p); });
    run('new', 'posts', '--no-model', '--name', 'posts');
    const [v] = storedStandards(data, 'posts');
    const g = v.requirements.find((r) => r.measurement?.observer === 'GRAMMAR');
    expect(g).toMatchObject({ statement: 'No mechanical errors: spelling, agreement, punctuation.', materiality: 'REQUIRED', authority: 'EXPERT_RATIFIED', appliesWhen: 'GENERAL' });
    expect(readFileSync(join(proj, '.claude', 'skills', 'posts', 'SKILL.md'), 'utf8')).toContain('No mechanical errors');
    writeFileSync(join(proj, 'draft.md'), 'They was late to the meeting, and the bug fix landed. The plan still holds.');
    const r = tryRun('verify', '--skill', 'posts', 'draft.md', '--allow-unsourced');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(new RegExp(`FAIL {2}${g?.requirementId ?? 'g'} {2}No mechanical errors`));
    expect(r.out).toMatch(/1 mechanical error\(s\): subject–verb agreement; 1 construction\(s\) the checker is unsure of/);
    expect(r.out).toMatch(/› "was" {2}\(subject–verb agreement: "was" → "were"\)/);
    expect(r.out).toMatch(new RegExp(`warn {2}${g?.requirementId ?? 'g'}·check {2}Constructions the grammar checker is unsure of`));
    writeFileSync(join(proj, 'clean.md'), 'They were late to the meeting. The plan still holds.');
    expect(tryRun('verify', '--skill', 'posts', 'clean.md', '--allow-unsourced').code).toBe(0);
    // Switched off, the same clean draft is not passed on the rule: it is named as not checked, and needs review.
    const off = execFileSync('node', [CLI, 'verify', '--skill', 'posts', 'clean.md', '--allow-unsourced'], { encoding: 'utf8', cwd: proj,
      env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_GRAMMAR: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
    expect(off).toMatch(/NEEDS REVIEW/);
    expect(off).toMatch(/switched off for this process/);
  }, 120_000);

  it('a skill built before this rule rebuilds to the same bytes, and gains no rule', () => {
    const { data, proj, run } = seed('old');
    run('add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage=>use');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'house');
    const skill = join(proj, '.claude', 'skills', 'house', 'SKILL.md');
    const first = readFileSync(skill);
    run('build', '--name', 'house');
    expect(readFileSync(skill).equals(first)).toBe(true);
    const standards = storedStandards(data, 'house');
    expect(standards).toHaveLength(1);
    expect(standards[0].requirements.some((r) => r.measurement?.observer === 'GRAMMAR')).toBe(false);
    expect(first.toString()).not.toContain('No mechanical errors');
  }, 120_000);

  it('a run corrects the error without a model, records the fix, and the delivered text carries it', async () => {
    const { data, proj, run } = seed('run');
    mkdirSync(join(proj, 'posts'));
    PIECES.forEach((p, i) => { writeFileSync(join(proj, 'posts', `p${i + 1}.md`), p); });
    run('new', 'posts', '--no-model', '--name', 'posts');
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: 'They was late to the meeting. The plan still holds.' } } }) });
    const out = run('invoke', '--skill', 'posts', 'a short note', '--allow-unsourced', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', '--json');
    const shown = JSON.parse(out.slice(out.indexOf('{'))) as { output: string; invocationId: string };
    expect(shown.output).toContain('They were late to the meeting.');
    // The stored invocation carries the repair: what was broken before, and how it was fixed.
    const rec = JSON.parse(readFileSync(join(data, 'skills', 'posts', 'invocations', `${shown.invocationId}.json`), 'utf8')) as { repair?: { why: string; violatedBefore: string[]; violatedAfter: string[] } };
    expect(rec.repair?.violatedBefore.length).toBe(1);
    expect(rec.repair?.violatedAfter).toEqual([]);
    expect(rec.repair?.why).toMatch(/fixed without a model: \w+: 1 mechanical error\(s\) corrected/);
  }, 120_000);
});
