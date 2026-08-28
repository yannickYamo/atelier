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

import { join } from 'node:path';
import { coverageOf, describeCoverage } from '../../core/coverage/standard-coverage.js';
import { blindSpotsOf, BLIND_SPOT_QUESTION } from '../../core/coverage/blind-spot.js';
import type { StandardVersion, Requirement } from '../../core/state/canonical-state.js';
import { discoveryRecall, declaredGeneralShare, unconfirmedRate, authorityStateOf, isGeneralScope } from '../../core/state/canonical-state.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { sha, DATA, die, argv, flag, loadSession, saveSession, step, type Session } from '../runtime.js';
import { draftHash, appendDecision, stampVersion, survival, type RatificationLedger, type RatificationDecision as LedgerDecision } from '../../core/ratification/decision-record.js';

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
    boundaryProbed: false, heldOutRecurrence: 0, framingsFound: [],
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
const asLedgerDecision = (dec: string, materiality: string | null, rewritten: boolean): LedgerDecision => {
  if (dec === 'REJECT') return 'REJECT';
  if (rewritten) return 'EDIT';
  return materiality && ['EXEMPLAR_ONLY', 'TOLERATED', 'INCIDENTAL'].includes(materiality)
    ? 'DECIDED_NOT_A_REQUIREMENT' : 'APPROVE';
};

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
}


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
  const raw = flag('--decisions') ?? die('--decisions <json> required — array of '
    + '{id, decision, materiality?, form?, shape?, statement?, appliesWhen?, kind?}');
  let list: RatificationDecision[];
  try { list = JSON.parse(raw) as RatificationDecision[]; } catch { return void die('--decisions is not valid JSON.'); }

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
  let added = 0;
  for (const d of list) {
    const dec = (d.decision ?? '').toUpperCase();
    if (dec === 'ADD') {
      decided.push({ requirementId: `x${++added}`, statement: d.statement ?? die('ADD needs --statement'), appliesWhen: d.appliesWhen ?? 'GENERAL',
        kind: (d.kind ?? 'BOUNDARY') as Requirement['kind'], authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED', evidence: null, evidenceItemId: null,
        wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null });   // a person stating their own rule owes no counterfactual to a machine
      continue;
    }
    const p = s.proposals.find((x) => x.requirementId === d.id);
    if (!p) die(`no proposal ${d.id}`);
    if (dec === 'REJECT') {
      decided.push({ ...p!, authority: 'EXPERT_REJECTED' });
      ledger = appendDecision(ledger, p!, 'REJECT', { note: d.statement, decidedAt });
      continue;
    }
    if (dec === 'REWRITE' && !d.statement) die(`${d.id}: REWRITE needs the user's own wording. The standard records what they said, not a tidied version.`);
    if (dec === 'CONTEXTUAL' && !d.appliesWhen) die(`${d.id}: CONTEXTUAL needs the condition, in their words.`);
    if (!['APPROVE', 'REWRITE', 'CONTEXTUAL'].includes(dec)) die(`${d.id}: unknown decision "${dec}"`);

    // ── MATERIALITY AND FORM ARE PART OF THE DECISION ────────────────────────────────────────
    //
    // Approving a rule and declaring what it obliges are two answers, and the compiler needs both.
    // Without them every kept rule arrived undeclared and compiled as an instruction, which is how a
    // behaviour the author merely prefers became law.
    const MAT = ['REQUIRED', 'PREFERRED', 'EXEMPLAR_ONLY', 'TOLERATED', 'INCIDENTAL'];
    const FORM = ['STRICT', 'FUNCTIONALLY_EQUIVALENT', 'FLEXIBLE'];
    const mat = (d.materiality ?? '').toUpperCase() || null;
    const form = (d.form ?? '').toUpperCase() || null;
    if (mat && !MAT.includes(mat)) die(`${d.id}: materiality must be one of ${MAT.join(' / ')}`);
    if (form && !FORM.includes(form)) die(`${d.id}: form must be one of ${FORM.join(' / ')}`);

    // ── A REALIZATION IS ASKED A DIFFERENT QUESTION ─────────────────────────────────────────
    //
    // Flat, an expressive rule reads as a fussy habit and gets rejected; linked, it is how the
    // decision above it lands. The link changes what the author is being asked. Materiality belongs
    // to the parent — accepting one here would put a second obligation on a single choice — and what
    // is genuinely open is whether the exact form matters, which is `form`.
    const realizes = typeof d.realizes === 'string' && d.realizes.trim() ? d.realizes.trim() : null;
    if (realizes) {
      if (realizes === d.id) die(`${d.id}: a rule cannot realize itself.`);
      const parent = s.proposals.find((x) => x.requirementId === realizes)
        ?? decided.find((x) => x.requirementId === realizes);
      if (!parent) die(`${d.id}: realizes "${realizes}", which is not a rule in this draft.`);
      if (mat) {
        die(`${d.id}: a realization does not take a materiality — ${realizes} carries the obligation, and a `
          + `second one here would issue two commands for one choice.\n`
          + `  What is open is how tightly the FORM binds:  "form":"STRICT" | "FUNCTIONALLY_EQUIVALENT" | "FLEXIBLE"`);
      }
    }

    // ── AND THE SHAPE, WHERE THE RULE IS ABOUT ONE ──────────────────────────────────────────
    //
    // THE CARRIER THAT COULD NOT BE ASKED FOR. `outputShape` is what turns a required rule into an
    // OUTPUT_CONTRACT, which is the only carrier the runtime can guarantee rather than request. It was
    // read by the compiler, rendered by the renderer, delivered to the provider and proven by a hash
    // comparison, and no command anywhere set it. The whole carrier was reachable from a test fixture
    // and from nowhere a person could stand.
    //
    // It rides on the ratification decision because that is where the author is already saying what a
    // rule obliges. A shape is the strongest thing they can say, so it belongs in the same breath as
    // the materiality that licenses it.
    let shape: Record<string, unknown> | null = null;
    if (d.shape !== undefined && d.shape !== null && d.shape !== '') {
      try {
        shape = typeof d.shape === 'string' ? JSON.parse(d.shape) as Record<string, unknown> : d.shape;
      } catch { return void die(`${d.id}: shape is not valid JSON.`); }
      if (typeof shape !== 'object' || Array.isArray(shape) || !Object.keys(shape).length) {
        die(`${d.id}: shape must be an object of field name to JSON Schema fragment, `
          + `for example {"verdict":{"type":"string"},"confidence":{"type":"number"}}.`);
      }
      // A shape only reaches a contract through REQUIRED. Accepting one under a weaker materiality
      // would record an obligation the author did not make and then quietly fail to enforce it.
      if (mat !== 'REQUIRED') {
        die(`${d.id}: a shape is only enforceable on a REQUIRED rule; this one is `
          + `${mat ?? 'undeclared'}. A shape the runtime will not hold is a request, and the rule already `
          + `says it in words.`);
      }
    }

    // ── WHO STANDS BEHIND IT DEPENDS ON WHOSE WORK IT CAME FROM ──────────────────────────────
    //
    // A rule read off someone else's public work does not become that person's ratified standard
    // because a third party approved it. They decided to USE it, which is theirs to decide, and the
    // source provenance is untouched by that decision.
    const fromPublic = p!.provenance === 'PUBLIC_BEHAVIOUR_INFERRED';
    const kept: Requirement = { ...p!,
      authority: fromPublic ? 'USER_ADOPTED' : 'EXPERT_RATIFIED',
      provenance: fromPublic ? 'PUBLIC_BEHAVIOUR_INFERRED'
        : (dec === 'REWRITE' || dec === 'CONTEXTUAL') ? 'SUBSTANTIVELY_REWRITTEN' : 'MACHINE_DISCOVERED',
      materiality: mat as Requirement['materiality'],
      realizationTolerance: form as Requirement['realizationTolerance'],
      outputShape: shape,
      realizes,
      ...(d.statement ? { statement: d.statement } : {}), ...(d.appliesWhen ? { appliesWhen: d.appliesWhen } : {}) };
    decided.push(kept);

    // The record stores what was SHOWN and, on an edit, what replaced it. Storing only the survivor
    // would answer a question the standard already answers.
    const rewritten = dec === 'REWRITE' || dec === 'CONTEXTUAL';
    ledger = appendDecision(ledger, p!, asLedgerDecision(dec, mat, rewritten),
      { ...(rewritten ? { humanRevision: kept } : {}), decidedAt });
  }
  saveSession({ ...s, decided, ledger });
  const kept = decided.filter((d) => d.authority !== 'EXPERT_REJECTED');
  const undeclared = kept.filter((d) => d.materiality === null).length;
  console.log(`${kept.length} rule(s) kept, ${decided.length - kept.length} rejected${added ? `, ${added} added by you` : ''}.`);
  const byMat = kept.reduce<Record<string, number>>((a, d) => ({ ...a, [d.materiality ?? 'undeclared']: (a[d.materiality ?? 'undeclared'] ?? 0) + 1 }), {});
  console.log(`  ${Object.entries(byMat).map(([k, n]) => `${n} ${k}`).join(' · ')}`);
  if (undeclared) {
    console.log(`  ${undeclared} kept without a materiality — they will be SHOWN, not instructed.`);
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

  const statement = flag('--statement');
  const appliesWhen = flag('--applies-when');
  const rewritten = d === 'REWRITE' || (d === 'CONTEXTUAL' && !!appliesWhen);
  if (d === 'REWRITE' && !statement) die('--statement required for REWRITE: the standard records the user\'s words, not a tidied version of them.');
  if (d === 'CONTEXTUAL' && !appliesWhen) die('--applies-when required for CONTEXTUAL.');
  if (!['APPROVE', 'REWRITE', 'CONTEXTUAL'].includes(d)) die(`unknown decision "${d}" (APPROVE|REWRITE|CONTEXTUAL|REJECT)`);

  const req: Requirement = { ...p, authority: 'EXPERT_RATIFIED', provenance: rewritten ? 'SUBSTANTIVELY_REWRITTEN' : 'MACHINE_DISCOVERED',
    ...(statement ? { statement } : {}), ...(appliesWhen ? { appliesWhen } : {}) };
  saveSession({ ...s, decided: [...s.decided, req],
    ledger: appendDecision(ledgerFor(s), p, rewritten ? 'EDIT' : 'APPROVE',
      { ...(rewritten ? { humanRevision: req } : {}), decidedAt: new Date().toISOString() }) });
  console.log(`${id} ${d.toLowerCase()}.`);
}

