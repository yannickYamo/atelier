// cli/direct.ts — THE DIRECT WRITER: THE AUTHOR'S PIECES, THE MATERIAL, THE TASK, A DRAFT, ONE SELF-REVIEW.
//
// The default way a skill built from someone's pieces writes (cli/commands/invoke.ts sends a run here; `--pipeline
// legacy` keeps the compiled path). In every blind test since September the compiled path (rules, a plan, method steps,
// moves, repair) lost to the plainest arm: the author's posts of the kind asked for pasted whole, the material, the task,
// then one self-review against the same posts. So the run starts from that, and adds only what Atelier knows that a
// paste does not:
//
//   1. which pieces: a reading of the request against the skill's catalogue (core/direct/route.ts), so a comparison is
//      written from comparisons and an essay from essays; the person's kept pieces are in the catalogue (`atelier keep`);
//   2. the draft, written as prose at the effort asked (default high), with no tool forced and no rule served;
//   3. one self-review with the same pieces, the material and the task, and the person's own earlier corrections;
//   4. the checks: a rule the person stated and required is shown to the writer in their words, and a sentence of the
//      reviewed piece that still breaks one is rewritten, that sentence only (`atelier verify --repair`'s repair); the
//      rest (a specific not in what was given, a habit read off the pieces) is listed beside the piece and changes
//      nothing. The record's delivery decides the exit, as on every run; nothing is blanked or refused.
//
// The record is the one every run writes (core/loop/run-once.ts, `runOnce`), with `direct` saying what was shown and
// who chose it, so `atelier report`, `rate`, `fix` and `keep` read it as any other run.

import { STYLE_READ, styleItems, answerItems, styleNote, styleLines, type StyleReading } from '../core/direct/style.js';
import * as store from '../core/state/store.js';
import { sha } from '../core/state/receipt.js';
import { readContext } from '../core/inference/reading.js';
import { spend, processSpentUsd, declined, type Budget, type InferenceClient } from '../core/inference/client.js';
import { resolveProvenance } from '../core/fidelity/provenance.js';
import { DEFAULT_SETTINGS, type ImplementationSettings } from '../core/fidelity/types.js';
import { inferredLines } from '../core/loop/inferred.js';
import { statedLength, againstStated, notHeldBecause } from '../core/intake/length.js';
import { DECLINED_NOTE } from './guided.js';
import { wordsWritten } from '../core/eval/size.js';
import type { RuntimeBinding } from '../core/runtime/binding.js';
import type { SkillVersion, StandardVersion, DirectRecord, RepairRecord, InvocationSettings, LatitudeLevel, InferredItem } from '../core/state/canonical-state.js';
import { runOnce, draftMaxTokens, type Written } from '../core/loop/run-once.js';
import { workField, workRecord } from '../core/loop/work-field.js';
import { catalogueOf, titleOf, withinBudget, PIECE_BUDGET_CHARS, type Piece } from '../core/direct/pieces.js';
import { PIECE_ROUTE, type Route } from '../core/direct/route.js';
import { piecesBlock, taskBlock, DRAFT_ASK, reviewAsk, EDITS_SHOWN } from '../core/direct/prompt.js';
import { correctionsOf } from '../core/direct/kept.js';
import { EDITOR_QUESTIONS, EDITOR_KINDS, editorNote, askOf, type EditorReading } from '../core/direct/questions.js';
import { cardLine, type PurposeCard } from '../core/direct/card.js';
import { readAnswers, questionLines, materialShown, type Question } from '../core/loop/questions.js';
import { typedAnswer, JUST_WRITE, questionsJson } from './prewrite.js';
import { createInterface } from 'node:readline/promises';
import { learnedShape, steeredShape, removeShapeExtras } from '../core/loop/shape-steer.js';
import { checkDraftAsync, refineToStandard, REPAIR_PASSES, CLAIMS_TO_CHECK, INCONCLUSIVE, PUBLIC_FACTS } from '../core/loop/run-repair.js';
import { supportIsIn, numbersIn } from '../core/loop/claim-extract.js';
import type { Span } from '../core/observers/registry.js';
import { planFor } from '../core/plan/execution-plan.js';
import { buildRunEval } from './eval-run.js';
import { putEval } from '../core/state/eval-store.js';
import type { EvalSummary } from '../core/eval/summary.js';
import type { Entry } from '../core/eval/record.js';
import { acts, type VerifyReport } from '../core/observers/verify.js';
import { recordHead } from '../core/eval/certificate.js';
import { checksFor } from './checks.js';
import { contextReaderClient, contextReaderModel, flag, numericFlag, argv } from './runtime.js';
import { asText } from '../core/discovery/text.js';
import type { Voice } from '../core/compiler/voice.js';
import { pointsWithRates } from '../core/compiler/moves.js';
import { groundCarried, carriedClaims } from '../core/loop/grounding.js';
import { releaseFor } from './fidelity.js';
import { readFidelity } from '../core/fidelity/profile.js';
import { typicalityOf } from '../core/fidelity/typicality.js';
import type { FidelityRecord } from '../core/fidelity/types.js';
import { grammarListed, toCheckList } from '../core/observers/grammar.js';
import { GRAMMAR_NOT_CHECKED } from '../core/eval/record-build.js';
import { totalsOff, totalsLine } from '../core/observers/totals.js';import { howHeld } from './how-held.js';
import { methodReading, methodLine } from '../core/eval/obligations.js';








export const DIRECT_VERSION = '1';
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof EFFORTS)[number];
/** The token ceiling of a prose call: thinking at high effort counts against it, as it did for the baseline (32,000). */
export const DIRECT_MAX_TOKENS = 32_000;
/** The ceiling a prose call is sent with: `--max-tokens` where the person set one (a backend with a lower limit), else at least DIRECT_MAX_TOKENS. */
export const directMaxTokens = (): number => (flag('--max-tokens') !== undefined ? draftMaxTokens() : Math.max(draftMaxTokens(), DIRECT_MAX_TOKENS));
/** What one prose call is held to before it is sent: a long piece at high effort, not the cap of a run. */
const PROSE_ESTIMATE_USD = 0.25;

/**
 * The pieces a skill holds to write from: every piece it was built from, else the pieces it serves, else the one example
 * it was built from. A skill built from a single example (a pricing memo, a launch brief) stores it as its exemplar and no
 * pieces: the direct writer refused it ("holds none of the author's pieces") and every such run took the compiled path.
 */
