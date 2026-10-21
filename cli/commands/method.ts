// cli/commands/method.ts — `atelier method`: A SKILL FROM ONE METHOD AND ONE FINISHED EXAMPLE.
//
// The other way in. `atelier new` reads a body of work and finds the taste in it; this reads what the owner says is
// done (a method note: steps, a template, both) and one piece of work where it was done, and builds a skill that is
// held to the method. No taste is read from one piece, and none is claimed.
//
// What the owner sees is their own steps, each marked with what it is: something the output must contain (checked
// by code on every output), something the work must be made from (checked against the material), or a judgement
// (shown to the writer and left to them). A step their own example does not do stays theirs, is checked and shown on
// every run, and blocks nothing until they confirm it or change the method. Beside each check is how
// much of the step it reads (core/eval/observes.ts): a step read in part is said to be read in part.
// What the example shows that no step said is proposed, and is shown, never required, until they say so.
//
// Nothing here calls a model (core/method/standard.ts). The build is one call and never stops for a disagreement
// between the method and the examples; `--yes` confirms the steps the examples dispute, so that they block.
import { existsSync, readFileSync, statSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { DATA, argv, die, flag, positional, loadSession, saveSession, archiveSession, authoredIdAllocator, runFile, sha, canReach, contextReaderClient, contextReaderModel } from '../runtime.js';
import * as store from '../../core/state/store.js';
import { resetStages } from '../stages.js';
import { METHOD_UNITS, unitFloor, describeUnit, type DecisionUnit } from '../../core/method/decision-units.js';
import { STEP_CHECK, STEP_CHECK_REPAIR, planOf, stepCheckInput, heldByPolarity, judgement, type StepPlan, type StepToCheck, type StepCheck, type ExampleCase } from '../../core/method/step-check.js';
import { measure } from '../../core/observers/registry.js';
import { STEP_MUTANTS, mutate, qualifyCheck, describeQualification } from '../../core/method/mutants.js';
import { examplesKey, frozenFor, toFreeze, frozenKinds } from '../../core/method/freeze.js';
import { latestRatings } from '../../core/state/eval-store.js';
import { countWords } from '../../core/eval/size.js';
import { skillNameFrom } from '../../renderers/agent-skill/render.js';
import { RULE_POLARITY, UNREAD_KIND } from '../../core/observers/rule-polarity.js';
import { readContext } from '../../core/inference/reading.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { draftHash, appendDecision, type RatificationLedger } from '../../core/ratification/decision-record.js';
import { decide } from '../../core/ratification/authority.js';
import type { Requirement, CheckQualification } from '../../core/state/canonical-state.js';
import type { GoldenCase } from '../../core/golden/case.js';
import { proposalsAcross, countedOffers, tellOffers, grammarOffer, stepsOf, outlineOf, shortFormOffers, type MethodProposal } from '../../core/method/standard.js';
import { shortFormOptions, type ShortFormOptions } from '../../core/observers/short-form.js';
import { ensureGrammar } from '../../core/observers/grammar.js';
import { readCase, corpusFiles, sessionCorpus, corpusHashOf } from '../corpus.js';
import { buildProfile } from '../../core/fidelity/profile.js';
import { SELECTION } from '../../core/observers/selection.js';
import { withoutFrontMatter } from '../../core/composite/authors.js';
import { authorship } from '../../core/composite/voices.js';
import { shortFormFolder } from './intake.js';
import { MIN_GOLDEN_CHARS } from '../../core/discovery/chain/corpus-import.js';
import { observesOf, propositionOf, type Observes } from '../../core/eval/observes.js';
import { planFor, describePlan } from '../../core/plan/execution-plan.js';
import { ratifyClose } from './ratify.js';
import { settleLatitude } from '../latitude.js';
import { build } from './build.js';

const LABEL = { DELIVERABLE: 'the work must contain', EXECUTION: 'the work must be made from', JUDGEMENT: 'judgement' } as const;

/** The screen: the owner's steps by what each is, then what needs their word. Returned as lines, so a test reads what a person does. */
export function describeMethod(ps: readonly MethodProposal[], cls: string): string[] {
  const out: string[] = [];
  const stated = ps.filter((p) => p.origin === 'STATED'); const shown = ps.filter((p) => p.origin === 'SHOWN_BY_EXAMPLE' && !p.counted);
  const counted = ps.filter((p) => p.counted);
  const of = (k: MethodProposal['obligation']): MethodProposal[] => stated.filter((p) => p.obligation === k);
  // How much of the step the check reads, and what their own work did: both said beside it.
  const beside = (p: MethodProposal): string => { const o = observesOf(p.statement, p.measurement, false);
    return `${o?.coverage === 'PARTIAL' ? `\n      not checked, yours to read: ${o.unchecked}` : ''}${p.conflict ? `\n      ! ${p.conflict}. Checked and shown on every run; it blocks nothing until you confirm it (--yes).` : ''}`; };
  const block = (title: string, items: readonly MethodProposal[], note: (p: MethodProposal) => string): void => {
    if (!items.length) return;
    out.push('', `${title} (${items.length})`);
    items.forEach((p) => { out.push(`  - ${p.statement}`); const n = note(p); if (n) out.push(`      ${n}`); });
  };
  out.push(stated.length ? `${stated.length} step(s) from your method.` : 'No method was given: the skill is your examples, and what can be counted in them.');
  // What will be looked for, in the check's own terms, beside how the example fares on it: the owner approves the
  // check, and "everything it must contain is there" does not say which section a step was tied to.
  const looksFor = (p: MethodProposal): string => {
    const m = p.measurement;
    if (m?.observer === 'PRESENCE' && Array.isArray(m.params.sections)) return `checks for: ${propositionOf(m)}${p.byName ? ' (read from your example\'s section names)' : ''}; `;
    if (m?.observer === 'TABLE' && Array.isArray(m.params.columns)) return `checks for: ${propositionOf(m)}; `;
    // Any other check the step became, in the check's own words: a length, a banned word, how a paragraph starts.
    return m ? `checks for: ${propositionOf(m)}; ` : '';
  };
  block('Checked on every output: what the work must contain', of('DELIVERABLE'), (p) => `${looksFor(p)}your example: ${p.onExample ?? 'held'}${beside(p)}`);
  block('Checked against the material: what the work must be made from', of('EXECUTION'), (p) => `${p.measurement?.observer === 'LINES' ? `checks for: ${propositionOf(p.measurement)} (for a diff, a line the change adds); ` : ''}your example: ${p.onExample ?? 'held'}${beside(p)}`);
  block('Judgement: shown to the writer, reported as not measured', of('JUDGEMENT'), () => '');
  block('Shown by your example, and not in your method: shown to the writer, required only if you say so', shown, (p) => `${LABEL[p.obligation]}; your example: ${p.onExample ?? 'held'}`);
  // What every example meets and the build requires (the machine-writing moves, mechanical errors, a platform's limit)
  // is said to be required here: a rule that blocks is never listed as one that waits for the owner's word.
  block('Counted from your examples, and not in your method: required, since every example meets it. Checked on every output, and it blocks', counted.filter((p) => p.required), (p) => `${looksFor(p)}${p.onExample ?? 'held'}`);
  block('Counted from your examples, and not in your method: how they are written. Shown to the writer and used to choose between drafts; required only if you say so', counted.filter((p) => !p.required), (p) => `${looksFor(p)}${p.onExample ?? 'held'}`);
  if (cls !== 'FULL_REPRO_CASE') out.push('', cls === 'TASK_AND_REFERENCE'
    ? 'Your example carries its task and no material, so nothing about what the work is made from can be checked.'
    : 'Your example carries neither its task nor its material: only what the work contains can be checked. Add `request:` to its front matter and a `<example>.material` folder beside it.');
  return out;
}

/**
 * THE SCREEN A PERSON BUILDS FROM: their steps, in their words, in three groups. What is checked on every run; what
 * is theirs to judge; what their examples show. How each check is made, and how every example fared, is the long
 * form above (`--report`). Three things stay on this screen because they are the owner's to act on: a step read as a
 * check by a section name of theirs (said beside it, so they can see it is what they meant); a step a check reads
 * only part of, with the part that is left to them; and a step their own finished work does not do.
 */
export function shortScreen(ps: readonly MethodProposal[]): string[] {
  const stated = ps.filter((p) => p.origin === 'STATED');
  const cover = (p: MethodProposal): Observes | null => observesOf(p.statement, p.measurement, false);
  const near = stated.filter((p) => p.related);
  const whole = stated.filter((p) => !p.related && cover(p)?.coverage === 'FULL'); const part = stated.filter((p) => !p.related && cover(p)?.coverage === 'PARTIAL');
  const judged = stated.filter((p) => !p.measurement); const shown = ps.filter((p) => p.origin === 'SHOWN_BY_EXAMPLE' && p.measurement);
  // What a step read by a section name will look for, in a few words: the owner checks the reading, not the machinery.
  const lookedFor = (p: MethodProposal): string => {
    const sections = p.measurement?.observer === 'PRESENCE' ? p.measurement.params.sections as readonly string[] | undefined : undefined;
    return sections?.length ? sections.map((x) => `a "${x}" section`).join(', ') : p.measurement ? propositionOf(p.measurement) : '';
  };
  // A STATED RULE THE OWNER'S OWN WORK DOES NOT DO IS STILL THEIR RULE. Said once, here, with the piece and what it did.
  const disagrees = (p: MethodProposal): string => (p.conflict ? `\n      ! ${p.conflict}.\n        Checked and shown on every run; it blocks nothing until you confirm it.` : '');
  const editorial = (p: MethodProposal): boolean => p.measurement?.observer === 'GRAMMAR';
  // With no method there is nothing of the owner's to list: what the examples show is all the skill is, so it is shown.
  if (!stated.length) return ['No method was given: the skill is your examples, served to the writer, and what can be counted in them. Whether new work reads like them is yours to judge.',
    // What every example meets, read from enough of them (a short piece's shape; the machine-tell ban), is required
    // and said to be; the rest is shown, with how many more examples would let it block where that is the reason.
    ...(shown.some((p) => p.required && !p.platform && !editorial(p)) ? ['', `Seen in every one of your examples, and required (${shown.filter((p) => p.required && !p.platform && !editorial(p)).length}):`, ...shown.filter((p) => p.required && !p.platform && !editorial(p)).map((p) => `  - ${p.statement}`)] : []),
    // The editorial grammar check: listed on every run, and never lowering the verdict (core/eval/record-build.ts).
    ...(shown.some(editorial) ? ['', 'Checked on every draft as editorial help, never lowering the verdict:', ...shown.filter(editorial).map((p) => `  - ${p.statement} Possible slips are listed for you; nothing is changed unless you pass --fix-grammar.`)] : []),
    // The platform's limit where some of the author's own pieces run past it: required as the platform's rule, said
    // apart from their habits, with the pieces that exceed it named.
    ...(shown.some((p) => p.platform) ? ['', 'The platform\'s limit, required, though some of your examples run past it:', ...shown.filter((p) => p.platform).map((p) => `  - ${p.statement}\n      ${p.onExample ?? ''}`)] : []),
    ...(shown.some((p) => !p.required) ? ['', `Seen in your examples: shown to the writer, and required only if you say so (${shown.filter((p) => !p.required).length}):`,
      ...shown.filter((p) => !p.required).map((p) => `  - ${p.statement}${p.onExample?.includes('more would let it block') ? `
      ${p.onExample.slice(p.onExample.indexOf('read from'))}` : ''}`)] : []),
    ...(!shown.length ? ['', 'Nothing that can be counted is common to all of them: the writer is given the pieces themselves.'] : []),
    '', 'A method note makes rules of your own: atelier new <your-work> --method <how-you-do-it.md>'];
  const out: string[] = [`${stated.length} step(s) in your method.`];
  if (whole.length) out.push('', `Checked on every run (${whole.length}):`, ...whole.map((p) => `  - ${p.statement}${p.byName ? `\n      checked as: ${lookedFor(p)}` : ''}${disagrees(p)}`));
  if (near.length) out.push('', `You judge these; a check of something near each is shown on every run, and blocks nothing (${near.length}):`,
    ...near.map((p) => `  - ${p.statement}\n      shown: ${lookedFor(p)}`));
  if (part.length) out.push('', `Checked in part: the rest is yours to read (${part.length}):`,
    ...part.map((p) => `  - ${p.statement}\n      checked: ${lookedFor(p)}\n      not checked: ${cover(p)?.unchecked ?? ''}${disagrees(p)}`));
  if (judged.length) out.push('', `You judge these yourself (${judged.length}):`, ...judged.map((p) => `  - ${p.statement}`));
  const requiredShown = shown.filter((p) => p.required); const habits = shown.filter((p) => !p.required);
  // One line: what blocks is said to block, and only the rest is called a habit.
  const parts = [...(requiredShown.length ? [`${requiredShown.length} required, since every example meets ${requiredShown.length === 1 ? 'it' : 'them'}, and checked on every run`] : []),
    ...(habits.length ? [`${habits.length} habit${habits.length === 1 ? '' : 's'}, shown and never blocking`] : [])];
  if (parts.length) out.push('', `Also learned from your examples: ${parts.join('; ')} (see them with --report).`);
  return out;
}

/**
 * ONE EXAMPLE, OR A FOLDER OF THEM, AS CASES. From a folder: the pieces a build would serve from it and no others
 * (not a file about the work, not a piece's material, not the method note itself if it is kept there, not a hidden
 * file). Every piece is what a check is held against (core/method/standard.ts, `acrossExamples`), and with three
 * or more they are served with the skill and their lengths recorded, as for a skill built from a folder.
 * A stub in a folder of long pieces (under MIN_GOLDEN_CHARS) is left out and named, as a build with a model leaves it
 * out; where the folder is short-form (by `--class`, or by the pieces' own lengths), every piece is an example.
 */
function readExamples(goldenPath: string, notePath: string): { folder: string | null; cases: GoldenCase[] } {
  const folder = statSync(resolve(goldenPath)).isDirectory() ? resolve(goldenPath) : null;
  const files = folder ? corpusFiles(folder).filter((f) => resolve(f) !== resolve(notePath) && !basename(f).startsWith('.')).sort() : [resolve(goldenPath)];
  if (!files.length) die(`${goldenPath} holds no example that can be read.`);
  const said: string[] = [];
  const read = files.map((f) => ({ file: f, c: readCase(f, (line) => { said.push(folder ? `${basename(f)}: ${line}` : line); }) })).filter((x) => x.c.reference.trim());
  const cases = read.map((x) => x.c);
  for (const line of [...new Set(said)].slice(0, 6)) console.log(line);
  if (!cases.length) die(`${goldenPath} is empty.`);
  if (!folder || shortFormFolder(cases.map((c) => c.reference), flag('--class'))) return { folder, cases };
  const stubs = read.filter((x) => x.c.reference.trim().length < MIN_GOLDEN_CHARS);
  // Never fail on the person's folder: where every piece is that short, every piece is kept.
  if (!stubs.length || stubs.length === read.length) return { folder, cases };
  console.log(`Too short to read as finished work (${MIN_GOLDEN_CHARS}+ characters), left out:`);
  for (const x of stubs) console.log(`  ${basename(x.file)}  (${x.c.reference.trim().length} chars)`);
  return { folder, cases: read.filter((x) => !stubs.includes(x)).map((x) => x.c) };
}

/** `--limit <chars>`, or the limit of the format `--class` names (core/observers/short-form.ts, `shortFormOptions`). */
export function shortFormFlags(cls: string | undefined, given: string | undefined = flag('--limit')): ShortFormOptions {
  const o = shortFormOptions(cls, given);
  return typeof o === 'string' ? die(o) : o;
}

/** The command as it was typed, less some of its words: what to say to do the same thing again. */
function typedWithout(drop: readonly string[]): string {
  const typed = process.argv.slice(2); const at = typed.indexOf('--name');
  return typed.filter((a, i) => !drop.includes(a) && !a.startsWith('--name=') && (at === -1 || (i !== at && i !== at + 1))).map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
}

const GENERIC = new Set(['examples', 'example', 'golden', 'goldens', 'samples', 'sample', 'work', 'pieces', 'docs', 'method', 'methods', 'rules', 'notes', 'how', 'readme', 'guide']);

/**
 * THE NAME A SKILL CARRIES WHEN NONE IS GIVEN. From `atelier new <your-work> --method <note>`: the folder of work,
 * unless it is called what every such folder is called ("examples"); then the note's name, unless it is "method";
 * then the folder the person is standing in. Four skills built from four files called method.md were all "method".
 * `atelier method <note>` names it after the note, as it always has.
 */
export function nameFor(notePath: string, goldenPath: string, viaNew: boolean): string {
  const stem = (p: string): string => basename(resolve(p)).replace(/\.[^.]+$/, '');
  const given = flag('--name');
  const pick = given ?? (viaNew ? [stem(goldenPath), stem(notePath), basename(process.cwd())].find((n) => !GENERIC.has(n.toLowerCase())) ?? stem(notePath) : stem(notePath));
  try { return skillNameFrom(pick); } catch { return die('--name <name> required: neither the work nor the method gives a name a skill can carry.'); }
}

/**
 * THE OWNER'S STEPS AS THEIR OWN, WHAT THE EXAMPLE SHOWS AS APPROVED AND SHOWN. A stated step is the owner's
 * sentence: authored by them, and required where code can hold an output to it. One read off the example is the
 * machine's reading that they approved: a preference until they say otherwise.
 */
export function decideSteps(proposals: readonly MethodProposal[], nextId: () => string, confirmed = false,
  /** each statement's kind as read (core/observers/rule-polarity.ts); a statement not in it is a thing to do */
  kinds: ReadonlyMap<string, 'BOUNDARY' | 'GENERATIVE'> = new Map(),
): { decided: Requirement[]; ledger: RatificationLedger; qualifications: Record<string, CheckQualification> } {
  const bases: Requirement[] = proposals.map((p) => ({
    requirementId: nextId(), statement: p.statement, appliesWhen: 'GENERAL',
    // Whether the step forbids or asks for something is read (core/observers/rule-polarity.ts); unread, it is a thing
    // to do in its own words ("Then a Suggestions section: improvements that do not block the merge" asks for a section).
    kind: kinds.get(p.statement) ?? UNREAD_KIND,
    authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
    // No evidence is carried: how the example fared on a check is said on the screen, and is not the author's words.
    evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
    materiality: null, realizationTolerance: null, outputShape: null,
    // A rule counted off the examples is a rule of style: it carries no obligation of the method, so a sentence
    // that breaks it is rewritten, and the work is not written again for it.
    // (A length is the exception: no sentence carries it, so made required it is met by writing the work again.)
    ...(p.counted && p.measurement?.observer !== 'LENGTH' && p.measurement?.observer !== 'SHAPE' ? {} : { obligation: p.obligation }), ...(p.measurement ? { measurement: p.measurement } : {}),
    // What was read off the examples is worded from its check; a step is the owner's sentence.
    ...(p.origin === 'SHOWN_BY_EXAMPLE' && p.measurement ? { wordedFromCheck: true as const } : {}),
    // A stated step the owner's own work does not do: theirs, checked, and not enforced until they confirm it.
    ...(p.origin === 'STATED' && p.conflict && !confirmed ? { contested: p.conflict } : {}),
    // A check tied to the step by its subject, not by what it asks: kept and shown, and it blocks nothing.
    ...(p.origin === 'STATED' && p.related ? { related: true as const } : {}),
  }));
  let ledger: RatificationLedger = { standardDraftHash: draftHash(bases), records: [] };
  const decided = bases.map((base, i) => {
    // A stated step with a check is required: it is the owner's, and code can hold an output to it. One read off the
    // example is a preference until the owner says otherwise.
    const p = proposals[i];
    // A written check is not enforced until it is qualified on the owner's examples and their mutants (core/method/mutants.ts).
    const enforce = p.measurement && !base.contested && !base.related && !(p.measurement.observer === 'CHECK' && !p.qualification?.qualified);
    const outcome = decide(base, p.origin === 'STATED' ? { verb: 'STATED', ...(enforce ? { materiality: 'REQUIRED' } : {}) } : { verb: 'APPROVE', materiality: p.required ? 'REQUIRED' : 'PREFERRED' });
    ledger = appendDecision(ledger, base, outcome.ledgerDecision, { decidedAt: new Date().toISOString() });
    return outcome.requirement;
  });
  // WHAT EACH WRITTEN CHECK EARNED, by the id its rule now carries: kept beside the standard, outside its hash.
  const qualifications = Object.fromEntries(decided.flatMap((r, i) => { const q = proposals[i].qualification; return q && r.measurement?.observer === 'CHECK' ? [[r.requirementId, q]] : []; }));
  return { decided, ledger, qualifications };
}

export async function method(): Promise<void> {
  resetStages();
  // `atelier new <your-work> --method <note>` and `atelier method <note> --golden <your-work>` are one command; and
  // `atelier new <your-work>` with no note (--no-model, or no model set up) is the same one with no stated step:
  // the skill is what the examples show, counted, and the pieces themselves.
  const asNew = flag('--method'); const examplesOnly = !asNew && process.argv[2] === 'new';
  const notePath = asNew ?? (examplesOnly ? null : positional([])) ?? (examplesOnly ? null : die('usage: atelier method <method note> --golden <finished example, or a folder of them> [--name <name>] [--yes]\n  The note says what is done (steps, a template, both). An example is one piece of work where it was done.'));
  const goldenPath = flag('--golden') ?? (asNew ? positional([asNew]) : examplesOnly ? positional([]) : undefined) ?? die(examplesOnly ? 'usage: atelier new <your finished work: a file, or a folder of pieces> [--method <how-you-do-it.md>]' : '--golden <file or folder> required: one finished example of the method carried out, or a folder of them.');
  for (const [what, p] of [['the method note', notePath], ['the example', goldenPath]] as const) if (p !== null && !existsSync(p)) die(`${what}: there is nothing at ${p}.`);
  const note = notePath === null ? '' : readFileSync(notePath, 'utf8');
  if (notePath !== null && !stepsOf(note).length) die(`${notePath} holds no step that can be read: a list item, or a sentence of three words or more, is a step.`);
  // The name as the skill will carry it, and whether it can be built here: settled before a screen is shown, so that a
  // refusal is the first thing said and not the last.
  const name = nameFor(notePath ?? goldenPath, goldenPath, Boolean(asNew) || examplesOnly);
  let s = loadSession();
  // A SKILL OF THAT NAME BUILT SOMEWHERE ELSE IS SOMEBODY'S STANDARD. Built again here it would be replaced without a
  // word: two people whose method file is called method.md would each overwrite the other's skill.
  // (Looking builds nothing, so `--review` is never refused: it shows what would be built.)
  const looking = argv.includes('--review');
  // A BUILD THAT STOPPED HALF-WAY left the name in this folder's session before anything was stored (below). That
  // makes the skill this folder's only where it already was, or where what is stored under the name now is the
  // standard this very build closed: a name that was free then and was built meanwhile by someone else is theirs.
  const LN = { root: DATA, skillName: name }; const activeNow = store.getActive(LN);
  const stored = activeNow ? store.getSkillVersion(LN, activeNow)?.standardVersionHash ?? null : null;
  const mine = s.skillName === name && (s.claim === undefined || s.claim.owned || (stored !== null && stored === s.run.standardVersionHash));
  if (!looking && activeNow && !mine) {
    die(`a skill called "${name}" already exists, and this folder did not build it. Give this one a name of its own: --name <name>.`);
  }
  // ONE PROJECT, ONE STANDARD. A folder that holds another skill's rules would have these added to them. The same
  // skill built again from a method is a new version of it: the earlier run is set aside, kept, and this one starts.
  // A FOLDER PART-WAY THROUGH A RUN THAT READS THE EXAMPLES WITH A MODEL is that run's: building over it here left
  // its state half one thing and half another. Said before anything is written.
  if (!looking && s.evidence && s.run.state !== 'BUILT') die(`this folder is part-way through reading your examples with a model (state ${s.run.state}). Finish that: atelier new ${goldenPath} "<what the skill is for>"; or start over: atelier lab abort. Or build this one from a folder of its own.`);
  const holds = s.decided.length > 0 || s.proposals.length > 0 || Boolean(s.run.standardVersionHash);
  const again = holds && s.skillName === name && s.proposals.length === 0;
  if (!looking && holds && !again) die(`this folder already holds another standard${s.skillName ? ` (the skill "${s.skillName}")` : ''}. Build this one from a folder of its own.`);
  const { folder, cases } = readExamples(goldenPath, notePath ?? '');
  // The grammar engine, before the examples are read: their vocabulary and dialect are read off them by it.
  await ensureGrammar();
  // WHAT EACH STATED STEP IS, READ ONCE (core/observers/rule-polarity.ts): a prohibition or a thing to do. Read first, so
  // the check reading can be held against it: a prohibition is never given a check that requires what it forbids.
  // Frozen with each step's check (core/method/freeze.ts): a step whose words and examples are unchanged is not read again.
  const frozenNow = store.getFrozenChecks(LN); const rejected = rejectedOutputs(LN);
  const kindsKept = frozenKinds(stepsOf(note), examplesKey(cases), frozenNow, rejected);
  const stepKindsRead = await stepKinds(stepsOf(note).map((st) => st.text), kindsKept);
  // WHICH CHECK EACH STATED STEP CARRIES, READ ONCE (core/method/step-check.ts): a measurement from the menu, a check the
  // model writes, or judgement; grounded on the owner's examples by code. With no model every step is a judgement.
  const planSteps = stepsOf(note).map((st, i) => ({ id: String(i + 1), text: st.text, under: st.under }));
  const checksPlan = await stepPlan(planSteps, cases, stepKindsRead, { frozen: frozenNow, rejected });
  const across = proposalsAcross(note, cases, checksPlan);
  // A WRITTEN CHECK EARNS ITS SAY (core/method/mutants.ts): it must pass every example and catch the edits that break
  // only its step; until then it is kept, shown with what it caught, and enforced nowhere. Its standing is said beside it.
  const read = { ...across, proposals: across.proposals.map((p) => (p.qualification ? { ...p, onExample: describeQualification(p.qualification) } : p)) };
  const lead = read.lead;
  // What the pieces show about how they are written, counted: offered beside the method, with no model.
  // WITH NO METHOD, THE ONE THING ASKED IS "LIKE THESE". It is said as the skill's one rule, which no count reads and
  // the owner judges: a skill of examples alone still has a standard, and says honestly what it is.
  const likeThese: MethodProposal[] = notePath === null ? [{ statement: `New work reads like the ${cases.length === 1 ? 'example' : `${cases.length} examples`} given: the same kind of piece, at their length, in their manner.`,
    origin: 'SHOWN_BY_EXAMPLE', obligation: 'JUDGEMENT', measurement: null, onExample: null, conflict: null }] : [];
  // THE PLATFORM'S FACTS FOR SHORT PIECES, never assumed: a character limit from `--limit`, or from the format the class
  // names (a LinkedIn post: 3,000), and how that format counts a link. Said on the screen, with what a small corpus can and
  // cannot yet require (core/observers/short-form.ts).
  const shortForm = shortFormFlags(flag('--class'));
  const short = shortFormOffers(cases, shortForm);
  const counted = countedOffers(read.proposals, cases, shortForm);
  const proposals = [...likeThese, ...read.proposals, ...counted, ...tellOffers(cases, note), ...grammarOffer(cases, [...read.proposals, ...counted])];
  const example = cases[lead];
  const whole = argv.includes('--report');
  console.log(`${notePath === null ? 'No method note: built from your examples' : `Method: ${basename(notePath)}`}  ·  ${cases.length === 1 ? `example: ${example.id}` : `${cases.length} examples from ${basename(goldenPath)}`}${whole && cases.length > 1 ? `; checks read from ${example.id}, then held against the rest` : ''}${whole && example.material.length ? ` with ${example.material.length} file(s) of material` : ''}\n`);
  // VOICES READ IN THE WRITING ARE SAID, AND BUILT AS ONE unless asked (cli/commands/new.ts says the same on its path).
  const voices = notePath === null && folder && cases.length > 1 ? authorship(cases.map((c) => ({ id: c.id, text: c.reference }))).voices : null;
  if (voices && voices.groups.length > 1) console.log(`${voices.groups.length} voices read in how the pieces are written (${voices.groups.map((g) => `${g.pieces.length} piece(s)`).join(', ')}): built as one voice, which is what pointing at one folder asks for.\n  To build the combination of them, each read on its own:  atelier new ${goldenPath} --voices\n`);
  for (const line of whole ? describeMethod(proposals, example.caseClass) : shortScreen(proposals)) console.log(line);
  // The limits of a corpus of short pieces: one line on the screen, the whole account with --report.
  if (short.brief) { console.log(''); for (const line of whole ? short.limits : [short.brief]) console.log(`Short form: ${line}`); }

  // `--review` looks and builds nothing. Otherwise the skill is built from exactly what the screen showed: a reading
  // the owner did not mean is corrected by changing the method and building again, which is one command.
  if (looking) { console.log(`\nNothing has been built. To build exactly this: atelier ${typedWithout(['--review'])} --name ${name}`); return; }
  // A RULE THE OWNER STATED AND THEIR OWN WORK DOES NOT FOLLOW NEVER STOPS A BUILD AND IS NEVER DROPPED. The skill is
  // built with it: checked and shown on every run, blocking nothing until they confirm it (--yes) or change the
  // method. A mismatch between a method and its examples is the ordinary state of someone's working notes.
  const disputed = proposals.filter((p) => p.origin === 'STATED' && p.conflict); const confirmed = argv.includes('--yes');
  // THE SAME SKILL BUILT AGAIN IS A NEW SET OF DECISIONS, NEVER ADDED TO THE LAST ONE'S. The run set aside may come back
  // (a project copied with its store takes a copy of the run that built the skill: cli/runtime.ts, `adoptMovedRun`); its
  // decisions and their standing are the previous version's, and the steps are decided again below, every one of them.
  if (again) { archiveSession(); s = { ...loadSession(), proposals: [], decided: [], qualifications: {} }; }

  // ── THE OWNER'S STEPS AS THEIR OWN, WHAT THE EXAMPLE SHOWS AS APPROVED AND SHOWN ──────
  // WHAT EACH STEP IS, READ ONCE: a prohibition or a thing to do. The reader sees every step in one call; without a
  // model (none set up, or --no-model) the word pattern decides, and the whole account says so.
  const kinds = await stepKinds([...likeThese, ...read.proposals].map((p) => p.statement), stepKindsRead);
  // WHAT EACH STATED STEP ASKS THE WRITER TO DECIDE, read once (core/method/decision-units.ts): kind, decision, inputs,
  // condition in the step's own words, output, exception, dependencies. Said in the whole account; the brief for one
  // request selects by it. With no model the words decide: an instruction, applying always unless they say when.
  const units = await decisionUnits(read.proposals.filter((p) => p.origin === 'STATED'), stepsOf(note));
  if (whole && units.size) { console.log('\nWhat each step asks the writer to decide:'); let i = 0; for (const [statement, u] of units) console.log(`  ${++i}. ${statement.slice(0, 90)}\n      ${describeUnit(u)}`); }
  const { decided, ledger, qualifications } = decideSteps(proposals, authoredIdAllocator(s), confirmed, kinds);
  // WHOSE BUILD THIS IS, WRITTEN BEFORE ANYTHING ELSE IS. A build that stops after the standard is stored and before
  // the skill is installed leaves a skill of this name behind: with the name kept here, the same command run again
  // knows the skill as this folder's and finishes it. Without it, the person was told somebody else had built it.
  s = { ...s, skillName: name, claim: { owned: Boolean(activeNow) }, decided: [...s.decided, ...decided], ledger, qualifications: { ...s.qualifications, ...qualifications }, ...(folder ? { source: folder } : {}) };
  saveSession(s);

  // The finished example is installed with the skill as the one worked example: what good looks like, for a writer
  // that has the method beside it. Its own task and material are not part of it.
  const exampleFile = runFile(`method-example-${sha(example.reference)}.md`);
  // With the request it answered, when the example carried one: served beside it (renderers/agent-skill/render.ts).
  writeAtomic(exampleFile, `${example.task ? `---\nrequest: |\n${example.task.split('\n').map((l) => `  ${l}`).join('\n')}\n---\n` : ''}${withoutFrontMatter(example.reference)}`);
  process.env.ATELIER_ORCHESTRATED = '1';
  // EVERY STEP IS THE OWNER'S AND EVERY CHECK IS CODE; HOW THE AUTHOR SOUNDS IS STILL READ. Nothing about the method
  // needs a model, and this build asked for none, so a skill built this way carried no persona and no scope reading, and
  // its log never said so. Three skills built this way scored last on "sounds like the author" in the three-context
  // study, while every skill that tied or won had a persona (core/compiler/persona.ts: rules do not make a model sound
  // like the author, a description does). The rules still need held-out pieces to be checked on; a description steers
  // and never blocks, so it needs none. With a model set up, the build reads the persona, and the scope for work that
  // answers; without one it is as it was. The pieces are served whole either way: the model reads them, it never
  // chooses which are shown (cli/commands/build.ts, `WHOLE_PIECES`).
  if (!canReach('discovery') || argv.includes('--no-model')) process.env.ATELIER_BUILD_NO_MODEL = '1';
  process.env.ATELIER_BUILD_WHOLE_PIECES = '1';
  if (!argv.includes('--work-type')) argv.push('--work-type', flag('--for') ?? name.replace(/-/g, ' '));
  if (!argv.includes('--exemplar')) argv.push('--exemplar', exampleFile);
  // HOW A HOST KNOWS WHEN TO LOAD IT: the owner's own description when their method carries one, else what the skill is
  // for and the method's first line. "Applies a compiled standard" told a host nothing, and the skill was rarely loaded.
  // The owner's own always; one made from the purpose only on a first build, never over a description set since.
  if (!argv.includes('--description') && (/^description:/m.test(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(note)?.[1] ?? '') || !activeNow)) {
    const d = describeFrom(note, flag('--for') ?? null, name); if (d) argv.push('--description', d);
  }
  // The method itself is served whole with the skill: what the steps above decide is what is checked, never what the
  // writer is told.
  if (notePath !== null && !argv.includes('--method-text')) {
    const methodFile = runFile(`method-note-${sha(note)}.md`);
    writeAtomic(methodFile, note);
    argv.push('--method-text', methodFile);
  }
  // Three pieces or more are served with the skill, as its own way of writing, and their lengths recorded; with
  // fewer there is no telling a usual piece from an odd one, and the one worked example stands alone.
  if (!argv.includes('--voice') && !(folder && cases.length >= 2)) argv.push('--voice', 'none');
  // (Nothing names the kind of work from its words: a note titled "Contract" is not thereby held as one. How strictly
  // the work is held is the latitude's, read from the examples and ratified by the owner; --class names a format.)
  // THE BUILD SAYS A GREAT DEAL (the standard's hash, the size of the export, what no instrument measures): all of it
  // true, none of it what a person needs to start. It is kept for --report, and shown whole if the build fails.
  // THE AUTHOR'S RANGE ON THIS PATH TOO (core/fidelity/profile.ts). A skill built from a method and pieces had no
  // profile: no band of the author's own features, nothing to choose a draft by or to read an output against, no
  // release to steer, while a skill from discovery had all of it. The bands need the pieces alone; the detector and the
  // signals need the model's drafts, which this path never writes, so every band is monitored and none steers until a
  // discovery or `atelier fidelity` adds them. Written here and installed by build under the pieces' own hash, as a
  // discovery's is under the sealed corpus's; fewer pieces than a band can be read from leaves none, and the build says.
  // Discovery's other artefacts (signals, retrieval, typicality) belong to the profile discovery wrote them beside, never to
  // this one: anything another build left in the run folder is cleared, as discovery clears it before writing its own.
  for (const f of ['fidelity.json', 'signals.json', 'retrieval.json', 'typicality.json']) rmSync(runFile(f), { force: true });
  const pieces = folder ? sessionCorpus().map(withoutFrontMatter) : [];
  if (pieces.length >= SELECTION.minRead) {
    writeAtomic(runFile('fidelity.json'), JSON.stringify(buildProfile({ read: pieces.map((text, i) => ({ id: `piece-${i + 1}`, text })), held: [], model: [], corpusHash: corpusHashOf(pieces) })));
  }
  // HOW STRICTLY OUTPUT IS HELD, read from the examples, the method and what it is for (cli/latitude.ts); minted at the close.
  await settleLatitude({ purpose: flag('--for') ?? null, method: notePath === null ? null : note, examples: cases.map((c) => c.reference) });
  const said: string[] = []; const log = console.log;
  if (!whole) console.log = (...a: unknown[]) => { said.push(a.map(String).join(' ')); };
  try { ratifyClose(); await build(name); } catch (e) { console.log = log; for (const l of said) console.log(l); throw e; } finally { console.log = log; }
  // THE CHECKS THIS BUILD RATIFIED ARE FROZEN (core/method/freeze.ts): the next build keeps each while its step and the
  // examples are unchanged.
  if (checksPlan) store.putFrozenChecks(LN, toFreeze(planSteps, Object.fromEntries(planSteps.flatMap((st) => { const c = checksPlan.get(st.text); return c ? [[st.id, c]] : []; })), examplesKey(cases), stepKindsRead.byModel, rejected));
  // THE UNITS, BESIDE THE STANDARD THEY WERE READ FROM, never inside it: keyed by requirement id under the standard's
  // hash, so a reading moves no standard and a rebuild under the same standard finds them (core/state/store.ts).
  if (units.size) {
    const built = store.getActive(LN); const sv = built ? store.getSkillVersion(LN, built) : null;
    if (sv) store.putUnits(LN, sv.standardVersionHash, Object.fromEntries(decided.flatMap((q) => { const u = units.get(q.statement); return u ? [[q.requirementId, u]] : []; })));
  }
  // HOW THE AUTHOR WAS READ IS SAID ON THE SHORT SCREEN TOO. The persona and the scope carry the author's voice, and a
  // build without them was indistinguishable, on this screen, from one with them. One line each, in the build's own
  // words, when a model was there to read: what it read, or why it read nothing. With no model set up the screen stays
  // as it was (`atelier new` has said so once already), and what the owner asked for (--persona none) is not said back.
  // Everything the build said is in --report.
  if (!whole) for (const l of said.filter((x) => /^(Latitude: |Work form: |Persona: |Scope: |\(no persona: \d|\(the persona could not be derived|\(the examples could not be read for scope|\(a fidelity profile in this project)/.test(x))) console.log(l);
  // Required is what a run is held to. What the example showed is checked and reported, and fails nothing: said apart,
  // so that the count of what is enforced is never larger than it is.
  // The screen above already said what is checked and what is theirs: all that is left to say is that it is ready.
  const plan = planFor({ requirements: decided }); const against = plan.readsMaterial;
  // What the skill will do with each rule, for whoever asks for the whole account.
  if (whole) { console.log('\nWhat a run does with each rule:'); for (const l of describePlan(plan)) console.log(l); }
  console.log(`\nYour skill "${name}" is ready.`);
  if (disputed.length && !confirmed) console.log(`  ${disputed.length} of your steps ${disputed.length === 1 ? 'is' : 'are'} not what your own examples do (marked ! above). ${disputed.length === 1 ? 'It is' : 'They are'} checked and shown on every run, and block${disputed.length === 1 ? 's' : ''} nothing until you say so:\n    keep ${disputed.length === 1 ? 'it' : 'them'} as written: atelier ${typedWithout(['--yes'])} --name ${name} --yes   ·   or change the method and build again`);
  console.log(`  Use it: atelier run "<the task>"${against ? ' --with <file>' : ''}   (or /${name} in Claude Code)`);
}

/**
 * THE DESCRIPTION A HOST READS TO DECIDE WHEN TO LOAD THE SKILL. The owner's own (`description:` in the method's front
 * matter) when there is one; else "Use when asked to <purpose>." with the method's first sentence of prose, which is
 * the method saying what it is for. Null when there is neither.
 */
export function describeFrom(note: string, purpose: string | null, name: string): string | null {
  const fm = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(note);
  // A block scalar (`description: >` or `|`) runs over the indented lines under it.
  const block = fm ? /^description:\s*[|>][+-]?\s*\n((?:[ \t]+\S[^\n]*\n?)+)/m.exec(fm[1])?.[1] : undefined;
  const line = fm ? /^description:\s*(.+)$/m.exec(fm[1])?.[1]?.trim() : undefined;
  const own = block ? block.split('\n').map((l) => l.trim()).join(' ').trim()
    : line && !/^[|>][+-]?$/.test(line) ? (/^"[\s\S]*"$/.test(line) ? line.slice(1, -1).replace(/\\(["\\])/g, '$1') : line.replace(/^'([\s\S]*)'$/, '$1')) : undefined;
  if (own) return own.replace(/\s+/g, ' ').slice(0, 1000);
  const body = note.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const first = body.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).find((p) => p && !/^(?:#|[-*+]\s|\d+[.)]\s|\||```|>)/.test(p));
  const sentence = first ? (/^[\s\S]*?[.!?](?=\s|$)/.exec(first.replace(/\s+/g, ' '))?.[0] ?? first.replace(/\s+/g, ' ')).slice(0, 300) : '';
  const what = purpose?.trim() ? purpose.trim() : name.replace(/-/g, ' ');
  return `Use when asked to ${what.replace(/[.\s]+$/, '')}.${sentence ? ` ${sentence}` : ''}`;
}

/** The decision unit of every stated step, read in one call where a model is set up (core/method/decision-units.ts); the words alone where none is. */
async function decisionUnits(stated: readonly MethodProposal[], steps: readonly { text: string; under: string | null }[]): Promise<Map<string, DecisionUnit>> {
  const unique = [...new Set(stated.map((p) => p.statement.trim()).filter(Boolean))];
  if (!unique.length) return new Map();
  const under = new Map(steps.map((st) => [st.text.trim(), st.under]));
  const input = { steps: unique.map((text, i) => ({ id: String(i + 1), text, under: under.get(text) ?? null })) };
  const noModel = !canReach('discovery') || argv.includes('--no-model');
  const d = await readContext(METHOD_UNITS, input, noModel ? null : contextReaderClient(), noModel ? null : contextReaderModel(), { spentUsd: 0, capUsd: 0.2, maxCalls: 1 });
  if (argv.includes('--report')) console.log(`(what each step asks the writer to decide: ${d.by === 'model' ? `read by ${contextReaderModel()}` : d.by === 'code' ? 'nothing to read' : `by the words alone (${d.why})`}.)`);
  return new Map(input.steps.map((st) => [st.text, d.value[st.id] ?? unitFloor(st)]));
}

/**
 * How many times the step-check reading is drawn on a build with a model. One draw varies: the same four examples read
 * 7, 5 and 7 of 8 steps as checked in three builds, and a check that passed 9 of 10 examples in one build passed none
 * in the next. So the reading is drawn CHECK_DRAWS times and code keeps what the draws agree on: a listed measurement
 * given by a majority of draws, or the written check that qualifies best on the owner's mutants (core/method/mutants.ts).
 * A draw count, as drafts are: not a reading of its own. With no model there is one draw, and it is the floor.
 */
export const CHECK_DRAWS = 3;

/**
 * THE CHECK EACH STATED STEP CARRIES (core/method/step-check.ts), read CHECK_DRAWS times where a model is set up and
 * decided by code: a qualified written check first, then a measurement a majority of draws named, then a written check
 * that reports only, then judgement. Every written candidate is grounded on the owner's examples, sent back once when
 * it did not compile, held to the mutants of its step (one mutant reading per step, shared by its candidates), and the
 * best unqualified one sent back up to twice with the examples it fails. Judgement for every step where no model is.
 * Shared by `atelier new --method` (steps from the note, with examples) and `atelier skill` (rules stated, no example).
 */
export async function stepPlan(all: readonly StepToCheck[], cases: readonly ExampleCase[], kinds: ReadonlyMap<string, 'BOUNDARY' | 'GENERATIVE'>,
  opts: { readonly frozen?: Readonly<Record<string, StepCheck>>; readonly rejected?: ReadonlyMap<string, readonly string[]> } = {}): Promise<StepPlan | null> {
  if (!all.length) return null;
  // A CHECK FROZEN AT A BUILD IS KEPT while its step's words and the examples are unchanged (core/method/freeze.ts): only
  // the other steps are read, and drawn best of three. Rewording one step reads that step again and no other.
  const exKey = examplesKey(cases);
  const kept = frozenFor(all, exKey, opts.frozen ?? {}, opts.rejected);
  const steps = all.filter((st) => !kept.has(st.id));
  if (!steps.length) {
    if (argv.includes('--report')) console.log(`(which check each step asks for: every one kept from the build that ratified it; nothing read.)`);
    return planOf(all, Object.fromEntries(kept));
  }
  const input = stepCheckInput(steps, cases, outlineOf, countWords);
  const noModel = !canReach('discovery') || argv.includes('--no-model');
  const k = noModel ? 1 : CHECK_DRAWS;
  const client = noModel ? null : contextReaderClient(); const model = noModel ? null : contextReaderModel();
  const draws = await Promise.all(Array.from({ length: k }, () => readContext(STEP_CHECK, input, client, model, { spentUsd: 0, capUsd: 0.3, maxCalls: 1 })));
  const lead = input.example;
  const context = (c: ExampleCase): { request?: string; material: readonly { name: string; text: string }[] } => ({ ...(c.task ? { request: c.task } : {}), material: c.material });
  const examples = cases.map((c) => ({ text: c.reference, context: context(c) }));
  const leadCase = cases.find((c) => c.reference.slice(0, 6000) === lead.head) ?? cases[0];
  // EVERY DRAW'S ANSWER FOR EACH STEP, grounded: a written check that did not compile is sent back once with the problem;
  // then the two readings are held against each other (a prohibition keeps no check that requires what it forbids).
  const candidates = new Map<string, StepCheck[]>();
  for (const st of steps) {
    const list: StepCheck[] = [];
    for (const d of draws) {
      let c: StepCheck = d.value[st.id] ?? judgement(st, 'floor');
      if (c.attempt && !noModel) {
        const r = await readContext(STEP_CHECK_REPAIR, { step: st, means: c.means, source: c.attempt.source, problem: c.attempt.problem, example: lead.head, material: input.material }, client, model, { spentUsd: 0, capUsd: 0.1, maxCalls: 1 });
        if (r.value.source) c = { how: 'written', measurement: { observer: 'CHECK', params: { source: r.value.source.split('\n'), means: [c.means.replace(/^the written check could not be compiled.*$/, st.text.slice(0, 120))] } }, quote: c.quote, means: st.text.slice(0, 120), by: 'model' };
      }
      list.push(heldByPolarity(c, st, kinds.get(st.text)));
    }
    candidates.set(st.id, list);
  }
  // THE MUTANTS OF EVERY STEP WITH A WRITTEN CANDIDATE, one reading per step (asked for several at once, the reader
  // wrote edits for the first and stopped): what a written check must catch, and what the other steps' checks must not.
  const writtenSteps = steps.filter((st) => cases.length && (candidates.get(st.id) ?? []).some((c) => c.how === 'written'));
  const mutantSteps = writtenSteps.map((st) => ({ id: st.id, text: st.text, means: (candidates.get(st.id) ?? []).find((c) => c.how === 'written')?.means ?? st.text }));
  const mutants = await Promise.all(mutantSteps.map((ms) => readContext(STEP_MUTANTS, { steps: [ms], example: leadCase?.reference ?? '' }, client, model, { spentUsd: 0, capUsd: 0.2, maxCalls: 1 })));
  // OUTPUTS THE OWNER REJECTED NAMING THIS STEP (`atelier rate <run> no --rule <id>`) are edits that break it, beside the
  // mutants a model wrote: a written check must catch them too to qualify.
  const rejectedOf = (st: StepToCheck): { text: string; context: ReturnType<typeof context> }[] => (opts.rejected?.get(st.text) ?? []).map((text) => ({ text, context: { material: [] } }));
  const mutantsOf = (id: string): { text: string; context: ReturnType<typeof context> }[] => {
    const at = mutantSteps.findIndex((ms) => ms.id === id);
    const st = steps.find((x) => x.id === id);
    const written = at === -1 || !leadCase ? [] : (mutants[at].value[id] ?? []).map((m) => ({ text: mutate(leadCase.reference, m), context: context(leadCase) }));
    return [...written, ...(st ? rejectedOf(st) : [])];
  };
  if (argv.includes('--report') && mutantSteps.length) console.log(`(edits that break each written check's step: ${mutants.some((r) => r.by === 'model') ? `written by ${contextReaderModel()}: ${mutantSteps.map((ms, i) => `${ms.id}: ${(mutants[i].value[ms.id] ?? []).length}`).join(', ')}` : `none (${mutants[0]?.why ?? 'nothing to read'})`}.)`);
  // WHAT EACH STEP KEEPS, decided by code over the draws.
  const chosen: Record<string, StepCheck> = {};
  for (const st of steps) {
    const list = candidates.get(st.id) ?? [];
    const key = (c: StepCheck): string => JSON.stringify(c.measurement);
    const own = mutantsOf(st.id); const others = writtenSteps.filter((o) => o.id !== st.id).flatMap((o) => mutantsOf(o.id));
    // every distinct written candidate, qualified; the best unqualified one sent back with the examples it fails
    const written = [...new Map(list.flatMap((c) => (c.how === 'written' && c.measurement ? [[key(c), { c, m: c.measurement }] as const] : []))).values()];
    const score = (q: CheckQualification): number => (q.qualified ? 1000 : 0) + q.examples.passed * 10 + q.own.caught - q.cross.fired * 5;
    let qualified = written.map(({ c, m }) => ({ c, m, q: cases.length ? qualifyCheck(m, examples, own, others) : null }));
    const repairable = qualified.flatMap((x) => (x.q && !x.q.qualified && x.q.examples.passed < x.q.examples.read ? [{ c: x.c, m: x.m, q: x.q }] : []));
    const best = repairable.sort((a, b) => score(b.q) - score(a.q))[0];
    if (best && !noModel) {
      let m = best.m; let q = best.q;
      for (let round = 0; round < 2 && !q.qualified && q.examples.passed < q.examples.read; round++) {
        const failing = examples.map((x, i) => ({ x, i, r: measure(x.text, m, x.context) })).filter((y) => y.r.verdict === 'VIOLATED');
        if (!failing.length) break;
        const problem = `fails ${failing.length} of the ${examples.length} finished examples, which all hold the step. ${failing.slice(0, 2).map((y) => `On ${cases[y.i]?.id ?? y.i + 1} the check said "${y.r.detail}"`).join('; ')}. The check reads something other than the step, or reads the example wrongly: fix the check, not the example.`;
        const r = await readContext(STEP_CHECK_REPAIR, { step: st, means: best.c.means, source: Array.isArray(m.params.source) ? m.params.source.join('\n') : '', problem, example: failing[0].x.text, material: failing[0].x.context.material }, client, model, { spentUsd: 0, capUsd: 0.1, maxCalls: 1 });
        if (!r.value.source) break;
        m = { ...m, params: { ...m.params, source: r.value.source.split('\n') } }; q = qualifyCheck(m, examples, own, others);
      }
      const repaired = { c: { ...best.c, measurement: m }, m, q };
      qualified = qualified.map((x) => (x.c === best.c ? repaired : x));
    }
    const agreed = (c: StepCheck): { of: number; same: number } => ({ of: k, same: list.filter((x) => x.how === c.how && (c.how === 'judgement' || key(x) === key(c))).length });
    const bestWritten = [...qualified].sort((a, b) => score(b.q ?? { qualified: false, examples: { passed: 0, read: 0, of: 0 }, own: { caught: 0, of: 0 }, cross: { fired: 0, of: 0 }, why: null }) - score(a.q ?? { qualified: false, examples: { passed: 0, read: 0, of: 0 }, own: { caught: 0, of: 0 }, cross: { fired: 0, of: 0 }, why: null }))[0];
    // a listed measurement a majority of draws named (with one draw, any)
    const groups = new Map<string, StepCheck[]>();
    for (const c of list.filter((x) => x.how === 'measure')) { const g = groups.get(key(c)) ?? []; g.push(c); groups.set(key(c), g); }
    const majority = [...groups.values()].filter((g) => g.length >= Math.ceil(k / 2)).sort((a, b) => b.length - a.length)[0]?.[0];
    const pick: StepCheck = bestWritten?.q?.qualified ? { ...bestWritten.c, qualification: bestWritten.q }
      : majority ?? (bestWritten ? { ...bestWritten.c, ...(bestWritten.q ? { qualification: bestWritten.q } : {}) }
        : list.find((c) => c.how === 'judgement' && c.by === 'model') ?? list[0] ?? judgement(st, 'floor'));
    chosen[st.id] = { ...pick, agreed: agreed(pick) };
  }
  if (argv.includes('--report')) {
    const d = draws[0];
    console.log(`(which check each step asks for: ${d.by === 'model' ? `read ${k} time${k === 1 ? '' : 's'} by ${contextReaderModel()}, the draws' agreement kept` : d.by === 'code' ? 'nothing to read' : `none read, every step is yours to judge (${d.why})`}.)`);
    // each step's reading, with the reason where it fell to judgement: what the reader said is the owner's to see
    for (const st of steps) { const c = chosen[st.id]; console.log(`   ${st.id}. ${c.how}${c.by === 'floor' && c.how === 'judgement' ? ` (${c.means})` : c.how === 'judgement' ? ` (the reader: ${c.means.slice(0, 120)})` : `: ${c.means.slice(0, 120)}`}${c.agreed && k > 1 ? ` [${c.agreed.same} of ${c.agreed.of} draws]` : ''}${c.qualification ? `; ${describeQualification(c.qualification)}` : ''}`); }
  }
  if (argv.includes('--report') && kept.size) console.log(`(${kept.size} step check${kept.size === 1 ? '' : 's'} kept from the build that ratified ${kept.size === 1 ? 'it' : 'them'}: the step and the examples are unchanged.)`);
  return planOf(all, { ...Object.fromEntries(kept), ...chosen });
}

/**
 * THE OUTPUTS THE OWNER REJECTED, BY THE STEP THEY SAID EACH BREAKS: a run rated no with `--rule <id>`, and an answer
 * drafted for them and rejected the same way (`atelier rate d3 no --rule <id>`). Keyed by the step's words, as the
 * standard it was rated under had them. A rejection that names no rule breaks no step anyone can name, and is not used.
 */
export function rejectedOutputs(L: store.StoreLayout): Map<string, string[]> {
  const active = store.getActive(L); const sv = active ? store.getSkillVersion(L, active) : null;
  const std = sv ? store.getStandard(L, sv.standardVersionHash) : null;
  const out = new Map<string, string[]>();
  // The rule's words as recorded when it was rated (`atelier rate`); a rating recorded before they were is read by its id.
  const add = (rule: string | null | undefined, words: string | null | undefined, text: string | null | undefined): void => {
    const statement = words ?? (rule ? std?.requirements.find((q) => q.requirementId === rule)?.statement : undefined);
    if (statement && text?.trim()) out.set(statement, [...(out.get(statement) ?? []), text]);
  };
  const runs = new Map(store.listLearningInvocations(L).map((x) => [x.invocationId, x]));
  for (const rating of latestRatings(L)) if (!rating.ship) add(rating.rule, rating.ruleStatement, runs.get(rating.invocationId)?.output);
  for (const d of store.getDrafted(L)) if (d.kept === false) add(d.rule, d.ruleStatement, d.answer);
  return out;
}

/**
 * The kind of every step the owner wrote or their example showed, read in one call where a model is set up; a thing to do
 * where none is, said in --report. `byModel` is what a model read now, with `known` (kept from a build where one did): what may be frozen.
 */
async function stepKinds(statements: readonly string[], known: ReadonlyMap<string, 'BOUNDARY' | 'GENERATIVE'> = new Map()): Promise<Map<string, 'BOUNDARY' | 'GENERATIVE'> & { byModel: Map<string, 'BOUNDARY' | 'GENERATIVE'> }> {
  const unique = [...new Set(statements.map((t) => t.trim()).filter(Boolean))].filter((t) => !known.has(t));
  const input = { statements: unique.map((text, i) => ({ id: `r${i + 1}`, text })) };
  const noModel = !canReach('discovery') || argv.includes('--no-model');
  const d = await readContext(RULE_POLARITY, input, noModel ? null : contextReaderClient(), noModel ? null : contextReaderModel(), { spentUsd: 0, capUsd: 0.1, maxCalls: 1 });
  if (argv.includes('--report') && unique.length) console.log(`(what each step is, a prohibition or a thing to do: ${d.by === 'model' ? `read by ${contextReaderModel()}` : d.by === 'code' ? 'nothing to read' : `not read, each taken as a thing to do (${d.why})`}.)`);
  const read = input.statements.map((s): [string, 'BOUNDARY' | 'GENERATIVE'] => [s.text, d.value[s.id] ?? UNREAD_KIND]);
  const byModel = new Map([...known, ...(d.by === 'model' ? read : [])]);
  return Object.assign(new Map([...known, ...read]), { byModel });
}
