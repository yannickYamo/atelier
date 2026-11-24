// atelier/cli/guided.ts — THE END OF A BUILD, FOR A PERSON AT A TERMINAL: what was understood, the few things only they
// can say, one piece written with the new skill, and one round of what to change. Then the skill is ready.
//
// One pass, never a loop. The piece is a PREVIEW: the skill is written from the person's own pieces, and a draft
// the model wrote is never added to them, whether the person pressed enter or not. What the round does keep is how the
// person changes a draft: they say it once, the piece is written again, and on their y the sentences before and after
// are held as their correction (core/direct/kept.ts, `correctionOnly`), which every later review is shown
// (core/direct/prompt.ts). Everything here is made of what already exists: the purpose card (core/direct/card.ts), a
// run of the skill as a person would make it (`atelier invoke`) and `atelier fix` on that run.
//
// Nothing here waits where nobody is: it runs only at a terminal (or where ATELIER_GUIDED=1 says a person's lines come
// on stdin, as a test does), never under --yes, --json or a host. An input that ends accepts nothing.

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { DATA, argv, flag, canReach } from './runtime.js';
import * as store from '../core/state/store.js';
import { cardLine, cardSentence, amendCard, type PurposeCard } from '../core/direct/card.js';
import type { PersonaPoint } from '../core/compiler/persona.js';
import { editPairs, type KeptPiece } from '../core/direct/kept.js';
import { createHash } from 'node:crypto';
import { planFor } from '../core/plan/execution-plan.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

/** Whether a person is there to read and answer: a terminal, and nothing typed that says "do not ask". */
export const guidedHere = (): boolean =>
  !argv.includes('--yes') && !argv.includes('--json') && !argv.includes('--review')
  && (process.env.ATELIER_GUIDED === '1' || (process.stdin.isTTY && process.stdout.isTTY));

/**
 * The person's lines, one at a time. An input that has ended (the terminal closed, ctrl-D) answers with null, which is
 * never read as enter: nobody accepted anything.
 */
function lines(): { ask: (q: string) => Promise<string | null>; close: () => void } {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const waiting: ((s: string | null) => void)[] = []; const ready: string[] = []; let ended = false;
  rl.on('line', (l) => { const w = waiting.shift(); if (w) w(l); else ready.push(l); });
  rl.on('close', () => { ended = true; for (const w of waiting.splice(0)) w(null); });
  return {
    // where the lines come from a pipe nothing echoes them: the line is ended here, so each question stands alone
    ask: async (q) => {
      process.stdout.write(q);
      const a = ready.shift() ?? (ended ? null : await new Promise<string | null>((ok) => { waiting.push(ok); }));
      if (!process.stdin.isTTY) process.stdout.write('\n');
      return a;
    },
    close: () => { rl.close(); },
  };
}

/** Every model setting typed on this command, passed on to the runs made here; nothing named, nothing passed. */
const MODEL_FLAGS = ['--provider', '--base-url', '--model', '--backend', '--api-key-env', '--effort', '--price-in', '--price-out',
  '--target-provider', '--target-base-url', '--target-model', '--target-backend', '--target-price-in', '--target-price-out'] as const;
const modelArgs = (): string[] => MODEL_FLAGS.flatMap((f) => { const v = flag(f); return v === undefined ? [] : [f, v]; });

