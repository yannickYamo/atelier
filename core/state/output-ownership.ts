// atelier/core/state/output-ownership.ts — THE SKILL'S GUTS ARE NOT PART OF THE USER'S DELIVERABLE.
//
// ─── MEASURED, NOT ANTICIPATED ─────────────────────────────────────────────────────────────────
//
// A blind study of 74 generations found that outputs finished the requested work and then kept
// going — emitting a `# p18` heading and reproducing the skill's own requirement text. 31 outputs
// carried a literal `# pN` line; 10 reproduced a served example instance word for word. The arm
// carrying one extra example did it 59% of the time against the other arm's 29%.
//
// The cause was that reference material was rendered with MARKDOWN HEADINGS. Served as context, a
// heading is not a label — it is a document structure, and the model continued it. The framing
// sentence said "these are instances, not instructions", which settles AUTHORITY and says nothing
// about OUTPUT OWNERSHIP.
//
// ─── WHY A DETECTOR HERE, WHEN THIS PROGRAMME PREFERS ASSEMBLERS ───────────────────────────────
//
// The fix is structural: labels are bracketed, the block is fenced, and it states that the
// deliverable begins after it. That changes what the model is given, which is the durable half.
//
// But no rendering GUARANTEES what a model emits, and the failure is silent — a user reads their
// answer, it looks finished, and the skill's internals sit underneath it. So the served material is
// also checked against what came back. This detector is not standing in for the fix; it is the
// admission that the fix cannot be proven from the input side alone.

/** A marker that only ever appears in Atelier's own reference material. */
const INTERNAL_MARKERS: readonly RegExp[] = [
  /^#+\s*p\d+\s*$/m,                       // the heading form that caused it
  /^\[p\d+\]/m,                            // and the bracketed label that replaced it
  /=== REFERENCE MATERIAL/,
  /=== END REFERENCE MATERIAL/,
  /^observed in the author's work:$/m,
];

export interface OwnershipBreach {
  readonly marker: string;
  /** the line it appeared on, so a report can point at it */
  readonly excerpt: string;
}

/**
 * Did the model reproduce the skill's private context into the work?
 *
 * Checks the OUTPUT only. Served bytes legitimately contain every one of these markers, so passing
 * them in would report a breach on every invocation — the polarity mistake this file is one wrong
 * argument away from.
 */
export function findOwnershipBreaches(output: string): readonly OwnershipBreach[] {
  const out: OwnershipBreach[] = [];
  for (const re of INTERNAL_MARKERS) {
    const m = re.exec(output);
    if (!m) continue;
    const at = output.slice(Math.max(0, m.index - 40), m.index + 90).replace(/\n/g, ' ');
    out.push({ marker: m[0].trim(), excerpt: `…${at}…` });
  }
  return out;
}

/**
 * What a person is told when it happens. NOT a throw.
 *
 * The work has already been generated and paid for; discarding it would cost the user their answer
 * to protect them from a defect that is ours. They get the output and a plain statement that part
 * of it is not theirs, which is the honest division of that problem.
 */
export const describeBreaches = (b: readonly OwnershipBreach[]): string =>
  b.length === 0 ? ''
    : `\n  WARNING: this output contains ${b.length} fragment(s) of the skill's own internals — `
      + `${b.map((x) => `"${x.marker}"`).join(', ')}.\n`
      + '  That is a defect in how the skill was served, not something you asked for. The work above\n'
      + '  is yours; those fragments are not, and they should be deleted before it goes anywhere.\n';
