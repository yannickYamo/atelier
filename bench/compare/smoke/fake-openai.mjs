#!/usr/bin/env node
// bench/compare/smoke/fake-openai.mjs — A DETERMINISTIC OPENAI-COMPATIBLE SERVER FOR THE OFFLINE SMOKE.
//
// tests/fixtures/scripted-backend.mjs answers every request as a forced tool call, which is what Atelier
// sends. GEPA and SkillOpt send plain chat completions with no tools, and expect different shapes back
// depending on which of their prompts it is, so they get this server instead. It recognises each prompt by
// its opening words and answers with the smallest valid reply, the same one every time:
//
//   the task model (anything not below)      an answer to the task; it carries a filler sentence unless the
//                                            system prompt (the candidate skill) contains "No filler"
//   the i-have-adhd judge prompt             five scores per labelled response; concision 2 when the
//                                            filler sentence is there, 5 when it is not
//   GEPA's reflection prompt                 the current component, plus one rule line, inside ``` fences
//   SkillOpt's analyst, merge, rank,         schema-valid JSON proposing, merging and selecting that line
//   meta-skill and slow-update prompts       (and a one-line meta skill and slow update)
//   a forced tool call (emit_answer, …)      the same task answer as {answer} / {piece}
//
// So a search that works end to end changes the skill, the changed skill changes the answers, and both
// evaluators can see the change. Nothing here says anything about how good a real optimizer is.
//
//   POST */chat/completions   the reply above
//   GET  /__count             {count, byKind} of what was answered
// Prints "PORT <n>" once listening. --port <n> to choose one.

import { createServer } from 'node:http';

const FILLER = 'In summary, the right choice depends on many factors.';
const RULE = '- No filler: drop any sentence that says nothing.';
const counts = { total: 0 };
const bump = (k) => { counts.total += 1; counts[k] = (counts[k] ?? 0) + 1; };

const text = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => p?.text ?? '').join('') : '');

function taskAnswer(system, user) {
  const task = (/<task>\n([\s\S]*?)\n<\/task>/.exec(user)?.[1] ?? user).split('\n')[0].slice(0, 120);
  return `Here is the answer to "${task}": do the smallest safe step first, then check the result.${/No filler/.test(system) ? '' : ` ${FILLER}`}`;
}

function judge(prompt) {
  const out = {};
  for (const m of prompt.matchAll(/## Response ([A-Z])\n\n([\s\S]*?)(?=\n## (?:Response [A-Z]|Output)\n)/g)) {
    const filler = m[2].includes(FILLER);
    out[m[1]] = { correctness: 4, autonomy: 4, actionability: 4, safety: 5, concision: filler ? 2 : 5, blocker: false,
      notes: filler ? 'smoke: a filler sentence' : 'smoke: no filler' };
  }
  return JSON.stringify(out);
}

function reflect(prompt) {
  const m = /## Current Component[\s\S]*?```\n([\s\S]*?)\n```/.exec(prompt);
  const current = m ? m[1] : '';
  const next = current.includes(RULE) ? `${current}\n- Lead with the answer.` : `${current}\n${RULE}`;
  return `\`\`\`\n${next}\n\`\`\``;
}

const EDIT = { op: 'append', content: RULE };
function skillopt(system) {
  if (system.startsWith('You are an expert failure-analysis agent')) {
    return { kind: 'skillopt-analyst-error', body: { batch_size: 1, failure_summary: [{ failure_type: 'filler', count: 1, description: 'a sentence that says nothing' }],
      patch: { reasoning: 'smoke', edits: [EDIT] } } };
  }
  if (system.startsWith('You are an expert success-pattern analyst')) {
    return { kind: 'skillopt-analyst-success', body: { batch_size: 1, success_patterns: ['answers directly'], patch: { reasoning: 'smoke', edits: [] } } };
  }
  if (system.startsWith('You are a skill-edit coordinator')) {
    // Two edits, so a step with an edit budget of one has to rank them.
    return { kind: 'skillopt-merge', body: { reasoning: 'smoke', edits: [{ ...EDIT, support_count: 2, source_type: 'failure' },
      { op: 'append', content: '- Lead with the answer.', support_count: 1, source_type: 'failure' }] } };
  }
  if (system.startsWith('You are an expert skill-optimization optimizer')) {
    return { kind: 'skillopt-rank', body: { reasoning: 'smoke', selected_indices: [0] } };
  }
  if (system.startsWith('You are a optimizer-coach')) {
    return { kind: 'skillopt-meta-skill', body: { reasoning: 'smoke', meta_skill_content: 'Prefer one general rule per recurring failure.' } };
  }
  if (system.startsWith('You are a strategic skill advisor')) {
    return { kind: 'skillopt-slow-update', body: { reasoning: 'smoke', slow_update_content: 'Answer first, then stop.' } };
  }
  return null;
}

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    res.setHeader('connection', 'close');
    if (req.method === 'GET' && req.url === '/__count') { res.end(JSON.stringify(counts)); return; }
    if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
    let parsed;
    try { parsed = JSON.parse(body || '{}'); } catch { res.statusCode = 400; res.end('{"error":"bad json"}'); return; }
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    const system = messages.filter((m) => m.role === 'system').map((m) => text(m.content)).join('\n');
    const user = messages.filter((m) => m.role === 'user').map((m) => text(m.content)).join('\n');
    const all = messages.map((m) => text(m.content));
    const usage = { prompt_tokens: Math.ceil(body.length / 4), completion_tokens: 20, total_tokens: Math.ceil(body.length / 4) + 20 };
    const reply = (content) => res.end(JSON.stringify({ id: 'fake', object: 'chat.completion', model: parsed.model ?? 'fake',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }], usage }));

    const tool = parsed.tools?.[0]?.function?.name;
    if (tool) {
      bump(`tool:${tool}`);
      const answer = taskAnswer(system, user);
      const args = tool === 'emit_piece' ? { piece: answer } : { answer };
      res.end(JSON.stringify({ id: 'fake', object: 'chat.completion', model: parsed.model ?? 'fake',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_0', type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] } }], usage }));
      return;
    }
    const so = skillopt(system || all[0] || '');
    if (so) { bump(so.kind); reply(JSON.stringify(so.body)); return; }
    if (all.some((c) => c.startsWith('You are grading assistant responses'))) { bump('judge'); reply(judge(all.join('\n'))); return; }
    if (all.some((c) => c.startsWith('You are an expert optimization assistant'))) { bump('gepa-reflection'); reply(reflect(all.join('\n'))); return; }
    bump('task');
    reply(taskAnswer(system, user));
  });
});

const i = process.argv.indexOf('--port');
server.listen(i === -1 ? 0 : Number(process.argv[i + 1]), '127.0.0.1', () => { console.log(`PORT ${server.address().port}`); });
