// tests/atelier-step-acceptance.test.ts — WHAT THE ONE ACCEPTANCE RULE CHECKS, ON EVERY PATH.
//
// The ledger and the step limit hold; what every step is held to is decided once, in `applyStep` (core/loop/repair.ts):
//   B1  no step may put in place a text that adds a figure neither the earlier text, the request nor the bound material
//       holds. A draft written again around a claim cut kept "Our seals are rated for 9,000 cycles." (CC2).
//   B2  a rule measured on the draft (broken or held) that the text later becomes too short to measure is not held: a step
//       that does it is no progress, and the record says the rule was not measured, never that it holds. A claim cut took
//       a reply from 173 to 135 words and the run said "c4, x1 held once the draft was corrected", conformant (K1).
// Expected values come from the scenarios' own texts and the material, never from the code under test.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, cpSync, mkdirSync } from 'node:fs';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ControllerRecord, StandardVersion } from '../core/state/canonical-state.js';
import type { RuleCheck, VerifyReport } from '../core/observers/verify.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import { verifyText } from '../core/observers/verify.js';
import { applyStep, enforcedNearer, acceptRepair } from '../core/loop/repair.js';
import { stepLedger } from '../core/loop/controller.js';
import { refineToStandard } from '../core/loop/run-repair.js';
import { buildRecord } from '../core/eval/record-build.js';
import { standingOf } from '../core/eval/record.js';
import { aRequirement, anInferenceResult } from './fixtures.js';

const ROOT = resolve(__dirname, '..');
const FIX = join(ROOT, 'tests', 'fixtures', 'support-replay');
const CLI = join(ROOT, 'dist', 'cli', 'atelier.mjs');
const ASK = 'reply to Hannah, whose blender jug leaks at the base';

interface Entry { id: string; result: string; reason: string; required: boolean; observation: { incomplete?: string; evidence: string | null } }
interface Out { output: string | null; controller: ControllerRecord; eval: { result: { conformant: boolean; reasons: string[] }; record: { state: string; entries: Entry[] } } }

describe.skipIf(!existsSync(CLI))('through the binary, with the material bound', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    backend = spawn(process.execPath, [join(ROOT, 'tests', 'fixtures', 'scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((done) => backend.stdout?.on('data', (b: Buffer) => { const m = /PORT (\d+)/.exec(b.toString()); if (m) done(Number(m[1])); }));
  });
  afterAll(() => { backend.kill(); });
  const replay = async (name: string, ...flags: string[]): Promise<{ out: Out; err: string; tools: string[] }> => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-accept-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-accept-proj-'));
    cpSync(join(FIX, 'skills'), join(data, 'skills'), { recursive: true });
    mkdirSync(join(data, 'skills', 'support', 'material'), { recursive: true });
    cpSync(join(FIX, 'material', 'notes.md'), join(data, 'skills', 'support', 'material', 'notes.md'));
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: readFileSync(join(FIX, 'scenarios', `${name}.json`), 'utf8') });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    let out: string; let err = '';
    const log = async (): Promise<string[]> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies;
    const before = (await log()).length;
    try {
      out = execFileSync('node', [CLI, 'invoke', '--skill', 'support', ASK, '--json', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted',
        '--drafts', '1', '--accept-new-binding', ...flags], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { out = (e as { stdout?: string }).stdout ?? ''; err = (e as { stderr?: string }).stderr ?? ''; }
    const tools = (await log()).slice(before).map((b) => (JSON.parse(b) as { tools?: { function?: { name?: string } }[] }).tools?.[0]?.function?.name ?? '');
    return { out: JSON.parse(out) as Out, err, tools };
  };

  it('CC2: the draft written again around a claim cut that adds "9,000 cycles" is not kept', async () => {
    const { out } = await replay('cc2');
    // the material holds 94795 and 3 October; neither the draft nor the request holds 9,000
    expect(out.output ?? '').not.toMatch(/9,000|9000/);
    const redraft = out.controller.decisions.find((x) => x.action === 'claim-redraft');
    expect(redraft?.outcome).toBe('not kept');
    expect(redraft?.observed.note ?? '').toMatch(/added a figure .*\(9000\)/);
  }, 120_000);

  it('K1: rules the cut left too short to measure are not measured, never held; the run is not conformant on them; no empty paragraph', async () => {
    const { out, err } = await replay('k1');
    const entry = (id: string): Entry | undefined => out.eval.record.entries.find((e) => e.id === id);
    // c4 and x1 were broken on the 173-word draft; the delivered reply is under 150 words
    for (const id of ['c4', 'x1']) {
      expect(entry(id)?.result, id).toBe('UNVERIFIED');
      expect(entry(id)?.observation.incomplete ?? '', id).toMatch(/too short to measure/);
    }
    // c1 (no semicolons) was held on the draft, and cannot be read on the reply delivered either
    expect(entry('c1')?.result).toBe('UNVERIFIED');
    expect(out.eval.record.state).not.toBe('VERIFIED');
    expect(out.eval.result.conformant).toBe(false);
    expect(err).not.toMatch(/c4, x1 held/);
    expect(err).not.toMatch(/every REQUIRED measured rule holds/);
    // the invented claim is still cut, and the paragraph it filled leaves no empty one behind
    expect(out.output ?? '').not.toMatch(/3,400 rpm/);
    expect(out.output ?? '').not.toMatch(/\n[ \t]*\n[ \t]*\n/);
  }, 120_000);

  it('the structural edits are one step, recorded with the sentence rewrite calls it made', async () => {
    const { out, tools } = await replay('e4', '--edits', '2');
    const steer = out.controller.decisions.find((x) => x.action === 'steer');
    const sentences = tools.filter((t) => t === 'emit_sentence').length;
    expect(sentences).toBeGreaterThan(0);
    expect(steer?.observed.calls).toBe(sentences);
    expect(steer?.observed.note ?? '').toContain(`${sentences} sentence rewrite call(s)`);
  }, 120_000);
});

