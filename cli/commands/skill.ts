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
import { die, flag, argv, positional, clientFor, PROPOSER, loadSession, saveSession, authoredIdAllocator } from '../runtime.js';
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
        },
        required: ['statement', 'kind', 'appliesWhen', 'faithful'],
        additionalProperties: false,
      },
    },
    workType: { type: 'string' },
  },
  required: ['rules', 'workType'], additionalProperties: false,
};

interface Proposed {
  statement: string; kind: 'GENERATIVE' | 'BOUNDARY'; appliesWhen: string; faithful: boolean;
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
  // An EMPTY string must fall through, not be accepted, which is why this is a chain of explicit
  // checks rather than `??` — a work type of "" would become a skill description of "" and the host
  // reads that when deciding whether to load the skill at all.
  const firstNonEmpty = (...xs: (string | undefined)[]): string =>
    xs.map((x) => (x ?? '').trim()).find((x) => x.length > 0) ?? 'writing';
  const workType = firstNonEmpty(payload.workType, flag('--work-type'));
  const proposed = (payload.rules ?? []).filter((p) => p.statement?.trim());
  if (!proposed.length) die('nothing separable was found in that. Try saying what a good answer does.');

  console.log(`${proposed.length} rule(s) from what you said, for ${workType}:\n`);
  proposed.forEach((p, i) => {
    const cond = p.appliesWhen.trim().toUpperCase() === 'GENERAL' ? '' : `\n      applies when: ${p.appliesWhen}`;
    console.log(`  ${i + 1}. [${p.kind === 'BOUNDARY' ? "don't" : 'do  '}] ${p.statement}${cond}`);
    if (!p.faithful) console.log('      ^ YOU DID NOT SAY THIS. It is a reading of what you said, and it needs your decision.');
  });

  const invented = proposed.filter((p) => !p.faithful);
  const mine = proposed.length - invented.length;
  console.log(`\n${mine} of these ${mine === 1 ? 'is' : 'are'} yours.`
    + (invented.length
      ? ` ${invented.length} ${invented.length === 1 ? 'is the machine\'s reading' : "are the machine's reading"} `
        + 'and will be shown to the model as an example rather than instructing it, until you say otherwise.'
      : ''));

  if (!argv.includes('--yes')) {
    console.log('\nNothing has been compiled. To accept these as written:\n'
      + `\n  atelier skill ${JSON.stringify(prompt ?? '')} --yes --name <name>\n`
      + '\nTo change one first, accept then use `atelier amend`, or state it differently and run again.');
    return;
  }

  // ── ACCEPTED ────────────────────────────────────────────────────────────────────────────────
  //
  // A faithful separation is the person's own rule, transcribed. Anything the model supplied is a
  // machine proposal and carries the ordinary ceiling — `componentFor` serves an unratified rule as
  // an EXAMPLE under OBSERVE, so it is shown to the model and never instructs it.
  const s = loadSession();
  const nextId = authoredIdAllocator(s);
  const decided: Requirement[] = proposed.map((p) => ({
    requirementId: nextId(), statement: p.statement.trim(),
    appliesWhen: p.appliesWhen.trim() || 'GENERAL',
    kind: p.kind,
    authority: p.faithful ? 'EXPERT_AUTHORED' : 'DERIVED_UNRATIFIED',
    provenance: p.faithful ? 'EXPERT_STATED' : 'MACHINE_DISCOVERED',
    evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
    materiality: null, realizationTolerance: null, outputShape: null,
  }));
  saveSession({ ...s, decided: [...s.decided, ...decided] });

  if (decision.route === 'HYBRID') {
    console.log('\nNow reading the work for what you did not say.\n');
    await create(resolve(corpus ?? die('--from required')));
    return;
  }

  // The work type reaches `ratify-close` the way a flag would. It is a description of what the skill
  // governs, not a claim about the standard, and the person has just seen it in the proposal.
  if (!argv.includes('--work-type')) { argv.push('--work-type', workType); }
  ratifyClose();
  build(flag('--name') ?? basename(process.cwd()));
}
