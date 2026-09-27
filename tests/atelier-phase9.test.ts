// tests/atelier-phase9.test.ts — WHERE IN THE PIECE, AND WHAT KEEPS GOING WRONG.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { measure, validateMeasurement } from '../core/observers/registry.js';
import { headingsOf, headingCase } from '../core/observers/structure.js';
import { deriveContrastRules } from '../core/observers/contrast.js';
import { clusterComplaints, findRecurrences, jaccard, contentWordsOf } from '../core/mining/recurrence.js';
import { planRepair } from '../core/loop/repair.js';
import { checkDraft } from '../core/loop/run-repair.js';
import type { FeedbackRecord, InvocationRecord, StandardVersion } from '../core/state/canonical-state.js';
import * as store from '../core/state/store.js';
import { aRequirement } from './fixtures.js';

const para = (s: string, n: number): string => Array.from({ length: n }, () => s).join(' ');
const piece = (title: string, open: string, headings: string[], close: string): string =>
  `# ${title}\n\n${open}\n\n${headings.map((h) => `## ${h}\n\n${para('The body says what the section is about in plain words.', 4)}`).join('\n\n')}\n\n${close}\n`;

describe('the section model', () => {
  it('a single level-1 heading is the title, not a section; code blocks and front matter are not headings', () => {
    const t = '---\ntitle: x\n---\n# Title\n\n## One\n\ntext\n\n```\n## not a heading\n```\n\n### Two\n';
    expect(headingsOf(t).map((h) => h.text)).toEqual(['One', 'Two']);
  });
  it('heading case', () => {
    expect(headingCase('The Thing Everyone Gets Wrong')).toBe('TITLE');
    expect(headingCase('What the data actually shows')).toBe('SENTENCE');
    expect(headingCase('Why NASA matters')).toBeNull();
  });
});

describe('OPENING, CLOSING and HEADINGS', () => {
  const text = piece('On launch', "In today's world, launches are cheap. We fly more than ever.",
    ['The thing everyone gets wrong about orbits', 'What the data shows'], 'Ultimately, someone has to be on the hook.');
  it('an opening trope is its own span, inside the opening only', () => {
    const r = measure(text, { observer: 'OPENING', params: { avoid: ["in today's", 'ultimately'] } });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans.map((s) => s.text)).toEqual(["In today's"]);
  });
  it('a closing trope is caught in the close', () => {
    expect(measure(text, { observer: 'CLOSING', params: { avoid: ['ultimately'] } }).spans.map((s) => s.text)).toEqual(['Ultimately']);
  });
  it('opening length is a band, the span the whole paragraph', () => {
    const r = measure(text, { observer: 'OPENING', params: { minWords: 20 } });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans[0].text).toContain("In today's world");
  });
  it('headings: tropes, case and length each name the heading', () => {
    const r = measure(text, { observer: 'HEADINGS', params: { avoid: ['the thing'], case: ['SENTENCE'], maxWords: 5 } });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans).toHaveLength(1);
    expect(r.spans[0].why).toMatch(/uses "the thing".*is 7 words/i);
  });
  it('no headings: not applicable, not met', () => {
    expect(measure('One paragraph.\n\nTwo paragraphs.', { observer: 'HEADINGS', params: { avoid: ['x'] } }).verdict).toBe('NOT_APPLICABLE');
  });
  it('malformed targets are refused', () => {
    expect(validateMeasurement({ observer: 'HEADINGS', params: { case: ['LOUD'] } })).toMatch(/SENTENCE or TITLE/);
    expect(validateMeasurement({ observer: 'OPENING', params: {} })).toMatch(/needs/);
    expect(validateMeasurement({ observer: 'CLOSING', params: { minWords: 9, maxWords: 3 } })).toMatch(/cannot exceed/);
  });
  it('a heading rewrite is held to the full meaning guard: its text is never licensed as a drop', () => {
    const v = { requirements: [aRequirement({ requirementId: 'h1', statement: 'No tropes.', materiality: 'REQUIRED', measurement: { observer: 'HEADINGS', params: { avoid: ['the thing'] } } })] } as unknown as StandardVersion;
    const targets = planRepair(text, checkDraft('d', v, text, { guardClaims: false }));
    expect(targets.length).toBe(1);
    expect(targets[0].drops).toEqual([]);
  });
});

describe('the contrast pass proposes edge rules, weak unless the model\'s plain drafts fail them', () => {
  const author = (i: number) => ({ id: `a${i}.md`, text: piece(`Post ${i}`, para('I start with the problem as I met it.', 3),
    ['What the numbers show', 'Where it breaks'], 'That is where I would start.') });
  const read = [0, 1, 2, 3].map(author); const held = [4, 5].map(author);
  it('tropes the author never uses are proposed as weak when the plain drafts do not use them either', () => {
    const plain = piece('Draft', para('I start with the problem as I met it.', 3), ['What the numbers show'], 'That is where I would start.');
    const rules = deriveContrastRules(read, held, [plain, plain, plain], 'MACHINE_DISCOVERED');
    const headings = rules.find((r) => r.requirement.measurement?.observer === 'HEADINGS' && Array.isArray(r.requirement.measurement.params.avoid));
    expect(headings?.conformance.weak).toBe(true);
    expect(headings?.conformance.present).toBe(headings?.conformance.applicable);
  });
  it('and firm when the drafts do', () => {
    const tropey = piece('Draft', "In today's world, " + para('everything moves fast.', 3), ['The thing everyone gets wrong', 'Why this matters'], 'Ultimately, it is up to you.');
    const rules = deriveContrastRules(read, held, [tropey, tropey, tropey], 'MACHINE_DISCOVERED');
    for (const o of ['OPENING', 'CLOSING', 'HEADINGS']) {
      const r = rules.find((x) => x.requirement.measurement?.observer === o && Array.isArray(x.requirement.measurement.params.avoid));
      expect(r, `no ${o} rule`).toBeDefined();
      expect(r!.conformance.weak, `${o} should be firm`).toBeUndefined();
    }
  });
});

