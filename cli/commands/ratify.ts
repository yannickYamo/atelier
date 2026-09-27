// cli/commands/ratify.ts — THE HUMAN DECISIONS ON PROPOSED RULES.
//
// These five commands used to live in discover.ts, which meant a file named for discovery held
// seven commands and five of them were ratification. The dispatcher in atelier.mts said so
// plainly: it imported `discover, pending, ratifyBatch, ratifyOne, addOne, ratifyClose` from one
// place. Every other command in this tree has its own file.
//
// The separation is not only tidiness. Discovery is what the MACHINE proposes; everything here is
// what a PERSON decides, and the ledger written in this file is the one artifact that cannot be
// reconstructed from anything else in the store. Keeping the two jobs in one file made it easy to
// read a machine proposal and a human ruling as steps in a single automated flow. They are not.

import { suggest } from '../../core/ratification/suggest.js';
import { validateMeasurement, observerFor } from '../../core/observers/registry.js';
import type { Measurement, ObserverId } from '../../core/state/canonical-state.js';
import { renderRatifyPage } from '../../renderers/ratify-page/render.js';
import { coverageOf, describeCoverage } from '../../core/coverage/standard-coverage.js';
import { blindSpotsOf, BLIND_SPOT_QUESTION } from '../../core/coverage/blind-spot.js';
import type { StandardVersion, Requirement } from '../../core/state/canonical-state.js';
import { discoveryRecall, declaredGeneralShare, unconfirmedRate, authorityStateOf, isGeneralScope, sourceModeOf } from '../../core/state/canonical-state.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { sha, die, argv, flag, loadSession, saveSession, step, runFile, authoredIdAllocator, type Session } from '../runtime.js';
import { existsSync } from 'node:fs';
import { readJson } from '../../core/state/read-json.js';
import { decide, type DecisionVerb } from '../../core/ratification/authority.js';
import { roleFor } from '../../core/architecture/compile.js';
import { draftHash, appendDecision, stampVersion, survival, type RatificationLedger, type RatificationRecord } from '../../core/ratification/decision-record.js';

/**
 * Batch SUBMISSION, never batch approval.
 *
 * Twelve separate commands is a protocol, not an experience — but the reason for one-at-a-time was never
 * the command count, it was that a single undifferentiated yes lets model confidence become authority.
 * So the batch is accepted only if it carries a decision for EVERY outstanding proposal. Convenience for
 * the assistant; no shortcut for the human.
 */
