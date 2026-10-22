// D1 to D6 from the kept outputs (no model calls). Writes arms/analysis.json and prints the tables as Markdown.
// D1, D2: an Atelier output is DELIVERED when its own record's state is VERIFIED (the owner's acceptances applied at
//   the amend); for every other run, the required entries that held it (needsReview as core/eval/record.ts defines it)
//   and any that failed. Beside it, NOT a pass line: the share that would be delivered had the steps whose written check
//   did not qualify been accepted too (the owner did not accept them).
// D3: every rule of the domain's check.mjs held (its R8 reads the task's material), Atelier vs the method + the examples
//   Atelier serves, 10 tasks x 2 runs each, difference with a 95% interval (normal approximation).
// D4: repair rows; D5: hook rows; D6: planted defects named by their own step with the passage.
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { HERE, DOMAINS, spend } from './lib.mjs';

const needsReview = (e) => e.required && e.reason !== 'LISTED_FOR_YOU' && (e.result === 'UNVERIFIED' || e.reason === 'SET_ASIDE');
const ci = (a, na, b, nb) => { const p1 = a / na; const p2 = b / nb; const d = p1 - p2; const se = Math.sqrt((p1 * (1 - p1)) / na + (p2 * (1 - p2)) / nb); return { diff: d, lo: d - 1.96 * se, hi: d + 1.96 * se }; };
const pct = (x) => `${(100 * x).toFixed(1)}`;
const out = {}; const md = [];
const runsOf = (fx, arm) => { const d = join(HERE, 'arms', 'consistency', fx, arm); if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => /^t\d+\.r\d+\.json$/.test(f)).sort().map((f) => ({ f, rec: JSON.parse(readFileSync(join(d, f), 'utf8')), full: existsSync(join(d, f.replace('.json', '.full.json'))) ? (() => { try { return JSON.parse(readFileSync(join(d, f.replace('.json', '.full.json')), 'utf8')); } catch { return null; } })() : null })); };

