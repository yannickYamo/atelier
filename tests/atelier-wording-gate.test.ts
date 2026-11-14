// THE GATE ON WHAT A PERSON READS OF A CHECK (core/eval/wording.ts). Two halves. Every state an entry can reach is
// enumerated and must come to one of the five kinds, said in the table's words. Then the front door is run through the
// shipped binary on the scripted backend (run, fix, verify; the direct writer and the compiled engine `fix` replays
// through): every line printed is one of the allowed shapes, and no word of the machinery reaches the person.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { entry, type Coverage, type Qualification } from '../core/eval/record.js';
import { kindOf, linesOf, SAID, OUTCOME_SAID } from '../core/eval/wording.js';

const PREFIXES = Object.values(SAID);
const OUTCOMES = Object.values(OUTCOME_SAID).join('|');

describe('every state an entry can reach', () => {
  it('comes to one of five kinds or to nothing, and is said only in the table\'s words', () => {
    const kinds = new Set<string>(); let states = 0;
    for (const applies of [true, false, { setAside: 'lifted' }, { replacedBy: 'the request' }] as const)
      for (const verdict of ['MET', 'VIOLATED', null] as const)
        for (const coverage of ['FULL', 'PARTIAL', 'NONE'] as Coverage[])
          for (const qualification of ['DETERMINISTIC', 'QUALIFIED', 'UNQUALIFIED', 'UNAVAILABLE'] as Qualification[])
            for (const required of [true, false])
              for (const listed of [false, true])
                for (const proposition of ['counts it', null])
                  for (const evidence of ['2 found', 'listed for you to check: 1 possible slip: "are" (agreement: "are" → "is")', null])
                    for (const incomplete of [undefined, 'the check did not run']) {
                      const e = entry({ id: 'r', dimension: 'STANDARD', source: 'METHOD', statement: 'A rule.', required, applies, verdict,
                        observation: { proposition, coverage, qualification, evidence, ...(listed ? { listed: true as const } : {}), ...(incomplete ? { incomplete } : {}) } });
                      states += 1;
                      const kind = kindOf(e);
                      kinds.add(String(kind));
                      expect(['held', 'broken', 'unchecked', 'judge', 'look', null]).toContain(kind);
                      for (const l of linesOf(e)) expect(PREFIXES.some((p) => l.startsWith(`  ${p}`)), l).toBe(true);
                      // what a believed check saw fail is never said as anything but broken, and what any check found broken is never silent
                      if (required && e.result === 'FAIL') expect(kind).toBe('broken');
                      if (required && e.observation.found === 'VIOLATED') { expect(kind).toBe('look'); expect(linesOf(e)).toHaveLength(1); }
                      if (kind === 'held' || kind === 'judge') expect(e.result).not.toBe('FAIL');
                    }
    expect(states).toBe(6912);
    expect([...kinds].sort()).toEqual(['broken', 'held', 'judge', 'look', 'null', 'unchecked']);
  });
});

const CLI = resolve('dist/cli/atelier.mjs');
const FX = resolve('tests/fixtures/reaction-case');
const DRAFT = '# The wharf, this week\n\nThe council voted to keep the wharf open. I walked it on Tuesday and counted the boats. Most of them were working boats. That is the part the vote was about.';
const CONTRAST = `${DRAFT} It isn't a harbour, it's a car park.`;
const FIXED = `${DRAFT} The boats stay.`;
const CHECKS = { checks: [
  { id: '1', how: 'judgement', measure: null, source: null, quote: 'No AI tells', means: 'yours to judge' },
  { id: '2', how: 'measure', measure: 'PATTERN_RATE:pattern=EM_DASH,maxPer1000=0', source: null, quote: 'No em dashes', means: 'no em dash' },
  { id: '3', how: 'measure', measure: 'PATTERN_RATE:pattern=NOT_X_ITS_Y,maxPer1000=0', source: null, quote: 'not X, it\'s Y', means: 'no "not X, it\'s Y"' },
  { id: '4', how: 'judgement', measure: null, source: null, quote: 'No named sources', means: 'yours to judge' }] };

let backend: ChildProcess; let port = 0;
beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
}, 60_000);
afterAll(() => { backend.kill(); });

const set = (byTool: Record<string, unknown>): Promise<unknown> => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool }) });
interface Said { code: number; out: string; err: string }
const session = (): ((...a: string[]) => Said) & { proj: string } => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-gate-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gate-proj-'));
  const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', ATELIER_CONTEXT_READER: 'scripted' };
  const run = (...a: string[]): Said => { const r = spawnSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env }); return { code: r.status ?? 1, out: r.stdout, err: r.stderr }; };
  return Object.assign(run, { proj });
};
const be = (): string[] => ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
const NEW = (): string[] => ['new', join(FX, 'voice'), '--method', join(FX, 'rules.md'), '--name', 'post-voice', '--yes', '--latitude', 'creative', ...be()];
const RUN = (): string[] => ['run', 'Write a post on this week\'s news about the wharf.', '--skill', 'post-voice', '--claims', 'pattern', '--no-questions', ...be()];

