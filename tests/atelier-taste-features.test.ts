// tests/atelier-taste-features.test.ts — MANY SMALL COUNTS; THE AUTHOR'S PIECES SELECT WHICH ARE TASTE.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FEATURES, featureOf, FEATURE, pageOf } from '../core/observers/features.js';
import { aucOf, bandOf, judgeFeature, selectFeatures, signalDistance, profileOf, judgeCountedFeatures, PER_ROLE_LIMIT } from '../core/observers/selection.js';
import { deriveContrastRules } from '../core/observers/contrast.js';
import { checkReading, moveFeatures, referenceOf, moveSamples } from '../core/taste/moves.js';
import * as store from '../core/state/store.js';
import { suggest } from '../core/ratification/suggest.js';
import { tastePermissions, statementHash } from '../core/taste/calibration.js';
import { tasteRules } from '../core/taste/reader.js';
import { formatOf, checkFormat, FORMATS } from '../core/observers/formats.js';
import { normalizeClass, checkClass } from '../core/observers/doc-class.js';
import { signTestOneSidedP, mcnemarExactP, binomialUpperTailP } from '../core/stats/sign-test.js';
import { accountRefusal } from '../providers/anthropic.js';
import { contrastForm } from '../cli/commands/discover.js';
import { USAGE } from '../cli/help.js';
import { BOOLEAN_OPTIONS } from '../cli/runtime.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';

const para = (s: string, n: number): string => Array.from({ length: n }, () => s).join(' ');
const colonHeavy = (i: number): string => Array.from({ length: 8 }, (_, k) =>
  para(`Point ${i}-${k}: the rule holds here, and it holds there too.`, 3)).join('\n\n');
const plain = (i: number): string => Array.from({ length: 8 }, (_, k) =>
  para(`The rule ${i} holds in case ${k} and it holds elsewhere as well today.`, 3)).join('\n\n');

describe('the counted features', () => {
  it('every feature has a unique id and says null on a text too short to mean anything', () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
    for (const f of FEATURES) expect(f.measure('Too short.'), f.id).toBeNull();
  });
  it('counts what it says: colons per 1,000 prose words', () => {
    expect(featureOf('colon')!.measure(colonHeavy(1))).toBeGreaterThan(20);
    expect(featureOf('colon')!.measure(plain(1))).toBe(0);
  });
  it('the serial comma needs three lists to say anything', () => {
    const f = featureOf('oxfordComma')!;
    expect(f.measure(para('We bought apples, pears, and plums for the table today.', 30))).toBe(1);
    expect(f.measure(para('We bought apples, pears and plums for the table today.', 30))).toBe(0);
  });
  it('the FEATURE observer holds a text to a band, both sides, and refuses an unknown feature', () => {
    expect(FEATURE.validate({ feature: ['nope'], minValue: 1 })).toMatch(/needs feature=/);
    expect(FEATURE.validate({ feature: ['colon'], minValue: 5, maxValue: 1 })).toMatch(/cannot exceed/);
    expect(FEATURE.observe(colonHeavy(1), { feature: ['colon'], maxValue: 5 }).verdict).toBe('VIOLATED');
    expect(FEATURE.observe(plain(1), { feature: ['colon'], maxValue: 5 }).verdict).toBe('MET');
    expect(FEATURE.observe('Short.', { feature: ['colon'], maxValue: 5 }).verdict).toBe('NOT_APPLICABLE');
  });
});

