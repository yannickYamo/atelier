// cli/commands/review.ts — ONE SCREEN BETWEEN DISCOVERY AND A SKILL THAT INSTRUCTS.
//
// Every proposal arrives with the ruling the evidence suggests and the reason in one line. The person
// accepts the lot with one keystroke, or changes any of them on the same line (`p3=reject p5=preferred`),
// and only then does anything become part of a standard. The decisions land through `applyDecisions`, the
// same function the batch command and the page use, so the ledger records them exactly as it records any
// other ruling.
//
// THE SCREEN IS SHAPED BY WHAT DESERVES ATTENTION. Rules that will instruct the model, and rules whose
// evidence is weakest, are shown in full: those are the rulings with consequences. Rules that will only
// be shown to the model as examples get one line each. Nothing is hidden: `atelier pending` and the page
// show every rule with its evidence. A first run printed thirty rules at equal weight, about 3,000 words,
// and the person pressed Enter without reading them.
//
// What this screen does NOT do is decide when nobody is there. Without a terminal it prints the screen
// and the command that accepts it; an assistant driving the CLI has to put that question to its person.
// Given `--accept`, the person has already decided, so it records and prints a one-line summary.

import { coverageOf, describeCoverage } from '../../core/taste/dimensions.js';
import { createInterface } from 'node:readline';
import { die, argv, flagAll, loadSession, orchestrated, type Session } from '../runtime.js';
import { isGeneralScope, type Requirement } from '../../core/state/canonical-state.js';
import { suggestAll, modeFromIntent, type Suggestion, type SkillMode } from '../../core/ratification/suggest.js';
import { applyDecisions, type RatificationDecision } from './ratify.js';
import { describeMeasurement } from './verify.js';

const WEIGHTS: Readonly<Record<string, string>> = {
  required: 'REQUIRED', preferred: 'PREFERRED', exemplar: 'EXEMPLAR_ONLY', tolerated: 'TOLERATED', incidental: 'INCIDENTAL',
};

/** `p3=reject p5=preferred`, from the prompt or `--set`. Unknown ids and words are refused, not guessed. */
export function parseChanges(text: string, ids: ReadonlySet<string>): { changes: Map<string, string>; errors: string[] } {
  const changes = new Map<string, string>();
  const errors: string[] = [];
  for (const tok of text.split(/[\s,]+/).filter(Boolean)) {
    const m = /^([a-z]\d+)=([a-z_]+)$/i.exec(tok);
    if (!m) { errors.push(`"${tok}" is not id=choice`); continue; }
    const [, id, choice] = m;
    const c = choice.toLowerCase();
    if (!ids.has(id)) { errors.push(`${id} is not a proposal here`); continue; }
    if (c !== 'reject' && c !== 'approve' && !(c in WEIGHTS)) { errors.push(`${id}: "${choice}" — use reject, approve, required, preferred, exemplar, tolerated or incidental`); continue; }
    changes.set(id, c);
  }
  return { changes, errors };
}

interface Row { readonly id: string; readonly p: Requirement; readonly s: Suggestion }
interface Final { readonly decision: 'APPROVE' | 'REJECT'; readonly materiality: string | null }

const finalOf = (r: Row, changes: ReadonlyMap<string, string>): Final => {
  const c = changes.get(r.id);
  if (c === 'reject') return { decision: 'REJECT', materiality: null };
  if (c && c in WEIGHTS) return { decision: 'APPROVE', materiality: WEIGHTS[c] };
  if (c === 'approve') return { decision: 'APPROVE', materiality: r.s.materiality ?? 'PREFERRED' };
  return { decision: r.s.decision, materiality: r.s.materiality };
};

const label = (f: Final): string =>
  (f.decision === 'REJECT' ? 'REJECT' : f.materiality === 'REQUIRED' ? 'REQUIRED — instructs' : `${f.materiality ?? 'PREFERRED'} — shown, not instructed`);

/**
 * How this screen is left and re-entered. From `atelier new` the hints name `new … --accept`, which records
 * AND builds; on its own, `review --accept`, which records. A hint that only recorded, printed after a
 * `new` run, left the person one undocumented command short of a skill.
 *
 * `shownBefore`: an earlier call already printed these rules, so accepting them need not print them again.
 * Anything else prints the screen before recording, `--accept` or not: a first `new --accept` would
 * otherwise ratify rules nobody was shown, and only the person may make a rule theirs.
 */
