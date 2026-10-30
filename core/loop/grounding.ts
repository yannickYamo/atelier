// atelier/core/loop/grounding.ts — A FACT OF AN EXAMPLE'S CASE, SAID OF THIS ONE, CORRECTED WHERE IT STANDS.
//
// The carry-over signal (./carry-over.ts) finds a sentence that states, of the person's case, a term only an example
// held: "CORS is fixed." in reply to "Thanks, that solved it." Listing it left it delivered as if it were established.
//
// THE STEP. Each such sentence, and only it, is rewritten so it states nothing of the person's case beyond their request:
// the borrowed fact dropped, or kept as an assumption the sentence says is one. One call for every sentence found. Code
// decides what is kept:
//   - a rewrite must be a sentence (never empty: nothing is deleted), and no longer than the original by much;
//   - it must hold none of the borrowed terms, or say in its own words that it assumes ("if", "assuming", "check whether");
//   - it may bring in no term of the examples the request does not name (no new carry-over);
//   - the code and links the sentence held stay as they were (./integrity.ts, `workLost`, as a span edit);
//   - the whole text, checked again, may break no rule that held before (`breaksNothing`).
// A sentence whose rewrite fails any of these stays as written and stays listed for the person: UNRESOLVED, said so.
//
// WHY ONLY THIS SIGNAL ACTS. It is code, and measured: on 2,135 hand-labelled sentences, 7 found, 7 right, none wrong
// in 2,082 sound ones. The model readings (the context judge's situations) are not measured, and in the same study one
// of them doubted a cause the request stated in so many words: they list, they never rewrite.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { carryOverClaims, distinctTerms, structuredUnit } from './carry-over.js';
export { structuredUnit } from './carry-over.js';
import { workLost } from './integrity.js';
import type { Claim } from './claims.js';

/** A sentence the step found, and what became of it. */
export interface Grounded { readonly sentence: string; readonly borrowed: readonly string[]; readonly rewrite: string | null; readonly kept: boolean; readonly why: string }
export interface GroundingResult { readonly text: string; readonly found: readonly Grounded[]; readonly note: string | null }

/** Words by which a sentence says it assumes, or hands the fact to the person to check. */
const ASSUMES = /\b(?:if|assuming|assume[sd]?|presumably|likely|probably|might|may|could|in case|check (?:whether|that|if)|confirm (?:whether|that))\b/i;

/**
 * THE SENTENCES THE STEP WOULD ACT ON: each the carry-over signal finds in `text` against the served examples and what
 * was given, less a table row or a block of keys and values (a sentence spliced into either would break it, so both are
 * left listed, never rewritten). Read by the run before it enters the step, so a text with nothing to ground takes none.
 */
export const carriedClaims = (text: string, examples: string, given: string): Claim[] =>
  carryOverClaims(text, examples, given).filter((cl) => !structuredUnit(cl.text));

/** The borrowed terms a claim names, from its `why` (./carry-over.ts writes "states a, b of your case"). */
export const borrowedOf = (c: Claim): string[] => (/^states (.+?) of your case/.exec(c.why)?.[1] ?? '').split(', ').map((x) => x.trim()).filter(Boolean);

/**
 * The sentence with the borrowed term's own inline code taken out. The borrowed fact may be dropped even when it is a line
 * of code (`orders_legacy`, `Access-Control-Allow-Origin`): that span is what the step corrects, so it is no work to keep.
 * Every other span, every code block and every link stays protected.
 */
