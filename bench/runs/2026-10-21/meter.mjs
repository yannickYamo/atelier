// A metering proxy for the study: every model call of every command (builds included, which print no total) passes
// through here on its way to the provider, and what the provider reported as usage is written to a ledger, priced by
// Atelier's own rate card (providers/pricing.ts). Nothing of the request but the model id is kept; no header is logged.
// Usage: node meter.mjs <port> <ledger.jsonl> <tag-file>   (the tag file names the activity each call is booked to)
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { appendFileSync, readFileSync, existsSync } from 'node:fs';

const [port, ledger, tagFile] = process.argv.slice(2);
if (!port || !ledger || !tagFile) throw new Error('usage: node meter.mjs <port> <ledger.jsonl> <tag-file>');
const PRICES = {
  'claude-sonnet-5-5': { inputPerM: 2, outputPerM: 10 }, 'claude-haiku-5-5': { inputPerM: 0.1, outputPerM: 0.5 },
  'claude-opus-5': { inputPerM: 5, outputPerM: 25 }, 'claude-fable-5': { inputPerM: 10, outputPerM: 50 }, 'claude-opus-5-5': { inputPerM: 4, outputPerM: 20 }, 'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5 },
};
const CACHE_WRITE = 1.25; const CACHE_READ = 0.1;
const price = (model, u) => { const k = Object.keys(PRICES).find((m) => String(model ?? '').startsWith(m)) ?? (String(model ?? '').startsWith('claude-haiku-4-5') ? 'claude-haiku-4-5' : null); const p = PRICES[k]; if (!p) return null;
  return ((u.input_tokens ?? 0) * p.inputPerM + (u.cache_creation_input_tokens ?? 0) * p.inputPerM * CACHE_WRITE + (u.cache_read_input_tokens ?? 0) * p.inputPerM * CACHE_READ + (u.output_tokens ?? 0) * p.outputPerM) / 1e6; };
const tag = () => (existsSync(tagFile) ? readFileSync(tagFile, 'utf8').trim() : 'untagged');
const usageOf = (body, sse) => {
  if (!sse) { try { const j = JSON.parse(body); return { model: j.model, usage: j.usage, stop: j.stop_reason }; } catch { return null; } }
  const u = {}; let model = null; let stop = null;
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue;
    try { const ev = JSON.parse(line.slice(5));
      if (ev.type === 'message_start') { model = ev.message?.model; Object.assign(u, ev.message?.usage ?? {}); }
      if (ev.type === 'message_delta') { if (ev.usage) Object.assign(u, ev.usage); if (ev.delta?.stop_reason) stop = ev.delta.stop_reason; }
    } catch { /* a partial line */ }
  }
  return model ? { model, usage: u, stop } : null;
};
let calls = 0;
createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks); let reqModel = null;
    try { reqModel = JSON.parse(body.toString('utf8')).model ?? null; } catch { /* not JSON */ }
    const headers = { ...req.headers, host: 'api.anthropic.com' }; delete headers['content-length']; delete headers['accept-encoding']; headers['content-length'] = String(body.length);
    const up = httpsRequest({ hostname: 'api.anthropic.com', port: 443, path: req.url, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers); const out = [];
      r.on('data', (c) => { out.push(c); res.write(c); });
      r.on('end', () => { res.end(); const text = Buffer.concat(out).toString('utf8');
        const sse = /text\/event-stream/.test(String(r.headers['content-type'] ?? ''));
        const got = (r.statusCode ?? 0) < 300 ? usageOf(text, sse) : null; const t = tag();
        const model = got?.model ?? reqModel; const usd = got ? price(model, got.usage) : 0;
        calls += 1;
        appendFileSync(ledger, JSON.stringify({ n: calls, at: new Date().toISOString(), tag: t, model, status: r.statusCode, usage: got?.usage ?? null, stop: got?.stop ?? null, usd }) + '\n');
      });
    });
    up.on('error', (e) => { if (!res.headersSent) res.writeHead(502); res.end(String(e.message)); appendFileSync(ledger, JSON.stringify({ n: ++calls, at: new Date().toISOString(), tag: tag(), model: reqModel, status: 'proxy-error', error: e.message, usd: 0 }) + '\n'); });
    up.write(body); up.end();
  });
}).listen(Number(port), '127.0.0.1', () => console.log(`meter on 127.0.0.1:${port} -> ${ledger}`));
