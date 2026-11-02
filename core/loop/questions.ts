// atelier/core/loop/questions.ts — UP TO THREE QUESTIONS BEFORE THE DRAFT, ONLY FOR WHAT ONLY THE AUTHOR KNOWS.
//
// A post written in someone's voice can sound like them and still not be theirs: the angle, why it is worth saying now,
// what may be named, what is new about their own work, what they want stressed. None of that is in the examples, the
// method or the material, and a writer left to guess it guesses the same safe thing each time; the person then edits the
// argument, not the sentences. So before the first draft one reading lists the decisions the piece needs and asks the
// person only the few whose answer is theirs alone and would change the draft.
//
// THE READING (house pattern, ../inference/reading.ts). The reader lists the decisions the piece needs and, for each, a
// closed choice of KIND (what the decision is about: ANGLE, NAMING, NEWS, EMPHASIS, or OTHER for anything else, voice and
// form included), STATUS (KNOWN from what was given, INFERABLE from it, or UNKNOWN), SPREAD (would its likely answers
// give the SAME draft, SOME difference, or DIFFERENT drafts), and SETTLED BY (what settles it: the examples, the request,
// the material, the method, or the author only). Code grounds it: a decision of kind OTHER, or one settled by anything but
// the author, is never asked (the examples, method, request and material settle voice and form: a tone question labelled
// ANGLE is still settled by the examples); only an UNKNOWN whose answers give DIFFERENT drafts is
// above the line; it needs 2 to 4 options and a default among them; one question per kind, at most three, in a fixed order.
// With no model, or nothing grounded, the floor asks nothing.
//
// What the skill was told before is shown to the reader, and kept by code: what may be NAMED stands for the skill once
// said and is never asked again; the other kinds belong to one piece, so last time's answer is only the default ("last
// time you said …"). Nothing here names a kind of work.

import type { Reading } from '../inference/reading.js';

/** What a decision is about. Only the first four are the author's alone; OTHER is never asked. */
export const QUESTION_KINDS = ['ANGLE', 'NAMING', 'NEWS', 'EMPHASIS'] as const;
export type QuestionKind = typeof QUESTION_KINDS[number];
/** A kind whose answer stands for the skill once given: never asked again. */
export const STANDING_KINDS: ReadonlySet<QuestionKind> = new Set(['NAMING']);
/** The most questions a run asks. */
export const MAX_QUESTIONS = 3;
/** What settles a decision, a closed field the reader fills: only `author-only` is asked. */
export const SETTLED_BY = ['examples', 'request', 'material', 'method', 'author-only'] as const;
/** Where an angle or news is stated, a closed field the reader fills with a quote code finds there; NONE where nothing states it. */
export const STATED_IN = ['request', 'material', 'told', 'NONE'] as const;
/** The kinds asked by where they are stated, not by the reader's status: what the piece argues now, and news of the author's own work. */
export const STATED_KINDS: ReadonlySet<QuestionKind> = new Set(['ANGLE', 'NEWS']);
/** What the writer is told a kind's answer is about, where it was given for a kind this run did not ask. */
export const KIND_ASK: Readonly<Record<QuestionKind | GapKind, string>> = { ANGLE: 'The angle, and why now:', NAMING: 'What the piece may name:', NEWS: 'News of my own work it may carry:', EMPHASIS: 'What to stress:',
  PROOF: 'Proof the piece can carry:', READER: 'Who the piece is for:', STAKES: 'What is at stake:' };
/**
 * The kinds asked from a GAP in what was given (`GAPS`, below): a claim the piece will need whose proof nothing given
 * holds, and who the piece is for or what is at stake where nothing given says. Each supplies a fact or a frame; none
 * asks what the piece argues.
 */
export const GAP_KINDS = ['PROOF', 'READER', 'STAKES'] as const;
export type GapKind = typeof GAP_KINDS[number];
/** An answer of the person's own words shorter than this, to a gap question, is a decline: the default stands. */
export const DECLINE_UNDER = 20;
/** What answering a question of each kind unlocks, said once with it. Proof's line names its claim (`GAPS`). */
export const KIND_UNLOCKS: Readonly<Record<QuestionKind | GapKind, string>> = {
  ANGLE: 'How the piece opens and the line it argues from.',
  NAMING: 'Which names the piece may carry, for this skill from now on.',
  NEWS: 'Whether the piece can carry news of your own work.',
  EMPHASIS: 'Which part of the piece gets the most room.',
  PROOF: 'The claim can stand as a fact instead of as your view.',
  READER: 'What the piece explains and what it takes as known.',
  STAKES: 'What the opening puts in front of the reader.',
};