export function withoutBorrowed(text: string, borrowed: readonly string[]): string {
  const b = new Set(borrowed.map((x) => x.toLowerCase().trim()));
  return text.replace(/`([^`\n]{2,80})`/g, (m, inner: string) => (b.has(inner.trim().toLowerCase()) ? '' : m));
}

const URLS = /\bhttps?:\/\/[^\s`'"<>)\]]+|\bwww\.[^\s`'"<>)\]]+/g;
const words = (s: string): number => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
const flat = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Whether a rewrite of `sentence` may stand: why not, or null. Code only. */
export function rewriteProblem(sentence: string, rewrite: string, borrowed: readonly string[], examples: string, evidence: string): string | null {
  const r = rewrite.trim();
  // A REWRITE IS A SENTENCE. "." or a dash is a deletion by another name: nothing is deleted.
  if (words(r) < 2) return 'the rewrite was empty or no sentence, and nothing is deleted';
  if (flat(r) === flat(sentence)) return 'the rewrite left the sentence as it was';
  if (r.length > sentence.trim().length * 1.6 + 60) return 'the rewrite runs far longer than the sentence';
  // A borrowed term may stay only as an assumption the rewrite ADDS: an "if" the sentence already had is no correction.
  const still = borrowed.filter((b) => distinctTerms(r).has(b));
  if (still.length && !(ASSUMES.test(r) && !ASSUMES.test(sentence))) return `it still states ${still.join(', ')} as fact`;
  // nothing new from the examples: the rewrite read as a text of its own, against the request plus the sentence it replaces
  const added = carryOverClaims(r, examples, `${evidence}\n${sentence}`);
  if (added.length) return 'it brings in another term only an example holds';
  // every link the sentence held stays, in code or in prose, unless it is itself the borrowed term
  const lostLink = [...sentence.matchAll(URLS)].map((m) => m[0]).find((u) => !borrowed.includes(u.toLowerCase()) && !r.includes(u));
  if (lostLink) return `it would remove the link ${lostLink}`;
  const lost = workLost(withoutBorrowed(sentence, borrowed), r, 'rewrite');
  if (lost) return lost;
  return null;
}

const SYSTEM = `You correct single sentences of an assistant's reply. Each one states, as a fact about the person's own case, something their request never gave: the named terms came from an example of a different conversation, not from this one.

Rewrite each sentence so it says nothing about the person's case beyond what their request shows. Either drop the borrowed fact and keep the rest of what the sentence says, or keep it only as an assumption the sentence states as one ("if it was …", "assuming …"). A borrowed term written as code may be dropped with the fact it states; keep every other piece of code and every link exactly. Keep the sentence's voice, its register and its length. Never return an empty sentence, never add a new fact, and never mention examples or other conversations.`;
const SCHEMA = { type: 'object', properties: { rewrites: { type: 'array', items: { type: 'object',
  properties: { id: { type: 'number' }, text: { type: 'string' } }, required: ['id', 'text'], additionalProperties: false } } },
  required: ['rewrites'], additionalProperties: false };

/**
 * THE GROUNDING STEP on one text. `request` and `evidence` (the request's material) are what the person gave; `examples`
 * the served examples. `breaksNothing` reads the whole text after: false refuses every rewrite (the text stays as it was).
 */
