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
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { DATA, argv, die, flag, positional, loadSession, saveSession, archiveSession, authoredIdAllocator, runFile, sha } from '../runtime.js';
import * as store from '../../core/state/store.js';
import { normalizeClass, CLASS_ALIASES } from '../../core/observers/doc-class.js';
import { unmeasuredKind } from '../../core/loop/claim-extract.js';
import { skillNameFrom } from '../../renderers/agent-skill/render.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { draftHash, appendDecision, type RatificationLedger } from '../../core/ratification/decision-record.js';
import { decide } from '../../core/ratification/authority.js';
import type { Requirement } from '../../core/state/canonical-state.js';
import type { GoldenCase } from '../../core/golden/case.js';
import { proposalsAcross, countedOffers, tellOffers, stepsOf, shortFormOffers, type MethodProposal, type ShortFormOptions } from '../../core/method/standard.js';
import { formatOf } from '../../core/observers/formats.js';
import { readCase, corpusFiles } from '../corpus.js';
import { observesOf, propositionOf, type Observes } from '../../core/eval/observes.js';
import { planFor, describePlan } from '../../core/plan/execution-plan.js';
import { ratifyClose } from './ratify.js';
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
  block('Checked against the material: what the work must be made from', of('EXECUTION'), (p) => `${p.measurement?.observer === 'LINES' ? 'checks for: every path:line cited is a line of the material with something on it (for a diff, a line the change adds); ' : ''}your example: ${p.onExample ?? 'held'}${beside(p)}`);
  block('Judgement: shown to the writer, reported as not measured', of('JUDGEMENT'), () => '');
  block('Shown by your example, and not in your method: shown to the writer, required only if you say so', shown, (p) => `${LABEL[p.obligation]}; your example: ${p.onExample ?? 'held'}`);
  block('Counted from your examples, and not in your method: how they are written. Shown to the writer and used to choose between drafts; required only if you say so', counted, (p) => `${looksFor(p)}${p.onExample ?? 'held'}`);
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
  // With no method there is nothing of the owner's to list: what the examples show is all the skill is, so it is shown.
  if (!stated.length) return ['No method was given: the skill is your examples, served to the writer, and what can be counted in them. Whether new work reads like them is yours to judge.',
    ...(shown.length ? ['', `Seen in your examples: shown to the writer, and required only if you say so (${shown.length}):`, ...shown.map((p) => `  - ${p.statement}`)] : ['', 'Nothing that can be counted is common to all of them: the writer is given the pieces themselves.']),
    '', 'A method note makes rules of your own: atelier new <your-work> --method <how-you-do-it.md>'];
  const out: string[] = [`${stated.length} step(s) in your method.`];
  if (whole.length) out.push('', `Checked on every run (${whole.length}):`, ...whole.map((p) => `  - ${p.statement}${p.byName ? `\n      checked as: ${lookedFor(p)}` : ''}${disagrees(p)}`));
  if (near.length) out.push('', `You judge these; a check of something near each is shown on every run, and blocks nothing (${near.length}):`,
    ...near.map((p) => `  - ${p.statement}\n      shown: ${lookedFor(p)}`));
  if (part.length) out.push('', `Checked in part: the rest is yours to read (${part.length}):`,
    ...part.map((p) => `  - ${p.statement}\n      checked: ${lookedFor(p)}\n      not checked: ${cover(p)?.unchecked ?? ''}${disagrees(p)}`));
  if (judged.length) out.push('', `You judge these yourself (${judged.length}):`, ...judged.map((p) => `  - ${p.statement}`));
  if (shown.length) out.push('', `Also learned from your examples: ${shown.length} habit${shown.length === 1 ? '' : 's'} (see them with --report).`);
  return out;
}

/**
 * The kind of work a method is for: `--class`, or the note's title when it has one (its first line, when that is
 * not a step, up to a dash or a colon), or the skill's name. A name for the record and the screen; any kind the
 * claim check was not measured on is treated alike.
 */
export function kindOfWork(note: string, name: string, declared: string | undefined = flag('--class')): string {
  if (declared?.trim()) return normalizeClass(declared);
  // Read, not declared, so never by a short name: a note titled "X" or a skill called "blog" is not thereby a post
  // on X with its 280 characters. Only `--class` takes the short names (../../core/observers/doc-class.ts).
  const slug = (t: string): string => t.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  // (A comment is no title: a template that opens with <!-- QUICK_MODE --> is not work of the kind "quick-mode".)
  const body = note.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/<!--[\s\S]*?-->/g, '');
  const first = body.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const title = /^(?:[-*+]|\d+[.)])\s/.test(first) ? '' : first.replace(/^#+\s*/, '').split(/\s[—–-]\s|[:,]/)[0].trim();
  const words = title.split(/\s+/).filter(Boolean);
  const read = words.length >= 1 && words.length <= 4 && !/[.!?]$/.test(first) && /\p{L}{3}/u.test(title) ? slug(title) : slug(name);
  return Object.hasOwn(CLASS_ALIASES, read) ? `${read}-work` : read;
}

