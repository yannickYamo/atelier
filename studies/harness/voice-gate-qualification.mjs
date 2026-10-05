// studies/harness/voice-gate-qualification.mjs — DOES THE VOICE INTEGRITY GATE REFUSE A REWRITE THAT CHANGED A CLAIM?
//
// Sealed by studies/VOICE_GATE_PREREGISTRATION.md. The condition decision 0009 set before any voice model is
// considered: the gate "qualified against planted changes". Three gates are read on the same material:
//   lists            the gate as shipped in 1.1: fact ledger, strength word lists, length (dist/core/voice/integrity.js)
//   listsAndReader   the same, with the small model's second read, which can only refuse (dist/core/voice/reader.js)
//   ledgerAndReader  the fact ledger and length in code, and the reader IN PLACE OF the strength word lists
//
//   clean     a pair from the skill's own bank: the plain paragraph, and the author's paragraph with the same facts.
//             A refusal is a false positive: a paragraph of voice lost, never a fact.
//   planted   the author's paragraph with ONE change of a known kind, made by a writer model that must return the
//             words it changed; code checks they are there. Letting it through is a false negative: a changed claim
//             delivered in the author's voice.
//
//   node studies/harness/voice-gate-qualification.mjs --bank <bank.json> --out <dir> [--cap 4] [--writer claude-sonnet-5-5] [--reader claude-haiku-4-5]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spend } from '../../dist/core/inference/client.js';
import { voiceIntegrity, LENGTH_RATIO } from '../../dist/core/voice/integrity.js';
import { readClaimChanges, VOICE_READER_VERSION } from '../../dist/core/voice/reader.js';
import { wordsOf } from '../../dist/core/observers/text.js';
import { clopperPearson } from '../../dist/core/stats/sign-test.js';
import { arg, fail, clientFor, budgetOf } from './study-client.mjs';