export function pending(): void {
  const s = loadSession();
  const done = new Set(s.decided.map((d) => d.requirementId));
  const left = s.proposals.filter((p) => !done.has(p.requirementId));
  if (!left.length) { console.log('Nothing pending. Run `atelier ratify --decisions <json>`.'); return; }
  if (argv.includes('--json')) { console.log(JSON.stringify(left, null, 1)); return; }

  console.log(`${left.length} proposed rule(s). None of them are yours until you say so.\n`);
  for (const p of left) {
    const cond = isGeneralScope(p.appliesWhen) ? '' : `\n    when: ${p.appliesWhen}`;
    console.log(`[${p.requirementId}] ${p.kind === 'BOUNDARY' ? 'AVOIDS' : 'DOES'}\n    ${p.statement}${cond}`);
    if (p.evidence) console.log(`    from ${p.evidenceItemId ?? 'your work'}: "${p.evidence.slice(0, 140)}${p.evidence.length > 140 ? '…' : ''}"`);
    // The counterfactual, shown BESIDE the claim. "Yes, that's me" is easy to say about anything;
    // "no, I'd still do that" is a real disagreement, and this is the line that makes it available.
    if (p.wouldBeAbsentIf) console.log(`    if you did NOT do this, I'd expect: ${p.wouldBeAbsentIf}`);
    console.log('');
  }
  // ── WHAT IS KNOWN, AND WHAT THE STANDARD DOES NOT EXPLAIN ───────────────────────────────
  //
  // Per-requirement coverage says how well each proposal is supported. It is structurally blind to
  // the failure that produced this product's own first standard: eight requirements, every one well
  // evidenced, and the whole of form, register and lexis unmentioned because one discovery vantage
  // cannot see the layer it excludes. So both signals print, and the second is the one that matters
  // when every proposal looks good.
  const cov = coverageOf(left, (r) => ({
    supportingUnitIds: r.evidenceItemId ? [r.evidenceItemId] : [],
    counterUnitIds: [], contextIds: r.evidenceItemId ? [r.evidenceItemId] : [],
    clusterIds: r.evidenceItemId ? [r.evidenceItemId] : [],
    // From discovery's own record rather than hardcoded empty: the union's grouping and the held-out
    // recurrence were computed, documented as what this view orders by, and dropped before it.
    boundaryProbed: false, heldOutRecurrence: s.proposalMeta?.[r.requirementId]?.heldOut?.present ?? 0,
    framingsFound: [...(s.proposalMeta?.[r.requirementId]?.framings ?? [])],
    hasCounterfactual: r.wouldBeAbsentIf !== null }));
  console.log(`\n${describeCoverage(cov)}`);
  // Clusters of observed-but-unexplained behaviour come from the discovery union, which this
  // command does not hold. Passing an empty list therefore reports NOT COMPUTED — never all-clear.
  const spots = blindSpotsOf('draft', [], 4);
  console.log(`  ${spots.computed ? spots.why : spots.why}`);
  console.log(`  Before you approve any of these: ${BLIND_SPOT_QUESTION}\n`);

  console.log('For each: APPROVE · REWRITE (in their words) · CONTEXTUAL (when does it hold?) · REJECT');
  console.log('Read the "if you did NOT do this" line before approving — agreeing with the rule is easy,');
  console.log('and disagreeing with what it predicts about you is the check that actually separates them.');
  console.log('Then ask, for every rule they keep: "When do you deliberately NOT do this?"');
  // ── AND ASK FOR THE SHAPE, WHERE THERE IS ONE ────────────────────────────────────────────
  //
  // Printed here because the only person who knows whether a rule is about a SHAPE is the author, and
  // this is the moment they are already deciding what each rule obliges. Without the prompt the field
  // stayed empty on every real run and the strongest carrier in the system was never once used.
  console.log('');
  console.log('Each rule they keep needs two more answers, and the second one is what the compiler uses:');
  console.log('  materiality  REQUIRED · PREFERRED · EXEMPLAR_ONLY · TOLERATED · INCIDENTAL');
  console.log('  form         STRICT · FUNCTIONALLY_EQUIVALENT · FLEXIBLE');
  console.log('');
  console.log('If a REQUIRED rule is really about the SHAPE of the output, pass a `shape` with it and the');
  console.log('runtime will hold that shape instead of asking the model to. It is the one thing here that');
  console.log('cannot be half-satisfied.');
  console.log('  {"id":"p3","decision":"APPROVE","materiality":"REQUIRED",');
  console.log('   "shape":{"verdict":{"type":"string"},"confidence":{"type":"number"}}}');
}

/**
 * Batch SUBMISSION, never batch approval.
 *
 * Twelve separate commands is a protocol, not an experience — but the reason for one-at-a-time was never
 * the command count, it was that a single undifferentiated yes lets model confidence become authority.
 * So the batch is accepted only if it carries a decision for EVERY outstanding proposal. Convenience for
 * the assistant; no shortcut for the human.
 */

/**
 * THE LEDGER, WHICH IS NOT `decided`.
 *
 * `decided` is the outcome and it is rewritten in place. The ledger records the human ACT: what was
 * on screen, what they did about it, and when. The module doing that shipped with the first version
 * and was reachable from nothing but its own tests, so every ratification this product has ever
 * collected — the only genuine human adjudication it has — went unrecorded and had to be
 * reconstructed afterwards from gaps in the requirement ids.
 *
 * Anchored to a hash of the exact proposal set. A different set of proposals is a different draft,
 * and decisions from the old one do not carry into it.
 */
const ledgerFor = (s: Session): RatificationLedger => {
  const hash = draftHash(s.proposals);
  return s.ledger?.standardDraftHash === hash ? s.ledger : { standardDraftHash: hash, records: [] };
};

/**
 * The author's vocabulary is not the ledger's, and the gap is meaningful.
 *
 * APPROVE-with-materiality is two answers, and three of the five materialities say "this is mine and
 * it is not an obligation". That is precisely `DECIDED_NOT_A_REQUIREMENT`, which exists because
 * mapping every non-requirement onto DEFER once reported a finished pass as 45% done.
 */

/**
 * One author's answer about one proposed rule.
 *
 * Typed rather than `Record<string, string>` because `shape` is an object, and the loose record was
 * the reason a shape could not be passed at all: every value had to be a string, so the one field that
 * carries a JSON Schema fragment had nowhere to live.
 */
