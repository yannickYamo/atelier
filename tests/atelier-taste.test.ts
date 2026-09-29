// tests/atelier-taste.test.ts — THE TASTE READER: READ TWICE AND QUOTED, EARNED FROM THE OWNER, ACTING ONLY WHEN EARNED.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readTaste, tasteRules, flatten, quoteIsReal, type TasteReading } from '../core/taste/reader.js';
import { tastePermissions, calibrationQueue, statementHash, passageAround, heldBack, labelToken, HOLDBACK, FALSE_BLOCK_BAR } from '../core/taste/calibration.js';
import { dimensionOf, coverageOf } from '../core/taste/dimensions.js';
import { refineTaste, spanOfQuote } from '../core/taste/repair.js';
import { REPAIR_SYSTEM, REPAIR_SYSTEM_WITH_PLACEHOLDERS } from '../core/loop/repair.js';
import { keysOf } from '../core/state/rule-key.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import * as store from '../core/state/store.js';
import { anInferenceResult, aRequirement } from './fixtures.js';
import { draftOrder, type DraftScore } from '../cli/commands/invoke.js';

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
  it('flatten leaves code alone, keeps link words, and keeps a year that starts a line', () => {
    expect(flatten('```\n# not a heading\n- **kept**\n```')).toBe('```\n# not a heading\n- **kept**\n```');
    expect(flatten('Run `a **b** c` now')).toBe('Run `a **b** c` now');
    expect(flatten('See [the docs](https://x.y) first')).toBe('See the docs first');
    expect(flatten('2024. was a year')).toBe('2024. was a year');
  });
  it('a quote without the emphasis markers is still the text\'s words', () => {
    expect(quoteIsReal('very important', 'This is *very* important.')).toBe(true);
    expect(quoteIsReal('**very** important', 'This is very important.')).toBe(true);
  });
});