// D1, D2
for (const [D, fx] of [['D1', 'claims'], ['D2', 'labels']]) {
  const rs = runsOf(fx, 'atelier'); const held = {}; const rows = []; let delivered = 0; let ifUnqualifiedAccepted = 0; const states = {};
  for (const { f, full } of rs) {
    const st = full?.state ?? 'NO RECORD'; states[st] = (states[st] ?? 0) + 1;
    const es = full?.record?.entries ?? [];
    const nr = es.filter(needsReview); const failed = es.filter((e) => e.required && e.result === 'FAIL');
    if (st === 'VERIFIED') delivered += 1;
    if (st === 'VERIFIED' || (st === 'NEEDS_REVIEW' && !failed.length && nr.every((e) => e.reason === 'OBSERVER_UNQUALIFIED'))) ifUnqualifiedAccepted += 1;
    for (const e of [...nr, ...failed]) { const k = `${e.id} ${e.result}/${e.reason}`; held[k] = (held[k] ?? 0) + 1; }
    rows.push({ run: f.replace('.json', ''), state: st, heldBy: [...failed.map((e) => `${e.id} FAIL`), ...nr.map((e) => `${e.id} ${e.reason}`)] });
  }
  const accepted = rs.find((r) => r.full?.certificate)?.full.certificate.acceptedUnmeasured ?? null;
  out[D] = { fixture: fx, n: rs.length, delivered, states, held, rows, accepted: accepted?.map((a) => a.id ?? a) ?? null, ifUnqualifiedAccepted };
  md.push(`## ${D} ${fx}: delivered ${delivered} of ${rs.length}\n\nStates ${JSON.stringify(states)}; accepted unmeasured on the certificate: ${JSON.stringify(out[D].accepted)}. Not a pass line: had the steps whose check did not qualify been accepted too, ${ifUnqualifiedAccepted} of ${rs.length}.\n`);
  md.push('| entry that held a run | runs |\n|---|---|'); for (const [k, v] of Object.entries(held).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${v} |`);
  md.push('\n| run | state | held by |\n|---|---|---|'); for (const r of rows) md.push(`| ${r.run} | ${r.state} | ${r.heldBy.join(', ') || '-'} |`); md.push('');
}

// D3
{
  const { check } = await import(join(DOMAINS, 'claims', 'check.mjs'));
  const arm = (a) => { const rs = runsOf('claims', a); const per = {}; let clean = 0; const scores = [];
    for (const { rec } of rs) { const fails = rec.text ? check(rec.text, { id: rec.task }).fails : ['(no output)']; if (!fails.length) clean += 1; scores.push({ task: rec.task, run: rec.run, fails });
      for (const x of fails) { const k = x.split(' ')[0]; per[k] = (per[k] ?? 0) + 1; } }
    writeFileSync(join(HERE, 'arms', 'consistency', 'claims', `${a}.scores.jsonl`), scores.map((s) => JSON.stringify(s)).join('\n') + '\n');
    return { n: rs.length, clean, per, costUsd: rs.reduce((s, r) => s + (r.rec.meterUsd ?? 0), 0) }; };
  const A = arm('atelier'); const X = arm('plainx'); const c = ci(A.clean, A.n, X.clean, X.n);
  out.D3 = { atelier: A, plainx: X, ...c, pass: c.lo > 0 };
  md.push(`## D3 claims every-rule hold\n\nAtelier ${A.clean}/${A.n}, method + served examples ${X.clean}/${X.n}: difference ${pct(c.diff)} points (95% interval ${pct(c.lo)} to ${pct(c.hi)}).\n`);
  md.push('| rule | atelier fails | method + examples fails |\n|---|---|---|');
  for (const k of [...new Set([...Object.keys(A.per), ...Object.keys(X.per)])].sort()) md.push(`| ${k} | ${A.per[k] ?? 0} | ${X.per[k] ?? 0} |`); md.push('');
}

// D4
if (existsSync(join(HERE, 'arms', 'repair', 'claims.jsonl'))) {
  const rows = readFileSync(join(HERE, 'arms', 'repair', 'claims.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const EXPECT = { date: 'R8c', reserve: 'R5', exclusion: 'R3b', speculation: 'R7', uncited: 'R2' };
  const r = rows.map((x) => { const d = x.defect.split('.')[1]; const rule = EXPECT[d]; const before = (x.oracleBefore ?? []).some((f) => f.startsWith(rule)); const after = x.oracleAfter ? x.oracleAfter.some((f) => f.startsWith(rule)) : null;
    return { defect: d, rule, foundBefore: before, fixed: before && after === false, stateAfter: x.stateAfter, added: x.sentencesAdded?.length ?? null, dropped: x.sentencesDropped?.length ?? null, negationFlips: x.negationFlips?.length ?? null, figuresLost: x.materialFiguresLost?.length ?? null, oracleAfter: x.oracleAfter }; });
  out.D4 = { fixed: r.filter((x) => x.fixed).length, rows: r };
  md.push(`## D4 repair: ${out.D4.fixed} of 5 fixed\n\n| defect | oracle rule | fixed | state after | sentences added / dropped | negation flips | material figures lost |\n|---|---|---|---|---|---|---|`);
  for (const x of r) md.push(`| ${x.defect} | ${x.rule} | ${x.fixed} | ${x.stateAfter} | ${x.added} / ${x.dropped} | ${x.negationFlips} | ${x.figuresLost} |`); md.push('');
}

// D5
if (existsSync(join(HERE, 'arms', 'hook.json'))) {
  const h = JSON.parse(readFileSync(join(HERE, 'arms', 'hook.json'), 'utf8'));
  const nj = h.find((x) => x.label === 'not-json'); const ho = h.find((x) => x.label === 'write:heldout-e10');
  out.D5 = { notJson: nj, heldOut: ho, pass: nj?.exit === 2 && ho?.exit === 0 && /x\d+/.test(ho?.stderr ?? '') };
  md.push(`## D5 hook\n\n| event | exit | seconds | stderr |\n|---|---|---|---|`); for (const x of h) md.push(`| ${x.label} | ${x.exit} | ${x.seconds} | ${String(x.stderr).replace(/\n/g, ' ').slice(0, 300)} |`); md.push('');
}

// D6
for (const fx of ['claims', 'labels']) {
  const p = join(HERE, 'arms', 'verify', `${fx}-b1.jsonl`); if (!existsSync(p)) continue;
  const rows = readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const d = rows.filter((x) => x.kind === 'defect'); const g = rows.filter((x) => x.kind === 'golden');
  out[`D6:${fx}`] = { namedWithPassage: d.filter((x) => x.namedWithPassage).length, n: d.length, rows: d.map((x) => ({ defect: x.defect, step: x.expectStep, ids: x.stepIds, named: x.named, withPassage: x.namedWithPassage, enforced: x.stepEnforced, state: x.state })), goldens: g.map((x) => ({ id: x.id, state: x.state })) };
  md.push(`## D6 ${fx}: ${out[`D6:${fx}`].namedWithPassage} of ${d.length} named by their own step with the passage\n\n| defect | step | named (ids) | with passage | step enforced | state |\n|---|---|---|---|---|---|`);
  for (const x of d) md.push(`| ${x.defect} | ${x.expectStep} | ${x.named} (${x.stepIds.join(', ')}) | ${x.namedWithPassage} | ${x.stepEnforced} | ${x.state} |`);
  md.push(`\nHeld-out goldens: ${g.map((x) => `${x.id} ${x.state}`).join(', ')}.\n`);
}
const s = spend(); out.spend = s;
md.push(`## Spend\n\nMeter total $${s.total.toFixed(4)}.\n\n| tag | calls | usd |\n|---|---|---|`); for (const [k, v] of Object.entries(s.byTag)) md.push(`| ${k} | ${v.calls} | ${v.usd.toFixed(4)} |`);
writeFileSync(join(HERE, 'arms', 'analysis.json'), JSON.stringify(out, null, 1));
writeFileSync(join(HERE, 'report.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
