// bench/compare/judge-qualification.mjs — IS THE JUDGE FIT TO JUDGE: PLANTED GOOD AND PLANTED BAD ANSWERS, CALLED RIGHT?
//
// Before a judge's scores decide anything, it is shown answers whose quality is known. The tester writes, for tasks
// that are NOT in the test split, at least 20 answers that are good and 20 that are bad by the rubric (a wrong fix,
// work handed back, invented results, padding), labels them, and has the judge score them in the same session
// format as the real run. This reads the judge's rows and says how often each class was called right. No model call.
//
//   node bench/compare/judge-qualification.mjs --scores <judge rows.jsonl> --labels <labels.jsonl> --weights <json> --threshold <n>
//        [--second <second judge's rows.jsonl>] [--out <result.json>]
//   labels.jsonl   {case_id, condition, label}: "good" or "bad", sealed before the judge runs
//   --weights      a JSON object of dimension to weight: the rubric's own weighting
//   --threshold    the weighted score at or above which an answer counts as called good, sealed with the labels
//                  (for a rubric that names its own line, that line: stop-slop revises below 35 of 50)
//
// Called right: a good answer at or above the threshold with no blocker; a bad answer below it, or marked a blocker.
// THE BAR: at least 0.85 of each class. A second judge from another model family is read the same way, and its
// agreement with the first, answer by answer, is reported.
//
// THE VERDICT. Without --second: QUALIFIED or NOT QUALIFIED by that bar, and UNRESOLVED when fewer than 20 answers of
// a class were judged. With --second the pre-registration's own line is read too (studies/CLOSING_A_PREREGISTRATION.md,
// "Judge"): when the two judges agree on fewer than 0.80 of the planted answers, the verdict is UNRESOLVED, whatever
// the first judge scored alone. Two judges that do not call the same answers good are not one instrument.
import { readFileSync, writeFileSync } from 'node:fs';
import { clopperPearson } from '../../dist/core/stats/sign-test.js';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
const fail = (m) => { console.error(`judge-qualification: ${m}`); process.exit(2); };
const jsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const weights = JSON.parse(arg('--weights') ?? fail('missing --weights'));
const threshold = Number(arg('--threshold') ?? fail('missing --threshold'));
const labels = new Map(jsonl(arg('--labels') ?? fail('missing --labels')).map((r) => [`${r.case_id}\u0000${r.condition}`, r.label]));
const rate = (k, n) => { const c = clopperPearson(k, n); return { k, n, share: n ? Math.round((k / n) * 1000) / 1000 : null, ci95: [Math.round(c.lo * 1000) / 1000, Math.round(c.hi * 1000) / 1000] }; };
/** Per answer: whether this judge called it good (trials averaged). */
function calls(file) {
  const by = new Map();
  for (const r of jsonl(file)) {
    const k = `${r.case_id}\u0000${r.condition}`; if (!labels.has(k)) continue;
    const w = Object.keys(weights).reduce((s, d) => s + weights[d] * r[d], 0);
    by.set(k, [...(by.get(k) ?? []), { w, blocker: r.blocker === true }]);
  }
  return new Map([...by].map(([k, xs]) => [k, xs.reduce((a, x) => a + x.w, 0) / xs.length >= threshold && !xs.some((x) => x.blocker)]));
}
function read(file) {
  const c = calls(file); const of = (label) => [...c].filter(([k]) => labels.get(k) === label);
  const good = rate(of('good').filter(([, g]) => g).length, of('good').length); const bad = rate(of('bad').filter(([, g]) => !g).length, of('bad').length);
  const enough = good.n >= 20 && bad.n >= 20;
  return { goodCalledGood: good, badCalledBad: bad, unjudged: labels.size - c.size, enough, qualified: enough && good.share >= 0.85 && bad.share >= 0.85, calls: c };
}
const first = read(arg('--scores') ?? fail('missing --scores'));
const result = { threshold, judge: { ...first, calls: undefined } };
if (arg('--second')) {
  const second = read(arg('--second'));
  const both = [...first.calls.keys()].filter((k) => second.calls.has(k));
  result.second = { ...second, calls: undefined };
  result.agreement = rate(both.filter((k) => first.calls.get(k) === second.calls.get(k)).length, both.length);
}
const AGREEMENT = 0.8;
const apart = result.agreement && !(result.agreement.share >= AGREEMENT);
result.verdict = !first.enough ? 'UNRESOLVED: fewer than 20 answers of a class were judged'
  : apart ? `UNRESOLVED: the two judges agree on ${result.agreement.share ?? 'none'} of the ${result.agreement.n} planted answers both judged, under the ${AGREEMENT.toFixed(2)} the pre-registration sets. The claim cannot be read with this pair of judges`
    : first.qualified ? 'QUALIFIED' : 'NOT QUALIFIED';
if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
