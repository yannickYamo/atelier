// atelier/core/fidelity/experience.ts — WHAT HELPED A DRAFT LAND IN THE AUTHOR'S RANGE, DISTILLED.
//
// The Training-Free GRPO pattern: no weights move. Several drafts are written for one request, a scorer
// ranks them, and a model compares the winners with the losers and states, in a sentence, what the
// winners did differently. Those sentences are served to later runs as experience. Here the scorer is
// deterministic (how many of the author's bands a draft sits inside, from ./types.ts FidelityReading),
// so a note is grounded in a measured gap, never in a model's taste.
//
// THREE THINGS KEEP A NOTE ON THE IMPLEMENTATION SIDE OF THE LINE (docs/decisions/0001):
//
//   It says HOW a text was built: paragraphing, how sentences move, which specifics from the material
//   were used. Never what good writing is. "Always open with a question" is a rule, and rules belong to
//   the owner; the parser refuses always/never/must outright.
//
//   It names no figure and no name. A note carrying "40%" or a person's name would carry content from
//   one request into another, which is invention by a different route.
//
//   It reaches a prompt only inside an implementation release (./release.ts), so a note that steered an
//   output is named by the release the output records, and a rollback removes it. Nothing here is
//   mutable background state.
//
// AND THE DRAFTS THEMSELVES ARE NEVER SERVED. They are what was tried on the way to an output; showing
// them to the writer is the history leak ../architecture/repair-memory.ts guards against. Only the
// distilled, validated sentences leave this module.

import { createHash } from 'node:crypto';
import { featureOf } from '../observers/features.js';
import { spend, type Budget, type InferenceClient } from '../inference/client.js';
import { wordsOf } from '../observers/text.js';
import type { ContextClass, ExperienceNote, FidelityReading, FidelityRecord } from './types.js';

/** A winner must sit inside at least this many more of the author's bands than the loser it is paired with. */
export const MIN_IN_BAND_GAP = 2;
export const MAX_NOTE_WORDS = 32;
export const MAX_NOTES = 8;
/** Characters of each draft shown to the distiller: enough to see paragraphing, bounded so cost is. */
export const DRAFT_EXCERPT_CHARS = 1600;

/**
 * The fields of an invocation record this module reads. Structural, so a record written before the
 * fidelity field existed simply yields no pairs.
 */
export interface ExperienceSource {
  readonly invocationId: string;
  readonly input: string;
  readonly output: string;
  readonly selection?: { readonly chosen: number; readonly unchosen?: readonly string[]; readonly unchosenTruncated?: boolean };
  /** the chosen draft as written, before any repair; `output` is what was delivered */
  readonly repair?: { readonly draft?: string };
  readonly fidelity?: FidelityRecord;
}

export interface DraftRef { readonly index: number; readonly text: string; readonly reading: FidelityReading }

export interface ComparisonPair {
  readonly invocationId: string;
  readonly request: string;
  readonly cls: ContextClass;
  readonly winner: DraftRef;
  readonly loser: DraftRef;
  /** winner.inBand - loser.inBand, at least MIN_IN_BAND_GAP */
  readonly gap: number;
  /** bands the loser sat outside and the winner inside: what the winner did that the loser did not */
  readonly features: readonly string[];
}

/** The text of every draft, in the order written, or null when the record cannot be aligned with its readings. */
function draftTexts(r: ExperienceSource, readings: readonly FidelityReading[]): (string | null)[] | null {
  const sel = r.selection;
  if (!sel) return readings.length === 1 ? [r.repair?.draft ?? r.output] : null;
  const unchosen = sel.unchosen ?? [];
  if (unchosen.length !== readings.length - 1 || sel.chosen < 0 || sel.chosen >= readings.length) return null;
  return readings.map((_, i) => {
    if (i === sel.chosen) return r.repair?.draft ?? r.output;
    const j = i < sel.chosen ? i : i - 1;
    // The cap cuts the LAST unchosen draft it reaches. Cut, it is not the draft that was scored and
    // cannot stand for it in a comparison.
    if (sel.unchosenTruncated && j === unchosen.length - 1) return null;
    return unchosen[j];
  });
}

/**
 * Winner/loser pairs on the same request. The winner is the draft inside the most bands (the first
 * written on a tie); every draft at least MIN_IN_BAND_GAP bands behind it is a loser. A gap of one band
 * is within what two drafts of the same prompt differ by for no reason, so it teaches nothing.
 */
