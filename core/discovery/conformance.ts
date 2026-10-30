// atelier/core/discovery/conformance.ts — WHAT CAN BE CHECKED WITHOUT A JUDGE, AND NOTHING ELSE.
//
// This pack answers one question about a model: does its discovery output have the properties a
// machine can verify? Not "is the taste it found correct" — that question needs a person, and every
// attempt to answer it with another model has failed in this project in a way worth remembering: three
// model-based observers abstained zero times in a hundred and fifty observations. An instrument that
// never says "I don't know" is not confident, it is uncalibrated.
//
// ─── SYNTACTIC DETERMINISM IS NOT SEMANTIC DETERMINISM, AND THE DIFFERENCE IS THE WHOLE POINT ───
//
// Some checks here are genuinely conclusive. "This quote occurs verbatim in the file it was attributed
// to" is a string search: it passes or it does not, and a model that fabricates evidence is caught
// outright. So is "this response carries no field the model was not entitled to fill".
//
// Others look conclusive and are not, and they are labelled so:
//
//   wouldBeAbsentIf is non-empty and differs from the statement
//       → establishes: a counterfactual field was populated with something else
//       → does NOT establish: the counterfactual is meaningful, or falsifies anything
//
//   no two statements are byte-identical
//       → establishes: nothing was copy-pasted
//       → does NOT establish: these are distinct decisions. "preserve uncertainty in types" and
//         "don't erase unknown states through type widening" are one decision in two costumes, and
//         no string comparison will ever say so. Semantic consolidation needs a semantic matcher,
//         and a semantic matcher is a model, and a model is not deterministic — so that check does
//         not live here and its absence is reported rather than hidden.
//
// A model that passes every check in this file may still infer terrible taste. Saying that clearly is
// this module's most useful output, because a small local model that is honest about its evidence is
// perfectly usable — as a proposer whose candidates a person then decides on.

import type { ProposedRule, CorpusItem } from './propose.js';

/** A check either establishes its property or it does not. There is no partial credit and no score. */
export type CheckOutcome = 'PASS' | 'FAIL' | 'NOT_APPLICABLE';

export interface ConformanceCheck {
  readonly id: string;
  /** what a pass establishes, in the narrowest terms that are true */
  readonly establishes: string;
  readonly outcome: CheckOutcome;
  /** every instance that failed, by rule. A count is not actionable; a location is. */
  readonly failures: readonly string[];
  /** present when a pass is weaker than it looks. Rendered beside the pass, never omitted. */
  readonly caveat?: string;
}

/**
 * What this pack cannot reach. Carried as data so a report cannot forget to print it.
 *
 * Every one of these needs a human-authoritative label, and the list is the specification for the
 * benchmark that would eventually award SEMANTIC_DISCOVERY_QUALIFIED.
 */
export const UNQUALIFIED_BY_THIS_PACK: readonly string[] = [
  'whether the latent decision behind the surface behaviour was correctly abstracted',
  'whether appliesWhen names the real scope, rather than one too broad or too narrow',
  'whether the counterfactual in wouldBeAbsentIf would actually falsify the rule',
  'whether two differently-worded rules are the same decision',
  'whether anything important in the corpus was missed',
  'the precision and recall of the discovery as a whole',
];

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Where a cited span sits in the source. `WHITESPACE_NORMALIZED` is admitted because line wrapping is
 * not fabrication; nothing else is, because everything else is the model rewriting its own evidence.
 */
export type SpanMatch = 'EXACT' | 'WHITESPACE_NORMALIZED' | 'ABSENT' | 'NO_SUCH_ITEM';

export function locateSpan(quote: string, itemId: string, corpus: readonly CorpusItem[]): SpanMatch {
  const item = corpus.find((c) => c.id === itemId);
  if (!item) return 'NO_SUCH_ITEM';
  if (item.text.includes(quote)) return 'EXACT';
  return squash(item.text).includes(squash(quote)) ? 'WHITESPACE_NORMALIZED' : 'ABSENT';
}

/** Fields the human owns. A model that fills any of them has taken authority it was never given. */
export const MODEL_MAY_NOT_ASSIGN: readonly string[] = [
  'materiality', 'authority', 'realizationTolerance', 'gateRole', 'carrier', 'confirmed', 'requirementId',
];

