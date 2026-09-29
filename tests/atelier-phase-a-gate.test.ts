// tests/atelier-phase-a-gate.test.ts — WHAT AN AUTOMATIC PROMOTION MAY NOT HIDE.
//
// Two gaps in the gate, pinned through the binary. A REQUIRED rule the owner took off the floor's
// composite (`--observe`) could regress under an automatic promotion, because the regression flag was
// hard-wired false. And an automatic promotion said "every instrument holding its authority" while most
// of the standard was read by no instrument at all. Both are now said, or refused, where it installs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { keysOf } from '../core/state/rule-key.js';
import { unchosenDrafts } from '../cli/commands/improve.js';
import { spend, metered, processSpentUsd } from '../core/inference/client.js';

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

const seed = async (dropFromContract: string | null = null): Promise<{ data: string; proj: string }> => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-pa-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-pa-proj-'));
  run(data, proj, 'add', '--statement', 'Never say synergy.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:synergy');
  run(data, proj, 'add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage');
  run(data, proj, 'add', '--statement', 'Never say paradigm.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:paradigm');
  // A judgement rule: ratified, REQUIRED, and read by no instrument.
  run(data, proj, 'add', '--statement', 'Open on the concrete failure, not the thesis.', '--kind', 'GENERATIVE', '--materiality', 'REQUIRED');
  run(data, proj, 'ratify-close', '--work-type', 'writing');
  run(data, proj, 'build', '--name', 'focus');
  const corpus = join(proj, 'mine'); mkdirSync(corpus);
  for (const i of [1, 2, 3]) writeFileSync(join(corpus, `p${i}.md`), `Piece ${i}.`);
  const file = join(proj, 'tasks.txt');
  writeFileSync(file, Array.from({ length: 10 }, (_, i) => `Task ${i + 1}.`).join('\n\n'));
  // synergy and leverage block; paradigm is REQUIRED but only observed.
  run(data, proj, 'floor', '--skill', 'focus', '--corpus', corpus, '--tasks', file, '--enforce', '1', '--enforce', '2');
  if (dropFromContract) {
    // A REQUIRED counted rule with no margin: in the standard, measured, and not a floor dimension.
    // Dimensions are keyed by rule key (core/state/rule-key.ts); the rule is found by its statement.
    const L = { root: data, skillName: 'focus' }; const f = store.getFloor(L);
    const v = store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!;
    const key = keysOf(v.requirements)[v.requirements.findIndex((r) => r.statement.includes(dropFromContract))];
    expect(key in f.contract!.dimensions, 'the rule to drop was a floor dimension').toBe(true);
    const dims = Object.fromEntries(Object.entries(f.contract!.dimensions).filter(([k]) => k !== key));
    store.setFloor(L, { ...f, contract: { ...f.contract!, dimensions: dims } });
  }
  await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'skimmed' }] } } });
  run(data, proj, 'floor', '--skill', 'focus', '--baseline');
  for (let i = 0; i < 6; i++) run(data, proj, 'floor', '--skill', 'focus', '--qualify');
  return { data, proj };
};

describe('through the binary: the gate says what nothing read, and a REQUIRED rule may not regress', () => {
  it('an automatic promotion names the ratified rules no instrument read', async () => {
    const { data, proj } = await seed();
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'skimmed' }] } },
      when: [{ contains: 'Before you finalize', answer: { piece: 'the plain answer' } }] });
    const out = run(data, proj, 'optimize', '--skill', 'focus', '--promote', '--cap', '50');
    expect(out).toContain('gate AUTO_PROMOTE');
    expect(out).toMatch(/Not read by any instrument: 1 ratified rule\(s\) \(x4\)/);
  }, 300_000);

  it('a REQUIRED rule marked OBSERVE that regresses is a deterministic regression: rejected, not installed', async () => {
    const { data, proj } = await seed();
    const L = { root: data, skillName: 'focus' };
    const before = store.getActive(L);
    // The candidate fixes the target (no synergy) by breaking the observed REQUIRED rule.
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'skimmed' }] } },
      when: [{ contains: 'Before you finalize', answer: { piece: 'the paradigm answer, paradigm upon paradigm' } }] });
    const out = run(data, proj, 'optimize', '--skill', 'focus', '--promote', '--cap', '50');
    expect(out).not.toContain('gate AUTO_PROMOTE');
    expect(out).toMatch(/gate AUTO_REJECT\. a previously-passing deterministic invariant now fails.*REQUIRED rule\(s\) .* regressed/);
    expect(store.getActive(L)).toBe(before);
  }, 300_000);
});

