// cli/commands/build.ts — Compiling a ratified standard into a package and installing it for a host.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import type { StoredSignal } from '../../core/observers/selection.js';
import { selectVoicePieces, selectWithinBudget, isExcerpt, usualLength, PIECE_BUDGET_WORDS, type PieceForm, type Voice } from '../../core/compiler/voice.js';
import { derivePersona, reconcilePersona, standardForbids } from '../../core/compiler/persona.js';
import type { Budget } from '../../core/inference/client.js';
import { sessionCorpus, sessionPairs, unsplitPairs } from '../corpus.js';
import { deriveScope, groundScope, spreadByKind, type ScopeProfile } from '../../core/compiler/scope.js';

/** The words of example answers a skill that answers shows by default: enough for one of each kind of request and a few more. */
const ANSWER_EXAMPLE_WORDS = 1200;
import { isReplyWork } from '../../core/observers/formats.js';
import { isGeneralScope } from '../../core/state/canonical-state.js';
import { moveEvidence, readHoldsBack, ownerWrote, HOLDS_BACK } from '../../core/compiler/applicability.js';
import { normalizeClass } from '../../core/observers/doc-class.js';
import { selectContrastPairs } from '../../core/compiler/contrast-examples.js';
import { verifyText } from '../../core/observers/verify.js';
import { describeBackup } from '../../adapters/install-tree.js';
import { onCorpusReader } from './discover.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { join } from 'node:path';
import { readJson } from '../../core/state/read-json.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { compileArchitecture, observedBoundaries, type SkillArchitecture } from '../../core/architecture/compile.js';
import type { HostAdapter } from '../../adapters/host-adapter.js';
import { renderAgentSkill, assertPortable, skillNameFrom, defaultDescription } from '../../renderers/agent-skill/render.js';
import { buildProposal, renderProposal, unconfirmedIn } from '../../core/compiler/proposal.js';
import { defaultPlan, maintenanceMap, describeMaintenance } from '../../core/coverage/observation.js';
import { planImprovement, describeImprovement, type UndoRecord } from '../../core/compiler/apply.js';
import type { AdaptedComponent } from '../../core/intake/package.js';
import { installFidelity } from '../fidelity.js';
import { skillCardFor } from '../skill-card.js';
import { renderSkillCard } from '../../core/eval/skill-card.js';
import * as store from '../../core/state/store.js';
import { extract } from '../../core/intake/extract.js';

import { describeMatrix, type Carrier } from '../../core/delivery/carrier-delivery.js';
import { sha, DATA, die, argv, flag, projectDir, pickHost,
  loadSession, saveSession, step, runFile, numericFlag, orchestrated, proposerModel } from '../runtime.js';

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
 * kept through later rebuilds, like the rest of the voice; neither changes a rule, and without them a build
 * chooses exactly as it did before they existed.
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

