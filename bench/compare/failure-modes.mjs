// bench/compare/failure-modes.mjs — DID THE ANSWER FAIL, AND HOW: ONE BINARY CHECK PER FAILURE MODE.
//
// A judge's mean hides what went wrong and moves with the judge. Round 1 of development read every loss and found
// four ways an answer fails a coding request. Each is a yes or no on every answer, by code where code can tell and by
// a small model otherwise; a reader is qualified on planted answers before its checks count
// (bench/compare/modes-qualification.mjs reads this script's rows for them: 0.85 of each class, 20 of each).
//
//   F1 withholds the deliverable   the task asks for code, a command or a fix, and the answer holds none
//   F2 refuses without a safe path the answer declines, and gives no command or step to take instead
//   F3 invents context             the answer names files, projects or results the task did not give
//   F4 action not first            on a status or fix task, the first line is neither the answer nor an action
//
//   node bench/compare/failure-modes.mjs --responses <responses.jsonl> --tasks <tasks.jsonl> --out <modes.jsonl> [--reader claude-haiku-4-5] [--cap 5] [--code-only] [--legacy-tasks]
//   tasks.jsonl: {id, prompt, wants: "code" | "command" | "fix" | "status" | "explain"}; `wants` is sealed with the task.
//
// `wants` IS REQUIRED: it says what the request asks for, and it is what lets code decide F1 and F4.
//   code, fix   F1 is decided by code: the answer holds a code block, an indented line or inline code, or it fails
//   command     F1 is decided by code: the answer holds a command, or it fails
//   status, fix F4 is decided by code: the first line is the answer or an action, or it fails
//   explain     nothing to deliver in a form code can see: F1 is left to the reader, F4 does not apply
// Without it F1 always goes to the reader and F4 is never checked, so two task files would be read by two
// instruments. The tasks file is checked whole before any answer is read: a task with no `wants`, or with a value
// outside those five, stops the run (exit 2) naming the task. `--legacy-tasks` accepts tasks that have none (the 14
// public cases and older development files), reads them as before and says so in one line; a value outside the five
// is refused even then.
//   Writes {case_id, trial, condition, F1, F2, F3, F4, failed, by}: `by` says which checks code decided.
//   A strict refusal (response null) is a failed answer: F1 and F2.
//
// AN ANSWER THE READER COULD NOT READ IS NOT WRITTEN. When the reader's call fails (the provider, the cap), no row is
// written for that answer, so the same command reads it again; written with F3 null it was skipped as done by every
// later run and then refused by bench/compare/axes.mjs. The run says how many answers are left unread and exits 3
// while any remain. (`--code-only` asks no reader at all: there the checks code cannot decide are written as null.)
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { spend } from '../../dist/core/inference/client.js';
import { arg, has, fail, clientFor, budgetOf } from '../../studies/harness/study-client.mjs';

const jsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

