// The claims-assessment standard, as code. Written before any arm output existed. Imports nothing from Atelier.
// Decidable rules only: the sections in order, every fact cited to a document in the file, the coverage clause cited,
// every exclusion that could apply addressed, the reserve equal to the invoices, the banned words, no figure the file
// does not give. Whether the clause is the right one, and whether 7.1 really applies, is judgement and is not here.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'));
const HEADS = ['summary', 'facts', 'coverage analysis', 'decision', 'reserve'];
const sections = (text) => {
  const out = []; let cur = null;
  for (const line of text.split('\n')) {
    const h = /^#{1,4}\s+(?:\d+[.)]\s*)?(.+?)\s*:?\s*$/.exec(line) ?? /^\*\*(.+?)\*\*:?\s*$/.exec(line);
    if (h) { cur = { name: h[1].replace(/^\d+[.)]\s*/, '').replace(/[*_]/g, '').trim().toLowerCase(), body: [] }; out.push(cur); } else if (cur) cur.body.push(line);
  }
  return out.map((s) => ({ name: s.name, body: s.body.join('\n').trim() }));
};
const DOCS = ['notice of loss', 'police report', 'incident report', 'invoice 1', 'invoice 2', 'policy'];
const num = (s) => Number(String(s).replace(/,/g, ''));
export function check(text, rec = {}) {
  const id = rec.task ?? rec.id; const c = cases.find((x) => (x.i < 10 ? `e${String(x.i + 1).padStart(2, '0')}` : `t${x.i - 10}`) === id);
  const fails = []; const s = sections(text); const names = s.map((x) => x.name);
  if (names.length !== HEADS.length || HEADS.some((h, i) => names[i] !== h)) fails.push('R1 the five sections, in order');
  const body = (n) => s.find((x) => x.name === n)?.body ?? '';
  // R2 every sentence under Facts carries a citation to a document of the file
  const facts = body('facts').split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  if (!facts.length || facts.some((f) => !/\[[^\]]+\]/.test(f))) fails.push('R2 every fact cites a document in the file');
  const cited = [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].toLowerCase());
  if (cited.some((d) => !DOCS.includes(d))) fails.push('R2b a citation names a document that is not in the file');
  // R3 the coverage conclusion cites a clause, and exclusion 7.1 is addressed on any theft
  if (!/\bclause\s+\d\.\d\b/.test(body('coverage analysis')) || !/\[policy\]/.test(body('coverage analysis'))) fails.push('R3 the coverage conclusion cites the policy clause');
  if (c && /theft/.test(c.how) && !/\b7\.1\b/.test(body('coverage analysis'))) fails.push('R3b exclusion 7.1 is addressed on a theft');
  if (c) {
    if (!new RegExp(`\\bclause ${c.clause.replace('.', '\\.')}\\b`).test(body('coverage analysis'))) fails.push(`R3c the clause the loss falls under (${c.clause})`);
    // R5 the reserve equals the sum of the invoices on a covered claim
    const m = /\b(\d[\d,]*)\s+dollars\b/.exec(body('reserve'));
    if (c.covered && (!m || num(m[1]) !== c.total)) fails.push('R5 the reserve equals the invoices');
    if (!c.covered && /\bThe reserve is\b/.test(body('reserve'))) fails.push('R5b no reserve on a declined claim');
    // R8b every date in the memo is a date of the file
    const dates = text.match(/\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/g) ?? [];
    if (dates.some((d) => d !== c.date && d !== c.reportDate)) fails.push('R8b a date the file does not give');
    // R8c a fact cited to the police or incident report carries that report's date, not another document's
    const reportFacts = facts.filter((f) => /\[(?:police|incident) report\]/.test(f) && /\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/.test(f));
    if (reportFacts.some((f) => !f.includes(c.reportDate))) fails.push('R8c the date cited to the report is the report\'s date');
    // R8 no figure the file does not give
    const given = new Set([String(c.am[0]), String(c.am[1]), String(c.total), ...[c.date, c.reportDate].flatMap((d) => d.match(/\d+/g)), '4.2', '4.5', '4.7', '4.9', '7.1', '7.3', '7.5', '9.1', '250', '7']);
    const figures = (text.replace(/^#{1,4}.*$/gm, '').match(/\b\d[\d,]*(?:\.\d+)?\b/g) ?? []).map((n) => n.replace(/,/g, '').replace(/^(\d+)\.(\d)$/, '$1.$2'));
    const added = figures.filter((n) => !given.has(n) && !given.has(n.replace(/,/g, '')) && !/^[1-9]$/.test(n) && !/^20\d\d$/.test(n));
    if (added.length) fails.push(`R8 figure(s) the file does not give: ${[...new Set(added)].slice(0, 4).join(', ')}`);
  }
  // R7 the banned words
  if (/\b(?:fraud|scam|liar|suspicious)\b/i.test(text)) fails.push('R7 never "fraud", "scam", "liar" or "suspicious"');
  const words = text.replace(/^#{1,4}.*$/gm, '').split(/\s+/).filter(Boolean).length;
  return { fails, words };
}
