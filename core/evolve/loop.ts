// core/evolve/loop.ts — A SKILL THAT GETS BETTER AT ITS OWN METHOD WITHOUT BEING TOLD HOW, AND WITHOUT FOOLING ITSELF.
//
// The owner gives the ground truth once: the method, a finished example, and briefs to work on. From there the
// skill is run on the briefs, what its drafts keep getting wrong is read off the checks, one change to how the
// method is carried is tried at a time, and a change is kept only when it is plainly better. The standard is never
// in the search: what may change is the implementation (how many drafts, what the writer is told its earlier drafts
// left out), and what a change is scored on is the owner's own requirements, read by code.
//
// The discipline is the whole of it, and it is borrowed from work on regularized self-improvement of agent
// harnesses, where an unattended search was shown to overfit the tasks it is scored on unless it is held back:
//
//   A NOISE BAND      the unchanged skill is run twice before anything is tried. Two runs of the same thing differ;
//                     a gain inside that difference is not a gain.
//   ONE CHANGE        each candidate changes one thing, so a result has one cause. Within a search, a change that
//                     was tried and did not hold is not tried again.
//   A COST RULE       a change that spends more must buy it with cases; one that spends less must lose none.
//   A LEAKAGE CHECK   a candidate that carries the wording of a brief, or the name of one, is refused before
//                     anything is spent on it: it would be learning the cases, not the method.
//   HELD-BACK BRIEFS  some briefs are set aside before the first run and read once, at the end. A change is adopted
//                     only if it is no worse there. Gains that do not carry are reported and not kept.
//
// What it scores is what the checks read: the things the work must contain and must be made from, and whether
// anything unsupported was delivered. A judgement step is scored by nothing here, so nothing here improves it.

import { createHash } from 'node:crypto';

/** How the method is carried on a run: the only things the search may change. Never a rule. */
export interface Carry {
  /** drafts written per output */
  readonly drafts: number;
  /** what the writer is told earlier drafts of this work left out, in the owner's own words; empty for none */
  readonly note: string;
}

export interface Brief { readonly id: string; readonly task: string; readonly material: readonly { readonly name: string; readonly text: string }[] }

/** One run of one brief under one way of carrying the method, as the run's own verdict read it. */
export interface BriefResult {
  readonly id: string;
  /** the run's verdict was "conformant"; false also when the run ended with no result */
  readonly ok: boolean;
  /** the required method things this run left out, by requirement id */
  readonly missing: readonly string[];
  readonly costUsd: number;
}

export interface Scored { readonly ok: number; readonly n: number; readonly costUsd: number; readonly missing: Readonly<Record<string, number>> }

export function scoreOf(results: readonly BriefResult[]): Scored {
  const missing: Record<string, number> = {};
  for (const r of results) for (const id of r.missing) missing[id] = (missing[id] ?? 0) + 1;
  return { ok: results.filter((r) => r.ok).length, n: results.length, costUsd: Math.round(results.reduce((s, r) => s + r.costUsd, 0) * 1e6) / 1e6, missing };
}

const order = (id: string): string => createHash('sha256').update(id).digest('hex');

/** Fewer briefs than this, and nothing can be told from them: the loop does not start. */
export const MIN_BRIEFS = 6;

/**
 * THE BRIEFS HELD BACK, chosen before anything is run and blind to what a brief says: a fifth of them, at least
 * two, in an order fixed by their ids. The rest are what the search works on.
 */
export function splitBriefs<T extends { readonly id: string }>(briefs: readonly T[]): { dev: T[]; heldBack: T[] } {
  const sorted = [...briefs].sort((a, b) => order(a.id).localeCompare(order(b.id)));
  const k = Math.max(2, Math.round(briefs.length * 0.2));
  return { heldBack: sorted.slice(0, k), dev: sorted.slice(k) };
}

/**
 * THE NOISE BAND, in whole cases: how far two runs of the unchanged skill differed on the same briefs, and never
 * less than one case. A candidate must beat the better of the two by more than this.
 */
export const noiseBand = (first: Scored, second: Scored): number => Math.max(1, Math.abs(first.ok - second.ok));

export type Gene = 'NOTE' | 'MORE_DRAFTS' | 'FEWER_DRAFTS';

export interface Candidate {
  readonly gene: Gene;
  readonly carry: Carry;
  /** what the change is expected to do, said before it is run */
  readonly hypothesis: string;
  /** one key per change, so a change that did not hold is not tried again */
  readonly key: string;
}

export const MAX_DRAFTS = 4;
/** How a note opens. Fixed wording: the only words in a note that are not the standard's own. */
export const NOTE_HEAD = 'Earlier drafts of this work missed these. Each is required: check it before you finish.';
/** A note names no more than this many things: a list of everything is a list of nothing. */
export const MAX_NAMED = 6;