describe('selection: only what separates this author from the model, and holds, is kept', () => {
  it('AUC is the chance an author value beats a model value, ties half', () => {
    expect(aucOf([3, 4, 5], [1, 2])).toBe(1);
    expect(aucOf([1, 2], [1, 2])).toBe(0.5);
    expect(aucOf([], [1])).toBeNull();
  });
  it('the band is the 10th to 90th percentile of the read pieces, widened a quarter each side', () => {
    expect(bandOf([1, 2, 3])).toBeNull();
    const b = bandOf([10, 10, 10, 20, 20, 20, 30, 30, 30, 40])!;
    expect(b[0]).toBeLessThan(10); expect(b[1]).toBeGreaterThan(30);
  });
  it('RULE when single drafts fall outside the band; SIGNAL when only the distributions differ; nothing when neither', () => {
    const rule = judgeFeature('x', { read: [10, 11, 12, 10, 11], held: [11, 12], model: [1, 2, 1, 2] });
    expect(rule).toMatchObject({ kept: true, role: 'RULE' });
    const signal = judgeFeature('x', { read: [2, 10, 3, 9, 4, 8, 5, 7], held: [6, 7], model: [2, 3, 3, 4, 2, 3] });
    expect(signal).toMatchObject({ kept: true, role: 'SIGNAL' });
    const noise = judgeFeature('x', { read: [1, 5, 2, 4, 3], held: [3, 2], model: [1, 5, 2, 4] });
    expect(noise).toMatchObject({ kept: false, role: null });
    expect(noise.why).toMatch(/does not separate/);
  });
  it('a feature the author\'s held-back pieces break is not kept', () => {
    expect(judgeFeature('x', { read: [10, 11, 12, 10, 11], held: [30, 40], model: [1, 2, 1, 2] }).why).toMatch(/held-back pieces fall outside/);
  });
  it('the strongest few are proposed; the rest are shown, not proposed', () => {
    const samples = new Map(Array.from({ length: 5 }, (_, i) => [`f${i}`, { read: [10, 11, 12, 10, 11], held: [11, 12], model: [1, 2, 1, 2] }]));
    const v = selectFeatures(samples, 2);
    expect(v.filter((x) => x.kept)).toHaveLength(2);
    expect(v.filter((x) => x.why.includes('beyond the 2 strongest'))).toHaveLength(3);
  });
  it('a signal scores closeness to the author\'s typical value; a profile reports per layer', () => {
    const signals = [{ id: 'colon', band: [70, 110] as const, authorMedian: 90, modelMedian: 0, auc: 0.9 }];
    expect(signalDistance(colonHeavy(1), signals)!).toBeLessThan(signalDistance(plain(1), signals)!);
    const p = profileOf(plain(1), [{ id: 'colon', band: [20, 60] }]);
    expect(p.layers[0]).toMatchObject({ layer: 'punctuation and typography', features: 1 });
    expect(p.layers[0].distance).toBeGreaterThan(0);
  });
});

describe('discovery proposes a counted feature only when it tells single drafts apart', () => {
  it('colon-heavy author, colon-free model: a FEATURE rule, with both numbers', () => {
    const read = [1, 2, 3, 4, 5].map((i) => ({ id: `r${i}`, text: colonHeavy(i) }));
    const held = [6, 7].map((i) => ({ id: `h${i}`, text: colonHeavy(i) }));
    const drafts = [1, 2, 3, 4].map(plain);
    const props = deriveContrastRules(read, held, drafts, 'EXPERT_AUTHORED' as never);
    const colon = props.find((p) => p.requirement.measurement?.observer === 'FEATURE' && (p.requirement.measurement.params.feature as string[])[0] === 'colon');
    expect(colon?.requirement.statement).toMatch(/^Keep colons within my range/);
    expect(judgeCountedFeatures(read.map((r) => r.text), held.map((h) => h.text), drafts).find((v) => v.id === 'colon')?.role).toBe('RULE');
  });
});

describe('the move reader (a candidate instrument): what it quotes must be where it says', () => {
  const text = 'The factory floor is a lie we tell ourselves.\n\nI was wrong about this for years, and it cost us.';
  it('a figure not in the paragraph named is dropped and counted; unknown enums fall back', () => {
    const r = checkReading(text, { paragraphs: [
      { n: 1, register: 'ANALYTICAL', figures: [{ text: 'factory floor', domain: 'MANUFACTURING' }, { text: 'a battlefield', domain: 'MILITARY' }], concession: false, aphorism: '', callback: false, humour: false, evidence: { namedSource: false, count: false, date: false, caveat: false } },
      { n: 2, register: 'NOPE', figures: [], concession: true, aphorism: 'it cost us', callback: false, humour: false, evidence: {} },
      { n: 9, register: 'ANALYTICAL', figures: [], concession: false, aphorism: '', callback: false, humour: false, evidence: {} },
    ], opening: 'THESIS', closing: 'WHATEVER', moves: ['SELF_CORRECTION', 'NOT_A_MOVE'] })!;
    expect(r.paragraphs).toHaveLength(2);
    expect(r.paragraphs[0].figures.map((f) => f.text)).toEqual(['factory floor']);
    expect(r.dropped).toBe(1);
    expect(r.paragraphs[1].register).toBe('ANALYTICAL');
    expect(r.closing).toBe('OPEN_END');
    expect(r.moves).toEqual(['SELF_CORRECTION']);
    const f = moveFeatures(r, referenceOf([r]));
    expect(f['move.concession']).toBe(0.5);
    expect(f['move.openingTypical']).toBe(1);
  });
  it('a read piece is never typical because it was counted in its own reference', () => {
    const mk = (opening: string) => checkReading(text, { paragraphs: [{ n: 1, register: 'ANALYTICAL', figures: [], concession: false, aphorism: '', callback: false, humour: false, evidence: {} }], opening, closing: 'NOTE', moves: [] })!;
    const s = moveSamples([mk('THESIS'), mk('QUOTE'), mk('QUOTE')], [], []);
    expect(s.get('move.openingTypical')!.read).toEqual([0, 0.5, 0.5]);
  });
});

