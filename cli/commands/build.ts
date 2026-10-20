// cli/commands/build.ts — Compiling a ratified standard into a package and installing it for a host.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import type { StoredSignal } from '../../core/observers/selection.js';
import { compositeVoiceOf, pieceLengthOpen, type CompositeRecord } from '../../core/composite/selection.js';
import { withoutFrontMatter } from '../../core/composite/authors.js';
import { selectCompositePieces, selectVoicePieces, selectWithinBudget, isExcerpt, usualLength, lengthSpan, compositeLength, PIECE_BUDGET_WORDS, COMPACT_PIECE_BUDGET_WORDS, COMPACT_PIECE_FORM, WRITING_PIECE_BUDGET_WORDS, type PieceForm, type Voice } from '../../core/compiler/voice.js';
import { derivePersona, reconcilePersona, standardForbids, describeCounts } from '../../core/compiler/persona.js';
import type { Budget } from '../../core/inference/client.js';
import { sessionCorpus, sessionPairs, unsplitPairs } from '../corpus.js';
import { splitRequest } from '../../core/intake/extract.js';
import { standardWordingOf, sharedAmong } from '../../core/observers/overlap.js';
import { targetOf } from '../../core/observers/obligations.js';

/** Set by a command that builds from what the owner wrote and promised no model call (cli/commands/method.ts). */
const NO_MODEL = (): boolean => process.env.ATELIER_BUILD_NO_MODEL === '1';
/** A build whose pieces are served whole, every one (`atelier method`, cli/commands/method.ts): the model reads them, it never chooses which are shown. */
const WHOLE_PIECES = (): boolean => process.env.ATELIER_BUILD_WHOLE_PIECES === '1';
const QUIET = 'no model was asked';
import { deriveScope, groundScope, spreadByKind, type ScopeProfile } from '../../core/compiler/scope.js';

/** The words of example answers a skill that answers shows by default: enough for one of each kind of request and a few more. */
const ANSWER_EXAMPLE_WORDS = 1200;
import { WORK_FORM, type WorkForm } from '../../core/observers/work-form.js';
import { readContext } from '../../core/inference/reading.js';
import { METHOD_INFER, noteOf, type InferredMethod } from '../../core/method/infer.js';
import { METHOD_UNITS } from '../../core/method/decision-units.js';
import { PERSONA_MOVES, PERSONA_TABLE, cellsToAsk, habitsPerCall, inferMoves, profileOf, currentReading, personaHashOf, describeMoves, describeMove, pointsWithRates, type MoveProfile, type TableCell } from '../../core/compiler/moves.js';
import { isGeneralScope } from '../../core/state/canonical-state.js';
import { moveEvidence, readHoldsBack, ownerWrote, HOLDS_BACK } from '../../core/compiler/applicability.js';
import { normalizeClass } from '../../core/observers/doc-class.js';
import { selectContrastPairs, contrastFor } from '../../core/compiler/contrast-examples.js';
import { verifyText } from '../../core/observers/verify.js';
import { ensureGrammar } from '../../core/observers/grammar.js';
import { piecesBreaking, fitToCorpus } from '../../core/observers/derive.js';
import { allowed, fewestToMove, CORPUS_SET_SHARE, CORPUS_RULE_SHARE } from '../../core/ratification/suggest.js';
import { amendToFit } from './amend.js';
import { measurementId } from '../../core/state/rule-key.js';
import { describeBackup } from '../../adapters/install-tree.js';
import { onCorpusReader } from './discover.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { join } from 'node:path';
import { readJson } from '../../core/state/read-json.js';
import type { Requirement, StandardVersion } from '../../core/state/canonical-state.js';
import { compileArchitecture, observedBoundaries, type SkillArchitecture } from '../../core/architecture/compile.js';
import type { HostAdapter } from '../../adapters/host-adapter.js';
import { renderAgentSkill, assertPortable, skillNameFrom, defaultDescription } from '../../renderers/agent-skill/render.js';
import { buildProposal, renderProposal, unconfirmedIn } from '../../core/compiler/proposal.js';
import { defaultPlan, maintenanceMap, describeMaintenance } from '../../core/coverage/observation.js';
import { planImprovement, describeImprovement, type UndoRecord } from '../../core/compiler/apply.js';
import type { AdaptedComponent } from '../../core/intake/package.js';
import { installFidelity, lastSetAside } from '../fidelity.js';
import * as fstore from '../../core/state/fidelity-store.js';
import { recordStage, stagesSoFar, resetStages } from '../stages.js';
import { createHash } from 'node:crypto';
import { receiptOf, describeStages } from '../../core/state/receipt.js';
import { stepsOf } from '../../core/method/standard.js';
import { skillCardFor } from '../skill-card.js';
import { renderSkillCard } from '../../core/eval/skill-card.js';
import * as store from '../../core/state/store.js';
import { extract } from '../../core/intake/extract.js';

import { describeMatrix, type Carrier } from '../../core/delivery/carrier-delivery.js';
import { sha, DATA, die, argv, flag, projectDir, pickHost,
  loadSession, saveSession, step, runFile, numericFlag, orchestrated, proposerModel, adoptMovedRun, contextReaderModel, contextReaderClient, evidenceReaderModel, evidenceReaderClient } from '../runtime.js';

// ── build ────────────────────────────────────────────────────────────────────────────────────
/** Host is detected or forced. Atelier runs the same either way; only install location differs. */

/**
 * Put a foreign package back exactly as it was.
 *
 * Separate from `rollback`, deliberately. Rollback moves the active pointer between SkillVersions
 * Atelier minted and is a statement about Atelier's own state. This restores bytes in a directory
 * that belongs to the user, which is a different act with different stakes — conflating them would
 * let one command mean "change which version is live" in one context and "overwrite the files you
 * wrote yourself" in another.
 */
export function revert(): void {
  const f = runFile('undo.json');
  if (!existsSync(f)) die('nothing to revert — no build has written into a skill of yours.');
  const undo = readJson<UndoRecord>(f, { what: 'an undo record' });
  const paths = Object.keys(undo.before);
  if (!paths.length) die('the last build wrote nothing, so there is nothing to put back.');

  for (const rel of paths) writeAtomic(join(undo.packageRoot, rel), undo.before[rel]);
  rmSync(f, { force: true });
  console.log(`Put ${paths.length} file(s) back as they were, in ${undo.packageRoot}:`);
  for (const rel of paths) console.log(`  ${rel}`);
  console.log(`\nYour standard is untouched — this reverted the SKILL, not what you decided good means.`);
}

/**
 * HOW THE AUTHOR SOUNDS (core/compiler/voice.ts, persona.ts): whole pieces of the author's, chosen to
 * span how they write, their usual length, and a persona brief (how they sound, with how often, each
 * point proven by a quote from their pieces, none describing a move the standard rules out). From the
 * pieces this run read (never a reserved one), kept through every rebuild. `--voice none` serves none of
 * it; `--persona none` keeps the pieces and drops the description; `auto` chooses again.
 *
 * HOW MUCH OF THE AUTHOR'S WRITING IS SERVED IS THE OWNER'S TO SET. `--piece-budget <words>` chooses the pieces
 * again within that many words (0 serves none and keeps the persona and the length), and `--pieces excerpts` shows
 * each chosen piece by its opening and a passage from its middle, so the same words reach more pieces. Both are
 * kept through later rebuilds, like the rest of the voice; neither changes a rule.
 *
 * THE COMPACT DEFAULT (core/compiler/voice.ts, `COMPACT_PIECE_BUDGET_WORDS`). A skill that writes, built from the
 * author's pieces for the first time and told nothing about them, serves passages within 3,000 words, and that
 * choice is stored as an explicit one is: a later rebuild chooses the same whatever the default becomes. A skill
 * that already holds a voice keeps what it holds, so a rebuild of a skill built before is the same bytes. A skill
 * that answers, one built from a method (`atelier method`, every piece whole), and `--voice none` are as they were:
 * `--pieces whole --piece-budget default` is the whole serving, for a first build too.
 */
/**
 * `--piece-budget` and `--pieces`, read and checked in one place, before anything is written. `atelier new` calls it
 * on its first screen too, so a mistyped value is refused then and not after the rules have been approved.
 * A budget is a whole number of words, or `default` to go back to the default choice. `budget` is undefined when
 * none was given, null for `default`.
 */
export function pieceFlags(): { readonly budget: number | null | undefined; readonly form: PieceForm | undefined } {
  const given = (name: string): string | undefined => {
    const x = flag(name)?.trim().toLowerCase();
    // Declared as taking a value: given last on the line with none, it would parse as absent and be ignored.
    if (x === undefined && argv.includes(name)) die(`${name} needs a value.`);
    return x;
  };
  const b = given('--piece-budget');
  if (b !== undefined && b !== 'default' && !/^\d{1,9}$/.test(b)) die(`--piece-budget takes a whole number of words (0 serves none of your pieces), or default; got "${b}".`);
  const f = given('--pieces');
  if (f !== undefined && f !== 'whole' && f !== 'excerpts') die(`--pieces takes whole or excerpts, got "${f}".`);
  return { budget: b === undefined ? undefined : b === 'default' ? null : Number(b), form: f as PieceForm | undefined };
}

