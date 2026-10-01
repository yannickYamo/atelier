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
import type * as store from '../core/state/store.js';
import * as fstore from '../core/state/fidelity-store.js';
import { makeRelease, assertSameStandard } from '../core/fidelity/release.js';
import { retrieve, renderRetrieved, type RetrievalIndex } from '../core/fidelity/retrieval.js';
import { renderNotes } from '../core/fidelity/experience.js';
import { DEFAULT_SETTINGS, type FidelityProfile, type ImplementationRelease, type ImplementationSettings } from '../core/fidelity/types.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import { readJson } from '../core/state/read-json.js';
import { runFile } from './runtime.js';
import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/**
 * The profile discovery wrote, with the role of every feature the ratified standard holds as a FEATURE rule
 * set to RULE (the owner's ratification decides that, not the selection), and its hash recomputed.
 */
export function ratifiedProfile(p: FidelityProfile, v: StandardVersion): FidelityProfile {
  const ruled = new Set(v.requirements.flatMap((q) => (q.authority !== 'EXPERT_REJECTED' && q.measurement?.observer === 'FEATURE'
    ? [(q.measurement.params.feature as readonly string[] | undefined)?.[0] ?? ''] : [])));
  const bands = p.bands.map((b) => (ruled.has(b.id) ? { ...b, role: 'RULE' as const } : b));
  const body = { version: p.version, corpusHash: p.corpusHash, bands, detector: p.detector, factDensity: p.factDensity ?? null };
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
  const parent = fstore.getActiveRelease(L)?.release ?? null;
  const release = fstore.putRelease(L, makeRelease({
    parent: parent?.id ?? null, standardVersionHash: v.standardVersionHash, skillVersionHash,
    // A rebuild keeps the settings and notes the loop had earned; a first build starts from the defaults.
    settings: parent?.settings ?? (index ? DEFAULT_SETTINGS : { ...DEFAULT_SETTINGS, retrievalK: 0 }),
    notes: parent?.standardVersionHash === v.standardVersionHash ? parent.notes : [],
    profileHash: profile.hash, retrievalHash: index?.hash ?? null,
    createdAt: new Date().toISOString(), why: parent ? `rebuilt as skill version ${skillVersionHash}` : 'the first release, built with the skill',
  }));
  fstore.setActiveRelease(L, release.id);
  return release;
}

/**
 * AT INVOKE. The release that steers this run: the active one, carried to the served skill version as a
 * child release when the skill has moved since (a `fix` or a promotion), never across a change of standard.
 * Null when the skill has no profile.
 */
export function releaseFor(L: store.StoreLayout, sv: { skillVersionHash: string; standardVersionHash: string }): { release: ImplementationRelease; profile: FidelityProfile; index: RetrievalIndex | null } | null {
  const profile = fstore.getProfile(L);
  const active = fstore.getActiveRelease(L)?.release ?? null;
  if (!profile || !active) return null;
  // A NEW STANDARD IS A NEW SKILL. What the loop learned under one standard says nothing about another.
  if (active.standardVersionHash !== sv.standardVersionHash) return null;
  let release = active;
  if (active.skillVersionHash !== sv.skillVersionHash) {
    release = fstore.putRelease(L, makeRelease({ ...withoutId(active), parent: active.id, skillVersionHash: sv.skillVersionHash,
      createdAt: new Date().toISOString(), why: `carried to skill version ${sv.skillVersionHash}` }));
    fstore.setActiveRelease(L, release.id);
  }
  assertSameStandard(release, sv.standardVersionHash);
  const index = release.retrievalHash ? fstore.getRetrievalIndex(L) : null;
  return { release, profile, index: index?.hash === release.retrievalHash ? index : null };
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
    release.settings.notesCap > 0 && release.notes.length ? renderNotes(release.notes.slice(0, release.settings.notesCap)) : ''].filter(Boolean);
  return { text: parts.length ? `\n\n${parts.join('\n\n')}` : '', retrieved };
}

/** A new release under `from` with changed settings: the only way settings change. */
export function releaseWithSettings(L: store.StoreLayout, from: ImplementationRelease, settings: ImplementationSettings, why: string): ImplementationRelease {
  const r = fstore.putRelease(L, makeRelease({ ...withoutId(from), parent: from.id, settings, createdAt: new Date().toISOString(), why }));
  fstore.setActiveRelease(L, r.id);
  return r;
}
