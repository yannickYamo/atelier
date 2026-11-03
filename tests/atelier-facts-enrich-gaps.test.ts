// FACTS ONLY THIS SUBJECT HAS, A BOUNDED WEB PASS FOR THEM, AND ONE HONEST LINE WHERE PROOF IS MISSING.
// The inventory (core/loop/inventory.ts) keeps only facts whose quote is in the source it names; samples are marked.
// Enrichment (core/enrich/) asks a reading for searches and caps what it fetches; offline it finds nothing. Grounding
// accepts a specific found in an enriched document, marked enriched with its URL, and is unchanged without one. Gap
// lines (core/loop/gap-lines.ts) replace a load-bearing invented sentence with a plain line, only when asked.
import { describe, it, expect } from 'vitest';
import type { Budget, InferenceClient, InferenceRequest } from '../core/inference/client.js';
import { anInferenceResult } from './fixtures.js';
import { enrich, enrichWithRecord, ENRICH_QUERIES, NullEnricher, fetchPage, htmlToText, type Enricher } from '../core/enrich/enrich.js';
import { AnthropicSearchEnricher, hitsOf } from '../providers/anthropic-search.js';
import { FACT_INVENTORY, groundInventory, readInventory, renderInventory, quotedIn, type InventoryInput } from '../core/loop/inventory.js';
import { decideSpecifics, patternSensor, enrichedSourceOf, type ExtractedSpecific } from '../core/loop/claim-extract.js';
import { factLedger, factCoverage, enrichedLedger } from '../core/loop/fact-ledger.js';
import { groundCarried } from '../core/loop/grounding.js';
import { GAP_LINE_RULE, renderGapLineRule, gapLineProblem, standsAlone, GAP_LINES, planGapLines, withGapLine } from '../core/loop/gap-lines.js';
import { enforceClaims } from '../core/loop/run-repair.js';
import type { ClaimSensor, ClaimReading } from '../core/loop/claim-extract.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const budget = (): Budget => ({ spentUsd: 0, capUsd: 1 });
/** A model that answers every call with the next json, and records what it was asked. */
function scripted(...answers: unknown[]): InferenceClient & { seen: InferenceRequest[] } {
  const seen: InferenceRequest[] = [];
  return { seen, complete: (req) => { seen.push(req); return Promise.resolve(anInferenceResult({ json: answers[Math.min(seen.length - 1, answers.length - 1)] })); } };
}
const refusing: InferenceClient = { complete: () => Promise.reject(new Error('no model may be asked here')) };

