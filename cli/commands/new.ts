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
// person who quit at the review screen does not pay for discovery twice. It refuses, rather than
// continues, when the second call names a different folder: continuing would build from work the
// person did not just point at.

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { die, argv, flag, positional, loadSession, saveSession, assertReachable, sourceProvenance, runFile, DATA } from '../runtime.js';
import { readJson } from '../../core/state/read-json.js';
import { modeFromIntent, type SkillMode } from '../../core/ratification/suggest.js';
import * as store from '../../core/state/store.js';
import { measure } from '../../core/observers/registry.js';
import { normalizeClass } from '../../core/observers/doc-class.js';
import { floorDimensions, proposeMargins, buildContract } from '../../core/distinctiveness/measured.js';
import { extract } from '../../core/intake/extract.js';
import { intake } from './intake.js';
import { discover } from './discover.js';
import { review } from './review.js';
import { ratifyClose } from './ratify.js';
import { build } from './build.js';

const MODES: readonly SkillMode[] = ['GENERATE', 'GUARD', 'RESPOND'];

/** The folder the sealed corpus was read from, for runs that predate recording it. */
const sealedFrom = (): string | null => {
  const f = runFile('corpus-paths.json');
  if (!existsSync(f)) return null;
  const files = readJson<{ id: string; path: string }[]>(f, { kind: 'array', what: 'the sealed corpus paths' });
  const first = files[0] as { id: string; path: string } | undefined;
  return first ? first.path.slice(0, first.path.length - first.id.length).replace(/\/$/, '') : null;
};

export async function newSkill(): Promise<void> {
  const corpus = positional([]) ?? die('usage: atelier new <folder-of-your-best-work> "<what the skill is for>"\n'
    + '  e.g.  atelier new ./posts "write me a blog post in the voice and style of these"');
  const path = resolve(corpus);
  if (!existsSync(path)) die(`there is nothing at ${path}.`);
  let s = loadSession();

  // ── THE SAME RUN, OR A REFUSAL — NEVER A SILENT SWITCH ────────────────────────────────────────
  const from = s.source ?? sealedFrom();
  if (s.evidence && from && resolve(from) !== path) {
    die(`this project's run was made from ${from}, not ${path}.\n`
      + '  To continue that run, point at the same folder.\n'
      + '  To build a different skill, run this in another project directory, or start over here: atelier abort');
  }

  const typed = flag('--intent') ?? positional([corpus]) ?? null;
  const intent = typed ?? s.intent?.text ?? null;
  const declared = flag('--mode')?.toUpperCase();
  if (declared && !MODES.includes(declared as SkillMode)) die(`--mode must be one of ${MODES.map((m) => m.toLowerCase()).join(', ')}.`);
  const read = modeFromIntent(intent ?? '');
  const mode: SkillMode = (declared as SkillMode | undefined) ?? s.intent?.mode ?? read.mode;
  if (s.intent && typed && typed !== s.intent.text) {
    console.log(`(this run is for "${s.intent.text}"; the new wording is ignored — start over with atelier abort to change it)`);
  }
  const name = flag('--name') ?? s.skillName ?? basename(path);
  // The kind of document this work is, kept for the skill from the first call: the build that uses it
  // may be a later continuation that does not repeat the flag.
  const cls = flag('--class');
  if (cls) store.setDocClass({ root: DATA, skillName: name }, cls.trim().toLowerCase() === 'none' ? null : normalizeClass(cls));

  process.env.ATELIER_ORCHESTRATED = '1';
  // The limit the person set is theirs for the whole run: a continuation without --cap keeps it.
  const cap = flag('--cap') ?? s.cap ?? null;
  if (cap && !argv.includes('--cap')) argv.push('--cap', cap);
  if (cap && cap !== s.cap && s.run.state !== 'EMPTY') { saveSession({ ...s, cap }); s = loadSession(); }

  // ── START, OR CONTINUE ──────────────────────────────────────────────────────────────────────
  if (s.run.state === 'EMPTY' || !s.evidence) {
    assertReachable('discovery');
    if (!intent) console.log('No purpose given, so rules are weighed for producing new work. Say what it is for as a second argument.\n');
    else console.log(`For: "${intent}" — ${declared ? `${mode.toLowerCase()}, as you declared` : read.why}.\n`);
    // A held-out check without having to know what one is: some of the work is set aside before
    // anything reads it (when there are six or more pieces), unless the person named their own.
    if (!argv.includes('--reserve')) argv.push('--auto-reserve');
    intake(path, flag('--work-type') ?? 'writing');
    s = loadSession();
    saveSession({ ...s, source: path, ...(cap ? { cap } : {}), ...(intent ? { intent: { text: intent, mode } } : {}) });
    s = loadSession();
  } else {
    console.log(`Continuing the run already in this project (state ${s.run.state}).\n`);
    if (intent && !s.intent) { saveSession({ ...s, intent: { text: intent, mode } }); s = loadSession(); }
  }

  if (s.run.state === 'CORPUS_SEALED' || s.run.state === 'LIST_SEALED') {
    console.log('\nReading your work…');
    await discover();
    s = loadSession();
  }

  if (s.run.state === 'PROPOSED') {
    if (!s.proposals.length && !s.decided.length) {
      console.log('Discovery proposed no rules from this work, so there is nothing to build. Add one in your own words:'
        + '\n  atelier add --statement "<the rule>" --kind GENERATIVE|BOUNDARY    then run this again');
      return;
    }
    // Someone else's public work goes through the same screen. Accepting there ADOPTS a rule for the
    // person's own skill — recorded as USER_ADOPTED, never as that author's ratified standard (the
    // ceiling in `decide` enforces it) — and the person decides which adopted rules instruct.
    if (sourceProvenance() === 'PUBLIC_BEHAVIOUR_INFERRED') {
      console.log(`These rules were read from ${s.publicSource ?? 'someone else\'s public work'}. Accepting ADOPTS them for your skill;`
        + ' it does not make them that author\'s standard, and the record will always say where they came from.\n');
    }
    if (!(await review())) return;
    s = loadSession();
    if (!s.decided.some((d) => d.authority !== 'EXPERT_REJECTED')) {
      console.log('\nEvery rule was rejected, so there is nothing to build.'
        + '\n  Add one in your own words:  atelier add --statement "<the rule>" --kind GENERATIVE|BOUNDARY   then run this again'
        + '\n  Or start over:              atelier abort');
      return;
    }
    // The purpose becomes how a host decides to load the skill at all — from the run, so a second
    // call without the sentence still carries it.
    if (intent && !argv.includes('--description')) argv.push('--description', `Use when asked to: ${intent.replace(/[.\s]+$/, '')}.`);
    ratifyClose();
    s = loadSession();
  }

  if (s.run.state === 'RATIFIED') {
    build(name);
    s = loadSession();
  }

  if (s.run.state !== 'BUILT') return;
  const built = s.skillName ?? name;
  heldOutCheck(built);
  proposeFloor(built);
  console.log(`\nUse it:   /${built} <your task>          (in Claude Code)`);
  console.log(`          atelier invoke --skill ${built} "<your task>"`);
  console.log(`Check any text against it:  atelier verify --skill ${built} <file>`);
  console.log(`Correct:  atelier fix "<what was wrong>"`);
  if (s.reservation?.reserved.length) {
    console.log(`Compare it blind against the ${s.reservation.reserved.length} piece(s) held back:  atelier reference --skill ${built}`);
  }
}

