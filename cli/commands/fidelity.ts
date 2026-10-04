// cli/commands/fidelity.ts — THE OUTER LOOP: WHERE A SKILL'S OUTPUTS SIT, AND THE RELEASES THAT STEER THEM.
//
//   atelier fidelity --skill <name>                       the profile, drift alarms, releases, the next settings to try
//   atelier fidelity --skill <name> --read <file>         where one text sits against the author's range (offline)
//   atelier fidelity --skill <name> --set drafts=4,editBudget=1,retrievalK=3,notesCap=6
//                                                         a new implementation release with these settings
//   atelier fidelity --skill <name> --next                a new release with the settings the search proposes
//   atelier fidelity --skill <name> --distill [--cap 0.5] experience notes from compared drafts (one model call)
//   atelier fidelity --skill <name> --rollback            the active release back to its parent
//
// Nothing here moves the standard. Every change is a new implementation release with a parent, so any of
// them can be undone, and every output names the release that shaped it. The estimate reads the records
// `invoke` already wrote; only --distill calls a model.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as store from '../../core/state/store.js';
import * as fstore from '../../core/state/fidelity-store.js';
import { estimate, describeEstimate, type FidelityObservation } from '../../core/fidelity/estimator.js';
import { nextSettings, type ReleaseOutcome } from '../../core/fidelity/release.js';
import { comparisonPairs, distillNotes } from '../../core/fidelity/experience.js';
import { readFidelity, inBandShare } from '../../core/fidelity/profile.js';
import { topWeights } from '../../core/fidelity/stylometry.js';
import { featureOf, LAYER_LABEL } from '../../core/observers/features.js';
import { DEFAULT_SETTINGS, type ImplementationSettings } from '../../core/fidelity/types.js';
import type { Budget } from '../../core/inference/client.js';
import type { InvocationRecord } from '../../core/state/canonical-state.js';
import { releaseWithSettings } from '../fidelity.js';
import { calibrateTypicality, standardise, typicalityOf, MAX_UNMEASURED, type TypicalityCalibration } from '../../core/fidelity/typicality.js';
import { readJson } from '../../core/state/read-json.js';
import { basename } from 'node:path';
import { closeness } from '../../core/fidelity/twosample.js';
import { readStructure, STRUCTURE_READER_VERSION, type StructureMove } from '../../core/structure/moves.js';
import { structureFeatures, STRUCTURE_FEATURES } from '../../core/structure/features.js';
import { chainOf, typicalLength } from '../../core/structure/skeleton.js';
import { join } from 'node:path';
import { familiesOf } from './qualify.js';
import { DATA, die, argv, flag, numericFlag, skillArg, clientAndBinding, clientFor, runFile, loadSession } from '../runtime.js';

export async function fidelity(): Promise<void> {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const activeNow = fstore.getActiveRelease(L);
  const profile = (activeNow?.release.profileHash ? fstore.getProfile(L, activeNow.release.profileHash) : null) ?? fstore.getProfile(L) ?? die(`"${name}" has no fidelity profile: it is built at discovery from a corpus (atelier new <folder>), and a skill written from stated rules has no author's range to steer toward.`);
  const active = activeNow;
  const read = flag('--read');
  if (read) { readOne(readFileSync(read, 'utf8'), profile, fstore.getTypicality(L, profile.hash)); return; }
  const calibrateDir = flag('--calibrate-from');
  if (calibrateDir) { calibrate(L, profile.hash, calibrateDir); return; }
  const structureDir = flag('--read-structure-from');
  if (structureDir) { await readAuthorStructure(L, profile.hash, structureDir); return; }
  if (argv.includes('--rollback')) {
    const back = fstore.rollbackRelease(L) ?? die('nothing to roll back to: the active release is the first of its line (a new standard starts a new line).');
    console.log(`Active implementation release is now ${back.id} (${back.why}).`);
    return;
  }
  const from = active?.release ?? die(`"${name}" has a profile but no implementation release: rebuild it (atelier build).`);
  const set = flag('--set');
  if (set) {
    const r = releaseWithSettings(L, from, parseSettings(set, from.settings), `settings set by hand: ${set}`);
    console.log(`New implementation release ${r.id} (parent ${from.id}): ${describeSettings(r.settings)}.`);
    return;
  }
  // ONLY WHAT THIS STANDARD AND THIS PROFILE PRODUCED. Outputs under an earlier standard, or read against an
  // earlier profile, are about another target.
  const records = store.listInvocations(L).flatMap((r) => (r.fidelity?.reading && r.standardVersionHash === from.standardVersionHash && r.fidelity.profileHash === profile.hash
    ? [{ ...r, reading: r.fidelity.reading }] : []));
  if (argv.includes('--distill')) { await distill(L, from, records); return; }
  if (argv.includes('--typicality')) { reportCloseness(L, profile.hash, records); return; }
  const outcomes = outcomesOf(records, (id) => fstore.getRelease(L, id)?.settings ?? null);
  if (argv.includes('--next')) {
    const p = nextSettings(from.settings, outcomes) ?? die('nothing to propose: every neighbouring setting has enough outputs measured, or none can be compared yet (each needs 20).');
    const r = releaseWithSettings(L, from, p.settings, `the settings search: ${p.why}`);
    console.log(`New implementation release ${r.id} (parent ${from.id}): ${describeSettings(r.settings)}. ${p.why}`);
    return;
  }
  report(L, profile, from, records, outcomes);
}

