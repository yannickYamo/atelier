// cli/commands/composite.ts — THE PREFERENCE STEP, WHEN THE PIECES ARE BY SEVERAL AUTHORS.
//
//   atelier new ./five-writers "an essay that combines what I like" \
//     --admire ada.md="the way it opens with a question" --admire bea.md="how deep the evidence goes"
//
// Discovery has read each author on their own (./discover.ts) and sorted the proposals into a trait table
// (core/composite/traits.ts). This step asks one thing per author, "What do you like about this one?", reads every
// line in one model call (core/composite/admire.ts), and shows ONE screen: what is taken from whom, the conflicts
// and how each stands, and what is kept as a habit or set aside (core/composite/selection.ts). Accepting it rules
// on every proposal through the same `applyDecisions` the single-author review uses, each ruling naming the author
// and pieces it came from. A conflict nobody answered stays a stored question: neither side instructs.
//
// Nothing is guessed. A line nobody gave selects nothing; `--yes` goes on with the lines given (none, if none).

import { createInterface } from 'node:readline';
import { die, argv, flagAll, flagEach, loadSession, saveSession, orchestrated, sha, runFile, canReach, clientFor, proposerModel, numericFlag, type Session } from '../runtime.js';
import { existsSync } from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { readJson } from '../../core/state/read-json.js';
import type { Measurement, Requirement } from '../../core/state/canonical-state.js';
import { suggestAll, modeFromIntent, type Suggestion, type SkillMode } from '../../core/ratification/suggest.js';
import { buildTraitTable, describeTraitCounts, TRAIT_LABEL, type TraitClass, type TraitTable } from '../../core/composite/traits.js';
import { readAdmiration, keywordClasses, type AdmireLine } from '../../core/composite/admire.js';
import { composeSelection, describeComposite, instructs, openQuestions, openStanding, type CompositeAuthor, type CompositeRecord, type ConflictAnswer, type ModelPair } from '../../core/composite/selection.js';
import { readContradictions, type InstructionLine } from '../../core/composite/contradictions.js';
import type { AuthorMap } from '../../core/composite/authors.js';
import { formatMeasure } from './amend.js';
import { restateLimits } from '../../core/observers/derive.js';
import { applyDecisions, type RatificationDecision } from './ratify.js';
import { parseChanges, type ReviewOptions } from './review.js';

const WEIGHTS: Readonly<Record<string, string>> = {
  required: 'REQUIRED', preferred: 'PREFERRED', exemplar: 'EXEMPLAR_ONLY', tolerated: 'TOLERATED', incidental: 'INCIDENTAL',
};

/** The pieces of each author, by id, in the order the map lists them. */
const piecesOf = (authors: AuthorMap, name: string): string[] => Object.keys(authors.of).filter((id) => authors.of[id] === name);

/**
 * `--admire <file or author>=<what you like>`, each kept whole (a line has commas in it). A piece names its author;
 * several lines for one author are joined. An unknown name is refused, not guessed.
 */
