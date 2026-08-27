// tests/atelier-studies.test.ts — THE STUDY RECORDS ARE A PUBLISHED CLAIM, SO THEY ARE POLICED.
//
// The paper's author footnote says the preregistrations and study records are public. That sentence
// is only true while `studies/` actually contains them, ships inside the package, and its index
// points at files that exist. An index listing a study nobody can open is worse than no index.
//
// The second half is not about tidiness. Two of these studies use the public comments of real
// maintainers who were never contacted and have ratified nothing, so the records identify them as
// Maintainer A and Maintainer B. That substitution is a commitment to two people who did not get a
// say, and a future edit that pastes an un-anonymised paragraph back in would be invisible to every
// other test in this suite.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'studies';
const files = (): string[] => readdirSync(DIR).filter((f) => f.endsWith('.md'));
const read = (f: string): string => readFileSync(join(DIR, f), 'utf8');
const index = (): string => read('README.md');

describe('the published study records exist and are indexed', () => {
  it('the directory holds the studies and can be seen at all', () => {
    // Polarity: an empty read would make every assertion below vacuous.
    expect(files().length).toBeGreaterThanOrEqual(18);
    expect(files()).toContain('M2_PRICING_STUDY_CLOSE.md');
  });

  it('every study in the directory is listed in the index', () => {
    const listed = index();
    const unlisted = files().filter((f) => f !== 'README.md' && !listed.includes(f));
    expect(unlisted, `in studies/ but absent from studies/README.md:\n${unlisted.join('\n')}`)
      .toEqual([]);
  });

  it('every file the index links to exists', () => {
    const links = [...index().matchAll(/\]\((?!https?:|\.\.\/)([^)#]+)\)/g)].map((m) => m[1].trim());
    expect(links.length).toBeGreaterThan(10);
    const missing = links.filter((l) => !existsSync(join(DIR, l)));
    expect(missing, `studies/README.md links to files that do not exist: ${missing.join(', ')}`)
      .toEqual([]);
  });

  it('the studies ship inside the package, or the paper claims something untrue', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { files: string[] };
    expect(pkg.files, 'add "studies" to files, or the published package has no study records')
      .toContain(DIR);
  });
});

describe('the anonymisation holds', () => {
  // Real names, handles and project names that identify the two maintainers. Absolute local paths
  // are here too: they leak a directory layout and point a reader at data the repository lacks.
  const FORBIDDEN = [
    'Willison', 'Carl Meyer', 'carljm', 'simonw', 'astral-sh', '/home/',
  ];

  it('the scan is looking at real content', () => {
    const all = files().map(read).join('\n');
    expect(all.length).toBeGreaterThan(20000);
    expect(all).toContain('Maintainer A');
  });

  it('no study record identifies the maintainers or leaks a local path', () => {
    const hits: string[] = [];
    for (const f of files()) {
      const body = read(f);
      for (const term of FORBIDDEN) {
        if (body.includes(term)) hits.push(`${f} contains "${term}"`);
      }
    }
    expect(hits, `these people were never contacted and ratified nothing:\n${hits.join('\n')}`)
      .toEqual([]);
  });

  it('the index says why the names are substituted, so a reader is not misled about who was asked', () => {
    expect(index()).toMatch(/contacted/i);
    expect(index()).toMatch(/ratified/i);
    expect(index()).toMatch(/Maintainer A/);
    expect(index()).toMatch(/Maintainer B/);
  });
});
