// cli/commands/method.ts — `atelier method`: A SKILL FROM ONE METHOD AND ONE FINISHED EXAMPLE.
//
// The other way in. `atelier new` reads a body of work and finds the taste in it; this reads what the owner says is
// done (a method note: steps, a template, both) and one piece of work where it was done, and builds a skill that is
// held to the method. No taste is read from one piece, and none is claimed.
//
// What the owner sees is their own steps, each marked with what it is: something the output must contain (checked
// by code on every output), something the work must be made from (checked against the material), or a judgement
// (shown to the writer and reported as not measured). A step whose check their own example does not pass is kept
// as theirs and asked about: the template and the finished work disagree, and only the owner knows which is right.
// What the example shows that no step said is proposed, and is shown, never required, until they say so.
//
// Nothing here calls a model (core/method/standard.ts). `--yes` accepts exactly what the screen showed.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { DATA, argv, die, flag, positional, loadSession, saveSession, authoredIdAllocator, runFile, sha } from '../runtime.js';
import * as store from '../../core/state/store.js';
import { normalizeClass, CLASS_ALIASES } from '../../core/observers/doc-class.js';
import { unmeasuredKind } from '../../core/loop/claim-extract.js';
import { skillNameFrom } from '../../renderers/agent-skill/render.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { draftHash, appendDecision, type RatificationLedger } from '../../core/ratification/decision-record.js';
import { decide } from '../../core/ratification/authority.js';
import type { Requirement } from '../../core/state/canonical-state.js';
import type { GoldenCase } from '../../core/golden/case.js';
import { proposalsAcross, countedOffers, stepsOf, type MethodProposal } from '../../core/method/standard.js';
import { readCase, corpusFiles } from '../corpus.js';
import { observerFor } from '../../core/observers/registry.js';
import { ratifyClose } from './ratify.js';
import { build } from './build.js';

const LABEL = { DELIVERABLE: 'the work must contain', EXECUTION: 'the work must be made from', JUDGEMENT: 'judgement' } as const;

