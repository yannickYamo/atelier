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

import { renderRatifyPage } from '../../renderers/ratify-page/render.js';
import { coverageOf, describeCoverage } from '../../core/coverage/standard-coverage.js';
import { blindSpotsOf, BLIND_SPOT_QUESTION } from '../../core/coverage/blind-spot.js';
import type { StandardVersion, Requirement } from '../../core/state/canonical-state.js';
import { discoveryRecall, declaredGeneralShare, unconfirmedRate, authorityStateOf, isGeneralScope, sourceModeOf } from '../../core/state/canonical-state.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { sha, die, argv, flag, loadSession, saveSession, step, runFile, authoredIdAllocator, type Session } from '../runtime.js';
import { decide, type DecisionVerb } from '../../core/ratification/authority.js';
import { roleFor } from '../../core/architecture/compile.js';
import { draftHash, appendDecision, stampVersion, survival, type RatificationLedger } from '../../core/ratification/decision-record.js';

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
    }));
    console.log(`${pending.length} proposal(s) written to ${pageOut}`);
    console.log('Open it, rule on each one, then press Copy rulings and pass them back:');
    console.log("  atelier ratify --decisions '<paste>'");
    return;
  }

  const raw = flag('--decisions') ?? die('--decisions <json> required — array of '
    + '{id, decision, materiality?, form?, shape?, statement?, appliesWhen?, kind?}'
    + '\n  Or write a page you can read and mark up:  atelier ratify --page rulings.html');
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
      ledger = appendDecision(ledger, p!, 'REJECT', { note: d.statement, decidedAt });
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
        materiality: d.materiality, form: d.form, shape: d.shape, realizes: typeof d.realizes === 'string' ? d.realizes : null,
        findRule: (rid) => s.proposals.find((x) => x.requirementId === rid) ?? decided.find((x) => x.requirementId === rid) });
    } catch (e) { return void die((e as Error).message); }
    decided.push(outcome.requirement);
    // The record stores what was SHOWN and, on an edit, what replaced it. Storing only the survivor
    // would answer a question the standard already answers.
    ledger = appendDecision(ledger, p!, outcome.ledgerDecision,
      { ...(outcome.rewritten ? { humanRevision: outcome.requirement } : {}), decidedAt });
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
  const base: Requirement = { requirementId: authoredIdAllocator(s)(), statement, appliesWhen: flag('--applies-when') ?? 'GENERAL',
    kind, authority: 'DERIVED_UNRATIFIED', provenance: 'EXPERT_ADDED', evidence: null, evidenceItemId: null,
    wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null };
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
  const workType = s.evidence?.workType ?? flag('--work-type')
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
  if (!process.env.ATELIER_ORCHESTRATED) console.log('Run `atelier build --name <name>`.');
}