/** Where one text sits: every steering feature, its value, the author's range, and whether it is inside. */
function readOne(text: string, profile: NonNullable<ReturnType<typeof fstore.getProfile>>, cal: TypicalityCalibration | null): void {
  const r = readFidelity(text, profile);
  if (cal) {
    const t = typicalityOf(text, cal);
    console.log(t ? `As typical as ${Math.round(t.p * 100)}% of your own pieces (distance ${round(t.distance)}, calibrated on ${cal.scores.length}).`
      : `Too little of the text is measurable to place it against your pieces (more than ${Math.round(MAX_UNMEASURED * 100)}% of the ${cal.features.length} features unmeasured).`);
  }
  console.log(`A ${r.cls} text, read against ${r.bandsFrom === 'all' ? 'your pooled range' : `your ${r.bandsFrom} pieces`}: in range on ${r.inBand} of ${r.measured} steering features.`);
  for (const b of profile.bands.filter((x) => x.cls === r.bandsFrom && x.role !== 'MONITOR')) {
    const v = r.values[b.id];
    if (v === null || v === undefined) continue;
    const out = r.outside.find((o) => o.id === b.id);
    console.log(`  ${out ? (out.direction === 'high' ? 'HIGH' : 'LOW ') : 'ok  '}  ${featureOf(b.id)?.label ?? b.id}: ${round(v)} (yours ${round(b.band[0])} to ${round(b.band[1])})`);
  }
  if (r.detector) console.log(`Style detector ${r.detector.version}: P(model-written) ${r.detector.p}. A monitor, never a requirement; valid for: ${familiesOf(profile)}.`);
}

