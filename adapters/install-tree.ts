// atelier/adapters/install-tree.ts — how a package becomes a skill directory, for every host.
//
// Both adapters used to write the package's files over whatever the directory already held and never
// clear it. Installs were additive across builds: a rule the owner REJECTED at the second ratification
// kept its example file from the first build, sitting in examples/ as a complete statement with its
// condition, and any agent that read the directory read it. The verifier checked only the files the
// package names, so it was blind to exactly that addition and reported a match.
//
// The fix is one identity: the directory IS the package. Install replaces the tree whole; verify
// enumerates the tree and fails on anything the package does not name.
import { mkdirSync, readFileSync, existsSync, rmSync, readdirSync, renameSync, rmdirSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { writeAtomic } from '../core/state/fs-atomic.js';
import { readJson } from '../core/state/read-json.js';
import type { InstallablePackage, InstallResult, VerificationResult } from './host-adapter.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Written beside the package's files, never part of them: what the next install checks it wrote. */
export const MARKER = '.atelier-install.json';

const walk = (root: string, d = root): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name);
  return e.isDirectory() ? walk(root, p) : [relative(root, p).split('\\').join('/')];
});

/**
 * Write the package into a staging directory, then swap it in. NOTHING IS DELETED THAT THE PACKAGE
 * DID NOT PUT THERE.
 *
 * The directory may hold files Atelier never wrote — a person's own skill that happens to share the
 * name, or a script they dropped beside SKILL.md. The previous install is therefore MOVED aside, not
 * removed: if everything in it is also in the new package it is discarded, and otherwise it is kept
 * under `.atelier-backups/` next to the skills directory (outside it, so the host never loads it as a
 * second skill) and the result says where. If the swap fails, the previous install is put back.
 *
 * Staging lives beside the skills directory too: a crash mid-install must not leave a half-written
 * directory that the host would load as a skill with the same name.
 */
export function installTree(dir: string, pkg: InstallablePackage): InstallResult {
  const skillsDir = dirname(dir);
  const hostDir = dirname(skillsDir);
  const id = basename(dir);
  const staging = join(hostDir, '.atelier-staging', `${id}-${process.pid}`);
  const aside = join(hostDir, '.atelier-staging', `${id}-${process.pid}-previous`);
  let movedAside = false;
  try {
    rmSync(staging, { recursive: true, force: true });
    rmSync(aside, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    // A package is a DIRECTORY TREE, not one file. examples/ and contracts/ are nested, and a flat
    // write silently loses them — the host would hold a skill missing exactly the components that
    // carry PREFERRED and REQUIRED-STRICT behaviour.
    for (const [rel, content] of Object.entries(pkg.files)) {
      const target = join(staging, rel);
      mkdirSync(dirname(target), { recursive: true });
      writeAtomic(target, content);
    }
    // What this install is, for the NEXT install to recognise as its own.
    writeAtomic(join(staging, MARKER), JSON.stringify({ packageHash: pkg.packageHash, files: Object.keys(pkg.files).sort() }));
    mkdirSync(skillsDir, { recursive: true });
    const foreign = existsSync(dir) ? notPristine(dir) : [];
    if (existsSync(dir)) { renameSync(dir, aside); movedAside = true; }
    try {
      renameSync(staging, dir);
    } catch (e) {
      if (movedAside) renameSync(aside, dir);          // put the previous install back
      throw e;
    }
    let backedUpTo: string | null = null;
    if (movedAside && foreign.length) {
      backedUpTo = join(hostDir, '.atelier-backups', `${id}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
      mkdirSync(dirname(backedUpTo), { recursive: true });
      renameSync(aside, backedUpTo);
    } else if (movedAside) {
      rmSync(aside, { recursive: true, force: true });
    }
    try { rmdirSync(dirname(staging)); } catch { /* another install is staging beside this one */ }
    return { ok: true, installedAt: dir, backedUp: backedUpTo ? { to: backedUpTo, files: foreign } : null };
  } catch (e) {
    // Best effort: a cleanup failure must not replace the install failure the caller needs to report.
    try { rmSync(staging, { recursive: true, force: true }); } catch { /* nothing was staged */ }
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * The files in an existing install that are not provably Atelier's own, untouched bytes. Discarding
 * the previous install is safe only when it is exactly a package Atelier recorded writing; anything
 * else — no marker (a person's own skill), an edited file, an added one — is kept.
 */
function notPristine(dir: string): string[] {
  const all = walk(dir).filter((rel) => rel !== MARKER);
  const markerPath = join(dir, MARKER);
  if (!existsSync(markerPath)) return all;
  let marker: { packageHash?: string; files?: string[] };
  try { marker = readJson<{ packageHash?: string; files?: string[] }>(markerPath, { what: 'an install marker' }); } catch { return all; }
  const listed = new Set(marker.files ?? []);
  const extra = all.filter((rel) => !listed.has(rel));
  if (extra.length) return extra;
  const onDisk: Record<string, string> = {};
  for (const rel of marker.files ?? []) {
    if (!existsSync(join(dir, rel))) continue;
    onDisk[rel] = readFileSync(join(dir, rel), 'utf8');
  }
  return sha(JSON.stringify(onDisk)) === marker.packageHash ? [] : all;
}

/** One line for a person, when an install kept something aside. Null when there was nothing to keep. */
export function describeBackup(r: InstallResult): string | null {
  if (!r.ok || !r.backedUp) return null;
  const n = r.backedUp.files.length;
  return `${n} file(s) in the previous install are not part of this package (${r.backedUp.files.slice(0, 4).join(', ')}${n > 4 ? ', …' : ''}). `
    + `They were moved, not deleted: ${r.backedUp.to}`;
}

export function verifyTree(root: string, pkg: InstallablePackage): VerificationResult {
  const p = join(root, 'SKILL.md');
  if (!existsSync(p)) return { present: false, matchesPackage: false, detail: `not installed at ${p}` };
  // EVERY runtime file, not just SKILL.md. Hashing one file of a multi-file package would pass an
  // installation whose examples or output contract had been edited — and those carry the
  // PREFERRED and REQUIRED-STRICT behaviour, which is exactly what an editor would reach for.
  const onDisk: Record<string, string> = {};
  for (const rel of Object.keys(pkg.files)) {
    const t = join(root, rel);
    if (!existsSync(t)) return { present: true, matchesPackage: false, detail: `MISSING COMPONENT: ${rel} is in the compiled package and not on disk` };
    onDisk[rel] = readFileSync(t, 'utf8');
  }
  // And nothing ELSE. A file the package does not name is still read by a host that globs the
  // directory; the stale example of a rejected rule was exactly such a file.
  const extra = walk(root).filter((rel) => rel !== MARKER && !(rel in pkg.files)).sort();
  if (extra.length) {
    return { present: true, matchesPackage: false,
      detail: `UNCOMPILED FILES IN THE SKILL: ${extra.join(', ')} — not part of the package built from the standard; rebuild or reinstall to remove them` };
  }
  const matches = sha(JSON.stringify(onDisk)) === pkg.packageHash;
  return { present: true, matchesPackage: matches, detail: matches ? 'matches the compiled package' : 'INSTALLED FILES EDITED — they no longer match what was compiled from the standard' };
}
