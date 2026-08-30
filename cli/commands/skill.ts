// cli/commands/skill.ts — ONE WAY IN, FOR SOMEONE WHO HAS A SENTENCE OR A FOLDER.
//
// Everything this system does was reachable only by knowing which of thirty commands to type in
// which order. A person who can say what they want had no entry point at all: `add` takes one rule
// at a time and asks them to supply its kind and its condition, which is asking them to do the
// decomposition themselves.
//
// ─── THE ROUTE IS READ OFF THE INPUTS, NOT GUESSED ─────────────────────────────────────────────
//
// No classifier decides how hard the request is. What the person HAS is a fact:
//
//   a sentence, no work        →  they can state it. Propose rules, they ratify, compile.
//   work, no sentence          →  they can recognise it. The discovery path, unchanged.
//   both                       →  compile what they stated, then read the work for what they did not.
//   neither                    →  one question, and nothing else.
//
// An earlier design routed on how ARTICULABLE the request seemed. That was wrong twice over: a
// standard's difficulty is not knowable at the front door, and the measured study since found that
// even a rule someone states perfectly can be hard to EXECUTE. Acquisition difficulty and execution
// difficulty are different problems and only the first is visible here.
//
// ─── SAYING SOMETHING IS NOT RATIFYING IT ──────────────────────────────────────────────────────
//
// "Lead with the action, no preamble, never end with an offer of help" separates cleanly into three
// rules and a model does that faithfully. "Make it sound less like AI" does not: any operational
// reading of it is the model's invention, and adopting those silently would let a machine author a
// standard under the person's name.
//
// So a proposal is shown before anything binds, and each rule is marked with which it is. A faithful
// separation is EXPERT_STATED; anything the model added is MACHINE_DISCOVERED and carries the
// ordinary ceiling. Nothing is compiled until a person answers.

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { sha, die, flag, argv, positional, clientFor, PROPOSER, loadSession, saveSession, authoredIdAllocator, type ProposalSet, type ProposedRule } from '../runtime.js';
import { groundedInUserText } from '../../core/ratification/grounding.js';
import { draftHash, appendDecision, type RatificationLedger } from '../../core/ratification/decision-record.js';
import { decide } from '../../core/ratification/authority.js';
import { spend, type Budget } from '../../core/inference/client.js';
import type { Requirement } from '../../core/state/canonical-state.js';
import { create } from './improve.js';
import { ratifyClose } from './ratify.js';
import { build } from './build.js';

export type SkillRoute = 'DIRECT' | 'DISCOVER' | 'HYBRID' | 'NEEDS_INPUT';

export interface RouteDecision {
  readonly route: SkillRoute;
  readonly why: string;
  /** the one thing to ask for, when nothing else can proceed */
  readonly question: string | null;
}

/**
 * Deterministic. Reads what the person supplied and nothing about what it means.
 *
 * Exported and tested separately because a route is a decision, and a decision made inside a command
 * body is one nobody can check.
 */
export function routeFor(prompt: string | null, corpusPath: string | null): RouteDecision {
  const hasPrompt = Boolean(prompt && prompt.trim().length > 0);
  const hasCorpus = Boolean(corpusPath && existsSync(corpusPath));
  if (corpusPath && !hasCorpus) {
    return { route: 'NEEDS_INPUT', why: `there is nothing at ${corpusPath}.`,
      question: 'Where is the work you want it read from?' };
  }
  if (hasPrompt && hasCorpus) {
    return { route: 'HYBRID', why: 'you stated some of it and supplied work for the rest.', question: null };
  }
  if (hasPrompt) {
    return { route: 'DIRECT', why: 'you can state what you want, so nothing needs to be read.', question: null };
  }
  if (hasCorpus) {
    return { route: 'DISCOVER', why: 'you supplied work rather than rules, so the rules are read from it.', question: null };
  }
  return { route: 'NEEDS_INPUT',
    why: 'nothing was supplied — neither what you want nor an example of it.',
    question: 'Say what good looks like, or point at work that shows it.' };
}