async function chooseVoice(L: store.StoreLayout, v: StandardVersion, workForm: WorkForm): Promise<Voice | null> {
  const choice = (name: string): 'none' | 'auto' | undefined => {
    const x = flag(name)?.trim().toLowerCase();
    if (x !== undefined && x !== 'none' && x !== 'auto') die(`${name} takes none or auto`);
    return x as 'none' | 'auto' | undefined;
  };
  const voiceFlag = choice('--voice'); const personaFlag = choice('--persona');
  const asked = pieceFlags();
  const reselect = asked.budget !== undefined || asked.form !== undefined;
  const answers = workForm === 'REPLY';
  // Answers are short and are shown whole: an opening and a middle passage of a forty-word answer is the answer.
  if (answers && asked.form === 'excerpts') die('--pieces excerpts applies to a skill that writes: the answers this skill shows are short, and are shown whole. Use --piece-budget to show fewer of them.');
  if (voiceFlag === 'none') {
    if (reselect) die('--voice none serves none of your pieces, so --piece-budget and --pieces have nothing to choose from: drop one of them.');
    recordStage('persona', { ran: false, why: 'no pieces served (--voice none, or one example alone)' });
    recordStage('scope', { ran: false, why: 'no pieces served' });
    return null;
  }
  const stored = store.getVoice(L);
  let voice: Voice | null = voiceFlag === undefined ? stored : null;
  // THE OWNER'S BUDGET AND FORM ARE KEPT UNTIL THE OWNER GIVES OTHERS: what was asked now, or what the skill holds,
  // `--voice auto` included (it chooses the pieces again, it does not forget what it was told about them).
  // `--piece-budget default` is how the budget is given up.
  // The compact default applies to a first build alone, of a skill that writes, with no flag given about the pieces
  // (a build from a method keeps the whole serving, `WHOLE_PIECES`); what it chooses is stored as a flag would be.
  const compact = !stored && !answers && !reselect && !NO_MODEL() && !WHOLE_PIECES();
  const wordBudget = asked.budget === undefined ? (compact ? WRITING_PIECE_BUDGET_WORDS : stored?.pieceBudget) : asked.budget ?? undefined;
  const form: PieceForm = asked.form ?? (compact ? 'whole' : stored?.pieceForm ?? 'whole');
  // A persona is derived (one model call) only for a voice chosen in this run, or when asked for: choosing the
  // pieces again must never spend, nor bring back a persona the owner turned off.
  const derivesPersona = !voice || personaFlag === 'auto';
  // This run's pieces: the run being built is this skill's, whatever name it is built under.
  const readable = derivesPersona || reselect ? sessionCorpus().map(withoutFrontMatter) : [];
  // A budget or a form with no pieces to apply it to is refused, with or without a stored voice: never ignored.
  if (reselect && readable.length < 2) {
    die(loadSession().source
      ? '--piece-budget and --pieces choose from the pieces this skill was built from, and fewer than two can be read here. Run it from the project the skill was built in, with its folder of pieces in place.'
      : '--piece-budget and --pieces choose among your own pieces, and this skill was built from rules you stated, with no pieces to choose from.');
  }
  // A skill that answers shows examples spread over the kinds of request (`spreadExamples`), so no whole pieces are
  // chosen for it here when that spread will replace them.
  const spreads = (x: Voice | null): boolean => answers && Boolean(x?.scope?.kinds) && voiceFlag === undefined && !argv.includes('--full') && !WHOLE_PIECES() && !x?.servedWhole;
  // The default choice when no budget is set (as it has always been made); a budget the owner set is a ceiling.
  const choose = (): string[] => (wordBudget === undefined && form === 'whole' ? selectVoicePieces(readable) : selectWithinBudget(readable, wordBudget ?? PIECE_BUDGET_WORDS, form));
  const said = (pieces: readonly string[]): string => {
    const cut = form === 'excerpts' ? pieces.filter(isExcerpt).length : 0;
    const what = cut === 0 ? `${pieces.length} whole piece(s)` : cut === pieces.length ? `passages from ${pieces.length} piece(s)` : `passages from ${cut} piece(s) and ${pieces.length - cut} short one(s) whole`;
    return `${what} of the author's own served with the skill${wordBudget === undefined ? '' : `, within ${wordBudget} words`}, chosen to span how they write`;
  };
  const none = (): string => `none of the author's pieces is served${wordBudget === undefined ? '' : `: none fits within ${wordBudget} words`}; how they sound and how long they write are kept`;
  const prefs = { pieceForm: form === 'excerpts' ? form : undefined, pieceBudget: wordBudget };
  // A COMPOSITE (core/composite): pieces by several authors, and the owner's choice from each. Its voice is one piece
  // from every author something was taken from, within the budget, said as whose it is; no persona is derived, since
  // one read over every author's pieces would describe their average, which nobody chose.
  // This run's choice, or, rebuilt where the run is not at hand, the one kept with the skill.
  const comp = loadSession().composite ?? store.getComposite(L);
  if (comp && (!voice || (reselect && voice.composite))) {
    // `--piece-budget default` gives the budget up: one whole piece from each writer, as for a single author.
    const whole = asked.budget === null;
    // A composite keeps its own serving (one piece from each writer, compact): the larger default is for one author's writing.
    const made = compositeVoice(comp, v, whole ? null : asked.budget ?? stored?.pieceBudget ?? COMPACT_PIECE_BUDGET_WORDS, asked.form ?? (whole ? 'whole' : stored?.pieceForm ?? COMPACT_PIECE_FORM));
    if (made) {
      const by = made.composite?.pieceAuthors ?? [];
      console.log(`Voice: a composite of ${made.composite?.authors.length ?? 0} writer(s); ${by.length ? `one piece each from ${by.join(', ')}` : 'none of their pieces fits the budget'}, served as theirs. Turn off with --voice none.`);
      return made;
    }
  }
  if (!voice && readable.length >= 2) {
    const pieces = choose();
    // A method build's whole serving is kept with the voice: a later `atelier build --persona auto` must not spread it.
    voice = { passages: [], lengthWords: usualLength(readable), pieces, ...(prefs.pieceForm ? { pieceForm: prefs.pieceForm } : {}), ...(wordBudget === undefined ? {} : { pieceBudget: wordBudget }), ...(WHOLE_PIECES() ? { servedWhole: true as const } : {}) };
    if (pieces.length) console.log(`Voice: ${said(pieces)}. Turn off with --voice none.`);
    else if (wordBudget !== undefined && !answers) console.log(`Voice: ${none()}.`);
    if (!voice.lengthWords && !answers) console.log('Length: your pieces vary too much in length to hold one, so none is set; a request that names one sets it.');
    if (compact) console.log(`(whole pieces served by default, within ${WRITING_PIECE_BUDGET_WORDS.toLocaleString('en-US')} words, kept by later builds; --pieces excerpts --piece-budget ${COMPACT_PIECE_BUDGET_WORDS} serves passages from more of them in less.)`);
  } else if (voice && reselect) {
    // A skill built before keeps its pieces until the owner asks for others, and then they are chosen again from
    // the pieces it was built from: a budget cannot be met by cutting the ones already stored.
    if (spreads(voice)) voice = { ...voice, ...prefs };
    else {
      // A skill of the first design serves short passages inline, which no budget of pieces reaches: saying "none of
      // your pieces" over them would be false, and removing them could not be undone by `--piece-budget default`.
      if (wordBudget === 0 && voice.passages.length) die('this skill was built by an early version and serves passages of yours inline, which --piece-budget does not reach. Choose its voice again first: atelier build --name <name> --voice auto, then set the budget.');
      const pieces = choose();
      // Chosen again: the requests of the pieces before are not these pieces' (read again below).
      const { pieceRequests: _stale, ...kept } = voice; void _stale;
      voice = { ...kept, pieces, ...prefs };
      console.log(`Voice: ${pieces.length ? said(pieces) : none()}.`);
    }
  }
  if (!voice) return null;
  // EACH PIECE WITH THE REQUEST IT ANSWERED, where its file carried one: matched by text, so a piece shown as passages
  // (an excerpt) carries none. Read again on every build from the pieces at hand; kept from the stored voice otherwise.
  if (voice.pieces?.length) {
    const flatText = (t: string): string => withoutFrontMatter(t).replace(/\s+/g, ' ').trim();
    const asked = new Map(sessionPairs().filter((p) => p.request).map((p) => [flatText(p.text), p.request ?? ""]));
    // Kept from before only while it still lines up with the pieces (one entry each); read again where the pieces are at hand.
    const pieceRequests = asked.size ? voice.pieces.map((t) => asked.get(flatText(t)) ?? null)
      : voice.pieceRequests?.length === voice.pieces.length ? voice.pieceRequests : undefined;
    const { pieceRequests: _was, ...rest } = voice; void _was;
    voice = { ...rest, ...(pieceRequests?.some(Boolean) ? { pieceRequests } : {}) };
  }
  // HOW MUCH THE AUTHOR WRITES FOR WHAT WAS ASKED (core/compiler/scope.ts), for a skill that answers requests: read
  // once from the examples, with the request each one answers when its file carries it. A failure costs the reading,
  // never the build: the profile is then counts alone, and states no habit nobody read.
  recordStage('scope', answers ? (voice.scope ? { ran: true, detail: `${voice.scope.examples} example(s), kept` } : { ran: false, why: 'fewer than 3 request-and-answer pairs' }) : { ran: false, why: 'the work does not answer requests' });
  if (answers && (!voice.scope || personaFlag === 'auto')) {
    const pairs = sessionPairs();
    // Said once, by name: such a file's request was learned as the author's writing by every reading before this one.
    const whole = unsplitPairs(loadSession().source ?? '');
    if (whole.length) console.log(`(${whole.length} file(s) look like a request and an answer, but were read whole: ${whole.slice(0, 5).join(', ')}${whole.length > 5 ? ', …' : ''}. Start the file with front matter \`request:\`, or \`## Request\` then \`## Answer\`, and build again.)`);
    if (pairs.length >= 3) {
      const scopeBudget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1.5), maxCalls: 1 };
      let scope: ScopeProfile;
      try {
        // A build that promised to call no model (`atelier method`) states the counts alone, and says nothing.
        if (NO_MODEL()) throw new Error(QUIET);
        scope = await onCorpusReader((c) => deriveScope(c, scopeBudget, pairs, proposerModel()));
        recordStage('scope', { ran: true, detail: `${scope.examples} example(s)` });
        console.log(`Scope: what ${scope.examples} example(s) add beyond what was asked, ${scope.paired} of them read with the request they answer`
          + (scope.dropped ? ` (${scope.dropped} finding(s) dropped: not quoted from the answer)` : '')
          + `${scope.unread ? ` (${scope.unread} example(s) not read${scope.beyond.length ? '' : ': too many to state a habit from the rest'})` : ''}; $${scopeBudget.spentUsd.toFixed(3)}. No usual length is stated: the request sets it.`);
      } catch (e) {
        scope = groundScope(pairs, null, null);
        if ((e as Error).message === QUIET) recordStage('scope', { ran: false, why: 'no model read the examples' }); else { recordStage('scope', { ran: false, why: `the call failed: ${(e as Error).message.split('\n')[0]}`, degraded: true }); console.log(`(the examples could not be read for scope: ${(e as Error).message.split('\n')[0]}; the skill states that the request sets the length, and no habit.)`); }
      }
      voice = { ...voice, scope };
      if (voiceFlag === undefined && !WHOLE_PIECES() && !voice.servedWhole) voice = spreadExamples(voice, pairs);
    }
  }
  // A skill that answers, built before, asked for another budget: its examples are spread again over the kinds its
  // scope already holds. Nothing is read again, so nothing is spent.
  else if (reselect && spreads(voice)) voice = spreadExamples(voice, sessionPairs(), true);
  // HOW EACH MOVE IS CARRIED (core/compiler/applicability.ts). The moves the standard holds and does not require are
  // counted against the pieces they were checked on; the ones that hold back what was asked are read by the corpus
  // reader (the word pattern is its floor) and stay examples until the owner rules on them. Said at build, move by
  // move, so the owner sees what was stated, what was shown, and the one question that is theirs.
  const moves = v.requirements.filter((r) => !r.measurement && !r.realizes && r.materiality !== 'REQUIRED' && r.kind === 'GENERATIVE' && r.authority !== 'EXPERT_REJECTED');
  if (moves.length && answers) {
    const pieces = loadSession().run?.heldOutPieces ?? voice.corpusPieces ?? null;
    const moveBudget: Budget = { spentUsd: 0, capUsd: 0.2, maxCalls: 1 };
    // READ ONCE, THEN KEPT. Which moves hold back what was asked used to be read by a model on every build, so a
    // rebuild that asked for nothing spent a call and could change the skill with whether a model was reachable. The
    // reading is kept with the skill's voice and read again only when a move has appeared that it never covered, or
    // when `--persona auto` asks for the readings to be made again. A skill built before the moves read were recorded
    // is taken to have had all of its moves read.
    const covered = new Set(voice.holdsBackOf ?? (voice.holdsBack ? moves.map((r) => r.requirementId) : []));
    const reuse = voice.holdsBack !== undefined && personaFlag !== 'auto' && moves.every((r) => covered.has(r.requirementId));
    const read = reuse ? voice.holdsBack ?? [] : NO_MODEL() ? null : await onCorpusReader((c) => readHoldsBack(c, moveBudget, moves.map((r) => ({ id: r.requirementId, statement: r.statement })))).catch(() => null);
    if (!reuse && read === null && !NO_MODEL()) console.log('(which moves hold back what was asked could not be read by a model: the word pattern decided, and the next build will read again.)');
    // THE READING DECIDES WHERE IT READ. This was `read || pattern`: a move the model had read as giving what was asked
    // was still marked as holding back because a word in it matched. The pattern decides only when nothing read it.
    const holdsBack = moves.filter((r) => (read ? read.includes(r.requirementId) : HOLDS_BACK.test(r.statement))).map((r) => r.requirementId);
    // A reading that could not be made is not recorded as one: the pattern's answer is used for this build only.
    voice = { ...voice, ...(pieces ? { corpusPieces: pieces } : {}), holdsBack, holdsBackOf: reuse || read !== null ? moves.map((r) => r.requirementId) : [] };
    const carried = moves.map((r) => ({ r, e: moveEvidence(r.observedRate, pieces, { answers, general: isGeneralScope(r.appliesWhen), holdsBack: holdsBack.includes(r.requirementId), ownerRuled: ownerWrote(r) }) }));
    const n = (c: string): number => carried.filter((x) => x.e.carrier === c).length;
    // One line, not one per move: what the owner needs is the count and the question below. `atelier plan` lists every rule.
    console.log(`Moves: ${n('general')} stated as something I do, ${n('conditional')} stated only with their condition, ${n('exemplar')} shown as an example and never stated.`);
    // THE OWNER'S QUESTION. When to refuse, and when to ask before answering, is not read off a few pieces and is
    // not Atelier's to decide: it is asked, with the move in the owner's hands.
    const asks = carried.filter((x) => holdsBack.includes(x.r.requirementId) && !ownerWrote(x.r)).slice(0, 3);
    if (asks.length) {
      console.log(`\nYours to rule on: ${asks.length} move(s) hold back what was asked (a refusal, or a question before any answer). By default the skill gives what was asked first, with the safe path, and shows these as examples only.`);
      for (const x of asks) console.log(`  ${x.r.requirementId}  "${x.r.statement.trim().slice(0, 140)}"\n      To make it a rule, say when it applies in your own words: atelier amend --skill ${skillNameFrom(flag('--name') ?? loadSession().skillName ?? 'name')} --rule ${x.r.requirementId} --applies-when "<the cases where you hold back>" --reason "<why>"`);
    }
  }
  // WHEN THERE IS NO PERSONA, THE BUILD SAYS WHY. Three skills were built with none and nothing in their logs said so;
  // the gap was found by reading their stored voice. Nothing is said for a voice kept from an earlier build (its
  // persona is kept with it) or for a composite (said where the composite is built).
  const kept = voice;
  const noPersona = (why: string): Voice => { console.log(`(no persona: ${why})`); recordStage('persona', { ran: false, why }); return kept; };
  if (personaFlag === 'none') { console.log('(no persona: --persona none.)'); recordStage('persona', { ran: false, why: '--persona none' }); return { ...voice, persona: undefined }; }
  // A composite has no persona: one read over several authors' pieces describes their average (see above).
  // A KEPT PERSONA IS RECONCILED AGAIN. The standard may have changed since it was read (a rule rejected, a boundary
  // added): a point that describes a move the standard now rules out is dropped here, as it would be at derivation,
  // so no rejected behaviour comes back through a persona kept from an earlier build, or through the moves read from it.
  const reconciled = (vc: Voice): Voice => (vc.persona ? { ...vc, persona: reconcilePersona(vc.persona, standardForbids(v)) } : vc);
  const held = (why: string): Voice => { const r = reconciled(voice); recordStage('persona', r.persona ? { ran: true, detail: describeCounts(r.persona) } : { ran: false, why }); return r; };
  if (!derivesPersona || voice.composite || (personaFlag !== 'auto' && voice.persona)) return held(voice.composite ? 'a composite voice has no persona' : 'kept from an earlier build');
  // A persona already held is kept where it cannot be read again (--persona auto from a folder without the pieces, or with no model).
  if (voice.persona && (readable.length < 3 || NO_MODEL())) return held('kept');
  // Three pieces at least: a habit's frequency is read across pieces, and across two there is no "most".
  if (readable.length < 3) return noPersona(`${readable.length} piece(s) can be read here; three or more are needed to say how often a habit holds.`);
  if (NO_MODEL()) return noPersona('no model read the pieces (none is set up, or --no-model); how the author sounds is read by one.');
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1.5), maxCalls: 1 };
  try {
    const persona = reconcilePersona(await onCorpusReader((c) => derivePersona(c, budget, readable)), standardForbids(v));
    // Nothing to say about a persona with no point in it: it adds nothing to the skill.
    recordStage('persona', { ran: true, detail: describeCounts(persona) });
    if (persona.points.length) console.log(`Persona: ${describeCounts(persona)} on how the author sounds, each with how often and a quote from their pieces`
      + (persona.dropped ? ` (${persona.dropped} dropped: their quote was not in the pieces)` : '')
      + `${persona.conflicting ? ` (${persona.conflicting} dropped: they describe a move your standard rules out)` : ''}; $${budget.spentUsd.toFixed(3)}. Turn off with --persona none.`);
    return { ...voice, persona };
  } catch (e) {
    // SAID WITH THE WAY BACK, AND RECORDED: a skill built without its persona on a failed call is a degraded build, not
    // a build without a persona; the receipt says so and `status` shows it until a later build reads it.
    const why = (e as Error).message.split('\n')[0];
    console.log(`(the persona could not be derived: ${why}; the skill is built without it. Read it later: atelier build --name ${L.skillName} --persona auto.)`);
    recordStage('persona', { ran: false, why: `the call failed: ${why}`, degraded: true });
    return voice;
  }
}

