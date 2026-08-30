// tests/atelier-fix-loop.test.ts — CREATE → USE → CORRECT, CLOSED, AGAINST THE REAL BINARY.
//
// `fix` is the product's third verb: a complaint goes in; either the implementation improves under a
// byte-identical StandardVersion, or the person is asked the one question that is theirs. These
// tests run the whole loop with a scripted backend playing both the diagnoser and the generator,
// plus unit tests on the lateral policy, the runtime-scoped memory (Amendment A2), and the hard
// standard-hash invariant (Constraint B).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { proposeReplacement, eligibleCarriers, assertStandardUnchanged } from '../core/architecture/replace-carrier.js';
import { mayPropose, WEAKEST_EVALUATION, WEAKEST_EVIDENCE, type RepairRecord, type Prohibition } from '../core/architecture/repair-memory.js';
import type { ServedMissEvidence } from '../core/architecture/escalate.js';
import type { SkillArchitecture } from '../core/architecture/compile.js';
import { aRequirement } from './fixtures.js';

const CLI = resolve('dist/cli/atelier.mjs');

beforeAll(() => {
  if (!existsSync(CLI)) execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
}, 120_000);

// ── scripted backend, out of process (see scripted-backend.mjs for why) ───────────────────────
let backend: ChildProcess; let port = 0;
const setByTool = async (byTool: Record<string, unknown>): Promise<void> => {
  await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool }) });
};
const requestCount = async (): Promise<number> =>
  ((await (await fetch(`http://127.0.0.1:${port}/__count`)).json()) as { count: number }).count;

beforeAll(async () => {
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited')); });
  });
});
afterAll(() => { backend.kill(); });

const run = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args,
      '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
      encoding: 'utf8', cwd: proj,
      env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj },
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};

const COVERED = { coverage: 'COVERED', requirementIds: ['x1'], proposedRequirement: null, question: null, reasoning: 'x1 covers it' };
const ABSENT = (proposal: string) =>
  ({ coverage: 'ABSENT', requirementIds: [], proposedRequirement: proposal, question: null, reasoning: 'nothing covers it' });

/** A built direct skill plus one real CLI invocation, so last-invocation.json exists. */
const seeded = async (): Promise<{ data: string; proj: string }> => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-fix-data-'));
  const proj = mkdtempSync(join(tmpdir(), 'atelier-fix-proj-'));
  run(data, proj, 'add', '--statement', 'Lead with the action.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL');
  run(data, proj, 'ratify-close', '--work-type', 'writing');
  run(data, proj, 'build', '--name', 'focus');
  await setByTool({ emit_piece: { piece: 'the original answer' } });
  const out = run(data, proj, 'invoke', '--skill', 'focus', '--task', 'write the recommendation');
  expect(out, 'seeding invoke failed').not.toMatch(/^EXIT:/);
  return { data, proj };
};

describe('IMPLEMENTATION_MISS: candidate → rerun → blinded pick → winner active AND installed', () => {
  it('the full two-phase loop, with the standard hash immovable', async () => {
    const { data, proj } = await seeded();
    const L: store.StoreLayout = { root: data, skillName: 'focus' };
    const s1 = store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!;

    await setByTool({ emit_coverage: COVERED, emit_piece: { piece: 'the improved answer' } });
    const first = run(data, proj, 'fix', 'the answer buried the recommendation');
    expect(first).toContain('About your last run of /focus');
    expect(first).toContain('IMPLEMENTATION_MISS');
    expect(first).toContain('──── A ────');
    expect(first).toContain('the original answer');
    expect(first).toContain('the improved answer');
    expect(first).toContain('--pick a|b|same');

    // which letter holds the candidate is sealed but readable off the printed pair
    const aFirst = first.indexOf('the improved answer') < first.indexOf('the original answer');
    const candidateLetter = aFirst ? 'a' : 'b';

    // phase two resumes the pending candidate: no new generation, only the re-diagnosis
    const before = await requestCount();
    const second = run(data, proj, 'fix', 'the answer buried the recommendation', '--pick', candidateLetter);
    expect(await requestCount(), 'the resume re-generated instead of resuming').toBe(before + 1);
    expect(second).toContain('Kept.');
    expect(second).toContain('unchanged, which is the point');

    const active = store.getActive(L)!;
    const sv = store.getSkillVersion(L, active)!;
    expect(sv.standardVersionHash, 'the repair moved the standard').toBe(s1.standardVersionHash);
    const pkg = store.getPackage(L, sv.materializedHash)!;
    for (const [rel, content] of Object.entries(pkg.files)) {
      expect(readFileSync(join(proj, '.claude', 'skills', 'focus', rel), 'utf8'), 'host serves stale bytes').toBe(content);
    }
    // the pick landed as the first BEHAVIOR observation and a judgement row
    expect(store.listObservations(L).some((o) => o.domain === 'BEHAVIOR' && o.producer === 'expert-blind-ab')).toBe(true);
    expect(store.readEvents(L).some((e) => e.kind === 'JUDGEMENT_RECORDED' && e.choice === 'CANDIDATE')).toBe(true);
    expect(store.readEvents(L).some((e) => e.kind === 'REPAIR_SETTLED' && e.outcome === 'PROMOTED')).toBe(true);
  }, 120_000);

  it('picking the champion records the rejection and keeps everything as it was', async () => {
    const { data, proj } = await seeded();
    const L: store.StoreLayout = { root: data, skillName: 'focus' };
    const activeBefore = store.getActive(L)!;
    await setByTool({ emit_coverage: COVERED, emit_piece: { piece: 'the improved answer' } });
    const first = run(data, proj, 'fix', 'too abstract');
    const champLetter = first.indexOf('the original answer') < first.indexOf('the improved answer') ? 'a' : 'b';
    const second = run(data, proj, 'fix', 'too abstract', '--pick', champLetter);
    expect(second).toContain('The current version stays');
    expect(store.getActive(L)).toBe(activeBefore);
    expect(store.readEvents(L).some((e) => e.kind === 'REPAIR_SETTLED' && e.outcome === 'REJECTED')).toBe(true);
  }, 120_000);
});

