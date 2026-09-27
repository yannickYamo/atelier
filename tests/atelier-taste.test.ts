// tests/atelier-taste.test.ts — THE TASTE READER: READ TWICE AND QUOTED, EARNED FROM THE OWNER, ACTING ONLY WHEN EARNED.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readTaste, tasteRules, flatten, quoteIsReal, type TasteReading } from '../core/taste/reader.js';
import { tastePermissions, calibrationQueue, statementHash, passageAround, FALSE_BLOCK_BAR } from '../core/taste/calibration.js';
import { dimensionOf, coverageOf } from '../core/taste/dimensions.js';
import { refineTaste, spanOfQuote } from '../core/taste/repair.js';
import { keysOf } from '../core/state/rule-key.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import * as store from '../core/state/store.js';
import { anInferenceResult, aRequirement } from './fixtures.js';

const figure = aRequirement({ requirementId: 'p13', statement: 'I build the piece on one governing figure and keep returning to it.', materiality: 'PREFERRED' });
const close = aRequirement({ requirementId: 'p14', statement: 'I close an argument with a short antithetical sentence.', materiality: 'REQUIRED' });
const cond = aRequirement({ requirementId: 'p1', statement: 'I split a verdict by the reader\'s situation.', appliesWhen: 'the piece gives advice about a tool' });
const counted = aRequirement({ requirementId: 'c1', statement: 'No em dashes.', measurement: { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0 } } });
const v = { standardVersionHash: 's', requirements: [figure, close, cond, counted] } as unknown as StandardVersion;
const TEXT = 'The ladder is the whole idea. We climb it rung by rung.\n\nAt the top the ladder ends. Speed got cheap; judgement did not.';

/** A stub model: answers by tool name, and for readings by which pass it is (the flattened text has no markdown). */
const stub = (by: Record<string, (req: InferenceRequest) => unknown>): InferenceClient & { calls: string[] } => {
  const calls: string[] = [];
  return { calls, complete: async (req: InferenceRequest) => { calls.push(req.toolName); return anInferenceResult({ json: by[req.toolName](req) }); } };
};
const readings = (list: { n: number; verdict: string; kind?: string | null; quote?: string | null }[]) =>
  ({ readings: list.map((r) => ({ kind: null, quote: null, why: 'because', ...r })) });

describe('the reader', () => {
  it('reads only rules no count decides; a rule with a condition is decided from the task, blind to the output', async () => {
    expect(tasteRules(v).map((r) => r.rule.requirementId)).toEqual(['p13', 'p14', 'p1']);
    const c = stub({
      emit_applicability: (req) => { expect(req.userMessage).not.toContain('ladder'); return { answers: [{ n: 1, applies: 'NO' }] }; },
      emit_readings: () => readings([{ n: 1, verdict: 'FOLLOWED', quote: 'The ladder is the whole idea.' }, { n: 2, verdict: 'FOLLOWED', quote: 'Speed got cheap; judgement did not.' }]),
    });
    const r = await readTaste(c, { spentUsd: 0, capUsd: 1 }, v, TEXT, 'write a history of climbing');
    expect(r.find((x) => x.requirementId === 'p1')?.verdict).toBe('NOT_APPLICABLE');
    expect(r.find((x) => x.requirementId === 'p13')?.verdict).toBe('FOLLOWED');
    expect(c.calls.filter((t) => t === 'emit_readings')).toHaveLength(2);
  });
  it('the second pass sees the rules reversed: a verdict that follows position, not text, is UNSTABLE', async () => {
    // The model always calls rule 1 FOLLOWED and rule 2 MISSED, whichever rules those are.
    const c = stub({ emit_readings: () => readings([{ n: 1, verdict: 'FOLLOWED', quote: 'The ladder is the whole idea.' }, { n: 2, verdict: 'MISSED', quote: null, kind: 'OMISSION' }]) });
    const r = await readTaste(c, { spentUsd: 0, capUsd: 1 }, { ...v, requirements: [figure, close] }, TEXT);
    expect(r.map((x) => x.verdict)).toEqual(['UNSTABLE', 'UNSTABLE']);
  });
  it('a verdict whose quote is not in the text is UNCLEAR, never FOLLOWED or MISSED', async () => {
    const c = stub({ emit_readings: () => readings([{ n: 1, verdict: 'FOLLOWED', quote: 'a sentence nobody wrote' }]) });
    const r = await readTaste(c, { spentUsd: 0, capUsd: 1 }, { ...v, requirements: [figure] }, TEXT);
    expect(r[0].verdict).toBe('UNCLEAR');
  });
  it('a MISSED with a real quote is PRESENCE; with none, OMISSION', async () => {
    const c = stub({ emit_readings: () => readings([{ n: 1, verdict: 'MISSED', kind: 'PRESENCE', quote: 'We climb it rung by rung.' }]) });
    const r = await readTaste(c, { spentUsd: 0, capUsd: 1 }, { ...v, requirements: [figure] }, TEXT);
    expect(r[0]).toMatchObject({ verdict: 'MISSED', kind: 'PRESENCE', quote: 'We climb it rung by rung.' });
  });
  it('flatten removes the markdown a verdict should not depend on; quotes survive line wrapping', () => {
    expect(flatten('## A heading\n\n- **bold** item\n> quoted')).toBe('A heading\n\nbold item\nquoted');
    expect(quoteIsReal('rung by\nrung', 'We climb it rung by rung.')).toBe(true);
    expect(quoteIsReal('ab', 'ab')).toBe(false);
  });
});

