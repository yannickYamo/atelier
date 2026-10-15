// atelier/core/composite/infer.ts — WHAT THE PERSON VALUES IN EACH VOICE, INFERRED FROM THE PIECES THEY CHOSE.
//
// Nobody is asked what they like. They gave these pieces because they like them, so what each voice does most
// consistently, and most unlike the others and a plain draft, is what they value in it. Every rule read from a voice
// (cli/commands/discover.ts, each voice on its own) gets a WEIGHT:
//
//   CONSISTENCY        how reliably the voice shows it, in [0, 1]:
//                        a rule checked on pieces its reader never saw: the share of them that show it
//                        a counted rule: the share of the voice's pieces inside its band
//                        a rule read in one pass: 0.4, and 0.2 more for each other vantage (A, B, C) that reached it,
//                        at most 0.8 (agreement between independent readings is all one pass has to go on)
//   DISTINCTIVENESS    how far it sits from the other voices and from a plain draft, in [0, 1]:
//                        from the other voices: 1 when no other voice shows it, falling to 0 when every voice does
//                        (a rule every voice shows is no voice's own: it is METHOD, below)
//                        from a plain draft (a counted rule, when plain drafts were written): the share of the drafts
//                        outside its band; the two are averaged. A worded rule is not compared with drafts, and its
//                        record says so
//   PREFERENCE         1.5 when the person said they like what the rule is mainly about (an optional --admire line, or
//                      a sentence of liking in the request), else 1. Never asked for
//
//   weight = consistency × distinctiveness × preference
//
// TAKEN: in each voice, every rule whose weight is at least SELECT_SHARE of that voice's highest and at least
// SELECT_FLOOR; and every rule all the voices show, as method. The rest is kept as habits, shown and not instructed.
// Clashes between voices go to the side that weighs more (./selection.ts, `settleByWeight`).
//
// Deterministic and free: nothing here calls a model. The weights are stored with the build, so a rebuild reads them
// and never weighs again.

import type { Requirement } from '../state/canonical-state.js';
import { primaryClassOf, TRAIT_LABEL, TRAIT_SHORT, type TraitClass, type TraitTable } from './traits.js';
import type { AuthorMap, AuthorsHow } from './authors.js';
import type { CompositeRecord, InferredChoice } from './selection.js';
import type { VoiceGrouping } from './voices.js';
import { EFFECT_READING } from '../discovery/framing.js';

/** A rule is taken when its weight is at least this share of its voice's highest... */
export const SELECT_SHARE = 0.6;
/** ...and at least this. */
export const SELECT_FLOOR = 0.25;
/** A stated liking multiplies a rule's weight by this. */
export const PREFERENCE_BOOST = 1.5;

/** What weighing a rule needs from discovery's record of it (cli/runtime.ts, ProposalMeta). */
export interface WeighMeta {
  readonly framings?: readonly string[];
  readonly heldOut?: { readonly applicable: number; readonly present: number } | null;
  readonly corpus?: { readonly pieces: number; readonly breaking: readonly number[] } | null;
  readonly vsDrafts?: { readonly drafts: number; readonly breaking: number } | null;
  readonly source?: string;
}