/**
 * ONE EXAMPLE, OR A FOLDER OF THEM, AS CASES. From a folder: the pieces a build would serve from it and no others
 * (not a file about the work, not a piece's material, not the method note itself if it is kept there, not a hidden
 * file). Every piece is what a check is held against (core/method/standard.ts, `acrossExamples`), and with three
 * or more they are served with the skill and their lengths recorded, as for a skill built from a folder.
 */
function readExamples(goldenPath: string, notePath: string): { folder: string | null; cases: GoldenCase[] } {
  const folder = statSync(resolve(goldenPath)).isDirectory() ? resolve(goldenPath) : null;
  const files = folder ? corpusFiles(folder).filter((f) => resolve(f) !== resolve(notePath) && !basename(f).startsWith('.')).sort() : [resolve(goldenPath)];
  if (!files.length) die(`${goldenPath} holds no example that can be read.`);
  const said: string[] = [];
  const cases = files.map((f) => readCase(f, (line) => { said.push(folder ? `${basename(f)}: ${line}` : line); })).filter((c) => c.reference.trim());
  for (const line of [...new Set(said)].slice(0, 6)) console.log(line);
  if (!cases.length) die(`${goldenPath} is empty.`);
  return { folder, cases };
}

/**
 * `--limit <chars>`: the platform's character limit, the owner's to state; or the format's where `--class` names one
 * that has it. Checked before anything is built: a limit that is not a whole number is refused, never guessed at.
 */
