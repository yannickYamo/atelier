// tests/atelier-composite-keyless.test.ts — PIECES BY SEVERAL AUTHORS, WITH NO MODEL SET UP, THROUGH THE SHIPPED BINARY.
//
// Keyless `atelier new` on a folder whose pieces say `author:` in their front matter pooled every author into one,
// printed no authors line, showed no composite screen, and served the pieces with their front matter in them. The
// authors are declared, so telling them apart needs no model: each author's pieces are counted on their own, the trait
// table and the composite screen follow, the person's lines are read by their words, and no served piece carries its
// front matter, on this path or the one-author path.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
const fm = (who: string, body: string): string => `---\nauthor: ${who}\n---\n${body}\n`;
const PIECES: Record<string, string> = {
  'ada.md': fm('Ada', Array.from({ length: 12 }, (_, i) => `Why does the lighthouse keeper count the ships at dusk, night ${i + 1}? Because the harbour master asks for the tally before the tide turns.`).join('\n\n')),
  'bea.md': fm('Bea', Array.from({ length: 4 }, (_, p) => Array.from({ length: 8 }, (_, i) => `In ${2010 + i}, the harbour ledger recorded ${40 + i + p} percent more arrivals than the year before, according to the port authority survey ${p + 1}.`).join(' ')).join('\n\n')),
  'cal.md': fm('Cal', Array.from({ length: 80 }, (_, i) => `The sprint starts. Lap ${i + 1}. No pause. Faster now, then faster still, and the crowd leans in to watch.`).join('\n\n')),
  'dee.md': fm('Dee', Array.from({ length: 10 }, (_, i) => `The protocol requires that each committee member shall submit item ${i + 1} in writing. It is not permitted to amend the record after the session has closed, and the chair will not accept late submissions.`).join('\n\n')),
};

const project = (pieces: Record<string, string>): { data: string; proj: string; run: (...a: string[]) => string } => {
  const base = mkdtempSync(join(tmpdir(), 'atelier-keyless-'));
  const data = join(base, 'data'); const proj = join(base, 'proj');
  mkdirSync(join(proj, 'writers'), { recursive: true });
  for (const [f, t] of Object.entries(pieces)) writeFileSync(join(proj, 'writers', f), t);
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_PROVIDER;
  const run = (...args: string[]): string => {
    try { return execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env }); } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
    }
  };
  return { data, proj, run };
};

describe('keyless atelier new on pieces by four authors', () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  const p = project(PIECES);
  const first = p.run('new', 'writers', 'a column combining what I like', '--name', 'mix');
  const builtAfterFirst = existsSync(join(p.proj, '.claude', 'skills', 'mix'));
  const second = p.run('new', 'writers', '--admire', 'ada.md=above all, how it opens', '--admire', 'cal.md=the speed and the short sentences', '--accept');
  const skill = join(p.proj, '.claude', 'skills', 'mix');

  it('names the authors, counts each one alone, and asks what is liked before building anything', () => {
    expect(first).not.toMatch(/^EXIT/);
    expect(first).toContain('4 piece(s) by 4 authors (author: in each piece): each is read on its own first. Ada, Bea, Cal, Dee.');
    for (const who of ['Ada', 'Bea', 'Cal', 'Dee']) expect(first).toMatch(new RegExp(`rule\\(s\\) counted from ${who}'s pieces alone`));
    expect(first).toContain('Counted only: no model read them.');
    // one count of the table, said the same way on both lines
    const counts = [...first.matchAll(/(\d+) rule\(s\) read, each author on their own: (\d+) shared, (\d+) unique to one author, (\d+) in conflict between authors/g)].map((m) => m.slice(1).join('/'));
    expect(counts.length).toBe(2);
    expect(counts[0]).toBe(counts[1]);
    expect(first).toContain('For each author, say what you like about their pieces');
    expect(builtAfterFirst).toBe(false);
  });
  it('shows the composite screen, the lines read by their words, and builds the combination', () => {
    expect(second).not.toMatch(/^EXIT/);
    expect(second).toContain('(your lines were read by their words, not by a model)');
    expect(second).toContain('Your composite:');
    expect(second).toMatch(/From Cal: pacing and paragraph construction/);
    expect(second).toContain('Your composite is recorded');
    expect(existsSync(join(skill, 'SKILL.md'))).toBe(true);
  });
  it('serves no piece with its front matter, and says the composite in its own words', () => {
    const served = readdirSync(join(skill, 'examples')).filter((f) => f.startsWith('voice-'));
    expect(served.length).toBeGreaterThan(0);
    for (const f of served) expect(readFileSync(join(skill, 'examples', f), 'utf8')).not.toMatch(/^---$|author:/m);
    const md = readFileSync(join(skill, 'SKILL.md'), 'utf8');
    expect(md).toContain('My voice is a composite');
    expect(md).toContain('Take from each writer only what is named for them above.');
    expect(md).not.toContain('Take who is speaking, the register, the hedging');
  });
});

describe('a composite built again with --piece-budget default', () => {
  it('serves each chosen writer\'s piece whole', () => {
    const p = project(PIECES);
    p.run('new', 'writers', 'a column combining what I like', '--name', 'mix');
    p.run('new', 'writers', '--admire', 'cal.md=the speed and the short sentences', '--accept');
    const voice = (): string => readFileSync(join(p.proj, '.claude', 'skills', 'mix', 'examples', 'voice-1.md'), 'utf8');
    expect(voice()).toContain('[…]');
    const out = p.run('build', '--name', 'mix', '--piece-budget', 'default');
    expect(out).not.toMatch(/^EXIT/);
    expect(voice()).not.toContain('[…]');
    expect(voice()).toContain('Lap 80.');
  });
});

describe('keyless atelier new on one author whose pieces carry front matter', () => {
  it('serves the pieces without it', () => {
    const one = Object.fromEntries(['one', 'two', 'three', 'four'].map((n, k) => [`${n}.md`, `---\ntopic: harbour ${k}\n---\n${Array.from({ length: 6 }, (_, i) => `The harbour wakes slowly on day ${i + k}, and the gulls are first to say so.`).join('\n\n')}\n`]));
    const p = project(one);
    const out = p.run('new', 'writers', 'a harbour column', '--name', 'solo');
    expect(out).not.toMatch(/^EXIT/);
    expect(out).not.toMatch(/by \d+ authors/);
    const dir = join(p.proj, '.claude', 'skills', 'solo', 'examples');
    const served = readdirSync(dir).filter((f) => f.startsWith('voice-') || f === 'exemplar.md');
    expect(served.length).toBeGreaterThan(0);
    for (const f of served) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/topic:/);
  });
});