// ── ENRICHMENT ──────────────────────────────────────────────────────────────────────────────────
describe('enrichment: a bounded web pass, offline by default', () => {
  it('the null enricher finds nothing, and with no model no search is asked', async () => {
    expect(await NullEnricher.search('anything')).toEqual([]);
    const searched: string[] = [];
    const spy: Enricher = { name: 'spy', search: (q) => { searched.push(q); return Promise.resolve([]); }, fetch: () => Promise.resolve(null) };
    const r = await enrichWithRecord('Write about our launch', 'notes', spy, null, budget());
    expect(r.docs).toEqual([]);
    expect(r.queries.by).toBe('floor');
    expect(searched).toEqual([]);
  });
  it('runs the queries the reading proposes, fetches the top results once each, and caps what it keeps', async () => {
    const client = scripted({ queries: ['ledger migration deadline 2026', '  ledger migration deadline 2026 ', 'x '.repeat(30), 'fee schedule'] });
    const searched: string[] = [];
    const enricher: Enricher = { name: 'fake', searchEstimateUsd: 0.01,
      search: (q) => { searched.push(q); return Promise.resolve([{ url: 'https://a.example/1', title: 'A' }, { url: 'https://b.example/2/', title: 'B' }, { url: 'https://c.example/3', title: 'C' }]); },
      fetch: (url) => Promise.resolve(url.includes('b.example') ? null : { url, title: `T ${url}`, text: 'y'.repeat(5000) }) };
    const b = budget();
    const r = await enrichWithRecord('Write about the ledger change', 'notes', enricher, client, b, { model: 'small', maxDocChars: 3000, maxTotalChars: 4000, now: () => '2026-11-02T00:00:00Z' });
    // the duplicate and the overlong query are dropped by code
    expect(searched).toEqual(['ledger migration deadline 2026', 'fee schedule']);
    // two per query, deduplicated across queries: a and b; b does not load
    expect(r.docs.map((d) => d.url)).toEqual(['https://a.example/1']);
    expect(r.docs[0]).toMatchObject({ title: 'T https://a.example/1', retrievedAt: '2026-11-02T00:00:00Z' });
    expect(r.docs[0].text).toHaveLength(3000);
    expect(r.notes).toEqual(['https://b.example/2/ could not be read']);
    // the reading's call (estimate 0.005, billed 0) and two searches held at 0.01 each, billed at their estimate
    expect(b.spentUsd).toBeCloseTo(0.02, 6);
    expect(client.seen[0].userMessage).toContain('<request>\nWrite about the ledger change\n</request>');
  });
  it('the total cap holds across documents, and a failing search is noted, never thrown', async () => {
    const client = scripted({ queries: ['one', 'two'] });
    let n = 0;
    const enricher: Enricher = { name: 'fake',
      search: (q) => (q === 'two' ? Promise.reject(new Error('rate limited')) : Promise.resolve([{ url: 'https://a/1', title: 'a' }, { url: 'https://a/2', title: 'b' }])),
      fetch: (url) => { n++; return Promise.resolve({ url, title: url, text: 'z'.repeat(700) }); } };
    const docs = await enrich('req', '', enricher, client, budget(), { maxTotalChars: 1000 });
    expect(docs.map((d) => d.text.length)).toEqual([700, 300]);
    expect(n).toBe(2);
    const r = await enrichWithRecord('req', '', enricher, scripted({ queries: ['two'] }), budget());
    expect(r.notes[0]).toMatch(/^the search "two" could not run: rate limited/);
  });
  it('the query reading grounds shape only; an empty request asks nothing', () => {
    expect(ENRICH_QUERIES.decide({ request: '  ', material: '' })).toEqual([]);
    expect(ENRICH_QUERIES.ground({ queries: 'nope' }, { request: 'r', material: '' })).toBeNull();
    expect(ENRICH_QUERIES.ground({ queries: ['a', 'b', 'c', 'd', 'e', 'f'] }, { request: 'r', material: '' })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('pages are read as text by code, over a fetch a test supplies', async () => {
    expect(htmlToText('<html><head><title>Fee &amp; rules</title><style>p{}</style></head><body><p>Fees rise 4%.</p><script>x()</script><p>From&nbsp;May.</p></body></html>'))
      .toEqual({ title: 'Fee & rules', text: 'Fees rise 4%.\nFrom May.' });
    const fake = ((url: string) => Promise.resolve(new Response('<title>T</title><p>Body text.</p>', { status: url.endsWith('404') ? 404 : 200, headers: { 'content-type': 'text/html' } }))) as unknown as typeof fetch;
    expect(await fetchPage('https://x.example/a', fake)).toEqual({ url: 'https://x.example/a', title: 'T', text: 'Body text.' });
    expect(await fetchPage('https://x.example/404', fake)).toBeNull();
    expect(await fetchPage('file:///etc/passwd', fake)).toBeNull();
    const pdf = (() => Promise.resolve(new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }))) as unknown as typeof fetch;
    expect(await fetchPage('https://x.example/a.pdf', pdf)).toBeNull();
  });
});

describe('the web search enricher over the server-side tool', () => {
  const response = { content: [
    { type: 'server_tool_use', name: 'web_search' },
    { type: 'web_search_tool_result', content: [
      { type: 'web_search_result', url: 'https://r.example/1', title: 'One', encrypted_content: 'x' },
      { type: 'web_search_result', url: 'https://r.example/2', title: 'Two', encrypted_content: 'y' },
    ] },
    { type: 'text', text: 'Fees rise', citations: [{ type: 'web_search_result_location', url: 'https://r.example/2', cited_text: 'Fees rise 4% in May.' }] },
  ] };
  it('reads hits from the result blocks, with cited passages; an error object yields nothing', () => {
    expect(hitsOf(response)).toEqual([{ url: 'https://r.example/1', title: 'One' }, { url: 'https://r.example/2', title: 'Two', snippet: 'Fees rise 4% in May.' }]);
    expect(hitsOf({ content: [{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }] })).toEqual([]);
    expect(hitsOf(null)).toEqual([]);
  });
  it('asks once with the web search tool, through the client given, with no key read', async () => {
    const bodies: Record<string, unknown>[] = [];
    const e = new AnthropicSearchEnricher({ model: 'small-model', maxResults: 1, client: { messages: { create: (b) => { bodies.push(b); return Promise.resolve(response); } } } });
    expect(await e.search('ledger fees')).toEqual([{ url: 'https://r.example/1', title: 'One' }]);
    expect(bodies[0]).toMatchObject({ model: 'small-model', tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }] });
    expect(JSON.stringify(bodies[0].messages)).toContain('ledger fees');
    expect(e.searchEstimateUsd).toBeGreaterThan(0);
  });
});