export function parseAdmire(given: readonly string[], authors: AuthorMap): Record<string, string> {
  const lower = (x: string): string => x.toLowerCase().replace(/^\.\//, '');
  const stem = (id: string): string => id.split('/').pop()?.replace(/\.[^.]+$/, '') ?? id;
  const out: Record<string, string[]> = {};
  for (const g of given) {
    const eq = g.indexOf('=');
    if (eq <= 0) die(`--admire takes <file or author>=<what you like about it>; got "${g}".`);
    const key = lower(g.slice(0, eq).trim()); const text = g.slice(eq + 1).trim();
    const author = authors.names.find((n) => lower(n) === key)
      ?? authors.of[Object.keys(authors.of).find((id) => [id, id.split('/').pop() ?? id, stem(id)].map(lower).includes(key)) ?? ''];
    if (!author) die(`--admire: "${g.slice(0, eq)}" is not one of the pieces or authors here (${authors.names.join(', ')}).`);
    if (text) out[author] = [...(out[author] ?? []), text];
  }
  return Object.fromEntries(Object.entries(out).map(([a, t]) => [a, t.join('; ')]));
}

/** `--conflict 2=A`, `2=B`, `2=both`, `2=later` (left open). Anything else is refused. */
export function parseConflictAnswers(given: readonly string[], count: number): Record<number, ConflictAnswer | null> {
  const out: Record<number, ConflictAnswer | null> = {};
  for (const g of given) {
    const m = /^(\d+)=(a|b|both|later)$/i.exec(g.trim());
    if (!m || Number(m[1]) < 1 || Number(m[1]) > count) return die(`--conflict takes <number>=A, B, both or later, for a conflict 1 to ${count} on the screen; got "${g}".`);
    const v = m[2].toLowerCase();
    out[Number(m[1])] = v === 'later' ? null : v === 'both' ? 'both' : (v.toUpperCase() as ConflictAnswer);
  }
  return out;
}

/** The trait table discovery stored with the run, or the same table built again from the proposals. */
function traitTable(s: Session): TraitTable {
  const f = runFile('trait-table.json');
  if (existsSync(f)) return readJson<TraitTable>(f, { what: 'the trait table', requireKeys: ['rows', 'conflicts'] });
  return buildTraitTable(s.proposals, (id) => s.proposalMeta?.[id]?.source);
}

/** The classes each author's rules fall in: what a line about them can select. */
const availableOf = (table: TraitTable, name: string): TraitClass[] => [...new Set(table.rows.filter((r) => r.author === name).flatMap((r) => r.classes))];

/**
 * THE LINES READ INTO CLASSES: once, by the model, and kept with the run under a hash of the lines, so a continuation
 * reads nothing again. With no model, or a reading that failed, the words are read by a keyword table and that is said.
 */
async function readLines(s: Session, lines: readonly AdmireLine[]): Promise<{ classes: Record<string, TraitClass[]>; via: 'MODEL' | 'KEYWORDS' | 'NONE' }> {
  if (!lines.some((l) => l.text.trim())) return { classes: Object.fromEntries(lines.map((l) => [l.author, []])), via: 'NONE' };
  const key = sha(JSON.stringify(lines.map((l) => [l.author, l.text.trim(), [...l.available]])));
  if (s.admireRead?.key === key) return { classes: Object.fromEntries(Object.entries(s.admireRead.classes).map(([a, c]) => [a, [...c]])), via: s.admireRead.via };
  let read: { classes: Record<string, TraitClass[]>; via: 'MODEL' | 'KEYWORDS' };
  try {
    if (!canReach('discovery')) throw new Error('no model is set up');
    read = { classes: await readAdmiration(clientFor(proposerModel()), { spentUsd: 0, capUsd: numericFlag('--cap', 3.0), maxCalls: 1 }, lines), via: 'MODEL' };
  } catch (e) {
    console.log(`(what you said could not be read by the model: ${(e as Error).message.split('\n')[0]}; it was read by its words instead, which is cruder.)`);
    read = { classes: Object.fromEntries(lines.map((l) => [l.author, keywordClasses(l.text, l.available)])), via: 'KEYWORDS' };
  }
  saveSession({ ...loadSession(), admireRead: { key, classes: read.classes, via: read.via } });
  return read;
}

/** Said on the composite screen when no model read the final instructions for contradictions. */
export const KEYWORD_ONLY_LINE = 'Contradictions between authors are checked by keyword only; read the instructions below.';

interface ContradictionRead { readonly key: string; readonly pairs: readonly ModelPair[]; readonly via: 'MODEL' | 'KEYWORDS' }
const contradictionFile = (): string => runFile('composite-contradictions.json');
const storedContradictions = (): ContradictionRead | null => {
  const f = contradictionFile();
  return existsSync(f) ? readJson<ContradictionRead>(f, { what: 'the reading of the composite\'s instructions', requireKeys: ['key', 'pairs', 'via'] }) : null;
};

/** The rules that will instruct, as the writer would be told them: a range at its merged limits. */
export function instructionLines(record: CompositeRecord, proposals: readonly Requirement[]): InstructionLine[] {
  const byId = new Map(proposals.map((p) => [p.requirementId, p]));
  return record.decisions.filter(instructs).flatMap((d) => {
    const p = byId.get(d.id);
    if (!p) return [];
    const statement = d.range && p.measurement ? restateLimits(p.statement, p.measurement, d.range) ?? p.statement : p.statement;
    return [{ id: d.id, author: d.author, statement }];
  });
}

/**
 * THE FINAL INSTRUCTIONS, READ ONCE BY A MODEL for pairs that cannot both be followed (core/composite/contradictions.ts),
 * and kept with the run under a hash of the list: a continuation with the same list, and every rebuild, read nothing
 * again. With no model, or a reading that failed, the screen says the check was by keyword only.
 */
async function readInstructions(lines: readonly InstructionLine[]): Promise<{ pairs: readonly ModelPair[]; via: 'MODEL' | 'KEYWORDS' | 'NONE' }> {
  if (!canReach('discovery')) return { pairs: [], via: 'KEYWORDS' };
  if (new Set(lines.map((l) => l.author)).size < 2) return { pairs: [], via: 'NONE' };
  const key = sha(JSON.stringify(lines.map((l) => [l.id, l.author, l.statement])));
  const stored = storedContradictions();
  if (stored?.key === key) return { pairs: stored.pairs, via: stored.via };
  let read: ContradictionRead;
  try {
    read = { key, pairs: await readContradictions(clientFor(proposerModel()), { spentUsd: 0, capUsd: numericFlag('--cap', 3.0), maxCalls: 1 }, lines), via: 'MODEL' };
  } catch (e) {
    console.log(`(the instructions could not be read by the model: ${(e as Error).message.split('\n')[0]})`);
    read = { key, pairs: [], via: 'KEYWORDS' };
  }
  writeAtomic(contradictionFile(), JSON.stringify(read, null, 1));
  return read;
}

/** Ask, in a terminal, for the lines not given. Enter says nothing about that author. */
async function askLines(authors: AuthorMap, have: Record<string, string>): Promise<Record<string, string>> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const out = { ...have };
  try {
    for (const name of authors.names) {
      if (out[name]) continue;
      const said = (await new Promise<string>((res) => { rl.question(`What do you like about ${name} (${piecesOf(authors, name).join(', ')})? `, res); })).trim();
      if (said) out[name] = said;
    }
  } finally { rl.close(); }
  return out;
}