export interface TraitWeight {
  readonly id: string;
  readonly voice: string;
  readonly statement: string;
  readonly cls: TraitClass;
  readonly consistency: number;
  readonly consistencyBasis: string;
  readonly distinctiveness: number;
  readonly distinctivenessBasis: string;
  readonly preference: number;
  readonly weight: number;
  /** how many voices show it, its own included */
  readonly sharedBy: number;
  readonly chosen: boolean;
  /** every voice shows it: applied as method */
  readonly method: boolean;
  /** found only by the effect reading (framing C): not yet measured against an author's own list */
  readonly effectReading: boolean;
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * THE WEIGHTS. `liked` is the classes a stated preference names, by voice (empty when nothing was said). Rules with no
 * voice (the editorial rule every build carries) and a rule said twice by one voice (its repetition) are not weighed.
 */
export function weighTraits(table: TraitTable, proposals: readonly Requirement[], metaOf: (id: string) => WeighMeta | undefined,
  authors: AuthorMap, liked: Readonly<Record<string, readonly TraitClass[]>> = {}): TraitWeight[] {
  const k = authors.names.length;
  const byId = new Map(proposals.map((p) => [p.requirementId, p]));
  const rowOf = new Map(table.rows.map((r) => [r.id, r]));
  const conflictWith = new Map<string, Set<string>>();
  for (const c of table.conflicts) {
    const [a, b] = c.sides;
    conflictWith.set(a.id, new Set([...(conflictWith.get(a.id) ?? []), b.id]));
    conflictWith.set(b.id, new Set([...(conflictWith.get(b.id) ?? []), a.id]));
  }
  const rows = table.rows.flatMap((r) => { const p = r.sameAs ? undefined : byId.get(r.id); return p ? [{ r, p }] : []; });
  const weighed = rows.map(({ r, p }) => {
    const m = metaOf(r.id);
    // CONSISTENCY
    let consistency: number; let consistencyBasis: string;
    if (m?.heldOut && m.heldOut.applicable > 0) {
      consistency = m.heldOut.present / m.heldOut.applicable;
      consistencyBasis = `shown in ${m.heldOut.present} of ${m.heldOut.applicable} piece(s) its reader never saw`;
    } else if (p.measurement && m?.corpus && m.corpus.pieces > 0) {
      consistency = (m.corpus.pieces - m.corpus.breaking.length) / m.corpus.pieces;
      consistencyBasis = `${m.corpus.pieces - m.corpus.breaking.length} of ${m.corpus.pieces} piece(s) inside its band`;
    } else {
      const vantages = new Set(m?.framings ?? []).size;
      consistency = Math.min(0.8, 0.4 + 0.2 * Math.max(0, vantages - 1));
      consistencyBasis = `read in one pass${vantages ? ` by ${vantages} vantage(s)` : ''}, not checked on unseen pieces`;
    }
    // DISTINCTIVENESS, from the other voices: the voices that show a compatible rule.
    const clash = conflictWith.get(r.id) ?? new Set<string>();
    const others = new Set(r.with.filter((x) => !clash.has(x)).map((x) => rowOf.get(x)?.author).filter((a): a is string => Boolean(a) && a !== r.author));
    const sharedBy = 1 + others.size;
    const fromVoices = k > 1 ? 1 - others.size / (k - 1) : 1;
    let distinctiveness = fromVoices;
    let distinctivenessBasis = k > 1 ? (others.size ? `shown by ${others.size} of the ${k - 1} other voice(s)` : 'no other voice shows it') : 'one voice';
    if (p.measurement && m?.vsDrafts && m.vsDrafts.drafts >= 2) {
      const fromDrafts = m.vsDrafts.breaking / m.vsDrafts.drafts;
      distinctiveness = (fromVoices + fromDrafts) / 2;
      distinctivenessBasis += `; ${m.vsDrafts.breaking} of ${m.vsDrafts.drafts} plain draft(s) fall outside its band`;
    } else {
      distinctivenessBasis += p.measurement ? '; no plain drafts to compare with' : '; a worded rule, not compared with plain drafts';
    }
    const cls = primaryClassOf(p);
    const preference = (liked[r.author] ?? []).includes(cls) ? PREFERENCE_BOOST : 1;
    const framings = m?.framings ?? [];
    return { id: r.id, voice: r.author, statement: p.statement, cls, consistency: r3(consistency), consistencyBasis, distinctiveness: r3(distinctiveness), distinctivenessBasis,
      preference, weight: r3(consistency * distinctiveness * preference), sharedBy, method: k > 1 && sharedBy === k,
      effectReading: framings.length > 0 && framings.every((f) => f === 'C') };
  });
  const top = new Map<string, number>();
  for (const w of weighed) top.set(w.voice, Math.max(top.get(w.voice) ?? 0, w.weight));
  return weighed.map((w) => ({ ...w, chosen: w.method || (w.weight >= SELECT_FLOOR && w.weight >= SELECT_SHARE * (top.get(w.voice) ?? 0)) }));
}

/** The weights as the choice the selection reads (./selection.ts). */
export function inferredChoice(weights: readonly TraitWeight[], authors: AuthorMap, extra: Pick<InferredChoice, 'requestLength' | 'pieceLength'> = {}): InferredChoice {
  const piecesOf = new Map(authors.names.map((n) => [n, Object.values(authors.of).filter((a) => a === n).length]));
  return {
    weightOf: new Map(weights.map((w) => [w.id, w.weight])),
    chosen: new Set(weights.filter((w) => w.chosen).map((w) => w.id)),
    method: new Set(weights.filter((w) => w.method).map((w) => w.id)),
    sharedBy: new Map(weights.map((w) => [w.id, w.sharedBy])),
    piecesOf,
    ...extra,
  };
}

/** A sentence of liking, in what the person asked for: what the request says they like, or null. */
export function likingIn(request: string | null | undefined): string | null {
  if (!request) return null;
  const said = request.split(/(?<=[.!?;])\s+/).filter((x) => /\b(like|likes|love|loves|admire|admires|enjoy|enjoys|prefer|prefers|favou?rite|best)\b/i.test(x));
  return said.length ? said.join(' ').trim() : null;
}

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
/** How a voice is named in the one line: an inferred one by its place, a declared one by its name. */
export const voiceLabel = (authors: AuthorMap, name: string): string =>
  (authors.how === 'INFERRED' ? `the ${ORDINAL[authors.names.indexOf(name)] ?? name}` : name);

/** How one clash between voices was settled: the side that stands, the side set aside, and why. */
export interface SettledClash {
  readonly n: number;
  readonly label: string;
  readonly stands: readonly { readonly id: string; readonly voice: string }[];
  readonly aside: readonly { readonly id: string; readonly voice: string }[];
  readonly by: 'INFERENCE' | 'ANSWER' | 'SET' | 'OPEN' | 'REQUEST';
  readonly why: string;
}

/**
 * THE WHOLE INFERENCE, AS DATA: stored with the composite (and so with the skill), in the run's record, and shown by
 * `atelier report --skill`. A rebuild reads it; nothing in it is ever computed again.
 */
export interface InferenceRecord {
  readonly grouping: { readonly how: AuthorsHow; readonly voices: readonly { readonly name: string; readonly pieces: readonly string[] }[];
    readonly confidence: number | null; readonly criterion: string | null };
  readonly weights: readonly TraitWeight[];
  /** what the person said they like, and the classes it was read as, by voice; null when they said nothing */
  readonly preference: { readonly said: Readonly<Record<string, string>>; readonly classes: Readonly<Record<string, readonly TraitClass[]>>; readonly via: string } | null;
  readonly requestLength: string | null;
  readonly settled: readonly SettledClash[];
  /** the rules only the effect reading reached, which no recall number stands behind yet */
  readonly effectReadings: readonly string[];
  readonly line: string;
}

/** Every clash, as it was finally settled in the record (./selection.ts). */
export function settledClashes(record: CompositeRecord): SettledClash[] {
  return record.conflicts.map((c) => {
    const [a, b] = c.sides;
    const side = (x: typeof a): { id: string; voice: string } => ({ id: x.id, voice: x.author });
    if (c.settledWhy?.includes('request names the length')) return { n: c.n, label: c.label, stands: [], aside: [side(a), side(b)], by: 'REQUEST', why: c.settledWhy };
    if (c.answer === null) return { n: c.n, label: c.label, stands: [], aside: [], by: 'OPEN', why: 'left open by your --conflict answer "later"' };
    if (c.answer === 'both') return { n: c.n, label: c.label, stands: [side(a), side(b)], aside: [], by: 'ANSWER', why: 'you answered both' };
    const [win, lose] = c.answer === 'A' ? [a, b] : [b, a];
    const by = c.resolvedBy === 'INFERENCE' ? 'INFERENCE' as const : c.resolvedBy === 'SET' ? 'SET' as const : 'ANSWER' as const;
    const why = by === 'INFERENCE' ? c.settledWhy ?? 'the more characteristic side stands' : by === 'SET' ? 'your --set, your latest word' : c.resolvedBy === 'ANOTHER_ANSWER' ? 'your answer to another conflict' : 'your answer';
    return { n: c.n, label: c.label, stands: [side(win)], aside: [side(lose)], by, why };
  });
}

/**
 * THE ONE LINE A COMPOSITE BUILD ENDS ON: what is taken from each voice, by class, and how many clashes inference
 * settled. "Combined 3 voices: openings from the first, evidence handling from the second, pace from the third; 2
 * clashes settled by which was more characteristic. Say `atelier fix` to change any of it."
 */
export function buildLine(record: CompositeRecord, authors: AuthorMap, weights: readonly TraitWeight[]): string {
  const w = new Map(weights.map((x) => [x.id, x]));
  const parts = authors.names.flatMap((name) => {
    const mine = record.decisions.filter((d) => d.author === name && d.outcome === 'SELECTED' && !d.mergedInto && !d.shownOnly && !w.get(d.id)?.method);
    if (!mine.length) return [];
    const by = new Map<TraitClass, number>();
    for (const d of mine) by.set(d.cls, (by.get(d.cls) ?? 0) + (w.get(d.id)?.weight ?? 0));
    const top = [...by].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 2).map(([c]) => TRAIT_SHORT[c]);
    return [`${top.join(' and ')} from ${voiceLabel(authors, name)}`];
  });
  const settled = record.conflicts.filter((c) => c.resolvedBy === 'INFERENCE').length;
  const method = weights.some((x) => x.method && record.decisions.some((d) => d.id === x.id && d.outcome === 'SELECTED'));
  const noun = authors.how === 'INFERRED' ? 'voices' : 'writers';
  return `Combined ${authors.names.length} ${noun}: ${parts.join(', ') || 'nothing distinctive enough to take from any of them'}`
    + (method ? '; what every one of them does kept as method' : '')
    + `${settled ? `; ${settled} clash${settled === 1 ? '' : 'es'} settled by which was more characteristic` : ''}. Say \`atelier fix\` to change any of it.`;
}

