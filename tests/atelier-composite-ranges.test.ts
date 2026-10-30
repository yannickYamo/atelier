// tests/atelier-composite-ranges.test.ts — TWO WORDED RULES ON ONE QUANTITY, AND WHAT THE SCREEN ASKS.
//
// Defects a reviewer reproduced with four and five authors, each held here:
//   two worded rules were compared by their bounds and their words only, never as ranges: "Keep the whole piece under
//   300 words.", "Write at least 800 words." and "Keep the piece between 400 and 600 words." all instructed at once;
//   two ceilings on one length ("at most six sentences" against "3 sentences at most") were a conflict, though a
//   paragraph of three meets both;
//   a pair the model read as contradicting, one side already held open by another such pair, left the other side
//   instructing, and the screen printed "→ sol ()" or credited an answer the person never gave to that pair;
//   the count of open questions was not the number the screen showed open;
//   `--conflict` (now a hidden expert override) given after the skill was built was dropped without a word.
// Since then, two authors' lengths on one measure are asked whether or not their ranges meet: only two counted bands are
// judged by their numbers (tests/atelier-composite-length-asked.test.ts).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Measurement, Requirement } from '../core/state/canonical-state.js';
import { buildTraitTable, relationOf, type TraitClass, TRAIT_CLASSES } from '../core/composite/traits.js';
import { composeSelection, describeComposite, instructs, openStanding, standOf, type CompositeAuthor, type CompositeRecord, type ConflictAnswer, type ModelPair } from '../core/composite/selection.js';
import { openLine, KEYWORD_ONLY_NOTE } from '../cli/commands/composite.js';

const rule = (id: string, statement: string, measurement: Measurement | null = null): Requirement => ({
  requirementId: id, statement, appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null,
  ...(measurement ? { measurement } : {}),
});
const worded = (statement: string): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement, kind: 'GENERATIVE' });
const counted = (statement: string, measurement: Measurement): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement, measurement, kind: 'GENERATIVE' });
const everything = (name: string): CompositeAuthor => ({ name, pieces: [`${name}.md`], admired: 'everything', classes: [...TRAIT_CLASSES] });
const authorOf = (name: string, classes: readonly TraitClass[], admired: string | null): CompositeAuthor => ({ name, pieces: [`${name}.md`], admired, classes: [...classes] });

interface Built { rules: Requirement[]; source: Record<string, string> }
const built = (by: Record<string, readonly (string | [string, Measurement])[]>): Built => {
  const rules: Requirement[] = []; const source: Record<string, string> = {};
  let k = 0;
  for (const [who, list] of Object.entries(by)) for (const x of list) {
    const id = `r${++k}`; source[id] = who;
    rules.push(typeof x === 'string' ? rule(id, x) : rule(id, x[0], x[1]));
  }
  return { rules, source };
};
const statementOf = (b: Built) => (id: string): string => b.rules.find((r) => r.requirementId === id)?.statement ?? id;
/** The line under each conflict on the screen, and what it says of that conflict. */
const asked = (rec: CompositeRecord): { n: number; stand: string; open: boolean }[] => {
  const by = new Map(rec.decisions.map((d) => [d.id, d]));
  return rec.conflicts.map((c) => {
    const stand = standOf(c, by.get(c.sides[0].id), by.get(c.sides[1].id));
    return { n: c.n, stand, open: stand.startsWith('→ open') || (stand.startsWith('→ neither instructs') && stand.includes(`--conflict ${c.n}=A`)) };
  });
};

