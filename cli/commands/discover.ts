// cli/commands/discover.ts — Proposing rules from the sealed corpus, and the human decisions on them.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { readFileSync, existsSync } from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { join } from 'node:path';
import { proposeAcrossFramings } from '../../core/discovery/propose.js';
import { describeUnion } from '../../core/discovery/union.js';
import { runDiscoveryChain } from '../../core/discovery/run-chain.js';
import { anchoredQuote } from '../../core/discovery/conformance.js';
import { type ImportPlan } from '../../core/discovery/chain/corpus-import.js';
import { runMethodExtraction, describeMethodRun } from '../../core/discovery/run-methods.js';
import type { Budget } from '../../core/inference/client.js';
import { BudgetExceeded } from '../../core/inference/client.js';
import { transition, type Run } from '../../core/state/run-state.js';
import type { Requirement } from '../../core/state/canonical-state.js';
import { isGeneralScope } from '../../core/state/canonical-state.js';
import { extract } from '../../core/intake/extract.js';

import { sha, DATA, die, argv, flag, PROPOSER, clientFor, loadSession, saveSession, sourceProvenance, numericFlag, priceOverrideFor } from '../runtime.js';
import { priceFor, ANTHROPIC_PRICING } from '../../providers/pricing.js';

// ── discover ─────────────────────────────────────────────────────────────────────────────────
// The CLI once carried its own proposer prompt and schema here, hardcoded, beside the ones
// derived from `framing.ts`. Nothing called them. They are removed rather than kept: a second
// prompt that no path reaches is a prompt that drifts from the real one in silence, and the
// next person to wire it would have bypassed the framing owner without noticing.

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
      writeAtomic(join(DATA, 'method-findings.json'), JSON.stringify(mrun, null, 1));
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
    const cond = isGeneralScope(p.appliesWhen) ? '' : `\n    applies when: ${p.appliesWhen}`;
    console.log(`  [${p.requirementId}] ${p.statement}${cond}`);
  }
  console.log(`\nRun \`atelier ratify-close\` to mint the standard, or \`atelier build --name <name>\` if create is doing it for you.`);
}
