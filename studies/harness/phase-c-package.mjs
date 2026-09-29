#!/usr/bin/env node
// PHASE C, STEP 2: WHAT EACH READER GETS, AND NOTHING ELSE.
//
// For each reader in plan/readers.json, each brief of the experts they read gets a folder with the brief and
// the three pieces under letters shuffled FRESHLY PER READER AND PER BRIEF, from a cryptographic source: no
// seed a reader could rebuild, no letter that means the same arm twice by design. Presentation is normalised
// (line endings, blank runs, trailing spaces, HTML comments), never the writing: tells a product removes are
// part of what is compared.
//
// The keys go to a sealed file whose sha256 is printed for the pre-registration. The copy REFUSES to write any
// file but BRIEF.md, A.md, B.md, C.md and the forms: a log beside a letter is how round 7's blind could leak.
//
// Usage:  node studies/harness/phase-c-package.mjs --plan <dir> --gen <private dir> --out <readers dir> --sealed <dir>

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { randomInt, createHash } from 'node:crypto';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
const need = (n) => arg(n) ?? (console.error(`missing ${n}`), process.exit(2));
const PLAN = resolve(need('--plan')); const GEN = resolve(need('--gen')); const OUT = resolve(need('--out')); const SEALED = resolve(need('--sealed'));
if (existsSync(OUT) && readdirSync(OUT).length) { console.error(`${OUT} is not empty: packaging twice would reshuffle what a reader may already have seen.`); process.exit(2); }

const ARMS = ['ATELIER', 'CONTEXT_GUARD', 'GUIDE'];
const LETTERS = ['A', 'B', 'C'];
const ALLOWED = new Set(['BRIEF.md', 'A.md', 'B.md', 'C.md', 'FORM.md', 'GUESS.md']);
const readers = JSON.parse(readFileSync(join(PLAN, 'readers.json'), 'utf8'));
const briefs = readFileSync(join(PLAN, 'briefs.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const normalise = (t) => t.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const put = (dir, name, text) => { if (!ALLOWED.has(name)) throw new Error(`refusing to write ${name} for a reader`); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), text); };

const FORM = `# Your reading of this brief

Rank the three by how much they sound like the author wrote them. Best first, no ties.

RANK: ? > ? > ?

Copy any sentence that reads machine-written to you, one per line, with its letter:
MARK A:
MARK B:
MARK C:

WHY (one line):
`;
const GUESS = `# Only after RANK above is written

Which letter do you think is which? Confidence 1 (a guess) to 3 (sure).

ATELIER: ?  (confidence ?)
CONTEXT_GUARD: ?  (confidence ?)
GUIDE: ?  (confidence ?)
`;

const keys = {};
for (const r of readers) {
  keys[r.id] = {};
  const mine = briefs.filter((b) => r.experts === 'all' || r.experts.includes(b.expert));
  for (const [n, b] of shuffle(mine).entries()) {
    const src = join(GEN, b.id);
    if (!ARMS.every((a) => existsSync(join(src, `${a}.md`)))) throw new Error(`${b.id} is not fully generated`);
    const order = shuffle(ARMS);
    const dir = join(OUT, r.id, `${String(n + 1).padStart(2, '0')}-${basename(b.id)}`);
    put(dir, 'BRIEF.md', `# Brief\n\n${b.brief}\n\n(${b.format}, about ${b.words} words)\n`);
    order.forEach((arm, i) => put(dir, `${LETTERS[i]}.md`, normalise(readFileSync(join(src, `${arm}.md`), 'utf8'))));
    put(dir, 'FORM.md', FORM); put(dir, 'GUESS.md', GUESS);
    keys[r.id][b.id] = Object.fromEntries(order.map((arm, i) => [LETTERS[i], arm]));
  }
}
mkdirSync(SEALED, { recursive: true });
const sealed = JSON.stringify(keys, null, 1);
writeFileSync(join(SEALED, 'keys.json'), sealed);
console.log(`packaged ${readers.length} reader(s); keys sha256 ${createHash('sha256').update(sealed).digest('hex')} (record it in the pre-registration before any reader starts)`);
