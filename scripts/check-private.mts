#!/usr/bin/env -S npx tsx
// scripts/check-private.mts — BEFORE A PUSH: NO PRIVATE TERM IN ANY TRACKED FILE.
//
// Reads the terms from an untracked file, one per line (`~/.atelier-private-terms`, or the path in
// ATELIER_PRIVATE_TERMS); blank lines and lines starting with `#` are skipped. A few markers that are private by
// construction are always checked. Every git-tracked text file is searched for each term as a whole word or phrase,
// ignoring case. Exit 1 lists every hit as file:line: term; exit 0 says how many terms were checked.
//
//   npm run check:private            # in the repository to check
//   npx tsx scripts/check-private.mts <repo>

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Markers that belong in no public file, whatever the private list says. */
export const BUILT_IN: readonly string[] = ['atelier-internal', 'atelier-study', 'do not publish'];

export function termsFrom(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A term as a whole word or phrase: not inside a longer word, any run of spaces between its words. */
const matcherOf = (term: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}_])${escape(term).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}_])`, 'iu');

export interface Hit { readonly file: string; readonly line: number; readonly term: string }

export function scan(repo: string, terms: readonly string[], skip: readonly string[] = []): Hit[] {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
  const matchers = [...new Set(terms.map((t) => t.toLowerCase()))].map((t) => [t, matcherOf(t)] as const);
  const hits: Hit[] = [];
  for (const f of files) {
    if (skip.includes(f)) continue;
    const path = join(repo, f);
    if (!existsSync(path)) continue;
    const buf = readFileSync(path);
    if (buf.includes(0)) continue;                     // binary
    const lines = buf.toString('utf8').split('\n');
    lines.forEach((line, i) => { for (const [t, re] of matchers) if (re.test(line)) hits.push({ file: f, line: i + 1, term: t }); });
  }
  return hits;
}

function main(): void {
  const repo = resolve(process.argv[2] ?? process.cwd());
  const termsPath = process.env.ATELIER_PRIVATE_TERMS ?? join(homedir(), '.atelier-private-terms');
  const own = termsFrom(termsPath);
  if (!own.length) console.log(`(no private terms at ${termsPath}: checking the built-in markers only)`);
  // This script names the built-in markers, so it is not searched for them.
  const self = relative(repo, fileURLToPath(import.meta.url));
  const hits = scan(repo, [...BUILT_IN, ...own], [self]);
  if (hits.length) {
    console.error(`Private terms in tracked files (${hits.length}):`);
    for (const h of hits) console.error(`  ${h.file}:${h.line}: ${h.term}`);
    process.exit(1);
  }
  console.log(`No private terms in tracked files (${BUILT_IN.length + own.length} checked).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