export interface ConformanceReport {
  readonly checks: readonly ConformanceCheck[];
  readonly ruleCount: number;
  /** true when every applicable check passed. Deliberately not called `qualified`. */
  readonly allDeterministicChecksPassed: boolean;
  readonly unqualified: readonly string[];
}

/**
 * Run the deterministic pack.
 *
 * `raw` is the object the model actually returned, before it was narrowed to ProposedRule. The
 * authority check has to see it: narrowing first would discard exactly the extra fields the check
 * exists to find, and the pack would report AUTHORITY_SAFE because it had thrown the evidence away.
 */
export function runDiscoveryConformance(
  rules: readonly ProposedRule[], corpus: readonly CorpusItem[], raw: unknown,
  bounds: { readonly min: number; readonly max: number } = { min: 1, max: 12 },
): ConformanceReport {
  const at = (i: number, r: ProposedRule): string => `rule ${i + 1} ("${r.statement.slice(0, 56)}…")`;
  const checks: ConformanceCheck[] = [];

  // 1. SHAPE. Every field the schema requires, populated with something.
  const missing = rules.flatMap((r, i) => {
    const gaps = (['statement', 'appliesWhen', 'evidence', 'evidenceItemId', 'wouldBeAbsentIf'] as const)
      .filter((k) => typeof r[k] !== 'string' || squash(r[k]).length === 0);
    if (!['GENERATIVE', 'BOUNDARY'].includes(r.kind)) gaps.push('kind' as never);
    return gaps.length ? [`${at(i, r)} — empty or missing: ${gaps.join(', ')}`] : [];
  });
  checks.push({ id: 'SCHEMA_CONFORMANCE', outcome: missing.length ? 'FAIL' : 'PASS', failures: missing,
    establishes: 'every rule carries every field the schema requires, non-empty, with kind in the enum' });

  // 2. EVIDENCE. The one check that catches invention outright.
  const spans = rules.map((r, i) => ({ i, r, m: locateSpan(r.evidence, r.evidenceItemId, corpus) }));
  const unanchored = spans.filter((s) => s.m === 'ABSENT' || s.m === 'NO_SUCH_ITEM')
    .map((s) => `${at(s.i, s.r)} — cited "${s.r.evidence.slice(0, 48)}…" in ${s.r.evidenceItemId}: ${s.m === 'NO_SUCH_ITEM' ? 'no such item in the corpus' : 'that text does not occur there'}`);
  const loose = spans.filter((s) => s.m === 'WHITESPACE_NORMALIZED').length;
  checks.push({ id: 'EVIDENCE_SPAN_VERBATIM', outcome: unanchored.length ? 'FAIL' : 'PASS', failures: unanchored,
    establishes: 'every quoted span occurs in the corpus item it was attributed to',
    ...(loose ? { caveat: `${loose} span(s) matched only after collapsing whitespace. Line wrapping is not fabrication, but the model did not return the bytes it read.` } : {}) });

  // 3. AUTHORITY. Read from the RAW object, because narrowing would delete the evidence.
  const grabbed: string[] = [];
  const items = (raw as { rules?: unknown[] } | null)?.rules;
  if (Array.isArray(items)) {
    items.forEach((o, i) => {
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        if (MODEL_MAY_NOT_ASSIGN.includes(k)) grabbed.push(`rule ${i + 1} returned "${k}", which is the human's to assign`);
      }
    });
  }
  checks.push({ id: 'AUTHORITY_SAFE', outcome: grabbed.length ? 'FAIL' : 'PASS', failures: grabbed,
    establishes: 'the model assigned itself no materiality, authority or gate role' });

  // 4. BOUNDS.
  const outOfBounds = rules.length < bounds.min || rules.length > bounds.max
    ? [`${rules.length} rules returned; the schema allows ${bounds.min}–${bounds.max}`] : [];
  checks.push({ id: 'COUNT_BOUNDS', outcome: outOfBounds.length ? 'FAIL' : 'PASS', failures: outOfBounds,
    establishes: 'the number of candidates is within the schema bounds' });

  // 5. EXACT DUPLICATES — and only exact ones.
  const seen = new Map<string, number>();
  const dupes: string[] = [];
  rules.forEach((r, i) => {
    const k = squash(r.statement).toLowerCase();
    const first = seen.get(k);
    if (first !== undefined) dupes.push(`${at(i, r)} repeats rule ${first + 1} word for word`);
    else seen.set(k, i);
  });
  checks.push({ id: 'NO_EXACT_DUPLICATES', outcome: dupes.length ? 'FAIL' : 'PASS', failures: dupes,
    establishes: 'no two statements are the same string',
    caveat: 'Two rules that are the same DECISION in different words pass this check. Deciding that they are one decision is a semantic judgement; nothing deterministic can make it.' });

  // 6. COUNTERFACTUAL — populated, and populated with something else. That is all.
  const flat = rules.flatMap((r, i) => squash(r.wouldBeAbsentIf).toLowerCase() === squash(r.statement).toLowerCase()
    ? [`${at(i, r)} — the counterfactual restates the rule`] : []);
  checks.push({ id: 'COUNTERFACTUAL_POPULATED', outcome: flat.length ? 'FAIL' : 'PASS', failures: flat,
    establishes: 'the counterfactual field holds something other than a copy of the statement',
    caveat: 'This is a string comparison. Whether the counterfactual is MEANINGFUL — whether it names something you would actually see, and whether seeing it would falsify the rule — is exactly the judgement this pack cannot make.' });

  const applicable = checks.filter((c) => c.outcome !== 'NOT_APPLICABLE');
  return { checks, ruleCount: rules.length, unqualified: UNQUALIFIED_BY_THIS_PACK,
    allDeterministicChecksPassed: applicable.every((c) => c.outcome === 'PASS') };
}

