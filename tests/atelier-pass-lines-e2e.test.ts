// THE 2026-10-22 STUDY'S FAILED PASS LINES, OFFLINE, THROUGH THE BINARY. A small copy of the claims fixture (its method,
// three examples with their material, one held-out case): the citation step's written check, written against the names
// a person cites ("notice of loss"), qualifies at the build; a strict run with the material bound reaches VERIFIED once
// the owner accepted the judgement steps and the unread part of the Summary step, and NEEDS REVIEW before (A4); the check
// names an uncited sentence and the repair fixes it (A3, A7); the speculation defect is rewritten with the negation the
// rewrite needs (A7); the hook exits 2 on an event that is not JSON and 0 on a golden with no material, naming the
// required rule it could not read (A6). Against the scripted backend: no model is called.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { planFor } from '../core/plan/execution-plan.js';

const CLI = resolve('dist/cli/atelier.mjs');
const FIX = resolve('tests/fixtures/samples/claims');
const REQUEST = 'Draft the claims assessment memo for this claim file.';
const body = (file: string): string => readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
const HELD = body(join(FIX, 'held-out', 'e10.md'));
const UNCITED_SENTENCE = 'The items were in a locked container at the time.';
const UNCITED = HELD.replace('The items were in a locked container at the time [police report].', UNCITED_SENTENCE);

// THE CITATION STEP'S CHECK, as a reader writes it from the prompt: every sentence of the Facts section carries a bracketed
// name, and every bracketed name is a document of the material, compared as the material is named.
const CITES = [
  '(text, request, material) => {',
  '  const names = material.map((m) => m.name.toLowerCase());',
  '  const head = /^## Facts[ \\t]*$/m.exec(text); if (!head) return null;',
  '  const from = head.index + head[0].length; const next = text.slice(from).search(/^## /m);',
  '  const end = next < 0 ? text.length : from + next; const sec = text.slice(from, end);',
  '  const spans = []; let at = 0;',
  '  for (const s of sec.split(/(?<=\\.)\\s+/)) {',
  '    const t = s.trim(); if (!t) continue; const start = from + sec.indexOf(t, at); at = sec.indexOf(t, at) + t.length;',
  '    const cites = [...t.matchAll(/\\[([^\\]]+)\\]/g)].map((c) => c[1].toLowerCase());',
  '    if (!cites.length || cites.some((c) => !names.includes(c))) spans.push({ start, end: start + t.length, why: cites.length ? "cites a document not in the file" : "no document cited" });',
  '  }',
  '  return { ok: spans.length === 0, detail: spans.length ? spans.length + " fact(s) without a citation of the file" : "every fact cites the file", spans };',
  '}',
].join('\n');
const STEP = (id: string, how: string, quote: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ id, how, measure: null, source: null, quote, means: quote, near: false, ...extra });
const CHECKS = { checks: [
  STEP('1', 'measure', 'Open with a Summary section', { measure: 'PRESENCE:sections=summary,body=1,opens=1', means: 'a Summary section first' }),
  STEP('2', 'written', 'Every fact cites the document in the file', { source: CITES, means: 'each sentence of the Facts section cites a document in the material' }),
  STEP('3', 'judgement', 'every exclusion that could apply is addressed'),
  STEP('4', 'judgement', 'covered or not covered'),
  STEP('5', 'judgement', 'The reserve equals the sum of the invoices'),
  STEP('6', 'judgement', "Never speculate about the insured's intent or honesty"),
  STEP('7', 'measure', 'Never use the words', { measure: 'LEXICON:fraud|scam|liar|suspicious', means: 'none of the four words' }),
  STEP('8', 'judgement', 'Take every date, name and figure from the file'),
] };
// Edits of the lead example that break only the citation step: each find occurs once in e01.
const MUTANTS = { mutants: [
  { id: '2', find: '3 March 2026 [notice of loss]', replace: '3 March 2026', why: 'a fact without its citation' },
  { id: '2', find: 'Fenwick Street [notice of loss]', replace: 'Fenwick Street', why: 'a fact without its citation' },
  { id: '2', find: '5 March 2026 [police report]', replace: '5 March 2026', why: 'a fact without its citation' },
  { id: '2', find: 'docking station [invoice 1], [invoice 2]', replace: 'docking station [witness statement]', why: 'a citation of no document in the file' },
] };

interface Rec { state: string; record: { entries: { id: string; result: string; reason: string; required: boolean; observation: { evidence: string | null; unchecked?: string } }[] }; certificate: { acceptedUnmeasured: { id: string; statement: string; part?: string }[] } }

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--context-reader', 'scripted'];
const script = async (byTool: Record<string, unknown>): Promise<void> => {
  await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_holds_back: { ids: [] }, emit_step_checks: CHECKS, emit_step_mutants: MUTANTS, ...byTool } }) });
};