describe('recurrence', () => {
  const fb = (complaint: string, at: string, requirementId?: string): FeedbackRecord => ({ feedbackId: at, invocationId: 'i', complaint, at, ...(requirementId ? { requirementId } : {}) });
  it('complaints that say the same thing group; unrelated ones do not', () => {
    expect(jaccard(contentWordsOf('too many em dashes in it'), contentWordsOf('the em dashes again'))).toBeGreaterThan(0.3);
    const groups = clusterComplaints([fb('too many em dashes', '1'), fb('em dashes everywhere', '2'), fb('the intro rambles on', '3')]);
    expect(groups.map((g) => g.length)).toEqual([2, 1]);
  });
  it('a recurring gap, a rule that keeps being missed, a rule the draft keeps breaking, and repairs that lose meaning', () => {
    const rules = [aRequirement({ requirementId: 'x1', statement: 'Lead with the action.' }), aRequirement({ requirementId: 'x2', statement: 'Never say leverage.' })];
    const inv = (violated: string[], reverted = false): InvocationRecord => ({ repair: { passes: 1, violatedBefore: violated, violatedAfter: [], originalOutputHash: '', why: '',
      ...(reverted ? { integrityReverted: ['kept'] } : {}) } } as unknown as InvocationRecord);
    const out = findRecurrences({
      feedback: [fb('too many em dashes', '2026-01-01T10:00:00Z'), fb('em dashes everywhere again', '2026-01-02T10:00:00Z'),
        fb('it buried the action', '2026-01-03T10:00:00Z', 'x1'), fb('the action was buried at the end', '2026-01-04T10:00:00Z', 'x1')],
      invocations: [inv(['x2'], true), inv(['x2'], true), inv(['x2']), inv([])],
      requirements: rules,
      proposals: [{ proposal: 'Never use em dashes.', at: '2026-01-02T10:00:30Z', accepted: null }],
    });
    const kinds = out.map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(['GAP', 'MISSED_RULE', 'BROKEN_DRAFT', 'LOST_MEANING']));
    expect(out.find((r) => r.kind === 'GAP')).toMatchObject({ count: 2, proposal: 'Never use em dashes.' });
    expect(out.find((r) => r.kind === 'MISSED_RULE')).toMatchObject({ requirementId: 'x1', count: 2 });
    expect(out.find((r) => r.kind === 'BROKEN_DRAFT')).toMatchObject({ requirementId: 'x2', broken: 3, runs: 4 });
  });
  it('a declined proposal is not offered again, and one complaint is an anecdote', () => {
    const out = findRecurrences({ feedback: [fb('em dashes', '2026-01-01T10:00:00Z'), fb('em dashes again', '2026-01-02T10:00:00Z')],
      invocations: [], requirements: [], proposals: [{ proposal: 'Never use em dashes.', at: '2026-01-02T10:00:10Z', accepted: false }] });
    expect(out[0]).toMatchObject({ kind: 'GAP', proposal: null });
    expect(findRecurrences({ feedback: [fb('em dashes', '1')], invocations: [], requirements: [], proposals: [] })).toEqual([]);
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

describe('through the binary: mine', () => {
  it('two complaints about the same gap are listed with their proposal, and added only on the owner\'s word', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p9-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p9-proj-'));
    const L = { root: data, skillName: 'focus' };
    run(data, proj, 'add', '--statement', 'Lead with the action.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'focus');
    expect(run(data, proj, 'mine', '--skill', 'focus')).toContain('Nothing recurs yet');
    await post({ byTool: { emit_piece: { piece: 'An answer — with dashes — everywhere.' },
      emit_coverage: { coverage: 'ABSENT', requirementIds: [], proposedRequirement: 'Never use em dashes.', question: null, reasoning: 'nothing covers it' } } });
    for (const c of ['too many em dashes in this', 'em dashes everywhere again']) {
      run(data, proj, 'invoke', '--skill', 'focus', '--task', 'write the recommendation');
      run(data, proj, 'fix', c, '--skip');
    }
    const before = store.getActive(L);
    const listed = run(data, proj, 'mine', '--skill', 'focus');
    expect(listed).toContain('A gap: 2 complaints');
    expect(store.getActive(L), 'listing changed the skill').toBe(before);
    // The owner declined the single-complaint proposal both times; mining still shows the recurrence, without that wording.
    expect(run(data, proj, 'mine', '--skill', 'focus', '--add', '1', '--materiality', 'required')).toMatch(/^EXIT:1[\s\S]*--statement/);
    const added = run(data, proj, 'mine', '--skill', 'focus', '--add', '1', '--materiality', 'required', '--statement', 'Never use em dashes; use a comma or a colon.');
    expect(added).toContain('Added as REQUIRED');
    const std = store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!;
    expect(std.requirements.some((r) => r.statement.startsWith('Never use em dashes'))).toBe(true);
    expect(std.reason).toMatch(/recurring: 2 complaints/);
  }, 120_000);
});