/**
 * Show the composite screen and, when the person accepts, rule on every proposal. Returns whether a standard's worth
 * of decisions was recorded, as `review` does, so `atelier new` knows whether to build.
 */
export async function compositeReview(opts: ReviewOptions = {}): Promise<boolean> {
  let s = loadSession();
  const authors = s.authors ?? die('these pieces are by one author: there is no composite to choose.');
  const done = new Set(s.decided.map((d) => d.requirementId));
  const pending = s.proposals.filter((p) => !done.has(p.requirementId));
  if (!pending.length) return s.decided.length > 0;
  const table = traitTable(s);

  // ── WHAT THE PERSON LIKES ABOUT EACH ─────────────────────────────────────────────────────────
  const given = parseAdmire(flagEach('--admire'), authors);
  let admire: Record<string, string> = { ...(s.admire ?? {}), ...given };
  let accepted = argv.includes('--accept');
  const yes = argv.includes('--yes');
  if (!accepted && !yes && process.stdin.isTTY && authors.names.some((n) => !admire[n])) {
    console.log(`\n${authors.names.length} authors, each read on its own. One line each: what do you like about this one? (Enter: nothing)`);
    admire = await askLines(authors, admire);
  }
  if (JSON.stringify(admire) !== JSON.stringify(s.admire ?? {})) { saveSession({ ...s, admire }); s = loadSession(); }

  if (!Object.keys(admire).length && !yes) {
    printAsk(authors, table, opts.continueWith);
    return false;
  }

  const lines: AdmireLine[] = authors.names.map((name) => ({ author: name, text: admire[name] ?? '', available: availableOf(table, name) }));
  const read = await readLines(s, lines);
  s = loadSession();

  // ── THE CONFLICTS' ANSWERS, KEPT WITH THE RUN UNTIL ACCEPTED ─────────────────────────────────
  // The numbers a person may answer are the conflicts on the screen: the table's, and any the final guard found
  // among the rules that would instruct (core/composite/selection.ts), numbered after them.
  const compAuthors: CompositeAuthor[] = authors.names.map((name) => ({ name, pieces: piecesOf(authors, name), admired: admire[name] ?? null, classes: read.classes[name] ?? [] }));
  const answersOf = (all: Record<number, ConflictAnswer | null>): Record<number, ConflictAnswer> =>
    Object.fromEntries(Object.entries(all).filter((e): e is [string, ConflictAnswer] => e[1] !== null).map(([k, v]) => [Number(k), v]));
  // A rule the person makes required with --set is their latest word: it goes through the same guard as every rule
  // that will instruct, and wins over an answer given before it (core/composite/selection.ts).
  const ids = new Set(pending.map((p) => p.requirementId));
  const fromFlags = parseChanges(flagAll('--set').join(' '), ids);
  if (fromFlags.errors.length) die(fromFlags.errors.join('\n'));
  const changes = fromFlags.changes;
  const forcedOf = (): Set<string> => new Set([...changes].filter(([, v]) => v === 'required').map(([k]) => k));
  const shown = composeSelection(table, pending, compAuthors, answersOf(s.conflictAnswers ?? {}), { forced: forcedOf(), modelPairs: storedContradictions()?.pairs ?? [] });
  const answered = { ...(s.conflictAnswers ?? {}), ...parseConflictAnswers(flagAll('--conflict'), Math.max(table.conflicts.length, shown.conflicts.length)) };
  if (JSON.stringify(answered) !== JSON.stringify(s.conflictAnswers ?? {})) { saveSession({ ...s, conflictAnswers: answered }); s = loadSession(); }
  const answers = answersOf(answered);
  // The guard by keyword first; then the rules that would instruct are read once by the model, and what it finds is asked.
  const compose = async (): Promise<{ record: CompositeRecord; via: 'MODEL' | 'KEYWORDS' | 'NONE' }> => {
    const forced = forcedOf();
    const first = composeSelection(table, pending, compAuthors, answers, { forced });
    const read = await readInstructions(instructionLines(first, s.proposals));
    return { record: read.pairs.length ? composeSelection(table, pending, compAuthors, answers, { forced, modelPairs: read.pairs }) : first, via: read.via };
  };
  let { record, via } = await compose();
  const statementOf = (id: string): string => s.proposals.find((p) => p.requirementId === id)?.statement ?? id;
  const measurementOf = (id: string): Measurement | undefined => s.proposals.find((p) => p.requirementId === id)?.measurement ?? undefined;

  // ── THE ONE SCREEN ───────────────────────────────────────────────────────────────────────────
  const mode: SkillMode = s.intent?.mode ?? modeFromIntent(s.intent?.text ?? '').mode;
  const sugg = suggestionsByAuthor(pending, s, mode);
  // THE SCREEN IS PRINTED BEFORE ANYTHING IS RECORDED, unless this very composite was printed by an earlier call:
  // a continuation that brings new lines or answers changes it, and only the person may make it theirs.
  const editorial = pending.filter((p) => p.measurement?.observer === 'GRAMMAR').map((p) => `Every author: ${p.requirementId}  ${p.statement}  (REQUIRED: the editorial rule every build carries)`);
  const screenOf = (r: CompositeRecord, v: typeof via): string[] => {
    const lines = describeComposite(r, statementOf, measurementOf);
    return [...lines.slice(0, 2), ...(v === 'KEYWORDS' ? [KEYWORD_ONLY_LINE] : []), ...lines.slice(2), ...editorial];
  };
  const screen = screenOf(record, via);
  const screenKey = sha(screen.join('\n'));
  if (!accepted || !opts.shownBefore || s.compositeShown !== screenKey) {
    console.log('');
    if (read.via === 'KEYWORDS') console.log('(your lines were read by their words, not by a model)');
    for (const l of screen) console.log(l);
    console.log('');
    saveSession({ ...loadSession(), compositeShown: screenKey }); s = loadSession();
  }
  if (!accepted && process.stdin.isTTY) {
    const before = [...forcedOf()].join(' ');
    accepted = await promptAccept(ids, changes);
    // A rule made required at the prompt goes through the guard too, and what changed is shown before it is recorded.
    if (accepted && [...forcedOf()].join(' ') !== before) {
      ({ record, via } = await compose());
      for (const l of record.notes ?? []) console.log(l);
    }
  }
  if (!accepted) {
    printHowToAccept(opts.continueWith, record);
    return false;
  }

  // A range's rule shows what each author's pieces showed of it, not its carrier's alone.
  const ranged = rangeEvidence(record, s.proposals);
  if (ranged.size) { saveSession({ ...loadSession(), proposals: s.proposals.map((p) => (ranged.has(p.requirementId) ? { ...p, evidence: ranged.get(p.requirementId) ?? p.evidence } : p)) }); s = loadSession(); }
  applyDecisions(decisionsFor(record, pending, sugg, changes));
  saveSession({ ...loadSession(), composite: record });
  console.log((changes.size ? `Your changes: ${[...changes].map(([k, v]) => `${k} → ${v}`).join(' · ')}. ` : '')
    + `Your composite is recorded: ${record.decisions.filter((d) => d.outcome === 'SELECTED').length} rule(s) chosen.` + openLine(record));
  if (!orchestrated()) console.log('To build it: atelier new <the same folder> --accept');
  return true;
}

