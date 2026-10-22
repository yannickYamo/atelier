// Prints the tables of A1 to A8 and C from the kept outputs (no model calls), as Markdown, and the spend by step.
import { join } from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { HERE, spend } from './lib.mjs';

const J = (p) => JSON.parse(readFileSync(join(HERE, p), 'utf8'));
const L = (p) => readFileSync(join(HERE, p), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const has = (p) => existsSync(join(HERE, p));
const md = [];

// ── A1 ──
if (has('arms/builds/a1.json')) {
  const a = J('arms/builds/a1.json');
  md.push('## A1: build 1 in a fresh data folder, builds 2 to 5 and then one reworded step in one data folder (a copy of build 1\'s)\n');
  md.push('| fixture | standard hashes (1, 2 to 5) | distinct | rebuild cost | requirements before / after the reword | changed by the reword | latitude kept |\n|---|---|---|---|---|---|---|');
  for (const [fx, x] of Object.entries(a)) md.push(`| ${fx} | ${x.series.join(', ')} | ${x.seriesDistinct} | see spend | ${x.reword ? `${x.reword.before} / ${x.reword.after}` : '-'} | ${x.reword ? x.reword.changed.map((c) => `${c.id}: ${c.change}${c.fields?.length ? ` (${c.fields.join(', ')})` : ''}`).join('; ') || 'none' : '-'}${x.reword?.dropped.length ? `; dropped: ${x.reword.dropped.join(' / ')}` : ''} | ${x.reword?.latitudeKept ?? '-'} |`);
  md.push('\n### Not A1: the same inputs built from scratch, five fresh data folders\n');
  md.push('| fixture | standard hashes | distinct | requirements | latitude |\n|---|---|---|---|---|');
  for (const [fx, x] of Object.entries(a)) md.push(`| ${fx} | ${x.hashes.join(', ')} | ${x.distinct} | ${x.requirements.join(', ')} | ${x.latitude.join(', ')} |`);
  md.push('');
  for (const [fx, x] of Object.entries(a)) {
    const byBuild = {}; for (const d of x.diffs) (byBuild[d.build] ??= []).push(`${d.statement ? `"${d.statement.slice(0, 50)}" ` : ''}${Array.isArray(d.change) ? d.change.join('+') : d.change}`);
    md.push(`${fx}: against build 1, ${Object.entries(byBuild).map(([b, v]) => `build ${b}: ${v.length} difference(s) (${v.slice(0, 6).join('; ')}${v.length > 6 ? '; ...' : ''})`).join('. ') || 'no difference'}.`);
  }
  md.push('');
}

// ── A2 + A3 ──
if (has('arms/verify')) {
  md.push('## A2 and A3: held-out goldens and planted defects (build 1 of each fixture, material bound)\n');
  md.push('| fixture | defect | oracle finds it | its step (method) | named by its step | with passage | its check enforced | record state |\n|---|---|---|---|---|---|---|---|');
  const sum = [];
  for (const f of readdirSync(join(HERE, 'arms/verify')).filter((x) => x.endsWith('.jsonl')).sort()) {
    const rows = L(`arms/verify/${f}`); const fx = f.replace(/-b\d+\.jsonl$/, '');
    const d = rows.filter((r) => r.kind === 'defect'); const g = rows.filter((r) => r.kind === 'golden');
    for (const r of d) md.push(`| ${fx} | ${r.defect} | ${r.oracleFinds ? 'yes' : 'no'} | ${r.expectStep} | ${r.named ? `yes (${r.stepIds.join(', ')})` : 'no'} | ${r.namedWithPassage ? 'yes' : 'no'} | ${r.stepEnforced === null ? '-' : r.stepEnforced ? 'yes' : 'no (reports)'} | ${r.state ?? `no record (exit ${r.exit})`} |`);
    sum.push({ fx, named: d.filter((r) => r.named).length, withPassage: d.filter((r) => r.namedWithPassage).length, blocked: d.filter((r) => r.named && r.stepEnforced).length, n: d.length,
      goldens: g.map((r) => `${r.id}: ${r.state}${r.blocked ? ` (${(r.recordFails ?? []).filter((x) => x.required).map((x) => x.id).join(', ')})` : ''}`) });
  }
  md.push('\n| fixture | named by its own step | with passage | blocked by its own step | held-out goldens (state) |\n|---|---|---|---|---|');
  for (const s of sum) md.push(`| ${s.fx} | ${s.named} of ${s.n} | ${s.withPassage} | ${s.blocked} | ${s.goldens.join('; ')} |`);
  md.push('\nOn 2026-10-21 (build 2, the build the later tests used): claims named 5 of 5 with passage, blocked 2; labels named 3, blocked 1; goldens: claims 0 of 10 blocked, labels 10 of 12 blocked (copying check).\n');
}

// ── A4 + A5 ──
if (has('arms/consistency/delivery.json')) {
  const dl = J('arms/consistency/delivery.json');
  md.push('## A4: delivery (Atelier arm, each run\'s own record)\n');
  md.push('| fixture | outputs | delivered | states | latitude | accepted unmeasured | head on every output (A8) |\n|---|---|---|---|---|---|---|');
  for (const [fx, x] of Object.entries(dl)) md.push(`| ${fx} | ${x.n} | ${x.delivered} | ${JSON.stringify(x.states)} | ${x.latitude?.skill ?? x.latitude?.level ?? '-'} | ${(x.acceptedUnmeasured ?? []).map((a) => a.id).join(', ') || 'none'} | ${x.heads.full} full + ${x.heads.error} ERROR heads of ${x.n}${x.heads.none.length ? `; without: ${x.heads.none.join(', ')}` : ''} |`);
  md.push('');
  for (const [fx, x] of Object.entries(dl)) { const c = Object.entries(x.causes).sort((a, b) => b[1] - a[1]); if (c.length) md.push(`${fx}, what sent a run to review: ${c.map(([k, v]) => `${k} (${v})`).join('; ')}.\n`); }
}
if (has('arms/consistency/scores.md')) md.push('## A4 and A5: rules held, by arm (domain check.mjs; i-have-adhd by verify)\n', readFileSync(join(HERE, 'arms/consistency/scores.md'), 'utf8'));

// ── A6 ──
if (has('arms/hook.json')) {
  md.push('## A6 and the hook (claims build 1)\n\n| event | exit | seconds | stderr (first line) |\n|---|---|---|---|');
  for (const h of J('arms/hook.json')) md.push(`| ${h.label} | ${h.exit} | ${h.seconds} | ${(h.stderr ?? '').split('\n').filter(Boolean)[0]?.slice(0, 160) ?? ''} |`);
  md.push('');
}

// ── A7 ──
if (has('arms/repair/claims.jsonl')) {
  md.push('## A7: repair on the five claims defects (claims build 1, material bound)\n');
  md.push('| defect | oracle before | oracle after | fixed | state after | material figures lost | sentences added / dropped |\n|---|---|---|---|---|---|---|');
  for (const r of L('arms/repair/claims.jsonl')) md.push(`| ${r.defect} | ${r.oracleBefore.join('; ')} | ${r.oracleAfter?.join('; ') || '(clean)'} | ${r.oracleAfter && r.oracleAfter.length === 0 ? 'yes' : 'no'} | ${r.stateAfter} | ${r.materialFiguresLost?.length ?? '-'} | ${r.sentencesAdded?.length ?? '-'} / ${r.sentencesDropped?.length ?? '-'} |`);
  md.push('');
}

// ── C ──
if (has('latitude/summary.json')) {
  const c = J('latitude/summary.json');
  md.push(`## C: latitude reading, 30 cases by ${c.draws} draws (${c.model})\n`);
  md.push(`Right in at least 4 of 5 draws: ${c.rightIn4of5} of ${c.cases} (STRICT ${c.byLabel.STRICT}, GROUNDED ${c.byLabel.GROUNDED}, CREATIVE ${c.byLabel.CREATIVE}); a STRICT case read CREATIVE: ${c.strictReadCreative} draw(s); floors: ${c.floors}; cost $${c.meterUsd.toFixed(4)}. Wrong: ${c.wrong.map((w) => `${w.id} ${w.label}: ${w.levels.join(',')}`).join('; ') || 'none'}.\n`);
}

// ── spend ──
const s = spend(); const step = {};
for (const [t, v] of Object.entries(s.byTag)) { const k = t.split(':').slice(0, t.startsWith('t5') ? 3 : 2).join(':'); step[k] = step[k] ?? { usd: 0, calls: 0 }; step[k].usd += v.usd; step[k].calls += v.calls; }
md.push('## Spend (meter)\n\n| step | calls | USD |\n|---|---|---|');
for (const [k, v] of Object.entries(step).sort()) md.push(`| ${k} | ${v.calls} | ${v.usd.toFixed(4)} |`);
md.push(`| **total** | | **${s.total.toFixed(4)}** |`);
console.log(md.join('\n'));
