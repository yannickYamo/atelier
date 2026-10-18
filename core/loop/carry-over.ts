// atelier/core/loop/carry-over.ts — A FACT OF AN EXAMPLE'S CASE, SAID OF THIS ONE.
//
// The skill is served the author's examples, each with the request it answered, and the method's own worked
// examples. Their facts belong to their case. An answer to "Thanks, that solved it." that says "CORS is fixed"
// took the subject of an example and asserted it of a request that never named it.
//
// THE SIGNAL, IN CODE. A distinctive term (an acronym, an identifier, a host or a header name, an inline code
// span) that the examples hold and the current request and its material do not, in any sentence.
// It is a signal, never a cut: what it finds is listed for the person in the run's evaluation, because a term the
// examples hold can also be the right general knowledge.
// Its precision is measured (tests/carry-over.test.ts, and the labelled study in the closure report) before it
// may ever do more than list.

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

/**
 * THE SENTENCES OF `text` THAT ASSERT A FACT OF AN EXAMPLE'S CASE: a distinctive term from `examples` that neither
 * the request nor its material (`evidence`) holds. An instruction counts too: "add the production origin to the same
 * CORS list", in reply to "Thanks, that solved it.", carries the example's case as surely as "CORS is fixed" does.
 * MEASURED on 2,135 hand-labelled sentences of fourteen requests answered by six arms (the closure report): 7 of 53
 * unsupported found, 7 of the 15 carried from an example, no false flag in 2,082 sound sentences (precision 7/7, whose
 * 95% lower bound, .65, is under the .9 a cut needs). So it lists. In the claim check's shape.
 */
export function carryOverClaims(text: string, examples: string, evidence: string): Claim[] {
  if (!examples.trim()) return [];
  const theirs = distinctTerms(examples);
  if (!theirs.size) return [];
  // the request names a term when it holds it as a word of its own, not inside a longer one
  const known = new Set([...distinctTerms(evidence), ...(evidence.toLowerCase().match(/[\w][\w:./-]*[\w]|\w/g) ?? [])]);
  const out: Claim[] = [];
  for (const u of claimUnitsOf(text)) {
    // the unit as written: the claim reader sees inline code blanked, and a borrowed `Authorization` header is in it
    const t = text.slice(u.start, u.end).trim();
    if (!t) continue;
    const borrowed = [...distinctTerms(t)].filter((w) => theirs.has(w) && !known.has(w));
    if (!borrowed.length) continue;
    out.push({ start: u.start, end: u.end, text: t, kind: 'FIGURE',
      why: `states ${borrowed.slice(0, 3).join(', ')} of your case, which your request does not name; it comes from an example's case: check it, or say it as an assumption` });
  }
  return out;
}