// ── 1. WORDED AGAINST WORDED, AS RANGES ─────────────────────────────────────────────────────────
describe('two worded rules on one quantity are compared as ranges', () => {
  it('ranges that do not meet conflict, on piece length, sentence length and paragraph length', () => {
    for (const [a, b] of [
      ['Keep the whole piece under 300 words.', 'Write at least 800 words.'],
      ['Keep the whole piece under 300 words.', 'Keep the piece between 400 and 600 words.'],
      ['Write at least 800 words.', 'Keep the piece between 400 and 600 words.'],
      ['Keep sentences under ten words.', 'Write sentences of about thirty words.'],
      ['Keep each paragraph to a single sentence.', 'Let each paragraph run to at least six sentences.'],
      ['Never more than eight words in a sentence.', 'Write sentences of thirty words or more.'],
      ['Keep each paragraph to a single sentence.', 'Write long paragraphs.'],
    ]) {
      expect(relationOf(worded(a), worded(b)), `${a} / ${b}`).toBe('CONFLICT');
      expect(relationOf(worded(b), worded(a)), `${b} / ${a}`).toBe('CONFLICT');
    }
  });
  it('ranges that overlap are asked all the same: whether two wordings meet is not read from their words', () => {
    for (const [a, b] of [
      ['Write at least 300 words.', 'Keep the piece under 900 words.'],
      ['Keep the piece between 400 and 600 words.', 'Write at least 500 words.'],
      ['Let each paragraph run to at least six sentences.', 'Keep paragraphs to at most six sentences.'],
      ['Write sentences of about thirty words.', 'Write long sentences.'],
    ]) expect(relationOf(worded(a), worded(b)), `${a} / ${b}`).toBe('CONFLICT');
  });
  it('the reviewer\'s four authors: no two of the piece-length rules instruct together', () => {
    const b = built({
      pia: ['Use short paragraphs.', 'Keep the whole piece under 300 words.', 'Keep sentences under ten words.'],
      quin: ['Let each paragraph run to at least six sentences.', 'Write at least 800 words.', 'Write sentences of about thirty words.'],
      rosa: ['Keep paragraphs to at most six sentences.', 'Write long paragraphs.'],
      sol: ['Keep each paragraph to a single sentence.', 'Keep the piece between 400 and 600 words.'],
    });
    const table = buildTraitTable(b.rules, (id) => b.source[id]);
    const pairs = table.conflicts.map((c) => c.sides.map((s) => s.statement).join(' / '));
    expect(pairs).toEqual(expect.arrayContaining([
      'Keep the whole piece under 300 words. / Write at least 800 words.',
      'Keep the whole piece under 300 words. / Keep the piece between 400 and 600 words.',
      'Write at least 800 words. / Keep the piece between 400 and 600 words.',
      'Keep sentences under ten words. / Write sentences of about thirty words.',
      'Let each paragraph run to at least six sentences. / Keep each paragraph to a single sentence.',
      'Write long paragraphs. / Keep each paragraph to a single sentence.',
    ]));
    const rec = composeSelection(table, b.rules, ['pia', 'quin', 'rosa', 'sol'].map(everything));
    const on = new Set(rec.decisions.filter(instructs).map((d) => statementOf(b)(d.id)));
    for (const s of ['Keep the whole piece under 300 words.', 'Write at least 800 words.', 'Keep the piece between 400 and 600 words.',
      'Keep each paragraph to a single sentence.', 'Keep sentences under ten words.', 'Write sentences of about thirty words.']) expect(on.has(s), s).toBe(false);
    // what overlaps is asked too: rosa's six sentences at most against quin's six at least and sol's single sentence
    expect(on.has('Keep paragraphs to at most six sentences.')).toBe(false);
    expect([...on].sort()).toEqual([]);
  });
});

