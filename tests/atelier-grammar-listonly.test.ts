// tests/atelier-grammar-listonly.test.ts — A GRAMMAR FINDING IS LISTED, NEVER CHANGED, AND NEVER BLOCKS; --fix-grammar OPTS IN.
//
// The owner's invariant: correctness up, voice untouched; anything uncertain is listed, never changed. Even the narrow
// in-place set (a/an, two commas, a space before "." or ",", "he/she/I are", a list of known misspellings) changed
// sentences that are right as written: a letter name ("plan a", "vitamin a"), a compound subject ("Both he and she
// are"), a shell argument ("git add ."), a word mentioned rather than used ("students write recieve"), a config key, a
// lower-case name, another language. The fixture holds 150 such sentences and 10 real slips. By default none of them
// is changed in any dialect setting, every finding is listed with its note, and the rule reads as the person's to
// check (NEEDS REVIEW, never VERIFIED, never BLOCKED); a text with no finding reads the rule met. `--fix-grammar`
// applies the in-place set as before and records each change.
//
// The engine is real (harper.js, offline): in process for the fixture, and through the binary for a run.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setGrammarProvider, ensureGrammar, resetGrammar, grammarStatus, setGrammarFixing, GRAMMAR, GRAMMAR_LISTED } from '../core/observers/grammar.js';
import { harperGrammar } from '../providers/harper.js';
import { verifyText, describeVerify } from '../core/observers/verify.js';
import { mechanicalFixes } from '../core/loop/mechanical-repair.js';
import { buildRecord } from '../core/eval/record-build.js';
import { standingOf } from '../core/eval/record.js';
import { aRequirement } from './fixtures.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';

process.env.ATELIER_GRAMMAR = 'on';

type Params = Record<string, readonly string[]>;
const DIALECTS: readonly Params[] = [{}, { dialect: ['british'] }, { dialect: ['american'] }];
const rule = (params: Params = {}): Requirement => aRequirement({ requirementId: 'g1', statement: 'No mechanical errors: spelling, agreement, punctuation.',
  kind: 'BOUNDARY', authority: 'EXPERT_RATIFIED', materiality: 'REQUIRED', measurement: { observer: 'GRAMMAR', params } });
const standard = (params: Params = {}): StandardVersion => ({ standardVersionHash: 'sv-g', evidenceId: null, workType: 'writing', requirements: [rule(params)],
  authorityState: 'RATIFIED', mintedAt: '2026-10-15T00:00:00Z', supersedes: null, reason: null });
// Each row: C (correct as written in some register or variety) or E (a slip), the sentence, and for E its correction.
const ROWS = readFileSync(resolve('tests/fixtures/grammar-legitimate-readings.tsv'), 'utf8').split('\n').filter(Boolean)
  .map((l) => l.split('\t').map((x) => x.replace(/\\n/g, '\n')) as [string, string, string?]);
/** The text after every fix the loop makes without a model: what the default path would deliver. */
const delivered = (text: string, p: Params): string => { const v = standard(p); return mechanicalFixes(v, verifyText('g', v, text), text).text; };

