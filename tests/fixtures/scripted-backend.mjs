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
let count = 0;

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/__set') { payload = JSON.parse(body); res.end('{"ok":true}'); return; }
    if (req.url === '/__count') { res.end(JSON.stringify({ count })); return; }
    count += 1;
    res.end(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { tool_calls: [{ function: { arguments: JSON.stringify(payload) } }] } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }));
  });
});

server.listen(0, '127.0.0.1', () => {
  console.log(`PORT ${server.address().port}`);
});
