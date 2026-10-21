// The brand-suitability labelling standard, as code. Written before any arm output existed. Imports nothing from Atelier.
// Decidable rules of the policy on the label itself (JSON shape, taxonomy, spans, exclusion, evidence verbatim, overall
// risk), and the label against the gold label of the clip (categories, risks, spans) for the precision and recall measure.
// Whether "High" is earned by an explicit depiction is judgement in the policy; here it is read against the gold label.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'));
const TAXONOMY = readFileSync(join(HERE, 'taxonomy.txt'), 'utf8').split('\n').slice(1).filter(Boolean);
const RISK = ['Floor', 'Low', 'Medium', 'High'];
const secs = (t) => { const m = /^(\d{2}):(\d{2})$/.exec(t ?? ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const span = (s) => { const m = /^(\d{2}:\d{2})[–-](\d{2}:\d{2})$/.exec(s ?? ''); return m ? [secs(m[1]), secs(m[2])] : null; };
export function check(text, rec = {}) {
  const id = rec.task ?? rec.id; const c = cases.find((x) => x.id2 === id);
  const fails = [];
  let j;
  try { j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { return { fails: ['R19 the label is JSON'], words: 0 }; }
  if (!j || typeof j !== 'object' || ['clip', 'duration', 'overall', 'categories'].some((k) => !(k in j)) || Object.keys(j).some((k) => !['clip', 'duration', 'overall', 'categories'].includes(k))) fails.push('R19 the label has the keys clip, duration, overall, categories and nothing else');
  const cats = Array.isArray(j.categories) ? j.categories : [];
  const names = cats.map((x) => x?.category);
  if (names.some((n) => !TAXONOMY.includes(n))) fails.push(`R1 a category outside the taxonomy: ${names.filter((n) => !TAXONOMY.includes(n)).slice(0, 3).join('; ')}`);
  const dur = secs(j.duration) ?? (c ? c.duration : null);
  for (const x of cats) {
    if (x?.category === 'Floor – all brands') { if (x.span !== null && x.span !== undefined) fails.push('R6 Floor carries no timecode'); continue; }
    const sp = span(x?.span);
    if (!sp) { fails.push('R2 every flagged category carries a timecode span'); continue; }
    if (sp[1] <= sp[0] || (dur !== null && sp[1] > dur)) fails.push('R12 a span ends after it starts and inside the duration');
    if (!['Low', 'Medium', 'High'].includes(x?.risk)) fails.push('R3 every flagged category carries a risk level');
    if (typeof x?.evidence !== 'string' || !x.evidence.trim()) fails.push('R7 every flagged category carries evidence');
    else if (c && c.transcript && !c.transcript.includes(x.evidence)) fails.push('R17 evidence is copied from the transcript');
  }
  if (names.some((n) => /^Firearms/.test(n)) && names.includes('Floor – all brands')) fails.push('R5 Firearms never with Floor');
  if (!cats.length) fails.push('R6 a clip with nothing flagged is Floor – all brands');
  const top = RISK[Math.max(0, ...cats.map((x) => RISK.indexOf(x?.risk)))];
  if (cats.length && j.overall !== top) fails.push('R11 overall is the highest risk flagged');
  const seen = new Set(); if (names.some((n) => seen.size === seen.add(n).size)) fails.push('R18 a category is listed once');
  // against the gold label: categories missed and added, and a risk level that differs
  let gold = null;
  if (c) {
    const want = new Map((c.labels.length ? c.labels : [{ category: 'Floor – all brands', risk: 'Floor' }]).map((l) => [l.category, l]));
    const got = new Map(cats.map((x) => [x?.category, x]));
    const missed = [...want.keys()].filter((k) => !got.has(k)); const added = [...got.keys()].filter((k) => !want.has(k));
    const riskOff = [...want].filter(([k, l]) => got.has(k) && got.get(k).risk !== l.risk).map(([k]) => k);
    gold = { missed, added, riskOff, exact: !missed.length && !added.length && !riskOff.length };
    // High on a category the gold label does not carry at High is High without the depiction the policy requires
    if ([...got].some(([k, x]) => x?.risk === 'High' && want.get(k)?.risk !== 'High')) fails.push('R4 High without an explicit depiction');
  }
  return { fails, words: cats.length, gold };
}