describe('through the binary: a REQUIRED rule with no floor margin is still guarded (D3) and named (D2)', () => {
  it('breaking it on the candidate is a deterministic regression, by the direct pass/fail check', async () => {
    const { data, proj } = await seed('paradigm');
    const L = { root: data, skillName: 'focus' };
    const before = store.getActive(L);
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'skimmed' }] } },
      when: [{ contains: 'Before you finalize', answer: { piece: 'the paradigm answer, paradigm upon paradigm' } }] });
    const out = run(data, proj, 'optimize', '--skill', 'focus', '--promote', '--cap', '50');
    expect(out).not.toContain('gate AUTO_PROMOTE');
    expect(out).toMatch(/gate AUTO_REJECT\. a previously-passing deterministic invariant now fails.*REQUIRED rule\(s\) R-\w+ regressed/);
    expect(store.getActive(L)).toBe(before);
  }, 300_000);

  it('POLARITY — left intact, it promotes, and the promotion names it as measured but not guarded by a margin', async () => {
    const { data, proj } = await seed('paradigm');
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'skimmed' }] } },
      when: [{ contains: 'Before you finalize', answer: { piece: 'the plain answer' } }] });
    const out = run(data, proj, 'optimize', '--skill', 'focus', '--promote', '--cap', '50');
    expect(out).toContain('gate AUTO_PROMOTE');
    expect(out).toMatch(/Measured but not guarded by the floor: x3 \(no margin; pass\/fail checked\)/);
  }, 300_000);
});

describe('through the binary: a /skill use in Claude Code does not lock the CLI out', () => {
  it('a claude-code binding recorded first does not make invoke refuse on another surface', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-pa-bind-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-pa-bindp-'));
    run(data, proj, 'add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'house');
    const L = { root: data, skillName: 'house' };
    // What the Stop hook records after a /house use in Claude Code.
    store.recordBinding(L, store.getActive(L) ?? '', { providerAdapter: 'claude-code', backend: 'claude-code', requestedModel: 'host',
      structuredOutput: 'NATIVE_TOOL_USE', parameters: {}, runtimeProfile: null } as never);
    await post({ byTool: { emit_piece: { piece: 'A plain note.' } } });
    const out = run(data, proj, 'invoke', '--skill', 'house', 'write a note');
    expect(out).not.toMatch(/TARGET_BINDING_MISMATCH|EXIT:1/);
    expect(out).toContain('A plain note.');
    // not refused, and not silent: the switch of surface is named
    expect(out).toContain('first run on openai-compatible (scripted); earlier evidence was on claude-code (host)');
    // POLARITY: the second run on this surface has its own baseline, and says nothing
    expect(run(data, proj, 'invoke', '--skill', 'house', 'write a note')).not.toContain('first run on');
  }, 120_000);

  it('--accept-new-binding is remembered: the accepted configuration is not refused on the next run, a new one still is', async () => {
    const { data, proj, L } = built();
    await post({ byTool: { emit_piece: { piece: 'A plain note.' } } });
    expect(runWith(data, proj, ['invoke', '--skill', 'house', '--claims', 'pattern', 'write a note'])).not.toMatch(/^EXIT/);
    expect(runWith(data, proj, ['invoke', '--skill', 'house', '--claims', 'pattern', '--temperature', '0.5', 'write a note'])).toMatch(/TARGET_BINDING_MISMATCH/);
    expect(runWith(data, proj, ['invoke', '--skill', 'house', '--claims', 'pattern', '--temperature', '0.5', '--accept-new-binding', 'write a note'])).not.toMatch(/^EXIT/);
    expect(runWith(data, proj, ['invoke', '--skill', 'house', '--claims', 'pattern', '--temperature', '0.5', 'write a note'])).not.toMatch(/^EXIT/);
    expect(store.readEvents(L).filter((e) => e.kind === 'BINDING_ACCEPTED')).toHaveLength(1);
    expect(runWith(data, proj, ['invoke', '--skill', 'house', '--claims', 'pattern', '--temperature', '0.9', 'write a note'])).toMatch(/TARGET_BINDING_MISMATCH/);
  }, 120_000);
});

