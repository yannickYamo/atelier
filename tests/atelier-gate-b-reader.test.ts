// THE JUDGEMENT READER, ON BY DEFAULT IN REPORTING MODE AND BOUNDED (core/taste/reader.ts, cli/commands/invoke.ts).
// Every rule no count checks is read where a model can be reached; what it finds is shown and never certifies: a
// FOLLOWED is observed, the run stays NEEDS REVIEW, and only a VETO the owner's labels earned may fail a rule. Bounded:
// rules are read in batches of twelve, each twice, the brief's applying steps and the required rules first; a run on
// a long request makes four reading calls by default and says what the cap left unread; a short request reads nothing
// unless asked; --strict reads every rule; --no-taste turns it off.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readTaste, readCoverage, READ_BATCH } from '../core/taste/reader.js';
import type { InferenceClient } from '../core/inference/client.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const req = (i: number, materiality: 'REQUIRED' | 'PREFERRED' = 'PREFERRED'): Requirement => ({ requirementId: `j${i}`, statement: `Judgement step ${i}: say something only a reader can tell.`, appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_STATED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality, realizationTolerance: null, outputShape: null });
const std = (rs: Requirement[]): StandardVersion => ({ standardVersionHash: 's', evidenceId: 'e', workType: 'review', requirements: rs, authorityState: 'RATIFIED', mintedAt: '2026-10-18T00:00:00Z' } as unknown as StandardVersion);
const TEXT = 'The change touches the runner and keeps its tests. Approve.';

/** A reader that answers FOLLOWED for every rule it is shown, quoting the text, and counts its calls. */
const fakeReader = (): { client: InferenceClient; calls: number[] } => {
  const calls: number[] = [];
  const client = { complete: async (r: { userMessage: string; toolName: string }) => {
    const n = r.toolName === 'emit_readings' ? (r.userMessage.match(/^\d+\. /gm) ?? []).length : 0;
    calls.push(n);
    return { json: { readings: Array.from({ length: n }, (_, i) => ({ n: i + 1, verdict: 'FOLLOWED', kind: null, quote: 'keeps its tests', why: 'it does' })) }, cost: 0.001, text: '' };
  } } as unknown as InferenceClient;
  return { client, calls };
};
const budget = () => ({ spentUsd: 0, capUsd: 5 });

describe('bounded reading', () => {
  it('thirty rules under a cap of four calls: two batches of twelve read twice, six not read and said so; the steps named first are read first', async () => {
    const rules = [...Array.from({ length: 27 }, (_, i) => req(i + 1)), req(28, 'REQUIRED'), req(29, 'REQUIRED'), req(30, 'REQUIRED')];
    const { client, calls } = fakeReader();
    const r = await readTaste(client, budget(), std(rules), TEXT, null, rules.map(() => true), { maxCalls: 4, first: new Set(['j28', 'j29', 'j30']) });
    expect(calls).toEqual([12, 12, 12, 12]);
    const cov = readCoverage(r);
    expect(cov).toEqual({ read: 24, of: 30, notRead: 6 });
    // the three required rules are among the read, the last six preferred ones are not
    for (const id of ['j28', 'j29', 'j30']) expect(r.find((x) => x.requirementId === id)?.verdict).toBe('FOLLOWED');
    expect(r.filter((x) => x.verdict === 'NOT_READ').map((x) => x.requirementId)).toEqual(['j22', 'j23', 'j24', 'j25', 'j26', 'j27']);
    expect(r.find((x) => x.verdict === 'NOT_READ')?.why).toBe("not read: the run's reading cap (4 calls) was spent on the rules before it");
    expect(READ_BATCH).toBe(12);
  });
  it('the rules named first are read first; a pass that returns nothing for a rule leaves it not read, never unclear', async () => {
    const rules = Array.from({ length: 14 }, (_, i) => req(i + 1));
    const { client, calls } = fakeReader();
    const r = await readTaste(client, budget(), std(rules), TEXT, null, rules.map(() => true), { maxCalls: 2, first: new Set(['j13', 'j14']) });
    expect(calls).toEqual([12, 12]);
    expect(r.find((x) => x.requirementId === 'j13')?.verdict).toBe('FOLLOWED');
    expect(r.filter((x) => x.verdict === 'NOT_READ').map((x) => x.requirementId)).toEqual(['j11', 'j12']);
    // a reader that answers for the first and third numbers only: the second pass reads the rules reversed, so the
    // first and third rules are read in both passes and the second in neither
    const thin = { complete: async () => ({ json: { readings: [1, 3].map((n) => ({ n, verdict: 'FOLLOWED', kind: null, quote: 'keeps its tests', why: 'it does' })) }, cost: 0, text: '' }) } as unknown as InferenceClient;
    const t = await readTaste(thin, budget(), std(rules.slice(0, 3)), TEXT, null, [true, true, true]);
    expect(t.map((x) => x.verdict)).toEqual(['FOLLOWED', 'NOT_READ', 'FOLLOWED']);
    expect(t[1].why).toBe('no reading came back for it');
    // no cap: every batch is read
    const { client: c2, calls: n2 } = fakeReader();
    await readTaste(c2, budget(), std(Array.from({ length: 30 }, (_, i) => req(i + 1))), TEXT, null, Array(30).fill(true));
    expect(n2).toEqual([12, 12, 12, 12, 6, 6]);
  });
});