// ── FACT INVENTORY ──────────────────────────────────────────────────────────────────────────────
describe('the fact inventory keeps only what its source says', () => {
  const input: InventoryInput = {
    request: 'Write a post about moving our billing to the new ledger.',
    material: [{ name: 'notes', text: 'We moved 1,240 accounts\nin nine days.\nThe old export capped files at 50 MB.' }],
    enriched: [{ url: 'https://w.example/rule', title: 'Rule', text: 'The rule takes effect on 1 March 2027.', retrievedAt: 't' }],
  };
  const fact = (o: Record<string, unknown>) => ({ text: 'a fact', quote: '', source: 'material', sourceRef: 'notes', ...o });
  it('a quote must be in the named source, spacing aside; the quote decides when the name is off', () => {
    const g = groundInventory({ facts: [
      fact({ text: '1,240 accounts moved in nine days', quote: 'We moved 1,240 accounts in nine days.' }),
      fact({ text: 'Exports were capped', quote: 'capped files at 50 MB', sourceRef: 'wrong-name' }),
      fact({ text: 'Invented', quote: 'We moved 2,000 accounts' }),
      fact({ text: 'Rule date', quote: 'takes effect on 1 March 2027', source: 'enriched', sourceRef: 'https://w.example/rule' }),
      fact({ text: 'Material quote claimed as web', quote: 'capped files at 50 MB', source: 'enriched', sourceRef: 'https://w.example/rule' }),
      fact({ text: 'a figure for how long setup took', source: 'sample', sourceRef: 'x', quote: 'ignored' }),
    ] }, input)!;
    expect(g.facts).toEqual([
      { text: '1,240 accounts moved in nine days', quote: 'We moved 1,240 accounts in nine days.', source: 'material', sourceRef: 'notes' },
      { text: 'Exports were capped', quote: 'capped files at 50 MB', source: 'material', sourceRef: 'notes' },
      { text: 'Rule date', quote: 'takes effect on 1 March 2027', source: 'enriched', sourceRef: 'https://w.example/rule' },
      { text: 'a figure for how long setup took', quote: '', source: 'sample', sourceRef: '', confirm: true },
    ]);
    expect(quotedIn('moved  1,240\taccounts', 'We moved 1,240 accounts')).toBe(true);
    expect(quotedIn('Moved 1,240', 'We moved 1,240 accounts')).toBe(false);
  });
  it('samples go last, twelve at most; nothing grounded is no reading; an honest empty list is one', () => {
    const many = Array.from({ length: 14 }, (_, i) => fact({ text: `sample ${i}`, source: 'sample' }));
    const g = groundInventory({ facts: [...many, fact({ text: 'real', quote: 'in nine days.' })] }, input)!;
    expect(g.facts).toHaveLength(12);
    expect(g.facts[0].text).toBe('real');
    expect(groundInventory({ facts: [fact({ quote: 'not there' })] }, input)).toBeNull();
    expect(groundInventory({ facts: [] }, input)).toEqual({ facts: [] });
    expect(groundInventory({ nope: 1 }, input)).toBeNull();
  });
  it('with no model the floor is empty and says so; with a model the grounded list is the decision', async () => {
    const floor = await readInventory(input, null, null, budget());
    expect(floor).toMatchObject({ value: { facts: [] }, by: 'floor' });
    const d = await readInventory(input, scripted({ facts: [fact({ text: 'nine days', quote: 'in nine days.' })] }), 'small', budget());
    expect(d.by).toBe('model');
    expect(d.value.facts.map((f) => f.text)).toEqual(['nine days']);
    expect(FACT_INVENTORY.prompt(input)).toContain('<web url="https://w.example/rule" title="Rule">');
  });
  it('the writer is shown each fact with its source; a fact nobody gave is marked, never as something to say', () => {
    expect(renderInventory({ facts: [] })).toBe('');
    const r = renderInventory({ facts: [
      { text: 'Exports were capped', quote: 'capped files\nat 50 MB', source: 'material', sourceRef: 'notes' },
      { text: 'Rule date', quote: 'on 1 March 2027', source: 'enriched', sourceRef: 'https://w.example/rule' },
      { text: 'a figure for setup time', quote: '', source: 'sample', sourceRef: '', confirm: true },
    ] });
    expect(r.split('\n')).toEqual([
      'FACTS ONLY THIS SUBJECT HAS. Stand the piece on these, in their own figures and names:',
      '1. Exports were capped (from your material, notes: "capped files at 50 MB")',
      '2. Rule date (from the web, https://w.example/rule: "on 1 March 2027")',
      '3. [NOT GIVEN: no value for this] a figure for setup time',
      'A NOT GIVEN line names a fact nobody gave. Never state a value for it: make the point with the facts above and the reasoning, or leave it out. The piece speaks to its reader and never mentions what it was not given.',
    ]);
    expect(r).not.toMatch(/not known yet|say in one/);
  });
});