describe('calibration: VETO only from the owner\'s blind labels, under the pre-registered bar', () => {
  const rules = tasteRules(v);
  const keyOf = (id: string): string => rules.find((r) => r.rule.requirementId === id)!.key;
  const reading = (id: string, rule: Requirement, verdict: 'FOLLOWED' | 'MISSED', passage = 'a passage'): Record<string, unknown> =>
    ({ kind: 'TASTE_READING', readingId: id, invocationId: null, standardVersionHash: 's', readerModel: 'm', at: id,
      readings: [{ requirementId: rule.requirementId, key: keyOf(rule.requirementId), verdict, kind: verdict === 'MISSED' ? 'PRESENCE' : undefined, quote: 'q', why: 'w', statementHash: statementHash(rule), passage }] });
  const label = (id: string, rule: Requirement, l: 'FOLLOWED' | 'MISSED' | 'UNSURE'): Record<string, unknown> =>
    ({ kind: 'TASTE_LABEL', readingId: id, key: keyOf(rule.requirementId), statementHash: statementHash(rule), label: l, at: id });
  const confirmedMisses = (n: number, rule = close): Record<string, unknown>[] =>
    Array.from({ length: n }, (_, i) => [reading(`r${rule.requirementId}${i}`, rule, 'MISSED'), label(`r${rule.requirementId}${i}`, rule, 'MISSED')]).flat();

  it('nothing labelled: every rule OBSERVE', () => {
    const p = tastePermissions(rules, [], 'm');
    expect(p.veto.size).toBe(0);
    expect(p.pooled.earned).toBe(false);
  });
  it('19 confirmed misses and none wrong meets the 15% bar; 18 does not', () => {
    expect(tastePermissions(rules, confirmedMisses(19), 'm').pooled.earned).toBe(true);
    expect(tastePermissions(rules, confirmedMisses(18), 'm').pooled.earned).toBe(false);
    expect(FALSE_BLOCK_BAR).toBe(0.15);
  });
  it('a rule whose own misses were wrong in more than a third loses VETO on its own', () => {
    const wrong = Array.from({ length: 2 }, (_, i) => [reading(`w${i}`, figure, 'MISSED'), label(`w${i}`, figure, 'FOLLOWED')]).flat();
    const right = [reading('x', figure, 'MISSED'), label('x', figure, 'MISSED')];
    const p = tastePermissions(rules, [...confirmedMisses(40), ...wrong, ...right], 'm');
    expect(p.pooled.earned).toBe(true);
    expect(p.veto.has(keyOf('p14'))).toBe(true);
    expect(p.veto.has(keyOf('p13'))).toBe(false);
  });
  it('rewording a rule, or changing the reader model, voids what it earned; UNSURE counts for nothing', () => {
    const reworded = tasteRules({ ...v, requirements: [figure, { ...close, statement: 'I end on a turn.' }, cond] });
    expect(tastePermissions(reworded, confirmedMisses(19), 'm').veto.size).toBe(0);
    expect(tastePermissions(rules, confirmedMisses(19), 'other-model').veto.size).toBe(0);
    const unsure = Array.from({ length: 19 }, (_, i) => [reading(`u${i}`, close, 'MISSED'), label(`u${i}`, close, 'UNSURE')]).flat();
    expect(tastePermissions(rules, unsure, 'm').pooled.trials).toBe(0);
  });
  it('the queue is blind to outcome: FOLLOWED and MISSED alike, oldest first, each once, never an omission', () => {
    const events = [reading('a', close, 'FOLLOWED'), reading('b', close, 'MISSED'), label('b', close, 'MISSED'),
      { ...reading('c', close, 'MISSED'), readings: [{ requirementId: 'p14', key: keyOf('p14'), verdict: 'MISSED', kind: 'OMISSION', why: 'w', statementHash: statementHash(close) }] }];
    expect(calibrationQueue(rules, events, 'm').map((q) => q.readingId)).toEqual(['a']);
  });
  it('the owner sees the paragraph around a quote, not the whole piece', () => {
    expect(passageAround('One.\n\nTwo has the quote in it.\n\nThree.', 'the quote')).toBe('Two has the quote in it.');
  });
});