/** The status page: the profile, drift alarms per feature, the releases and how each did, the next settings to try. */
function report(L: store.StoreLayout, profile: NonNullable<ReturnType<typeof fstore.getProfile>>, active: NonNullable<ReturnType<typeof fstore.getActiveRelease>>['release'],
  records: readonly Read[], outcomes: readonly ReleaseOutcome[]): void {
  const pooled = profile.bands.filter((b) => b.cls === 'all');
  const byLayer = new Map<string, { steer: number; all: number }>();
  for (const b of pooled) {
    const layer = LAYER_LABEL[featureOf(b.id)?.layer ?? 1];
    const x = byLayer.get(layer) ?? { steer: 0, all: 0 };
    byLayer.set(layer, { steer: x.steer + (b.role !== 'MONITOR' ? 1 : 0), all: x.all + 1 });
  }
  console.log(`Fidelity profile ${profile.hash}: ${pooled.length} feature(s) measured on your pieces, ${pooled.filter((b) => b.role !== 'MONITOR').length} steer drafts.`);
  for (const [layer, x] of byLayer) console.log(`  ${layer}: ${x.steer} steer, ${x.all - x.steer} monitored`);
  const classes = [...new Set(profile.bands.map((b) => b.cls).filter((c) => c !== 'all'))];
  if (classes.length) console.log(`  bands of their own for: ${classes.join(', ')} pieces (the rest read against the pooled range)`);
  if (!profile.effects) console.log('  no operator effects measured: this profile predates them, so --fidelity runs no operators. Rebuild the skill to measure them.');
  if (profile.detector) {
    const w = topWeights(profile.detector, 5);
    console.log(`Style detector ${profile.detector.version} (a monitor): cross-validated AUC ${profile.detector.cvAuc ?? 'not computed'}; the model leans on ${w.model.map((x) => x.feature.replace(/^[wc]:/, '')).join(', ')}.`);
    // A detector does not carry across model families: it is valid only for the ones it was trained against.
    console.log(`  valid for: ${familiesOf(profile)}`);
    const q = fstore.getQualification(L, profile.hash);
    console.log(q ? `  qualified: ${q.instruments.filter((x) => x.result.passes).length} of ${q.instruments.length} instrument(s) hold out of sample (${q.measuredAt.slice(0, 10)})`
      : `  not qualified yet: atelier qualify --skill ${L.skillName}`);
  }
  console.log(`\nActive implementation release ${active.id}: ${describeSettings(active.settings)}; ${active.notes.length} experience note(s); ${active.why}.`);
  console.log(`\n${records.length} output(s) recorded with a reading.`);
  if (records.length) {
    const series: FidelityObservation[] = records.map((r) => ({ at: r.at, binding: r.observedRuntime.bindingHash, cls: r.reading.cls, values: r.reading.values }));
    for (const line of describeEstimate(estimate(series, profile.bands))) console.log(`  ${line}`);
  }
  if (outcomes.length) {
    console.log('\nBy release:');
    for (const o of outcomes) console.log(`  ${o.releaseId}: ${o.n} output(s), ${Math.round(o.meanInBandShare * 100)}% of measured features in range, ${o.inventedPerOutput.toFixed(2)} invented claim(s) cut or unconfirmed per output (${describeSettings(o.settings)})`);
  }
  // WHAT TO READ, CHOSEN BY COUNT. Argument, stance and content (the layers no count reaches) are judged by
  // the owner reading outputs; the outputs worth that reading are the ones the counts say sit furthest from
  // the author, not a model's pick. Label them with: atelier taste --skill <name> --calibrate
  const worth = [...records].sort((a, b) => b.reading.outside.length - a.reading.outside.length
    || (b.reading.detector?.p ?? 0) - (a.reading.detector?.p ?? 0)).slice(0, 5).filter((r) => r.reading.outside.length);
  if (worth.length) {
    console.log('\nWorth your reading (furthest from your range):');
    for (const r of worth) console.log(`  ${r.invocationId}  ${r.reading.outside.length} feature(s) outside${r.reading.detector ? `, detector ${r.reading.detector.p}` : ''}  "${r.input.split('\n')[0].slice(0, 60)}"`);
  }
  const next = nextSettings(active.settings, outcomes);
  console.log(next ? `\nNext to try: ${describeSettings(next.settings)} (${next.why}). Apply with: atelier fidelity --skill ${L.skillName} --next`
    : '\nNo settings change to propose yet: each setting needs 20 outputs before it can be compared.');
}

/** A record with the reading of its delivered output. */
type Read = InvocationRecord & { readonly reading: NonNullable<NonNullable<InvocationRecord['fidelity']>['reading']> };