/** The open questions, said as they stand after the final guard: "neither side instructs" only of those where it is true. */
export function openLine(record: CompositeRecord): string {
  const { neither, oneSide } = openStanding(record);
  return (neither.length ? ` ${neither.length} conflict(s) kept as open question(s); neither side instructs.` : '')
    + (oneSide.length ? ` ${oneSide.length} more unanswered, where one side stands by your answer to another conflict.` : '');
}

/**
 * THE OBSERVATION BEHIND A RANGE: one line per author whose limit it carries ("ada: your median is 3 words…"), so the
 * rule's example shows each contributing author's pieces, not its carrier's alone. By id, for the carriers only.
 */
export function rangeEvidence(record: CompositeRecord, proposals: readonly Requirement[]): Map<string, string> {
  const out = new Map<string, string>();
  const byId = new Map(proposals.map((p) => [p.requirementId, p]));
  for (const d of record.decisions) {
    if (!d.range || d.outcome !== 'SELECTED') continue;
    const members = [d, ...record.decisions.filter((x) => x.mergedInto === d.id && byId.get(x.id)?.measurement)];
    const lines = members.flatMap((m) => { const e = byId.get(m.id)?.evidence; return e ? [`${m.author}: ${e}`] : []; });
    if (lines.length > 1) out.set(d.id, [...new Set(lines)].join('\n'));
  }
  return out;
}