describe('the coverage map', () => {
  it('sorts counted rules by what they count and read rules by their words, and names the gaps', () => {
    expect(dimensionOf(figure)).toBe('FIGURE');
    expect(dimensionOf(close)).toBe('CADENCE');
    expect(dimensionOf(counted)).toBe('VOCABULARY');
    expect(dimensionOf(aRequirement({ requirementId: 'x', statement: 'Zzz qqq.' }))).toBe('UNSORTED');
    const c = coverageOf(v.requirements);
    expect(c.gaps).toContain('PACE');
    expect(c.unchecked).toContain('FIGURE');
  });
});

describe('taste repair: only where the reader holds VETO, only a quoted passage, kept only if the reader confirms', () => {
  const rules = tasteRules(v);
  const keys = new Set([rules.find((r) => r.rule.requirementId === 'p14')!.key]);
  const missed: TasteReading[] = [{ requirementId: 'p14', key: [...keys][0], verdict: 'MISSED', kind: 'PRESENCE', quote: 'At the top the ladder ends.', why: 'the close is not antithetical' }];
  const std = { ...v, requirements: [close] } as StandardVersion;
  it('without VETO, nothing is touched', async () => {
    const c = stub({});
    const r = await refineTaste(c, c, { spentUsd: 0, capUsd: 1 }, 'd', std, TEXT, missed, new Set(), null);
    expect(r.output).toBe(TEXT);
    expect(c.calls).toEqual([]);
  });
  it('a rewrite the reader confirms is kept; one it still reads as missed is not', async () => {
    // No added negation: the meaning guard refuses a rewrite that adds a "not", even to build an antithesis.
    const fixedText = 'At the top, height got cheap and stopping stayed dear.';
    const confirm = stub({ emit_replacements: () => ({ replacements: [{ id: 1, text: fixedText }] }),
      emit_readings: () => readings([{ n: 1, verdict: 'FOLLOWED', quote: fixedText }]) });
    const kept = await refineTaste(confirm, confirm, { spentUsd: 0, capUsd: 1 }, 'd', std, TEXT, missed, keys, null);
    expect(kept.output).toContain(fixedText);
    expect(kept.fixed).toEqual(['p14']);
    const deny = stub({ emit_replacements: () => ({ replacements: [{ id: 1, text: fixedText }] }),
      emit_readings: () => readings([{ n: 1, verdict: 'MISSED', kind: 'PRESENCE', quote: fixedText }]) });
    const refused = await refineTaste(deny, deny, { spentUsd: 0, capUsd: 1 }, 'd', std, TEXT, missed, keys, null);
    expect(refused.output).toBe(TEXT);
    expect(refused.why).toMatch(/still reads/);
  });
  it('the splice is the sentence around the quote', () => {
    const sp = spanOfQuote(TEXT, 'the ladder ends')!;
    expect(TEXT.slice(sp.start, sp.end)).toBe('At the top the ladder ends.');
  });
});