describe('through the binary: a FEATURE rule by hand, and the profile', () => {
  it('add --measure FEATURE:… is checked by verify, and --profile reports by layer', () => {
    const CLI = resolve('dist/cli/atelier.mjs');
    if (!existsSync(CLI)) throw new Error('build first');
    const data = mkdtempSync(join(tmpdir(), 'atelier-feat-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-feat-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    const run = (...a: string[]): { out: string; code: number } => {
      try { return { out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }), code: 0 }; } catch (e) {
        const x = e as { stdout?: string; stderr?: string; status?: number }; return { out: `${x.stdout ?? ''}${x.stderr ?? ''}`, code: x.status ?? 1 };
      }
    };
    expect(run('add', '--statement', 'Keep colons rare.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'FEATURE:feature=colon,maxValue=5').code).toBe(0);
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'house');
    store.setSignals({ root: data, skillName: 'house' }, [{ id: 'triad', band: [2, 6], authorMedian: 4, modelMedian: 1, auc: 0.9 }]);
    const file = join(proj, 'd.md'); writeFileSync(file, colonHeavy(1));
    const r = run('verify', '--skill', 'house', file, '--profile');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/colons/);
    expect(r.out).toMatch(/profile \(0 = inside your range/);
    expect(r.out).toMatch(/punctuation and typography/);
    expect(run('add', '--statement', 'x', '--kind', 'BOUNDARY', '--measure', 'FEATURE:feature=Colon,maxValue=5').out).toMatch(/needs feature=/);
  });
});

// ── THE 2026-09-29 DETECTION AUDIT ────────────────────────────────────────────────────────────────
// Counts that read front matter and code, two biased counts, FEATURE rules suggested with more authority
// than their qualification earned, VETO carried to a rule nobody labelled, the reserve read by the tell
// lexicon, contrast drafts that were always blog posts, stale signals, class aliases, the one-sided sign
// test, and a provider's raw billing JSON. Each pinned in both directions; the ones a person can reach,
// through the shipped binary.

const BIN = resolve('dist/cli/atelier.mjs');
beforeAll(() => { if (!existsSync(BIN)) throw new Error(`${BIN} is missing: run \`npm run build\` first.`); });

const body = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} says the plain thing in plain words, and then it stops for a while here.`).join('\n\n');
const filler = (n: number): string => 'Words fill the page slowly and without any fuss at all. '.repeat(n);

// ── 1. the page counts ignore front matter and the inside of code ─────────────────────────────────
describe('page furniture is counted on the page, not in its front matter or its code', () => {
  const front = `---\ntitle: x\ntags:\n${Array.from({ length: 4 }, (_, i) => `  - tag${i}`).join('\n')}\nurl: https://example.com/a\n---\n`;
  const code = '\n\n```sh\n- not an item\n## not a heading\n> not a quote\nhttps://x.y/z\n*not italic*\n```\n\n~~~\n- nor this\n~~~\n';
  it('front matter and fenced code add no list items, links, quotations or italics', () => {
    for (const id of ['listItem', 'link', 'blockquote', 'italic']) {
      expect(featureOf(id)!.measure(front + body + code), id).toBe(featureOf(id)!.measure(body));
    }
  });
  it('the polarity: the same furniture in prose still counts', () => {
    const real = `${body}\n\n- a real item\n- another\n\nSee https://example.com/b and *this* too.\n\n> a real quote`;
    expect(featureOf('listItem')!.measure(real)).toBeGreaterThan(0);
    expect(featureOf('link')!.measure(real)).toBeGreaterThan(0);
    expect(featureOf('blockquote')!.measure(real)).toBeGreaterThan(0);
    expect(featureOf('italic')!.measure(real)).toBeGreaterThan(0);
  });
  it('a ~~~ fence is a code block as much as a ``` one; an unclosed fence runs to the end', () => {
    const one = featureOf('codeBlock')!.measure(`${body}\n\n\`\`\`\ncode\n\`\`\``)!;
    expect(featureOf('codeBlock')!.measure(`${body}\n\n~~~\ncode\n~~~`)).toBe(one);
    expect(featureOf('codeBlock')!.measure(body + code)).toBeCloseTo(one * 2, 3);
    expect(pageOf('a\n```\n- b\n## c').body).toBe('a\n\n\n');
  });
  it('a heading inside a code fence does not cut a section', () => {
    const sec = (n: number): string => 'A plain sentence of prose sits here. '.repeat(n);
    const text = `## One\n\n${sec(10)}\n\n## Two\n\n${sec(20)}\n\n\`\`\`\n## fake\n\`\`\`\n\n${sec(20)}\n\n## Three\n\n${sec(10)}`;
    expect(featureOf('sectionSpread')!.measure(text)).toBe(4);
  });
});

