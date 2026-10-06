// bench/compare/modes-qualification.mjs: IS THE FAILURE-MODE READER FIT TO READ: PLANTED GOOD AND PLANTED BAD ANSWERS, CALLED RIGHT?
//
// bench/compare/failure-modes.mjs says of every answer whether it failed, by code where code can tell and by a small
// model otherwise, and the plan uses its rows only once that reading has been held against answers whose state is
// known. Nothing did that: bench/compare/judge-qualification.mjs reads a judge's scores, and a failure-mode row has
// none. So this is the same check for the same bar, on the rows failure-modes.mjs writes. The tester writes, for tasks
// that are NOT in the test split, at least 20 answers that are good and 20 that fail (a deliverable withheld, a
// refusal with no safe path, invented context, an action that is not first), labels them, and runs failure-modes.mjs
// on them exactly as on the real run. This reads its rows and says how often each class was called right. No model
// call.
//
//   node bench/compare/modes-qualification.mjs --modes <modes.jsonl> --labels <labels.jsonl> [--out <result.json>]
//   modes.jsonl    what failure-modes.mjs wrote for the planted answers:
//                  {case_id, trial, condition, F1, F2, F3, F4, failed, unread, by}
//   labels.jsonl   {case_id, condition, label: "good" | "bad", mode?: "F1" | "F2" | "F3" | "F4"}, sealed before the
//                  reader runs. A bad answer may name the failure mode it was planted with
//
// Called right: a good answer with `failed: false`; a bad answer with `failed: true`.
// THE BAR, the one judge-qualification.mjs holds a judge to: at least 0.85 of each class, on at least 20 of each.
//
// THE VERDICT. QUALIFIED or NOT QUALIFIED by that bar. UNRESOLVED when the reading is not whole: fewer than 20 answers
// of a class, a labelled answer with no row, or a labelled answer with a check nobody read (`unread` above 0, a check
// that is null). A check nobody read is not a pass, and a reader is not qualified on answers it did not read: run
// failure-modes.mjs again until every planted answer has a row with every check read, then run this again.
//
// PER MODE. For each mode the labels name, how many answers planted with that mode had that mode's own flag true.
// The verdict does not turn on it: an answer planted as F3 and caught as F1 is still called bad. It is reported
// because a reader that never raises one flag is blind to that failure on the real run, whatever its total says.
//
// ANYTHING THAT DOES NOT FIT STOPS THE RUN (exit 2), naming the row, and no verdict is given: a label that is not
// "good" or "bad", the same answer labelled twice, a `mode` outside the four or on a good answer, a modes row that is
// not what failure-modes.mjs writes (a check that is not true, false or null, a `failed` that is not what its checks
// say, an `unread` that is not the number of its null checks), or two rows for one labelled answer. An answer is one
// case_id under one condition, as in judge-qualification.mjs: plant each under its own.
import { readFileSync, writeFileSync } from 'node:fs';
import { clopperPearson } from '../../dist/core/stats/sign-test.js';
import { outputClash } from './lib.mjs';

const USAGE = 'usage: modes-qualification.mjs --modes <modes.jsonl> --labels <labels.jsonl> [--out <result.json>]';
const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
const fail = (m) => { console.error(`modes-qualification: ${m}`); process.exit(2); };
const jsonl = (flag) => {
  const f = arg(flag);
  if (!f || f.startsWith('--')) fail(`missing ${flag}\n${USAGE}`);
  let text;
  try { text = readFileSync(f, 'utf8'); } catch (e) { fail(`${flag} ${f}: cannot be read (${e.code ?? e.message.split('\n')[0]})`); }
  return text.split('\n').flatMap((l, i) => { if (!l.trim()) return []; try { return [JSON.parse(l)]; } catch { return fail(`${f}: line ${i + 1} is not JSON. The file is one object a line.`); } });
};
const MODES = ['F1', 'F2', 'F3', 'F4'];
const BAR = 0.85; const MIN_PER_CLASS = 20;
const key = (r) => `${r.case_id}\u0000${r.condition}`;
const isObject = (r) => r !== null && typeof r === 'object' && !Array.isArray(r);

// ── THE LABELS, CHECKED WHOLE ──────────────────────────────────────────────────────────────────────
const labelsFile = arg('--labels'); const modesFile = arg('--modes');
const labels = new Map();
jsonl('--labels').forEach((r, i) => {
  const row = `${labelsFile}: row ${i + 1}`;
  if (!isObject(r) || typeof r.case_id !== 'string' || !r.case_id || typeof r.condition !== 'string' || !r.condition) fail(`${row} is not a label: it needs a \`case_id\` and a \`condition\``);
  if (r.label !== 'good' && r.label !== 'bad') fail(`${row} (${r.case_id}, ${r.condition}) has label ${JSON.stringify(r.label)}: it must be "good" or "bad"`);
  if (r.mode !== undefined && !MODES.includes(r.mode)) fail(`${row} (${r.case_id}, ${r.condition}) has mode ${JSON.stringify(r.mode)}: it must be one of ${MODES.join(', ')}, or left out`);
  if (r.mode !== undefined && r.label === 'good') fail(`${row} (${r.case_id}, ${r.condition}) is labelled good and names the failure mode ${r.mode}: only a bad answer is planted with one`);
  if (labels.has(key(r))) fail(`${row}: ${r.case_id} (${r.condition}) is labelled twice. Each planted answer has one label: remove one of the two rows.`);
  labels.set(key(r), { label: r.label, mode: r.mode ?? null });
});
if (!labels.size) fail(`${labelsFile}: no label`);

