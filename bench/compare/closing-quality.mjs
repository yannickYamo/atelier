// bench/compare/closing-quality.mjs — THE ANALYSIS OF A CLOSING QUALITY CLAIM, FIXED BEFORE THE RUN.
//
// Sealed with studies/CLOSING_A_PREREGISTRATION.md (coding answers, against i-have-adhd) and
// studies/CLOSING_AW_PREREGISTRATION.md (writing, against stop-slop): the tester seals this file's sha256 with the
// pre-registration, so the rule that reads the result is written before the result exists. No model call.
//
//   node bench/compare/closing-quality.mjs --config <config.json> [--out <result.json>]
//
// config.json (every path relative to the config):
//   claim        "A" or "A-w"; n and k for the sentence
//   weights      {dimension: weight}: the judge's own weighting; the weighted score is Σ weight × dimension
//   scores       [files]: the judge's rows {case_id, trial, condition, <dimensions>, blocker?}. One file a judging
//                session; a case's arms are compared only inside a session, then averaged over sessions
//   conditions   {bare, handwritten, strongest, candidate}: which `condition` label is which arm
//   verify       file: {case_id, trial, condition, applicable, held}: REQUIRED measured rules, by `atelier verify`
//   human        file: {case_id, trial, condition, held (bool), parts_asked?, parts_given?}: a person, blind to arm
//   preference   file (writing): {case_id, reader, chose}: "candidate" or "comparator", read blind
//   depthCases   [case ids] that ask for named parts
//   harms        [{name, file}] (writing): {case_id, trial, condition, count}: a counted harm, such as invented specifics delivered
//   margins      {handwritten, overall, dimension, preference} and minUnits, exactly as sealed. `handwritten: 0` makes
//                the claim "scores higher than the hand-written skill"; `overall` is the bar against the strongest
//                other baseline
//   cost         file: {condition, cost_usd, conformant (bool)}
//
// THE UNIT IS THE CASE. Trials are averaged inside a case and sessions over a case before any difference is taken;
// a bound is one-sided, from the case-level paired differences (Student t). Two kinds of endpoint:
//   SHOW   the bound must clear the bar (better than the bare model; not worse than a baseline by the margin; holds
//          the shared rules more often). Failing to show it is a FAIL.
//   GUARD  fails only on a clear loss: the 97.5% bound excludes zero on the losing side (blockers, requested depth),
//          or a dimension's 95% bound is below the dimension margin. A guard asks "is there a clear loss", never
//          "was no loss shown": as a SHOW, an arm exactly equal on blockers passed about one time in three.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tCrit } from '../../dist/core/stats/t.js';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
const fail = (m) => { console.error(`closing-quality: ${m}`); process.exit(2); };
const jsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const r3 = (x) => Math.round(x * 1000) / 1000;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** One-sided bounds of the mean of paired differences: `lo95` is the lower 95% bound, `hi95` the upper, and the 97.5% pair. */
export function bounds(diffs) {
  const n = diffs.length;
  if (n < 2) return { n, mean: n ? diffs[0] : null, lo95: null, hi95: null, lo975: null, hi975: null };
  const m = mean(diffs); const se = Math.sqrt(diffs.reduce((a, d) => a + (d - m) ** 2, 0) / (n - 1) / n);
  const t95 = tCrit(n - 1, 0.95); const t975 = tCrit(n - 1, 0.975);
  return { n, mean: r3(m), lo95: r3(m - t95 * se), hi95: r3(m + t95 * se), lo975: r3(m - t975 * se), hi975: r3(m + t975 * se) };
}

/** Per case, the mean of `value(row)` for one condition: trials averaged, then files (sessions) averaged. */
function perCase(files, condition, value) {
  const bySession = files.map((rows) => {
    const m = new Map();
    for (const r of rows) { if (r.condition !== condition) continue; const v = value(r); if (typeof v !== 'number' || !Number.isFinite(v)) continue; m.set(r.case_id, [...(m.get(r.case_id) ?? []), v]); }
    return new Map([...m].map(([k, vs]) => [k, mean(vs)]));
  });
  const out = new Map();
  for (const id of new Set(bySession.flatMap((m) => [...m.keys()]))) out.set(id, mean(bySession.flatMap((m) => (m.has(id) ? [m.get(id)] : []))));
  return out;
}
/** Paired case-level differences a − b, over the cases both arms have. */
const paired = (a, b) => [...a.keys()].filter((k) => b.has(k)).map((k) => a.get(k) - b.get(k));

