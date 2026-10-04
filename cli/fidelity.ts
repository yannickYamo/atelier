// cli/fidelity.ts — THE FIDELITY LOOP, WIRED: WHAT BUILD INSTALLS AND WHAT INVOKE SERVES.
//
// The pieces live in core/fidelity (the profile, the reading, the structural actuator, retrieval,
// experience notes, implementation releases, the estimator) and core/state/fidelity-store.ts. This file
// is the one place the commands meet them, so `build`, `invoke` and `fidelity` cannot disagree about which
// release is active or what it serves.
//
// The standard is never touched here. A release names the standard's hash and the skill version, and
// every change below the standard is a new release with a parent.

import { existsSync } from 'node:fs';
import * as store from '../core/state/store.js';
import * as fstore from '../core/state/fidelity-store.js';
import { makeRelease, assertSameStandard } from '../core/fidelity/release.js';
import { retrieve, renderRetrieved, type RetrievalIndex } from '../core/fidelity/retrieval.js';
import { renderNotes, noteProblem } from '../core/fidelity/experience.js';
import { baselineOf } from '../core/fidelity/profile.js';
import { DEFAULT_SETTINGS, type FidelityProfile, type ImplementationRelease, type ImplementationSettings } from '../core/fidelity/types.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import { readJson } from '../core/state/read-json.js';
import { restrictCalibration, type TypicalityCalibration } from '../core/fidelity/typicality.js';
import { runFile } from './runtime.js';
import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/**
 * THE OWNER'S RULINGS DECIDE WHAT STEERS. The profile discovery wrote, with:
 *   - every feature the ratified standard holds as a FEATURE rule set to RULE, with the band the owner
 *     ratified (a ruling that changed the range is the range);
 *   - every feature selection was strong enough to propose as a rule, and the owner did not adopt (rejected,
 *     or never ratified), set to MONITOR: a rule the owner turned down must not steer drafts anyway.
 * Its hash is recomputed.
 */
export function ratifiedProfile(p: FidelityProfile, v: StandardVersion): FidelityProfile {
  const ruled = new Map<string, readonly [number, number] | null>();
  for (const q of v.requirements) {
    if (q.authority === 'EXPERT_REJECTED' || q.measurement?.observer !== 'FEATURE') continue;
    const id = (q.measurement.params.feature as readonly string[] | undefined)?.[0];
    if (!id) continue;
    const lo = q.measurement.params.minValue; const hi = q.measurement.params.maxValue;
    ruled.set(id, typeof lo === 'number' || typeof hi === 'number' ? [typeof lo === 'number' ? lo : -Infinity, typeof hi === 'number' ? hi : Infinity] : null);
  }
  const bands = p.bands.map((b) => {
    if (ruled.has(b.id)) {
      const r = ruled.get(b.id);
      return { ...b, role: 'RULE' as const, ...(r ? { band: [Math.max(r[0], -1e9), Math.min(r[1], 1e9)] as const } : {}) };
    }
    return b.proposable ? { ...b, role: 'MONITOR' as const } : b;
  });
  // The baseline recounted with these roles: read with other roles than the run, it compared unlike counts.
  const draft = { version: p.version, corpusHash: p.corpusHash, bands, detector: p.detector, factDensity: p.factDensity ?? null,
    ...(p.effects ? { effects: p.effects } : {}), ...(p.unseen ? { unseen: p.unseen } : {}), hash: '' };
  const baseline = baselineOf(draft);
  const { hash: _h, ...body } = { ...draft, ...(baseline ? { baseline } : {}) };
  return { ...body, hash: sha(JSON.stringify(body)) };
}

/**
 * AT BUILD. Installs the profile and the retrieval index discovery wrote, when it wrote them, and makes the
 * first implementation release for this skill version. Returns the release, or null for a skill built
 * without a corpus (a standard written by hand has no author's range to steer toward).
 */
