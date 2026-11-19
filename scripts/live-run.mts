#!/usr/bin/env -S npx tsx
// scripts/live-run.mts — BEFORE A RELEASE: THE FRONT DOOR ON A REAL MODEL, AND A RECORD OF IT.
//
// The test suite runs offline, so it cannot see what a person sees when a real model writes. This script runs the
// built binary through the front door (new, run, verify, fix) on the repository's public fixtures and asserts on
// STATES, never on wording: an outcome was said, a figure that is not in the notes is something to look at, true
// sentences from the notes are not, a fix ends as a run does, and no word of the machinery reaches the person.
//
// It writes `release/live-run.json`: the commit it ran on, each scenario with what it found, and whether all held.
// `.github/workflows/release.yml` refuses to publish unless that record names a commit the tag differs from only in
// the record itself, the changelog and the version. Commit the record with the release.
//
//   npm run build && npm run live                       # the default provider, its key read from the environment
//   LIVE_ARGS="--provider openai-compatible --base-url <url> --model <name>" npm run live
//
// The key is read from the environment by the binary and is never printed, stored or logged here. A run costs model
// calls on your account (a build, one piece, one fix, two checks).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { kindOf, OUTCOME_SAID } from '../core/eval/wording.js';
import { methodDecides } from '../core/direct/prompt.js';
import * as store from '../core/state/store.js';
import type { Entry } from '../core/eval/record.js';

const ROOT = resolve(import.meta.dirname, '..');
const CLI = join(ROOT, 'dist/cli/atelier.mjs');
const FX = join(ROOT, 'tests/fixtures/reaction-case');
const OUT = process.env.LIVE_OUT ?? join(ROOT, 'release/live-run.json');
const EXTRA = (process.env.LIVE_ARGS ?? '').split(/\s+/).filter(Boolean);
if (!existsSync(CLI)) { console.error('live-run: dist is missing: run `npm run build` first.'); process.exit(2); }

/** Words of the machinery: none may reach the person, on either stream. */
const MACHINERY = /\b(BLOCKED|NEEDS[_ ]REVIEW|VERIFIED|SHIP(_LABELLED)?|OBSERVER_UNQUALIFIED|NOT_MACHINE_CHECKABLE|PARTLY_CHECKED|LISTED_FOR_YOU)\b|trusted-fail|untrusted-|judgement-unread|Delivery:|Judgement reader|compiled path|--pipeline|not yet qualified|has not qualified|is not qualified|Your range:/;
const OUTCOME = new RegExp(`^(${Object.values(OUTCOME_SAID).join('|')})\\.`, 'm');

