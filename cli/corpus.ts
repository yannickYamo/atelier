// cli/corpus.ts — THE AUTHOR'S PIECES, READ ONE WAY FOR EVERY COMMAND THAT NEEDS THEM.
//
// The regression floor proposes margins from them, `build` chooses whole pieces and a persona from them,
// and `atelier tells` compares a skill's drafts with them. Each used to read them its own way, with three
// different rules for when the project's run was this skill's; one rule now.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { extract, looksLikeUnsplitPair, READABLE, META_NAME } from '../core/intake/extract.js';
import { walk } from './commands/intake.js';
import { die, loadSession } from './runtime.js';

/**
 * Every piece of writing at `path` (a folder, or one file), as intake would read it: files about the work
 * (README, LICENSE, notes) are skipped, and pieces reserved for blind testing are left out, matched by content.
 */
export function readCorpus(path: string, what = '--corpus'): string[] {
  return readCorpusPairs(path, what).map((p) => p.text);
}

/** The same pieces, each with the request it answers when its file carries one (core/intake/extract.ts, `splitRequest`). */
export function readCorpusPairs(path: string, what = '--corpus'): { text: string; request: string | null }[] {
  if (!existsSync(path)) die(`${what}: there is nothing at ${path}.`);
  const files = statSync(path).isDirectory() ? walk(path).map((r) => join(path, r)) : [path];
  const reserved = new Set((loadSession().reservation?.reserved ?? []).map((u) => u.artifact.trim()));
  return files
    .filter((f) => (READABLE as readonly string[]).includes(extname(f).toLowerCase()) && !META_NAME.test(basename(f)))
    .flatMap((f) => { const r = extract(f); return r.ok ? [{ text: r.text, request: r.request ?? null }] : []; })
    .filter((p) => !reserved.has(p.text.trim()));
}

/** The files at `path` that look like a request and an answer and were read whole (core/intake/extract.ts, `looksLikeUnsplitPair`). */
export function unsplitPairs(path: string): string[] {
  if (!existsSync(path)) return [];
  const files = statSync(path).isDirectory() ? walk(path).map((r) => join(path, r)) : [path];
  return files.filter((f) => ['.md', '.markdown', '.txt'].includes(extname(f).toLowerCase()) && !META_NAME.test(basename(f)) && looksLikeUnsplitPair(readFileSync(f, 'utf8'))).map((f) => basename(f));
}

/** The pieces this project's run read, with their requests: `sessionCorpus` for a reading that needs the pair. */
export function sessionPairs(): { text: string; request: string | null }[] {
  const s = loadSession();
  return s.source && existsSync(s.source) ? readCorpusPairs(s.source, 'the corpus this skill was built from') : [];
}

/**
 * The pieces this project's run read, when they can still be read. `skill`, when given, must be the skill
 * that run built (or the run built none yet): another skill's corpus is not this one's. `includeReserved`
 * adds the pieces held back for blind testing, for a check where anything the author wrote counts as
 * theirs (a phrase they used anywhere is not a machine tell).
 */
export function sessionCorpus(skill: string | null = null, opts: { readonly includeReserved?: boolean } = {}): string[] {
  const s = loadSession();
  const ours = skill === null || s.skillName === null || s.skillName === skill;
  const source = ours && s.source && existsSync(s.source) ? s.source : null;
  if (!source) return [];
  return [...readCorpus(source, 'the corpus this skill was built from'), ...(opts.includeReserved ? (s.reservation?.reserved ?? []).map((u) => u.artifact) : [])];
}