export function installFidelity(L: store.StoreLayout, v: StandardVersion, skillVersionHash: string): ImplementationRelease | null {
  const profileFile = runFile('fidelity.json'); const indexFile = runFile('retrieval.json');
  if (!existsSync(profileFile)) return null;
  const profile = ratifiedProfile(readJson<FidelityProfile>(profileFile, { what: 'the fidelity profile' }), v);
  fstore.setProfile(L, profile);
  const index = existsSync(indexFile) ? readJson<RetrievalIndex>(indexFile, { what: 'the retrieval index' }) : null;
  if (index) fstore.setRetrievalIndex(L, index);
  // Keyed by the profile installed, which the owner's rulings may have changed from the one discovery wrote.
  const typicalityFile = runFile('typicality.json');
  // ON THE FEATURES THAT STEER AFTER THE OWNER'S RULINGS: a band the owner turned down is monitored, not steered, and
  // a calibration over it would disagree with the one `fidelity --calibrate-from` makes for the same profile.
  const discovered = existsSync(typicalityFile) ? readJson<TypicalityCalibration>(typicalityFile, { what: 'the typicality calibration' }) : null;
  const calibration = discovered ? restrictCalibration(discovered, profile.bands.filter((b) => b.cls === 'all' && b.role !== 'MONITOR').map((b) => b.id)) : null;
  if (calibration) fstore.setTypicality(L, profile.hash, calibration);
  // A NEW STANDARD STARTS A NEW LINE. Settings and notes earned under one standard are not evidence about
  // another: under a changed standard the first release is a root, with the first settings for this profile.
  const prior = fstore.getActiveRelease(L)?.release ?? null;
  const parent = prior?.standardVersionHash === v.standardVersionHash ? prior : null;
  const release = fstore.putRelease(L, makeRelease({
    parent: parent?.id ?? null, standardVersionHash: v.standardVersionHash, skillVersionHash,
    // A rebuild keeps the settings and notes the loop had earned; a first build starts from the defaults.
    settings: parent?.settings ?? firstSettings(profile, index !== null),
    notes: parent?.notes ?? [],
    profileHash: profile.hash, retrievalHash: index?.hash ?? null,
    createdAt: new Date().toISOString(), why: parent ? `rebuilt as skill version ${skillVersionHash}` : 'the first release, built with the skill',
  }));
  fstore.setActiveRelease(L, release.id);
  return release;
}

/**
 * THE FIRST RELEASE'S SETTINGS: 0.7's cost (DEFAULT_SETTINGS, ../core/fidelity/types.ts), whatever the profile
 * holds; the loop is opt-in until a study shows it pays. Retrieval only with an index to retrieve from.
 */
export function firstSettings(_profile: FidelityProfile, hasIndex: boolean): ImplementationSettings {
  return hasIndex ? DEFAULT_SETTINGS : { ...DEFAULT_SETTINGS, retrievalK: 0 };
}

/**
 * AT INVOKE. The release that steers this run: the active one, carried to the served skill version as a
 * child release when the skill has moved since (a `fix` or a promotion), never across a change of standard.
 * Null when the skill has no profile.
 */