// ── 2. two biased counts ─────────────────────────────────────────────────────────────────────────
describe('small numerals and the serial comma count what they say', () => {
  it('a digit before a full stop or a comma is still a digit; 3.5 and 4,000 are not small numbers', () => {
    const f = featureOf('smallNumerals')!;
    expect(f.measure(`We had 3. Then 4, then 5. ${filler(20)}`)).toBe(1);
    expect(f.measure(`We had three. Then four, then five. ${filler(20)}`)).toBe(0);
    expect(f.measure(`It rose 3.5 points to 4,000 and then 2.25 more. ${filler(20)}`)).toBeNull();
  });
  it('"However, the cat and dog" is not a list of three; "apples, pears and plums" is', () => {
    const f = featureOf('oxfordComma')!;
    expect(f.measure(`${'However, the cat and dog slept. Honestly, the rain and wind stayed. '.repeat(3)}${filler(20)}`)).toBeNull();
    expect(f.measure(`${'However, apples, pears and plums fell. '.repeat(3)}${filler(20)}`)).toBe(0);
    expect(f.measure(`${'We bought apples, pears, and plums today. '.repeat(3)}${filler(20)}`)).toBe(1);
  });
});

// ── 3. FEATURE rules claim no more authority than their qualification ───────────────────────────
const linky = (i: number): string => Array.from({ length: 8 }, (_, k) =>
  `The rule ${i} holds in case ${k}, see https://example.com/${i}/${k} for it today. `.repeat(3)).join('\n\n');

describe('a FEATURE rule is suggested as preferred, never a zero-width band, specifics only as caps', () => {
  const featureRules = (read: string[], held: string[], drafts: string[]): Requirement[] =>
    deriveContrastRules(read.map((text, i) => ({ id: `r${i}`, text })), held.map((text, i) => ({ id: `h${i}`, text })), drafts, 'EXPERT_AUTHORED' as never)
      .map((p) => p.requirement).filter((r) => r.measurement?.observer === 'FEATURE');
  const byId = (rs: Requirement[], id: string): Requirement | undefined => rs.find((r) => (r.measurement!.params.feature as string[])[0] === id);

  it('suggest() never makes a FEATURE rule required, however well it held, and says why', () => {
    const r = byId(featureRules([1, 2, 3, 4, 5].map(colonHeavy), [6, 7].map(colonHeavy), [1, 2, 3, 4].map(plain)), 'colon')!;
    expect(r.measurement!.params).toMatchObject({ minValue: expect.any(Number), maxValue: expect.any(Number) });
    const s = suggest(r, { framings: [], heldOut: null, needs: null, inSample: { applicable: 2, present: 2, independent: true } }, 'GUARD');
    expect(s).toMatchObject({ decision: 'APPROVE', materiality: 'PREFERRED' });
    expect(s.why).toMatch(/not to steer a draft/);
    // The polarity: a measured cap that is not a FEATURE rule, on the same evidence, is still required.
    const cap = { ...r, measurement: { observer: 'PATTERN_RATE' as const, params: { pattern: ['EM_DASH'], maxPer1000: 1 } } };
    expect(suggest(cap, { framings: [], heldOut: null, needs: null, inSample: { applicable: 2, present: 2, independent: true } }, 'GUARD').materiality).toBe('REQUIRED');
  });
  it('an author who never links, against a model that does: a cap at zero, never a band around it', () => {
    const rs = featureRules([1, 2, 3, 4, 5].map(plain), [6, 7].map(plain), [1, 2, 3, 4].map(linky));
    const link = byId(rs, 'link')!;
    expect(link.measurement!.params.minValue).toBeUndefined();
    expect(link.measurement!.params.maxValue).toBeGreaterThanOrEqual(0);
    expect(link.statement).toMatch(/links at zero/);
    for (const r of rs) {
      const { minValue, maxValue } = r.measurement!.params as { minValue?: number; maxValue?: number };
      if (minValue !== undefined && maxValue !== undefined) expect(maxValue - minValue, r.statement).toBeGreaterThan(0.002);
    }
  });
  it('an author who links more than the model gets no floor on links: a floor would ask for sources nobody supplied', () => {
    expect(FEATURES.filter((f) => f.specifics).map((f) => f.id).sort()).toEqual(['link', 'names', 'numbers', 'quoted']);
    const rs = featureRules([1, 2, 3, 4, 5].map(linky), [6, 7].map(linky), [1, 2, 3, 4].map(plain));
    expect(byId(rs, 'link')).toBeUndefined();
    expect(judgeFeature('link', { read: [5, 6, 7, 5, 6], held: [6, 6], model: [0, 0, 0, 0] })).toMatchObject({ kept: true, role: 'RULE' });
  });
  it('a band whose read pieces all sit at one value is flagged flat; a real band is not', () => {
    expect(judgeFeature('x', { read: [0, 0, 0, 0, 0], held: [0, 0], model: [3, 4, 5, 3] }).flat).toBe(true);
    expect(judgeFeature('x', { read: [10, 11, 12, 10, 11], held: [11, 12], model: [1, 2, 1, 2] }).flat).toBeUndefined();
  });
  it('rules and signals are capped separately: strong rules no longer crowd out every signal', () => {
    const rule = { read: [10, 11, 12, 10, 11], held: [11, 12], model: [1, 2, 1, 2] };
    const signal = { read: [2, 10, 3, 9, 4, 8, 5, 7], held: [6, 7], model: [2, 3, 3, 4, 2, 3] };
    const samples = new Map([
      ...Array.from({ length: 9 }, (_, i) => [`rule${i}`, rule] as const),
      ...Array.from({ length: 3 }, (_, i) => [`signal${i}`, signal] as const),
    ]);
    const v = selectFeatures(samples);
    expect(v.filter((x) => x.kept && x.role === 'RULE')).toHaveLength(PER_ROLE_LIMIT);
    expect(v.filter((x) => x.kept && x.role === 'SIGNAL')).toHaveLength(3);
    expect(v.filter((x) => x.why.includes(`beyond the ${PER_ROLE_LIMIT} strongest rules`))).toHaveLength(9 - PER_ROLE_LIMIT);
  });
});

