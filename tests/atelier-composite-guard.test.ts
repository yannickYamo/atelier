// tests/atelier-composite-guard.test.ts — TWO CONTRADICTORY RULES NEVER BOTH INSTRUCT, BY ANY ROUTE.
//
// Defects a reviewer reproduced, each held here:
//   six authors, `--conflict 20=A` (and the run's other answers): "Avoid headings; let paragraphs carry the structure."
//   was chosen by that answer while "Use short headings." was taken by admiration in another conflict, and both shipped;
//   the same class of failure by two more routes: two rules with no class in common were never compared, and a "both"
//   range whose widened limit contradicts a third rule; all three are caught by one final guard over the rules that
//   will instruct (core/composite/selection.ts);
//   a value banned only somewhere ("avoid the first person in headings") read as a ban everywhere; a negated plain verb
//   ("do not cite sources") read as narrowing, not banning;
//   admiring a class took a rule that only mentions its words (a bullet-list ban that says "sentences" taken as pace);
//   the keyword reading of a line lacked the words rules are sorted by (lists, headings, numbered steps);
//   an author line said "until you answer them" of conflicts already answered; a side kept and shown by a worded
//   "both" was said to be "set aside"; the count of open questions said "neither side instructs" where one side did;
//   a range's example showed its carrier's observation alone.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Measurement, Requirement } from '../core/state/canonical-state.js';
import { buildTraitTable, relationOf, primaryClassOf, type TraitClass } from '../core/composite/traits.js';
import { keywordClasses } from '../core/composite/admire.js';
import { composeSelection, describeComposite, standOf, guardInstructing, type CompositeAuthor, type CompositeDecision, type CompositeRecord, type ConflictAnswer } from '../core/composite/selection.js';
import { decisionsFor, openLine, rangeEvidence } from '../cli/commands/composite.js';

const rule = (id: string, statement: string, measurement: Measurement | null = null, evidence: string | null = null): Requirement => ({
  requirementId: id, statement, appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null,
  ...(measurement ? { measurement } : {}),
});
const worded = (statement: string): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement, kind: 'GENERATIVE' });
/** A rule that will instruct the writer: chosen, not merely shown, and not carried in another rule's range. */
const instructs = (d: CompositeDecision | undefined): boolean => d?.outcome === 'SELECTED' && !d.shownOnly && !d.mergedInto;
const author = (name: string, classes: TraitClass[], admired: string | null = classes.length ? 'what I like' : null): CompositeAuthor => ({ name, pieces: [`${name}.md`], admired, classes });

/** Every pair of rules that will instruct, from two authors, that the detector reads as contradicting, and is not a pair the person answered "both". */
function contradictionsLeft(rec: CompositeRecord, proposals: readonly Requirement[]): string[] {
  const byId = new Map(proposals.map((p) => [p.requirementId, p]));
  const live = rec.decisions.filter((d) => instructs(d));
  const read = (id: string, range: Measurement | undefined): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement: byId.get(id)?.statement ?? '', measurement: range ?? byId.get(id)?.measurement, kind: 'GENERATIVE' });
  const out: string[] = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i]; const b = live[j];
    if (a.author === b.author || relationOf(read(a.id, a.range), read(b.id, b.range)) !== 'CONFLICT') continue;
    const both = rec.conflicts.some((c) => c.answer === 'both' && c.resolvedBy === 'ANSWER' && c.sides.some((s) => s.id === a.id) && c.sides.some((s) => s.id === b.id));
    if (!both) out.push(`${a.id} (${a.author}) / ${b.id} (${b.author})`);
  }
  return out;
}