/** One question as the person sees it, and as `--json` and the MCP return it. */
export interface Question {
  /** the kind, lower case: what `--answers <id>=<choice>` names */
  readonly id: string;
  readonly ask: string;
  readonly options: readonly string[];
  /** the option used when nothing is answered (last time's answer, where there is one) */
  readonly default: string;
  /** what this skill was told last time, said as "last time you said …" */
  readonly last?: string;
  /** what an answer unlocks, one line (`chooseQuestions` sets it on every question it returns) */
  readonly unlocks?: string;
}
/** An answer the skill was given, kept per skill (../state/store.ts). */
export interface ToldAnswer { readonly id: string; readonly ask: string; readonly answer: string; readonly at: string }

export interface QuestionsInput {
  readonly request: string;
  readonly material: readonly { readonly name: string; readonly head: string }[];
  /** the method's steps, in the owner's words */
  readonly method: readonly string[];
  /** heads of the owner's examples */
  readonly examples: readonly string[];
  /** what the skill was told on earlier runs */
  readonly told: readonly ToldAnswer[];
}
/** One decision the piece needs, as read and grounded. */
export interface Decided {
  readonly kind: QuestionKind | 'OTHER'; readonly status: 'KNOWN' | 'INFERABLE' | 'UNKNOWN'; readonly spread: 'SAME' | 'SOME' | 'DIFFERENT'; readonly settledBy: typeof SETTLED_BY[number] | null; readonly what: string;
  /** why it was not asked, where it was not: for the question log */
  readonly why?: string;
}
export interface QuestionsReading { readonly decisions: readonly Decided[]; readonly questions: readonly Question[] }

export const QUESTIONS_SYSTEM = `You prepare a writer to write one piece in a person's own voice. You are shown the person's request, the material that came with it, their method, the heads of a few of their finished pieces, and what they told this skill before.

List the decisions this piece needs (at most six). For each:
- kind: ANGLE (the angle of the piece, or why it is worth saying now), NAMING (what or whom the piece may name), NEWS (news about the person's own company or work that the piece could carry), EMPHASIS (which part to stress), or OTHER (anything else: voice, tone, length, form, structure, wording; the examples and the method settle those).
- status: KNOWN (the request, material, method, examples or what they told before already says it), INFERABLE (a careful reader of those could settle it), or UNKNOWN (only the person can say).
- spread: would the person's likely answers produce the SAME draft, SOME difference, or DIFFERENT drafts.
- settledBy: what settles it: "examples" (their finished pieces show it: voice, tone, form, length), "request", "material", "method", or "author-only" (none of those can; only the person knows it).
- what: the decision in a few words.
- statedIn and quote, for ANGLE and NEWS: where the angle (or why now), or the news of the person's own work, is stated in so many words: "request", "material" or "told" (what they told this skill before), with a short quote copied exactly from there; or "NONE" with no quote where nothing given states it. A point you could argue from the material is not a stated angle: answer NONE. For other kinds, NONE.
For an UNKNOWN decision, and for an ANGLE or NEWS stated NONE, also write the question to the person (one short sentence, in plain words), two to four short options they could pick, and the default: the option you would write with if they say nothing.

Never ask about voice, tone, length or form. Never ask what was already given or what they told before. Most requests carry what they need: then every decision is KNOWN or INFERABLE.`;

export const QUESTIONS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    decisions: { type: 'array', items: { type: 'object', properties: {
      kind: { type: 'string', enum: [...QUESTION_KINDS, 'OTHER'] },
      status: { type: 'string', enum: ['KNOWN', 'INFERABLE', 'UNKNOWN'] },
      spread: { type: 'string', enum: ['SAME', 'SOME', 'DIFFERENT'] },
      settledBy: { type: 'string', enum: [...SETTLED_BY] },
      what: { type: 'string' },
      ask: { type: ['string', 'null'] },
      options: { type: 'array', items: { type: 'string' } },
      default: { type: ['string', 'null'] },
      statedIn: { type: 'string', enum: [...STATED_IN] },
      quote: { type: ['string', 'null'] },
    }, required: ['kind', 'status', 'spread', 'settledBy', 'what', 'ask', 'options', 'default', 'statedIn', 'quote'], additionalProperties: false } },
  },
  required: ['decisions'], additionalProperties: false,
};

