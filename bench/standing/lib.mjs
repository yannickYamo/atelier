// bench/standing/lib.mjs — one model call with its tokens logged, and a small worker pool.
//
// Hidden thinking is turned off on every direct call: Atelier's writer answers through a forced tool, which
// runs without it, and a prompt arm left with thinking on spends its output limit before it writes anything.
import { appendFileSync } from 'node:fs';

export async function ask({ system, user, model, max = 1500, tag = '', log }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: max, thinking: { type: 'disabled' }, ...(system ? { system } : {}), messages: [{ role: 'user', content: user }] }),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 4000 * (attempt + 1))); continue; }
    const j = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    if (log) appendFileSync(log, `${JSON.stringify({ tag, model, in: j.usage.input_tokens, out: j.usage.output_tokens, stop: j.stop_reason })}\n`);
    return { text: j.content.filter((c) => c.type === 'text').map((c) => c.text).join('').trim(), cut: j.stop_reason === 'max_tokens', refused: j.stop_reason === 'refusal' };
  }
  throw new Error('the model did not answer after four tries');
}

export async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i; i += 1; out[k] = await fn(items[k], k); } }));
  return out;
}