export interface ReviewOptions { readonly continueWith?: string; readonly shownBefore?: boolean }

/**
 * Show the screen and, when the person accepts, apply it. Returns whether a standard's worth of
 * decisions was recorded, so `atelier new` knows whether to go on to build.
 */
export async function review(opts: ReviewOptions = {}): Promise<boolean> {
  const s = loadSession();
  const rows = pendingRows(s);
  if (!rows.length) {
    console.log(s.proposals.length ? 'Nothing is waiting for a ruling.' : 'Discovery proposed no rules, so there is nothing to rule on. Nothing was compiled.');
    return s.decided.length > 0;
  }
  const ids = new Set(rows.map((r) => r.id));
  const fromFlags = parseChanges(flagAll('--set').join(' '), ids);
  if (fromFlags.errors.length) die(fromFlags.errors.join('\n'));
  const changes = fromFlags.changes;

  let accepted = argv.includes('--accept');
  if (!accepted || !opts.shownBefore) printScreen(s, rows);
  if (!accepted && process.stdin.isTTY) accepted = await promptForChanges(rows, ids, changes);
  if (!accepted) {
    printHowToAccept(opts.continueWith);
    return false;
  }
  applyDecisions(rows.map((r) => decisionFor(r, changes)));
  console.log(describeChanges(rows, changes));
  if (!orchestrated()) {
    console.log('To build it: atelier new <the same folder> --accept   (or: atelier ratify-close, then atelier build --name <name>)');
  }
  return true;
}

/** The proposals still waiting for a ruling, each with its suggestion, strongest evidence first. */
function pendingRows(s: Session): Row[] {
  const done = new Set(s.decided.map((d) => d.requirementId));
  const mode: SkillMode = s.intent?.mode ?? modeFromIntent(s.intent?.text ?? '').mode;
  // Suggested together, so the rules suggested as required are ones the author's own pieces meet (suggestAll).
  const pending = s.proposals.filter((p) => !done.has(p.requirementId));
  const { suggestions } = suggestAll(pending, s.proposalMeta, mode);
  return pending
    .map((p, i) => ({ id: p.requirementId, p, s: suggestions[i] }))
    .sort((a, b) => b.s.strength - a.s.strength || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/**
 * THE SCREEN. What will instruct and what is weakest, in full; what is only shown, one line each; then
 * what the rules cover. Rejections suggested on strong evidence are among the weakest, so every
 * suggestion that removes or binds something is read in full before Enter.
 */
function printScreen(s: Session, rows: readonly Row[]): void {
  const intent = s.intent?.text ?? null;
  const instructs = rows.filter((r) => r.s.decision === 'APPROVE' && r.s.materiality === 'REQUIRED');
  const weakest = rows.filter((r) => !instructs.includes(r) && r.s.strength === 0);
  const examples = rows.filter((r) => !instructs.includes(r) && !weakest.includes(r));

  console.log(`\n${rows.length} rule(s) read from your work. Nothing is part of your standard until you accept.`);
  if (intent) console.log(`For: "${intent}"`);
  console.log('');
  // Each rule shown in full ends with a blank line, so every section header follows one.
  if (instructs.length) {
    console.log(`Will instruct the model (${instructs.length}):\n`);
    for (const r of instructs) printRule(s, r);
  }
  if (weakest.length) {
    console.log(`Worth a second look: the evidence is thinnest (${weakest.length}):\n`);
    for (const r of weakest) printRule(s, r);
  }
  if (examples.length) {
    console.log(`Shown to the model as examples, not instructed (${examples.length}):`);
    for (const r of examples) console.log(`  ${r.id.padEnd(4)} ${oneLine(r.p.statement, 88)}${r.s.needs ? `   (needs: ${oneLine(r.s.needs, 60)})` : ''}`);
    console.log('');
  }
  console.log('The evidence for every rule:  atelier pending   ·   atelier ratify --page review.html');
  // WHAT THIS STANDARD WOULD COVER, by what makes writing good, so a hole is visible before it is
  // ratified rather than discovered in the output (core/taste/dimensions.ts).
  const kept = rows.filter((r) => r.s.decision !== 'REJECT').map((r) => r.p);
  console.log(`\nWhat these rules cover:\n${describeCoverage(coverageOf(kept))}\n`);
  // HOW THE AUTHOR'S OWN PIECES FARE against what will instruct as required: said on the screen the rules are
  // accepted from, with what was moved to "shown" to get there (core/ratification/suggest.ts, `suggestAll`).
  const done = new Set(s.decided.map((d) => d.requirementId));
  const standing = suggestAll(s.proposals.filter((p) => !done.has(p.requirementId)), s.proposalMeta, s.intent?.mode ?? modeFromIntent(s.intent?.text ?? '').mode).corpus;
  if (standing) {
    console.log(`Your own pieces: ${standing.passing} of ${standing.pieces} meet every counted rule suggested as required.`
      + (standing.moved.length ? ` ${standing.moved.length} rule(s) your own pieces break too often are suggested as shown, not required: ${standing.moved.join(', ')}.` : ''));
  }
}

/** One rule in full: what it says, when, an example, what it needs, how it is measured, and the suggestion. */
function printRule(s: Session, r: Row): void {
  const meta = s.proposalMeta?.[r.id];
  console.log(`  ${r.id.padEnd(4)} ${r.p.statement}`);
  if (!isGeneralScope(r.p.appliesWhen)) console.log(`       when: ${r.p.appliesWhen}`);
  if (r.p.evidence) console.log(`       e.g.: "${oneLine(r.p.evidence, 110)}"`);
  if (meta?.alsoPhrasedAs.length) console.log(`       also read as: ${oneLine(meta.alsoPhrasedAs[0], 100)}`);
  if (r.s.needs) console.log(`       needs from you: ${r.s.needs}  (it will ask for this rather than invent it)`);
  const measures = describeMeasurement(r.p);
  if (measures) console.log(`       measured: ${measures}`);
  console.log(`       → ${label({ decision: r.s.decision, materiality: r.s.materiality })}   ${r.s.why}\n`);
}

const oneLine = (t: string, max: number): string => (t.length > max ? `${t.slice(0, max)}…` : t);

/** The terminal prompt. Returns whether the person accepted; changes typed along the way land in `changes`. */
async function promptForChanges(rows: readonly Row[], ids: ReadonlySet<string>, changes: Map<string, string>): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (await new Promise<string>((res) => {
        rl.question('Enter to accept all as shown · or type changes (p3=reject p5=preferred) · q to stop: ', res);
      })).trim();
      if (answer.toLowerCase() === 'q') return false;
      if (!answer) return true;
      const { changes: more, errors } = parseChanges(answer, ids);
      for (const e of errors) console.log(`  ${e}`);
      for (const [k, v] of more) changes.set(k, v);
      for (const r of rows.filter((x) => more.has(x.id))) console.log(`  ${r.id} → ${label(finalOf(r, changes))}`);
    }
  } finally { rl.close(); }
}

