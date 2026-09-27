// tests/atelier-phase8.test.ts — THE OPTIMIZER, HOSTED WHERE IT CANNOT MOVE THE TARGET.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { genomeOf, mutationsOf, mutationKey, type Mutation } from '../core/optimizer/genome.js';
import { dominates, paretoFront, finalists } from '../core/optimizer/pareto.js';
import { reflectPrompt, parseReflection, MAX_FAILURES_SHOWN, MAX_ATTEMPTS_SHOWN, MAX_PROPOSALS } from '../core/optimizer/reflect.js';
import { mayPropose, foldRepairs } from '../core/architecture/repair-memory.js';
import { contrastFor } from '../core/compiler/contrast-examples.js';
import { ruleKey } from '../core/state/rule-key.js';
import { plantedDetections } from '../core/distinctiveness/measured.js';
import type { SkillArchitecture } from '../core/architecture/compile.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';
import * as store from '../core/state/store.js';
import { aRequirement } from './fixtures.js';

const rule = (id: string, o: Partial<Requirement> = {}): Requirement => aRequirement({ requirementId: id, statement: `Rule ${id}.`, ...o });

describe('the genome: only what the compiler derives, one gene at a time', () => {
  const arch = { architectureHash: 'a', standardVersionHash: 's', components: [
    { id: 'c1', carries: ['p1'], carrier: 'PROSE', sensor: 'NONE', gateRole: 'ENFORCE', rationale: '' },
    { id: 'c2', carries: ['p2', 'p3'], carrier: 'PROSE', sensor: 'NONE', gateRole: 'ENFORCE', rationale: '' },
    { id: 'c3', carries: ['p4'], carrier: 'NONE', sensor: 'NONE', gateRole: 'OBSERVE', rationale: '' },
  ] } as unknown as SkillArchitecture;
  const v = { requirements: [rule('p1', { evidence: null }), rule('p2'), rule('p3'), rule('p4')] } as unknown as StandardVersion;
  it('rules sharing a component, and rules carried by nothing, are not genes', () => {
    const g = genomeOf(arch, { 'SKILL.md': '', 'examples/exemplar.md': 'x' });
    expect(g).toEqual({ carriers: { p1: 'PROSE' }, exemplar: true, contrast: false });
  });
  it('only legal carriers for the rule\'s own properties: no EXAMPLE without evidence, no contract without a shape', () => {
    const ms = mutationsOf(genomeOf(arch, {}), v, { exemplar: false, contrast: false });
    expect(ms.map((m) => (m.kind === 'CARRIER' ? m.to : m.kind))).toEqual(['SELF_CHECK']);
  });
  it('a rejected rule is never mutated; toggles appear only when there is something to toggle', () => {
    const rejected = { requirements: [rule('p1', { authority: 'EXPERT_REJECTED' })] } as unknown as StandardVersion;
    expect(mutationsOf(genomeOf(arch, {}), rejected, { exemplar: false, contrast: false })).toEqual([]);
    expect(mutationsOf(genomeOf(arch, {}), rejected, { exemplar: true, contrast: true }).map((m) => m.kind)).toEqual(['EXEMPLAR', 'CONTRAST']);
  });
});

describe('Pareto selection over the measured rules', () => {
  it('dominance needs no worse anywhere and better somewhere, beyond epsilon', () => {
    expect(dominates({ a: 1, b: 1 }, { a: 0, b: 1 })).toBe(true);
    expect(dominates({ a: 1, b: 0 }, { a: 0, b: 1 })).toBe(false);
    expect(dominates({ a: 1.005 }, { a: 1 }, 0.01)).toBe(false);
  });
  it('the front keeps every candidate nothing beats on every rule', () => {
    const pop = [{ id: 'x', s: { a: 2, b: 0 } }, { id: 'y', s: { a: 0, b: 2 } }, { id: 'z', s: { a: 0, b: 0 } }];
    expect(paretoFront(pop, (p) => p.s).map((p) => p.id)).toEqual(['x', 'y']);
  });
  it('finalists drop anything the champion dominates or that beats it nowhere, and rank by wins then gain', () => {
    const champ = { a: 1, b: 1, c: 1 };
    const pop = [{ id: 'worse', s: { a: 0, b: 1, c: 1 } }, { id: 'same', s: { a: 1, b: 1, c: 1 } },
      { id: 'one', s: { a: 3, b: 0.5, c: 1 } }, { id: 'two', s: { a: 1.5, b: 1.5, c: 0.9 } }];
    expect(finalists(pop, (p) => p.s, champ, 2).map((p) => p.id)).toEqual(['two', 'one']);
  });
});

