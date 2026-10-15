// tests/atelier-one-ledger.test.ts — ONE ACCEPTANCE RULE, ONE LEDGER, ONE HAND-OFF CONTRACT.
//
// Two loops each kept part of the step bookkeeping and part of the acceptance logic: the controller inside the repair
// loop, and the drafts written again around it. Each defect here was one loop forgetting what the other did:
//   A  a replacement kept while an enforced rule got worse by its value (a hedge rate 9.0 → 10.0 per 1,000 words in the
//      same three places; a draft written again for a length and a habit that doubled the semicolons of a ban);
//   B  a run that took five and six steps under a limit of four, because the piece refined again after a redraft that
//      was not kept was given a history without the steps taken on that redraft;
//   C  a draft handed over for an enforced rule that no sentence carries sent with an empty list of targets, and its
//      outcome line naming three other misses.
// And two wordings: under --until-typical each line names its round; a fix without a model lists only the rules it changed.
//
// Every case failed on the code before the fix. Expected values come from the scenario's own texts (each rule measured on
// them here, in process) and the documented contract (four steps a run or round, docs/MEASURED-RULES.md), never from
// the code under test.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { acceptRepair, regressions } from '../core/loop/repair.js';
import { controllerRecord, stepLedger } from '../core/loop/controller.js';
import { verifyText, type RuleCheck, type VerifyReport } from '../core/observers/verify.js';
import { withRedraft, unmetReader, redraftNote, type Unmet } from '../cli/commands/invoke.js';
import type { ControllerDecisionRecord, ControllerRecord, Requirement, StandardVersion } from '../core/state/canonical-state.js';
import { expectLedger, stepsOn, MAX_STEPS } from './one-counter.js';

const reportOf = (checked: RuleCheck[] = [], failed = false): VerifyReport => ({ skill: 's', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed });
const spans = (n: number) => Array.from({ length: n }, (_, i) => ({ start: i * 10, end: i * 10 + 5, text: 'x', why: '' }));
/** An enforced rate check, as the observers report one: its value per 1,000 words, the excess as its places. */
const rate = (id: string, observer: string, value: number, places: number, detail: string, verdict: 'MET' | 'VIOLATED' = 'VIOLATED'): RuleCheck =>
  ({ requirementId: id, statement: id, materiality: 'REQUIRED', enforced: true, observer, result: { verdict, value, detail, spans: verdict === 'VIOLATED' ? spans(places) : [] } });
const step = (action: ControllerDecisionRecord['action'], outcome: ControllerDecisionRecord['outcome'], targets: string[], calls = 1): ControllerDecisionRecord =>
  ({ action, targets, why: 'w', expectedGain: 1, expectedCostUsd: 0.05, outcome, observed: { movement: outcome === 'kept' ? 1 : 0, calls, usd: 0 } });

describe('A. one acceptance rule: an enforced rule is read by its value, never by its count of places', () => {
  it('a hedge rate 9.0 → 10.0 per 1,000 words in the same three places is worse (the run where it was kept)', () => {
    const before = reportOf([rate('m3', 'HEDGE_RATE', 9, 3, '9 per thousand words (target ≤ 2)')]);
    const after = reportOf([rate('m3', 'HEDGE_RATE', 10, 3, '10 per thousand words (target ≤ 2)')]);
    expect(regressions(before, after)).toEqual(['m3']);
    expect(acceptRepair(before, after).ok).toBe(false);
    // nearer by value is not worse, in as many places
    expect(regressions(after, before)).toEqual([]);
  });
  it('a floor rate is worse when it falls, though it has no place to count', () => {
    const at = (v: number): VerifyReport => reportOf([rate('c4', 'PATTERN_RATE', v, 0, `${v} per 1,000 words (at least 22.5)`)]);
    expect(regressions(at(17.4), at(15))).toEqual(['c4']);
    expect(regressions(at(17.4), at(20))).toEqual([]);
  });
  it('a ban whose rate doubled is worse, whatever its places did', () => {
    const at = (v: number, n: number): VerifyReport => reportOf([rate('c1', 'PATTERN_RATE', v, n, `${v} per 1,000 words (at most 0)`)]);
    expect(regressions(at(3, 1), at(7.6, 1))).toEqual(['c1']);
  });
  it('a step made for an enforced rule must move that rule: a rewrite for m3 that only held c1 is not kept', () => {
    const before = reportOf([rate('m3', 'HEDGE_RATE', 9, 3, '9'), rate('c1', 'PATTERN_RATE', 3, 1, '3 per 1,000 words (at most 0)')]);
    const after = reportOf([rate('m3', 'HEDGE_RATE', 9, 3, '9'), rate('c1', 'PATTERN_RATE', 0, 0, '0 per 1,000 words', 'MET')]);
    expect(acceptRepair(before, after, { targets: ['m3'] })).toMatchObject({ ok: false });
    expect(acceptRepair(before, after, { targets: ['c1'] })).toMatchObject({ ok: true });
  });
  it('a draft written again for a length and a habit (no hand-off) that makes a ban worse is not kept, and says which rule', async () => {
    const length: Unmet = { id: 'length', statement: 'Write it at the length the request asks for: under 280 words', detail: '336 words, 56 too many', off: 56, whole: true, of: 'request' };
    const habit: Unmet = { id: 'c10', statement: 'Keep parenthetical asides at zero.', detail: 'asides 8.9 per 1,000 words', off: 8.9, graded: true };
    const ban = (v: number): RuleCheck => ({ ...rate('c1', 'PATTERN_RATE', v, v ? 1 : 0, `${v} per 1,000 words (at most 0)`), statement: 'Never use semicolons.' });
    const first = 'first'; const second = 'second';
    const notes: string[] = [];
    const d = await withRedraft(async (t) => ({ output: t, report: reportOf([ban(t === first ? 3 : 7.6)], true), repair: null }),
      { notes, unmet: (x) => (x.output === first ? [length, habit] : []), redraft: async () => second })(first);
    expect(d.output).toBe(first);
    const redraft = d.repair?.controller?.decisions.find((x) => x.action === 'redraft');
    expect(redraft?.outcome).toBe('not kept');
    expect(redraft?.observed.note).toMatch(/further from holding \(c1: "Never use semicolons\."\)/);
  });
});

