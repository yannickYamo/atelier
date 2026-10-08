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
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { argv, die, flag, positional, loadSession, saveSession, authoredIdAllocator, runFile, sha } from '../runtime.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { draftHash, appendDecision, type RatificationLedger } from '../../core/ratification/decision-record.js';
import { decide } from '../../core/ratification/authority.js';
import type { Requirement } from '../../core/state/canonical-state.js';
import { methodProposals, stepsOf, type MethodProposal } from '../../core/method/standard.js';
import { readCase } from '../corpus.js';
import { ratifyClose } from './ratify.js';
import { build } from './build.js';

const LABEL = { DELIVERABLE: 'the work must contain', EXECUTION: 'the work must be made from', JUDGEMENT: 'judgement' } as const;

/** The screen: the owner's steps by what each is, then what needs their word. Returned as lines, so a test reads what a person does. */
export function describeMethod(ps: readonly MethodProposal[], cls: string): string[] {
  const out: string[] = [];
  const stated = ps.filter((p) => p.origin === 'STATED'); const shown = ps.filter((p) => p.origin === 'SHOWN_BY_EXAMPLE');
  const of = (k: MethodProposal['obligation']): MethodProposal[] => stated.filter((p) => p.obligation === k && !p.demoted);
  const block = (title: string, items: readonly MethodProposal[], note: (p: MethodProposal) => string): void => {
    if (!items.length) return;
    out.push('', `${title} (${items.length})`);
    items.forEach((p) => { out.push(`  - ${p.statement}`); const n = note(p); if (n) out.push(`      ${n}`); });
  };
  out.push(`${stated.length} step(s) from your method.`);
  block('Checked on every output: what the work must contain', of('DELIVERABLE'), (p) => `your example: ${p.onExample ?? 'held'}`);
  block('Checked against the material: what the work must be made from', of('EXECUTION'), (p) => `your example: ${p.onExample ?? 'held'}`);
  block('Judgement: shown to the writer, reported as not measured', of('JUDGEMENT'), () => '');
  block('Yours to settle: your method says it, and your example does not hold it', stated.filter((p) => p.demoted), (p) => `${p.demoted}. Kept as a judgement until the method or the example changes.`);
  block('Shown by your example, and not in your method: shown to the writer, required only if you say so', shown, (p) => `${LABEL[p.obligation]}; your example: ${p.onExample ?? 'held'}`);
  if (cls !== 'FULL_REPRO_CASE') out.push('', cls === 'TASK_AND_REFERENCE'
    ? 'Your example carries its task and no material, so nothing about what the work is made from can be checked.'
    : 'Your example carries neither its task nor its material: only what the work contains can be checked. Add `request:` to its front matter and a `<example>.material` folder beside it.');
  return out;
}

export async function method(): Promise<void> {
  const notePath = positional([]) ?? die('usage: atelier method <method note> --golden <finished example> [--name <name>] [--yes]\n  The note says what is done (steps, a template, both). The example is one piece of work where it was done.');
  const goldenPath = flag('--golden') ?? die('--golden <file> required: one finished example of the method carried out.');
  for (const [what, p] of [['the method note', notePath], ['the example', goldenPath]] as const) if (!existsSync(p)) die(`${what}: there is nothing at ${p}.`);
  const note = readFileSync(notePath, 'utf8');
  if (!stepsOf(note).length) die(`${notePath} holds no step that can be read: a list item, or a sentence of three words or more, is a step.`);
  const example = readCase(resolve(goldenPath));
  if (!example.reference.trim()) die(`${goldenPath} is empty.`);
  const proposals = methodProposals(note, example);
  console.log(`Method: ${basename(notePath)}  ·  example: ${basename(goldenPath)}${example.material.length ? ` with ${example.material.length} file(s) of material` : ''}\n`);
  for (const line of describeMethod(proposals, example.caseClass)) console.log(line);

  const name = flag('--name') ?? basename(notePath).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!argv.includes('--yes')) {
    console.log(`\nNothing has been built. To accept exactly this:\n\n  atelier method ${JSON.stringify(notePath)} --golden ${JSON.stringify(goldenPath)} --name ${name} --yes\n`
      + '\nTo require something your example shows, accept and then: atelier amend --skill <name> --rule <id> --materiality REQUIRED --reason "<why>"');
    return;
  }

  // ── ACCEPTED: THE OWNER'S STEPS AS THEIR OWN, WHAT THE EXAMPLE SHOWS AS APPROVED AND SHOWN ──────
  // A stated step is the owner's sentence, so it is authored by them and required. A step read off the example is
  // the machine's reading that they approved: ratified, and shown rather than required until they declare it.
  let s = loadSession();
  const nextId = authoredIdAllocator(s);
  const bases: Requirement[] = proposals.map((p) => ({
    requirementId: nextId(), statement: p.statement, appliesWhen: 'GENERAL',
    kind: /\b(?:never|do not|don't|must not|no )\b/i.test(p.statement) ? 'BOUNDARY' : 'GENERATIVE',
    authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
    evidence: p.onExample, evidenceItemId: null, wouldBeAbsentIf: null,
    materiality: null, realizationTolerance: null, outputShape: null,
    obligation: p.obligation, ...(p.measurement ? { measurement: p.measurement } : {}),
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
  s = { ...s, decided: [...s.decided, ...decided], ledger };
  saveSession(s);

  // The finished example is installed with the skill as the one worked example: what good looks like, for a writer
  // that has the method beside it. Its own task and material are not part of it.
  const exampleFile = runFile(`method-example-${sha(example.reference)}.md`);
  writeAtomic(exampleFile, example.reference);
  process.env.ATELIER_ORCHESTRATED = '1';
  if (!argv.includes('--work-type')) argv.push('--work-type', flag('--for') ?? name.replace(/-/g, ' '));
  if (!argv.includes('--exemplar')) argv.push('--exemplar', exampleFile);
  if (!argv.includes('--voice')) argv.push('--voice', 'none');
  if (!argv.includes('--persona')) argv.push('--persona', 'none');
  ratifyClose();
  await build(name);
  const n = (k: Requirement['obligation']): number => decided.filter((r) => r.obligation === k && r.measurement).length;
  console.log(`\nHeld to your method on every run: ${n('DELIVERABLE')} thing(s) the work must contain, ${n('EXECUTION')} it must be made from; ${decided.filter((r) => !r.measurement).length} judgement step(s) shown and reported as not measured.`);
  console.log(`Use it:  atelier invoke --skill ${name} "<the task>" --with <name>=<material file>`);
}
