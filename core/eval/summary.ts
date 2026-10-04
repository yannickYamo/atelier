// atelier/core/eval/summary.ts — WHAT ONE RUN WAS HELD TO, AND WHAT IT WAS NOT, IN ONE OBJECT AND ONE PANEL.
//
// A run already computes almost everything an evaluation needs; it printed it as loose lines and a details
// file. This gathers it into one versioned object (stored beside the run, carried by `--json`) and renders it as
// a short panel, under the evaluation practice the project holds itself to:
//
//   ONE BINARY RESULT. Conformant or not: any applicable required rule broken, any invented claim delivered, or a
//     claim check that could not run means not conformant. Never an overall score: gates, fidelity and monitors
//     are different kinds of evidence, and adding them up is the trap.
//   GATES are binary and deterministic, or measured: the claim reader is shown with the rates it was measured at
//     and where (planted inventions caught, clean drafts left alone, on what writing).
//   FIDELITY is descriptive, with its baseline and its N: the author's held-back pieces, which built no band, read
//     against the same bands. Never a percentage six pieces cannot support.
//   MONITORS are shown, never gate: the style detector and the taste reader, each with what it has been
//     validated on, or "not validated".
//   NOT MEASURED is said on every run. Admitting the boundary is part of the evaluation.
//
// Everything here is read from the run's record and the skill's stored state; nothing is computed for the panel
// that the record does not hold.

