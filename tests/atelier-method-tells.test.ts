// tests/atelier-method-tells.test.ts — NO ADDED MACHINE TELLS, ON EVERY BUILD PATH.
//
// The owner's rule: a machine tell (an em dash, a run of short verdict sentences) never appears in output beyond what
// the author writes, and never where they write none. Discovery from a folder held it; a skill built from a method
// and its examples did not, and wrote 10 to 23 em dashes a document against an example with none. The rule is worked
// out in one place (core/observers/contrast.ts, `machineTellRule`) and both paths now carry it, required.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { tellOffers } from '../core/method/standard.js';

const plain = 'We shipped the change on Tuesday. The rollout took four hours, and nothing broke. The team wrote down what went well and what did not, then planned the next step with care.\n\nThe second part of the work starts next week, after the review.';
const dashed = `${plain}\n\nOne more thing — the dashboard is late — and it matters.`;

describe('the method build carries the machine-tell rule, worked out from the examples', () => {
  it('examples with no em dash: the rule bans it, and it is required', async () => {
    const offers = tellOffers([{ id: 'a', reference: plain }]);
    expect(offers).toHaveLength(1);
    expect(offers[0].measurement).toMatchObject({ observer: 'PATTERN_RATE', params: { pattern: ['MACHINE_TELL'] } });
    expect((offers[0].measurement!.params.never as string[])).toContain('EM_DASH');
    const { decideSteps } = await import('../cli/commands/method.js');
    let n = 0; const { decided } = decideSteps(offers, () => `x${++n}`);
    expect(decided[0].materiality).toBe('REQUIRED');
  });
  it('examples that use em dashes: not banned, held to their own rate', () => {
    const offers = tellOffers([{ id: 'a', reference: dashed }]);
    expect((offers[0].measurement!.params.never as string[])).not.toContain('EM_DASH');
    expect(offers.some((o) => o.measurement?.observer === 'PATTERN_RATE' && (o.measurement.params.pattern as string[]).join() === 'EM_DASH')).toBe(true);
  });
});

describe('end to end: a skill built from a method holds an em dash its examples never use', () => {
  it('atelier verify finds it, and says so', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-mt-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-mt-proj-'));
    writeFileSync(join(proj, 'example.md'), `---\nrequest: Write the weekly update.\n---\n${plain}\n`);
    writeFileSync(join(proj, 'method.md'), '1. Open with what shipped this week.\n2. Close with the next step.\n');
    writeFileSync(join(proj, 'draft.md'), dashed);
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    const cli = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [resolve('dist/cli/atelier.mjs'), ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: `${x.stdout}${x.stderr}` }; }
    };
    expect(cli('new', 'example.md', '--method', 'method.md', '--name', 'weekly').code).toBe(0);
    const v = cli('verify', '--skill', 'weekly', 'draft.md', '--claims', 'pattern');
    expect(v.code).toBe(1);
    expect(v.out).toMatch(/machine-written|em dash/i);
  });
});

describe('a move the author makes is theirs, and their examples meet the rule they gave', () => {
  it('a run of short sentences in one of three examples is not banned', () => {
    const tweets = ['Shipped the fix at 2am. Nobody noticed. That is the job.', 'Your roadmap is a list of guesses. Date the guesses, not the features.', 'Hiring tip: ask what they deleted last quarter. Builders remember.'];
    const [rule] = tellOffers(tweets.map((reference, i) => ({ id: `t${i}`, reference })));
    expect((rule.measurement!.params.never as string[])).not.toContain('STACCATO_RUN');
    expect(rule.onExample).toBe('3 of 3 example(s) hold it');
  });
});

