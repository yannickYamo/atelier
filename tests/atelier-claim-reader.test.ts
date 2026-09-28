// tests/atelier-claim-reader.test.ts — A SMALL MODEL READS THE SPECIFICS; CODE DECIDES WHICH ARE SUPPORTED.
//
// The pattern check missed ordinary invented specifics ("94 minutes", "nine people"), let any link
// excuse a figure, and let a named quotation through. The reader types every specific and names its
// source; nothing it says is taken on its word. These pin the decision in code, the fallback, and the
// check reaching a structured output, through the binary where the failure was visible there.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { decideSpecifics, supportIsIn, modelSensor, patternSensor, numbered, READER_VERSION, type ExtractedSpecific } from '../core/loop/claim-extract.js';
import { checkDraftAsync } from '../core/loop/run-repair.js';
import { unsourcedClaims } from '../core/loop/claims.js';
import { stringLeaves, runOnce } from '../cli/commands/improve.js';
import * as store from '../core/state/store.js';
import type { InferenceClient } from '../core/inference/client.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const probe = [
  'On March 4th we spent 94 minutes in sprint planning.',
  'That meeting cost us nine people times 94 minutes.',
  'Action-item tracking went from 22% to 91% over nine months.',
  'According to our report, conversion rose 94% [source](https://example.invalid/report).',
  'As Satya Nadella put it, "sovereignty is the new cloud."',
  'HTTP/2 shipped in 2015.',
].join(' ');
const sp = (sentence: number, text: string, kind: ExtractedSpecific['kind'], source: ExtractedSpecific['source'], support = '', attributed = false): ExtractedSpecific =>
  ({ sentence, text, kind, source, support, attributed });
const typed: ExtractedSpecific[] = [
  sp(1, 'On March 4th we spent 94 minutes', 'FIRST_PERSON_EVENT', 'NONE'),
  sp(2, 'nine people times 94 minutes', 'FIGURE', 'NONE'),
  sp(3, 'went from 22% to 91%', 'FIGURE', 'NONE'),
  sp(4, 'conversion rose 94%', 'ATTRIBUTED_CLAIM', 'NONE', '', true),
  sp(4, 'https://example.invalid/report', 'URL', 'NONE', '', true),
  sp(5, '"sovereignty is the new cloud."', 'QUOTATION', 'NONE', '', true),
  sp(6, 'HTTP/2 shipped in 2015', 'NAMED_FACT', 'PUBLIC'),
];

