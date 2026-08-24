// atelier/core/intake/package.ts — READING A SKILL THAT ALREADY EXISTS.
//
// PORTED, not rewritten, from the package adapter in the private predecessor (representation
// portability). The mapping rules, the fail-closed discipline and the UNKNOWN verdict are that
// module's; what is new here is the half it always assumed a caller would supply — the convention
// that turns a PATH into a component role. `adaptPackage` takes components already labelled, and
// nothing in the repository labelled them.
//
// ─── WHY THE IMPROVE JOURNEY HAD NOTHING TO READ ───────────────────────────────────────────────
//
// `planImport` selects IMPROVE the moment a SKILL.md is present, and that selection has been live
// and correct for some time. It just had no consumer: `existingSkillId` was computed, printed, and
// read by nothing. Meanwhile intake classified every OTHER file in the folder as a GOLDEN — so
// pointing Atelier at a real skill directory read that skill's own templates and quick-reference as
// "examples of the author's finished work" and induced their taste from material the skill emitted.
// A skill's templates describe the shape it was told to produce. Inferring a standard from them
// measures the previous instruction, then presents it back as the author's judgement.
//
// ─── FAIL CLOSED MEANS NEVER GUESS A KIND. IT DOES NOT MEAN REFUSE THE RUN. ─────────────────────
//
// The original blocks the governed loop on any UNKNOWN component, which is right for its question:
// you cannot reason about whether changing a component preserves the standard if you do not know
// what the component is. Atelier asks a narrower one — which files carry PROSE I may rewrite — and
// every real skill folder contains code (all 39 of our own carry a capabilities.ts). Blocking on it
// would refuse every genuine package.
//
// So the verdict is kept exactly as the original computes it, and the product decides what to do
// with it: unknown components are NAMED, excluded from the improvable surface, and declared
// untouched. No kind is ever inferred. The user is told where Atelier's reach ends rather than
// discovering later that something was edited on a guess.
//
// ─── THE EVALUATOR IS NOT IMPROVABLE, AND THAT IS A TYPE RULE ──────────────────────────────────
//
// `evals/` maps to `evaluator`, and `evaluator` is absent from IMPROVABLE_KINDS by construction.
// The optimizer may change the implementation automatically; it may never change its own objective
// automatically. A search process permitted to edit the thing that scores it will eventually find
// that editing the scorer is the cheapest available improvement, and every metric will confirm the
// win. Leaving that to a convention — "we don't point it at evals" — is leaving it to whoever next
// widens a glob.

/** The closed component vocabulary. PORTED verbatim from evopackage-adapter.ts / types.ts. */
export type ComponentKind =
  | 'skill_methodology' | 'delivery_policy' | 'knowledge_unit' | 'agent_instruction' | 'harness'
  | 'context_assembler' | 'tool_router' | 'runtime_config' | 'memory_policy' | 'threshold' | 'evaluator';

const KNOWN_KINDS: ReadonlySet<ComponentKind> = new Set<ComponentKind>([
  'skill_methodology', 'delivery_policy', 'knowledge_unit', 'agent_instruction', 'harness',
  'context_assembler', 'tool_router', 'runtime_config', 'memory_policy', 'threshold', 'evaluator',
]);

/** Map a raw component role to a known kind, or UNKNOWN (fail closed — no guessing). PORTED. */
export function mapComponentKind(raw: string): ComponentKind | 'UNKNOWN' {
  return KNOWN_KINDS.has(raw as ComponentKind) ? (raw as ComponentKind) : 'UNKNOWN';
}

/**
 * The kinds whose content Atelier may rewrite when it repairs an implementation.
 *
 * `evaluator` is deliberately absent — see the header. `harness`, `tool_router`, `runtime_config`,
 * `memory_policy`, `context_assembler` and `threshold` are absent because they are machinery rather
 * than the standard's carriers: changing them changes what the skill CAN do, not how faithfully it
 * reproduces what the author ratified.
 */
export const IMPROVABLE_KINDS: ReadonlySet<ComponentKind> = new Set<ComponentKind>([
  'skill_methodology', 'agent_instruction', 'delivery_policy', 'knowledge_unit',
]);

/**
 * PATH → ROLE, by convention, for the two package layouts this actually installs beside.
 *
 * Claude Code and Codex skills are a SKILL.md plus optional subdirectories; our own skills add
 * templates/ and evals/. Each entry below is a layout we can point at and check. Anything not
 * matched returns UNKNOWN and is reported rather than assigned — a wrong kind is worse than no
 * kind, because a wrong kind is actionable and silently so.
 *
 * Code is UNKNOWN on purpose. A .ts file may well be load-bearing for the skill, but it is not
 * prose carrying a standard, and Atelier rewriting source is a different product.
 */