describe('a fix that adds no word is not judged by the reading of specifics', () => {
  // An em dash replaced by a comma was discarded because the claim reader, read again, listed one more sentence: a
  // change that adds no word cannot add an invented specific, so that count is no evidence against it.
  const line = (id: string, verdict: 'MET' | 'VIOLATED', spans = 0) => ({ requirementId: id, materiality: 'REQUIRED', result: { verdict, detail: '', spans: Array.from({ length: spans }, () => ({ start: 0, end: 1, text: 'x' })), value: null } });
  const rep = (lines: ReturnType<typeof line>[]) => ({ failed: lines.some((l) => l.result.verdict === 'VIOLATED'), checked: lines, unchecked: [] }) as never;
  it('the claim lines are left out of "worse" for such a change, and nothing else is', async () => {
    const { acceptRepair, addsNoWords } = await import('../core/loop/repair.js');
    const before = rep([line('x21', 'VIOLATED', 3), line('UNSOURCED·check', 'VIOLATED', 2)]);
    const after = rep([line('x21', 'MET'), line('UNSOURCED·check', 'VIOLATED', 3)]);
    expect(acceptRepair(before, after).ok).toBe(false);
    expect(acceptRepair(before, after, { wordsAdded: false }).ok).toBe(true);
    const worse = rep([line('x21', 'MET'), line('UNSOURCED·check', 'VIOLATED', 2), line('x3', 'VIOLATED', 1)]);
    expect(acceptRepair(rep([line('x21', 'VIOLATED', 3), line('UNSOURCED·check', 'VIOLATED', 2), line('x3', 'MET')]), worse, { wordsAdded: false }).ok).toBe(false);
    expect(addsNoWords('One more thing — the dashboard is late — and it matters.', 'One more thing, the dashboard is late, and it matters.')).toBe(true);
    expect(addsNoWords('The dashboard is late.', 'The dashboard is late by 3 weeks.')).toBe(false);
    expect(addsNoWords('Churn fell 5 points.', 'Churn fell 5% points.')).toBe(false);
    expect(addsNoWords('It costs 40 a seat.', 'It costs $40 a seat.')).toBe(false);
    expect(addsNoWords('Revenue grew 40% — fast.', 'Revenue grew 40%, fast.')).toBe(true);
    expect(addsNoWords('Churn grew 5 points.', 'Churn grew -5 points.')).toBe(false);
    // the mechanical paragraph split of a quote adds markup, not a specific
    const { splitLongParagraphs } = await import('../core/loop/mechanical-repair.js');
    const quote = `> ${['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.', 'Seven.', 'Eight.'].join(' ')}\n`;
    const split = splitLongParagraphs(quote, 3);
    expect(split).not.toBe(quote);
    expect(addsNoWords(quote, split)).toBe(true);
  });
});

describe('review: the owner\'s own words count as the author\'s writing', () => {
  it('a method note that writes em dashes, or asks for them, is not overruled by examples that hold none', () => {
    const offers = tellOffers([{ id: 'a', reference: plain }], 'Use em dashes for asides \u2014 like this \u2014 when a thought interrupts.');
    expect((offers[0].measurement!.params.never as string[])).not.toContain('EM_DASH');
  });
});

describe('review: the note allows a move only in so many words, and never by its own style', () => {
  it('"Never use em dashes" keeps the ban; a terse note is not a habit of short sentences', () => {
    for (const note of ['Never use em dashes.', "Don't use em dashes anywhere.", 'Avoid the em dash.']) {
      const [rule] = tellOffers([{ id: 'a', reference: plain }], note);
      expect((rule.measurement!.params.never as string[]), note).toContain('EM_DASH');
      expect(tellOffers([{ id: 'a', reference: plain }], note).some((o) => (o.measurement?.params.pattern as string[]).join() === 'EM_DASH'), note).toBe(false);
    }
    const [terse] = tellOffers([{ id: 'a', reference: plain }], 'Open with the result. Name the figure. Cite it. Keep it short.');
    expect((terse.measurement!.params.never as string[])).toContain('STACCATO_RUN');
  });
});