/** The evaluation of one run. `schema` moves when a field's meaning does. */
export interface EvalSummary {
  readonly schema: 1;
  readonly invocationId: string;
  readonly skill: string;
  /** the skill version that ran: the cohort for a skill with no release */
  readonly skillVersion?: string;
  readonly at: string;
  readonly release: string | null;
  readonly model: string | null;
  readonly drafts: number;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly result: { readonly conformant: boolean; readonly reasons: readonly string[] };
  readonly gates: {
    /** `contract`: a structured output, held by its output contract rather than by prose rules */
    readonly required: { readonly held: number; readonly applicable: number; readonly broken: readonly { readonly id: string; readonly detail: string; /** the rule, in short: what c9 is */ readonly label?: string }[]; readonly contract?: boolean };
    readonly claims: {
      readonly state: 'checked' | 'not-checked' | 'off';
      /** invented claims still in the delivered text, and the unconfirmed ones (listed, neither cut nor passed) */
      readonly delivered: number; readonly unconfirmed: number; readonly cut: number; readonly listed: number;
      /** flagged on one of two reads only: listed for the person to check, never cut and never a failure */
      readonly disputed?: number;
      /** the claim reader's repeatability on this text: flags both reads raised, of the flags either raised */
      readonly agreement?: { readonly both: number; readonly either: number } | null;
      readonly instrument: string | null;
      readonly measured: { readonly caught: number; readonly planted: number; readonly leftAlone: number; readonly clean: number; readonly on: string } | null;
      /** for answers: work and result claims are decided by patterns, other specifics are listed */
      readonly answers: boolean;
    };
    readonly copying: { readonly longest: number; readonly limit: number } | null;
    /** `held`: the format's hard limits (the FORMAT line) held; null when the skill measures no format */
    readonly format: { readonly kind: 'none' | 'shape' | 'bare'; readonly words: string | null; readonly withheld: number; readonly held?: boolean | null };
    readonly applicability: { readonly applied: number; readonly notApplicable: number; readonly waived: readonly { readonly id: string; readonly why: string }[] };
  };
  readonly fidelity: {
    readonly inBand: number; readonly measured: number;
    readonly baseline: { readonly medianInBand: number; readonly medianMeasured: number; readonly n: number } | null;
    readonly pieces: number;
    readonly profile: string | null;
    readonly outside: readonly { readonly id: string; readonly label: string; readonly value: number | null; readonly band: readonly [number, number] | null }[];
    readonly facts: { readonly used: number; readonly supplied: number } | null;
    readonly edits: { readonly tried: number; readonly kept: number };
    /** how typical of the author the delivered text is: the share of their own pieces at least as far from the rest */
    readonly typicality?: { readonly p: number; readonly distance: number;
      /** the pieces the reading rests on, and whether those nearest the request counted more */
      readonly pieces?: number; readonly weighted?: boolean;
      /** farther than every piece of the author's: the share says nothing past that, so the panel says this instead */
      readonly beyond?: boolean; readonly farthest?: number } | null;
    /** the rounds written toward a typicality target (`invoke --until-typical`) */
    readonly shape?: { readonly target: number; readonly authorTarget?: number; readonly written: number; readonly kept: number; readonly p: number; readonly author?: number | null } | null;
    /** plan-first: the skeleton's length, and the share of it the delivered text followed */
    readonly structure?: { readonly moves: number; readonly followed: number | null } | null;
    /** a draft drawn among tied ones by density ratio */
    readonly sampled?: { readonly among: number } | null;
    /** held to the author's range on the request's subject (`context=local`): the nearest pieces and how far bands moved */
    readonly context?: { readonly nearest: readonly string[]; readonly nEff: number; readonly lambda: number } | null;
  } | null;
  readonly monitors: {
    readonly detector: { readonly p: number; readonly families: readonly string[]; readonly qualified: boolean | null } | null;
    readonly taste: { readonly followed: number; readonly missed: number; readonly unclear: number; readonly waiting: number;
      readonly labelled: { readonly right: number; readonly of: number } | null; readonly acts: boolean } | null;
  };
  /** the register decision and the voice pass, for a skill whose owner declared the corpus's register */
  readonly voice?: {
    readonly mode: 'off' | 'incontext';
    readonly register: { readonly status: 'in' | 'out' | 'assumed-in'; readonly request: string | null; readonly corpus: readonly string[];
      readonly distance: { readonly value: number; readonly threshold: number; readonly inside: boolean } | null };
    readonly carried: number; readonly notCarried: number;
    readonly passed: number; readonly refused: number;
    readonly bank: string | null; readonly note: string | null;
  };
  /**
   * WHAT THE REQUEST WAS READ AS, AND WHICH OF THE AUTHOR'S PIECES IT WAS MEASURED AGAINST. The register the request
   * names and how that was read; the pieces near its subject, how they were found, how much they amount to, and
   * what the run used them for. Shown on every run of a skill built from a corpus: a reading "against your pieces
   * nearest this request" means little until the person can see which pieces, and how few.
   */
  readonly context?: {
    /** null when the owner has not declared the corpus's register (`atelier voice register`) */
    readonly register: { readonly status: 'in' | 'out' | 'assumed-in'; readonly request: string | null; readonly corpus: readonly string[];
      readonly source: 'declared' | 'keyword' | 'reader' | 'none'; readonly words: string | null } | null;
    readonly subject: {
      readonly source: 'reader' | 'lexical'; readonly reader: string | null; readonly fellBack: string | null;
      readonly near: number; readonly of: number; readonly nEff: number; readonly thin: boolean;
      readonly nearest: readonly { readonly id: string; readonly grade: 'same' | 'related' | null }[];
      readonly usedFor: readonly ('passages' | 'typicality' | 'range' | 'skeleton')[];
    } | null;
  };
  readonly notMeasured: readonly string[];
}

/** Fewer calibration pieces than this and the typical-of-you share is coarse: the panel says the step it moves in. */
export const COARSE_PIECES = 12;

/** The escape character colour codes start with. */
const ESC = String.fromCharCode(27);
/** The two reads' agreement on this text, said plainly. */
export const agreementOf = (a: { both: number; either: number }): string =>
  a.either === 0 ? 'both reads flagged nothing' : `reads agreed on ${a.both} of ${a.either} flag${a.either === 1 ? '' : 's'}`;

const pad = (s: string, n: number): string => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const fmt = (x: number): string => (Math.abs(x) >= 10 ? String(Math.round(x)) : String(Math.round(x * 100) / 100));
const secs = (ms: number): string => (ms >= 10000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);