const SEALED_READER_VERSION = 'voice-gate-1';
if (VOICE_READER_VERSION !== SEALED_READER_VERSION) fail(`the voice reader is ${VOICE_READER_VERSION}; the pre-registration sealed ${SEALED_READER_VERSION}.`);
const SEED = 'voice-gate-2026-10-04';
const PLANTED_PARAGRAPHS = 60;
const MIN_PER_KIND = 30;
const KINDS = {
  FACT_CHANGED: 'change ONE figure, date or name to a different one',
  FACT_ADDED: 'add ONE short specific claim the paragraph does not make (a figure, a named example or a cause), in a clause of at most twelve words',
  FACT_DROPPED: 'remove ONE fact, figure or condition the paragraph states, leaving the sentence grammatical',
  STRONGER: 'make ONE claim stronger or more certain than the paragraph has it (remove a hedge, turn "some" into "all", "may" into "will", "often" into "always")',
  WEAKER: 'make ONE claim weaker or less certain than the paragraph has it (add a hedge, turn "all" into "some", "is" into "may be")',
  NEGATED: 'turn ONE claim into its opposite (add or remove a negation, or swap a word for its opposite)',
};
const BANK = JSON.parse(readFileSync(arg('--bank') ?? fail('missing --bank'), 'utf8'));
const OUT = arg('--out') ?? fail('missing --out');
mkdirSync(OUT, { recursive: true });
const budget = budgetOf(Number(arg('--cap', '4')), 2000);
const writer = clientFor(arg('--writer', 'claude-sonnet-5'));
// PLANTS A PERSON REJECTED (`--rejected <file>`, one "<pair id>|<KIND>" a line): a plant that is not the kind it
// declares, or changes nothing a reader would call a claim, is left out. The run writes plants-for-review.md first.
const REJECTED = new Set(arg('--rejected') && existsSync(arg('--rejected')) ? readFileSync(arg('--rejected'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : []); const reader = clientFor(arg('--reader', 'claude-haiku-4-5'));
const CACHE = join(OUT, 'cache.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const save = () => writeFileSync(CACHE, JSON.stringify(cache, null, 1));
const h = (s) => createHash('sha256').update(s).digest('hex');
const flat = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

const PLANT_SYSTEM = 'You make ONE small change to a paragraph, for a test of a checker. Change nothing else: keep every other word, the order and the length. Return the changed paragraph, and the exact words you changed, added or removed (for a removal, the words as they stood in the original).';
const SCHEMA = { type: 'object', properties: { paragraph: { type: 'string' }, words: { type: 'string' } }, required: ['paragraph', 'words'], additionalProperties: false };
async function plant(pair, kind) {
  const key = `plant|${pair.id}|${kind}`;
  if (cache[key]) return cache[key];
  let o;
  try {
    const x = await spend(budget, 0.03, async () => {
      const r = await writer.complete({ stableBlock: PLANT_SYSTEM, variableBlock: '', userMessage: `The change to make: ${KINDS[kind]}.\n\n<paragraph>\n${pair.author}\n</paragraph>`,
        toolName: 'emit_plant', toolDescription: 'Return the changed paragraph and the words changed.', schema: SCHEMA, maxTokens: 900, temperature: 0.7 });
      return { value: r.json, cost: r.cost };
    });
    const text = typeof x?.paragraph === 'string' ? x.paragraph.replace(/\s*\n+\s*/g, ' ').trim() : ''; const words = typeof x?.words === 'string' ? x.words.trim() : '';
    const ratio = wordsOf(text).length / Math.max(1, wordsOf(pair.neutral).length);
    // VALID only when the change is where the planter says it is, and the length gate would not refuse it for its own
    // reason. A change is made by adding words or by removing them, whatever its kind (a claim is made STRONGER by
    // taking a hedge out): the words are either new in the plant, or were in the paragraph and are gone.
    const added = flat(text).includes(flat(words)) && !flat(pair.author).includes(flat(words));
    const removed = flat(pair.author).includes(flat(words)) && !flat(text).includes(flat(words));
    const there = kind === 'FACT_DROPPED' ? removed : kind === 'FACT_ADDED' ? added : added || removed;
    o = { text, words, valid: Boolean(text) && words.length > 1 && flat(text) !== flat(pair.author) && there && ratio >= LENGTH_RATIO[0] && ratio <= LENGTH_RATIO[1] };
  } catch (e) { o = { failed: String(e.message).split('\n')[0] }; if (/budget|cap/i.test(o.failed)) { console.error(`stopped at the cap: ${o.failed}`); return o; } }
  cache[key] = o; save();
  return o;
}
async function read(content, voice) {
  const key = `read|${h(content + '\u0000' + voice).slice(0, 20)}`;
  if (cache[key]) return cache[key];
  const lists = voiceIntegrity(content, voice, null);
  const ledger = voiceIntegrity(content, voice, null, { strength: false });
  const changes = await readClaimChanges(reader, budget, content, voice);
  const o = { lists: lists.ok ? null : lists.check, ledger: ledger.ok ? null : ledger.check, reader: changes === null ? 'unread' : changes.map((c) => `${c.kind}: ${c.quote}`) };
  cache[key] = o; save();
  return o;
}
const refusedByLists = (r) => r.lists !== null;
const found = (r) => Array.isArray(r.reader) && r.reader.length > 0;
const refusedByBoth = (r) => r.lists !== null || found(r);
const refusedByLedgerAndReader = (r) => r.ledger !== null || found(r);
const rate = (k, n) => { const ci = clopperPearson(k, n); return { k, n, share: n ? Math.round((k / n) * 1000) / 1000 : null, ci95: [Math.round(ci.lo * 1000) / 1000, Math.round(ci.hi * 1000) / 1000] }; };

const pairs = [...BANK.pairs].sort((a, b) => h(`${SEED}|${a.id}`).localeCompare(h(`${SEED}|${b.id}`)));
const rows = { clean: [], planted: [] };
// A CLEAN PAIR A PERSON DISPUTED (`<pair id>|CLEAN` in --rejected): its plain side truly differs in a claim from the
// author's, so a gate that refuses it is right. Such a pair is reported apart and never counted against specificity.
for (const p of pairs) rows.clean.push({ id: p.id, plain: p.neutral, author: p.author, ...(REJECTED.has(`${p.id}|CLEAN`) ? { disputed: true } : {}), ...(await read(p.neutral, p.author)) });
for (const p of pairs.slice(0, PLANTED_PARAGRAPHS)) {
  for (const kind of Object.keys(KINDS)) {
    const pl = await plant(p, kind);
    if (REJECTED.has(`${p.id}|${kind}`)) { rows.planted.push({ id: p.id, kind, discarded: 'rejected by the person who reviewed the plants' }); continue; }
    if (!pl.valid) { rows.planted.push({ id: p.id, kind, discarded: pl.failed ?? 'the change was not where the planter said, or the length moved out of range' }); continue; }
    rows.planted.push({ id: p.id, kind, words: pl.words, text: pl.text, original: p.author, ...(await read(p.neutral, pl.text)) });
  }
}
const live = rows.planted.filter((r) => !r.discarded);
const by = (f) => ({ overall: rate(live.filter(f).length, live.length), ...Object.fromEntries(Object.keys(KINDS).map((k) => { const xs = live.filter((r) => r.kind === k); return [k, rate(xs.filter(f).length, xs.length)]; })) });
const cleanOk = rows.clean.filter((r) => !r.disputed);
const m = { planted: live.length, discarded: rows.planted.length - live.length, clean: cleanOk.length, disputedClean: rows.clean.length - cleanOk.length, unread: [...rows.clean, ...live].filter((r) => r.reader === 'unread').length,
  sensitivity: { lists: by(refusedByLists), listsAndReader: by(refusedByBoth), ledgerAndReader: by(refusedByLedgerAndReader) },
  specificity: Object.fromEntries([['lists', refusedByLists], ['listsAndReader', refusedByBoth], ['ledgerAndReader', refusedByLedgerAndReader]]
    .map(([name, f]) => [name, rate(cleanOk.filter((r) => !f(r)).length, cleanOk.length)])) };
// THE BARS, AS SEALED, read on each gate. A gate passes when it holds all four.
const barsOf = (name) => { const s = m.sensitivity[name]; return { sensitivity: s.overall.share >= 0.9 && s.overall.ci95[0] >= 0.8,
  everyKind: Object.keys(KINDS).every((k) => s[k].n >= MIN_PER_KIND && s[k].share >= 0.75), specificity: m.specificity[name].share >= 0.6,
  enough: live.length >= 200 && Object.keys(KINDS).every((k) => s[k].n >= MIN_PER_KIND), reviewed: REJECTED.size > 0 || process.argv.includes('--reviewed') }; };
const bars = { lists: barsOf('lists'), listsAndReader: barsOf('listsAndReader'), ledgerAndReader: barsOf('ledgerAndReader') };
const passes = (name) => Object.values(bars[name]).every(Boolean);
const result = { reader: VOICE_READER_VERSION, bank: BANK.hash, measures: m, bars, verdict: Object.fromEntries(Object.keys(bars).map((n) => [n, passes(n) ? 'PASS' : 'FAIL'])), spentUsd: Math.round(budget.spentUsd * 1000) / 1000, rows };
writeFileSync(join(OUT, 'voice-gate.json'), JSON.stringify(result, null, 1));
// FOR THE PERSON WHO CONFIRMS THE PLANTS: each one, its declared kind, the words changed, before and after.
writeFileSync(join(OUT, 'plants-for-review.md'), `# Plants to confirm\n\nFor each, check that the change is the kind it declares and changes what is claimed. List the ones that are not in a file, one "<pair id>|<KIND>" a line, and run again with --rejected <file> (or --reviewed when none is rejected).\n\n${live.map((r) => `## ${r.id}|${r.kind}\n\nwords: ${r.words}\n\nbefore: ${r.original}\n\nafter: ${r.text}\n`).join('\n')}\n# Clean pairs to confirm\n\nFor each, check that the plain paragraph and the author's make the same claims. No gate's verdict is shown here on purpose. List a pair that truly differs as "<pair id>|CLEAN".\n\n${rows.clean.map((r) => `## ${r.id}|CLEAN\n\nplain: ${r.plain}\n\nauthor: ${r.author}\n`).join('\n')}`);
console.log(JSON.stringify({ measures: m, bars, verdict: result.verdict, spentUsd: result.spentUsd }, null, 1));
