// Scores test 5. Claims and labels: every kept output by the domain's check.mjs (fails per rule). i-have-adhd: every
// output by `atelier verify --skill i-have-adhd --json` on the build used for the runs, counting only rules a check of
// code decided (a written check or a counted rule); rules no code checks are reported as not scored. Hold rate per rule
// per arm, with counts, and the difference (atelier - plain) with a 95% interval (normal approximation).
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { cli, parseJson, DOMAINS, HERE, SCRATCH } from './lib.mjs';
import { tasksOf } from './consistency.mjs';

const ARMS = ['atelier', 'plain'];
const rows = (fx, arm) => { const d = join(HERE, 'arms', 'consistency', fx, arm); if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => /^[^.]+\.r\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(d, f), 'utf8'))); };
const ci = (a, na, b, nb) => { const p1 = a / na; const p2 = b / nb; const d = p1 - p2; const se = Math.sqrt((p1 * (1 - p1)) / na + (p2 * (1 - p2)) / nb); return { diff: d, lo: d - 1.96 * se, hi: d + 1.96 * se }; };
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const out = {}; const md = [];

for (const fx of ['claims', 'labels']) {
  const { check } = await import(join(DOMAINS, fx, 'check.mjs'));
  const per = {}; const all = {};
  for (const arm of [...ARMS, 'plainx']) {
    const rs = rows(fx, arm); all[arm] = { n: rs.length, noText: rs.filter((r) => !r.text).length, clean: 0, costUsd: rs.reduce((a, r) => a + (r.costUsd ?? r.meterUsd ?? 0), 0), states: {} };
    for (const r of rs) {
      if (r.state) all[arm].states[r.state] = (all[arm].states[r.state] ?? 0) + 1;
      const fails = r.text ? check(r.text, { id: r.task }).fails : ['(no output)'];
      // The oracle's R8 knows the invoice figures, their sum, the dates and the clause numbers, not the policy number
      // (CC-1370) or the report reference (CR/2026/4130), which are in the file too. A second reading, the study's own
      // and kept apart from the oracle: of the figures R8 names (it names at most four), one counts only when it is in
      // no material file of the task.
      if (fx === 'claims' && r.text) {
        const mat = tasksOf(fx).find((t) => t.id === r.task).material.map((m) => readFileSync(m.path, 'utf8')).join('\n').replace(/,/g, '');
        const named = (fails.find((f) => f.startsWith('R8 ')) ?? '').replace(/^[^:]*:\s*/, '').split(',').map((x) => x.trim()).filter(Boolean);
        if (named.some((n) => !new RegExp(`(^|[^\\d])${n.replace('.', '\\.')}([^\\d]|$)`).test(mat))) fails.push('R8* (re-read) a figure R8 names that is in no material file');
      }
      r.fails = fails; if (!fails.filter((f) => !f.startsWith('R8*')).length) all[arm].clean += 1;
      for (const f of fails) { const k = f.split(' ')[0]; per[k] = per[k] ?? { atelier: 0, plain: 0, plainx: 0, label: f.replace(/:.*$/, '') }; per[k][arm] += 1; }
    }
    writeFileSync(join(HERE, 'arms', 'consistency', fx, `${arm}.scores.jsonl`), rs.map((r) => JSON.stringify({ task: r.task, run: r.run, state: r.state ?? null, fails: r.fails })).join('\n') + '\n');
  }
  const na = all.atelier.n; const np = all.plain.n; const nx = all.plainx.n;
  const table = Object.entries(per).sort().map(([k, v]) => ({ rule: k, label: v.label, atelierHeld: na - v.atelier, plainHeld: np - v.plain, plainxHeld: nx - v.plainx, ...ci(na - v.atelier, na, np - v.plain, np), vsExamples: ci(na - v.atelier, na, nx - v.plainx, nx) }));
  const whole = ci(all.atelier.clean, na, all.plain.clean, np); const wholeX = ci(all.atelier.clean, na, all.plainx.clean, nx);
  out[fx] = { arms: all, table, wholeOutput: whole, wholeOutputVsExamples: wholeX };
  md.push(`### ${fx}\n\noutputs: atelier ${na} (${all.atelier.noText} without text; states ${JSON.stringify(all.atelier.states)}), plain ${np} (${all.plain.noText} without text)\n`);
  md.push(`| rule (check.mjs) | atelier held | plain (method) held | atelier - plain, 95% interval | plain (method + examples) held | atelier - plain+examples, 95% interval |\n|---|---|---|---|---|---|`);
  for (const t of table) md.push(`| ${t.label} | ${t.atelierHeld}/${na} | ${t.plainHeld}/${np} | ${pct(t.diff)} (${pct(t.lo)} to ${pct(t.hi)}) | ${t.plainxHeld}/${nx} | ${pct(t.vsExamples.diff)} (${pct(t.vsExamples.lo)} to ${pct(t.vsExamples.hi)}) |`);
  md.push(`| **every oracle rule held** | ${all.atelier.clean}/${na} | ${all.plain.clean}/${np} | ${pct(whole.diff)} (${pct(whole.lo)} to ${pct(whole.hi)}) | ${all.plainx.clean}/${nx} | ${pct(wholeX.diff)} (${pct(wholeX.lo)} to ${pct(wholeX.hi)}) |`);
  md.push(`\nRules not listed held in every output of every arm. R8* is the study's re-read, not the oracle, and is left out of the every-rule row. Intervals are the normal approximation; a bound past 100% is its artefact. Cost: atelier $${all.atelier.costUsd.toFixed(3)}, plain $${all.plain.costUsd.toFixed(3)}, plain + examples $${all.plainx.costUsd.toFixed(3)}.\n`);
}

