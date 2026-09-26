// cli/commands/review.ts — ONE SCREEN BETWEEN DISCOVERY AND A SKILL THAT INSTRUCTS.
//
// Every proposal is shown once, strongest evidence first, with the ruling the evidence suggests and the
// reason in one line. The person accepts the lot with one keystroke, or changes any of them on the same
// line (`p3=reject p5=preferred`), and only then does anything become part of a standard. The decisions
// land through `applyDecisions`, the same function the batch command and the page use, so the ledger
// records them exactly as it records any other ruling.
//
// What this screen does NOT do is decide when nobody is there. Without a terminal it prints the screen
// and the command that accepts it; an assistant driving the CLI has to put that question to its person.

import { createInterface } from 'node:readline';
import { die, argv, flagAll, loadSession } from '../runtime.js';
import { isGeneralScope } from '../../core/state/canonical-state.js';
import { suggest, modeFromIntent, type Suggestion, type SkillMode } from '../../core/ratification/suggest.js';
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

interface Row { readonly id: string; readonly s: Suggestion }

const finalOf = (r: Row, changes: ReadonlyMap<string, string>): { decision: 'APPROVE' | 'REJECT'; materiality: string | null } => {
  const c = changes.get(r.id);
  if (c === 'reject') return { decision: 'REJECT', materiality: null };
  if (c && c in WEIGHTS) return { decision: 'APPROVE', materiality: WEIGHTS[c] };
  if (c === 'approve') return { decision: 'APPROVE', materiality: r.s.materiality ?? 'PREFERRED' };
  return { decision: r.s.decision, materiality: r.s.materiality };
};

const label = (f: ReturnType<typeof finalOf>): string =>
  (f.decision === 'REJECT' ? 'REJECT' : f.materiality === 'REQUIRED' ? 'REQUIRED — instructs' : `${f.materiality ?? 'PREFERRED'} — shown, not instructed`);

/**
 * Show the screen and, when the person accepts, apply it. Returns whether a standard's worth of
 * decisions was recorded, so `atelier new` knows whether to go on to build.
 */
export async function review(): Promise<boolean> {
  const s = loadSession();
  const done = new Set(s.decided.map((d) => d.requirementId));
  const pending = s.proposals.filter((p) => !done.has(p.requirementId));
  if (!pending.length) {
    console.log(s.proposals.length ? 'Nothing is waiting for a ruling.' : 'Discovery proposed no rules, so there is nothing to rule on. Nothing was compiled.');
    return s.decided.length > 0;
  }

  const intent = s.intent?.text ?? null;
  const mode: SkillMode = s.intent?.mode ?? modeFromIntent(intent ?? '').mode;
  const rows: Row[] = pending
    .map((p) => ({ id: p.requirementId, s: suggest(p, s.proposalMeta?.[p.requirementId], mode) }))
    .sort((a, b) => b.s.strength - a.s.strength || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const byId = new Map(pending.map((p) => [p.requirementId, p]));

  console.log(`\n${pending.length} rule(s) read from your work. Nothing is part of your standard until you accept.`);
  if (intent) console.log(`For: "${intent}"  (${mode.toLowerCase()}: ${modeFromIntent(intent).why})`);
  console.log('Strongest evidence first. REQUIRED rules instruct the model; the others are shown to it as examples.\n');
  for (const r of rows) {
    const p = byId.get(r.id);
    if (!p) continue;
    const meta = s.proposalMeta?.[r.id];
    console.log(`  ${r.id.padEnd(4)} ${p.statement}`);
    if (!isGeneralScope(p.appliesWhen)) console.log(`       when: ${p.appliesWhen}`);
    if (p.evidence) console.log(`       e.g.: "${p.evidence.slice(0, 110)}${p.evidence.length > 110 ? '…' : ''}"`);
    if (meta?.alsoPhrasedAs.length) console.log(`       also read as: ${meta.alsoPhrasedAs[0].slice(0, 100)}`);
    if (r.s.needs) console.log(`       needs from you: ${r.s.needs}  (it will ask for this rather than invent it)`);
    const measures = describeMeasurement(p);
    if (measures) console.log(`       measured: ${measures}`);
    console.log(`       → ${label({ decision: r.s.decision, materiality: r.s.materiality })}   ${r.s.why}\n`);
  }

  const ids = new Set(rows.map((r) => r.id));
  const fromFlags = parseChanges(flagAll('--set').join(' '), ids);
  if (fromFlags.errors.length) die(fromFlags.errors.join('\n'));
  const changes = fromFlags.changes;

  let accepted = argv.includes('--accept');
  if (!accepted && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (;;) {
        const answer = (await new Promise<string>((res) => {
          rl.question('Enter to accept all as shown · or type changes (p3=reject p5=preferred) · q to stop: ', res);
        })).trim();
        if (answer.toLowerCase() === 'q') break;
        if (!answer) { accepted = true; break; }
        const { changes: more, errors } = parseChanges(answer, ids);
        for (const e of errors) console.log(`  ${e}`);
        for (const [k, v] of more) changes.set(k, v);
        for (const r of rows.filter((x) => more.has(x.id))) console.log(`  ${r.id} → ${label(finalOf(r, changes))}`);
      }
    } finally { rl.close(); }
  }

  if (!accepted) {
    console.log('Nothing was decided. When you are ready:');
    console.log('  atelier review --accept                        accept all as shown');
    console.log('  atelier review --accept --set p3=reject        accept, with changes');
    console.log('  atelier ratify --page review.html              rule on each one in a browser, evidence beside it');
    return false;
  }

  const decisions: RatificationDecision[] = rows.map((r) => {
    const f = finalOf(r, changes);
    const suggested = { decision: r.s.decision, materiality: r.s.materiality, why: r.s.why };
    return f.decision === 'REJECT'
      ? { id: r.id, decision: 'REJECT', suggested }
      : { id: r.id, decision: 'APPROVE', materiality: f.materiality ?? 'PREFERRED', suggested, ...(r.s.needs ? { needs: r.s.needs } : {}) };
  });
  if (changes.size) {
    console.log(`With your changes: ${[...changes].map(([id]) => `${id} → ${label(finalOf(rows.find((r) => r.id === id) ?? rows[0], changes))}`).join(' · ')}`);
  }
  applyDecisions(decisions);
  if (!process.env.ATELIER_ORCHESTRATED) {
    console.log('Recorded. To build it: atelier new <the same folder>   (or: atelier ratify-close, then atelier build --name <name>)');
  }
  return true;
}