/** What a person reads. The gap is printed on a pass, not only on a failure. */
export function describeConformance(r: ConformanceReport, modelId: string): string {
  const lines = r.checks.map((c) => {
    const head = `  ${c.outcome === 'PASS' ? 'PASS' : c.outcome === 'FAIL' ? 'FAIL' : ' —  '}  ${c.id.padEnd(24)} ${c.establishes}`;
    const fails = c.failures.map((f) => `          ${f}`).join('\n');
    const cav = c.caveat ? `\n          note: ${c.caveat}` : '';
    return `${head}${fails ? `\n${fails}` : ''}${cav}`;
  }).join('\n\n');

  return `Discovery conformance — ${modelId}, ${r.ruleCount} candidate(s)\n\n${lines}\n\n`
    + (r.allDeterministicChecksPassed
      ? `Every check a machine can settle, this model settled.\n\n`
      : `Some checks failed. Those are defects in the output, not opinions about it.\n\n`)
    + `NOT ESTABLISHED by any of the above:\n${r.unqualified.map((u) => `  · ${u}`).join('\n')}\n\n`
    + `So this model is not qualified for discovery; it is qualified to PROPOSE. Its candidates arrive with\n`
    + `evidence you can check, and none of them binds anything until you adopt it.\n`;
}

/**
 * The quote a model supplied, paired with the corpus item it is ACTUALLY in, or null.
 *
 * Lives here rather than in a command because both `discover` and `ratify` need it and it is a
 * thin wrapper on `locateSpan` directly above. It used to sit in the CLI file that held both
 * commands, which is the only reason a single file could hold both.
 */
export const anchoredQuote = (
  quote: string | undefined, items: readonly { id: string; text: string }[],
): { quote: string; itemId: string } | null => {
  const q = (quote ?? '').trim();
  if (!q) return null;
  // SEARCHED ACROSS THE PIECES, not checked against a guess. `readFrom` lists every piece the model
  // read, so its first entry is not the piece the quote came from — measured: a span verbatim in the
  // fourth piece was being tested against the first and discarded. The item the span is actually IN
  // is the item to record, and finding it is what makes `evidenceItemId` a fact rather than an
  // assumption.
  //
  // WHITESPACE_NORMALIZED counts. The corpus is hard-wrapped and a model quotes the sentence, not the
  // line — `locateSpan` already draws that line, and line wrapping is not fabrication.
  for (const i of items) {
    const m = locateSpan(q, i.id, items.map((x) => ({ id: x.id, text: x.text })));
    if (m === 'EXACT' || m === 'WHITESPACE_NORMALIZED') return { quote: q, itemId: i.id };
  }
  return null;
};