const PROPOSER_SYSTEM = `You separate what a person said into individual rules. You do not add rules.

For each rule report:
- statement: one sentence, in their words as far as possible, saying ONLY what the behaviour is.
  The condition does NOT belong here. "number the steps when there are steps" splits into a statement
  of "number the steps" and an appliesWhen of "the answer has more than one step". Leaving the
  condition in both places makes the compiled rule say it twice.
- kind: GENERATIVE if it says to DO something, BOUNDARY if it says NOT to.
- appliesWhen: the condition under which it holds, or exactly "GENERAL" if it always holds.
- faithful: true if the person actually said this. false if you are supplying an operational reading
  they did not state.
- sourceSpan: the EXACT words from what they said that this rule restates, copied verbatim. For a
  rule they did not state, copy the closest phrase that prompted your reading.

Also report workType: two or three words for the kind of work this governs, as a person would say
it — "writing", "code review", "customer email". This is DESCRIPTIVE, not part of the standard: it
becomes the skill's description, which is how a host decides whether to load the skill at all.

THE FAITHFUL FIELD IS THE IMPORTANT ONE, and getting it right matters more than being helpful.
"lead with the action" separates faithfully. "make it sound less like AI" does not: any concrete rule
you write for it is your invention, so mark those false. Do not refuse to propose them — mark them.

Watch for conditions hiding inside a rule that sounds absolute. "Number multi-step work" is not
unconditional: it applies when the work has multiple steps, and stating that is the difference
between a rule and an instruction to number everything.`;

const PROPOSER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    rules: {
      type: 'array', minItems: 1, maxItems: 12,
      items: {
        type: 'object',
        properties: {
          statement: { type: 'string' },
          kind: { type: 'string', enum: ['GENERATIVE', 'BOUNDARY'] },
          appliesWhen: { type: 'string' },
          faithful: { type: 'boolean' },
          sourceSpan: { type: 'string' },
        },
        required: ['statement', 'kind', 'appliesWhen', 'faithful', 'sourceSpan'],
        additionalProperties: false,
      },
    },
    workType: { type: 'string' },
  },
  required: ['rules', 'workType'], additionalProperties: false,
};

interface Proposed {
  statement: string; kind: 'GENERATIVE' | 'BOUNDARY'; appliesWhen: string; faithful: boolean; sourceSpan?: string;
}

