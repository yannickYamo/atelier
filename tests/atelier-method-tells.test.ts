// tests/atelier-method-tells.test.ts — NO ADDED MACHINE TELLS, ON EVERY BUILD PATH.
//
// The owner's rule: a machine tell (an em dash, a run of short verdict sentences) never appears in output beyond what
// the author writes, and never where they write none. Discovery from a folder held it; a skill built from a method
// and its examples did not, and wrote 10 to 23 em dashes a document against an example with none. The rule is worked
// out in one place (core/observers/contrast.ts, `machineTellRule`) and both paths now carry it, required.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
  });
});

describe('review: the owner\'s own words count as the author\'s writing', () => {
  it('a method note that writes em dashes, or asks for them, is not overruled by examples that hold none', () => {
    const offers = tellOffers([{ id: 'a', reference: plain }], 'Use em dashes for asides \u2014 like this \u2014 when a thought interrupts.');
    expect((offers[0].measurement!.params.never as string[])).not.toContain('EM_DASH');
  });
});