// ── GROUNDING ACCEPTS ENRICHMENT, MARKED ────────────────────────────────────────────────────────
describe('a specific found in an enriched document is grounded as enriched, with its URL', () => {
  const text = 'We moved every account. The rule takes effect in March 2027, and fees rise 4% then. I once watched a regulator read it aloud.';
  const sp = (o: Partial<ExtractedSpecific>): ExtractedSpecific => ({ sentence: 2, text: 'fees rise 4%', kind: 'FIGURE', attributed: false, source: 'NONE', support: '', ...o });
  const specifics = [sp({}), sp({ sentence: 2, text: 'March 2027', kind: 'DATE', source: 'PUBLIC' }), sp({ sentence: 3, text: 'watched a regulator read it aloud', kind: 'FIRST_PERSON_EVENT' })];
  const doc = { url: 'https://w.example/rule', title: 'Rule', text: 'The new rule applies from March 2027. Under it, fees rise 4% for every account.' };
  it('without enrichment the decision is what it was: the same claims, no enriched field', () => {
    const before = decideSpecifics(text, specifics, 'We moved every account.', 'write it', false, 'reader');
    expect(decideSpecifics(text, specifics, 'We moved every account.', 'write it', false, 'reader', false, '', [])).toEqual(before);
    expect('enriched' in before).toBe(false);
    // independently: sentence 2 holds an unsupported figure, sentence 3 a story told as lived; the date is listed as public
    expect(before.claims.map((c) => [c.text, c.kind])).toEqual([
      ['The rule takes effect in March 2027, and fees rise 4% then.', 'FIGURE'],
      ['I once watched a regulator read it aloud.', 'EXPERIENCE'],
    ]);
    expect(before.publicFacts.map((p) => p.text)).toEqual(['The rule takes effect in March 2027, and fees rise 4% then.']);
  });
  it('with the document: the figure and the date are traced to it and marked; a lived story never is', () => {
    const r = decideSpecifics(text, specifics, 'We moved every account.', 'write it', false, 'reader', false, '', [doc]);
    expect(r.claims.map((c) => c.kind)).toEqual(['EXPERIENCE']);
    expect(r.publicFacts).toEqual([]);
    expect(r.enriched).toEqual([
      { start: text.indexOf('The rule'), end: text.indexOf(' I once'), text: 'fees rise 4%', source: 'enriched', url: doc.url, title: 'Rule' },
      { start: text.indexOf('The rule'), end: text.indexOf(' I once'), text: 'March 2027', source: 'enriched', url: doc.url, title: 'Rule' },
    ]);
    // a figure the document does not hold is not traced to it
    expect(enrichedSourceOf(sp({ text: 'fees rise 5%' }), [doc])).toBeNull();
    expect(enrichedSourceOf(sp({ text: 'watched it', kind: 'SECOND_HAND_EVENT' }), [{ ...doc, text: 'watched it' }])).toBeNull();
  });
  it('the pattern check: unchanged without documents; a figure claim whose figures one document holds is marked enriched', () => {
    const draft = 'Our survey found that 43% of teams churned.\n';
    const plain = patternSensor('', false).reading(draft);
    expect(patternSensor('', false, 'pattern check', []).reading(draft)).toEqual(plain);
    expect('enriched' in plain).toBe(false);
    expect(plain.claims.length).toBe(1);
    const web = patternSensor('', false, 'pattern check', [{ url: 'https://w', title: 'W', text: 'A survey of teams found 43% churned within a year.' }]).reading(draft);
    expect(web.claims).toEqual([]);
    expect(web.enriched).toEqual([{ start: plain.claims[0].start, end: plain.claims[0].end, text: plain.claims[0].text, source: 'enriched', url: 'https://w', title: 'W' }]);
    const partial = patternSensor('', false, 'pattern check', [{ url: 'https://w', title: 'W', text: 'A survey found 34% churned.' }]).reading(draft);
    expect(partial.claims.length).toBe(1);
  });
  it('the fact ledger: coverage unchanged without documents; with them, a web fact is enriched, never counted as the person\'s', () => {
    const ledger = factLedger('We moved 1,240 accounts.');
    const draft = 'We moved 1,240 accounts before the March 2027 rule, at $40 each.';
    const before = factCoverage(draft, ledger);
    expect('enriched' in before).toBe(false);
    expect(before.outside).toEqual(['March 2027', '$40']);
    const web = enrichedLedger([{ url: 'https://w', text: 'The rule starts March 2027.' }, { url: 'https://v', text: 'In March 2027 it starts.' }]);
    expect(web.find((f) => f.kind === 'DATE')).toMatchObject({ norm: '2027-03', source: 'enriched', url: 'https://w' });
    const after = factCoverage(draft, ledger, web);
    expect(after.used).toEqual(before.used);
    expect(after.per100).toBe(before.per100);
    expect(after.outside).toEqual(['$40']);
    expect(after.enriched?.map((f) => [f.text, f.url])).toEqual([['March 2027', 'https://w']]);
  });
  it('the carry-over step: a term an enriched document holds is no example\'s, so nothing is rewritten', async () => {
    const EXAMPLES = 'The request it answered: My frontend at localhost:5173 can\'t call the API; blocked by CORS policy.\n\nWhat I wrote:\n\nAdd the origin to the CORS allow list in `server.ts`.';
    const TEXT = 'Glad it works. CORS is fixed. Ping me if anything else breaks.';
    const g = await groundCarried(TEXT, { client: refusing, budget: budget(), request: 'Thanks, that solved it.', evidence: '', examples: EXAMPLES,
      enriched: [{ url: 'https://w', text: 'CORS is a browser rule for cross-origin calls.' }] });
    expect(g).toEqual({ text: TEXT, found: [], note: null });
    // without the document the same sentence is found (the model is asked, and refusing leaves it listed)
    const g2 = await groundCarried(TEXT, { client: refusing, budget: budget(), request: 'Thanks, that solved it.', evidence: '', examples: EXAMPLES });
    expect(g2.found.map((f) => f.sentence)).toEqual(['CORS is fixed.']);
  });
});

