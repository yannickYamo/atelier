// The competitive-analysis standard, as code. Written before any arm output existed. Imports nothing from Atelier.
import { sheets, costOf } from './cases.mjs';

const sections = (text) => {
  const out = []; let cur = { name: '', body: [] };
  for (const line of text.split('\n')) {
    const h = /^#{1,4}\s+(.+?)\s*:?\s*$/.exec(line);
    if (h) { cur = { name: h[1].replace(/[*_]/g, '').trim().toLowerCase(), body: [] }; out.push(cur); } else cur.body.push(line);
  }
  return out.map((s) => ({ name: s.name, body: s.body.join('\n').trim() }));
};
const num = (n) => new RegExp(`(?<![\\d.,])${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',?')}(?![\\d])`);
export function check(text, rec = {}) {
  const t = sheets.find((s) => s.id === (rec.task ?? rec.id)); const fails = []; const s = sections(text); const names = s.map((x) => x.name);
  const body = (n) => s.find((x) => x.name === n)?.body ?? '';
  if (names[0] !== 'verdict' || names[names.length - 1] !== 'risks' || !names.includes('cost at this size')) fails.push('R1 a Verdict first, a Cost at this size section, Risks last');
  const rows = text.split('\n').filter((l) => l.trim().startsWith('|')).map((l) => l.split('|').map((c) => c.trim().toLowerCase()));
  const header = rows.find((r) => r.includes('vendor') && r.includes('price per seat') && r.includes('minimum seats'));
  if (t) {
    if (!header || !t.vendors.every((v) => rows.some((r) => r.some((c) => c.replace(/[*_]/g, '') === v.name.toLowerCase())))) fails.push('R2 a table with the three columns and a row for every vendor');
    const cheapest = [...t.vendors].sort((a, b) => costOf(a, t.team) - costOf(b, t.team))[0];
    const others = t.vendors.filter((v) => v !== cheapest);
    const verdict = body('verdict'); const first = verdict.split(/(?<=[.!?])\s+/)[0] ?? '';
    if (!first.includes(cheapest.name) || others.some((v) => first.includes(v.name) && first.indexOf(v.name) < first.indexOf(cheapest.name))) fails.push('R3 the verdict names the vendor that costs least');
    if (!t.vendors.every((v) => num(costOf(v, t.team)).test(body('cost at this size')))) fails.push('R4 each vendor\'s monthly cost for the team, worked right');
  } else if (!header) fails.push('R2 a table with the three columns and a row for every vendor');
  const words = text.split('\n').filter((l) => !l.trim().startsWith('|') && !/^#{1,4}\s/.test(l)).join(' ').split(/\s+/).filter(Boolean).length;
  if (words >= 320) fails.push('R6 under 320 words');
  return { fails, words };
}