describe('B. one ledger a run: the piece refined again after a redraft not kept continues it', () => {
  it('the resumed refinement reads the steps taken on the redraft that was not kept, and the run stays within four', async () => {
    const handed = (output: string) => ({ output, report: reportOf(), repair: { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', why: 'w',
      controller: controllerRecord([step('rewrite', 'not kept', ['x1']), step('redraft', 'handed to a redraft', ['c10'], 0)], 'handed to a redraft', true) } });
    const far = (off: number): Unmet => ({ id: 'c10', statement: 'Few asides.', detail: `asides ${off}`, off, graded: true });
    const seen: string[][] = [];
    const d = await withRedraft(async (t) => handed(t), {
      notes: [], redraft: async () => 'second', unmet: (x) => [far(x.output === 'second' ? 9 : 3)],
      // the refinement of the redraft takes one carrier rewrite; the refinement of the first draft again records what it read
      resume: async (t, ledger) => {
        seen.push(ledger.entries.map((x) => `${x.action}|${x.outcome}`));
        if (t === 'second') { const at = ledger.begin({ action: 'carrier-rewrite', targets: ['c10'], why: 'w', expectedGain: 1, expectedCostUsd: 0.05 }); ledger.settle(at, 'not kept', { movement: 0, calls: 1, usd: 0 }); }
        return { output: t, report: reportOf(), repair: null };
      } })('first');
    expect(seen).toHaveLength(2);
    // the second refinement (of the first draft) is handed the same ledger: the carrier rewrite taken on the redraft is on it
    expect(seen[1]).toEqual(['rewrite|not kept', 'redraft|handed to a redraft', 'redraft|not kept', 'carrier-rewrite|not kept']);
    expect(stepsOn(d.repair?.controller?.decisions ?? [])).toBe(3);
    expect(d.repair?.controller?.decisions.map((x) => x.action)).toEqual(['rewrite', 'redraft', 'redraft', 'carrier-rewrite']);
  });
  it('a step is on the ledger before it runs (read as could-not-run until settled), and a refused step is entered as refused, never counted', () => {
    const l = stepLedger({ maxActions: 1 }, null);
    const at = l.begin({ action: 'rewrite', targets: ['m3'], why: 'w', expectedGain: 1, expectedCostUsd: 0.05 });
    expect(l.entries[at].outcome).toBe('could not run');
    l.settle(at, 'not kept', { movement: 0, calls: 1, usd: 0 });
    expect(l.gate({ action: 'trim', targets: ['length'], why: 'w', expectedGain: 1, expectedCostUsd: 0.4 })).toBe('the controller took its 1 steps');
    expect(l.entries.map((x) => x.outcome)).toEqual(['not kept', 'refused']);
    expect(stepsOn(l.entries)).toBe(1);
  });
});