const clip = (s: string, n: number): string => s.replace(/\s+/g, ' ').trim().slice(0, n);

/** How much of each material file the reader is shown, and of all of them together: a "why now" stated further down a file than its head is still a statement. */
export const SHOWN_PER_FILE = 4000;
export const SHOWN_IN_ALL = 12000;
/**
 * THE MATERIAL AS THE READER SEES IT: each file from its start, up to SHOWN_PER_FILE characters, and SHOWN_IN_ALL over
 * every file in order (a later file gets what is left). Shown to the reader and searched for its quotes (`statedWhere`),
 * so a quote the reader copies from anywhere it was shown is found.
 */
export function materialShown(material: readonly { readonly name: string; readonly text: string }[]): { readonly name: string; readonly head: string }[] {
  let left = SHOWN_IN_ALL;
  return material.map((m) => { const head = m.text.slice(0, Math.min(SHOWN_PER_FILE, Math.max(0, left))); left -= head.length; return { name: m.name, head }; });
}
/** Curly and straight apostrophes and quotation marks read as one (a form parser). */
const straight = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const same = (a: string, b: string): boolean => clip(a, 400).toLowerCase() === clip(b, 400).toLowerCase();

/** The score a decision is asked by: only an unknown whose answers give different drafts is above the line. */
export const spreadScore = (d: Pick<Decided, 'status' | 'spread'>): number => (d.status !== 'UNKNOWN' ? 0 : d.spread === 'DIFFERENT' ? 2 : d.spread === 'SOME' ? 1 : 0);
/** The line a decision must reach to be asked. */
export const ASK_THRESHOLD = 2;

/** Whether a quote of five or more characters is in the source the reader named (a form check: the words are there or not). */
function statedWhere(where: string, quote: string, input: QuestionsInput): boolean {
  const q = straight(clip(quote, 400)).toLowerCase();
  if (q.length < 5) return false;
  const source = where === 'request' ? input.request : where === 'material' ? input.material.map((m) => m.head).join('\n') : where === 'told' ? input.told.map((t) => t.answer).join('\n') : '';
  return straight(clip(source, 100000)).toLowerCase().includes(q);
}