export interface RatificationDecision {
  readonly id?: string;
  readonly decision?: string;
  readonly materiality?: string;
  readonly form?: string;
  /** field name to JSON Schema fragment. Only meaningful on a REQUIRED rule. */
  readonly shape?: Record<string, unknown> | string;
  /**
   * the id of the rule this one is a way of carrying out.
   *
   * Set it and the question changes. A realization is not asked whether it is REQUIRED — its parent
   * already carries the obligation, and giving the form a second materiality would issue two commands
   * for one choice. It is asked how tightly the FORM binds, which is `form`.
   */
  readonly realizes?: string;
  readonly statement?: string;
  readonly appliesWhen?: string;
  readonly kind?: string;
  /**
   * what following this rule truthfully needs from the person — "the real figures for the period".
   * Becomes a prerequisite: invoke refuses a REQUIRED rule whose material is not bound, and a host
   * reading the skill is told to ask for it rather than invent it.
   */
  readonly needs?: string;
  /** a measurement for this rule in `--measure` syntax, or "none" to drop the one it has */
  readonly measure?: string;
  /** what the review screen suggested for this proposal, carried into the ledger beside the ruling */
  readonly suggested?: { readonly decision: string; readonly materiality: string | null; readonly why: string } | null;
}

/** "The real figures for the quarter" → "real-figures-quarter": what `--with <name>=<file>` binds. */
export const prerequisiteName = (why: string): string => {
  const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'and', 'or', 'in', 'on', 'with', 'from', 'my', 'our', 'your', 'their', 'any', 'some']);
  const words = why.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  return words.slice(0, 4).join('-') || 'material';
};


/**
 * A proposer's quote, kept only when it is genuinely in the piece it names.
 *
 * The EXAMPLE carrier's whole argument is that showing beats telling, and until this it had nothing
 * to show — every compiled example carried the rule's description, so the carrier was telling. A
 * quote that does not appear in the source would be worse than none: an invented instance with a
 * citation, which is the failure this programme has already paid for at the evidence layer.
 */

export function ratifyBatch(): void {
  const s = loadSession();

  // ── A PAGE, WHEN THERE IS TOO MUCH TO HOLD IN A SCROLLBACK ───────────────────────────────────
  //
  // Ratification is the one step a machine may not do, and it was the worst served: twenty
  // proposals scrolling past, each needing a five-way judgment, with the evidence for each one
  // somewhere further up the buffer. `--page` writes the same decisions as a document where the
  // proposal and the quotation it came from sit together, and hands back exactly the JSON
  // `--decisions` accepts. Nothing is sent anywhere.
  const pageOut = flag('--page');
  if (pageOut !== undefined) {
    const decidedSoFar = new Set(s.decided.map((d) => d.requirementId));
    const pending = s.proposals.filter((p) => !decidedSoFar.has(p.requirementId));
    if (!pending.length) return void die('nothing is awaiting a ruling.');
    writeAtomic(pageOut, renderRatifyPage(pending, {
      corpusHash: s.evidence?.corpusHash ?? 'unknown',
      workType: s.evidence?.workType ?? 'work',
      itemCount: s.evidence?.items?.length ?? 0,
      // Said on the page rather than assumed: a run that fell back to a single pass has checked
      // nothing against unread work, and the reader is entitled to know that while reading.
      heldOutChecked: (s.run as { heldOutChecked?: boolean } | undefined)?.heldOutChecked !== false,
      // The same suggestions the terminal screen shows, pre-selected: one review, two surfaces.
      suggestions: Object.fromEntries(pending.map((p) => {
        const x = suggest(p, s.proposalMeta?.[p.requirementId], s.intent?.mode ?? 'GENERATE');
        return [p.requirementId, { value: x.decision === 'REJECT' ? 'REJECT' : x.materiality ?? 'PREFERRED', why: x.why, needs: x.needs,
          measures: p.measurement ? observerFor(p.measurement.observer).describe(p.measurement.params) : null }];
      })),
    }));
    console.log(`${pending.length} proposal(s) written to ${pageOut}`);
    console.log('Open it, rule on each one, then press Copy rulings and pass them back:');
    console.log("  atelier ratify --decisions '<paste>'");
    return;
  }

  const raw = flag('--decisions') ?? die('--decisions <json> required — array of '
    + '{id, decision, materiality?, form?, shape?, statement?, appliesWhen?, kind?, needs?}'
    + '\n  Or write a page you can read and mark up:  atelier ratify --page rulings.html');
  let list: RatificationDecision[];
  try { list = JSON.parse(raw) as RatificationDecision[]; } catch { return void die('--decisions is not valid JSON.'); }
  applyDecisions(list);
}