async function chooseVoice(L: store.StoreLayout, v: StandardVersion): Promise<Voice | null> {
  const choice = (name: string): 'none' | 'auto' | undefined => {
    const x = flag(name)?.trim().toLowerCase();
    if (x !== undefined && x !== 'none' && x !== 'auto') die(`${name} takes none or auto`);
    return x as 'none' | 'auto' | undefined;
  };
  const voiceFlag = choice('--voice'); const personaFlag = choice('--persona');
  const asked = pieceFlags();
  const reselect = asked.budget !== undefined || asked.form !== undefined;
  const answers = isReplyWork(v.workType);
  // Answers are short and are shown whole: an opening and a middle passage of a forty-word answer is the answer.
  if (answers && asked.form === 'excerpts') die('--pieces excerpts applies to a skill that writes: the answers this skill shows are short, and are shown whole. Use --piece-budget to show fewer of them.');
  if (voiceFlag === 'none') {
    if (reselect) die('--voice none serves none of your pieces, so --piece-budget and --pieces have nothing to choose from: drop one of them.');
    return null;
  }
  const stored = store.getVoice(L);
  let voice: Voice | null = voiceFlag === undefined ? stored : null;
  // THE OWNER'S BUDGET AND FORM ARE KEPT UNTIL THE OWNER GIVES OTHERS: what was asked now, or what the skill holds,
  // `--voice auto` included (it chooses the pieces again, it does not forget what it was told about them).
  // `--piece-budget default` is how the budget is given up.
  const wordBudget = asked.budget === undefined ? stored?.pieceBudget : asked.budget ?? undefined;
  const form: PieceForm = asked.form ?? stored?.pieceForm ?? 'whole';
  // A persona is derived (one model call) only for a voice chosen in this run, or when asked for: choosing the
  // pieces again must never spend, nor bring back a persona the owner turned off.
  const derivesPersona = !voice || personaFlag === 'auto';
  // This run's pieces: the run being built is this skill's, whatever name it is built under.
  const readable = derivesPersona || reselect ? sessionCorpus() : [];
  // A budget or a form with no pieces to apply it to is refused, with or without a stored voice: never ignored.
  if (reselect && readable.length < 3) {
    die(loadSession().source
      ? '--piece-budget and --pieces choose from the pieces this skill was built from, and fewer than three can be read here. Run it from the project the skill was built in, with its folder of pieces in place.'
      : '--piece-budget and --pieces choose among your own pieces, and this skill was built from rules you stated, with no pieces to choose from.');
  }
  // A skill that answers shows examples spread over the kinds of request (`spreadExamples`), so no whole pieces are
  // chosen for it here when that spread will replace them.
  const spreads = (x: Voice | null): boolean => answers && Boolean(x?.scope?.kinds) && voiceFlag === undefined && !argv.includes('--full');
  // The default choice when no budget is set (as it has always been made); a budget the owner set is a ceiling.
  const choose = (): string[] => (wordBudget === undefined && form === 'whole' ? selectVoicePieces(readable) : selectWithinBudget(readable, wordBudget ?? PIECE_BUDGET_WORDS, form));
  const said = (pieces: readonly string[]): string => {
    const cut = form === 'excerpts' ? pieces.filter(isExcerpt).length : 0;
    const what = cut === 0 ? `${pieces.length} whole piece(s)` : cut === pieces.length ? `passages from ${pieces.length} piece(s)` : `passages from ${cut} piece(s) and ${pieces.length - cut} short one(s) whole`;
    return `${what} of the author's own served with the skill${wordBudget === undefined ? '' : `, within ${wordBudget} words`}, chosen to span how they write`;
  };
  const none = (): string => `none of the author's pieces is served${wordBudget === undefined ? '' : `: none fits within ${wordBudget} words`}; how they sound and how long they write are kept`;
  const prefs = { pieceForm: form === 'excerpts' ? form : undefined, pieceBudget: wordBudget };
  if (!voice && readable.length >= 3) {
    const pieces = choose();
    voice = { passages: [], lengthWords: usualLength(readable), pieces, ...(prefs.pieceForm ? { pieceForm: prefs.pieceForm } : {}), ...(wordBudget === undefined ? {} : { pieceBudget: wordBudget }) };
    if (pieces.length) console.log(`Voice: ${said(pieces)}. Turn off with --voice none.`);
    else if (wordBudget !== undefined && !answers) console.log(`Voice: ${none()}.`);
  } else if (voice && reselect) {
    // A skill built before keeps its pieces until the owner asks for others, and then they are chosen again from
    // the pieces it was built from: a budget cannot be met by cutting the ones already stored.
    if (spreads(voice)) voice = { ...voice, ...prefs };
    else {
      // A skill of the first design serves short passages inline, which no budget of pieces reaches: saying "none of
      // your pieces" over them would be false, and removing them could not be undone by `--piece-budget default`.
      if (wordBudget === 0 && voice.passages.length) die('this skill was built by an early version and serves passages of yours inline, which --piece-budget does not reach. Choose its voice again first: atelier build --name <name> --voice auto, then set the budget.');
      const pieces = choose();
      voice = { ...voice, pieces, ...prefs };
      console.log(`Voice: ${pieces.length ? said(pieces) : none()}.`);
    }
  }
  if (!voice) return null;
  // HOW MUCH THE AUTHOR WRITES FOR WHAT WAS ASKED (core/compiler/scope.ts), for a skill that answers requests: read
  // once from the examples, with the request each one answers when its file carries it. A failure costs the reading,
  // never the build: the profile is then counts alone, and states no habit nobody read.
  if (answers && (!voice.scope || personaFlag === 'auto')) {
    const pairs = sessionPairs();
    // Said once, by name: such a file's request was learned as the author's writing by every reading before this one.
    const whole = unsplitPairs(loadSession().source ?? '');
    if (whole.length) console.log(`(${whole.length} file(s) look like a request and an answer, but were read whole: ${whole.slice(0, 5).join(', ')}${whole.length > 5 ? ', …' : ''}. Start the file with front matter \`request:\`, or \`## Request\` then \`## Answer\`, and build again.)`);
    if (pairs.length >= 3) {
      const scopeBudget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1.5), maxCalls: 1 };
      let scope: ScopeProfile;
      try {
        scope = await onCorpusReader((c) => deriveScope(c, scopeBudget, pairs, proposerModel()));
        console.log(`Scope: what ${scope.examples} example(s) add beyond what was asked, ${scope.paired} of them read with the request they answer`
          + (scope.dropped ? ` (${scope.dropped} finding(s) dropped: not quoted from the answer)` : '')
          + `${scope.unread ? ` (${scope.unread} example(s) not read${scope.beyond.length ? '' : ': too many to state a habit from the rest'})` : ''}; $${scopeBudget.spentUsd.toFixed(3)}. No usual length is stated: the request sets it.`);
      } catch (e) {
        scope = groundScope(pairs, null, null);
        console.log(`(the examples could not be read for scope: ${(e as Error).message.split('\n')[0]}; the skill states that the request sets the length, and no habit.)`);
      }
      voice = { ...voice, scope };
      if (voiceFlag === undefined) voice = spreadExamples(voice, pairs);
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
  if (moves.length && isReplyWork(v.workType)) {
    const pieces = loadSession().run?.heldOutPieces ?? voice.corpusPieces ?? null;
    const moveBudget: Budget = { spentUsd: 0, capUsd: 0.2, maxCalls: 1 };
    const read = await onCorpusReader((c) => readHoldsBack(c, moveBudget, moves.map((r) => ({ id: r.requirementId, statement: r.statement })))).catch(() => null);
    const holdsBack = moves.filter((r) => (read ? read.includes(r.requirementId) : false) || HOLDS_BACK.test(r.statement)).map((r) => r.requirementId);
    voice = { ...voice, ...(pieces ? { corpusPieces: pieces } : {}), holdsBack };
    const carried = moves.map((r) => ({ r, e: moveEvidence(r.observedRate, pieces, { answers: isReplyWork(v.workType), general: isGeneralScope(r.appliesWhen), holdsBack: holdsBack.includes(r.requirementId), ownerRuled: ownerWrote(r) }) }));
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
  if (personaFlag === 'none') return { ...voice, persona: undefined };
  if (!derivesPersona || readable.length < 3 || (personaFlag !== 'auto' && voice.persona)) return voice;
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1.5), maxCalls: 1 };
  try {
    const persona = reconcilePersona(await onCorpusReader((c) => derivePersona(c, budget, readable)), standardForbids(v));
    console.log(`Persona: ${persona.points.length} point(s) on how the author sounds, each with how often and a quote from their pieces`
      + (persona.dropped ? ` (${persona.dropped} dropped: their quote was not in the pieces)` : '')
      + `${persona.conflicting ? ` (${persona.conflicting} dropped: they describe a move your standard rules out)` : ''}; $${budget.spentUsd.toFixed(3)}. Turn off with --persona none.`);
    return { ...voice, persona };
  } catch (e) {
    console.log(`(the persona could not be derived: ${(e as Error).message.split('\n')[0]}; the skill is built without it.)`);
    return voice;
  }
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

