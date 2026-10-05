// studies/harness/subject-reader-qualification.mjs — DOES A SMALL MODEL FIND AN AUTHOR'S PIECES ON A REQUEST'S SUBJECT,
// AND THE DOCUMENT A REQUEST NAMES, BETTER THAN WORD MATCHING, AND THE SAME WAY TWICE?
//
// Sealed by studies/SUBJECT_READER_PREREGISTRATION.md. Reads the plan of the indistinguishability study (each
// corpus's read and held-out pieces). The reader is the product's own (dist/core/fidelity/subject-reader.js,
// dist/core/loop/context-judge.js); its version is checked against the sealed one and a mismatch stops the run.
//
//   node studies/harness/subject-reader-qualification.mjs --plan <plan.json> --out <dir> [--cap 2] [--reader claude-haiku-4-5]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { buildRetrievalIndex } from '../../dist/core/fidelity/retrieval.js';
import { lexicalNearness, readerNearness, piecesOf } from '../../dist/core/fidelity/nearness.js';
import { readSubjectCards, gradeSubjects, SUBJECT_READER_VERSION } from '../../dist/core/fidelity/subject-reader.js';
import { modelJudge } from '../../dist/core/loop/context-judge.js';
import { decideRegister } from '../../dist/core/voice/register.js';
import { clopperPearson } from '../../dist/core/stats/sign-test.js';
import { arg, fail, clientFor, budgetOf, kappa } from './study-client.mjs';

