// studies/harness/author-floor.mjs — THE FLOOR OF THE INDISTINGUISHABILITY STUDY: AN AUTHOR'S OWN PIECES TOLD FROM EACH OTHER.
//
// Sealed by studies/AUTHOR_FLOOR_PREREGISTRATION.md. Offline. Reads the plan of the indistinguishability study (the
// author's read and held-out pieces per corpus) and its result.json (the arm AUCs, copied, never recomputed).
//
//   node studies/harness/author-floor.mjs --plan <plan.json> --result <result.json> --out <file.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluationVocabulary, evaluationVector, standardisedVectors } from '../../dist/core/fidelity/evaluation.js';
import { c2st, floorOf } from '../../dist/core/fidelity/twosample.js';
import { mulberry32 } from '../../dist/core/fidelity/qualify.js';
import { FUNCTION_WORDS } from '../../dist/core/observers/style.js';
import { wordsOf } from '../../dist/core/observers/text.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const PLAN = JSON.parse(readFileSync(arg('--plan'), 'utf8'));
const RESULT = JSON.parse(readFileSync(arg('--result'), 'utf8'));
const SPLITS = 200;
const FUNCTION = new Set(FUNCTION_WORDS.map((w) => w.toLowerCase()));
// As the study: the vocabulary without n-grams made only of function words.
const contentOnly = (v) => ({ ...v, bigrams: v.bigrams.filter((g) => !g.split(' ').every((w) => FUNCTION.has(w))),
  chars: v.chars.filter((g) => !wordsOf(g).some((w) => FUNCTION.has(w))) });

function floor(pieces, n, content) {
  const aucs = [];
  for (let t = 0; t < SPLITS; t++) {
    const rand = mulberry32(t + 1);
    const idx = pieces.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const a = idx.slice(0, n).map((i) => pieces[i]); const b = idx.slice(n, 2 * n).map((i) => pieces[i]); const ref = idx.slice(2 * n).map((i) => pieces[i]);
    const full = evaluationVocabulary(ref); const vocab = content ? contentOnly(full) : full;
    const { others } = standardisedVectors(ref.map((x) => evaluationVector(x, vocab)), [...a, ...b].map((x) => evaluationVector(x, vocab)));
    const r = c2st(others.slice(0, n), others.slice(n), { seed: 1 });
    if (r) aucs.push(r.auc);
  }
  return floorOf(aucs, n);
}

const out = { splits: SPLITS, corpora: [] };
for (const c of PLAN.corpora) {
  const pieces = [...c.read, ...c.heldOut].map((f) => readFileSync(f, 'utf8'));
  const n = c.heldOut.length;
  const studied = RESULT.corpora.find((x) => x.name === c.name);
  const f = floor(pieces, n, false); const fc = floor(pieces, n, true);
  const arms = Object.fromEntries(Object.entries(studied.arms).map(([arm, r]) => [arm, {
    auc: r.c2st?.auc ?? null, aboveFloor: r.c2st && f ? Math.max(0.5, r.c2st.auc) > f.p95 : null,
    withoutFunctionWords: r.withoutFunctionWords?.auc ?? null, aboveFloorWithout: r.withoutFunctionWords && fc ? Math.max(0.5, r.withoutFunctionWords.auc) > fc.p95 : null }]));
  const row = { name: c.name, pieces: pieces.length, perSide: n, reference: pieces.length - 2 * n, floor: f, floorWithoutFunctionWords: fc,
    ...(n > 6 && pieces.length - 12 >= 6 ? { atSix: { perSide: 6, reference: pieces.length - 12, floor: floor(pieces, 6, false) } } : {}), arms };
  out.corpora.push(row);
  console.log(`\n${c.name}: ${pieces.length} author pieces, ${n} a side, reference ${row.reference}, ${SPLITS} splits`);
  console.log(`  floor: median ${f?.median}, 90th ${f?.p90}, 95th ${f?.p95}   without function-word n-grams: median ${fc?.median}, 95th ${fc?.p95}`);
  if (row.atSix) console.log(`  at 6 a side (reference ${row.atSix.reference}): median ${row.atSix.floor?.median}, 95th ${row.atSix.floor?.p95}`);
  for (const [arm, r] of Object.entries(arms)) console.log(`  ${arm.padEnd(14)} AUC ${r.auc}  ${r.aboveFloor ? 'above the floor' : 'AT THE FLOOR'}   without: ${r.withoutFunctionWords}  ${r.aboveFloorWithout ? 'above' : 'AT THE FLOOR'}`);
}
if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(out, null, 1));
