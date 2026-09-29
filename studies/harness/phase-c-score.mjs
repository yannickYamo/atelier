#!/usr/bin/env node
// PHASE C, STEP 3: READ THE FORMS, UNBLIND, SCORE BY THE SEALED RULE.
//
// Every form must be complete (a strict ranking of A, B and C, and a guess of each arm) or the run stops and
// names it: a missing form is not a loss to guess around, it is counted as a loss for ATELIER by the
// pre-registration, and it is listed. Every statistic comes from core/stats (the studies census forbids a
// runner computing its own).
//
// Usage:  node studies/harness/phase-c-score.mjs --plan <dir> --readers <readers dir> --sealed <dir> --gen <private dir> --out <file.json>

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { signTestOneSidedP, binomialUpperTailP, clopperPearson } from '../../dist/core/stats/sign-test.js';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
const need = (n) => arg(n) ?? (console.error(`missing ${n}`), process.exit(2));
const PLAN = resolve(need('--plan')); const READERS = resolve(need('--readers')); const SEALED = resolve(need('--sealed')); const GEN = resolve(need('--gen')); const OUT = resolve(need('--out'));
const readers = JSON.parse(readFileSync(join(PLAN, 'readers.json'), 'utf8'));
const keys = JSON.parse(readFileSync(join(SEALED, 'keys.json'), 'utf8'));
const primary = readers.find((r) => r.primary) ?? (console.error('no reader is marked primary in readers.json'), process.exit(2));
const THRESHOLD = 24; const N_PLANNED = 36;

function parseForm(dir) {
  const form = readFileSync(join(dir, 'FORM.md'), 'utf8'); const guess = readFileSync(join(dir, 'GUESS.md'), 'utf8');
  const m = /^RANK:\s*([ABC])\s*>\s*([ABC])\s*>\s*([ABC])\s*$/m.exec(form);
  const rank = m ? [m[1], m[2], m[3]] : null;
  const marks = [...form.matchAll(/^MARK ([ABC]):\s*(.+)$/gm)].map((x) => ({ letter: x[1], text: x[2].trim() })).filter((x) => x.text);
  const g = Object.fromEntries([...guess.matchAll(/^(ATELIER|CONTEXT_GUARD|GUIDE):\s*([ABC])\s*\(confidence\s*([123])\)/gm)].map((x) => [x[1], { letter: x[2], confidence: Number(x[3]) }]));
  const problems = [];
  if (!rank || new Set(rank).size !== 3) problems.push('RANK is not a strict order of A, B and C');
  if (Object.keys(g).length !== 3) problems.push('GUESS is incomplete');
  return { rank, marks, guess: g, problems };
}

const rows = [];
const incomplete = [];
for (const r of readers) {
  const base = join(READERS, r.id);
  if (!existsSync(base)) { incomplete.push(`${r.id}: no folder`); continue; }
  for (const d of readdirSync(base).sort()) {
    const briefId = d.replace(/^\d+-/, '');
    const key = keys[r.id]?.[briefId];
    if (!key) { incomplete.push(`${r.id}/${d}: no key`); continue; }
    const f = parseForm(join(base, d));
    if (f.problems.length) { incomplete.push(`${r.id}/${d}: ${f.problems.join('; ')}`); rows.push({ reader: r.id, briefId, complete: false }); continue; }
    const arms = f.rank.map((l) => key[l]);
    const pos = (a) => arms.indexOf(a);
    const guessedRight = f.guess.ATELIER?.letter !== undefined && key[f.guess.ATELIER.letter] === 'ATELIER';
    const meta = JSON.parse(readFileSync(join(GEN, briefId, 'meta.json'), 'utf8'));
    rows.push({ reader: r.id, briefId, expert: meta.brief.expert, format: meta.brief.format, kind: meta.brief.kind, complete: true, order: arms,
      atelierOverContext: pos('ATELIER') < pos('CONTEXT_GUARD'), atelierOverGuide: pos('ATELIER') < pos('GUIDE'), guessedAtelier: guessedRight,
      marksPer1000: Object.fromEntries(['ATELIER', 'CONTEXT_GUARD', 'GUIDE'].map((a) => { const l = Object.keys(key).find((x) => key[x] === a); return [a, Math.round((f.marks.filter((mk) => mk.letter === l).length / Math.max(meta.arms[a].words, 1)) * 1000 * 100) / 100]; })),
      profiles: Object.fromEntries(Object.entries(meta.arms).map(([a, m]) => [a, m.profile])) });
  }
}

// PRIMARY: the primary reader's briefs; a missing or incomplete brief counts as a loss (pre-registered).
const prim = rows.filter((x) => x.reader === primary.id);
const wins = prim.filter((x) => x.complete && x.atelierOverContext).length;
const n = Math.max(N_PLANNED, prim.length);
const p = signTestOneSidedP(wins, n);
const perExpert = Object.fromEntries([...new Set(prim.map((x) => x.expert))].map((e) => {
  const xs = prim.filter((x) => x.expert === e); const w = xs.filter((x) => x.complete && x.atelierOverContext).length;
  return [e, { wins: w, n: xs.length, ci95: clopperPearson(w, xs.length) }];
}));
const complete = rows.filter((x) => x.complete);
const guessRight = complete.filter((x) => x.guessedAtelier).length;
const result = {
  primaryReader: primary.id, wins, n, oneSidedP: p, threshold: THRESHOLD, verdict: wins >= THRESHOLD ? 'H1 SUPPORTED' : 'H1 NOT SUPPORTED',
  perExpert,
  secondary: {
    atelierOverGuide: { wins: prim.filter((x) => x.complete && x.atelierOverGuide).length, n: prim.length },
    otherReaders: Object.fromEntries(readers.filter((r) => !r.primary).map((r) => { const xs = rows.filter((x) => x.reader === r.id && x.complete); return [r.id, { atelierOverContext: xs.filter((x) => x.atelierOverContext).length, n: xs.length }]; })),
    blinding: { atelierGuessedRight: guessRight, n: complete.length, chanceP: binomialUpperTailP(guessRight, complete.length, 1 / 3),
      note: 'a small p here means readers could tell which piece was ATELIER: the blind is reported as broken, and the primary result read accordingly' },
  },
  incomplete, rows,
};
writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(`${result.verdict}: ${wins}/${n} briefs, one-sided p = ${p.toFixed(4)} (threshold ${THRESHOLD}); ATELIER guessed right ${guessRight}/${complete.length} (chance p = ${result.secondary.blinding.chanceP.toFixed(4)})`);
if (incomplete.length) console.log(`incomplete:\n  ${incomplete.join('\n  ')}`);
