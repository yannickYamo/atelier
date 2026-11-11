#!/usr/bin/env node
// validation/guided/run.mjs — one capped run of everything a first user meets, on a real model.
//
//   node validation/guided/run.mjs [--case validation/guided/case] [--budget 20] [--out out] [--skip rules]
//        [--model-args "--provider openai-compatible --base-url <url> --model <id>"]
//
// Needs the repo built (npm ci && npm run build) and a model key in the environment (ANTHROPIC_API_KEY), which is never
// printed or written. A case folder holds: pieces/ (or `corpus` in case.json), method.md (optional), case.json:
//   { "corpus": "../../../examples/blog/posts", "for": "<what the skill is for>",
//     "card": { "kind": "...", "reader": "...", "purpose": "..." }, "change": "<what to change in preview 1>",
//     "always": "<a complaint that should hold for every piece>",
//     "requests": [ { "task": "...", "with": ["notes=notes/n0.md"] }, ... ] }   four requests at least
//
// Steps (each transcript and piece goes to --out; results.json and ledger.json say what happened and what it cost):
//   A  guided build from the folder and the method, answered prompt by prompt as a person would
//   B  guided build from the folder alone (no method)
//   C  three runs as built                                  arm "base"
//   D  the person's card set as theirs, three runs with it shown to the writer (ATELIER_CARD_TO_WRITER=1)   arm "card"
//   E  the run of request 0 kept, then the same three runs   arm "kept"
//   F  a lasting correction (fix --always), the skill page, the undo
//   G  the rules route (atelier new --rules --yes), to its review screen      (--skip rules leaves it out)
// Measured by code against the corpus: words, share of one-line paragraphs, median sentence and paragraph length.
// For a person: out/blind/ holds base against card and base against kept under shuffled labels; key.json says which.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, mkdtempSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); const repo = resolve(here, '../..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const caseDir = resolve(arg('case', join(here, 'case'))); const C = JSON.parse(readFileSync(join(caseDir, 'case.json'), 'utf8'));
const corpus = resolve(caseDir, C.corpus ?? 'pieces'); const method = existsSync(join(caseDir, 'method.md')) ? join(caseDir, 'method.md') : null;
const budget = Number(arg('budget', '20')); const out = resolve(arg('out', 'out')); const skip = new Set((arg('skip', '') || '').split(',').filter(Boolean));
const M = (arg('model-args', '') || '').split(/\s+/).filter(Boolean);
const CLI = join(repo, 'dist/cli/atelier.mjs');
if (!existsSync(CLI)) { console.error('dist/ is missing: npm ci && npm run build'); process.exit(2); }
if ((C.requests ?? []).length < 4) { console.error('case.json needs at least four requests'); process.exit(2); }
mkdirSync(join(out, 'blind'), { recursive: true });
const place = (tag) => ({ data: mkdtempSync(join(tmpdir(), `guided-${tag}-data-`)), proj: mkdtempSync(join(tmpdir(), `guided-${tag}-proj-`)) });
const envOf = (p, extra = {}) => ({ ...process.env, ATELIER_DATA: p.data, ATELIER_PROJECT_DIR: p.proj, ...extra });

// ── spend: a run with --json reports its cost; a build and a lasting fix print none and are charged an allowance, set
// high on purpose. The provider's console is the true figure.
const ALLOW = { build: Number(arg('build-allowance', '3')), fix: Number(arg('fix-allowance', '1.5')), rules: Number(arg('rules-allowance', '3')) };
let spent = 0; const ledger = []; const results = { commit: spawnSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), steps: {}, arms: {} };
const charge = (what, usd, metered) => { spent += usd; ledger.push({ what, usd: Number(usd.toFixed(4)), metered, total: Number(spent.toFixed(2)) }); writeFileSync(join(out, 'ledger.json'), JSON.stringify(ledger, null, 1)); };
const finish = (code = 0) => { results.spentUsd = Number(spent.toFixed(2)); writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 1)); console.log(JSON.stringify(results, null, 1)); process.exit(code); };
const room = (what, need = 0.3) => { if (spent + need > budget) { console.error(`STOP before "${what}": $${spent.toFixed(2)} of $${budget} counted.`); finish(0); } };

