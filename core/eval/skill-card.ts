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

import { describeParts, describeSize, type SkillSize } from './size.js';
import { falseFlagPct } from './false-flags.js';

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
  /** the shortest run of words shared with one of the author's pieces that fails as copying (cli/eval-run.ts, `copyLimit`); absent on a card kept before it was */
  readonly copyLimit?: number;
  readonly rules: {
    readonly total: number; readonly required: number; readonly counted: number; readonly read: number;
    readonly conditional: number; readonly needsMaterial: number;
    /** how many the owner wrote themselves (their method's steps, their own words); absent on a card kept before it was counted */
    readonly written?: number;
    /** how many nobody has confirmed: proposed, in the standard, and not yet the owner's */
    readonly unconfirmed?: number;
  };
  readonly claims: { readonly instrument: string; readonly qualified: boolean;
    readonly measured: { readonly caught: number; readonly planted: number; readonly leftAlone: number; readonly clean: number; readonly on: string } | null;
    readonly answers: boolean;
    /** the kind of work, when the claim check was never measured on it: listed, never cut, and no borrowed rates */
    readonly unmeasured?: string | null };
  readonly fidelity: {
    readonly profile: string; readonly features: number; readonly steering: number;
    readonly layers: readonly { readonly layer: string; readonly steering: number; readonly monitored: number }[];
    readonly classes: readonly string[];
    readonly baseline: { readonly medianInBand: number; readonly medianMeasured: number; readonly n: number } | null;
    readonly operators: boolean;
    readonly detector: { readonly families: readonly string[]; readonly cvAuc: number | null; readonly qualified: boolean | null } | null;
    /**
     * The features that steer every draft and are never required (SIGNAL): each with its label, its band (the author's
     * range), how many of the pieces read it was read from, and how well it tells the author's pieces from the model's
     * drafts (the AUC selection kept it on; above 0.5 the author runs higher). Absent on a card kept before it was.
     */
    readonly steered?: readonly SteeredFeature[];
    /** how many steering features the owner made rules of: checked as rules, so not listed among the steered */
    readonly ruled?: number;
  } | null;
  readonly release: { readonly id: string; readonly drafts: number; readonly editBudget: number; readonly retrievalK: number; readonly notesCap: number; readonly loop: boolean } | null;
  readonly taste: { readonly rules: number; readonly validated: boolean; readonly labelled: number } | null;
  /** the voice layer, for a skill whose owner declared the corpus's register */
  readonly voice?: { readonly registers: readonly string[]; readonly carried: number; readonly invariant: number; readonly unknown: number;
    readonly pairs: number | null; readonly mode: 'off' | 'incontext' };
  /** how big the skill is, stored and exported, and where the export's words are (./size.ts); absent when the package is not in the store */
  readonly size?: SkillSize;
  readonly notMeasured: readonly string[];
  readonly next: readonly string[];
}

export interface SteeredFeature {
  readonly id: string;
  readonly label: string;
  readonly unit: 'per1000' | 'share' | 'value';
  readonly band: readonly [number, number];
  readonly n: number;
  readonly auc: number | null;
}

/** How strongly a feature tells the author from the model, in pairs out of 100: 0.5 is none, either side of it is some. */
const pairsOf = (auc: number | null): number => (auc === null ? 0 : Math.round(Math.max(auc, 1 - auc) * 100));
/** One edge of a band as a person reads it: a share in percent, a rate or count never below nothing. */
const edge = (f: SteeredFeature, x: number): string => {
  if (f.unit === 'share') return `${Math.round(Math.min(1, Math.max(0, x)) * 100)}%`;
  const y = f.unit === 'per1000' ? Math.max(0, x) : x;
  return String(Math.abs(y) >= 10 ? Math.round(y * 10) / 10 : Math.round(y * 100) / 100);
};
/** How many pieces a band was read from: "your 24 pieces", or "20 of your 24 pieces". */
const fromPieces = (n: number, pieces: number | null): string => (pieces !== null && n < pieces ? `${n} of your ${pieces} pieces` : `your ${n} piece${n === 1 ? '' : 's'}`);
/** "colons · 0 to 3.2 per 1,000 words · fewer than the model's drafts (82 of 100 pairs)", and where it was read from when that differs from most. */
function steeredLine(f: SteeredFeature, pieces: number | null, usual: number): string {
  const band = `${edge(f, f.band[0])} to ${edge(f, f.band[1])}${f.unit === 'per1000' ? ' per 1,000 words' : ''}`;
  const higher = (f.auc ?? 0.5) >= 0.5;
  const way = f.unit === 'value' ? (higher ? 'higher' : 'lower') : (higher ? 'more' : 'fewer');
  const why = f.auc === null ? 'it tells your pieces from the model\'s drafts' : `${way} than the model's drafts (${pairsOf(f.auc)} of 100 pairs)`;
  return `${f.label} · ${band} · ${why}${f.n === usual ? '' : ` · read from ${fromPieces(f.n, pieces)}`}`;
}

