// Test A1 from the kept standards (no model calls): distinct hashes among builds 1 to 5 of each fixture, what differs
// between them requirement by requirement, and for the reworded build, the requirement count before and after and
// which requirements changed (by words, by weight, by check, by latitude). Writes arms/builds/a1.json.
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { HERE, entries } from './lib.mjs';

const std = (fx, n) => { const p = join(HERE, 'arms', 'builds', fx, `build-${n}.standard.json`); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
const shape = (r) => JSON.stringify({ statement: r.statement, kind: r.kind, materiality: r.materiality, measurement: r.measurement ?? null, appliesWhen: r.appliesWhen ?? null, obligation: r.obligation ?? null });
const out = {};
for (const fx of ['claims', 'labels']) {
  // the series (the pass line): build 1, then s2..s5 in one data folder; the fresh-folder builds 2..5 are the other line
  const series = [1, 's2', 's3', 's4', 's5'].map((n) => entries().find((e) => (e.step === 'testA1' || e.step === 'testA1-series') && e.fixture === fx && e.build === n)?.standardHash ?? null);
  const seriesDistinct = new Set(series.filter(Boolean)).size;
  const builds = [1, 2, 3, 4, 5].map((n) => ({ n, s: std(fx, n), e: entries().find((e) => e.step === 'testA1' && e.fixture === fx && e.build === n) }));
  const hashes = builds.map((b) => b.e?.standardHash ?? null);
  const distinct = [...new Set(hashes.filter(Boolean))];
  // requirement by requirement against build 1, matched by statement
  const base = builds[0].s; const diffs = [];
  for (const b of builds.slice(1)) {
    if (!b.s || !base) continue;
    for (const r of b.s.requirements) {
      const p = base.requirements.find((q) => q.statement === r.statement);
      if (!p) { diffs.push({ build: b.n, statement: r.statement.slice(0, 90), change: 'not in build 1' }); continue; }
      if (shape(p) !== shape(r)) diffs.push({ build: b.n, statement: r.statement.slice(0, 90), change: ['kind', 'materiality', 'measurement', 'appliesWhen', 'obligation'].filter((k) => JSON.stringify(p[k] ?? null) !== JSON.stringify(r[k] ?? null)) });
    }
    for (const p of base.requirements) if (!b.s.requirements.some((r) => r.statement === p.statement)) diffs.push({ build: b.n, statement: p.statement.slice(0, 90), change: 'missing (in build 1)' });
    if (JSON.stringify(base.latitude?.level) !== JSON.stringify(b.s.latitude?.level)) diffs.push({ build: b.n, change: `latitude ${base.latitude?.level} -> ${b.s.latitude?.level}` });
    if (base.evidenceId !== b.s.evidenceId) diffs.push({ build: b.n, change: 'evidenceId differs' });
    if (JSON.stringify(base.acceptedUnmeasured ?? []) !== JSON.stringify(b.s.acceptedUnmeasured ?? [])) diffs.push({ build: b.n, change: 'acceptedUnmeasured differs' });
  }
  // the reworded build against build 1
  const rw = std(fx, 'sreword'); const step = existsSync(join(HERE, 'arms', 'builds', fx, 'reworded-step.json')) ? JSON.parse(readFileSync(join(HERE, 'arms', 'builds', fx, 'reworded-step.json'), 'utf8')) : null;
  let reword = null;
  if (rw && base && step) {
    const from = step.from.replace(/^\s*\d+\.\s*/, ''); const to = step.to.replace(/^\s*\d+\.\s*/, '');
    const changed = []; const unchanged = [];
    for (const r of rw.requirements) {
      const p = base.requirements.find((q) => q.statement === r.statement) ?? (r.statement === to ? base.requirements.find((q) => q.statement === from) : null);
      if (!p) changed.push({ id: r.requirementId, statement: r.statement.slice(0, 90), change: 'new' });
      else if (p.statement !== r.statement || shape({ ...p, statement: '' }) !== shape({ ...r, statement: '' })) changed.push({ id: r.requirementId, was: p.requirementId, statement: r.statement.slice(0, 90), change: p.statement !== r.statement ? 'reworded step' : 'check or weight changed', fields: ['kind', 'materiality', 'measurement', 'appliesWhen', 'obligation'].filter((k) => JSON.stringify(p[k] ?? null) !== JSON.stringify(r[k] ?? null)) });
      else unchanged.push(r.requirementId);
    }
    const dropped = base.requirements.filter((p) => !rw.requirements.some((r) => r.statement === p.statement) && p.statement !== from).map((p) => p.statement.slice(0, 90));
    reword = { before: base.requirements.length, after: rw.requirements.length, sameCount: base.requirements.length === rw.requirements.length, changed, dropped, unchangedCount: unchanged.length,
      onlyThatStep: changed.length === 1 && changed[0].change === 'reworded step' && dropped.length === 0, latitudeKept: base.latitude?.level === rw.latitude?.level, acceptedKept: JSON.stringify(base.acceptedUnmeasured ?? []) === JSON.stringify(rw.acceptedUnmeasured ?? []),
      hash: entries().find((e) => e.fixture === fx && e.build === 'sreword')?.standardHash ?? null,
      freshCopyHash: entries().find((e) => e.fixture === fx && e.build === 'reword')?.standardHash ?? null };
  }
  out[fx] = { series, seriesDistinct, seriesOneHash: seriesDistinct === 1 && series.every(Boolean), hashes, distinct: distinct.length, oneHash: distinct.length === 1 && hashes.every(Boolean), requirements: builds.map((b) => b.s?.requirements.length ?? null), latitude: builds.map((b) => b.s?.latitude?.level ?? null), diffs, reword };
  console.log(`${fx}: SERIES ${seriesDistinct} distinct hash(es) ${JSON.stringify(series)}`);
  console.log(`${fx}: fresh folders ${distinct.length} distinct hash(es) of ${hashes.filter(Boolean).length} builds ${JSON.stringify(hashes)}; requirements ${JSON.stringify(out[fx].requirements)}; latitude ${JSON.stringify(out[fx].latitude)}`);
  for (const d of diffs) console.log(`  b${d.build} ${d.statement ?? ''}: ${JSON.stringify(d.change)}`);
  if (reword) console.log(`  reword: ${reword.before} -> ${reword.after} requirements; changed ${JSON.stringify(reword.changed)}; dropped ${JSON.stringify(reword.dropped)}; only that step: ${reword.onlyThatStep}`);
}
writeFileSync(join(HERE, 'arms', 'builds', 'a1.json'), JSON.stringify(out, null, 1));