/** Per release: outputs, mean in-band share, invented claims per output. Cost is not on the record, so it is not compared. */
export function outcomesOf(records: readonly InvocationRecord[], settingsFor: (releaseId: string) => ImplementationSettings | null = () => null): ReleaseOutcome[] {
  const by = new Map<string, InvocationRecord[]>();
  for (const r of records) if (r.fidelity?.release) by.set(r.fidelity.release, [...(by.get(r.fidelity.release) ?? []), r]);
  return [...by.entries()].map(([releaseId, rs]) => {
    const shares = rs.flatMap((r) => (r.fidelity?.reading ? [inBandShare(r.fidelity.reading)] : [])).filter((x): x is number => x !== null);
    // A reader outage (UNSOURCED·unread) is not an invented claim; an unconfirmed one is counted.
    const invented = rs.reduce((n, r) => n + (r.repair?.storiesCut?.length ?? 0) + (r.repair?.violatedAfter.filter((v) => v.startsWith('UNSOURCED') && v !== 'UNSOURCED·unread').length ?? 0), 0);
    const settings = settingsFor(releaseId) ?? rs[0].fidelity?.settings ?? settingsOf(rs[0]);
    return { releaseId, settings, n: rs.length, meanInBandShare: shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 0, inventedPerOutput: invented / rs.length, costPerOutput: 0 };
  });
}

/** The settings a record ran with, when its release is gone from the store: the drafts it wrote, over the defaults. */
function settingsOf(r: InvocationRecord): ImplementationSettings {
  return { ...DEFAULT_SETTINGS, drafts: r.settings?.flags.drafts ?? DEFAULT_SETTINGS.drafts };
}

/** Experience notes from drafts the sensors scored apart, as a new release. One model call, metered. */
async function distill(L: store.StoreLayout, from: NonNullable<ReturnType<typeof fstore.getActiveRelease>>['release'], records: readonly InvocationRecord[]): Promise<void> {
  const pairs = comparisonPairs(records);
  if (!pairs.length) die('no compared drafts to learn from yet: a pair needs two drafts of one request whose in-range counts differ by 2 or more. Run the skill with several drafts first.');
  const { client } = clientAndBinding('target');
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 0.5), maxCalls: 2 };
  const notes = await distillNotes(client, budget, pairs);
  if (!notes.length) die(`the model's notes did not pass the checks (no figures, no names, no rules, at most 32 words each). $${budget.spentUsd.toFixed(3)} spent, nothing changed.`);
  const r = releaseWithSettings(L, { ...from, notes }, from.settings, `${notes.length} experience note(s) from ${pairs.length} compared draft pair(s)`);
  console.log(`New implementation release ${r.id} (parent ${from.id}) with ${notes.length} note(s), $${budget.spentUsd.toFixed(3)}:`);
  for (const n of notes) console.log(`  - ${n.text}`);
  console.log(`Measure it before keeping it: run the skill on held-out requests and compare releases with atelier fidelity --skill ${L.skillName}; undo with --rollback.`);
}

function parseSettings(spec: string, base: ImplementationSettings): ImplementationSettings {
  const counts: Record<string, number> = { drafts: base.drafts, editBudget: base.editBudget, retrievalK: base.retrievalK, notesCap: base.notesCap };
  let diversity = base.diversity ?? false;
  let voice = base.voice;
  let selection = base.selection;
  for (const part of spec.split(',')) {
    const [k, v] = part.split('=').map((x) => x.trim());
    if (k === 'selection') {
      if (!['sample', 'best'].includes(v)) die(`"selection" is sample or best, got "${v}".`);
      selection = v === 'sample' ? 'sample' : undefined;
      continue;
    }
    if (k === 'voice') {
      if (!['incontext', 'off'].includes(v)) die(`"voice" is incontext or off, got "${v}".`);
      voice = v === 'incontext' ? 'incontext' : undefined;
      continue;
    }
    if (k === 'diversity') {
      if (!['0', '1', 'on', 'off', 'true', 'false'].includes(v)) die(`"diversity" is on or off, got "${v}".`);
      diversity = ['1', 'on', 'true'].includes(v);
      continue;
    }
    if (!(k in counts)) die(`unknown setting "${k}": drafts, editBudget, retrievalK, notesCap, diversity, voice or selection.`);
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) die(`"${k}" needs a number of 0 or more, got "${v}".`);
    counts[k] = Math.floor(n);
  }
  if (counts.drafts < 1) die('drafts must be at least 1.');
  return { drafts: counts.drafts, editBudget: counts.editBudget, retrievalK: counts.retrievalK, notesCap: counts.notesCap, ...(diversity ? { diversity: true } : {}), ...(voice ? { voice } : {}), ...(selection ? { selection } : {}) };
}

