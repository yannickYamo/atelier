// atelier/core/loop/carry-over.ts — A FACT OF AN EXAMPLE'S CASE, SAID OF THIS ONE.
//
// The skill is served the author's examples, each with the request it answered, and the method's own worked
// examples. Their facts belong to their case. An answer to "Thanks, that solved it." that says "CORS is fixed"
// took the subject of an example and asserted it of a request that never named it.
//
// THE SIGNAL, IN CODE. A distinctive term (an acronym, an identifier, a host or a header name, an inline code
// span) that the examples hold and the current request and its material do not, in any sentence.
// It never cuts: what it finds is rewritten where it stands to state only what the request gives (./grounding.ts), and
// kept only when code accepts the rewrite; otherwise it stays as written, listed for the person, because a term the
// examples hold can also be the right general knowledge. Its precision is measured (tests/carry-over.test.ts, and the
// labelled study in the CHANGELOG): 7 of 7, under the bound a deletion would need.

import { claimUnitsOf, type Claim } from './claims.js';

/** The distinctive terms of a text, lower-cased: acronyms, identifiers and names with a joiner inside, CamelCase, inline code. */
export function distinctTerms(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/`([^`\n]{2,80})`/g)) out.add(m[1].trim().toLowerCase());
  const bare = text.replace(/`[^`\n]*`/g, ' ');
  for (const m of bare.matchAll(/\b[A-Z][A-Z0-9]{2,}s?\b/g)) out.add(m[0].replace(/s$/, '').toLowerCase());
  // A name with a joiner inside, every part of it two characters or more ("e.g." is no name): a path, a host, a key
  // (`orders_legacy`, `auth.spec.ts`, `localhost:5173`), or a header in capitals (`Access-Control-Allow-Origin`). A plain
  // hyphenated word ("well-known", "follow-up") is a word.
  for (const m of bare.matchAll(/\b[\w]+(?:[_:.\-/][\w]+)+\b/g)) {
    const w = m[0]; const parts = w.split(/[_:.\-/]/);
    if (!/[a-z]/i.test(w) || /^\d/.test(w) || parts.some((x) => x.length < 2)) continue;
    const named = /[_:./]/.test(w) || /\d/.test(w) || parts.every((x) => /^[A-Z]/.test(x));
    if (named) out.add(w.toLowerCase());
  }
  for (const m of bare.matchAll(/\b[a-z]+[A-Z][A-Za-z]+\b/g)) out.add(m[0].toLowerCase());
  return out;
}

const KEY_LINE = /^["']?([^"'\s:]{1,80})["']?\s*:(?:\s|$)/;
const SEPARATOR_ROW = /^\|[\s:|-]*$/;

/**
 * A UNIT THAT IS STRUCTURE, NOT PROSE: a table row, or a block of two or more lines where at least half are a key and
 * its value, a brace or a bracket. One line that opens "Note:" is a sentence with a label; a record has lines. The
 * grounding step never rewrites such a unit (a rewrite is a sentence, and a sentence in its place breaks it), and the
 * keys of such a unit in the examples are the form's own names (`formTerms`).
 */
export function structuredUnit(text: string): boolean {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return false;
  if (lines[0].startsWith('|')) return true;
  if (lines.length < 2) return false;
  const structural = lines.filter((l) => /^[{}[\],]+$/.test(l) || KEY_LINE.test(l)).length;
  return structural * 2 >= lines.length;
}

/** Every key of a JSON value, at any depth; none when the text is not JSON. */
function jsonKeys(text: string): string[] {
  const t = text.trim();
  if (!/^[{[]/.test(t)) return [];
  let v: unknown;
  try { v = JSON.parse(t); } catch { return []; }
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x && typeof x === 'object') { for (const [k, y] of Object.entries(x)) { out.push(k); walk(y); } }
  };
  walk(v);
  return out;
}