/** The panel: about twenty lines, plain text, cut to `width` columns. PASS/FAIL tags, so it reads without colour. */
export function renderPanel(e: EvalSummary, opts: { width?: number; color?: boolean } = {}): string {
  const width = Math.max(60, Math.min(opts.width ?? 110, 140));
  const c = (code: string, s: string): string => (opts.color ? `${ESC}[${code}m${s}${ESC}[0m` : s);
  const tag = (ok: boolean | null): string => (ok === null ? c('2', 'n/a ') : ok ? c('32', 'PASS') : c('31', 'FAIL'));
  const out: string[] = [];
  const head = `── Atelier · ${e.skill}${e.release ? ` · release ${e.release.slice(0, 8)}` : ''}${e.model ? ` · ${e.model}` : ''} · ${e.drafts} draft${e.drafts === 1 ? '' : 's'} `;
  const tail = ` $${e.costUsd.toFixed(2)} · ${secs(e.durationMs)} ──`;
  out.push(head + '─'.repeat(Math.max(2, width - head.length - tail.length)) + tail);
  out.push(`  RESULT  ${e.result.conformant ? c('32', 'CONFORMANT') : c('31', 'NOT CONFORMANT')}${e.result.reasons.length ? `: ${e.result.reasons.join('; ')}` : ''}`);
  out.push('');
  out.push('  GATES  binary, every run');
  const g = e.gates;
  const req = g.required;
  if (req.contract) out.push(`  ${tag(null)}  ${pad('required rules', 17)}a structured output: held by its output contract, not by prose rules`);
  else out.push(`  ${tag(req.broken.length === 0)}  ${pad('required rules', 17)}${req.held}/${req.applicable} held${req.broken.length ? `: broken ${req.broken.map((b) => `${b.id}${b.label ? ` "${b.label}"` : ''} (${b.detail})`).join(', ')}` : ''}`);
  const cl = g.claims;
  const reader = cl.measured ? ` · ${cl.instrument ?? 'reader'}: caught ${cl.measured.caught}/${cl.measured.planted} planted, left ${cl.measured.leftAlone}/${cl.measured.clean} clean alone, on ${cl.measured.on}` : cl.instrument ? ` · ${cl.instrument}` : '';
  if (cl.state === 'off') out.push(`  ${tag(null)}  ${pad('invented claims', 17)}not checked: turned off for this run (--allow-unsourced)`);
  else if (cl.state === 'not-checked') out.push(`  ${tag(false)}  ${pad('invented claims', 17)}not checked: the claim reader could not run, so this is not a pass`);
  else out.push(`  ${tag(cl.delivered === 0 && cl.unconfirmed === 0)}  ${pad('invented claims', 17)}${cl.delivered} delivered · ${cl.cut} cut${cl.unconfirmed ? ` · ${cl.unconfirmed} unconfirmed` : ''}${cl.disputed ? ` · ${cl.disputed} disputed (one of two reads flagged it: check before you publish)` : ''}${cl.listed ? ` · ${cl.listed} listed to check` : ''}${cl.agreement ? ` · ${agreementOf(cl.agreement)}` : ''}${cl.answers ? ' · answers: work and results by pattern' : ''}${reader}`);
  if (g.copying) out.push(`  ${tag(g.copying.longest < g.copying.limit)}  ${pad('copying', 17)}longest run shared with your pieces: ${g.copying.longest} words (limit ${g.copying.limit})`);
  const f = g.format;
  out.push(`  ${tag(f.held ?? true)}  ${pad('format', 17)}${f.kind === 'shape' ? `the request's own shape ("${f.words}"): ${f.withheld} presentation rule(s) withheld, by design` : f.kind === 'bare' ? `bare request ("${f.words}"): standard applied in full` : 'no format stated: standard applied in full'}${f.held === false ? ' · the format\'s hard limits are broken' : ''}`);
  const a = g.applicability;
  out.push(`  ${c('2', 'INFO')}  ${pad('applicability', 17)}${a.applied} applied · ${a.notApplicable} not applicable · ${a.waived.length} waived${a.waived.length ? `, each with a reason (${[...new Set(a.waived.map((w) => w.why))].slice(0, 2).join('; ')})` : ''}`);
  if (e.context && (e.context.register || e.context.subject)) {
    const r = e.context.register; const sb = e.context.subject;
    out.push('');
    out.push('  CONTEXT  what this request was read as, and which of your pieces it was measured against');
    if (r) {
      const how = r.source === 'declared' ? 'you declared it (--register)' : r.source === 'reader' ? `the request says "${r.words ?? r.request}"` : r.source === 'keyword' ? 'named in the request, found by word' : '';
      out.push(`    ${pad('register', 18)}${r.request === null ? `none named in the request: taken to be yours (${r.corpus.join(', ')})`
        : `${r.request} (${how}) · your pieces: ${r.corpus.join(', ')} · ${r.status === 'out' ? 'out of register: fidelity to you is not measurable here' : 'in register'}`}`);
    }
    if (sb) {
      const by = sb.source === 'reader' ? `read by subject${sb.reader ? ` (${sb.reader.split(':').slice(1).join(':') || sb.reader})` : ''}` : 'found by shared words';
      out.push(`    ${pad('subject', 18)}${sb.near} of your ${sb.of} pieces ${sb.near === 1 ? 'is' : 'are'} near this request (${fmt(sb.nEff)} effective) · ${by}${sb.fellBack ? ` · the subject reader was not used: ${sb.fellBack}` : ''}`);
      if (sb.nearest.length) out.push(`    ${pad('nearest', 18)}${sb.nearest.map((n) => `${n.id}${n.grade ? ` (${n.grade} subject)` : ''}`).join(' · ')}`);
      const uses: Record<string, string> = { passages: 'the passages shown to the writer', typicality: 'the typical-of-you reading', range: 'your range for the subject', skeleton: 'the plan' };
      if (sb.usedFor.length) out.push(`    ${pad('used for', 18)}${sb.usedFor.map((u) => uses[u]).join(' · ')}`);
      if (sb.thin) out.push(`    ${pad('thin', 18)}${sb.near === 0 ? 'none' : 'only one'} of your pieces is near this subject: the readings below rest on your whole range. More of your writing on it would sharpen them.`);
    }
  }
  if (e.fidelity) {
    const fi = e.fidelity;
    out.push('');
    out.push(`  FIDELITY  descriptive · bands from ${fi.pieces} of your pieces${fi.profile ? ` (profile ${fi.profile.slice(0, 8)})` : ''}`);
    out.push(`    ${pad('in your range', 18)}${fi.inBand} of ${fi.measured} steering features${fi.baseline ? ` · your reserved pieces: median ${fmt(fi.baseline.medianInBand)} of ${fmt(fi.baseline.medianMeasured)} (n=${fi.baseline.n})` : ' · no reserved pieces to compare with'}`);
    if (fi.outside.length) out.push(`    ${pad('furthest outside', 18)}${fi.outside.slice(0, 3).map((o) => `${o.label} ${o.value === null ? '' : fmt(o.value)}${o.band ? ` (yours ${fmt(o.band[0])} to ${fmt(o.band[1])})` : ''}`).join(' · ')}`);
    if (fi.facts) out.push(`    ${pad('facts used', 18)}${fi.facts.used} of ${fi.facts.supplied} supplied`);
    if (fi.edits.tried) out.push(`    ${pad('steering', 18)}${fi.edits.kept} of ${fi.edits.tried} change(s) kept`);
    if (fi.typicality) {
      const t = fi.typicality;
      const basis = `${t.pieces ? ` · read against ${t.pieces} of your pieces${t.pieces < COARSE_PIECES ? `, so it moves in steps of ${Math.round(100 / (t.pieces + 1))}%` : ''}` : ''}${t.weighted ? ' · those nearest this request counted more' : ''}`;
      out.push(t.beyond ? `    ${pad('typical of you', 18)}beyond every piece of yours: distance ${fmt(t.distance)}, your farthest piece ${fmt(t.farthest ?? 0)}${basis}`
        : `    ${pad('typical of you', 18)}as typical as ${Math.round(t.p * 100)}% of your own pieces (distance ${fmt(t.distance)})${basis}`);
    }
    if (fi.shape) {
      const toward = [fi.shape.target ? `${Math.round(fi.shape.target * 100)}% typical` : '', fi.shape.authorTarget ? `P(yours) ${fi.shape.authorTarget}` : ''].filter(Boolean).join(' and ');
      out.push(`    ${pad('shape rounds', 18)}${fi.shape.written} written toward ${toward}; kept round ${fi.shape.kept} (${Math.round(fi.shape.p * 100)}% typical${fi.shape.author !== null && fi.shape.author !== undefined ? `, P(yours) ${fi.shape.author}` : ''})`);
    }
    if (fi.structure) out.push(`    ${pad('structure plan', 18)}${fi.structure.moves} moves from your own pieces${fi.structure.followed === null ? '' : `; the text followed ${Math.round(fi.structure.followed * 100)}% of them`}`);
    if (fi.context) out.push(`    ${pad('range for subject', 18)}moved ${Math.round(fi.context.lambda * 100)}% toward your pieces nearest this request (${fmt(fi.context.nEff)} effective${fi.context.nearest.length ? `, nearest ${fi.context.nearest.slice(0, 3).join(', ')}` : ''}); ratified rules unchanged`);
    if (fi.sampled) out.push(`    ${pad('draft drawn', 18)}from ${fi.sampled.among} tied drafts, in proportion to how likely each is yours`);
  }
  if (e.voice) {
    const v = e.voice; const r = v.register;
    out.push('');
    out.push('  VOICE  below the standard · the register is declared, never detected');
    out.push(`    ${pad('register', 18)}${r.status === 'out' ? `out of register (${r.request} vs ${r.corpus.join(', ')}): ${v.carried} trait(s) carried by your policy, ${v.notCarried} unknown, not carried`
      : r.status === 'in' ? `in register (${r.request})` : `taken to be in register (${r.corpus.join(', ')}): the request names no document type`}${r.distance ? ` · lexical distance ${fmt(r.distance.value)} (your pieces: up to ${fmt(r.distance.threshold)}), a monitor` : ''}`);
    out.push(`    ${pad('voice pass', 18)}${v.mode === 'off' ? 'off' : `in-context pairs${v.bank ? ` (bank ${v.bank.slice(0, 8)})` : ''}: ${v.passed} paragraph(s) rewritten, ${v.refused} refused and kept as written`}${v.note ? ` · ${v.note}` : ''}`);
  }
  const m = e.monitors;
  if (m.detector || m.taste) {
    out.push('');
    out.push('  MONITORS  shown only, never gate');
    if (m.detector) out.push(`    ${pad('style detector', 18)}P(model-written) ${m.detector.p}${m.detector.families.length ? ` · valid for ${m.detector.families.join(', ')}` : ''} · ${m.detector.qualified === true ? 'qualified on the hold-outs atelier qualify could run' : m.detector.qualified === false ? 'did not qualify on held-out data' : 'not qualified yet (atelier qualify)'}`);
    if (m.taste) {
      const t = m.taste;
      const lab = t.labelled ? `its misses right on ${t.labelled.right} of ${t.labelled.of} labelled` : 'not validated: label it with atelier taste --calibrate';
      out.push(`    ${pad('taste reader', 18)}${t.followed} followed · ${t.missed} missed · ${t.unclear} unclear${t.waiting ? ` · ${t.waiting} waiting for material` : ''} · ${lab}${t.acts ? ' · holds VETO' : ''}`);
    }
  }
  out.push('');
  out.push(`  not measured: ${e.notMeasured.join('; ')}`);
  out.push(`  trace: atelier report ${e.invocationId} · over runs: atelier eval --skill ${e.skill} · would you ship it? atelier rate ${e.invocationId} yes|no`);
  return out.flatMap((l) => wrap(l, width)).join('\n');
}

/**
 * A line longer than `width` continues on the next, indented under its value, broken at a " · " or a space:
 * cutting it would cut exactly the part that says how an instrument was validated.
 */
function wrap(line: string, width: number): string[] {
  // A coloured line is measured without its escape codes and left whole: wrapping inside one would split a code.
  if (line.length <= width || line.includes(ESC)) return [line];
  const indent = ' '.repeat(23);
  const out: string[] = [];
  let rest = line;
  while (rest.length > width) {
    const dot = rest.lastIndexOf(' · ', width - 1); const space = rest.lastIndexOf(' ', width - 1);
    const at = dot > indent.length ? dot : space > indent.length ? space : width;
    out.push(rest.slice(0, at).trimEnd());
    rest = indent + rest.slice(at).replace(/^ · |^ /, '');
  }
  out.push(rest);
  return out;
}
