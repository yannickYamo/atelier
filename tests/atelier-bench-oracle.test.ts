// THE BENCH'S ORACLE READS THE CLAIM FILE, AND TEST 3 READS GOLDENS NO BUILD SAW. A figure in any file of the claim file
// (a policy number, a report's reference) is the file's, not invented; each domain holds one golden out of every build.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = 'bench/standing/domains';
const strip = (t: string): string => t.replace(/^---\n[\s\S]*?\n---\n/, '');

describe('the claims oracle, R8', () => {
  it('a figure the claim file gives is not invented; one it does not give is', async () => {
    const { check } = await import(/* @vite-ignore */ pathToFileURL(resolve(D, 'claims', 'check.mjs')).href) as { check: (t: string, r: { id: string }) => { fails: string[] } };
    const golden = strip(readFileSync(join(D, 'claims', 'held-out', 'e10.md'), 'utf8'));
    expect(check(golden, { id: 'e10' }).fails).toEqual([]);
    // the policy number and the police report's reference are in e10's file
    expect(check(`${golden}\nThe policy is CC-1333; the report is CR/2026/4117.\n`, { id: 'e10' }).fails).toEqual([]);
    expect(check(`${golden}\nThe adjuster's estimate was 98,765.\n`, { id: 'e10' }).fails).toEqual(['R8 figure(s) the file does not give: 98765']);
  });
});

describe('held-out goldens', () => {
  it('each domain keeps one golden, with its material, out of the examples every build reads', () => {
    for (const [domain, id] of [['claims', 'e10'], ['labels', 'e12']]) {
      expect(existsSync(join(D, domain, 'held-out', `${id}.md`))).toBe(true);
      expect(existsSync(join(D, domain, 'held-out', `${id}.material`))).toBe(true);
      expect(readdirSync(join(D, domain, 'examples')).filter((f) => f.startsWith(id))).toEqual([]);
    }
  });
});