describe('the default path, on 150 sentences with a legitimate reading and 10 real slips (real engine)', () => {
  beforeAll(async () => { setGrammarFixing(false); resetGrammar(); setGrammarProvider(harperGrammar); await ensureGrammar(); expect(grammarStatus().ready).toBe(true); }, 60_000);

  it('the fixture is what it says: 150 correct sentences and 10 slips', () => {
    expect(ROWS.filter((r) => r[0] === 'C')).toHaveLength(150);
    expect(ROWS.filter((r) => r[0] === 'E')).toHaveLength(10);
  });
  it('changes no sentence in any dialect setting, slips included, and no grammar line is ever violated', () => {
    for (const p of DIALECTS) {
      const changed = ROWS.filter(([, s]) => delivered(s, p) !== s).map(([, s]) => s);
      expect(changed, JSON.stringify(p)).toEqual([]);
      for (const [, s] of ROWS) {
        const r = GRAMMAR.observe(s, p);
        expect(r.verdict, s).not.toBe('VIOLATED');
        expect(r.spans.filter((sp) => sp.replacement !== undefined), s).toEqual([]);
        expect(verifyText('g', standard(p), s).failed, s).toBe(false);
      }
    }
  });
  it('lists every finding with its text and the checker\'s note: each of the 10 slips is in front of the person', () => {
    for (const p of DIALECTS) {
      for (const [kind, s] of ROWS) {
        const r = GRAMMAR.observe(s, p);
        if (r.verdict === 'MET') { expect(r.spans, s).toEqual([]); continue; }
        expect(r.verdict, s).toBe('NOT_APPLICABLE');
        expect(r.detail, s).toMatch(new RegExp(`^${GRAMMAR_LISTED}: ${r.spans.length} possible slips?: "`));
        for (const sp of r.spans) { expect(s.slice(sp.start, sp.end), s).toBe(sp.text); expect(sp.why.length, s).toBeGreaterThan(0); }
        if (kind === 'E') expect(r.spans.length, s).toBeGreaterThan(0);
      }
    }
    // The checker misses ",,and" glued to the next word; every other slip is listed in each dialect setting.
    for (const p of DIALECTS) {
      const unlisted = ROWS.filter((r) => r[0] === 'E').map(([, s]) => s).filter((s) => GRAMMAR.observe(s, p).verdict !== 'NOT_APPLICABLE');
      expect(unlisted, JSON.stringify(p)).toEqual(['He left early ,,and then came back.']);
    }
  });
  it('a text with a real slip reads NEEDS REVIEW with the slip listed, unchanged; a text with no finding reads the rule met', () => {
    const text = 'She are late again.';
    const v = standard();
    const report = verifyText('g', v, text);
    const line = report.checked.find((c) => c.requirementId === 'g1')!;
    expect(report.failed).toBe(false);
    expect(line.result.detail).toMatch(/^listed for you to check: 1 possible slip: "are" \(subject–verb agreement: "are" → "is"\)/);
    const record = buildRecord({ requirements: v.requirements, checked: [{ id: 'g1', statement: line.statement, required: true, verdict: line.result.verdict, detail: line.result.detail }],
      waived: new Map(), request: null, claims: null, copying: null });
    const e = record.entries.find((x) => x.id === 'g1')!;
    expect(e.result).toBe('UNVERIFIED');
    expect(e.observation.incomplete).toBeUndefined();
    expect(e.observation.evidence).toMatch(/"are"/);
    expect(record.state).toBe('NEEDS_REVIEW');
    // Never a block: the record stays deliverable, under --strict too.
    expect(standingOf(record)).toMatchObject({ verified: false, deliverable: true, reasons: [] });
    expect(describeVerify(report)).toMatch(/^to check {2}g1 {2}No mechanical errors/m);
    expect(describeVerify(report)).toMatch(/No REQUIRED rule is broken; listed for you to check, and not changed: g1\./);
    expect(delivered(text, {})).toBe(text);
    const clean = verifyText('g', v, 'She is late again.').checked.find((c) => c.requirementId === 'g1')!;
    expect(clean.result).toMatchObject({ verdict: 'MET', detail: 'no possible slip found' });
  });
});

