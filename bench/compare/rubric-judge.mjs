// bench/compare/rubric-judge.mjs — A BLIND JUDGE FOR A RUBRIC THAT IS NOT OURS.
//
// A hand-written skill that publishes its own scoring is judged on its own scoring. This reads a rubric file (the
// skill's dimensions and questions, copied from it, and its scale), puts every arm's answer to one case in ONE
// session under shuffled labels, and writes rows in the benchmark's score format, which
// bench/compare/closing-quality.mjs and judge-qualification.mjs read. Qualify the judge before its scores are used.
//
//   node bench/compare/rubric-judge.mjs --responses <responses.jsonl> --tasks <tasks.jsonl> --rubric <rubric.json> --out <scores.jsonl>
//        [--judge <model>] [--pass 1] [--cap 10] [--max-tokens 6000]
//   responses.jsonl  {case_id, trial, condition, response}: as bench/compare/run.mjs writes them
//   rubric.json      {"name", "source", "scale": [1, 10], "dimensions": [{"name", "question"}]}
//   --pass           the label shuffle's seed: judge twice with --pass 1 and --pass 2 into two files, one session each
//   --max-tokens     the judge's output limit for one session, a positive whole number, recorded on every row
//                    (`max_tokens`). Checked before anything is read or any client is made
//
// A REFUSED ANSWER IS NOT JUDGED BY THIS RUBRIC. A row with `response: null` (a strict refusal, as run.mjs writes it)
// has no piece to score, and sent as it stood the judge was handed the word "null" as that arm's piece. The run is
// refused before any client is made (exit 2), naming the row: leave that task out for every arm, in every file this
// judge and the analysis read, and say so in the report. How often an arm refuses is read from the responses file.
//
// EXIT 3 WHEN A SESSION WAS NOT WRITTEN. A session the judge cut short or scored out of range is not written, and the
// run goes on to the next. At the end it says how many were left and exits 3; run the same command again (sessions
// already written are skipped) until it exits 0, or the scores file is short and the analysis will refuse it.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spend } from '../../dist/core/inference/client.js';
import { arg, fail, clientFor, budgetOf } from '../../studies/harness/study-client.mjs';

// THE JUDGE'S OUTPUT LIMIT. One session scores every arm of a case, each with notes: five pieces needed about 6,000
// tokens in practice, and claim A sends seven. At the earlier limit of 1,500 a session was cut short, and a session
// cut short is dropped as "not written", which quietly thins the reading. Raise it for more arms or longer notes.
const MAX_TOKENS = Number(arg('--max-tokens', '6000'));
if (!Number.isInteger(MAX_TOKENS) || MAX_TOKENS < 1) fail(`--max-tokens must be a positive whole number, and "${arg('--max-tokens')}" is not. Nothing was spent.`);
const jsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const RESP = jsonl(arg('--responses') ?? fail('missing --responses')); const TASKS = new Map(jsonl(arg('--tasks') ?? fail('missing --tasks')).map((t) => [t.id, t]));
const unanswered = RESP.filter((r) => typeof r.response !== 'string' || !r.response.trim());
if (unanswered.length) fail(`${unanswered[0].case_id} trial ${unanswered[0].trial} (${unanswered[0].condition}) has no answer (\`response\` is ${JSON.stringify(unanswered[0].response)})${unanswered.length > 1 ? `, and ${unanswered.length - 1} more row(s) like it` : ''}. Refused answers are not judged by this rubric and must be excluded for every arm of that task: remove ${[...new Set(unanswered.map((r) => r.case_id))].join(', ')} from the responses of every arm, then run again. Nothing was spent.`);
const RUBRIC = JSON.parse(readFileSync(arg('--rubric') ?? fail('missing --rubric'), 'utf8'));
const OUT = arg('--out') ?? fail('missing --out'); const PASS = arg('--pass', '1');
const [LO, HI] = RUBRIC.scale; const DIMS = RUBRIC.dimensions.map((d) => d.name);
const budget = budgetOf(Number(arg('--cap', '10')), 100000);
const judge = clientFor(arg('--judge', 'claude-sonnet-5'));
const done = new Set(existsSync(OUT) ? jsonl(OUT).map((r) => `${r.case_id}\u0000${r.trial}`) : []);
const SYSTEM = `You are judging pieces of writing against one rubric. You do not know who or what wrote each piece, and the labels carry no meaning.\n\nThe rubric (${RUBRIC.name}): score each piece from ${LO} to ${HI} on each dimension.\n${RUBRIC.dimensions.map((d) => `- ${d.name}: ${d.question}`).join('\n')}\n\nScore every labelled piece on every dimension, each on its own merits. Use the whole scale.`;
const SCHEMA = { type: 'object', properties: { pieces: { type: 'array', items: { type: 'object',
  properties: { label: { type: 'string' }, ...Object.fromEntries(DIMS.map((d) => [d, { type: 'number' }])), notes: { type: 'string' } }, required: ['label', ...DIMS, 'notes'], additionalProperties: false } } },
  required: ['pieces'], additionalProperties: false };
