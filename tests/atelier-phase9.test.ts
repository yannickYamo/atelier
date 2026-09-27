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
      ...(reverted ? { integrityReverted: ['kept'], revertedRules: violated } : {}) } } as unknown as InvocationRecord);
    const out = findRecurrences({
      feedback: [fb('too many em dashes', '2026-01-01T10:00:00Z'), fb('em dashes everywhere again', '2026-01-02T10:00:00Z'),
        fb('it buried the action', '2026-01-03T10:00:00Z', 'x1'), fb('the action was buried at the end', '2026-01-04T10:00:00Z', 'x1')],
      invocations: [inv(['x2'], true), inv(['x2'], true), inv(['x2']), inv([])],
      requirements: rules,
      proposals: [{ proposal: 'Never use em dashes.', at: '2026-01-02T10:00:00Z', accepted: null }],
    });
    const kinds = out.map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(['GAP', 'MISSED_RULE', 'BROKEN_DRAFT', 'LOST_MEANING']));
    expect(out.find((r) => r.kind === 'GAP')).toMatchObject({ count: 2, proposal: 'Never use em dashes.' });
    expect(out.find((r) => r.kind === 'MISSED_RULE')).toMatchObject({ requirementId: 'x1', count: 2 });
    expect(out.find((r) => r.kind === 'BROKEN_DRAFT')).toMatchObject({ requirementId: 'x2', broken: 3, repaired: 3, runs: 4 });
  });
  it('a declined proposal is not offered again, and one complaint is an anecdote', () => {
    const out = findRecurrences({ feedback: [fb('em dashes', '2026-01-01T10:00:00Z'), fb('em dashes again', '2026-01-02T10:00:00Z')],
      invocations: [], requirements: [], proposals: [{ proposal: 'Never use em dashes.', at: '2026-01-02T10:00:00Z', accepted: null },
        { proposal: 'Never use em dashes.', at: '2026-01-02T10:00:00Z', accepted: false }] });
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
    // The report was about the previous standard: adding from it again is refused, not duplicated.
    expect(run(data, proj, 'mine', '--skill', 'focus', '--add', '1', '--materiality', 'required', '--statement', 'x')).toMatch(/^EXIT:1[\s\S]*changed since that report/);
    // And the gap, now answered, is not offered again.
    expect(run(data, proj, 'mine', '--skill', 'focus')).not.toContain('A gap: 2 complaints');
  }, 120_000);
});

