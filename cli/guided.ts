// atelier/cli/guided.ts — THE END OF A BUILD, FOR A PERSON AT A TERMINAL: what was understood, the few things only they
// can say, two pieces written with the new skill, and one round of what to change. Then the skill is ready.
//
// One pass, never a loop: a person says what is wrong with a sample once, the piece is written again, and both are kept
// as theirs. Everything here is made of what already exists: the purpose card (core/direct/card.ts), a run of the skill
// as a person would make it (`atelier invoke`), `atelier fix` on that run and `atelier keep` of what they accept. Kept
// pieces are written from first on every later run (cli/direct.ts), so what the person accepted here is what the skill
// is held to next.
//
// Nothing here waits where nobody is: it runs only at a terminal (or where ATELIER_GUIDED=1 says a person's lines come
// on stdin, as a test does), never under --yes, --json or a host.

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { DATA, argv, flag, canReach } from './runtime.js';
import * as store from '../core/state/store.js';
import { cardLine, amendCard, type PurposeCard } from '../core/direct/card.js';
import { titleOf } from '../core/direct/pieces.js';

/** How many pieces the build writes for the person to read. */
export const SAMPLES = 2;
/** The most the build asks before it writes. */
export const MAX_BUILD_QUESTIONS = 5;

/** Whether a person is there to read and answer: a terminal, and nothing typed that says "do not ask". */
export const guidedHere = (): boolean =>
  !argv.includes('--yes') && !argv.includes('--json') && !argv.includes('--review')
  && (process.env.ATELIER_GUIDED === '1' || (process.stdin.isTTY && process.stdout.isTTY));

/** The person's lines, one at a time; an ended input answers every later question with nothing (enter). */
function lines(): { ask: (q: string) => Promise<string>; close: () => void } {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const waiting: ((s: string) => void)[] = []; const ready: string[] = []; let ended = false;
  rl.on('line', (l) => { const w = waiting.shift(); if (w) w(l); else ready.push(l); });
  rl.on('close', () => { ended = true; for (const w of waiting.splice(0)) w(''); });
  return {
    // where the lines come from a pipe nothing echoes them: the line is ended here, so each question stands alone
    ask: async (q) => {
      process.stdout.write(q);
      const a = ready.shift() ?? (ended ? '' : await new Promise<string>((ok) => { waiting.push(ok); }));
      if (!process.stdin.isTTY) process.stdout.write('\n');
      return a;
    },
    close: () => { rl.close(); },
  };
}

/** The model the person named on this command, passed on to the runs made here; nothing named, nothing passed. */
const modelArgs = (): string[] => ['--provider', '--base-url', '--model'].flatMap((f) => { const v = flag(f); return v === undefined ? [] : [f, v]; });

