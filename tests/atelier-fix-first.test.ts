// tests/atelier-fix-first.test.ts — AN OUTSIDE RE-TEST OF THE RUNTIME, AND WHAT IT FOUND.
//
// Each block pins one finding of that re-test, with the brief's own probe sentences where it gave them,
// and the opposite polarity: the thing that must still pass.
//   P0-2  answers: work done, results and the person's own system details are cut; general knowledge listed
//   P0-4  a conditional REQUIRED rule missing its material is withheld, not a refusal; a general one refuses
//   P0-5  a request that states its own format overrides the skill's presentation rules
//   P1-1  two reads: a flag both raise is acted on, one only one raised is listed
//   P1-2  a redraft that drops a supported sentence is refused
//   P1-3  a sentence left pointing at cut text goes with it
//   P1-4  a skill for answers is compiled in the words of answers
//   judge a small model answers the questions that need context; its answers are validated; the patterns are the floor

import { describe, it, expect } from 'vitest';
import { checkDraft, checkDraftAsync, refineToStandard, redraftPreserves, danglingAfterCut, danglingJudged } from '../core/loop/run-repair.js';
import { modelSensor, READER_VERSION } from '../core/loop/claim-extract.js';
import { modelJudge, type ContextJudge } from '../core/loop/context-judge.js';
import { checkSatisfiable } from '../core/state/prerequisite.js';
import { FORMATS } from '../core/observers/formats.js';
import { requestedFormat, presentationRules } from '../cli/commands/invoke.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
const ok = (json: unknown): Promise<never> => Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never);
const answers = { format: FORMATS['assistant-reply'] };
const cut = (text: string, task: string): boolean =>
  checkDraft('d', v, text, { material: task, ...answers }).checked.find((c) => c.requirementId === 'UNSOURCED')?.result.verdict === 'VIOLATED';

describe('P0-2: an answer may not make up the person\'s system or its own work', () => {
  it('the brief\'s cases are cut', () => {
    expect(cut('Checked this against the failing case: with the header, the request reaches the handler and returns 200.', 'Why does the request 401?')).toBe(true);
    expect(cut('The backfill is at 2.3M rows, 40 min in.', 'How is the backfill going?')).toBe(true);
    expect(cut('Drop the old `orders_legacy` table, then run `npm run migrate:down`.', 'Deploy it to production.')).toBe(true);
    expect(cut('Fixed: README.md said recieve; it now reads receive.', 'Fix the typo in the readme.')).toBe(true);
  });
  it('polarity: general knowledge, a general command, and a detail the request gave stay in', () => {
    expect(cut('PKCE stops a stolen authorization code from being redeemed.', 'What does PKCE do?')).toBe(false);
    expect(cut('The server hashes the verifier and compares it to the stored challenge.', 'How does PKCE verify?')).toBe(false);
    expect(cut('Run `npm install jsonwebtoken@latest`, then rerun the tests.', 'Upgrade jsonwebtoken.')).toBe(false);
    expect(cut('Open `src/auth.ts` and replace verifyToken.', 'My src/auth.ts verifyToken fails.')).toBe(false);
  });
  it('the context judge may flag work done, never cut it: its flags are listed; the patterns alone cut (cut-authority)', async () => {
    const judge: ContextJudge = { requestIntent: () => Promise.resolve(null), standsAlone: () => Promise.resolve(null),
      readAnswer: () => Promise.resolve(), workClaims: () => new Set([0]) };
    const t = 'The queue drained after the restart.';
    const r = await checkDraftAsync('d', v, t, { material: 'The queue is stuck.', ...answers, judge });
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.verdict).toBe('MET');
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED·check')?.result.spans[0].why).toMatch(/context judge, not measured/);
    // polarity: a pattern-found work claim is still cut, whatever the judge says
    const none: ContextJudge = { ...judge, workClaims: () => new Set() };
    expect((await checkDraftAsync('d', v, 'Checked: the header is set.', { material: 'x', ...answers, judge: none })).failed).toBe(true);
  });
});