/**
 * THE VOICE OF A COMPOSITE: excerpts from every author the owner took something from, an equal share of the budget
 * each, labelled with whose they are; the traits taken from each, for "how I sound"; and every piece of every author
 * in the folder for the copying check alone (never served). Null when no author's pieces can be read here.
 */
/**
 * THE AUTHOR'S MOVES (core/compiler/moves.ts): each persona point compiled for execution, with its trigger grounded in a
 * situation quote from the same piece, its scope and its candidate step; then every habit tabled against every piece
 * the first reading left, in calls sized by the token budget; then its rate and its situation's effect inferred from
 * the counts (core/stats/habit.ts), and its kind decided from them. Read once per persona and kept by the persona's
 * hash, so a rebuild with the same persona spends nothing; a floor profile (no model) is read again when a model is
 * there. Nothing here is a requirement; an occasional habit is served to no run as a placement.
 */
async function movesFor(L: store.StoreLayout, voice: Voice | null, methodText: { text: string } | null): Promise<MoveProfile | null> {
  const points = voice?.persona?.points ?? [];
  if (!points.length) { recordStage('moves', { ran: false, why: voice?.persona ? 'the persona has no point' : 'no persona' }); return null; }
  const personaHash = personaHashOf(points);
  const kept = store.getMoves(L, personaHash);
  const pieces = sessionCorpus().map(withoutFrontMatter).map((text, i) => ({ name: `piece-${i + 1}`, text }));
  // STALE AGAINST THE PIECES: a profile's evidence names pieces by the hash of their text; when the pieces readable now
  // differ, the profile is read again where a model is there, and kept and said so where none is (never served as if
  // read from these pieces: the receipt names it, and the stage says what changed).
  const pieceHashes = pieces.map((x) => createHash('sha256').update(x.text).digest('hex').slice(0, 16));
  const changed = kept && pieces.length ? kept.pieces.filter((x) => !pieceHashes.includes(x.sha)).length + pieceHashes.filter((h) => !kept.pieces.some((x) => x.sha === h)).length : 0;
  // STALE AGAINST THE READINGS: a profile read by an earlier version of either reading (or of an earlier schema) is read
  // again where a model is there; with none it is kept and said so.
  const stale = kept !== null && (kept.schema !== 2 || kept.reading !== currentReading());
  if (kept && ((kept.reader !== null && !changed && !stale) || NO_MODEL())) {
    if (kept.reader !== null && !changed && !stale) recordStage('moves', { ran: true, detail: `${describeMoves(kept.units)} (kept)` });
    else if (kept.reader !== null && stale) recordStage('moves', { ran: false, why: `kept from an earlier reading (${kept.reading}) and no model to read again: ${describeMoves(kept.units)}` });
    else if (kept.reader !== null) recordStage('moves', { ran: false, why: `kept from pieces that have changed since (${changed} piece(s) differ) and no model to read them again: ${describeMoves(kept.units)}` });
    else recordStage('moves', { ran: false, why: `by the words alone, kept: ${describeMoves(kept.units)}` });
    return kept;
  }
  const steps = methodText ? stepsOf(methodText.text).map((st, i) => ({ n: i + 1, text: st.text })) : [];
  const noModel = NO_MODEL();
  const d = await readContext(PERSONA_MOVES, { points, pieces, steps }, noModel ? null : evidenceReaderClient(), noModel ? null : evidenceReaderModel(), { spentUsd: 0, capUsd: 0.6, maxCalls: 1 });
  // A PROFILE A MODEL READ IS NEVER REPLACED BY A FLOOR: where no model could read again, the kept one stays, and the stage says why.
  if (d.by !== 'model' && kept && kept.reader !== null) {
    recordStage('moves', { ran: false, why: `kept from ${stale ? `an earlier reading (${kept.reading})` : `pieces that have changed since (${changed} piece(s) differ)`} and no model to read again: ${describeMoves(kept.units)}` });
    return kept;
  }
  // THE TABLE (core/compiler/moves.ts): every cell the first reading left (a piece with no quote for the move, or none
  // for its situation) is asked once, in calls that hold as many habits as the answer budget allows for this corpus.
  // Every cell is then a count, and the counts are what the kinds are inferred from.
  const cells: TableCell[] = []; let tabled = false; let calls = 0;
  if (d.by === 'model') {
    const asked = cellsToAsk(d.value, pieces);
    const perCall = habitsPerCall(PERSONA_TABLE.maxTokens, pieces.length);
    const habitNs = [...new Set(asked.map((c) => c.habit))];
    let answered = 0;
    for (let i = 0; i < habitNs.length; i += perCall) {
      const batch = new Set(habitNs.slice(i, i + perCall));
      const habits = d.value.map((u, n) => ({ n: n + 1, aspect: u.aspect, description: u.observed, quote: points[n]?.quote ?? u.evidence[0]?.quote ?? '', situation: u.trigger.text, modality: u.modality })).filter((h) => batch.has(h.n));
      const t = await readContext(PERSONA_TABLE, { habits, pieces, cells: asked.filter((c) => batch.has(c.habit)) }, evidenceReaderClient(), evidenceReaderModel(), { spentUsd: 0, capUsd: 0.6, maxCalls: 1 });
      calls += 1; if (t.by === 'model') { cells.push(...t.value); answered += 1; }
    }
    tabled = habitNs.length === 0 || answered === Math.ceil(habitNs.length / perCall);
  }
  const units = inferMoves(d.value, cells, pieces, tabled);
  const profile = profileOf(units, personaHash, d.by === 'model' ? evidenceReaderModel() : null, pieces);
  store.putMoves(L, personaHash, profile);
  if (d.by === 'model') {
    recordStage('moves', { ran: true, detail: `${describeMoves(profile.units)}${tabled ? '' : ' (not every cell tabled)'}` });
    console.log(`Moves: ${describeMoves(profile.units)}, read from the persona and your pieces${calls ? ` and tabled against every piece in ${calls} call(s)` : ''}${tabled ? '' : ' (not every cell was answered: the counts are the first reading\'s)'}. A standing move holds in most pieces more probably than not; a situational one is explained by the situation it answers; an occasional one is neither, and is placed in no run.`);
  } else recordStage('moves', { ran: false, why: `${d.why ?? 'no model'}: counted by the words alone` });
  if (argv.includes('--report') && profile.units.length) console.log(`What my moves are, and when I make them:\n${profile.units.map((u) => `  - ${describeMove(u)}`).join('\n')}`);
  return profile;
}

