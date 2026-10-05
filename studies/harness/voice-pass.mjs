// studies/harness/voice-pass.mjs — DOES THE IN-CONTEXT VOICE PASS READ MORE LIKE THE AUTHOR THAN PASTED EXAMPLES, TO PEOPLE?
//
// Sealed by studies/VOICE_PASS_PREREGISTRATION.md: the first condition decision 0009 set before any voice model is
// considered. Two authors or more, each with sealed requests the skill never saw. BOTH ARMS ARE WRITTEN IN THIS RUN,
// by the same writer model: `pasted` (the model with four of the author's pieces in the prompt) and `voice` (the
// skill as a person would run it with the voice pass on). Nothing is read from an earlier study's cache.
//
//   node studies/harness/voice-pass.mjs --plan <plan.json> --corpus <name> [--corpus <name>]... --out <dir>
//        [--cap 20] [--writer claude-opus-5] [--nearness reader] [--dry-run] [--only packets]
//   plan.json: {"corpora": [{"name", "data", "project", "skill", "read": [files], "heldOut": [files], "briefWords",
//               "requests": ["optional: the sealed requests; else one per held-out piece, from its title"]}]}
//
// Scored by studies/harness/voice-pass-score.mjs once every reader has answered. The unit there is the request.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { spend } from '../../dist/core/inference/client.js';
import { arg, has, fail, clientFor, budgetOf } from './study-client.mjs';

