// cli/commands/qualify.ts — DOES A SKILL'S INSTRUMENT HOLD ON TEXTS IT NEVER SAW?
//
//   atelier qualify --skill <name> [--topics <file>] [--seed <n>] [--resamples <n>] [--json]
//
// The detector and every steering feature of the active profile are measured the way they will be used:
// on texts held out of everything they learned from (core/fidelity/qualify.ts). The data is the skill's
// own: the author's pieces discovery read, and the model drafts discovery wrote on their topics
// (`contrast-drafts.json` in this project's run). Three hold-outs, each a question:
//
//   source     leave one piece out, with the drafts written on its topic
//   topic      leave one topic out: does it read style, or subject? NEEDS REAL LABELS. A topic comes from a
//              piece's front matter (`topic: …`) or from a sidecar JSON (`--topics <file>`, piece file name
//              or id to topic). A topic is never defaulted to the source: that would rerun the source
//              hold-out under another name and call it a topic result. Without labels the topic hold-out is
//              NOT RUN (missing labels), and no instrument can qualify.
//   generator  leave one model out: does it catch a model it never trained against? From what discovery
//              recorded per draft; drafts from before that was recorded are one generator, 'unknown'.
//
// The result is stored with the skill, keyed by the profile it measured. No model is called.

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type * as store from '../../core/state/store.js';
import * as fstore from '../../core/state/fidelity-store.js';
import { qualifyAll, detectorSensor, itemsHash, hasTopic, QUALIFY_BARS, type QualifyItem, type QualifyResult, type Sensor } from '../../core/fidelity/qualify.js';
import { buildRetrievalIndex, retrieve } from '../../core/fidelity/retrieval.js';
import { featureOf } from '../../core/observers/features.js';
import { extract } from '../../core/intake/extract.js';
import { readJson } from '../../core/state/read-json.js';
import type { ImportPlan } from '../../core/discovery/chain/corpus-import.js';
import type { FidelityProfile } from '../../core/fidelity/types.js';
import { contrastOf, type ContrastCache } from './discover.js';
import { DATA, die, argv, flag, numericFlag, skillArg, runFile, loadSession } from '../runtime.js';