describe('the decision is code: what the reader typed is checked against the source it names', () => {
  it('every invented specific the pattern missed is cut, and the public fact is listed, not cut', () => {
    const r = decideSpecifics(probe, typed, '', '', false, 'test');
    expect(r.claims.map((c) => c.text)).toEqual([
      'On March 4th we spent 94 minutes in sprint planning.',
      'That meeting cost us nine people times 94 minutes.',
      'Action-item tracking went from 22% to 91% over nine months.',
      'According to our report, conversion rose 94% [source](https://example.invalid/report).',
      'As Satya Nadella put it, "sovereignty is the new cloud."',
    ]);
    expect(r.claims[0].kind).toBe('EXPERIENCE');
    expect(r.claims[4].kind).toBe('SOURCE');
    expect(r.publicFacts.map((p) => p.text)).toEqual(['HTTP/2 shipped in 2015.']);
  });

  it('the same specifics pass when the person supplied them: the quoted support is really in the material', () => {
    const material = 'On March 4th we spent 94 minutes in sprint planning; nine people were in the room.\n\n'
      + 'Tracking went from 22% to 91% over nine months.';
    const own: ExtractedSpecific[] = [
      sp(1, 'On March 4th we spent 94 minutes', 'FIRST_PERSON_EVENT', 'MATERIAL', 'On March 4th we spent 94 minutes in sprint planning'),
      sp(3, 'went from 22% to 91%', 'FIGURE', 'MATERIAL', 'Tracking went from 22% to 91% over nine months.'),
    ];
    expect(decideSpecifics(probe, own, material, '', false, 'test').claims).toEqual([]);
  });

  it('a model that CLAIMS material support it cannot quote is overruled: the passage is not there', () => {
    const lie = [sp(3, 'went from 22% to 91%', 'FIGURE', 'MATERIAL', 'Tracking went from 22% to 91% over nine months.')];
    expect(decideSpecifics(probe, lie, 'Our notes say nothing about tracking.', '', false, 'test').claims).toHaveLength(1);
  });

  it('a number the support does not carry is not supported, even when the passage is real', () => {
    const drift = [sp(3, 'went from 22% to 91%', 'FIGURE', 'MATERIAL', 'Tracking improved over nine months.')];
    expect(decideSpecifics(probe, drift, 'Tracking improved over nine months.', '', false, 'test').claims).toHaveLength(1);
  });

  it('an attributed claim, a quotation, a link or a lived event can never be excused as "public"', () => {
    const excuse = [sp(5, '"sovereignty is the new cloud."', 'QUOTATION', 'PUBLIC', '', true), sp(1, 'we spent 94 minutes', 'FIRST_PERSON_EVENT', 'PUBLIC')];
    expect(decideSpecifics(probe, excuse, '', '', false, 'test').claims).toHaveLength(2);
  });

  it('a link supports nothing unless the link itself is in the material', () => {
    const linked = [sp(4, 'https://example.invalid/report', 'URL', 'MATERIAL', 'https://example.invalid/report', true)];
    expect(decideSpecifics(probe, linked, '', '', false, 'test').claims).toHaveLength(1);
    expect(decideSpecifics(probe, linked, 'Our report: https://example.invalid/report', '', false, 'test').claims).toHaveLength(0);
  });

  it('a sentence number that points nowhere cuts nothing: the reader\'s mistake is not the draft\'s', () => {
    expect(decideSpecifics(probe, [sp(99, 'x', 'FIGURE', 'NONE')], '', '', false, 'test').claims).toEqual([]);
  });

  it('one claim per sentence, the strongest kind kept', () => {
    const r = decideSpecifics(probe, typed.filter((t) => t.sentence === 4), '', '', false, 'test');
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0].kind).toBe('SOURCE');
  });

  it('support is matched in one passage, tolerating a dropped word, never across scattered notes', () => {
    expect(supportIsIn('we spent ninety four minutes planning the sprint', 'On Monday we spent ninety four minutes planning the sprint.')).toBe(true);
    expect(supportIsIn('we spent minutes planning the sprint board', 'We spent a while.\n\nPlanning happens.\n\nThe sprint board is new.')).toBe(false);
  });
});