export async function build(nameArg?: string): Promise<void> {
  let s = loadSession();
  const name = skillNameFrom(nameArg ?? flag('--name') ?? die('--name required'));
  // THE FIRST THING A NEW USER HITS IF THEY RUN THIS TOO EARLY, so it says what to do rather than
  // what failed. It used to surface a raw ENOENT with an absolute store path — technically accurate,
  // and useless to someone who has simply not minted a standard yet.
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
  const desc = flag('--description') ?? defaultDescription(v.workType);
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
      const text = readFileSync(ex, 'utf8');
      // Compared as text, not bytes: a copy with a BOM, Windows line ends or other whitespace is the same piece.
      const norm = (t: string): string => t.replace(/^\uFEFF/, '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();
      if (s.reservation?.reserved.some((u) => norm(u.artifact) === norm(text))) {
        die('--exemplar names a piece that was reserved to test the skill blind. Pick one discovery was allowed to read.');
      }
      // The exemplar is what the model imitates, so it should meet the standard it illustrates.
      const report = verifyText(name, v, text);
      const broken = report.checked.filter((c) => c.result.verdict === 'VIOLATED');
      if (broken.length) {
        console.log(`Note: the exemplar breaks ${broken.map((c) => `${c.requirementId} (${c.result.detail})`).join(', ')}. `
          + 'The model will imitate it as it is.');
      }
      exemplar = { text };
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
    die('--contrast takes none (ship no contrast examples) or auto (choose them from past repairs, the default)');
  }
  const contrastOff = contrastFlag === undefined ? store.getContrast(L).off : contrastFlag.trim().toLowerCase() === 'none';
  const heldBack = { tasks: (s.reservation?.reserved ?? []).map((u) => u.task), texts: (s.reservation?.reserved ?? []).map((u) => u.artifact) };
  const contrast = { off: contrastOff, pairs: contrastOff ? [] : selectContrastPairs(store.listInvocations(L), v, heldBack) };
  const shipped = contrast.pairs;
  if (shipped.length) console.log(`Contrast examples: ${shipped.length} "write this, not that" pair(s) from past repairs (examples/contrast.md). Turn off with --contrast none.`);
  const voice = await chooseVoice(L, v);
  const pkg0 = renderAgentSkill(v, arch, name, desc, exemplar, shipped, voice);
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
  store.putStandard(L, v); store.putSkillVersion(L, skill); store.putArchitecture(L, arch); store.putPackage(L, pkg0); store.setActive(L, skill.skillVersionHash);
  store.setExemplar(L, exemplar?.text ?? null); store.setVoice(L, voice); store.setDocClass(L, docClass); store.setContrast(L, contrast);
  // The author's signals, read off their pieces against the model's drafts at discovery (never a rule).
  if (existsSync(runFile('signals.json'))) store.setSignals(L, readJson<StoredSignal[]>(runFile('signals.json'), { what: 'the discovered signals', kind: 'array' }));
  // The fidelity profile and the first implementation release (cli/fidelity.ts): what steers drafts toward
  // the author's range, below the standard and never able to move it.
  const release = installFidelity(L, v, skill.skillVersionHash);
  if (release) console.log(`Implementation release ${release.id}: ${release.settings.drafts} drafts, up to ${release.settings.editBudget} structural edit(s)${release.retrievalHash ? `, ${release.settings.retrievalK} of your passages retrieved per request` : ''}.`);

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

    saveSession({ ...s, skillName: name });
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
    showSkillCard(L, skill.skillVersionHash, s.reservation?.reserved.length ?? 0);
    return;
  }

  const host = pickHost();
  const pkg = pkg0;
  assertPortable(pkg);
  const inst = host.install(pkg, projectDir());
  { const moved = describeBackup(inst); if (moved) console.log(moved); }
  if (!inst.ok) return void die(`install failed: ${inst.reason}`);

  saveSession({ ...s, skillName: name });
  reportInstalled(host, inst.installedAt, name, v, arch, pkg.packageHash);
  reportObservedBoundaries(arch, v, name);
  showSkillCard(L, skill.skillVersionHash, s.reservation?.reserved.length ?? 0);
}

/**
 * THE SKILL'S EVALUATION (cli/skill-card.ts): what every output will be checked by and how far each check can be
 * trusted, printed now and stored with this version (atelier report --skill <name>; the MCP tool). On every
 * build path, the one that writes into the person's own skill included.
 */
function showSkillCard(L: store.StoreLayout, skillVersion: string, heldBack: number): void {
  const card = skillCardFor(L, { heldBack, skillVersion, persist: true });
  if (card && !argv.includes('--quiet')) console.log(`\n${renderSkillCard(card, process.stdout.columns || 110)}\n`);
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
