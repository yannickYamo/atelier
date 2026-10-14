#!/usr/bin/env node
// Builds the code-review domain once: changed files with one planted defect each, and twelve golden reviews that
// pass check.mjs. Spends about two dollars. What it writes is committed; it is not run again.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, pool } from '../../lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); const model = 'claude-opus-5'; const log = join(HERE, 'gen-tokens.jsonl');
const METHOD = readFileSync(join(HERE, 'method.md'), 'utf8');
const EXAMPLES = [['src/orders/refund.js', 'a refund amount that is never checked against the amount paid'], ['src/mail/digest.py', 'a loop that skips the last item (range stops one short)'],
  ['src/tokens/rotate.js', 'a new token generated with Math.random'], ['src/import/csv.py', 'a file opened and never closed on the error path'],
  ['src/rate/limiter.js', 'a counter read and written without the lock the comment says it holds'], ['src/search/paging.py', 'a page size taken from the request with no upper bound'],
  ['src/profile/cache.js', 'a cache key built without the user id, so one user is served another\'s profile'], ['src/sync/retry.py', 'a retry loop with no limit and no delay'],
  ['src/perm/roles.js', 'an admin check that uses || where && is needed'], ['src/export/zip.py', 'a temporary file created with a predictable name'],
  ['src/notify/webhook.js', 'a secret written to the log'], ['src/stats/average.py', 'a division by a count that can be zero']];
const fileFor = async (path, bug) => {
  for (let k = 0; k < 3; k += 1) {
    const raw = (await ask({ model, log, tag: 'file', max: 2500, user: `Write a realistic source file ${path} of 45 to 60 lines (several functions, blank lines, comments). Plant exactly one defect: ${bug}. It must sit on ONE line whose text appears only once in the file, and nothing in the file may hint at it. Return JSON only: {"code": "<the file>", "bugLine": "<that line, exactly as in the file>"}` })).text;
    try {
      const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); const lines = j.code.replace(/\n$/, '').split('\n');
      const at = lines.map((l, n) => (l.trim() === j.bugLine.trim() ? n : -1)).filter((n) => n >= 0);
      if (at.length === 1 && lines.length >= 35) return { path, bug, lines, bugIndex: at[0] };
    } catch { /* again */ }
  }
  return null;
};
const truth = existsSync(join(HERE, 'truth.json')) ? JSON.parse(readFileSync(join(HERE, 'truth.json'), 'utf8')) : {};
// The ten task files were made in an earlier study and are passed in; the twelve example files are made here.
const given = JSON.parse(readFileSync(process.argv[2], 'utf8'));
given.forEach((f, i) => { truth[`t${i}`] = { path: f.path, bug: f.bug, lines: f.lines, bugIndex: f.bugIndex, start: f.start }; });
await pool(EXAMPLES, 4, async ([path, bug], i) => {
  const id = `e${String(i + 1).padStart(2, '0')}`; if (truth[id]) return;
  const f = await fileFor(path, bug); if (!f) { console.error(`no file for ${path}`); return; }
  truth[id] = { ...f, start: 9 + i * 11 }; writeFileSync(join(HERE, 'truth.json'), JSON.stringify(truth, null, 1));
});
writeFileSync(join(HERE, 'truth.json'), JSON.stringify(truth, null, 1));
const { check, diffOf } = await import('./check.mjs');
for (const [id, t] of Object.entries(truth)) if (id.startsWith('t')) writeFileSync(join(HERE, 'tasks', `${id}.diff.txt`), diffOf(t));
const numbered = (t) => t.lines.map((l, n) => `${String(t.start + n).padStart(4)}  ${l}`).join('\n');
const done = await pool(Object.entries(truth).filter(([id]) => id.startsWith('e')), 4, async ([id, t]) => {
  const dir = join(HERE, 'examples', `${id}.material`); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'diff.txt'), diffOf(t));
  for (let k = 0; k < 4; k += 1) {
    const review = (await ask({ model, log, tag: 'review', max: 2000, user: `${METHOD}\nWrite the review of this change, following the method exactly, as markdown with "## Summary", "## Must fix", "## Suggestions" and "## Verdict" headings. The defect that must come first under Must fix is on line ${t.start + t.bugIndex} of ${t.path} (${t.bug}); cite it as ${t.path}:${t.start + t.bugIndex}. Cite nothing that is a blank line or a lone brace. The Verdict section holds only the words "Request changes". Keep the whole review under 280 words: a Summary of two or three sentences, at most three Must fix items of one or two sentences each, at most three Suggestions. Return only the review.\n\nThe new file, with its line numbers:\n\n${numbered(t)}` })).text;
    if (!check(review, { id }).fails.length) { writeFileSync(join(HERE, 'examples', `${id}.md`), `---\nrequest: Review this change.\nmaterial: ${id}.material/diff.txt\n---\n${review}\n`); return `${id} ok (try ${k + 1})`; }
  }
  return `${id} FAILED`;
});
console.log(done.join('\n'));