export function qualify(): void {
  const name = skillArg('usage: atelier qualify --skill <name> [--topics <file>] [--json]');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = fstore.getActiveRelease(L);
  const profile = (active?.release.profileHash ? fstore.getProfile(L, active.release.profileHash) : null) ?? fstore.getProfile(L)
    ?? die(`"${name}" has no fidelity profile: it is built at discovery from a corpus (atelier new <folder>), and only a profile has instruments to qualify.`);
  const { items, generators, topicsLabelled } = qualifyData(profile, flag('--topics'));
  const nAuthor = items.filter((x) => x.label === 'author').length;
  if (nAuthor < 4 || items.length - nAuthor < 4) die(`qualifying needs at least 4 of your pieces and 4 model drafts; this skill's discovery kept ${nAuthor} and ${items.length - nAuthor}.`);
  const seed = numericFlag('--seed', 1); const resamples = Math.max(0, Math.floor(numericFlag('--resamples', 2000)));
  const opts = { seed, resamples, requireTopics: true };

  const instruments: fstore.InstrumentQualification[] = [];
  if (profile.detector) {
    const result = qualifyAll(items, detectorSensor(), opts);
    instruments.push({ instrument: `detector:${profile.detector.version}`, kind: 'detector', label: 'style detector', result, verdict: verdictOf(result) });
  }
  for (const b of profile.bands.filter((x) => x.cls === 'all' && x.role !== 'MONITOR')) {
    const f = featureOf(b.id);
    if (!f) continue;
    // The direction is the one the profile measured (author above model when its AUC is over 0.5), declared
    // rather than read again from the held-out scores.
    const direction = b.auc === null || b.auc === 0.5 ? undefined : b.auc > 0.5 ? 'model-lower' as const : 'model-higher' as const;
    const sensor: Sensor = { kind: 'feature', measure: (t) => f.measure(t), ...(direction ? { direction } : {}) };
    const result = qualifyAll(items, sensor, opts);
    instruments.push({ instrument: `feature:${b.id}`, kind: 'feature', label: f.label, result, verdict: verdictOf(result) });
  }
  const q: fstore.Qualification = {
    profileHash: profile.hash, measuredAt: new Date().toISOString(),
    data: { itemsHash: itemsHash(items), author: nAuthor, model: items.length - nAuthor, generators, topicsLabelled },
    seed, resamples, instruments,
  };
  fstore.setQualification(L, q);
  if (argv.includes('--json')) { console.log(JSON.stringify(q, null, 1)); return; }

  console.log(`Qualifying the instruments of profile ${profile.hash} on ${nAuthor} of your pieces and ${items.length - nAuthor} model draft(s) from ${generators.length} generator(s) (${generators.join(', ')}).`);
  console.log(`Bars: separation >= ${QUALIFY_BARS.minSeparation} and a lower 95% bound >= ${QUALIFY_BARS.minCiLow}, with each hold-out run.`);
  if (!topicsLabelled) console.log('Topics: not labelled on every text, so the topic hold-out is NOT RUN and nothing can qualify. Add `topic: …` to each piece\'s front matter, or pass --topics <file> (a JSON object of piece file name to topic).');
  for (const ins of instruments) {
    const fam = ins.kind === 'detector' && profile.detector ? ` (valid for: ${familiesOf(profile)})` : '';
    console.log(`\n${ins.label}${fam}`);
    for (const r of ins.result.results) {
      const p = r.pooled;
      console.log(`  ${r.holdOut.padEnd(9)}  ${p ? `AUC ${p.auc.toFixed(3)}, 95% CI ${p.ci95[0].toFixed(3)} to ${p.ci95[1].toFixed(3)}` : 'no held-out scores'}  ${r.passes ? 'PASS' : 'FAIL'}`);
    }
    for (const s of ins.result.skipped) console.log(`  ${s.holdOut.padEnd(9)}  ${s.why.startsWith('NOT RUN') ? s.why : `NOT RUN: ${s.why}`}`);
    console.log(`  ${ins.verdict}`);
  }
  const passed = instruments.filter((x) => x.result.passes).length;
  console.log(`\n${passed} of ${instruments.length} instrument(s) qualified. Recorded with the skill for profile ${profile.hash}.`);
}

/** The model families a detector was trained against, as a person reads them. */
export const familiesOf = (p: FidelityProfile): string =>
  p.detector?.families?.length ? p.detector.families.join(', ') : 'not recorded (trained before families were)';

/** One line: qualified, or the first reason it is not. */
export function verdictOf(r: QualifyResult): string {
  if (r.passes) return `QUALIFIED: holds with ${r.results.map((x) => `${x.holdOut}s`).join(', ')} held out.`;
  const failed = r.results.find((x) => !x.passes);
  const notRun = r.skipped.find((x) => x.why.startsWith('NOT RUN')) ?? r.skipped.find((x) => x.holdOut === 'topic') ?? r.skipped.at(0) ?? null;
  const why = failed ? failed.why : notRun ? `${notRun.holdOut} hold-out ${notRun.why.startsWith('NOT RUN') ? notRun.why.replace(/^NOT RUN/, 'not run') : `not run: ${notRun.why}`}` : 'no hold-out could run';
  return `NOT QUALIFIED: ${why}. It stays a monitor.`;
}

/**
 * The skill's own data, rebuilt from this project's run: the pieces discovery read (never the held-back or
 * reserved ones) and the drafts it wrote, with the topic and generator labels the person and discovery gave.
 * Refused when the run here is not the one the profile was built from.
 */