// ── IN PROCESS ──────────────────────────────────────────────────────────────────────────────────────────────────────
const NONE = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
const read = (t: string): VerifyReport => verifyText('d', NONE, t);
const PLAN = { action: 'rewrite' as const, targets: ['x'], why: 'w', expectedGain: 1, expectedCostUsd: 0 };
/** one step through the one helper, proposing `after` in place of `before`, on a ledger given `source` */
const step = (before: string, after: string, source: string) => applyStep(stepLedger(null, null, [], source), PLAN, { text: before, report: read(before) },
  async () => ({ text: after, report: read(after) }), { purposes: ['repair'] });

describe('B1: no step adds a figure the earlier text, the request and the material do not hold', () => {
  const before = 'I have sent a replacement jug by tracked post.';
  it('a figure in digits is refused, said with the figure', async () => {
    const r = await step(before, `${before} Our seals are rated for 9,000 cycles.`, 'Her blender jug leaks. The order is 94795.');
    expect(r.kind === 'judged' && r.kept).toBe(false);
    expect(r.kind === 'judged' ? r.why : '').toMatch(/added a figure .*\(9000\)/);
  });
  it('the same figure is kept when the material holds it, in digits or in words', async () => {
    for (const source of ['Seals rated for 9,000 cycles.', 'Seals rated for nine thousand cycles.']) {
      const r = await step(before, `${before} Our seals are rated for 9,000 cycles.`, source);
      expect(r.kind === 'judged' && r.kept, source).toBe(true);
    }
  });
  it('a count in words, a percentage, a sum and a date are figures too', async () => {
    for (const added of ['It took twelve engineers.', 'It failed 40% of the time.', 'It cost $35.', 'It arrives on Tuesday.']) {
      const r = await step(before, `${before} ${added}`, '');
      expect(r.kind === 'judged' && r.kept, added).toBe(false);
    }
  });
  it('a figure the earlier text already held is no addition', async () => {
    const r = await step('It failed at 3,400 rpm.', 'At 3,400 rpm, it failed.', '');
    expect(r.kind === 'judged' && r.kept).toBe(true);
  });
  it('the draft written again around a claim cut is held to it (CC2), with its call on its own step', async () => {
    const draft = 'Last year I shipped the retry loop and it broke production for a day.\n\nFix it:\n\n1. Last month we saw retries double the load.\n2. Add a budget.';
    const seen: string[] = [];
    const w: InferenceClient = { complete: async (r: InferenceRequest) => { seen.push(r.toolName);
      return anInferenceResult({ json: r.toolName === 'emit_draft' ? { text: 'Fix it:\n\n1. Add a budget of 9,000 retries.' } : { replacements: [] } }); } };
    const out = await refineToStandard(w, { spentUsd: 0, capUsd: 1 }, 'd', NONE, draft, 2, { material: '' });
    expect(seen).toContain('emit_draft');
    expect(out.output).not.toMatch(/9,000/);
    const redraft = out.repair?.controller?.decisions.find((x) => x.action === 'claim-redraft');
    expect(redraft?.outcome).toBe('not kept');
    expect(redraft?.observed.note ?? '').toMatch(/added a figure .*\(9000\)/);
  });
});