// ── invoke: what it delivers when a call fails, and what it records ──────────────────────────────
// Through the binary, because every defect here was invisible to a unit test: a draft call failing
// inside `runOnce`, a record missing what a study arm needs to be reproduced, a note only the CLI prints.
const runWith = (data: string, proj: string, args: readonly string[], env: Record<string, string> = {}): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'],
      { encoding: 'utf8', cwd: proj, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ...env } });
  } catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${x.status}\n${x.stderr ?? ''}${x.stdout ?? ''}`; }
};

const built = (): { data: string; proj: string; L: store.StoreLayout } => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-inv-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-inv-proj-'));
  runWith(data, proj, ['add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage']);
  runWith(data, proj, ['ratify-close', '--work-type', 'writing']);
  runWith(data, proj, ['build', '--name', 'house']);
  return { data, proj, L: { root: data, skillName: 'house' } };
};

describe('a failed draft call costs that draft, not the run', () => {
  it('one of three draft calls fails: the other two are kept, one is delivered, the failure is recorded', async () => {
    const { data, proj, L } = built();
    await post({ byTool: { emit_piece: { piece: 'A plain note.' } }, failNext: 1 });
    const out = runWith(data, proj, ['invoke', '--skill', 'house', '--drafts', '3', '--claims', 'pattern', 'write a note']);
    expect(out).not.toMatch(/^EXIT/);
    expect(out).toContain('A plain note.');
    const rec = store.listInvocations(L)[0];
    expect(rec.selection).toMatchObject({ drafts: 3, written: 2 });
    expect(rec.selection?.failed).toHaveLength(1);
    expect(rec.selection?.failed?.[0]).toMatch(/HTTP 500/);
  }, 120_000);

  it('POLARITY — when every draft call fails there is nothing to deliver, and nothing is recorded', async () => {
    const { data, proj, L } = built();
    await post({ byTool: { emit_piece: { piece: 'A plain note.' } }, failNext: 3 });
    const out = runWith(data, proj, ['invoke', '--skill', 'house', '--drafts', '3', '--claims', 'pattern', 'write a note']);
    expect(out).toMatch(/^EXIT:1[\s\S]*HTTP 500/);
    expect(store.listInvocations(L)).toHaveLength(0);
  }, 120_000);
});

describe('the record can reproduce a study arm', () => {
  it('records the claim instrument, taste VETO keys, tells hash, format, version, tokens, temperature, flags, STUDY provenance and the unchosen drafts', async () => {
    const { data, proj, L } = built();
    await post({ byTool: { emit_piece: { piece: 'A plain note.' }, emit_specifics: { specifics: [] } } });
    const out = runWith(data, proj, ['invoke', '--skill', 'house', '--drafts', '2', '--placeholders', '--no-taste', '--temperature', '0.3', '--max-tokens', '5000',
      '--claims-model', 'scripted', 'write a note'], { ATELIER_PROVENANCE: 'STUDY', ATELIER_CLAIMS: 'model' });
    expect(out).not.toMatch(/^EXIT/);
    const rec = store.listInvocations(L)[0];
    expect(rec.provenance).toBe('STUDY');
    expect(rec.settings).toMatchObject({ claimInstrument: expect.stringMatching(/claim reader \(scripted/) as unknown, tasteVeto: [],
      learnedTellsHash: expect.stringMatching(/^[0-9a-f]{16}$/) as unknown, formatProfile: null, maxTokens: 5000, temperature: 0.3,
      flags: { drafts: 2, noTaste: true, allowUnsourced: false, placeholders: true } });
    expect(rec.settings?.atelierVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(rec.selection?.unchosen).toEqual(['A plain note.']);
    // THE CLAIM READER'S SPENDING IS IN THE COST INVOKE PRINTS. It meters its own budget; a local backend
    // bills nothing, so the tally the printed figure reads is pinned directly: every metered call counts,
    // whichever budget it was metered on.
    const before = processSpentUsd();
    const call = async (): Promise<{ value: number; cost: ReturnType<typeof metered> }> => ({ value: 1, cost: metered(0.25) });
    await spend({ spentUsd: 0, capUsd: 1 }, 0.01, call); await spend({ spentUsd: 0, capUsd: 1 }, 0.01, call);
    expect(processSpentUsd() - before).toBeCloseTo(0.5);
    expect(out).toMatch(/SkillVersion \w+ {2}· {2}\$\d+\.\d{4}/);
    // the cap on unchosen text is across all drafts, and says when it cut
    expect(unchosenDrafts(['a'.repeat(10), 'kept', 'b'.repeat(10)], 1, 15)).toEqual({ texts: ['a'.repeat(10), 'b'.repeat(5)], truncated: true });
    // POLARITY: a mislabel is refused, not recorded
    expect(runWith(data, proj, ['invoke', '--skill', 'house', '--claims', 'pattern', '--temperature', '0.3', '--provenance', 'STUDDY', 'write a note'])).toMatch(/^EXIT:1[\s\S]*not one of/);
  }, 120_000);
});
