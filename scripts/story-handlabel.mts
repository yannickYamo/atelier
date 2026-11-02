#!/usr/bin/env node
// scripts/story-handlabel.mts — DO THE STORY FEATURES TELL GOLDEN PIECES FROM BARE DRAFTS? HAND LABELS, NO MODEL.
//
//   npx tsx scripts/story-handlabel.mts labels.json [--json]
//
// Before any model is paid to read loops, a person labels a few pieces by hand and this computes the same features
// the reading would feed (core/story/features.ts, novelty.ts), placed by the same code. labels.json:
//
//   { "pieces": [ { "id": "p1", "group": "golden" | "bare", "file": "p1.md" (relative to labels.json) or "text": "...",
//       "loops":  [ { "openQuote": "...", "closeQuote": "..." | null, "kind": "mystery", "question": "..." } ],
//       "stakes": [ { "quote": "..." } ],
//       "beats":  [ { "quoteStart": "...", "link": "AND_THEN" | "BUT" | "THEREFORE" } ],   (each beat after the first)
//       "novel":  [ { "quote": "...", "kind": "new" | "surprise" } ]                     (optional) } ] }
//
// Prints each piece's features, any quote it could not place (a labelling slip to fix), and for each feature the
// median per group and AUC = P(golden > bare), ties counted half: near 0.5 the feature does not separate the groups.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { indexText } from '../core/story/locate.js';
import { placeLoops } from '../core/story/loops.js';
import { loopFeatures, median, type LoopFeatures } from '../core/story/features.js';
import { noveltyFeaturesOf, placeNovelty, type NoveltyFeatures } from '../core/story/novelty.js';

interface Piece {
  id: string; group: 'golden' | 'bare'; file?: string; text?: string;
  loops?: { openQuote: string; closeQuote?: string | null; kind?: string; question?: string }[];
  stakes?: { quote: string; what?: string; forWhom?: string }[];
  beats?: { quoteStart: string; link: string }[];
  novel?: { quote: string; kind?: string }[];
}

const path = process.argv[2];
if (!path) { console.error('usage: npx tsx scripts/story-handlabel.mts labels.json [--json]'); process.exit(2); }
const raw = JSON.parse(readFileSync(path, 'utf8')) as { pieces?: Piece[] };
const pieces = raw.pieces ?? [];
if (!pieces.length) { console.error('labels.json has no pieces'); process.exit(2); }

type Row = { id: string; group: Piece['group']; dropped: number } & Partial<LoopFeatures> & { novelty?: NoveltyFeatures };
const rows: Row[] = pieces.map((p) => {
  const text = p.text ?? readFileSync(resolve(dirname(path), p.file ?? `${p.id}.md`), 'utf8');
  const index = indexText(text);
  const g = placeLoops({
    loops: (p.loops ?? []).map((l) => ({ question: l.question ?? '', openQuote: l.openQuote, closeQuote: l.closeQuote ?? null, kind: l.kind ?? 'mystery' })),
    stakes: (p.stakes ?? []).map((s) => ({ what: s.what ?? '', forWhom: s.forWhom ?? '', quote: s.quote })),
    beats: p.beats ?? [],
  }, index);
  if (!g) throw new Error(`${p.id}: labels are not in the shape described at the top of this script`);
  const n = p.novel ? placeNovelty({ novel: p.novel.map((x) => ({ quote: x.quote, kind: x.kind ?? 'new' })), claims: [] }, index) : null;
  const { deadAirSpan: _span, ...f } = loopFeatures(g);
  return { id: p.id, group: p.group, dropped: g.dropped + (n?.dropped ?? 0), ...f, ...(n ? { novelty: noveltyFeaturesOf(text, n) } : {}) };
});

/** P(a value from `a` exceeds one from `b`), ties half: the Mann-Whitney AUC. */
const auc = (a: readonly number[], b: readonly number[]): number | null => {
  if (!a.length || !b.length) return null;
  let s = 0; for (const x of a) for (const y of b) s += x > y ? 1 : x === y ? 0.5 : 0;
  return s / (a.length * b.length);
};

const FEATURES: [string, (r: Row) => number | null | undefined][] = [
  ['stakesPosition', (r) => r.stakesPosition], ['loopDensity', (r) => r.loopDensity], ['closureRate', (r) => r.closureRate],
  ['spanMedian', (r) => r.spanMedian], ['tensionCoverage', (r) => r.tensionCoverage], ['deadAir', (r) => r.deadAir],
  ['rehookMean', (r) => r.rehookMean], ['rehookCV', (r) => r.rehookCV], ['causalShare', (r) => r.causalShare],
  ['longestAndThenRun', (r) => r.longestAndThenRun], ['noveltyPer100', (r) => r.novelty?.densityPer100], ['longestThinWords', (r) => r.novelty?.longestStretchWords],
];
const values = (g: Row['group'], f: (r: Row) => number | null | undefined): number[] => rows.filter((r) => r.group === g).map(f).filter((v): v is number => typeof v === 'number');
const summary = FEATURES.map(([name, f]) => {
  const golden = values('golden', f); const bare = values('bare', f);
  return { feature: name, golden: golden.length, bare: bare.length, goldenMedian: median(golden), bareMedian: median(bare), auc: auc(golden, bare) };
});

if (process.argv.includes('--json')) { console.log(JSON.stringify({ pieces: rows, summary }, null, 2)); process.exit(0); }
const fmt = (x: number | null | undefined): string => (typeof x === 'number' ? (Math.round(x * 1000) / 1000).toString() : '—');
for (const r of rows) {
  console.log(`${r.id} [${r.group}] ${FEATURES.map(([n, f]) => `${n}=${fmt(f(r))}`).join(' ')}${r.dropped ? `  (${r.dropped} quote(s) not found: fix the labels)` : ''}`);
}
console.log('\nfeature              golden med   bare med     AUC (golden > bare)');
for (const s of summary) console.log(`${s.feature.padEnd(20)} ${fmt(s.goldenMedian).padEnd(12)} ${fmt(s.bareMedian).padEnd(12)} ${fmt(s.auc)} (n ${s.golden}/${s.bare})`);
