// tests/fixtures/scripted-backend.mjs — an OpenAI-compatible backend the tests can script.
//
// A SEPARATE PROCESS, deliberately. The first version lived inside the vitest process, and the tests
// drive the CLI with execFileSync — which blocks the event loop the server needed to answer on. The
// child then waited its full inference timeout against a server that could never accept: a deadlock
// wearing a hang's clothes. Out of process, the server answers while the test process blocks.
//
//   POST /chat/completions  → the scripted payload, as a forced tool call
//                             (`when`: [{ contains, containsAll, answer }], first match wins, answers a request whose body contains
//                              the text first, so a candidate and its champion can answer differently)
//   POST /__set             → replace the scripted payload (JSON body); `failNext: k` answers the
//                             next k completions with HTTP 500, so a failed call can be scripted
//   GET  /__count           → how many /chat/completions requests have been served
//   GET  /__log             → the body of every /chat/completions request served, in order: what a test reads to
//                             show that something was, or was never, sent to the model
//
// Prints "PORT <n>" on stdout once listening.

import { createServer } from 'node:http';

let payload = { rules: [], workType: 'writing' };
// Per-tool payloads, for commands that make more than one KIND of call (fix: a diagnosis, then a
// generation). /__set with { byTool: { emit_coverage: {...}, emit_piece: {...} } } routes on the
// forced tool name in the request; a flat body keeps the single-payload behaviour.
let byTool = null;
let when = [];
let count = 0;
const bodies = [];
let failNext = 0;
// `emptyNext: { <tool>: k }` answers the next k calls of that tool with an empty object: a model that returned no
// usable answer, where `failNext` is a server that returned an error.
let emptyNext = {};

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    // NO KEPT-ALIVE CONNECTIONS. The server closed idle sockets just as a client reused one, and a test's
    // /__set failed with "other side closed" under full-suite load, leaving the next test on the previous
    // script. A fresh connection per request costs nothing here and removes the race for every test.
    res.setHeader('connection', 'close');
    if (req.url === '/__set') {
      const parsed = JSON.parse(body);
      when = Array.isArray(parsed.when) ? parsed.when : [];
      failNext = typeof parsed.failNext === 'number' ? parsed.failNext : 0;
      emptyNext = parsed.emptyNext && typeof parsed.emptyNext === 'object' ? { ...parsed.emptyNext } : {};
      if (parsed.byTool) { byTool = parsed.byTool; } else { payload = parsed; byTool = null; }
      res.end('{"ok":true}'); return;
    }
    if (req.url === '/__count') { res.end(JSON.stringify({ count })); return; }
    if (req.url === '/__log') { res.end(JSON.stringify({ bodies })); return; }
    count += 1; bodies.push(body);
    if (failNext > 0) { failNext -= 1; res.statusCode = 500; res.end('{"error":"scripted failure"}'); return; }
    let answer = payload;
    if (byTool) {
      const tool = JSON.parse(body || '{}')?.tools?.[0]?.function?.name;
      if (tool && byTool[tool] !== undefined) answer = byTool[tool];
    }
    { const tool = JSON.parse(body || '{}')?.tools?.[0]?.function?.name; if (tool && emptyNext[tool] > 0) { emptyNext[tool] -= 1; answer = {}; } }
    const hit = when.find((w) => (w.contains === undefined || body.includes(w.contains)) && (w.containsAll ?? []).every((x) => body.includes(x)));
    // `{ contains, finish: 'content_filter' }` in `when`: that call ends with this finish_reason and no answer, as a
    // provider's filter does.
    if (hit && hit.finish) { res.end(JSON.stringify({ choices: [{ finish_reason: hit.finish, message: {} }], usage: { prompt_tokens: 10, completion_tokens: 0 } })); return; }
    if (hit) answer = hit.answer;
    // `{ contains, answer, reasoning, usage }` in `when`: that call also returns reasoning text beside the answer, and
    // the usage given (a backend that thought, and billed for it).
    const extra = hit && typeof hit.reasoning === 'string' ? { reasoning_content: hit.reasoning } : {};
    const usage = hit && hit.usage ? hit.usage : { prompt_tokens: 10, completion_tokens: 10 };
    // THE COMPOSITE'S CONTRADICTION READING (core/composite/contradictions.ts) answers "no pair" unless a test scripts it
    // (`byTool: { emit_contradictions: { pairs: [...] } }`, or a `when`), so a backend scripted for other calls reads none.
    // `{ pairsByText: [[textA, textB, reason]] }` names a pair by the words of its two instructions, answered with the
    // numbers the request gave them ("3. (bram) Let every sentence…"), so a test need not know the order of the list.
    // `{ quantitiesByText: [[text, measure, unit, min, max]] }` gives the quantity read in the instruction with those words.
    if (answer && (Array.isArray(answer.pairsByText) || Array.isArray(answer.quantitiesByText))) {
      const text = String(JSON.parse(body || '{}')?.messages?.map((m) => (typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((b) => b?.text ?? '').join('\n') : '')).join('\n') ?? '');
      const numberOf = (words) => { const m = new RegExp(`(?:^|\\n|\\s)(\\d+)\\. \\([^)]*\\) [^\\n]*${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).exec(text); return m ? Number(m[1]) : null; };
      answer = { pairs: (answer.pairsByText ?? []).map(([a, b, reason]) => ({ a: numberOf(a), b: numberOf(b), reason })).filter((x) => x.a !== null && x.b !== null),
        quantities: (answer.quantitiesByText ?? []).map(([t, measure, unit, min, max]) => ({ n: numberOf(t), measure, unit, min, max })).filter((x) => x.n !== null) };
    }
    if (JSON.parse(body || '{}')?.tools?.[0]?.function?.name === 'emit_contradictions' && !(answer && Array.isArray(answer.pairs))) answer = { pairs: [] };
    // A STRUCTURE READING (core/structure/moves.ts) must label every numbered paragraph once: `{ labelAll: [moves] }`
    // answers with one label per "[n]" the request carries, cycling through the moves given.
    if (answer && Array.isArray(answer.labelAll)) {
      const n = Math.max(0, ...[...body.matchAll(/\[(\d+)\] /g)].map((m) => Number(m[1])));
      answer = { labels: Array.from({ length: n }, (_, i) => ({ n: i + 1, move: answer.labelAll[i % answer.labelAll.length] })) };
    }
    res.end(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { ...extra, tool_calls: [{ function: { arguments: JSON.stringify(answer) } }] } }],
      usage,
    }));
  });
});

server.listen(0, '127.0.0.1', () => {
  console.log(`PORT ${server.address().port}`);
});