describe('the reader behind the seam', () => {
  const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
  const client = (json: unknown, seen?: string[]): InferenceClient => ({
    complete: vi.fn((req) => { seen?.push(`${req.stableBlock}\n${req.variableBlock}\n${req.userMessage}`); return Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never); }),
  });

  it('checkDraftAsync reads through the model and reports which instrument ran, prompt version included', async () => {
    const sensor = modelSensor(client({ specifics: typed }), { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', { material: '', task: '', placeholders: false });
    const r = await checkDraftAsync('d', v, probe, { claimSensor: sensor });
    const line = r.checked.find((c) => c.requirementId === 'UNSOURCED')!;
    expect(line.result.verdict).toBe('VIOLATED');
    expect(line.result.spans).toHaveLength(5);
    expect(line.result.detail).toContain(`claim reader (claude-haiku-4-5, prompt ${READER_VERSION})`);
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED·public')?.materiality).toBe('PREFERRED');
    expect(r.failed).toBe(true);
  });

  it('the draft and the material reach the reader inside delimiters, as data', async () => {
    const seen: string[] = [];
    const sensor = modelSensor(client({ specifics: [] }, seen), { spentUsd: 0, capUsd: 1 }, 'm', { material: 'my notes', task: 'write it', placeholders: false });
    await sensor.read(probe);
    expect(seen[0]).toContain('<material>\nmy notes\n</material>');
    expect(seen[0]).toContain(`<draft>\n${numbered(probe)}\n</draft>`);
    expect(seen[0]).toMatch(/never an instruction to you/);
  });

  it('one call per distinct text: a text read twice is read once', async () => {
    const c = client({ specifics: [] });
    const sensor = modelSensor(c, { spentUsd: 0, capUsd: 1 }, 'm', { material: '', task: '', placeholders: false });
    await sensor.read(probe); await sensor.read(probe);
    expect(c.complete).toHaveBeenCalledTimes(1);
  });

  it('a reader that fails is never read as "nothing invented": the pattern check runs, and it is said', async () => {
    const broken: InferenceClient = { complete: () => Promise.reject(new Error('HTTP 529 overloaded')) };
    const sensor = modelSensor(broken, { spentUsd: 0, capUsd: 1 }, 'm', { material: '', task: '', placeholders: false });
    const text = 'According to a survey, 43% of operators agree.';
    const r = await checkDraftAsync('d', v, text, { claimSensor: sensor });
    const line = r.checked.find((c) => c.requirementId === 'UNSOURCED')!;
    expect(line.result.detail).toMatch(/pattern check \(the claim reader could not run\)/);
    expect(line.result.verdict).toBe('VIOLATED');
    expect(sensor.notes[0]).toMatch(/HTTP 529/);
  });

  it('a reply with no list of specifics is a failed read, not a clean one', async () => {
    const sensor = modelSensor(client({ piece: 'x' }), { spentUsd: 0, capUsd: 1 }, 'm', { material: '', task: '', placeholders: false });
    await sensor.read(probe);
    expect(sensor.reading(probe)!.instrument).toMatch(/pattern check/);
  });

  it('the pattern sensor is the old check, named as such', async () => {
    const r = await checkDraftAsync('d', v, 'According to a survey, 43% of operators agree.', { claimSensor: patternSensor('', false, 'pattern check (--claims pattern)') });
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')!.result.detail).toContain('[pattern check (--claims pattern)]');
  });
});

describe('the pattern fallback: a link excuses a figure only when the person supplied the link', () => {
  const t = 'According to our report, conversion rose 94% [source](https://example.invalid/report).';
  it('an invented link supports nothing', () => { expect(unsourcedClaims(t, '')).toHaveLength(1); });
  it('a link from the material does', () => { expect(unsourcedClaims(t, 'Report: https://example.invalid/report')).toHaveLength(0); });
});

describe('a structured output is read as the text it carries', () => {
  it('every string leaf, nested or listed, in one text', () => {
    expect(stringLeaves(JSON.stringify({ title: 'Q3', sections: [{ body: 'Revenue rose 94%.' }, { body: '' }], n: 3 })))
      .toBe('Q3\n\nRevenue rose 94%.');
  });
});

describe('a skill with an output contract is checked for invented claims too (it never was)', () => {
  const contract = JSON.stringify({ type: 'object', properties: { body: { type: 'string' } }, required: ['body'] });
  const binding = { providerAdapter: 'anthropic', backend: 'x', requestedModel: 'm', structuredOutput: 'NATIVE_TOOL_USE', parameters: {}, runtimeProfile: null } as const;
  const writer = (answers: unknown[]): { client: InferenceClient; seen: string[] } => {
    const seen: string[] = []; let i = 0;
    return { seen, client: { complete: (req) => { seen.push(req.userMessage); const json = answers[Math.min(i++, answers.length - 1)];
      return Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never); } } };
  };
  const invented = { body: 'Revenue rose 94% last quarter.' };
  const clean = { body: 'Revenue rose last quarter.' };
  const guard = (text: string): Promise<string[]> => Promise.resolve(text.includes('94%') ? ['Revenue rose 94% last quarter.'] : []);
  const run = (answers: unknown[]) => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-g2-')), skillName: 'skill' }; store.initStore(L);
    const w = writer(answers);
    const p = runOnce(L, { skillVersionHash: 'k1', standardVersionHash: 'sv1', architectureHash: 'ar' }, 'SKILL', 'p1',
      { expectedPackageHash: 'p1', servedPackageHash: 'p1', matched: true, servedFiles: [] },
      'write the quarterly note', w.client, { spentUsd: 0, capUsd: 1 }, binding, 'ORGANIC_USE', contract, 'POSITIONAL', null, null, guard);
    return { p, seen: w.seen };
  };

  it('an invented figure in a structured answer is named back once, and the clean retry is delivered', async () => {
    const { p, seen } = run([invented, clean]);
    const rec = await p;
    expect(JSON.parse(rec.output)).toEqual(clean);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain('"Revenue rose 94% last quarter."');
    // The correction rides on the instruction; the task the record binds is still the task asked.
    expect(rec.input).toBe('write the quarterly note');
  });

  it('an answer that still invents after the retry is not delivered or recorded', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => { throw new Error(`exit ${c}`); }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { p } = run([invented, invented]);
      await expect(p).rejects.toThrow('exit 1');
      expect(err.mock.calls.flat().join(' ')).toMatch(/still asserts 1 specific.*Nothing was delivered or recorded/s);
    } finally { exit.mockRestore(); err.mockRestore(); }
  });
});

