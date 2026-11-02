// atelier/providers/anthropic-search.ts — AN ENRICHER OVER THE MESSAGES API'S SERVER-SIDE WEB SEARCH TOOL.
//
// Outside core/ because it knows a vendor (./anthropic.ts says why). It is not an InferenceClient: that interface
// forces one tool call whose input is the answer, and a server tool is run by the provider, not answered by the model,
// so this is a small call of its own. The search result's own text comes back encrypted; what can be read is each
// result's URL and title, and the passages the model cited from them. The page itself is then fetched over plain HTTP
// (core/enrich/enricher.ts, `fetchPage`), so what a specific is traced to is the page as published.
//
// The key is read when a search is made, never at import: building the enricher costs and reads nothing.

import Anthropic from '@anthropic-ai/sdk';
import type { Enricher, FetchedPage, SearchHit } from '../core/enrich/enricher.js';
import { fetchPage } from '../core/enrich/enricher.js';

/** The part of the SDK client this uses: one `messages.create`. A test passes its own. */
export interface MessagesLike {
  readonly messages: { create(body: Record<string, unknown>): Promise<unknown> };
}

export interface AnthropicSearchOptions {
  /** the model that runs the search; `ATELIER_CLAIMS_MODEL`, else the small default */
  readonly model?: string;
  /** the tool version; the basic one is what the small models take */
  readonly toolType?: string;
  /** results kept per query */
  readonly maxResults?: number;
  /** a client to use instead of one built from the environment at search time */
  readonly client?: MessagesLike;
  /** the fetch used for pages; the global one unless a test passes its own */
  readonly fetchImpl?: typeof fetch;
}

/** One search held against the budget: the per-search fee plus a small model's tokens, rounded up. */
export const SEARCH_ESTIMATE_USD = 0.02;

interface Block { type?: string; content?: unknown; text?: string; citations?: { type?: string; url?: string; cited_text?: string }[] }

/** The hits a response carries: every web search result (URL, title), with the passages the model cited from it. */
export function hitsOf(response: unknown, max = 5): SearchHit[] {
  const blocks = ((response as { content?: unknown } | null)?.content ?? []) as Block[];
  if (!Array.isArray(blocks)) return [];
  const cited = new Map<string, string[]>();
  for (const b of blocks) {
    for (const c of b.type === 'text' && Array.isArray(b.citations) ? b.citations : []) {
      if (c.type === 'web_search_result_location' && c.url && c.cited_text) cited.set(c.url, [...(cited.get(c.url) ?? []), c.cited_text]);
    }
  }
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    // an error comes back as an object, results as a list
    if (b.type !== 'web_search_tool_result' || !Array.isArray(b.content)) continue;
    for (const r of b.content as { type?: string; url?: unknown; title?: unknown }[]) {
      if (r.type !== 'web_search_result' || typeof r.url !== 'string' || seen.has(r.url)) continue;
      seen.add(r.url);
      const snippet = cited.get(r.url)?.join(' … ');
      out.push({ url: r.url, title: typeof r.title === 'string' ? r.title : r.url, ...(snippet ? { snippet } : {}) });
    }
  }
  return out.slice(0, max);
}

export class AnthropicSearchEnricher implements Enricher {
  readonly name: string;
  readonly searchEstimateUsd = SEARCH_ESTIMATE_USD;
  constructor(private readonly opts: AnthropicSearchOptions = {}) {
    this.name = `web search (${opts.model ?? 'small model'})`;
  }

  async search(query: string): Promise<SearchHit[]> {
    const client = this.opts.client ?? (new Anthropic() as unknown as MessagesLike);
    const model = this.opts.model ?? process.env.ATELIER_CLAIMS_MODEL ?? 'claude-haiku-4-5';
    const res = await client.messages.create({
      model, max_tokens: 1024,
      tools: [{ type: this.opts.toolType ?? 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      messages: [{ role: 'user', content: `Search the web once for: ${query}\nThen quote, from the results, the passages that state facts (figures, dates, names). Add nothing of your own.` }],
    });
    return hitsOf(res, this.opts.maxResults ?? 5);
  }

  fetch(url: string): Promise<FetchedPage | null> {
    return fetchPage(url, this.opts.fetchImpl ?? globalThis.fetch);
  }
}