// ── 2. TWO CEILINGS NEVER CONFLICT ──────────────────────────────────────────────────────────────
describe('two counted ceilings on one length are compatible; said in words, they are asked', () => {
  const paragraphs = (n: number): Measurement => ({ observer: 'PARAGRAPH_LENGTH', params: { maxSentences: n } });
  const sentences = (median: number, p90: number): Measurement => ({ observer: 'SENTENCE_LENGTH', params: { medianMax: median, p90Max: p90 } });
  it('"at most six sentences" against "3 sentences at most": compatible counted, asked when either is worded', () => {
    expect(relationOf(counted('I keep paragraphs to 6 sentences at most.', paragraphs(6)), counted('I keep paragraphs to 3 sentences at most.', paragraphs(3)))).not.toBe('CONFLICT');
    expect(relationOf(counted('I keep sentences short.', sentences(30, 30)), counted('I keep sentences short.', sentences(16, 16)))).not.toBe('CONFLICT');
    expect(relationOf(worded('Keep paragraphs to at most six sentences.'), counted('I keep paragraphs to 3 sentences at most.', paragraphs(3)))).toBe('CONFLICT');
    expect(relationOf(worded('Keep paragraphs to at most six sentences.'), worded('I keep paragraphs to 3 sentences at most.'))).toBe('CONFLICT');
    expect(relationOf(worded('Never more than 30 words in a sentence.'), counted('I keep sentences short: a median under 16 words, and nine in ten under 16.', sentences(16, 16)))).toBe('CONFLICT');
    expect(relationOf(worded('Keep sentences under 25 words.'), worded('Never more than 30 words in a sentence.'))).toBe('CONFLICT');
  });
  it('a floor above a ceiling still conflicts', () => {
    expect(relationOf(worded('Let each paragraph run to at least six sentences.'), counted('I keep paragraphs to 3 sentences at most.', paragraphs(3)))).toBe('CONFLICT');
    expect(relationOf(worded('Keep paragraphs to three sentences at most.'), worded('Give each paragraph at least five sentences.'))).toBe('CONFLICT');
  });
  it('the reviewer\'s fifteen pairs from four authors: no conflict but the lengths, and every other chosen rule instructs', () => {
    const shared = (median: number): [string, Measurement][] => [
      ['I hedge rarely: at most 2 hedging words per thousand.', { observer: 'HEDGE_RATE', params: { maxPer1000: 2 } }],
      ['I keep paragraphs to 3 sentences at most.', paragraphs(3)],
      [`I keep sentences short: a median under ${median} words, and nine in ten under ${median}.`, sentences(median, median)],
    ];
    const b = built({
      pia: ['Use British spelling.', 'Never use numbered lists.', 'Avoid contractions in headings.', 'Avoid headings that are questions.', 'Use short paragraphs.', 'Cite sources inline.', 'Use examples.', 'Keep a formal tone.', ...shared(16)],
      quin: ['Use contractions freely.', 'Use bullet lists for options.', 'Use short headings.', 'Keep paragraphs to at most six sentences.', 'Never cite a source without a date.', 'Never invent examples.', 'Avoid a casual tone in headings.', ...shared(16)],
      rosa: ['Use tables to compare options.', 'Write in the first person.', 'Never end on a question.', 'Use bullet lists.', 'Use semicolons.', 'Never use block quotes.', 'Keep sentences under 25 words.', 'Write at least 300 words.', ...shared(16)],
      sol: ['Never use tables with more than five columns.', 'Avoid the first person in headings.', 'Open with a question.', 'Avoid lists that run longer than seven items.', 'Avoid semicolons in headings.', 'Quote sources directly in the text.', 'Never more than 30 words in a sentence.', 'Keep the piece under 900 words.', ...shared(16)],
    });
    const table = buildTraitTable(b.rules, (id) => b.source[id]);
    // the lengths, each with the measure it states, worked out by hand; every other rule states none
    const LENGTHS: Readonly<Record<string, string>> = { 'Use short paragraphs.': 'paragraph', 'Keep paragraphs to at most six sentences.': 'paragraph',
      'I keep paragraphs to 3 sentences at most.': 'paragraph', 'Keep sentences under 25 words.': 'sentence', 'Never more than 30 words in a sentence.': 'sentence',
      'I keep sentences short: a median under 16 words, and nine in ten under 16.': 'sentence', 'Write at least 300 words.': 'piece', 'Keep the piece under 900 words.': 'piece' };
    const counts = (st: string): boolean => st.startsWith('I keep');
    const want = b.rules.flatMap((x, i) => b.rules.slice(i + 1).filter((y) => b.source[x.requirementId] !== b.source[y.requirementId]
      && LENGTHS[x.statement] !== undefined && LENGTHS[x.statement] === LENGTHS[y.statement] && !(counts(x.statement) && counts(y.statement)))
      .map((y) => `${x.statement} / ${y.statement}`)).sort();
    expect(table.conflicts.map((c) => c.sides.map((s) => s.statement).join(' / ')).sort()).toEqual(want);
    const rec = composeSelection(table, b.rules, ['pia', 'quin', 'rosa', 'sol'].map(everything));
    const chosen = rec.decisions.filter((d) => d.outcome === 'SELECTED');
    expect(chosen.length).toBeGreaterThan(20);
    expect(chosen.filter((d) => !instructs(d)).map((d) => d.id)).toEqual([]);
    const held = rec.decisions.filter((d) => d.outcome === 'OPEN').map((d) => statementOf(b)(d.id));
    expect(held.every((st) => LENGTHS[st] !== undefined)).toBe(true);
    expect(openStanding(rec).neither.length).toBeGreaterThan(0);
  });
});