// ── Through the binary ────────────────────────────────────────────────────────────────────────────
const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
const post = async (body: unknown): Promise<void> => {
  const send = (): Promise<Response> => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(body) });
  try { await send(); } catch { await send(); }
};
beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run npm run build first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
});
afterAll(() => { backend.kill(); });
const run = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'],
      { encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj } });
  } catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${x.status}\n${x.stderr ?? ''}${x.stdout ?? ''}`; }
};

describe('through the binary: every output is read, labels earn authority, and then the reader acts', () => {
  it('invoke reads; taste lists and labels; after 19 confirmed misses the reader holds VETO and repairs', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-taste-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-taste-proj-'));
    const L = { root: data, skillName: 'voice' };
    run(data, proj, 'add', '--statement', 'I close an argument with a short antithetical sentence.', '--kind', 'GENERATIVE', '--materiality', 'REQUIRED');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'voice');
    const draft = 'Agents write most of the code now. At the end, review matters.';
    await post({ byTool: { emit_piece: { piece: draft },
      emit_readings: readings([{ n: 1, verdict: 'MISSED', kind: 'PRESENCE', quote: 'At the end, review matters.' }]) } });
    const first = run(data, proj, 'invoke', '--skill', 'voice', '--task', 'write about review');
    expect(first).toContain('read against 1 reading-based rule(s): 0 followed, 1 missed');
    expect(first).toContain('has not earned any authority yet');
    expect(store.readEvents(L).some((e) => e.kind === 'TASTE_READING')).toBe(true);
    expect(store.listObservations(L).some((o) => o.producer === 'taste-reader' && o.verdict === 'MISSED' && o.authority === 'OBSERVE_ONLY')).toBe(true);

    // Eighteen more readings of drafts, then the owner labels all nineteen blind.
    const file = join(proj, 'd.md'); writeFileSync(file, draft);
    for (let i = 0; i < 18; i++) run(data, proj, 'taste', '--skill', 'voice', '--read', file);
    const list = run(data, proj, 'taste', '--skill', 'voice', '--list');
    expect(list).toContain('19. ');
    expect(list).not.toMatch(/MISSED|FOLLOWED/);            // blind: the reader's verdict is not shown
    const labels = Array.from({ length: 19 }, (_, i) => ['--label', `${i + 1}=missed`]).flat();
    const status = run(data, proj, 'taste', '--skill', 'voice', ...labels);
    expect(status).toContain('VETO earned');

    // Now a miss is repaired, and the rewrite is kept only because the reader confirms it.
    const fixed = 'Code got cheap; understanding it stayed dear.';
    await post({ byTool: { emit_piece: { piece: draft }, emit_replacements: { replacements: [{ id: 1, text: fixed }] },
      emit_readings: readings([{ n: 1, verdict: 'MISSED', kind: 'PRESENCE', quote: 'At the end, review matters.' }]) },
    when: [{ contains: 'understanding it stayed dear', answer: readings([{ n: 1, verdict: 'FOLLOWED', quote: fixed }]) }] });
    const second = run(data, proj, 'invoke', '--skill', 'voice', '--task', 'write about review');
    expect(second).toContain(fixed);
    expect(second).toContain('taste repair: 1 of 1 rule(s) no longer read as missed');
    expect(store.listInvocations(L).find((i) => i.output.includes(fixed))?.repair?.taste?.fixed).toHaveLength(1);
  }, 180_000);

  it('verify --taste fails on a miss only where the reader holds VETO; MCP returns the verdicts', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-taste2-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-taste2-proj-'));
    run(data, proj, 'add', '--statement', 'I close an argument with a short antithetical sentence.', '--kind', 'GENERATIVE', '--materiality', 'REQUIRED');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'voice');
    await post({ byTool: { emit_readings: readings([{ n: 1, verdict: 'MISSED', kind: 'PRESENCE', quote: 'review matters' }]) } });
    const file = join(proj, 'd.md'); writeFileSync(file, 'At the end, review matters.');
    const out = run(data, proj, 'verify', '--skill', 'voice', file, '--taste');
    expect(out).toContain('1 missed');
    expect(out).not.toMatch(/^EXIT:1/);                     // observed, not enforced: no VETO yet
    const input = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'atelier_verify', arguments: { skill: 'voice', text: 'At the end, review matters.', taste: true } } });
    const reply = JSON.parse(execFileSync('node', [CLI, 'mcp', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'],
      { encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj }, input }).trim()) as { result: { content: { text: string }[] } };
    expect(reply.result.content[0].text).toMatch(/"taste":\[\{"rule":"x1","verdict":"MISSED"/);
  }, 120_000);
});

describe('keys are what readings follow', () => {
  it('the reader keys readings by the rule key, so they survive renumbering', () => {
    expect(tasteRules(v).map((r) => r.key)).toEqual(keysOf(v.requirements).slice(0, 3));
  });
});
