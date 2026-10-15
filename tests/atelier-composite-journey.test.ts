// tests/atelier-composite-journey.test.ts — "HERE ARE FIVE EXAMPLES FROM DIFFERENT AUTHORS", THROUGH THE SHIPPED BINARY.
//
// `atelier new` on a folder of five pieces, each by an invented author named in its front matter, against a scripted
// backend that answers each author's reading with that author's own rules. Discovery reads each author alone; the
// person says what they like about each; the composite screen shows what is taken from whom and the conflict; accepting
// builds a skill whose voice is that combination. A rebuild, and the same answers in a fresh project, change nothing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;

const rule = (statement: string, from: string) => ({ statement, appliesWhen: 'GENERAL', evidence: '', evidenceItemId: from, kind: 'GENERATIVE', wouldBeAbsentIf: 'the opposite shows' });

beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
  // Each author's reading answers with that author's rules: the request carries only their piece, so a word of theirs routes it.
  const by = (word: string, rules: object[]) => ({ containsAll: ['emit_rules', word], answer: { rules } });
  await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({
    byTool: {
      emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }] },
      emit_admired: { picks: [{ author: 'Ada', classes: ['opening'] }, { author: 'Bea', classes: ['evidence'] }, { author: 'Cal', classes: ['pace'] }, { author: 'Eli', classes: ['opening'] }] },
    },
    when: [
      by('lighthouse', [rule('Open with a question the reader is already asking.', 'ada.md'), rule('Never let a paragraph run past two sentences.', 'ada.md')]),
      by('ledger', [rule('Back every claim with a cited figure and its source.', 'bea.md'), rule('Let a paragraph run to eight sentences when the argument needs room.', 'bea.md')]),
      // the two vantages of a two-rule reading read the same two rules
      { containsAll: ['emit_matches', 'past two sentences'], answer: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }, { leftIndex: 1, matchedRightIndex: 1 }] } },
      { containsAll: ['emit_matches', 'eight sentences'], answer: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }, { leftIndex: 1, matchedRightIndex: 1 }] } },
      by('sprint', [rule('Keep the pace fast with sentence fragments.', 'cal.md')]),
      by('protocol', [rule('Never use contractions; keep a formal register.', 'dee.md')]),
      by('kettle', [rule('Open on a short scene from a story, then turn to the point.', 'eli.md')]),
    ],
  }) });
});
afterAll(() => { backend.kill(); });

const run = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
      encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' },
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};

// THE FIVE AUTHORS, each written to their label.
const fm = (who: string, body: string): string => `---\nauthor: ${who}\n---\n${body}\n`;
const PIECES: Record<string, string> = {
  // A: question openings, short paragraphs (two sentences)
  'ada.md': fm('Ada', Array.from({ length: 12 }, (_, i) => `Why does the lighthouse keeper count the ships at dusk, night ${i + 1}? Because the harbour master asks for the tally before the tide turns.`).join('\n\n')),
  // B: dense evidence, long paragraphs (eight sentences)
  'bea.md': fm('Bea', Array.from({ length: 4 }, (_, p) => Array.from({ length: 8 }, (_, i) => `In ${2010 + i}, the harbour ledger recorded ${40 + i + p} percent more arrivals than the year before, according to the port authority survey ${p + 1}.`).join(' ')).join('\n\n')),
  // C: fast pace, fragments
  'cal.md': fm('Cal', Array.from({ length: 14 }, (_, i) => `The sprint starts. Lap ${i + 1}. No pause. Faster now, then faster still, and the crowd leans in to watch.`).join('\n\n')),
  // D: formal, no contractions
  'dee.md': fm('Dee', Array.from({ length: 10 }, (_, i) => `The protocol requires that each committee member shall submit item ${i + 1} in writing. It is not permitted to amend the record after the session has closed, and the chair will not accept late submissions.`).join('\n\n')),
  // E: narrative openings
  'eli.md': fm('Eli', [`The kettle whistled in the empty kitchen while my grandmother read the letter twice and folded it into her apron pocket.`,
    ...Array.from({ length: 10 }, (_, i) => `That morning taught me point ${i + 1} about waiting: the news you fear arrives quietly, and the people who love you make tea first.`)].join('\n\n')),
};
const LIFTED = 'It is not permitted to amend the record after the session has closed, and the chair will not accept late submissions.';