/** This binary, run as a person would run it. */
function atelier(args: readonly string[]): { out: string; said: string; ok: boolean } {
  const r = spawnSync(process.execPath, [...process.execArgv, process.argv[1], ...args, ...modelArgs()], { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  return { out: r.stdout ?? '', said: r.stderr ?? '', ok: r.status === 0 || r.status === 1 };
}

/** One piece written with the skill: its text and the run it is recorded as; null where nothing could be written. */
function write(name: string, request: string): { id: string; text: string } | { why: string } {
  const r = atelier(['invoke', '--skill', name, request, '--json', '--no-questions']);
  const at = r.out.lastIndexOf('\n{') >= 0 ? r.out.lastIndexOf('\n{') + 1 : r.out.indexOf('{');
  try {
    const j = JSON.parse(r.out.slice(at)) as { output?: unknown; invocationId?: unknown };
    if (typeof j.output === 'string' && j.output.trim() && typeof j.invocationId === 'string') return { id: j.invocationId, text: j.output.trim() };
  } catch { /* said below, in the run's own words */ }
  return { why: `${r.said}\n${r.out}`.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('{') && !l.startsWith('"')).pop()?.slice(0, 200) ?? 'the run said nothing' };
}

/** What the card does not say yet, asked in the person's terms: the fields a reading could not ground. */
const CARD_ASKS: readonly { readonly field: 'kind' | 'reader' | 'purpose'; readonly ask: string }[] = [
  { field: 'kind', ask: 'What are these pieces (a blog post, a newsletter, a memo)?' },
  { field: 'reader', ask: 'Who reads them?' },
  { field: 'purpose', ask: 'What should a reader do or know after reading one?' },
];

/** The requests the samples answer: the ones the person's own pieces carried, then one in the line of a piece of theirs. */
function sampleRequests(L: store.StoreLayout, first: string): string[] {
  const voice = store.getVoice(L);
  const own = (voice?.pieceRequests ?? []).filter((r): r is string => Boolean(r?.trim()));
  const titles = (voice?.pieces ?? []).map(titleOf).filter(Boolean);
  const inLine = titles.map((t) => `Write a new piece on a subject close to "${t}", without repeating it.`);
  return [...new Set([first.trim(), ...own, ...inLine].filter(Boolean))].slice(0, SAMPLES);
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
}

/** A list a person reads at a glance: the first few, and how many more. */
const few = (xs: readonly string[], most: number): string[] => [...xs.slice(0, most).map((x) => `    - ${x.replace(/\s+/g, ' ').trim()}`), ...(xs.length > most ? [`    and ${xs.length - most} more`] : [])];

export async function guided(name: string, seen: Understood = { steps: [], disputed: [] }): Promise<void> {
  const L = { root: DATA, skillName: name };
  const io = lines();
  try {
    // 1. WHAT WAS UNDERSTOOD, in the person's words, from what the build kept.
    let card: PurposeCard | null = store.getCard(L);
    const voice = store.getVoice(L);
    // Only what was read is said: a thing the pieces did not give is asked next, never reported as a failure.
    console.log('\nWhat I understood');
    if (voice?.pieces?.length) console.log(`  Your pieces: ${voice.corpusPieces ?? voice.pieces.length}${voice.lengthSpan ? `, ${voice.lengthSpan[0]} to ${voice.lengthSpan[1]} words each` : ''}.`);
    if (card && cardLine(card)) console.log(`  ${cardLine(card)}.`);
    const sound = (voice?.persona?.points ?? []).map((pt) => pt.description).filter(Boolean);
    if (sound.length) { console.log('  How you write:'); for (const l of few(sound, 4)) console.log(l); }
    if (seen.steps.length) { console.log(`  Your method, which every piece follows:`); for (const l of few(seen.steps, 6)) console.log(l); }
    if (seen.disputed.length) {
      console.log(`  ${seen.disputed.length === 1 ? 'One step of your method is' : `${seen.disputed.length} steps of your method are`} not what your own pieces do. The writer is told ${seen.disputed.length === 1 ? 'it' : 'them'}, and no piece is held back for ${seen.disputed.length === 1 ? 'it' : 'them'}:`);
      for (const l of few(seen.disputed, 3)) console.log(l);
      if (seen.confirm) console.log(`    To hold every piece to ${seen.disputed.length === 1 ? 'it' : 'them'}: ${seen.confirm}`);
    }

    // WITH NO MODEL TO WRITE WITH, NOTHING IS PROMISED AND NOTHING IS ASKED: the skill is built from what could be
    // counted, and the one thing left to do is said, with the command. Never "ready" for a skill that cannot write yet.
    if (!canReach('target')) {
      console.log(`\n"${name}" is built, and cannot write yet: no model key is set.`);
      console.log('  Set one:   export ANTHROPIC_API_KEY=<your key>     (another provider: atelier models)');
      console.log('  Then run the same command again: your pieces are read in full, and you see two pieces written.');
      return;
    }

    // 2. THE FEW THINGS ONLY THE PERSON CAN SAY: each field of the card nothing grounded. Enter leaves it unsaid.
    const open = CARD_ASKS.filter((a) => !card?.[a.field]).slice(0, MAX_BUILD_QUESTIONS);
    if (open.length) console.log(`\n${open.length === 1 ? 'One question' : `${open.length} questions`} before I write, so the pieces fit their reader (enter skips):`);
    const said: string[] = [];
    for (const a of open) { const v = (await io.ask(`  ${a.ask} `)).trim(); if (v) said.push(`${a.field}=${v.replace(/;/g, ',')}`); }
    if (said.length) { card = amendCard(card, said.join('; ')); store.setCard(L, card); console.log(`  Got it. ${cardLine(card)}.`); }

    // 3. TWO PIECES, written as every later run writes them.
    const first = (await io.ask(`\nA first request to try it on (enter: I choose from your pieces): `)).trim();
    const requests = sampleRequests(L, first);
    if (!requests.length) { console.log('No sample was written: none of your pieces carries a title or a request to start from.'); return; }
    let kept = 0;
    for (const [i, request] of requests.entries()) {
      console.log(`\nSample ${i + 1} of ${requests.length}: ${request}\nwriting…`);
      const piece = write(name, request);
      if ('why' in piece) { console.log(`  (this sample could not be written: ${piece.why})`); continue; }
      console.log(`\n${piece.text}\n`);
      // 4. ONE ROUND: what to change, said once; the piece is written again and the answer is kept as theirs.
      const change = (await io.ask('Anything to change? Say it in your words, or press enter to keep it: ')).trim();
      let id = piece.id;
      if (change) {
        atelier(['fix', change]);
        const after = [...store.listInvocations(L)].sort((a, b) => b.at.localeCompare(a.at))[0];
        if (after && after.invocationId !== piece.id && after.output.trim()) { id = after.invocationId; console.log(`\nWritten again:\n\n${after.output.trim()}\n`); }
        else console.log('  (it could not be written again; the first version is kept, and atelier fix takes the same words later)');
      }
      if (atelier(['keep', '--skill', name, id]).ok) kept += 1;
    }
    if (!kept) { console.log(`\n"${name}" is built, and no piece was written here. Try it: atelier run "<the task>" --skill ${name}`); return; }
    console.log(`\n"${name}" is ready${kept ? `: ${kept} piece${kept === 1 ? '' : 's'} you accepted ${kept === 1 ? 'is' : 'are'} kept, and every new piece is written from ${kept === 1 ? 'it' : 'them'} first` : ''}.`);
    console.log(`  Write with it: atelier run "<the task>"   ·   in Claude Code: /${name}   ·   in other tools: atelier setup`);
  } finally { io.close(); }
}