/** The screen: the owner's steps by what each is, then what needs their word. Returned as lines, so a test reads what a person does. */
export function describeMethod(ps: readonly MethodProposal[], cls: string): string[] {
  const out: string[] = [];
  const stated = ps.filter((p) => p.origin === 'STATED'); const shown = ps.filter((p) => p.origin === 'SHOWN_BY_EXAMPLE' && !p.counted);
  const counted = ps.filter((p) => p.counted);
  const of = (k: MethodProposal['obligation']): MethodProposal[] => stated.filter((p) => p.obligation === k && !p.demoted);
  const block = (title: string, items: readonly MethodProposal[], note: (p: MethodProposal) => string): void => {
    if (!items.length) return;
    out.push('', `${title} (${items.length})`);
    items.forEach((p) => { out.push(`  - ${p.statement}`); const n = note(p); if (n) out.push(`      ${n}`); });
  };
  out.push(`${stated.length} step(s) from your method.`);
  // What will be looked for, in the check's own terms, beside how the example fares on it: the owner approves the
  // check, and "everything it must contain is there" does not say which section a step was tied to.
  const looksFor = (p: MethodProposal): string => {
    const m = p.measurement;
    if (m?.observer === 'PRESENCE' && Array.isArray(m.params.sections)) {
      const names = (m.params.sections as readonly string[]).map((n) => `"${n}"`).join(', ');
      return `checks for: ${names.includes(',') ? `the sections ${names}` : `a section ${names}`}, with something in it${m.params.opens ? ', opening the work' : ''}${m.params.closes ? ', ending the work' : ''}${Array.isArray(m.params.options) ? `, starting with one of ${(m.params.options as readonly string[]).map((o) => `"${o}"`).join(', ')} on a line of its own` : ''}${p.byName ? ' (read from your example\'s section names)' : ''}; `;
    }
    if (m?.observer === 'TABLE' && Array.isArray(m.params.columns)) return `checks for: a table with the columns ${(m.params.columns as readonly string[]).join(', ')}; `;
    // Any other check the step became, in the check's own words: a length, a banned word, how a paragraph starts.
    return m ? `checks for: ${observerFor(m.observer).describe(m.params)}; ` : '';
  };
  block('Checked on every output: what the work must contain', of('DELIVERABLE'), (p) => `${looksFor(p)}your example: ${p.onExample ?? 'held'}`);
  block('Checked against the material: what the work must be made from', of('EXECUTION'), (p) => `${p.measurement?.observer === 'LINES' ? 'checks for: every path:line cited is a line of the material with something on it (for a diff, a line the change adds); ' : ''}your example: ${p.onExample ?? 'held'}`);
  block('Judgement: shown to the writer, reported as not measured', of('JUDGEMENT'), () => '');
  block('Yours to settle: your method says it, and your finished work does not hold it', stated.filter((p) => p.demoted), (p) => `${p.demoted}. Kept as a judgement until the method or the example changes.`);
  block('Shown by your example, and not in your method: shown to the writer, required only if you say so', shown, (p) => `${LABEL[p.obligation]}; your example: ${p.onExample ?? 'held'}`);
  block('Counted from your examples, and not in your method: how they are written. Shown to the writer and used to choose between drafts; required only if you say so', counted, (p) => `${looksFor(p)}${p.onExample ?? 'held'}`);
  if (cls !== 'FULL_REPRO_CASE') out.push('', cls === 'TASK_AND_REFERENCE'
    ? 'Your example carries its task and no material, so nothing about what the work is made from can be checked.'
    : 'Your example carries neither its task nor its material: only what the work contains can be checked. Add `request:` to its front matter and a `<example>.material` folder beside it.');
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
  const body = note.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
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
 * NOTHING IS BUILT UNTIL THE OWNER HAS SEEN WHAT IS THEIRS TO SETTLE. Says why and how to accept, and answers true,
 * when the call only reviews, when a step and the finished work disagree, or when a check was read from a section
 * name; false when the skill may be built now.
 */
function waitsForOwner(proposals: readonly MethodProposal[], notePath: string, goldenPath: string, name: string): boolean {
  // ONE CALL, UNLESS THERE IS A QUESTION THAT IS THE OWNER'S. Every step is theirs, in their words, and what their
  // example shows beyond them is shown and not required: there is nothing to approve that they did not write. Where
  // the method and the example disagree, that is theirs to settle, and nothing is built until they have seen it.
  // `--review` only shows; `--yes` builds whatever the screen showed.
  const toSettle = proposals.filter((p) => p.demoted);
  // A CHECK READ FROM THE EXAMPLE'S OWN SECTION NAMES IS A READING OF WHAT THE OWNER MEANT, and a reading is theirs to
  // see before a run is held to it: "State the constraints in a Regulation section" asks for one, and "compare it
  // with a Risks section from last quarter" does not, and the words that tell them apart are not a closed list.
  const read = proposals.filter((p) => p.byName);
  if (!argv.includes('--yes') && (argv.includes('--review') || toSettle.length || read.length)) {
    const why = argv.includes('--review') ? '' : toSettle.length ? `: ${toSettle.length} step(s) above are yours to settle first. Change the method or the example, or build with them kept as judgement`
      : `: ${read.length} check(s) above were read from your example's section names (${read.map((p) => `"${p.statement.length > 48 ? `${p.statement.slice(0, 45)}...` : p.statement}"`).join('; ')}). Look that each asks for what you meant`;
    console.log(`\nNothing has been built${why}. To accept exactly this:\n\n  atelier method ${JSON.stringify(notePath)} --golden ${JSON.stringify(goldenPath)} --name ${name} --yes\n`
      + '\nTo require something your example shows, accept and then: atelier amend --skill <name> --rule <id> --materiality REQUIRED --reason "<why>"');
    return true;
  }
  return false;
}

/**
 * THE OWNER'S STEPS AS THEIR OWN, WHAT THE EXAMPLE SHOWS AS APPROVED AND SHOWN. A stated step is the owner's
 * sentence: authored by them, and required where code can hold an output to it. One read off the example is the
 * machine's reading that they approved: a preference until they say otherwise.
 */
function decideSteps(proposals: readonly MethodProposal[], nextId: () => string): { decided: Requirement[]; ledger: RatificationLedger } {
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
    ...(p.counted && p.measurement?.observer !== 'LENGTH' ? {} : { obligation: p.obligation }), ...(p.measurement ? { measurement: p.measurement } : {}),
  }));
  let ledger: RatificationLedger = { standardDraftHash: draftHash(bases), records: [] };
  const decided = bases.map((base, i) => {
    // A stated step with a check is required: it is the owner's, and code can hold an output to it. One read off the
    // example is a preference until the owner says otherwise.
    const p = proposals[i];
    const outcome = decide(base, p.origin === 'STATED' ? { verb: 'STATED', ...(p.measurement ? { materiality: 'REQUIRED' } : {}) } : { verb: 'APPROVE', materiality: 'PREFERRED' });
    ledger = appendDecision(ledger, base, outcome.ledgerDecision, { decidedAt: new Date().toISOString() });
    return outcome.requirement;
  });
  return { decided, ledger };
}

