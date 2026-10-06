// atelier/core/taste/reader.ts — DID THIS TEXT DO WHAT A READING-BASED RULE ASKS? READ TWICE, QUOTED.
//
// See docs/TASTE.md for the design and why each piece is here. In short:
//
//   1. applicability is decided from the TASK alone, never the output, so a reader cannot excuse its
//      own miss as "did not apply";
//   2. behaviour is read twice, the second time with the markdown flattened and the rules in reverse
//      order, and only verdicts that agree count (computed abstention: models asked to abstain do not);
//   3. every FOLLOWED, and every MISSED that points at a passage, must quote it, and the quote must be
//      in the text; a verdict whose quote is not there is UNCLEAR.
//
// The reader reports. What its readings may do is decided by calibration (./calibration.ts).

import type { Requirement, StandardVersion } from '../state/canonical-state.js';
import { isGeneralScope } from '../state/canonical-state.js';
import { keysOf } from '../state/rule-key.js';
import type { Budget, InferenceClient } from '../inference/client.js';
import { spend } from '../inference/client.js';

export type TasteVerdict = 'FOLLOWED' | 'MISSED' | 'UNCLEAR' | 'NOT_APPLICABLE' | 'UNSTABLE';

export interface TasteReading {
  readonly requirementId: string;
  /** the rule's key (../state/rule-key.ts), so readings follow the rule across versions */
  readonly key: string;
  readonly verdict: TasteVerdict;
  /** for MISSED: whether a passage breaks the rule (PRESENCE) or the text never does what it asks (OMISSION) */
  readonly kind?: 'PRESENCE' | 'OMISSION';
  /** the verbatim passage the verdict rests on, when there is one */
  readonly quote?: string;
  readonly why: string;
}

/** A MISSED reading that points at a passage: the only kind that may act, and the only kind a false block is. */
export const actsAsMiss = (r: Pick<TasteReading, 'verdict' | 'kind'>): boolean => r.verdict === 'MISSED' && r.kind === 'PRESENCE';

/** The rules the reader reads: live, and without a measurement (a count decides those). */
export function tasteRules(v: StandardVersion): { rule: Requirement; key: string }[] {
  const keys = keysOf(v.requirements);
  return v.requirements.map((rule, i) => ({ rule, key: keys[i] }))
    .filter(({ rule }) => !rule.measurement && rule.authority !== 'EXPERT_REJECTED' && rule.materiality !== 'INCIDENTAL');
}

export const APPLICABILITY_SYSTEM = `You decide whether a condition will hold for a piece of writing, from the TASK alone.

You are given a writing task and a numbered list of conditions. For each, answer whether a piece
written for this task would be one where the condition holds. You do not see the piece; answer from
what the task asks for. UNCLEAR when the task does not say enough.`;

export const APPLICABILITY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { answers: { type: 'array', items: { type: 'object',
    properties: { n: { type: 'number' }, applies: { type: 'string', enum: ['YES', 'NO', 'UNCLEAR'] } },
    required: ['n', 'applies'], additionalProperties: false } } },
  required: ['answers'], additionalProperties: false,
};

export const READING_SYSTEM = `You report what a piece of writing DOES, rule by rule. You do not judge whether it is good.

You are given a TEXT and a numbered list of RULES the author holds. For each rule, answer:
- FOLLOWED: the text does what the rule describes. Quote the shortest passage that shows it.
- MISSED: the text does not. If a passage goes against the rule, quote it (kind PRESENCE). If the text
  simply never does what the rule asks, quote nothing (kind OMISSION).
- UNCLEAR: you cannot tell from this text. This is a real answer; a forced verdict is worse than none.

Quote the text exactly, character for character. A verdict whose quote is not in the text is discarded.
Answer about the text, never about whether the rule is a good one.`;

export const READING_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { readings: { type: 'array', items: { type: 'object',
    properties: {
      n: { type: 'number' },
      verdict: { type: 'string', enum: ['FOLLOWED', 'MISSED', 'UNCLEAR'] },
      kind: { type: ['string', 'null'], enum: ['PRESENCE', 'OMISSION', null] },
      quote: { type: ['string', 'null'] },
      why: { type: 'string' },
    },
    required: ['n', 'verdict', 'kind', 'quote', 'why'], additionalProperties: false } } },
  required: ['readings'], additionalProperties: false,
};

