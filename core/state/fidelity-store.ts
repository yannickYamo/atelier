// atelier/core/state/fidelity-store.ts — THE FIDELITY LOOP'S STATE, BESIDE THE SKILL'S, UNDER THE SAME RULES.
//
// Laid out under `skills/<name>/fidelity/` with the conventions of ./store.ts: every file written with
// writeAtomic, every read through readJson with the path in its error, and everything append-only
// except one pointer.
//
//   profile.json            the author's bands and detector (FidelityProfile), rebuilt at build time
//   retrieval.json          the TF-IDF index over the author's passages, checked against its hash on read
//   releases/<id>.json      implementation releases, content-addressed and never overwritten
//   active.json             the ONLY mutable file: which release is serving. Rollback moves it to the parent.
//
// A release file is checked on the way out as well as on the way in: an id that does not match the
// recomputed hash means someone edited a file that names itself by its content, and serving it would
// steer outputs with something no release recorded.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from './fs-atomic.js';
import { readJson } from './read-json.js';
import type { StoreLayout } from './store.js';
import type { FidelityProfile, ImplementationRelease } from '../fidelity/types.js';
import type { RetrievalIndex } from '../fidelity/retrieval.js';
import { passagesHash } from '../fidelity/retrieval.js';
import { releaseId, canonicalJson } from '../fidelity/release.js';

const base = (l: StoreLayout): string => {
  const name = l.skillName;
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
    throw new Error(`STORE: "${name}" is not a skill name; it would resolve outside skills/.`);
  }
  return join(l.root, 'skills', name, 'fidelity');
};
const releasesDir = (l: StoreLayout): string => join(base(l), 'releases');

export function getProfile(l: StoreLayout): FidelityProfile | null {
  const p = join(base(l), 'profile.json');
  return existsSync(p) ? readJson<FidelityProfile>(p, { what: 'the fidelity profile', requireKeys: ['bands', 'hash'] }) : null;
}
export function setProfile(l: StoreLayout, profile: FidelityProfile): void {
  writeAtomic(join(base(l), 'profile.json'), JSON.stringify(profile, null, 1));
}

export function getRetrievalIndex(l: StoreLayout): RetrievalIndex | null {
  const p = join(base(l), 'retrieval.json');
  if (!existsSync(p)) return null;
  const index = readJson<RetrievalIndex>(p, { what: 'the retrieval index', requireKeys: ['passages', 'df', 'hash'] });
  if (passagesHash(index.passages) !== index.hash) {
    throw new Error(`STORE: retrieval index at ${p} names itself ${index.hash} and its passages hash to ${passagesHash(index.passages)}. It is not served.`);
  }
  return index;
}
export function setRetrievalIndex(l: StoreLayout, index: RetrievalIndex): void {
  writeAtomic(join(base(l), 'retrieval.json'), JSON.stringify(index));
}

const checked = (r: ImplementationRelease, where: string): ImplementationRelease => {
  const id = releaseId(r);
  if (id !== r.id) throw new Error(`STORE: release file ${where} names itself ${r.id} and its content hashes to ${id}. A content-addressed file cannot carry another identity; it is not served.`);
  return r;
};

export function getRelease(l: StoreLayout, id: string): ImplementationRelease | null {
  if (!/^[0-9a-f]+$/.test(id)) return null;
  const p = join(releasesDir(l), `${id}.json`);
  if (!existsSync(p)) return null;
  const r = checked(readJson<ImplementationRelease>(p, { what: `release ${id}`, requireKeys: ['id', 'settings', 'standardVersionHash'] }), `${id}.json`);
  if (r.id !== id) throw new Error(`STORE: release file ${id}.json holds release ${r.id}.`);
  return r;
}

/**
 * Write a release under its id. The id must be the hash of its content and the parent must already be
 * stored. Writing the same release twice keeps the first (its `createdAt` and `why` sit outside the
 * hash); a different body under an existing id is refused. Returns the release now on disk.
 */
export function putRelease(l: StoreLayout, r: ImplementationRelease): ImplementationRelease {
  checked(r, `for ${r.id}`);
  if (r.parent !== null && !getRelease(l, r.parent)) {
    throw new Error(`STORE: release ${r.id} names parent ${r.parent}, which is not stored. A release's history must exist before it does.`);
  }
  const existing = getRelease(l, r.id);
  if (existing) {
    const { createdAt: _a, why: _b, ...x } = existing; const { createdAt: _c, why: _d, ...y } = r;
    if (canonicalJson(x) !== canonicalJson(y)) throw new Error(`STORE: release ${r.id} already exists with different content.`);
    return existing;
  }
  writeAtomic(join(releasesDir(l), `${r.id}.json`), JSON.stringify(r, null, 1));
  return r;
}

/** Every stored release, oldest first (by createdAt, then id). */
export function listReleases(l: StoreLayout): ImplementationRelease[] {
  const d = releasesDir(l);
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => /^[0-9a-f]+\.json$/.test(f))
    .map((f) => getRelease(l, f.slice(0, -5)))
    .filter((r): r is ImplementationRelease => r !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** The release chain from `id` back to the root, newest first. Throws on a missing link or a cycle. */
export function releaseChain(l: StoreLayout, id: string): ImplementationRelease[] {
  const chain: ImplementationRelease[] = [];
  const seen = new Set<string>();
  let at: string | null = id;
  while (at !== null) {
    if (seen.has(at)) throw new Error(`STORE: release chain from ${id} loops at ${at}.`);
    seen.add(at);
    const r = getRelease(l, at);
    if (!r) throw new Error(`STORE: release ${at} in the chain from ${id} is not stored.`);
    chain.push(r);
    at = r.parent;
  }
  return chain;
}

/** Point the skill at a stored release. Activation points at history; it does not create it. */
export function setActiveRelease(l: StoreLayout, id: string): void {
  releaseChain(l, id);
  writeAtomic(join(base(l), 'active.json'), JSON.stringify({ releaseId: id, at: new Date().toISOString() }, null, 1));
}

/** The serving release and its parents (newest first), or null when none was ever activated. */
export function getActiveRelease(l: StoreLayout): { readonly release: ImplementationRelease; readonly chain: readonly ImplementationRelease[] } | null {
  const p = join(base(l), 'active.json');
  if (!existsSync(p)) return null;
  const { releaseId: id } = readJson<{ releaseId: string }>(p, { what: 'the active release pointer', requireKeys: ['releaseId'] });
  const chain = releaseChain(l, id);
  return { release: chain[0], chain };
}

/** Roll back one release: the pointer moves to the active release's parent. Returns it, or null at the root. */
export function rollbackRelease(l: StoreLayout): ImplementationRelease | null {
  const active = getActiveRelease(l);
  if (!active?.release.parent) return null;
  setActiveRelease(l, active.release.parent);
  return active.chain[1];
}
