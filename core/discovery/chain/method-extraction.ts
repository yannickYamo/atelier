// PORTED, UNCHANGED. Imports are already siblings in both trees.
//
// The METHODOLOGY channel, and the second half of case 2. The taste channel asks what your work
// implies about your standard; this one asks a question it cannot: **you wrote this method down —
// does your skill actually carry it?** Different failure class, and a more embarrassing one, because
// the expertise exists and simply never reaches the work.
//
// ─── ONE HONEST LIMIT, RECORDED AT THE PORT ────────────────────────────────────────────────────
//
// `findMissingInSkill` detects an obligation by REGEX. A pattern is a proxy for a phrasing and is
// always one phrasing behind: a skill that carries the obligation in different words reads as
// missing it. The error direction is the safe one — over-reporting MISSING is a false alarm, not a
// false clear — but a false alarm still spends the user's attention, and this is exactly the class
// of instrument that looks precise while measuring wording.
//
// So a finding from this module is a CANDIDATE the user confirms, never a fact that drives a repair
// on its own. The model emits each signature WITH the verbatim quote it came from, and
// `validateExtraction` refuses any obligation whose quote is not in the supplied document — which
// bounds INVENTION, not brittleness. Brittleness stays, declared.

/**
 * METHOD EXTRACTION — turning a user's authored methodology into checkable obligations.
 *
 * The methodology channel answers a question the taste channel cannot: **you authored this method;
 * does your skill actually carry it?** That is a different failure class from "your standard is
 * unstated" — it is authored expertise that never reaches the work. Our own audit found 437 of 679
 * authored methodology sections unreachable in any serving context, roughly 143,700 tokens the user
 * was never receiving. Invisible to reading the output; findable only by checking.
 *
 * WHY THIS MODULE EXISTS RATHER THAN A DIRECT WIRE. `sweepMethodologies()` needs a `MethodRegistry`
 * of `MethodSpec`s carrying obligations WITH SIGNATURES. For our own skills those can be authored.
 * For a user's folder they must be derived from their documents, so the methodology channel is a
 * second discovery step — of methods rather than taste — and it deserves its own contract.
 *
 * THE CRITICAL ASYMMETRY, and why this channel is not capped like taste. A taste factor is a
 * HYPOTHESIS about what the expert values, so it is DERIVED_UNRATIFIED and capped at ADVISORY. An
 * authored method is not a hypothesis: the expert already wrote it down. Extraction does not invent
 * authority, it locates authority that already exists. So an extracted method inherits
 * EXPERT_AUTHORED — but ONLY where the extraction is faithful, which is why every obligation must
 * quote the source text it came from. An obligation with no quote is an invention wearing the
 * expert's authority, which is the worst failure this channel can produce.
 *
 * WHAT IS DETERMINISTIC AND WHAT IS NOT:
 *   - the model EXTRACTS obligations and proposes a detection signature   (semantic, checked below)
 *   - PRESENCE is then checked by that signature against the skill text   (deterministic)
 *   - whether the method is the RIGHT one for the situation stays `semanticAppropriateness:
 *     UNCALIBRATED` and never gates — the existing contract already holds that line
 *
 * Pure module — zero I/O, no LLM. A harness makes the call and feeds the result here.
 */
import type { MethodSpec, MethodObligation } from './method-registry.js';
import type { ConstructScope } from './construct-scope.js';

/** What the extractor must return per method it finds in the user's documents. */
export interface ExtractedMethod {
  readonly id: string;
  /** the method in the expert's own terms */
  readonly description: string;
  /** which supplied document it came from */
  readonly sourceDoc: string;
  readonly obligations: readonly {
    readonly id: string;
    readonly describe: string;
    /** a regex that would detect this obligation's trace in a skill or an output */
    readonly signature: string;
    /** REQUIRED — the source sentence this obligation was read from, verbatim */
    readonly quote: string;
  }[];
  /** the expert wrote it down as mandatory vs offered it as an option */
  readonly necessity: 'REQUIRED' | 'OPTIONAL';
}

export interface ExtractionProblem {
  readonly methodId: string;
  readonly problem: string;
}

/**
 * Refuse extractions that would grant the expert's authority to something they did not write.
 * Every problem is a REFUSAL. Structural checks only — quote membership and signature validity,
 * never a judgement about whether the method is any good.
 */
