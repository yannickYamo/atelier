// tests/fixtures/scripted-backend.mjs — an OpenAI-compatible backend the tests can script.
//
// A SEPARATE PROCESS, deliberately. The first version lived inside the vitest process, and the tests
// drive the CLI with execFileSync — which blocks the event loop the server needed to answer on. The
// child then waited its full inference timeout against a server that could never accept: a deadlock
// wearing a hang's clothes. Out of process, the server answers while the test process blocks.
//
//   POST /chat/completions  → the scripted payload, as a forced tool call
//   POST /__set             → replace the scripted payload (JSON body)
//   GET  /__count           → how many /chat/completions requests have been served
//
// Prints "PORT <n>" on stdout once listening.

import { createServer } from 'node:http';

let payload = { rules: [], workType: 'writing' };
// Per-tool payloads, for commands that make more than one KIND of call (fix: a diagnosis, then a
// generation). /__set with { byTool: { emit_coverage: {...}, emit_piece: {...} } } routes on the
// forced tool name in the request; a flat body keeps the single-payload behaviour.
let byTool = null;
let count = 0;

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/__set') {
      const parsed = JSON.parse(body);
      if (parsed.byTool) { byTool = parsed.byTool; } else { payload = parsed; byTool = null; }
      res.end('{"ok":true}'); return;
    }
    if (req.url === '/__count') { res.end(JSON.stringify({ count })); return; }
    count += 1;
    let answer = payload;
    if (byTool) {
      const tool = JSON.parse(body || '{}')?.tools?.[0]?.function?.name;
      if (tool && byTool[tool] !== undefined) answer = byTool[tool];
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