export function builtPieces(voice: Voice | null, exemplar: { text: string; request?: string } | null = null): { text: string; request: string | null }[] {
  if (voice?.wholePieces?.length) return [...voice.wholePieces];
  const served = voice?.pieces ?? [];
  const req = voice?.pieceRequests ?? [];
  const guard = (voice?.guardPieces ?? []).filter((g) => !served.includes(g));
  const held = [...served.map((t, i) => ({ text: t, request: req[i] ?? null })), ...guard.map((t) => ({ text: t, request: null }))];
  return held.length || !exemplar?.text.trim() ? held : [{ text: exemplar.text, request: exemplar.request?.trim() ? exemplar.request : null }];
}

/**
 * WHETHER A RUN GOES THE DIRECT WAY. A skill that writes documents from pieces, with no output contract, not held strict,
 * and not asked for another path. `null` when it does; otherwise why not, said on the record of the compiled run.
 */
export function directWhyNot(x: { voice: Voice | null; std: StandardVersion | null; contract: boolean; strict: boolean; held?: LatitudeLevel | null;
  /** the one example a skill was built from, where it holds no pieces */
  exemplar?: { text: string; request?: string } | null;
  /** a note `atelier evolve` adopted: only the compiled path serves it, or says it no longer applies */
  carried?: boolean;
  /** a short piece from a long-form standard (`--limit`, a short `--class`): its limit and bands are the compiled path's */
  shortForm?: boolean;
  /** the skill's release settings (`atelier fidelity --set`): what the owner turned on that only the compiled path runs */
  settings?: Partial<ImplementationSettings> | null;
  /** the judgement reader holds VETO on some rule, earned on the owner's labels (core/taste/calibration.ts) */
  vetoEarned?: boolean }): string | null {
  const asked = flag('--pipeline');
  if (asked !== undefined && asked !== 'direct' && asked !== 'legacy') throw new Error(`--pipeline takes direct or legacy; got "${asked}".`);
  if (asked === 'legacy') return 'asked for the compiled path (--pipeline legacy)';
  if (argv.includes('--deep')) return 'a deep run takes the compiled path';
  // A SETTING THE OWNER TURNED ON FOR THE SKILL IS ASKED AS THE FLAG IS. Read only from the typed flag, a skill set to
  // mode=deep ran plain on every run, said nowhere. Only what is off until turned on routes: the release's default
  // drafts are the compiled path's own, not a choice.
  const forced = asked === 'direct';
  const set = forced ? null : releaseOnly(x.settings ?? null);
  if (set) return `the skill's release sets ${set}, which the compiled path runs`;
  if (x.contract) return 'the skill has an output contract';
  if (!x.std) return 'the skill has no standard';
  // A RULE YOUR LABELS QUALIFIED THE JUDGEMENT READER TO BLOCK blocks where that reader runs: the compiled path. On the
  // direct path it was read by nothing that could act, and nothing said so.
  if (x.vetoEarned && !forced) return 'a rule your labels qualified the judgement reader to hold is read on the compiled path';
  if (x.carried && !forced) return 'a note atelier evolve adopted for this skill is served by the compiled path';
  // as typed either way: `--drafts 3` and `--drafts=3` (the second was missed, and such a run went direct)
  const compiledOnly = COMPILED_FLAGS.find((f) => argv.some((a) => a === f || a.startsWith(`${f}=`)));
  if (compiledOnly) return `${compiledOnly} is read by the compiled path`;
  // Strict delivery refuses what does not conform; the direct path never refuses, so not even --pipeline direct takes it.
  if (x.strict) return 'strict delivery holds the compiled path';
  if (x.shortForm) return 'a short piece from a long-form standard takes the compiled path';
  if (!forced && x.std.latitude?.level === 'STRICT') return 'a strict skill holds the compiled path';
  if (!forced && x.voice?.form === 'REPLY') return 'a skill that answers takes the compiled path';
  if (builtPieces(x.voice, x.exemplar ?? null).length < 1) return 'the skill holds none of the author\'s pieces';
  return null;
}

/** The first setting of a release that is off until the owner turns it on and that only the compiled path runs, as `key=value`. */
export function releaseOnly(s: Partial<ImplementationSettings> | null): string | null {
  if (!s) return null;
  // more drafts than the compiled path's default of two are a choice the direct writer (one draft, one review) cannot run
  const on: [string, unknown][] = [['mode', s.mode], ['voice', s.voice], ['selection', s.selection], ['context', s.context], ['nearness', s.nearness], ['moves', s.moves === 'serve' ? 'serve' : undefined],
    ['drafts', typeof s.drafts === 'number' && s.drafts > DEFAULT_SETTINGS.drafts ? s.drafts : undefined]];
  const hit = on.find(([, v]) => v !== undefined && v !== null);
  return hit ? `${hit[0]}=${String(hit[1])}` : null;
}

/** Flags only the compiled path reads: given one, a run takes that path, and says so. */
export const COMPILED_FLAGS = ['--voice', '--register', '--structure', '--until-typical', '--until-author', '--shape-rounds', '--fidelity', '--try-release',
  '--drafts', '--sections', '--select', '--context', '--nearness', '--moves', '--taste', '--placeholders', '--strict', '--graded', '--set-aside',
  // a fix replayed as a whole new piece (`atelier fix`): the complaint and what earlier fixes took out are the compiled path's
  '--correcting', '--corrections-of', '--fix-of',
  // a candidate release is measured against the package it was compiled to, which the direct writer never serves
  '--candidate', '--limit'] as const;

export interface DirectContext {
  readonly L: store.StoreLayout;
  readonly sv: SkillVersion;
  readonly std: StandardVersion;
  readonly name: string;
  readonly asked: string;
  readonly material: readonly { readonly name: string; readonly text: string }[];
  readonly client: InferenceClient;
  readonly binding: RuntimeBinding;
  readonly say: (line: string) => void;
  readonly detail: (line: string) => void;
  /** when the run started, for the evaluation's duration */
  readonly started: number;
  /** what the run was configured with, as every run records it (cli/commands/invoke.ts, `settingsFor`): the certificate, the flags, a test run's mark */
  readonly settings: (checks: ReturnType<typeof checksFor>) => InvocationSettings;
  /** what the process had spent when the run began: the run's cost is everything after it */
  readonly spentBefore: number;
  /**
   * The level the request holds this run at, where it is stricter than the skill's ("use only these figures"): the run
   * stays direct, and the claim check is held at that level, so a figure nothing given holds has its sentence rewritten
   * and, if it stays, blocks the piece. Read twice there, as a check that can act always is.
   */
  readonly held?: LatitudeLevel | null;
  /** a person at a terminal: the editor's questions are asked there; everywhere else they are returned, unanswered */
  readonly interactive: boolean;
  /** how a line is read from the person (a test passes its own) */
  readonly read?: (prompt: string) => Promise<string>;
}

/** A line read from the person at the terminal; the prompt goes to stderr, so stdout stays the work. */
async function askLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try { return (await rl.question(prompt)).trim(); } finally { rl.close(); }
}

