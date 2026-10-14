// The confidentiality-agreement standard, as code. Written before any arm output existed. Imports nothing from Atelier.
import { sheets } from './cases.mjs';

const HEADS = ['parties', 'confidential information', 'obligations', 'term', 'governing law'];
const sections = (text) => {
  const out = []; let cur = null;
  for (const line of text.split('\n')) {
    const bold = /^\*\*(.+?)\*\*:?\s*$/.exec(line); const caps = /^(?:\d+[.)]\s*)?([A-Z][A-Z &]{3,40})[.:]?\s*$/.exec(line.trim());
    const h = /^#{1,4}\s+(?:\d+[.)]\s*)?(.+?)\s*:?\s*$/.exec(line) ?? (bold && HEADS.includes(bold[1].replace(/^\d+[.)]\s*/, '').trim().toLowerCase()) ? bold : null) ?? (caps && HEADS.includes(caps[1].trim().toLowerCase()) ? caps : null);
    if (h) { cur = { name: h[1].replace(/^\d+[.)]\s*/, '').replace(/[*_]/g, '').trim().toLowerCase(), body: [] }; out.push(cur); } else if (cur) cur.body.push(line);
  }
  return out.map((s) => ({ name: s.name, body: s.body.join('\n').trim() }));
};
export function check(text, rec = {}) {
  const t = sheets.find((s) => s.id === (rec.task ?? rec.id)); const fails = []; const s = sections(text); const names = s.map((x) => x.name);
  if (HEADS.some((h, i) => names[i] !== h) || names.length !== HEADS.length) fails.push('R1 the five sections, in order');
  const body = (n) => s.find((x) => x.name === n)?.body ?? '';
  if (t) {
    if (!body('parties').includes(t.a) || !body('parties').includes(t.b)) fails.push('R2 both parties named as the term sheet names them');
    if (!new RegExp(`\\b${t.months}\\s+months\\b`).test(body('term'))) fails.push('R3 the term in months, from the term sheet');
    if (!body('governing law').includes(t.law)) fails.push('R4 the governing law the term sheet names');
    // every figure in the text is one the term sheet gives (its term, or a number in its date)
    const given = new Set([String(t.months), ...t.date.match(/\d+/g)]);
    const added = (text.replace(/^#{1,4}.*$/gm, '').match(/\b\d+(?:[.,]\d+)?\b/g) ?? []).filter((n) => !given.has(n) && !/^[1-9]$/.test(n));
    if (added.length) fails.push('R6 no figure the term sheet does not give');
  }
  if (/\bbest efforts\b/i.test(text)) fails.push('R5 never "best efforts"');
  const words = text.replace(/^#{1,4}.*$/gm, '').split(/\s+/).filter(Boolean).length;
  if (words < 220 || words > 420) fails.push('R7 between 220 and 420 words');
  return { fails, words };
}
