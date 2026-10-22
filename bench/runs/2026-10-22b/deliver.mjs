// Test A4 (delivery) and A8 (record head): of the Atelier arm's outputs, the share DELIVERED: state VERIFIED, or
// NEEDS_REVIEW where every entry left for review is a listed claim (the specifics reader or the UNSOURCED check) or a
// rule the owner accepted as unmeasured. Read off each run's own record (needsReview as core/eval/record.ts defines
// it); no model calls. Also the causes of review, counted, and whether every output (a failure included) opens with
// the record head.
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { HERE } from './lib.mjs';

const needsReview = (e) => e.required && e.reason !== 'LISTED_FOR_YOU' && (e.result === 'UNVERIFIED' || e.reason === 'SET_ASIDE');
const isClaim = (e) => e.id === 'specifics' || /UNSOURCED|specific|claim/i.test(e.id);
const HEAD = ['schema', 'state', 'standardVersionHash', 'skillVersion', 'certificate', 'record'];
const out = {};
for (const fx of ['claims', 'labels', 'adhd']) {
  const d = join(HERE, 'arms', 'consistency', fx, 'atelier'); if (!existsSync(d)) continue;
  const runs = readdirSync(d).filter((f) => f.endsWith('.full.json')).sort().map((f) => { const raw = readFileSync(join(d, f), 'utf8'); let j = null; try { j = JSON.parse(raw); } catch { /* empty or not JSON */ } return { f, raw, j }; });
  const states = {}; const causes = {}; let delivered = 0; let n = 0; const heads = { full: 0, error: 0, none: [] };
  for (const { f, raw, j } of runs) {
    n += 1; const st = j?.state ?? 'NO RECORD'; states[st] = (states[st] ?? 0) + 1;
    if (j && HEAD.every((k) => k in j)) heads.full += 1; else if (j?.state === 'ERROR' && 'schema' in j && 'error' in j) heads.error += 1; else heads.none.push(`${f} (${raw.length} bytes)`);
    const accepted = new Set((j?.certificate?.acceptedUnmeasured ?? []).map((a) => a.id));
    const nr = (j?.record?.entries ?? []).filter(needsReview);
    for (const e of nr) { const k = `${e.id} ${e.reason}: ${e.statement.slice(0, 60)}`; causes[k] = (causes[k] ?? 0) + 1; }
    if (st === 'VERIFIED' || (st === 'NEEDS_REVIEW' && nr.length > 0 && nr.every((e) => isClaim(e) || accepted.has(e.id)))) delivered += 1;
  }
  const lat = runs.find((r) => r.j?.certificate?.latitude)?.j.certificate.latitude ?? null;
  const accepted = runs.find((r) => r.j?.certificate)?.j.certificate.acceptedUnmeasured ?? null;
  out[fx] = { n, delivered, states, causes, heads, latitude: lat, acceptedUnmeasured: accepted };
  console.log(`${fx}: delivered ${delivered}/${n}; states ${JSON.stringify(states)}; heads ${heads.full} full, ${heads.error} ERROR heads, ${heads.none.length} without; latitude ${JSON.stringify(lat?.level ?? lat)}; accepted unmeasured ${JSON.stringify(accepted?.map((a) => a.id) ?? accepted)}`);
  for (const [k, v] of Object.entries(causes).sort((a, b) => b[1] - a[1])) console.log(`  ${v}  ${k}`);
}
writeFileSync(join(HERE, 'arms', 'consistency', 'delivery.json'), JSON.stringify(out, null, 1));
