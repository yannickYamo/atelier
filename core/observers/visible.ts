// atelier/core/observers/visible.ts — A PAGE OF MARKUP, READ AS WHAT ITS READER SEES.
//
// A measure of prose run on an HTML page measures the markup. Twelve explainers written as single HTML pages
// were read that way: the semicolons of their CSS became "use semicolons within my range: 15.7 to 54.2 per 1,000
// words", the `!` of `<!doctype html>` became a rule about exclamation marks, and four `<h2>` headings a page
// became "write without section headings", because only `#` was a heading. A skill built from that was told to
// add semicolons and to drop its headings.
//
// So a document that is markup is reduced to its visible text before anything measures it, here, underneath every
// reader of text (./text.ts, ./structure.ts, ./features.ts). The reduction keeps the length of the text and the
// place of every visible character: what is not seen becomes spaces, a heading tag becomes a markdown heading in
// the room its tag took, the end of a block becomes a blank line. Every offset a check reports is therefore still
// an offset into the page as written, which is what a repair rewrites. The page itself is never changed: an
// author who writes HTML is served HTML, and writes HTML.
//
// Decided from the content, never from a file's name: examples arrive as `.md` with front matter.

const BOM = String.fromCharCode(0xfeff);
const FRONT = String.raw`(?:${BOM}?---\r?\n[\s\S]*?\r?\n---\r?\n)?`;
const DECLARED = new RegExp(String.raw`^${FRONT}\s*(?:<!doctype\s+html|<html[\s>])`, 'i');
const OPENS_WITH_TAG = new RegExp(String.raw`^${FRONT}\s*<[a-z!]`, 'i');
const BLOCK = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'div', 'section', 'article', 'ul', 'ol', 'blockquote', 'header', 'footer', 'main', 'figure', 'figcaption', 'details', 'summary', 'nav', 'aside', 'dl', 'dt', 'dd']);
/** What is never read, tag to closing tag: code, drawings, what a browser does not show, and tables, which are not prose in markdown either. */
const UNSEEN = new Set(['head', 'script', 'style', 'svg', 'pre', 'noscript', 'template', 'table']);
const CLOSES_A_BLOCK = /<\/(?:p|h[1-6]|li|div|section|article|blockquote)\s*>/gi;

/**
 * Is this document markup? A declared HTML page; or a fragment that opens with a tag, closes three blocks or more,
 * and is not markdown (no `#` heading, no fenced code): a README that opens with a centred `<div>` is markdown, and
 * so is an essay about tags.
 */
export function isMarkup(text: string): boolean {
  if (DECLARED.test(text)) return true;
  if (!OPENS_WITH_TAG.test(text) || /^(?:#{1,6}\s|```|~~~)/m.test(text)) return false;
  return (text.match(CLOSES_A_BLOCK) ?? []).length >= 3;
}

const spaces = (n: number): string => ' '.repeat(Math.max(0, n));
/** `s` at the start of a room of `n` characters: cut to it, or padded with spaces. */
const fit = (s: string, n: number): string => (s.length >= n ? s.slice(0, n) : s + spaces(n - s.length));
/** `s` at the end of a room of `n` characters, so that what it marks follows it directly. */
const fitEnd = (s: string, n: number): string => (s.length >= n ? s.slice(0, n) : spaces(n - s.length) + s);
const ENTITY: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', mdash: '—', ndash: '–', hellip: '…',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

/** Where the tag that opens at `at` ends (after its `>`), a `>` inside a quoted attribute not counted; -1 with no end. */
function tagEnd(text: string, at: number): number {
  let quote = '';
  for (let j = at + 1; j < text.length; j += 1) {
    const c = text[j];
    if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === '\'') quote = c;
    else if (c === '>') return j + 1;
    else if (c === '<') return -1;
  }
  return -1;
}

/** How far the whitespace after `from` runs: a marker for a heading or a list item sits at its end, on the line of its words. */
const afterSpace = (text: string, from: number): number => { let j = from; while (j < text.length && /\s/.test(text[j])) j += 1; return j; };

/** What stands in the room of an entity: the character it names, or nothing for one this does not know. */
function entityAt(text: string, at: number): { end: number; out: string } | null {
  const m = /^&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,30});/i.exec(text.slice(at, at + 40));
  if (!m) return null;
  const name = m[1].toLowerCase();
  const code = name.startsWith('#x') ? parseInt(name.slice(2), 16) : name.startsWith('#') ? Number(name.slice(1)) : NaN;
  const char = Number.isNaN(code) ? ENTITY[name] ?? '' : code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  return { end: at + m[0].length, out: fit(char, m[0].length) };
}