export function analyse(cfg, load) {
  // `handwritten` is the bar against the hand-written skill itself: 0 means the claim is "scores higher", and the
  // lower bound must be above it. `overall` is the bar against the strongest other baseline ("not worse than").
  const C = cfg.conditions; const M = { overall: -0.2, dimension: -0.25, preference: 0.4, ...(cfg.margins ?? {}) };
  if (M.handwritten === undefined) M.handwritten = M.overall;
  const sessions = cfg.scores.map(load);
  const dims = Object.keys(cfg.weights);
  const weighted = (r) => dims.reduce((s, d) => s + cfg.weights[d] * r[d], 0);
  const score = (cond, f = weighted) => perCase(sessions, cond, f);
  const cand = score(C.candidate);
  const valid = [...cand.keys()].filter((k) => [C.bare, C.handwritten, C.strongest].filter(Boolean).every((c) => score(c).has(k))).length;
  const E = {};
  // SHOW: better than the bare model; not worse than the hand-written skill, nor than the strongest baseline.
  if (C.bare) { const b = bounds(paired(cand, score(C.bare))); E.P1 = { what: 'better than the bare model', ...b, bar: '> 0', pass: b.lo95 !== null && b.lo95 > 0 }; }
  const against = [['the hand-written skill', C.handwritten], ...(C.strongest && C.strongest !== C.handwritten ? [['the strongest baseline', C.strongest]] : [])];
  E.P2 = against.map(([name, c], i) => { const bar = i === 0 ? M.handwritten : M.overall; const b = bounds(paired(cand, score(c)));
    return { what: `${bar >= 0 ? 'scores higher than' : 'not worse than'} ${name}`, ...b, bar: `> ${bar}`, pass: b.lo95 !== null && b.lo95 > bar }; });
  // GUARD: no dimension clearly worse than the hand-written skill.
  E.P3 = dims.map((d) => { const b = bounds(paired(score(C.candidate, (r) => r[d]), score(C.handwritten, (r) => r[d]))); return { what: d, ...b, bar: `upper bound not below ${M.dimension}`, pass: !(b.hi95 !== null && b.hi95 < M.dimension) }; });
  // GUARD: blockers. Fails only when the candidate clearly has more.
  if (sessions.some((rows) => rows.some((r) => typeof r.blocker === 'boolean'))) {
    const rate = (c) => score(c, (r) => (r.blocker ? 1 : 0));
    E.P4 = [C.handwritten, C.strongest].filter((c, i, a) => c && a.indexOf(c) === i).map((c) => { const b = bounds(paired(rate(C.candidate), rate(c))); return { what: `blockers against ${c}`, ...b, bar: 'not clearly more', pass: !(b.lo975 !== null && b.lo975 > 0) }; });
  }
  // SHOW: the shared REQUIRED rules are held more often. Counted by `atelier verify`; a person confirms the counts.
  if (cfg.verify) {
    const v = [load(cfg.verify)]; const held = (c) => perCase(v, c, (r) => (r.applicable > 0 ? r.held / r.applicable : null));
    const b = bounds(paired(held(C.candidate), held(C.handwritten)));
    E.P5 = { what: 'the shared required rules held more often', ...b, bar: '> 0', pass: b.lo95 !== null && b.lo95 > 0 };
    if (cfg.human) {
      const key = (r) => `${r.case_id}\u0000${r.trial}\u0000${r.condition}`;
      const machine = new Map(v[0].map((r) => [key(r), r.applicable > 0 && r.held === r.applicable]));
      const coded = load(cfg.human).filter((r) => typeof r.held === 'boolean' && machine.has(key(r)));
      const agree = coded.filter((r) => machine.get(key(r)) === r.held).length;
      E.P5.agreement = { coded: coded.length, share: coded.length ? r3(agree / coded.length) : null, bar: '>= 0.90' };
      if (!(coded.length > 0 && agree / coded.length >= 0.9)) E.P5.unresolved = 'a person and atelier verify agree on fewer than 0.90 of the answers coded';
    }
  }
  // GUARD: requested depth, on the cases that ask for named parts, coded by a person blind to arm.
  if (cfg.human && cfg.depthCases?.length) {
    const want = new Set(cfg.depthCases); const h = [load(cfg.human).filter((r) => want.has(r.case_id))];
    const given = (c) => perCase(h, c, (r) => (r.parts_asked > 0 ? r.parts_given / r.parts_asked : null));
    const b = bounds(paired(given(C.candidate), given(C.handwritten)));
    E.P6 = { what: 'requested parts given', ...b, bar: 'not clearly fewer', pass: !(b.hi975 !== null && b.hi975 < 0) };
  }
  // GUARD: a counted harm (invented specifics delivered, in writing). Fails only when the candidate clearly has more.
  for (const hm of cfg.harms ?? []) {
    const rows = [load(hm.file)]; const count = (c) => perCase(rows, c, (r) => r.count);
    const b = bounds(paired(count(C.candidate), count(C.handwritten)));
    (E.HARM ??= []).push({ what: hm.name, ...b, bar: 'not clearly more', pass: !(b.lo975 !== null && b.lo975 > 0) });
  }
  // SHOW (writing): readers do not prefer the comparator by a clear margin.
  if (cfg.preference) {
    const by = new Map();
    for (const r of load(cfg.preference)) by.set(r.case_id, [...(by.get(r.case_id) ?? []), r.chose === 'candidate' ? 1 : 0]);
    const shares = [...by.values()].map(mean); const b = bounds(shares.map((s) => s - M.preference));
    E.PREF = { what: 'readers choosing the Atelier piece', n: shares.length, mean: shares.length ? r3(mean(shares)) : null, lo95: b.lo95 === null ? null : r3(b.lo95 + M.preference), bar: `> ${M.preference}`, pass: b.lo95 !== null && b.lo95 > 0 };
  }
  if (cfg.cost) {
    const rows = load(cfg.cost);
    E.cost = Object.fromEntries([...new Set(rows.map((r) => r.condition))].map((c) => { const rs = rows.filter((r) => r.condition === c); const ok = rs.filter((r) => r.conformant !== false).length;
      return [c, { dollars: r3(rs.reduce((a, r) => a + (r.cost_usd ?? 0), 0)), answers: rs.length, perUsableAnswer: ok ? r3(rs.reduce((a, r) => a + (r.cost_usd ?? 0), 0) / ok) : null }]; }));
  }
  const all = [E.P1, ...(E.P2 ?? []), ...(E.P3 ?? []), ...(E.P4 ?? []), E.P5, E.P6, ...(E.HARM ?? []), E.PREF].filter(Boolean);
  const failed = all.filter((e) => e.pass === false);
  const unresolved = valid < (cfg.minUnits ?? 0) ? `only ${valid} cases have every arm judged, under the minimum of ${cfg.minUnits}` : E.P5?.unresolved ?? null;
  const verdict = unresolved ? 'UNRESOLVED' : failed.length ? 'FAIL' : 'PASS';
  const subject = cfg.claim === 'A-w' ? `On ${valid} writing briefs it never saw, an Atelier skill built from ${cfg.k ?? '[k]'} pieces` : `On ${valid} coding tasks it never saw, the Atelier plug-in built from ${cfg.k ?? '[k]'} examples`;
  const sentence = verdict === 'UNRESOLVED' ? `The quality comparison did not complete: ${unresolved}. It is closed without a result.`
    // "Scored higher" is said only when it was shown: the lower bound of the difference against every baseline is above zero.
    : verdict === 'PASS' ? `${subject} ${E.P2[0].lo95 > 0 ? `scored higher overall than the hand-written skill (+${E.P2[0].mean}, lower bound +${E.P2[0].lo95})` : 'was not worse overall than the hand-written skill'}${E.P2[1] ? (E.P2[1].lo95 > 0 ? ` and higher than the strongest baseline (+${E.P2[1].mean})` : ' and was not worse than the strongest baseline') : ''}, no quality dimension${E.P4 ? ', blocker rate' : ''}${E.P6 ? ' or requested depth' : ''} showed a clear loss${E.PREF ? `, readers chose its piece ${Math.round((E.PREF.mean ?? 0) * 100)}% of the time` : ''}, and it held the shared required rules more often. This is not a result for each dimension separately.`
      : failed.map((e) => `${subject} failed "${e.what}": ${e.mean} (bounds ${e.lo95 ?? e.lo975} to ${e.hi95 ?? e.hi975}), where the bar was ${e.bar}.`).join(' ');
  return { claim: cfg.claim ?? 'A', validCases: valid, margins: M, endpoints: E, verdict, sentence };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const file = arg('--config') ?? fail('missing --config');
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  const result = analyse(cfg, (f) => jsonl(resolve(dirname(file), f)));
  if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result, null, 1));
}
