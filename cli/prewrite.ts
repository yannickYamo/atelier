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
import { QUESTIONS, parseAnswers, questionLines, defaultsLine, answersNote, STANDING_KINDS, QUESTION_KINDS, type Question, type QuestionKind } from '../core/loop/questions.js';
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
  const q = o.questions ? await readContext(QUESTIONS, { request: o.request, material: o.material.map((m) => ({ name: m.name, head: m.text.slice(0, 600) })), method: o.method, examples: o.examples, told },
    o.client, o.model, tiny(), 'context judge') : null;
  const questions = q?.value.questions ?? [];
  const given = parseAnswers(o.answers, questions);
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
  // What may be named, once told, stands: said to the writer on every run, never asked again.
  for (const k of QUESTION_KINDS.filter((kk: QuestionKind) => STANDING_KINDS.has(kk))) {
    const t = [...told].reverse().find((x) => x.id === k.toLowerCase());
    if (t && !questions.some((x) => x.id === t.id)) answers.push({ id: t.id, answer: t.answer, by: 'told' });
  }
  const unanswered = questions.filter((x) => answers.find((a) => a.id === x.id)?.by === 'default');
  if (unanswered.length && !o.interactive) said.push(defaultsLine(unanswered));
  else if (questions.length) said.push(`Asked before writing: ${questions.length} question(s); ${questions.length - unanswered.length} answered by you, ${unanswered.length} with the default.`);
  const at = new Date().toISOString();
  store.addTold(o.L, answers.filter((a) => a.by === 'person').map((a) => ({ id: a.id, ask: questions.find((x) => x.id === a.id)?.ask ?? a.id, answer: a.answer, at })));
  const asked = [...questions.map((x) => ({ ask: x.ask, answer: answers.find((a) => a.id === x.id)?.answer ?? x.default })),
    ...answers.filter((a) => a.by === 'told').map((a) => ({ ask: told.find((t) => t.id === a.id)?.ask ?? a.id, answer: a.answer }))];
  const answerText = answersNote([...questions, ...answers.filter((a) => a.by === 'told').map((a) => ({ id: a.id, ask: told.find((t) => t.id === a.id)?.ask ?? a.id, options: [], default: a.answer }))],
    new Map(answers.map((a) => [a.id, a.answer])));
  // ── THE PLAN ───────────────────────────────────────────────────────────────────────────────
  let plan: PiecePlan | null = null; let planBy: DecidedBy | 'off' = 'off'; let changes = 0;
  if (o.plan) {
    const input: PlanInput = { request: o.request, answers: asked, method: o.method, examples: o.examples, material: o.material };
    let p = await readContext(PIECE_PLAN, input, o.client, o.model, tiny(0.05), 'context judge');
    plan = p.value; planBy = p.by;
    // A CHANGE TYPED TO THE PLAN MAKES IT AGAIN, from scratch with the change; at most three.
    while (plan && o.interactive && changes < 3) {
      process.stderr.write(`\nThe plan:\n${planLines(plan).map((l) => `  ${l}`).join('\n')}\n`);
      const typed = await read('Enter to write, or type a change: ');
      if (!typed) break;
      changes += 1;
      p = await readContext(PIECE_PLAN, { ...input, change: typed }, o.client, o.model, tiny(0.05), 'context judge');
      if (p.value) { plan = p.value; planBy = p.by; } else said.push(`The plan could not be made again with "${typed.slice(0, 80)}": written from the plan as it was.`);
    }
    if (plan) said.push(`Planned before writing: ${plan.points.length} point(s) from the material${plan.leftOut.length ? `, ${plan.leftOut.length} left out` : ''}; the plan is on the record, never in the work (atelier report <run>).`);
  }
  const note = [answerText, plan ? planNote(plan) : ''].filter(Boolean).join('\n\n');
  const record = questions.length || answers.length || plan ? { questions, answers, questionsBy: q?.by ?? 'floor', plan, planBy, ...(changes ? { planChanges: changes } : {}) } : null;
  return { note, said, questions, plan, record };
}

/** The questions as `--json` returns them: id, the question, its options and the default. */
export const questionsJson = (qs: readonly Question[]): { id: string; ask: string; options: readonly string[]; default: string; last?: string }[] =>
  qs.map((x) => ({ id: x.id, ask: x.ask, options: x.options, default: x.default, ...(x.last ? { last: x.last } : {}) }));