// THE OWNER'S BAN HOLDS WITH NO MODEL. With no model set up, every step was a judgement; a step banning em dashes
// blocked nothing, and the examples' own dash cap ("Keep em dashes to at most N per 1,000 words") stood beside it, so
// two dashes passed. The floor for a step that names the construction and negates it is the count at zero, read by
// code from the construction's name (core/method/step-check.ts, `dashBan`, the mirror of `allowsDash`), and the cap is
// not emitted beside a ban that will hold.
describe('a step that bans the em dash is held by the count at zero, with no model', () => {
  it('the floor reads the ban from the construction\'s name and a negation; an allowance, a placed ban, a cap or a plain mention stays judgement', async () => {
    const { STEP_CHECK, planOf, stepCheckInput } = await import('../core/method/step-check.js');
    const { outlineOf } = await import('../core/method/standard.js');
    const { countWords } = await import('../core/eval/size.js');
    const steps = [
      { id: '1', text: 'Never use em dashes.', under: null }, { id: '2', text: 'No em-dashes, ever.', under: null }, { id: '3', text: "Don't type an em dash; use a comma.", under: null },
      { id: '4', text: 'Write without em dashes.', under: null }, { id: '5', text: 'Avoid the em dash.', under: null },
      { id: '6', text: 'Use em dashes for asides.', under: null }, { id: '7', text: 'Never open with an em dash.', under: null }, { id: '8', text: 'Em dashes are fine here.', under: null }, { id: '9', text: 'Open with what shipped.', under: null },
      // a cap is not a ban: "no" negates the excess (found on the code-review starter's build, 27 Oct)
      { id: '10', text: 'No more than two em dashes in a piece.', under: null }, { id: '11', text: 'Not more than 1 em dash per section.', under: null }, { id: '12', text: 'Use at most one em-dash, never two.', under: null },
    ];
    const input = stepCheckInput(steps, [], outlineOf, countWords);
    const floor = STEP_CHECK.floor(input);
    const ban = { how: 'measure', by: 'code', measurement: { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0, anyLength: 1 } } };
    for (const id of ['1', '2', '3', '4', '5']) expect(floor[id], id).toMatchObject(ban);
    expect(floor['1'].quote).toBe('Never use em dashes');
    for (const id of ['6', '7', '8', '9', '10', '11', '12']) expect(floor[id], id).toMatchObject({ how: 'judgement', by: 'floor', measurement: null });
    // the plan a build hands the standard falls to the same floor for a step the reading did not answer
    expect(planOf(steps, {}).get('Never use em dashes.')).toMatchObject(ban);
    expect(planOf(steps, {}).get('Open with what shipped.')).toMatchObject({ how: 'judgement' });
    // a reading that said nothing of the step, or called it judgement, leaves the ban standing: a count holds a ban exactly
    const read = STEP_CHECK.ground({ checks: [{ id: '1', how: 'judgement', measure: null, source: null, quote: 'Never use em dashes', means: 'style' }, { id: '9', how: 'judgement', measure: null, source: null, quote: 'Open with what shipped', means: 'yours' }] }, input)!;
    expect(read['1']).toMatchObject(ban); expect(read['2']).toMatchObject(ban); expect(read['9']).toMatchObject({ how: 'judgement', by: 'model' });
  });
  it('the examples\' cap is not offered beside a confirmed ban, and the conflict is counted', () => {
    const stated = [{ statement: 'Never use em dashes.', origin: 'STATED' as const, obligation: 'DELIVERABLE' as const, measurement: { observer: 'PATTERN_RATE' as const, params: { pattern: ['EM_DASH'], maxPer1000: 0, anyLength: 1 } }, onExample: null, conflict: 'your examples use em dashes in 1 of 1 pieces; your rule bans it; kept as you wrote it' }];
    const conflicts: string[] = [];
    const withCap = tellOffers([{ id: 'a', reference: dashed }], 'Never use em dashes.', stated, false, conflicts);
    expect(withCap.some((o) => o.statement.startsWith('Keep em dashes'))).toBe(true);
    expect(conflicts).toEqual([]);
    const banned = tellOffers([{ id: 'a', reference: dashed }], 'Never use em dashes.', stated, true, conflicts);
    expect(banned.some((o) => o.statement.startsWith('Keep em dashes'))).toBe(false);
    expect(conflicts).toEqual(['1 ban over an examples\' rate']);
  });
  it('end to end, built offline with --no-model from examples that carry dashes: a draft with two em dashes is BLOCKED on the ban, and the standard holds no cap', async () => {
    const store = await import('../core/state/store.js');
    const data = mkdtempSync(join(tmpdir(), 'atelier-mtb-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-mtb-proj-'));
    mkdirSync(join(proj, 'examples'));
    for (const n of [1, 2, 3]) writeFileSync(join(proj, 'examples', `e${n}.md`), `---\nrequest: Write the weekly update ${n}.\n---\n${dashed}\n`);
    writeFileSync(join(proj, 'method.md'), '1. Never use em dashes.\n2. Open with what shipped this week.\n');
    writeFileSync(join(proj, 'draft.md'), `We shipped the change on Tuesday — the rollout took four hours. The team wrote down what went well — then planned the next step with care.\n\nThe second part of the work starts next week, after the review.`);
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_PROVIDER;
    const cli = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [resolve('dist/cli/atelier.mjs'), ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: `${x.stdout}${x.stderr}` }; }
    };
    const b = cli('new', 'examples', '--method', 'method.md', '--name', 'nodash', '--no-model', '--yes', '--report');
    expect(b.code, b.out).toBe(0);
    const L = { root: data, skillName: 'nodash' };
    const v = store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!;
    const live = v.requirements.filter((r) => r.authority !== 'EXPERT_REJECTED');
    expect(live.some((r) => r.statement.startsWith('Keep em dashes'))).toBe(false);
    const ban = live.find((r) => r.statement === 'Never use em dashes.')!;
    expect(ban.measurement).toMatchObject({ observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0 } });
    expect(ban.materiality).toBe('REQUIRED');
    // the receipt says the ban was read by code and that it removed the examples' cap; the build screen says it too
    const stage = store.getReceipt(L, store.getActive(L)!)!.stages.find((s) => s.id === 'method')!;
    expect(stage).toMatchObject({ ran: true, by: 'code', conflicts: ['1 ban over an examples\' rate'], detail: "2 step(s) served whole; 1 of 2 checked; 1 ban over an examples' rate" });
    expect(b.out).toContain("Stages: method ✓ (2 step(s) served whole; 1 of 2 checked; 1 ban over an examples' rate)");
    const vf = cli('verify', '--skill', 'nodash', 'draft.md', '--claims', 'pattern');
    expect(vf.code, vf.out).toBe(1);
    expect(vf.out).toMatch(/BLOCKED/);
    expect(vf.out).toMatch(new RegExp(`${ban.requirementId}\\b[^\\n]*Never use em dashes`));
  }, 120_000);
});
