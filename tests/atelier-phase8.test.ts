// tests/atelier-phase8.test.ts — THE OPTIMIZER, HOSTED WHERE IT CANNOT MOVE THE TARGET.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { genomeOf, mutationsOf, mutationKey, type Mutation } from '../core/optimizer/genome.js';
import { dominates, paretoFront, finalists } from '../core/optimizer/pareto.js';
import { reflectPrompt, parseReflection, MAX_FAILURES_SHOWN, MAX_ATTEMPTS_SHOWN, MAX_PROPOSALS } from '../core/optimizer/reflect.js';
import { wilsonLower, readerPermission, vetoedRules, VETO_AGREEMENT } from '../core/optimizer/veto.js';
import { MIN_COMPARABLE, type Agreement } from '../core/fidelity/judgement.js';
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

describe('the reader may block, never clear, and only once it has earned it', () => {
  const agreementOf = (agreed: number, disagreed: number): Agreement => ({ comparable: agreed + disagreed, agreed, disagreed,
    observerDeclined: 0, orderDependent: 0, humanOnly: 0, observerOnly: 0, withRationale: 0, humanRulings: agreed + disagreed });
  it('Wilson lower bound behaves', () => {
    expect(wilsonLower(0, 0)).toBe(0);
    expect(wilsonLower(30, 30)).toBeGreaterThan(0.88);
    expect(wilsonLower(15, 30)).toBeLessThan(0.5);
  });
  it('too few comparisons, or too little agreement: OBSERVE. Enough of both: VETO. Never CERTIFY.', () => {
    expect(readerPermission(agreementOf(MIN_COMPARABLE - 1, 0)).permission).toBe('OBSERVE');
    expect(readerPermission(agreementOf(20, 20)).permission).toBe('OBSERVE');
    const strong = readerPermission(agreementOf(58, 2));
    expect(strong.permission).toBe('VETO');
    expect(wilsonLower(58, 60)).toBeGreaterThanOrEqual(VETO_AGREEMENT);
  });
  it('blocks only on order-invariant readings, at least two, worse more often than better', () => {
    const r = (requirementId: string, result: 'CHAMPION_COMPLIES_BETTER' | 'CANDIDATE_COMPLIES_BETTER' | 'EQUAL', orderInvariant = true) => ({ requirementId, result, orderInvariant });
    expect(vetoedRules([r('a', 'CHAMPION_COMPLIES_BETTER'), r('a', 'CHAMPION_COMPLIES_BETTER'), r('a', 'CANDIDATE_COMPLIES_BETTER')])).toEqual(['a']);
    expect(vetoedRules([r('a', 'CHAMPION_COMPLIES_BETTER')])).toEqual([]);
    expect(vetoedRules([r('a', 'CHAMPION_COMPLIES_BETTER', false), r('a', 'CHAMPION_COMPLIES_BETTER', false)])).toEqual([]);
    expect(vetoedRules([r('a', 'CHAMPION_COMPLIES_BETTER'), r('a', 'CHAMPION_COMPLIES_BETTER'), r('a', 'CANDIDATE_COMPLIES_BETTER'), r('a', 'CANDIDATE_COMPLIES_BETTER')])).toEqual([]);
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
    const { data, proj } = await seed(60);
    const L = { root: data, skillName: 'focus' };
    await post({ byTool: { emit_piece: { piece: 'the synergy answer' }, emit_proposals: { proposals: [{ change: 1, why: 'the failures show the rule is skimmed while drafting' }] } } });
    run(data, proj, 'floor', '--skill', 'focus', '--baseline');
    expect(run(data, proj, 'floor', '--skill', 'focus', '--qualify')).toContain('EARNED');
    const std = store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash;
    const before = store.getActive(L);
    // Any version whose SKILL.md checks the draft before finalizing writes the plain answer.
    await post({ byTool: { emit_piece: { piece: 'the synergy answer' }, emit_proposals: { proposals: [{ change: 1, why: 'the failures show the rule is skimmed while drafting' }] } },
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

  it('without --promote nothing is installed, and a candidate nothing beats is screened out', async () => {
    const { data, proj } = await seed(3);
    const L = { root: data, skillName: 'focus' };
    await post({ byTool: { emit_piece: { piece: 'the synergy answer' }, emit_proposals: { proposals: [] } } });
    run(data, proj, 'floor', '--skill', 'focus', '--baseline');
    const before = store.getActive(L);
    const out = run(data, proj, 'optimize', '--skill', 'focus');
    expect(out).toContain('Nothing beat the current version');
    expect(store.getActive(L)).toBe(before);
  }, 300_000);
});