export function shortFormFlags(cls: string | undefined, given: string | undefined = flag('--limit')): ShortFormOptions {
  if (given !== undefined && !/^\d{1,6}$/.test(given.trim())) die(`--limit takes a whole number of characters, got "${given}".`);
  if (given !== undefined && Number(given) <= 0) die('--limit must be greater than zero.');
  const f = formatOf(cls);
  const limit = given !== undefined ? { chars: Number(given), from: '--limit' } : f?.maxChars !== undefined ? { chars: f.maxChars, from: f.label } : null;
  return { limit, ...(f?.urlChars !== undefined ? { urlChars: f.urlChars } : {}) };
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
export function decideSteps(proposals: readonly MethodProposal[], nextId: () => string, confirmed = false): { decided: Requirement[]; ledger: RatificationLedger } {
  const bases: Requirement[] = proposals.map((p) => ({
    requirementId: nextId(), statement: p.statement, appliesWhen: 'GENERAL',
    // A prohibition opens with one. "Then a Suggestions section: improvements that do not block the merge" asks for
    // a section, and was listed under what not to do.
    kind: /^\s*(?:never|do not|don't|must not|avoid|no)\b/i.test(p.statement) ? 'BOUNDARY' : 'GENERATIVE',
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
    const enforce = p.measurement && !base.contested && !base.related;
    const outcome = decide(base, p.origin === 'STATED' ? { verb: 'STATED', ...(enforce ? { materiality: 'REQUIRED' } : {}) } : { verb: 'APPROVE', materiality: p.required ? 'REQUIRED' : 'PREFERRED' });
    ledger = appendDecision(ledger, base, outcome.ledgerDecision, { decidedAt: new Date().toISOString() });
    return outcome.requirement;
  });
  return { decided, ledger };
}

export async function method(): Promise<void> {
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
  const read = proposalsAcross(note, cases);
  const lead = read.lead;
  // What the pieces show about how they are written, counted: offered beside the method, with no model.
  // WITH NO METHOD, THE ONE THING ASKED IS "LIKE THESE". It is said as the skill's one rule, which no count reads and
  // the owner judges: a skill of examples alone still has a standard, and says honestly what it is.
  const likeThese: MethodProposal[] = notePath === null ? [{ statement: `New work reads like the ${cases.length === 1 ? 'example' : `${cases.length} examples`} given: the same kind of piece, at their length, in their manner.`,
    origin: 'SHOWN_BY_EXAMPLE', obligation: 'JUDGEMENT', measurement: null, onExample: null, conflict: null }] : [];
  // THE PLATFORM'S FACTS FOR SHORT PIECES, never assumed: a character limit from `--limit`, or from the format the class
  // names (a post on X: 280), and how that format counts a link. Said on the screen, with what a small corpus can and
  // cannot yet require (core/observers/short-form.ts).
  const shortForm = shortFormFlags(flag('--class'));
  const short = shortFormOffers(cases, shortForm);
  const proposals = [...likeThese, ...read.proposals, ...countedOffers(read.proposals, cases, shortForm), ...tellOffers(cases, note)];
  const example = cases[lead];
  const whole = argv.includes('--report');
  console.log(`${notePath === null ? 'No method note: built from your examples' : `Method: ${basename(notePath)}`}  ·  ${cases.length === 1 ? `example: ${example.id}` : `${cases.length} examples from ${basename(goldenPath)}`}${whole && cases.length > 1 ? `; checks read from ${example.id}, then held against the rest` : ''}${whole && example.material.length ? ` with ${example.material.length} file(s) of material` : ''}\n`);
  for (const line of whole ? describeMethod(proposals, example.caseClass) : shortScreen(proposals)) console.log(line);
  if (short.limits.length) { console.log(''); for (const line of short.limits) console.log(`Short form: ${line}`); }

  // THE KIND OF WORK, SAID AND RECORDED, NEVER ASKED. It decides one thing: on a kind the claim check was measured on
  // (essays, posts), a sentence not found in bound material is cut; anywhere else it is listed for the owner to check.
  // That is the engine's business: said to whoever asks for the whole account, and kept off the screen a person builds from.
  const kind = kindOfWork(note, name);
  if (whole && (notePath !== null || flag('--class'))) console.log(`\nKind of work: ${kind}${flag('--class') ? '' : ' (read from your method; --class <kind> to change it)'}. `
    + (unmeasuredKind(kind) ? 'Sentences not found in your material are listed for you to check, never cut: the claim check is measured on essays and posts, not on this.'
      : 'With your material bound (atelier material), sentences not found in it are cut, as the claim check is measured to do on this kind of writing; with none bound they are listed.'));
  // `--review` looks and builds nothing. Otherwise the skill is built from exactly what the screen showed: a reading
  // the owner did not mean is corrected by changing the method and building again, which is one command.
  if (looking) { console.log(`\nNothing has been built. To build exactly this: atelier ${typedWithout(['--review'])} --name ${name}`); return; }
  // A RULE THE OWNER STATED AND THEIR OWN WORK DOES NOT FOLLOW NEVER STOPS A BUILD AND IS NEVER DROPPED. The skill is
  // built with it: checked and shown on every run, blocking nothing until they confirm it (--yes) or change the
  // method. A mismatch between a method and its examples is the ordinary state of someone's working notes.
  const disputed = proposals.filter((p) => p.origin === 'STATED' && p.conflict); const confirmed = argv.includes('--yes');
  if (again) { archiveSession(); s = loadSession(); }

  // ── THE OWNER'S STEPS AS THEIR OWN, WHAT THE EXAMPLE SHOWS AS APPROVED AND SHOWN ──────
  const { decided, ledger } = decideSteps(proposals, authoredIdAllocator(s), confirmed);
  // WHOSE BUILD THIS IS, WRITTEN BEFORE ANYTHING ELSE IS. A build that stops after the standard is stored and before
  // the skill is installed leaves a skill of this name behind: with the name kept here, the same command run again
  // knows the skill as this folder's and finishes it. Without it, the person was told somebody else had built it.
  s = { ...s, skillName: name, claim: { owned: Boolean(activeNow) }, decided: [...s.decided, ...decided], ledger, ...(folder ? { source: folder } : {}) };
  saveSession(s);

  // The finished example is installed with the skill as the one worked example: what good looks like, for a writer
  // that has the method beside it. Its own task and material are not part of it.
  const exampleFile = runFile(`method-example-${sha(example.reference)}.md`);
  writeAtomic(exampleFile, example.reference);
  process.env.ATELIER_ORCHESTRATED = '1';
  // Every step is the owner's and every check is code: the build asks no model for a reading of the examples.
  process.env.ATELIER_BUILD_NO_MODEL = '1';
  if (!argv.includes('--work-type')) argv.push('--work-type', flag('--for') ?? name.replace(/-/g, ' '));
  if (!argv.includes('--exemplar')) argv.push('--exemplar', exampleFile);
  // Three pieces or more are served with the skill, as its own way of writing, and their lengths recorded; with
  // fewer there is no telling a usual piece from an odd one, and the one worked example stands alone.
  if (!argv.includes('--voice') && !(folder && cases.length >= 3)) argv.push('--voice', 'none');
  if (!argv.includes('--persona')) argv.push('--persona', 'none');
  // (With no method note nothing names the kind of work: a folder called "posts" or "contract" is not thereby held
  // as a post or a contract. --class says it.)
  if (!argv.includes('--class') && notePath !== null) store.setDocClass({ root: DATA, skillName: name }, kind);
  // THE BUILD SAYS A GREAT DEAL (the standard's hash, the size of the export, what no instrument measures): all of it
  // true, none of it what a person needs to start. It is kept for --report, and shown whole if the build fails.
  const said: string[] = []; const log = console.log;
  if (!whole) console.log = (...a: unknown[]) => { said.push(a.map(String).join(' ')); };
  try { ratifyClose(); await build(name); } catch (e) { console.log = log; for (const l of said) console.log(l); throw e; } finally { console.log = log; }
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