const describeSettings = (s: ImplementationSettings): string =>
  `${s.drafts} draft(s)${s.diversity ? ' made to differ' : ''}, ${s.editBudget} structural edit(s), ${s.retrievalK} passage(s) retrieved, ${s.notesCap} note(s) served${s.voice ? ', the voice pass on (in-context pairs)' : ''}${s.selection === 'sample' ? ', drafts drawn by density ratio' : ''}`;

const round = (x: number): string => (Math.abs(x) >= 10 ? String(Math.round(x)) : String(Math.round(x * 100) / 100));

/**
 * CALIBRATE FROM A FOLDER, for a skill built before calibrations were kept. Use the pieces the skill was built
 * from, never the reserved ones: those are the blind comparison, and a reference that includes them has seen it.
 */
function calibrate(L: store.StoreLayout, profileHash: string, dir: string): void {
  const profile = fstore.getProfile(L, profileHash) ?? die('the active profile is not stored.');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) die(`${dir} is not a folder.`);
  const own = ownPieces(dir); const pieces = own.map((p) => p.text);
  const steering = profile.bands.filter((b) => b.cls === 'all' && b.role !== 'MONITOR').map((b) => b.id);
  const cal = calibrateTypicality(pieces, steering, own.map((p) => p.id)) ?? die(`no calibration from ${pieces.length} piece(s) over ${steering.length} steering feature(s): it needs at least 6 pieces and 2 features that vary across them.`);
  fstore.setTypicality(L, profileHash, cal);
  console.log(`Typicality calibrated on ${pieces.length} piece(s) over ${cal.features.length} feature(s) (calibration ${cal.hash}, shrinkage ${cal.shrinkage}). Every output is now read for how typical of you it is.`);
}

/**
 * CAN THE OUTPUTS BE TOLD APART FROM YOUR PIECES? A two-sample reading (core/fidelity/twosample.ts) of every
 * recorded output against the pieces the calibration was made on: a held-out classifier's AUC, MMD with a
 * permutation p-value, and how varied each side is at equal size.
 */
function reportCloseness(L: store.StoreLayout, profileHash: string, records: readonly Read[]): void {
  const cal = fstore.getTypicality(L, profileHash) ?? die(`no typicality calibration for this profile: rebuild the skill, or atelier fidelity --skill ${L.skillName} --calibrate-from <folder>.`);
  // NOT ON RUNS STEERED BY THE SAME INSTRUMENT. A run that kept a round for its typicality was selected on these
  // features against these pieces; testing it here would measure the steering (decision 0010).
  const steered = records.filter((r) => r.fidelity?.shape);
  const free = records.filter((r) => !r.fidelity?.shape);
  const outputs = free.map((r) => standardise(r.reading.values, cal.features, cal.center, cal.scale));
  const c = closeness(cal.vectors, outputs);
  console.log(`${c.outputs} output(s) against ${c.author} of your pieces, over ${cal.features.length} feature(s)${steered.length ? `; ${steered.length} run(s) steered toward typicality left out, since they were chosen on these same features` : ''}.`);
  console.log(c.c2st ? `  told apart by a held-out classifier: AUC ${c.c2st.auc} (95% CI ${c.c2st.ci95[0]} to ${c.c2st.ci95[1]}); 0.5 means it cannot tell them apart`
    : '  classifier two-sample test: not run (at least 6 on each side)');
  if (c.mmd) console.log(`  kernel two-sample test (MMD): p ${c.mmd.p}${c.mmd.p < 0.05 ? ', the outputs differ from your pieces' : ', no difference detected at this size'}`);
  if (c.vendi) console.log(`  variety at ${c.vendi.size} texts each: yours ${c.vendi.author} distinct, the outputs ${c.vendi.outputs}`);
  const ps = free.flatMap((r) => (r.reading.typicality?.calibration === cal.hash ? [r.reading.typicality.p] : []));
  if (ps.length) console.log(`  typical of you, per output: median ${Math.round([...ps].sort((a, b) => a - b)[Math.floor(ps.length / 2)] * 100)}% over ${ps.length} output(s)`);
}