export function classifyPackagePath(relPath: string): string {
  const p = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const name = p.split('/').pop() ?? p;
  const top = p.includes('/') ? p.slice(0, p.indexOf('/')).toLowerCase() : '';

  if (/^(skill|agents|claude)\.md$/i.test(p)) return p.toLowerCase() === 'skill.md' ? 'skill_methodology' : 'agent_instruction';
  if (/^quick_?ref(erence)?\.md$/i.test(name) && !p.includes('/')) return 'agent_instruction';

  switch (top) {
    case 'templates': case 'template': return 'delivery_policy';
    case 'references': case 'reference': case 'knowledge': case 'docs': return 'knowledge_unit';
    case 'evals': case 'eval': case 'tests': case 'test': return 'evaluator';
    default: return 'UNKNOWN';
  }
}

export interface AdapterComponent { readonly id: string; readonly rawKind: string; readonly path: string }

export interface AdaptedComponent {
  readonly id: string;
  readonly kind: ComponentKind | 'UNKNOWN';
  readonly path: string;
  /** PORTED: legacy packages carry no record of which standard they were derived from. */
  readonly standardDerivedFrom: 'UNKNOWN_LEGACY';
  /** whether Atelier may rewrite this component's content */
  readonly improvable: boolean;
}

export interface AdaptedPackage {
  readonly skillId: string;
  readonly components: readonly AdaptedComponent[];
  readonly unknownComponents: readonly string[];
  /** PORTED: true iff every component mapped to a known kind. */
  readonly portable: boolean;
  /** PORTED: present iff not portable. */
  readonly blockReason?: string;
  /** what a repair may touch — the product's answer to a non-portable package */
  readonly improvableCount: number;
  readonly summary: string;
}

/**
 * Discover-and-map a package. PORTED from `adaptPackage`, with `improvable` added and the block
 * turned into a declaration (see header). The verdict fields are computed exactly as the original.
 */
export function adaptPackage(skillId: string, raw: readonly AdapterComponent[]): AdaptedPackage {
  const components: AdaptedComponent[] = raw.map((c) => {
    const kind = mapComponentKind(c.rawKind);
    return { id: c.id, kind, path: c.path, standardDerivedFrom: 'UNKNOWN_LEGACY' as const,
      improvable: kind !== 'UNKNOWN' && IMPROVABLE_KINDS.has(kind) };
  });
  const unknown = components.filter((c) => c.kind === 'UNKNOWN').map((c) => c.id);
  const improvableCount = components.filter((c) => c.improvable).length;

  return {
    skillId, components, unknownComponents: unknown,
    portable: unknown.length === 0,
    blockReason: unknown.length ? `FAIL-CLOSED: ${unknown.length} component(s) with unknown semantics — no guessing` : undefined,
    improvableCount,
    summary: summarise(skillId, components, unknown, improvableCount),
  };
}

/** Build the component list for a package rooted at a directory, from its relative file paths. */
export function adaptSkillFolder(skillId: string, relPaths: readonly string[]): AdaptedPackage {
  return adaptPackage(skillId, [...relPaths].sort().map((p) => ({ id: p, rawKind: classifyPackagePath(p), path: p })));
}

function summarise(
  skillId: string, components: readonly AdaptedComponent[], unknown: readonly string[], improvableCount: number,
): string {
  if (!components.length) return `**${skillId}** has no files Atelier can read.`;

  const byKind = new Map<string, number>();
  for (const c of components) if (c.kind !== 'UNKNOWN') byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1);
  const parts = [...byKind.entries()].sort().map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`);

  let out = `Read **${skillId}** — ${components.length} file(s): ${parts.join(', ') || 'none recognised'}.\n`
    + `Atelier can rewrite ${improvableCount} of them.\n`;

  const evals = components.filter((c) => c.kind === 'evaluator').length;
  if (evals) {
    out += `\n${evals} file(s) are how the skill is CHECKED. Atelier reads those and never edits them —\n`
      + `a system allowed to rewrite its own test can always pass it.\n`;
  }
  if (unknown.length) {
    out += `\nOutside Atelier's reach, and left exactly as they are:\n`
      + unknown.map((u) => `  ${u}`).join('\n')
      + `\n  These are not prose carrying your standard, so Atelier will not guess at them or touch them.\n`;
  }
  return out;
}