export async function skill(): Promise<void> {
  const prompt = flag('--want') ?? positional([]) ?? null;
  const corpus = flag('--from') ?? null;
  const decision = routeFor(prompt, corpus);

  if (decision.route === 'NEEDS_INPUT') {
    die(`${decision.why}\n\n  ${decision.question}\n\n`
      + '  atelier skill "answers should lead with the action, never end with an offer of help"\n'
      + '  atelier skill --from ./my-best-work\n'
      + '  atelier skill "make it sound like me" --from ./my-best-work');
  }

  if (decision.route === 'DISCOVER') {
    console.log(`Reading the work: ${decision.why}\n`);
    await create(resolve(corpus ?? die('--from required')));
    return;
  }

  // ── DIRECT and HYBRID both start from what the person said ───────────────────────────────────
  console.log(`${decision.why}\n`);

  // ── PROPOSED ONCE, PERSISTED, AND THE PERSON APPROVES THOSE BYTES ──────────────────────────
  //
  // The preview and the acceptance used to be two independent model calls: `--yes` re-rolled the
  // proposer and compiled whatever came back the second time. The set is now written to the session
  // BEFORE it is shown, a later run with the same prompt reuses it with no call at all, and a
  // different prompt invalidates it — you can only ever accept what you saw.
  const promptHash = sha(prompt ?? '');
  let s = loadSession();
  let pset: ProposalSet | null = s.proposalSet?.promptHash === promptHash ? (s.proposalSet ?? null) : null;

  if (!pset) {
    const client = clientFor(PROPOSER);
    const budget: Budget = { spentUsd: 0, capUsd: 0.5, maxCalls: 2 };
    const r = await spend(budget, 0.02, async () => {
      const x = await client.complete({
        stableBlock: PROPOSER_SYSTEM, variableBlock: '',
        userMessage: `WHAT THEY SAID:\n${prompt ?? ''}\n\nSeparate it.`,
        toolName: 'emit_rules', toolDescription: 'Separate what was said into individual rules.',
        schema: PROPOSER_SCHEMA, maxTokens: 2000,
      });
      return { value: x, cost: x.cost };
    });

    const payload = r.json as { rules?: Proposed[]; workType?: string };
    // An EMPTY string must fall through, not be accepted — a work type of "" would become a skill
    // description of "". The person's flag beats the model's guess: the flag is a decision, the
    // guess is a reading, and the old order let the reading win.
    const firstNonEmpty = (...xs: (string | undefined)[]): string =>
      xs.map((x) => (x ?? '').trim()).find((x) => x.length > 0) ?? 'writing';
    const workType = firstNonEmpty(flag('--work-type'), payload.workType);
    const proposed = (payload.rules ?? []).filter((p) => p.statement?.trim());
    if (!proposed.length) die('nothing separable was found in that. Try saying what a good answer does.');

    // ── GROUNDED HERE, DETERMINISTICALLY — the model's `faithful` is evidence, never authority ──
    const rules: ProposedRule[] = proposed.map((p) => {
      const g = groundedInUserText({ statement: p.statement.trim(),
        appliesWhen: p.appliesWhen.trim() || 'GENERAL', sourceSpan: p.sourceSpan ?? '' }, prompt ?? '');
      return { statement: p.statement.trim(), kind: p.kind, appliesWhen: p.appliesWhen.trim() || 'GENERAL',
        sourceSpan: p.sourceSpan ?? '', faithful: p.faithful, grounded: g.grounded, groundingWhy: g.why };
    });
    pset = { proposalSetHash: sha(JSON.stringify(rules)), promptHash, workType, rules };
    s = { ...s, proposalSet: pset };
    saveSession(s);
  } else {
    console.log('(using the proposal you were already shown — nothing was re-asked)\n');
  }

  const workType = pset.workType;
  console.log(`${pset.rules.length} rule(s) from what you said, for ${workType}:\n`);
  pset.rules.forEach((p, i) => {
    const cond = p.appliesWhen.trim().toUpperCase() === 'GENERAL' ? '' : `\n      applies when: ${p.appliesWhen}`;
    console.log(`  ${i + 1}. [${p.kind === 'BOUNDARY' ? "don't" : 'do  '}] ${p.statement}${cond}`);
    if (!p.grounded) console.log('      ^ MY READING — these words are not in what you said. It needs your decision.');
  });

  const invented = pset.rules.filter((p) => !p.grounded);
  const mine = pset.rules.length - invented.length;
  console.log(`\n${mine} of these ${mine === 1 ? 'is' : 'are'} yours, in your own words.`
    + (invented.length
      ? ` ${invented.length} ${invented.length === 1 ? 'is my reading' : 'are my readings'}: accepted, `
        + 'they are SHOWN to the model without instructing it, until you declare them required.'
      : ''));

  if (!argv.includes('--yes')) {
    console.log('\nNothing has been compiled. To accept exactly these:\n'
      + `\n  atelier skill ${JSON.stringify(prompt ?? '')} --yes --name <name>\n`
      + '\nTo change one first, accept then use `atelier amend`, or state it differently and run again.');
    return;
  }

  // ── ACCEPTED: THE PERSISTED SET, NOT A RE-ROLL ─────────────────────────────────────────────
  //
  // A grounded rule is the person's own sentence, mechanically verified — EXPERT_AUTHORED through
  // `decide`. An ungrounded one is the machine's reading the person just approved — ratified, and
  // under the source-aware default it is shown, not instructed, until they declare it. Every ruling
  // lands in the ledger, one record per rule.
  const nextId = authoredIdAllocator(s);
  const bases: Requirement[] = pset.rules.map((p) => ({
    requirementId: nextId(), statement: p.statement,
    appliesWhen: p.appliesWhen,
    kind: p.kind,
    authority: 'DERIVED_UNRATIFIED',
    provenance: 'MACHINE_DISCOVERED',
    evidence: p.sourceSpan || null, evidenceItemId: null, wouldBeAbsentIf: null,
    materiality: null, realizationTolerance: null, outputShape: null,
  }));
  let ledger: RatificationLedger = { standardDraftHash: draftHash(bases), records: [] };
  const decidedNow: Requirement[] = bases.map((base, i) => {
    const outcome = decide(base, { verb: pset.rules[i].grounded ? 'STATED' : 'APPROVE' });
    ledger = appendDecision(ledger, base, outcome.ledgerDecision, { decidedAt: new Date().toISOString() });
    return outcome.requirement;
  });
  saveSession({ ...s, decided: [...s.decided, ...decidedNow], ledger, proposalSet: null });

  if (decision.route === 'HYBRID') {
    console.log('\nNow reading the work for what you did not say.\n');
    await create(resolve(corpus ?? die('--from required')));
    return;
  }

  // The work type reaches `ratify-close` the way a flag would. It is a description of what the skill
  // governs, not a claim about the standard, and the person has just seen it in the proposal.
  process.env.ATELIER_ORCHESTRATED = '1';
  if (!argv.includes('--work-type')) { argv.push('--work-type', workType); }
  ratifyClose();
  build(flag('--name') ?? basename(process.cwd()));
}