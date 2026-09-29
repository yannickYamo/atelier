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
import {
  decideSpecifics, supportIsIn, modelSensor, patternSensor, numbered, numbersIn, isQualified,
  READER_VERSION, DECISION_VERSION, QUALIFIED_READERS, type ExtractedSpecific,
} from '../core/loop/claim-extract.js';
import { checkDraftAsync, refineToStandard } from '../core/loop/run-repair.js';
import { unsourcedClaims, claimUnitsOf } from '../core/loop/claims.js';
import { claimInstrumentOf, checksFor } from '../cli/checks.js';
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

  it('v2: a specific pinned to the wrong sentence is moved to the one that holds it, never cut where it is not', () => {
    const text = 'That story stuck with me. We spent 94 minutes planning.';
    const r = decideSpecifics(text, [sp(1, 'We spent 94 minutes', 'FIRST_PERSON_EVENT', 'NONE')], '', '', false, 't');
    expect(r.claims.map((c) => c.text)).toEqual(['We spent 94 minutes planning.']);
  });

  it('v2: a specific no sentence holds cuts nothing', () => {
    expect(decideSpecifics('They force reflection. It helps.', [sp(1, 'a 17% gap in retention', 'FIGURE', 'NONE')], '', '', false, 't').claims).toEqual([]);
  });

  it('v2: a specific that is verbatim in the material is supported, whatever source the reader named', () => {
    const text = 'I deliberately leave 10% manual, on purpose.';
    expect(decideSpecifics(text, [sp(1, '10% manual', 'FIGURE', 'NONE')], 'I keep 10% manual, not because we cannot automate.', '', false, 't').claims).toEqual([]);
  });

  it('v2: a spelled-out number is the same figure as its digits', () => {
    const text = 'Give it ten hours and it can own a feature.';
    const s1 = [sp(1, 'ten hours', 'FIGURE', 'MATERIAL', 'Give an agent 10 hours and it can own a whole feature.')];
    expect(decideSpecifics(text, s1, 'Give an agent 10 hours and it can own a whole feature.', '', false, 't').claims).toEqual([]);
    expect(decideSpecifics(text, [sp(1, 'ten hours', 'FIGURE', 'NONE')], 'Give an agent 12 hours.', '', false, 't').claims).toHaveLength(1);
    // and in the material's own words, however either spells it
    expect(decideSpecifics('For fifty years, people dreamed of it.', [sp(1, 'For fifty years', 'FIGURE', 'NONE')], 'For 50 years, people have dreamed of it.', '', false, 't').claims).toEqual([]);
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

  // A pair a qualification stands behind, passed explicitly: production's list (QUALIFIED_READERS) is
  // not touched, and after the decision-3 bump it holds no pair that matches (atelier-claim-fixes.test.ts).
  const qualifiedReaders = [{ model: 'claude-haiku-4-5', version: READER_VERSION }];
  it('a QUALIFIED reader gates: checkDraftAsync reads through the model and reports which instrument ran, prompt version included', async () => {
    const sensor = modelSensor(client({ specifics: typed }), { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', { material: '', task: '', placeholders: false, qualifiedReaders });
    const r = await checkDraftAsync('d', v, probe, { claimSensor: sensor });
    const line = r.checked.find((c) => c.requirementId === 'UNSOURCED')!;
    expect(line.result.verdict).toBe('VIOLATED');
    expect(line.result.spans).toHaveLength(5);
    expect(line.result.detail).toContain(`claim reader (claude-haiku-4-5, prompt ${READER_VERSION})`);
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED·public')?.materiality).toBe('PREFERRED');
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED·reader')).toBeUndefined();
    expect(r.failed).toBe(true);
    expect(sensor.gate).toBe('reader');
    expect(sensor.qualified).toBe(true);
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
    expect(sensor.notes.some((n) => n.includes('HTTP 529'))).toBe(true);
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

  it('ATELIER_CLAIMS_MODEL on an OpenAI-compatible backend: the reader catches what the pattern cannot, and, unqualified, only reports it', () => {
    const { run, file } = setup();
    const byPattern = run({ ATELIER_CLAIMS: 'pattern' }, 'verify', '--skill', 'house', file);
    expect(byPattern.code).toBe(0);
    // An unmeasured pair (a model on the person's own backend) warns: the pattern check gates.
    const byReader = run({ ATELIER_CLAIMS: 'model', ATELIER_CLAIMS_MODEL: 'my-small-model' }, 'verify', '--skill', 'house', file, ...remote(port));
    expect(byReader.code).toBe(0);
    expect(byReader.out).toMatch(/warn {2}UNSOURCED·reader/);
    expect(byReader.out).toMatch(/ok {4}UNSOURCED {2}Never/);
    expect(byReader.out).toContain('claim reader (my-small-model');
    expect(byReader.out).toMatch(/not qualified/);
    // The escape hatch: the same reader gates, and says loudly that it is unmeasured.
    const gated = run({ ATELIER_CLAIMS: 'model', ATELIER_CLAIMS_MODEL: 'my-small-model', ATELIER_CLAIMS_GATE: 'reader' }, 'verify', '--skill', 'house', file, ...remote(port));
    expect(gated.code).toBe(1);
    expect(gated.out).toMatch(/FAIL {2}UNSOURCED {2}Never/);
    expect(gated.out).toMatch(/ATELIER_CLAIMS_GATE=reader: claim reader \(my-small-model, prompt \w+\) is NOT QUALIFIED/);
  });

  it('a backend that is not Anthropic never gets a model it did not name: the pattern check runs, and says why', () => {
    const { run, file } = setup();
    const r = run({ ATELIER_CLAIMS: 'model', ATELIER_CLAIMS_MODEL: '' }, 'verify', '--skill', 'house', file, ...remote(port));
    expect(r.out).toMatch(/no claim reader configured: set ATELIER_CLAIMS_MODEL/);
  });
});

// THE AUDIT OF THE INVENTED-CLAIM CHECK, EACH FINDING PINNED.
//
// Five defects, each reproduced before it was fixed:
//   1  a heading or a table row was never read, by the reader or the pattern: "# How we cut latency 73%
//      at Stripe" reached the reader as nothing at all
//   2  true stories were cut: markdown in the notes, a quotation over two sentences, "twenty-five"
//      read as "20-5"; and false ones passed: "fourteen" was no number, so "four" could not contradict it
//   3  a reader that failed mid-loop left a model reading compared with a pattern reading, and the loop
//      said "all now hold" over a figure the model had flagged
//   4  a reader nobody had measured (a changed version, another model) failed drafts and cut sentences
//   5  the record could not say which instrument ran, whether it was qualified, or what it spent
// Through the binary where the failure was visible there (tests/fixtures/scripted-backend.mjs).
describe('the audit of the invented-claim check', () => {
  const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
  const ok = (json: unknown): Promise<never> => Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never);
  /** Answers each call from the list in turn; an Error in the list is a failed call. */
  const scripted = (answers: readonly unknown[]): InferenceClient & { calls: number } => {
    const c = { calls: 0, complete: () => { const a = answers[Math.min(c.calls++, answers.length - 1)]; return a instanceof Error ? Promise.reject(a) : ok(a); } };
    return c;
  };
  const qualifiedReaders = [{ model: 'claude-haiku-4-5', version: READER_VERSION }];
  const ctx = { material: '', task: '', placeholders: false };

  describe('1. headings and table rows are read: a specific in a title is as invented as one in a paragraph', () => {
    const probe = '# How we cut latency 73% at Stripe\n\n| p99 | 900ms | 120ms |\n\nWe changed the cache.';

    it('the reader is shown every heading and table row, numbered with the sentences', () => {
      expect(numbered(probe)).toBe('[1] How we cut latency 73% at Stripe\n[2] | p99 | 900ms | 120ms |\n[3] We changed the cache.');
    });

    it('a specific the reader types in a heading or a row is flagged, and its span is the real text', () => {
      const r = decideSpecifics(probe, [sp(1, 'cut latency 73% at Stripe', 'FIRST_PERSON_EVENT', 'NONE'), sp(2, '900ms', 'FIGURE', 'NONE')], '', '', false, 't');
      expect(r.claims.map((c) => probe.slice(c.start, c.end))).toEqual(['How we cut latency 73% at Stripe', '| p99 | 900ms | 120ms |']);
      // and the same specifics, supplied by the person, pass
      expect(decideSpecifics(probe, [sp(1, 'cut latency 73% at Stripe', 'FIRST_PERSON_EVENT', 'MATERIAL', 'we cut latency 73% at Stripe')], 'At Stripe we cut latency 73%. Notes: we cut latency 73% at Stripe.', '', false, 't').claims).toEqual([]);
    });

    it('the pattern check reads headings and rows too, and still skips code fences and front matter', () => {
      const text = '---\ntitle: According to a survey, 43% agree\n---\n# According to a survey, 43% of operators agree\n\n'
        + '| According to a survey, 61% of buyers agree | x |\n|---|---|\n\n```\nAccording to a survey, 77% agree.\n```\n\nWe changed the cache.';
      const claims = unsourcedClaims(text, '');
      expect(claims.map((c) => text.slice(c.start, c.end))).toEqual(['According to a survey, 43% of operators agree', '| According to a survey, 61% of buyers agree | x |']);
      expect(claimUnitsOf(text).map((u) => u.text)).not.toContain('title: According to a survey, 43% agree');
      expect(claimUnitsOf(text).map((u) => u.text).join(' ')).not.toMatch(/77%/);
      // a setext heading is a heading
      expect(claimUnitsOf('Intro\n\nWe grew 40% in 2023\n===\n\nBody.').map((u) => u.text)).toEqual(['Intro', 'We grew 40% in 2023', 'Body.']);
    });

    it('the last-resort cut removes a flagged heading whole, not its words alone', async () => {
      const text = '# According to a survey, 43% of operators agree\n\nWe changed the cache.';
      // A rewrite that keeps the claim is refused; the last resort cuts the heading line.
      const writer = scripted([{ replacements: [{ id: 1, text: 'According to a survey, 43% of operators agree' }] }]);
      const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', v, text, 1, {});
      expect(r.output).toBe('We changed the cache.');
      expect(r.report.failed).toBe(false);
    });
  });

  describe('2. true stories are kept, false figures are not', () => {
    const figure = (text: string, support: string, material: string): number =>
      decideSpecifics(`We had ${text}.`, [sp(1, text, 'FIGURE', 'MATERIAL', support)], material, '', false, 't').claims.length;

    it('"fourteen engineers" is not supported by "four engineers"', () => {
      expect(figure('fourteen engineers', 'We hired four engineers', 'We hired four engineers.')).toBe(1);
      expect(figure('fourteen engineers', 'We hired 14 engineers', 'We hired 14 engineers.')).toBe(0);
    });

    it('"one million users" is not supported by "3 million"; "three million" is', () => {
      expect(figure('one million users', 'We reached 3 million users', 'We reached 3 million users.')).toBe(1);
      expect(figure('three million users', 'We reached 3 million users', 'We reached 3 million users.')).toBe(0);
      // a figure is its value, never a piece of it
      expect(figure('3 users', 'We reached 3 million users', 'We reached 3 million users.')).toBe(1);
    });

    it('"twenty-five customers" is supported by "25 customers"', () => {
      expect(figure('twenty-five customers', 'We signed 25 customers', 'We signed 25 customers.')).toBe(0);
      expect(figure('twenty-six customers', 'We signed 25 customers', 'We signed 25 customers.')).toBe(1);
    });

    it('number phrases read as their value', () => {
      expect(numbersIn('two hundred and fifty')).toEqual(['250']);
      expect(numbersIn('a dozen, two dozen, dozen')).toEqual(['12', '24', '12']);
      expect(numbersIn('thirteen, nineteen, ten thousand, 1.5 million, 1,000')).toEqual(['1000', '13', '19', '10000', '1500000']);
      expect(numbersIn('five, six')).toEqual(['5', '6']);
    });

    it('"one" is a figure only where it quantifies: a pronoun or an idiom demands no 1 in the material', () => {
      expect(numbersIn('one engineer')).toEqual(['1']);
      expect(numbersIn('one of the reasons')).toEqual([]);
      expect(numbersIn('no one knew, the one that stuck, one day')).toEqual([]);
      expect(numbersIn('twenty-one, one hundred')).toEqual(['21', '100']);
      const text = 'One of the engineers rewrote the retry loop.';
      expect(decideSpecifics(text, [sp(1, 'One of the engineers rewrote the retry loop', 'FIRST_PERSON_EVENT', 'MATERIAL', 'an engineer rewrote the retry loop')],
        'Last spring an engineer rewrote the retry loop.', '', false, 't').claims).toEqual([]);
    });

    it('a two-sentence story with **bold** and a [link](u) in the material, quoted plainly, is supported', () => {
      const material = 'In March our **checkout** broke for six hours. We traced it to a [stale cache](https://notes.invalid/incident) and rolled back.\n\nUnrelated note.';
      const quote = 'In March our checkout broke for six hours. We traced it to a stale cache and rolled back.';
      expect(supportIsIn(quote, material)).toBe(true);
      const text = 'It was the six-hour checkout outage we traced to a stale cache.';
      const story = [sp(1, 'the six-hour checkout outage we traced to a stale cache', 'FIRST_PERSON_EVENT', 'MATERIAL', quote)];
      expect(decideSpecifics(text, story, material, '', false, 't').claims).toEqual([]);
      // the polarity: the same words spread over separate paragraphs support nothing
      expect(decideSpecifics(text, story, 'In March our checkout broke.\n\nWe traced a different bug to a stale cache and rolled back.', '', false, 't').claims).toHaveLength(1);
      // and a URL the draft cites is still found in a markdown link of the person's
      expect(supportIsIn('https://notes.invalid/incident', material)).toBe(true);
    });
  });

  describe('3. a reader that fails mid-loop degrades for good: before and after are read by one instrument', () => {
    const draft = 'The review took 94 minutes. It ended well.';
    const flagged = { specifics: [{ sentence: 1, text: '94 minutes', kind: 'FIGURE', attributed: false, source: 'NONE', support: '' }] };

    it('once a read fails, every reading is the pattern check\'s, of texts the model already read included', async () => {
      const sensor = modelSensor(scripted([flagged, new Error('HTTP 529 overloaded')]), { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', { ...ctx, qualifiedReaders });
      await sensor.read(draft);
      expect(sensor.reading(draft)!.claims).toHaveLength(1);
      expect(sensor.degraded).toBe(false);
      await sensor.read('Another text.');
      expect(sensor.degraded).toBe(true);
      expect(sensor.reading(draft)!.instrument).toMatch(/^pattern check/);
      expect(sensor.reading(draft)!.claims).toHaveLength(0);
      expect(sensor.instrument).toMatch(/degraded after it failed: HTTP 529/);
      expect(sensor.gate).toBe('pattern');
      expect(sensor.notes.join(' ')).toMatch(/already read included/);
    });

    it('refineToStandard: a reader that reads the draft, then fails, never lets a rewrite pass on a mixed comparison', async () => {
      const sensor = modelSensor(scripted([flagged, new Error('HTTP 529 overloaded')]), { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', { ...ctx, qualifiedReaders });
      const writer = scripted([{ replacements: [{ id: 1, text: 'The review took 95 minutes.' }] }]);
      const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', v, draft, 2, { claimSensor: sensor });
      // Before the fix: the model's reading of the draft against the pattern's of the rewrite, "95 minutes"
      // accepted, violatedBefore [UNSOURCED], violatedAfter [], "every REQUIRED measured rule now holds".
      expect(r.output).not.toContain('95 minutes');
      // And the figure the reader flagged before it failed is not shipped either: it is cut, fail closed.
      expect(r.output).not.toContain('94 minutes');
      expect(r.repair!.storiesCut?.join(' ')).toContain('94 minutes');
      expect(r.repair!.why).toMatch(/flagged before it failed were cut outright/);
      expect(r.repair!.why).not.toBe('every REQUIRED measured rule now holds');
      expect(r.repair!.why).toMatch(/claim reader failed during the repair/);
      // before and after, by the same instrument
      expect(r.repair!.violatedBefore).toEqual(r.repair!.violatedAfter);
      expect(r.report.checked.find((c) => c.requirementId === 'UNSOURCED')!.result.detail).toMatch(/\[pattern check/);
      expect(sensor.instrument).toMatch(/degraded/);
    });
  });

  describe('4. only a qualified instrument may cut', () => {
    it('production: the list holds the measured pairs, the shipped decision-3 reader among them (studies/CLAIM_READER_V3_QUALIFICATION_RESULT.md)', () => {
      expect(QUALIFIED_READERS).toEqual([{ model: 'claude-haiku-4-5', version: '0279163b' }, { model: 'claude-haiku-4-5', version: 'a173339d' }]);
      expect(DECISION_VERSION).toBe(3);
      expect(READER_VERSION).toBe('a173339d');
      expect(isQualified('claude-haiku-4-5')).toBe(true);
      expect(isQualified('claude-haiku-4-5', '0279163b')).toBe(true);
      expect(isQualified('my-small-model')).toBe(false);
      // the shipped default reader is the one that cuts
      expect(modelSensor(scripted([]), { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5', ctx).gate).toBe('reader');
    });

    it('an unqualified reader reports (PREFERRED, never fails, never repaired); the pattern check gates as UNSOURCED', async () => {
      const text = 'The review took 94 minutes. It ended well.';
      const reads = { specifics: [{ sentence: 1, text: '94 minutes', kind: 'FIGURE', attributed: false, source: 'NONE', support: '' }] };
      const sensor = modelSensor(scripted([reads]), { spentUsd: 0, capUsd: 1 }, 'my-small-model', ctx);
      expect(sensor.gate).toBe('pattern');
      const r = await checkDraftAsync('d', v, text, { claimSensor: sensor });
      const gate = r.checked.find((c) => c.requirementId === 'UNSOURCED')!;
      const reader = r.checked.find((c) => c.requirementId === 'UNSOURCED·reader')!;
      expect(gate.materiality).toBe('REQUIRED');
      expect(gate.result.verdict).toBe('MET');
      expect(gate.result.detail).toMatch(/\[pattern check/);
      expect(reader.materiality).toBe('PREFERRED');
      expect(reader.result.verdict).toBe('VIOLATED');
      expect(reader.result.detail).toMatch(/not qualified/);
      expect(r.failed).toBe(false);
      const writer = scripted([{ replacements: [] }]);
      const refined = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', v, text, 2, { claimSensor: sensor });
      expect(refined.repair).toBeNull();
      expect(writer.calls).toBe(0);
      expect(sensor.notes.join(' ')).toMatch(/is not qualified/);
    });

    it('the pattern gate still fails what the pattern finds, beside an unqualified reader', async () => {
      const text = 'According to a survey, 43% of operators agree.';
      const sensor = modelSensor(scripted([{ specifics: [] }]), { spentUsd: 0, capUsd: 1 }, 'my-small-model', ctx);
      const r = await checkDraftAsync('d', v, text, { claimSensor: sensor });
      expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')!.result.verdict).toBe('VIOLATED');
      expect(r.checked.find((c) => c.requirementId === 'UNSOURCED·reader')!.result.verdict).toBe('MET');
      expect(r.failed).toBe(true);
    });

    it('ATELIER_CLAIMS_GATE=reader (gateAnyway) lets an unqualified reader gate, loudly', async () => {
      const text = 'The review took 94 minutes. It ended well.';
      const reads = { specifics: [{ sentence: 1, text: '94 minutes', kind: 'FIGURE', attributed: false, source: 'NONE', support: '' }] };
      const sensor = modelSensor(scripted([reads]), { spentUsd: 0, capUsd: 1 }, 'my-small-model', { ...ctx, gateAnyway: true });
      const r = await checkDraftAsync('d', v, text, { claimSensor: sensor });
      expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')!.result.verdict).toBe('VIOLATED');
      expect(r.checked.find((c) => c.requirementId === 'UNSOURCED·reader')).toBeUndefined();
      expect(r.failed).toBe(true);
      expect(sensor.gate).toBe('reader');
      expect(sensor.qualified).toBe(false);
      expect(sensor.instrument).toMatch(/NOT QUALIFIED, gating anyway/);
      expect(sensor.notes[0]).toMatch(/^ATELIER_CLAIMS_GATE=reader: .* is NOT QUALIFIED/);
    });
  });

  describe('5. the record can say which claim instrument ran, on whose word, at what cost', () => {
    it('claimInstrumentOf: a model reader, before and after it degrades', async () => {
      const sensor = modelSensor(scripted([{ specifics: [] }, new Error('budget spent')]), { spentUsd: 0, capUsd: 1 }, 'my-small-model', ctx);
      await sensor.read('One text.');
      expect(claimInstrumentOf({ claimSensor: sensor })).toEqual({
        instrument: `pattern check, with claim reader (my-small-model, prompt ${READER_VERSION}) reporting only: not qualified`,
        version: READER_VERSION, qualified: false, gate: 'pattern', degraded: false, spentUsd: 0.001 });
      await sensor.read('Another text.');
      expect(claimInstrumentOf({ claimSensor: sensor })).toMatchObject({ degraded: true, spentUsd: 0.001, instrument: expect.stringMatching(/degraded/) as unknown });
    });

    it('checksFor exposes it: the pattern check offline, and nothing when the check is off', () => {
      const L = { root: mkdtempSync(join(tmpdir(), 'atelier-claimi-')), skillName: 'skill' }; store.initStore(L);
      expect(claimInstrumentOf(checksFor(L, { material: '' }))).toEqual({ instrument: 'pattern check (--claims pattern)', version: null, qualified: false, gate: 'pattern', degraded: false, spentUsd: 0 });
      expect(claimInstrumentOf(checksFor(L, { material: '', guardClaims: false }))).toBeNull();
    });
  });

  describe('through the binary', () => {
    const CLI = resolve('dist/cli/atelier.mjs');
    let backend: ChildProcess; let port = 0;
    const script = async (body: unknown): Promise<void> => {
      const send = (): Promise<Response> => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(body) });
      try { await send(); } catch { await send(); }
    };
    beforeAll(async () => {
      if (!existsSync(CLI)) throw new Error('build first');
      backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
      port = await new Promise<number>((done) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) done(Number(m[1])); }); });
    });
    afterAll(() => { backend.kill(); });

    const setup = (draft: string): { run: (env: Record<string, string>, ...a: string[]) => { out: string; code: number }; file: string } => {
      const data = mkdtempSync(join(tmpdir(), 'atelier-cfix-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-cfix-proj-'));
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
      writeFileSync(file, draft);
      return { run, file };
    };
    const remote = (): string[] => ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'writer'];

    it('1: verify fails an invented figure in a heading, and --repair cuts the heading line whole', async () => {
      const { run, file } = setup('# According to a survey, 43% of operators agree\n\nWe changed the cache.\n');
      const checked = run({ ATELIER_CLAIMS: 'pattern' }, 'verify', '--skill', 'house', file);
      expect(checked.code).toBe(1);
      expect(checked.out).toContain('According to a survey, 43% of operators agree');
      await script({ byTool: { emit_replacements: { replacements: [{ id: 1, text: 'According to a survey, 43% of operators agree' }] } } });
      const repaired = run({ ATELIER_CLAIMS: 'pattern' }, 'verify', '--skill', 'house', file, '--repair', '--json', ...remote());
      const j = JSON.parse(repaired.out) as { output: string; failed: boolean };
      expect(j.output.trim()).toBe('We changed the cache.');
      expect(j.failed).toBe(false);
    });

    it('3: a reader that fails mid-repair does not deliver a rewrite judged on a mixed comparison', async () => {
      const { run, file } = setup('The review took 94 minutes. It ended well.');
      await script({
        byTool: {
          emit_specifics: { specifics: [{ sentence: 1, text: '94 minutes', kind: 'FIGURE', attributed: false, source: 'NONE', support: '' }] },
          emit_replacements: { replacements: [{ id: 1, text: 'The review took 95 minutes.' }] },
        },
        // the reader's second read (the rewrite) comes back with no list: a failed read
        when: [{ contains: '[1] The review took 95 minutes.', answer: { nothing: true } }],
      });
      const r = run({ ATELIER_CLAIMS: 'model', ATELIER_CLAIMS_MODEL: 'my-small-model', ATELIER_CLAIMS_GATE: 'reader' },
        'verify', '--skill', 'house', file, '--repair', '--json', ...remote());
      const j = JSON.parse(r.out) as { output: string; repair: { why: string; violatedBefore: string[]; violatedAfter: string[] } };
      expect(j.output).not.toContain('95 minutes');
      expect(j.repair.why).toMatch(/claim reader failed during the repair/);
      expect(j.repair.violatedBefore).toEqual(j.repair.violatedAfter);
    });
  });
});