export function addOne(): void {
  const s = loadSession();
  const statement = flag('--statement') ?? die('--statement required');
  const req: Requirement = { requirementId: `x${s.decided.length + 1}`, statement, appliesWhen: flag('--applies-when') ?? 'GENERAL',
    kind: (flag('--kind') ?? 'BOUNDARY') as Requirement['kind'], authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED', evidence: null, evidenceItemId: null,
    wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null };
  saveSession({ ...s, decided: [...s.decided, req] });
  console.log(`added ${req.requirementId} (${req.kind}) — recorded as EXPERT_ADDED, not as something discovered.`);
}

export function ratifyClose(): void {
  let s = loadSession();
  if (!s.evidence) die('no sealed evidence.');
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
  const evc = s.evidence ?? die('nothing sealed.');
  const body = { evidenceId: evc.evidenceId, workType: evc.workType, requirements: kept };
  const v: StandardVersion = { standardVersionHash: sha(JSON.stringify(body)), ...body, authorityState: authorityStateOf(kept), mintedAt: new Date().toISOString(),
    supersedes: flag('--supersedes') ?? null, reason: flag('--reason') ?? null };
  s = step(s, 'RATIFIED', { standardVersionHash: v.standardVersionHash });
  // The decisions are stamped with the version they produced, and the ledger is written beside the
  // standard rather than inside it. A standard says what is; the ledger says who decided it and what
  // they were looking at, and the second one cannot be reconstructed later.
  const stamped = s.ledger ? stampVersion(s.ledger, v.standardVersionHash) : null;
  s = { ...s, ledger: stamped };
  saveSession(s);
  writeAtomic(join(DATA, 'pending-standard.json'), JSON.stringify(v, null, 1));
  if (stamped) writeAtomic(join(DATA, 'ratification-ledger.json'), JSON.stringify(stamped, null, 1));
  console.log(`StandardVersion ${v.standardVersionHash} [${v.authorityState}]: ${kept.length} requirements.`);
  console.log(`  discovered ${(discoveryRecall(v) * 100).toFixed(0)}%  ·  unconditional ${(declaredGeneralShare(v) * 100).toFixed(0)}%  ·  unconfirmed ${(unconfirmedRate(v) * 100).toFixed(0)}%`);
  if (stamped?.records.length) {
    const su = survival(stamped);
    // RECORDED, as opposed to inferred from id gaps after the fact. The distinction is the point of
    // keeping the ledger at all, so the line says which one this is.
    console.log(`  ratification [${su.provenance}]: ${su.shown} shown · ${su.approved} approved · ${su.edited} edited · `
      + `${su.rejected} rejected · ${su.decidedNotRequirement} kept as non-obligation · ${su.deferred} open`);
    console.log(`  survival ${(su.survivalRate * 100).toFixed(0)}%  ·  decided ${(su.decidedRate * 100).toFixed(0)}%  ·  ${join(DATA, 'ratification-ledger.json')}`);
  }
  console.log('Run `atelier build --name <name>`.');
}