const PLAN = JSON.parse(readFileSync(arg('--plan') ?? fail('missing --plan'), 'utf8'));
const NAMES = process.argv.flatMap((a, i) => (a === '--corpus' ? [process.argv[i + 1]] : []));
if (!NAMES.length) fail('missing --corpus (give it once per author)');
const CORPORA = NAMES.map((n) => PLAN.corpora.find((x) => x.name === n) ?? fail(`no corpus "${n}" in the plan`));
const OUT = arg('--out') ?? fail('missing --out');
const CAP = Number(arg('--cap', '20')); const RUN_CAP = 4; const DIRECT_CAP = 0.6; const READERS = 5; const PASTED = 4; const REFUSAL_MS = 15000;
const WRITER = arg('--writer', 'claude-opus-5');
const CLI = join(process.cwd(), 'dist/cli/atelier.mjs');
const PASS_THROUGH = has('--base-url') ? ['--provider', 'openai-compatible', '--base-url', arg('--base-url'), '--model', 'scripted', '--accept-new-binding'] : [];
mkdirSync(join(OUT, 'human'), { recursive: true });
const CACHE = join(OUT, 'cache.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const save = () => writeFileSync(CACHE, JSON.stringify(cache, null, 1));
const spent = () => Object.values(cache).reduce((a, o) => a + (o.costUsd ?? 0), 0);
const h = (s) => createHash('sha256').update(s).digest('hex');
const titleOf = (text, file) => { const first = text.replace(/^﻿/, '').split('\n').find((l) => l.trim()) ?? ''; return (/^#\s+(.+)$/.exec(first.trim())?.[1] ?? basename(file).replace(/\.md$/, '').replace(/-/g, ' ')).trim(); };
const requestsOf = (c) => c.requests ?? c.heldOut.map((f) => `Write a blog post titled "${titleOf(readFileSync(f, 'utf8'), f)}". About ${c.briefWords} words.`);
const FLAGS = ['--voice', 'incontext', ...(arg('--nearness') === 'reader' ? ['--nearness', 'reader'] : [])];
const key = (c, arm, req) => h(`${c.name}|${arm}|${req}`).slice(0, 16);
for (const c of CORPORA) if (c.read.length < PASTED + 2) fail(`${c.name}: ${c.read.length} read pieces; the pasted arm takes ${PASTED} and the readers' excerpts need two more.`);

if (has('--dry-run')) {
  for (const c of CORPORA) { const rs = requestsOf(c); console.log(`${c.name}: ${rs.length} requests, two arms each (pasted; invoke ${FLAGS.join(' ')}), ${READERS} reader packets.`); for (const r of rs) console.log(`  ${cache[key(c, 'voice', r)] && cache[key(c, 'pasted', r)] ? 'done ' : 'to do'}  ${r.slice(0, 80)}`); }
  console.log(`cap $${CAP}; at most $${RUN_CAP} a voice run and $${DIRECT_CAP} a pasted one.`);
  process.exit(0);
}
if (arg('--only') !== 'packets') {
  const writer = clientFor(WRITER); const budget = budgetOf(CAP, 100000);
  for (const c of CORPORA) {
    const examples = c.read.slice(0, PASTED).map((f) => readFileSync(f, 'utf8'));
    for (const req of requestsOf(c)) {
      const reserve = (cache[key(c, 'pasted', req)] ? 0 : DIRECT_CAP) + (cache[key(c, 'voice', req)] ? 0 : RUN_CAP);
      if (reserve && spent() + reserve > CAP) { console.error(`the cap of $${CAP} would be passed ($${spent().toFixed(2)} spent); stopping.`); process.exit(3); }
      if (!cache[key(c, 'pasted', req)]) {
        try {
          const o = await spend(budget, DIRECT_CAP, async () => {
            const x = await writer.complete({ stableBlock: `You are a writer. Here are pieces by the author whose style to write in:\n\n${examples.map((e, i) => `--- piece ${i + 1} ---\n${e}`).join('\n\n')}`, variableBlock: '',
              userMessage: `${req} Write it in the style of the pieces above. Output only the piece.`, toolName: 'emit_piece', toolDescription: 'Emit the finished piece.',
              schema: { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'], additionalProperties: false }, maxTokens: 6000 });
            return { value: { output: String(x.json?.piece ?? ''), costUsd: x.costUsd ?? 0 }, cost: x.cost };
          });
          cache[key(c, 'pasted', req)] = { corpus: c.name, arm: 'pasted', request: req, ...o, ...(o.output.trim() ? {} : { failed: 'an empty piece' }) };
        } catch (e) { cache[key(c, 'pasted', req)] = { corpus: c.name, arm: 'pasted', request: req, failed: String(e.message).split('\n')[0], costUsd: DIRECT_CAP }; }
        save();
      }
      if (!cache[key(c, 'voice', req)]) {
        const t0 = Date.now(); let out = ''; let err = '';
        try { out = execFileSync('node', [CLI, 'invoke', '--skill', c.skill, req, '--json', '--cap', String(RUN_CAP), ...FLAGS, ...PASS_THROUGH],
          { encoding: 'utf8', cwd: c.project, env: { ...process.env, ATELIER_DATA: c.data, ATELIER_PROJECT_DIR: c.project }, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { out = `${e.stdout ?? ''}`; err = `${e.stderr ?? ''}`; }
        let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch { /* a failed run */ }
        if (!j) {
          // A refusal before anything is spent stops the study; any other failure is recorded at its cap and never retried.
          if (Date.now() - t0 < REFUSAL_MS && /atelier: /.test(err)) { console.error(`refused before spending: ${err.split('\n').filter(Boolean).slice(-2).join(' ')}`); process.exit(4); }
          cache[key(c, 'voice', req)] = { corpus: c.name, arm: 'voice', request: req, failed: err.split('\n').filter(Boolean).slice(-2).join(' ') || 'no output', costUsd: RUN_CAP };
        } else {
          const v = j.eval?.voice; const claims = j.eval?.gates?.claims;
          // EVERY VOICE OUTPUT IS KEPT, REWRITTEN OR NOT: it is what a person who turned the pass on would get. How
          // many had no paragraph rewritten is reported, and never a reason to drop one from the read.
          cache[key(c, 'voice', req)] = { corpus: c.name, arm: 'voice', request: req, output: j.output, costUsd: j.costUsd ?? 0, invocationId: j.invocationId, conformant: j.eval?.result?.conformant ?? null,
            invented: claims?.state === 'checked' ? claims.delivered : null, rewritten: v?.passed ?? 0, refused: v?.refused ?? 0, voiceNote: v?.note ?? null };
        }
        save();
      }
      const p = cache[key(c, 'pasted', req)]; const v = cache[key(c, 'voice', req)];
      console.log(`${c.name}  $${spent().toFixed(2)}  pasted ${p.failed ? 'FAILED' : 'ok'}  voice ${v.failed ? 'FAILED' : `rewritten ${v.rewritten}, refused ${v.refused}`}  ${req.slice(0, 50)}`);
    }
  }
}

// ── the packets: which of two reads more like the author of the excerpts shown ──────────────────────
// One panel of readers per author; every reader sees every request of that author once. Two excerpts of the author's
// read pieces, never one the pasted arm was shown, then the two outputs cleaned and cut to one length, sides seeded.
const clean = (t) => t.replace(/^﻿/, '').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^\s*#\s+.+\n/, '').trim();
const cut = (t, words) => { const out = []; let n = 0; for (const p of t.split(/\n\s*\n/)) { if (n >= words) break; out.push(p); n += p.split(/\s+/).length; } return out.join('\n\n'); };
const keys = {}; const summary = [];
for (const c of CORPORA) {
  const excerptable = c.read.slice(PASTED).map((f) => readFileSync(f, 'utf8'));
  const pairs = requestsOf(c).map((req, i) => ({ id: `${c.name}-${String(i + 1).padStart(2, '0')}`, req, p: cache[key(c, 'pasted', req)], v: cache[key(c, 'voice', req)] }));
  const valid = pairs.filter((x) => x.p?.output && !x.p.failed && x.v?.output && !x.v.failed);
  summary.push({ corpus: c.name, requests: pairs.length, valid: valid.length, noRewrite: valid.filter((x) => !x.v.rewritten).length, invented: valid.reduce((a, x) => a + (x.v.invented ?? 0), 0) });
  keys[c.name] = {};
  for (let r = 1; r <= READERS; r++) {
    keys[c.name][r] = {};
    const order = [...valid].sort((a, b) => h(`order|${c.name}|${r}|${a.id}`).localeCompare(h(`order|${c.name}|${r}|${b.id}`)));
    let page = `# Which one reads more like this author? (${c.name}, reader ${r})\n\nEach section shows two excerpts by the author, then two new pieces on one subject, A and B. Neither was written by the author. Write A or B on the answer line: the one that reads more like the author of the excerpts. Read both in full. Do not open the key.\n`;
    for (const x of order) {
      const first = parseInt(h(`ref|${c.name}|${r}|${x.id}|0`).slice(0, 6), 16) % excerptable.length;
      const second = (first + 1 + (parseInt(h(`ref|${c.name}|${r}|${x.id}|1`).slice(0, 6), 16) % (excerptable.length - 1))) % excerptable.length;
      const p = clean(x.p.output); const v = clean(x.v.output); const words = Math.min(p.split(/\s+/).length, v.split(/\s+/).length);
      const voiceFirst = parseInt(h(`side|${c.name}|${r}|${x.id}`).slice(0, 2), 16) % 2 === 0;
      keys[c.name][r][x.id] = voiceFirst ? 'A' : 'B';
      page += `\n---\n\n## ${x.id}\n\n${x.req}\n\n### The author, excerpt 1\n\n${cut(clean(excerptable[first]), 250)}\n\n### The author, excerpt 2\n\n${cut(clean(excerptable[second]), 250)}\n\n### A\n\n${cut(voiceFirst ? v : p, words)}\n\n### B\n\n${cut(voiceFirst ? p : v, words)}\n\nANSWER ${x.id}: \n`;
    }
    writeFileSync(join(OUT, 'human', `${c.name}-reader-${r}.md`), page);
  }
}
writeFileSync(join(OUT, 'human', 'KEY-open-after-reading.json'), JSON.stringify(keys, null, 1));
writeFileSync(join(OUT, 'result.json'), JSON.stringify({ corpora: summary, human: 'PENDING: score with studies/harness/voice-pass-score.mjs once every reader has answered', spentUsd: Math.round(spent() * 100) / 100 }, null, 1));
console.log(JSON.stringify(summary, null, 1));