// ── 4. VETO is a rule's own ──────────────────────────────────────────────────────────────────────
describe('calibration: pooling bounds the false blocks, but VETO needs the rule\'s own confirmed miss', () => {
  const req = (id: string, statement: string): Requirement => ({ requirementId: id, statement, appliesWhen: 'GENERAL', kind: 'GENERATIVE',
    authority: 'EXPERT_RATIFIED', provenance: 'EXPERT_AUTHORED', evidence: '', evidenceItemId: null, wouldBeAbsentIf: null, materiality: 'REQUIRED',
    realizationTolerance: null, outputShape: null } as unknown as Requirement);
  const a = req('p1', 'I close an argument with a short antithetical sentence.');
  const b = req('p2', 'I open on a concrete scene, never a thesis.');
  const v = { requirements: [a, b] } as unknown as StandardVersion;
  const rules = tasteRules(v);
  const keyOf = (r: Requirement): string => rules.find((x) => x.rule.requirementId === r.requirementId)!.key;
  const labelled = (n: number, r: Requirement): Record<string, unknown>[] => Array.from({ length: n }, (_, i) => [
    { kind: 'TASTE_READING', readingId: `${r.requirementId}-${i}`, invocationId: null, standardVersionHash: 's', readerModel: 'm', at: `${i}`, blind: true,
      readings: [{ requirementId: r.requirementId, key: keyOf(r), verdict: 'MISSED', kind: 'PRESENCE', quote: 'q', why: 'w', statementHash: statementHash(r), passage: 'p' }] },
    { kind: 'TASTE_LABEL', readingId: `${r.requirementId}-${i}`, key: keyOf(r), statementHash: statementHash(r), label: 'MISSED', at: `${i}` },
  ]).flat();

  it('20 confirmed misses on rule A give A VETO, and B, with no labels, stays OBSERVE', () => {
    expect(rules).toHaveLength(2);
    const p = tastePermissions(rules, labelled(20, a), 'm');
    expect(p.pooled.earned).toBe(true);
    expect(p.veto.has(keyOf(a))).toBe(true);
    expect(p.veto.has(keyOf(b))).toBe(false);
    expect(p.rules.get(keyOf(b))!.why).toMatch(/none of this rule's own misses has been confirmed/);
  });
  it('one confirmed miss of its own, under a pooled bound that holds, and B holds VETO too', () => {
    expect(tastePermissions(rules, [...labelled(20, a), ...labelled(1, b)], 'm').veto.has(keyOf(b))).toBe(true);
  });
});

// ── 5. the learned tells leave the reserve unread ────────────────────────────────────────────────
describe('the tell lexicon does not read reserved pieces unless asked', () => {
  it('--include-reserved is declared grammar and documented on the tells line', () => {
    expect(BOOLEAN_OPTIONS).toContain('include-reserved');
    expect(USAGE.tells).toMatch(/--include-reserved/);
  });
});

// ── 6 and 8. what the contrast drafts are asked to be; class aliases; X's link count ─────────────
describe('the contrast drafts are the author\'s kind of piece, at the author\'s length', () => {
  const pieces = (words: number): { text: string }[] => [words, words, words].map((w) => ({ text: 'word '.repeat(w) }));
  it('a declared format gives its label and a length clamped to its usual band', () => {
    expect(contrastForm(pieces(180), 'linkedin-post')).toEqual({ label: 'a LinkedIn post', words: 180 });
    expect(contrastForm(pieces(2000), 'linkedin-post')).toEqual({ label: 'a LinkedIn post', words: 600 });
    expect(contrastForm(pieces(40), 'blog-post')).toEqual({ label: 'a blog post', words: 500 });
  });
  it('no class: "a piece" at the corpus median; an unknown class is named as declared', () => {
    expect(contrastForm(pieces(1234), null)).toEqual({ label: 'a piece', words: 1250 });
    expect(contrastForm(pieces(300), 'essay')).toEqual({ label: 'an essay', words: 300 });
  });
  it('the short names people type resolve to the format', () => {
    expect(['whitepaper', 'blog', 'linkedin', 'x', 'tweet', 'onepager', 'White Paper'].map(normalizeClass))
      .toEqual(['white-paper', 'blog-post', 'linkedin-post', 'x-post', 'x-post', 'one-pager', 'white-paper']);
    expect(formatOf('tweet')?.id).toBe('x-post');
    expect(checkClass('x-post', 'tweet')).toMatchObject({ ok: true });
    expect(checkClass('x-post', 'blog')).toMatchObject({ ok: false });
  });
  it('a post on X counts every link as 23 characters, however long', () => {
    const x = FORMATS['x-post'];
    const long = `Read this ${'https://example.com/'.padEnd(300, 'a')}`;
    expect(checkFormat(long, x).hard).toEqual([]);
    expect(checkFormat(`${'b'.repeat(270)} https://t.co/x`, x).hard).toHaveLength(1);
    expect(checkFormat('c'.repeat(281), x).hard).toHaveLength(1);
  });
});

// ── 9. the one-sided sign test ───────────────────────────────────────────────────────────────────
describe('binomialUpperTailP: the blinding check at a chance rate of one in three', () => {
  it('pinned values, and the one-sided sign test is its p = ½ case', () => {
    expect(Math.abs(binomialUpperTailP(18, 36, 1 / 3) - 0.0283)).toBeLessThanOrEqual(0.0005);
    expect(Math.abs(binomialUpperTailP(12, 36, 1 / 3) - 0.5624)).toBeLessThanOrEqual(0.0005);
    expect(binomialUpperTailP(24, 36, 0.5)).toBeCloseTo(signTestOneSidedP(24, 36), 12);
    expect(() => binomialUpperTailP(3, 2, 0.5)).toThrow(RangeError);
  });
});

describe('signTestOneSidedP: the exact upper tail P(X ≥ wins | n, ½)', () => {
  it('pinned values', () => {
    expect(signTestOneSidedP(24, 36)).toBeCloseTo(0.0326, 3);
    expect(Math.abs(signTestOneSidedP(24, 36) - 0.0326)).toBeLessThanOrEqual(0.0005);
    expect(Math.abs(signTestOneSidedP(23, 36) - 0.0662)).toBeLessThanOrEqual(0.0005);
    expect(signTestOneSidedP(0, 10)).toBe(1);
    expect(signTestOneSidedP(10, 10)).toBeCloseTo(1 / 1024, 10);
    expect(signTestOneSidedP(0, 0)).toBe(1);
  });
  it('is half the two-sided test away from the middle, and refuses nonsense', () => {
    expect(signTestOneSidedP(24, 36) * 2).toBeCloseTo(mcnemarExactP(24, 12), 10);
    expect(() => signTestOneSidedP(5, 4)).toThrow(RangeError);
    expect(() => signTestOneSidedP(-1, 4)).toThrow(RangeError);
  });
});

// ── 10. account refusals, in one plain line ──────────────────────────────────────────────────────
describe('a provider that refuses the key is said in one line, request id kept', () => {
  const credit = JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' }, request_id: 'req_011CAbc' });
  it('the wording', () => {
    expect(accountRefusal(400, credit)).toBe('the API key has no credit left: add credits, or set another key (request id req_011CAbc).');
    expect(accountRefusal(401, '{}', 'req_9')).toMatch(/^the API key was not accepted \(HTTP 401\).*req_9/);
    expect(accountRefusal(403, '{}')).toMatch(/HTTP 403/);
    expect(accountRefusal(400, '{"error":{"message":"max_tokens: too large"}}')).toBeNull();
    expect(accountRefusal(500, credit)).toBeNull();
  });

  // In-process server, so the BIN runs asynchronously (execFileSync would block the server's loop).
  let server: Server; let port = 0;
  const hits: string[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.url ?? '');
      req.resume();
      req.on('end', () => {
        res.setHeader('connection', 'close');
        if ((req.url ?? '').includes('/v1/messages')) {
          res.writeHead(400, { 'content-type': 'application/json', 'request-id': 'req_011CAbc' }); res.end(credit); return;
        }
        res.writeHead(401, { 'content-type': 'application/json', 'x-request-id': 'req_oai7' });
        res.end(JSON.stringify({ error: { message: 'Incorrect API key provided', type: 'invalid_request_error' } }));
      });
    });
    await new Promise<void>((ok) => { server.listen(0, '127.0.0.1', () => { ok(); }); });
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => { server.close(); });

  const runAsync = async (env: Record<string, string>, ...args: string[]): Promise<string> => {
    const data = realpathSync(mkdtempSync(join(tmpdir(), 'atelier-bill-data-'))); const proj = realpathSync(mkdtempSync(join(tmpdir(), 'atelier-bill-proj-')));
    const dir = join(proj, 'posts'); mkdirSync(dir);
    for (let i = 0; i < 4; i++) writeFileSync(join(dir, `p${i}.md`), `# Post ${i}\n\n${'We decided first, and explained after. '.repeat(12)}`);
    const e = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ...env };
    execFileSync('node', [BIN, 'intake', dir], { cwd: proj, env: e, encoding: 'utf8' });
    try {
      const r = await promisify(execFile)('node', [BIN, ...args], { cwd: proj, env: e, encoding: 'utf8' });
      return `${r.stdout}${r.stderr}`;
    } catch (x) { const y = x as { stdout?: string; stderr?: string; code?: number }; return `EXIT:${y.code}\n${y.stderr ?? ''}${y.stdout ?? ''}`; }
  };

  it('through the binary, Anthropic: no credit left is one line with the request id, and no JSON', async () => {
    const out = await runAsync({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}` }, 'discover', '--no-contrast', '--model', 'claude-sonnet-4-5');
    expect(hits.some((h) => h.includes('/v1/messages'))).toBe(true);
    expect(out).toMatch(/^EXIT:1/);
    expect(out).toMatch(/the API key has no credit left: add credits, or set another key \(request id req_011CAbc\)/);
    expect(out).not.toMatch(/"type":"error"|invalid_request_error/);
  }, 60_000);

  it('through the binary, an OpenAI-compatible backend: a refused key is one line, request id kept', async () => {
    const out = await runAsync({}, 'discover', '--no-contrast', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'm', '--api-key-env', 'NOPE_KEY');
    expect(out).toMatch(/^EXIT:1/);
    expect(out).toMatch(/the API key was not accepted \(HTTP 401\).*request id req_oai7/);
    expect(out).not.toMatch(/Incorrect API key provided/);
  }, 60_000);
});

// ── 5, 6 and 7 through the binary, against the scripted backend ──────────────────────────────────
describe('through the binary: contrast drafts by class, stale signals, and a reserve the tells leave alone', () => {
  let backend: ChildProcess; let port = 0;
  const script = async (b: unknown): Promise<void> => {
    const send = (): Promise<Response> => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(b) });
    try { await send(); } catch { await send(); }
  };
  beforeAll(async () => {
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
  });
  afterAll(() => { backend.kill(); });

  const MODEL = (): string[] => ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
  const fresh = (): { data: string; proj: string } => ({
    data: realpathSync(mkdtempSync(join(tmpdir(), 'atelier-det-data-'))), proj: realpathSync(mkdtempSync(join(tmpdir(), 'atelier-det-proj-'))),
  });
  const run = (data: string, proj: string, ...args: string[]): string => {
    try {
      return execFileSync('node', [BIN, ...args], { encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' } });
    } catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${x.status}\n${x.stderr ?? ''}${x.stdout ?? ''}`; }
  };
  const corpus = (proj: string): string => {
    const dir = join(proj, 'posts'); mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 8; i++) writeFileSync(join(dir, `post-${i}.md`), `# Harbour note ${i}\n\n${'We decided first, and explained after. '.repeat(12)}`);
    return dir;
  };
  const runDirOf = (data: string): string => { const d = join(data, 'runs'); return join(d, readdirSync(d)[0]); };
  const factor = (description: string) => ({ description, appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['post-0.md'], wouldBeAbsentIf: 'the opposite shows', needsFromUser: '', quote: '' });
  const CHAIN = {
    emit_factors: { factors: [factor('Lead with the decision, then the reasoning.')] },
    emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }] },
    emit_observation: { applicable: true, present: true, why: 'seen' },
    emit_rules: { rules: [{ statement: 'Lead with the decision.', appliesWhen: 'GENERAL', evidence: '', evidenceItemId: 'post-0.md', kind: 'GENERATIVE', wouldBeAbsentIf: 'the reasoning comes first' }] },
  };

  it('--class linkedin (an alias) asks for LinkedIn posts at the author\'s length, and the cache is keyed on it', async () => {
    const { data, proj } = fresh();
    run(data, proj, 'intake', corpus(proj));
    await script({ byTool: { ...CHAIN, emit_piece: { piece: 'BLOG-SHAPED' } },
      when: [{ contains: 'Write a LinkedIn post titled', answer: { piece: 'LINKEDIN-SHAPED' } }] });
    const out = run(data, proj, 'discover', '--class', 'linkedin', ...MODEL());
    expect(out).not.toMatch(/^EXIT:/);
    const cached = JSON.parse(readFileSync(join(runDirOf(data), 'contrast-drafts.json'), 'utf8')) as { key: string; drafts: string[] };
    expect(cached.drafts.length).toBeGreaterThan(0);
    expect(new Set(cached.drafts)).toEqual(new Set(['LINKEDIN-SHAPED']));
    // Pieces of 75 words: inside LinkedIn's band (60 to 600), so the drafts are asked for at 80.
    expect(cached.key).toMatch(/\|scripted\|a LinkedIn post\|80$/);
  }, 120_000);

  it('without a class, "a piece" at the corpus median; never "a blog post, about 900 words"', async () => {
    const { data, proj } = fresh();
    run(data, proj, 'intake', corpus(proj));
    await script({ byTool: { ...CHAIN, emit_piece: { piece: 'OTHER' } },
      when: [{ contains: 'Write a piece titled', answer: { piece: 'A-PIECE' } }, { contains: 'About 900 words', answer: { piece: 'NINE-HUNDRED' } }] });
    expect(run(data, proj, 'discover', ...MODEL())).not.toMatch(/^EXIT:/);
    const cached = JSON.parse(readFileSync(join(runDirOf(data), 'contrast-drafts.json'), 'utf8')) as { key: string; drafts: string[] };
    expect(new Set(cached.drafts)).toEqual(new Set(['A-PIECE']));
  }, 120_000);

  it('--no-contrast deletes a signals.json left by an earlier step, so build cannot install it', async () => {
    const { data, proj } = fresh();
    run(data, proj, 'intake', corpus(proj));
    await script({ byTool: CHAIN });
    const stale = join(runDirOf(data), 'signals.json');
    writeFileSync(stale, JSON.stringify([{ id: 'colon', band: [1, 2], authorMedian: 1.5, modelMedian: 0, auc: 0.9 }]));
    expect(run(data, proj, 'discover', '--no-contrast', ...MODEL())).not.toMatch(/^EXIT:/);
    expect(existsSync(stale)).toBe(false);
  }, 120_000);

  it('tells --learn leaves the reserve unread; --include-reserved reads it', async () => {
    const { data, proj } = fresh();
    const dir = corpus(proj);
    const tell = 'the quiet hinge holds everything';
    const reservedText = `# Kept back\n\n${`${tell}. `.repeat(20)}`;
    run(data, proj, 'add', '--statement', 'Lead with the decision.', '--kind', 'GENERATIVE', '--materiality', 'REQUIRED');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    expect(run(data, proj, 'build', '--name', 'voice')).not.toMatch(/^EXIT:/);
    // The run's corpus and its reserve, as `atelier new` leaves them.
    const sdir = join(data, 'sessions'); const sfile = join(sdir, readdirSync(sdir).find((f) => f.endsWith('.json'))!);
    const s = JSON.parse(readFileSync(sfile, 'utf8')) as Record<string, unknown>;
    writeFileSync(sfile, JSON.stringify({ ...s, source: dir, skillName: 'voice', reservation: { reserved: [{ unitId: 'kept.md', artifact: reservedText }] } }));
    // The drafts say only what the reserved piece says: every phrase they repeat is the author's, there.
    await script({ byTool: { emit_piece: { piece: `${tell}. `.repeat(12) } } });
    const learned = (): string => run(data, proj, 'tells', '--skill', 'voice', '--learn', '--probe', '3', ...MODEL());
    const without = learned();
    expect(without).not.toMatch(/^EXIT:/);
    expect(without).toMatch(/quiet hinge/);
    const withReserve = run(data, proj, 'tells', '--skill', 'voice', '--learn', '--probe', '3', '--include-reserved', ...MODEL());
    expect(withReserve).not.toMatch(/^EXIT:/);
    expect(withReserve).toMatch(/Learned 0 phrase/);
    expect(withReserve).not.toMatch(/quiet hinge/);
  }, 120_000);
});