const at = (p, args, extra = {}) => { const t = Date.now(); const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8', cwd: p.proj, env: envOf(p, extra), input: '', maxBuffer: 1 << 27 }); return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status, seconds: Math.round((Date.now() - t) / 1000) }; };
const jsonOf = (text) => { for (let i = text.indexOf('{'); i >= 0; i = text.indexOf('\n{', i + 1)) { try { return JSON.parse(text.slice(i)); } catch { /* a later brace */ } } return null; };

// A PERSON AT THE BUILD: each prompt answered when it is printed, by what it asks, so an answer never lands on another question.
const PROMPTS = [
  [/What are these pieces[^\n]*\?\s*$/, () => C.card?.kind ?? ''], [/Who reads them\?\s*$/, () => C.card?.reader ?? ''], [/What should a reader do or know[^\n]*\?\s*$/, () => C.card?.purpose ?? ''],
  [/A first request to try it on[^\n]*:\s*$/, () => C.requests[0].task], [/Anything to change\?[^\n]*:\s*$/, (n) => (n === 1 ? C.change ?? '' : '')], [/Is that the change you meant\?[^\n]*\)\s*$/, () => 'y'],
];
const guidedBuild = (p, args) => new Promise((done) => {
  const t = Date.now(); const child = spawn('node', [CLI, ...args], { cwd: p.proj, env: envOf(p, { ATELIER_GUIDED: '1' }) });
  let outText = ''; let errText = ''; let seen = 0; const asked = []; const counts = new Map();
  child.stdout.on('data', (d) => { outText += d; const tail = outText.slice(seen);
    for (const [re, answer] of PROMPTS) { if (re.test(tail)) { const n = (counts.get(re) ?? 0) + 1; counts.set(re, n); const a = answer(n); asked.push({ prompt: tail.trim().split('\n').pop().slice(0, 80), answered: a }); seen = outText.length; child.stdin.write(`${a}\n`); break; } } });
  child.stderr.on('data', (d) => { errText += d; });
  child.on('close', (code) => { child.stdin.destroy(); done({ out: outText, err: errText, code, seconds: Math.round((Date.now() - t) / 1000), asked }); });
});
const INTERNAL = ['StandardVersion', 'SkillVersion', 'latitude', 'binding', 'ratif', 'materiality', 'REQUIRED', 'PREFERRED', 'receipt', 'hash', 'vantage', 'Held back', 'Sealed'];
const buildFacts = (b) => ({ exit: b.code, seconds: b.seconds, prompts: b.asked.map((a) => a.prompt), screenLines: b.out.split('\n').filter((l) => l.trim()).length,
  understood: b.out.includes('What I understood'), howYouWrite: /How you write:\n\s+- .+\n\s+.+as in: "/.test(b.out), previews: (b.out.match(/^Sample \d of \d: /gm) ?? []).length, writtenAgain: b.out.includes('Written again:'),
  ready: /is ready/.test(b.out), declinedAskedAgain: /declined/.test(b.out + b.err), internalWords: INTERNAL.filter((w) => b.out.includes(w)), titleListedAsStep: method ? b.out.includes(`- ${readFileSync(method, 'utf8').trim().split('\n')[0].trim()}`) : false,
  disputedStepShown: /not what your own pieces do/.test(b.out) });

