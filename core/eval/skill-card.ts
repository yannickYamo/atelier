// atelier/core/eval/skill-card.ts — WHAT A SKILL IS HELD TO, SAID ONCE, THE MOMENT IT IS BUILT.
//
// The panel after a run (./summary.ts) says how one output did. This says, once per skill version, what every
// output will be checked by and how far each check can be trusted: the owner's rules (how many are counted and
// how many only read), the invented-claim check with the rates it was measured at, the author's range with its
// out-of-sample baseline, the style detector and the model families it is valid for, the implementation
// release, and what nothing measures. Printed in the terminal at the end of `atelier new … --accept` and
// `build`; stored with the skill version, and served to an agent by `atelier report --skill <name> --json` and
// the MCP tool `atelier_skill_report`. It is never served to the model writing the output: evaluation data in a
// writing prompt is a target to write toward, and a measure written toward stops measuring.

export interface SkillCard {
  readonly schema: 1;
  readonly skill: string;
  readonly skillVersion: string;
  readonly standardVersion: string;
  /** when the version was built; null for a version built before cards were kept */
  readonly builtAt: string | null;
  /** pieces discovery read, and pieces reserved before anything read them (for the blind comparison and the baseline) */
  readonly corpus: { readonly pieces: number; readonly heldBack: number } | null;
  /** whether the skill serves pieces of the author's, so a copied run can be found */
  readonly copying: boolean;
  readonly rules: {
    readonly total: number; readonly required: number; readonly counted: number; readonly read: number;
    readonly conditional: number; readonly needsMaterial: number;
  };
  readonly claims: { readonly instrument: string; readonly qualified: boolean;
    readonly measured: { readonly caught: number; readonly planted: number; readonly leftAlone: number; readonly clean: number; readonly on: string } | null;
    readonly answers: boolean };
  readonly fidelity: {
    readonly profile: string; readonly features: number; readonly steering: number;
    readonly layers: readonly { readonly layer: string; readonly steering: number; readonly monitored: number }[];
    readonly classes: readonly string[];
    readonly baseline: { readonly medianInBand: number; readonly medianMeasured: number; readonly n: number } | null;
    readonly operators: boolean;
    readonly detector: { readonly families: readonly string[]; readonly cvAuc: number | null; readonly qualified: boolean | null } | null;
  } | null;
  readonly release: { readonly id: string; readonly drafts: number; readonly editBudget: number; readonly retrievalK: number; readonly notesCap: number; readonly loop: boolean } | null;
  readonly taste: { readonly rules: number; readonly validated: boolean; readonly labelled: number } | null;
  readonly notMeasured: readonly string[];
  readonly next: readonly string[];
}

const pad = (s: string, n: number): string => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const fmt = (x: number): string => (Math.abs(x) >= 10 ? String(Math.round(x)) : String(Math.round(x * 100) / 100));

/** The card, in the panel's style: plain text, PASS-free (nothing has run yet), wrapped to `width`. */
export function renderSkillCard(c: SkillCard, width = 110): string {
  const w = Math.max(60, Math.min(width, 140));
  const out: string[] = [];
  const head = `── Atelier · skill ${c.skill} · version ${c.skillVersion.slice(0, 8)} · standard ${c.standardVersion.slice(0, 8)} `;
  out.push(head + '─'.repeat(Math.max(2, w - head.length)));
  if (c.corpus) out.push(`  built from ${c.corpus.pieces} of your pieces${c.corpus.heldBack ? `; ${c.corpus.heldBack} more reserved unseen, for a blind comparison and the baseline below` : ''}`);
  out.push('');
  out.push('  EVERY OUTPUT IS CHECKED BY');
  const r = c.rules;
  out.push(`    ${pad('your rules', 18)}${r.total} approved by you: ${r.required} required · ${r.counted} counted on every output · ${r.read} read by the taste reader${r.conditional ? ` · ${r.conditional} apply only under a condition` : ''}${r.needsMaterial ? ` · ${r.needsMaterial} wait for your material` : ''}`);
  const m = c.claims.measured;
  out.push(`    ${pad('invented claims', 18)}${c.claims.instrument}${m ? `: caught ${m.caught}/${m.planted} planted, left ${m.leftAlone}/${m.clean} clean alone, on ${m.on}` : c.claims.qualified ? '' : ': not qualified, so the pattern check decides what is cut'}${c.claims.answers ? ' · answers: work and results by pattern, other specifics listed' : ''}`);
  if (c.copying) out.push(`    ${pad('copying', 18)}a run of 12 or more words shared with your pieces fails`);
  if (c.fidelity) {
    const f = c.fidelity;
    out.push('');
    out.push(`  YOUR RANGE  descriptive, profile ${f.profile.slice(0, 8)}`);
    out.push(`    ${pad('features', 18)}${f.features} measured on your pieces, ${f.steering} steer drafts, the rest monitored`);
    out.push(`    ${pad('by layer', 18)}${f.layers.map((l) => `${l.layer} ${l.steering}/${l.steering + l.monitored}`).join(' · ')}`);
    if (f.classes.length) out.push(`    ${pad('by length', 18)}bands of their own for ${f.classes.join(', ')} pieces, where they qualified`);
    out.push(`    ${pad('baseline', 18)}${f.baseline ? `your reserved pieces sit in range on a median ${fmt(f.baseline.medianInBand)} of ${fmt(f.baseline.medianMeasured)} (n=${f.baseline.n})` : 'none: no reserved piece to compare with (reserve some with atelier new --reserve)'}`);
    out.push(`    ${pad('operators', 18)}${f.operators ? 'effects measured on the model\'s drafts (used when the loop runs: --fidelity, or a release with edits)' : 'not measured: rebuild to use them'}`);
    if (f.detector) out.push(`    ${pad('style detector', 18)}a monitor · cross-validated AUC ${f.detector.cvAuc ?? 'not computed'} · valid for ${f.detector.families.join(', ') || 'the model it was trained against'} · ${f.detector.qualified === true ? 'qualified on the hold-outs atelier qualify could run' : f.detector.qualified === false ? 'did not qualify' : 'not qualified yet (atelier qualify)'}`);
  }
  if (c.release) out.push(`\n  RELEASE ${c.release.id.slice(0, 8)}  ${c.release.drafts} drafts · ${c.release.editBudget} sentence rewrite(s) · ${c.release.retrievalK} passage(s) retrieved · ${c.release.notesCap} note(s)${c.release.loop ? '' : ' · the full loop is opt-in (--fidelity)'}`);
  if (c.taste?.rules) out.push(`  TASTE READER  ${c.taste.rules} rule(s) only a reading can check · ${c.taste.validated ? 'validated by your labels' : `not validated: ${c.taste.labelled} label(s) so far (atelier taste --skill ${c.skill} --calibrate)`}`);
  out.push('');
  out.push(`  not measured: ${c.notMeasured.join('; ')}`);
  out.push(`  next: ${c.next.join(' · ')}`);
  return out.flatMap((l) => wrapLine(l, w)).join('\n');
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const indent = ' '.repeat(22);
  const out: string[] = []; let rest = line;
  while (rest.length > width) {
    const dot = rest.lastIndexOf(' · ', width - 1); const space = rest.lastIndexOf(' ', width - 1);
    const at = dot > indent.length ? dot : space > indent.length ? space : width;
    out.push(rest.slice(0, at).trimEnd());
    rest = indent + rest.slice(at).replace(/^ · |^ /, '');
  }
  out.push(rest);
  return out;
}
