// cli/commands/discover.ts — Proposing rules from the sealed corpus, and the human decisions on them.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { existsSync, rmSync } from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { join, basename } from 'node:path';
import { readJson } from '../../core/state/read-json.js';
import { proposeAcrossFramings } from '../../core/discovery/propose.js';
import { describeUnion } from '../../core/discovery/union.js';
import { runDiscoveryChain } from '../../core/discovery/run-chain.js';
import { anchoredQuote } from '../../core/discovery/conformance.js';
import { type ImportPlan } from '../../core/discovery/chain/corpus-import.js';
import { runMethodExtraction, describeMethodRun } from '../../core/discovery/run-methods.js';
import type { Budget, InferenceClient } from '../../core/inference/client.js';
import { BudgetExceeded, spend } from '../../core/inference/client.js';
import { transition, type Run } from '../../core/state/run-state.js';
import type { Requirement } from '../../core/state/canonical-state.js';
import { isGeneralScope } from '../../core/state/canonical-state.js';
import { extract } from '../../core/intake/extract.js';

import { deriveMeasuredRules } from '../../core/observers/derive.js';
import { deriveContrastRules, contrastTopics } from '../../core/observers/contrast.js';
import { buildProfile } from '../../core/fidelity/profile.js';
import { buildRetrievalIndex } from '../../core/fidelity/retrieval.js';
import { judgeCountedFeatures, signalsOf } from '../../core/observers/selection.js';
import { featureOf } from '../../core/observers/features.js';
import { formatOf } from '../../core/observers/formats.js';
import { normalizeClass } from '../../core/observers/doc-class.js';
import { quantile, wordsOf } from '../../core/observers/text.js';
import * as store from '../../core/state/store.js';
import { skillNameFrom } from '../../renderers/agent-skill/render.js';
import { mapLimit } from '../../core/inference/concurrency.js';
import { GenerationIncomplete, ModelUnavailable } from '../../core/inference/client.js';
import { sha, die, argv, orchestrated, proposerModel, proposerIsDefault, diagnoserModel, modelFor, type ProposalMeta, clientFor, clientAndBinding, loadSession, saveSession, sourceProvenance, numericFlag, priceOverrideFor, runFile, flag, DATA } from '../runtime.js';
import { priceFor, ANTHROPIC_PRICING, PRICES_CHECKED_ON } from '../../providers/pricing.js';

// ── discover ─────────────────────────────────────────────────────────────────────────────────
// The CLI once carried its own proposer prompt and schema here, hardcoded, beside the ones
// derived from `framing.ts`. Nothing called them. They are removed rather than kept: a second
// prompt that no path reaches is a prompt that drifts from the real one in silence, and the
// next person to wire it would have bypassed the framing owner without noticing.

/**
 * Why discovery may retry on its other configured model, or null when it may not: the proposer REFUSED
 * (a classifier's false positive on "describe how this author writes"), or the proposer is the built-in
 * default and this backend does not serve it (UNSERVED). A model the person named is theirs, and is never
 * swapped behind their back.
 */
export function discoveryRetry(e: unknown, proposerIsDefault: boolean): 'REFUSED' | 'UNSERVED' | null {
  if (e instanceof GenerationIncomplete && e.termination.kind === 'REFUSAL') return 'REFUSED';
  if (e instanceof ModelUnavailable && proposerIsDefault) return 'UNSERVED';
  return null;
}

/**
 * A call on the model that reads the corpus, outside discovery (the persona at build). An unserved DEFAULT
 * reader is swapped for the target model once, and said, exactly as discovery swaps it: otherwise a backend
 * that got through discovery would lose the persona at build with one parenthetical line.
 */
export async function onCorpusReader<T>(call: (client: InferenceClient) => Promise<T>): Promise<T> {
  try {
    return await call(clientFor(proposerModel()));
  } catch (e) {
    const target = modelFor('target');
    if (discoveryRetry(e, proposerIsDefault()) !== 'UNSERVED' || target === proposerModel()) throw e;
    console.log(`(${proposerModel()}, the default reader, is not served by this backend; using ${target}.)`);
    return call(clientFor(target));
  }
}