/**
 * THE METHOD READ OFF THE PIECES (core/method/infer.ts), when the owner wrote none: the steps in the pieces' order, each
 * shown by a quote, then what each asks the writer to decide (core/method/decision-units.ts), as the owner's steps get.
 * Kept per corpus: read again only when the pieces changed or no model had read them. An owner's note replaces it.
 */
async function inferredMethodFor(L: store.StoreLayout, methodText: { text: string } | null, purpose: string | null): Promise<InferredMethod | null> {
  if (methodText || argv.includes('--no-infer-method')) { store.setInferredMethod(L, null); return null; }
  const pieces = sessionCorpus().map(withoutFrontMatter).map((text, i) => ({ name: `piece-${i + 1}`, text }));
  const kept = store.getInferredMethod(L);
  const corpusHash = sha(pieces.map((p) => p.text).join('\n\x00'));
  if (kept?.reading === `${METHOD_INFER.id}-${METHOD_INFER.version}+${corpusHash}`) return kept;
  if (NO_MODEL() || !pieces.length) return kept;
  const reading = `${METHOD_INFER.id}-${METHOD_INFER.version}+${corpusHash}`;
  const d = await readContext(METHOD_INFER, { purpose, pieces }, contextReaderClient(), contextReaderModel(), { spentUsd: 0, capUsd: 0.2, maxCalls: 1 });
  // READ AND FOUND NONE, OR NOT GROUNDED: remembered as none for this corpus, so a rebuild with the same pieces calls nothing
  // again; a corpus that changes is read afresh. No model reachable at all was handled above, and keeps what there was.
  if (d.by !== 'model' || !d.value.length) {
    const none: InferredMethod = { schema: 1, reader: contextReaderModel() ?? 'model', reading, steps: [], builtAt: new Date().toISOString() };
    store.setInferredMethod(L, none); return none;
  }
  const units = await readContext(METHOD_UNITS, { steps: d.value.map((st, i) => ({ id: String(i + 1), text: st.text, under: null })) }, contextReaderClient(), contextReaderModel(), { spentUsd: 0, capUsd: 0.2, maxCalls: 1 });
  const m: InferredMethod = { schema: 1, reader: contextReaderModel() ?? 'model', reading,
    steps: d.value.map((st, i) => ({ ...st, id: `i${i + 1}`, unit: units.value[String(i + 1)] ?? null })), builtAt: new Date().toISOString() };
  store.setInferredMethod(L, m);
  console.log(`Method, read from your pieces (you wrote none): ${m.steps.length} step(s), followed as your habit on every run and made a rule of nothing; write them yourself with atelier method <file> to make them yours. ${argv.includes('--report') ? `\n${m.steps.map((st) => `  ${st.id.slice(1)}. ${st.text}  (as in "${st.quote.slice(0, 80)}")`).join('\n')}` : ''}`);
  return m;
}

function compositeVoice(c: CompositeRecord, v: StandardVersion, budget: number | null, form: PieceForm): Voice | null {
  const pathsFile = runFile('corpus-paths.json');
  if (!existsSync(pathsFile)) return null;
  const reserved = new Set((loadSession().reservation?.reserved ?? []).map((u) => u.unitId));
  const files = readJson<{ id: string; path: string }[]>(pathsFile, { kind: 'array', what: 'the sealed corpus path list' });
  const textOf = (id: string): string | null => {
    const f = files.find((x) => x.id === id);
    if (!f || reserved.has(id) || !existsSync(f.path)) return null;
    const r = extract(f.path);
    return r.ok ? withoutFrontMatter((r as { text: string }).text) : null;
  };
  const statementOf = (id: string): string => v.requirements.find((r) => r.requirementId === id)?.statement ?? loadSession().proposals.find((p) => p.requirementId === id)?.statement ?? id;
  const ruleOf = (id: string): Requirement | undefined => v.requirements.find((r) => r.requirementId === id) ?? loadSession().proposals.find((p) => p.requirementId === id);
  const chosen = compositeVoiceOf(c, statementOf);
  const textsOf = (name: string): string[] => (c.authors.find((a) => a.name === name)?.pieces ?? []).flatMap((id) => { const t = textOf(id); return t ? [t] : []; });
  const every = c.authors.flatMap((a) => textsOf(a.name));
  if (!every.length) return null;
  const served = selectCompositePieces(chosen.map((a) => ({ author: a.name, pieces: textsOf(a.name) })), budget ?? Number.POSITIVE_INFINITY, form);
  return {
    // The chosen writers' length range, or none when they write pieces of different lengths (`compositeLength`).
    passages: [], lengthWords: compositeLength(chosen.map((a) => textsOf(a.name)), pieceLengthOpen(c, ruleOf)), pieces: served.map((x) => x.text),
    ...(form === 'excerpts' ? { pieceForm: form } : {}), ...(budget === null ? {} : { pieceBudget: budget }),
    composite: { authors: chosen, pieceAuthors: served.map((x) => x.author) },
    guardPieces: every,
  };
}

/**
 * THE EXAMPLES A SKILL THAT ANSWERS SHOWS, spread across the kinds of request the corpus holds, within a word budget,
 * so the model sees how the author delivers as well as how they explain (core/compiler/scope.ts, `spreadByKind`).
 * The budget is the owner's (`--piece-budget`) in place of ANSWER_EXAMPLE_WORDS. One example of each kind is shown
 * whatever the budget, except at 0, which shows none. `--full` shows every example, and a scope that does not hold
 * a kind for each example leaves the pieces as they are; `chooseVoice` checks both before it relies on this.
 */
function spreadExamples(voice: Voice, pairs: readonly { text: string }[], reselect = false): Voice {
  const kinds = voice.scope?.kinds;
  if (argv.includes('--full')) return voice;
  if (kinds?.length !== pairs.length) {
    // The kinds were read for the examples the skill was built from. With another number of examples here they say
    // nothing about which is which, and a budget applied to the old choice would be recorded and not applied.
    if (reselect) die(`--piece-budget chooses among the examples this skill was built from, and there are ${pairs.length} here where ${kinds?.length ?? 0} were read. Read them again first: atelier build --name <name> --persona auto.`);
    return voice;
  }
  if (voice.pieceBudget === 0) {
    console.log(`Examples shown: none of ${pairs.length} (--piece-budget 0). What you add beyond what was asked is still stated.`);
    return { ...voice, pieces: [] };
  }
  const shown = spreadByKind(pairs.map((x) => x.text), kinds, voice.pieceBudget ?? ANSWER_EXAMPLE_WORDS);
  const mix = new Map<string, number>();
  for (const i of shown) mix.set(kinds[i] ?? 'unread', (mix.get(kinds[i] ?? 'unread') ?? 0) + 1);
  console.log(`Examples shown: ${shown.length} of ${pairs.length}, spread over the kinds of request you answer (${[...mix].map(([k, n]) => `${k} ${n}`).join(', ')}). --full shows them all.`);
  return { ...voice, pieces: shown.map((i) => pairs[i].text) };
}

