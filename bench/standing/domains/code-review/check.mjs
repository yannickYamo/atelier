// The code-review standard, as code. Written before any arm output existed. Imports nothing from Atelier.
// R2 is strict on purpose (the exact line); `near` reports the same bug cited within two lines, which is what a
// reader would call found. Both are reported: the strict one is the standard's, the near one explains it.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const truth = JSON.parse(readFileSync(join(HERE, 'truth.json'), 'utf8'));
const HEADS = ['summary', 'must fix', 'suggestions', 'verdict'];
const sections = (text) => {
  const out = []; let cur = null;
  for (const line of text.split('\n')) {
    // a markdown heading, or one of the four names alone in bold; a bold item under a section is not a section
    const bold = /^\*\*(.+?)\*\*:?\s*$/.exec(line);
    const h = /^#{1,4}\s+(.+?)\s*:?\s*$/.exec(line) ?? (bold && HEADS.includes(bold[1].trim().toLowerCase()) ? bold : null);
    if (h) { cur = { name: h[1].trim().toLowerCase(), body: [] }; out.push(cur); } else if (cur) cur.body.push(line);
  }
  return out.map((s) => ({ name: s.name, body: s.body.join('\n').trim() }));
};
/** `id` is an example's or a task's: its truth holds the file, where its diff starts, its lines and the planted line. */
export function check(text, rec = {}) {
  const t = truth[rec.task ?? rec.id]; const fails = []; const s = sections(text);
  const names = s.map((x) => x.name);
  if (HEADS.some((h, i) => names[i] !== h) || names.length !== HEADS.length) fails.push('R1 the four sections, in order');
  const must = s.find((x) => x.name === 'must fix')?.body ?? '';
  const cites = [...text.matchAll(/([\w./-]+\.\w+):(\d+)/g)].map((m) => ({ path: m[1], line: Number(m[2]) }));
  const first = /([\w./-]+\.\w+):(\d+)/.exec(must);
  let near = false;
  if (t) {
    const bug = t.start + t.bugIndex;
    if (!first || first[1] !== t.path || Number(first[2]) !== bug) fails.push('R2 the first must-fix item cites the defect\'s line');
    near = Boolean(first && first[1] === t.path && Math.abs(Number(first[2]) - bug) <= 2);
    const weak = cites.filter((c) => { const l = t.lines[c.line - t.start]; return c.path !== t.path || l === undefined || /^[\s{}()[\];]*$/.test(l); });
    if (weak.length) fails.push('R3 every citation is a line the diff adds');
  }
  const verdict = (s.find((x) => x.name === 'verdict')?.body ?? '').replace(/[.*_`]/g, '').trim().toLowerCase();
  if (!['approve', 'request changes', 'comment'].includes(verdict)) fails.push('R4 the verdict is one of the three');
  const summary = s.find((x) => x.name === 'summary')?.body ?? '';
  const sentences = summary.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length;
  if (sentences < 2 || sentences > 3) fails.push('R5 a summary of two or three sentences');
  return { fails, near, citations: cites.length };
}
/** The diff a reviewer is shown: one hunk, every line added. */
export const diffOf = (t) => `diff --git a/${t.path} b/${t.path}\n--- a/${t.path}\n+++ b/${t.path}\n@@ -${t.start},0 +${t.start},${t.lines.length} @@\n${t.lines.map((l) => `+${l}`).join('\n')}\n`;