// A check line as an observer writes it: what each comparison below reads.
const line = (id: string, verdict: 'MET' | 'VIOLATED' | 'NOT_APPLICABLE', detail: string, value: number | null = null): RuleCheck =>
  ({ requirementId: id, statement: id, materiality: 'REQUIRED', enforced: true, observer: 'PATTERN_RATE', result: { verdict, spans: verdict === 'VIOLATED' ? [{ start: 0, end: 1, text: 'x', why: 'w' }] : [], value, detail } });
const report = (...checked: RuleCheck[]): VerifyReport => ({ skill: 'd', standardVersionHash: 's', checked, unchecked: [], conditional: [], failed: checked.some((c) => c.result.verdict === 'VIOLATED') });
const SHORT = 'too short to measure: under 150 words';

describe('B2: a rule the text became too short to measure is not held', () => {
  const broken = report(line('c4', 'VIOLATED', '12 per 1,000 words (at least 22.5)', 12));
  const unreadable = report(line('c4', 'NOT_APPLICABLE', SHORT));
  it('is not nearer holding (K1: c4 broken at 173 words, unmeasurable at 135)', () => {
    expect(enforcedNearer(broken, unreadable, ['c4'])).toEqual([]);
    // a rule the request or format excludes is unchanged: it is no rule this text is held to
    expect(enforcedNearer(broken, report(line('c4', 'NOT_APPLICABLE', 'does not apply to this request')), ['c4'])).toEqual(['c4']);
  });
  it('a rewrite whose only change is that is no progress', () => {
    expect(acceptRepair(broken, unreadable, { targets: ['c4'], enforced: new Set(['c4']) }).ok).toBe(false);
    expect(acceptRepair(broken, unreadable, { enforced: new Set(['c4']) }).ok).toBe(false);
  });
  it('a step whose only change is that is not kept', async () => {
    const r = await applyStep(stepLedger(), { ...PLAN, targets: ['c4'], forEnforced: ['c4'] }, { text: 'long draft', report: broken },
      async () => ({ text: 'short draft', report: unreadable }), { purposes: ['repair'] });
    expect(r.kind === 'judged' && r.kept).toBe(false);
  });
  it('the record says not measured, the run needs review and is not deliverable on its strength', () => {
    const req = aRequirement({ requirementId: 'c4', statement: 'Use repeated openings within my range.', materiality: 'REQUIRED',
      measurement: { observer: 'PATTERN_RATE', params: { minPer1000: 22.5, maxPer1000: 71.8 } } } as never);
    const facts = { requirements: [req], checked: [{ id: 'c4', required: true, verdict: 'NOT_APPLICABLE' as const, detail: SHORT }], waived: new Map<string, string>(), request: null, claims: null, copying: null };
    const lost = buildRecord({ ...facts, unmeasured: new Set(['c4']) });
    const e = lost.entries.find((x) => x.id === 'c4');
    expect(e?.result).toBe('UNVERIFIED');
    expect(e?.observation.incomplete ?? '').toMatch(/not measured: c4/);
    expect(lost.state).toBe('NEEDS_REVIEW');
    expect(standingOf(lost).deliverable).toBe(false);
    // a rule the draft was already too short to read is as it was
    expect(buildRecord(facts as never).entries.find((x) => x.id === 'c4')?.result).toBe('NOT_APPLICABLE');
  });
});
