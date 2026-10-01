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

import { readFileSync } from 'node:fs';
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
import { familiesOf } from './qualify.js';
import { DATA, die, argv, flag, numericFlag, skillArg, clientAndBinding } from '../runtime.js';

export async function fidelity(): Promise<void> {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const activeNow = fstore.getActiveRelease(L);
  const profile = (activeNow?.release.profileHash ? fstore.getProfile(L, activeNow.release.profileHash) : null) ?? fstore.getProfile(L) ?? die(`"${name}" has no fidelity profile: it is built at discovery from a corpus (atelier new <folder>), and a skill written from stated rules has no author's range to steer toward.`);
  const active = activeNow;
  const read = flag('--read');
  if (read) { readOne(readFileSync(read, 'utf8'), profile); return; }
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
function readOne(text: string, profile: NonNullable<ReturnType<typeof fstore.getProfile>>): void {
  const r = readFidelity(text, profile);
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
  const out: Record<string, number> = { ...base };
  for (const part of spec.split(',')) {
    const [k, v] = part.split('=').map((x) => x.trim());
    if (!['drafts', 'editBudget', 'retrievalK', 'notesCap'].includes(k)) die(`unknown setting "${k}": drafts, editBudget, retrievalK or notesCap.`);
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) die(`"${k}" needs a number of 0 or more, got "${v}".`);
    out[k] = Math.floor(n);
  }
  if (out.drafts < 1) die('drafts must be at least 1.');
  return out as unknown as ImplementationSettings;
}

const describeSettings = (s: ImplementationSettings): string =>
  `${s.drafts} draft(s), ${s.editBudget} structural edit(s), ${s.retrievalK} passage(s) retrieved, ${s.notesCap} note(s) served${s.temperature !== undefined ? `, temperature ${s.temperature}` : ''}`;

const round = (x: number): string => (Math.abs(x) >= 10 ? String(Math.round(x)) : String(Math.round(x * 100) / 100));