const SEALED_READER_VERSION = 'subject-1';
if (SUBJECT_READER_VERSION !== SEALED_READER_VERSION) fail(`the subject reader is ${SUBJECT_READER_VERSION}; the pre-registration sealed ${SEALED_READER_VERSION}.`);
const PLAN = JSON.parse(readFileSync(arg('--plan') ?? fail('missing --plan'), 'utf8'));
const OUT = arg('--out') ?? fail('missing --out');
const READER = arg('--reader', 'claude-haiku-4-5');
const SETS = JSON.parse(readFileSync(new URL('./subject-reader-sets.json', import.meta.url), 'utf8'));
mkdirSync(OUT, { recursive: true });
const budget = budgetOf(Number(arg('--cap', '2')), 600);
const client = clientFor(READER);
const titleOf = (text, file) => { const first = text.replace(/^﻿/, '').split('\n').find((l) => l.trim()) ?? ''; return (/^#\s+(.+)$/.exec(first.trim())?.[1] ?? basename(file).replace(/\.md$/, '').replace(/-/g, ' ')).trim(); };
const request = (title, words) => `Write a blog post titled "${title}". About ${words} words.`;
const rate = (k, n) => ({ k, n, share: n ? Math.round((k / n) * 1000) / 1000 : null, ci95: n ? (({ lo, hi }) => [Math.round(lo * 1000) / 1000, Math.round(hi * 1000) / 1000])(clopperPearson(k, n)) : null });

const result = { reader: `${SEALED_READER_VERSION}:${READER}`, corpora: [], register: null };
// A GRADING THAT FAILED IS COUNTED, NEVER SKIPPED: a reader that answers half the time is not a reader that passed.
let attempted = 0; let failed = 0;
const pooled = { knownR: [0, 0], knownL: [0, 0], coverR: [0, 0], coverL: [0, 0], farR: [0, 0], farL: [0, 0], first: [], second: [], nearShare: [] };
for (const c of PLAN.corpora) {
  // The title line is removed before the index is built: a card must be read from the body, never from the title.
  const read = c.read.map((f) => { const text = readFileSync(f, 'utf8'); return { id: basename(f), title: titleOf(text, f), text: text.replace(/^﻿?\s*#\s+.+\n/, '') }; });
  const index = buildRetrievalIndex(read);
  const cards = await readSubjectCards(client, budget, index, READER);
  const ids = piecesOf(index);
  if (cards.cards.length < ids.length) console.error(`${c.name}: ${ids.length - cards.cards.length} piece(s) got no card`);
  const grade = async (req) => {
    attempted += 1;
    const a = await gradeSubjects(client, budget, req, cards); const b = await gradeSubjects(client, budget, req, cards);
    if (!a || !b) { failed += 1; return null; }
    for (const id of ids) { pooled.first.push(a.has(id)); pooled.second.push(b.has(id)); }
    return readerNearness(index, a, result.reader, cards.hash);
  };
  const row = { name: c.name, pieces: ids.length, cards: cards.cards.length, known: [], unseen: [], far: [] };
  // KNOWN ITEM: the request is a read piece's own title; that piece must be near.
  for (const p of read.filter((x) => ids.includes(x.id))) {
    const req = request(p.title, c.briefWords); const r = await grade(req); const l = lexicalNearness(index, req);
    if (!r) { row.known.push({ piece: p.id, failed: true }); continue; }
    const hitR = r.pieces.some((x) => x.id === p.id && x.grade === 'same'); const hitL = l.pieces.some((x) => x.id === p.id);
    pooled.knownR[0] += hitR ? 1 : 0; pooled.knownR[1] += 1; pooled.knownL[0] += hitL ? 1 : 0; pooled.knownL[1] += 1;
    pooled.nearShare.push(r.pieces.length / ids.length);
    row.known.push({ piece: p.id, reader: hitR, lexical: hitL, readerNear: r.pieces.length, lexicalNear: l.pieces.length });
  }
  // COVERAGE: the study's own requests (titles of pieces the skill never read): is the request near two pieces or more?
  for (const f of c.heldOut) {
    const req = request(titleOf(readFileSync(f, 'utf8'), f), c.briefWords); const r = await grade(req); const l = lexicalNearness(index, req);
    if (!r) { row.unseen.push({ piece: basename(f), failed: true }); continue; }
    pooled.coverR[0] += r.thin ? 0 : 1; pooled.coverR[1] += 1; pooled.coverL[0] += l.thin ? 0 : 1; pooled.coverL[1] += 1;
    row.unseen.push({ piece: basename(f), reader: r.pieces.map((x) => `${x.id}:${x.grade}`), lexical: l.pieces.map((x) => x.id) });
  }
  // FAR: requests on subjects the corpus does not hold. No piece should be graded `same`.
  for (const t of SETS.far) {
    const req = request(t, c.briefWords); const r = await grade(req); const l = lexicalNearness(index, req);
    if (!r) { row.far.push({ title: t, failed: true }); continue; }
    const same = r.pieces.filter((x) => x.grade === 'same').length;
    pooled.farR[0] += same; pooled.farR[1] += ids.length; pooled.farL[0] += l.pieces.length; pooled.farL[1] += ids.length;
    row.far.push({ title: t, readerSame: same, readerRelated: r.pieces.length - same, lexical: l.pieces.length });
  }
  result.corpora.push(row);
  console.log(`${c.name}: ${row.known.length} known-item, ${row.unseen.length} unseen, ${row.far.length} far requests read; $${budget.spentUsd.toFixed(3)} spent`);
}

// THE REGISTER A REQUEST NAMES: the judge's quoted reading against the word table, on the sealed labelled set.
const judge = modelJudge(client, budget);
const reg = { reader: 0, table: 0, n: 0, rows: [] };
for (const q of SETS.register) {
  const intent = await judge.requestIntent(q.request);
  const byReader = intent ? decideRegister(['post'], q.request, undefined, null, intent.document).request : undefined;
  const byTable = decideRegister(['post'], q.request, undefined).request;
  attempted += 1;
  if (byReader === undefined) { failed += 1; reg.rows.push({ ...q, failed: true }); continue; }
  reg.n += 1; reg.reader += byReader === q.register ? 1 : 0; reg.table += byTable === q.register ? 1 : 0;
  reg.rows.push({ ...q, reader: byReader, table: byTable });
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const m = { knownItem: { reader: rate(...pooled.knownR), lexical: rate(...pooled.knownL) }, coverage: { reader: rate(...pooled.coverR), lexical: rate(...pooled.coverL) },
  falseNear: { reader: rate(...pooled.farR), lexical: rate(...pooled.farL) }, selectivity: { medianShareNear: median(pooled.nearShare) },
  repeat: { kappa: kappa(pooled.first, pooled.second), pairs: pooled.first.length }, register: { reader: rate(reg.reader, reg.n), table: rate(reg.table, reg.n) } };
// THE BARS, AS SEALED. A share that could not be computed (nothing was read) holds no bar: `null <= 0.05` is true
// in JavaScript, and a reader that read nothing would have passed the false-near bar.
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const bars = {
  knownItem: num(m.knownItem.reader.share) && num(m.knownItem.lexical.share) && m.knownItem.reader.share >= 0.8 && m.knownItem.reader.share >= m.knownItem.lexical.share,
  selectivity: num(m.selectivity.medianShareNear) && m.selectivity.medianShareNear <= 1 / 3,
  coverage: num(m.coverage.reader.share) && num(m.coverage.lexical.share) && m.coverage.reader.share >= 0.8 && m.coverage.reader.share > m.coverage.lexical.share,
  falseNear: num(m.falseNear.reader.share) && m.falseNear.reader.share <= 0.05,
  repeat: num(m.repeat.kappa) && m.repeat.kappa >= 0.8,
  register: num(m.register.reader.share) && num(m.register.table.share) && m.register.reader.share >= 0.9 && m.register.reader.share >= m.register.table.share,
};
// MORE THAN ONE READING IN TWENTY FAILED: the study is UNRESOLVED, whatever the bars say of what did come back.
const complete = attempted > 0 && failed / attempted <= 0.05;
result.register = reg.rows; result.measures = m; result.bars = bars;
result.readings = { attempted, failed };
result.verdict = !complete ? { subject: 'UNRESOLVED', register: 'UNRESOLVED', why: `${failed} of ${attempted} readings failed` }
  : { subject: bars.knownItem && bars.selectivity && bars.coverage && bars.falseNear && bars.repeat ? 'PASS' : 'FAIL', register: bars.register ? 'PASS' : 'FAIL' };
result.spentUsd = Math.round(budget.spentUsd * 1000) / 1000;
writeFileSync(join(OUT, 'subject-reader.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ measures: m, bars, verdict: result.verdict, spentUsd: result.spentUsd }, null, 1));