/** Suggestions made per author, over that author's pieces alone: a count is never held to another author's corpus. */
function suggestionsByAuthor(pending: readonly Requirement[], s: Session, mode: SkillMode): Map<string, Suggestion> {
  const out = new Map<string, Suggestion>();
  const groups = new Map<string, Requirement[]>();
  for (const p of pending) { const a = s.proposalMeta?.[p.requirementId]?.source ?? ''; groups.set(a, [...(groups.get(a) ?? []), p]); }
  for (const g of groups.values()) {
    const { suggestions } = suggestAll(g, s.proposalMeta, mode);
    g.forEach((p, i) => out.set(p.requirementId, suggestions[i]));
  }
  return out;
}

/**
 * THE RULINGS.
 *   Selected by the person's own line about its author, or the side they chose in a conflict (`--conflict n=A`), and
 *     accepted here: the OWNER'S WORD, not inferred evidence. A
 *     worded rule is ratified REQUIRED, so it instructs the writer; a counted one is a target the drafts are steered and
 *     chosen by and never a failure (PREFERRED), until the person makes it required with `--set`. Its ruling says
 *     "selected by you from <author>".
 *   Chosen otherwise ("both" of two statements, kept and shown): the weight its own author's evidence
 *     suggests, as any proposal.
 *   A habit: approved, shown and not instructed. Set aside, or one side of an open conflict: rejected, with the reason.
 * Nothing here makes a counted rule blocking: only the person's `--set` does.
 */