// ── THROUGH A RUN ────────────────────────────────────────────────────────────────────────────────────────────
const NOTE = `How we review a change\n\n${Array.from({ length: 16 }, (_, i) => `${i + 1}. Weigh point ${i + 1} of the change as an expert would, naming the trade-off it makes.`).join('\n')}\n17. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n`;
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\nI would start with the riskiest line. ${'The change touches the runner and keeps its tests. '.repeat(n)}\n\n## Verdict\n${verdict}\n`;
const DRAFT = '## Summary\nThe change renames one CSS class in the docs site and keeps the build green; the trade-off is a one-line edit in two themes.\n\n## Verdict\nApprove\n';
const READINGS = (n: number) => ({ readings: Array.from({ length: n }, (_, i) => ({ n: i + 1, verdict: 'FOLLOWED', kind: null, quote: 'keeps the build green', why: 'the trade-off is named' })) });

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const readingCalls = async (): Promise<number[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.map((b) => JSON.parse(b) as { tools?: { function?: { name?: string } }[]; messages?: { content?: string }[] })
    .filter((b) => b.tools?.[0]?.function?.name === 'emit_readings').map((b) => ((b.messages ?? []).map((m) => m.content ?? '').join('\n').match(/^\d+\. /gm) ?? []).length);
};

describe('through a run', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    // the readings answer is scripted per batch size, so each batch gets one reading per rule it was shown
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_holds_back: { ids: [] }, emit_piece: { piece: DRAFT } },
      // the matcher reads the wire body, where a newline is the two characters backslash and n
      when: [{ contains: 'RULES\\n1. ', containsAll: ['\\n12. '], answer: READINGS(12) }, { contains: 'RULES\\n1. ', containsAll: ['\\n4. '], answer: READINGS(4) }, { contains: 'RULES\\n1. ', answer: READINGS(3) }] }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('on by default on a long request, four calls at most and the cap said; nothing on a short request; off with --no-taste; every rule under --strict; never VERIFIED on its word', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-gr-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gr-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE);
    ['Approve', 'Request changes', 'Comment', 'Approve'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, i + 1)); });
    // no reading held back blind here, so the report line is deterministic (the share is the product's default otherwise)
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_TASTE_HOLDBACK: '0' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    expect(run('new', 'examples', '--method', 'method.md', '--name', 'review', '--yes', ...BACKEND()).code).toBe(0);
    const L = { root: data, skillName: 'review' };
    const judgement = store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!.requirements.filter((q) => !q.measurement && q.provenance === 'EXPERT_STATED').length;
    expect(judgement).toBe(16);
    const long = 'Review this change: it renames a CSS class in the docs site and touches nothing else, so weigh each point as you would.';
    const before = (await readingCalls()).length;
    // `run` prints the work and its evaluation card, which opens with where the work stands
    const r = run('run', long, '--skill', 'review', '--report', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const calls = (await readingCalls()).slice(before);
    expect(calls).toEqual([12, 12, 4, 4]);
    expect(r.out).toMatch(/Taste reader: read 16 of 16 reading-based rule\(s\), 0 read as missed \(reporting only until you label it/);
    // sixteen FOLLOWED readings certify nothing: the required judgement steps are still the owner's to read
    expect(r.out).toMatch(/NEEDS REVIEW/);
    expect(r.out).not.toMatch(/\bVERIFIED\b/);
    // a short request: no reading
    const b2 = (await readingCalls()).length;
    expect(run('invoke', '--skill', 'review', 'Thanks, approve it.', ...BACKEND()).code).toBe(0);
    expect((await readingCalls()).length).toBe(b2);
    // off: no reading; and the reporting reader changed nothing: the delivered text is the same with it and without it
    const on = run('invoke', '--skill', 'review', long, '--json', ...BACKEND());
    const off = run('invoke', '--skill', 'review', long, '--no-taste', '--json', ...BACKEND());
    expect(on.code, on.out).toBe(0); expect(off.code, off.out).toBe(0);
    const textOf = (o: string): string | null => (JSON.parse(o.slice(o.indexOf('\n{') + 1)) as { output: string | null }).output;
    expect(textOf(on.out)).toBe(textOf(off.out));
    expect((await readingCalls()).length).toBe(b2 + 4);
    // the record says the reader was off on that run and on for the first
    const recs = store.listInvocations(L);
    expect(recs.map((x) => x.settings.flags.noTaste).sort()).toEqual([false, false, true, true]);
  }, 300_000);
});