/**
 * THE AUTHOR'S PIECES IN A FOLDER, LESS THE RESERVED ONES. Where this project's run recorded which of its pieces were
 * reserved, those are left out by file name: they are the blind comparison, and a reference that holds them has seen
 * it. Each piece carries its corpus id where the run knows it, so the retrieval index can find it again.
 */
function ownPieces(dir: string): { id: string; text: string }[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) die(`${dir} is not a folder.`);
  const reserved = new Set<string>(); const idOf = new Map<string, string>();
  const pathsFile = runFile('corpus-paths.json');
  if (existsSync(pathsFile)) {
    const ids = new Set((loadSession().reservation?.reserved ?? []).map((u) => u.unitId));
    for (const f of readJson<{ id: string; path: string }[]>(pathsFile, { kind: 'array', what: 'the corpus path list' })) {
      idOf.set(basename(f.path), f.id);
      if (ids.has(f.id)) reserved.add(basename(f.path));
    }
  }
  const all = readdirSync(dir).filter((f) => /\.(md|markdown|txt)$/i.test(f)).sort();
  const kept = all.filter((f) => !reserved.has(f));
  if (kept.length < all.length) console.log(`Left out ${all.length - kept.length} reserved piece(s): they stay the blind comparison.`);
  return kept.map((f) => ({ id: idOf.get(f) ?? f, text: readFileSync(join(dir, f), 'utf8') }));
}

/**
 * READ HOW THE AUTHOR BUILDS A PIECE, ONCE. Every piece is read by the structure reader (two small-model reads per
 * piece, metered against --cap), and the chain of moves plan-first generation samples from is stored with the profile.
 */
async function readAuthorStructure(L: store.StoreLayout, profileHash: string, dir: string): Promise<void> {
  const pieces = ownPieces(dir);
  if (pieces.length < 4) die(`${pieces.length} piece(s): reading a structure needs at least 4.`);
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1), maxCalls: pieces.length * 2 + 2 };
  console.log(`Reading the structure of ${pieces.length} piece(s), two reads each by ${structureModel()}: roughly $${(pieces.length * 0.02).toFixed(2)}; the cap is $${budget.capUsd.toFixed(2)}.`);
  const client = clientFor(structureModel());
  const read: { id: string; moves: readonly (StructureMove | null)[]; kappa: number | null }[] = [];
  for (const p of pieces) {
    const r = await readStructure(client, budget, p.text).catch((e: unknown) => { console.log(`  ${p.id}: not read (${(e as Error).message.split('\n')[0]})`); return null; });
    if (r) read.push({ id: p.id, moves: r.moves, kappa: r.kappa });
  }
  if (read.length < 4) die(`only ${read.length} piece(s) could be read; nothing stored. $${budget.spentUsd.toFixed(2)} spent.`);
  const chain = chainOf(read.map((r) => r.moves));
  fstore.setStructure(L, profileHash, { version: 1, reader: STRUCTURE_READER_VERSION, pieces: read, chain, at: new Date().toISOString() });
  const kappas = read.map((r) => r.kappa).filter((k): k is number => k !== null).sort((a, b) => a - b);
  console.log(`Read ${read.length} piece(s) (reader ${STRUCTURE_READER_VERSION}); the two reads agreed at a median kappa of ${kappas[Math.floor(kappas.length / 2)] ?? 'n/a'}. $${budget.spentUsd.toFixed(2)} spent.`);
  const feats = read.map((r) => structureFeatures(r.moves));
  for (const f of STRUCTURE_FEATURES) {
    const xs = feats.map((v) => v[f.id]).filter((x): x is number => x !== null).sort((a, b) => a - b);
    if (xs.length) console.log(`  ${f.label}: median ${round(xs[Math.floor(xs.length / 2)])}`);
  }
  console.log(`A piece of yours runs about ${typicalLength(chain)} labelled paragraphs. Plan-first generation: atelier invoke --skill ${L.skillName} --structure plan "<task>"`);
}

/** The structure reader's model: the one it was qualified with, unless one is named. */
export const structureModel = (): string => process.env.ATELIER_STRUCTURE_MODEL ?? 'claude-haiku-4-5';