/** Whitespace collapsed: line wrapping is layout, not wording. */
export const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** Emphasis markers removed: `*very* important` and "very important" are the same words. */
const unmark = (s: string): string => s.replace(/\*\*|__|`/g, '').replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s.,;:!?)]|$)/g, '$1$2');

/** A quote is real when it is in the text, whitespace and emphasis markers aside (neither is wording). */
export const quoteIsReal = (quote: string, text: string): boolean =>
  quote.trim().length >= 3 && (squash(text).includes(squash(quote)) || squash(unmark(text)).includes(squash(unmark(quote))));

/**
 * The same text, shown differently: markdown markers removed, so a verdict that tracked formatting moves.
 * Code is left alone (fenced blocks and inline spans are content), links keep their words, and only a
 * short number followed by a space counts as a list marker, so "2024. was a year" keeps its year.
 */
export function flatten(text: string): string {
  let fenced = false;
  return text.split('\n').map((l) => {
    if (/^\s*(```|~~~)/.test(l)) { fenced = !fenced; return l; }
    if (fenced) return l;
    const body = l.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*>\s?/, '').replace(/^\s*([-*+]|\d{1,3}[.)])\s+(?=\S)/, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
    // Emphasis only outside inline code.
    return body.split(/(`[^`]*`)/).map((part, i) => i % 2 ? part : unmark(part)).join('');
  }).join('\n');
}

interface RawReading { n: number | string; verdict: 'FOLLOWED' | 'MISSED' | 'UNCLEAR'; kind: 'PRESENCE' | 'OMISSION' | null; quote: string | null; why: string }

async function readOnce(client: InferenceClient, budget: Budget, text: string, rules: readonly Requirement[]): Promise<Map<number, RawReading>> {
  const res = await spend(budget, 0.03, async () => {
    const x = await client.complete({
      stableBlock: READING_SYSTEM, variableBlock: '',
      userMessage: `RULES\n${rules.map((r, i) => `${i + 1}. ${r.statement}`).join('\n')}\n\nTEXT\n"""\n${text}\n"""`,
      toolName: 'emit_readings', toolDescription: 'One reading per numbered rule.',
      schema: READING_SCHEMA, maxTokens: 3000, temperature: 0,
    });
    return { value: x, cost: x.cost, usage: x };
  }, 'taste reader');
  const raw = (res.json as { readings?: RawReading[] } | null)?.readings ?? [];
  const out = new Map<number, RawReading>();
  // A model may send "2" for 2; the first reading per number wins.
  for (const r of raw) { const n = typeof r.n === 'number' ? r.n : Number(r.n); if (Number.isInteger(n) && !out.has(n)) out.set(n, { ...r, n }); }
  return out;
}

/** Which rules apply to this task, decided without seeing any output. Rules without a condition apply. */
export async function applicability(client: InferenceClient, budget: Budget, task: string | null, rules: readonly Requirement[]): Promise<boolean[]> {
  const conditional = rules.map((r, i) => ({ r, i })).filter(({ r }) => !isGeneralScope(r.appliesWhen));
  const out = rules.map(() => true);
  if (!conditional.length) return out;
  // Without a task there is nothing to decide from: conditional rules are read, and say so in their why.
  if (!task) return out;
  const res = await spend(budget, 0.01, async () => {
    const x = await client.complete({
      stableBlock: APPLICABILITY_SYSTEM, variableBlock: '',
      userMessage: `TASK\n${task}\n\nCONDITIONS\n${conditional.map(({ r }, j) => `${j + 1}. ${r.appliesWhen}`).join('\n')}`,
      toolName: 'emit_applicability', toolDescription: 'One answer per numbered condition.',
      schema: APPLICABILITY_SCHEMA, maxTokens: 800, temperature: 0,
    });
    return { value: x, cost: x.cost, usage: x };
  }, 'taste reader');
  const answers = (res.json as { answers?: { n: number | string; applies: string }[] } | null)?.answers ?? [];
  conditional.forEach(({ i }, j) => { if (answers.find((a) => String(a.n) === String(j + 1))?.applies === 'NO') out[i] = false; });
  return out;
}

/** `applicability` for a standard's reading-based rules, in `tasteRules` order: decide once, read many. */
export const applicabilityFor = (client: InferenceClient, budget: Budget, v: StandardVersion, task: string | null): Promise<boolean[]> =>
  applicability(client, budget, task, tasteRules(v).map((x) => x.rule));

/** A pass's reading, checked: an unverifiable quote makes it UNCLEAR. */
function checked(r: RawReading | undefined, text: string): { verdict: 'FOLLOWED' | 'MISSED' | 'UNCLEAR'; kind?: 'PRESENCE' | 'OMISSION'; quote?: string; why: string } {
  if (!r) return { verdict: 'UNCLEAR', why: 'no reading returned' };
  const quote = r.quote?.trim() ? r.quote.trim() : undefined;
  if (r.verdict === 'FOLLOWED') return quote && quoteIsReal(quote, text) ? { verdict: 'FOLLOWED', quote, why: r.why } : { verdict: 'UNCLEAR', why: 'FOLLOWED without a real quote' };
  if (r.verdict === 'MISSED') {
    if (quote) return quoteIsReal(quote, text) ? { verdict: 'MISSED', kind: 'PRESENCE', quote, why: r.why } : { verdict: 'UNCLEAR', why: 'MISSED with a quote that is not in the text' };
    return { verdict: 'MISSED', kind: 'OMISSION', why: r.why };
  }
  return { verdict: 'UNCLEAR', why: r.why };
}

/**
 * Read one text against a standard's reading-based rules. `task`, when known, decides applicability.
 * Two behaviour calls (and one applicability call when any rule has a condition), metered on `budget`.
 * Applicability depends on the task only, so a caller reading several texts for one task decides it once
 * (`applicabilityFor`) and passes it in.
 */
export async function readTaste(client: InferenceClient, budget: Budget, v: StandardVersion, text: string, task: string | null = null,
  decided: readonly boolean[] | null = null): Promise<TasteReading[]> {
  const rules = tasteRules(v);
  if (!rules.length) return [];
  const applies = decided ?? await applicability(client, budget, task, rules.map((x) => x.rule));
  const live = rules.filter((_, i) => applies[i]);
  const flat = flatten(text);
  const reversed = [...live].reverse();
  const [a, b] = live.length
    ? await Promise.all([readOnce(client, budget, text, live.map((x) => x.rule)), readOnce(client, budget, flat, reversed.map((x) => x.rule))])
    : [new Map<number, RawReading>(), new Map<number, RawReading>()];
  return rules.map(({ rule, key }, i) => {
    const base = { requirementId: rule.requirementId, key };
    if (!applies[i]) return { ...base, verdict: 'NOT_APPLICABLE', why: 'the task is not one where this rule\'s condition holds' };
    const j = live.findIndex((x) => x.rule === rule);
    const first = checked(a.get(j + 1), text);
    const second = checked(b.get(live.length - j), flat);
    // Only a verdict that survives being read differently is a reading.
    if (first.verdict !== second.verdict || (first.verdict === 'MISSED' && first.kind !== second.kind)) {
      return { ...base, verdict: 'UNSTABLE', why: `read as ${first.verdict} one way and ${second.verdict} the other` };
    }
    return { ...base, verdict: first.verdict, ...(first.kind ? { kind: first.kind } : {}), ...(first.quote ? { quote: first.quote } : {}), why: first.why };
  });
}

/**
 * One line per reading, for the terminal. A held-back reading (./calibration.ts `heldBack`) shows no
 * verdicts and no count of them: it is kept blind so the owner can label it. What still shows is that a
 * check failed (verify's exit code, MCP's `failed`), which a guard cannot hide; docs/TASTE.md says so.
 * `waiting` names rules whose material is not bound on this invocation: they had nothing to fire on, so a
 * MISSED reading of one is reported as waiting, never as a miss.
 */
export function describeTaste(readings: readonly TasteReading[], rules: ReadonlyMap<string, Requirement>, permitted: ReadonlySet<string> = new Set(),
  held = false, waiting: ReadonlySet<string> = new Set()): string {
  if (!readings.length) return 'No reading-based rules to read.';
  if (held) {
    return `read against ${readings.length} reading-based rule(s); this reading is held back so that your labels stay blind. `
      + 'Label it with: atelier taste --calibrate';
  }
  const isWaiting = (r: TasteReading): boolean => waiting.has(r.requirementId);
  const count = (v: TasteVerdict): number => readings.filter((r) => r.verdict === v && !isWaiting(r)).length;
  const waitingIds = readings.filter(isWaiting).map((r) => r.requirementId);
  const head = `read against ${readings.length} reading-based rule(s): ${count('FOLLOWED')} followed, ${count('MISSED')} missed, `
    + `${count('UNCLEAR') + count('UNSTABLE')} could not be told, ${count('NOT_APPLICABLE')} did not apply`
    + (waitingIds.length ? `, ${waitingIds.length} waiting for your material (${waitingIds.join(', ')})` : '');
  const lines = readings.filter((r) => r.verdict === 'MISSED' && !isWaiting(r)).map((r) =>
    `  missed ${r.requirementId}${permitted.has(r.key) ? '' : ' (observed)'}: ${(rules.get(r.requirementId)?.statement ?? '').slice(0, 90)}\n`
    + `    ${r.kind === 'PRESENCE' && r.quote ? `"${r.quote.slice(0, 140)}"` : 'nowhere in the text'}: ${r.why.slice(0, 160)}`);
  return [head, ...lines].join('\n');
}

/** The misses that act: PRESENCE misses on rules the reader holds VETO on. */
export const vetoMisses = (readings: readonly TasteReading[], veto: ReadonlySet<string>): TasteReading[] =>
  readings.filter((r) => actsAsMiss(r) && veto.has(r.key));