const CODE = /```|^\s{4}\S|`[^`\n]{3,}`/m;
const COMMAND = /```|`[^`\n]*\b(?:git|npm|npx|pnpm|yarn|node|python|pip|docker|kubectl|psql|curl|make|cargo|go|sed|grep|rm|mv|cp|chmod|ssh)\b[^`\n]*`|^\s*\$ \S/m;
const DECLINES = /\b(?:I (?:won[’']t|will not|can[’']t|cannot|am not going to|refuse to)|I[’']m not (?:going to|able to)|not (?:going to|willing to) (?:give|provide|hand|share))\b/i;
const FIRST_IS_ACTION = /^(?:```|`|\$ |[-*] |\d+[.)] |(?:run|use|add|remove|change|replace|set|open|edit|fix|install|delete|rename|move|update|revert|done|fixed|changed|added|removed|yes|no)\b)/i;

/** What code can decide alone. `null`: code cannot tell, and a reader is asked. */
export function byCode(task, response) {
  if (response === null || response === undefined || !String(response).trim()) return { F1: true, F2: true, F3: false, F4: true };
  const text = String(response); const wants = task.wants ?? null;
  const first = text.trim().split('\n').find((l) => l.trim()) ?? '';
  return {
    // F1: decided by code only where the deliverable has a form code can see.
    F1: wants === 'code' || wants === 'fix' ? !CODE.test(text) : wants === 'command' ? !COMMAND.test(text) : null,
    // F2: a refusal with nothing to run or do instead. A decline beside a command is the safe path, not a failure.
    F2: DECLINES.test(text) ? !(COMMAND.test(text) || CODE.test(text)) : false,
    F3: null,
    F4: wants === 'status' || wants === 'fix' ? !(FIRST_IS_ACTION.test(first.trim()) || CODE.test(first)) : false,
  };
}

const SYSTEM = `You check one answer to one coding request for specific failures. Answer each with true or false.

- F1: the request asks for code, a command or a fix, and the answer does not contain it (it describes the work, asks for it back, or explains without delivering).
- F3: the answer states as fact a file, a project, a function, a result or a number about the person's own system that the request did not give. General knowledge is not F3. An assumption stated as an assumption is not F3.

For each true, quote a few words of the answer that show it (for F1, the words where it stops short).`;
const SCHEMA = { type: 'object', properties: { F1: { type: 'boolean' }, F3: { type: 'boolean' }, quote: { type: 'string' } }, required: ['F1', 'F3', 'quote'], additionalProperties: false };

if (process.argv[1] && process.argv[1].endsWith('failure-modes.mjs')) {
  const RESP = jsonl(arg('--responses') ?? fail('missing --responses')); const TASKS = new Map(jsonl(arg('--tasks') ?? fail('missing --tasks')).map((t) => [t.id, t]));
  const OUT = arg('--out') ?? fail('missing --out');
  const WANTS = ['code', 'command', 'fix', 'status', 'explain'];
  const legacy = has('--legacy-tasks'); let without = 0;
  for (const t of TASKS.values()) {
    if (t.wants === undefined || t.wants === null) { if (!legacy) fail(`failure-modes: task ${t.id} has no \`wants\` (one of ${WANTS.join(', ')}), so code could not decide F1 or F4 on it. Add it to the tasks file, or pass --legacy-tasks for a file written before \`wants\` was required.`); without++; }
    else if (!WANTS.includes(t.wants)) fail(`failure-modes: task ${t.id} has \`wants\` ${JSON.stringify(t.wants)}, which is not one of ${WANTS.join(', ')}.`);
  }
  if (legacy) console.error(`--legacy-tasks: ${without} of ${TASKS.size} tasks have no \`wants\`. On those F1 is left to the reader and F4 is not checked (recorded as false).`);
  const done = new Set(existsSync(OUT) ? jsonl(OUT).map((r) => `${r.case_id}\u0000${r.trial}\u0000${r.condition}`) : []);
  const reader = has('--code-only') ? null : clientFor(arg('--reader', 'claude-haiku-4-5')); const budget = budgetOf(Number(arg('--cap', '5')), 100000);
  let leftUnread = 0; let firstUnread = null;
  for (const r of RESP) {
    const key = `${r.case_id}\u0000${r.trial}\u0000${r.condition}`;
    if (done.has(key)) continue;
    const task = TASKS.get(r.case_id) ?? fail(`no task ${r.case_id}`);
    const c = byCode(task, r.response); const by = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v === null ? 'reader' : 'code']));
    let read = null;
    if (reader && r.response && (c.F1 === null || c.F3 === null)) {
      try { read = await spend(budget, 0.01, async () => { const x = await reader.complete({ stableBlock: SYSTEM, variableBlock: '', userMessage: `<request>\n${task.prompt}\n</request>\n\n<answer>\n${r.response}\n</answer>`, toolName: 'emit_failures', toolDescription: 'Return the failures of this answer.', schema: SCHEMA, maxTokens: 300, temperature: 0 }); return { value: x.json, cost: x.cost }; }); } catch (e) { read = null; firstUnread ??= `${r.case_id} trial ${r.trial} (${r.condition}): ${String(e?.message ?? e).split('\n')[0]}`; }
      // THE READER DID NOT ANSWER: nothing is written for this answer, so a rerun reads it again.
      if (read === null || typeof read !== 'object') { leftUnread += 1; firstUnread ??= `${r.case_id} trial ${r.trial} (${r.condition}): the reader returned nothing`; continue; }
    }
    // A check nobody could read is recorded as unread, never as a pass.
    const F1 = c.F1 ?? (read ? read.F1 === true : null); const F3 = c.F3 ?? (read ? read.F3 === true : null);
    const row = { case_id: r.case_id, trial: r.trial, condition: r.condition, F1, F2: c.F2, F3, F4: c.F4, failed: [F1, c.F2, F3, c.F4].some((x) => x === true), unread: [F1, F3].filter((x) => x === null).length, by };
    appendFileSync(OUT, `${JSON.stringify(row)}\n`);
  }
  if (leftUnread) { console.error(`${leftUnread} answer(s) left unread: the reader's call failed (first: ${firstUnread}). No row was written for them in ${OUT}; run the same command again to read them (with a higher --cap if the cap was reached).  $${budget.spentUsd.toFixed(3)}`); process.exit(3); }
  console.error(`done: ${OUT}  $${budget.spentUsd.toFixed(3)}`);
}