// ── 3. A PAIR ASKED, ONE SIDE ALREADY HELD OPEN ─────────────────────────────────────────────────
describe('a pair the model named, one side held open by another pair', () => {
  // Three rules the keywords see nothing in; the model reads two pairs, both against the prose block.
  const b = built({ ada: ['Write the whole piece as one unbroken block of prose.'], bram: ['Use numbered lists for steps.'], cleo: ['Use subheadings inside long sections.'] });
  const table = buildTraitTable(b.rules, (id) => b.source[id]);
  const pairs: ModelPair[] = [{ a: 'r2', b: 'r1', reason: '"unbroken block of prose" against "numbered lists"' }, { a: 'r3', b: 'r1', reason: '"one unbroken block" against "subheadings"' }];
  it('neither side of either pair instructs, and no line prints an empty reason', () => {
    expect(table.conflicts).toEqual([]);
    const rec = composeSelection(table, b.rules, ['ada', 'bram', 'cleo'].map(everything), {}, { modelPairs: pairs });
    expect(rec.decisions.map((d) => d.outcome)).toEqual(['OPEN', 'OPEN', 'OPEN']);
    const screen = describeComposite(rec, statementOf(b)).join('\n');
    expect(screen).not.toMatch(/\(\)/);
    expect(asked(rec).map((x) => x.open)).toEqual([true, true]);
    expect(openLine(rec)).toBe(' 2 conflict(s) kept as open question(s); neither side instructs.');
  });
  it('a side chosen by an answer to another conflict is not credited with this one: it is open again', () => {
    // bram's lists and cleo's subheadings each won a keyword conflict by the person's answer; the model's pairs hold both
    const c = built({
      ada: ['Write the whole piece as one unbroken block of prose.'], bram: ['Use numbered lists for steps.'], cleo: ['Use subheadings inside long sections.'],
      dee: ['Never use lists.', 'Avoid headings.'],
    });
    const t = buildTraitTable(c.rules, (id) => c.source[id]);
    const nOf = (x: string, y: string): number => t.conflicts.find((k) => k.sides.some((s) => s.id === x) && k.sides.some((s) => s.id === y))?.n ?? -1;
    const answers: Record<number, ConflictAnswer> = { [nOf('r2', 'r4')]: 'A', [nOf('r3', 'r5')]: 'A' };
    expect(Object.keys(answers).map(Number).every((n) => n > 0)).toBe(true);
    const rec = composeSelection(t, c.rules, ['ada', 'bram', 'cleo', 'dee'].map(everything), answers, { modelPairs: pairs });
    expect(rec.decisions.filter(instructs).map((d) => d.id)).not.toEqual(expect.arrayContaining(['r3']));
    const lines = asked(rec);
    for (const x of lines.filter((l) => l.n > t.conflicts.length)) {
      expect(x.stand, `conflict ${x.n}`).not.toMatch(/your answer to conflict/);
      expect(x.open, `conflict ${x.n}`).toBe(true);
    }
    // the answer that chose cleo's subheadings is said to be open again, and counted
    const cleo = rec.conflicts.find((k) => k.n === nOf('r3', 'r5'));
    expect(cleo?.reopened?.in).toBeGreaterThan(t.conflicts.length);
    expect(openStanding(rec).neither.map((k) => k.n)).toContain(cleo?.n);
    expect(describeComposite(rec, statementOf(c)).join('\n')).not.toMatch(/\(\)/);
  });
});