// i-have-adhd: scored by Atelier's own verify on the code-decided rules
{
  const fx = 'adhd';
  const b = JSON.parse(readFileSync(join(HERE, 'ledger.json'), 'utf8')).entries.find((e) => e.step === 'test1' && e.fixture === 'adhd' && e.build === 1 && e.standardHash);
  const per = {}; const all = {}; const notScored = new Set();
  for (const arm of ARMS) {
    const rs = rows(fx, arm); all[arm] = { n: rs.length, noText: rs.filter((r) => !r.text).length, clean: 0, costUsd: rs.reduce((a, r) => a + (r.costUsd ?? r.meterUsd ?? 0), 0) };
    const scored = [];
    for (const r of rs) {
      if (!r.text) { scored.push({ task: r.task, run: r.run, fails: ['(no output)'] }); continue; }
      const p = join(SCRATCH, 'score-in', `${arm}-${r.task}-${r.run}.md`); mkdirSync(join(SCRATCH, 'score-in'), { recursive: true }); writeFileSync(p, r.text);
      const v = parseJson(cli(['verify', '--skill', 'i-have-adhd', p, '--json', '--claims', 'pattern'], { data: b.data, tag: 'score:adhd' }).stdout);
      const decided = (v?.checked ?? []).filter((c) => !/UNSOURCED/.test(c.requirementId) && ['MET', 'VIOLATED'].includes(c.result?.verdict));
      for (const u of v?.unchecked ?? []) notScored.add(`${u.requirementId}: ${u.statement}`);
      const fails = decided.filter((c) => c.result.verdict === 'VIOLATED').map((c) => `${c.requirementId}`);
      for (const c of decided) { per[c.requirementId] = per[c.requirementId] ?? { statement: c.statement, observer: c.observer, atelier: { held: 0, n: 0 }, plain: { held: 0, n: 0 } }; per[c.requirementId][arm].n += 1; if (c.result.verdict === 'MET') per[c.requirementId][arm].held += 1; }
      if (!fails.length) all[arm].clean += 1;
      scored.push({ task: r.task, run: r.run, fails });
    }
    writeFileSync(join(HERE, 'arms', 'consistency', fx, `${arm}.scores.jsonl`), scored.map((x) => JSON.stringify(x)).join('\n') + '\n');
  }
  const table = Object.entries(per).sort().map(([k, v]) => ({ rule: k, statement: v.statement, observer: v.observer, atelier: v.atelier, plain: v.plain, ...(v.atelier.n && v.plain.n ? ci(v.atelier.held, v.atelier.n, v.plain.held, v.plain.n) : {}) }));
  out[fx] = { arms: all, table, notScored: [...notScored] };
  md.push(`### i-have-adhd (code-decided rules only)\n\noutputs: atelier ${all.atelier.n} (${all.atelier.noText} without text), plain ${all.plain.n}\n`);
  md.push(`| rule | check | atelier held | plain held | difference | 95% interval |\n|---|---|---|---|---|---|`);
  for (const t of table) md.push(`| ${t.rule}: ${t.statement.slice(0, 70)} | ${t.observer} | ${t.atelier.held}/${t.atelier.n} | ${t.plain.held}/${t.plain.n} | ${t.diff === undefined ? '-' : pct(t.diff)} | ${t.lo === undefined ? '-' : `${pct(t.lo)} to ${pct(t.hi)}`} |`);
  md.push(`\nNot scored (judgement, no check of code): ${notScored.size} rule(s). Cost: atelier $${all.atelier.costUsd.toFixed(3)}, plain $${all.plain.costUsd.toFixed(3)}.\n`);
}
writeFileSync(join(HERE, 'arms', 'consistency', 'scores.json'), JSON.stringify(out, null, 1));
writeFileSync(join(HERE, 'arms', 'consistency', 'scores.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
