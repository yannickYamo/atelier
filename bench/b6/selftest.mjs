#!/usr/bin/env node
// bench/b6/selftest.mjs — EVERY REFUSAL OF THE B6 HARNESS, FIRED ON PURPOSE, OFFLINE.
//
// A real B6 run once produced results that should not have been possible: texts not hashed, the evaluator
// model equal to the writer, a score from one reader, and a detector with a cross-validated AUC of 0.44
// deciding a bar. Each of those is now refused by run.mjs; this builds a synthetic corpus and fake outputs
// in a temporary directory (no model call, no key) and checks that every refusal fires, and that a design
// that is the pre-registered one is scored.
//
//   node bench/b6/selftest.mjs        exit 0 when every check holds, 1 otherwise. Needs `npm run build`.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';

const RUN = resolve(new URL('./run.mjs', import.meta.url).pathname);
const root = mkdtempSync(join(tmpdir(), 'b6-selftest-'));
const corpora = join(root, 'corpora'); const work = join(root, 'work');
const WRITER = 'writer-test-1'; const EVALUATOR = 'evaluator-test-2';

// ── a seeded synthetic corpus: an author who writes plainly, a model that does not ─────────────────────
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const TOPICS = ['gardening', 'cycling', 'hiring', 'pricing', 'onboarding', 'cooking', 'deadlines', 'meetings', 'travel', 'debugging', 'writing', 'budgets'];
const AUTHOR = [
  "I've been thinking about {t} for a while now.", "Honestly, I don't know if it's worth it.", 'But I keep coming back to it.',
  "It's not that hard, really.", "We tried it last year and it just didn't stick.", "I'm still not sure why.", "Maybe that's the point.",
  "So here's what I'd do.", "Don't overthink it.", "You'll get there.", "I'd start small with {t}.", "That's it, really.",
  "My friend says I'm wrong about {t}.", "She's probably right.", "I just like doing it my way.", "It's cheap and it works.",
];
const MODEL = [
  'Furthermore, {t} is an important consideration for any organization.', 'It is essential to understand the implications of this approach.',
  'Moreover, the benefits of {t} are numerous and significant.', 'In addition, stakeholders should consider the following factors.',
  'Therefore, a comprehensive strategy is required.', 'This ensures that outcomes are aligned with objectives.',
  'Additionally, it is important to note that challenges may arise.', 'Consequently, organizations must adapt their processes accordingly.',
  'In conclusion, {t} represents a valuable opportunity.', 'Overall, the approach provides a robust framework for success.',
  'Such considerations are frequently overlooked by practitioners.', 'Thus, careful planning remains paramount throughout the process.',
];
function piece(bank, topic, seed, title) {
  const r = rng(seed);
  const paras = Array.from({ length: 4 }, () => Array.from({ length: 6 }, () => bank[Math.floor(r() * bank.length)].replace('{t}', topic)).join(' '));
  return `# ${title}\n\n${paras.join('\n\n')}\n`;
}