const data = mkdtempSync(join(tmpdir(), 'atelier-live-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-live-proj-'));
const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
const cliIn = (dir: string) => (...a: string[]): { code: number; out: string; err: string } => {
  const r = spawnSync('node', [CLI, ...a], { encoding: 'utf8', cwd: dir, env: { ...env, ATELIER_PROJECT_DIR: dir }, maxBuffer: 1 << 26 });
  return { code: r.status ?? 1, out: r.stdout, err: r.stderr };
};
const cli = cliIn(proj);
interface Scenario { readonly name: string; readonly pass: boolean; readonly found: string }
const scenarios: Scenario[] = [];
const check = (name: string, pass: boolean, found: string): void => { scenarios.push({ name, pass, found: pass ? '' : found.replace(/\s+/g, ' ').trim().slice(0, 300) }); console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${pass ? '' : `\n      ${found.slice(0, 600)}`}`); };
const firstLine = (s: string, re: RegExp): string => s.split('\n').find((l) => re.test(l)) ?? '(none)';
const entriesOf = (json: string): Entry[] => { try { return ((JSON.parse(json.slice(json.indexOf('{'))) as { record?: { entries?: Entry[] } }).record?.entries) ?? []; } catch { return []; } };

const SKILL = 'live-check';
const notes = join(FX, 'points.md');
const noteLines = readFileSync(notes, 'utf8').split('\n').map((l) => l.replace(/^- /, '').trim()).filter(Boolean);

// 1. THE BUILD, as a person runs it once.
const built = cli('new', join(FX, 'voice'), '--method', join(FX, 'rules.md'), '--name', SKILL, '--yes', ...EXTRA);
const skillFile = join(proj, '.claude/skills', SKILL, 'SKILL.md');
check('build: the skill is built and installed', built.code === 0 && existsSync(skillFile), `exit ${built.code}; ${built.err.split('\n').find((l) => l.startsWith('atelier: ')) ?? ''}`);
check('build: nothing of the machinery is said', !MACHINERY.test(built.out), firstLine(built.out, MACHINERY));
check('build: the installed skill says which source decides', existsSync(skillFile) && readFileSync(skillFile, 'utf8').includes(methodDecides('mine')), 'the sentence is not in SKILL.md');

// 2. A PIECE, from notes, in the short view a person reads.
const ran = cli('run', 'Write a post for the growers on this week\'s vote about the wharf, and what we could do next.', '--skill', SKILL, '--with', `notes=${notes}`, '--no-questions', ...EXTRA);
check('run: a piece is handed over with one of the three outcomes', OUTCOME.test(ran.out) && ran.out.trim().length > 200, `exit ${ran.code}; ${ran.err.split('\n').find((l) => l.startsWith('atelier: ')) ?? firstLine(ran.out, /Checked:/)}`);
check('run: nothing of the machinery is said, on either stream', !MACHINERY.test(`${ran.out}\n${ran.err}`), firstLine(`${ran.out}\n${ran.err}`, MACHINERY));

// 3. A FIGURE THAT IS NOT IN THE NOTES is something to look at; 4. TRUE SENTENCES FROM THE NOTES are not.
const truthful = `# The vote, and the second wharf\n\n${noteLines.slice(0, 6).join(' ')}`;
const planted = `${truthful} A survey last year found that 73 percent of residents wanted the wharf kept open.`;
writeFileSync(join(proj, 'true.md'), truthful); writeFileSync(join(proj, 'planted.md'), planted);
const verify = (file: string, ...more: string[]): { code: number; out: string; err: string } => cli('verify', '--skill', SKILL, file, '--with', `notes=${notes}`, ...more, ...EXTRA);
const seen = verify('planted.md'); const seenKinds = entriesOf(verify('planted.md', '--json').out);
const specifics = (es: readonly Entry[]): Entry | undefined => es.find((e) => e.id === 'specifics');
const plantedKind = specifics(seenKinds) ? kindOf(specifics(seenKinds)!) : null;
check('verify: a planted figure is to look at or broken, on the record', plantedKind === 'look' || plantedKind === 'broken', `the specifics entry is ${String(plantedKind)}`);
check('verify: the planted figure is shown in the short view', seen.out.includes('73 percent') && OUTCOME.test(seen.out) && !/^Ready\./m.test(seen.out), firstLine(seen.out, OUTCOME));
check('verify: nothing of the machinery is said', !MACHINERY.test(`${seen.out}\n${seen.err}`), firstLine(`${seen.out}\n${seen.err}`, MACHINERY));
const clean = entriesOf(verify('true.md', '--json').out);
const cleanKind = specifics(clean) ? kindOf(specifics(clean)!) : null;
check('verify: sentences taken from the notes are not flagged', cleanKind !== 'look' && cleanKind !== 'broken', `the specifics entry is ${String(cleanKind)}: ${specifics(clean)?.observation.evidence ?? ''}`);

// 5. A FIX of the piece just written ends as a run does.
const fixed = cli('fix', 'make the opening one sentence shorter', '--skill', SKILL, ...EXTRA);
check('fix: the piece is handed back with one of the three outcomes', OUTCOME.test(fixed.out), `exit ${fixed.code}; ${fixed.err.split('\n').find((l) => l.startsWith('atelier: ')) ?? '(no outcome line)'}`);
check('fix: nothing of the machinery is said, on either stream', !MACHINERY.test(`${fixed.out}\n${fixed.err}`), firstLine(`${fixed.out}\n${fixed.err}`, MACHINERY));

// 6. THE METHOD AND THE PIECES DISAGREE. The pieces open on a scene; the method note says to open on the decision and names
// who reads the work. What the build understood stands on the author's words, the host and the writer are both given the
// method, and both are told which source decides.
const CONFLICT = 'live-method';
// a second skill is built from a project folder of its own: one project holds one standard
const proj2 = mkdtempSync(join(tmpdir(), 'atelier-live-proj2-')); const cli2 = cliIn(proj2);
const conflictBuilt = cli2('new', join(FX, 'voice'), '--method', join(ROOT, 'tests/fixtures/method-conflict/method.md'), '--name', CONFLICT, '--yes', ...EXTRA);
const L = { root: data, skillName: CONFLICT };
const card = conflictBuilt.code === 0 ? store.getCard(L) : null;
check('method: the build read who the work is for from the method note', card?.reader != null && card.by === 'model', `exit ${conflictBuilt.code}; ${conflictBuilt.err.split('\n').find((l) => l.startsWith('atelier: ')) ?? ''} the card is ${JSON.stringify(card)}`);
const conflictSkill = join(proj2, '.claude/skills', CONFLICT, 'SKILL.md');
check('method: the installed skill is told which source decides', existsSync(conflictSkill) && readFileSync(conflictSkill, 'utf8').includes(methodDecides('mine')), 'the sentence is not in SKILL.md');
const conflictRun = cli2('run', 'Write the note on whether to repair the old wharf or lease the second one.', '--skill', CONFLICT, '--with', `notes=${notes}`, '--no-questions', ...EXTRA);
const served = (store.listInvocations(L)[0] as { direct?: { method?: boolean } } | undefined)?.direct;
check('method: the writer was given the method, on the record', conflictRun.code === 0 && served?.method === true, `exit ${conflictRun.code}; the record's direct run is ${JSON.stringify(served ?? null).slice(0, 200)}`);
check('method: nothing of the machinery is said', !MACHINERY.test(`${conflictBuilt.out}\n${conflictRun.out}\n${conflictRun.err}`), firstLine(`${conflictBuilt.out}\n${conflictRun.out}\n${conflictRun.err}`, MACHINERY));

// 7. AT A TERMINAL THE QUESTIONS COME BEFORE THE PIECE. Driven through a pseudo-terminal, since the point is what happens
// when a person is there. Where there is none to be had (no `script -qec`), the scenario is recorded as not run.
const pty = process.platform === 'linux' && spawnSync('script', ['-qec', 'true', '/dev/null']).status === 0;
if (pty) {
  const before = store.listInvocations({ root: data, skillName: SKILL }).length;
  const q = (x: string): string => `'${x.replace(/'/g, `'\\''`)}'`;
  const cmd = ['node', CLI, 'run', 'Write a post about the wharf.', '--skill', SKILL, ...EXTRA].map(q).join(' ');
  const t = spawnSync('script', ['-qec', cmd, '/dev/null'], { encoding: 'utf8', cwd: proj, env, input: 'a\na\na\na\na\n', maxBuffer: 1 << 26 });
  const recs = store.listInvocations({ root: data, skillName: SKILL });
  const asked = (recs[0] as { direct?: { questions?: { asked?: readonly string[]; answered?: readonly string[] } } } | undefined)?.direct?.questions;
  check('terminal: a run was written and recorded', t.status === 0 && recs.length === before + 1, `exit ${t.status}; ${recs.length - before} new record(s)`);
  check('terminal: the open questions were asked and the typed answers are on the record', (asked?.asked?.length ?? 0) > 0 && (asked?.answered?.length ?? 0) > 0, `asked ${JSON.stringify(asked?.asked ?? [])}, answered ${JSON.stringify(asked?.answered ?? [])}`);
  check('terminal: nothing of the machinery is said', !MACHINERY.test(t.stdout), firstLine(t.stdout, MACHINERY));
}
const notRun = pty ? [] : ['terminal: questions before the piece (no pseudo-terminal on this machine)'];

const git = (...a: string[]): string => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; } };
const record = {
  schema: 1, commit: git('rev-parse', 'HEAD'), // the record itself is no change to the code: a second run over a committed record is not a dirty tree
  dirty: git('status', '--porcelain', '--untracked-files=no', '--', '.', ':(exclude)release/live-run.json') !== '',
  at: new Date().toISOString(), node: process.version, version: (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version,
  // a run against a scripted or local stand-in is not a live run, and the release check refuses it
  scripted: process.env.LIVE_SCRIPTED === '1',
  pass: scenarios.every((s) => s.pass), scenarios, notRun,
};
for (const d of [data, proj, proj2]) rmSync(d, { recursive: true, force: true });
mkdirSync(resolve(OUT, '..'), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(record, null, 1)}\n`);
console.log(`\n${record.pass ? 'All held.' : `${scenarios.filter((s) => !s.pass).length} did not hold.`} Record: ${OUT}${record.dirty ? '\n(the working tree had uncommitted changes: commit them and run again before a release)' : ''}`);
process.exit(record.pass ? 0 : 1);