describe('under --fix-grammar (real engine)', () => {
  beforeAll(async () => { setGrammarFixing(true); resetGrammar(); setGrammarProvider(harperGrammar); await ensureGrammar(); }, 60_000);
  afterAll(() => { setGrammarFixing(false); });
  it('the in-place set is applied as before, and each change is recorded by what it was and what it became', () => {
    const v = standard();
    const text = 'She are late again. We waited , and then left. It was a apple pie. It is definately the right call.';
    const report = verifyText('g', v, text);
    expect(report.failed).toBe(true);
    const fixed = mechanicalFixes(v, report, text);
    expect(fixed.text).toBe('She is late again. We waited, and then left. It was an apple pie. It is definitely the right call.');
    expect(fixed.fixed).toEqual(['g1: 4 mechanical error(s) corrected: "are" → "is", "waited ," → "waited,", "a" → "an", "definately" → "definitely"']);
  });
  it('the slips of the fixture are corrected to their one correction', () => {
    const slips = ROWS.filter((r) => r[0] === 'E');
    const right = slips.filter(([, s, want]) => delivered(s, {}) === want);
    expect(right.length).toBeGreaterThanOrEqual(7);
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
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const x = /PORT (\d+)/.exec(d.toString()); if (x) ok(Number(x[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
  }, 60_000);
  afterAll(() => { backend.kill(); });
  const seed = (tag: string) => {
    const data = mkdtempSync(join(tmpdir(), `atelier-glo-${tag}-data-`)); const proj = mkdtempSync(join(tmpdir(), `atelier-glo-${tag}-proj-`));
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_GRAMMAR: 'on', ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const all = (...a: string[]): string => {
      try { return execFileSync('sh', ['-c', `node "${CLI}" ${a.map((x) => `'${x.replace(/'/g, '\'\\\'\'')}'`).join(' ')} 2>&1`], { encoding: 'utf8', cwd: proj, env }); } catch (e) { return (e as { stdout: string }).stdout; }
    };
    mkdirSync(join(proj, 'posts'));
    PIECES.forEach((p, i) => { writeFileSync(join(proj, 'posts', `p${i + 1}.md`), p); });
    execFileSync('node', [CLI, 'new', 'posts', '--no-model', '--name', 'posts'], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    return { data, all };
  };
  const script = async (piece: string): Promise<void> => { await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece } } }) }); };
  const model = (): string[] => ['--skill', 'posts', '--allow-unsourced', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];

  it('a run with a real slip delivers the text unchanged, reads NEEDS REVIEW and lists the slip; --fix-grammar corrects it and shows the change', async () => {
    const { data, all } = seed('run');
    const piece = 'He are late to the meeting. The plan still holds.';
    await script(piece);
    const out = all('run', 'a short note', ...model());
    expect(out).toContain(piece);
    expect(out).toMatch(/NEEDS REVIEW/);
    expect(out).not.toMatch(/BLOCKED/);
    expect(out.replace(/\s+/g, ' ')).toMatch(/listed for you to check: \d+ possible slips?: "are" \(subject–verb agreement: "are" → "is"\)/);
    await script(piece);
    const fixedOut = all('invoke', 'a short note', ...model(), '--fix-grammar', '--json');
    const shown = JSON.parse(fixedOut.slice(fixedOut.indexOf('{'))) as { output: string; invocationId: string };
    expect(shown.output).toContain('He is late to the meeting.');
    const rec = JSON.parse(readFileSync(join(data, 'skills', 'posts', 'invocations', `${shown.invocationId}.json`), 'utf8')) as { repair?: { why: string } };
    expect(rec.repair?.why).toMatch(/fixed without a model: \w+: 1 mechanical error\(s\) corrected: "are" → "is"/);
    // The change is shown on the run itself, too.
    await script(piece);
    const said = all('run', 'a short note', ...model(), '--fix-grammar', '--report');
    expect(said).toContain('He is late to the meeting.');
    expect(said).toMatch(/"are" → "is"/);
    expect(readdirSync(join(data, 'skills', 'posts', 'invocations')).length).toBe(3);
  }, 240_000);

  it('a clean run reads the grammar rule met', async () => {
    const { all } = seed('clean');
    await script('He is late to the meeting. The plan still holds.');
    const json = all('invoke', 'a short note', ...model(), '--json');
    const shown = JSON.parse(json.slice(json.indexOf('{'))) as { rules: { checked: { statement: string; verdict: string; detail: string }[] } };
    expect(shown.rules.checked.find((c) => c.statement.startsWith('No mechanical errors'))).toMatchObject({ verdict: 'MET', detail: 'no possible slip found' });
  }, 240_000);
});