export function decisionsFor(record: CompositeRecord, pending: readonly Requirement[], sugg: ReadonlyMap<string, Suggestion>, changes: ReadonlyMap<string, string>): RatificationDecision[] {
  const piecesFor = new Map(record.authors.map((a) => [a.name, a.pieces]));
  const byId = new Map(record.decisions.map((d) => [d.id, d]));
  return pending.map((p) => {
    // THE OWNER'S EDITORIAL RULE (core/observers/grammar.ts): no author's trait, so no row; REQUIRED on every build,
    // the composite's included, and changed only by the person's own --set.
    if (p.measurement?.observer === 'GRAMMAR') {
      const suggested = { decision: 'APPROVE' as const, materiality: 'REQUIRED' as const, why: 'the editorial rule every build carries, across every author: corrected in place where the checker is sure, never a word of anyone\'s voice' };
      const c = changes.get(p.requirementId);
      if (c === 'reject') return { id: p.requirementId, decision: 'REJECT', suggested };
      return { id: p.requirementId, decision: 'APPROVE', materiality: c && c in WEIGHTS ? WEIGHTS[c] : 'REQUIRED', suggested };
    }
    const d = byId.get(p.requirementId);
    const s = sugg.get(p.requirementId);
    const from = d ? `from ${d.author} (${(piecesFor.get(d.author) ?? []).join(', ')})` : 'from no author';
    // A habit keeps the evidence's ruling: one its author's own pieces argue against is rejected, as in any review.
    const decision: 'APPROVE' | 'REJECT' = !d || d.outcome === 'REJECTED' || d.outcome === 'OPEN' || (d.outcome === 'HABIT' && s?.decision === 'REJECT') ? 'REJECT' : 'APPROVE';
    const owners = Boolean(d?.byAdmiration && d.outcome === 'SELECTED' && !d.shownOnly);
    const counted = Boolean(p.measurement ?? d?.range);
    const weight = !d || decision === 'REJECT' ? null
      : owners ? (counted ? 'PREFERRED' : 'REQUIRED')
        : d.outcome === 'HABIT' || d.shownOnly ? 'PREFERRED'
          : s?.decision === 'APPROVE' && s.materiality ? s.materiality : 'PREFERRED';
    const saidBy = owners ? `selected by you ${from}${counted ? ', a counted target that steers and never fails a draft' : ''}` : `composite, ${from}`;
    const suggested = { decision, materiality: weight, why: `${saidBy}: ${d?.why ?? 'no trait row'}${s ? `; evidence: ${s.why}` : ''}` };
    const range = d?.range ? formatMeasure(d.range) : null;
    // The rule that carries both limits says the limits it is checked against, not its own author's alone.
    const restated = d?.range && p.measurement ? restateLimits(p.statement, p.measurement, d.range) : null;
    const said = restated && restated !== p.statement ? { statement: restated } : {};
    const c = changes.get(p.requirementId);
    if (c === 'reject') return { id: p.requirementId, decision: 'REJECT', suggested };
    // A rule made required that the guard still kept from instructing (it cannot be followed with another rule the
    // person made required, or the model's reading asks about it): it stays out until that conflict is answered.
    if (c === 'required' && d && (d.outcome === 'OPEN' || d.outcome === 'REJECTED') && !d.mergedInto) {
      return { id: p.requirementId, decision: 'REJECT', suggested: { ...suggested, why: `--set ${p.requirementId}=required could not instruct: ${d.why}` } };
    }
    if (c) return { id: p.requirementId, decision: 'APPROVE', materiality: c in WEIGHTS ? WEIGHTS[c] : weight ?? 'PREFERRED', suggested, ...(range ? { measure: range, ...said } : {}), ...(s?.needs ? { needs: s.needs } : {}) };
    if (decision === 'REJECT') return { id: p.requirementId, decision: 'REJECT', suggested };
    return { id: p.requirementId, decision: 'APPROVE', materiality: weight ?? 'PREFERRED', suggested, ...(range ? { measure: range, ...said } : {}), ...(s?.needs ? { needs: s.needs } : {}) };
  });
}

function printAsk(authors: AuthorMap, table: TraitTable, continueWith: string | undefined): void {
  console.log(`\n${describeTraitCounts(table)}.`);
  console.log('Your skill is the combination you choose, so nothing is chosen yet. For each author, say what you like about their pieces:');
  for (const name of authors.names) {
    const classes = availableOf(table, name).map((c) => TRAIT_LABEL[c]);
    console.log(`  ${name.padEnd(14)} ${piecesOf(authors, name).join(', ')}   (read: ${classes.join('; ') || 'nothing'})`);
  }
  const cmd = continueWith ?? 'atelier new <the same folder>';
  const first = authors.names[0] ?? 'author';
  console.log(`Then:  ${cmd} --admire ${/\s/.test(first) ? `"${first}"` : first}="<what you like about this author>" --admire …`);
  console.log(`  (--yes goes on with no line for an author: nothing is taken from them alone)`);
}

function printHowToAccept(continueWith: string | undefined, record: CompositeRecord): void {
  const cmd = continueWith ? `${continueWith} --accept` : 'atelier new <the same folder> --accept';
  const open = openQuestions(record);
  console.log('Nothing was decided. When you are ready:');
  console.log(`  ${cmd}   accept this composite${continueWith ? ', and build' : ''}`);
  if (open.length) { const n = open[0].reopened?.in ?? open[0].n; console.log(`  ${cmd} --conflict ${n}=A   answer a conflict first (A, B, both, or later: left open)`); }
  console.log(`  ${cmd} --set <id>=required   make a chosen rule instruct, or <id>=reject to drop one`);
}

async function promptAccept(ids: ReadonlySet<string>, changes: Map<string, string>): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (await new Promise<string>((res) => { rl.question('Enter to accept this composite · or type changes (p3=required p5=reject) · q to stop: ', res); })).trim();
      if (answer.toLowerCase() === 'q') return false;
      if (!answer) return true;
      const { changes: more, errors } = parseChanges(answer, ids);
      for (const e of errors) console.log(`  ${e}`);
      for (const [k, v] of more) { changes.set(k, v); console.log(`  ${k} → ${v}`); }
    }
  } finally { rl.close(); }
}