/**
 * ONE PASS OVER THE PAGE, each piece of markup replaced in the room it took. Linear in the length of the page:
 * every tag is looked at once, and an opener with no closer runs to the end of the page.
 */
function reduce(text: string): string {
  const low = text.toLowerCase(); const out: string[] = []; let i = 0; let heading = false;
  const blankTo = (end: number): void => { out.push(text.slice(i, end).replace(/[^\n]/g, ' ')); i = end; };
  const put = (s: string, end: number): void => { out.push(s); i = end; };
  while (i < text.length) {
    const c = text[i];
    if (c === '&') { const e = entityAt(text, i); if (e) put(e.out, e.end); else put(c, i + 1); continue; }
    if (c !== '<') { put(heading && c === '\n' ? ' ' : c, i + 1); continue; }
    if (low.startsWith('<!--', i)) { const end = low.indexOf('-->', i + 4); blankTo(end === -1 ? text.length : end + 3); continue; }
    const name = /^<\/?([a-z][a-z0-9]*)/.exec(low.slice(i, i + 24))?.[1] ?? (low.startsWith('<!', i) ? '!' : '');
    const end = name ? tagEnd(text, i) : -1;
    if (end === -1) { put(c, i + 1); continue; }
    const closing = text[i + 1] === '/'; const room = end - i;
    if (name === '!') blankTo(end);
    else if (!closing && UNSEEN.has(name)) { const close = low.indexOf(`</${name}`, end); const to = close === -1 ? -1 : tagEnd(text, close); blankTo(to === -1 ? text.length : to); }
    // A heading is a markdown heading on the line of its words: `<h1>` the title, every other level a section.
    else if (!closing && /^h[1-6]$/.test(name)) { const to = afterSpace(text, end); put(fitEnd(name === 'h1' ? '\n# ' : '\n## ', to - i), to); heading = true; }
    else if (!closing && name === 'li') { const to = afterSpace(text, end); put(fitEnd('\n- ', to - i), to); }
    // Inline code is not prose: the same backticks ./text.ts already sets aside.
    else if (name === 'code') put(closing ? fitEnd('`', room) : fit('`', room), end);
    else if (name === 'br') put(fit('\n', room), end);
    else if (name === 'hr' || (closing && BLOCK.has(name))) { put(fit('\n\n', room), end); heading = false; }
    else if (BLOCK.has(name)) put(fit('\n', room), end);
    else blankTo(end);
  }
  return out.join('');
}

// Every reader of a text asks for the same reduction of it, many times in one check, over a corpus of pieces.
const seen = new Map<string, string>();
const KEPT = 64;

/** The text as its reader sees it, at the same length and the same offsets; any text that is not markup, as it is. */
export function visible(text: string): string {
  if (!text.includes('<') || !isMarkup(text)) return text;
  const hit = seen.get(text);
  if (hit !== undefined) { seen.delete(text); seen.set(text, hit); return hit; }
  const out = reduce(text);
  const oldest = seen.size >= KEPT ? seen.keys().next().value : undefined;
  if (oldest !== undefined) seen.delete(oldest);
  seen.set(text, out);
  return out;
}