/**
 * THE FORM'S OWN NAMES. A term the examples hold as a KEY of a record (`"video_id":` in a JSON assessment,
 * `safety_score:` in a YAML one) or as a column heading of a table is the shape every piece of this kind takes, not a
 * fact of one example's case: a new assessment must carry the same keys, and a request told in prose never says them.
 * Read from where the term stands, so no list of keys is kept anywhere. Only a record counts: a label opening one line
 * of prose ("CORS: the browser blocks it") is that example's own subject, and a term that only stands in a value
 * (`"vid_0012"`) is that example's own fact.
 */
export function formTerms(examples: string): Set<string> {
  const out = new Set<string>();
  const add = (s: string): void => { for (const t of distinctTerms(s)) out.add(t); };
  for (const block of examples.split(/\n\s*\n/)) {
    const keys = jsonKeys(block);
    if (keys.length) { keys.forEach(add); continue; }
    if (!structuredUnit(block)) continue;
    for (const raw of block.split('\n')) { const k = KEY_LINE.exec(raw.trim()); if (k) add(k[1]); }
  }
  // a table's heading row: the row a separator row underlines
  const lines = examples.split('\n');
  lines.forEach((raw, i) => {
    const l = raw.trim();
    if (l.startsWith('|') && !SEPARATOR_ROW.test(l) && SEPARATOR_ROW.test(lines[i + 1]?.trim() ?? '')) for (const cell of l.split('|')) add(cell.trim());
  });
  return out;
}

/**
 * THE SENTENCES OF `text` THAT ASSERT A FACT OF AN EXAMPLE'S CASE: a distinctive term from `examples` that neither
 * the request nor its material (`evidence`) holds. An instruction counts too: "add the production origin to the same
 * CORS list", in reply to "Thanks, that solved it.", carries the example's case as surely as "CORS is fixed" does.
 * MEASURED on 2,135 hand-labelled sentences of fourteen requests answered by six arms (the closure report): 7 of 53
 * unsupported found, 7 of the 15 carried from an example, no false flag in 2,082 sound sentences (precision 7/7, whose
 * 95% lower bound, .65, is under the .9 a cut needs). So it never cuts: what it finds is rewritten where code accepts the
 * rewrite (./grounding.ts), and listed otherwise. In the claim check's shape.
 */
export function carryOverClaims(text: string, examples: string, evidence: string): Claim[] {
  if (!examples.trim()) return [];
  const theirs = distinctTerms(examples);
  for (const t of formTerms(examples)) theirs.delete(t);
  if (!theirs.size) return [];
  // the request names a term when it holds it as a word of its own, not inside a longer one
  const known = new Set([...distinctTerms(evidence), ...(evidence.toLowerCase().match(/[\w][\w:./-]*[\w]|\w/g) ?? [])]);
  // A STRUCTURED SPAN THE REQUEST NAMES BY ITS HEAD. `Authorization: Bearer ${token}`, `git clean -fdx`: inline code with
  // a space, a colon or a call in it is the thing its first word names, and a request that names that word ("the request
  // has no Authorization header") gave it. A bare term (`CORS`, `orders_legacy`) is known only as itself.
  // Only when the rest of the span names nothing of its own: `SELECT * FROM orders_legacy` is not given by "select", since
  // `orders_legacy` is a term the request never names.
  const head = (w: string): string | null => (/[\s:(=]/.test(w) ? /^[a-z][\w-]*/i.exec(w)?.[0].toLowerCase() ?? null : null);
  const named = (w: string): boolean => {
    if (known.has(w)) return true;
    const h = head(w);
    return h !== null && known.has(h) && [...distinctTerms(w.slice(h.length))].every((t) => known.has(t));
  };
  const out: Claim[] = [];
  for (const u of claimUnitsOf(text)) {
    // the unit as written: the claim reader sees inline code blanked, and a borrowed `Authorization` header is in it
    const t = text.slice(u.start, u.end).trim();
    if (!t) continue;
    const borrowed = [...distinctTerms(t)].filter((w) => theirs.has(w) && !named(w));
    if (!borrowed.length) continue;
    out.push({ start: u.start, end: u.end, text: t, kind: 'FIGURE',
      why: `states ${borrowed.slice(0, 3).join(', ')} of your case, which your request does not name; it comes from an example's case: check it, or say it as an assumption` });
  }
  return out;
}
