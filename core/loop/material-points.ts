// atelier/core/loop/material-points.ts — NOTES WRITTEN AS FINISHED SENTENCES ARE POINTS TO WRITE FROM, NOT TEXT TO COPY.
//
// A person's notes often arrive as finished sentences ("The new terminal opens in March and doubles the berths."), and a
// writer given finished sentences copies them: the piece reads as the notes stitched together, in the notes' voice, not
// the author's. So where the bound material holds finished sentences, the run says so once, the writer is told the
// material is points to write from, and the delivered work is checked for the stretches it shares with the material
// (./../observers/copied-runs.ts): every run of 5 words or more is reported on the record, and a run of 8 words or more
// is a finding the repair rewrites like any other listed finding (core/loop/run-repair.ts, `COPIED_LINE`).
//
// FORM ONLY: a finished sentence is one of 8 words or more that ends with its own stop; two make notes "finished".

import { sentencesOf } from '../observers/text.js';
import { sharedRuns, RUN_WORDS, REPAIR_RUN_WORDS, type SharedRun } from '../observers/copied-runs.js';

/** The fewest words a finished sentence has. */
const SENTENCE_WORDS = 8;
/** How many finished sentences make the notes read as text rather than points. */
const FINISHED_SENTENCES = 2;

/** How many finished sentences a text holds: 8 words or more, ending with a full stop, a question or an exclamation mark. */
export function finishedSentences(text: string): number {
  return sentencesOf(text).filter((s) => s.words >= SENTENCE_WORDS && /[.!?]["”’)]?\s*$/.test(s.text)).length;
}

/** Whether the material is written as finished sentences: then it is served as points, and the work is held to not copying it. */
export const writtenAsSentences = (material: readonly { readonly text: string }[]): boolean =>
  material.reduce((n, m) => n + finishedSentences(m.text), 0) >= FINISHED_SENTENCES;

/** Said once, in one line, where the material holds finished sentences. */
export const POINTS_LINE = 'Your material holds finished sentences: it is served to the writer as points to write from, and the work is checked for stretches copied from it.';

/** What the writer is told, after the skill. */
export const POINTS_NOTE = 'The material above is notes to write from, not text to copy: take its facts and points and say them in my own sentences. Do not reuse its sentences or long stretches of its wording.';

/** What the record keeps: every copied run of 5 words or more, the longest, and the threshold the repair acts at. */
export interface CopiedRecord { readonly runs: number; readonly longest: number; readonly shown: readonly string[]; readonly repairAt: number }
export function copiedRecord(output: string, material: string): CopiedRecord {
  const runs = sharedRuns(output, material, RUN_WORDS);
  return { runs: runs.length, longest: runs.reduce((n, r) => Math.max(n, r.words), 0), shown: runs.slice(0, 5).map((r) => r.text.slice(0, 200)), repairAt: REPAIR_RUN_WORDS };
}

/** The runs long enough to be repaired. */
export const runsToRepair = (output: string, material: string): SharedRun[] => sharedRuns(output, material, RUN_WORDS).filter((r) => r.words >= REPAIR_RUN_WORDS);
