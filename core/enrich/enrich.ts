// atelier/core/enrich/enrich.ts — A BOUNDED WEB PASS FOR FACTS, NEVER FOR VOICE.
//
// A small reading proposes 3 to 5 searches that would bring facts this request needs and the material does not give
// (a figure, a date, a named constraint, what a named thing is). Code runs them through the `Enricher`, fetches the
// top results, and returns their text capped in size. Nothing found here is a rule or an example: it is a source a
// specific may be traced to, and the record says it was enriched and from where.
//
// With no model, the floor asks no searches: nothing is enriched, and the run is what it was without this step.

import type { Budget, InferenceClient } from '../inference/client.js';
import { spend, metered } from '../inference/client.js';
import { readContext, type Decision, type Reading } from '../inference/reading.js';
import type { Enricher, EnrichedDoc } from './enricher.js';
export type { Enricher, EnrichedDoc, SearchHit, FetchedPage } from './enricher.js';
export { NullEnricher, fetchPage, htmlToText } from './enricher.js';

export interface QueryInput { readonly request: string; readonly material: string }

const QUERY_SYSTEM = `You plan a short web search for a writer. You are given what they were asked to write and the material they supplied.

Propose 3 to 5 search queries whose results would give FACTS this piece needs and the material does not already give: figures, dates, named constraints, what a named product, law, standard or event is, a concrete case. Each query is a plain search phrase of 3 to 12 words about the piece's own subject.

Never search for how to write it: no style, tone, voice, templates, examples of posts, tips or structure. Never search for the person themselves. If the material already gives every fact the piece needs, return an empty list.`;

const QUERY_SCHEMA = { type: 'object', additionalProperties: false, required: ['queries'],
  properties: { queries: { type: 'array', maxItems: 5, items: { type: 'string' } } } };

const MAX_PROMPT_MATERIAL = 12_000;

/** The search-planning reading. Grounding is shape only: queries are plain phrases, deduplicated, at most five. */
export const ENRICH_QUERIES: Reading<QueryInput, string[]> = {
  id: 'enrich-queries', version: '1', system: QUERY_SYSTEM, schema: QUERY_SCHEMA,
  toolName: 'emit_queries', toolDescription: 'Return the search queries.', maxTokens: 400, estimateUsd: 0.005,
  prompt: (i) => `<request>\n${i.request.trim()}\n</request>\n\n<material>\n${i.material.trim().slice(0, MAX_PROMPT_MATERIAL) || '(none)'}\n</material>`,
  // nothing asked of the run: nothing to search for
  decide: (i) => (i.request.trim() ? null : []),
  ground: (raw) => {
    const q = (raw as { queries?: unknown } | null)?.queries;
    if (!Array.isArray(q)) return null;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of q) {
      if (typeof x !== 'string') continue;
      const t = x.replace(/\s+/g, ' ').trim();
      const words = t.split(' ').length;
      if (!t || t.length > 200 || words > 20 || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase()); out.push(t);
    }
    return out.slice(0, 5);
  },
  floor: () => [],
};

export interface EnrichOptions {
  /** the reader model's name, for the record; the client is what is called */
  readonly model?: string | null;
  /** results fetched per query (default 2) */
  readonly perQuery?: number;
  /** documents kept in all (default 8) */
  readonly maxDocs?: number;
  /** characters kept of one document (default 6,000) */
  readonly maxDocChars?: number;
  /** characters kept over all documents (default 30,000) */
  readonly maxTotalChars?: number;
  /** the clock, for `retrievedAt` */
  readonly now?: () => string;
}

export interface EnrichRecord {
  readonly docs: EnrichedDoc[];
  /** the queries and who decided them */
  readonly queries: Decision<string[]>;
  /** the enricher's name */
  readonly via: string;
  /** what could not be done, said plainly: a search that failed, a page that did not load */
  readonly notes: string[];
}

/** The pass with its whole record: the queries, who decided them, what was fetched and what failed. */
export async function enrichWithRecord(request: string, material: string, enricher: Enricher, client: InferenceClient | null, budget: Budget, opts: EnrichOptions = {}): Promise<EnrichRecord> {
  const perQuery = opts.perQuery ?? 2;
  const maxDocs = opts.maxDocs ?? 8;
  const maxDocChars = opts.maxDocChars ?? 6_000;
  const maxTotal = opts.maxTotalChars ?? 30_000;
  const now = opts.now ?? ((): string => new Date().toISOString());
  const notes: string[] = [];
  const queries = await readContext(ENRICH_QUERIES, { request, material }, client, client ? (opts.model ?? 'default') : null, budget);
  const docs: EnrichedDoc[] = [];
  if (!queries.value.length) return { docs, queries, via: enricher.name, notes };
  const urls: { url: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const q of queries.value) {
    let hits;
    try {
      hits = await spend(budget, enricher.searchEstimateUsd ?? 0, async () => ({ value: await enricher.search(q), cost: metered(enricher.searchEstimateUsd ?? 0) }));
    } catch (e) {
      notes.push(`the search "${q}" could not run: ${(e as Error).message.split('\n')[0]}`);
      continue;
    }
    for (const h of hits.slice(0, perQuery)) {
      const key = h.url.replace(/#.*$/, '').replace(/\/+$/, '');
      if (!seen.has(key)) { seen.add(key); urls.push({ url: h.url, title: h.title }); }
    }
  }
  let total = 0;
  for (const u of urls) {
    if (docs.length >= maxDocs || total >= maxTotal) break;
    const page = await enricher.fetch(u.url).catch(() => null);
    if (!page?.text.trim()) { notes.push(`${u.url} could not be read`); continue; }
    const text = page.text.slice(0, Math.min(maxDocChars, maxTotal - total));
    total += text.length;
    docs.push({ url: page.url || u.url, title: page.title || u.title || u.url, text, retrievedAt: now() });
  }
  return { docs, queries, via: enricher.name, notes };
}

/** The enriched documents for a request: 3 to 5 searches a reading proposes, their top results fetched and capped. */
export async function enrich(request: string, material: string, enricher: Enricher, client: InferenceClient | null, budget: Budget, opts: EnrichOptions = {}): Promise<EnrichedDoc[]> {
  return (await enrichWithRecord(request, material, enricher, client, budget, opts)).docs;
}
