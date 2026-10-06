// studies/harness/voice-pass.mjs — DOES THE IN-CONTEXT VOICE PASS READ MORE LIKE THE AUTHOR THAN PASTED EXAMPLES, TO PEOPLE?
//
// Sealed by studies/VOICE_PASS_PREREGISTRATION.md: the first condition decision 0009 set before any voice model is
// considered. Two authors or more, each with sealed requests the skill never saw. BOTH ARMS ARE WRITTEN IN THIS RUN,
// by the same writer model: `pasted` (the model with four of the author's pieces in the prompt) and `voice` (the
// skill as a person would run it with the voice pass on). Nothing is read from an earlier study's cache.
//
//   node studies/harness/voice-pass.mjs --plan <plan.json> --corpus <name> [--corpus <name>]... --out <dir>
//        [--cap 20] [--writer claude-opus-5] [--nearness reader] [--dry-run] [--only packets]
//        [--force] [--force-answered] [--base-url <url>]
//   plan.json: {"corpora": [{"name", "data", "project", "skill", "read": [files], "heldOut": [files], "briefWords",
//               "requests": ["optional: the sealed requests; else one per held-out piece, from its title"]}]}
//
// Run it from any directory: the CLI it drives is found beside this file (dist/cli/atelier.mjs, so `npm run build`
// first), never from where the command was typed. Paths in the plan are read as given, so make them absolute.
//
// A RUN THAT COULD NOT START IS NOT A RESULT. A voice run that fails before any model was called (the CLI is missing,
// a crash that is not an `atelier:` refusal, a backend that cannot be reached) stops the study with exit 2 and
// nothing is cached, so the same command runs again once it is fixed. Only a run that got as far as a model and then
// failed is recorded, at its cap, and not tried again.
//
// A PACKET A READER MAY HAVE OPENED IS NEVER WRITTEN OVER. Running again (to resume, with `--only packets`, or with
// one `--corpus`) writes only the packets that are not there yet, and says which it left alone. `--force` rewrites a
// packet nobody has answered; one with an answer filled in is refused unless `--force-answered` is given too. The
// key (KEY-open-after-reading.json) is merged author by author: a run for one author leaves the others' entries as
// they are, and an entry is changed only when its packet is written.
//
// `--base-url <url>` sends both arms to an OpenAI-compatible backend instead: the offline smoke test against
// tests/fixtures/scripted-backend.mjs, and never how the sealed study is run.
//
// Scored by studies/harness/voice-pass-score.mjs once every reader has answered. The unit there is the request.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const CLI = fileURLToPath(new URL('../../dist/cli/atelier.mjs', import.meta.url));
if (!existsSync(CLI)) fail(`${CLI} is missing: run \`npm run build\` in the repository first. Nothing was spent.`);
const FORCE = has('--force'); const FORCE_ANSWERED = has('--force-answered');
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
const packetOf = (c, r) => join(OUT, 'human', `${c.name}-reader-${r}.md`);
/** A reader wrote something on an answer line, or a letter alone on the line under it. */
const answered = (text) => /^ANSWER [^:\n]+:[ \t]*\S/m.test(text) || /^ANSWER [^:\n]+:[ \t]*\r?\n[ \t]*[*_([]*[ABab][*_)\].]*[ \t]*\r?$/m.test(text);
/** The run says itself that no model was reached: the CLI did not load, there is no key, or nothing answers at the backend's address. */
const unreachable = (text) => /Cannot find module|ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|API_KEY is not set/i.test(text);
/** What went wrong reads as "no model was ever called": the run could not start, and trying again costs nothing. */
const neverCalled = (text) => /Cannot find module|ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|API[_ ]KEY|AUTH_TOKEN|\b401\b|authentication/i.test(text);
// CHECKED BEFORE ANYTHING IS WRITTEN OR SPENT: --force may not take a reader's answers with it.
if (FORCE && !FORCE_ANSWERED) {
  const filled = CORPORA.flatMap((c) => Array.from({ length: READERS }, (_, i) => packetOf(c, i + 1))).filter((f) => existsSync(f) && answered(readFileSync(f, 'utf8')));
  if (filled.length) fail(`--force would write over ${filled.length} packet(s) that already hold a reader's answers (${filled.map((f) => basename(f)).join(', ')}). Leave --force out to keep them, or add --force-answered to write over them and lose those answers. Nothing was written or spent.`);
}
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
        } catch (e) {
          const said = String(e.message).split('\n')[0];
          // The backend was never reached: nothing was spent, so nothing is recorded and the run stops here.
          if (neverCalled(`${said} ${e.cause?.code ?? ''} ${e.cause?.message ?? ''}`)) fail(`the pasted arm could not reach its model (${said}). Nothing was cached for "${req.slice(0, 50)}": check the key or --base-url and run the same command again.`);
          cache[key(c, 'pasted', req)] = { corpus: c.name, arm: 'pasted', request: req, failed: said, costUsd: DIRECT_CAP };
        }
        save();
      }
      if (!cache[key(c, 'voice', req)]) {
        const t0 = Date.now(); let out = ''; let err = '';
        try { out = execFileSync('node', [CLI, 'invoke', '--skill', c.skill, req, '--json', '--cap', String(RUN_CAP), ...FLAGS, ...PASS_THROUGH],
          { encoding: 'utf8', cwd: c.project, env: { ...process.env, ATELIER_DATA: c.data, ATELIER_PROJECT_DIR: c.project }, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { out = `${e.stdout ?? ''}`; err = `${e.stderr ?? ''}`; }
        let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch { /* a failed run */ }
        if (!j) {
          const said = err.split('\n').filter(Boolean).slice(-2).join(' ') || 'no output';
          // A RUN THAT NEVER REACHED A MODEL STOPS THE STUDY AND IS NOT CACHED: the CLI could not be loaded, or it
          // crashed at once with something that is not its own refusal. Recorded as a failed request at the run's
          // cap, it would have been skipped by every later run and counted as money spent.
          const early = Date.now() - t0 < REFUSAL_MS;
          if (unreachable(err) || (early && !/atelier: /.test(err))) fail(`the voice run could not start, before any model call: ${said}. Nothing was cached for "${req.slice(0, 50)}": fix it and run the same command again.`);
          // A refusal before anything is spent stops the study; any other failure is recorded at its cap and never retried.
          if (early) { console.error(`refused before spending: ${said}`); process.exit(4); }
          cache[key(c, 'voice', req)] = { corpus: c.name, arm: 'voice', request: req, failed: said, costUsd: RUN_CAP };
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
const KEY_FILE = join(OUT, 'human', 'KEY-open-after-reading.json');
const keys = existsSync(KEY_FILE) ? JSON.parse(readFileSync(KEY_FILE, 'utf8')) : {};
const summary = []; const written = []; const kept = []; const stale = [];
for (const c of CORPORA) {
  const excerptable = c.read.slice(PASTED).map((f) => readFileSync(f, 'utf8'));
  const pairs = requestsOf(c).map((req, i) => ({ id: `${c.name}-${String(i + 1).padStart(2, '0')}`, req, p: cache[key(c, 'pasted', req)], v: cache[key(c, 'voice', req)] }));
  const valid = pairs.filter((x) => x.p?.output && !x.p.failed && x.v?.output && !x.v.failed);
  summary.push({ corpus: c.name, requests: pairs.length, valid: valid.length, noRewrite: valid.filter((x) => !x.v.rewritten).length, invented: valid.reduce((a, x) => a + (x.v.invented ?? 0), 0) });
  keys[c.name] ??= {};
  for (let r = 1; r <= READERS; r++) {
    const file = packetOf(c, r); const there = existsSync(file) ? readFileSync(file, 'utf8') : null;
    // A PACKET THAT IS THERE IS LEFT AS IT IS (unless --force): a reader may be half way through it. Its key entry
    // is left too. Only when the key has lost that entry is it written again, for the requests the packet holds;
    // the sides are seeded, so it is the same key the packet was written with.
    const rewrite = there === null || FORCE;
    if (!rewrite && valid.some((x) => !there.includes(`ANSWER ${x.id}:`))) stale.push(basename(file));
    if (!rewrite && keys[c.name][r]) { kept.push(basename(file)); continue; }
    const side = {};
    const order = [...valid].sort((a, b) => h(`order|${c.name}|${r}|${a.id}`).localeCompare(h(`order|${c.name}|${r}|${b.id}`)));
    let page = `# Which one reads more like this author? (${c.name}, reader ${r})\n\nEach section shows two excerpts by the author, then two new pieces on one subject, A and B. Neither was written by the author. Write A or B on the answer line: the one that reads more like the author of the excerpts. Read both in full. Do not open the key.\n`;
    for (const x of order) {
      const first = parseInt(h(`ref|${c.name}|${r}|${x.id}|0`).slice(0, 6), 16) % excerptable.length;
      const second = (first + 1 + (parseInt(h(`ref|${c.name}|${r}|${x.id}|1`).slice(0, 6), 16) % (excerptable.length - 1))) % excerptable.length;
      const p = clean(x.p.output); const v = clean(x.v.output); const words = Math.min(p.split(/\s+/).length, v.split(/\s+/).length);
      const voiceFirst = parseInt(h(`side|${c.name}|${r}|${x.id}`).slice(0, 2), 16) % 2 === 0;
      if (!rewrite && !there.includes(`ANSWER ${x.id}:`)) continue;
      side[x.id] = voiceFirst ? 'A' : 'B';
      page += `\n---\n\n## ${x.id}\n\n${x.req}\n\n### The author, excerpt 1\n\n${cut(clean(excerptable[first]), 250)}\n\n### The author, excerpt 2\n\n${cut(clean(excerptable[second]), 250)}\n\n### A\n\n${cut(voiceFirst ? v : p, words)}\n\n### B\n\n${cut(voiceFirst ? p : v, words)}\n\nANSWER ${x.id}: \n`;
    }
    keys[c.name][r] = side;
    if (rewrite) { writeFileSync(file, page); written.push(basename(file)); } else kept.push(basename(file));
  }
}
writeFileSync(KEY_FILE, JSON.stringify(keys, null, 1));
// The summary is merged the same way: a run for one author keeps what an earlier run said of the others.
const RESULT = join(OUT, 'result.json');
let earlier = []; try { earlier = JSON.parse(readFileSync(RESULT, 'utf8')).corpora ?? []; } catch { /* no earlier result */ }
const corpora = [...earlier.filter((e) => !summary.some((x) => x.corpus === e.corpus)), ...summary];
writeFileSync(RESULT, JSON.stringify({ corpora, human: 'PENDING: score with studies/harness/voice-pass-score.mjs once every reader has answered', spentUsd: Math.round(spent() * 100) / 100 }, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.error(`packets written: ${written.length ? written.join(', ') : 'none'}.`);
if (kept.length) console.error(`packets left alone, with their key entries (already there; --force rewrites one nobody has answered, --force-answered one with answers): ${kept.join(', ')}.`);
if (stale.length) console.error(`OF THOSE, ${stale.length} do not hold every request that is written now (${stale.join(', ')}): they were made before the writing was finished. If no reader has them yet, run again with --force to write them whole.`);