describe('the study\'s pass lines, offline (2026-10-22)', () => {
  let root = ''; let proj = ''; let data = '';
  const env = (): NodeJS.ProcessEnv => { const e: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' }; delete e.ANTHROPIC_API_KEY; delete e.ANTHROPIC_AUTH_TOKEN; return e; };
  const run = (args: readonly string[], stdin?: string): { code: number; out: string; err: string } => {
    const errFile = join(root, 'err.txt'); const inFile = join(root, 'in.txt');
    if (stdin !== undefined) writeFileSync(inFile, stdin);
    const q = (x: string): string => `'${x.replace(/'/g, "'\\''")}'`;
    try {
      const out = execFileSync('sh', ['-c', `node ${q(CLI)} ${args.map(q).join(' ')} ${stdin === undefined ? '</dev/null' : `<${q(inFile)}`} 2>${q(errFile)}`], { encoding: 'utf8', cwd: proj, env: env(), maxBuffer: 64 * 1024 * 1024 });
      return { code: 0, out, err: readFileSync(errFile, 'utf8') };
    } catch (e) { const x = e as { status?: number; stdout?: string }; return { code: x.status ?? 1, out: x.stdout ?? '', err: readFileSync(errFile, 'utf8') }; }
  };
  const L = (): store.StoreLayout => ({ root: data, skillName: 'claims' });
  const active = () => store.getStandard(L(), store.getSkillVersion(L(), store.getActive(L())!)!.standardVersionHash)!;
  const idOf = (start: string): string => active().requirements.find((r) => r.statement.startsWith(start))!.requirementId;
  // The held-out case's material, bound by giving each file: each is named as a person cites it.
  const WITH = (): string[] => readdirSync(join(proj, 'case')).sort().flatMap((f) => ['--with', join(proj, 'case', f)]);
  const json = (out: string): Record<string, unknown> => JSON.parse(out.slice(out.indexOf('{'))) as Record<string, unknown>;

  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    root = mkdtempSync(join(tmpdir(), 'atelier-passlines-')); proj = join(root, 'proj'); data = join(root, 'data');
    mkdirSync(join(proj, 'examples'), { recursive: true });
    cpSync(join(FIX, 'method.md'), join(proj, 'method.md'));
    for (const e of ['e01', 'e02', 'e04']) { cpSync(join(FIX, 'examples', `${e}.md`), join(proj, 'examples', `${e}.md`)); cpSync(join(FIX, 'examples', `${e}.material`), join(proj, 'examples', `${e}.material`), { recursive: true }); }
    cpSync(join(FIX, 'held-out', 'e10.material'), join(proj, 'case'), { recursive: true });
    await script({});
    const b = run(['new', 'examples', '--method', 'method.md', '--name', 'claims', '--yes', '--latitude', 'strict', ...BACKEND()]);
    expect(b.code, b.out + b.err).toBe(0);
  }, 240_000);
  afterAll(() => { backend.kill(); if (root) rmSync(root, { recursive: true, force: true }); });

  it('the citation check written against the names a person cites qualifies on the owner\'s examples, and its step blocks', () => {
    const v = active(); const x2 = idOf('Then a Facts section');
    expect(v.qualifications?.[x2]?.qualified, JSON.stringify(v.qualifications?.[x2])).toBe(true);
    expect(v.qualifications?.[x2]?.examples).toEqual({ passed: 3, read: 3, of: 3 });
    const p = planFor(v).rules.find((r) => r.id === x2)!;
    expect([p.role, p.enforced]).toEqual(['RULE', true]);
    // strict, and nothing accepted unmeasured by default
    expect(v.latitude?.level).toBe('STRICT');
    expect(v.acceptedUnmeasured ?? []).toEqual([]);
  });

  it('A4: a strict run that cites correctly is NEEDS REVIEW by default, and VERIFIED once the owner accepted the judgement steps and the Summary\'s unread part', async () => {
    await script({ emit_piece: { piece: HELD } });
    const before = run(['invoke', '--skill', 'claims', REQUEST, ...WITH(), '--claims', 'pattern', '--json', ...BACKEND()]);
    const r1 = json(before.out) as unknown as Rec;
    expect(r1.state, JSON.stringify(r1.record.entries.filter((e) => e.result === 'FAIL'))).toBe('NEEDS_REVIEW');
    // the citation check read every fact as cited, against the names of the material as bound; its means line does not
    // say all the step does (the square brackets, the file it comes from), so the step waits for the owner like the
    // Summary's "one paragraph"
    const x2id = idOf('Then a Facts section');
    const x2 = r1.record.entries.find((e) => e.id === x2id)!;
    expect([x2.result, x2.reason]).toEqual(['UNVERIFIED', 'PARTLY_CHECKED']);
    expect(x2.observation.evidence).toContain('every fact cites the file');
    expect(x2.observation.unchecked).toContain('in square brackets');
    // the owner accepts every judgement step, and the part of the Summary and Facts steps their checks do not read
    const x1 = idOf('Open with a Summary');
    const a = run(['amend', '--skill', 'claims', '--unmeasured', 'accept', '--accept-unmeasured', `${x1},${x2id},${idOf('Never use the words')},nosuch`, '--reason', 'the judgement steps are mine to read']);
    expect(a.code, a.out + a.err).toBe(0);
    expect(a.out).toContain('Accepted unmeasured: not "nosuch"');
    expect(a.out).toContain(`Accepted unmeasured: not ${idOf('Never use the words')}, a check reads it in full`);
    expect(a.out).toContain('7 unmeasured rules accepted');
    const accepted = active().acceptedUnmeasured ?? [];
    expect(accepted).toEqual(expect.arrayContaining([x1, x2id]));
    expect(accepted).toHaveLength(7);
    const after = run(['invoke', '--skill', 'claims', REQUEST, ...WITH(), '--claims', 'pattern', '--json', ...BACKEND()]);
    const r2 = json(after.out) as unknown as Rec;
    const open = r2.record.entries.filter((e) => e.required && e.result !== 'PASS' && e.reason !== 'LISTED_FOR_YOU' && e.result !== 'NOT_APPLICABLE');
    expect(r2.state, JSON.stringify(open)).toBe('VERIFIED');
    // every accepted rule is on the certificate; the partly read one with its unread part
    expect(r2.certificate.acceptedUnmeasured.map((x) => x.id).sort()).toEqual([...accepted].sort());
    expect(r2.certificate.acceptedUnmeasured.find((x) => x.id === x1)?.part).toBeTruthy();
    expect(r2.record.entries.find((e) => e.id === x1)?.reason).toBe('LISTED_FOR_YOU');
    expect(r2.record.entries.find((e) => e.id === x2id)?.observation.evidence).toContain('accepted by you as unmeasured for');
  }, 240_000);

  it('A3, A7: the citation check names the uncited sentence, and the repair fixes it', async () => {
    writeFileSync(join(root, 'uncited.md'), UNCITED);
    const v = run(['verify', '--skill', 'claims', join(root, 'uncited.md'), ...WITH(), '--claims', 'pattern', '--json']);
    const j = json(v.out) as unknown as Rec & { violated: { id: string }[]; checked: { requirementId: string; result: { spans: { text: string }[] } }[] };
    const x2 = idOf('Then a Facts section');
    expect(j.state, v.err).toBe('BLOCKED');
    expect(j.violated.map((x) => x.id)).toContain(x2);
    expect(j.checked.find((c) => c.requirementId === x2)?.result.spans.map((s) => s.text)).toEqual([UNCITED_SENTENCE]);
    await script({ emit_replacements: { replacements: [{ id: 1, text: 'The items were in a locked container at the time [police report].' }] } });
    const r = run(['verify', '--skill', 'claims', join(root, 'uncited.md'), ...WITH(), '--claims', 'pattern', '--repair', '--json', ...BACKEND()]);
    const fixed = json(r.out) as unknown as Rec & { output: string };
    expect(fixed.output, r.err).toContain('at the time [police report].');
    expect(fixed.state).toBe('VERIFIED');
    expect(fixed.record.entries.find((e) => e.id === x2)?.result).not.toBe('FAIL');
  }, 240_000);

  it('A7: the speculation defect is rewritten with the negation the rewrite needs', async () => {
    const material = join(FIX, 'examples', 'e01.material');
    const withs = readdirSync(material).sort().flatMap((f) => ['--with', join(material, f)]);
    const rewrite = "The insured's account is not contradicted by the documents in the file.";
    await script({ emit_replacements: { replacements: [{ id: 1, text: rewrite }] } });
    const r = run(['verify', '--skill', 'claims', join(FIX, 'defects', 'e01.speculation.md'), ...withs, '--claims', 'pattern', '--repair', '--json', ...BACKEND()]);
    const fixed = json(r.out) as unknown as Rec & { output: string };
    expect(fixed.output, r.err).toContain(rewrite);
    expect(fixed.output).not.toMatch(/suspicious|scam/);
    expect(fixed.record.entries.find((e) => e.id === idOf('Never use the words'))?.result).toBe('PASS');
  }, 240_000);

  it('A6: the hook exits 2 on an event that is not JSON, and 0 on a golden with no material, naming the required rule it could not read', () => {
    const bad = run(['verify', '--skill', 'claims', '--hook'], JSON.stringify('this is not an event'));
    expect(bad.code).toBe(2);
    expect(bad.err).toMatch(/not a JSON object|not JSON/);
    const ok = run(['verify', '--skill', 'claims', '--hook'], JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(root, 'memo.md'), content: HELD } }));
    expect(ok.code, ok.err).toBe(0);
    expect(ok.err).toContain('Every fact cites the document in the file');
    expect(ok.err).toMatch(/not read/);
  });
});