/** A kept editor reading, only where every question in it is whole: anything else is read again. */
export const keptReading = (x: unknown): { value: EditorReading; by: string } | null => {
  const r = x as { value?: { decisions?: unknown; questions?: unknown }; by?: unknown } | null;
  const qs = r?.value?.questions;
  if (!r || typeof r.by !== 'string' || !Array.isArray(r.value?.decisions) || !Array.isArray(qs)) return null;
  const whole = (q: unknown): boolean => { const o = q as Record<string, unknown> | null; return !!o && typeof o.id === 'string' && typeof o.ask === 'string' && typeof o.default === 'string' && Array.isArray(o.options) && o.options.every((v) => typeof v === 'string'); };
  return qs.every(whole) ? { value: r.value as EditorReading, by: r.by } : null;
};

/** What the editor's questions settled: the note the writer reads, the questions, and the person's answers. */
export interface Asked { readonly note: string; readonly questions: readonly Question[]; readonly answers: readonly { readonly id: string; readonly answer: string }[]; readonly by: string }

/**
 * THE EDITOR'S QUESTIONS (core/direct/questions.ts): the one idea, the reader's pain and the proof, asked only where
 * nothing given states them. At a terminal each is asked (a letter, the person's own words, enter for the suggested one,
 * "just write it" for none); elsewhere they are returned and the piece is written without them: nothing the person did
 * not answer reaches the writer. Answers given with --answers count, now or for a kind this run did not ask, and are
 * kept as next time's suggestion. --no-questions reads nothing.
 */
/** The card told to the editor: one read with nothing grounded tells nothing. */
const cardOf = (L: store.StoreLayout): PurposeCard | null => { const c = store.getCard(L); return c && cardLine(c) ? c : null; };

export async function editorQuestions(c: Pick<DirectContext, 'L' | 'asked' | 'material' | 'interactive' | 'read' | 'say'>, method: string, kind: string | null = null): Promise<Asked> {
  if (argv.includes('--no-questions')) return { note: '', questions: [], answers: [], by: 'off' };
  // AN EDITOR'S ANSWER BELONGS TO THE PIECE IT WAS GIVEN FOR. The one idea of last week's post is not this one's: read
  // across requests, an answer counted as "stated" for the next piece, which was then neither asked nor told it.
  // The piece is the request with what was given for it: the same words asked over other notes are another piece.
  const forRequest = c.material.length ? sha(JSON.stringify([c.asked.trim(), materialShown(c.material)])) : sha(c.asked.trim());
  // An answer kept for one request (`for`) is this request's only. One kept with none is the skill's (the compiled
  // path's kinds); an editor kind kept with none predates answers per request and is left out.
  const all = store.getTold(c.L);
  const told = all.filter((t) => t.for === undefined ? !(EDITOR_KINDS as readonly string[]).includes(t.id) : t.for === forRequest);
  const input = { request: c.asked, material: materialShown(c.material), method, told, kind, card: cardOf(c.L) };
  // THE SAME INPUT ASKS THE SAME QUESTIONS: a model's reading is kept under the hash of what it read (store.ts, getEditorReading).
  const key = sha(JSON.stringify([EDITOR_QUESTIONS.version, contextReaderModel(), input.request, input.kind, input.card ?? null, input.material, input.method, told.map((t) => [t.id, t.answer])]));
  const kept = keptReading(store.getEditorReading(c.L, key));
  const decided = kept ??
    await readContext(EDITOR_QUESTIONS, input, contextReaderClient(), contextReaderModel(), { spentUsd: 0, capUsd: 0.03, maxCalls: 1 }, 'other');
  if (!kept && decided.by === 'model') store.putEditorReading(c.L, key, { value: decided.value, by: decided.by });
  // a reading that could not be made asks nothing, and says so: silence here read as "nothing was open"
  if (!kept && decided.by !== 'model') c.say(`(the editor's questions were not read: ${('why' in decided ? decided.why : undefined) ?? 'no model'}; none is asked)`);
  const questions = decided.value.questions;
  const { answers: given, said } = readAnswers(flag('--answers'), questions, [...new Set([...EDITOR_KINDS, ...questions.map((q) => q.id)])], false);
  for (const s of said) c.say(s);
  const answers: { id: string; answer: string }[] = [];
  let rest = false;
  // WHAT THE PERSON ANSWERED FOR THIS SAME REQUEST ON AN EARLIER RUN IS STILL THEIRS: it reaches the writer again, asked
  // or found stated in it, and is never asked twice. Their answer now, where they give one, is the one that counts.
  const mine = told.filter((t) => t.for === forRequest);
  const before = new Map(mine.map((t) => [t.id, t.answer]));
  // what an earlier answer decides, kept with it: a decision answered once is settled, so this reading no longer asks it
  const aboutBefore = mine.filter((t) => t.about).map((t) => ({ id: t.id, about: t.about }));
  for (const q of questions) {
    const g = given.get(q.id) ?? before.get(q.id);
    if (g !== undefined) { answers.push({ id: q.id, answer: g }); continue; }
    if (!c.interactive || rest) continue;
    process.stderr.write(`\n${questionLines([q]).join('\n')}\n`);
    const typed = await (c.read ?? askLine)('Your answer (a letter, your own words, enter for the suggested one, or "just write it"): ');
    if (JUST_WRITE.test(typed)) { rest = true; continue; }
    answers.push({ id: q.id, answer: typedAnswer(q, typed) });
  }
  // an answer for a kind this run did not ask (a field, a compiled-path kind) still counts; a decision of another
  // reading's naming has no question here to say what it decides, so it is not told
  for (const [id, answer] of [...given, ...before]) if (!questions.some((q) => q.id === id) && (askOf(id) !== null || aboutBefore.some((b) => b.id === id)) && !answers.some((a) => a.id === id)) answers.push({ id, answer });
  const at = new Date().toISOString();
  // every answer to this reading's questions belongs to this request; a compiled-path kind given here stays the skill's
  const ofThisPiece = (id: string): boolean => (EDITOR_KINDS as readonly string[]).includes(id) || questions.some((q) => q.id === id);
  store.addTold(c.L, answers.filter((a) => before.get(a.id) !== a.answer).map((a) => ({ id: a.id, ask: questions.find((q) => q.id === a.id)?.ask ?? askOf(a.id) ?? a.id, answer: a.answer, at, ...(ofThisPiece(a.id) ? { for: forRequest } : {}), ...(questions.find((q) => q.id === a.id)?.about ? { about: questions.find((q) => q.id === a.id)?.about } : {}) })));

  const open = questions.filter((q) => !answers.some((a) => a.id === q.id));
  if (answers.length) c.say(`Settled before writing, in your words: ${answers.map((a) => a.id).join(', ')}.`);
  if (open.length) {
    c.say(`An editor would ask (${open.length}), and the piece was written without ${open.length === 1 ? 'it' : 'them'}: ${open.map((q) => `${q.id}: ${q.ask}`).join(' ')}`);
    c.say(`  To answer, run again with --answers "${open.map((q) => `${q.id}=<letter or your words>`).join(',')}"${open.map((q) => ` (${q.id}: ${q.options.map((o, i) => `${String.fromCharCode(97 + i)}) ${o}`).join('; ')})`).join('')}.`);
  }
  return { note: editorNote(answers, [...questions, ...aboutBefore]), questions, answers, by: decided.by };
}