// ── SIX AUTHORS, AS THE REVIEWER RAN THEM ──────────────────────────────────────────────────────
interface Six { admired: Record<string, string>; classes: Record<string, TraitClass[]>; rules: { id: string; author: string; statement: string; measurement?: Measurement; evidence?: string }[] }
const SIX = JSON.parse(readFileSync(new URL('./fixtures/composite/six-authors.json', import.meta.url), 'utf8')) as Six;
const sixRules = SIX.rules.map((r) => rule(r.id, r.statement, r.measurement ?? null, r.evidence ?? null));
const sixSource = Object.fromEntries(SIX.rules.map((r) => [r.id, r.author]));
const sixTable = buildTraitTable(sixRules, (id) => sixSource[id]);
const sixAuthors = Object.keys(SIX.admired).map((name) => author(name, SIX.classes[name] ?? [], SIX.admired[name]));
const sixStatement = (id: string): string => sixRules.find((p) => p.requirementId === id)?.statement ?? id;
const RUN: Record<number, ConflictAnswer> = { 3: 'B', 17: 'B', 18: 'B', 20: 'A', 23: 'both', 36: 'both', 42: 'A', 47: 'both' };

describe('six authors: the answer to one conflict and admiration in another never ship a contradiction', () => {
  it('the table is the one the reviewer answered: conflict 20 is "Avoid headings" against "Give every section a heading"', () => {
    expect(sixTable.conflicts.length).toBe(57);
    expect(sixTable.conflicts[19].sides.map((s) => s.statement)).toEqual(['Avoid headings; let paragraphs carry the structure.', 'Give every section a heading.']);
  });
  for (const [label, answers] of [['--conflict 20=A', { 20: 'A' }], ['the run\'s eight answers', RUN]] as const) {
    it(`${label}: "Avoid headings…" instructs, "Use short headings." does not`, () => {
      const rec = composeSelection(sixTable, sixRules, sixAuthors, answers);
      const ds = new Map(decisionsFor(rec, sixRules, new Map(), new Map()).map((d) => [d.id, d]));
      expect(ds.get('p13')).toMatchObject({ decision: 'APPROVE', materiality: 'REQUIRED' });
      expect(ds.get('p44')?.decision).toBe('REJECT');
      expect(rec.decisions.find((d) => d.id === 'p44')).toMatchObject({ outcome: 'REJECTED', settledBy: { n: 20, how: 'ANSWER' } });
      expect(contradictionsLeft(rec, sixRules)).toEqual([]);
      // the screen says what was built: conflict 21 (bram against faro on headings) stands with bram, by the answer to 20
      const c21 = rec.conflicts[20];
      expect(c21.sides.map((s) => s.id)).toEqual(['p13', 'p44']);
      expect(standOf(c21, rec.decisions.find((d) => d.id === 'p13'), rec.decisions.find((d) => d.id === 'p44'))).toBe('→ bram (your answer to conflict 20)');
      const screen = describeComposite(rec, sixStatement).join('\n');
      expect(screen).not.toMatch(/both stand: bram/);
      expect(screen).not.toMatch(/p44 +Use short headings\./);
    });
  }
  it('on any answers to the first conflicts, no two rules that instruct contradict', () => {
    const choices: (ConflictAnswer | undefined)[] = ['A', 'B', 'both', undefined];
    let seed = 7;
    const next = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
    for (let k = 0; k < 40; k++) {
      const given: Record<number, ConflictAnswer> = {};
      for (let n = 1; n <= 57; n++) { const v = choices[next() % 4]; if (v && next() % 3 === 0) given[n] = v; }
      const rec = composeSelection(sixTable, sixRules, sixAuthors, given);
      expect(contradictionsLeft(rec, sixRules), JSON.stringify(given)).toEqual([]);
    }
  });
  it('an author line never asks for an answer already given', () => {
    const rec = composeSelection(sixTable, sixRules, sixAuthors, RUN);
    const screen = describeComposite(rec, sixStatement);
    const open = new Set(rec.conflicts.filter((c) => c.answer === null).map((c) => c.n));
    for (const line of screen.filter((l) => l.includes('until you answer') && /^ {2}\w+: "/.test(l))) {
      const ns = (/in conflict ([\d, ]+), so/.exec(line)?.[1] ?? '').split(',').map((x) => Number(x.trim()));
      for (const n of ns) expect(open.has(n), line).toBe(true);
      for (const n of Object.keys(RUN).map(Number)) expect(ns.includes(n), line).toBe(false);
    }
  });
  it('the count of open questions is true after the guard: "neither side instructs" only where neither does', () => {
    const rec = composeSelection(sixTable, sixRules, sixAuthors, RUN);
    const byId = new Map(rec.decisions.map((d) => [d.id, d]));
    const stands = (id: string): boolean => { const d = byId.get(id); return instructs(d) || (d?.mergedInto !== undefined && instructs(byId.get(d.mergedInto))); };
    const unanswered = rec.conflicts.filter((c) => c.answer === null);
    const neither = unanswered.filter((c) => !c.sides.some((s) => stands(s.id)));
    const line = openLine(rec);
    expect(line).toContain(` ${neither.length} conflict(s) kept as open question(s); neither side instructs.`);
    expect(line).toContain(` ${unanswered.length - neither.length} more unanswered, where one side stands by your answer to another conflict.`);
  });
  it('a merged range\'s example shows each contributing author\'s observation', () => {
    const rec = composeSelection(sixTable, sixRules, sixAuthors, RUN);
    const carriers = rec.decisions.filter((d) => d.range && d.outcome === 'SELECTED');
    expect(carriers.length).toBeGreaterThan(0);
    const ev = rangeEvidence(rec, sixRules);
    for (const d of carriers) {
      const merged = rec.decisions.filter((x) => x.mergedInto === d.id && sixRules.find((p) => p.requirementId === x.id)?.measurement);
      const authors = [...new Set([d.author, ...merged.map((x) => x.author)])];
      if (authors.length < 2) continue;
      const text = ev.get(d.id) ?? '';
      for (const a of authors) {
        const own = SIX.rules.find((r) => r.author === a && (r.id === d.id || merged.some((x) => x.id === r.id)))?.evidence ?? '';
        expect(text).toContain(`${a}: ${own}`);
      }
    }
  });
});

// ── THREE ROUTES, ONE GUARD ────────────────────────────────────────────────────────────────────
//   route 1, admiration in another conflict: bram's "Avoid headings" is chosen over cleo's by an answer; faro, admired
//     for structure, wins his own conflict with bram by admiration;
//   route 2, no class in common: ada's "Use emoji freely." (a method rule: it names no class) and dee's "Never use
//     emoji; keep the tone plain." (voice) are never paired by the table; each is admired;
//   route 3, a counted band: kai's and lena's sentence bands answered "both" make one range up to forty words, while
//     otto, admired for pace, holds sentences to fifteen.
const ROUTES = [
  rule('h1', 'Avoid headings; let paragraphs carry the structure.'), rule('h2', 'Give every section a heading.'), rule('h3', 'Use short headings.'),
  rule('e1', 'Use emoji freely.'), rule('e2', 'Never use emoji; keep the tone plain.'),
  rule('s1', 'I keep sentences short: a median under 10 words, and nine in ten under 15.', { observer: 'SENTENCE_LENGTH', params: { medianMax: 10, p90Max: 15 } }, 'your median is 8 words'),
  rule('s2', 'I keep sentences short: a median under 30 words, and nine in ten under 40.', { observer: 'SENTENCE_LENGTH', params: { medianMax: 30, p90Max: 40 } }, 'your median is 26 words'),
  rule('s3', 'Never more than fifteen words in a sentence.'),
];
const ROUTE_SRC: Record<string, string> = { h1: 'bram', h2: 'cleo', h3: 'faro', e1: 'ada', e2: 'dee', s1: 'kai', s2: 'lena', s3: 'otto' };
const routeTable = buildTraitTable(ROUTES, (id) => ROUTE_SRC[id]);
const ROUTE_AUTHORS = [author('ada', ['method']), author('bram', []), author('cleo', []), author('dee', ['voice']), author('faro', ['structure']),
  author('kai', []), author('lena', []), author('otto', ['pace'])];
const nOf = (x: string, y: string): number => routeTable.conflicts.find((c) => c.sides.some((s) => s.id === x) && c.sides.some((s) => s.id === y))?.n ?? -1;
const routeAnswers = (): Record<number, ConflictAnswer> => ({ [nOf('h1', 'h2')]: 'A', [nOf('s1', 's2')]: 'both' });
const routeStatement = (id: string): string => ROUTES.find((p) => p.requirementId === id)?.statement ?? id;

describe('three routes by which a contradiction could instruct, all caught by the final guard', () => {
  it('the table pairs what it pairs: emoji is never compared, and kai\'s band agrees with otto\'s fifteen words', () => {
    expect(nOf('e1', 'e2')).toBe(-1);
    expect(nOf('s1', 's3')).toBe(-1);
    expect(nOf('h1', 'h3')).toBeGreaterThan(0);
    expect(nOf('s2', 's3')).toBeGreaterThan(0);
    expect(relationOf(worded('Use emoji freely.'), worded('Never use emoji; keep the tone plain.'))).toBe('CONFLICT');
  });
  it('without the guard each route lets both sides instruct', () => {
    // the guard is the last step: undo it by reading what it was handed, the rules each route made instruct
    const rec = composeSelection(routeTable, ROUTES, ROUTE_AUTHORS, routeAnswers());
    const handed = rec.decisions.map((d): CompositeDecision => (['h3', 'e1', 'e2', 's3'].includes(d.id) ? { ...d, outcome: 'SELECTED' as const } : d.id === 's1' ? { ...d, outcome: 'SELECTED' as const, range: { observer: 'SENTENCE_LENGTH', params: { medianMax: 30, p90Max: 40 } } } : d));
    expect(contradictionsLeft({ ...rec, decisions: handed }, ROUTES).sort()).toEqual(['e1 (ada) / e2 (dee)', 'h1 (bram) / h3 (faro)', 's1 (kai) / s3 (otto)']);
  });
  it('with it: the side an answer chose stands, and a pair nobody decided is an open question', () => {
    const rec = composeSelection(routeTable, ROUTES, ROUTE_AUTHORS, routeAnswers());
    const d = (id: string) => rec.decisions.find((x) => x.id === id);
    expect(contradictionsLeft(rec, ROUTES)).toEqual([]);
    // route 1: bram's ban stands by the answer; faro's short headings are set aside, naming that answer
    expect(d('h1')?.outcome).toBe('SELECTED');
    expect(d('h3')).toMatchObject({ outcome: 'REJECTED', settledBy: { n: nOf('h1', 'h2'), how: 'ANSWER' } });
    // route 3: the range stands by the answer "both"; otto's fifteen words are set aside
    expect(d('s1')).toMatchObject({ outcome: 'SELECTED', range: { observer: 'SENTENCE_LENGTH', params: { medianMax: 30, p90Max: 40 } } });
    expect(d('s3')?.outcome).toBe('REJECTED');
    // route 2: nobody answered, so neither instructs, and the pair is asked under a number after the table's
    const n = routeTable.conflicts.length + 1;
    expect(d('e1')).toMatchObject({ outcome: 'OPEN', openIn: n });
    expect(d('e2')).toMatchObject({ outcome: 'OPEN', openIn: n });
    const asked = rec.conflicts.find((c) => c.n === n);
    expect(asked).toMatchObject({ answer: null, foundLast: true });
    expect(asked?.sides.map((s) => s.id)).toEqual(['e1', 'e2']);
    const screen = describeComposite(rec, routeStatement).join('\n');
    expect(screen).toContain(`  ${n}. `);
    expect(screen).toContain(`→ open: neither instructs. answer with --conflict ${n}=A, ${n}=B or ${n}=both`);
    expect(openLine(rec)).toContain(' 1 conflict(s) kept as open question(s); neither side instructs.');
    expect(screen).toContain(`  ada: "what I like": what carries that is in conflict ${n}, so nothing is taken from this author until you answer it.`);
    expect(screen).toContain(`  faro: "what I like": what carries that was set aside by your answer to conflict ${nOf('h1', 'h2')}, so nothing is taken from this author.`);
    const ds = new Map(decisionsFor(rec, ROUTES, new Map(), new Map()).map((x) => [x.id, x.decision]));
    expect([ds.get('h3'), ds.get('s3'), ds.get('e1'), ds.get('e2')]).toEqual(['REJECT', 'REJECT', 'REJECT', 'REJECT']);
    expect([ds.get('h1'), ds.get('s1')]).toEqual(['APPROVE', 'APPROVE']);
  });
  it('the question the guard asked is answered like any other', () => {
    const n = routeTable.conflicts.length + 1;
    const rec = composeSelection(routeTable, ROUTES, ROUTE_AUTHORS, { ...routeAnswers(), [n]: 'B' });
    expect(rec.decisions.find((x) => x.id === 'e2')?.outcome).toBe('SELECTED');
    expect(rec.decisions.find((x) => x.id === 'e1')).toMatchObject({ outcome: 'REJECTED', settledBy: { n, how: 'ANSWER' } });
    expect(contradictionsLeft(rec, ROUTES)).toEqual([]);
  });
  it('"both" still lets both stand, and the screen says so', () => {
    const n = routeTable.conflicts.length + 1;
    const rec = composeSelection(routeTable, ROUTES, ROUTE_AUTHORS, { ...routeAnswers(), [n]: 'both' });
    const e1 = rec.decisions.find((x) => x.id === 'e1'); const e2 = rec.decisions.find((x) => x.id === 'e2');
    expect(instructs(e1) && instructs(e2)).toBe(true);
    const c = rec.conflicts.find((x) => x.n === n);
    expect(c && standOf(c, e1, e2)).toMatch(/^→ both stand: ada \(.*\) and dee \(.*\)$/);
    expect(openLine(rec)).toBe('');
  });
  it('the guard on a decided set: a pair answered "both" is left as the person said', () => {
    const rec = composeSelection(routeTable, ROUTES, ROUTE_AUTHORS, { [nOf('h1', 'h3')]: 'both' });
    const forced = rec.decisions.map((d) => (d.id === 'h1' || d.id === 'h3' ? { ...d, outcome: 'SELECTED' as const, shownOnly: undefined } : d));
    const byId = new Map(ROUTES.map((p) => [p.requirementId, p]));
    const out = guardInstructing(forced, rec.conflicts, byId, { [nOf('h1', 'h3')]: 'both' });
    expect(out.decisions.filter((d) => d.id === 'h1' || d.id === 'h3').map((d) => d.outcome)).toEqual(['SELECTED', 'SELECTED']);
  });
  it('a side kept and shown by a worded "both" is said to be kept, shown; not set aside', () => {
    const rec = composeSelection(routeTable, ROUTES, ROUTE_AUTHORS, { [nOf('h1', 'h3')]: 'both', [nOf('h1', 'h2')]: 'B' });
    const h1 = rec.decisions.find((x) => x.id === 'h1'); const h3 = rec.decisions.find((x) => x.id === 'h3');
    const c = rec.conflicts[nOf('h1', 'h3') - 1];
    const line = standOf(c, h1, h3);
    if (h3?.shownOnly) expect(line).not.toMatch(/faro set aside/);
    if (h1?.shownOnly) expect(line).not.toMatch(/bram set aside/);
    const words = [rule('w1', 'Use contractions freely.'), rule('w2', 'Never use contractions.'), rule('w3', 'Write in the first person.')];
    const src: Record<string, string> = { w1: 'ann', w2: 'bob', w3: 'bob' };
    const t = buildTraitTable(words, (id) => src[id]);
    const r2 = composeSelection(t, words, [author('ann', []), author('bob', ['voice'])], { 1: 'both' });
    const w1 = r2.decisions.find((x) => x.id === 'w1'); const w2 = r2.decisions.find((x) => x.id === 'w2');
    expect(w1?.shownOnly && w2?.shownOnly).toBe(true);
    expect(standOf(r2.conflicts[0], w1, w2)).toBe('→ both kept, shown and not instructed (your answer)');
    // and one kept, shown, against one set aside elsewhere, is said as kept
    const mixed = standOf(r2.conflicts[0], w1, { ...(w2 ?? w1), outcome: 'REJECTED', shownOnly: undefined, settledBy: { n: 9, how: 'ANSWER' } } as NonNullable<typeof w1>);
    expect(mixed).toMatch(/^→ neither instructs: ann kept, shown and not instructed \(your answer\), bob set aside \(your answer to conflict 9\)/);
  });
});

// ── WHAT A RULE SAYS, READ RIGHT ──────────────────────────────────────────────────────────────
describe('a value banned only somewhere is scoped; a plain verb negated is a ban', () => {
  const compatible: [string, string][] = [
    ['Use a casual tone.', 'Avoid a casual tone in headings.'],
    ['Use American spelling.', 'Avoid American spelling in quotations.'],
    ['Write in the present tense.', 'Avoid the present tense in captions.'],
    ['Write in the first person.', 'Avoid the first person in headings.'],
    ['Keep a formal tone.', 'Avoid a casual tone in headings.'],
    ['Use examples.', 'Never invent examples.'],
    ['Cite sources.', 'Never cite a source without a date.'],
  ];
  for (const [a, b] of compatible) it(`compatible: ${a} / ${b}`, () => { expect(relationOf(worded(a), worded(b))).not.toBe('CONFLICT'); expect(relationOf(worded(b), worded(a))).not.toBe('CONFLICT'); });
  const opposed: [string, string][] = [
    ['Cite a source for every claim.', 'Do not cite sources.'],
    ['Quote sources.', 'Never quote sources.'],
    ['Use headings.', 'Do not use headings.'],
    ['Write in the first person.', 'Avoid the first person.'],
    ['Use a casual tone.', 'Avoid a casual tone.'],
  ];
  for (const [a, b] of opposed) it(`opposed: ${a} / ${b}`, () => { expect(relationOf(worded(a), worded(b))).toBe('CONFLICT'); expect(relationOf(worded(b), worded(a))).toBe('CONFLICT'); });
});

describe('admiring a class takes the rules mainly about it', () => {
  it('what a rule is mainly about is the first class it names', () => {
    expect(primaryClassOf(worded('Never use bullet lists; carry items in sentences.'))).toBe('structure');
    expect(primaryClassOf(worded('Let a paragraph run to seven sentences when the argument needs room.'))).toBe('pace');
    expect(primaryClassOf(worded('Never more than fifteen words in a sentence.'))).toBe('pace');
    expect(primaryClassOf(worded('Avoid contractions in headings.'))).toBe('voice');
  });
  it('esme, admired for "the long patient paragraphs", gives her paragraphs and not her ban on bullet lists', () => {
    const rec = composeSelection(sixTable, sixRules, sixAuthors, RUN);
    const p36 = rec.decisions.find((d) => d.id === 'p36');
    expect(p36?.cls).toBe('structure');
    expect(p36?.admired).toBeUndefined();
    expect(p36?.outcome).not.toBe('SELECTED');
  });
});

describe('the keyword reading of a line uses the words rules are sorted by', () => {
  const ALL = ['opening', 'structure', 'evidence', 'pace', 'voice', 'method'] as const;
  it('lists, headings and numbered steps are structure', () => {
    expect(keywordClasses('the bullet lists', ALL)).toEqual(['structure']);
    expect(keywordClasses('its numbered steps and headings', ALL)).toEqual(['structure']);
    expect(keywordClasses('the warm voice and the short headings', ALL)).toEqual(['structure', 'voice']);
    expect(keywordClasses('the casual tone, the bullet lists and the headings', ALL)).toEqual(['structure', 'voice']);
  });
});
