// Prints the tables of tests 1/11, 2/3, 4, 6, 7, 8/12 and 9 from the kept outputs (no model calls), as Markdown.
import { join } from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { HERE, spend } from './lib.mjs';

const J = (p) => JSON.parse(readFileSync(join(HERE, p), 'utf8'));
const L = (p) => readFileSync(join(HERE, p), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const md = [];

// ── 1 + 11 ──
const sb = J('arms/builds/summary.json');
md.push('## Tests 1 and 11: coverage and reproducibility (3 builds per fixture)\n');
md.push('| fixture | build | steps | measure | written | written qualified | judgement | standard hash |\n|---|---|---|---|---|---|---|---|');
for (const f of ['claims', 'labels']) for (const b of sb[f].builds) md.push(`| ${f} | ${b.build} | ${b.measurable + b.written + b.judgement} | ${b.measurable} | ${b.written} | ${b.writtenQualified} | ${b.judgement} | ${b.hash} |`);
for (const b of sb.adhd.builds) md.push(`| i-have-adhd (atelier skill) | ${b.build} | ${b.rules} rules | 0 | ${b.writtenChecks} | 0 | ${b.rules - b.writtenChecks} | ${b.hash} |`);
md.push('');
for (const f of ['claims', 'labels']) {
  md.push(`${f}: ${sb[f].stepsSameColumn} of ${sb[f].of} steps in the same column in all three builds; ${sb[f].distinctHashes} distinct hashes from the same inputs.`);
  for (const s of sb[f].perStep.filter((x) => !x.same)) md.push(`- step ${s.step} moved: ${s.columns.join(' / ')}`);
  const w = sb[f].perStep.filter((s) => s.columns.every((c) => c === 'written'));
  md.push(`- of ${w.length} steps written in all three builds, the qualification agreed in ${w.filter((s) => new Set(s.qualified).size === 1).length}; qualified in all three: ${w.filter((s) => s.qualified.every(Boolean)).length}.`);
}
md.push('');

// ── 2 + 3 ──
md.push('## Tests 2 and 3: planted defects named and blocked; goldens not blocked\n');
md.push('| fixture | build | defect | oracle finds it | named by its step (with passage) | its check enforced | blocked by its step | record state |\n|---|---|---|---|---|---|---|---|');
const vsum = {};
for (const f of readdirSync(join(HERE, 'arms/verify')).sort()) {
  const rows = L(`arms/verify/${f}`); const [fx, b] = f.replace('.jsonl', '').split('-b');
  const d = rows.filter((r) => r.kind === 'defect'); const g = rows.filter((r) => r.kind === 'golden');
  for (const r of d) md.push(`| ${fx} | ${b} | ${r.defect} | ${r.oracleFinds ? 'yes' : 'no'} | ${r.named ? (r.namedWithPassage ? 'yes, with passage' : 'yes, no passage') : 'no'} | ${r.stepEnforced === null ? '-' : r.stepEnforced ? 'yes' : 'no (reports)'} | ${r.named && r.stepEnforced ? 'yes' : 'no'} | ${r.state} |`);
  vsum[f] = { fx, b, defects: d.length, named: d.filter((r) => r.named).length, withPassage: d.filter((r) => r.namedWithPassage).length, blockedByStep: d.filter((r) => r.named && r.stepEnforced).length,
    goldens: g.length, goldenBlocked: g.filter((r) => r.blocked).length, goldenBlockCauses: [...new Set(g.flatMap((r) => (r.recordFails ?? []).filter((x) => x.required).map((x) => x.id)))],
    goldenReportFires: g.reduce((a, r) => a + (r.recordFails ?? []).filter((x) => !x.required).length, 0), oracleCleanGoldens: g.filter((r) => !r.oracle.length).length };
}
md.push('\n| fixture | build | named (of 5) | named with passage | blocked by its own step | goldens blocked | cause of the golden blocks | reporting checks firing on goldens |\n|---|---|---|---|---|---|---|---|');
for (const v of Object.values(vsum)) md.push(`| ${v.fx} | ${v.b} | ${v.named} | ${v.withPassage} | ${v.blockedByStep} | ${v.goldenBlocked} of ${v.goldens} (oracle: ${v.goldens - v.oracleCleanGoldens} with a fail) | ${v.goldenBlockCauses.join(', ') || '-'} | ${v.goldenReportFires} |`);
md.push('');

// ── 4 ──
md.push('## Test 4: repair safety (claims build 2, material bound)\n');
md.push('| defect | oracle before | oracle after | state after | rewrites kept / refused | material figures lost | sentences added / dropped | why |\n|---|---|---|---|---|---|---|---|');
for (const r of L('arms/repair/claims.jsonl')) {
  const j = J(`arms/repair/${r.defect.replace('.md', '.json')}`);
  md.push(`| ${r.defect} | ${r.oracleBefore.join('; ')} | ${r.oracleAfter?.join('; ')} | ${r.stateAfter} | ${j.repair?.edits?.accepted ?? 0} / ${j.repair?.edits?.rejected ?? 0} | ${r.materialFiguresLost?.length ?? '-'} | ${r.sentencesAdded?.length ?? '-'} / ${r.sentencesDropped?.length ?? '-'} | ${(j.repair?.why ?? (j.repair?.passes === 0 ? 'no rewrite attempted: no enforced rule broken in a span' : '')).slice(0, 120)} |`);
}
md.push('');

// ── 6 ──
md.push('## Test 6: the hook (claims build 2)\n\n| event | exit | seconds |\n|---|---|---|');
for (const h of J('arms/hook.json')) md.push(`| ${h.label} | ${h.exit} | ${h.seconds} |`);
md.push('');

// ── 7 ──
md.push('## Test 7: grounding (claims build 2, golden e02 with an invented figure and an invented citation)\n');
for (const g of J('arms/grounding.json')) {
  if (g.label.startsWith('repair')) { md.push(`- ${g.label}: state ${g.state}; invented figure kept in the text: ${g.figureKept}; invented citation kept: ${g.citationKept} (nothing cut)`); continue; }
  const fig = g.unsourced.some((u) => u.includes('9,350')); const cit = g.unsourced.some((u) => u.includes('witness statement'));
  const flagged = (g.violated ?? []).filter((v) => v.spans.some((s) => s.includes('9,350') || s.includes('witness'))).map((v) => `${v.id}${v.enforced ? ' (enforced)' : ''}`);
  md.push(`- ${g.label}: state ${g.state}; figure listed as unsourced: ${fig}; citation listed: ${cit}; ${g.unsourced.length} sentence(s) listed in all; flagged by rules: ${flagged.join(', ') || 'none'}; claim instrument: ${g.claimsReader?.instrument}`);
}
md.push('');

// ── 8 + 12 ──
md.push('## Tests 8 and 12: record head and certificate\n');
const heads = []; const certs = [];
for (const f of readdirSync(join(HERE, 'arms/verify'))) for (const r of L(`arms/verify/${f}`)) { if (r.certificate) certs.push({ src: `verify ${f}`, c: r.certificate }); }
for (const f of readdirSync(join(HERE, 'arms/repair')).filter((x) => x.endsWith('.json') && !x.endsWith('.jsonl'))) { const j = J(`arms/repair/${f}`); heads.push({ src: `verify --repair ${f}`, keys: Object.keys(j) }); certs.push({ src: `repair ${f}`, c: j.certificate }); }
for (const fx of ['claims', 'labels', 'adhd']) { const d = join(HERE, 'arms/consistency', fx, 'atelier'); if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter((x) => x.endsWith('.full.json'))) { let j = null; try { j = JSON.parse(readFileSync(join(d, f), 'utf8')); } catch { /* empty */ } heads.push({ src: `run ${fx} ${f}`, keys: j ? Object.keys(j) : [] }); if (j?.certificate) certs.push({ src: `run ${fx}`, c: j.certificate }); } }
const HEAD = ['schema', 'state', 'standardVersionHash', 'skillVersion', 'certificate', 'record'];
const verifyHeads = readdirSync(join(HERE, 'arms/verify')).flatMap((f) => L(`arms/verify/${f}`)).length;
md.push(`- verify --json outputs: ${verifyHeads}, each with a certificate: ${certs.filter((c) => c.src.startsWith('verify')).length}.`);
md.push(`- verify --repair --json and run --json outputs with all six head keys: ${heads.filter((h) => HEAD.every((k) => h.keys.includes(k))).length} of ${heads.length}.`);
md.push(`- certificates with errorBound null and a why: ${certs.filter((c) => c.c.errorBound === null && typeof c.c.why === 'string' && c.c.why.length > 0).length} of ${certs.length}.`);
md.push(`- certificates whose readers.claims names an instrument and a gate: ${certs.filter((c) => c.c.readers?.claims?.instrument && c.c.readers?.claims?.gate).length} of ${certs.length}; instruments seen: ${[...new Set(certs.map((c) => c.c.readers?.claims?.instrument))].join(' | ')}`);
md.push(`- why (one): "${certs[0]?.c.why}"`);
md.push('');

// ── 9 ──
const a = J('arms/authority.json');
md.push('## Test 9: authority (claims build 2)\n');
md.push(`- standard files byte-identical before and after the hook, grounding and repair calls: ${a.sameFiles}; active standard unchanged: ${a.sameActive} (${a.after.active}).`);
md.push(`- recomputed hash of { evidenceId, workType, requirements }: ${a.recomputed} (matches the file's name: ${a.hashMatchesName}); with the qualifications folded in it would be ${a.withQualifications}.`);
md.push(`- qualifications sit in the standard file beside the hashed fields (keys: ${a.standardFileKeys.join(', ')}), for ${a.qualificationIds.join(', ')}; qualified: ${a.qualifiedIds.join(', ') || 'none'}; the requirements carry no qualification: ${!a.requirementsMentionQualified}.`);
if (existsSync(join(HERE, 'arms/authority-after-runs.json'))) { const r = J('arms/authority-after-runs.json'); md.push(`- after the test 5 runs: ${JSON.stringify(r)}`); }
md.push('');
md.push(`Meter total at report time: $${spend().total.toFixed(4)}.`);
console.log(md.join('\n'));