/**
 * THE CHANGES WORTH TRYING NOW, one thing each, read off what the last runs got wrong. At most two a round.
 * A note is proposed when drafts miss things the standard requires: it names them, in the standard's own words,
 * most-missed first, and keeps what an earlier note named. More drafts when cases still fail and there is nothing to name. Fewer drafts when every case
 * holds: a draft that buys nothing is cost.
 */
export function proposals(incumbent: Carry, last: Scored, statements: ReadonlyMap<string, string>, tried: ReadonlySet<string>): Candidate[] {
  const out: Candidate[] = [];
  const missed = Object.entries(last.missing).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).filter(([id]) => statements.has(id)).slice(0, 4);
  if (missed.length) {
    const fresh = missed.map(([id, n]) => ({ statement: statements.get(id) ?? id, line: `- ${statements.get(id) ?? id} (missed in ${n} of ${last.n})` }));
    // What an earlier note named stays named: a thing the note got written is not dropped from it for being written.
    const named = incumbent.note.split('\n').filter((l) => l.startsWith('- ') && !fresh.some((f) => l.startsWith(`- ${f.statement} (`)));
    const note = `${NOTE_HEAD}\n${[...fresh.map((f) => f.line), ...named].slice(0, MAX_NAMED).join('\n')}`;
    if (note !== incumbent.note) out.push({ gene: 'NOTE', carry: { ...incumbent, note }, key: `NOTE:${missed.map(([id]) => id).join(',')}`,
      hypothesis: `naming what drafts missed (${missed.map(([id]) => id).join(', ')}) gets it written` });
  }
  if (last.ok < last.n && incumbent.drafts < MAX_DRAFTS) out.push({ gene: 'MORE_DRAFTS', carry: { ...incumbent, drafts: incumbent.drafts + 1 }, key: `DRAFTS:${incumbent.drafts + 1}${incumbent.note ? '+NOTE' : ''}`,
    hypothesis: `one more draft to choose from (${incumbent.drafts + 1}) gives a conformant one more often` });
  if (last.ok === last.n && incumbent.drafts > 1) out.push({ gene: 'FEWER_DRAFTS', carry: { ...incumbent, drafts: incumbent.drafts - 1 }, key: `DRAFTS:${incumbent.drafts - 1}${incumbent.note ? '+NOTE' : ''}`,
    hypothesis: `one draft fewer (${incumbent.drafts - 1}) holds every case at less cost` });
  return out.filter((c) => !tried.has(c.key)).slice(0, 2);
}

/** A change may cost this much more for each tenth of the cases it gains: a third more for a tenth more. */
export const COST_PER_TENTH = 0.33;
/** A change that saves cost must save at least this share, or it is not worth a change. */
export const MIN_SAVING = 0.1;

export interface Ruling { readonly keep: boolean; readonly why: string }

/**
 * WHETHER A CANDIDATE IS BETTER, against the best the incumbent has done and the noise band.
 *   A gain is kept when it is beyond the band, and its extra cost is within what the gain buys.
 *   A saving is kept when no case is lost against the incumbent's best and the cost falls by a tenth or more.
 * Anything else is not kept, and the reason says which test it missed.
 */
export function rule(candidate: Scored, incumbentBest: number, incumbentCost: number, band: number, gene: Gene): Ruling {
  const gain = candidate.ok - incumbentBest;
  const costRatio = incumbentCost > 0 ? candidate.costUsd / incumbentCost : 1;
  if (gene === 'FEWER_DRAFTS') {
    if (gain < 0) return { keep: false, why: `it loses ${-gain} case(s) against ${incumbentBest} of ${candidate.n}` };
    if (costRatio > 1 - MIN_SAVING) return { keep: false, why: `it loses no case, and saves under a tenth of the cost (${Math.round((1 - costRatio) * 100)}%)` };
    return { keep: true, why: `it holds ${candidate.ok} of ${candidate.n} at ${Math.round((1 - costRatio) * 100)}% less cost` };
  }
  if (gain <= band) return { keep: false, why: `${candidate.ok} of ${candidate.n} against ${incumbentBest}: a gain of ${gain} is inside the noise band of ${band} case(s)` };
  const allowed = 1 + COST_PER_TENTH * ((gain / candidate.n) * 10);
  if (costRatio > allowed) return { keep: false, why: `it gains ${gain} case(s) and costs ${Math.round((costRatio - 1) * 100)}% more, where ${Math.round((allowed - 1) * 100)}% is what that gain buys` };
  return { keep: true, why: `${candidate.ok} of ${candidate.n} against ${incumbentBest}: a gain of ${gain}, beyond the noise band of ${band}${costRatio > 1.005 ? `, for ${Math.round((costRatio - 1) * 100)}% more cost` : ''}` };
}

