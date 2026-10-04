// tests/fixtures/scripted-backend.mjs — an OpenAI-compatible backend the tests can script.
//
// A SEPARATE PROCESS, deliberately. The first version lived inside the vitest process, and the tests
// drive the CLI with execFileSync — which blocks the event loop the server needed to answer on. The
// child then waited its full inference timeout against a server that could never accept: a deadlock
// wearing a hang's clothes. Out of process, the server answers while the test process blocks.
//
//   POST /chat/completions  → the scripted payload, as a forced tool call
//                             (`when`: [{ contains, answer }] answers a request whose body contains
//                              the text first, so a candidate and its champion can answer differently)
//   POST /__set             → replace the scripted payload (JSON body); `failNext: k` answers the
//                             next k completions with HTTP 500, so a failed call can be scripted
//   GET  /__count           → how many /chat/completions requests have been served
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
let failNext = 0;

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
      if (parsed.byTool) { byTool = parsed.byTool; } else { payload = parsed; byTool = null; }
      res.end('{"ok":true}'); return;
    }
    if (req.url === '/__count') { res.end(JSON.stringify({ count })); return; }
    count += 1;
    if (failNext > 0) { failNext -= 1; res.statusCode = 500; res.end('{"error":"scripted failure"}'); return; }
    let answer = payload;
    if (byTool) {
      const tool = JSON.parse(body || '{}')?.tools?.[0]?.function?.name;
      if (tool && byTool[tool] !== undefined) answer = byTool[tool];
    }
    const hit = when.find((w) => body.includes(w.contains));
    if (hit) answer = hit.answer;
    // A STRUCTURE READING (core/structure/moves.ts) must label every numbered paragraph once: `{ labelAll: [moves] }`
    // answers with one label per "[n]" the request carries, cycling through the moves given.
    if (answer && Array.isArray(answer.labelAll)) {
      const n = Math.max(0, ...[...body.matchAll(/\[(\d+)\] /g)].map((m) => Number(m[1])));
      answer = { labels: Array.from({ length: n }, (_, i) => ({ n: i + 1, move: answer.labelAll[i % answer.labelAll.length] })) };
    }
    res.end(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { tool_calls: [{ function: { arguments: JSON.stringify(answer) } }] } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }));
  });
});

server.listen(0, '127.0.0.1', () => {
  console.log(`PORT ${server.address().port}`);
});