function printHowToAccept(continueWith: string | undefined): void {
  const cmd = continueWith ? `${continueWith} --accept` : 'atelier review --accept';
  const ways: readonly (readonly [string, string])[] = [
    [cmd, `accept all as shown${continueWith ? ', and build' : ''}`],
    [`${cmd} --set p3=reject`, 'accept, with changes'],
    ['atelier ratify --page review.html', 'rule on each one in a browser, evidence beside it'],
  ];
  const width = Math.max(...ways.map(([c]) => c.length));
  console.log('Nothing was decided. When you are ready:');
  for (const [c, what] of ways) console.log(`  ${c.padEnd(width)}   ${what}`);
}

/** The ledger's decision for one row: the person's change, or the suggestion they accepted, beside it. */
function decisionFor(r: Row, changes: ReadonlyMap<string, string>): RatificationDecision {
  const f = finalOf(r, changes);
  const suggested = { decision: r.s.decision, materiality: r.s.materiality, why: r.s.why };
  return f.decision === 'REJECT'
    ? { id: r.id, decision: 'REJECT', suggested }
    : { id: r.id, decision: 'APPROVE', materiality: f.materiality ?? 'PREFERRED', suggested, ...(r.s.needs ? { needs: r.s.needs } : {}) };
}

/**
 * Which rulings were the person's own and which were suggestions they accepted. The counts are printed by
 * `applyDecisions`, from the compiler; this says only what the ledger also keeps, so "you approved it"
 * never hides "you pressed Enter".
 */
function describeChanges(rows: readonly Row[], changes: ReadonlyMap<string, string>): string {
  if (!changes.size) return 'You took every suggestion.';
  return `Your changes: ${rows.filter((r) => changes.has(r.id)).map((r) => `${r.id} → ${label(finalOf(r, changes))}`).join(' · ')}`;
}