export const QUESTIONS: Reading<QuestionsInput, QuestionsReading> = {
  id: 'questions', version: '2',
  system: QUESTIONS_SYSTEM, schema: QUESTIONS_SCHEMA,
  toolName: 'emit_questions', toolDescription: 'The decisions the piece needs, each with its kind, status and spread; a question with options and a default for an unknown one.',
  maxTokens: 1200, estimateUsd: 0.01,
  prompt(input) {
    return [`The request:\n${input.request.slice(0, 4000)}`,
      input.material.length ? `The material:\n${input.material.map((m) => `[${m.name}]\n${m.head}`).join('\n\n')}` : 'No material came with it.',
      input.method.length ? `The method:\n${input.method.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
      ...input.examples.slice(0, 3).map((e, i) => `Piece ${i + 1} (head):\n${e.slice(0, 800)}`),
      input.told.length ? `What they told this skill before:\n${input.told.map((t) => `- ${t.ask} ${t.answer}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  },
  // An empty request asks for nothing: code decides it, with nothing to ask.
  decide(input) { return input.request.trim() ? null : { decisions: [], questions: [] }; },
  ground(raw, input) {
    const r = raw as { decisions?: unknown } | null;
    if (!r || !Array.isArray(r.decisions)) return null;
    const decisions: Decided[] = []; const asked = new Map<QuestionKind, { q: Question; score: number }>();
    for (const x of r.decisions.slice(0, 6) as Record<string, unknown>[]) {
      const kind = (QUESTION_KINDS as readonly string[]).includes(String(x?.kind)) ? x.kind as QuestionKind : x?.kind === 'OTHER' ? 'OTHER' as const : null;
      const status = x?.status === 'KNOWN' || x?.status === 'INFERABLE' || x?.status === 'UNKNOWN' ? x.status : null;
      const spread = x?.spread === 'SAME' || x?.spread === 'SOME' || x?.spread === 'DIFFERENT' ? x.spread : null;
      const what = typeof x?.what === 'string' ? clip(x.what, 120) : '';
      const settledBy = (SETTLED_BY as readonly string[]).includes(String(x?.settledBy)) ? x.settledBy as typeof SETTLED_BY[number] : null;
      if (!kind || !status || !spread || !what) continue;
      const base: Decided = { kind, status, spread, settledBy, what };
      // ABOVE THE LINE: the author's own content (settled by the author alone, by the reader's closed field), unknown, and
      // answers that give different drafts.
      // THE ANGLE AND THE NEWS, unstated, are the author's whatever status the reader gave them (a reader that called an
      // unstated angle inferable from the material had the writer guess it). A statement is held to its quote: one said
      // to be stated in the request with no quote the request holds is no statement, whatever settles it. One gate
      // silences them: the reader says the material already settles it (settledBy 'material', KNOWN). INFERABLE is no
      // settlement, a missing or made-up settledBy means the author's, and spread alone never gates. Every other kind is
      // asked only where the author alone settles it and the answers would change the draft.
      // Each decision not asked keeps why, for the question log (`chooseQuestions`).
      const byStatement = kind !== 'OTHER' && STATED_KINDS.has(kind) && (STATED_IN as readonly string[]).includes(String(x?.statedIn));
      const stated = byStatement && statedWhere(String(x.statedIn), typeof x.quote === 'string' ? x.quote : '', input);
      const settled = byStatement ? settledBy === 'material' && status === 'KNOWN' : settledBy !== 'author-only';
      const why = kind === 'OTHER' ? 'voice, tone or form: the examples and the method settle it'
        : asked.has(kind) ? `one question per kind: a ${kind.toLowerCase()} question was already taken`
          : stated ? `stated in the ${String(x.statedIn)}`
            : settled ? (byStatement ? 'the material settles it' : settledBy ? `settled by the ${settledBy}` : 'not marked as the author\'s alone')
              : !byStatement && spreadScore({ status, spread }) < ASK_THRESHOLD ? 'known or inferable, or the answers would not change the draft' : undefined;
      if (why || kind === 'OTHER') { decisions.push({ ...base, why: why ?? '' }); continue; }
      const told = [...input.told].reverse().find((t) => t.id === kind.toLowerCase());
      // What may be named, once told, stands: never asked again.
      if (told && STANDING_KINDS.has(kind)) { decisions.push({ ...base, why: 'what may be named was told before and stands' }); continue; }
      const ask = typeof x.ask === 'string' ? clip(x.ask, 200) : '';
      const options = [...new Set((Array.isArray(x.options) ? x.options : []).filter((o): o is string => typeof o === 'string' && clip(o, 120).length > 0).map((o) => clip(o, 120)))];
      const def = typeof x.default === 'string' ? options.find((o) => same(o, x.default as string)) : undefined;
      if (!ask || options.length < 2 || options.length > 4 || !def) { decisions.push({ ...base, why: 'the question came without 2 to 4 options and a default among them' }); continue; }
      decisions.push(base);
      asked.set(kind, { q: { id: kind.toLowerCase(), ask, options, default: told ? told.answer : def, ...(told ? { last: told.answer } : {}) }, score: spreadScore({ status, spread }) });
    }
    if (!decisions.length) return null;
    // At most three, in the kinds' fixed order: the angle first.
    const questions = QUESTION_KINDS.flatMap((k) => { const a = asked.get(k); return a ? [a.q] : []; }).slice(0, MAX_QUESTIONS);
    return { decisions, questions };
  },
  // No model, or nothing grounded: ask nothing.
  floor() { return { decisions: [], questions: [] }; },
};

/** A letter for an option: a, b, c, d. */
export const letter = (i: number): string => String.fromCharCode(97 + i);

/** Where one `id=choice` pair ends and the next begins (a form parser): a comma followed by an id and "=". */
const PAIR_BREAK = /,(?=\s*[a-z][a-z0-9_-]*\s*=)/i;

/**
 * THE ANSWERS GIVEN AS `--answers "angle=b,naming=only the product, never the operator"` (a form parser: `id=choice`
 * pairs, split only where a comma is followed by `<id>=`, so an answer may hold commas). A single letter names that
 * option of the question; a letter past its options is no answer: the default stands, and that is said. Anything else
 * is the person's own answer, kept as written. An id that is a question kind answers that kind, asked this run or not;
 * one that is no kind is said in one line and ignored. Never fails.
 */
export function readAnswers(s: string | undefined, questions: readonly Question[]): { readonly answers: Map<string, string>; readonly said: string[] } {
  const answers = new Map<string, string>(); const said: string[] = [];
  const kinds = [...QUESTION_KINDS, ...GAP_KINDS].map((k) => k.toLowerCase());
  const gapIds = new Set<string>(GAP_KINDS.map((k) => k.toLowerCase()));
  for (const part of (s ?? '').split(PAIR_BREAK)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const id = part.slice(0, eq).trim().toLowerCase(); const choice = part.slice(eq + 1).trim();
    if (!id || !choice) continue;
    if (!kinds.includes(id)) { said.push(`${id} matched no question; ignored.`); continue; }
    const q = questions.find((x) => x.id === id);
    const i = /^[a-d]$/i.test(choice) ? choice.toLowerCase().charCodeAt(0) - 97 : -1;
    if (i < 0) {
      // A gap question's answer in the person's own words is a fact or a frame: a few characters carry neither, and
      // count as a decline (an option, by letter or in full, is never one).
      if (gapIds.has(id) && choice.length < DECLINE_UNDER && !(q?.options ?? []).some((o) => same(o, choice))) {
        said.push(`${id}=${choice}: under ${DECLINE_UNDER} characters, counted as a decline; written with the default${q ? ` (${q.default})` : ''}.`); continue;
      }
      answers.set(id, choice); continue;
    }
    if (q && i < q.options.length) { answers.set(id, q.options[i]); continue; }
    said.push(q ? `${id}=${choice}: the question has no option ${choice.toLowerCase()}; written with the default (${q.default}).`
      : `${id}=${choice}: no ${id} question was asked this run to pick ${choice.toLowerCase()} from; ignored.`);
  }
  return { answers, said };
}

/** The questions as a person reads them in a terminal: each with its lettered options and its default, and what an answer unlocks. */
export function questionLines(qs: readonly Question[]): string[] {
  return qs.flatMap((q, n) => [`${n + 1}. ${q.ask}`, ...q.options.map((o, i) => `   ${letter(i)}) ${o}${same(o, q.default) ? ' (default)' : ''}`),
    ...(q.last ? [`   last time you said: ${q.last}`] : []), ...(q.unlocks ? [`   an answer unlocks: ${q.unlocks}`] : [])]);
}

/** The one line said where the questions are not asked (a host, a pipe, --json): written with the defaults, and how to answer. */
export function defaultsLine(qs: readonly Question[]): string {
  return `Questions before writing (${qs.length}): written with the defaults (${qs.map((q) => `${q.id}: ${q.default}`).join('; ')}); to answer, run again with --answers "${qs.map((q) => `${q.id}=<letter or your words>`).join(',')}".`;
}

/** How a default nobody answered is served to the writer: as an assumption, with the way to change it. */
export const ASSUMED = 'assumed, no answer given (change with --answers):';

/**
 * What the writer is told of the answers, after the skill. `answers` holds only what the person gave (now, or told
 * before): those settle the decisions in the person's own words. A question none of them answers is served with its
 * default as an assumption, apart and said so: the writer never takes a default as the person's position, and never
 * states what rests on it as a fact of theirs (an assumed angle or news served as fact was the person's own work
 * misreported).
 */
export function answersNote(qs: readonly Question[], answers: ReadonlyMap<string, string>): string {
  const mine = qs.filter((q) => answers.has(q.id)).map((q) => `- ${q.ask} ${answers.get(q.id) ?? ''}`);
  const assumed = qs.filter((q) => !answers.has(q.id)).map((q) => `- ${q.ask} ${ASSUMED} ${q.default}`);
  return [mine.length ? `Before writing I settled these (my answers; write from them):\n\n${mine.join('\n')}` : '',
    assumed.length ? `Not settled: nobody answered these, so each is a working assumption, not my position. Write from it as an assumption (never state it as a fact about me, my work or my company) and keep what rests on it easy to change:\n\n${assumed.join('\n')}` : ''].filter(Boolean).join('\n\n');
}

// ── QUESTIONS FROM GAPS ──────────────────────────────────────────────────────────────────────
//
// The reading above asks what only the author can decide. A second reading asks what only the author can SUPPLY: a fact
// the piece will lean on that nothing given holds, and the frame (who it is for, what is at stake) where nothing given
// states it. A question is derived from the gap, never invented: the reader lists the claims the piece will need and
// where each one's proof is stated, and says where the reader and the stakes are stated; code holds every "stated" to its
// quote, so only a real absence is asked.
//
// Never the call. Each claim carries a closed field: does an answer supply a FACT (a figure, a case, a source) or decide
// the POSITION the piece takes? A POSITION is the piece's own judgment, never asked; it is logged as such.

/** What the gap reader is shown: the request, the material, the facts already inventoried, and what the skill was told. */
export interface GapsInput {
  readonly request: string;
  readonly material: readonly { readonly name: string; readonly head: string }[];
  /** the facts the material and any enrichment already hold, one per item (a sibling module's inventory, or none) */
  readonly inventory: readonly { readonly text: string }[];
  readonly told: readonly ToldAnswer[];
  /** authored wording for the gap questions, by gap ("reader", "stakes", "proof"); the house wording where absent */
  readonly wording?: readonly { readonly gap: string; readonly ask: string; readonly unlocks: string }[];
}
/** One candidate from a gap, as grounded: asked (with its question) or not, and why. */
export interface GapCandidate { readonly kind: GapKind; readonly what: string; readonly question?: Question; readonly why?: string }
export interface GapsReading { readonly candidates: readonly GapCandidate[] }

/** The most claims the reader lists. */
export const MAX_CLAIMS = 4;
/** Where a proof, the reader or the stakes are stated: a closed field, NONE where nothing states it. */
export const GAP_STATED_IN = ['request', 'material', 'inventory', 'told', 'NONE'] as const;
/** The default for a proof nobody gives: never invented, said as the author's view. */
export const PROOF_DEFAULT = 'No proof to hand: say it as my view, not as a fact';
export const PROOF_OPTIONS = [PROOF_DEFAULT, 'Leave the claim out'] as const;
/** The house wording of the frame questions; a library's wording for the same gap replaces it. */
export const GAP_WORDING: Readonly<Record<'READER' | 'STAKES', { readonly ask: string; readonly unlocks: string }>> = {
  READER: { ask: 'Who is this piece for?', unlocks: KIND_UNLOCKS.READER },
  STAKES: { ask: 'What is at stake for the reader if they skip it?', unlocks: KIND_UNLOCKS.STAKES },
};

export const GAPS_SYSTEM = `You prepare a writer to write one piece. You are shown the person's request, the material that came with it, the facts already listed from that material, and what they told this skill before.

1. claims: the factual claims this piece will need to make to do what the request asks (at most four, the ones the piece leans on). For each:
- claim: the claim in one short sentence.
- answer: FACT if an answer from the person would supply a fact (a figure, a case, a source, a date, a name), POSITION if it would decide what the piece argues or concludes. The piece's own position is never asked.
- supportIn: where its proof is stated in so many words: "request", "material", "inventory" (the listed facts) or "told"; "NONE" where nothing given holds it.
- quote: a short quote copied exactly from where the proof is stated; null for NONE.
- unlocks: one line: what the piece can do once the person gives the proof.
2. reader and stakes: who the piece is for, and what is at stake for that reader. For each:
- statedIn: "request", "material", "inventory" or "told" with a quote copied exactly from there; "NONE" with no quote where nothing given states it. A reader you could guess is not a stated reader: answer NONE.
- spread: would different answers give the SAME draft, SOME difference, or DIFFERENT drafts.
- options: two to four short answers the person could give, and default: the one you would write for if they say nothing.

Most requests carry what they need: then every claim has its proof and the reader and stakes are stated.`;

const frameSchema = { type: 'object', properties: {
  statedIn: { type: 'string', enum: [...GAP_STATED_IN] }, quote: { type: ['string', 'null'] },
  spread: { type: 'string', enum: ['SAME', 'SOME', 'DIFFERENT'] },
  options: { type: 'array', items: { type: 'string' } }, default: { type: ['string', 'null'] },
}, required: ['statedIn', 'quote', 'spread', 'options', 'default'], additionalProperties: false };

export const GAPS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    claims: { type: 'array', items: { type: 'object', properties: {
      claim: { type: 'string' }, answer: { type: 'string', enum: ['FACT', 'POSITION'] },
      supportIn: { type: 'string', enum: [...GAP_STATED_IN] }, quote: { type: ['string', 'null'] }, unlocks: { type: 'string' },
    }, required: ['claim', 'answer', 'supportIn', 'quote', 'unlocks'], additionalProperties: false } },
    reader: frameSchema, stakes: frameSchema,
  },
  required: ['claims', 'reader', 'stakes'], additionalProperties: false,
};

/** Whether a quote of five or more characters is in the source the reader named (a form check). */
function gapStated(where: string, quote: unknown, input: GapsInput): boolean {
  const q = straight(clip(typeof quote === 'string' ? quote : '', 400)).toLowerCase();
  if (q.length < 5) return false;
  const source = where === 'request' ? input.request : where === 'material' ? input.material.map((m) => m.head).join('\n')
    : where === 'inventory' ? input.inventory.map((f) => f.text).join('\n') : where === 'told' ? input.told.map((t) => t.answer).join('\n') : '';
  return straight(clip(source, 100000)).toLowerCase().includes(q);
}
const wordingFor = (input: GapsInput, gap: string): { ask: string; unlocks: string } | undefined =>
  input.wording?.find((w) => w.gap.toLowerCase() === gap && clip(w.ask, 200).length > 0);

export const GAPS: Reading<GapsInput, GapsReading> = {
  id: 'question-gaps', version: '1',
  system: GAPS_SYSTEM, schema: GAPS_SCHEMA,
  toolName: 'emit_gaps', toolDescription: 'The claims the piece needs and where each proof is stated; where the reader and the stakes are stated.',
  maxTokens: 1200, estimateUsd: 0.01,
  prompt(input) {
    return [`The request:\n${input.request.slice(0, 4000)}`,
      input.material.length ? `The material:\n${input.material.map((m) => `[${m.name}]\n${m.head}`).join('\n\n')}` : 'No material came with it.',
      input.inventory.length ? `The facts listed from it:\n${input.inventory.slice(0, 60).map((f, i) => `${i + 1}. ${clip(f.text, 300)}`).join('\n')}` : 'No facts were listed.',
      input.told.length ? `What they told this skill before:\n${input.told.map((t) => `- ${t.ask} ${t.answer}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  },
  decide(input) { return input.request.trim() ? null : { candidates: [] }; },
  ground(raw, input) {
    const r = raw as { claims?: unknown; reader?: unknown; stakes?: unknown } | null;
    if (!r || !Array.isArray(r.claims)) return null;
    const candidates: GapCandidate[] = [];
    let proofAsked = false;
    for (const c of r.claims.slice(0, MAX_CLAIMS) as Record<string, unknown>[]) {
      const claim = typeof c?.claim === 'string' ? clip(c.claim, 200) : '';
      if (!claim || (c.answer !== 'FACT' && c.answer !== 'POSITION')) continue;
      const where = String(c.supportIn);
      const proved = where !== 'NONE' && gapStated(where, c.quote, input);
      const why = c.answer === 'POSITION' ? 'the piece\'s own position: never asked'
        : proved ? `its proof is stated in the ${where}`
          : proofAsked ? 'one proof question per run: an earlier claim was taken' : undefined;
      if (why) { candidates.push({ kind: 'PROOF', what: claim, why }); continue; }
      proofAsked = true;
      const w = wordingFor(input, 'proof');
      const unlocks = typeof c.unlocks === 'string' && clip(c.unlocks, 160) ? clip(c.unlocks, 160) : w?.unlocks ?? KIND_UNLOCKS.PROOF;
      // The claim is quoted as the reader wrote it, inside authored wording: no derived sentence to come out ungrammatical.
      const ask = w ? `${clip(w.ask, 200)} "${claim}"` : `The piece will need proof for this: "${claim}" What shows it (a figure, a case or a source of yours)?`;
      candidates.push({ kind: 'PROOF', what: claim, question: { id: 'proof', ask, options: [...PROOF_OPTIONS], default: PROOF_DEFAULT, unlocks } });
    }
    for (const kind of ['READER', 'STAKES'] as const) {
      const f = (kind === 'READER' ? r.reader : r.stakes) as Record<string, unknown> | null | undefined;
      const what = kind === 'READER' ? 'who the piece is for' : 'what is at stake for the reader';
      if (!f || typeof f !== 'object') continue;
      const where = String(f.statedIn);
      if (where !== 'NONE' && gapStated(where, f.quote, input)) { candidates.push({ kind, what, why: `stated in the ${where}` }); continue; }
      if (f.spread !== 'DIFFERENT') { candidates.push({ kind, what, why: 'not stated, but the answers would not change the draft' }); continue; }
      const options = [...new Set((Array.isArray(f.options) ? f.options : []).filter((o): o is string => typeof o === 'string' && clip(o, 120).length > 0).map((o) => clip(o, 120)))];
      const def = typeof f.default === 'string' ? options.find((o) => same(o, f.default as string)) : undefined;
      if (options.length < 2 || options.length > 4 || !def) { candidates.push({ kind, what, why: 'the question came without 2 to 4 options and a default among them' }); continue; }
      const told = [...input.told].reverse().find((t) => t.id === kind.toLowerCase());
      const w = wordingFor(input, kind.toLowerCase()) ?? GAP_WORDING[kind];
      candidates.push({ kind, what, question: { id: kind.toLowerCase(), ask: clip(w.ask, 200), options, default: told ? told.answer : def, ...(told ? { last: told.answer } : {}), unlocks: clip(w.unlocks, 160) || KIND_UNLOCKS[kind] } });
    }
    return candidates.length ? { candidates } : null;
  },
  floor() { return { candidates: [] }; },
};

/** One candidate the run considered, asked or not, with why: the run record keeps them all, so the value of asking can be measured later. */
export interface QuestionLogEntry {
  readonly kind: QuestionKind | GapKind | 'OTHER';
  readonly what: string;
  readonly asked: boolean;
  readonly why: string;
  /** the question as it would have been put, where one was formed */
  readonly ask?: string;
  readonly default?: string;
  readonly unlocks?: string;
}

/** The order the cap keeps questions in: the angle, then what is missing (proof, the frame), then the author's other decisions. */
export const ASK_ORDER: readonly (QuestionKind | GapKind)[] = ['ANGLE', 'PROOF', 'READER', 'STAKES', 'NAMING', 'NEWS', 'EMPHASIS'];

/**
 * THE QUESTIONS A RUN ASKS, AND THE LOG OF ALL IT CONSIDERED. The decisions reading and the gap reading each propose;
 * code keeps at most MAX_QUESTIONS in ASK_ORDER, every one carrying what it unlocks and a default. Where the angle is
 * asked, the stakes question is not (the angle already asks why it matters now). With no gap candidates, the questions
 * are the decisions reading's, in its order, unchanged apart from `unlocks`. Every candidate goes in the log with why.
 */
export function chooseQuestions(decided: QuestionsReading, gaps: GapsReading | null): { readonly questions: Question[]; readonly log: QuestionLogEntry[] } {
  const formed = new Map<QuestionKind | GapKind, Question>();
  for (const q of decided.questions) formed.set(q.id.toUpperCase() as QuestionKind, { ...q, unlocks: q.unlocks ?? KIND_UNLOCKS[q.id.toUpperCase() as QuestionKind] });
  for (const c of gaps?.candidates ?? []) if (c.question && !formed.has(c.kind)) formed.set(c.kind, c.question);
  const dropped = new Map<string, string>();
  if (formed.has('ANGLE') && formed.has('STAKES')) { formed.delete('STAKES'); dropped.set('STAKES', 'the angle question already asks why it matters now'); }
  const ordered = ASK_ORDER.flatMap((k) => { const q = formed.get(k); return q ? [q] : []; });
  const questions = ordered.slice(0, MAX_QUESTIONS);
  for (const q of ordered.slice(MAX_QUESTIONS)) dropped.set(q.id.toUpperCase(), `cut by the cap of ${MAX_QUESTIONS}`);
  const isAsked = (kind: string, ask?: string): boolean => questions.some((q) => q.id.toUpperCase() === kind && (!ask || q.ask === ask));
  const log: QuestionLogEntry[] = [];
  for (const d of decided.decisions) {
    const q = d.kind === 'OTHER' ? undefined : decided.questions.find((x) => x.id === d.kind.toLowerCase());
    const asked = !d.why && !!q && isAsked(d.kind, q.ask);
    log.push({ kind: d.kind, what: d.what, asked, why: asked ? 'asked' : d.why ?? dropped.get(d.kind) ?? 'not asked',
      ...(q && !d.why ? { ask: q.ask, default: q.default, unlocks: q.unlocks ?? (d.kind === 'OTHER' ? undefined : KIND_UNLOCKS[d.kind]) } : {}) });
  }
  for (const c of gaps?.candidates ?? []) {
    const asked = !!c.question && isAsked(c.kind, c.question.ask);
    log.push({ kind: c.kind, what: c.what, asked, why: asked ? 'asked' : c.why ?? dropped.get(c.kind) ?? `a ${c.kind.toLowerCase()} question was already taken`,
      ...(c.question ? { ask: c.question.ask, default: c.question.default, unlocks: c.question.unlocks } : {}) });
  }
  return { questions, log };
}