/**
 * THE FREE CHECK, RUN EVERY TIME. The measured rules are counted against the pieces that were held
 * back before anything read them: work the author wrote and discovery never saw. A target the
 * author's own unseen work misses is a target that describes the pieces it was counted from, and the
 * person should hear that now rather than from a rewrite loop later. Costs nothing: no model is called.
 */
function heldOutCheck(skill: string): void {
  const s = loadSession();
  const reserved = s.reservation?.reserved ?? [];
  const L: store.StoreLayout = { root: DATA, skillName: skill };
  const active = store.getActive(L);
  const sv = active ? store.getSkillVersion(L, active) : null;
  const v = sv ? store.getStandard(L, sv.standardVersionHash) : null;
  const measured = (v?.requirements ?? []).filter((r) => r.measurement && r.authority !== 'EXPERT_REJECTED');
  if (!reserved.length || !measured.length) return;
  console.log(`\nChecked against the ${reserved.length} piece(s) held back before anything read them:`);
  for (const r of measured) {
    const m = r.measurement;
    if (!m) continue;
    const results = reserved.map((u) => measure(u.artifact, m));
    const applicable = results.filter((x) => x.verdict !== 'NOT_APPLICABLE');
    const met = applicable.filter((x) => x.verdict === 'MET').length;
    console.log(`  ${r.requirementId}  ${applicable.length ? `${met} of ${applicable.length} meet it` : 'not measurable on these pieces'}   ${r.statement.slice(0, 70)}`);
  }
}

/**
 * THE FLOOR'S MARGINS, PROPOSED WHILE THE CORPUS IS AT HAND. Each measured rule's margin is half the
 * spread of the author's own pieces on it (core/distinctiveness/measured.ts); every dimension starts
 * OBSERVE, so nothing blocks until the owner says so. Costs nothing: no model is called. Only the author's
 * own pieces count; reserved ones are left out, held back for the blind comparison.
 */
function proposeFloor(skill: string): void {
  const L: store.StoreLayout = { root: DATA, skillName: skill };
  if (store.getFloor(L).contract) return;
  const active = store.getActive(L);
  const sv = active ? store.getSkillVersion(L, active) : null;
  const v = sv ? store.getStandard(L, sv.standardVersionHash) : null;
  if (!v) return;
  const dims = floorDimensions(v);
  const pathsFile = runFile('corpus-paths.json');
  if (!dims.length || !existsSync(pathsFile)) return;
  const reserved = new Set((loadSession().reservation?.reserved ?? []).map((u) => u.unitId));
  const files = readJson<{ id: string; path: string; kind?: string }[]>(pathsFile, { kind: 'array', what: 'the sealed corpus path list' });
  // The author's own work only: not a "before"/rejected example, a methodology note or an existing skill,
  // each of which would widen the spread the margins are read from. (An older list has no kinds: all count.)
  const texts = files.filter((f) => !reserved.has(f.id) && (f.kind ?? 'GOLDEN') === 'GOLDEN')
    .flatMap((f) => { const r = extract(f.path); return r.ok ? [(r as { text: string }).text] : []; });
  const proposals = proposeMargins(dims, texts);
  if (!proposals.length) return;
  store.setFloor(L, { ...store.getFloor(L), contract: buildContract(proposals, dims, null) });
  console.log(`\nRegression floor: margins proposed for ${proposals.length} measured rule(s) from your own spread, all watched, none blocking yet.`);
  console.log(`  See and set it:  atelier floor --skill ${skill}`);
}