/**
 * A skill's active standard, when it supersedes `closed` through one or more amendments; null otherwise. The chain is
 * read off each standard's own link to the one it superseded. That link is not part of a standard's hash, so two
 * histories that arrive at the same rules share the first one's link, and an amendment that lands on a standard
 * minted earlier is not seen as descending from `closed`: such a rebuild compiles `closed`, as it did before this
 * check existed.
 */
function amendedFrom(L: store.StoreLayout, closed: StandardVersion): StandardVersion | null {
  const active = store.getActive(L);
  const current = active ? store.getSkillVersion(L, active) : null;
  const top = current && current.standardVersionHash !== closed.standardVersionHash ? store.getStandard(L, current.standardVersionHash) : null;
  // Followed back link by link; a chain longer than any history a person makes is not followed for ever.
  for (let at = top, hops = 0; at && hops < 500; at = at.supersedes ? store.getStandard(L, at.supersedes) : null, hops++) {
    if (at.standardVersionHash === closed.standardVersionHash) return top;
  }
  return null;
}

export async function build(nameArg?: string, opts: { closing?: boolean } = {}): Promise<void> {
  let s = loadSession();
  const name = skillNameFrom(nameArg ?? flag('--name') ?? die('--name required'));
  // The stages of this build, for its receipt (core/state/receipt.ts): a command that orchestrates this one has begun
  // recording; a build on its own starts the record here.
  if (!orchestrated()) resetStages();
  // THE FIRST THING A NEW USER HITS IF THEY RUN THIS TOO EARLY, so it says what to do rather than
  // what failed. It used to surface a raw ENOENT with an absolute store path — technically accurate,
  // and useless to someone who has simply not minted a standard yet.
  // A project folder that was moved or renamed has no run under its new path: the run that built this skill is found
  // in the store and taken over, with a line saying so (cli/runtime.ts, `adoptMovedRun`).
  if (!existsSync(runFile('pending-standard.json')) && adoptMovedRun(name)) s = loadSession();
  const pendingPath = runFile('pending-standard.json');
  if (!existsSync(pendingPath)) {
    die('there is no standard to build from yet.\n'
      + '  A skill is compiled from a ratified StandardVersion, and none has been minted here.\n'
      + '  From your own work:   atelier create <path-to-your-work>   then ratify, then ratify-close\n'
      + '  From what you can state:  atelier skill "<the rules, in your words>"');
  }
  const pending = readJson<StandardVersion>(pendingPath, { what: 'the pending standard' });
  // The document class is not part of the package, so changing it on a skill already built needs no
  // rebuild — and a rebuild of a BUILT run is refused by the run's state machine.
  const clsOnly = flag('--class');
  const pieces = pieceFlags();
  if (clsOnly !== undefined && s.run.state === 'BUILT' && (pieces.budget !== undefined || pieces.form !== undefined)) {
    die('--class on a built skill changes its class without rebuilding it, so --piece-budget and --pieces would be ignored. Give them in a build of their own.');
  }
  if (clsOnly !== undefined && s.run.state === 'BUILT') {
    const L0: store.StoreLayout = { root: DATA, skillName: name };
    if (!store.getActive(L0)) die(`no built skill called "${name}".`);
    store.setDocClass(L0, clsOnly.trim().toLowerCase() === 'none' ? null : normalizeClass(clsOnly));
    const now = store.getDocClass(L0);
    console.log(now ? `Document class for ${name}: ${now}. A text declared as another class is refused by verify and invoke.` : `Document class for ${name} cleared.`);
    return;
  }
  // ── THE STANDARD MUST BE THIS RUN'S ──────────────────────────────────────────────────────────
  //
  // The run records the hash it ratified; the file on disk is what will be compiled. Before this
  // check they were assumed to agree, and when two projects shared a store they did not: a build in
  // one project compiled — and stamped as ratified — the standard the other had just closed. The
  // working files are per-project now, and this is the check that makes any future drift refuse.
  if (s.run.standardVersionHash !== pending.standardVersionHash) {
    die(`the pending standard here is ${pending.standardVersionHash}, but this project's run `
      + (s.run.standardVersionHash ? `ratified ${s.run.standardVersionHash}.` : 'has ratified nothing.')
      + '\n  A skill is compiled only from the standard this run closed. Close it again: atelier ratify-close');
  }
  // ── ADVANCE BEFORE WRITING ───────────────────────────────────────────────────────────────────
  //
  // This transition used to be checked LAST: the store was written, the active pointer moved and
  // the skill installed, and then the run refused to advance — so a refused build looked exactly
  // like a successful one on disk and reported failure on the terminal.
  //
  // A BUILT run may be built again: the same ratified standard, compiled into a new implementation (the
  // voice turned on or off, the persona derived again, another skill name). The standard's hash was
  // checked above, so nothing about what "good" means can change here; the new SkillVersion becomes
  // active and the previous one stays in history (`atelier rollback`).
  if (s.run.state !== 'BUILT') s = step(s, 'BUILT');
  // THE HASH IS THE IDENTITY, SO THE FIRST MINT WINS. `mintedAt` sits outside the hash; re-closing
  // identical content in another project would otherwise make the store refuse a body that differs
  // only by timestamp. Same rule as `amend`.
  const L: store.StoreLayout = { root: DATA, skillName: name };
  // A REBUILD NEVER UNDOES AN AMENDMENT. The run holds the standard it closed; `amend`, `confirm` and `add` mint a
  // later one that supersedes it and make it the skill's. Compiling the run's standard again would put the old rules
  // back with nothing said, on the very command an export recommends for a smaller skill. So when the skill's
  // active standard descends from the run's, that one is compiled; a standard that does not descend from it is
  // another ratification under the same name, and is replaced as before.
  const closed = store.getStandard(L, pending.standardVersionHash) ?? pending;
  // The amendments were made to the skill this run built. Built under another name, they are that skill's and are
  // carried too: a second name for the same run is the same owner's standard, not an earlier draft of it.
  const built = s.skillName && s.skillName !== name ? { root: DATA, skillName: s.skillName } : null;
  const v = amendedFrom(L, closed) ?? (built ? amendedFrom(built, closed) : null) ?? closed;
  if (v !== closed) console.log(`Compiling the standard as you amended it (${v.standardVersionHash}), which supersedes the one this run closed (${closed.standardVersionHash}).`);
  // The arrangement is COMPILED, not derived from the requirement list. That is what lets a skill
  // improve while the standard stands still.
  const arch = compileArchitecture(v);
  // WHAT THE SKILL IS FOR IS KEPT THROUGH A REBUILD, like its voice and its class. A rebuild that changed nothing else
  // used to replace the owner's description with the default one, in the line a host decides to load the skill by.
  // Kept only while the skill is still read from the same pieces: a standard from another corpus under an old name
  // does not inherit a sentence written for the first. A second name for the same run takes the first's.
  const before = ((): string | undefined => {
    for (const layout of [L, ...(s.skillName && s.skillName !== name ? [{ root: DATA, skillName: s.skillName }] : [])]) {
      const active = store.getActive(layout); const sv = active ? store.getSkillVersion(layout, active) : null;
      if (sv?.description && store.getStandard(layout, sv.standardVersionHash)?.evidenceId === v.evidenceId) return sv.description;
    }
    return undefined;
  })();
  const desc = flag('--description') ?? before ?? defaultDescription(v.workType);
  // ── THE EXEMPLAR, WHEN THE OWNER NAMES ONE ──────────────────────────────────────────────────
  //
  // Never a reserved piece: that work is held back to test the skill blind, and a skill that ships it
  // has read the answer key.
  // Everything this block decides is held in memory and written only when the build commits, below, so
  // `--review` writes nothing.
  const ex = flag('--exemplar');
  let exemplar = store.getExemplar(L);
  if (ex !== undefined) {
    if (ex.trim().toLowerCase() === 'none') exemplar = null;
    else {
      if (!existsSync(ex)) die(`--exemplar: there is no file at ${ex}.`);
      const { text, request: exRequest } = splitRequest(readFileSync(ex, 'utf8'));
      // Compared as text, not bytes: a copy with a BOM, Windows line ends or other whitespace is the same piece.
      const norm = (t: string): string => t.replace(/^\uFEFF/, '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();
      if (s.reservation?.reserved.some((u) => norm(u.artifact) === norm(text))) {
        die('--exemplar names a piece that was reserved to test the skill blind. Pick one discovery was allowed to read.');
      }
      // The exemplar is what the model imitates, so it should meet the standard it illustrates.
      await ensureGrammar(v);
      const report = verifyText(name, v, text);
      // (Less the rules read against its material, which is not part of the exemplar.)
      const broken = report.checked.filter((c) => c.result.verdict === 'VIOLATED' && targetOf(c.observer ?? '') !== 'BOUND_MATERIAL');
      if (broken.length) {
        console.log(`Note: the exemplar breaks ${broken.map((c) => `${c.requirementId} (${c.result.detail})`).join(', ')}. `
          + 'The model will imitate it as it is.');
      }
      exemplar = { text, ...(exRequest ? { request: exRequest } : {}) };
      console.log('The exemplar is installed with the skill (examples/exemplar.md). If the skill directory is committed, so is the piece.');
    }
  }
  // The kind of document the standard measures; `verify`, `invoke` and the MCP tool refuse a text
  // declared as another kind. `none` clears it.
  const cls = flag('--class');
  const docClass = cls === undefined ? store.getDocClass(L) : cls.trim().toLowerCase() === 'none' ? null : normalizeClass(cls);
  if (cls !== undefined) {
    console.log(docClass ? `Document class: ${docClass}. A text declared as another class is refused by verify and invoke.` : 'Document class cleared.');
  }
  // Write-this-not-that pairs from the loop's own accepted repairs, re-verified against this standard.
  // Chosen here, at build, and kept through every rebuild; `--contrast none` turns them off.
  const contrastFlag = flag('--contrast');
  if (contrastFlag !== undefined && contrastFlag.trim().toLowerCase() !== 'none' && contrastFlag.trim().toLowerCase() !== 'auto') {
    die('--contrast takes none (ship no contrast examples) or auto (choose them again from past repairs)');
  }
  const contrastOff = contrastFlag === undefined ? store.getContrast(L).off : contrastFlag.trim().toLowerCase() === 'none';
  const heldBack = { tasks: (s.reservation?.reserved ?? []).map((u) => u.task), texts: (s.reservation?.reserved ?? []).map((u) => u.artifact) };
  // CHOSEN ONLY WHEN ASKED, AND KEPT. Pairs used to be chosen again on every build from every run in the store, so a
  // rebuild that asked for nothing changed the skill: after a benchmark, a plain rebuild added pairs taken from
  // benchmark answers. Choosing them "while the skill has none" did the same to every store built before runs could
  // be marked as tests. So a build never chooses pairs on its own: `--contrast auto` chooses them, and every later
  // build keeps what was chosen. The pairs of a run made as a test (`invoke --test-run`) are never taken.
  const keptPairs = store.getContrast(L).pairs;
  const rechoose = contrastFlag?.trim().toLowerCase() === 'auto';
  // What is kept is the choice; what ships is the part of it that still teaches this standard. Storing the shipped
  // part would lose, for good, a pair that an amendment set aside and a later one brings back.
  const chosenPairs = contrastOff ? [] : rechoose ? selectContrastPairs(store.listLearningInvocations(L), v, heldBack) : keptPairs;
  const contrast = { off: contrastOff, pairs: contrastOff ? [] : contrastFor(chosenPairs, v) };
  const shipped = contrast.pairs;
  if (shipped.length) console.log(`Contrast examples: ${shipped.length} "write this, not that" pair(s) from past repairs (examples/contrast.md). Turn off with --contrast none.`);
  // THE OWNER'S METHOD, served whole (`--method-text <file>` from `atelier new --method`; kept through every rebuild).
  const mt = flag('--method-text');
  let methodText = store.getMethod(L);
  if (mt !== undefined) {
    if (mt.trim().toLowerCase() === 'none') methodText = null;
    else { if (!existsSync(mt)) die(`--method-text: there is no file at ${mt}.`); methodText = { text: readFileSync(mt, 'utf8') }; }
  }
  // WHAT FORM THE WORK TAKES decides how it is compiled (replies or documents): read from the examples, before the voice
  // is chosen, and carried with it (core/observers/work-form.ts).
  const form = await workFormFor(L, v, methodText, exemplar);
  const voice0 = await chooseVoice(L, v, form);
  const voice = voice0 ? { ...voice0, form } : null;
  // THE AUTHOR'S MOVES, compiled from the persona (core/compiler/moves.ts): a profile beside the voice, never in the
  // package or the standard, read once per persona. A review builds nothing and reads nothing.
  // THE METHOD THE PIECES FOLLOW, when the owner wrote none (core/method/infer.ts): read once per corpus, kept beside the
  // skill for the brief and the moves to use, never a requirement; --no-infer-method leaves it out; a review reads nothing.
  const inferred = argv.includes('--review') ? store.getInferredMethod(L) : await inferredMethodFor(L, methodText, desc);
  const moves = argv.includes('--review') ? null : await movesFor(L, voice, methodText ?? (inferred?.steps.length ? { text: noteOf(inferred.steps) } : null));
  if (!argv.includes('--review')) reportOwnPieces(v, name, s);
  // THE SKILL WORDS EACH POINT BY ITS COUNT: the persona's points carry the rates the profile measured (never the
  // reading's own word for how often) where a profile was read; the voice on disk is unchanged.
  const served = voice?.persona && moves ? { ...voice, persona: { ...voice.persona, points: pointsWithRates(voice.persona.points, moves) } } : voice;
  const pkg0 = renderAgentSkill(v, arch, name, desc, exemplar, shipped, served, methodText);
  const skill = { skillVersionHash: sha(`${arch.architectureHash}|${pkg0.packageHash}`), skillName: name,
    standardVersionHash: v.standardVersionHash, architectureHash: arch.architectureHash, materializedHash: pkg0.packageHash, builtAt: new Date().toISOString(), description: desc };

  // ── THE RECORD OF WHAT THIS BUILD DECIDED ──────────────────────────────────────────────────
  //
  // Written on every build and never gating, because the standard is what the human ratifies and the
  // implementation is what the machine owns. `--review` stops before the write for anyone who wants
  // the gate anyway; that is an option, not the routine path.
  //
  // On CREATE nothing is already handled — there is no installed skill to carry anything — so every
  // rule is a change, and saying so is accurate rather than inflated. On IMPROVE the caller must have
  // decided which rules the existing package already carries; `alreadyHandled` has no default
  // precisely so that decision cannot be made silently here.
  const review = argv.includes('--review');
  const proposal = buildProposal(name, v.standardVersionHash, v.requirements, arch, new Set<string>());
  const proposalText = renderProposal(proposal, { gated: review });
  // Under `atelier new` the rule-by-rule plan is written, not printed: the person has just ruled on
  // every rule, and the plan restates each one. `atelier build` on its own prints it.
  if (orchestrated() && !review) console.log(`What each rule became, and why: ${runFile('proposal.md')}`);
  else console.log(`\n${proposalText}`);
  const guessed = unconfirmedIn(proposal);
  if (guessed.length) {
    console.log(`${guessed.length} of these we inferred and you have not confirmed. \`atelier pending\` lists them.\n`);
  }
  if (review) {
    console.log(`--review: stopping before anything is written. Re-run \`atelier build --name ${name}\` to install.`);
    return;
  }
  writeAtomic(runFile('proposal.md'), proposalText);
  store.initStore(L);
  // Only when there IS a corpus. A directly authored standard has no evidence record, and writing an
  // empty one to satisfy a call would fabricate a file that later reads as a sealed corpus.
  if (s.evidence) store.putEvidence(L, s.evidence);
  // The record of who decided this standard travels with it. Only the ledger stamped with THIS
  // version: a directly authored rule set, or a rebuild of an older standard, has none to carry.
  if (s.ledger?.records.some((r) => r.resultingStandardVersionHash === v.standardVersionHash)) {
    store.putLedger(L, v.standardVersionHash, s.ledger);
  }
  store.putStandard(L, v); store.putSkillVersion(L, skill); store.putArchitecture(L, arch); store.putPackage(L, pkg0);
  // THE AUTHOR'S STANDARD WORDING, read over every piece of theirs that can still be read (those held back
  // included: a clause they use anywhere is theirs). Kept with the stored voice for the copying check and never
  // written into a package. Where the pieces cannot be read, what an earlier build found is kept.
  const everyPiece = sessionCorpus(null, { includeReserved: true });
  const standardWording = everyPiece.length ? standardWordingOf(everyPiece) : voice?.standardWording ?? [];
  // And how long their pieces run, shortest to longest, over the same pieces: what an output is held to when the
  // request names no length (core/intake/length.ts, `ownLengthBand`). Stored the same way.
  const span = everyPiece.length ? lengthSpan(everyPiece) : voice?.lengthSpan ?? null;
  const lengthPieces = everyPiece.length > 0 ? everyPiece.length : voice?.lengthPieces ?? 0;
  // And how much those pieces share with one another: the most a new piece may share with one of them.
  const among = everyPiece.length ? sharedAmong(everyPiece, standardWording) : voice?.sharedAmong ?? null;
  const { standardWording: _was, lengthSpan: _span, lengthPieces: _n, sharedAmong: _among, ...voiceWithout } = voice ?? {}; void _was; void _span; void _n; void _among;
  const storedVoice = voice ? { ...(voiceWithout as typeof voice), ...(standardWording.length ? { standardWording } : {}), ...(span ? { lengthSpan: span, lengthPieces } : {}), ...(among !== null ? { sharedAmong: among } : {}) } : voice;
  // The composite the owner chose (core/composite), kept with the skill as data; null for a skill of one author.
  if (s.evidence) store.setComposite(L, s.composite ?? null);
  store.setExemplar(L, exemplar?.text ?? null, exemplar?.request ?? null); store.setMethod(L, methodText?.text ?? null); store.setVoice(L, storedVoice); store.setDocClass(L, docClass); store.setContrast(L, { off: contrastOff, pairs: chosenPairs });
  // The fidelity profile and the first implementation release (cli/fidelity.ts): what steers drafts toward
  // the author's range, below the standard and never able to move it. Only a profile of this build's sealed corpus:
  // one another build left in the run folder is set aside (`quarantineRunFiles`), and the signals written with it too.
  const expectCorpus = s.evidence?.corpusHash ?? null;
  const hadProfile = existsSync(runFile('fidelity.json')); const hadSignals = existsSync(runFile('signals.json'));
  const release = installFidelity(L, v, skill.skillVersionHash, expectCorpus);
  const aside = lastSetAside();
  if (hadProfile && !release && aside.length) console.log(`(a fidelity profile in this project's run folder is not from these pieces: set aside as fidelity.stale.json, not installed.)`);
  if (release) console.log(`Implementation release ${release.id}: ${release.settings.drafts} drafts, up to ${release.settings.editBudget} structural edit(s)${release.retrievalHash ? `, ${release.settings.retrievalK} of your passages retrieved per request` : ''}.`);
  const installed = release ? fstore.getProfile(L) : null;
  recordStage('profile', installed ? { ran: true, detail: `${installed.bands.filter((b) => b.cls === 'all').length} feature(s) banded` }
    : { ran: false, why: hadProfile ? 'a profile in the run folder was not from these pieces: set aside' : s.evidence ? 'discovery wrote no profile' : 'no sealed corpus was read with a model: no bands' });
  // The author's signals, read off their pieces against the model's drafts at discovery (never a rule): installed with
  // the profile they were written beside, never without it.
  if (release && existsSync(runFile('signals.json'))) store.setSignals(L, readJson<StoredSignal[]>(runFile('signals.json'), { what: 'the discovered signals', kind: 'array' }));
  recordStage('signals', release && hadSignals ? { ran: true, detail: `${store.getSignals(L).length} signal(s)` } : { ran: false, why: hadSignals ? 'set aside with the profile' : installed ? 'fewer than 2 model drafts' : 'no model drafts to compare with' });
  recordStage('contrast', installed?.detector ? { ran: true, detail: `${installed.detector.trainedOn.model} model draft(s)` } : { ran: false, why: s.evidence ? 'no model drafts' : 'no model-read corpus: a method, stated rules, or fewer than four pieces' });
  recordStage('method', methodText ? { ran: true, detail: `${stepsOf(methodText.text).length} step(s) served whole` }
    : inferred?.steps.length ? { ran: true, detail: `${inferred.steps.length} step(s) read from your pieces, not confirmed: the brief follows them as your habit, no rule is made of them` }
    : { ran: false, why: argv.includes('--no-infer-method') ? 'no method note (--no-infer-method)' : NO_MODEL() ? 'no method note, and no model to read one off the pieces' : 'no method note, and the pieces share no method a reading could show' });
  const counted = v.requirements.filter((r) => r.wordedFromCheck && r.authority !== 'EXPERT_REJECTED').length;
  recordStage('counted', counted ? { ran: true, detail: `${counted} rule(s) counted off the pieces` } : { ran: false, why: 'nothing counted off the pieces' });
  // THE RECEIPT, THEN THE SWITCH. Everything the version needs is in place before the active pointer moves to it, so a
  // build that stops part-way leaves the skill that was active, whole.
  const receipt = receiptOf({ skillVersionHash: skill.skillVersionHash, standardVersionHash: v.standardVersionHash, architectureHash: arch.architectureHash, packageHash: pkg0.packageHash,
    corpusHash: expectCorpus, methodHash: methodText ? sha(methodText.text) : null, models: { contextReader: NO_MODEL() ? 'none' : contextReaderModel() ?? 'none' }, movesHash: moves?.hash ?? null, stages: stagesSoFar(), builtAt: new Date().toISOString() });
  store.putReceipt(L, receipt);
  // Said in the whole account and by `status`; under `atelier new` the short screen stays the owner's.
  if (!orchestrated() || argv.includes('--report')) console.log(describeStages(receipt.stages));
  store.setActive(L, skill.skillVersionHash);

  // ── IMPROVE: WRITE INTO THE USER'S OWN SKILL ───────────────────────────────────────────────
  //
  // Until this existed, `build` was journey-blind: `planImport` selected IMPROVE, `intake` typed the
  // package, `discover` found what it was missing — and then a brand new skill was installed beside
  // it. The diagnosis was real and nothing acted on it.
  //
  // Every edit is routed through `planPlacement`, so a rule the host could not see is REFUSED rather
  // than written. And the bytes are backed up first, by the same pass that changes them: `rollback`
  // moves a pointer between versions Atelier built and has no authority over a package it did not
  // create.
  const pkgFile = runFile('skill-package.json');
  if (existsSync(pkgFile)) {
    const sp = readJson<{ absRoot: string; components: AdaptedComponent[]; skillId: string }>(
      pkgFile, { what: 'the skill package', requireKeys: ['absRoot', 'components'] });
    const contents = new Map<string, string>();
    for (const c of sp.components) {
      const abs = join(sp.absRoot, c.path);
      if (existsSync(abs)) { const r = extract(abs); if (r.ok) contents.set(c.path, r.text); }
    }

    // ── ONLY WHAT MAY BIND IS WRITTEN, AND ONLY WHAT IS MISSING ────────────────────────────────
    //
    // Every proposal change used to be appended as a plain instruction heading — including rules the
    // compiler had routed to OBSERVE precisely because nobody ratified them. And the `already-handled`
    // list this filter leaned on was read from a file nothing ever wrote, so it was always empty.
    // "Already handled" is now read off the package itself: a rule whose words are in the files needs
    // no second copy.
    const installedText = [...contents.values()].join('\n');
    const writable = proposal.changes.filter((c) => c.gateRole === 'ENFORCE' && !installedText.includes(c.text));
    const plan = planImprovement(sp.skillId, sp.absRoot, writable, sp.components, contents);
    console.log(`\n${describeImprovement(plan, sp.skillId)}`);

    if (plan.edits.length) {
      const undo: UndoRecord = plan.undo;
      writeAtomic(runFile('undo.json'), JSON.stringify(undo, null, 1));
      for (const [rel, text] of Object.entries(plan.resulting)) writeAtomic(join(sp.absRoot, rel), text);
      console.log(`Written into ${sp.absRoot}.`);
      console.log(`  atelier revert    puts every one of those files back exactly as it was\n`);
    }

    saveSession({ ...s, skillName: name, claim: undefined });
    console.log(`StandardVersion ${v.standardVersionHash} · architecture ${arch.architectureHash}`);

  // ── WHICH PARTS THIS SYSTEM CAN KEEP HONEST, AND WHICH STAY YOURS ────────────────────────
  //
  // Separate from carrier on purpose. A carrier is how the behaviour is caused; this is how anyone
  // would know it happened. Reporting it at build is the moment the author has just decided what
  // binds and can still see what that costs to maintain.
  {
    const byId = new Map(v.requirements.map((r) => [r.requirementId, r]));
    const plans = arch.components.flatMap((c) => c.carries
      .map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => defaultPlan(r, c.carrier)));
    if (plans.length) {
      console.log(describeMaintenance(maintenanceMap(plans),
        (id) => byId.get(id)?.statement ?? id));
    }
  }
    showSkillCard(L, skill.skillVersionHash, s.reservation?.reserved.length ?? 0, opts.closing !== false);
    return;
  }

  const host = pickHost();
  const pkg = pkg0;
  assertPortable(pkg);
  const inst = host.install(pkg, projectDir());
  { const moved = describeBackup(inst); if (moved) console.log(moved); }
  if (!inst.ok) return void die(`install failed: ${inst.reason}`);

  // The build is finished: the name is this folder's outright, and no longer a claim made before it was (cli/commands/method.ts).
  saveSession({ ...s, skillName: name, claim: undefined });
  reportInstalled(host, inst.installedAt, name, v, arch, pkg.packageHash);
  reportObservedBoundaries(arch, v, name);
  showSkillCard(L, skill.skillVersionHash, s.reservation?.reserved.length ?? 0, opts.closing !== false);
}