export function comparisonPairs(records: readonly ExperienceSource[]): ComparisonPair[] {
  const out: ComparisonPair[] = [];
  for (const r of records) {
    const readings = r.fidelity?.drafts ?? [];
    if (readings.length < 2) continue;
    const texts = draftTexts(r, readings);
    if (!texts) continue;
    let w = -1;
    readings.forEach((rd, i) => { if (texts[i] !== null && (w < 0 || rd.inBand > readings[w].inBand)) w = i; });
    if (w < 0) continue;
    const win = readings[w];
    const winnerOutside = new Set(win.outside.map((o) => o.id));
    readings.forEach((rd, i) => {
      const text = texts[i];
      if (i === w || text === null || win.inBand - rd.inBand < MIN_IN_BAND_GAP) return;
      out.push({ invocationId: r.invocationId, request: r.input, cls: win.cls,
        winner: { index: w, text: texts[w] ?? '', reading: win }, loser: { index: i, text, reading: rd },
        gap: win.inBand - rd.inBand,
        features: rd.outside.map((o) => o.id).filter((id) => !winnerOutside.has(id)) });
    });
  }
  return out;
}

/**
 * THE CLOSED LIST OF CONSTRUCTION OPERATIONS a note may report, in the past tense: what the winning drafts
 * did. A note is an observation about how a text was built, never an instruction about what to write: "Open
 * with a question." would be a new rule the owner never ratified, served as if it were implementation.
 */
export const OPERATIONS: readonly string[] = ['split', 'joined', 'shortened', 'lengthened', 'merged', 'broke', 'used', 'dropped'];

export const DISTILL_SYSTEM = `You study how drafts are built. You never judge what is good writing.

You are shown pairs of drafts written for the same request. In each pair a measurement placed the
WINNER inside more of one author's own ranges (named by feature id) than the LOSER. Say what the winners
did, in construction, that the losers did not.

Every note has exactly this form:

  <feature id>: <operation> <how, in plain words>

- <feature id> is one of the ids shown with the pairs (for example sentenceP10 or paragraphP50).
- <operation> is one of: ${OPERATIONS.join(', ')}.
- The rest says how, about the text's construction, in at most ${MAX_NOTE_WORDS} words in all.
- Never an instruction to the writer, never a claim about good writing, never a rule.
- Never a figure, date, name, title or quotation from the drafts.

Examples of the form: "sentenceP10: joined the shortest sentences to the one before them".
"paragraphP50: broke long paragraphs where the subject changed".

Give at most ${MAX_NOTES} notes. If the winners share nothing you can state this way, give none.`;

export const DISTILL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    notes: { type: 'array', items: { type: 'object',
      properties: { text: { type: 'string' }, features: { type: 'array', items: { type: 'string' } } },
      required: ['text'], additionalProperties: false } },
  },
  required: ['notes'], additionalProperties: false,
};

const excerpt = (s: string): string => (s.length > DRAFT_EXCERPT_CHARS ? `${s.slice(0, DRAFT_EXCERPT_CHARS)} [...]` : s);

/** The pairs shown, widest gap first (then by record and draft, so the same pairs give the same prompt). */
export function selectPairs(pairs: readonly ComparisonPair[], max: number): ComparisonPair[] {
  return [...pairs].sort((a, b) => b.gap - a.gap || a.invocationId.localeCompare(b.invocationId)
    || a.winner.index - b.winner.index || a.loser.index - b.loser.index).slice(0, Math.max(0, max));
}

/** The user message for the distiller: at most `max` pairs, each with the bands the winner held and the loser did not. */
export function distillPrompt(pairs: readonly ComparisonPair[], max: number): string {
  const shown = selectPairs(pairs, max);
  const blocks = shown.map((p, n) => `PAIR ${n + 1}\n`
    + `bands the winner sat inside and the loser did not: ${p.features.join(', ') || '(several, none singly)'}\n`
    + `<winner>\n${excerpt(p.winner.text)}\n</winner>\n<loser>\n${excerpt(p.loser.text)}\n</loser>`);
  return `${blocks.join('\n\n')}\n\nWhat did the winners do, in how the text is built, that the losers did not? `
    + 'Write notes about construction only, never about what is good in general, never naming a figure or a name.';
}

/** What a note's "how" must be about: the units of construction, never what a piece says. */
const CONSTRUCTION = /\b(?:sentences?|paragraphs?|clauses?|commas?|breaks?|connectives?|conjunctions?|parenthes[ie]s|semicolons?|full stops?|lines?|supplied facts?|facts? from the material)\b/i;

/** A note's grammar: a measured feature's id, a colon, an operation from the closed list, and how. */
const NOTE_FORM = /^([A-Za-z][A-Za-z0-9]*):\s+([a-z]+)\b(.*)$/;

/**
 * Why a note is refused, or null when it may be kept. An ALLOWLIST, not a denylist: the note must name one
 * measured feature by its id and one operation from OPERATIONS, and say how without a figure, a name, a
 * dash or rule language. Exported so a test, or a status page, can say which check refused it.
 */
