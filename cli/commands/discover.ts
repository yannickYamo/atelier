// cli/commands/discover.ts — Proposing rules from the sealed corpus, and the human decisions on them.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { proposeAcrossFramings } from '../../core/discovery/propose.js';
import { describeUnion } from '../../core/discovery/union.js';
import { coverageOf, describeCoverage } from '../../core/coverage/standard-coverage.js';
import { blindSpotsOf, BLIND_SPOT_QUESTION } from '../../core/coverage/blind-spot.js';
import { runDiscoveryChain } from '../../core/discovery/run-chain.js';
import { locateSpan } from '../../core/discovery/conformance.js';
import { type ImportPlan } from '../../core/discovery/chain/corpus-import.js';
import { runMethodExtraction, describeMethodRun } from '../../core/discovery/run-methods.js';
import type { Budget } from '../../core/inference/client.js';
import { BudgetExceeded } from '../../core/inference/client.js';
import { transition, type Run } from '../../core/state/run-state.js';
import type { StandardVersion, Requirement } from '../../core/state/canonical-state.js';
import { discoveryRecall, unconditionalRate, unconfirmedRate, authorityStateOf } from '../../core/state/canonical-state.js';
import { extract } from '../../core/intake/extract.js';

import { sha, DATA, die, argv, flag, PROPOSER, clientFor, loadSession, saveSession, sourceProvenance, step, type Session, numericFlag, priceOverrideFor } from '../runtime.js';
import { priceFor, ANTHROPIC_PRICING } from '../../providers/pricing.js';
import { draftHash, appendDecision, stampVersion, survival, type RatificationLedger, type RatificationDecision as LedgerDecision } from '../../core/ratification/decision-record.js';

// ── discover ─────────────────────────────────────────────────────────────────────────────────
export const PROPOSER_SYSTEM = `You are given several pieces written by one author.

Infer the author's IMPLICIT DECISION RULES — the choices they make repeatedly that a different competent
writer would make differently. Formal and figurative choices COUNT as decisions.

For each rule give: STATEMENT (one sentence they could recognise as their own), APPLIES_WHEN (the
condition; say GENERAL only if it truly holds throughout), EVIDENCE (a short verbatim quote), KIND
(GENERATIVE or BOUNDARY).

- 8 to 12 rules. At least three KIND=BOUNDARY: a place the author could easily have gone further and
  chose not to, or a move available to them that they consistently decline.
- Each rule must be FALSIFIABLE — someone could break it on purpose. "Writes clearly" is not a rule.
- Do not comment on quality. Do not guess at influences or writers they resemble.`;

export const SCHEMA = { type: 'object', properties: { rules: { type: 'array', minItems: 8, maxItems: 12, items: { type: 'object',
  properties: { statement: { type: 'string' }, appliesWhen: { type: 'string' }, evidence: { type: 'string' }, evidenceItemId: { type: 'string' }, kind: { type: 'string', enum: ['GENERATIVE', 'BOUNDARY'] } },
  required: ['statement', 'appliesWhen', 'evidence', 'evidenceItemId', 'kind'], additionalProperties: false } } }, required: ['rules'], additionalProperties: false } as Record<string, unknown>;