/**
 * Every outstanding proposal, ruled on at once. The batch command, the review screen and the page all
 * land here, so there is one place a decision becomes part of a standard.
 */
/** What the person decided, beside what they were offered, for the ledger. */
const rulingOf = (d: RatificationDecision, materiality: string | null): NonNullable<RatificationRecord['ruling']> => {
  const dec = (d.decision ?? '').toUpperCase();
  const sug = d.suggested ?? null;
  const took = !sug ? 'NO_SUGGESTION'
    : (sug.decision === dec || (sug.decision === 'APPROVE' && dec !== 'REJECT')) && (dec === 'REJECT' || sug.materiality === materiality)
      ? 'SUGGESTION' : 'OVERRIDE';
  return { materiality, needs: d.needs?.trim() ? d.needs.trim() : null, suggested: sug, took };
};

export function applyDecisions(list: readonly RatificationDecision[]): void {
  const s = loadSession();
  const decidedIds = new Set(s.decided.map((d) => d.requirementId));
  const outstanding = s.proposals.filter((p) => !decidedIds.has(p.requirementId)).map((p) => p.requirementId);
  const given = new Set(list.filter((d) => d.id !== 'new' && d.decision).map((d) => d.id!));
  const missing = outstanding.filter((id) => !given.has(id));
  if (missing.length) {
    die(`no decision for ${missing.length} rule(s): ${missing.join(', ')}. Every proposal needs its own answer — `
      + 'a batch with gaps would let the unanswered ones through on the strength of the answered ones.');
  }

  const decided = [...s.decided];
  let ledger = ledgerFor(s);
  const decidedAt = new Date().toISOString();
  const nextId = authoredIdAllocator(s);
  let added = 0;
  for (const d of list) {
    const dec = (d.decision ?? '').toUpperCase();
    if (dec === 'ADD') {
      added++;
      const base: Requirement = { requirementId: nextId(), statement: d.statement ?? die('ADD needs --statement'), appliesWhen: d.appliesWhen ?? 'GENERAL',
        kind: (d.kind ?? 'BOUNDARY') as Requirement['kind'], authority: 'DERIVED_UNRATIFIED', provenance: 'EXPERT_ADDED', evidence: null, evidenceItemId: null,
        wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null };   // a person stating their own rule owes no counterfactual to a machine
      try { decided.push(decide(base, { verb: 'ADD', materiality: d.materiality, form: d.form }).requirement); }
      catch (e) { return void die((e as Error).message); }
      continue;
    }
    const p = s.proposals.find((x) => x.requirementId === d.id);
    if (!p) die(`no proposal ${d.id}`);
    if (dec === 'REJECT') {
      decided.push({ ...p!, authority: 'EXPERT_REJECTED' });
      ledger = appendDecision(ledger, p!, 'REJECT', { note: d.statement, decidedAt, ruling: rulingOf(d, null) });
      continue;
    }
    if (!['APPROVE', 'REWRITE', 'CONTEXTUAL'].includes(dec)) die(`${d.id}: unknown decision "${dec}"`);

    // ── ONE FUNCTION RULES, EVERYWHERE ───────────────────────────────────────────────────────
    //
    // Materiality/form/shape/realizes validation, the public-source ceiling, and the ledger verb all
    // live in `decide` now — the batch used to be the only route that validated, which is exactly
    // how `ratify-one` drifted into accepting anything and skipping the ceiling.
    let outcome;
    try {
      outcome = decide(p!, { verb: dec as DecisionVerb, statement: d.statement, appliesWhen: d.appliesWhen,
        ...(d.measure === undefined ? {} : { measurement: d.measure.trim().toLowerCase() === 'none' ? null : parseMeasure(d.measure) }),
        materiality: d.materiality, form: d.form, shape: d.shape, realizes: typeof d.realizes === 'string' ? d.realizes : null,
        findRule: (rid) => s.proposals.find((x) => x.requirementId === rid) ?? decided.find((x) => x.requirementId === rid) });
    } catch (e) { return void die((e as Error).message); }
    // WHAT THIS RULE NEEDS FROM THE PERSON, DECLARED AT THE MOMENT THEY APPROVE IT. The anti-
    // fabrication guard (`checkSatisfiable`) had a reader in invoke and a display in plan, and the only
    // writer in the tree was a test fixture: a rule like "quantify with the awkward real figure" was
    // approved, served, and satisfied with invented figures. The name is what `--with <name>=<file>`
    // binds at invocation.
    if (d.needs?.trim()) {
      const why = d.needs.trim();
      outcome = { ...outcome, requirement: { ...outcome.requirement,
        prerequisites: [{ kind: 'CONTEXT' as const, name: prerequisiteName(why), why }] } };
    }
    decided.push(outcome.requirement);
    // The record stores what was SHOWN and, on an edit, what replaced it. Storing only the survivor
    // would answer a question the standard already answers.
    ledger = appendDecision(ledger, p!, outcome.ledgerDecision,
      { ...(outcome.rewritten ? { humanRevision: outcome.requirement } : {}), decidedAt,
        ruling: rulingOf(d, outcome.requirement.materiality) });
  }
  saveSession({ ...s, decided, ledger });
  const kept = decided.filter((d) => d.authority !== 'EXPERT_REJECTED');
  console.log(`${kept.length} rule(s) kept, ${decided.length - kept.length} rejected${added ? `, ${added} added by you` : ''}.`);
  const byMat = kept.reduce<Record<string, number>>((a, d) => ({ ...a, [d.materiality ?? 'undeclared']: (a[d.materiality ?? 'undeclared'] ?? 0) + 1 }), {});
  console.log(`  ${Object.entries(byMat).map(([k, n]) => `${n} ${k}`).join(' · ')}`);
  // COMPUTED BY THE COMPILER, NOT RESTATED BY THE CLI. This line once said undeclared rules "will be
  // SHOWN, not instructed" while `roleFor` compiled exactly those rules to ENFORCE. Whatever this
  // prints now is read off the same function the build will call, so the two cannot disagree again.
  console.log(`  ${kept.map((d) => `${d.requirementId} ${roleFor(d) === 'ENFORCE' ? 'instructs' : 'shown'}`).join(' · ')}`);
  if (kept.some((d) => roleFor(d) !== 'ENFORCE' && d.materiality === null)) {
    console.log('  A shown rule starts instructing when you declare it:  "materiality":"REQUIRED"');
  }
  if (kept.some((d) => d.authority === 'USER_ADOPTED')) {
    console.log(`  Recorded as ADOPTED BY YOU from work you did not write. The source stays attributed to it.`);
  }
}