// ── the checks ─────────────────────────────────────────────────────────────────────────────────────────
let failed = 0; let passed = 0;
const check = (name, ok, detail = '') => { if (ok) { passed += 1; console.log(`ok    ${name}`); } else { failed += 1; console.log(`FAIL  ${name}${detail ? `\n      ${detail.split('\n').slice(0, 6).join('\n      ')}` : ''}`); } };
const baseEnv = () => { const e = { ...process.env, B6_MODEL: WRITER, B6_EVAL_MODEL: EVALUATOR }; for (const k of ['B6_PRICE_IN', 'B6_PRICE_OUT', 'B6_EVAL_PRICE_IN', 'B6_EVAL_PRICE_OUT', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']) delete e[k]; return e; };
const run = (argv, env = {}) => spawnSync(process.execPath, [RUN, ...argv, '--work', work], { encoding: 'utf8', env: { ...baseEnv(), ...env } });
const refuses = (name, res, re) => check(`refuses: ${name}`, res.status === 2 && re.test(res.stderr), `exit ${res.status}; stderr: ${res.stderr.trim()}`);
const succeeds = (name, res) => { check(name, res.status === 0, `exit ${res.status}; stderr: ${res.stderr.trim()}`); return res; };
const keep = (file) => { const t = readFileSync(file); return () => writeFileSync(file, t); };

try {
  const reg = 'blog'; mkdirSync(join(corpora, reg), { recursive: true });
  TOPICS.forEach((t, i) => writeFileSync(join(corpora, reg, `piece-${String(i).padStart(2, '0')}.md`), piece(AUTHOR, t, 100 + i, `On ${t}`)));
  succeeds('prepare seals a split and hashes every text', spawnSync(process.execPath, [RUN, 'prepare', '--corpora', corpora, '--work', work, '--test', '4', '--validation', '4'], { encoding: 'utf8', env: baseEnv() }));
  const plan = JSON.parse(readFileSync(join(work, 'plan.json'), 'utf8')); const r = plan.registers[reg];
  check('plan.json records a sha256 for every validation, test and training text', Object.keys(r.sha256).length === 12
    && [...r.validation, ...r.test].every((f) => r.sha256[`texts/${f}`]?.length === 64) && r.train.every((f) => r.sha256[`train/${f}`]?.length === 64));
  refuses('prepare again over a sealed plan', spawnSync(process.execPath, [RUN, 'prepare', '--corpora', corpora, '--work', work], { encoding: 'utf8', env: baseEnv() }), /a sealed split is never redrawn/);

  // fake outputs: the evaluator's negatives by another model, the arms by the writer; the loop close to the author
  const out = (split, arm, f, text, model) => {
    const p = join(work, reg, 'out', split, arm, `${basename(f, '.md')}.0.md`); mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, text); writeFileSync(`${p}.json`, JSON.stringify({ reg, piece: f, arm, repeat: 0, costUsd: 0, model }));
  };
  const topicOf = (f) => TOPICS[Number(/(\d+)/.exec(f)[1])];
  r.validation.forEach((f, i) => out('validation', 'evalgen', f, piece(MODEL, topicOf(f), 500 + i, `On ${topicOf(f)}`), EVALUATOR));
  r.test.forEach((f, i) => {
    for (const [k, arm] of ['plain', 'pasted', 'open'].entries()) out('test', arm, f, piece(MODEL, topicOf(f), 600 + 10 * i + k, `On ${topicOf(f)}`), WRITER);
    out('test', 'loop', f, piece(AUTHOR, topicOf(f), 700 + i, `On ${topicOf(f)}`), WRITER);
  });

  // ── evaluate: a detector that separates decides its bar; one that does not decides nothing ───────────
  succeeds('evaluate runs offline', run(['evaluate']));
  let res = JSON.parse(readFileSync(join(work, 'results.json'), 'utf8')).registers[reg];
  check('a separating evaluator detector (cvAuc >= 0.65) decides the detector bar', res.evaluatorDetector?.cvAuc >= 0.65 && typeof res.bars.detector === 'boolean',
    JSON.stringify({ det: res.evaluatorDetector, bar: res.bars.detector }));
  check('grounded fact coverage is reported per arm beside the author\'s density', ['plain', 'pasted', 'open', 'loop'].every((a) => res.arms[a] && 'per100' in res.arms[a].factCoverage && 'authorPer100' in res.arms[a].factCoverage));
  const evalFiles = r.validation.map((f) => join(work, reg, 'out', 'validation', 'evalgen', `${basename(f, '.md')}.0.md`));
  const restoreEval = evalFiles.map(keep);
  // imitations that ARE the author's validation pieces: nothing to separate
  r.validation.forEach((f, i) => writeFileSync(evalFiles[i], readFileSync(join(work, reg, 'texts', f))));
  succeeds('evaluate runs with a detector that cannot separate', run(['evaluate']));
  res = JSON.parse(readFileSync(join(work, 'results.json'), 'utf8')).registers[reg];
  check('low cvAuc: the detector bar is null, never a pass, and results.json says why', res.bars.detector === null && res.bars.all === false
    && /never a pass/.test(res.barNotes?.detector ?? '') && (res.evaluatorDetector === null || res.evaluatorDetector.usable === false),
  JSON.stringify({ det: res.evaluatorDetector, bar: res.bars.detector, note: res.barNotes }));
  restoreEval.forEach((f) => f());

  // ── the evaluator is never the writer ───────────────────────────────────────────────────────────────
  refuses('generate with B6_EVAL_MODEL equal to B6_MODEL', run(['generate', '--split', 'test'], { B6_EVAL_MODEL: WRITER }), /same model/);
  refuses('generate with one model id a prefix alias of the other, any case', run(['generate', '--split', 'validation'], { B6_MODEL: 'claude-x-5', B6_EVAL_MODEL: 'Claude-X-5-20260101' }), /same model/);
  refuses('evaluate with B6_EVAL_MODEL equal to B6_MODEL', run(['evaluate'], { B6_EVAL_MODEL: WRITER.toUpperCase() }), /same model/);
  const meta0 = `${evalFiles[0]}.json`; const restoreMeta = keep(meta0);
  writeFileSync(meta0, JSON.stringify({ model: WRITER }));
  refuses('evaluate when the recorded evaluator outputs were written by the writer', run(['evaluate']), /the same model/);
  restoreMeta();

  // ── no price, no start ──────────────────────────────────────────────────────────────────────────────
  refuses('generate with an unpriced writer and no B6_PRICE_IN/B6_PRICE_OUT', run(['generate', '--split', 'test']), /has no price/);
  refuses('build with an unpriced writer', run(['build']), /has no price/);
  refuses('half a price', run(['generate', '--split', 'test'], { B6_PRICE_IN: '5' }), /go together/);
  refuses('an unpriced evaluator model on the validation split', run(['generate', '--split', 'validation'], { B6_PRICE_IN: '5', B6_PRICE_OUT: '25' }), /B6_EVAL_MODEL\) has no price/);

  // ── shards partition the work list; --briefs narrows it ─────────────────────────────────────────────
  const items = (res_) => res_.stdout.split('\n').filter((l) => l.startsWith(`${reg}/`)).map((l) => l.replace(/ \(done\)$/, ''));
  const all = items(succeeds('generate --dry-run lists the work list', run(['generate', '--split', 'test', '--repeats', '3', '--dry-run'])));
  const shards = [1, 2, 3].map((k) => items(run(['generate', '--split', 'test', '--repeats', '3', '--dry-run', '--shard', `${k}/3`])));
  const union = shards.flat();
  check('--shard k/n: disjoint shards that cover the work list exactly once', all.length === 48 && union.length === all.length && new Set(union).size === all.length && all.every((x) => union.includes(x)), `${all.length} vs ${union.length}`);
  const one = items(run(['generate', '--split', 'test', '--dry-run', '--briefs', basename(r.test[0], '.md')]));
  check('--briefs narrows the work list to the named pieces', one.length === 4 && one.every((x) => x.includes(`/${basename(r.test[0], '.md')}.`)), one.join(', '));
  refuses('--shard out of range', run(['generate', '--split', 'test', '--dry-run', '--shard', '4/3']), /--shard must be k\/n/);
  refuses('--briefs naming a piece outside the split', run(['generate', '--split', 'test', '--dry-run', '--briefs', 'no-such-piece']), /not in the test split/);

  // ── a text changed after prepare ────────────────────────────────────────────────────────────────────
  const tampered = join(work, reg, 'texts', r.test[0]); const restoreText = keep(tampered);
  writeFileSync(tampered, `${readFileSync(tampered, 'utf8')}\nOne more line.\n`);
  for (const step of [['evaluate'], ['blind', '--readers', 'r1,r2,r3'], ['generate', '--split', 'test', '--dry-run']]) {
    refuses(`${step[0]} on a tampered test text, naming it`, run(step), new RegExp(`${reg}/texts/${r.test[0].replace('.', '\\.')} changed after prepare`));
  }
  restoreText();
  const gone = join(work, reg, 'train', r.train[0]); const restoreGone = keep(gone); unlinkSync(gone);
  refuses('evaluate with a training text missing', run(['evaluate']), new RegExp(`${reg}/train/${r.train[0].replace('.', '\\.')} is missing`));
  restoreGone();
  succeeds('evaluate again on the restored texts', run(['evaluate']));

  // ── blind: one packet per reader, orders balanced across readers ───────────────────────────────────
  refuses('blind without --readers', run(['blind']), /--readers r1,r2,r3 is required/);
  succeeds('blind --readers r1,r2,r3', run(['blind', '--readers', 'r1,r2,r3']));
  const keyFile = join(work, 'blind', 'KEY.json'); const key = JSON.parse(readFileSync(keyFile, 'utf8'));
  check('one packet and one labels file per reader, one KEY.json with register and brief per pair',
    ['r1', 'r2', 'r3'].every((x) => existsSync(join(work, 'blind', `packet-${x}.md`)) && existsSync(join(work, 'blind', `labels-${x}.csv`)))
    && key.pairs.length === 4 && key.pairs.every((x) => x.register === reg && r.test.includes(x.brief)));
  const loopA = key.pairs.map((x) => key.readers.filter((rd) => x.orders[rd].A === 'loop').length);
  check('each pair: the readers split between the two orders (1 or 2 of 3 see the loop as A)', loopA.every((n) => n === 1 || n === 2), loopA.join(','));
  const orderOf = (rd) => readFileSync(join(work, 'blind', `labels-${rd}.csv`), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')[0]).join(',');
  check('each reader has a reader-specific order of pairs', new Set(['r1', 'r2', 'r3'].map(orderOf)).size > 1);

  // every reader prefers the loop
  const fill = (rd, rows) => writeFileSync(join(work, 'blind', `labels-${rd}.csv`), `id,reader,choice\n${rows.join('\n')}\n`);
  const rowsFor = (rd) => key.pairs.map((x) => `${x.id},${rd},${x.orders[rd].A === 'loop' ? 'A' : 'B'}`);
  for (const rd of key.readers) fill(rd, rowsFor(rd));
  const labels = (...rds) => rds.map((rd) => join(work, 'blind', `labels-${rd}.csv`)).join(',');
  const scored = succeeds('score on the full design', run(['score', '--labels', labels('r1', 'r2', 'r3')]));
  const verdict = scored.status === 0 ? JSON.parse(scored.stdout) : null;
  check('score computes the decision: share 1, the bars from results.json, exploratory so it does not hold',
    verdict?.registers?.[reg]?.share === 1 && verdict.registers[reg].reads === 12 && verdict.registers[reg].countedBars !== null
    && verdict.registers[reg].exploratory === true && verdict.holds === false, scored.stdout.slice(0, 400));

  refuses('score with a reader missing', run(['score', '--labels', labels('r1', 'r2')]), /reader r3 has no judgments/);
  refuses('score with fewer readers than required', run(['score', '--labels', labels('r1', 'r2', 'r3'), '--readers-required', '4']), /needs 4 distinct readers/);
  fill('r1', [...rowsFor('r1'), rowsFor('r1')[0]]);
  refuses('score with a duplicate judgment', run(['score', '--labels', labels('r1', 'r2', 'r3')]), /reader r1 judged pair p[0-9a-f]+ more than once/);
  fill('r1', rowsFor('r1').slice(1));
  refuses('score with a pair left unjudged', run(['score', '--labels', labels('r1', 'r2', 'r3')]), /reader r1 has not judged 1 pair/);
  fill('r1', rowsFor('r1').map((l, i) => (i === 0 ? l.replace(/,[AB]$/, ',') : l)));
  refuses('score with an empty choice', run(['score', '--labels', labels('r1', 'r2', 'r3')]), /is not A or B/);
  fill('r1', rowsFor('r1').map((l, i) => (i === 0 ? l.replace(',r1,', ',r9,') : l)));
  refuses('score with an unknown reader id', run(['score', '--labels', labels('r1', 'r2', 'r3')]), /reader "r9" is not in KEY\.json/);
  fill('r1', rowsFor('r1'));
  const restoreKey = keep(keyFile);
  const unbalanced = { ...key, pairs: key.pairs.map((x, i) => (i ? x : { ...x, orders: Object.fromEntries(key.readers.map((rd) => [rd, { A: 'loop', B: key.against }])) })) };
  writeFileSync(keyFile, JSON.stringify(unbalanced, null, 1));
  refuses('score on unbalanced orders', run(['score', '--labels', labels('r1', 'r2', 'r3')]), /3 reader\(s\) see the loop as A and 0 as B; the orders must be balanced/);
  restoreKey();
  succeeds('score on the restored design', run(['score', '--labels', labels('r1', 'r2', 'r3')]));
} finally {
  if (!process.env.B6_SELFTEST_KEEP) rmSync(root, { recursive: true, force: true }); else console.log(`kept ${root}`);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