describe('calibration: VETO only from the owner\'s blind labels, under the pre-registered bar', () => {
  const rules = tasteRules(v);
  const keyOf = (id: string): string => rules.find((r) => r.rule.requirementId === id)!.key;
  const reading = (id: string, rule: Requirement, verdict: 'FOLLOWED' | 'MISSED', passage = 'a passage'): Record<string, unknown> =>
    ({ kind: 'TASTE_READING', readingId: id, invocationId: null, standardVersionHash: 's', readerModel: 'm', at: id, blind: true,
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
    const blind = events.map((e) => (e.kind === 'TASTE_READING' ? { ...e, blind: true } : e));
    expect(calibrationQueue(rules, blind, 'm').map((q) => q.readingId)).toEqual(['a']);
  });
  it('only held-back readings are put to the owner: a verdict that was displayed is never labelled', () => {
    expect(calibrationQueue(rules, [{ ...reading('a', close, 'FOLLOWED'), blind: false }], 'm')).toEqual([]);
    expect(calibrationQueue(rules, [{ ...reading('a', close, 'FOLLOWED'), blind: true }], 'm').map((q) => q.token)).toEqual([labelToken('a', keyOf('p14'))]);
  });
  it('labels on readings whose verdict was displayed earn nothing, however many', () => {
    const shown = Array.from({ length: 30 }, (_, i) => [{ ...reading(`s${i}`, close, 'MISSED'), blind: false }, label(`s${i}`, close, 'MISSED')]).flat();
    expect(tastePermissions(rules, shown, 'm').pooled.trials).toBe(0);
  });
  it('the hold-back is decided by the reading id alone, at about the share asked for', () => {
    const ids = Array.from({ length: 3000 }, (_, i) => `r${i}`);
    const share = ids.filter((id) => heldBack(id)).length / ids.length;
    expect(share).toBeGreaterThan(HOLDBACK - 0.04);
    expect(share).toBeLessThan(HOLDBACK + 0.04);
    expect(heldBack('x', 0)).toBe(false);
    expect(heldBack('x', 1)).toBe(true);
    expect(ids.map((id) => heldBack(id))).toEqual(ids.map((id) => heldBack(id)));
  });
  it('the owner sees the paragraph around a quote, not the whole piece', () => {
    expect(passageAround('One.\n\nTwo has the quote in it.\n\nThree.', 'the quote')).toBe('Two has the quote in it.');
  });
  it('in a long paragraph, or across paragraphs, the owner sees a window centred on the quote', () => {
    const long = `${'Filler words here. '.repeat(80)}The quoted line sits late. ${'More filler follows. '.repeat(20)}`;
    const p = passageAround(long, 'The quoted line sits late.', 300)!;
    expect(p).toContain('The quoted line sits late.');
    expect(p.length).toBeLessThanOrEqual(302);
    expect(passageAround('First part ends here.\n\nSecond part starts.', 'ends here. Second part')).toContain('ends here.\n\nSecond part');
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
    expect(refused.why).toMatch(/does not read any targeted rule as followed/);
    // THE TASTE REWRITE IS TOLD WHAT THE PERSON ASKED FOR. With --placeholders it gets the placeholder
    // instructions the counted repair gets; without, the prompt never mentions slots.
    const systems = async (placeholders: boolean): Promise<string[]> => {
      const seen: string[] = [];
      const c: InferenceClient = { complete: async (req: InferenceRequest) => { if (req.toolName === 'emit_replacements') seen.push(req.stableBlock);
        return anInferenceResult({ json: req.toolName === 'emit_replacements' ? { replacements: [{ id: 1, text: fixedText }] } : readings([{ n: 1, verdict: 'FOLLOWED', quote: fixedText }]) }); } };
      await refineTaste(c, c, { spentUsd: 0, capUsd: 1 }, 'd', std, TEXT, missed, keys, null, { placeholders });
      return seen;
    };
    expect(await systems(true)).toEqual([REPAIR_SYSTEM_WITH_PLACEHOLDERS]);
    expect(await systems(false)).toEqual([REPAIR_SYSTEM]);
  });
  it('a reader that can no longer tell has not confirmed a fix', async () => {
    const fixedText = 'At the top, height got cheap and stopping stayed dear.';
    const unsure = stub({ emit_replacements: () => ({ replacements: [{ id: 1, text: fixedText }] }),
      emit_readings: () => readings([{ n: 1, verdict: 'UNCLEAR' }]) });
    const r = await refineTaste(unsure, unsure, { spentUsd: 0, capUsd: 1 }, 'd', std, TEXT, missed, keys, null);
    expect(r.output).toBe(TEXT);
    expect(r.fixed).toEqual([]);
  });
  it('a quote that cannot be located is not targeted, and no call is spent on it', async () => {
    const c = stub({});
    const lost: TasteReading[] = [{ ...missed[0], quote: 'words that are nowhere' }];
    const r = await refineTaste(c, c, { spentUsd: 0, capUsd: 1 }, 'd', std, TEXT, lost, keys, null);
    expect(r.targeted).toEqual([]);
    expect(c.calls).toEqual([]);
  });
  it('the splice is the sentence around the quote', () => {
    const sp = spanOfQuote(TEXT, 'the ladder ends')!;
    expect(TEXT.slice(sp.start, sp.end)).toBe('At the top the ladder ends.');
  });
  it('a quote across a paragraph break is not spliced', () => {
    expect(spanOfQuote('One ends.\n\nTwo starts.', 'ends.\n\nTwo')).toBeNull();
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
// The share of readings held back for calibration, per run: 0 shows every verdict, 1 holds every reading back.
let holdback = '0';
const run = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'],
      { encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_TASTE_HOLDBACK: holdback } });
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
    holdback = '0';
    const first = run(data, proj, 'invoke', '--skill', 'voice', '--task', 'write about review');
    expect(first).toContain('read against 1 reading-based rule(s): 0 followed, 1 missed');
    expect(first).toContain('has not earned any authority yet');
    expect(store.readEvents(L).some((e) => e.kind === 'TASTE_READING')).toBe(true);
    // An OBSERVE-only verdict is a report, never evidence for the convergence loop.
    expect(store.listObservations(L).some((o) => o.producer === 'taste-reader')).toBe(false);
    // Its verdict was shown, so it is not put to the owner.
    expect(run(data, proj, 'taste', '--skill', 'voice', '--list')).toContain('Nothing waiting for a label');

    // Nineteen held-back readings of drafts: no verdict shown, then the owner labels them blind.
    holdback = '1';
    const file = join(proj, 'd.md'); writeFileSync(file, draft);
    for (let i = 0; i < 19; i++) expect(run(data, proj, 'taste', '--skill', 'voice', '--read', file)).toContain('held back');
    const list = run(data, proj, 'taste', '--skill', 'voice', '--list');
    expect(list).not.toMatch(/MISSED|FOLLOWED/);            // blind: the reader's verdict is not shown
    const tokens = [...list.matchAll(/^(\S+:R-\S+)/gm)].map((m) => m[1]);
    expect(tokens).toHaveLength(19);
    // Tokens are stable: labelling the first does not shift the others.
    expect(run(data, proj, 'taste', '--skill', 'voice', '--label', `${tokens[0]}=missed`)).toContain('1 label(s) recorded');
    expect(run(data, proj, 'taste', '--skill', 'voice', '--list')).toContain(tokens[1]);
    expect(run(data, proj, 'taste', '--skill', 'voice', '--label', `${tokens[0]}=followed`)).toMatch(/^EXIT:1[\s\S]*already labelled/);
    expect(run(data, proj, 'taste', '--skill', 'voice', '--label', `${tokens[1]}=missed`, '--label', `${tokens[1]}=followed`)).toMatch(/^EXIT:1[\s\S]*twice/);
    const status = run(data, proj, 'taste', '--skill', 'voice', ...tokens.slice(1).flatMap((t) => ['--label', `${t}=missed`]));
    expect(status).toContain('VETO earned');

    // Now a miss is repaired, and the rewrite is kept only because the reader confirms it.
    const fixed = 'Code got cheap; understanding it stayed dear.';
    await post({ byTool: { emit_piece: { piece: draft }, emit_replacements: { replacements: [{ id: 1, text: fixed }] },
      emit_readings: readings([{ n: 1, verdict: 'MISSED', kind: 'PRESENCE', quote: 'At the end, review matters.' }]) },
    when: [{ contains: 'understanding it stayed dear', answer: readings([{ n: 1, verdict: 'FOLLOWED', quote: fixed }]) }] });
    holdback = '0';
    const second = run(data, proj, 'invoke', '--skill', 'voice', '--task', 'write about review');
    expect(second).toContain(fixed);
    expect(second).toContain('taste repair: 1 of 1 rule(s) now read as followed');
    const inv = store.listInvocations(L).find((i) => i.output.includes(fixed));
    expect(inv?.repair?.taste?.fixed).toHaveLength(1);
    // With VETO, the reading of the skill's own output is evidence.
    expect(store.listObservations(L).some((o) => o.producer === 'taste-reader' && o.invocationId === inv?.invocationId && o.authority === 'VETO_QUALIFIED')).toBe(true);

    // With VETO, drafts are ranked by the reader, and a failing reader costs nothing but the ranking.
    await post({ byTool: { emit_piece: { piece: draft }, emit_replacements: { replacements: [{ id: 1, text: fixed }] },
      emit_readings: readings([{ n: 1, verdict: 'MISSED', kind: 'PRESENCE', quote: 'At the end, review matters.' }]) },
    when: [{ contains: 'understanding it stayed dear', answer: readings([{ n: 1, verdict: 'FOLLOWED', quote: fixed }]) }] });
    const ranked = run(data, proj, 'invoke', '--skill', 'voice', '--task', 'write about review', '--drafts', '2');
    expect(ranked).toMatch(/taste rule\(s\) read as missed/);
    expect(ranked).not.toMatch(/^EXIT/);

    // And verify --taste now fails on a miss, as a broken REQUIRED rule does.
    const bad = join(proj, 'bad.md'); writeFileSync(bad, draft);
    expect(run(data, proj, 'verify', '--skill', 'voice', bad, '--taste')).toMatch(/^EXIT:1/);
  }, 180_000);

  it('verify --taste fails on a miss only where the reader holds VETO; MCP returns the verdicts', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-taste2-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-taste2-proj-'));
    run(data, proj, 'add', '--statement', 'I close an argument with a short antithetical sentence.', '--kind', 'GENERATIVE', '--materiality', 'REQUIRED');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'voice');
    await post({ byTool: { emit_readings: readings([{ n: 1, verdict: 'MISSED', kind: 'PRESENCE', quote: 'review matters' }]) } });
    const file = join(proj, 'd.md'); writeFileSync(file, 'At the end, review matters.');
    holdback = '0';
    const out = run(data, proj, 'verify', '--skill', 'voice', file, '--taste');
    expect(out).toContain('1 missed');
    expect(out).not.toMatch(/^EXIT:1/);                     // observed, not enforced: no VETO yet
    // --json with --taste is one object a pipeline can parse, taste included.
    const json = JSON.parse(run(data, proj, 'verify', '--skill', 'voice', file, '--taste', '--json')) as { failed: boolean; taste?: { verdicts: { verdict: string }[] } };
    expect(json.taste?.verdicts[0]?.verdict).toBe('MISSED');
    expect(json.failed).toBe(false);
    const input = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'atelier_verify', arguments: { skill: 'voice', text: 'At the end, review matters.', taste: true } } });
    const reply = JSON.parse(execFileSync('node', [CLI, 'mcp', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'],
      { encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_TASTE_HOLDBACK: '0' }, input }).trim()) as { result: { content: { text: string }[] } };
    expect(reply.result.content[0].text).toMatch(/"taste":\[\{"rule":"x1","verdict":"MISSED"/);

    // A runtime with only a target model named: the reader runs on it rather than dying for a discovery model.
    await post({ byTool: { emit_piece: { piece: 'At the end, review matters.' }, emit_readings: readings([{ n: 1, verdict: 'FOLLOWED', quote: 'review matters' }]) } });
    let targetOnly: string;
    try {
      targetOnly = execFileSync('node', [CLI, 'invoke', '--skill', 'voice', '--task', 'write', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`,
        '--target-model', 'scripted', '--accept-new-binding'], { encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_TASTE_HOLDBACK: '0' } });
    } catch (e) { targetOnly = `EXIT ${String((e as { stderr?: string }).stderr)}`; }
    expect(targetOnly).not.toMatch(/no model set/);
    expect(targetOnly).toContain('1 followed');
  }, 120_000);
});

describe('keys are what readings follow', () => {
  it('the reader keys readings by the rule key, so they survive renumbering', () => {
    expect(tasteRules(v).map((r) => r.key)).toEqual(keysOf(v.requirements).slice(0, 3));
  });
});

// WHICH OF N DRAFTS `invoke --drafts N` DELIVERS. The choice said "a count picks it, never a judge's
// taste" while ranking the taste reader's VETO misses first, so a draft breaking a REQUIRED rule could win
// on the reader's opinion. And a draft whose signal distance could not be read ranked as if it sat
// exactly on the author's typical value (null became 0).
describe('invoke --drafts: the order drafts are chosen in', () => {
  const d = (o: Partial<DraftScore>): DraftScore => ({ req: 0, taste: 0, tells: 0, all: 0, signal: 1, style: 0, ...o });
  const pick = (...xs: DraftScore[]): number => xs.map((x, i) => ({ x, i })).sort((a, b) => draftOrder(a.x, b.x))[0].i;

  describe('draft choice: REQUIRED rules outrank the taste reader', () => {
    it('a draft breaking a REQUIRED rule loses to one the reader dislikes', () => {
      expect(pick(d({ req: 1, taste: 0 }), d({ req: 0, taste: 2 }))).toBe(1);
    });
    it('POLARITY — with REQUIRED tied, the reader decides before tells, all rules, signals and style', () => {
      expect(pick(d({ taste: 1 }), d({ taste: 0, tells: 5, all: 5, signal: 9, style: -3 }))).toBe(1);
    });
    it('then tells, then all rules, then signals, then style', () => {
      expect(pick(d({ tells: 1 }), d({ all: 3 }))).toBe(1);
      expect(pick(d({ all: 1 }), d({ signal: 5 }))).toBe(1);
      expect(pick(d({ signal: 2 }), d({ signal: 1, style: -1 }))).toBe(1);
      expect(pick(d({ style: 0.1 }), d({ style: 0.5 }))).toBe(1);
    });
  });

  describe('draft choice: an unread signal distance ranks last, not as a perfect 0', () => {
    it('null loses to any measured distance', () => {
      expect(pick(d({ signal: null }), d({ signal: 3 }))).toBe(1);
      expect(pick(d({ signal: 3 }), d({ signal: null }))).toBe(0);
    });
    it('two unread distances tie, and style breaks it', () => {
      expect(pick(d({ signal: null, style: 0 }), d({ signal: null, style: 1 }))).toBe(1);
    });
  });
});