export function ratifyOne(): void {
  const s = loadSession();
  const id = flag('--id') ?? die('--id required');
  const d = (flag('--decision') ?? '').toUpperCase();
  const p = s.proposals.find((x) => x.requirementId === id) ?? die(`no proposal ${id}`);
  if (d === 'REJECT') {
    saveSession({ ...s, decided: [...s.decided, { ...p, authority: 'EXPERT_REJECTED' }],
      ledger: appendDecision(ledgerFor(s), p, 'REJECT', { decidedAt: new Date().toISOString() }) });
    console.log(`${id} rejected.`); return;
  }

  if (!['APPROVE', 'REWRITE', 'CONTEXTUAL'].includes(d)) die(`unknown decision "${d}" (APPROVE|REWRITE|CONTEXTUAL|REJECT)`);
  // Same function as the batch — `ratify-one` used to skip every validation the batch performed and
  // the public-source branch with it, which is how a single-rule ruling could launder provenance.
  let outcome;
  try {
    outcome = decide(p, { verb: d as DecisionVerb, statement: flag('--statement'), appliesWhen: flag('--applies-when'),
      materiality: flag('--materiality'), form: flag('--form'),
      findRule: (rid) => s.proposals.find((x) => x.requirementId === rid) });
  } catch (e) { return void die((e as Error).message); }
  saveSession({ ...s, decided: [...s.decided, outcome.requirement],
    ledger: appendDecision(ledgerFor(s), p, outcome.ledgerDecision,
      { ...(outcome.rewritten ? { humanRevision: outcome.requirement } : {}), decidedAt: new Date().toISOString() }) });
  console.log(`${id} ${d.toLowerCase()}.`);
}

/**
 * `--measure` in the author's own terms, for a rule they write themselves:
 *   LEXICON:leverage|utilize|synergy
 *   SENTENCE_LENGTH:medianMax=15,p90Max=28
 *   PARAGRAPH_LENGTH:maxSentences=4
 *   HEDGE_RATE:maxPer1000=3
 * Declared, never inferred: the statement's words are not read to decide whether it is measurable.
 */
