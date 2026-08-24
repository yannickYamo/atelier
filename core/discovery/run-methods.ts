// atelier/core/discovery/run-methods.ts — THE METHODOLOGY CHANNEL, WIRED TO A REAL MODEL.
//
// `method-extraction.ts` is pure: it validates an extraction, converts it to specs, and checks which
// specs leave no trace in a skill. It never makes the call. This is the only place that does, which
// is why the module could move into the product unchanged.
//
// ─── WHAT THIS ANSWERS THAT DISCOVERY CANNOT ───────────────────────────────────────────────────
//
// Discovery reads finished work and infers what the author values. It has nothing to say about a
// method the author already WROTE DOWN, because a written method is not a hypothesis to be inferred
// — it is authority that already exists, sitting in a document, possibly reaching nothing. That is
// a different and more tractable failure than an unstated standard: there is no inference step to
// get wrong, only a check to run.
//
// ─── THE MODEL EMITS PHRASES; THE SERVER COMPOSES THE PATTERN ──────────────────────────────────
//
// The ported module detects an obligation with a regex, and the historical design had the model
// author that regex. Two problems with asking for one. It hands the model a job it does badly —
// `validateExtraction` has an explicit refusal for "unusable detection pattern", which exists
// because this happens. And a regex is unreadable to the person whose methodology it claims to
// detect, so the one reviewer who could tell that the pattern is too narrow cannot see it.
//
// So the model emits ALTERNATIVE PHRASINGS as typed strings and the server escapes and alternates
// them. Same detector, three differences that matter: an unusable pattern is now impossible rather
// than refused, the brittleness is legible to the user, and a missed phrasing is fixed by adding a
// phrase instead of editing a regex. The proxy is still a proxy — it is one phrasing behind by
// construction — but it is now a proxy someone can audit.
//
// ─── IDS AND SOURCE ATTRIBUTION ARE THE SERVER'S ───────────────────────────────────────────────
//
// The model never supplies `sourceDoc` or any id. It is given ONE document and its output is
// attributed to that document by the caller. A model-supplied sourceDoc can only ever agree with
// what we already know or be wrong, and `validateExtraction` would then refuse a good extraction for
// a labelling mistake — a refusal about bookkeeping wearing the appearance of a refusal about
// authority.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import {
  validateExtraction, toMethodSpecs, findMissingInSkill,
  type ExtractedMethod, type ExtractionProblem, type MissingMethod,
} from './chain/method-extraction.js';
import type { MethodSpec } from './chain/method-registry.js';
import type { ConstructScope } from './chain/construct-scope.js';
import { asText, asTextList } from './text.js';

export const EXTRACTOR_SYSTEM = `You are given ONE document in which an expert wrote down how they work.

Find the METHODS it lays down — the things it says must (or may) be done, not the things it merely
describes. For each one give:

  DESCRIPTION   the method in the author's own terms, one sentence
  NECESSITY     REQUIRED if the document states it as mandatory, OPTIONAL if it is offered as a choice
  OBLIGATIONS   the individual checkable commitments the method imposes

For each obligation give:
  DESCRIBE      what must be done, one sentence
  QUOTE         the sentence from the document this obligation comes from, VERBATIM and complete.
                Copy it exactly. If you cannot quote it, do not report the obligation.
  PHRASES       3 to 6 short phrases that would appear in a skill that carries this obligation.
                Include the author's own wording AND plausible paraphrases someone else would use.
                These are used to detect the obligation in other documents, so a phrase that is too
                generic ("the user", "important") makes the check useless.

Report ONLY what the document actually commits to. A method you infer, or that seems sensible but is
not written here, is the one thing this must never produce — it would carry the author's authority
without being something they wrote.`;

export const EXTRACTOR_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    methods: {
      type: 'array', minItems: 0, maxItems: 12,
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          necessity: { type: 'string', enum: ['REQUIRED', 'OPTIONAL'] },
          obligations: {
            type: 'array', minItems: 1, maxItems: 8,
            items: {
              type: 'object',
              properties: {
                describe: { type: 'string' },
                quote: { type: 'string' },
                phrases: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'string' } },
              },
              required: ['describe', 'quote', 'phrases'], additionalProperties: false,
            },
          },
        },
        required: ['description', 'necessity', 'obligations'], additionalProperties: false,
      },
    },
  },
  required: ['methods'], additionalProperties: false,
};

/**
 * Escape a phrase and alternate it with the others. Word-bounded so "test" does not match "latest".
 *
 * SEPARATORS ARE FLEXIBLE, AND THAT IS NOT COSMETIC. Checked against a real pair — one skill's
 * quick-reference against that skill's own SKILL.md — the detector reported "tag every claim as
 * Known or Assumed" MISSING from a document containing `Assumed-tagged with the reasoning`. The
 * obligation was carried; a hyphen defeated `Assumed\s+tag`. Prose hyphenates, slashes and
 * comma-splices the same words freely, so a space-only separator measures typography.
 *
 * This narrows the proxy; it does not fix it. The same check reported the signal-weighting
 * obligation missing from a skill that says `Behavioral data: highest weight` — the phrases were
 * "behavioral data first" and "evidence hierarchy", and no separator rule reaches that. A pattern is
 * one phrasing behind by construction, which is why these are candidates for a person to confirm.
 */
