// studies/harness/voice-pass-score.mjs — THE VOICE READ, SCORED: THE UNIT IS THE REQUEST.
//
// Sealed with studies/VOICE_PASS_PREREGISTRATION.md (the tester seals this file's sha256). Five readers judging the
// same request are not five independent results, so each request gives one number: the share of its readers who
// chose the voice output. The test is over requests.
//
//   node studies/harness/voice-pass-score.mjs --dir <out>/human [--out <result.json>]
//   Reads KEY-open-after-reading.json and every <author>-reader-<n>.md, taking the letter after each "ANSWER <id>:".
//
// PASS needs all three: the pooled mean is above one half by a sign-flip randomisation test over requests (one-sided
// 5%, 10,000 seeded flips); the pooled mean is at least 0.60; each author's mean is at least 0.55.
// UNRESOLVED when an author has fewer than MIN_PER_AUTHOR requests with every reader's answer.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { mulberry32 } from '../../dist/core/fidelity/qualify.js';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
const DIR = arg('--dir') ?? (console.error('missing --dir'), process.exit(2));
const MIN_PER_AUTHOR = 13; const FLIPS = 10000;
const KEY = JSON.parse(readFileSync(join(DIR, 'KEY-open-after-reading.json'), 'utf8'));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r3 = (x) => Math.round(x * 1000) / 1000;
const authors = {}; const all = [];
for (const [author, readers] of Object.entries(KEY)) {
  const votes = new Map();   // request id -> [1 if the reader chose the voice output, else 0]
  for (const [reader, key] of Object.entries(readers)) {
    const file = readdirSync(DIR).find((f) => f === `${author}-reader-${reader}.md`);
    const text = file ? readFileSync(join(DIR, file), 'utf8') : '';
    for (const [id, voiceSide] of Object.entries(key)) {
      const m = new RegExp(`^ANSWER ${id}:[ \\t]*([AB])\\b`, 'm').exec(text);
      if (m) votes.set(id, [...(votes.get(id) ?? []), m[1] === voiceSide ? 1 : 0]);
    }
  }
  const n = Object.keys(readers).length;
  // A request counts only when every reader of the panel answered it.
  const shares = [...votes].filter(([, v]) => v.length === n).map(([, v]) => mean(v));
  authors[author] = { readers: n, requests: shares.length, mean: shares.length ? r3(mean(shares)) : null };
  all.push(...shares);
}
// SIGN-FLIP OVER REQUESTS: under no preference, each request's (share − 0.5) is as likely to be its negative.
const d = all.map((s) => s - 0.5); const observed = d.length ? mean(d) : 0;
const rand = mulberry32(20261004); let atLeast = 0;
for (let i = 0; i < FLIPS; i++) { let s = 0; for (const x of d) s += rand() < 0.5 ? x : -x; if (s / Math.max(1, d.length) >= observed - 1e-12) atLeast += 1; }
const p = (atLeast + 1) / (FLIPS + 1);
const pooled = all.length ? r3(mean(all)) : null;
const short = Object.entries(authors).filter(([, a]) => a.requests < MIN_PER_AUTHOR).map(([name, a]) => `${name}: ${a.requests}`);
const bars = { aboveHalf: p < 0.05, pooled: pooled !== null && pooled >= 0.6, eachAuthor: Object.values(authors).every((a) => a.mean !== null && a.mean >= 0.55) };
const verdict = short.length || Object.keys(authors).length < 2 ? 'UNRESOLVED' : Object.values(bars).every(Boolean) ? 'PASS' : 'FAIL';
const sentence = verdict === 'UNRESOLVED' ? `The voice read did not run: ${Object.keys(authors).length < 2 ? 'fewer than two authors' : `fewer than ${MIN_PER_AUTHOR} requests with every reader's answer (${short.join(', ')})`}. It is closed without a result.`
  : verdict === 'PASS' ? `For ${Object.keys(authors).length} authors, blind readers preferred the voice pass to the author's pieces pasted into the prompt, ${Math.round(pooled * 100)}% of the time.`
    : `For these ${Object.keys(authors).length} authors, the in-context voice pass did not read more like the author than pasted examples.`;
const result = { requests: all.length, pooled, signFlipP: r3(p), authors, bars, verdict, sentence };
if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
