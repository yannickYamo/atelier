// atelier/core/loop/inferred.ts — WHAT THE RUN DECIDED FOR THE PERSON, BESIDE THE PIECE, NEVER IN IT.
//
// A run never refuses for what it was not given, and never writes the gap into the piece. Where nobody answered a
// question, the run takes the position its reading of the request and the author's pieces gives; where the method needs
// a specific nothing gives, the piece is decided on what is given; where a claim has no proof given, it is argued at the
// strength what is given supports. Each of those is a decision the person did not make: it is listed here, with what
// they can give to change it, in the report beside the work and on the record (`inferred`). The writer is told the
// decisions as decisions, never as assumptions to say aloud.

import type { InferredItem } from '../state/canonical-state.js';
import type { OwnWordsFix } from './own-words.js';
import { POSITION_IDS } from './questions.js';

export interface InferredFrom {
  /** the questions the run considered, and how each was answered */
  readonly questions?: readonly { readonly id: string; readonly ask: string; readonly default: string }[];
  readonly answers?: readonly { readonly id: string; readonly answer: string; readonly by: 'person' | 'default' | 'told' }[];
  /** the claims the piece leans on with no proof given (a deep run's gaps reading) */
  readonly proofs?: readonly string[];
  /** the specifics the method's steps needed and nothing gave (core/loop/execution-brief.ts, `unsupported`) */
  readonly specifics?: readonly { readonly step: number | string; readonly missing: string }[];
  /** the sentences that talked about the piece's own making, as the own-words step fixed them */
  readonly ownWords?: readonly OwnWordsFix[];
  /** the sentences about its own making the step found and could not fix, with why: left as written */
  readonly ownWordsLeft?: readonly { readonly sentence: string; readonly why: string }[];
}

/** Every inferred item of a run, in order: decisions, specifics, proofs, then the sentences fixed. */
export function inferredItems(f: InferredFrom): InferredItem[] {
  const out: InferredItem[] = [];
  for (const q of f.questions ?? []) {
    const a = f.answers?.find((x) => x.id === q.id);
    if (a && a.by !== 'default') continue;
    const add = `--answers "${q.id}=<your answer>"`;
    // a position is decided for the piece; a fact about the person (their news, what may be named) is never served from a
    // default, so it is listed as not given, never as decided
    if (q.id === 'proof') out.push({ kind: 'proof', what: q.ask, settled: 'argued from what is given, with no figure of yours', add });
    else if (POSITION_IDS.has(q.id)) out.push({ kind: 'decision', what: q.ask, settled: `decided: ${a?.answer ?? q.default}`, add });
    else out.push({ kind: 'specific', what: q.ask, settled: 'not served: the piece is written without it', add });
  }
  for (const p of f.proofs ?? []) if (!out.some((x) => x.kind === 'proof' && x.what.includes(p))) out.push({ kind: 'proof', what: p, settled: 'argued from what is given, with no figure of yours', add: 'a figure, case or source of yours (--with)' });
  for (const s of f.specifics ?? []) out.push({ kind: 'specific', what: `step ${s.step}: ${s.missing}`, settled: 'decided on what is given', add: 'the specific, as material (--with)' });
  for (const w of f.ownWordsLeft ?? []) out.push({ kind: 'own-words', what: w.sentence.slice(0, 160), settled: `left as written (${w.why})`, add: 'edit or remove this sentence' });
  for (const w of f.ownWords ?? []) {
    const kind = w.kind === 'slot' ? 'slot' : w.kind === 'name' ? 'name' : 'own-words';
    const why = kind === 'slot' ? 'it left a slot to fill' : kind === 'name' ? `it named ${w.name ?? 'someone'}, which nothing given holds` : 'it talked about the piece\'s own making';
    out.push({ kind, what: w.sentence.slice(0, 160), settled: w.rewrite === null ? `dropped: ${why}` : `written again: ${w.rewrite.slice(0, 160)}`,
      ...(kind === 'name' ? { add: 'the real name, as material (--with)' } : kind === 'slot' ? { add: 'the specific, as material (--with)' } : {}) });
  }
  return out;
}

/** The lines the report says, beside the work. */
export function inferredLines(items: readonly InferredItem[]): string[] {
  if (!items.length) return [];
  const label: Record<InferredItem['kind'], string> = { decision: 'decided for you', specific: 'not given', proof: 'no proof given', 'own-words': 'about its own making',
    slot: 'a slot, written whole', name: 'a name nothing gave', length: 'not the length asked' };
  return [`Inferred for this piece (${items.length}), beside it and never in it:`,
    ...items.map((i) => `  - ${label[i.kind]}: ${i.what} → ${i.settled}${i.add ? ` (to change: ${i.add})` : ''}`)];
}