describe('P0-4: a conditional rule cannot refuse a request its condition may not touch', () => {
  const need = [{ kind: 'CONTEXT' as const, name: 'real-path-line-number', why: 'paths' }];
  it('a conditional REQUIRED rule with its material missing degrades: the run proceeds, the rule is named', () => {
    const v4 = checkSatisfiable([{ requirementId: 'p4', statement: 'I name the exact file and line.', materiality: 'REQUIRED', appliesWhen: 'I am pointing at a code change I made', prerequisites: need }], new Set());
    expect(v4.kind).toBe('DEGRADED');
    expect(v4.kind === 'DEGRADED' && v4.missing[0].conditional).toBe(true);
  });
  it('polarity: a GENERAL REQUIRED rule with its material missing still refuses', () => {
    const v4 = checkSatisfiable([{ requirementId: 'p9', statement: 'Cite one counted observation from our records.', materiality: 'REQUIRED', appliesWhen: 'GENERAL', prerequisites: need }], new Set());
    expect(v4.kind).toBe('MISSING_REQUIRED_EVIDENCE');
  });
  it('a waived rule is reported as withheld, and not counted against the output', () => {
    const rule = { requirementId: 'x1', statement: 'Paragraphs of 1 sentence.', kind: 'GENERATIVE', materiality: 'REQUIRED', appliesWhen: 'GENERAL',
      authority: 'EXPERT_AUTHORED', measurement: { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 1 } } };
    const std = { standardVersionHash: 's', requirements: [rule] } as unknown as StandardVersion;
    const t = 'One. Two. Three.';
    expect(checkDraft('d', std, t, { guardClaims: false }).failed).toBe(true);
    const r = checkDraft('d', std, t, { guardClaims: false, waived: new Map([['x1', 'the request states its own format']]) });
    expect(r.failed).toBe(false);
    expect(r.checked.find((c) => c.requirementId === 'x1')?.result.detail).toMatch(/withheld for this run: the request states its own format/);
  });
});

describe('P0-5: the request\'s own format wins', () => {
  it('reads an explicit output contract, and nothing else', () => {
    expect(requestedFormat('Write a TypeScript function isEven(n: number): boolean. Return only the code block.')).toMatch(/return only the code block/i);
    expect(requestedFormat('Just the number, please: 17 times 6?')).toMatch(/just the number/i);
    expect(requestedFormat('Answer yes or no: is PKCE needed for SPAs?')).toMatch(/yes or no/i);
    expect(requestedFormat('Write a TypeScript function isEven(n: number): boolean.')).toBeNull();
  });
  it('selects the measured presentation rules and the prose ones about how a piece ends or starts', () => {
    const reqs = [
      { requirementId: 'p1', statement: 'I end every piece with a line starting "Next:".', measurement: null },
      { requirementId: 'p2', statement: 'Name the exact file.', measurement: null },
      { requirementId: 'm1', statement: 'Short paragraphs.', measurement: { observer: 'PARAGRAPH_LENGTH' } },
      { requirementId: 'm2', statement: 'No em dashes.', measurement: { observer: 'PATTERN_RATE' } },
    ];
    const p = presentationRules(reqs);
    expect(p.prose.map((q) => q.requirementId)).toEqual(['p1']);
    expect(p.measured.map((q) => q.requirementId)).toEqual(['m1']);
  });
});

