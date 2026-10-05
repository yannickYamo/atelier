// studies/harness/voice-pass.mjs — DOES THE IN-CONTEXT VOICE PASS READ MORE LIKE THE AUTHOR THAN PASTED EXAMPLES, TO PEOPLE?
//
// Sealed by studies/VOICE_PASS_PREREGISTRATION.md: the first condition decision 0009 set before any voice model is
// considered. One corpus of the indistinguishability study, the same requests (the titles of pieces the skill never
// read). The `pasted` and `atelier` outputs are the ones that study recorded (read from its cache, never rewritten);
// this harness writes one new arm, `voice`: the skill as a person would run it with the voice pass on.
//
//   node studies/harness/voice-pass.mjs --plan <plan.json> --corpus <name> --cache <the study's cache.json> --out <dir>
//        [--cap 12] [--nearness reader] [--dry-run] [--only packets]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { evaluationVocabulary, evaluationVector, standardisedVectors } from '../../dist/core/fidelity/evaluation.js';
import { c2st, floorOf } from '../../dist/core/fidelity/twosample.js';
import { mulberry32 } from '../../dist/core/fidelity/qualify.js';
import { arg, has, fail } from './study-client.mjs';

const PLAN = JSON.parse(readFileSync(arg('--plan') ?? fail('missing --plan'), 'utf8'));
const c = PLAN.corpora.find((x) => x.name === (arg('--corpus') ?? fail('missing --corpus'))) ?? fail('no such corpus in the plan');
const STUDY = JSON.parse(readFileSync(arg('--cache') ?? fail('missing --cache'), 'utf8'));
const OUT = arg('--out') ?? fail('missing --out');
const CAP = Number(arg('--cap', '12')); const RUN_CAP = 4; const READERS = 5; const REFUSAL_MS = 15000;
const CLI = join(process.cwd(), 'dist/cli/atelier.mjs');
mkdirSync(join(OUT, 'human'), { recursive: true });
const CACHE = join(OUT, 'cache.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const save = () => writeFileSync(CACHE, JSON.stringify(cache, null, 1));
const spent = () => Object.values(cache).reduce((a, o) => a + (o.costUsd ?? 0), 0);
const h = (s) => createHash('sha256').update(s).digest('hex');
const titleOf = (text, file) => { const first = text.replace(/^﻿/, '').split('\n').find((l) => l.trim()) ?? ''; return (/^#\s+(.+)$/.exec(first.trim())?.[1] ?? basename(file).replace(/\.md$/, '').replace(/-/g, ' ')).trim(); };
const request = (title, words) => `Write a blog post titled "${title}". About ${words} words.`;
const studied = (arm, title) => STUDY[h(`${c.name}|${arm}|${title}`).slice(0, 16)];
const held = c.heldOut.map((f) => { const text = readFileSync(f, 'utf8'); return { f, text, title: titleOf(text, f) }; });
const read = c.read.map((f) => readFileSync(f, 'utf8'));
// THE PASTED ARM WAS SHOWN THE FIRST FOUR READ PIECES (studies/harness/indistinguishability.mjs). A reader shown an
// excerpt of one of them would be comparing the pasted output with its own source, so excerpts come from the rest.
const PASTED = 4;
const excerptable = read.slice(PASTED);
if (excerptable.length < 2) fail(`${c.name}: fewer than two read pieces outside the ${PASTED} the pasted arm was shown; no excerpt can be drawn fairly.`);
for (const x of held) for (const arm of ['pasted', 'atelier']) if (!studied(arm, x.title)?.output) fail(`the study's cache holds no ${arm} output for "${x.title}".`);

const FLAGS = ['--voice', 'incontext', ...(arg('--nearness') === 'reader' ? ['--nearness', 'reader'] : [])];
if (has('--dry-run')) {
  console.log(`${c.name}: ${held.length} requests, one new arm (invoke ${FLAGS.join(' ')}), at most $${RUN_CAP} each; cap $${CAP}; ${READERS} reader packets.`);
  for (const x of held) console.log(`  ${cache[x.title]?.output ? 'done ' : 'to do'}  ${x.title}`);
  process.exit(0);
}
if (arg('--only') !== 'packets') {
  for (const x of held) {
    if (cache[x.title]) continue;
    if (spent() + RUN_CAP > CAP) { console.error(`the cap of $${CAP} would be passed ($${spent().toFixed(2)} spent); stopping.`); process.exit(3); }
    const t0 = Date.now(); let out = ''; let err = '';
    try { out = execFileSync('node', [CLI, 'invoke', '--skill', c.skill, request(x.title, c.briefWords), '--json', '--cap', String(RUN_CAP), ...FLAGS],
      { encoding: 'utf8', cwd: c.project, env: { ...process.env, ATELIER_DATA: c.data, ATELIER_PROJECT_DIR: c.project }, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { out = `${e.stdout ?? ''}`; err = `${e.stderr ?? ''}`; }
    let j = null; try { j = JSON.parse(out); } catch { /* a failed run */ }
    if (!j) {
      // A refusal before anything is spent stops the study; any other failure is recorded at its cap and never retried.
      if (Date.now() - t0 < REFUSAL_MS && /atelier: /.test(err)) { console.error(`refused before spending: ${err.split('\n').filter(Boolean).slice(-2).join(' ')}`); process.exit(4); }
      cache[x.title] = { failed: err.split('\n').filter(Boolean).slice(-2).join(' '), costUsd: RUN_CAP }; save(); continue;
    }
    const v = j.eval?.voice; const claims = j.eval?.gates?.claims;
    cache[x.title] = { output: j.output, costUsd: j.costUsd ?? 0, invocationId: j.invocationId, conformant: j.eval?.result?.conformant ?? null,
      invented: claims?.state === 'checked' ? claims.delivered : null, rewritten: v?.passed ?? null, refused: v?.refused ?? null, voiceNote: v?.note ?? null,
      // A VOICE ARM WITHOUT A REWRITE is the atelier arm under another name: recorded, and never counted for the voice pass.
      ...(v?.passed > 0 ? {} : { failed: `no paragraph was rewritten (${v?.note ?? `${v?.refused ?? 0} refused`})` }) };
    save();
    console.log(`voice  $${(cache[x.title].costUsd).toFixed(3)}  total $${spent().toFixed(2)}  ${x.title.slice(0, 50)}  rewritten ${v?.passed ?? '-'} refused ${v?.refused ?? '-'}${cache[x.title].failed ? '  NOT COUNTED' : ''}`);
  }
}
const voice = (title) => (cache[title]?.output && !cache[title].failed ? cache[title] : null);

// ── the machine reading: each arm against the held-out pieces, beside the author's own floor ─────────
const vocab = evaluationVocabulary(read); const readV = read.map((t) => evaluationVector(t, vocab));
const aucOf = (texts) => { const { others } = standardisedVectors(readV, [...held.map((x) => evaluationVector(x.text, vocab)), ...texts.map((t) => evaluationVector(t, vocab))]);
  return c2st(others.slice(0, held.length), others.slice(held.length), { seed: 1 }); };
const all = [...read, ...held.map((x) => x.text)];
const floor = (() => { const n = held.length; const aucs = [];
  for (let t = 0; t < 200; t++) { const rand = mulberry32(t + 1); const idx = all.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [idx[i], idx[k]] = [idx[k], idx[i]]; }
    const ref = idx.slice(2 * n).map((i) => all[i]); const v = evaluationVocabulary(ref);
    const { others } = standardisedVectors(ref.map((x) => evaluationVector(x, v)), idx.slice(0, 2 * n).map((i) => evaluationVector(all[i], v)));
    const r = c2st(others.slice(0, n), others.slice(n), { seed: 1 }); if (r) aucs.push(r.auc); }
  return floorOf(aucs, n); })();
const voiced = held.map((x) => voice(x.title)).filter(Boolean);
const result = { corpus: c.name, requests: held.length, voice: { counted: voiced.length, notCounted: held.length - voiced.length,
  rewritten: voiced.reduce((a, o) => a + (o.rewritten ?? 0), 0), refused: voiced.reduce((a, o) => a + (o.refused ?? 0), 0),
  invented: voiced.reduce((a, o) => a + (o.invented ?? 0), 0), conformant: voiced.filter((o) => o.conformant === true).length },
  auc: { pasted: aucOf(held.map((x) => studied('pasted', x.title).output)), atelier: aucOf(held.map((x) => studied('atelier', x.title).output)), voice: voiced.length >= 6 ? aucOf(voiced.map((o) => o.output)) : null },
  floor, human: 'PENDING: the blind read (packets in human/)', spentUsd: Math.round(spent() * 100) / 100 };
writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));

// ── the packets: which of two reads more like the author of the excerpts shown ──────────────────────
// Every reader sees every request once: two excerpts of the author's read pieces (never the piece the request came
// from), then the `pasted` and the `voice` output for that request, cleaned and cut to the same length, sides seeded.
const clean = (t) => t.replace(/^﻿/, '').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^\s*#\s+.+\n/, '').trim();
const cut = (t, words) => { const out = []; let n = 0; for (const p of t.split(/\n\s*\n/)) { if (n >= words) break; out.push(p); n += p.split(/\s+/).length; } return out.join('\n\n'); };
const keys = {};
for (let r = 1; r <= READERS; r++) {
  keys[r] = {};
  const order = held.filter((x) => voice(x.title)).sort((a, b) => h(`order|${r}|${a.title}`).localeCompare(h(`order|${r}|${b.title}`)));
  let page = `# Which one reads more like this author? (reader ${r})\n\nEach section shows two excerpts by the author, then two new pieces on one subject, A and B. Neither was written by the author. Mark the one that reads more like the author of the excerpts. Read both in full. Do not open the key before you finish.\n`;
  order.forEach((x, k) => {
    // Two different pieces, neither one the pasted arm saw.
    const first = parseInt(h(`ref|${r}|${x.title}|0`).slice(0, 6), 16) % excerptable.length;
    const second = (first + 1 + (parseInt(h(`ref|${r}|${x.title}|1`).slice(0, 6), 16) % (excerptable.length - 1))) % excerptable.length;
    const refs = [first, second].map((i) => cut(clean(excerptable[i]), 250));
    const p = clean(studied('pasted', x.title).output); const v = clean(voice(x.title).output);
    const words = Math.min(p.split(/\s+/).length, v.split(/\s+/).length);
    const voiceFirst = parseInt(h(`side|${r}|${x.title}`).slice(0, 2), 16) % 2 === 0;
    keys[r][k + 1] = { title: x.title, voice: voiceFirst ? 'A' : 'B' };
    page += `\n---\n\n## ${k + 1}. "${x.title}"\n\n### The author, excerpt 1\n\n${refs[0]}\n\n### The author, excerpt 2\n\n${refs[1]}\n\n### A\n\n${cut(voiceFirst ? v : p, words)}\n\n### B\n\n${cut(voiceFirst ? p : v, words)}\n`;
  });
  writeFileSync(join(OUT, 'human', `reader-${r}.md`), page);
}
writeFileSync(join(OUT, 'human', 'KEY-open-after-reading.json'), JSON.stringify(keys, null, 1));
