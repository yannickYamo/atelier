// atelier/core/fidelity/provenance.ts — WHERE AN INPUT CAME FROM, AND WHO HAD TO SAY SO.
//
// ─── ORGANIC USE IS CAPTURED AUTOMATICALLY. EVERYTHING ELSE MUST DECLARE ITSELF. ───────────────
//
// This inverts the first version, deliberately. That one defaulted to the weakest grade so nothing
// could drift upward — which is safe and, in practice, useless: it makes the certification-grade
// class the one a person has to remember to mark, on exactly the occasion they are busy doing real
// work and not thinking about evidence. A calibration set nobody remembers to fill is empty.
//
// So the burden moves to the machinery. A harness KNOWS it is a harness and declares itself; a human
// typing `atelier invoke` to get work done does not have to know anything. The failure mode that
// remains — a probe forgetting to declare and contaminating the organic set — is caught by the
// standing rule that every harness in this repo sets ATELIER_PROVENANCE, and by a build test that
// fails if one does not.
//
// AND IT IS STILL NOT DETERMINED BY THE CLI. Running through the real invocation path says how an
// input EXECUTED. Provenance says why it EXISTS. Those were conflated once already, when seven
// stress probes became a "certification-grade" suite because they had been executed properly.

export type Provenance =
  /** a person wanting real work done. The ONLY class that can support a generalisation claim. */
  | 'ORGANIC_USE'
  /** authored while building or debugging Atelier itself. */
  | 'DEV_PROBE'
  /** authored to make a requirement fail, on purpose. */
  | 'STRESS_PROBE'
  /** authored to drive architecture search or repair. */
  | 'OPTIMIZATION_CONTEXT';

/** Only organic use may support a claim that a skill generalises. */
export const CERTIFICATION_GRADE: ReadonlySet<Provenance> = new Set<Provenance>(['ORGANIC_USE']);

export const ALL_PROVENANCE: readonly Provenance[] = ['ORGANIC_USE', 'DEV_PROBE', 'STRESS_PROBE', 'OPTIMIZATION_CONTEXT'];

/** The environment variable every harness must set. Named so a grep finds all of them. */
export const PROVENANCE_ENV = 'ATELIER_PROVENANCE';

/**
 * Resolve provenance for one invocation.
 *
 * Precedence: an explicit flag, then the harness environment, then ORGANIC_USE. The last step is the
 * automatic capture — and it is why every non-organic caller has to be deliberate.
 */
export function resolveProvenance(explicit: string | undefined, env: Record<string, string | undefined>): Provenance {
  const raw = (explicit ?? env[PROVENANCE_ENV] ?? '').trim().toUpperCase();
  if (!raw) return 'ORGANIC_USE';
  const hit = ALL_PROVENANCE.find((p) => p === raw);
  if (!hit) {
    throw new Error(`PROVENANCE: "${raw}" is not one of ${ALL_PROVENANCE.join(' | ')}. A mislabelled input is worse than an unlabelled one, so this refuses rather than guessing.`);
  }
  return hit;
}


/**
 * Was a candidate looked at ONLY by the process that produced it?
 *
 * `promote` refuses a candidate nobody ran, which is the right shape and the wrong strength: it
 * accepts ANY invocation as evidence someone evaluated the thing. A search harness that invokes its
 * own candidate satisfies that gate on its own output. Two observers in the predecessor both
 * declared `OPTIMIZATION_CONTEXT`, so this is a live path and not a
 * hypothetical one.
 *
 * The rule is deliberately narrow. It does NOT say only organic use may promote — that would freeze
 * the target, where a qualified measurement is allowed to promote autonomously. It says a promotion
 * may not rest ENTIRELY on the optimizer's own account of its own work, which stays true whether or
 * not the measurement is later qualified.
 *
 * This is `CERTIFICATION_GRADE`'s first consumer in the product. Until now the taxonomy was declared,
 * tested, and read by nothing — a distinction the system could make and never made.
 */
export function selfEvaluatedOnly(provenances: readonly Provenance[]): boolean {
  return provenances.length > 0 && provenances.every((p) => p === 'OPTIMIZATION_CONTEXT');
}

/** The runs that can anchor a promotion claim, strongest first. Never empty-checks — callers do. */
export function rankForPromotion<T extends { readonly provenance: Provenance }>(runs: readonly T[]): readonly T[] {
  const rank = (p: Provenance): number =>
    CERTIFICATION_GRADE.has(p) ? 0 : p === 'OPTIMIZATION_CONTEXT' ? 2 : 1;
  return [...runs].sort((a, b) => rank(a.provenance) - rank(b.provenance));
}