export function noteProblem(text: string): string | null {
  const t = text.trim();
  if (!t) return 'empty';
  const m = NOTE_FORM.exec(t);
  if (!m) return 'not of the form "<feature id>: <operation> <how>"';
  const [, feature, op, rest] = m;
  if (!featureOf(feature)) return `"${feature}" is not a measured feature`;
  if (!OPERATIONS.includes(op)) return `"${op}" is not one of the operations (${OPERATIONS.join(', ')})`;
  if (wordsOf(`${op}${rest}`).length > MAX_NOTE_WORDS) return `over ${MAX_NOTE_WORDS} words`;
  if (/\d/.test(rest)) return 'carries a digit';
  if (/\b(always|never|ever|must|mustn['’]?t|should|instead|avoid|do not|don['’]t|open with|start with|begin with|end with)\b/i.test(rest)) return 'states a rule';
  // ONE CLAUSE, ABOUT CONSTRUCTION. A second clause is where an instruction hides ("dropped the conclusion; open
  // with the result instead"), and a note about content ("used a question to open each piece", "used humor") is
  // a rule about what to write: the note must name what was built from (sentences, paragraphs, connectives).
  if (/[;:]/.test(rest)) return 'more than one clause';
  if (!CONSTRUCTION.test(rest)) return 'not about construction (name the sentences, paragraphs, clauses, connectives or supplied facts it changed)';
  if (/[—–]/.test(rest)) return 'carries a dash Atelier strips from its own text';
  // A capital after the operation is a name, a title or an acronym; each carries content across requests.
  const capital = rest.split(/\s+/).map((w) => w.replace(/^["'“‘(]+/, '').replace(/[.,;:!?)"'”’]+$/, ''))
    .some((w) => /^[A-Z]/.test(w) && !/^I(?:['’][a-z]+)?$/.test(w));
  if (capital) return 'names something (a capital in the note)';
  return null;
}

const noteId = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12);
const normal = (s: string): string => s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Keep only notes that pass every check, once each, up to MAX_NOTES. The class is the pairs' shared
 * class, or 'all' when they span several; the evidence is how many pairs the notes came from and the
 * winners' mean in-band gain over their losers.
 */
export function parseNotes(raw: unknown, pairs: readonly ComparisonPair[]): ExperienceNote[] {
  const list = (raw as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(list)) return [];
  const classes = new Set(pairs.map((p) => p.cls));
  const cls: ContextClass | 'all' = classes.size === 1 ? [...classes][0] : 'all';
  const known = [...new Set(pairs.flatMap((p) => p.features))].sort();
  const evidence = { pairs: pairs.length, gain: pairs.length ? pairs.reduce((s, p) => s + p.gap, 0) / pairs.length : 0 };
  const seen = new Set<string>();
  const out: ExperienceNote[] = [];
  for (const item of list as unknown[]) {
    if (out.length >= MAX_NOTES) break;
    const o = (typeof item === 'string' ? { text: item } : item) as { text?: unknown; features?: unknown } | null;
    if (typeof o?.text !== 'string') continue;
    const text = o.text.replace(/\s+/g, ' ').trim();
    if (noteProblem(text) !== null || seen.has(normal(text))) continue;
    // The feature the note names must be one the compared drafts differed on: a note about anything else is
    // not what these comparisons showed. It is the note's feature, recorded as such.
    const feature = /^([A-Za-z][A-Za-z0-9]*):/.exec(text)?.[1] ?? '';
    if (!known.includes(feature)) continue;
    seen.add(normal(text));
    out.push({ id: noteId(text), text, cls, features: [feature], evidence });
  }
  return out;
}

/** Pairs shown to the distiller per call. */
export const MAX_PAIRS_SHOWN = 6;

/**
 * One call, temperature 0: the same pairs should distil to the same notes, because a note that only
 * appears on some samplings is a sampling, not a lesson. Returns [] without calling when there is
 * nothing to compare.
 */
export async function distillNotes(client: InferenceClient, budget: Budget, pairs: readonly ComparisonPair[]): Promise<ExperienceNote[]> {
  const shown = selectPairs(pairs, MAX_PAIRS_SHOWN);
  if (!shown.length) return [];
  const res = await spend(budget, 0.03, async () => {
    const x = await client.complete({ stableBlock: DISTILL_SYSTEM, variableBlock: '', userMessage: distillPrompt(shown, MAX_PAIRS_SHOWN),
      toolName: 'emit_notes', toolDescription: 'Return the notes.', schema: DISTILL_SCHEMA, maxTokens: 2000, temperature: 0 });
    return { value: x, cost: x.cost };
  });
  return parseNotes(res.json, shown);
}

/** The block a prompt carries. Empty when there are no notes. */
export function renderNotes(notes: readonly ExperienceNote[]): string {
  if (!notes.length) return '';
  return 'IMPLEMENTATION NOTES: HOW DRAFTS HAVE LANDED IN THE AUTHOR\'S RANGE BEFORE\n'
    + 'Observations from comparing earlier drafts for this skill, about how the text was built in the ones '
    + 'that read most like the author. They are not rules and they do not change what is asked; where one '
    + 'does not fit this request, leave it.\n'
    + notes.map((n) => `- ${n.text}`).join('\n');
}