export async function groundCarried(text: string, c: {
  readonly client: InferenceClient; readonly budget: Budget; readonly request: string; readonly evidence: string; readonly examples: string;
  readonly breaksNothing?: (next: string) => Promise<boolean>;
}): Promise<GroundingResult> {
  if (!c.request.trim() || !c.examples.trim()) return { text, found: [], note: null };
  const given = `${c.evidence}\n${c.request}`;
  const claims = carriedClaims(text, c.examples, given);
  if (!claims.length) return { text, found: [], note: null };
  const items = claims.map((cl, i) => ({ id: i + 1, claim: cl, borrowed: borrowedOf(cl) }));
  let raw: unknown;
  try {
    const res = await spend(c.budget, 0.02, async () => {
      const x = await c.client.complete({ stableBlock: SYSTEM, variableBlock: '', temperature: 0,
        userMessage: `<request>\n${c.request.trim()}\n</request>\n\n${items.map((it) => `[${it.id}] borrowed: ${it.borrowed.join(', ')}\n${it.claim.text}`).join('\n\n')}`,
        toolName: 'emit_rewrites', toolDescription: 'Return one rewrite per numbered sentence.', schema: SCHEMA, maxTokens: 1200 });
      return { value: x, cost: x.cost, usage: x };
    }, 'repair');
    raw = res.json;
  } catch (e) {
    const why = `the rewrite could not be made (${(e as Error).message.split('\n')[0]})`;
    return { text, found: items.map((it) => ({ sentence: it.claim.text, borrowed: it.borrowed, rewrite: null, kept: false, why })), note: groundingNote(items.length, 0, why) };
  }
  const got = new Map<number, string>();
  for (const r of ((raw as { rewrites?: { id?: unknown; text?: unknown }[] } | null)?.rewrites ?? [])) {
    if (typeof r.id === 'number' && typeof r.text === 'string' && !got.has(r.id)) got.set(r.id, r.text);
  }
  const found: Grounded[] = [];
  const splice: { start: number; end: number; text: string }[] = [];
  for (const it of items) {
    const rw = got.get(it.id) ?? null;
    const problem = rw === null ? 'no rewrite came back for it' : rewriteProblem(it.claim.text, rw, it.borrowed, c.examples, given);
    if (problem || rw === null) { found.push({ sentence: it.claim.text, borrowed: it.borrowed, rewrite: rw, kept: false, why: problem ?? '' }); continue; }
    // the claim's own span: its leading and trailing space stay where they were
    const raw0 = text.slice(it.claim.start, it.claim.end);
    const lead = /^\s*/.exec(raw0)?.[0] ?? ''; const tail = /\s*$/.exec(raw0)?.[0] ?? '';
    splice.push({ start: it.claim.start, end: it.claim.end, text: `${lead}${rw.trim()}${tail}` });
    found.push({ sentence: it.claim.text, borrowed: it.borrowed, rewrite: rw.trim(), kept: true, why: 'rewritten to state only what the request gives' });
  }
  if (!splice.length) return { text, found, note: groundingNote(items.length, 0, found[0]?.why ?? '') };
  const order = [...splice].sort((a, b) => b.start - a.start);
  // claim units never overlap; were two ever to, nothing is spliced rather than one splice landing inside the other
  if (order.some((s, i) => i > 0 && s.end > order[i - 1].start)) return { text, found: found.map((f) => ({ ...f, kept: false, why: 'the sentences overlap' })), note: groundingNote(items.length, 0, 'the sentences overlap') };
  let next = text; let was = text;
  for (const s of order) {
    next = `${next.slice(0, s.start)}${s.text}${next.slice(s.end)}`;
    // the text before, with only the borrowed spans of the rewritten sentences taken out: what the floor compares against
    const it = items.find((x) => x.claim.start === s.start);
    was = `${was.slice(0, s.start)}${withoutBorrowed(text.slice(s.start, s.end), it?.borrowed ?? [])}${was.slice(s.end)}`;
  }
  const whole = workLost(was, next, 'rewrite');
  const ok = whole === null && (c.breaksNothing ? await c.breaksNothing(next).catch(() => false) : true);
  if (!ok) {
    const why = whole ?? 'the text with the rewrites breaks a rule that held before';
    return { text, found: found.map((f) => (f.kept ? { ...f, kept: false, why } : f)), note: groundingNote(items.length, 0, why) };
  }
  return { text: next, found, note: groundingNote(items.length, splice.length, found.find((f) => !f.kept)?.why ?? '') };
}

/** The one line the record and the panel say: how many sentences were found, how many rewritten, and why the rest stand. */
export function groundingNote(n: number, kept: number, why: string): string {
  const unresolved = n - kept;
  return `Grounded: ${n} sentence(s) stated a fact only an example's case held${kept ? `; ${kept} rewritten to state only what the request gives` : ''}`
    + `${unresolved ? `; ${unresolved} left as written and listed for you to check, unresolved (${why})` : ''}.`;
}