const folder = (proj: string): string => {
  const dir = join(proj, 'writers');
  mkdirSync(dir, { recursive: true });
  for (const [f, t] of Object.entries(PIECES)) writeFileSync(join(dir, f), t);
  return dir;
};
const ADMIRE = ['--admire', 'ada.md=the way it opens', '--admire', 'bea.md=how deep the evidence goes', '--admire', 'Cal=the speed of it', '--admire', 'eli.md=the story at the start'];
const PURPOSE = 'an essay that combines what I like about each of these';
const runsFile = (data: string, name: string): string => { const r = join(data, 'runs'); const d = readdirSync(r).find((x) => existsSync(join(r, x, name))); return d ? join(r, d, name) : ''; };
const skillFiles = (proj: string, name: string): Record<string, string> => {
  const base = join(proj, '.claude', 'skills', name);
  const ex = join(base, 'examples');
  return { 'SKILL.md': readFileSync(join(base, 'SKILL.md'), 'utf8'),
    ...Object.fromEntries((existsSync(ex) ? readdirSync(ex) : []).sort().map((f) => [f, readFileSync(join(ex, f), 'utf8')])) };
};

describe('atelier new on five pieces by five authors', () => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-mix-data-'));
  const proj = mkdtempSync(join(tmpdir(), 'atelier-mix-proj-'));
  const dir = folder(proj);
  let first = ''; let second = ''; let third = '';
  const builtAfter: boolean[] = [];
  const built = (): boolean => existsSync(join(proj, '.claude', 'skills', 'mix', 'SKILL.md'));
  beforeAll(() => {
    first = run(data, proj, 'new', dir, PURPOSE, '--name', 'mix'); builtAfter.push(built());
    second = run(data, proj, 'new', dir, ...ADMIRE); builtAfter.push(built());
    third = run(data, proj, 'new', dir, '--accept');
    if (process.env.COMPOSITE_DUMP) writeFileSync(process.env.COMPOSITE_DUMP, [first, second, third].join('\n=====\n'));
  }, 300_000);

  it('says the pieces are by several authors, each read on its own first, and holds none back', () => {
    expect(first).toMatch(/5 piece\(s\) by 5 authors \(author: in each piece\): each is read on its own first\. Ada, Bea, Cal, Dee, Eli\./);
    expect(first).not.toMatch(/Held back before anything reads them/);
    for (const a of ['Ada', 'Bea', 'Cal', 'Dee', 'Eli']) expect(first).toMatch(new RegExp(`${a}: 1 piece\\(s\\), read in one pass`));
  });

  it('every proposal names its author, and every counted band is one author\'s: none is pooled', () => {
    const table = JSON.parse(readFileSync(runsFile(data, 'trait-table.json'), 'utf8')) as { rows: { id: string; author: string; cls: string }[]; conflicts: { label: string; sides: { author: string }[] }[] };
    const authorsOf = new Map<string, Set<string>>();
    for (const r of table.rows) authorsOf.set(r.id, new Set([...(authorsOf.get(r.id) ?? []), r.author]));
    for (const [, a] of authorsOf) expect(a.size).toBe(1);
    const authorOfRule = (re: RegExp): string | undefined => table.rows.find((r) => re.test(r.id) && r.author)?.author;
    expect(authorOfRule(/^p1$/)).toBe('Ada');
    expect(table.rows.filter((r) => r.id.startsWith('m')).length).toBeGreaterThan(0);
    // A's short paragraphs against B's long ones: one conflict, never averaged
    expect(table.conflicts.some((c) => c.label === 'paragraph length' && c.sides.map((s) => s.author).sort().join() === 'Ada,Bea')).toBe(true);
  });

  it('asks what the person likes about each before choosing anything, and builds nothing', () => {
    expect(first).toMatch(/Your skill is the combination you choose, so nothing is chosen yet/);
    expect(first).toMatch(/--admire ada\.md="<what you like about it>"/);
    expect(builtAfter[0]).toBe(false);
  });

  it('shows one composite screen: what comes from whom, the conflict, and what is left', () => {
    expect(second).toMatch(/From Ada: openings/);
    expect(second).toMatch(/From Bea: evidence and its depth/);
    expect(second).toMatch(/From Cal: pacing and paragraph construction/);
    expect(second).toMatch(/From Eli: openings/);
    expect(second).toMatch(/Dee: nothing said, so nothing is taken from this author alone/);
    expect(second).toMatch(/\d\. paragraph length[^\n]*\n {6}A {2}Ada: Never let a paragraph run past two sentences\.\n {6}B {2}Bea: Let a paragraph run to eight sentences[^\n]*\n {6}→ open: neither instructs/);
    expect(second).toMatch(/Nothing was decided/);
    expect(builtAfter[1]).toBe(false);
  });

  it('accepting builds the combination: a composite voice, one excerpt from each chosen author, labelled as theirs', () => {
    expect(third).toMatch(/Your composite is recorded/);
    expect(third).toMatch(/conflict\(s\) kept as open question\(s\)/);
    const files = skillFiles(proj, 'mix');
    const md = files['SKILL.md'];
    expect(md).toMatch(/My voice is a composite/);
    expect(md).toMatch(/- From Ada: openings\. Taken as: "Open with a question the reader is already asking"/);
    expect(md).toMatch(/- From Bea: evidence and its depth/);
    expect(md).not.toMatch(/- From Dee/);
    const voices = Object.entries(files).filter(([f]) => f.startsWith('voice-'));
    const whose = voices.map(([, t]) => /^\[voice-\d+\] [^\n]*?piece by (\w+)/.exec(t)?.[1]).sort();
    expect(whose).toEqual(['Ada', 'Bea', 'Cal', 'Eli']);
    // Dee's piece is not served, and the record says what was chosen from whom
    expect(voices.some(([, t]) => t.includes('protocol requires'))).toBe(false);
    const comp = JSON.parse(readFileSync(join(data, 'skills', 'mix', 'composite.json'), 'utf8')) as { decisions: { id: string; outcome: string; author: string }[]; conflicts: { answer: string | null }[] };
    expect(comp.decisions.find((d) => d.author === 'Dee' && d.id.startsWith('p'))?.outcome).toBe('REJECTED');
    expect(comp.conflicts.some((c) => c.answer === null)).toBe(true);
  });

  it('a phrase lifted from any author is copying, served or not', () => {
    const f = join(proj, 'lifted.md');
    writeFileSync(f, `A new essay on the harbour. ${LIFTED} The rest is mine and says something else entirely about tides.`);
    const out = run(data, proj, 'verify', '--skill', 'mix', f, '--claims', 'pattern', '--json');
    const json = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, unknown>;
    // the lifted sentence is Dee's, whose piece the skill does not serve
    expect(JSON.stringify(json)).toMatch(/"id":"lifted"[^}]*"evidence":"a run of (1[2-9]|[2-9]\d) words[^}]*\}[^}]*"result":"FAIL"/);
  });

  it('a rebuild serves the same combination, byte for byte', () => {
    const before = skillFiles(proj, 'mix');
    run(data, proj, 'build', '--name', 'mix');
    expect(skillFiles(proj, 'mix')).toEqual(before);
  });

  it('the same answers in a fresh project give the same composite and the same served files', () => {
    const d2 = mkdtempSync(join(tmpdir(), 'atelier-mix-data-')); const p2 = mkdtempSync(join(tmpdir(), 'atelier-mix-proj-'));
    const out = run(d2, p2, 'new', folder(p2), PURPOSE, '--name', 'mix', ...ADMIRE, '--accept');
    expect(out).toMatch(/From Ada: openings/);   // shown before it is recorded
    expect(readFileSync(join(d2, 'skills', 'mix', 'composite.json'), 'utf8')).toBe(readFileSync(join(data, 'skills', 'mix', 'composite.json'), 'utf8'));
    const a = skillFiles(proj, 'mix'); const b = skillFiles(p2, 'mix');
    const stamp = (t: string): string => t.replace(/^mintedAt: .*$/m, '');
    expect(Object.keys(b)).toEqual(Object.keys(a));
    for (const k of Object.keys(a)) expect(stamp(b[k]), k).toBe(stamp(a[k]));
  }, 120_000);
});

describe('a folder by one author behaves exactly as before', () => {
  it('no authors line, no composite step, no composite record', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-one-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-one-proj-'));
    const dir = join(proj, 'posts'); mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 4; i++) writeFileSync(join(dir, `post-${i}.md`), `Post ${i}. ${'Why does the lighthouse keeper count the ships at dusk? Because the tally is due. '.repeat(10)}`);
    const out = run(data, proj, 'new', dir, PURPOSE, '--name', 'one');
    expect(out).not.toMatch(/authors/);
    expect(out).toMatch(/rule\(s\) read from your work/);
    expect(out).not.toMatch(/What do you like|composite/i);
    expect(existsSync(join(data, 'skills', 'one', 'composite.json'))).toBe(false);
  });
});