export function parseMeasure(spec: string): Measurement {
  const i = spec.indexOf(':');
  const observer = (i === -1 ? spec : spec.slice(0, i)).trim().toUpperCase() as ObserverId;
  const rest = i === -1 ? '' : spec.slice(i + 1);
  // STRICT. `medianMax=` read as 0, `0x10` as 16 and `15=20` as 15; a target a person did not mean
  // is worse than a refusal, because it is enforced on every output from then on.
  if (observer === 'STYLE_DISTANCE') die('--measure: STYLE_DISTANCE is computed from your corpus by discovery, not declared by hand.');
  const KEYS: Readonly<Record<string, readonly string[]>> = {
    SENTENCE_LENGTH: ['medianMax', 'p90Max'], PARAGRAPH_LENGTH: ['maxSentences'], HEDGE_RATE: ['maxPer1000'],
    PATTERN_RATE: ['pattern', 'minPer1000', 'maxPer1000', 'prefer'], FRAGMENT_SHARE: ['maxWords', 'maxShare'] };
  const TEXT_KEYS = new Set(['pattern', 'prefer']);
  const params: Record<string, number | string[]> = observer === 'LEXICON'
    ? { terms: rest.split('|').map((t) => t.trim()).filter(Boolean) }
    : Object.fromEntries(rest.split(',').filter((kv) => kv.trim()).map((kv): [string, number | string[]] => {
      const eq = kv.indexOf('=');
      const k = kv.slice(0, eq).trim(); const v = kv.slice(eq + 1);
      if (eq === -1 || !k) die(`--measure: "${kv}" is not name=value`);
      if (KEYS[observer] && !KEYS[observer].includes(k)) die(`--measure: ${observer} takes ${KEYS[observer].join(', ')}; not "${k}"`);
      // `prefer` keeps its spaces: " - " is the point of it.
      if (TEXT_KEYS.has(k)) return [k, [k === 'prefer' ? v : v.trim().toUpperCase()]];
      if (!/^\d+(\.\d+)?$/.test(v.trim())) die(`--measure: "${kv}" is not name=number`);
      const n = Number(v);
      const zeroOk = (observer === 'HEDGE_RATE' || observer === 'PATTERN_RATE') && n === 0;
      if (n <= 0 && !zeroOk) die(`--measure: ${k} must be greater than zero`);
      return [k, n];
    }));
  const m: Measurement = { observer, params };
  const problem = validateMeasurement(m);
  if (problem) die(`--measure ${spec}: ${problem}`);
  return m;
}

export function addOne(): void {
  const s = loadSession();
  const statement = flag('--statement') ?? die('--statement required');
  // ASKED, NOT DEFAULTED — and the reason is two fields below, where materiality and tolerance are
  // left null because "a default here would silently answer a question the author was never asked".
  // `kind` cannot be null, so the question is asked instead.
  //
  // It defaulted to BOUNDARY once, which was the worst available guess. A positive instruction
  // recorded as a prohibition renders under "What not to do", so a rule saying LEAD WITH THE ACTION
  // reached the model as a rule against doing it. The failure is silent, inverts the author's
  // meaning, and is invisible until someone reads the compiled package.
  const KINDS: readonly Requirement['kind'][] = ['GENERATIVE', 'BOUNDARY'];
  const asked = flag('--kind')?.toUpperCase();
  const kind = KINDS.find((k) => k === asked)
    ?? die('--kind GENERATIVE|BOUNDARY required.\n'
      + '  GENERATIVE  something to DO      ("lead with the next action")\n'
      + '  BOUNDARY    something NOT to do  ("never open with a preamble")\n'
      + 'There is no safe default: guessing wrong serves the model the opposite of what you meant.');
  const measureSpec = flag('--measure');
  const measurement = measureSpec === undefined ? undefined : parseMeasure(measureSpec);
  const phase = flag('--phase')?.toUpperCase();
  if (phase !== undefined && phase !== 'ACCURACY' && phase !== 'STYLE') die('--phase is ACCURACY or STYLE');
  const base: Requirement = { requirementId: authoredIdAllocator(s)(), statement, appliesWhen: flag('--applies-when') ?? 'GENERAL',
    kind, authority: 'DERIVED_UNRATIFIED', provenance: 'EXPERT_ADDED', evidence: null, evidenceItemId: null,
    wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null,
    ...(measurement ? { measurement } : {}), ...(phase ? { phase: phase as 'ACCURACY' | 'STYLE' } : {}) };
  let req: Requirement;
  try { req = decide(base, { verb: 'ADD', materiality: flag('--materiality') }).requirement; }
  catch (e) { return void die((e as Error).message); }
  saveSession({ ...s, decided: [...s.decided, req] });
  console.log(`added ${req.requirementId} (${req.kind}) — recorded as EXPERT_ADDED, not as something discovered.`);
  if (s.run.standardVersionHash) {
    console.log(`This run already ratified ${s.run.standardVersionHash}. Closing again mints a version that supersedes it:`
      + '\n  atelier ratify-close --reason "<why the standard changed>"');
  }
}