export async function discover(): Promise<void> {
  const s = loadSession();
  if (!s.evidence) die('nothing sealed. Run `atelier intake <path>` first.');
  const files = readJson<{ id: string; path: string; kind?: string }[]>(runFile('corpus-paths.json'), { kind: 'array', what: 'the sealed corpus path list' });
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

  // `let`: a refused or unserved default proposer is replaced, and every later proposer call uses the replacement.
  let client = clientFor(proposerModel());
  let proposals: Requirement[];
  let proposalMeta: Record<string, ProposalMeta>;
  let heldOutChecked = true;

  // ─── THE SPLIT IS USED WHENEVER THE CORPUS ALLOWS IT ────────────────────────────────────────
  //
  // Four pieces is the floor: two the proposer reads, two it never sees. Below that a rule cannot be
  // told apart from a description of one example, so the chain refuses rather than producing a
  // weaker version of itself — and we fall back to the single call, saying so plainly. A user with
  // three pieces should know their standard rests on unvalidated proposals.
  const importPlan = readJson<ImportPlan>(runFile('import-plan.json'), { what: 'the import plan' });

  // ── THE RESERVE IS ENFORCED HERE, ON THE ONLY PATH THAT READS ────────────────────────────
  //
  // Reserving at intake is a promise; this is where it is kept. Both the items and the golden ROLES
  // are filtered, because the chain splits `goldens` into proposal and held-out sets of its own —
  // leaving a reserved piece in that list would let it be read as chain-held-out material, which is
  // read by the observer even when it is not read by the proposer.
  const reservedIds = new Set((loadSession().reservation?.reserved ?? []).map((u) => u.unitId));
  // Under `atelier new`, intake has just said which pieces are held back.
  if (reservedIds.size && !orchestrated()) {
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
  // HELD-OUT ONLY. This counted every piece that was not a proposal, so pieces past the proposer's
  // one-pass read were quoted as observation calls that never happen, and a 14-piece corpus was
  // quoted at twice its cost and refused at the default cap.
  const heldIds = new Set(openGoldens.filter((g) => g.role === 'HELD_OUT').map((g) => g.contextId));
  const heldItems = openItems.filter((i) => heldIds.has(i.id));
  const heldCount = Math.max(1, heldItems.length);
  // THE CALL BOUND FOLLOWS THE SPLIT. It was a flat 60, and the split now holds out up to eight
  // pieces: eight pieces times twelve rules is 96 observation calls, so a larger corpus spent its
  // budget and stopped at call 60 with nothing saved. The bound is the worst case this run can make —
  // both vantages, the matcher, every rule the union can keep against every held-out piece — so it
  // binds a runaway without binding the run it was sized for.
  const worstCaseCalls = 2 /* vantages */ + 2 /* matcher */ + 24 * heldCount + 4;
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 3.0), maxCalls: numericFlag('--max-calls', worstCaseCalls) };
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
  const modelName = proposerModel();
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
      + `at $${rate.inputPerM}/$${rate.outputPerM} per M, rates as of ${PRICES_CHECKED_ON})`);
    // The date is not decoration. A built-in rate is a number we wrote down once, and a person
    // reading a dollar estimate is entitled to know how old it is before trusting it.
  }
  if (rate && hi > budget.capUsd) {
    die(`Estimated up to $${hi.toFixed(2)} and your limit is $${budget.capUsd.toFixed(2)}. NOTHING HAS BEEN SPENT.`
      + `\n  Raise the limit:  --cap ${Math.ceil(hi * 10) / 10}`
      + `\n  Or spend less:    point at fewer pieces, or shorter ones.`);
  }

  // ── A REFUSAL, OR AN UNSERVED DEFAULT, IS NOT THE END OF DISCOVERY ──────────────────────────
  //
  // On the first real run against an author's own posts, the default proposer stopped with
  // stop_reason "refusal" on the rule-extraction call, twice, while the discovery-side model answered
  // it cleanly. A classifier's false positive on "describe how this author writes" should cost one
  // retry on the other configured model, said out loud — not the run.
  //
  // The first run of the shipped CLI then died before any of that: the default proposer was not a model
  // the person's gateway served. A DEFAULT that is not served is swapped the same way, and said. A model
  // the person named is not swapped behind their back: that stops with the setting to change.
  let usedModel = proposerModel();
  let chain: Awaited<ReturnType<typeof runDiscoveryChain>>;
  try {
    chain = await runDiscoveryChain(client, budget, 'skill', openItems, openGoldens, { standardDimensions: [ev.workType] }, usedModel);
  } catch (e) {
    const retry = discoveryRetry(e, proposerIsDefault());
    const fallbackModel = retry === 'UNSERVED' ? modelFor('target') : diagnoserModel();
    if (!retry || fallbackModel === usedModel) throw e;
    console.log(retry === 'REFUSED'
      ? `\n${usedModel} declined the request (a refusal, not an error in your work). Retrying once with ${fallbackModel}.`
      : `\n${usedModel}, the default reader, is not served by this backend; reading your work with ${fallbackModel} instead. The record names the model that read it.`);
    usedModel = fallbackModel;
    client = clientFor(fallbackModel);
    chain = await runDiscoveryChain(client, budget, 'skill', openItems, openGoldens, { standardDimensions: [ev.workType] }, usedModel);
  }

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
    // The page's "not checked against unseen work" caveat reads this flag, and nothing ever wrote
    // it — the one warning built for exactly this downgrade could never render. The first fix wrote it
    // onto `s.run`, but the run saved below is `t.run`, the transition taken before this branch, so
    // the flag was set on an object nobody persisted. It is carried to the save instead.
    heldOutChecked = false;
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
    proposalMeta = Object.fromEntries(union.members.map((m, i) => [`p${i + 1}`, {
      framings: m.framings, alsoPhrasedAs: m.rules.slice(1).map((r) => r.rule.statement),
      heldOut: null, needs: null } satisfies ProposalMeta]));
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
    proposalMeta = Object.fromEntries(chain.hypotheses.map((h, i) => {
      const d = h.hypothesis.description;
      const member = chain.framingUnion?.members.find((m) => m.rules.some((r) => r.rule.description === d));
      const factor = chain.proposed.find((f) => f.description === d);
      const applicable = h.golden.filter((g) => g.applicable).length;
      return [`p${i + 1}`, {
        framings: member?.framings ?? [],
        alsoPhrasedAs: (member?.rules ?? []).map((r) => r.rule.description).filter((x) => x !== d),
        heldOut: { applicable, present: h.golden.filter((g) => g.applicable && g.present).length },
        needs: factor?.needs?.trim() ? factor.needs.trim() : null } satisfies ProposalMeta];
    }));
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
  const pkgPath = runFile('skill-package.json');

  // ── THE TASTE RUN IS PERSISTED BEFORE ANYTHING OPTIONAL RUNS ─────────────────────────────────
  //
  // It was saved AFTER the methodology block, which meant any failure below discarded a result the
  // user had already paid for. The catch below states the rule in its own words — "a failed
  // methodology check must not cost the taste run that already succeeded and was paid for" — and
  // the read that threw sat one line ABOVE the try, so the single failure it was written to prevent
  // was the one that happened: a stale `skill-package.json` left in the GLOBAL store by an
  // unrelated project killed a fresh run after 39 held-out checks and lost all 13 proposals.
  //
  // Ordering is the fix, not a bigger try. Once inference has been spent, its result is written
  // before any step that may fail, so no later refusal can reach back and delete it.
  // ── THE MEASURABLE PART, COUNTED RATHER THAN READ ─────────────────────────────────────────────
  //
  // Sentence and paragraph length, hedging, and the stock phrases the author never uses — proposed
  // with their measurement attached, over the pieces discovery was allowed to read (never the
  // reserve). They go on the same screen and take the same ruling as everything else.
  const readIds = new Set(openGoldens.filter((g) => g.role === 'PROPOSAL').map((g) => g.contextId));
  const measured = deriveMeasuredRules(openItems.filter((i) => readIds.has(i.id)), openItems.filter((i) => heldIds.has(i.id)), sourceProvenance());
  if (measured.length) {
    console.log(`${measured.length} measurable rule(s) counted from the same pieces: ${measured.map((m) => m.requirement.requirementId).join(', ')}.`);
    proposals = [...proposals, ...measured.map((m) => m.requirement)];
    proposalMeta = { ...proposalMeta, ...Object.fromEntries(measured.map((m) => [m.requirement.requirementId, {
      framings: [], alsoPhrasedAs: [], heldOut: null, needs: null, inSample: m.conformance } satisfies ProposalMeta])) };
  }
  // ── WHAT THE MODEL DOES THAT THE AUTHOR DOESN'T ───────────────────────────────────────────────
  //
  // The model that will run the skill writes a few plain drafts on the author's own topics, and every
  // named pattern (em dashes, fragments, "not X, it's Y", signposting…) is counted in both. Wide gaps
  // become proposed caps and floors, each checked on held-out pieces first; see core/observers/contrast.ts.
  // Saved BEFORE the optional comparison: whatever happens to it, the discovery already paid for is kept.
  saveSession({ ...s, run: { ...(t as { run: Run }).run, heldOutChecked }, proposals, proposalMeta });
  // THE SIGNALS ARE THIS STEP'S OR NONE. Build installs whatever signals.json the run holds, so one left
  // by an earlier discovery would be installed after a comparison that failed, or never ran
  // (--no-contrast), as if this one had found them.
  rmSync(runFile('signals.json'), { force: true });
  rmSync(runFile('fidelity.json'), { force: true }); rmSync(runFile('retrieval.json'), { force: true });
  // THE PLAIN DRAFTS ARE OPTIONAL; THE TELL FLOOR IS NOT. Rules that compare the author with the model
  // need its drafts; the machine-tell floor, register and contrastive verdicts are measured on the author's
  // pieces alone. A comparison that failed once dropped all of them, and a skill shipped with no floor
  // against em dashes for an author who never writes one.
  const read = openItems.filter((i) => readIds.has(i.id));
  let drafts: string[] = [];
  if (!argv.includes('--no-contrast')) {
    try {
      drafts = await contrastDrafts(read, ev.corpusHash, contrastForm(read, declaredClass(s)));
    } catch (e) {
      // Optional, and never allowed to cost the discovery already paid for.
      console.log(`(the model's plain drafts could not be written: ${(e as Error).message.split('\n')[0]}; rules measured on your pieces alone are still proposed)`);
    }
  }
  const contrast = deriveContrastRules(read, heldItems, drafts, sourceProvenance());
  if (drafts.length >= 2) {
    // THE SIGNALS. Counted features that separate this author from the model over many drafts, but not
    // draft by draft: kept with the skill to choose between drafts and to profile one, never proposed.
    const signals = signalsOf(judgeCountedFeatures(read.map((i) => i.text), heldItems.map((i) => i.text), drafts));
    writeAtomic(runFile('signals.json'), JSON.stringify(signals, null, 1));
    if (signals.length) {
      console.log(`${signals.length} signal(s) of your style, used to choose between drafts (not rules): ${signals.map((x) => featureOf(x.id)?.label ?? x.id).join('; ')}.`);
    }
  }
  // THE FIDELITY PROFILE (core/fidelity/profile.ts): every counted feature's band on the author's pieces,
  // per length class where there are enough of them, its role, and a stylometric detector when there are
  // drafts enough to train one. Installed by build with the skill; it steers drafts and is recorded with
  // every output. Built from what this step already holds, so it costs nothing more.
  const profile = buildProfile({ read, held: heldItems, model: drafts, corpusHash: ev.corpusHash });
  writeAtomic(runFile('fidelity.json'), JSON.stringify(profile));
  // RETRIEVAL, FROM THE PIECES READ ONLY. The held-back pieces are the blind comparison (atelier reference):
  // served to the writer, they would be compared with outputs written from them.
  writeAtomic(runFile('retrieval.json'), JSON.stringify(buildRetrievalIndex(read)));
  const steering = profile.bands.filter((b) => b.cls === 'all' && b.role !== 'MONITOR').length;
  console.log(`Fidelity profile: ${profile.bands.filter((b) => b.cls === 'all').length} feature(s) measured on your pieces, ${steering} of them steer drafts${profile.detector ? `; a style detector trained against ${profile.detector.trainedOn.model} model drafts` : ''}.`);
  if (contrast.length) {
    const from = drafts.length >= 2 ? `from comparing your writing with ${drafts.length} plain drafts by the model` : 'measured on your pieces alone (no plain drafts to compare with)';
    console.log(`${contrast.length} rule(s) ${from}: ${contrast.map((c) => c.requirement.requirementId).join(', ')}.`);
    proposals = [...proposals, ...contrast.map((c) => c.requirement)];
    proposalMeta = { ...proposalMeta, ...Object.fromEntries(contrast.map((c) => [c.requirement.requirementId, {
      framings: [], alsoPhrasedAs: [], heldOut: null, needs: null, inSample: c.conformance } satisfies ProposalMeta])) };
    // An addition to what is already saved, not a second save of the run.
    saveSession({ ...loadSession(), proposals, proposalMeta });
  }

  if (methodDocs.size && existsSync(pkgPath) && !argv.includes('--skip-methods')) {
    try {
      // INSIDE the try. A malformed package is a reason to skip the methodology check, never a
      // reason to end the command — and it is emphatically not a defect in the user's corpus.
      const sp = readJson<{ absRoot: string; readable: string[] }>(pkgPath, { what: 'a source package', requireKeys: ['absRoot'] });
      // checked against the WHOLE readable package, not just the SKILL.md — an obligation carried in a
      // template is carried, and reporting it missing because we only looked at one file is a defect
      // in the instrument reported as a defect in the skill.
      const skillText = sp.readable.map((rel) => { const r = extract(join(sp.absRoot, rel)); return r.ok ? r.text : ''; }).join('\n\n');
      const mrun = await runMethodExtraction(client, budget, methodDocs, skillText, { standardDimensions: [ev.workType] });
      console.log(`\n${describeMethodRun(mrun)}  ($${mrun.costUsd.toFixed(3)})`);
      writeAtomic(runFile('method-findings.json'), JSON.stringify(mrun, null, 1));
    } catch (e) {
      // A failed methodology check must not cost the taste run that already succeeded and was paid for.
      if (e instanceof BudgetExceeded) console.log(`\nSkipped the methodology check — it would exceed the cap. Raise --cap or pass --skip-methods.`);
      else console.log(`\nThe methodology check failed: ${(e as Error).message}\nYour discovered rules above are unaffected.`);
    }
  }

  const b = proposals.filter((p) => p.kind === 'BOUNDARY').length;
  console.log(`\n${proposals.length} rule(s)${b ? `, ${b} of them boundaries` : ''}.  ($${budget.spentUsd.toFixed(3)})`);
  // Under `atelier new` the review screen shows every rule next; listing them here too printed the
  // same twenty rules twice in a row.
  if (!process.env.ATELIER_ORCHESTRATED) {
    for (const p of proposals) {
      const cond = isGeneralScope(p.appliesWhen) ? '' : `\n    applies when: ${p.appliesWhen}`;
      console.log(`  [${p.requirementId}] ${p.statement}${cond}`);
    }
  }
  if (!process.env.ATELIER_ORCHESTRATED) console.log(`\nRun \`atelier ratify-close\` to mint the standard.`);
}

