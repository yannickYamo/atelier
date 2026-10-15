// cli/commands/composite.ts — THE COMBINATION, WHEN THE PIECES ARE BY SEVERAL VOICES: INFERRED, NEVER ASKED.
//
//   atelier new ./pieces-i-like "an essay that combines what I like about each"
//
// The voices were told apart at intake: declared (front matter, a folder per author, --authors), or found in the
// writing itself (core/composite/voices.ts). Discovery read each voice on its own (./discover.ts) and sorted the
// proposals into a trait table (core/composite/traits.ts). This step weighs every rule (core/composite/infer.ts), takes
// each voice's most characteristic, keeps what every voice shows as method, settles every clash by which side is more
// characteristic (core/composite/selection.ts), rules on every proposal through the same `applyDecisions` the
// single-author review uses, and says ONE line. Nothing is asked and nothing is left open; the whole table is in the
// run's record and `atelier report --skill <name>`, and `atelier fix "<what was wrong>"` changes any of it.

import { die, flagAll, flagEach, loadSession, saveSession, sha, runFile, canReach, clientFor, proposerModel, numericFlag, type Session } from '../runtime.js';
import { existsSync } from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { readJson } from '../../core/state/read-json.js';
import type { Requirement } from '../../core/state/canonical-state.js';
import { suggestAll, modeFromIntent, type Suggestion, type SkillMode } from '../../core/ratification/suggest.js';
import { buildTraitTable, type TraitClass, type TraitTable } from '../../core/composite/traits.js';
import { weighTraits, inferredChoice, inferenceRecord, likingIn } from '../../core/composite/infer.js';
import { quantitiesOf, describeQuantity } from '../../core/composite/quantity.js';
import { lengthMeasuresOf } from '../../core/composite/length.js';
import { readAdmiration, keywordClasses, type AdmireLine } from '../../core/composite/admire.js';
import { composeSelection, instructs, openStanding, type CompositeAuthor, type CompositeRecord, type ConflictAnswer, type ModelPair, type ModelQuantity } from '../../core/composite/selection.js';
import { readInstructionLines, type InstructionLine } from '../../core/composite/contradictions.js';
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
 * `--admire <file or voice>=<what you like>`, each kept whole (a line has commas in it). A piece names its voice;
 * several lines for one voice are joined; a line with no name (`--admire "the openings"`) is about every voice. An
 * unknown name is refused, not guessed.
 */