const wordsOf = (t: string): string[] => t.toLowerCase().match(/[\p{L}\p{N}'’]+/gu) ?? [];
/** A candidate that shares this many words in a row with a brief is carrying the brief. */
export const LEAK_WORDS = 6;

/**
 * THE LEAKAGE CHECK, before anything is spent on a candidate: what it would tell the writer must name no brief and
 * hold no run of LEAK_WORDS words from any brief's task or material, held-back ones included. Words that are the
 * standard's own (`own`: its statements, and how a note opens) are not a brief's because a brief also uses them.
 * A note is written from the standard, so it passes by construction; this is what holds if that ever stops being so.
 * Returns null when clean, or what was found.
 */
export function leak(note: string, briefs: readonly Brief[], own: readonly string[] = []): string | null {
  if (!note.trim()) return null;
  const n = wordsOf(note);
  const text = ` ${n.join(' ')} `;
  const mine = ` ${own.map((o) => wordsOf(o).join(' ')).join(' | ')} `;
  for (const b of briefs) {
    // A brief is named when the words of its file name stand in the note as words, and are not the standard's own.
    const stem = wordsOf(b.id.replace(/\.[A-Za-z0-9]+$/, '')).join(' ');
    if (stem.length >= 4 && text.includes(` ${stem} `) && !mine.includes(` ${stem} `)) return `it names the brief "${b.id}"`;
  }
  for (const b of briefs) {
    const theirs = ` ${wordsOf([b.task, ...b.material.map((m) => m.text)].join(' ')).join(' ')} `;
    for (let i = 0; i + LEAK_WORDS <= n.length; i++) {
      const run = ` ${n.slice(i, i + LEAK_WORDS).join(' ')} `;
      if (theirs.includes(run) && !mine.includes(run)) return `it repeats ${LEAK_WORDS} words in a row of the brief "${b.id}" ("${run.trim()}")`;
    }
  }
  return null;
}

export interface Trial { readonly round: number; readonly gene: Gene; readonly key: string; readonly hypothesis: string; readonly carry: Carry;
  /** null when the leakage check refused it before any run */
  readonly scored: Scored | null; readonly kept: boolean; readonly why: string }

export interface EvolveRecord {
  readonly schema: 1;
  readonly skill: string; readonly skillVersion: string; readonly standardVersion: string; readonly at: string;
  readonly briefs: { readonly dev: readonly string[]; readonly heldBack: readonly string[] };
  readonly start: Carry;
  /** the unchanged skill, twice, on the working briefs, and the band read from the two */
  readonly baseline: { readonly first: Scored; readonly second: Scored; readonly band: number };
  readonly trials: readonly Trial[];
  readonly end: Carry;
  /** the held-back briefs, read once at the end: the skill as it started, and as the search left it */
  readonly heldBack: { readonly start: Scored; readonly end: Scored } | null;
  /** ADOPTED: kept, and no worse on the held-back briefs. NOT_CARRIED: better on the working briefs, worse held back. UNCHANGED: nothing was kept */
  readonly verdict: 'ADOPTED' | 'NOT_CARRIED' | 'UNCHANGED' | 'STOPPED';
  /** STOPPED: the cap ran out, or a run ended with no result. A run with no result is never read as a case that failed */
  readonly why: string;
  readonly costUsd: number;
}

/** The record as a person reads it: what was tried, what was kept and why, and whether it carried. */
export function renderEvolve(r: EvolveRecord): string {
  const out: string[] = [];
  const say = (c: Carry): string => `${c.drafts} draft(s)${c.note ? ', with a note on what drafts leave out' : ''}`;
  out.push(`SELF-IMPROVEMENT · ${r.skill} · ${r.briefs.dev.length} working brief(s), ${r.briefs.heldBack.length} held back`);
  out.push(`  as it started   ${say(r.start)}: ${r.baseline.first.ok} and ${r.baseline.second.ok} of ${r.baseline.first.n} conformant on two runs. Noise band: ${r.baseline.band} case(s).`);
  if (!r.trials.length) out.push('  nothing was tried: no change the checks can score was left to try.');
  for (const t of r.trials) {
    out.push(`  round ${t.round}  ${t.kept ? 'kept    ' : 'not kept'}  ${t.gene === 'NOTE' ? 'name what drafts leave out' : t.gene === 'MORE_DRAFTS' ? `${t.carry.drafts} drafts` : `${t.carry.drafts} draft(s), one fewer`}: ${t.why}`);
  }
  if (r.heldBack) out.push(`  held back       as it started ${r.heldBack.start.ok} of ${r.heldBack.start.n}; as the search left it ${r.heldBack.end.ok} of ${r.heldBack.end.n}.`);
  out.push(`  ${r.verdict === 'ADOPTED' ? 'ADOPTED' : r.verdict === 'NOT_CARRIED' ? 'NOT ADOPTED' : r.verdict === 'STOPPED' ? 'STOPPED' : 'UNCHANGED'}: ${r.why}`);
  out.push('  Scored on what the checks read: what the work must contain and be made from, and nothing unsupported delivered. A judgement step is scored by nothing here.');
  return out.join('\n');
}