/**
 * A GOLDEN CORPUS AGAINST ITS OWN STANDARD, said at every build in one line: how many of the author's own pieces
 * meet every REQUIRED rule that is counted on every output. A standard the author's best work fails is the wrong
 * standard, and an output held to it is held to something the author does not do. When more pieces break the set
 * than the review would have allowed, the rules they break most are named, at most four, and then the rulings that
 * bring the pieces back within it, each with one command: first the limits that can be set where the author's
 * pieces are (./amend.ts, `amendToFit`), so those rules stay required and become true of them, then the fewest
 * rules to make preferences. A rule whose move would change nothing is not listed.
 * A limit is offered only when the pieces can still be read and are the ones the counts were taken on. Nothing is
 * changed here: what is required is the owner's to rule on.
 *
 * The pieces are the ones discovery sealed (those read and those held out, never the reserve), by the count it
 * recorded for each rule. A skill built before that count was kept is read from its folder of pieces instead, by
 * content, so a file saved into that folder since (an export, a draft) is not taken for one of the author's. So is
 * a skill one of whose checks was amended after discovery, when its pieces are still there: the kept count is of
 * the check it had. A rule that applies only under a condition is not counted: no piece is held to it without the condition.
 */
function reportOwnPieces(v: StandardVersion, name: string, s: ReturnType<typeof loadSession>): void {
  // A rule read against what a piece was made from (a figure given, a line cited) cannot be read on the piece alone:
  // each piece's own material is not here, and without it every citation reads as invented.
  const rules = v.requirements.filter((r) => r.measurement && r.materiality === 'REQUIRED' && r.authority !== 'EXPERT_REJECTED' && isGeneralScope(r.appliesWhen) && targetOf(r.measurement.observer) !== 'BOUND_MATERIAL');
  if (!rules.length) return;
  const recorded = rules.map((r) => s.proposalMeta?.[r.requirementId]?.corpus ?? null);
  let pieces: number; let breaking: { id: string; pieces: readonly number[] }[];
  const sealed = new Set((s.evidence?.items ?? []).map((i) => i.contentHash));
  const own = sessionCorpus().filter((t) => !sealed.size || sealed.has(sha(t)));
  // A count kept at discovery is of the check the rule had then. Once the owner has amended a rule's check (the limit
  // offered below, for one), every rule is counted afresh on the same pieces read again, so that the next build says
  // where the pieces stand now and a piece has one place in every count. Pieces that can no longer be read, or are
  // not the same number, leave the kept counts standing.
  const proposed = new Map(s.proposals.map((p) => [p.requirementId, p.measurement ? measurementId(p.measurement) : null]));
  const amended = rules.some((r) => r.measurement && proposed.get(r.requirementId) !== measurementId(r.measurement));
  if (recorded.every((c) => c !== null) && new Set(recorded.map((c) => c?.pieces)).size === 1 && !(amended && own.length === recorded[0]?.pieces)) {
    pieces = recorded[0]?.pieces ?? 0;
    breaking = rules.map((r, i) => ({ id: r.requirementId, pieces: recorded[i]?.breaking ?? [] }));
  } else {
    pieces = own.length;
    breaking = rules.flatMap((r) => (r.measurement ? [{ id: r.requirementId, pieces: piecesBreaking(own, r.measurement) }] : []));
  }
  if (pieces < 3) return;
  const failing = new Set(breaking.flatMap((b) => b.pieces));
  console.log(`Your own pieces: ${pieces - failing.size} of ${pieces} meet every required rule that is counted.`);
  if (failing.size <= allowed(pieces, CORPUS_SET_SHARE)) return;
  // THE RULINGS THAT GET THERE, AND NO OTHERS. First each limit that can be set where the pieces are, which keeps its
  // rule required; then, of what the pieces still break, the fewest rules whose move to a preference leaves at most
  // the allowed number failing (core/ratification/suggest.ts, `fewestToMove`, as the review screen does). A rule
  // that neither helps is not listed: listing every broken rule left the owner to find the set by trial.
  const room = allowed(pieces, CORPUS_SET_SHARE);
  const broken = breaking.filter((b) => b.pieces.length).sort((a, b) => b.pieces.length - a.pieces.length);
  const plan = broken.map((b) => {
    const rule = rules.find((r) => r.requirementId === b.id);
    // Fitted only to the pieces the count was taken on: a folder that has moved or changed since offers no limit.
    const now = own.length === pieces && rule?.measurement ? piecesBreaking(own, rule.measurement) : null;
    const same = now !== null && now.length === b.pieces.length;
    const fit = rule?.measurement && same ? fitToCorpus(rule.measurement, own, allowed(pieces, CORPUS_RULE_SHARE)) : null;
    const command = rule && fit ? amendToFit(name, rule, own, allowed(pieces, CORPUS_RULE_SHARE)) : null;
    // Counted on the pieces as read now wherever they can be, so that one piece has one place in every rule's count.
    return { id: b.id, command, after: command && fit ? piecesBreaking(own, fit) : same ? now : b.pieces };
  });
  const move = fewestToMove(plan.map((x) => x.after), room);
  const moved = new Set((move ?? plan.map((_, k) => k)).map((k) => plan[k].id));
  const fitted = plan.filter((x) => x.command && !moved.has(x.id));
  const left = new Set(plan.filter((x) => !moved.has(x.id)).flatMap((x) => x.after)).size;
  console.log(`  They break ${broken.slice(0, 4).map((b) => `${b.id} (${b.pieces.length})`).join(', ')} most. These rulings bring it to ${pieces - left} of ${pieces}, and each is yours to make:`);
  if (fitted.length) console.log('  The limit your own pieces meet, which keeps the rule required:');
  for (const x of fitted) console.log(`    ${x.id}: ${x.command}`);
  if (moved.size) console.log('  The rule as a preference, which still counts and still chooses between drafts:');
  for (const x of plan.filter((y) => moved.has(y.id))) console.log(`    ${x.id}: atelier amend --skill ${name} --rule ${x.id} --materiality PREFERRED --reason "<why>"`);
}

