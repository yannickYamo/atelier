// cli/commands/new.ts — THE WHOLE JOURNEY, FROM A FOLDER AND A SENTENCE.
//
//   atelier new ./my-best-work "write me a blog post in the voice and style of these"
//
// Reads the work (holding some back to check against), finds the decisions in it, puts them on one
// screen with the ruling the evidence suggests, and — once the person accepts — mints the standard,
// compiles it and installs the skill. The person makes exactly one kind of decision, about what their
// standard says; everything else is machinery that runs itself.
//
// Re-entrant: run it again in the same project and it continues from wherever the run stopped, so a
// person who quit at the review screen does not pay for discovery twice.

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { die, argv, flag, positional, loadSession, saveSession, assertReachable, sourceProvenance } from '../runtime.js';
import { modeFromIntent } from '../../core/ratification/suggest.js';
import { intake } from './intake.js';
import { discover } from './discover.js';
import { review } from './review.js';
import { ratifyClose } from './ratify.js';
import { build } from './build.js';
import { adoptAllFromPublicSource } from './improve.js';

export async function newSkill(): Promise<void> {
  const corpus = positional([]) ?? die('usage: atelier new <folder-of-your-best-work> "<what the skill is for>"\n'
    + '  e.g.  atelier new ./posts "write me a blog post in the voice and style of these"');
  const intent = flag('--intent') ?? positional([corpus]) ?? null;
  const path = resolve(corpus);
  if (!existsSync(path)) die(`there is nothing at ${path}.`);
  const name = flag('--name') ?? basename(path);
  const { mode, why } = modeFromIntent(intent ?? '');

  process.env.ATELIER_ORCHESTRATED = '1';
  let s = loadSession();

  // ── START, OR CONTINUE ──────────────────────────────────────────────────────────────────────
  if (s.run.state === 'EMPTY' || !s.evidence) {
    assertReachable('discovery');
    if (!intent) console.log('No purpose given, so rules are weighed for producing new work. Say what it is for as a second argument.\n');
    else console.log(`For: "${intent}" — ${why}.\n`);
    // A held-out check without having to know what one is: some of the work is set aside before
    // anything reads it, unless the person named their own.
    if (!argv.includes('--reserve')) argv.push('--auto-reserve');
    intake(path, flag('--work-type') ?? 'writing');
    s = loadSession();
  } else {
    console.log(`Continuing the run already in this project (state ${s.run.state}).\n`);
  }
  if (intent) { saveSession({ ...s, intent: { text: intent, mode } }); s = loadSession(); }

  if (s.run.state === 'CORPUS_SEALED' || s.run.state === 'LIST_SEALED') {
    console.log('\nReading your work…');
    await discover();
    s = loadSession();
  }

  if (s.run.state === 'PROPOSED') {
    if (sourceProvenance() === 'PUBLIC_BEHAVIOUR_INFERRED') adoptAllFromPublicSource();
    else if (!(await review())) return;
    // The purpose becomes how a host decides to load the skill at all.
    if (intent && !argv.includes('--description')) argv.push('--description', `Use when asked to: ${intent.replace(/[.\s]+$/, '')}.`);
    ratifyClose();
    s = loadSession();
  }

  if (s.run.state === 'RATIFIED') {
    build(name);
    s = loadSession();
  }

  if (s.run.state !== 'BUILT') return;
  console.log(`\nUse it:   /${name} <your task>          (in Claude Code)`);
  console.log(`          atelier invoke --skill ${name} "<your task>"`);
  console.log(`Correct:  atelier fix "<what was wrong>"`);
  if (s.reservation?.reserved.length) {
    console.log(`Test it blind against the ${s.reservation.reserved.length} piece(s) held back:  atelier reference --skill ${name}`);
  }
}
