// atelier/core/voice/register.ts — IS THIS REQUEST IN THE REGISTER THE AUTHOR'S PIECES WERE WRITTEN IN.
//
// A voice learned from blog posts is evidence about blog posts. Asked for a contract, the same skill has
// no evidence that the author's short paragraphs or their asides belong there. So each run records which
// register the request is in, and out of register only the traits the owner's policy carries are applied
// (./transfer.ts).
//
// THE DECISION IS DECLARED, NOT DETECTED. A register comes from the person (`--register`) or from a
// document-type word in the request, read against a small versioned table. A request that names no
// document type is taken to be in register, and the record says it was assumed. The lexical distance
// below is a MONITOR: it is recorded and shown, and it never decides. It parses text, so it would be a
// detector, and no study has measured it against anyone's judgement of register.
//
// The gate exists only for a skill whose owner declared the corpus's register (`atelier voice register`).
// Without that declaration nothing here runs and the skill behaves as it always did.

import { paragraphsOf, quantile, wordsOf } from '../observers/text.js';
import { cosine, vectorOf, type RetrievalIndex } from '../fidelity/retrieval.js';

/** Moves when a pattern or a name does: a recorded decision names the table it was read against. */
export const REGISTER_TABLE_VERSION = 1;

/** Document types a request can name, most specific first, so "white paper" is not read as "paper". */
export const REGISTER_TABLE: readonly { readonly register: string; readonly pattern: RegExp }[] = [
  { register: 'white-paper', pattern: /\bwhite[ -]?papers?\b/i },
  { register: 'contract', pattern: /\b(?:contracts?|agreements?|terms of service|nda)\b/i },
  { register: 'report', pattern: /\b(?:financial |annual |quarterly |status )?reports?\b/i },
  { register: 'memo', pattern: /\bmemo(?:randum|s)?\b/i },
  { register: 'speech', pattern: /\b(?:speech(?:es)?|keynotes?|remarks|toasts?)\b/i },
  { register: 'email', pattern: /\be-?mails?\b/i },
  { register: 'answer', pattern: /\b(?:support repl(?:y|ies)|repl(?:y|ies) to|answer (?:this|the) (?:question|ticket))\b/i },
  { register: 'post', pattern: /\b(?:blog ?posts?|posts?|articles?|essays?|newsletters?)\b/i },
];

/** A register name as compared: lower case, spaces as hyphens, and a table alias folded to its register. */
export function normaliseRegister(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '-');
  const hit = REGISTER_TABLE.find((r) => r.register === s || r.pattern.test(s.replace(/-/g, ' ')));
  return hit ? hit.register : s;
}

/**
 * The register a request names, or null when it names no document type. The document type named FIRST wins
 * ("a post about our quarterly report" asks for a post); at the same place, the more specific one.
 */
export function registerOfRequest(request: string): string | null {
  let best: { register: string; at: number } | null = null;
  for (const r of REGISTER_TABLE) {
    const at = request.search(r.pattern);
    if (at >= 0 && (best === null || at < best.at)) best = { register: r.register, at };
  }
  return best?.register ?? null;
}

export interface RegisterDistance {
  /** mean, over the text's paragraphs, of one minus its nearest similarity to any of the author's passages */
  readonly value: number;
  /** the 90th percentile of the same distance for each of the author's pieces against the others */
  readonly threshold: number;
  readonly inside: boolean;
}

export interface RegisterDecision {
  /** `assumed-in`: the request named no document type, so it was taken to be in register */
  readonly status: 'in' | 'out' | 'assumed-in';
  readonly corpus: readonly string[];
  readonly request: string | null;
  readonly source: 'declared' | 'keyword' | 'none';
  readonly table: number;
  /** a monitor: never decides */
  readonly distance: RegisterDistance | null;
}

/** The decision, from the registers the owner declared for the corpus and the request's own. */
export function decideRegister(corpus: readonly string[], request: string, declared: string | undefined, distance: RegisterDistance | null = null): RegisterDecision {
  const own = corpus.map(normaliseRegister);
  const asked = declared ? normaliseRegister(declared) : registerOfRequest(request);
  const source = declared ? 'declared' as const : asked ? 'keyword' as const : 'none' as const;
  const status = asked === null ? 'assumed-in' as const : own.includes(asked) ? 'in' as const : 'out' as const;
  return { status, corpus: own, request: asked, source, table: REGISTER_TABLE_VERSION, distance };
}

/** Paragraphs shorter than this share too few words with anything for a distance to mean something. */
const MIN_WORDS = 25;

/** One text's distance from a set of passage vectors: the mean over its paragraphs of 1 − nearest similarity. */
function distanceTo(index: RetrievalIndex, paragraphs: readonly string[], others: readonly Map<string, number>[]): number | null {
  const ds = paragraphs.filter((p) => wordsOf(p).length >= MIN_WORDS).map((p) => {
    const v = vectorOf(index, p);
    return 1 - others.reduce((best, o) => Math.max(best, cosine(v, o)), 0);
  });
  return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
}

/**
 * The corpus's own threshold: each piece's distance from the passages of every other piece, and the 90th
 * percentile of those. Null with fewer than three pieces: one or two leave nothing to hold a piece against.
 */
export function registerThreshold(index: RetrievalIndex): number | null {
  const vectors = index.passages.map((p) => ({ piece: p.piece, v: vectorOf(index, p.text) }));
  const pieces = [...new Set(index.passages.map((p) => p.piece))];
  if (pieces.length < 3) return null;
  const ds = pieces.flatMap((piece) => {
    const d = distanceTo(index, index.passages.filter((p) => p.piece === piece).map((p) => p.text), vectors.filter((x) => x.piece !== piece).map((x) => x.v));
    return d === null ? [] : [d];
  });
  return ds.length >= 3 ? Math.round(quantile(ds, 0.9) * 1000) / 1000 : null;
}

/** Where `text` sits against the corpus's own threshold. Null when either cannot be computed. */
export function registerDistance(index: RetrievalIndex, text: string, threshold: number | null): RegisterDistance | null {
  if (threshold === null) return null;
  const d = distanceTo(index, paragraphsOf(text).map((p) => p.text), index.passages.map((p) => vectorOf(index, p.text)));
  if (d === null) return null;
  const value = Math.round(d * 1000) / 1000;
  return { value, threshold, inside: value <= threshold };
}