describe('STANDARD_GAP: one approval mints, compiles and installs — or one refusal is remembered', () => {
  it('--add required supersedes with the complaint as the reason, and the rule instructs', async () => {
    const { data, proj } = await seeded();
    const L: store.StoreLayout = { root: data, skillName: 'focus' };
    const s1hash = store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash;
    await setByTool({ emit_coverage: ABSENT('Lead with the recommendation before the framework.') });
    const out = run(data, proj, 'fix', 'I always want the recommendation first', '--add', 'required');
    expect(out).toContain('Added as REQUIRED');
    expect(out).toContain('supersedes');

    const sv = store.getSkillVersion(L, store.getActive(L)!)!;
    const s2 = store.getStandard(L, sv.standardVersionHash)!;
    expect(s2.supersedes).toBe(s1hash);
    expect(s2.reason).toBe('I always want the recommendation first');
    const md = readFileSync(join(proj, '.claude', 'skills', 'focus', 'SKILL.md'), 'utf8');
    const doStart = md.indexOf('## What to do');
    expect(md.slice(doStart, md.indexOf('\n## ', doStart + 1))).toContain('Lead with the recommendation before the framework.');
    // the approval is a ledger record, and it is a RATIFICATION of a machine proposal — not authorship
    expect(s2.requirements.find((r) => r.statement.includes('before the framework'))?.authority).toBe('EXPERT_RATIFIED');
    expect(store.readEvents(L).some((e) => e.kind === 'PROPOSED_CHANGE' && e.accepted === true)).toBe(true);
    expect(store.readEvents(L).some((e) => e.kind === 'LEDGER_DECISION')).toBe(true);
  }, 120_000);

  it('--skip records the refusal, mints nothing, and is not re-asked on the same proposal', async () => {
    const { data, proj } = await seeded();
    await setByTool({ emit_coverage: ABSENT('Always name the deadline.') });
    const out = run(data, proj, 'fix', 'no deadline mentioned', '--skip');
    expect(out).toContain('Not added');
    expect(readdirSync(join(data, 'skills', 'focus', 'standards'))).toHaveLength(1);
    const again = run(data, proj, 'fix', 'no deadline mentioned');
    expect(again).toContain('declined exactly this addition before');
  }, 120_000);
});