/** The document class this run declared: `--class` on this call, or the one `atelier new` kept for the skill. */
function declaredClass(s: { skillName?: string | null; source?: string | null }): string | null {
  const cls = flag('--class');
  if (cls !== undefined) return cls.trim().toLowerCase() === 'none' ? null : normalizeClass(cls);
  let name = s.skillName ?? null;
  if (!name && s.source) { try { name = skillNameFrom(basename(s.source)); } catch { name = null; } }
  return name ? store.getDocClass({ root: DATA, skillName: name }) : null;
}

/**
 * WHAT THE MODEL IS ASKED TO WRITE, SO ITS DRAFTS ARE THE SAME KIND OF THING AS THE AUTHOR'S. Every
 * comparison was against "a blog post, about 900 words", so the habits of a LinkedIn author were measured
 * against blog posts three times their length. The declared class names the kind (a known format gives
 * its label), and the length is the median of the author's own read pieces, held inside the format's
 * usual band; with no class, "a piece" at that median.
 */
export function contrastForm(read: readonly { text: string }[], cls: string | null): { label: string; words: number } {
  const counts = read.map((p) => wordsOf(p.text).length).filter((n) => n > 0);
  const median = counts.length ? Math.round(quantile(counts, 0.5)) : 900;
  const f = formatOf(cls);
  const band = f?.words;
  const words = band ? Math.min(band[1], Math.max(band[0], median)) : median;
  const plain = cls ? cls.replace(/-/g, ' ') : null;
  const label = f?.label ?? (plain ? `${/^[aeiou]/i.test(plain) ? 'an' : 'a'} ${plain}` : 'a piece');
  // Rounded as a person would ask for it: to ten words under 200, to fifty above.
  return { label, words: words < 200 ? Math.max(10, Math.round(words / 10) * 10) : Math.round(words / 50) * 50 };
}

