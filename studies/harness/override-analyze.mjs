// studies/harness/override-analyze.mjs — unblind and score the exploratory override endpoint.
// DECIDES NOTHING. Every rule (the test, the interval, the discordant floor) is imported from
// shipped core; this file chooses which trials go into which gate, and nothing else.
import { mcnemarExactP, clopperPearson, MIN_DISCORDANT } from '../../dist/core/stats/sign-test.js';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OUT = join(homedir(), 'atelier-b2-study', 'override');
const key = JSON.parse(readFileSync(join(OUT, 'OVERRIDE_BLIND_KEY.json'), 'utf8'));
const { labels, recognized } = JSON.parse(readFileSync(join(OUT, 'labels-received.json'), 'utf8'));
const byId = new Map(key.trials.map((t) => [t.taskId, t]));

// a label of 'a' | 'b' becomes the ARM the reviewer chose, via the sealed key.
const chosen = (id) => {
  const t = byId.get(id), l = labels[id];
  if (l === 'same') return 'SAME';
  return l === 'a' ? t.sideA : t.sideB;
};

const ids = [...byId.keys()];
const primary = ids.filter((i) => byId.get(i).kind === 'primary');
const knownBad = ids.filter((i) => byId.get(i).kind === 'known-bad');
const identical = ids.filter((i) => byId.get(i).kind === 'identical');
const missing = ids.filter((i) => !(i in labels));
if (missing.length) throw new Error(`unlabelled trials: ${missing.join(',')}`);

console.log(`labels ${Object.keys(labels).length} · primary ${primary.length} · known-bad ${knownBad.length} · identical ${identical.length}`);
console.log(`recognition declaration: ${recognized ? JSON.stringify(recognized) : 'EMPTY — reports as blind'}\n`);

// ── VALIDITY GATES FIRST, as sealed ───────────────────────────────────────────
const idDirectional = identical.filter((i) => labels[i] !== 'same');
console.log('GATE B — identical pairs (bar: at most 1 of 5 directional)');
console.log(`  directional: ${idDirectional.length} of ${identical.length}${idDirectional.length ? ' -> ' + idDirectional.join(',') : ''}`);
const gateB = idDirectional.length <= 1;
console.log(`  ${gateB ? 'PASS' : 'FAIL -> VOID'}\n`);

const kbT = knownBad.filter((i) => chosen(i) === 'T');
console.log('GATE A — known-bad, T vs bare model (bar: T preferred on >= 5 of 6)');
for (const i of knownBad) console.log(`  ${i}: label ${labels[i]} -> ${chosen(i)}`);
console.log(`  T preferred: ${kbT.length} of ${knownBad.length}`);
const gateA = kbT.length >= 5;
console.log(`  ${gateA ? 'PASS' : 'FAIL -> VOID'}\n`);

// ── POSITION CHECK ────────────────────────────────────────────────────────────
const aPicks = ids.filter((i) => labels[i] === 'a').length;
const directional = ids.filter((i) => labels[i] !== 'same').length;
const aProp = aPicks / directional;
console.log(`POSITION — A chosen on ${aPicks} of ${directional} directional (${(aProp * 100).toFixed(1)}%) ${aProp < 0.3 || aProp > 0.7 ? 'FLAGGED (outside 30-70%)' : 'within 30-70%'}\n`);

// ── PRIMARY ───────────────────────────────────────────────────────────────────
const tWins = primary.filter((i) => chosen(i) === 'T').length;
const b2Wins = primary.filter((i) => chosen(i) === 'B2').length;
const ties = primary.filter((i) => chosen(i) === 'SAME').length;
const discordant = tWins + b2Wins;
console.log('PRIMARY — T vs B2, 40 pairs');
console.log(`  T preferred: ${tWins} · B2 preferred: ${b2Wins} · no material difference: ${ties}`);
console.log(`  discordant: ${discordant} (floor MIN_DISCORDANT = ${MIN_DISCORDANT})`);
console.log(`  tie rate: ${(ties / primary.length * 100).toFixed(1)}%`);

if (!gateA || !gateB) { console.log('\n  VALIDITY GATE FAILED -> VOID. No primary read, per the seal.'); process.exit(0); }
if (discordant < MIN_DISCORDANT) {
  console.log(`\n  UNDERPOWERED — fewer than ${MIN_DISCORDANT} discordant pairs. No p-value quoted, no tasks added, per the seal.`);
} else {
  const p = mcnemarExactP(tWins, b2Wins);
  const ci = clopperPearson(tWins, discordant);
  console.log(`  exact two-sided sign test: p = ${p.toFixed(4)}`);
  console.log(`  T share of discordant: ${(tWins / discordant * 100).toFixed(1)}%  95% CI [${(ci.lo * 100).toFixed(1)}%, ${(ci.hi * 100).toFixed(1)}%]`);
  console.log(`  ${p < 0.05 ? 'SIGNIFICANT at alpha=0.05' : 'NOT significant at alpha=0.05 -> closes NULL and stands'}`);
}

// ── SPLIT BY FORM: exploratory only, labelled as such ─────────────────────────
const sub = (pred, name) => {
  const s = primary.filter(pred);
  const t = s.filter((i) => chosen(i) === 'T').length, b = s.filter((i) => chosen(i) === 'B2').length;
  console.log(`  ${name}: T ${t} · B2 ${b} · same ${s.length - t - b}`);
};
console.log('\nEXPLORATORY, not an endpoint — declared secondary in the seal only as reported description:');
sub((i) => i.startsWith('E'), 'essay-form (rules fire)   ');
sub((i) => i.startsWith('J'), 'journal-form (restraint)  ');