describe('final audit: what was closed', () => {
  it('the floor scores an opening trope as worse, not a shorter opening as better', async () => {
    const { orientedScore } = await import('../core/distinctiveness/measured.js');
    const m = { observer: 'OPENING' as const, params: { avoid: ['imagine'] } };
    const bad = 'Imagine this.\n\nThe body.\n\nThe end.';
    const good = 'We shipped the release on Monday and it held under load all week long.\n\nThe body.\n\nThe end.';
    expect(orientedScore(m, measure(bad, m))!).toBeLessThan(orientedScore(m, measure(good, m))!);
  });
  it('a heading can be recased without its capitals counting as lost names', async () => {
    const { spanIntegrity } = await import('../core/loop/integrity.js');
    expect(spanIntegrity('The Real Cost Of LLM Adoption', 'The real cost of LLM adoption', new Set(), false, new Set(), true).ok).toBe(true);
    expect(spanIntegrity('The rule comes from the Outer Space Treaty.', 'The rule comes from a treaty.', new Set(), false).ok).toBe(false);
    const v = { requirements: [aRequirement({ requirementId: 'h1', statement: 'Sentence case.', materiality: 'REQUIRED', measurement: { observer: 'HEADINGS', params: { case: ['SENTENCE'] } } })] } as unknown as StandardVersion;
    const text = '# T\n\nIntro here.\n\n## The Real Cost Of Adoption\n\nBody.\n';
    expect(planRepair(text, checkDraft('d', v, text, { guardClaims: false }))[0].recase).toBe(true);
  });
  it('setext headings, images and footnotes are not where a reader starts or stops', () => {
    expect(headingsOf('Title\n=====\n\nIntro.\n\nSection\n-------\n\nBody.').map((h) => h.text)).toEqual(['Section']);
    expect(headingsOf('# Title\n\n## Learn C#\n').map((h) => h.text)).toEqual(['Learn C#']);
    expect(measure('Title\n=====\n\nImagine this.\n\nEnd.', { observer: 'OPENING', params: { avoid: ['imagine'] } }).verdict).toBe('VIOLATED');
    expect(measure('![diagram](x.png)\n\nImagine this.\n\nEnd.', { observer: 'OPENING', params: { avoid: ['imagine'] } }).verdict).toBe('VIOLATED');
    expect(measure('Start.\n\nUltimately, it works.\n\n[^1]: A note.', { observer: 'CLOSING', params: { avoid: ['ultimately'] } }).verdict).toBe('VIOLATED');
  });
  it('heading case is read from common words, not names or acronyms', () => {
    expect(headingCase('How we use APIs and SDKs')).toBe('SENTENCE');
    expect(headingCase('Use the Kubernetes API with Terraform')).toBe('SENTENCE');
    expect(headingCase('How We Use APIs And SDKs')).toBe('TITLE');
    expect(headingCase('WHAT WE LEARNED')).toBe('TITLE');
  });
  it('a trope and a length problem are both sent to be fixed', () => {
    const r = measure("In today's world it is so. " + para('More words here to run long.', 12) + '\n\nEnd.', { observer: 'OPENING', params: { avoid: ["in today's"], maxWords: 20 } });
    expect(r.spans.length).toBe(2);
  });
  it('clusters do not chain unrelated complaints, and "em" counts', () => {
    const fb = (complaint: string, i: number): FeedbackRecord => ({ feedbackId: `f${i}`, invocationId: 'i', complaint, at: `2026-01-0${i}` });
    const chain = clusterComplaints(['tone too formal', 'salesy tone', 'salesy headings', 'headings too long'].map(fb));
    expect(chain.every((g) => g.length <= 2)).toBe(true);
    expect(clusterComplaints([fb('uses em dashes everywhere', 1), fb('em dashes again in the intro', 2)])[0]).toHaveLength(2);
  });
  it('complaints a rule was already added for are not offered again; refusals are charged to their own rule', () => {
    const fb = (complaint: string, id: string): FeedbackRecord => ({ feedbackId: id, invocationId: 'i', complaint, at: id });
    expect(findRecurrences({ feedback: [fb('em dashes', 'a'), fb('em dashes again', 'b')], invocations: [], requirements: [],
      proposals: [{ proposal: 'No em dashes.', at: 'z', accepted: true, feedbackIds: ['a', 'b'] }] })).toEqual([]);
    const rules = [aRequirement({ requirementId: 'x1' }), aRequirement({ requirementId: 'x2' })];
    const inv = { repair: { passes: 1, violatedBefore: ['x1', 'x2'], violatedAfter: [], originalOutputHash: '', why: '', integrityReverted: ['k'], revertedRules: ['x2'] } } as unknown as InvocationRecord;
    const lost = findRecurrences({ feedback: [], invocations: [inv, inv], requirements: rules, proposals: [] }).filter((r) => r.kind === 'LOST_MEANING');
    expect(lost.map((r) => r.kind === 'LOST_MEANING' && r.requirementId)).toEqual(['x2']);
  });
  it('an untested candidate blocks nothing in repair memory', async () => {
    const { mayPropose, foldRepairs } = await import('../core/architecture/repair-memory.js');
    const at = '2026-01-01';
    const events = [{ kind: 'REPAIR_PROPOSED', repairId: 'r', skillName: 's', requirementId: 'p1', from: 'PROSE', to: 'SELF_CHECK', sourceSkillVersionHash: 'a',
      candidateSkillVersionHash: 'b', evidenceBasis: { missContexts: 20, invocationIds: [] }, at },
    { kind: 'REPAIR_SETTLED', repairId: 'r', outcome: 'REJECTED', evaluationBasis: { generations: 0, instrument: 'UNQUALIFIED_COMPARATOR', orderInvariant: null }, at, note: null }];
    expect(mayPropose(foldRepairs(events), [], 'p1', 'PROSE', 'SELF_CHECK', { evidence: { missContexts: 1, invocationIds: [] },
      evaluation: { generations: 1, instrument: 'HUMAN_EYE', orderInvariant: null } }).allowed).toBe(true);
  });
});