/** This binary, run as a person would run it. */
function atelier(args: readonly string[]): { out: string; said: string; ok: boolean } {
  const r = spawnSync(process.execPath, [...process.execArgv, process.argv[1], ...args, ...modelArgs()], { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  return { out: r.stdout ?? '', said: r.stderr ?? '', ok: r.status === 0 };
}

/** What the person gave with the build (--with), passed on to the piece it writes. */
const withArgs = (): string[] => argv.flatMap((a, i) => (a === '--with' && argv[i + 1] ? ['--with', argv[i + 1]] : a.startsWith('--with=') ? [a] : []));

/** How a run's one line on a change of model starts (cli/commands/invoke.ts, `checkedBinding`). */
export const OTHER_MODEL_NOTE = '(written ';
/** How the line that says the writer declined once and was asked again begins: `atelier run` passes it through too. */
export const DECLINED_NOTE = '(the model declined';

/** One piece written with the skill: its text and the run it is recorded as; null where nothing could be written. */
function write(name: string, request: string): { id: string; text: string; note: string | null } | { why: string } {
  const r = atelier(['invoke', '--skill', name, request, '--json', '--no-questions', ...withArgs()]);
  const at = r.out.lastIndexOf('\n{') >= 0 ? r.out.lastIndexOf('\n{') + 1 : r.out.indexOf('{');
  try {
    const j = JSON.parse(r.out.slice(at)) as { output?: unknown; invocationId?: unknown };
    if (typeof j.output === 'string' && j.output.trim() && typeof j.invocationId === 'string') return { id: j.invocationId, text: j.output.trim(), note: r.said.split('\n').find((l) => l.startsWith(OTHER_MODEL_NOTE)) ?? null };
  } catch { /* said below, in the run's own words */ }
  return { why: `${r.said}\n${r.out}`.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('{') && !l.startsWith('"')).pop()?.slice(0, 200) ?? 'the run said nothing' };
}


/**
 * THE GUIDED END OF A BUILD. Never fails the build: the skill is built before this starts, and anything that cannot be
 * done here is said in one line and left.
 */
export interface Understood {
  /** the steps of the person's method, in their words */
  readonly steps: readonly string[];
  /** steps their own pieces do not do, in their words */
  readonly disputed: readonly string[];
  /** the command that makes the disputed steps rules */
  readonly confirm?: string;
  /** how many pieces the person gave, where the build counted them */
  readonly given?: number;
}


/**
 * HOW THE PERSON WRITES, EACH POINT WITH WHERE IT WAS READ: how often they do it (counted over their pieces where it was,
 * else the reading's own word) and a sentence of theirs that shows it. The same lines at the build and on the skill
 * page (cli/commands/tend.ts): what was decided about their writing, beside the evidence, and nothing of how.
 */
export function howYouWrite(points: readonly PersonaPoint[], most: number): string[] {
  const clip = (t: string, n: number): string => { const x = t.replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };
  const often = (x: PersonaPoint): string => (x.rate ? `in ${x.rate.k} of the ${x.rate.n} pieces` : ({ ALWAYS: 'always', OFTEN: 'often', SOMETIMES: 'in some pieces', RARELY: 'rarely' } as const)[x.frequency]);
  const said = points.filter((x) => x.description.trim());
  return [...said.slice(0, most).flatMap((x) => [`    - ${clip(x.description, 160)}`, ...(x.quote.trim() ? [`        ${often(x)}, as in: "${clip(x.quote, 140)}"`] : [])]),
    ...(said.length > most ? [`    and ${said.length - most} more`] : [])];
}


/**
 * WHAT THE STANDARD HOLDS, IN TWO LINES, the same at the end of a build and on the skill page: how many of the rules code
 * checks on every piece, and how many are the person's to judge, each with one rule in their words. Counts the run plan
 * already has (core/plan/execution-plan.ts); nothing is computed for it.
 */
export function whatItHolds(std: Pick<StandardVersion, 'requirements'> & Partial<Pick<StandardVersion, 'qualifications'>>): string[] {
  const rules = planFor(std).rules;
  const eg = (xs: readonly { statement: string }[]): string => { const t = (xs[0]?.statement ?? '').replace(/\s+/g, ' ').trim().replace(/[.]$/, ''); return t.length > 70 ? `${t.slice(0, 69).trimEnd()}…` : t; };
  const checked = rules.filter((r) => r.check !== null); const judged = rules.filter((r) => r.check === null);
  return [
    ...(checked.length ? [`Checked by code on every piece: ${checked.length} of the ${rules.length} rules (for example: ${eg(checked)}).`] : []),
    ...(judged.length ? [`Yours to judge, shown beside every piece: ${judged.length} (for example: ${eg(judged)}).`] : []),
  ];
}
export async function guided(name: string, seen: Understood = { steps: [], disputed: [] }): Promise<void> {
  const L = { root: DATA, skillName: name };
  const io = lines();
  try {
    // 1. WHAT WAS UNDERSTOOD, in the person's words, from what the build kept.
    let card: PurposeCard | null = store.getCard(L);
    const voice = store.getVoice(L);
    // ONE SHORT SCREEN BEFORE THE PREVIEW: three habits, each with a sentence of theirs, and what this agent writes. The
    // method quoted back, the rule counts and the rest of the habits are on the skill page (atelier status --skill).
    const given = seen.given ?? voice?.corpusPieces ?? voice?.pieces?.length ?? 0;
    // cut at the end of a clause where one ends late enough, else at a word: never inside one
    const clip = (t: string, n: number): string => {
      const x = t.replace(/\s+/g, ' ').trim(); if (x.length <= n) return x;
      const head = x.slice(0, n); const at = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(': '));
      const word = head.lastIndexOf(' ');
      return at > n / 2 ? `${head.slice(0, at)}…` : `${(word > 0 ? head.slice(0, word) : head.slice(0, n - 1)).replace(/[,;:]$/, '')}…`;
    };
    const habits = (voice?.persona?.points ?? []).filter((x) => x.description.trim()).slice(0, 3);
    if (habits.length) {
      console.log(`\nHow ${given ? `these ${given} pieces are` : 'these pieces are'} written:`);
      for (const x of habits) console.log(`  - ${clip(x.description, 100)}${x.quote.trim() ? `\n      "${clip(x.quote, 90)}"` : ''}`);
    }
    const writes = card ? cardSentence(card) : '';
    if (writes) console.log(`\n${writes}`);
    if (seen.disputed.length) console.log(`(${seen.disputed.length === 1 ? 'One step' : `${seen.disputed.length} steps`} of your method ${seen.disputed.length === 1 ? 'is' : 'are'} not what your pieces do; your method decides. Details: atelier status --skill ${name})`);

    // WITH NO MODEL TO WRITE WITH, NOTHING IS PROMISED AND NOTHING IS ASKED: the skill is built from what could be
    // counted, and the one thing left to do is said, with the command. Never "ready" for a skill that cannot write yet.
    // A person who asked for no model (--no-model) is not then charged for a piece: the same end, said as their choice.
    if (argv.includes('--no-model')) {
      console.log(`\n"${name}" is built without a model, as you asked: from what can be counted in your pieces.`);
      console.log(`  Write with it: atelier run "<the task>" --skill ${name}   ·   read your pieces in full: the same command without --no-model`);
      return;
    }
    if (!canReach('target')) {
      console.log(`\n"${name}" is built, and cannot write yet: no model key is set.`);
      console.log('  Set one:   export ANTHROPIC_API_KEY=<your key>     (another provider: atelier models)');
      console.log('  Then run the same command again: your pieces are read in full, and you see a piece written.');
      return;
    }
    // BUILT AGAIN: a skill that has written before is not shown at work a second time, and nothing is asked again.
    if (store.listInvocations(L).length) {
      console.log(`\n"${name}" is built again. What you kept and corrected is still held.`);
      console.log(`  Write with it: atelier run "<the task>" --skill ${name}   ·   what it holds: atelier status --skill ${name}`);
      return;
    }
    const left = (): void => { console.log(`\n\n"${name}" is built. Nothing more was asked or kept here: the input ended. Try it: atelier run "<the task>" --skill ${name}`); };

    // 2. THE FEW THINGS ONLY THE PERSON CAN SAY: each field of the card nothing grounded. Enter leaves it unsaid.
    // WHAT THE BUILD READ IS A PROPOSAL, NEVER A FACT: pieces show how an author writes, not who this work is for, so
    // each one is shown and kept (enter) or replaced by the person. A card that is already theirs is not asked again.
    // ONE PROMPT: who reads the work and what for was shown above as read; enter keeps it, their words replace it.
    // ASKED ONLY WHERE THEIR OWN WORDS DID NOT SAY IT: the line they gave and their note are read with the pieces, and a
    // reader or a purpose found in those is theirs already.
    const asked = card?.request;
    if (card?.by !== 'you' && !card?.stated?.some((f) => f !== 'kind')) {
      const v = await io.ask(writes ? '  Enter to keep, or say it in your words: ' : '\nWho reads these, and what should they do or know after one? (enter skips) ');
      if (v === null) { left(); return; }
      // kept or replaced, it is the person's from here: said to the writer of every piece (cli/direct.ts). Their words
      // replace the whole line they were shown (kind, reader and purpose together), so nothing read stays beside them.
      if (v.trim()) card = { ...amendCard(card, `purpose=${v.trim().replace(/;/g, ',')}`), kind: null, reader: null };
      else if (card && cardLine(card)) card = { ...card, by: 'you' };
      if (card?.by === 'you') store.setCard(L, card);
    }

    // 3. THE PIECE THEY ASKED FOR, where the line they gave asks for one: written as every later run writes it, with
    // the editor's questions at a terminal. A line that only says what the work is asks for no piece, and none is
    // written: a preview on a subject taken from their pieces was a piece nobody asked for.
    // A PIECE WRITTEN HERE IS NEVER A REFERENCE. What the skill is written from is the pieces given: a draft the model
    // wrote teaches nothing about them, and enter is not approval. What does teach is how the person changes a draft:
    // said once, confirmed with a y, and from then on shown to the review of every piece.
    let corrections = 0;
    for (const request of asked ? [asked] : []) {
      let piece: ReturnType<typeof write>;
      if (process.stdin.isTTY && process.stdout.isTTY) {
        const was = new Set(store.listInvocations(L).map((x) => x.invocationId));
        console.log('');
        spawnSync(process.execPath, [...process.execArgv, process.argv[1], 'run', request, '--skill', name, ...withArgs(), ...modelArgs()], { env: process.env, stdio: 'inherit' });
        const got = store.listInvocations(L).filter((x) => !was.has(x.invocationId)).sort((x, y) => y.at.localeCompare(x.at))[0];
        piece = got?.output.trim() ? { id: got.invocationId, text: got.output.trim(), note: null } : { why: 'the run wrote nothing' };
        if ('why' in piece) continue;
      } else {
        console.log('\nYour piece:\nwriting…');
        piece = write(name, request);
        if ('why' in piece) { console.log(`  (it could not be written: ${piece.why})`); continue; }
        console.log(`\n${piece.text}\n`);
        if (piece.note) console.log(`${piece.note}\n`);
      }
      // ONE ROUND: what to change, said once; the piece is written again.
      const change = await io.ask('Anything to change? Say it in your words, or press enter to go on: ');
      if (change === null) break;
      if (!change.trim()) continue;
      atelier(['fix', change.trim()]);
      const after = [...store.listInvocations(L)].sort((x, y) => y.at.localeCompare(x.at))[0];
      if (!after || after.invocationId === piece.id || !after.output.trim()) { console.log('  (it could not be written again; atelier fix takes the same words later)'); continue; }
      console.log(`\nWritten again:\n\n${after.output.trim()}\n`);
      const yes = await io.ask('Is that the change you meant? (y: every later piece is corrected the same way / enter: no) ');
      if (yes === null) break;
      if (!/^y(es)?$/i.test(yes.trim())) continue;
      const edits = editPairs(piece.text, after.output.trim());
      if (!edits.length) { console.log('  (nothing changed between the two, so there is nothing to carry forward)'); continue; }
      const text = after.output.trim();
      const record: KeptPiece = { id: `k${createHash('sha256').update(text).digest('hex').slice(0, 8)}`, at: new Date().toISOString(), request, text, from: after.invocationId, edits, correctionOnly: true };
      store.setKept(L, [...store.getKept(L).filter((k) => k.id !== record.id), record]);
      corrections += edits.length;
    }
    console.log(`\n"${name}" is ready${corrections ? `: every new piece is reviewed against the ${corrections === 1 ? 'correction' : `${corrections} corrections`} you just made` : ''}.`);
    console.log(`  This is its first version. A change you make for every piece (atelier fix "<what was wrong>" --always) makes the next, and atelier status --skill ${name} shows what it holds and how to go back.`);
    console.log(`  Write with it: atelier run "<the task>"   ·   in Claude Code: /${name}   ·   in other tools: atelier setup`);
  } finally { io.close(); }
}
