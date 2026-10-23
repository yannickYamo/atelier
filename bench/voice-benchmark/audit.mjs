#!/usr/bin/env node
// bench/voice-benchmark/audit.mjs — WHAT CODE CAN SAY ABOUT A PIECE WRITTEN IN AN AUTHOR'S VOICE, OFFLINE.
//
// Round 0 of the argument-and-questions plan: one frozen benchmark, read the same way for every arm, before any change
// is judged. This script is the part a count can do. Given the author's pieces, the outputs of one arm, the material the
// outputs were written from, and optionally the length range the requests asked for and the brief's points, it reports
// per output:
//
//   opens         the output's first paragraph, listed for a person to read, for every arm alike: nothing is read for
//                 meaning, and every arm is measured the same way. Beside it, as extra information, what the run's
//                 record (`<output>.record.json`, its `work` field) says: the piece came inside its <work> field, the
//                 field was missing, or there is no record; and how many words were set aside outside it.
//   tells         the machine-writing moves delivered, counted by Atelier's own features (the machine-tell families,
//                 the contrastive verdict, signposting, dashes); fragment runs are the STACCATO_RUN family.
//   rhythm        median sentence length, share of sentences of 5 words or fewer, "I" (with "I'm", "I've", "I'd",
//                 "I'll") and "my" per 1,000 words, paragraphs:
//                 each beside the author's own range (lowest and highest piece).
//   copied        the stretches the output copies from the material: maximal runs of 5 words or more (overlapping
//                 5-word windows joined into one stretch, as a person reads it), the longest, and up to three shown.
//   length        words written, and whether that is inside the range asked (`--range 150-200`).
//   points        for a brief given as a list of points (`--brief`), how many points the output carries: a point is
//                 carried where any 5 consecutive words of it appear in the output (the whole point, if shorter).
//
// Form only: counts, positions and shared word runs. Nothing here decides what a sentence means. Node 22 or later, run
// from the repository's root after `npm run build`: the counts are Atelier's own, read from dist/.
//
//   node bench/voice-benchmark/audit.mjs --author <dir> --outputs <dir> [--material <dir|file>,...] [--range lo-hi]
//                                        [--brief <file>] [--json <out.jsonl>]

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, basename, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = (p) => pathToFileURL(join(ROOT, 'dist', p)).href;
const { findPattern } = await import(dist('core/observers/style.js'));
const { sentencesOf, paragraphsOf, wordsOf } = await import(dist('core/observers/text.js'));
const { wordsWritten } = await import(dist('core/eval/size.js'));
const { sharedRuns } = await import(dist('core/observers/copied-runs.js'));

const TEXT = new Set(['.md', '.txt', '.markdown']);
/** The text files of a folder (sorted by name), or the one file named. Records and hidden files are not pieces. */
export function textFiles(path) {
  const p = resolve(path);
  if (!existsSync(p)) throw new Error(`no such file or folder: ${path}`);
  if (statSync(p).isFile()) return [p];
  return readdirSync(p).filter((f) => !f.startsWith('.') && TEXT.has(extname(f).toLowerCase())).sort().map((f) => join(p, f));
}
const read = (f) => readFileSync(f, 'utf8');