export async function discover(): Promise<void> {
  const s = loadSession();
  if (!s.evidence) die('nothing sealed. Run `atelier intake <path>` first.');
  const files = JSON.parse(readFileSync(join(DATA, 'corpus-paths.json'), 'utf8')) as { id: string; path: string; kind?: string }[];
  const textOf = (f: string): string => { const r = extract(f); if (!r.ok) die(r.reason); return (r as { text: string }).text; };
  const ev = s.evidence ?? die('nothing sealed.');
  const items = files.map((f) => ({ id: f.id, text: textOf(f.path) }));

  if (sha(items.map((i) => sha(i.text)).join('|')) !== ev.corpusHash) {
    die('the corpus changed since it was sealed. Re-run intake — a standard inferred from files that have moved is a standard about nothing in particular.');
  }
  const t = transition(s.run, 'PROPOSED');
  if (!t.ok) {
    return void die(`${t.detail}\n\n  This run cannot start discovery from where it is.`
      + `\n  Start over:      atelier abort   then run your command again`
      + `\n  See where it is: atelier status`);
  }

  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 3.0), maxCalls: numericFlag('--max-calls', 60) };
  const client = clientFor(flag('--model') ?? PROPOSER);
  let proposals: Requirement[];

  // ─── THE SPLIT IS USED WHENEVER THE CORPUS ALLOWS IT ────────────────────────────────────────
  //
  // Four pieces is the floor: two the proposer reads, two it never sees. Below that a rule cannot be
  // told apart from a description of one example, so the chain refuses rather than producing a
  // weaker version of itself — and we fall back to the single call, saying so plainly. A user with
  // three pieces should know their standard rests on unvalidated proposals.
  const importPlan = JSON.parse(readFileSync(join(DATA, 'import-plan.json'), 'utf8')) as ImportPlan;

  // ── THE RESERVE IS ENFORCED HERE, ON THE ONLY PATH THAT READS ────────────────────────────
  //
  // Reserving at intake is a promise; this is where it is kept. Both the items and the golden ROLES
  // are filtered, because the chain splits `goldens` into proposal and held-out sets of its own —
  // leaving a reserved piece in that list would let it be read as chain-held-out material, which is
  // read by the observer even when it is not read by the proposer.
  const reservedIds = new Set((loadSession().reservation?.reserved ?? []).map((u) => u.unitId));
  if (reservedIds.size) {
    console.log(`\nHolding back ${reservedIds.size} reserved piece(s) — discovery will not see them: ${[...reservedIds].join(', ')}`);
  }
  const openItems = items.filter((i) => !reservedIds.has(i.id));
  const openGoldens = importPlan.goldens.filter((g) => !reservedIds.has(g.contextId));

  // ── COST IS KNOWN BEFORE IT IS SPENT ────────────────────────────────────────────────────
  //
  // The first real run against a six-piece corpus exhausted the default cap DURING discovery, after
  // the corpus had already been sealed — a user learns the price by being refused halfway through
  // something they cannot resume. The estimate is rough on purpose and printed on purpose. Discovery
  // reads the proposal pool once per vantage, then checks each proposed rule against each held-out
  // piece, so cost tracks pool size times rules times held-out documents.
  const tokOf = (t: string): number => Math.ceil(t.length / 4);
  const proposalIds = new Set(openGoldens.filter((g) => g.role === 'PROPOSAL').map((g) => g.contextId));
  const poolTok = openItems.filter((i) => proposalIds.has(i.id)).reduce((n, i) => n + tokOf(i.text), 0);
  const heldItems = openItems.filter((i) => !proposalIds.has(i.id));
  const heldCount = Math.max(1, heldItems.length);
  const heldTok = heldItems.reduce((n, i) => n + tokOf(i.text), 0);
  // ── THE ESTIMATE USES THE RATE THAT WILL ACTUALLY BE CHARGED ──────────────────────────────
  //
  // It used to hardcode 3/15 per million — one vendor's mid-tier rate — whichever provider and model
  // the user had chosen. That is the same defect as a stale rate card, arriving at the one moment a
  // person decides whether to spend: a run on a cheap open model was quoted several times its real
  // cost and could be refused by the user's own cap, and a run on a frontier model was quoted a
  // fraction of its real cost and could sail past a cap set on the strength of that number.
  //
  // When nobody knows the rate, the estimate says so in tokens rather than inventing dollars.
  const RULES = 12, VANTAGES = 2;
  const inTok = poolTok * VANTAGES + (heldTok / heldCount) * RULES * heldCount;
  const outTok = 4000 * VANTAGES + 300 * RULES * heldCount;
  // The override wins: a person who names their rate is the authority on it. The shipped table is a
  // dated seed for the case where nobody has.
  const modelName = flag('--discovery-model') ?? flag('--model') ?? PROPOSER;
  const rate = priceOverrideFor('discovery') ?? priceFor(ANTHROPIC_PRICING, modelName);
  if (!rate) {
    console.log(`\nEstimated discovery size ~${Math.round(inTok).toLocaleString()} in / ~${outTok.toLocaleString()} out tokens `
      + `(${VANTAGES} vantages, then ~${RULES} rules against ${heldCount} held-out piece(s)).`);
    console.log(`No rate is known for "${modelName}", so this cannot be quoted in dollars. Give one with`);
    console.log(`  --price-in <usd-per-million> --price-out <usd-per-million>`);
    console.log(`and the run is metered and capped; without it, bound the run with --max-calls.`);
  }
  const estimate = rate ? (inTok * rate.inputPerM + outTok * rate.outputPerM) / 1e6 : 0;
  const lo = estimate * 0.6, hi = estimate * 1.6;
  if (rate) {
    console.log(`\nEstimated discovery cost $${lo.toFixed(2)}–$${hi.toFixed(2)}  (${VANTAGES} vantages over `
      + `${poolTok.toLocaleString()} tokens, then ~${RULES} rules checked against ${heldCount} held-out piece(s), `
      + `at $${rate.inputPerM}/$${rate.outputPerM} per M)`);
  }
  if (rate && hi > budget.capUsd) {
    die(`Estimated up to $${hi.toFixed(2)} and your limit is $${budget.capUsd.toFixed(2)}. NOTHING HAS BEEN SPENT.`
      + `\n  Raise the limit:  --cap ${Math.ceil(hi * 10) / 10}`
      + `\n  Or spend less:    point at fewer pieces, or shorter ones.`);
  }

  const chain = await runDiscoveryChain(client, budget, 'skill', openItems, openGoldens,
    { standardDimensions: [ev.workType] }, flag('--model') ?? PROPOSER);

  if ('refused' in chain) {
    // GOLDENS ONLY, even here. The chain refuses on a thin corpus and this is the degraded path, but
    // "degraded" must not mean "reads the skill's own methodology as an example of the author's
    // work". That is the exact circularity the IMPROVE journey exists to avoid, and a fallback that
    // quietly reintroduces it is worse than the refusal, because its output looks like discovery.
    //
    // When the corpus was too thin to assign roles at all, `goldens` is empty and there is nothing
    // to filter BY — every readable piece is a candidate, which is the honest reading of that state.
    const goldenIds = new Set(openGoldens.map((g) => g.contextId));
    const skillIds = new Set([importPlan.existingSkillId].filter((x): x is string => Boolean(x)));
    const forProposal = goldenIds.size
      ? openItems.filter((i) => goldenIds.has(i.id))
      : openItems.filter((i) => !skillIds.has(i.id));

    console.log(`\nNot enough to validate against: ${chain.detail}`);
    console.log(`Falling back to a single pass over ${forProposal.length} piece(s). Every rule below is a`);
    console.log(`PROPOSAL nothing has checked — no rule was tested against work the proposer had not read.`);
    if (skillIds.size) console.log(`Your existing skill is NOT among them — a standard read off the skill we are improving would only restate it.`);
    // SEVERAL VANTAGES, NOT ONE. A single framing recovers one layer of an author and misses another:
    // two prompts differing by one clause recovered 3/9 and 4/9 of an author's own sealed rules, and
    // their union ~7/9. The disjointness sits below the same-framing noise floor on both models
    // tested, so it is the vantage doing the work rather than run-to-run variance.
    const { union, byFraming } = await proposeAcrossFramings(client, budget, forProposal);
    console.log(`\n${describeUnion(union, (r) => r.statement)}`);

    // ── WHAT A MACHINE CAN SETTLE ABOUT THIS MODEL'S OUTPUT ────────────────────────────────
    //
    // Printed only when something failed, because a clean pack is not news and a wall of green would
    // train the reader to skip the block on the day it is not green. A failure here is a defect in the
    // output — a fabricated quote, a grabbed field — not a matter of taste, and it is worth the
    // interruption.
    const failed = byFraming.flatMap((f) => f.conformance.checks.filter((c) => c.outcome === 'FAIL').map((c) => ({ f: f.framing, c })));
    if (failed.length) {
      console.log(`\nThis model's output did not pass every deterministic check:\n`);
      for (const { f, c } of failed) {
        console.log(`  framing ${f} — ${c.id}: ${c.establishes}`);
        for (const x of c.failures) console.log(`      ${x}`);
      }
      console.log(`\nThese are defects, not opinions. Candidates are still shown; you are deciding on them either way.`);
    }
    proposals = union.members.map((m, i) => {
      const r = m.rules[0].rule;
      return {
        requirementId: `p${i + 1}`, statement: r.statement, appliesWhen: r.appliesWhen,
        kind: r.kind, authority: 'DERIVED_UNRATIFIED' as const,
        provenance: sourceProvenance(), evidence: r.evidence ?? null, evidenceItemId: r.evidenceItemId ?? null,
        wouldBeAbsentIf: r.wouldBeAbsentIf?.trim() || null, materiality: null, realizationTolerance: null, outputShape: null };
    });
  } else {
    console.log(`\nProposed from ${chain.proposalIds.length} piece(s): ${chain.proposalIds.join(', ')}`);
    console.log(`Checked against ${chain.heldOutIds.length} the proposer never saw: ${chain.heldOutIds.join(', ')}  (${chain.observeCalls} checks)`);
    proposals = chain.hypotheses.map((h, i) => ({
      requirementId: `p${i + 1}`, statement: h.hypothesis.description,
      appliesWhen: h.hypothesis.appliesWhen.map((x) => x.describe).join('; ') || 'GENERAL',
      // The chain does not type rules as GENERATIVE/BOUNDARY; it types EVIDENCE. Everything arrives
      // GENERATIVE, and a prohibition is recognised where the author confirms one — which is the
      // right owner for that call anyway.
      kind: 'GENERATIVE' as const, authority: 'DERIVED_UNRATIFIED' as const,
      provenance: sourceProvenance(),
      // VERBATIM OR ABSENT. `locateSpan` is the same check the framings path already runs, and a quote
      // that is not in the named piece is a fabrication with a citation attached — exactly the shape
      // this system refuses elsewhere. A rule keeps its span or keeps none.
      ...(() => {
        const a = anchoredQuote(h.hypothesis.quote, openItems);
        return { evidence: a?.quote ?? null, evidenceItemId: a?.itemId ?? h.hypothesis.provenance.fromGoldens[0] ?? null };
      })(),
      // Collected and validated non-empty by the discovery contract since the chain was built, and
      // dropped here until now. It is the one field that lets a person argue with a proposal.
      // a counterfactual the model returned as whitespace must become null; `??` would keep ''.
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- `||` is deliberate:
      wouldBeAbsentIf: chain.proposed.find((f) => f.description === h.hypothesis.description)?.wouldBeAbsentIf?.trim() || null, materiality: null, realizationTolerance: null, outputShape: null }));
    const seen = chain.hypotheses.filter((h) => h.golden.some((g) => g.applicable && g.present)).length;
    console.log(`${chain.proposed.length} proposed, ${proposals.length} survived validation, ${seen} seen again in held-out work.`);

  }

  // ── THE METHODOLOGY CHANNEL ────────────────────────────────────────────────────────────────
  //
  // Only on the IMPROVE journey, and only with documents to check against. It asks the question the
  // taste channel structurally cannot — *you wrote this down; does your skill carry it?* — and it
  // needs no inference to be right about, only a check to run.
  //
  // Held BELOW the taste run and reported separately rather than merged into `proposals`. An
  // extracted method arrives EXPERT_AUTHORED because the expert already wrote it; a taste factor
  // arrives DERIVED_UNRATIFIED because we guessed it. Pooling them into one list of "rules" would
  // put a guess and a quotation under the same yes.
  const methodDocs = new Map(files.filter((f) => f.kind === 'METHODOLOGY').map((f) => [f.id, textOf(f.path)]));
  const pkgPath = join(DATA, 'skill-package.json');
  if (methodDocs.size && existsSync(pkgPath) && !argv.includes('--skip-methods')) {
    const sp = JSON.parse(readFileSync(pkgPath, 'utf8')) as { absRoot: string; readable: string[] };
    // checked against the WHOLE readable package, not just the SKILL.md — an obligation carried in a
    // template is carried, and reporting it missing because we only looked at one file is a defect
    // in the instrument reported as a defect in the skill.
    const skillText = sp.readable.map((rel) => { const r = extract(join(sp.absRoot, rel)); return r.ok ? r.text : ''; }).join('\n\n');
    try {
      const mrun = await runMethodExtraction(client, budget, methodDocs, skillText, { standardDimensions: [ev.workType] });
      console.log(`\n${describeMethodRun(mrun)}  ($${mrun.costUsd.toFixed(3)})`);
      writeFileSync(join(DATA, 'method-findings.json'), JSON.stringify(mrun, null, 1));
    } catch (e) {
      // A failed methodology check must not cost the taste run that already succeeded and was paid for.
      if (e instanceof BudgetExceeded) console.log(`\nSkipped the methodology check — it would exceed the cap. Raise --cap or pass --skip-methods.`);
      else console.log(`\nThe methodology check failed: ${(e as Error).message}\nYour discovered rules above are unaffected.`);
    }
  }

  saveSession({ ...s, run: (t as { run: Run }).run, proposals });
  const b = proposals.filter((p) => p.kind === 'BOUNDARY').length;
  console.log(`\n${proposals.length} rule(s)${b ? `, ${b} of them boundaries` : ''}.  ($${budget.spentUsd.toFixed(3)})`);
  for (const p of proposals) {
    const cond = /^GENERAL\b/i.test(p.appliesWhen.trim()) ? '' : `\n    applies when: ${p.appliesWhen}`;
    console.log(`  [${p.requirementId}] ${p.statement}${cond}`);
  }
  console.log(`\nRun \`atelier ratify-close\` to mint the standard, or \`atelier build --name <name>\` if create is doing it for you.`);
}

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
    const cond = /^GENERAL\b/i.test(p.appliesWhen.trim()) ? '' : `\n    when: ${p.appliesWhen}`;
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
const anchoredQuote = (
  quote: string | undefined, items: readonly { id: string; text: string }[],
): { quote: string; itemId: string } | null => {
  const q = (quote ?? '').trim();
  if (!q) return null;
  // SEARCHED ACROSS THE PIECES, not checked against a guess. `readFrom` lists every piece the model
  // read, so its first entry is not the piece the quote came from — measured: a span verbatim in the
  // fourth piece was being tested against the first and discarded. The item the span is actually IN
  // is the item to record, and finding it is what makes `evidenceItemId` a fact rather than an
  // assumption.
  //
  // WHITESPACE_NORMALIZED counts. The corpus is hard-wrapped and a model quotes the sentence, not the
  // line — `locateSpan` already draws that line, and line wrapping is not fabrication.
  for (const i of items) {
    const m = locateSpan(q, i.id, items.map((x) => ({ id: x.id, text: x.text })));
    if (m === 'EXACT' || m === 'WHITESPACE_NORMALIZED') return { quote: q, itemId: i.id };
  }
  return null;
};

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
  writeFileSync(join(DATA, 'pending-standard.json'), JSON.stringify(v, null, 1));
  if (stamped) writeFileSync(join(DATA, 'ratification-ledger.json'), JSON.stringify(stamped, null, 1));
  console.log(`StandardVersion ${v.standardVersionHash} [${v.authorityState}]: ${kept.length} requirements.`);
  console.log(`  discovered ${(discoveryRecall(v) * 100).toFixed(0)}%  ·  unconditional ${(unconditionalRate(v) * 100).toFixed(0)}%  ·  unconfirmed ${(unconfirmedRate(v) * 100).toFixed(0)}%`);
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