const pad = (s: string, n: number): string => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const fmt = (x: number): string => (Math.abs(x) >= 10 ? String(Math.round(x)) : String(Math.round(x * 100) / 100));

/** The card, in the panel's style: plain text, PASS-free (nothing has run yet), wrapped to `width`. */
/** `next: false` leaves the closing "next" line out, for a caller that ends on its own list of what to do next. */
/** `steered: n` lists at most n steered features and points to `atelier report --skill` for the rest (the build screen). */
export function renderSkillCard(c: SkillCard, width = 110, opts: { next?: boolean; steered?: number } = {}): string {
  const w = Math.max(60, Math.min(width, 140));
  const out: string[] = [];
  const head = `── Atelier · skill ${c.skill} · version ${c.skillVersion.slice(0, 8)} · standard ${c.standardVersion.slice(0, 8)} `;
  out.push(head + '─'.repeat(Math.max(2, w - head.length)));
  if (c.corpus) out.push(`  built from ${c.corpus.pieces} of your pieces${c.corpus.heldBack ? `; ${c.corpus.heldBack} more reserved unseen, for a blind comparison${c.fidelity?.baseline ? ' and the baseline below' : ''}` : ''}`);
  out.push('');
  out.push('  EVERY OUTPUT IS CHECKED BY');
  const r = c.rules;
  // WHO STANDS BEHIND THEM, AS THE STANDARD SAYS: written by the owner, or read from their work (approved, or applied by
  // the build where every example met it), and how many nobody has confirmed. Never "approved by you" for a rule the
  // owner did not rule on.
  const whose = r.written === undefined ? `${r.total} in force`
    : `${r.total} in force (${r.written} written by you, ${r.total - r.written} read from your work${r.unconfirmed ? `, ${r.unconfirmed} not yet confirmed by you` : ''})`;
  out.push(`    ${pad('your rules', 18)}${whose}: ${r.required} required · ${r.counted} counted on every output · ${r.read} read by the taste reader${r.conditional ? ` · ${r.conditional} apply only under a condition` : ''}${r.needsMaterial ? ` · ${r.needsMaterial} wait for your material` : ''}`);
  const m = c.claims.measured;
  out.push(`    ${pad('invented claims', 18)}${c.claims.instrument}${c.claims.unmeasured ? `: ${c.claims.unmeasured}; what it finds is listed, never cut` : m ? `: caught ${m.caught}/${m.planted} planted, left ${m.leftAlone}/${m.clean} clean alone (false flags at most ${falseFlagPct(m)} in 100), on ${m.on}` : c.claims.qualified ? '' : ': not qualified, so the pattern check decides what is cut'}${c.claims.answers ? ' · answers: work and results by pattern, other specifics listed' : ''}`);
  if (c.copying) out.push(`    ${pad('copying', 18)}a run of ${c.copyLimit ?? 12} or more words shared with your pieces fails`);
  if (c.fidelity) {
    const f = c.fidelity;
    out.push('');
    out.push(`  YOUR RANGE  descriptive, profile ${f.profile.slice(0, 8)}`);
    out.push(`    ${pad('features', 18)}${f.features} measured on your pieces, ${f.steering} steer drafts, the rest monitored`);
    out.push(`    ${pad('by layer', 18)}${f.layers.map((l) => `${l.layer} ${l.steering}/${l.steering + l.monitored}`).join(' · ')}`);
    if (f.classes.length) out.push(`    ${pad('by length', 18)}bands of their own for ${f.classes.join(', ')} pieces, where they qualified`);
    out.push(`    ${pad('baseline', 18)}${f.baseline ? `your reserved pieces sit in range on a median ${fmt(f.baseline.medianInBand)} of ${fmt(f.baseline.medianMeasured)} (n=${f.baseline.n})` : (c.corpus?.heldBack ? (f.steering ? `none: no steering feature could be measured on your ${c.corpus.heldBack} reserved piece(s)` : `none: no feature steers drafts yet, so your ${c.corpus.heldBack} reserved piece(s) have nothing to be read against`) : 'none: no reserved piece to compare with (reserve some with atelier new --reserve)')}`);
    out.push(`    ${pad('operators', 18)}${f.operators ? 'effects measured on the model\'s drafts (used when the loop runs: --fidelity, or a release with edits)' : 'not measured: rebuild to use them'}`);
    if (f.detector) out.push(`    ${pad('style detector', 18)}a monitor · cross-validated AUC ${f.detector.cvAuc ?? 'not computed'} · valid for ${f.detector.families.join(', ') || 'the model it was trained against'} · ${f.detector.qualified === true ? 'qualified on the hold-outs atelier qualify could run' : f.detector.qualified === false ? 'did not qualify' : 'not qualified yet (atelier qualify)'}`);
    if (f.steered?.length) {
      // WHAT STEERS, NAMED. Every draft is chosen and pointed toward these bands; none of them fails an output.
      const all = [...f.steered].sort((a, b) => pairsOf(b.auc) - pairsOf(a.auc) || a.id.localeCompare(b.id));
      const shown = all.slice(0, Math.max(0, opts.steered ?? all.length));
      out.push('');
      out.push('  STEERED TOWARD YOUR RANGE ON EVERY DRAFT, NEVER REQUIRED');
      // Where the bands came from, said once: the number of pieces most of them were read from.
      const counts = new Map<number, number>();
      for (const x of all) counts.set(x.n, (counts.get(x.n) ?? 0) + 1);
      const usual = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
      const pieces = c.corpus?.pieces ?? null;
      out.push(`    bands read from ${fromPieces(usual, pieces)}; each acts because it tells your pieces from the model's drafts`);
      for (const x of shown) out.push(`    ${steeredLine(x, pieces, usual)}`);
      if (all.length > shown.length) out.push(`    and ${all.length - shown.length} more: atelier report --skill ${c.skill}`);
      if (f.ruled) out.push(`    ${f.ruled} more steer as your own rules, counted on every output above`);
    }
  }
  if (c.release) out.push(`\n  RELEASE ${c.release.id.slice(0, 8)}  ${c.release.drafts} drafts · ${c.release.editBudget} sentence rewrite(s) · ${c.release.retrievalK} passage(s) retrieved · ${c.release.notesCap} note(s)${c.release.loop ? '' : ' · the full loop is opt-in (--fidelity)'}`);
  if (c.taste?.rules) out.push(`  TASTE READER  ${c.taste.rules} rule(s) only a reading can check · ${c.taste.validated ? 'validated by your labels' : `not validated: ${c.taste.labelled} label(s) so far (atelier taste --skill ${c.skill} --calibrate)`}`);
  if (c.voice) {
    const v = c.voice;
    out.push(`  VOICE  written in: ${v.registers.join(', ')}`);
    out.push(`    ${pad('out of register', 18)}${v.carried} trait(s) carry (${v.invariant} measured across registers, ${v.carried - v.invariant} by your ruling), ${v.unknown} do not`);
    out.push(`    ${pad('voice pass', 18)}${v.mode === 'incontext' ? 'on' : 'off'}${v.pairs === null ? ' · no pair bank (atelier voice pairs)' : ` · ${v.pairs} pair(s) in the bank`}`);
  }
  if (c.size) {
    out.push('');
    out.push(`  SIZE  ${describeSize(c.size)}`);
    out.push(`    ${pad('the export', 18)}${describeParts(c.size)}`);
    out.push(`    ${pad('per run', 18)}what a run sent, and what it cost by purpose: atelier report <run>`);
  }
  out.push('');
  out.push(`  not measured: ${c.notMeasured.join('; ')}`);
  if (opts.next !== false) out.push(`  next: ${c.next.join(' · ')}`);
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