export function validateExtraction(
  methods: readonly ExtractedMethod[],
  docs: ReadonlyMap<string, string>,
): readonly ExtractionProblem[] {
  const problems: ExtractionProblem[] = [];
  for (const m of methods) {
    const source = docs.get(m.sourceDoc);
    if (!source) {
      problems.push({ methodId: m.id, problem: `cites a document that was not supplied: ${m.sourceDoc}` });
      continue;
    }
    if (m.obligations.length === 0) {
      problems.push({ methodId: m.id, problem: 'no obligations — a method with nothing checkable cannot be found missing' });
    }
    for (const o of m.obligations) {
      if (!o.quote?.trim()) {
        problems.push({ methodId: m.id, problem: `obligation ${o.id} carries no source quote — it would wear your authority without being something you wrote` });
        continue;
      }
      // The quote must actually appear in the supplied document. Whitespace-normalised so
      // reflowed markdown does not produce false refusals; otherwise exact.
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!norm(source).includes(norm(o.quote))) {
        problems.push({ methodId: m.id, problem: `obligation ${o.id} quotes text that does not appear in ${m.sourceDoc} — the extraction invented it` });
      }
      try { new RegExp(o.signature, 'i'); }
      catch { problems.push({ methodId: m.id, problem: `obligation ${o.id} has an unusable detection pattern` }); }
    }
  }
  return problems;
}

/**
 * Convert validated extractions into MethodSpecs.
 *
 * Authority is EXPERT_AUTHORED, not DERIVED_UNRATIFIED, and the distinction is load-bearing: the
 * expert wrote this down. Extraction located it; it did not propose it. That is why this channel
 * can reach CORE while a taste hypothesis cannot — and it is exactly why the quote check above is
 * a refusal rather than a warning.
 *
 * @throws when the extraction does not validate — an invented obligation must never silently
 *         acquire the expert's authority.
 */
export function toMethodSpecs(
  methods: readonly ExtractedMethod[],
  docs: ReadonlyMap<string, string>,
  scope: ConstructScope,
): readonly MethodSpec[] {
  const problems = validateExtraction(methods, docs);
  if (problems.length) {
    throw new Error(`method extraction refused:\n  ${problems.map(p => `${p.methodId}: ${p.problem}`).join('\n  ')}`);
  }
  return methods.map((m): MethodSpec => ({
    id: m.id,
    version: '1',
    authority: 'EXPERT_AUTHORED',
    constructScope: scope,
    necessity: m.necessity,
    requiredInputs: [],
    forbiddenContextTags: [],
    obligations: m.obligations.map((o): MethodObligation => ({ id: o.id, describe: o.describe, signature: o.signature })),
    conflictsWith: [],
    provenance: { authoredBy: 'expert', sourceRef: m.sourceDoc },
  }));
}

/** One finding: an authored method whose trace does not appear in the skill. */
export interface MissingMethod {
  readonly methodId: string;
  readonly description: string;
  readonly sourceDoc: string;
  readonly missingObligations: readonly string[];
}

/**
 * Which authored methods leave no trace in the skill text.
 *
 * Deterministic: signature match, nothing more. A method whose obligations are all detectable and
 * all absent is the clean finding — *you wrote this down and your skill does not carry it.*
 * Partial traces are reported too, with which obligations are missing, because a method that is
 * half-present is a different and often more interesting defect than one that is simply absent.
 */
export function findMissingInSkill(
  specs: readonly MethodSpec[],
  skillText: string,
  extracted: readonly ExtractedMethod[],
): readonly MissingMethod[] {
  const byId = new Map(extracted.map(e => [e.id, e]));
  const out: MissingMethod[] = [];
  for (const spec of specs) {
    if (spec.necessity !== 'REQUIRED') continue;      // only what the expert made mandatory
    const missing = spec.obligations
      .filter(o => o.signature && !new RegExp(o.signature, 'i').test(skillText))
      .map(o => o.id);
    if (!missing.length) continue;
    const e = byId.get(spec.id);
    out.push({
      methodId: spec.id,
      description: e?.description ?? spec.id,
      sourceDoc: e?.sourceDoc ?? spec.provenance.sourceRef ?? 'unknown',
      missingObligations: missing,
    });
  }
  return out;
}
