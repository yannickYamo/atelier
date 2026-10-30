// atelier/cli/prewrite.ts — WHAT IS SETTLED BEFORE THE DRAFT: THE PERSON'S ANSWERS, THEN THE PLAN.
//
// Two readings, in order, before the first draft of a piece (cli/commands/invoke.ts): the questions only the author can
// answer (core/loop/questions.ts) and the plan the draft is written from (core/loop/piece-plan.ts). One door, two ways of
// talking to the person:
//   - in a terminal (stdin and stdout are a TTY, and the run was not asked for --json or --answer-only) the questions are
//     asked, a letter or their own words answering each, "just write it" taking the defaults for the rest; the plan is
//     shown in a few lines, enter writes, anything typed is a change and the plan is made again from scratch with it;
//   - everywhere else (a pipe, --json, the MCP server, an agent host) nothing waits: the questions are returned as
//     structured choices, the draft is written with the defaults, said in one line, and `--answers "<id>=<choice>,..."`
//     answers them on the next call; the plan is returned and the draft written from it.
// Answers the person gave are kept per skill (core/state/store.ts, `addTold`) and are the defaults next time. With no model
// set up, both floors hold: nothing is asked and there is no plan, and the run writes as it did before.

import { createInterface } from 'node:readline/promises';
import { readContext, type DecidedBy } from '../core/inference/reading.js';
import type { InferenceClient } from '../core/inference/client.js';
import { QUESTIONS, readAnswers, questionLines, defaultsLine, answersNote, materialShown, STANDING_KINDS, QUESTION_KINDS, KIND_ASK, type Question, type QuestionKind } from '../core/loop/questions.js';
import { PIECE_PLAN, planLines, planNote, type PiecePlan, type PlanInput } from '../core/loop/piece-plan.js';
import * as store from '../core/state/store.js';
import type { InvocationRecord } from '../core/state/canonical-state.js';

export interface PrewriteInput {
  readonly L: store.StoreLayout;
  readonly request: string;
  readonly material: readonly { readonly name: string; readonly text: string }[];
  readonly method: readonly string[];
  readonly examples: readonly string[];
  /** whether to read the questions, and the plan (off: the floor, nothing read) */
  readonly questions: boolean;
  readonly plan: boolean;
  /** why no plan is read, where `plan` is off for a reason other than --no-plan: on the record as said */
  readonly noPlan?: string;
  /** `--answers`, as typed */
  readonly answers: string | undefined;
  /** a person at a terminal: ask and show; otherwise return */
  readonly interactive: boolean;
  readonly client: InferenceClient | null;
  readonly model: string | null;
  /** how a line is read from the person: the terminal by default (a test passes its own) */
  readonly read?: (prompt: string) => Promise<string>;
}
export interface Prewrite {
  /** what the writer is told, after the skill: the answers, then the plan */
  readonly note: string;
  /** said to the person, in the run's report */
  readonly said: readonly string[];
  /** what --json returns, and the record keeps */
  readonly questions: readonly Question[];
  readonly plan: PiecePlan | null;
  readonly record: NonNullable<InvocationRecord['prewrite']> | null;
}

/** A line read from the person at the terminal (stderr carries the prompt, so stdout stays the work). */
async function ask(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try { return (await rl.question(prompt)).trim(); } finally { rl.close(); }
}

/** One answer typed at the terminal: empty is the default, a letter its option, anything else the person's own words. */
export function typedAnswer(q: Question, typed: string): string {
  if (!typed) return q.default;
  const i = /^[a-d]$/i.test(typed) ? typed.toLowerCase().charCodeAt(0) - 97 : -1;
  return i >= 0 && i < q.options.length ? q.options[i] : typed;
}
/** What a person types to take the defaults for every question left. */
export const JUST_WRITE = /^just write(?: it)?\.?$/i;

