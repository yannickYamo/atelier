// core/observers/obligations.ts — WHAT A PIECE OF WORK MUST CONTAIN, AND WHAT IT MUST HAVE BEEN MADE FROM.
//
// A method says what is done: which table is always there, that every figure comes from a source. Two of those can be
// read by code, and are here. Neither reads how the text sounds.
//
//   TABLE   a table with these columns is in the output                      read on the OUTPUT alone
//   CITED   every figure in the output is in the request or the material     read against the BOUND MATERIAL
//
// What a check reads decides what it can honestly say. A check on the output says the deliverable has the thing.
// A check against the material says the work was made from what was given. Neither says a step was carried out in
// the writer's head ("weigh switching cost before recommending"): that is judgement, and no observer here claims it.

import type { Measurement } from '../state/canonical-state.js';
import type { Observer, ObserverResult, Span, CheckContext } from './registry.js';

const list = (p: Measurement['params'], k: string): readonly string[] => { const v = p[k]; return Array.isArray(v) && v.every((x): x is string => typeof x === 'string') ? v : []; };
const num = (p: Measurement['params'], k: string): number | null => (typeof p[k] === 'number' ? p[k] : null);
const norm = (s: string): string => s.toLowerCase().replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

export interface MarkdownTable { readonly header: readonly string[]; readonly rows: number; readonly start: number; readonly end: number }

/** Every pipe table in a text, outside code fences: its header cells, how many body rows, and where it is. */
export function tablesOf(text: string): MarkdownTable[] {
  const out: MarkdownTable[] = []; const lines = text.split('\n');
  let offset = 0; const starts = lines.map((l) => { const s = offset; offset += l.length + 1; return s; });
  let fence = false;
  const cells = (l: string): string[] => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => norm(c));
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence || !lines[i].includes('|') || i + 1 >= lines.length) continue;
    // A header row is a row of cells directly above a row of dashes.
    if (!/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) continue;
    let j = i + 2; while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') j++;
    out.push({ header: cells(lines[i]), rows: j - i - 2, start: starts[i], end: starts[j - 1] + lines[j - 1].length });
    i = j - 1;
  }
  return out;
}

/** A table whose header holds every one of these columns (a header cell that contains the name counts), with at least `minRows` rows. */
export const TABLE: Observer = {
  id: 'TABLE',
  describe: (p) => `a table with the column${list(p, 'columns').length === 1 ? '' : 's'} ${list(p, 'columns').map((c) => `"${c}"`).join(', ')}${num(p, 'minRows') ? `, at least ${num(p, 'minRows')} row(s)` : ''}`,
  validate: (p) => (list(p, 'columns').length ? null : 'needs columns=<name>|<name>'),
  observe(text, p): ObserverResult {
    const want = list(p, 'columns').map(norm); const minRows = num(p, 'minRows') ?? 1;
    const tables = tablesOf(text);
    const has = (t: MarkdownTable): string[] => want.filter((w) => !t.header.some((h) => h.includes(w)));
    const hit = tables.find((t) => has(t).length === 0 && t.rows >= minRows);
    if (hit) return { verdict: 'MET', spans: [], value: hit.rows, detail: `a table with ${want.length} of ${want.length} column(s), ${hit.rows} row(s)` };
    // The nearest table says what is missing; with none, the last line of the text is where one would go.
    const nearest = [...tables].sort((a, b) => has(a).length - has(b).length)[0];
    const why = !nearest ? `no table; one with the column(s) ${want.map((w) => `"${w}"`).join(', ')} is required`
      : has(nearest).length ? `the table lacks the column(s) ${has(nearest).map((w) => `"${w}"`).join(', ')}` : `the table has ${nearest.rows} row(s), and ${minRows} are required`;
    const span: Span = nearest ? { start: nearest.start, end: nearest.end, text: text.slice(nearest.start, Math.min(nearest.end, nearest.start + 120)), why }
      : { start: Math.max(0, text.length - 1), end: text.length, text: '', why };
    return { verdict: 'VIOLATED', spans: [span], value: 0, detail: why };
  },
};

const FIGURE = /(?<![\w.,])(?:[$€£]\s?)?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|percent|bps|[kmb]n?\b|million\b|billion\b|thousand\b|x\b))?/gi;
/** A figure as it is compared: digits only, with its sign of scale. "$12,400" and "12400" are one figure. */
const figureKey = (raw: string): string => raw.toLowerCase().replace(/[$€£,\s]/g, '').replace(/percent/, '%').replace(/million|mn?\b/, 'm').replace(/billion|bn?\b/, 'b').replace(/thousand/, 'k');
/** The digits alone: a figure in the output is also supported when the material has the same number under another unit sign. */
const bare = (key: string): string => key.replace(/[^\d.]/g, '');

/** The figures a text states: numbers that carry a unit or are two digits or more. A bare single digit is a count in a sentence, not a figure. */
export function figuresOf(text: string): { key: string; raw: string; start: number; end: number }[] {
  const out: { key: string; raw: string; start: number; end: number }[] = [];
  // Not inside code, and not a list marker or a heading number.
  const prose = text.replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length)).replace(/^\s*\d+[.)]\s/gm, (m) => ' '.repeat(m.length));
  for (const m of prose.matchAll(FIGURE)) {
    const raw = m[0].trim(); const key = figureKey(raw);
    if (bare(key).replace('.', '').length < 2 && !/[%$€£kmbx]/.test(key)) continue;
    out.push({ key, raw, start: m.index + (m[0].length - m[0].trimStart().length), end: m.index + m[0].length });
  }
  return out;
}

/**
 * EVERY FIGURE IS ONE THE WRITER WAS GIVEN. A figure in the output must be in the request or in the bound material,
 * as the same number. `allow` figures may be the writer's own (a count of the points it makes). Read against the
 * material by name, so the detail says where nothing was found; with no material in the context the rule cannot be
 * read, and says so.
 */
export const CITED: Observer = {
  id: 'CITED',
  describe: (p) => `every figure is in the request or the material${num(p, 'allow') ? ` (up to ${num(p, 'allow')} of the writer's own)` : ''}`,
  validate: (p) => (num(p, 'allow') === null || (num(p, 'allow') ?? 0) >= 0 ? null : 'allow is a count, zero or more'),
  observe(text, p, context?: CheckContext): ObserverResult {
    const material = context?.material ?? [];
    if (!material.length) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'no material was bound, so there is nothing to read the figures against' };
    const given = new Set<string>(); const givenBare = new Set<string>();
    for (const source of [context?.request ?? '', ...material.map((m) => m.text)]) for (const f of figuresOf(source)) { given.add(f.key); givenBare.add(bare(f.key)); }
    const stated = figuresOf(text);
    const missing = stated.filter((f) => !given.has(f.key) && !givenBare.has(bare(f.key)));
    const allow = num(p, 'allow') ?? 0;
    const detail = `${stated.length - missing.length} of ${stated.length} figure(s) are in the request or the material (${material.map((m) => m.name).join(', ')})`;
    if (missing.length <= allow) return { verdict: 'MET', spans: [], value: missing.length, detail };
    return { verdict: 'VIOLATED', value: missing.length, detail,
      spans: missing.map((f) => ({ start: f.start, end: f.end, text: f.raw, why: `the figure ${f.raw} is in neither the request nor the material` })) };
  },
};

/** What each check reads: the output alone, or the output against what it was made from. */
export type ObligationTarget = 'OUTPUT' | 'BOUND_MATERIAL';
export const targetOf = (observer: string): ObligationTarget => (observer === 'CITED' ? 'BOUND_MATERIAL' : 'OUTPUT');