describe('the lateral policy (unit)', () => {
  const arch = (carrier: 'PROSE' | 'SELF_CHECK'): SkillArchitecture => ({
    architectureHash: 'a1', standardVersionHash: 'sv1',
    components: [{ id: 'c1', carrier, sensor: 'NONE', gateRole: 'ENFORCE', carries: ['x1'], rationale: 'r' } as never],
  });
  const ev: ServedMissEvidence = { invocationId: 'i1', requirementId: 'x1', carrierAtServe: 'PROSE', expertConfirmed: true, at: 't' };
  const rule = (o: Partial<Parameters<typeof aRequirement>[0]> = {}) => aRequirement({ requirementId: 'x1', ...o });

  it('eligibility comes from typed properties, never materiality', () => {
    expect(eligibleCarriers(rule({ evidence: null, outputShape: null }))).toEqual(['SELF_CHECK', 'PROSE']);
    expect(eligibleCarriers(rule({ evidence: 'a quote', outputShape: null }))).toContain('EXAMPLE');
    expect(eligibleCarriers(rule({ outputShape: { v: {} }, evidence: null }))).toContain('OUTPUT_CONTRACT');
  });

  it('the first untried legal alternative under the fixed ordering is the candidate', () => {
    const op = proposeReplacement(ev, arch('PROSE'), rule({ evidence: 'q' }), new Set());
    expect('refused' in op ? null : op.to).toBe('SELF_CHECK');
    const op2 = proposeReplacement(ev, arch('PROSE'), rule({ evidence: 'q' }), new Set(['SELF_CHECK']));
    expect('refused' in op2 ? null : op2.to).toBe('EXAMPLE');
  });

  it('exhausted alternatives refuse toward the standard question, not toward a ladder', () => {
    const op = proposeReplacement(ev, arch('PROSE'), rule({ evidence: null, outputShape: null }), new Set(['SELF_CHECK']));
    expect('refused' in op && op.reason).toContain('atelier amend');
  });
});

describe('Amendment A2: rejection memory is (standard, model)-scoped (unit)', () => {
  const rec = (o: Partial<RepairRecord>): RepairRecord => ({
    repairId: 'r1', skillName: 's', requirementId: 'x1', from: 'PROSE', to: 'SELF_CHECK',
    sourceSkillVersionHash: 'k1', candidateSkillVersionHash: 'k2',
    evidenceBasis: WEAKEST_EVIDENCE, evaluationBasis: WEAKEST_EVALUATION,
    outcome: 'REJECTED', outcomeAt: 't', note: null, at: 't', ...o });
  const proposal = { evidence: WEAKEST_EVIDENCE, evaluation: WEAKEST_EVALUATION };
  const scopeA = { standardVersionHash: 'S1', providerAdapter: 'anthropic', requestedModel: 'claude-opus-5' };

  it('a rejection under model X does not suppress the same move under model Y', () => {
    const history = [rec({ standardVersionHash: 'S1', providerAdapter: 'anthropic', requestedModel: 'claude-opus-5' })];
    expect(mayPropose(history, [], 'x1', 'PROSE', 'SELF_CHECK', proposal, scopeA).allowed).toBe(false);
    expect(mayPropose(history, [], 'x1', 'PROSE', 'SELF_CHECK', proposal,
      { ...scopeA, requestedModel: 'gpt-x' }).allowed).toBe(true);
  });

  it('a superseding StandardVersion inherits no rejections', () => {
    const history = [rec({ standardVersionHash: 'S1', providerAdapter: 'anthropic', requestedModel: 'claude-opus-5' })];
    expect(mayPropose(history, [], 'x1', 'PROSE', 'SELF_CHECK', proposal,
      { ...scopeA, standardVersionHash: 'S2' }).allowed).toBe(true);
  });

  it('a record from before A2 suppresses conservatively, whatever the scope asked about', () => {
    const legacy = [rec({})];
    expect(mayPropose(legacy, [], 'x1', 'PROSE', 'SELF_CHECK', proposal, scopeA).allowed).toBe(false);
    expect(mayPropose(legacy, [], 'x1', 'PROSE', 'SELF_CHECK', proposal,
      { ...scopeA, requestedModel: 'gpt-x' }).allowed).toBe(false);
  });

  it('a human TRANSITION_FORBIDDEN holds across runtimes but not across standard versions', () => {
    const ban: Prohibition[] = [{ requirementId: 'x1', from: 'PROSE', to: 'SELF_CHECK', by: 'expert', reason: 'no', at: 't', standardVersionHash: 'S1' }];
    expect(mayPropose([], ban, 'x1', 'PROSE', 'SELF_CHECK', proposal, { ...scopeA, requestedModel: 'gpt-x' }).allowed).toBe(false);
    expect(mayPropose([], ban, 'x1', 'PROSE', 'SELF_CHECK', proposal, { ...scopeA, standardVersionHash: 'S2' }).allowed).toBe(true);
  });
});

describe('Constraint B: the standard hash is a throwing assertion (unit)', () => {
  const std = (hash: string) => ({ standardVersionHash: hash, evidenceId: null, workType: 'writing',
    requirements: [], authorityState: 'RATIFIED', mintedAt: 't', supersedes: null, reason: null }) as never;
  it('identical hashes pass; a moved standard dies', () => {
    expect(() => { assertStandardUnchanged(std('aaaa'), std('aaaa')); }).not.toThrow();
    expect(() => { assertStandardUnchanged(std('aaaa'), std('bbbb')); }).toThrow(/STANDARD MUTATED/);
  });
});