export function parseAdmire(given: readonly string[], authors: AuthorMap): Record<string, string> {
  const lower = (x: string): string => x.toLowerCase().replace(/^\.\//, '');
  const stem = (id: string): string => id.split('/').pop()?.replace(/\.[^.]+$/, '') ?? id;
  const out: Record<string, string[]> = {};
  for (const g of given) {
    const eq = g.indexOf('=');
    if (eq < 0) { const text = g.trim(); if (text) for (const n of authors.names) out[n] = [...(out[n] ?? []), text]; continue; }
    if (eq === 0) die(`--admire takes <file or voice>=<what you like about it>, or just what you like; got "${g}".`);
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
    if (canReach('discovery')) console.log(`(what you said you like could not be read by the model: ${(e as Error).message.split('\n')[0]}; it was read by its words instead, which is cruder.)`);
    read = { classes: Object.fromEntries(lines.map((l) => [l.author, keywordClasses(l.text, l.available)])), via: 'KEYWORDS' };
  }
  saveSession({ ...loadSession(), admireRead: { key, classes: read.classes, via: read.via } });
  return read;
}

/** Said under the build line when no model read the final instructions for contradictions. */
export const KEYWORD_ONLY_NOTE = 'clashes between voices were found by keyword only: a whole-piece structure rule may still sit beside a structure it rules out; atelier report --skill <name> lists what instructs';

/** The model's one reading of the final instructions: the pairs it names, and the quantities it read (absent in a reading kept before it read them). */
interface ContradictionRead { readonly key: string; readonly pairs: readonly ModelPair[]; readonly quantities?: readonly ModelQuantity[]; readonly via: 'MODEL' | 'KEYWORDS' }
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
 * THE FINAL INSTRUCTIONS, READ ONCE BY A MODEL for pairs that cannot both be followed and for the quantities they state
 * (core/composite/contradictions.ts), and kept with the run under a hash of the list: a continuation with the same list,
 * and every rebuild, read nothing again. With no model, or a reading that failed, the screen says the check was by
 * keyword only.
 */
async function readInstructions(lines: readonly InstructionLine[]): Promise<{ pairs: readonly ModelPair[]; quantities: readonly ModelQuantity[]; via: 'MODEL' | 'KEYWORDS' | 'NONE' }> {
  if (!canReach('discovery')) return { pairs: [], quantities: [], via: 'KEYWORDS' };
  if (new Set(lines.map((l) => l.author)).size < 2) return { pairs: [], quantities: [], via: 'NONE' };
  const key = sha(JSON.stringify(lines.map((l) => [l.id, l.author, l.statement])));
  const stored = storedContradictions();
  if (stored?.key === key) return { pairs: stored.pairs, quantities: stored.quantities ?? [], via: stored.via };
  let read: ContradictionRead;
  try {
    const r = await readInstructionLines(clientFor(proposerModel()), { spentUsd: 0, capUsd: numericFlag('--cap', 3.0), maxCalls: 1 }, lines);
    read = { key, pairs: r.pairs, quantities: r.quantities, via: 'MODEL' };
  } catch (e) {
    console.log(`(the instructions could not be read by the model: ${(e as Error).message.split('\n')[0]})`);
    read = { key, pairs: [], quantities: [], via: 'KEYWORDS' };
  }
  writeAtomic(contradictionFile(), JSON.stringify(read, null, 1));
  return { pairs: read.pairs, quantities: read.quantities ?? [], via: read.via };
}

/** A length the request names for the piece, as a person would say it; null when it names none. */
export function requestLength(request: string | null | undefined): string | null {
  const q = request ? quantitiesOf(request).find((x) => x.measure === 'piece') : undefined;
  return q ? describeQuantity(q) : null;
}

/**
 * THE COMPOSITE, INFERRED: nothing is asked and no screen is shown. Each voice's rules are weighed (how consistently
 * it shows them, how unlike the other voices and a plain draft they are, and anything the person said they like:
 * core/composite/infer.ts), each voice's most characteristic are taken, what every voice shows is method, and every
 * clash goes to the side that weighs more (core/composite/selection.ts). Every proposal is ruled through the same
 * `applyDecisions` the single-author review uses, each ruling naming the voice it came from and why. One line is said;
 * the whole table goes in the run's record and `atelier report --skill`. Returns whether a standard's worth of
 * decisions was recorded, as `review` does, so `atelier new` goes on to build.
 *
 * What the person did say outranks inference: an optional preference (`--admire <voice or piece>=<words>`, or
 * `--admire "<words>"` for every voice, or a sentence of liking in the request) weighs the matching rules up; a hidden
 * expert override, `--conflict <n>=A|B|both`, settles a clash their way; `--set <id>=required` makes a rule instruct.
 */
export async function compositeReview(_opts: ReviewOptions = {}): Promise<boolean> {
  let s = loadSession();
  const authors = s.authors ?? die('these pieces are by one voice: there is nothing to combine.');
  const done = new Set(s.decided.map((d) => d.requirementId));
  const pending = s.proposals.filter((p) => !done.has(p.requirementId));
  if (!pending.length) return s.decided.length > 0;
  const table = traitTable(s);

  // ── WHAT THE PERSON SAID THEY LIKE, IF ANYTHING: NEVER ASKED FOR ──────────────────────────────
  const given = parseAdmire(flagEach('--admire'), authors);
  const admire: Record<string, string> = { ...(s.admire ?? {}), ...given };
  if (JSON.stringify(admire) !== JSON.stringify(s.admire ?? {})) { saveSession({ ...s, admire }); s = loadSession(); }
  // A line given with --admire is read as such lines always are (by a model when one is set up); a sentence of liking
  // in the request is read by its words alone, so a request that names nothing it likes costs nothing.
  const lines: AdmireLine[] = authors.names.map((name) => ({ author: name, text: admire[name] ?? '', available: availableOf(table, name) }));
  const read = await readLines(s, lines);
  s = loadSession();
  const liking = likingIn(s.intent?.text);
  const fromRequest = Object.fromEntries(authors.names.map((n) => [n, liking ? keywordClasses(liking, availableOf(table, n)) : []]));
  const liked: Record<string, TraitClass[]> = Object.fromEntries(authors.names.map((n) => [n, [...new Set([...(read.classes[n] ?? []), ...(fromRequest[n] ?? [])])]]));
  // What was said is recorded only where it named something a voice's rules carry.
  const said: Record<string, string> = Object.fromEntries(authors.names.flatMap((n) => {
    const t = [read.classes[n]?.length ? admire[n] : undefined, fromRequest[n]?.length ? liking : undefined].filter(Boolean).join('; ');
    return t ? [[n, t]] : [];
  }));

  // ── THE WEIGHTS, AND WHAT THEY TAKE ─────────────────────────────────────────────────────────
  const weights = weighTraits(table, pending, (id) => s.proposalMeta?.[id], authors, liked);
  const length = requestLength(s.intent?.text);
  const inferred = inferredChoice(weights, authors, { requestLength: length, pieceLength: new Set(pending.filter((p) => lengthMeasuresOf(p).includes('piece')).map((p) => p.requirementId)) });
  const compAuthors: CompositeAuthor[] = authors.names.map((name) => ({ name, pieces: piecesOf(authors, name), admired: admire[name] ?? null, classes: liked[name] ?? [] }));
  // What the person said explicitly outranks inference: a hidden expert's answer to a clash, a --set.
  const answered = { ...(s.conflictAnswers ?? {}), ...parseConflictAnswers(flagAll('--conflict'), Math.max(table.conflicts.length, 99)) };
  if (JSON.stringify(answered) !== JSON.stringify(s.conflictAnswers ?? {})) { saveSession({ ...s, conflictAnswers: answered }); s = loadSession(); }
  const answers = Object.fromEntries(Object.entries(answered).filter((e): e is [string, ConflictAnswer] => e[1] !== null).map(([k, v]) => [Number(k), v]));
  const ids = new Set(pending.map((p) => p.requirementId));
  const fromFlags = parseChanges(flagAll('--set').join(' '), ids);
  if (fromFlags.errors.length) die(fromFlags.errors.join('\n'));
  const changes = fromFlags.changes;
  const forced = new Set([...changes].filter(([, v]) => v === 'required').map(([k]) => k));
  // The keyword guard first; then the rules that would instruct are read once by a model for pairs that cannot both
  // be followed, and any it names is settled the same way, by weight.
  const first = composeSelection(table, pending, compAuthors, answers, { forced, inferred });
  const reading = await readInstructions(instructionLines(first, s.proposals));
  const composed = reading.pairs.length || reading.quantities.length
    ? composeSelection(table, pending, compAuthors, answers, { forced, inferred, modelPairs: reading.pairs, modelQuantities: reading.quantities }) : first;
  const preference = Object.keys(said).length ? { said, classes: liked, via: read.via === 'NONE' ? 'KEYWORDS' : read.via } : null;
  const record: CompositeRecord = { ...composed, inference: inferenceRecord(composed, authors, s.voices ?? null, weights, preference, length) };

  // ── THE RULINGS ─────────────────────────────────────────────────────────────────────────────
  const mode: SkillMode = s.intent?.mode ?? modeFromIntent(s.intent?.text ?? '').mode;
  const sugg = suggestionsByAuthor(pending, s, mode);
  // A range's rule shows what each voice's pieces showed of it, not its carrier's alone.
  const ranged = rangeEvidence(record, s.proposals);
  if (ranged.size) { saveSession({ ...loadSession(), proposals: s.proposals.map((p) => (ranged.has(p.requirementId) ? { ...p, evidence: ranged.get(p.requirementId) ?? p.evidence } : p)) }); s = loadSession(); }
  applyDecisions(decisionsFor(record, pending, sugg, changes));
  saveSession({ ...loadSession(), composite: record });
  writeAtomic(runFile('composite-inference.json'), JSON.stringify(record.inference, null, 1));
  console.log(`\n${record.inference?.line ?? ''}`);
  if (reading.via === 'KEYWORDS' && new Set(instructionLines(record, s.proposals).map((l) => l.author)).size > 1) console.log(`  (${KEYWORD_ONLY_NOTE})`);
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
    // INFERRED (core/composite/infer.ts): taken as the most characteristic of its voice, its method, or the side of a
    // clash that was more characteristic. It instructs as a chosen rule does, and its ruling says it was inferred.
    const inferred = Boolean(d?.inferred && d.outcome === 'SELECTED' && !d.shownOnly);
    const counted = Boolean(p.measurement ?? d?.range);
    const weight = !d || decision === 'REJECT' ? null
      : owners || inferred ? (counted ? 'PREFERRED' : 'REQUIRED')
        : d.outcome === 'HABIT' || d.shownOnly ? 'PREFERRED'
          : s?.decision === 'APPROVE' && s.materiality ? s.materiality : 'PREFERRED';
    const target = counted ? ', a counted target that steers and never fails a draft' : '';
    const saidBy = owners ? `selected by you ${from}${target}` : inferred ? `inferred ${from}${target}` : `composite, ${from}`;
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