describe('C. the hand-off contract: exactly the targets handed, named, and never none', () => {
  const c4: Requirement = { requirementId: 'c4', statement: 'Use repeated sentence openings within my range: between 22.5 and 71.8 per 1,000 words.', materiality: 'REQUIRED', authority: 'EXPERT_RATIFIED', appliesWhen: 'GENERAL',
    measurement: { observer: 'PATTERN_RATE', params: { pattern: ['REPEATED_OPENER'], minPer1000: 22.5, maxPer1000: 71.8 } } } as unknown as Requirement;
  const c10: Requirement = { requirementId: 'c10', statement: 'Keep parenthetical asides at zero.', materiality: 'PREFERRED', authority: 'EXPERT_RATIFIED', appliesWhen: 'GENERAL',
    measurement: { observer: 'FEATURE', params: { feature: ['parenthesis'], maxValue: 0.001 } } } as unknown as Requirement;
  const std = { standardVersionHash: 's', requirements: [c4, c10] } as unknown as StandardVersion;
  const floor = (v: number): RuleCheck => ({ ...rate('c4', 'PATTERN_RATE', v, 0, `${v} per 1,000 words (at least 22.5)`, v < 22.5 ? 'VIOLATED' : 'MET'), statement: c4.statement });
  const habit: RuleCheck = { requirementId: 'c10', statement: c10.statement, materiality: 'PREFERRED', enforced: false, observer: 'FEATURE', result: { verdict: 'VIOLATED', value: 41.8, error: 41.8, detail: 'parenthetical asides 41.8 per 1,000 words', spans: spans(3) } };
  it('a floor rate with no span, handed over, is told with which way it is out; the record and the outcome name it alone', async () => {
    const unmet = unmetReader(std, null, null, 'all');
    if (!unmet) throw new Error('expected a reader');
    const handed = (t: string) => ({ output: t, report: reportOf([floor(17.4), habit], true), repair: { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', why: 'w',
      controller: controllerRecord([step('redraft', 'handed to a redraft', ['c4'], 0)], 'handed to a redraft', true) } });
    const sent: string[] = []; const notes: string[] = [];
    const d = await withRedraft(async (t) => (t === 'first' ? handed(t) : { output: t, report: reportOf([floor(30.3)]), repair: null }),
      { notes, unmet, redraft: async (note) => { sent.push(note); return 'second'; } })('first');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('your pieces use at least 22.5 per 1,000 words; this draft has 17.4');
    expect(sent[0]).not.toContain('parenthetical asides');
    const redraft = d.repair?.controller?.decisions.find((x) => x.action === 'redraft' && x.outcome !== 'handed to a redraft');
    expect(redraft?.targets).toEqual(['c4']);
    expect(redraft?.outcome).toBe('kept');
    expect(notes.join(' ')).toMatch(/^Written again: the first draft left out 1 thing\(s\) the method requires \(c4: /);
    expect(notes.join(' ')).not.toContain('c10');
  });
  it('an empty list of targets is never sent', () => {
    expect(() => redraftNote([], 'draft')).toThrow(/never sent with an empty list/);
  });
});

// ── THROUGH THE BINARY: the support skill and the scripted drafts each defect was found on ──────────────────────────
const ROOT = resolve(__dirname, '..');
const CLI = join(ROOT, 'dist', 'cli', 'atelier.mjs');
const FIX = join(ROOT, 'tests', 'fixtures', 'support-replay');
const ASK = 'reply to Hannah, whose blender jug leaks at the base';
interface Out { output: string; controller: ControllerRecord; report: string[] }
/** The standard the fixture's skill is built on: each rule is measured here, in process, on the scenario's own texts. */
const STD = JSON.parse(readFileSync(join(FIX, 'skills', 'support', 'standards', '52cf27430d4f79c6.json'), 'utf8')) as StandardVersion;
const valueOf = (text: string, id: string): number => Number(verifyText('support', STD, text).checked.find((c) => c.requirementId === id)?.result.value);
const scenario = (name: string): { piece: string; json: string } => { const json = readFileSync(join(FIX, 'scenarios', `${name}.json`), 'utf8'); return { json, piece: (JSON.parse(json) as { byTool: { emit_piece: { piece: string } } }).byTool.emit_piece.piece }; };

describe.skipIf(!existsSync(CLI))('end to end: each run the defects were found on', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    backend = spawn(process.execPath, [join(ROOT, 'tests', 'fixtures', 'scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((done) => backend.stdout?.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) done(Number(m[1])); }));
  });
  afterAll(() => { backend.kill(); });
  const log = async (): Promise<string[]> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies;
  /** One invocation on a fresh copy of the skill, scripted by the scenario; the repair calls the backend answered for it. */
  const replay = async (name: string, ask = ASK, ...flags: string[]): Promise<{ out: Out; err: string; repairCalls: number; sent: string[] }> => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-ledger-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-ledger-proj-'));
    cpSync(join(FIX, 'skills'), join(data, 'skills'), { recursive: true });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: scenario(name).json });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const before = (await log()).length;
    let out: string; let err = '';
    try { out = execFileSync('node', [CLI, 'invoke', '--skill', 'support', ask, '--json', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted',
      '--drafts', '1', '--accept-new-binding', ...flags], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { out = (e as { stdout?: string }).stdout ?? ''; err = (e as { stderr?: string }).stderr ?? ''; }
    // the repair calls: span rewrites, and the drafts written again and cut (each carries the earlier draft); a shape round's draft does not
    const sent = (await log()).slice(before).filter((b) => b.includes('emit_replacements') || b.includes('<earlier-draft>'));
    return { out: JSON.parse(out) as Out, err, repairCalls: sent.length, sent };
  };

  it('A (S4): the hedge rate is never delivered higher than the first draft had it (9.0 per 1,000 words)', async () => {
    const r = await replay('s4');
    expectLedger(r.out.controller, r.repairCalls);
    expect(valueOf(scenario('s4').piece, 'm3')).toBe(9);
    expect(valueOf(r.out.output, 'm3')).toBeLessThanOrEqual(9);
  }, 120_000);
  it('A (S9c): a ban is never delivered worse than the first draft had it (3 semicolons per 1,000 words)', async () => {
    const r = await replay('s9', `${ASK}, in under 280 words`);
    expectLedger(r.out.controller, r.repairCalls);
    expect(valueOf(scenario('s9').piece, 'c1')).toBe(3);
    expect(valueOf(r.out.output, 'c1')).toBeLessThanOrEqual(3);
  }, 120_000);
  it('B (S8, S1): a redraft not kept, and the piece refined again: four steps a run, every model step one call the backend answered', async () => {
    for (const name of ['s8', 's1']) {
      const r = await replay(name);
      expectLedger(r.out.controller, r.repairCalls);
      expect(stepsOn(r.out.controller.decisions)).toBe(MAX_STEPS);
      expect(r.out.controller.stoppedBecause).toBe('the controller took its 4 steps');
    }
  }, 240_000);
  it('B (S8b): under --until-typical each round keeps its own four, and every round\'s model steps are the calls answered', async () => {
    const r = await replay('s8b', ASK, '--until-typical', '0.99', '--shape-rounds', '1');
    expect(r.out.controller.rounds).toHaveLength(2);
    expectLedger(r.out.controller, r.repairCalls);
  }, 240_000);
  it('C (S2): the enforced floor rate handed over is the redraft\'s one target, named in the note sent and in the line said', async () => {
    const r = await replay('s2');
    expectLedger(r.out.controller, r.repairCalls);
    const handOff = r.out.controller.decisions.find((d) => d.outcome === 'handed to a redraft');
    expect(handOff?.targets).toEqual(['c4']);
    const redraft = r.out.controller.decisions.find((d) => d.action === 'redraft' && d.outcome !== 'handed to a redraft');
    expect(redraft?.targets).toEqual(['c4']);
    // the note itself: from what the earlier draft did not hold to the draft it is to keep what it can of
    const body = r.sent.find((b) => b.includes('<earlier-draft>')) ?? '';
    const note = body.slice(body.indexOf('An earlier draft did not'), body.indexOf('<earlier-draft>'));
    expect(note).toContain('did not hold what this work requires');
    expect(note).toContain('this draft has 17.4');
    expect(note).not.toContain('parenthetical asides');
    const line = r.out.report.find((l) => /^(Written again|The draft)/.test(l)) ?? '';
    expect(line).toContain('c4: ');
    expect(line).not.toMatch(/c10|c12|c13/);
  }, 120_000);
  it('(S7) under --until-typical every "Written again" and "did not do better" line names its round', async () => {
    const r = await replay('s7', ASK, '--until-typical', '0.99', '--shape-rounds', '1');
    expectLedger(r.out.controller, r.repairCalls);
    const lines = r.out.report.filter((l) => /Written again|did not do better/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const l of lines) expect(l).toMatch(/^Shape round [01]: /);
    expect(new Set(lines.map((l) => l.slice(0, 13)))).toEqual(new Set(['Shape round 0', 'Shape round 1']));
  }, 240_000);
  it('(S3) a fix without a model lists only the rules it changed', async () => {
    const r = await replay('s3');
    expectLedger(r.out.controller, r.repairCalls);
    const mech = r.out.controller.decisions.filter((d) => d.action === 'mechanical');
    expect(mech.length).toBeGreaterThan(0);
    for (const d of mech) expect(d.targets).toEqual(['m2']);
  }, 120_000);
});
