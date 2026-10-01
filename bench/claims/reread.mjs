// bench/claims/reread.mjs — THE CLAIM READER RE-MEASURED AT ITS PRODUCTION SETTINGS, ON THE SAME DRAFTS.
//
// The reader was qualified (studies/CLAIM_READER_V3_QUALIFICATION_RESULT.md) at the default temperature,
// one read. It now runs at temperature 0 with two reads, and nobody had measured it there. This re-reads
// exactly the drafts that study stored (48 clean, 46 with a planted invention) with the reader as it runs
// now, and compares each verdict with the stored one: the drafts are fixed, only the instrument changes,
// so the comparison is paired (exact McNemar), and each rate gets an exact Clopper-Pearson interval.
//
// Usage: node bench/claims/reread.mjs <result.json> <essays-root> <reads: 1|2> <out.json>
// Needs ANTHROPIC_API_KEY. About $1 per pass at two reads.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { modelSensor, READER_VERSION } from '../../dist/core/loop/claim-extract.js';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';

const [resultPath, root, readsArg, out] = process.argv.slice(2);
const reads = Number(readsArg) === 2 ? 2 : 1;
const MODEL = 'claude-haiku-4-5';
const TASK = 'Write a post based on my notes.';   // the study's own task string
const client = new AnthropicInferenceClient(MODEL);
const budget = { spentUsd: 0, capUsd: 4, maxCalls: 1000 };
const qualifiedReaders = [{ model: MODEL, version: READER_VERSION }];
const hits = (claims, sentence) => claims.some((c) => c.includes(sentence.slice(0, Math.min(40, sentence.length))) || sentence.includes(c.slice(0, 40)));

async function read(text, material) {
  const s = modelSensor(client, budget, MODEL, { material, task: TASK, placeholders: false, qualifiedReaders, reads });
  await s.read(text);
  // A failed read is an outcome, recorded and reported, never a reason to stop the measurement.
  if (s.degraded) return null;
  return s.reading(text).claims.map((c) => c.text);
}

const study = JSON.parse(readFileSync(resultPath, 'utf8'));
const rows = [];
for (const r of study.rows) {
  if (!r.clean) continue;
  const material = readFileSync(join(root, r.piece), 'utf8');
  const clean = await read(r.clean, material);
  const planted = r.planted?.draft ? await read(r.planted.draft, material) : null;
  rows.push({ piece: r.piece, kind: r.kind, failed: clean === null || (r.planted?.draft && planted === null),
    oldFlaggedClean: r.readerFlaggedClean, newFlaggedClean: clean === null ? null : clean.length > 0,
    oldCaught: r.readerCaught, newCaught: planted ? hits(planted, r.planted.inserted) : null });
  process.stderr.write(`.${budget.spentUsd.toFixed(2)}`);
}

// ── statistics ────────────────────────────────────────────────────────────────────────────────
const lg = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
const pmf = (k, n, p) => (p <= 0 ? (k === 0 ? 1 : 0) : p >= 1 ? (k === n ? 1 : 0) : Math.exp(lg(n) - lg(k) - lg(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p)));
const upper = (k, n, p) => { let s = 0; for (let i = k; i <= n; i++) s += pmf(i, n, p); return s; };
const bisect = (f, target) => { let lo = 0, hi = 1; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) < target) lo = m; else hi = m; } return (lo + hi) / 2; };
/** Exact (Clopper-Pearson) 95% interval for x of n. */
const ci = (x, n) => [x === 0 ? 0 : bisect((p) => upper(x, n, p), 0.025), x === n ? 1 : bisect((p) => upper(x + 1, n, p), 0.975)];
/** Exact two-sided McNemar on the discordant pairs. */
const mcnemar = (b, c) => { const n = b + c; if (!n) return 1; const k = Math.min(b, c); let s = 0; for (let i = 0; i <= k; i++) s += pmf(i, n, 0.5); return Math.min(1, 2 * s); };
const rate = (xs, f) => { const x = xs.filter(f).length; const [lo, hi] = ci(x, xs.length); return { x, n: xs.length, rate: +(x / xs.length).toFixed(3), ci95: [+lo.toFixed(3), +hi.toFixed(3)] }; };

const cleanRows = rows.filter((r) => r.newFlaggedClean !== null); const plantRows = rows.filter((r) => r.newCaught !== null && r.oldCaught !== null);
const summary = {
  reader: `${MODEL} ${READER_VERSION}`, temperature: 0, reads, spentUsd: +budget.spentUsd.toFixed(4),
  specificity: { stored: rate(cleanRows, (r) => !r.oldFlaggedClean), now: rate(cleanRows, (r) => !r.newFlaggedClean),
    mcnemarP: +mcnemar(cleanRows.filter((r) => !r.oldFlaggedClean && r.newFlaggedClean).length, cleanRows.filter((r) => r.oldFlaggedClean && !r.newFlaggedClean).length).toFixed(4) },
  sensitivity: { stored: rate(plantRows, (r) => r.oldCaught), now: rate(plantRows, (r) => r.newCaught),
    mcnemarP: +mcnemar(plantRows.filter((r) => r.oldCaught && !r.newCaught).length, plantRows.filter((r) => !r.oldCaught && r.newCaught).length).toFixed(4) },
  readerFailed: rows.filter((r) => r.failed).length,
  missedNow: plantRows.filter((r) => !r.newCaught).map((r) => `${r.kind}: ${r.piece}`),
};
writeFileSync(out, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