export function signatureFrom(phrases: readonly string[]): string {
  const parts = phrases
    .map((p) => p.trim()).filter((p) => p.length >= 3)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s\\-\u2013\u2014/:,]+'));
  // No usable phrase means no detector. Returning a pattern that matches everything would report the
  // obligation present in every skill; one that matches nothing would report it missing in every
  // skill. Both are worse than declining, which is what the empty string does downstream.
  if (!parts.length) return '';
  return `\\b(?:${parts.join('|')})`;
}

export interface MethodRun {
  readonly methods: readonly ExtractedMethod[];
  readonly specs: readonly MethodSpec[];
  /** authored, REQUIRED, and leaving no trace in the skill — candidates, not verdicts */
  readonly missing: readonly MissingMethod[];
  /** extractions refused for inventing something the document does not say */
  readonly problems: readonly ExtractionProblem[];
  readonly docsRead: number;
  readonly costUsd: number;
}

/**
 * Extract the author's methods from their documents and check the skill against them.
 *
 * One call per document, not one over all of them. The quote check is per-document, so pooling them
 * would let an obligation quote document A while claiming document B and pass — and each document
 * is the expensive half of its own call, so per-document keeps the cache boundary where the bytes
 * are.
 */
export async function runMethodExtraction(
  client: InferenceClient, budget: Budget,
  docs: ReadonlyMap<string, string>, skillText: string, scope: ConstructScope,
): Promise<MethodRun> {
  const before = budget.spentUsd;
  const extracted: ExtractedMethod[] = [];

  for (const [docId, text] of [...docs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const r = await spend(budget, 0.15, async () => {
      const x = await client.complete({
        stableBlock: `## THE DOCUMENT\n\n${text}`, variableBlock: EXTRACTOR_SYSTEM,
        userMessage: 'Extract the methods now.', toolName: 'emit_methods',
        toolDescription: 'Emit the methods this document lays down.',
        schema: EXTRACTOR_SCHEMA, maxTokens: 4000,
      });
      return { value: x, cost: x.cost };
    });

    const raw = (r.json as { methods?: Record<string, unknown>[] } | null)?.methods ?? [];
    raw.forEach((m, i) => {
      const obligations = ((m.obligations as Record<string, unknown>[]) ?? []).map((o, j) => ({
        id: `${docId}#m${i + 1}o${j + 1}`,
        describe: asText(o.describe),
        signature: signatureFrom(asTextList(o.phrases)),
        quote: asText(o.quote),
      })).filter((o) => o.describe && o.signature);
      if (!obligations.length) return;   // nothing checkable — see validateExtraction's own refusal
      extracted.push({
        id: `${docId}#m${i + 1}`,
        description: asText(m.description),
        sourceDoc: docId,                                    // the server's, never the model's
        obligations,
        necessity: m.necessity === 'OPTIONAL' ? 'OPTIONAL' : 'REQUIRED',
      });
    });
  }

  // REFUSE THE INVENTED ONES, KEEP THE REST. `toMethodSpecs` throws on any problem, which is right
  // for its caller — a batch that partly invents authority should not convert wholesale. But one
  // hallucinated quote in a document of eight real methods should not discard the seven, so the
  // offending METHODS are dropped and reported, and the remainder converts.
  const problems = validateExtraction(extracted, docs);
  const bad = new Set(problems.map((p) => p.methodId));
  const clean = extracted.filter((m) => !bad.has(m.id));

  const specs = clean.length ? toMethodSpecs(clean, docs, scope) : [];
  return {
    methods: clean, specs,
    missing: findMissingInSkill(specs, skillText, clean),
    problems, docsRead: docs.size, costUsd: budget.spentUsd - before,
  };
}

/** What the user reads. Findings are candidates: the detector measures wording, not meaning. */
export function describeMethodRun(run: MethodRun): string {
  if (!run.methods.length) {
    return run.docsRead
      ? `Read ${run.docsRead} methodology document(s) and found nothing stated as a commitment — they describe rather than instruct.`
      : 'No methodology documents were supplied, so there was nothing to check the skill against.';
  }

  const obligations = run.methods.reduce((n, m) => n + m.obligations.length, 0);
  let out = `From ${run.docsRead} document(s) you wrote: **${run.methods.length} method(s)**, `
    + `${obligations} checkable commitment(s).\n`;

  if (!run.missing.length) {
    out += `\nEvery one of them leaves a trace in your skill. Nothing you wrote down has gone missing.\n`;
  } else {
    out += `\n**${run.missing.length} method(s) you wrote down leave no trace in your skill:**\n\n`;
    for (const m of run.missing) {
      out += `  ${m.description}\n    from ${m.sourceDoc} — ${m.missingObligations.length} commitment(s) not found\n`;
    }
    out += `\nThese are candidates, not verdicts. The check looks for the WORDING of a commitment, so a\n`
      + `skill that carries one in different words will show up here. Read them and say which are real.\n`;
  }

  if (run.problems.length) {
    out += `\nDropped ${run.problems.length} extraction(s) that quoted text your documents do not contain.\n`
      + `An obligation with no quote would carry your authority without being something you wrote.\n`;
  }
  return out;
}