// ── GAP LINES ───────────────────────────────────────────────────────────────────────────────────
describe('a claim without proof is argued from what is given, or cut; never a line about the gap', () => {
  it('the writer contract: every specific from what is given, the point made without one, never a word about the gap', () => {
    expect(renderGapLineRule()).toBe(GAP_LINE_RULE);
    expect(renderGapLineRule({ samples: 2 })).toBe(GAP_LINE_RULE);
    expect(GAP_LINE_RULE).toBe('EVERY SPECIFIC FROM WHAT IS GIVEN. Every figure, name, date, quotation and story comes from the request, the material or the facts listed for you. Where a point wants one that none of them gives, make the point with what is given (the reasoning, the mechanism, your view stated as yours), or leave it out. The piece speaks to its reader: it never mentions its notes, its sources or what it was not given.');
    expect(GAP_LINE_RULE).not.toMatch(/not known yet|say in one|—/);
  });
  it('code holds the line: one sentence, short, no figure, no new name, not the sentence again', () => {
    const s = 'Acme cut setup to 12 minutes.';
    expect(gapLineProblem('How long setup takes is not measured yet.', s, 'notes about Acme')).toBeNull();
    expect(gapLineProblem('', s, '')).toMatch(/empty/);
    expect(gapLineProblem('Setup time is unknown. We will measure it.', s, '')).toMatch(/one sentence/);
    expect(gapLineProblem('Setup took about 10 minutes, we think.', s, '')).toMatch(/figure/);
    expect(gapLineProblem('Nobody at Globex has measured setup yet.', s, 'notes about Acme')).toMatch(/names Globex/);
    expect(gapLineProblem(`${'word '.repeat(31)}end.`, s, '')).toMatch(/thirty words/);
  });
  it('load-bearing by position, for the floor: alone in its paragraph, or first under a heading', () => {
    const t = '## Setup\nIt took 12 minutes. Then it ran.\n\nOne line alone.\n\nFirst here. Second here.\n';
    const at = (x: string): [number, number] => [t.indexOf(x), t.indexOf(x) + x.length];
    expect(standsAlone(t, ...at('It took 12 minutes.'))).toBe(true);
    expect(standsAlone(t, ...at('Then it ran.'))).toBe(false);
    expect(standsAlone(t, ...at('One line alone.'))).toBe(true);
    expect(standsAlone(t, ...at('First here.'))).toBe(false);
    const t2 = '## Why\n\nFirst under it. Second.\n';
    expect(standsAlone(t2, t2.indexOf('First'), t2.indexOf('First') + 15)).toBe(true);
  });
  it('the reading: not load-bearing is a cut; a line that fails code is a cut; with no model, every one is cut', async () => {
    const text = 'Intro sentence here. Acme cut setup to 12 minutes.\n\nThirty teams switched last year.\n';
    const spans = [
      { start: text.indexOf('Acme'), end: text.indexOf('minutes.') + 8, text: 'Acme cut setup to 12 minutes.', kind: 'FIGURE' },
      { start: text.indexOf('Thirty'), end: text.indexOf('year.') + 5, text: 'Thirty teams switched last year.', kind: 'FIGURE' },
    ];
    const input = { text, spans, given: 'Acme notes' };
    expect(GAP_LINES.ground({ items: [{ id: 1, loadBearing: false, line: '' }, { id: 2, loadBearing: true, line: 'Teams that switch do it because setup stops being a project.' }] }, input))
      .toEqual([null, 'Teams that switch do it because setup stops being a project.']);
    // a line with a figure fails code, and a span the reading left out is decided by the floor: both are cut
    expect(GAP_LINES.ground({ items: [{ id: 1, loadBearing: true, line: 'About 10 minutes.' }] }, input)).toEqual([null, null]);
    const floor = await planGapLines(input);
    expect(floor).toMatchObject({ by: 'floor', value: [null, null] });
    // the reading is told the line makes the point, never says what is missing
    expect(GAP_LINES.system).toContain('never a word about what is missing, not known or not given');
    expect(withGapLine(text, spans[1].start, spans[1].end, ' Not counted yet. ')).toBe('Intro sentence here. Acme cut setup to 12 minutes.\n\nNot counted yet.\n');
  });

  const STD = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
  function reader(flagged: readonly string[]): ClaimSensor {
    return { instrument: 'claim reader (test)', notes: [], version: 'test', qualified: true, gate: 'reader', degraded: false, spentUsd: 0,
      read: async () => { /* nothing to fetch */ },
      reading: (t): ClaimReading => ({ instrument: 'claim reader (test)', publicFacts: [],
        claims: flagged.filter((f) => t.includes(f)).map((f) => ({ start: t.indexOf(f), end: t.indexOf(f) + f.length, text: f, kind: 'FIGURE' as const, why: 'not in your material' })) }) };
  }
  const piece = 'Our setup is simple and it works for small teams that do not have an operator on call.\n\nThirty teams switched to it last year.\n\nThe docs walk through it in order. Setup took us 12 minutes on the first try.\n';
  const flagged = ['Thirty teams switched to it last year.', 'Setup took us 12 minutes on the first try.'];
  it('in repair, by default, every flagged sentence is cut as before', async () => {
    const e = await enforceClaims('s', STD, piece, { claimSensor: reader(flagged) });
    expect(e.cut).toEqual(flagged);
    expect('gapped' in e).toBe(false);
    expect(e.text).not.toContain('Thirty teams');
    expect(e.text).not.toContain('not known yet');
  });
  it('with gap lines on and no model: both flagged sentences are cut, and no line about the gap is written', async () => {
    const e = await enforceClaims('s', STD, piece, { claimSensor: reader(flagged), gapLines: {} });
    expect(e.text).toBe('Our setup is simple and it works for small teams that do not have an operator on call.\n\nThe docs walk through it in order.\n');
    expect(e.gapped).toEqual([]);
    expect(e.text).not.toMatch(/not known|not measured/);
    expect(e.report.failed).toBe(false);
  });
  it('with a model: its line is used where code holds it; under placeholders the slot wins', async () => {
    const client = scripted({ items: [{ id: 1, loadBearing: true, line: 'Setup is short because the docs walk through it in order.' }, { id: 2, loadBearing: false, line: '' }] });
    // spans arrive last first: id 1 is the later sentence
    const e = await enforceClaims('s', STD, piece, { claimSensor: reader(flagged), gapLines: { client, model: 'small', budget: budget() } });
    expect(e.gapped).toEqual([{ sentence: flagged[1], line: 'Setup is short because the docs walk through it in order.' }]);
    expect(e.text).toContain('The docs walk through it in order. Setup is short because the docs walk through it in order.\n');
    expect(e.text).not.toContain('Thirty teams');
    const slotted = await enforceClaims('s', STD, piece, { claimSensor: reader(flagged), gapLines: {}, placeholders: true });
    expect(slotted.gapped).toEqual([]);
  });
});
