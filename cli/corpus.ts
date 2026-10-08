// cli/corpus.ts — THE AUTHOR'S PIECES, READ ONE WAY FOR EVERY COMMAND THAT NEEDS THEM.
//
// The regression floor proposes margins from them, `build` chooses whole pieces and a persona from them,
// and `atelier tells` compares a skill's drafts with them. Each used to read them its own way, with three
// different rules for when the project's run was this skill's; one rule now.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename, resolve, dirname } from 'node:path';
import { inMaterialDir, materialDirOf, staysInside, goldenCase, MATERIAL_TEXT, type GoldenCase } from '../core/golden/case.js';
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
  // What an example was made from is not the author's work (core/golden/case.ts): a `.material` folder, and any
  // file an example names as its material, are left out here as they are at intake.
  const rels = statSync(path).isDirectory() ? walk(path).filter((r) => !inMaterialDir(r)) : null;
  const files = rels ? rels.map((r) => join(path, r)) : [path];
  const reserved = new Set((loadSession().reservation?.reserved ?? []).map((u) => u.artifact.trim()));
  const pieces = files
    .filter((f) => (READABLE as readonly string[]).includes(extname(f).toLowerCase()) && !META_NAME.test(basename(f)))
    .flatMap((f) => { const r = extract(f); return r.ok ? [{ file: f, text: r.text, request: r.request ?? null, refs: (r.materialRefs ?? []).map((ref) => resolve(dirname(f), ref)) }] : []; });
  // A piece that names itself is still a piece, as at intake; names are matched without regard to case.
  const named = new Set(pieces.flatMap((p) => p.refs.filter((r) => r.toLowerCase() !== resolve(p.file).toLowerCase()).map((r) => r.toLowerCase())));
  return pieces.filter((p) => !named.has(resolve(p.file).toLowerCase()) && !reserved.has(p.text.trim())).map((p) => ({ text: p.text, request: p.request }));
}

/**
 * ONE EXAMPLE FILE AS A CASE: its finished work, the task it carries, and its material, from the folder
 * `<example>.material` beside it and from the files its front matter names (inside the example's own folder). The
 * same reading intake makes of each example in a folder, for a command that is given one file.
 */
export function readCase(file: string, say: (line: string) => void = () => undefined): GoldenCase {
  const read = extract(file);
  if (!read.ok) return die(`${basename(file)}: ${read.reason}`);
  const r = read;
  const dir = dirname(file);
  // The folder is found without regard to case, as intake finds it.
  const wanted = materialDirOf(basename(file)).toLowerCase();
  const folderName = readdirSync(dir).find((f) => f.toLowerCase() === wanted && statSync(join(dir, f)).isDirectory());
  const inFolder = folderName ? walk(join(dir, folderName)).sort().map((f) => join(dir, folderName, f)) : [];
  const refs = r.materialRefs ?? [];
  const outside = refs.filter((ref) => !staysInside(ref));
  if (outside.length) say(`Material named outside the example's folder, not read: ${outside.join(', ')}.`);
  const named = refs.filter(staysInside).map((ref) => resolve(dir, ref)).filter((f) => f !== resolve(file));
  const unread: string[] = [];
  const material = [...new Set([...inFolder, ...named])].flatMap((f) => {
    const ext = extname(f).toLowerCase(); const name = f.startsWith(`${dir}/`) ? f.slice(dir.length + 1) : basename(f);
    // Only what can be read as text is material: a picture read as text is noise that would vouch for any figure.
    const text = !existsSync(f) ? null : (READABLE as readonly string[]).includes(ext) ? (() => { const x = extract(f); return x.ok ? x.text : null; })()
      : (MATERIAL_TEXT as readonly string[]).includes(ext) ? readFileSync(f, 'utf8') : null;
    if (!text?.trim()) { unread.push(name); return []; }
    return [{ name, text }];
  });
  if (unread.length) say(`Material that could not be read, and is not counted: ${unread.join(', ')}.`);
  return goldenCase(basename(file), r.text, r.request ?? null, material);
}

/** The files at `path` that look like a request and an answer and were read whole (core/intake/extract.ts, `looksLikeUnsplitPair`). */
export function unsplitPairs(path: string): string[] {
  if (!existsSync(path)) return [];
  const files = statSync(path).isDirectory() ? walk(path).filter((r) => !inMaterialDir(r)).map((r) => join(path, r)) : [path];
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