const asEffort = (x: string | undefined): Effort => {
  if (x === undefined) return 'high';
  if (!(EFFORTS as readonly string[]).includes(x)) throw new Error(`--effort takes ${EFFORTS.join(', ')}; got "${x}".`);
  return x as Effort;
};

const PROSE_ATTEMPTS = 3;


/** One prose call: the pieces cached, the task beside them, `ask` as the turn. */
async function prose(client: InferenceClient, budget: Budget, stable: string, variable: string, ask: string, effort: Effort, tool: string): Promise<Written> {
  const temperature = flag('--temperature') === undefined ? undefined : Number(flag('--temperature'));
  const once = () => spend(budget, PROSE_ESTIMATE_USD, async () => {
    const res = await client.complete({ stableBlock: stable, variableBlock: variable, userMessage: ask, toolName: tool, toolDescription: 'Write the piece.',
      schema: { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'] }, maxTokens: directMaxTokens(), plain: { effort },
      ...(temperature === undefined ? {} : { temperature }) });
    return { value: res, cost: res.cost, usage: res };
  }, 'writing');
  // A MODEL THAT DECLINES TO WRITE IS ASKED AGAIN, up to PROSE_ATTEMPTS times in all: on a real run the same request was
  // declined and then written on the next ask, and the person had been left with an error and no piece. Said once a call.
  let r: Awaited<ReturnType<typeof once>> | null = null;
  for (let attempt = 1; r === null; attempt++) {
    try { r = await once(); } catch (e) {
      if (!declined(e) || attempt >= PROSE_ATTEMPTS) throw e;
      // the ask that was declined is given back to the run's call bound: the review and the repair still have theirs
      budget.calls = Math.max(0, (budget.calls ?? 1) - 1);
      if (attempt === 1) process.stderr.write(`${DECLINED_NOTE} to write this; asked again.)\n`);
    }
  }
  // A reply that wraps the piece in a work field is the field; prose with none is the piece whole.
  const field = workField(asText((r.json as { piece?: unknown } | null)?.piece));
  const piece = field.text.trim();
  if (!piece) throw new Error('the model returned no text for the piece');
  return { piece, reportedModel: r.modelId || null, schemaSent: {}, servedTask: variable, temperatureSent: r.temperatureSent ?? null, work: workRecord(field) };
}

/** The required rules a report finds broken, the claim lines aside (those list what to check; they are no rule of the owner's). */
const brokenOf = (report: VerifyReport): string[] =>
  report.checked.filter((x) => acts(x) && x.result.verdict === 'VIOLATED' && !x.requirementId.startsWith('UNSOURCED')).map((x) => x.requirementId);

/** Every specific the claim check left for the person to check, read off the report's claim lines. */
/** One sentence listed for the person, and the words in it a reader found untraced, where it named them. */
export interface ToCheck { readonly sentence: string; readonly specific: string | null }

/**
 * WHAT IS LISTED BESIDE THE PIECE, FROM WHAT THE CHECKS FOUND. A sentence that is itself in what the person gave (its
 * words in one passage of the material or the request, and every number of it there) is never listed as not given,
 * whichever check raised it: "The CRM holds the deals", copied from the notes, was listed once as a specific to check.
 * Where a reader named the part of the sentence it could not trace, that part is said, so the person reads which words.
 */
const norm = (t: string): string => t.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
export const toCheckOf = (report: Awaited<ReturnType<typeof checkDraftAsync>>, known: string): ToCheck[] => {
  const knownNumbers = new Set(numbersIn(known));
  const given = (t: string): boolean => supportIsIn(t, known) && numbersIn(t).every((n) => knownNumbers.has(n));
  const out: ToCheck[] = [];
  for (const c of report.checked) {
    if (![...LISTED_IDS].includes(c.requirementId) || c.result.verdict !== 'VIOLATED') continue;
    for (const sp of c.result.spans as readonly (Span & { specific?: string })[]) {
      const sentence = sp.text.trim();
      const specific = sp.specific?.trim();
      // A SENTENCE MOSTLY COPIED FROM THE NOTES CAN STILL CARRY A DETAIL THEY LACK: "this afternoon", "every time" added
      // to a line of the notes left most of its words there, and the line was dropped as given. Where the reader named
      // the untraced words, the sentence goes only when those words are in the notes too.
      const namedIsGiven = !specific || specific === sentence || given(specific) || norm(known).includes(norm(specific));
      if (!sentence || (given(sentence) && namedIsGiven) || out.some((x) => x.sentence === sentence)) continue;
      out.push({ sentence, specific: specific && specific !== sentence ? specific : null });
    }
  }
  return out;
};
/**
 * HOW EACH OF THE AUTHOR'S RULES WENT ON THIS PIECE, SAID WITH THE PIECE. The direct run said only the required rules
 * still broken, so a rule held, a check that failed without blocking and a step no check reads were all silent: the
 * method's own checks ("no ask at the end", the headings) looked as though they had never run. Each rule of the standard
 * is said under what was found: held, not held, found by a check not yet qualified on the examples (it blocks nothing),
 * and the steps no check reads, which are the person's to judge.
 */
/** `styleRead`: the steps no check reads were read this run, after the draft (core/direct/style.ts), and are said there. */
const notRunHere = (e: Entry): boolean => (e.observation.evidence ?? '').startsWith(GRAMMAR_NOT_CHECKED);
export function rulesLines(entries: readonly Entry[], styleRead = false): string[] {
  const own = entries.filter((e) => e.dimension === 'STANDARD');
  if (!own.length) return [];
  const name = (e: Entry): string => { const t = e.statement.replace(/\s+/g, ' ').trim(); return `"${t.length > 60 ? `${t.slice(0, 57)}...` : t}"`; };
  const unq = (e: Entry): boolean => e.reason === 'OBSERVER_UNQUALIFIED';
  const groups: [string, Entry[]][] = [
    ['held', own.filter((e) => e.result === 'PASS')],
    ['not held', own.filter((e) => e.result === 'FAIL')],
    ['a check not yet qualified found it broken (blocks nothing)', own.filter((e) => unq(e) && e.observation.found === 'VIOLATED')],
    ['a check not yet qualified found it held', own.filter((e) => unq(e) && e.observation.found === 'MET')],
    ['a check not yet qualified could not read it', own.filter((e) => unq(e) && e.observation.found === undefined)],
    ['partly checked', own.filter((e) => e.reason === 'PARTLY_CHECKED')],
    // a check that could not run is not checked (the grammar engine switched off, say), never "listed"
    ['not checked: its check could not run', own.filter((e) => e.reason === 'LISTED_FOR_YOU' && notRunHere(e))],
    ['listed for you to read', own.filter((e) => e.reason === 'LISTED_FOR_YOU' && !notRunHere(e))],
    [styleRead ? 'no check reads it: read below, under how you write' : 'no check reads it: yours to judge', own.filter((e) => e.reason === 'NOT_MACHINE_CHECKABLE')],
    ['does not apply to this piece', own.filter((e) => e.result === 'NOT_APPLICABLE')],
  ];
  return [`Your rules on this piece (${own.length}):`, ...groups.filter(([, es]) => es.length).map(([what, es]) => `  ${what} (${es.length}): ${es.map(name).join('; ')}`)];
}
/** Each grammar rule's findings left for the person, named one by one (core/observers/grammar.ts): never changed. */
export function grammarLines(report: VerifyReport | null | undefined): string[] {
  return (report?.checked ?? []).filter((c) => c.observer === 'GRAMMAR' && grammarListed(c) && c.result.spans.length)
    .map((c) => `Grammar, listed for you to check and never changed (${c.result.spans.length}): ${toCheckList(c.result.spans, c.result.spans.length)}.`);
}
const LISTED_IDS: ReadonlySet<string> = new Set(['UNSOURCED', CLAIMS_TO_CHECK, INCONCLUSIVE, PUBLIC_FACTS]);

/** The direct run, recorded. Returns the record and the JSON a `--json` run prints. */
export async function runDirect(c: DirectContext) {
  const effort = asEffort(flag('--effort'));
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 3), maxCalls: numericFlag('--max-calls', 6) };
  const voice = store.getVoice(c.L);
  const kept = store.getKept(c.L);
  const catalogue = catalogueOf(builtPieces(voice, store.getExemplar(c.L)), kept.filter((k) => !k.correctionOnly).map((k) => ({ text: k.text, request: k.request })));
  const materialText = c.material.map((m) => m.text).join('\n\n');

  // 1. WHICH PIECES: a reading of the request, grounded; the shared-words floor when no model can read.
  const routeBudget: Budget = { spentUsd: 0, capUsd: 0.1, maxCalls: 1 };
  const decided = await readContext(PIECE_ROUTE, { request: c.asked, material: materialText, pieces: catalogue }, contextReaderClient(), contextReaderModel(), routeBudget, 'other');
  const route: Route = decided.value;
  const shown: Piece[] = withinBudget(catalogue, route.order.length ? route.order : catalogue.map((p) => p.id), numericFlag('--piece-chars', PIECE_BUDGET_CHARS));
  const corrections = correctionsOf(kept, EDITS_SHOWN);
  const stable = piecesBlock(shown);
  // The author's own rules, in their words: what they stated and required (a ban they wrote), never a rule read off their pieces.
  const rules = planFor(c.std).rules.filter((r) => r.stated && r.role !== 'HABIT').map((r) => r.statement);
  // The author's method, whole and in their words, where the skill has one: what they wrote down is theirs, like their pieces.
  const method = store.getMethod(c.L)?.text ?? '';
  // What an editor would ask before the draft: only the person's answers reach the writer.
  const asking = await editorQuestions(c, method, route.kind ?? null);
  // WHAT THE PERSON SAID THE WORK IS, TO THE WRITER (an experiment, off unless ATELIER_CARD_TO_WRITER=1): the kind, the
  // reader and the purpose, only where the person said them (a card that is theirs), never a reading of their pieces.
  // The comparison of pieces written with and without it decides whether it becomes what every run does.
  const theirs = process.env.ATELIER_CARD_TO_WRITER === '1' ? store.getCard(c.L) : null;
  const said = theirs?.by === 'you' ? [theirs.kind ? `What the author says these pieces are: ${theirs.kind}.` : '', theirs.reader ? `Who the author says reads them: ${theirs.reader}.` : '',
    theirs.purpose ? `What the author says a reader should do or know after one: ${theirs.purpose.replace(/\.$/, '')}.` : ''].filter(Boolean).join('\n') : '';
  if (said) c.detail('The writer was told what the person said the work is (ATELIER_CARD_TO_WRITER=1).');
  // THE LENGTH OF THE AUTHOR'S OWN PIECES, SAID AS A GUIDE where the request states none: the task sets the length, and a
  // length read off the pieces is never held or a reason to write again. Without it, pieces came out half as long again
  // as the author's. Two pieces at least: one piece has a length, not a range.
  const lengthSaidIn = decided.by === 'model' && route.length !== undefined ? route.length : c.asked;
  // a length the route reading quoted is a stated length, whether or not a parser can size it
  const lengthStated = decided.by === 'model' && route.length !== undefined ? Boolean(route.length) : statedLength(lengthSaidIn ?? '') !== null;
  const lengths = shown.map((x) => wordsWritten(x.text)).filter((n) => n > 0).sort((a, b) => a - b);
  const lengthGuide = !lengthStated && lengths.length >= 2
    ? `Where neither the task nor anything of the author's above sets a length: the author's pieces shown here run ${lengths[0].toLocaleString('en-US')} to ${lengths[lengths.length - 1].toLocaleString('en-US')} words, and for a piece of their kind that is its natural length. A guide, not a limit.` : '';
  const variable = taskBlock({ material: c.material, task: c.asked, rules, method, settled: [said, asking.note, lengthGuide].filter((x) => x.trim()).join('\n\n') });
  c.detail(`Written from ${shown.length} of ${catalogue.length} piece(s) of the author's${route.kind ? `, as ${route.kind}` : ''} (${decided.by === 'model' ? 'chosen by a reading of the request' : `chosen by shared words: ${decided.why ?? 'no reading'}`}): ${shown.map((p) => titleOf(p.text)).join('; ')}.`);

  // HOW THE AUTHOR WRITES, read on the text after the draft (core/direct/style.ts): the habits the build read from their
  // pieces that they show always or often, and the steps of their method no check reads. Never shown to the writer.
  // With no method of the author's, the steps the build read off their pieces (core/method/infer.ts) are their method.
  const statedRules = planFor(c.std).rules.filter((r) => r.stated);
  const unchecked = statedRules.length ? statedRules.filter((r) => r.check === null && r.role !== 'HABIT').map((r) => r.statement)
    : (store.getInferredMethod(c.L)?.steps ?? []).map((st) => st.text);
  // which habits stand is the build's count over the pieces where it made one (core/compiler/moves.ts): the profile the
  // version's receipt names; with none, the reading's own word for how often
  const movesHash = store.getReceipt(c.L, c.sv.skillVersionHash)?.movesHash;
  const counted = movesHash ? store.getMovesByHash(c.L, movesHash) : null;
  // what the person settled before the draft is read on the piece too, in the same call (core/direct/style.ts)
  const styleOf = [...styleItems(pointsWithRates(voice?.persona?.points ?? [], counted), unchecked),
    ...answerItems(asking.answers, (id) => askOf(id) ?? asking.questions.find((q) => q.id === id)?.about ?? null)];
  const steer = argv.includes('--style-review');
  const styleOn = !argv.includes('--no-style') && styleOf.length > 0;
  // its own call, held inside what is left of the run's cap
  // with --style-review it reads twice: the first draft, to steer the review, then the piece the review returned
  const styleBudget: Budget = { spentUsd: 0, capUsd: Math.max(0, Math.min(0.1, budget.capUsd - budget.spentUsd - routeBudget.spentUsd)), maxCalls: steer ? 2 : 1 };
  if (steer && argv.includes('--no-review')) c.say('(--style-review tells the self-review what the draft misses; with --no-review there is none, so how you write is read on the piece, report only.)');
  let style: DirectRecord['style'] | undefined;
  const readStyle = async (text: string, on: 'draft' | 'piece'): Promise<StyleReading> => {
    const d = await readContext(STYLE_READ, { items: styleOf, piece: text }, contextReaderClient(), contextReaderModel(), styleBudget, 'other');
    style = { by: d.by, reader: d.reader, on, steered: false, ...(d.why ? { why: d.why } : {}),
      found: styleOf.map((i) => { const f = d.value.found.find((x) => x.id === i.id); return { id: i.id, kind: i.kind, text: i.text, held: f?.held ?? null, ...(f?.quote ? { quote: f.quote } : {}) }; }) };
    return d.value;
  };

  // What the delivered text is checked by, set up once: the record's settings are read from it too.
  const checks = checksFor(c.L, { material: [c.asked, materialText].filter(Boolean).join('\n\n'), task: c.asked, context: { request: c.asked, material: c.material.map((m) => ({ name: m.name, text: m.text })), ...(decided.by === 'model' && route.length !== undefined ? { lengthQuote: route.length } : {}) }, guardClaims: !argv.includes('--allow-unsourced'), placeholders: false,
    ...(c.held ? { level: c.held } : {}), claimReads: c.held === 'STRICT' ? 2 : 1 });

  // 2-3. THE DRAFT, THEN ONE SELF-REVIEW. A review that fails costs the review, never the piece: the draft is delivered, said.
  let review: DirectRecord['review'] = { ran: false };
  let draftText = '';
  let repaired: string[] = [];
  let grounded: DirectRecord['grounded'];
  let hashtags: DirectRecord['hashtags'];
  let fixedHere = '';
  // set inside the refine step; a holder, so the type is not narrowed to its first value
  const seen: { report: VerifyReport | null; checks: ReturnType<typeof checksFor> | null } = { report: null, checks: null };
  // what the last check listed, with the words each reader named: the record keeps the sentences, the person reads both
  const listedHere: ToCheck[] = [];
  const refine = async (draft: string): Promise<{ output: string; repair: RepairRecord | null }> => {
    draftText = draft;
    let output = draft;
    if (argv.includes('--no-review')) review = { ran: false, why: 'turned off (--no-review)' };
    else {
      try {
        // with --style-review, what the draft does not hold of how the author writes reaches the review, and only that
        const styleNoteNow = styleOn && steer ? styleNote(styleOf, (await readStyle(draft, 'draft')).found) : '';
        const again = await prose(c.client, budget, stable, variable, reviewAsk(draft, { material: c.material, edits: corrections, rules, method, style: styleNoteNow }), effort, 'emit_review');
        // A REVIEW RETURNS THE PIECE, REVISED. Asked to change only what needs changing, a reply under half the draft's
        // words is no revision of it (a remark about the draft, a fragment): the draft is delivered, and it is said.
        const [was, now] = [wordsWritten(draft), wordsWritten(again.piece)];
        if (now * 2 < was) { review = { ran: false, why: `its reply was not the piece (${now} words against the draft's ${was})` }; c.say(`(the self-review did not return the piece, so the first draft is delivered: ${now} words came back against the draft's ${was})`); }
        else {
          output = again.piece; review = { ran: true };
          if (styleNoteNow && style) style = { ...style, steered: true };
        }
      } catch (e) { review = { ran: false, why: `the review could not run: ${(e as Error).message.split('\n')[0]}` }; c.say(`(the self-review could not run, so the first draft is delivered: ${review.why})`); }
    }
    // 3b. A FACT ONLY AN EXAMPLE'S CASE HELD (core/loop/grounding.ts). The writer is shown the author's pieces whole, so
    // a name or a figure of their case can land in this one as a fact about the person's. Each such sentence is
    // rewritten where it stands to state only what was given, and kept only where it breaks no rule that held before.
    try {
      const examples = shown.map((p) => p.text).join('\n\n');
      if (carriedClaims(output, examples, `${materialText}\n${c.asked}`).length) {
        const before = brokenOf(await checkDraftAsync(c.name, c.std, output, checks));
        const g = await groundCarried(output, { client: c.client, budget, request: c.asked, evidence: materialText, examples,
          breaksNothing: async (next) => brokenOf(await checkDraftAsync(c.name, c.std, next, checks)).every((id) => before.includes(id)) });
        grounded = { found: g.found.length, rewritten: g.found.filter((f) => f.kept).length, sentences: g.found.map((f) => f.sentence.slice(0, 160)) };
        output = g.text;
        if (g.note) c.say(`(${g.note})`);
      }
    } catch (e) { c.say(`(a fact carried from one of your pieces could not be rewritten: ${(e as Error).message.split('\n')[0]}; it is listed)`); }
    // 3c. HASHTAGS THE AUTHOR'S PIECES DO NOT CARRY (core/loop/shape-steer.ts): past the most their pieces carry, removed in
    // code, no model call; a tag inside a sentence keeps its word. A request or material that itself carries a tag (#word)
    // gives them, and nothing is removed. A request that speaks of hashtags, for or against, is not read by code: nothing is
    // removed and the count is said ("No hashtags." once switched the removal off in silence).
    {
      const band = c.std.requirements.find((r) => r.authority !== 'EXPERT_REJECTED' && learnedShape(r) && steeredShape(r.measurement)?.shape === 'hashtags');
      const max = band?.measurement?.params.max;
      const asksTags = /(?:^|\s)#\p{L}/u.test(`${c.asked}\n${materialText}`);
      // the request speaks of hashtags: whether for or against them is not code's to read, so nothing is removed and the
      // ones past the author's own count are said beside the piece
      const spoken = /hashtag/i.test(c.asked);
      const tags = (t: string): number => (t.match(/(?<![\w&])#(?=[\p{N}_]*\p{L})[\p{L}\p{N}_]+/gu) ?? []).length;
      if (typeof max === 'number' && !asksTags && spoken && tags(output) > max) c.say(`Hashtags left in (${tags(output)}): your pieces carry ${max === 0 ? 'none' : `at most ${max}`}, and your request speaks of hashtags, so none was removed. atelier fix "remove the hashtags" takes them out.`);
      else if (typeof max === 'number' && !asksTags && !argv.includes('--no-repair')) {
        const next = removeShapeExtras(output, 'hashtags', max);
        const removed = tags(output) - tags(next);
        if (removed > 0) {
          hashtags = { max, removed }; output = next;
          c.say(`Hashtags removed (${removed}): your pieces carry ${max === 0 ? 'none' : `at most ${max}`}; a tag inside a sentence kept its word.`);
        }
      }
    }
    // 4. THE CHECKS. A rule the owner required that the reviewed piece still breaks has the sentences that break it
    // rewritten, as `atelier verify --repair` does (core/loop/run-repair.ts, `refineToStandard`): only those spans, and
    // never at the cost of another rule. Everything else the checks find (a specific not in what was given, a habit
    // missed) is listed beside the piece and changes nothing. `--no-repair` changes nothing; the piece is still read, so
    // its evaluation rests on the checks, never on nothing.
    let violatedBefore: string[] = []; let violated: string[] = []; let toCheck: ToCheck[] = []; let passes = 0;
    let more: Partial<RepairRecord> = {}; let fixedHow = '';
    {
      try {
        let report = await checkDraftAsync(c.name, c.std, output, checks);
        violatedBefore = brokenOf(report);
        if (violatedBefore.length && !argv.includes('--no-repair')) {
          try {
            const r = await refineToStandard(c.client, budget, c.name, c.std, output, REPAIR_PASSES, checks);
            output = r.output; report = r.report; passes = r.repair?.passes ?? 0;
            if (r.repair) { const { passes: _p, violatedBefore: _b, violatedAfter: _a, originalOutputHash: _h, draft: _d, claimsToCheck: _c, why: w, ...rest } = r.repair; more = rest; fixedHow = w; fixedHere = howHeld(r.repair).split('; ').filter((x) => x.includes(' fixed without a model: ')).join('; '); }
          } catch (e) { c.say(`(the sentences that break ${violatedBefore.join(', ')} could not be rewritten: ${(e as Error).message.split('\n')[0]}; the piece is delivered as reviewed)`); }
        }
        seen.report = report; seen.checks = checks;
        violated = brokenOf(report);
        toCheck = toCheckOf(report, checks.evidence ?? '');
        listedHere.splice(0, listedHere.length, ...toCheck);
      } catch (e) { c.say(`(the checks could not read the piece: ${(e as Error).message.split('\n')[0]}; it is delivered unchecked)`); }
      // the reader of specifics failed mid-run and the pattern check took over: said, since what is listed is then weaker
      if (checks.claimSensor?.degraded) c.say('(the reader that traces each specific to what you gave could not run; a pattern check read the piece instead, so the specifics listed are not the whole list)');
    }
    repaired = violatedBefore.filter((id) => !violated.includes(id));
    // read on the piece as delivered, after the sentences that broke a rule were rewritten, said beside it. With
    // --style-review the first draft was read too: the record keeps both, so what the review fixed is shown.
    if (styleOn && (!style || style.on === 'draft')) {
      const first = style;
      if (first && output === draft) style = { ...first, on: 'piece', draft: first.found.map((f) => ({ id: f.id, held: f.held })) };
      else {
        await readStyle(output, 'piece');
        // the piece read again: kept beside the draft's only where it was read, else the draft's reading stands as it was
        if (first && style?.by === 'model') style = { ...style, steered: first.steered, draft: first.found.map((f) => ({ id: f.id, held: f.held })) };
        else if (first) style = first;
      }
    }
    return { output, repair: { ...more, passes, violatedBefore, violatedAfter: violated, originalOutputHash: sha(draft), draft, claimsToCheck: toCheck.map((t) => t.sentence),
      // what the repair said it did (a rewrite, or a mechanical fix without a model) is kept in its own words
      why: fixedHow ? `written directly from the author's pieces and reviewed once; ${fixedHow}` : passes ? `written directly from the author's pieces and reviewed once; the sentences breaking ${violatedBefore.join(', ')} were rewritten` : 'written directly from the author\'s pieces, reviewed once; the checks are listed beside the piece, nothing was changed by them' } };
  };
  const direct = (): DirectRecord => ({ version: DIRECT_VERSION, asked: c.asked, from: catalogue.length,
    pieces: shown.map((p) => ({ id: p.id, title: titleOf(p.text), kept: p.kept })),
    route: { by: decided.by, reader: decided.reader, kind: route.kind, ...(decided.why ? { why: decided.why } : {}) }, effort, review, corrections: corrections.length,
    ...(method.trim() ? { method: true } : {}), ...(lengthGuide ? { lengthGuide: { from: lengths[0], to: lengths[lengths.length - 1] } } : {}), ...(said ? { cardToWriter: true } : {}), questions: { by: asking.by, asked: asking.questions.map((q) => q.id), answered: asking.answers.map((a) => a.id) },
    ...(style ? { style } : {}), ...(grounded ? { grounded } : {}), ...(hashtags ? { hashtags } : {}) });
  // HOW TYPICAL OF THE AUTHOR THE PIECE IS (core/fidelity): read on the delivered text against the profile the build
  // installed, for the evaluation's panel. Descriptive only: nothing on this path steers by it, so no release is credited.
  const fid = argv.includes('--no-fidelity') ? null : releaseFor(c.L, c.sv, null);
  const fidelityOf = fid ? (output: string): FidelityRecord => {
    const t = fid.typicality ? typicalityOf(output, fid.typicality) : null;
    return { release: null, profileHash: fid.profile.hash, seed: 0, reading: { ...readFidelity(output, fid.profile), ...(t ? { typicality: t } : {}) }, applicability: [] };
  } : null;
  const servedHash = sha(stable);
  const rec = await runOnce(c.L, c.sv, stable, servedHash, { expectedPackageHash: servedHash, servedPackageHash: servedHash, matched: true, servedFiles: ['direct:pieces'] },
    variable, c.client, budget, c.binding, resolveProvenance(flag('--provenance'), process.env), null, flag('--task') ? 'FLAG' : 'POSITIONAL', refine,
    { n: 1, choose: () => ({ index: 0, why: '' }), write: () => prose(c.client, budget, stable, variable, DRAFT_ASK, effort, 'emit_piece') },
    null, c.settings(checks), fidelityOf, () => ({ direct: direct() }));

  // WHAT THE PERSON READS BESIDE THE PIECE: what the checks found, never in it.
  const violated = rec.repair?.violatedAfter ?? [];
  const toCheck = rec.repair?.claimsToCheck ?? [];
  if (repaired.length) c.say(`Your rule${repaired.length === 1 ? '' : 's'} ${repaired.join(', ')}: the sentences that broke ${repaired.length === 1 ? 'it' : 'them'} were rewritten, and nothing else.`);
  if (violated.length) c.say(`Beside the piece: ${violated.length} required rule(s) of the standard still not held: ${violated.join(', ')}. atelier fix "<what was wrong>" changes the sentences you name.`);
  // Each specific the checks left in the piece, listed beside it as every run lists them (core/loop/inferred.ts): what
  // `atelier run` shows, and what --json carries as `inferred`.
  const named = new Map(listedHere.map((t) => [t.sentence, t.specific]));
  const inferred: InferredItem[] = toCheck.filter((t) => rec.output.includes(t.slice(0, 60)))
    .map((t) => { const sp = named.get(t); return { kind: 'specific', what: sp ? `"${sp.slice(0, 100)}", in: ${t.slice(0, 160)}` : t.slice(0, 160), settled: 'left in the piece for you to check', add: 'your source for it, as material (--with)' }; });
  // THE LENGTH THE REQUEST STATES, AGAINST WHAT WAS WRITTEN: listed beside the piece, never a redraft. Where the route
  // reading quoted the words that state it, only those are parsed; the pattern over the request is the floor.
  const lengthFrom = decided.by === 'model' && route.length !== undefined ? route.length : c.asked;
  const lengthAsked = lengthFrom ? statedLength(lengthFrom) : null;
  if (lengthAsked && notHeldBecause(c.asked, lengthAsked) === null) {
    const written = wordsWritten(rec.output); const how = againstStated(written, lengthAsked);
    if (how !== 'met') inferred.push({ kind: 'length', what: `the request asks for ${lengthAsked.raw}`, settled: `${written.toLocaleString('en-US')} words written, too ${how}`, add: `atelier fix "make it ${lengthAsked.raw}"` });
  }
  for (const l of inferredLines(inferred)) c.say(l);
  if (!review.ran && review.why) c.detail(`Self-review: not run (${review.why}).`);
  if (draftText && draftText !== rec.output) c.detail('The self-review revised the first draft; the first draft is kept on the record.');
  const spent = Math.max(budget.spentUsd + routeBudget.spentUsd + styleBudget.spentUsd, processSpentUsd() - c.spentBefore);
  // THE EVALUATION OF THIS RUN, as every run has one (cli/eval-run.ts): stored beside the record, carried by --json, read
  // by report, rate, eval and reproduce. Fault-isolated: it never costs the person the piece.
  let evaluation: EvalSummary | null = null;
  try {
    const ch = seen.checks;
    evaluation = buildRunEval({ L: c.L, rec, std: c.std, sensor: ch?.claimSensor, claimsOff: argv.includes('--allow-unsourced'), answers: false, unmeasured: ch?.listsBecause ?? null,
      ...(ch?.claimAct ? { claimAct: ch.claimAct } : {}), material: ch?.evidence ?? materialText, profile: fid?.profile ?? null, format: { words: null, shape: null, withheld: 0 }, taste: null, costUsd: spent,
      durationMs: Date.now() - c.started, drafts: 1, applicability: [], report: seen.report, contract: false });
    putEval(c.L, evaluation);
  } catch (e) { c.say(`(the evaluation of this run could not be built: ${(e as Error).message.split('\n')[0]})`); }
  for (const l of evaluation?.record ? rulesLines(evaluation.record.entries, style?.by === 'model') : []) c.say(l);
  // WHAT THE GRAMMAR CHECKER WAS UNSURE OF, item by item, as the compiled path says it: listed, never changed.
  for (const l of grammarLines(seen.report)) c.say(l);
  // A TOTAL THE TABLE'S OWN ROWS DO NOT ADD UP TO (core/observers/totals.ts): arithmetic, listed, never changed
  const totals = totalsOff(rec.output);
  if (totals.length) c.say(totalsLine(totals));
  // what was corrected without a model (--fix-grammar, a qualified check's own correction), each change named
  if (fixedHere) c.say(`Repaired: ${fixedHere}.`);
  // HOW MUCH OF THE METHOD THE PIECE CARRIES OUT (core/eval/obligations.ts), the same line the compiled path says
  const mr = seen.report ? methodReading(c.std.requirements, seen.report) : null;
  if (mr) c.say(methodLine(mr));
  // A RULE NO COUNT CHECKS IS NOT READ HERE: the judgement reader runs only on the compiled path (--taste), so say so
  if (evaluation?.record?.entries.some((e) => e.dimension === 'STANDARD' && e.reason === 'NOT_MACHINE_CHECKABLE'))
    c.detail(`Judgement reader: not run (reporting only until your labels qualify it; --taste reads this run and records readings to label: atelier taste --skill ${c.name} --calibrate).`);
  if (style) { const st = style; for (const l of styleLines(styleOf, st.found, st.on, st.draft)) c.say(l); if (st.by !== 'model') c.detail(`(how you write was not read: ${st.why ?? 'no model'})`); }
  const json = {
    ...recordHead({ state: evaluation?.record?.state ?? null, standardVersionHash: c.sv.standardVersionHash, skillVersion: c.sv.skillVersionHash, certificate: rec.settings?.certificate ?? null, record: evaluation?.record ?? null }),
    eval: evaluation,
    // the questions were asked before the piece was written, and are listed before it
    // only the ones still open: an answered question listed here was asked of the person again by a host
    questions: questionsJson(asking.questions.filter((q) => !asking.answers.some((a) => a.id === q.id))), answers: asking.answers,
    output: rec.output, answer: rec.output, invocationId: rec.invocationId, skillVersion: c.sv.skillVersionHash, costUsd: Number(spent.toFixed(4)),
    rulesBroken: violated, cut: rec.repair?.storiesCut ?? [], toCheck, totals, plan: null, inferred, work: rec.work ?? null,
    direct: rec.direct ?? null, model: rec.observedRuntime?.resolvedModel ?? c.binding.requestedModel, maxTokens: directMaxTokens(),
  };
  return { rec, json, spent, budget, evaluation, claimAct: checks.claimAct };
}