// ── the counts ───────────────────────────────────────────────────────────────────────────────
const TELLS = ['MACHINE_TELL', 'CONTRAST_VERDICT', 'SIGNPOST', 'EM_DASH'];
/** The tells delivered, by name: each machine-tell family found, and the contrastive verdict, signposting and dashes. */
export function tellsOf(text) {
  const out = {};
  for (const p of TELLS) {
    const spans = findPattern(text, p);
    if (p === 'MACHINE_TELL') for (const s of spans) out[s.family ?? p] = (out[s.family ?? p] ?? 0) + 1;
    else if (spans.length) out[p] = spans.length;
  }
  return out;
}
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = (x) => Math.round(x * 100) / 100;
/** "I", its contractions ("I'm", "I've", "I'd", "I'll"), and "my". */
const FIRST_PERSON = /^(?:I(?:['’](?:m|ve|d|ll))?|[Mm]y)$/;
/** How a text moves: median sentence length, share of sentences of 5 words or fewer, "I"/"my" per 1,000 words, paragraphs. */
export function rhythmOf(text) {
  const lens = sentencesOf(text).map((s) => s.words);
  const words = wordsOf(text);
  const firstPerson = words.filter((w) => FIRST_PERSON.test(w)).length;
  return { medianSentence: median(lens), shortShare: lens.length ? r2(lens.filter((n) => n <= 5).length / lens.length) : 0,
    iPer1000: words.length ? r2((firstPerson / words.length) * 1000) : 0, paragraphs: paragraphsOf(text).length };
}
/** The author's range on each rhythm measure: lowest and highest of their pieces, and the median. */
export function authorRange(pieces) {
  const rs = pieces.map(rhythmOf);
  return Object.fromEntries(Object.keys(rs[0] ?? {}).map((k) => { const xs = rs.map((r) => r[k]); return [k, { lo: Math.min(...xs), hi: Math.max(...xs), median: median(xs) }]; }));
}
const runsOf = (text, n = 5) => { const w = wordsOf(text).map((x) => x.toLowerCase()); const out = new Set(); for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' ')); return out; };
/** The stretches the output copies from the material: maximal runs of 5 words or more, as the output has them (Atelier's own count). */
export function copiedRuns(text, material) {
  return sharedRuns(text, material);
}
/** A brief's points: its list items (lines opening with "-", "*", "•" or a number), as written. */
export function pointsOf(brief) {
  return brief.split('\n').map((l) => /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/.exec(l)?.[1]?.trim()).filter(Boolean);
}
/** Is a point carried by the output: any 5 consecutive words of it there, or the whole point where it is shorter. */
export function carries(text, point) {
  const t = wordsOf(text).map((x) => x.toLowerCase()).join(' ');
  const p = wordsOf(point).map((x) => x.toLowerCase());
  if (p.length < 5) return p.length > 0 && ` ${t} `.includes(` ${p.join(' ')} `);
  const out = runsOf(text);
  for (let i = 0; i + 5 <= p.length; i++) if (out.has(p.slice(i, i + 5).join(' '))) return true;
  return false;
}
/** "150-200", "150 to 200", "-200" or "150-": the range asked, ends null where open. */
export function parseRange(s) {
  if (!s) return null;
  const m = /^\s*(\d*)\s*(?:-|to)\s*(\d*)\s*$/.exec(s);
  if (!m || (!m[1] && !m[2])) throw new Error(`--range takes lo-hi (e.g. 150-200), not "${s}"`);
  return { lo: m[1] ? Number(m[1]) : null, hi: m[2] ? Number(m[2]) : null };
}
/**
 * How the output opens: its first paragraph for a person to read, for every arm alike; and, as extra information, what the
 * record's work field says (inside its field, the field missing, or no record) with the words set aside outside it.
 */
export function opensOf(text, record) {
  const first = (paragraphsOf(text)[0]?.text ?? text.split(/\n\s*\n/)[0] ?? '').trim().slice(0, 400);
  const work = record?.work;
  if (!work) return { forAPerson: first, field: 'no record' };
  return { forAPerson: first, field: work.delimited ? 'inside' : 'missing', ...(work.delimited ? { setAside: work.outside ? wordsOf(work.outside).length : 0 } : {}) };
}

/** Everything the audit says of one output. */
export function auditOutput(text, ctx) {
  const words = wordsWritten(text);
  const rhythm = rhythmOf(text);
  const range = ctx.range;
  const copied = ctx.material ? copiedRuns(text, ctx.material) : [];
  const points = ctx.points?.length ? ctx.points.filter((p) => carries(text, p)) : null;
  return {
    opens: opensOf(text, ctx.record ?? null),
    tells: tellsOf(text),
    rhythm: Object.fromEntries(Object.entries(rhythm).map(([k, v]) => [k, { value: v, ...(ctx.author?.[k] ? { authorLo: ctx.author[k].lo, authorHi: ctx.author[k].hi, inside: v >= ctx.author[k].lo && v <= ctx.author[k].hi } : {}) }])),
    copied: { runs: copied.length, longest: copied.reduce((n, r) => Math.max(n, r.words), 0), shown: copied.slice(0, 3).map((r) => r.text) },
    length: { words, ...(range ? { lo: range.lo, hi: range.hi, inside: (range.lo === null || words >= range.lo) && (range.hi === null || words <= range.hi) } : {}) },
    ...(points ? { points: { given: ctx.points.length, carried: points.length } } : {}),
  };
}

// ── the command ──────────────────────────────────────────────────────────────────────────────
function opt(args, name) { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; }

export function main(args) {
  const authorDir = opt(args, 'author'); const outDir = opt(args, 'outputs');
  if (!authorDir || !outDir) throw new Error('usage: audit.mjs --author <dir> --outputs <dir> [--material <dir|file>,...] [--range lo-hi] [--brief <file>] [--json <out.jsonl>]');
  const pieces = textFiles(authorDir).map(read);
  if (!pieces.length) throw new Error(`no pieces in ${authorDir}`);
  const material = (opt(args, 'material') ?? '').split(',').filter(Boolean).flatMap(textFiles).map(read).join('\n\n');
  const ctx = { author: authorRange(pieces), material, range: parseRange(opt(args, 'range')), points: opt(args, 'brief') ? pointsOf(read(opt(args, 'brief'))) : null };
  const rows = textFiles(outDir).map((f) => {
    const rec = f.replace(/\.[^.]+$/, '.record.json');
    const record = existsSync(rec) ? JSON.parse(read(rec)) : null;
    return { output: basename(f), ...auditOutput(read(f), { ...ctx, record }) };
  });
  const json = opt(args, 'json');
  if (json) writeFileSync(json, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
  const lines = [`${rows.length} output(s) against ${pieces.length} piece(s) of the author`];
  for (const r of rows) {
    const t = Object.entries(r.tells).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
    lines.push(`${r.output}: tells ${t}; ${r.length.words} words${r.length.inside === undefined ? '' : r.length.inside ? ' (inside)' : ' (outside)'}; median sentence ${r.rhythm.medianSentence.value}`
      + `${r.points ? `; points ${r.points.carried}/${r.points.given}` : ''}; copied runs ${r.copied.runs}${r.copied.runs ? ` (longest ${r.copied.longest} words)` : ''}`);
    // every arm alike: the opening for a person to read; the record's field beside it
    lines.push(`${r.output}: opens "${r.opens.forAPerson.slice(0, 120)}" (record: ${r.opens.field === 'inside' ? `inside its field, ${r.opens.setAside} word(s) set aside` : r.opens.field === 'missing' ? 'no field' : 'none'})`);
  }
  lines.push(`total: tells ${sum((r) => Object.values(r.tells).reduce((a, b) => a + b, 0))}; inside the range ${rows.filter((r) => r.length.inside).length} of ${ctx.range ? rows.length : 0}; copied runs ${sum((r) => r.copied.runs)}`);
  return { rows, text: lines.join('\n') };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(main(process.argv.slice(2)).text); } catch (e) { console.error(`audit: ${e.message}`); process.exit(2); }
}