export function qualifyData(profile: FidelityProfile, topicsFile: string | undefined): { items: QualifyItem[]; generators: string[]; topicsLabelled: boolean } {
  const s = loadSession();
  if (s.evidence?.corpusHash !== profile.corpusHash) {
    die(`this project's run is not the one this skill was discovered from (profile corpus ${profile.corpusHash}, run ${s.evidence?.corpusHash ?? 'none'}). Run atelier qualify from the project where the skill was built.`);
  }
  const pathsFile = runFile('corpus-paths.json'); const planFile = runFile('import-plan.json'); const draftsFile = runFile('contrast-drafts.json');
  for (const f of [pathsFile, planFile]) if (!existsSync(f)) die(`${f} is missing: the run that built this skill no longer holds its corpus.`);
  if (!existsSync(draftsFile)) die('discovery wrote no model drafts for this skill (--no-contrast, or they failed), so there is nothing to qualify against.');
  const files = readJson<{ id: string; path: string }[]>(pathsFile, { kind: 'array', what: 'the sealed corpus path list' });
  const plan = readJson<ImportPlan>(planFile, { what: 'the import plan' });
  const reserved = new Set((s.reservation?.reserved ?? []).map((u) => u.unitId));
  const readIds = new Set(plan.goldens.filter((g) => g.role === 'PROPOSAL' && !reserved.has(g.contextId)).map((g) => g.contextId));
  const sidecar = topicsFile ? readTopics(topicsFile) : {};
  const pieces = files.filter((f) => readIds.has(f.id)).map((f) => {
    const r = extract(f.path);
    if (!r.ok) die(r.reason);
    const text = (r as { text: string }).text;
    const topic = sidecar[f.id] ?? sidecar[basename(f.path)] ?? sidecar[basename(f.path).replace(/\.[^.]+$/, '')] ?? frontMatterTopic(readFileSync(f.path, 'utf8'));
    return { id: f.id, text, ...(topic ? { topic } : {}) };
  });
  const cache = readJson<ContrastCache>(draftsFile, { what: 'the contrast drafts', requireKeys: ['drafts'] });
  if (cache.corpusHash !== profile.corpusHash) die(`the model drafts in ${draftsFile} were written for another corpus (${cache.corpusHash}); re-run discovery.`);
  const c = contrastOf(cache);
  // A draft without a recorded source joins the piece it is closest to (as the profile's detector groups it),
  // and gets no topic: its topic would be a guess.
  const index = buildRetrievalIndex(pieces);
  const topicOf = new Map(pieces.map((p) => [p.id, p.topic]));
  const items: QualifyItem[] = [
    ...pieces.map((p) => ({ text: p.text, label: 'author' as const, source: p.id, ...(p.topic ? { topic: p.topic } : {}) })),
    ...c.drafts.map((text, i) => {
      const recorded = c.sources[i];
      const near = retrieve(index, text, 1)[0];
      const source = recorded ?? (near === undefined ? `m:${i}` : index.passages[near].piece);
      const topic = recorded ? topicOf.get(recorded) : undefined;
      return { text, label: 'model' as const, source, generator: c.generators[i], ...(topic ? { topic } : {}) };
    }),
  ];
  return { items, generators: [...new Set(c.generators)].sort(), topicsLabelled: items.every(hasTopic) };
}

/** `topic:` from a `---` front matter block, or from a bare first line. */
export function frontMatterTopic(raw: string): string | undefined {
  const lines = raw.replace(/^\uFEFF/, '').split('\n');
  const fenced = lines[0]?.trim() === '---';
  for (let i = fenced ? 1 : 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (fenced && (t === '---' || t === '...')) break;
    const m = /^topic:\s*(.+)$/i.exec(t);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '') || undefined;
    if (!fenced) break;
  }
  return undefined;
}

function readTopics(file: string): Record<string, string> {
  const raw = readJson<unknown>(file, { what: 'the topic labels' });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) die(`${file} must be a JSON object of piece file name (or id) to topic.`);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'string' || !v.trim()) die(`${file}: the topic for "${k}" must be a non-empty string.`);
    out[k] = (v as string).trim();
  }
  return out;
}
