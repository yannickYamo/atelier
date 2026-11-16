#!/usr/bin/env -S npx tsx
// scripts/check-live-record.mts — AT A RELEASE: IS THERE A LIVE RUN OF THIS CODE?
//
// Reads `release/live-run.json` (written by scripts/live-run.mts) and exits 1 unless it records a run on a real model in
// which every scenario held, on a commit this one descends from and differs from only in the record itself, the
// changelog and the version. So the one check that sees what a person sees cannot be skipped in a hurried week.
// It is a tripwire against forgetting, not a proof: the record is a file a person commits.
//
//   npx tsx scripts/check-live-record.mts            # in the repository, at the commit to release

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** What may change between the commit a live run was made on and the commit released. */
export const MAY_DIFFER: readonly string[] = ['release/live-run.json', 'CHANGELOG.md', 'package.json', 'package-lock.json'];
export interface LiveRecord { readonly commit?: string; readonly dirty?: boolean; readonly scripted?: boolean; readonly pass?: boolean; readonly scenarios?: readonly { readonly name: string; readonly pass: boolean }[] }

/** Why this record does not stand for the commit being released; empty when it does. `changed`: null when the record's commit is no ancestor. */
export function whyNot(r: LiveRecord | null, changed: readonly string[] | null): string[] {
  if (!r) return ['release/live-run.json is missing or is not JSON: run `npm run build && npm run live` and commit the record'];
  const why: string[] = [];
  if (r.scripted) why.push('the record is of a scripted run, not a real model');
  if (r.dirty) why.push('the live run was made on a tree with uncommitted changes');
  if (!r.scenarios?.length) why.push('the record holds no scenario');
  if (!r.pass || r.scenarios?.some((s) => !s.pass)) why.push(`not every scenario held: ${(r.scenarios ?? []).filter((s) => !s.pass).map((s) => s.name).join('; ') || 'the record says so'}`);
  if (!r.commit) why.push('the record names no commit');
  else if (changed === null) why.push(`the record's commit ${r.commit.slice(0, 12)} is not an ancestor of this one`);
  else { const other = changed.filter((f) => !MAY_DIFFER.includes(f)); if (other.length) why.push(`code changed since the live run (${other.slice(0, 8).join(', ')}${other.length > 8 ? `, and ${other.length - 8} more` : ''}): run it again`); }
  return why;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const root = resolve(process.argv[2] ?? '.'); const file = join(root, 'release/live-run.json');
  const read = (): LiveRecord | null => { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as LiveRecord : null; } catch { return null; } };
  const record = read();
  const git = (...a: string[]): string | null => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
  const commit = record?.commit ?? '';
  const ancestor = /^[0-9a-f]{7,40}$/.test(commit) && git('merge-base', '--is-ancestor', commit, 'HEAD') !== null;
  const changed = ancestor ? (git('diff', '--name-only', commit, 'HEAD') ?? '').split('\n').filter(Boolean) : null;
  const why = whyNot(record, changed);
  if (why.length) { console.error(`No live run stands for this commit:\n${why.map((w) => `  - ${w}`).join('\n')}`); process.exit(1); }
  console.log(`A live run stands for this commit: ${record?.scenarios?.length ?? 0} scenarios held on ${commit.slice(0, 12)}.`);
}