/**
 * Plain drafts by the model that will serve the skill, on the author's own titles, no skill applied.
 * Kept per corpus so continuing or re-running discovery does not pay for them twice.
 */
async function contrastDrafts(read: readonly { id: string; text: string }[], corpusHash: string, form: { label: string; words: number }): Promise<string[]> {
  const path = runFile('contrast-drafts.json');
  const { client, binding } = clientAndBinding('target');
  // Keyed by corpus, model AND form: another model's habits, or another kind of piece, is another comparison.
  const key = `${corpusHash}|${binding.requestedModel}|${form.label}|${form.words}|${Math.floor(numericFlag('--contrast-drafts', 12))}|with-examples`;
  if (existsSync(path)) {
    const cached = readJson<{ corpusHash: string; key?: string; drafts: string[] }>(path, { what: 'the contrast drafts' });
    if ((cached.key ?? cached.corpusHash) === key && cached.drafts.length) return cached.drafts;
  }
  // TWELVE, HALF OF THEM IMITATIONS. Five plain drafts let a feature qualify on three or four model values,
  // which is how a feature that merely ranks one draft oddly passed as taste. And a plain draft is the weak
  // adversary: what has to separate an author from the model is what still separates them when the model is
  // shown their own pieces, the way a person would ask it. So every other draft is written with two of the
  // author's other pieces pasted in as examples (never the piece whose topic it takes).
  const n = Math.max(4, Math.floor(numericFlag('--contrast-drafts', 12)));
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--contrast-cap', 3), maxCalls: n + 2 };
  const base = contrastTopics(read, read.length);
  const topics = Array.from({ length: Math.min(n, Math.max(base.length, 1) * 3) }, (_, i) => base[i % base.length] ?? 'a piece on your usual subject');
  console.log(`Asking the model for ${topics.length} drafts on your topics, half of them with your pieces as examples, to see its habits against yours…`);
  // Room for the author's length: a fixed 4,000 tokens truncated every draft of a 2,400-word author, and
  // the whole comparison was lost. One draft that fails costs that draft, not the comparison.
  const maxTokens = Math.min(16000, Math.max(4000, Math.ceil(form.words * 2.2) + 500));
  const examplesFor = (i: number): string => {
    const others = read.filter((_, j) => j !== i % read.length).slice(0, 2)
      .map((p) => p.text.split(/\s+/).slice(0, 1200).join(' '));
    return others.length ? `\n\nHere are pieces by the author, to write in their style:\n\n${others.map((t) => `<example>\n${t}\n</example>`).join('\n\n')}` : '';
  };
  const drafts = await mapLimit(topics.map((t, i) => ({ t, i })), Math.min(6, topics.length), async ({ t: topic, i }) => {
    try {
      const r = await spend(budget, 0.15, async () => {
        const x = await client.complete({ stableBlock: 'You are a writer. Write the piece you are asked for.', variableBlock: '',
          userMessage: `Write ${form.label} titled "${topic}". About ${form.words} words. Output only the piece.${i % 2 ? examplesFor(i) : ''}`,
          toolName: 'emit_piece', toolDescription: 'Emit the finished piece.',
          schema: { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'], additionalProperties: false }, maxTokens });
        return { value: x, cost: x.cost };
      });
      const piece: unknown = (r.json as { piece?: unknown } | null)?.piece;
      return typeof piece === 'string' ? piece : '';
    } catch (e) {
      console.log(`(one plain draft could not be written: ${(e as Error).message.split('\n')[0]})`);
      return '';
    }
  });
  const kept = drafts.filter((d) => d.trim());
  writeAtomic(path, JSON.stringify({ corpusHash, key, drafts: kept }, null, 1));
  return kept;
}