describe('reflection: bounded history, legal choices only', () => {
  const legal: Mutation[] = [
    { kind: 'CARRIER', requirementId: 'p1', from: 'PROSE', to: 'SELF_CHECK' },
    { kind: 'CARRIER', requirementId: 'p1', from: 'PROSE', to: 'EXAMPLE' },
    { kind: 'EXEMPLAR', on: false },
  ];
  it('the prompt shows at most the budgeted failures and attempts, newest kept', () => {
    const failures = Array.from({ length: 10 }, (_, i) => ({ requirementId: 'p1', text: `failure ${i}`, why: 'w' }));
    const attempts = Array.from({ length: 10 }, (_, i) => ({ requirementId: 'p1', from: 'PROSE' as const, to: 'EXAMPLE' as const, outcome: `attempt ${i}` }));
    const p = reflectPrompt(new Map([['p1', rule('p1')]]), legal, failures, attempts);
    expect(p).toContain('failure 9');
    expect(p).not.toContain(`failure ${9 - MAX_FAILURES_SHOWN}`);
    expect(p).toContain('attempt 9');
    expect(p).not.toContain(`attempt ${9 - MAX_ATTEMPTS_SHOWN}`);
    expect(p).toContain('1. p1: PROSE → SELF_CHECK');
  });
  it('proposals that name no legal change are discarded and counted; duplicates collapse; the cap holds', () => {
    const r = parseReflection({ proposals: [{ change: 2, why: 'a' }, { change: 2, why: 'dup' }, { change: 9, why: 'no' }, { change: 'x', why: 'no' },
      { change: 1, why: 'b' }, { change: 3, why: 'c' }, { change: 1, why: 'over' }] }, legal);
    expect(r.proposals.map((p) => mutationKey(p.mutation))).toEqual([mutationKey(legal[1]), mutationKey(legal[0]), mutationKey(legal[2])].slice(0, MAX_PROPOSALS));
    expect(r.invalid).toBe(2);
    expect(parseReflection(null, legal)).toEqual({ proposals: [], invalid: 0 });
  });
});

