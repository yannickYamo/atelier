// studies/harness/voice-pass-score.mjs — THE VOICE READ, SCORED: THE UNIT IS THE REQUEST.
//
// Sealed with studies/VOICE_PASS_PREREGISTRATION.md (the tester seals this file's sha256). Five readers judging the
// same request are not five independent results, so each request gives one number: the share of its readers who
// chose the voice output. The test is over requests.
//
//   node studies/harness/voice-pass-score.mjs --dir <out>/human [--out <result.json>]
//   Reads KEY-open-after-reading.json and every <author>-reader-<n>.md, taking the letter after each "ANSWER <id>:".
//
// HOW AN ANSWER IS READ. A capital A or B after the colon, with or without emphasis or brackets around it (A, **B**,
// (A), _b_), and whatever the reader wrote after it. A small a or b counts when it stands alone. So does a letter
// alone on the line right under the answer line. Anything else is not an answer.
//
// AN ANSWER THAT CANNOT BE READ IS NEVER DROPPED QUIETLY. Each one is listed on stderr by reader and request (a
// packet that is missing counts for every request in it), and while there is even one the verdict is UNRESOLVED,
// saying how many: a request left out for one unread line would make the test a smaller one than was sealed, with
// nothing but a lower count to show it. Fix the lines listed (or have the reader answer them) and score again.
//
// PASS needs all three: the pooled mean is above one half by a sign-flip randomisation test over requests (one-sided
// 5%, 10,000 seeded flips); the pooled mean is at least 0.60; each author's mean is at least 0.55.
// UNRESOLVED when any answer cannot be read, or an author has fewer than MIN_PER_AUTHOR requests with every reader's
// answer, or there are fewer than two authors.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { mulberry32 } from '../../dist/core/fidelity/qualify.js';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
const DIR = arg('--dir') ?? (console.error('missing --dir'), process.exit(2));
const MIN_PER_AUTHOR = 13; const FLIPS = 10000;
const KEY = JSON.parse(readFileSync(join(DIR, 'KEY-open-after-reading.json'), 'utf8'));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r3 = (x) => Math.round(x * 1000) / 1000;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The letter one reader gave one request, as a capital, or null when no answer can be read. */
function answerOf(text, id) {
  const at = `^ANSWER ${esc(id)}:[ \\t]*`; const open = '[*_(\\[]*';
  const m = new RegExp(`${at}${open}([AB])(?![A-Za-z0-9])`, 'm').exec(text)
    ?? new RegExp(`${at}(?:\\r?\\n[ \\t]*)?${open}([ABab])[*_)\\].]*[ \\t]*\\r?$`, 'm').exec(text);
  return m ? m[1].toUpperCase() : null;
}
const authors = {}; const all = []; const unreadable = []; let asked = 0;
for (const [author, readers] of Object.entries(KEY)) {
  const votes = new Map();   // request id -> [1 if the reader chose the voice output, else 0]
  for (const [reader, key] of Object.entries(readers)) {
    const file = readdirSync(DIR).find((f) => f === `${author}-reader-${reader}.md`);
    const text = file ? readFileSync(join(DIR, file), 'utf8') : '';
    for (const [id, voiceSide] of Object.entries(key)) {
      const letter = answerOf(text, id); asked += 1;
      if (letter) votes.set(id, [...(votes.get(id) ?? []), letter === voiceSide ? 1 : 0]);
      else unreadable.push({ author, reader, request: id, why: file ? 'no A or B could be read on its answer line' : `${author}-reader-${reader}.md is not in ${DIR}` });
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
for (const u of unreadable) console.error(`no readable answer: ${u.author} reader ${u.reader}, request ${u.request} (${u.why})`);
const unread = unreadable.length ? `${unreadable.length} of ${asked} answers could not be read (${new Set(unreadable.map((u) => `${u.author}\u0000${u.reader}`)).size} reader packet(s), ${new Set(unreadable.map((u) => u.request)).size} request(s))` : null;
if (unread) console.error(`${unread}. The verdict is UNRESOLVED until each is "ANSWER <id>: A" or "ANSWER <id>: B"; then run the same command again.`);
const verdict = unread || short.length || Object.keys(authors).length < 2 ? 'UNRESOLVED' : Object.values(bars).every(Boolean) ? 'PASS' : 'FAIL';
const sentence = unread ? `The voice read is not scored yet: ${unread}, and a request is never left out for an answer nobody could read. Each is listed on stderr; fix them and score again.`
  : verdict === 'UNRESOLVED' ? `The voice read did not run: ${Object.keys(authors).length < 2 ? 'fewer than two authors' : `fewer than ${MIN_PER_AUTHOR} requests with every reader's answer (${short.join(', ')})`}. It is closed without a result.`
  : verdict === 'PASS' ? `For ${Object.keys(authors).length} authors, blind readers preferred the voice pass to the author's pieces pasted into the prompt, ${Math.round(pooled * 100)}% of the time.`
    : `For these ${Object.keys(authors).length} authors, the in-context voice pass did not read more like the author than pasted examples.`;
const result = { requests: all.length, unreadable: { answers: unreadable.length, of: asked, list: unreadable }, pooled, signFlipP: r3(p), authors, bars, verdict, sentence };
if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