// ── 4. THE COUNT IS WHAT THE SCREEN SHOWS ───────────────────────────────────────────────────────
interface Fixture { admired: Record<string, string>; classes: Record<string, TraitClass[]>; answers: Record<string, ConflictAnswer | null>; rules: { id: string; author: string; statement: string; measurement?: Measurement }[] }
const load = (name: string): { f: Fixture; rules: Requirement[]; table: ReturnType<typeof buildTraitTable>; authors: CompositeAuthor[]; answers: Record<number, ConflictAnswer> } => {
  const f = JSON.parse(readFileSync(new URL(`./fixtures/composite/${name}`, import.meta.url), 'utf8')) as Fixture;
  const rules = f.rules.map((r) => rule(r.id, r.statement, r.measurement ?? null));
  const src = Object.fromEntries(f.rules.map((r) => [r.id, r.author]));
  const names = [...new Set(f.rules.map((r) => r.author))];
  const answers = Object.fromEntries(Object.entries(f.answers).filter((e): e is [string, ConflictAnswer] => e[1] !== null).map(([k, v]) => [Number(k), v]));
  return { f, rules, table: buildTraitTable(rules, (id) => src[id]), authors: names.map((n) => authorOf(n, f.classes[n] ?? [], f.admired[n] ?? null)), answers };
};
describe('the count of open questions is the number the screen shows open', () => {
  it('five authors, no model: every count is a ceiling, so no two conflict, and nothing is counted open', () => {
    // Sentence bands from a median under 5 to under 40 words, paragraphs of at most 2 or 3 sentences, hedging at most 2
    // or 22 per thousand: a piece under the lower ceiling is under both, so none of the eleven pairs once shown is asked.
    const k = load('five-authors-keyless.json');
    expect(k.table.conflicts).toEqual([]);
    const rec = composeSelection(k.table, k.rules, k.authors, k.answers);
    expect(asked(rec).filter((x) => x.open)).toEqual([]);
    expect(openStanding(rec).neither).toEqual([]);
    expect(openLine(rec)).toBe('');
  });
  it('three authors with --set: one shown open, one counted, and nothing "more unanswered"', () => {
    const k = load('three-authors-set.json');
    const rec = composeSelection(k.table, k.rules, k.authors, k.answers, { forced: new Set(['p2', 'p8', 'p3']) });
    const shown = asked(rec).filter((x) => x.open).map((x) => x.n);
    expect(shown).toEqual([3]);
    expect(openLine(rec)).toBe(' 1 conflict(s) kept as open question(s); neither side instructs.');
  });
});

// ── 5. WHAT THE KEYLESS BUILD CANNOT SEE, SAID ──────────────────────────────────────────────────
describe('the keyless build note', () => {
  it('says a whole-piece structure rule may still sit beside a structure it rules out', () => {
    expect(KEYWORD_ONLY_NOTE).toMatch(/^clashes between voices were found by keyword only/);
    expect(KEYWORD_ONLY_NOTE).toContain('a whole-piece structure rule may still sit beside a structure it rules out');
  });
});

// ── 6. AN ANSWER AFTER THE BUILD ────────────────────────────────────────────────────────────────
describe('--conflict after the skill is built', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  const fm = (who: string, body: string): string => `---\nauthor: ${who}\n---\n${body}\n`;
  const base = mkdtempSync(join(tmpdir(), 'atelier-late-answer-'));
  const data = join(base, 'data'); const proj = join(base, 'proj');
  mkdirSync(join(proj, 'writers'), { recursive: true });
  writeFileSync(join(proj, 'writers', 'ada.md'), fm('Ada', Array.from({ length: 12 }, (_, i) => `Why does the keeper count the ships at dusk, night ${i + 1}? Because the harbour master asks.`).join('\n\n')));
  writeFileSync(join(proj, 'writers', 'ada2.md'), fm('Ada', Array.from({ length: 12 }, (_, i) => `Who rings the bell at the pier on morning ${i + 1}? The ferryman does, before the gulls wake.`).join('\n\n')));
  for (const [f, k] of [['cal.md', 0], ['cal2.md', 1]] as const) {
    writeFileSync(join(proj, 'writers', f), fm('Cal', Array.from({ length: 6 }, (_, p) => Array.from({ length: 7 }, (_, i) => `The long survey of the harbour recorded every arrival and departure across season ${k + 1}, and the clerk wrote each one down in the ledger kept by the door, line ${p * 7 + i + 1}.`).join(' ')).join('\n\n')));
  }
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_PROVIDER;
  const run = (...args: string[]): string => {
    try { return execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env }); } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
    }
  };
  const builtOut = run('new', 'writers', 'a harbour column', '--name', 'late', '--admire', 'ada.md=how it opens');
  const after = run('new', 'writers', '--conflict', '1=A');
  it('says plainly that the answer was not applied, and how to rebuild with it', () => {
    expect(builtOut).toMatch(/^Combined 2 writers: /m);
    expect(after).toContain('Continuing the run already in this project (state BUILT).');
    expect(after).toContain('--conflict 1=A: not applied. This skill is already built, with every clash settled when it was combined; an answer after the build needs a rebuild with the answer.');
    expect(after).toContain('    atelier abort\n');
    expect(after).toContain("    atelier new writers 'a harbour column' --name late --admire 'Ada=how it opens' --conflict 1=A\n");
  });
});