/** The record of the inference, built once when the composite is made. */
export function inferenceRecord(record: CompositeRecord, authors: AuthorMap, voices: VoiceGrouping | null, weights: readonly TraitWeight[],
  preference: InferenceRecord['preference'], requestLength: string | null): InferenceRecord {
  return {
    grouping: { how: authors.how, voices: authors.names.map((n) => ({ name: n, pieces: Object.keys(authors.of).filter((id) => authors.of[id] === n) })),
      confidence: voices ? voices.confidence : null, criterion: voices ? voices.criterion : null },
    weights, preference, requestLength, settled: settledClashes(record),
    effectReadings: weights.filter((x) => x.effectReading).map((x) => x.id),
    line: buildLine(record, authors, weights),
  };
}

/** THE FULL TABLE, for `atelier report --skill`: the grouping, every rule's weight, and every clash with its reason. */
export function describeInference(inf: InferenceRecord, outcomeOf: (id: string) => string | undefined = () => undefined): string[] {
  const out: string[] = ['', 'HOW THE VOICES WERE COMBINED (inferred from the pieces; nothing was asked)', `  ${inf.line}`];
  const g = inf.grouping;
  out.push('', g.how === 'INFERRED'
    ? `  ${g.voices.length} voices found by how they are written${g.confidence !== null ? ` (confidence ${g.confidence.toFixed(2)})` : ''}${g.criterion ? `: ${g.criterion}` : ''}.`
    : `  ${g.voices.length} writers, as declared (${g.how === 'FRONT_MATTER' ? 'author: in each piece' : g.how === 'SUBFOLDERS' ? 'a folder per author' : '--authors'}).`);
  for (const v of g.voices) out.push(`    ${v.name}: ${v.pieces.join(', ')}`);
  if (inf.preference) {
    out.push('', '  What you said you like (it weighs the matching rules up by 1.5; never asked for):');
    for (const [voice, said] of Object.entries(inf.preference.said)) out.push(`    ${voice}: "${said}" → ${(inf.preference.classes[voice] ?? []).map((c) => TRAIT_LABEL[c]).join(', ') || 'nothing their rules carry'}`);
  }
  if (inf.requestLength) out.push('', `  The request names the length (${inf.requestLength}): no voice's rule on the piece's length is taken.`);
  out.push('', '  Rules by voice: weight = consistency × distinctiveness × preference. Taken: each voice\'s most characteristic, and what every voice shows (method).');
  for (const v of g.voices) {
    const mine = inf.weights.filter((x) => x.voice === v.name).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
    if (!mine.length) continue;
    out.push(`    ${v.name}`);
    for (const x of mine) {
      const given = outcomeOf(x.id);
      const state = x.method && (given ?? 'taken') === 'taken' ? 'method' : given ?? (x.chosen ? 'taken' : 'habit');
      out.push(`      ${x.id.padEnd(4)} ${x.weight.toFixed(2)} = ${x.consistency.toFixed(2)} × ${x.distinctiveness.toFixed(2)} × ${x.preference}   ${state.padEnd(8)} ${x.statement}${x.effectReading ? `   (${EFFECT_READING}, not yet measured)` : ''}`);
      out.push(`           ${x.consistencyBasis}; ${x.distinctivenessBasis}`);
    }
  }
  if (inf.settled.length) {
    out.push('', `  Clashes between voices (${inf.settled.length}), each settled one way, never both:`);
    for (const c of inf.settled) {
      const says = (xs: readonly { id: string; voice: string }[]): string => xs.map((x) => `${x.voice}'s ${x.id}`).join(' and ');
      out.push(`    ${c.n}. ${c.label}: ${c.stands.length ? `${says(c.stands)} stands` : 'neither stands'}${c.aside.length ? `, ${says(c.aside)} set aside` : ''}. ${c.why}.`);
    }
  }
  if (inf.effectReadings.length) out.push('', `  Read from what the writing does to a reader (the ${EFFECT_READING}): ${inf.effectReadings.join(', ')}. Not yet measured: no recall number stands behind this reading.`);
  out.push('', '  To change any of it: atelier fix "<what was wrong>" (what you say outranks what was inferred).');
  return out;
}