/**
 * THE SKILL'S EVALUATION (cli/skill-card.ts): what every output will be checked by and how far each check can be
 * trusted, printed now and stored with this version (atelier report --skill <name>; the MCP tool). On every
 * build path, the one that writes into the person's own skill included.
 */
/** How many steered features the build screen names; the rest are behind `atelier report --skill`. */
const BUILD_STEERED = 6;
/** `next` false: the caller ends on its own list of what to do next (`atelier new`), so the card does not print a second. */
function showSkillCard(L: store.StoreLayout, skillVersion: string, heldBack: number, next = true): void {
  const card = skillCardFor(L, { heldBack, skillVersion, persist: true });
  // The strongest few steered features, by name; `atelier report --skill` lists every one.
  if (card && !argv.includes('--quiet')) console.log(`\n${renderSkillCard(card, process.stdout.columns || 110, { next, steered: BUILD_STEERED })}\n`);
}

/**
 * The install, reported. "READY" IS EARNED, NOT ANNOUNCED: the banner means at least one rule reaches the
 * model as an instruction. Under `atelier new`, one line and any delivery gap; on its own, the hashes and
 * the host's full delivery matrix.
 */
function reportInstalled(host: HostAdapter, installedAt: string, name: string, v: StandardVersion, arch: SkillArchitecture, packageHash: string): void {
  const instructs = arch.components.some((c) => c.gateRole === 'ENFORCE');
  if (instructs && orchestrated()) {
    console.log(`\nYour skill is ready: ${host.invocationHint(name).trim()}   (installed for ${host.detect().hostId} at ${installedAt})`);
    reportDeliveryGap(host, arch, name);
    return;
  }
  if (instructs) {
    console.log(`\nYour skill is ready.\n`);
  } else {
    console.log(`\nPreview installed — it INSTRUCTS NOTHING until you rule.\n`);
    console.log(v.authorityState === 'DRAFT'
      ? `  Every rule is still a proposal. Rule on them:  atelier ratify --page rulings.html   (or atelier pending)`
      : `  Every kept rule is shown, not instructed. Declare what binds:  "materiality":"REQUIRED" on a ratify decision`);
    console.log('');
  }
  console.log(`  ${host.invocationHint(name)}\n`);
  console.log(`Installed for ${host.detect().hostId} at ${installedAt}`);
  console.log(`StandardVersion ${v.standardVersionHash} · architecture ${arch.architectureHash} · package ${packageHash}`);

  // ── WHAT THIS HOST ACTUALLY HOLDS ──────────────────────────────────────────────────────────
  //
  // Printed at install because this is the moment a person forms a belief about what their skill now
  // does. "Installed" used to be the last word, and it invited the reading that every carrier in the
  // package is in force wherever the package is — which was false for two of them and silently so.
  //
  // The standard is unchanged either way. What a host cannot enforce, it cannot enforce; the answer is
  // to say so here, not to weaken the standard until it fits.
  {
    const present = [...new Set(arch.components.map((c) => c.carrier))] as Carrier[];
    console.log(`\n${describeMatrix(`${host.detect().hostId} (invoked as ${host.invocationHint(name).trim()})`, host.carrierDelivery(), present)}`);
    if (undelivered(host, arch).length) {
      console.log(`Everything in your standard is delivered when Atelier owns the call:`);
      console.log(`  atelier invoke --skill ${name} "<your task>"\n`);
    }
  }
}