export function ratifyClose(): void {
  let s = loadSession();
  // NO EVIDENCE IS A LEGITIMATE STATE, NOT A MISSING PRECONDITION.
  //
  // This refused outright once, which made the whole direct-authoring path unreachable: `add`
  // recorded rules and nothing downstream would compile them. A person writing their own standard
  // has no corpus to seal and owes none — they are exercising authority, not offering evidence about
  // themselves. What they do owe is the work type, because the skill's description is built from it
  // and it cannot be inferred from a corpus that does not exist.
  // A second close supersedes the first and inherits its work type; asking again for what the run
  // already recorded is a question the person already answered.
  const priorPath = runFile('pending-standard.json');
  const priorWorkType = s.run.standardVersionHash && existsSync(priorPath)
    ? readJson<{ workType?: string }>(priorPath, { what: 'the previous standard' }).workType : undefined;
  const workType = s.evidence?.workType ?? flag('--work-type') ?? priorWorkType
    ?? die('--work-type <kind> is required for a standard you wrote yourself, because there is no '
      + "corpus to infer it from. It becomes the skill's description, which is how a host decides "
      + 'whether to load the skill at all.  For example:  --work-type writing');
  // EVERY proposal reaches the standard, carrying its own authority. Dropping the unconfirmed ones
  // is what forced a person through a form before they could have anything; what is unconfirmed is
  // now DISCLOSED and, if it is a prohibition, compiled as OBSERVE so it cannot shape output.
  // Everything discovered reaches the standard EXCEPT what the author explicitly refused, each rule
  // carrying its own authority. Dropping the merely-unreviewed is what forced a person through a form
  // before they could have anything; unreviewed prohibitions are compiled as OBSERVE instead, so they
  // are disclosed and watched rather than silently shaping output.
  const byId = new Map(s.proposals.map((p) => [p.requirementId, p]));
  for (const d of s.decided) byId.set(d.requirementId, d);
  const kept = [...byId.values()].filter((d) => d.authority !== 'EXPERT_REJECTED');
  if (!kept.length) die('nothing to compile. A standard with no requirement is not a standard.');
  const body = { evidenceId: s.evidence?.evidenceId ?? null, workType, requirements: kept };
  const hash = sha(JSON.stringify(body));
  // ── CLOSING AGAIN IS A SUPERSESSION, NOT A MUTATION ──────────────────────────────────────
  //
  // A run that has already ratified (or built) a standard and closes again with different content
  // is minting the next version. That was refused as STANDARD_MUTATED, and the refusal's advice was
  // `abort` — which threw the run away. Adding one more rule after a build is the ordinary way a
  // standard grows; it is recorded as such, with the reason every supersession owes.
  const prior = s.run.standardVersionHash;
  if (prior && prior === hash) {
    die(`nothing changed: these decisions are exactly StandardVersion ${prior}, which this run already closed.`
      + '\n  Add a rule (atelier add) or change one before closing again; to build it, atelier build --name <name>.');
  }
  const supersedes = flag('--supersedes') ?? (prior && prior !== hash ? prior : null);
  const reason = flag('--reason') ?? null;
  if (supersedes && !reason) {
    die(`this closes a standard that supersedes ${supersedes}. A supersession needs its reason recorded:`
      + '\n  atelier ratify-close --reason "<why the standard changed>"'
      + '\nA version history without reasons can be counted, not audited.');
  }
  const v: StandardVersion = { standardVersionHash: hash, ...body, authorityState: authorityStateOf(kept), mintedAt: new Date().toISOString(),
    supersedes, reason };
  s = step(s, 'RATIFIED', { standardVersionHash: v.standardVersionHash, supersedes });
  // The decisions are stamped with the version they produced, and the ledger is written beside the
  // standard rather than inside it. A standard says what is; the ledger says who decided it and what
  // they were looking at, and the second one cannot be reconstructed later.
  const stamped = s.ledger ? stampVersion(s.ledger, v.standardVersionHash) : null;
  s = { ...s, ledger: stamped };
  saveSession(s);
  writeAtomic(runFile('pending-standard.json'), JSON.stringify(v, null, 1));
  if (stamped) writeAtomic(runFile('ratification-ledger.json'), JSON.stringify(stamped, null, 1));
  console.log(`StandardVersion ${v.standardVersionHash} [${v.authorityState}]: ${kept.length} requirements.`);
  // Read off the compiler, so this line and the build cannot disagree about what binds.
  console.log(`  ${kept.map((r) => `${r.requirementId} ${roleFor(r) === 'ENFORCE' ? 'instructs' : 'shown'}`).join(' · ')}`);
  console.log(`  discovered ${(discoveryRecall(v) * 100).toFixed(0)}%  ·  declared-general ${(declaredGeneralShare(v) * 100).toFixed(0)}%  ·  unconfirmed ${(unconfirmedRate(v) * 100).toFixed(0)}%`);
  // A 0% discovery rate on a directly authored standard is the truth, not a warning, and saying so
  // is what stops the number reading as a shortfall. It also stops the reverse: a standard nobody
  // observed must never be mistaken later for one that was.
  const mode = sourceModeOf(v);
  if (mode === 'DIRECT') {
    console.log('  every requirement was AUTHORED by you, not observed in work. No corpus was read, '
      + 'so 0% discovered is accurate rather than a shortfall.');
  } else if (mode === 'HYBRID') {
    const authored = v.requirements.filter((r) => r.provenance === 'EXPERT_ADDED').length;
    console.log(`  ${authored} of ${v.requirements.length} requirement(s) you authored; the rest came from the work.`);
  }
  if (stamped?.records.length) {
    const su = survival(stamped);
    // RECORDED, as opposed to inferred from id gaps after the fact. The distinction is the point of
    // keeping the ledger at all, so the line says which one this is.
    console.log(`  ratification [${su.provenance}]: ${su.shown} shown · ${su.approved} approved · ${su.edited} edited · `
      + `${su.rejected} rejected · ${su.decidedNotRequirement} kept as non-obligation · ${su.deferred} open`);
    console.log(`  survival ${(su.survivalRate * 100).toFixed(0)}%  ·  decided ${(su.decidedRate * 100).toFixed(0)}%  ·  ${runFile('ratification-ledger.json')}`);
  }
  // A standard in which NOTHING instructs is legal — governance lets it be minted and built — but the
  // printed next step used to walk a person straight into building a skill whose instruction section
  // is empty. Say so, and point at the decision that would change it.
  const instructing = kept.filter((r) => roleFor(r) === 'ENFORCE').length;
  // PREFERRED compiles exactly as EXEMPLAR_ONLY — shown, never binding — which is the governance
  // (the owner said breaking it is not thereby worse) but was never said. Say it where it is decided.
  const preferredShown = kept.filter((r) => r.materiality === 'PREFERRED' && roleFor(r) !== 'ENFORCE');
  if (preferredShown.length) {
    console.log(`  ${preferredShown.map((r) => r.requirementId).join(', ')}: PREFERRED is shown to the model as an example, not instructed.`
      + ' Mark a rule REQUIRED for it to instruct.');
  }
  if (!instructing) {
    // Two different reasons, two different next steps: rules nobody has ruled on yet, and rules that
    // were ruled on and deliberately not made obligatory.
    const undecided = kept.filter((r) => r.materiality === null && r.authority === 'DERIVED_UNRATIFIED').length;
    console.log('\n  NOTHING HERE INSTRUCTS THE MODEL YET. A skill built now would show these rules and instruct none.');
    if (kept.every((r) => r.provenance === 'PUBLIC_BEHAVIOUR_INFERRED')) {
      console.log('  Read from someone else\'s public work, these are shown and never instructed — the ceiling that');
      console.log('  source can carry. Judge the output, and make a rule bind in your own words:  atelier fix "<what was wrong>"');
    } else if (undecided) console.log(`  ${undecided} of them have no decision from you. Rule on them first:  atelier pending`);
    else console.log('  You marked none of them REQUIRED, and a rule instructs only when it is. After building, make one REQUIRED with:\n    atelier amend --skill <name> --rule <id> --materiality REQUIRED --reason "<why>"');
  }
  if (!process.env.ATELIER_ORCHESTRATED) {
    console.log(instructing ? 'Run `atelier build --name <name>`.' : 'Or build it as it stands, knowing that: `atelier build --name <name>`.');
  }
}