/** Every shape of line a person may read under a piece, from run, fix or verify. Nothing else is allowed. */
const ALLOWED: readonly RegExp[] = [
  /^$/,
  new RegExp(`^(${OUTCOMES})\\. Checked: `),
  new RegExp(`^(${OUTCOMES})\\.$`),
  new RegExp(`^(${OUTCOMES}): see under the piece\\.$`),
  new RegExp(`^ {2}(${PREFIXES.map((p) => p.replace(/[?]/g, '\\?')).join('|')})`),
  /^ {6}› /,
  /^(Not right\?|To fix it) atelier fix "/,
  /^Every check, rule by rule: add --report$/,
  /^This is the first draft: the review of it was not used, because it broke a rule the draft held \(/,
  /^The whole piece was written again with what you said/,
  /^About your last run of \//, /^You said: "/, /^Writing it again with what you said\.$/, /^Only this piece changed\. /,
];
/** Words of the machinery. None may reach the person, on either stream. */
const MACHINERY = /\b(BLOCKED|NEEDS[_ ]REVIEW|VERIFIED|SHIP(_LABELLED)?|OBSERVER_UNQUALIFIED|NOT_MACHINE_CHECKABLE|PARTLY_CHECKED|LISTED_FOR_YOU)\b|trusted-fail|untrusted-|judgement-unread|Delivery:|Judgement reader|compiled path|--pipeline|not yet qualified|has not qualified/;
const gate = (what: string, r: Said, piece: string): void => {
  const said = r.out.replace(piece, '');
  for (const l of said.split('\n')) expect(ALLOWED.some((a) => a.test(l)), `${what}: not an allowed line: ${JSON.stringify(l)}`).toBe(true);
  expect(`${r.out}\n${r.err}`, what).not.toMatch(MACHINERY);
  expect(r.out, what).toMatch(new RegExp(`^(${OUTCOMES})\\.`, 'm'));
};

describe('the front door, through the binary', () => {
  it('a run that holds, a fix of it through the compiled engine, and a check of two drafts', async () => {
    const c = session();
    await set({ emit_step_checks: CHECKS, __plain: [DRAFT, DRAFT] });
    expect(c(...NEW()).code).toBe(0);
    await set({ __plain: [DRAFT, DRAFT] });
    const ran = c(...RUN());
    expect(ran.code).toBe(0);
    gate('run, clean', ran, DRAFT);
    expect(ran.out).toMatch(/^Ready\. Checked: /m);
    await set({ emit_piece: { piece: FIXED }, __plain: [FIXED] });
    const fixed = c('fix', 'the ending is flat', '--skill', 'post-voice', '--claims', 'pattern', ...be());
    expect(fixed.code).toBe(0);
    gate('fix', fixed, FIXED);
    writeFileSync(join(c.proj, 'bad.md'), CONTRAST); writeFileSync(join(c.proj, 'good.md'), DRAFT);
    const bad = c('verify', '--skill', 'post-voice', 'bad.md', '--claims', 'pattern');
    gate('verify, a broken ban', bad, '\u0000');
    expect(bad.out).toMatch(/^Needs a fix\.$/m);
    const good = c('verify', '--skill', 'post-voice', 'good.md', '--claims', 'pattern');
    gate('verify, clean', good, '\u0000');
    expect(good.out).toMatch(/^Ready\.$/m);
  }, 180_000);
  it('a run that breaks a required rule, and a run whose review is set aside', async () => {
    const c = session();
    await set({ emit_step_checks: CHECKS, __plain: [CONTRAST, CONTRAST], emit_replacements: { rewriteSpans: [] } });
    expect(c(...NEW()).code).toBe(0);
    expect(c('amend', '--skill', 'post-voice', '--consequence', 'trusted-fail=block,untrusted-fail=block', '--reason', 'a broken ban is to be fixed').code).toBe(0);
    await set({ __plain: [CONTRAST, CONTRAST, CONTRAST, CONTRAST], emit_replacements: { rewriteSpans: [] } });
    const broke = c(...RUN());
    expect(broke.code).toBe(1);
    gate('run, a broken rule', broke, CONTRAST);
    expect(broke.out).toMatch(/^Needs a fix\. Checked: 1 of your rules is not met/m);
    const d = session();
    await set({ emit_step_checks: CHECKS, __plain: [DRAFT, CONTRAST] });
    expect(d(...NEW()).code).toBe(0);
    await set({ __plain: [DRAFT, CONTRAST], emit_replacements: { rewriteSpans: [] } });
    const aside = d(...RUN());
    gate('run, the review set aside', aside, DRAFT);
    expect(aside.out).toContain('This is the first draft');
  }, 180_000);
});
