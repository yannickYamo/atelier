// atelier/core/enrich/enricher.ts — WHERE FACTS FROM OUTSIDE THE PERSON'S MATERIAL COME FROM, BEHIND AN INTERFACE.
//
// A piece stands on specifics only its subject has. When the person's notes are thin, a short web pass can bring a
// few: a date, a figure, a named constraint. Core never names a search vendor: it asks an `Enricher` to search and
// to fetch, and `providers/` holds the implementations. Offline, and by default, the enricher is `NullEnricher`: it
// finds nothing, and nothing downstream changes.
//
// What comes back is evidence, never voice. An enriched document is only ever a source a specific may be traced to
// (marked as enriched, with its URL), never an example of how to write.

/** One search result: where it is, what it is called, and the passage the search showed, when it showed one. */
export interface SearchHit {
  readonly url: string;
  readonly title: string;
  readonly snippet?: string;
}

/** A fetched page as plain text. */
export interface FetchedPage { readonly url: string; readonly title: string; readonly text: string }

/** A document the run may trace specifics to: its URL, its title, its text (capped), and when it was read. */
export interface EnrichedDoc {
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly retrievedAt: string;
}

export interface Enricher {
  /** a short name for the record ("none", "web search (model)") */
  readonly name: string;
  /** what one search is held to against the run's budget, before it is made; 0 or absent when nothing is billed */
  readonly searchEstimateUsd?: number;
  search(query: string): Promise<SearchHit[]>;
  /** the page as text, or null when it cannot be read; never throws for a page that will not load */
  fetch(url: string): Promise<FetchedPage | null>;
}

/** The offline default: no search, no fetch. */
export const NullEnricher: Enricher = {
  name: 'none',
  search: () => Promise.resolve([]),
  fetch: () => Promise.resolve(null),
};

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/**
 * HTML as plain text, by code: scripts, styles and markup out, block ends as line breaks, the common entities decoded,
 * runs of blank space folded. Locating tags is all it does; it reads nothing into the words.
 */
export function htmlToText(html: string): { title: string; text: string } {
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const text = html
    .replace(/<(script|style|noscript|svg|head|title)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      const k = e.toLowerCase();
      if (ENTITIES[k]) return ENTITIES[k];
      if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
      if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1)));
      return m;
    })
    .replace(/[ \t\f\r]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n')
    .trim();
  return { title: decodeTitle(title), text };
}
const decodeTitle = (t: string): string => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

/**
 * A page fetched over HTTP and read as text. Only http(s), only text or HTML, and a time limit; anything else is null.
 * `fetchImpl` is the global fetch unless a test passes its own.
 */
export async function fetchPage(url: string, fetchImpl: typeof fetch = globalThis.fetch, timeoutMs = 15_000): Promise<FetchedPage | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'text/html,text/plain;q=0.9' } });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (type && !/text\/(html|plain)|application\/xhtml/i.test(type)) return null;
    const body = await res.text();
    if (/text\/plain/i.test(type)) return { url, title: url, text: body.replace(/[ \t]+/g, ' ').trim() };
    const { title, text } = htmlToText(body);
    return { url, title: title || url, text };
  } catch {
    return null;
  }
}