describe('P1-1: two reads, and only what both raise is acted on', () => {
  const qualifiedReaders = [{ model: 'claude-haiku-4-5', version: READER_VERSION }];
  const flag = (text: string) => ({ specifics: [{ sentence: 1, text, kind: 'FIGURE', attributed: false, source: 'NONE', support: '' }] });
  const reads = (answersSeq: unknown[]): InferenceClient => { let i = 0; return { complete: () => ok(answersSeq[Math.min(i++, answersSeq.length - 1)]) }; };
  it('a flag only one read raised is listed to check, never cut', async () => {
    const s = modelSensor(reads([flag('94 minutes'), { specifics: [] }]), { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5',
      { material: '', task: '', placeholders: false, qualifiedReaders, reads: 2 });
    await s.read('The review took 94 minutes.');
    const r = s.reading('The review took 94 minutes.');
    expect(r?.claims).toHaveLength(0);
    expect(r?.publicFacts[0].why).toMatch(/one of two reads/);
  });
  it('polarity: a flag both reads raise is acted on', async () => {
    const s = modelSensor(reads([flag('94 minutes'), flag('94 minutes')]), { spentUsd: 0, capUsd: 1 }, 'claude-haiku-4-5',
      { material: '', task: '', placeholders: false, qualifiedReaders, reads: 2 });
    await s.read('The review took 94 minutes.');
    expect(s.reading('The review took 94 minutes.')?.claims).toHaveLength(1);
  });
});

describe('P1-2 and P1-3: a redraft keeps what it was not asked to change; nothing points at cut text', () => {
  it('a redraft that drops a supported sentence is not preserving', () => {
    const original = 'Last year I shipped a loop that broke. Retries need a budget. Deadlines keep them bounded.';
    expect(redraftPreserves(original, 'Retries need a budget.', ['Last year I shipped a loop that broke.'])).toBe(false);
    expect(redraftPreserves(original, 'Retries need a budget. Deadlines keep them bounded.', ['Last year I shipped a loop that broke.'])).toBe(true);
  });
  it('a sentence that followed a cut one and points back at it is found', () => {
    expect(danglingAfterCut('An issue must fit in a week. If it can\'t, we split it.', 'If it can\'t, we split it.', ['An issue must fit in a week.']))
      .toEqual(['If it can\'t, we split it.']);
    expect(danglingAfterCut('Retries hide failures. Deadlines keep them bounded.', 'Deadlines keep them bounded.', ['Retries hide failures.'])).toEqual([]);
  });
  it('the loop does not deliver a text that opens by pointing at what it cut', async () => {
    const writer = { complete: () => ok({ replacements: [] }) } as unknown as InferenceClient;
    const draft = 'Last year I shipped a retry loop that broke production. It taught us to cap retries. Deadlines keep them bounded, and budgets make the cost visible.';
    const out = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', v, draft, 2, { material: '' });
    expect(out.output).not.toMatch(/^It taught/);
    expect(out.output).toContain('Deadlines keep them bounded');
  });
  it('the context judge, when there is one, decides what no longer stands alone', async () => {
    const judge: ContextJudge = { requestIntent: () => Promise.resolve(null), readAnswer: () => Promise.resolve(), workClaims: () => null,
      standsAlone: (pairs) => Promise.resolve(pairs.map((p) => !p.next.startsWith('Which'))) };
    const before = 'We moved to weekly cycles. Which halved the meeting time. Planning is now 30 minutes.';
    expect(await danglingJudged(before, 'Which halved the meeting time. Planning is now 30 minutes.', ['We moved to weekly cycles.'], judge)).toEqual(['Which halved the meeting time.']);
  });
});

describe('the context judge: validated, and the patterns are its floor', () => {
  const client = (json: unknown): InferenceClient & { seen: InferenceRequest[] } => {
    const c = { seen: [] as InferenceRequest[], complete: (r: InferenceRequest) => { c.seen.push(r); return ok(json); } };
    return c;
  };
  it('a format is accepted only in the request\'s own words, at temperature 0', async () => {
    const c = client({ format: 'return only the code block', length: null });
    const j = modelJudge(c, { spentUsd: 0, capUsd: 1 });
    expect((await j.requestIntent('Write isEven. Return only the code block.'))?.format).toBe('return only the code block');
    expect(c.seen[0].temperature).toBe(0);
    const made = modelJudge(client({ format: 'JSON only', length: 'SHORT' }), { spentUsd: 0, capUsd: 1 });
    expect(await made.requestIntent('Write isEven.')).toEqual({ format: null, length: 'SHORT' });
  });
  it('an unreadable answer is a null, so the caller falls back to its patterns', async () => {
    const j = modelJudge({ complete: () => Promise.reject(new Error('overloaded')) }, { spentUsd: 0, capUsd: 1 });
    expect(await j.requestIntent('Return only the code block.')).toBeNull();
    expect(await j.standsAlone([{ removed: 'a', next: 'It b.' }])).toBeNull();
    await j.readAnswer(['I ran it.']);
    expect(j.workClaims(['I ran it.'])).toBeNull();
  });
  it('indexes out of range are dropped', async () => {
    const j = modelJudge(client({ claims: [1, 7, -2] }), { spentUsd: 0, capUsd: 1 });
    await j.readAnswer(['I ran the migration.', 'Run the tests.']);
    expect([...(j.workClaims(['I ran the migration.', 'Run the tests.']) ?? [])]).toEqual([0]);
  });
});

describe('P1-4: a skill for answers is compiled in the words of answers', () => {
  const base = { standardVersionHash: 'sv1', evidenceId: 'ev1', requirements: [{ requirementId: 'r1', statement: 'Lead with the action.',
    appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED', provenance: 'MACHINE_DISCOVERED', wouldBeAbsentIf: null,
    materiality: 'REQUIRED', realizationTolerance: null, outputShape: null, evidence: 'span', evidenceItemId: 'w1' }],
    authorityState: 'RATIFIED', mintedAt: '2026-09-30T00:00:00Z', supersedes: null, reason: null };
  const voice = { passages: ['Run the migration, then restart.'], lengthWords: [100, 100] as const };
  const md = async (workType: string): Promise<string> => {
    const { renderAgentSkill } = await import('../renderers/agent-skill/render.js');
    const { compileArchitecture } = await import('../core/architecture/compile.js');
    const std = { ...base, workType } as unknown as StandardVersion;
    return renderAgentSkill(std, compileArchitecture(std), 'x', 'd', null, [], voice).files['SKILL.md'];
  };
  it('answers: the length is a default the request overrides, and the line against invention names results and systems', async () => {
    const m = await md('answers');
    expect(m).toContain('unless the request asks for more or less');
    expect(m).toMatch(/Do the work the request asks for instead of\s+handing it back/);
    expect(m).toMatch(/Never describe a step you did\s+not take or a result you did not see/);
    expect(m).toMatch(/Ask only for a decision that is\s+the person's to make/);
    expect(m).not.toContain('ask instead');
    expect(m).not.toContain('a story of mine you were not given');
  });
  it('polarity: writing keeps the essay wording', async () => {
    const m = await md('writing');
    expect(m).toContain('My pieces of this kind run about 100 words.');
    expect(m).toContain('a story of mine you were not given is not yours to tell');
  });
});

describe('who may delete text (cut-authority)', () => {
  it('a measured instrument may cut; the context judge and an unqualified reader may not', async () => {
    const { mayCut, assertMayCut } = await import('../core/loop/cut-authority.js');
    for (const a of ['qualified-reader', 'pattern'] as const) expect(mayCut(a), a).toBe(true);
    for (const a of ['context-judge', 'unqualified-reader', 'owner-override'] as const) expect(() => { assertMayCut(a); }).toThrow(/may list what it finds, never cut it/);
  });
  it('every claim line names the instrument that found it', () => {
    const r = checkDraft('d', v, 'In 2021 I watched 40% of launches slip.', { material: '' });
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.authority).toBe('pattern');
  });
});

describe('an ordinary command is not the person\'s system', () => {
  it('`npm run build` and a path stay in; a project-specific script the request never gave is cut', () => {
    expect(cut('Run `npm run build`, then open `src/index.ts`.', 'The build fails.')).toBe(false);
    expect(cut('Then run `npm run migrate:down` to roll it back.', 'Roll back the release.')).toBe(true);
    expect(cut('Then run `npm run migrate:down` to roll it back.', 'Our rollback is npm run migrate:down.')).toBe(false);
  });
});

describe('measured on the coding benchmark (bench/runs): the classes it found', () => {
  it('a generic name beside "branch" is not the person\'s system; a specific one is', () => {
    expect(cut('Updating your feature branch with the latest `main`: rebase it onto `main`.', 'Explain rebase vs merge.')).toBe(false);
    expect(cut('Deploy to the `staging` service first.', 'Deploy it.')).toBe(false);
    expect(cut('Drop the old `orders_legacy` table.', 'Deploy it to production.')).toBe(true);
  });
  it('a bare answer number is not an empty list item', async () => {
    const { brokenByCut } = await import('../core/loop/run-repair.js');
    expect(brokenByCut('17 times 6 is 102. Next: nothing.', '102.\n\n17 times 6 is 102.')).toBeNull();
    expect(brokenByCut('Steps:\n\n1. One.\n2. Two.\n3. Three.', 'Steps:\n\n1. One.\n2.\n3. Three.')).toBe('an empty list item');
  });
});

describe('short pieces still get the machine-tell floor (bench/runs/0.7.0: em dashes in answers)', () => {
  const short = (i: number, s: string): { id: string; text: string } => ({ id: `a${i}`, text: s });
  const plain = ['Yes. Run the migration first, then restart the worker.', 'It is 102. Ten sixes and seven sixes.',
    'The test fails because the fixture is stale. Regenerate it and run again.', 'No. The flag only affects the dev build.',
    'Two options: keep the cache or drop it. Dropping it costs a cold start.'];

  it('a corpus of answers under 150 words, none with an em dash, gets the rule, and a short answer with one breaks it', async () => {
    const { deriveContrastRules } = await import('../core/observers/contrast.js');
    const { measure } = await import('../core/observers/registry.js');
    const rules = deriveContrastRules(plain.slice(0, 3).map((t, i) => short(i, t)), plain.slice(3).map((t, i) => short(i + 3, t)), [], 'DISCOVERED' as never);
    const tell = rules.find((r) => (r.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'MACHINE_TELL');
    expect(tell, 'no machine-tell rule proposed for short pieces').toBeTruthy();
    expect(measure('It is 102 — ten sixes and seven sixes.', tell!.requirement.measurement!).verdict).toBe('VIOLATED');
    expect(measure('It is 102. Ten sixes and seven sixes.', tell!.requirement.measurement!).verdict).not.toBe('VIOLATED');
  });

  it('polarity: an author whose short answers use em dashes is not banned from them', async () => {
    const { deriveContrastRules } = await import('../core/observers/contrast.js');
    const dashed = plain.map((t) => t.replace('. ', ' — '));
    const rules = deriveContrastRules(dashed.slice(0, 3).map((t, i) => short(i, t)), dashed.slice(3).map((t, i) => short(i + 3, t)), [], 'DISCOVERED' as never);
    const tell = rules.find((r) => (r.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'MACHINE_TELL');
    expect((tell?.requirement.measurement?.params.never as string[] | undefined) ?? []).not.toContain('EM_DASH');
  });
});