describe('Phase 8 audit: what was closed', () => {
  it('a move rejected at confirmation is not re-proposed on this round\'s screen; an untested one is', () => {
    const at = '2026-01-01T00:00:00Z';
    const ev = (outcome: 'REJECTED', generations: number, instrument: 'QUALIFIED_OBSERVER' | 'UNQUALIFIED_COMPARATOR') => [
      { kind: 'REPAIR_PROPOSED', repairId: 'r', skillName: 's', requirementId: 'p1', from: 'PROSE', to: 'SELF_CHECK', standardVersionHash: 'v', providerAdapter: 'x', requestedModel: 'm',
        sourceSkillVersionHash: 'a', candidateSkillVersionHash: 'b', evidenceBasis: { missContexts: 20, invocationIds: [] }, at },
      { kind: 'REPAIR_SETTLED', repairId: 'r', outcome, evaluationBasis: { generations, instrument, orderInvariant: null }, at, note: null }];
    const screen = { evidence: { missContexts: 20, invocationIds: [] }, evaluation: { generations: 1, instrument: 'UNQUALIFIED_COMPARATOR' as const, orderInvariant: null } };
    const scope = { standardVersionHash: 'v', providerAdapter: 'x', requestedModel: 'm' };
    expect(mayPropose(foldRepairs(ev('REJECTED', 3, 'QUALIFIED_OBSERVER')), [], 'p1', 'PROSE', 'SELF_CHECK', screen, scope).allowed).toBe(false);
    expect(mayPropose(foldRepairs(ev('REJECTED', 1, 'UNQUALIFIED_COMPARATOR')), [], 'p1', 'PROSE', 'SELF_CHECK', screen, scope).allowed).toBe(false);
    expect(mayPropose(foldRepairs(ev('REJECTED', 0, 'UNQUALIFIED_COMPARATOR')), [], 'p1', 'PROSE', 'SELF_CHECK', screen, scope).allowed).toBe(true);
  });
  it('legacy pairs without a check: kept (and stamped) where the passage proves it, dropped where it cannot', () => {
    const lex = rule('x1', { kind: 'BOUNDARY', measurement: { observer: 'LEXICON', params: { terms: ['leverage'] } } });
    const len = rule('x2', { measurement: { observer: 'SENTENCE_LENGTH', params: { medianMax: 15, p90Max: 28 } } });
    const v = { requirements: [lex, len] } as unknown as StandardVersion;
    const kept = contrastFor([{ key: ruleKey(lex), before: 'We leverage A.', after: 'We use A.', statement: '' },
      { key: ruleKey(len), before: 'A very long sentence.', after: 'Short.', statement: '' }], v);
    expect(kept.map((p) => p.key)).toEqual([ruleKey(lex)]);
    expect(kept[0].check).toBeDefined();
  });
  it('sensitivity: a regression of two margins is caught across tasks; none is planted on OBSERVE rules', () => {
    const c = { instrument: 'scoreDimensionByPolicy' as const, dimensions: { a: { nonInferiorityMargin: 1, gateRole: 'ENFORCE' as const, rationale: '' },
      b: { nonInferiorityMargin: 1, gateRole: 'OBSERVE' as const, rationale: '' } } };
    const tasks = Array.from({ length: 6 }, (_, i) => ({ clusterId: 'c', fixtureContextId: `t${i}`, nGen: 1, meanScores: {}, perFireScores: { a: [0], b: [0] } }));
    expect(plantedDetections(tasks, tasks, c)).toEqual({ hits: 1, trials: 1 });
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

describe('through the binary: one round of optimize', () => {
  const seed = async (tasks: number): Promise<{ data: string; proj: string }> => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p8-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p8-proj-'));
    run(data, proj, 'add', '--statement', 'Never say synergy.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:synergy');
    run(data, proj, 'add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'focus');
    const corpus = join(proj, 'mine'); mkdirSync(corpus);
    for (const i of [1, 2, 3]) writeFileSync(join(corpus, `p${i}.md`), `Piece ${i}.`);
    const file = join(proj, 'tasks.txt');
    writeFileSync(file, Array.from({ length: tasks }, (_, i) => `Task ${i + 1}.`).join('\n\n'));
    run(data, proj, 'floor', '--skill', 'focus', '--corpus', corpus, '--tasks', file, '--enforce', '1', '--enforce', '2');
    return { data, proj };
  };

  it('refuses to search without a floor to guard what it does not target', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p8x-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p8x-proj-'));
    run(data, proj, 'add', '--statement', 'Never say synergy.', '--kind', 'BOUNDARY', '--measure', 'LEXICON:synergy');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'focus');
    expect(run(data, proj, 'optimize', '--skill', 'focus')).toMatch(/^EXIT:1[\s\S]*regression floor/);
  });

  it('proposes by reflection and by the fixed order, screens, confirms on the floor, installs only through the gate, and never moves the standard', async () => {
    const { data, proj } = await seed(10);
    const L = { root: data, skillName: 'focus' };
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'the failures show the rule is skimmed while drafting' }] } } });
    run(data, proj, 'floor', '--skill', 'focus', '--baseline');
    let q = ''; for (let i = 0; i < 6; i++) q = run(data, proj, 'floor', '--skill', 'focus', '--qualify');
    expect(q).toContain('EARNED');
    const std = store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash;
    const before = store.getActive(L);
    // Any version whose SKILL.md checks the draft before finalizing writes the plain answer.
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'the failures show the rule is skimmed while drafting' }] } },
      when: [{ contains: 'Before you finalize', answer: { piece: 'the plain answer' } }] });
    const out = run(data, proj, 'optimize', '--skill', 'focus', '--promote', '--cap', '50');
    expect(out).toContain('by reflection');
    expect(out).toMatch(/→ .*\[REFLECTIVE\]/);
    expect(out).toContain('gate AUTO_PROMOTE');
    expect(out).toContain('Installed');
    expect(store.getActive(L)).not.toBe(before);
    expect(store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash, 'the optimizer moved the standard').toBe(std);
    const events = store.readEvents(L);
    expect(events.some((e) => e.kind === 'REPAIR_PROPOSED' && (e as { proposer?: string }).proposer === 'REFLECTIVE')).toBe(true);
    expect(events.some((e) => e.kind === 'OPTIMIZE_ROUND')).toBe(true);
    const report = run(data, proj, 'optimize', '--skill', 'focus', '--report');
    expect(report).toMatch(/REFLECTIVE\s+\d+ proposed · 1 kept/);
  }, 300_000);

  it('a round that runs out of budget stops cleanly: recorded, and nothing it built is held against a retry', async () => {
    const { data, proj } = await seed(5);
    const L = { root: data, skillName: 'focus' };
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [] } } });
    run(data, proj, 'floor', '--skill', 'focus', '--baseline');
    const out = run(data, proj, 'optimize', '--skill', 'focus', '--cap', '0.0000001');
    expect(out).toContain('could not finish');
    const round = store.readEvents(L).find((e) => e.kind === 'OPTIMIZE_ROUND') as { aborted?: string } | undefined;
    expect(round?.aborted).toBeTruthy();
    expect(foldRepairs(store.readEvents(L)).every((r) => r.outcome !== 'PENDING')).toBe(true);
  }, 300_000);

  it('a candidate left waiting for a person does not break fix: fix says where to decide it', async () => {
    const { data, proj } = await seed(10);
    const L = { root: data, skillName: 'focus' };
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [] } } });
    expect(run(data, proj, 'invoke', '--skill', 'focus', '--task', 'write the recommendation')).not.toMatch(/^EXIT:/);
    run(data, proj, 'floor', '--skill', 'focus', '--baseline');
    for (let i = 0; i < 6; i++) run(data, proj, 'floor', '--skill', 'focus', '--qualify');
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [] },
      emit_coverage: { coverage: 'COVERED', requirementIds: ['x1'], proposedRequirement: null, question: null, reasoning: 'x1' } },
    when: [{ contains: 'Before you finalize', answer: { piece: 'the plain answer' } }] });
    const opt = run(data, proj, 'optimize', '--skill', 'focus', '--cap', '50');
    expect(opt).toContain('to adopt it yourself');
    expect(foldRepairs(store.readEvents(L)).some((r) => r.outcome === 'PENDING')).toBe(true);
    const out = run(data, proj, 'fix', 'it said synergy');
    expect(out).not.toMatch(/^EXIT:/);
    expect(out).toContain('already waiting for your decision');
  }, 300_000);

  it('fix --reflect lets a model choose the change, and records who chose', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p8r-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p8r-proj-'));
    const L = { root: data, skillName: 'focus' };
    run(data, proj, 'add', '--statement', 'Lead with the action.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'focus');
    await post({ byTool: { emit_piece: { piece: 'the original answer' } } });
    run(data, proj, 'invoke', '--skill', 'focus', '--task', 'write the recommendation');
    await post({ byTool: { emit_coverage: { coverage: 'COVERED', requirementIds: ['x1'], proposedRequirement: null, question: null, reasoning: 'x1' },
      emit_piece: { piece: 'the improved answer' }, emit_proposals: { proposals: [{ change: 1, why: 'it is skimmed while drafting' }] } } });
    const out = run(data, proj, 'fix', 'the answer buried the recommendation', '--reflect');
    expect(out).toContain('Reflection chose');
    expect(store.readEvents(L).some((e) => e.kind === 'REPAIR_PROPOSED' && (e as { proposer?: string }).proposer === 'REFLECTIVE')).toBe(true);
  }, 300_000);

  it('without --promote nothing is installed, and a candidate nothing beats is screened out', async () => {
    const { data, proj } = await seed(5);
    const L = { root: data, skillName: 'focus' };
    await post({ byTool: { emit_piece: { piece: 'the synergy answer' }, emit_proposals: { proposals: [] } } });
    run(data, proj, 'floor', '--skill', 'focus', '--baseline');
    const before = store.getActive(L);
    const out = run(data, proj, 'optimize', '--skill', 'focus');
    expect(out).toContain('Nothing beat the current version');
    expect(store.getActive(L)).toBe(before);
  }, 300_000);
});