/** Carriers in this skill the host does not deliver itself: they reach the model only through `atelier invoke`. */
function undelivered(host: HostAdapter, arch: SkillArchitecture): Carrier[] {
  const present = [...new Set(arch.components.map((c) => c.carrier))] as Carrier[];
  return present.filter((c) => host.carrierDelivery()[c].state !== 'DELIVERED' && c !== 'NONE');
}

/** One line when part of the skill is only referenced on this host, naming the call that delivers all of it. */
function reportDeliveryGap(host: HostAdapter, arch: SkillArchitecture, name: string): void {
  const gap = undelivered(host, arch);
  if (gap.length) console.log(`(${host.detect().hostId} is not seen to load ${gap.join(', ')}; everything is delivered by: atelier invoke --skill ${name} "<your task>")`);
}

/**
 * THE POST-BUILD DISCLOSURE. It comes AFTER the skill works, and asks about one thing only: prohibitions
 * nobody confirmed, the decisions the corpus cannot check, because their evidence is what is not there.
 */
function reportObservedBoundaries(arch: SkillArchitecture, v: StandardVersion, name: string): void {
  const observed = observedBoundaries(arch, v);
  if (observed.length && orchestrated()) {
    console.log(`${observed.length} pattern(s) you seem to avoid are watched, not enforced: ${observed.map((c) => c.carries[0]).join(', ')}. `
      + `Confirm one: atelier confirm --skill ${name} --rule <id>   (or --drop)`);
  } else if (observed.length) {
    const byId = new Map(v.requirements.map((r) => [r.requirementId, r]));
    console.log(`\nOne thing worth a look. I noticed ${observed.length} pattern(s) you seem to avoid.`);
    console.log('I could be wrong — absence in your work does not prove it was deliberate — so these are');
    console.log('NOT shaping what your skill writes. It checks its own draft against them and tells you.\n');
    for (const c of observed) {
      const r = byId.get(c.carries[0]);
      if (r) console.log(`  ${r.requirementId}  ${r.statement}`);
    }
    console.log(`\nIf one is right: atelier confirm --skill ${name} --rule <id>   (it starts shaping the writing)`);
    console.log(`If one is wrong: atelier confirm --skill ${name} --rule <id> --drop`);
  }
}

/**
 * THE FORM OF THE WORK, READ ONCE AND KEPT. The owner's word (`--work-form reply|document`) first; then what was read
 * before, unless `--persona auto` asks for every reading again; else the reading: code where the examples are decisive,
 * the context reader otherwise, the name of the work as the floor with no model. Said in one line, with who decided.
 */
async function workFormFor(L: store.StoreLayout, v: StandardVersion, method: { text: string } | null, exemplar: { text: string; request?: string } | null): Promise<WorkForm> {
  const asked = flag('--work-form')?.trim().toUpperCase();
  if (asked !== undefined) {
    if (asked !== 'REPLY' && asked !== 'DOCUMENT') die('--work-form takes reply or document.');
    const chosen: WorkForm = asked === 'REPLY' ? 'REPLY' : 'DOCUMENT';
    store.setWorkForm(L, chosen);
    console.log(`Work form: ${chosen === 'REPLY' ? 'replies in a conversation' : 'documents'}, as you said.`);
    recordStage('work-form', { ran: true, detail: chosen === 'REPLY' ? 'replies' : 'documents' });
    return chosen;
  }
  const stored = store.getWorkForm(L);
  if (stored && flag('--persona')?.trim().toLowerCase() !== 'auto') { recordStage('work-form', { ran: true, detail: stored === 'REPLY' ? 'replies' : 'documents' }); return stored; }
  const fromSession = sessionPairs().map((p) => ({ text: withoutFrontMatter(p.text), request: p.request }));
  const storedPieces = store.getVoice(L)?.pieces ?? [];
  // The one worked example counts as evidence too: a single sectioned piece is a document.
  const examples = fromSession.length ? fromSession : storedPieces.length ? storedPieces.map((t) => ({ text: withoutFrontMatter(t), request: null })) : exemplar ? [{ text: exemplar.text, request: exemplar.request ?? null }] : [];
  const input = { workType: v.workType, examples, method: method?.text ?? null };
  const model = NO_MODEL() ? null : contextReaderModel();
  const d = await readContext(WORK_FORM, input, NO_MODEL() ? null : contextReaderClient(), model, { spentUsd: 0, capUsd: 0.2, maxCalls: 1 });
  // `--review` writes nothing: the reading is made and said, and kept only by a build that commits.
  if (!argv.includes('--review')) store.setWorkForm(L, d.value);
  recordStage('work-form', { ran: true, detail: d.value === 'REPLY' ? 'replies' : 'documents' });
  // A READER THAT CANNOT BE REACHED IS NOT ASKED AGAIN THIS BUILD. A key set for a backend that answers nothing made every
  // reading after this one wait its own retries out (a minute, for a build that needs none of them): the first failure
  // turns the rest of the build's readings off, said once, and the build finishes as a build with no model does.
  if (d.by === 'floor' && d.why?.startsWith('the reader could not be asked')) {
    process.env.ATELIER_BUILD_NO_MODEL = '1';
    console.log(`(${d.why}; nothing else in this build asks a model.)`);
  }
  const how = d.by === 'code' ? 'every example is written under sections'
    : d.by === 'model' ? `read from ${examples.length ? `${Math.min(examples.length, 8)} of your examples` : 'how the work is described'} by ${model}`
      : `from the name of the work alone (${d.why})`;
  // What a model read is said on the short screen; what code saw or the name decided is in the whole account.
  console.log(d.by === 'model' ? `Work form: ${d.value === 'REPLY' ? 'replies in a conversation' : 'documents'}; ${how}. Say otherwise with --work-form reply|document.`
    : `(work form: ${d.value === 'REPLY' ? 'replies in a conversation' : 'documents'}, ${how}; --work-form reply|document says otherwise.)`);
  return d.value;
}