const groups = new Map(); let notWritten = 0;
for (const r of RESP) groups.set(`${r.case_id}\u0000${r.trial}`, [...(groups.get(`${r.case_id}\u0000${r.trial}`) ?? []), r]);
for (const [key, rows] of groups) {
  if (done.has(key)) continue;
  // ONE SESSION PER CASE AND TRIAL, labels shuffled by a hash of the case and the pass: no arm keeps a position.
  const order = [...rows].sort((a, b) => createHash('sha256').update(`${PASS}|${key}|${a.condition}`).digest('hex').localeCompare(createHash('sha256').update(`${PASS}|${key}|${b.condition}`).digest('hex')));
  const labelOf = new Map(order.map((r, i) => [String.fromCharCode(65 + i), r]));
  const task = TASKS.get(rows[0].case_id) ?? fail(`no task ${rows[0].case_id}`);
  const raw = await spend(budget, 0.2, async () => {
    const x = await judge.complete({ stableBlock: SYSTEM, variableBlock: '', userMessage: `<brief>\n${task.prompt}\n</brief>\n\n${[...labelOf].map(([l, r]) => `<piece label="${l}">\n${r.response}\n</piece>`).join('\n\n')}`,
      toolName: 'emit_scores', toolDescription: 'Return the scores of every labelled piece.', schema: SCHEMA, maxTokens: MAX_TOKENS, temperature: 0 });
    return { value: x.json, cost: x.cost };
  });
  const got = new Map((raw?.pieces ?? []).map((p) => [p.label, p]));
  // A CASE IS WRITTEN WHOLE OR NOT AT ALL: a session that scored only some arms compares nothing, and is run again.
  if ([...labelOf.keys()].some((l) => !got.has(l) || DIMS.some((d) => !(got.get(l)[d] >= LO && got.get(l)[d] <= HI)))) { console.error(`${rows[0].case_id} trial ${rows[0].trial}: the judge did not score every piece in range (a session cut short at --max-tokens ${MAX_TOKENS} reads like this); not written`); notWritten += 1; continue; }
  for (const [l, r] of labelOf) appendFileSync(OUT, `${JSON.stringify({ case_id: r.case_id, trial: r.trial, condition: r.condition, ...Object.fromEntries(DIMS.map((d) => [d, got.get(l)[d]])), notes: got.get(l).notes, pass: PASS, max_tokens: MAX_TOKENS })}\n`);
  console.error(`${rows[0].case_id} trial ${rows[0].trial}: ${labelOf.size} arms judged  $${budget.spentUsd.toFixed(3)}`);
}
if (notWritten) { console.error(`${notWritten} session(s) of this run were not written, so ${OUT} does not hold every case. Run the same command again (written sessions are skipped), with a higher --max-tokens if they were cut short.`); process.exit(3); }