export async function method(): Promise<void> {
  const notePath = positional([]) ?? die('usage: atelier method <method note> --golden <finished example, or a folder of them> [--name <name>] [--yes]\n  The note says what is done (steps, a template, both). An example is one piece of work where it was done.');
  const goldenPath = flag('--golden') ?? die('--golden <file or folder> required: one finished example of the method carried out, or a folder of them.');
  for (const [what, p] of [['the method note', notePath], ['the example', goldenPath]] as const) if (!existsSync(p)) die(`${what}: there is nothing at ${p}.`);
  const note = readFileSync(notePath, 'utf8');
  if (!stepsOf(note).length) die(`${notePath} holds no step that can be read: a list item, or a sentence of three words or more, is a step.`);
  const { folder, cases } = readExamples(goldenPath, notePath);
  const read = proposalsAcross(note, cases);
  const lead = read.lead;
  // What the pieces show about how they are written, counted: offered beside the method, with no model.
  const proposals = [...read.proposals, ...countedOffers(read.proposals, cases)];
  const example = cases[lead];
  console.log(`Method: ${basename(notePath)}  ·  ${cases.length === 1 ? `example: ${example.id}` : `${cases.length} examples from ${basename(goldenPath)}; checks read from ${example.id}, then held against the rest`}${example.material.length ? ` with ${example.material.length} file(s) of material` : ''}\n`);
  for (const line of describeMethod(proposals, example.caseClass)) console.log(line);

  // The name as the skill will carry it, whether it was given or read off the file: what is printed is what is built.
  const name = ((): string => { try { return skillNameFrom(flag('--name') ?? basename(notePath).replace(/\.[^.]+$/, '')); } catch { return die('--name <name> required: the method file gives no name a skill can carry.'); } })();
  // THE KIND OF WORK, SAID AND RECORDED, NEVER ASKED. It decides one thing: on a kind the claim check was measured on
  // (essays, posts), a sentence not found in bound material is cut; anywhere else it is listed for the owner to check.
  const kind = kindOfWork(note, name);
  console.log(`\nKind of work: ${kind}${flag('--class') ? '' : ' (read from your method; --class <kind> to change it)'}. `
    + (unmeasuredKind(kind) ? 'Sentences not found in your material are listed for you to check, never cut: the claim check is measured on essays and posts, not on this.'
      : 'With your material bound (atelier material), sentences not found in it are cut, as the claim check is measured to do on this kind of writing; with none bound they are listed.'));
  // Said before anything is offered: a command printed as "to accept exactly this" must be one that will be accepted.
  let s = loadSession();
  // A SKILL OF THAT NAME BUILT SOMEWHERE ELSE IS SOMEBODY'S STANDARD. Built again here it would be replaced without a
  // word: two people whose method file is called method.md would each overwrite the other's skill.
  if (store.getActive({ root: DATA, skillName: name }) && s.skillName !== name) {
    die(`a skill called "${name}" already exists, and this folder has no record of building it. Building here would replace its standard. Give this one a name of its own: --name <name>. (If a build of it here stopped part-way, finish that one: atelier build --name ${name}.)`);
  }
  if (waitsForOwner(proposals, notePath, goldenPath, name)) return;

  // ── ACCEPTED: THE OWNER'S STEPS AS THEIR OWN, WHAT THE EXAMPLE SHOWS AS APPROVED AND SHOWN ──────
  // A stated step is the owner's sentence, so it is authored by them and required. A step read off the example is
  // the machine's reading that they approved: ratified, and shown rather than required until they declare it.
  // ONE PROJECT, ONE STANDARD. A folder that already holds rules (a run of `atelier new`, an earlier `atelier method`)
  // would have these added to them, and the skill built would be held to both. Refused before anything is written.
  if (s.decided.length || s.proposals.length || s.run.standardVersionHash) {
    die(`this folder already holds a standard${s.skillName ? ` (the skill "${s.skillName}")` : ''}: a method's steps would be added to its rules, and the skill would be held to both. Build a method's skill from a folder of its own.`);
  }
  const { decided, ledger } = decideSteps(proposals, authoredIdAllocator(s));
  s = { ...s, decided: [...s.decided, ...decided], ledger, ...(folder ? { source: folder } : {}) };
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
  if (!argv.includes('--class')) store.setDocClass({ root: DATA, skillName: name }, kind);
  ratifyClose();
  await build(name);
  // Required is what a run is held to. What the example showed is checked and reported, and fails nothing: said apart,
  // so that the count of what is enforced is never larger than it is.
  const n = (k: Requirement['obligation']): number => decided.filter((r) => r.obligation === k && r.measurement && r.materiality === 'REQUIRED').length;
  const shown = decided.filter((r) => r.measurement && r.materiality !== 'REQUIRED').length;
  console.log(`\nHeld to your method on every run: ${n('DELIVERABLE')} thing(s) the work must contain, ${n('EXECUTION')} it must be made from; ${decided.filter((r) => !r.measurement).length} judgement step(s) shown and reported as not measured.${shown ? ` ${shown} more thing(s) your example shows are checked and reported, and required only if you say so.` : ''}`);
  console.log(`Use it:  atelier invoke --skill ${name} "<the task>" --with <name>=<material file>`);
}