export function releaseFor(L: store.StoreLayout, sv: { skillVersionHash: string; standardVersionHash: string }): { release: ImplementationRelease; profile: FidelityProfile; index: RetrievalIndex | null; typicality: TypicalityCalibration | null } | null {
  const active = fstore.getActiveRelease(L)?.release ?? null;
  if (!active) return null;
  // The profile and index the release names, not whichever was built last: a rollback serves what it says.
  const profile = active.profileHash ? fstore.getProfile(L, active.profileHash) ?? fstore.getProfile(L) : fstore.getProfile(L);
  if (!profile || (active.profileHash && profile.hash !== active.profileHash)) return null;
  // A NEW STANDARD IS A NEW SKILL. What the loop learned under one standard says nothing about another.
  if (active.standardVersionHash !== sv.standardVersionHash) return null;
  let release = active;
  // 0.8'S DEFAULT IS NOT A CHOICE. A skill built under 0.8 got the full loop as its first release, which 1.0
  // makes opt-in. Where nobody chose those settings (no release in its line was set by hand or by the settings
  // search), the active skill moves to 1.0's default through a child release that says why; a setting a person
  // chose is never touched.
  const isActiveSkill = store.getActive(L) === sv.skillVersionHash;
  if (wasLoopByDefault(L, active) && isActiveSkill) {
    release = fstore.putRelease(L, makeRelease({ ...withoutId(active), parent: active.id,
      settings: { ...DEFAULT_SETTINGS, retrievalK: active.settings.retrievalK }, createdAt: new Date().toISOString(),
      why: 'moved to the 1.0 default: the fidelity loop is opt-in until a study shows it pays (decision 0007)' }));
    fstore.setActiveRelease(L, release.id);
  }
  if (release.skillVersionHash !== sv.skillVersionHash) {
    // A candidate carried from 0.8's automatic loop settings runs at 1.0's default too.
    const carried = !isActiveSkill && wasLoopByDefault(L, release) ? { ...DEFAULT_SETTINGS, retrievalK: release.settings.retrievalK } : release.settings;
    release = fstore.putRelease(L, makeRelease({ ...withoutId(release), settings: carried, parent: release.id, skillVersionHash: sv.skillVersionHash,
      createdAt: new Date().toISOString(), why: `carried to skill version ${sv.skillVersionHash}` }));
    // A CANDIDATE RUN STEERS, IT DOES NOT ADOPT. Trying a version that is not active (`invoke --candidate`)
    // runs under a release made for it, and leaves the active release where it was.
    if (store.getActive(L) === sv.skillVersionHash) fstore.setActiveRelease(L, release.id);
  }
  assertSameStandard(release, sv.standardVersionHash);
  const index = release.retrievalHash ? fstore.getRetrievalIndex(L, release.retrievalHash) ?? fstore.getRetrievalIndex(L) : null;
  return { release, profile, index: index?.hash === release.retrievalHash ? index : null, typicality: fstore.getTypicality(L, profile.hash) };
}

/** Whether a release still carries 0.8's automatic loop settings, never chosen by a person or the search. */
function wasLoopByDefault(L: store.StoreLayout, r: ImplementationRelease): boolean {
  const s = r.settings;
  if (!(s.drafts === 4 && s.editBudget === 2 && s.notesCap === 6 && !s.diversity && r.notes.length === 0)) return false;
  // A release a person rolled back to is a choice, however its settings look.
  if (fstore.getActiveRelease(L)?.release.id === r.id && fstore.activeSetBy(L) === 'rollback') return false;
  return !fstore.releaseChain(L, r.id).some((x) => /^(settings set by hand|the settings search)/.test(x.why));
}

const withoutId = (r: ImplementationRelease): Omit<ImplementationRelease, 'id'> => {
  const { id: _id, ...rest } = r;
  return rest;
};

/**
 * What a release adds to the served skill for one request: the author's passages closest to it, and the
 * experience notes. Both are implementation, fenced and named as such, and both are recorded with the run.
 */
export function implementationBlock(release: ImplementationRelease, index: RetrievalIndex | null, task: string): { text: string; retrieved: number[] } {
  const retrieved = index && release.settings.retrievalK > 0 ? retrieve(index, task, release.settings.retrievalK) : [];
  const parts = [retrieved.length && index ? renderRetrieved(index, retrieved) : '',
    // Every stored note is held to today's grammar before it is served: a note distilled under 0.8 that the
    // grammar now refuses is never served (core/fidelity/experience.ts, noteProblem).
    release.settings.notesCap > 0 && release.notes.length ? renderNotes(release.notes.filter((n) => noteProblem(n.text) === null).slice(0, release.settings.notesCap)) : ''].filter(Boolean);
  return { text: parts.length ? `\n\n${parts.join('\n\n')}` : '', retrieved };
}

/** A new release under `from` with changed settings: the only way settings change. */
export function releaseWithSettings(L: store.StoreLayout, from: ImplementationRelease, settings: ImplementationSettings, why: string): ImplementationRelease {
  const r = fstore.putRelease(L, makeRelease({ ...withoutId(from), parent: from.id, settings, createdAt: new Date().toISOString(), why }));
  fstore.setActiveRelease(L, r.id);
  return r;
}