export async function beforeTheDraft(o: PrewriteInput): Promise<Prewrite> {
  const said: string[] = [];
  const read = o.read ?? ask;
  const told = store.getTold(o.L);
  // each reading its own budget of one call
  const tiny = (capUsd = 0.03): { spentUsd: number; capUsd: number; maxCalls: number } => ({ spentUsd: 0, capUsd, maxCalls: 1 });
  // ── THE QUESTIONS ──────────────────────────────────────────────────────────────────────────
  const q = o.questions ? await readContext(QUESTIONS, { request: o.request, material: materialShown(o.material), method: o.method, examples: o.examples, told },
    o.client, o.model, tiny(), 'context judge') : null;
  const questions = q?.value.questions ?? [];
  const { answers: given, said: answersSaid } = readAnswers(o.answers, questions);
  said.push(...answersSaid);
  const answers: { id: string; answer: string; by: 'person' | 'default' | 'told' }[] = [];
  let rest = false;
  for (const x of questions) {
    if (given.has(x.id)) { answers.push({ id: x.id, answer: given.get(x.id) ?? x.default, by: 'person' }); continue; }
    if (o.interactive && !rest) {
      process.stderr.write(`\n${questionLines([x]).join('\n')}\n`);
      const typed = await read('Your answer (a letter, your own words, enter for the default, or "just write it"): ');
      if (JUST_WRITE.test(typed)) rest = true;
      else { answers.push({ id: x.id, answer: typedAnswer(x, typed), by: typed ? 'person' : 'default' }); continue; }
    }
    answers.push({ id: x.id, answer: x.default, by: 'default' });
  }
  // AN ANSWER FOR A KIND THIS RUN DID NOT ASK applies all the same, and replaces what the skill was told of it.
  const askOf = (id: string): string => [...told].reverse().find((t) => t.id === id)?.ask ?? KIND_ASK[id.toUpperCase() as QuestionKind];
  for (const [id, answer] of given) if (!questions.some((x) => x.id === id)) answers.push({ id, answer, by: 'person' });
  // What may be named, once told, stands: said to the writer on every run, never asked again.
  for (const k of QUESTION_KINDS.filter((kk: QuestionKind) => STANDING_KINDS.has(kk))) {
    const t = [...told].reverse().find((x) => x.id === k.toLowerCase());
    if (t && !questions.some((x) => x.id === t.id) && !answers.some((a) => a.id === t.id)) answers.push({ id: t.id, answer: t.answer, by: 'told' });
  }
  const unanswered = questions.filter((x) => answers.find((a) => a.id === x.id)?.by === 'default');
  if (unanswered.length && !o.interactive) said.push(defaultsLine(unanswered));
  else if (questions.length) said.push(`Asked before writing: ${questions.length} question(s); ${questions.length - unanswered.length} answered by you, ${unanswered.length} with the default${unanswered.length ? ` (${unanswered.map((x) => `${x.id}: ${x.default}`).join('; ')})` : ''}.`);
  const at = new Date().toISOString();
  store.addTold(o.L, answers.filter((a) => a.by === 'person').map((a) => ({ id: a.id, ask: questions.find((x) => x.id === a.id)?.ask ?? askOf(a.id), answer: a.answer, at })));
  // what was settled beyond this run's questions: a kind answered without being asked, or what may be named, told before
  const beyond = answers.filter((a) => !questions.some((x) => x.id === a.id)).map((a) => ({ id: a.id, ask: askOf(a.id), options: [] as string[], default: a.answer }));
  // A DEFAULT NOBODY ANSWERED IS AN ASSUMPTION, to the planner and to the writer alike: never the person's answer.
  const asked = [...questions.map((x) => { const a = answers.find((y) => y.id === x.id); return { ask: x.ask, answer: a?.answer ?? x.default, ...(a?.by === 'default' || !a ? { assumed: true as const } : {}) }; }), ...beyond.map((b) => ({ ask: b.ask, answer: b.default }))];
  const answerText = answersNote([...questions, ...beyond], new Map(answers.filter((a) => a.by !== 'default').map((a) => [a.id, a.answer])));
  // ── THE PLAN ───────────────────────────────────────────────────────────────────────────────
  let plan: PiecePlan | null = null; let planBy: DecidedBy | 'off' = 'off'; const typedChanges: string[] = [];
  // WHY THERE IS NO PLAN, where there is none: said on the record, so a draft written from the notes is never unexplained.
  let noPlan: string | undefined = o.plan ? undefined : o.noPlan ?? 'no plan: --no-plan was given';
  if (o.plan) {
    const input: PlanInput = { request: o.request, answers: asked, method: o.method, examples: o.examples, material: o.material };
    let p = await readContext(PIECE_PLAN, input, o.client, o.model, tiny(0.05), 'context judge');
    plan = p.value; planBy = p.by;
    if (!plan) noPlan = `no plan: ${p.why ?? 'the reading made none'}`;
    // A CHANGE TYPED TO THE PLAN MAKES IT AGAIN, from scratch with the change; at most three.
    // A second change keeps the first: the plan is made again from the request and every change typed so far, in order.
    while (plan && o.interactive && typedChanges.length < 3) {
      process.stderr.write(`\nThe plan:\n${planLines(plan).map((l) => `  ${l}`).join('\n')}\n`);
      const typed = await read('Enter to write, or type a change: ');
      if (!typed) break;
      typedChanges.push(typed);
      p = await readContext(PIECE_PLAN, { ...input, change: typedChanges.map((c, i) => `${i + 1}. ${c}`).join('\n') }, o.client, o.model, tiny(0.05), 'context judge');
      if (p.value) { plan = p.value; planBy = p.by; } else said.push(`The plan could not be made again with "${typed.slice(0, 80)}": written from the plan as it was.`);
    }
    if (plan) said.push(`Planned before writing: ${plan.points.length} point(s) from the material${plan.leftOut.length ? `, ${plan.leftOut.length} left out` : ''}; the plan is on the record, never in the work (atelier report <run>).`);
  }
  const note = [answerText, plan ? planNote(plan, o.material) : ''].filter(Boolean).join('\n\n');
  const record = questions.length || answers.length || plan || noPlan ? { questions, answers, questionsBy: q?.by ?? 'floor', plan, planBy, ...(typedChanges.length ? { planChanges: typedChanges.length } : {}), ...(noPlan ? { noPlan } : {}) } : null;
  return { note, said, questions, plan, record };
}

/** The questions as `--json` returns them: id, the question, its options and the default. */
export const questionsJson = (qs: readonly Question[]): { id: string; ask: string; options: readonly string[]; default: string; last?: string }[] =>
  qs.map((x) => ({ id: x.id, ask: x.ask, options: x.options, default: x.default, ...(x.last ? { last: x.last } : {}) }));