// ── measures, by code ─────────────────────────────────────────────────────────────────────────────
const paragraphs = (t) => t.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'));
const sentences = (x) => x.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"“'‘(])/).filter(Boolean);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const measure = (t) => { const ps = paragraphs(t); const ss = ps.flatMap(sentences); return { words: t.split(/\s+/).filter(Boolean).length, oneLineParagraphs: ps.length ? ps.filter((x) => sentences(x).length === 1).length / ps.length : 0, medianSentenceWords: median(ss.map((s) => s.split(/\s+/).length)), medianParagraphSentences: median(ps.map((x) => sentences(x).length)) }; };
const meanOf = (rows) => (rows.length ? Object.fromEntries(Object.keys(rows[0]).map((k) => [k, Number((rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(2))])) : {});
const walk = (d) => readdirSync(d).flatMap((f) => { const x = join(d, f); return statSync(x).isDirectory() ? walk(x) : /\.(md|txt)$/.test(f) ? [x] : []; });
results.corpus = { pieces: walk(corpus).length, ...meanOf(walk(corpus).map((f) => measure(readFileSync(f, 'utf8')))) };

const name = 'guided-test';
// ── A. the guided build, folder and method ────────────────────────────────────────────────────────
room('A guided build', ALLOW.build);
const P = place('a');
const a = await guidedBuild(P, ['new', corpus, C.for, ...(method ? ['--method', method] : []), '--name', name, ...M]);
writeFileSync(join(out, 'A-guided-build.txt'), `${a.out}\n--- stderr ---\n${a.err}\n--- answered ---\n${JSON.stringify(a.asked, null, 1)}`);
results.steps.A = buildFacts(a); charge('A guided build (allowance)', ALLOW.build, false);
writeFileSync(join(out, 'A-skill-page.txt'), at(P, ['status', '--skill', name]).out);
if (a.code !== 0 || !results.steps.A.ready) { console.error('A: the guided build did not end ready: see A-guided-build.txt'); finish(1); }

// ── B. the guided build, folder alone ────────────────────────────────────────────────────────────
if (method && !skip.has('folder')) { room('B folder-only build', ALLOW.build); const Q = place('b');
  const b = await guidedBuild(Q, ['new', corpus, C.for, '--name', name, ...M]);
  writeFileSync(join(out, 'B-folder-only-build.txt'), `${b.out}\n--- stderr ---\n${b.err}`); results.steps.B = buildFacts(b); charge('B folder-only build (allowance)', ALLOW.build, false); }

// ── C, D, E. three arms on the same three requests ───────────────────────────────────────────────
const run = (label, i, extra = {}) => { room(`${label} request ${i}`); const r = C.requests[i];
  const x = at(P, ['invoke', '--skill', name, r.task, '--json', '--no-questions', ...M, ...(r.with ?? []).flatMap((w) => { const [n, f] = w.includes('=') ? w.split('=') : [null, w]; return ['--with', n ? `${n}=${resolve(caseDir, f)}` : resolve(caseDir, f)]; })], extra);
  const j = jsonOf(x.out); const piece = j?.answer ?? j?.output ?? ''; writeFileSync(join(out, `${label}-${i}.md`), piece || `(no piece)\n${x.err}`);
  charge(`${label} request ${i}`, Number(j?.costUsd ?? 0), true); return { piece, err: x.err, record: j?.direct ?? null }; };
const arm = (label, extra) => { const rs = [1, 2, 3].map((i) => run(label, i, extra)); const ps = rs.map((r) => r.piece);
  results.arms[label] = { pieces: ps.filter(Boolean).length, ...meanOf(ps.filter(Boolean).map(measure)), lengthGuideTold: rs.filter((r) => r.record?.lengthGuide).length, declinedAskedAgain: rs.filter((r) => /declined/.test(r.err)).length, failed: rs.filter((r) => !r.piece).map((r) => r.err.split('\n')[0].slice(0, 160)) }; return ps; };
const base = arm('base', {});
const carded = at(P, ['amend', '--skill', name, '--card', `kind=${C.card.kind}; reader=${C.card.reader}; purpose=${C.card.purpose}`]); writeFileSync(join(out, 'D-card.txt'), carded.out + carded.err);
const card = arm('card', { ATELIER_CARD_TO_WRITER: '1' });
const first = run('kept-source', 0).piece; let kept = [];
if (first) { const k = at(P, ['keep', '--skill', name]); writeFileSync(join(out, 'E-keep.txt'), k.out + k.err); kept = arm('kept', {}); }
const key = {};
const pair = (tag, y, yName) => base.forEach((x, i) => { if (!x || !y[i]) return; const flip = Math.random() < 0.5; const id = `${tag}-${i + 1}`;
  writeFileSync(join(out, 'blind', `${id}-A.md`), flip ? y[i] : x); writeFileSync(join(out, 'blind', `${id}-B.md`), flip ? x : y[i]); key[id] = { A: flip ? yName : 'base', B: flip ? 'base' : yName, request: C.requests[i + 1].task }; });
pair('pair-x', card, 'card'); pair('pair-y', kept, 'kept'); writeFileSync(join(out, 'blind', 'key.json'), JSON.stringify(key, null, 1));

// ── F. a lasting correction ──────────────────────────────────────────────────────────────────────
if (C.always) { room('F lasting fix', ALLOW.fix);
  const f1 = at(P, ['fix', C.always, '--always', ...M]); const proposed = /A rule that would cover it/.test(f1.out);
  const f2 = proposed ? at(P, ['fix', C.always, '--always', '--add', 'preferred', ...M]) : null;
  const page = at(P, ['status', '--skill', name]); const undo = /atelier rollback --skill \S+ --to (\S+)/.exec(page.out)?.[1]; const back = undo ? at(P, ['rollback', '--skill', name, '--to', undo]) : null;
  writeFileSync(join(out, 'F-lasting-fix.txt'), [f1.out, f1.err, '--- add ---', f2 ? f2.out + f2.err : '(no rule was proposed)', '--- page ---', page.out, '--- undo ---', back ? back.out + back.err : '(no undo line on the page)'].join('\n'));
  results.steps.F = { said: f1.out.split('\n').find((l) => /already say this|no rule for this yet|could not tell/.test(l)) ?? '(none of the three answers)', ruleProposed: proposed, added: Boolean(f2 && /Added: every piece/.test(f2.out)), onPage: page.out.includes(C.always.slice(0, 40)), undoWorked: Boolean(back && back.code === 0) };
  charge('F lasting fix (allowance)', ALLOW.fix, false); }

// ── G. the rules route, to its review screen ──────────────────────────────────────────────────────
if (!skip.has('rules')) { room('G rules route', ALLOW.rules); const R = place('g');
  const g = at(R, ['new', corpus, C.for, '--rules', '--name', `${name}-rules`, '--cap', String(ALLOW.rules), ...M]);
  writeFileSync(join(out, 'G-rules-route.txt'), `${g.out}\n--- stderr ---\n${g.err}`);
  results.steps.G = { exit: g.code, seconds: g.seconds, reachedReview: /Nothing was decided|atelier new .* --accept|p\d+\b/.test(g.out), callBoundHit: /call budget exhausted/.test(g.out + g.err), declinedRetried: /declined the request/.test(g.out), rulesProposed: (g.out.match(/^\s*p\d+\b/gm) ?? []).length };
  charge('G rules route (allowance; the run prints its own spend)', ALLOW.rules, false); }
finish(0);
