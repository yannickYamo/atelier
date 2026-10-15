// tests/atelier-composite-keyless.test.ts — PIECES BY SEVERAL AUTHORS, WITH NO MODEL SET UP, THROUGH THE SHIPPED BINARY.
//
// Keyless `atelier new` on a folder whose pieces say `author:` in their front matter pooled every author into one,
// printed no authors line, and served the pieces with their front matter in them. The authors are declared, so telling
// them apart needs no model: each author's pieces are counted on their own, the combination is inferred and built in
// the same call with nothing asked, and no served piece carries its front matter, on this path or the one-author path.
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
  const skill = join(p.proj, '.claude', 'skills', 'mix');

  it('names the authors, counts each one alone, and builds the combination in the same call, asking nothing', () => {
    expect(first).not.toMatch(/^EXIT/);
    expect(first).toContain('4 piece(s) by 4 authors (author: in each piece): each is read on its own first. Ada, Bea, Cal, Dee.');
    for (const who of ['Ada', 'Bea', 'Cal', 'Dee']) expect(first).toMatch(new RegExp(`rule\\(s\\) counted from ${who}'s pieces alone`));
    expect(first).toContain('Counted only: no model read them.');
    expect([...first.matchAll(/(\d+) rule\(s\) read, each author on their own: (\d+) shared, (\d+) unique to one author, (\d+) in conflict between authors/g)]).toHaveLength(1);
    expect(first).not.toMatch(/What do you like|--admire|--accept|Nothing was decided/);
    expect(first.split('\n').filter((l) => l.startsWith("Combined 4 writers: "))).toHaveLength(1);
    // with no model to read the final instructions, the build says how clashes between voices were found
    expect(first).toContain('(clashes between voices were found by keyword only: a whole-piece structure rule may still sit beside a structure it rules out; atelier report --skill <name> lists what instructs)');
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
    const dir = join(p.proj, '.claude', 'skills', 'mix', 'examples');
    const cal = (): string => readdirSync(dir).filter((f) => f.startsWith('voice-')).map((f) => readFileSync(join(dir, f), 'utf8')).find((t) => t.includes('The sprint starts')) ?? '';
    expect(cal()).toContain('[…]');
    const out = p.run('build', '--name', 'mix', '--piece-budget', 'default');
    expect(out).not.toMatch(/^EXIT/);
    expect(cal()).not.toContain('[…]');
    expect(cal()).toContain('Lap 80.');
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

describe('an author below the counting floor', () => {
  it('is told why nothing was counted, and the build goes on without asking', () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    const eve = fm('Eve', 'The ferry left late again this morning. Nobody on the quay seemed to mind the wait. The gulls took the bread from the bench. By noon the water had gone flat and grey, and the town went back to work.');
    const p = project({ ...PIECES, 'eve.md': eve });
    const out = p.run('new', 'writers', 'a column', '--name', 'mix');
    expect(out).toContain("nothing could be counted from Eve's 1 piece(s) (4 sentence(s), 1 paragraph(s), 40 word(s)): an author is counted from at least 30 sentences, 10 paragraphs or 1,000 words of their pieces read together");
    expect(out).not.toMatch(/--admire|What do you like/);
    expect(out.split('\n').filter((l) => l.startsWith("Combined 5 writers: "))).toHaveLength(1);
  });
});