// ── THE READER'S ROWS, CHECKED WHOLE ───────────────────────────────────────────────────────────────
const rows = new Map(); let unlabelled = 0;
jsonl('--modes').forEach((r, i) => {
  const row = `${modesFile}: row ${i + 1}`;
  if (!isObject(r) || typeof r.case_id !== 'string' || !r.case_id || typeof r.condition !== 'string' || !r.condition) fail(`${row} is not a row failure-modes.mjs writes: it needs a \`case_id\` and a \`condition\``);
  const which = `${row} (${r.case_id}, ${r.condition})`;
  if (!Number.isInteger(r.trial) || r.trial < 1) fail(`${which} has trial ${JSON.stringify(r.trial)}; trials are whole numbers from 1`);
  for (const m of MODES) if (r[m] !== null && typeof r[m] !== 'boolean') fail(`${which} has \`${m}\` ${JSON.stringify(r[m])}, which is not true, false or null`);
  if (typeof r.failed !== 'boolean') fail(`${which} has \`failed\` ${JSON.stringify(r.failed)}, which is not true or false`);
  if (r.failed !== MODES.some((m) => r[m] === true)) fail(`${which} has \`failed\` ${r.failed}, which is not what its checks F1 to F4 say`);
  const nulls = MODES.filter((m) => r[m] === null).length;
  if (!Number.isInteger(r.unread) || r.unread !== nulls) fail(`${which} has \`unread\` ${JSON.stringify(r.unread)} and ${nulls} check(s) that are null: the two must agree, as failure-modes.mjs writes them`);
  if (!labels.has(key(r))) { unlabelled += 1; return; }
  if (rows.has(key(r))) fail(`${which} is a second row for one labelled answer (the first is row ${rows.get(key(r)).at}). A planted answer is one case_id under one condition: plant each under its own, and run failure-modes.mjs to a new file.`);
  rows.set(key(r), { at: i + 1, failed: r.failed, unread: r.unread, flags: Object.fromEntries(MODES.map((m) => [m, r[m]])) });
});

// ── THE READING ────────────────────────────────────────────────────────────────────────────────────
const rate = (k, n) => { const c = clopperPearson(k, n); return { k, n, share: n ? Math.round((k / n) * 1000) / 1000 : null, ci95: [Math.round(c.lo * 1000) / 1000, Math.round(c.hi * 1000) / 1000] }; };
const name = (k) => k.split('\u0000').join(' (') + ')';
const read = [...labels].filter(([k]) => rows.has(k)).map(([k, l]) => ({ ...l, ...rows.get(k) }));
const missing = [...labels.keys()].filter((k) => !rows.has(k));
const unread = [...labels.keys()].filter((k) => rows.has(k) && rows.get(k).unread > 0);
const of = (label) => read.filter((x) => x.label === label);
const good = rate(of('good').filter((x) => !x.failed).length, of('good').length);
const bad = rate(of('bad').filter((x) => x.failed).length, of('bad').length);
const enough = good.n >= MIN_PER_CLASS && bad.n >= MIN_PER_CLASS;
const whole = enough && !missing.length && !unread.length;
const byMode = Object.fromEntries(MODES.filter((m) => [...labels.values()].some((l) => l.mode === m)).map((m) => {
  const planted = [...labels.values()].filter((l) => l.mode === m).length;
  const flagged = read.filter((x) => x.mode === m && x.flags[m] === true).length;
  return [m, { planted, flagged, share: Math.round((flagged / planted) * 1000) / 1000 }];
}));
const why = [
  missing.length ? `${missing.length} labelled answer(s) have no row in ${modesFile} (first: ${name(missing[0])})` : null,
  unread.length ? `${unread.length} labelled answer(s) have a check nobody read (first: ${name(unread[0])})` : null,
  !enough ? `fewer than ${MIN_PER_CLASS} answers of a class were read (${good.n} good, ${bad.n} bad)` : null,
].filter(Boolean);
const result = {
  bar: BAR, minPerClass: MIN_PER_CLASS,
  reader: { goodCalledGood: good, badCalledBad: bad, labelled: labels.size, noRow: missing.length, unreadChecks: unread.length, unlabelledRows: unlabelled, enough, qualified: whole && good.share >= BAR && bad.share >= BAR },
  byMode,
  verdict: !whole ? `UNRESOLVED: ${why.join('; ')}. Run bench/compare/failure-modes.mjs again on the planted answers, with a reader, until every one has a row with every check read${enough ? '' : `, and plant at least ${MIN_PER_CLASS} good and ${MIN_PER_CLASS} bad answers`}; then run this again`
    : good.share >= BAR && bad.share >= BAR ? 'QUALIFIED' : 'NOT QUALIFIED',
};
if (arg('--out')) {
  if (outputClash({ files: [arg('--out')], inputs: [arg('--modes'), arg('--labels')] })) fail(`--out is ${arg('--out')}, one of the files this script reads: it would be written over. Nothing was written. Name another file.`);
  writeFileSync(arg('--out'), JSON.stringify(result, null, 1));
}
console.log(JSON.stringify(result, null, 1));
console.error(result.verdict === 'QUALIFIED' ? `QUALIFIED: ${good.k} of ${good.n} good answers and ${bad.k} of ${bad.n} bad answers called right. The reader's rows may be used.`
  : result.verdict === 'NOT QUALIFIED' ? `NOT QUALIFIED: ${good.k} of ${good.n} good answers and ${bad.k} of ${bad.n} bad answers called right, where ${BAR} of each is needed. The rows of this reader are not used: change the reader, and qualify it on planted answers again.`
    : result.verdict);