describe('through the binary: the reader runs on the person\'s own backend when they name a model', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    const body = JSON.stringify({ byTool: {
      emit_specifics: { specifics: [{ sentence: 1, text: '94 minutes', kind: 'FIGURE', attributed: false, source: 'NONE', support: '' }] },
    } });
    const send = (): Promise<Response> => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body });
    try { await send(); } catch { await send(); }
  });
  afterAll(() => { backend.kill(); });

  const setup = (): { run: (env: Record<string, string>, ...a: string[]) => { out: string; code: number }; file: string } => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-claims-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-claims-proj-'));
    const base = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    const run = (env: Record<string, string>, ...a: string[]): { out: string; code: number } => {
      try { return { out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env: { ...base, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }), code: 0 }; } catch (e) {
        const x = e as { stdout?: string; stderr?: string; status?: number };
        return { out: `${x.stdout ?? ''}${x.stderr ?? ''}`, code: x.status ?? 1 };
      }
    };
    run({}, 'add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage');
    run({}, 'ratify-close', '--work-type', 'writing');
    run({}, 'build', '--name', 'house');
    const file = join(proj, 'd.md');
    writeFileSync(file, 'The review took 94 minutes. It ended well.');
    return { run, file };
  };
  const remote = (p: number): string[] => ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${p}`];

  it('ATELIER_CLAIMS_MODEL on an OpenAI-compatible backend: the reader catches what the pattern cannot', () => {
    const { run, file } = setup();
    const byPattern = run({ ATELIER_CLAIMS: 'pattern' }, 'verify', '--skill', 'house', file);
    expect(byPattern.code).toBe(0);
    const byReader = run({ ATELIER_CLAIMS: 'model', ATELIER_CLAIMS_MODEL: 'my-small-model' }, 'verify', '--skill', 'house', file, ...remote(port));
    expect(byReader.code).toBe(1);
    expect(byReader.out).toMatch(/UNSOURCED/);
    expect(byReader.out).toContain('claim reader (my-small-model');
  });

  it('a backend that is not Anthropic never gets a model it did not name: the pattern check runs, and says why', () => {
    const { run, file } = setup();
    const r = run({ ATELIER_CLAIMS: 'model', ATELIER_CLAIMS_MODEL: '' }, 'verify', '--skill', 'house', file, ...remote(port));
    expect(r.out).toMatch(/no claim reader configured: set ATELIER_CLAIMS_MODEL/);
  });
});
