// cli/commands/evolve.ts — `atelier evolve`: THE SKILL IMPROVES ITSELF ON THE OWNER'S OWN REQUIREMENTS, UNATTENDED.
//
//   atelier evolve --skill <name> --briefs <folder> [--rounds 3] [--cap <usd>] [--dry-run] [--json]
//   atelier evolve --skill <name> --rollback
//
// The owner gives briefs: one file each, the task in its front matter (`request:`), its material in a folder
// `<brief>.material` beside it. Nothing else is asked. Some briefs are set aside before the first run. The skill is
// run on the rest twice as it stands (the noise band), then one change at a time to how its method is carried is
// tried and kept only when it is plainly better (core/evolve/loop.ts). At the end the skill as it started and as the
// search left it are both run on the briefs set aside, and the change is adopted only if it is no worse there.
//
// THE STANDARD IS NEVER IN THE SEARCH. What changes is how many drafts are written and what the writer is told its
// earlier drafts left out, in the owner's own words. Every run here is marked as a test, so nothing else learns
// from it. Every search is kept in a file of its own, adopted or not.
import { execFile, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../../core/state/store.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { readJson } from '../../core/state/read-json.js';
import { readCase } from '../corpus.js';
import { releaseFor } from '../fidelity.js';
import { DATA, argv, die, flag, numericFlag, skillArg, runFile } from '../runtime.js';
import { MIN_BRIEFS, NOTE_HEAD, allowance, carryKey, leak, noiseBand, readRun, proposals, renderEvolve, rule, scoreOf, splitBriefs,
  type Brief, type BriefResult, type Carry, type EvolveRecord, type Scored, type Trial } from '../../core/evolve/loop.js';

const HANDED_ON = ['--provider', '--base-url', '--model', '--target-model', '--target-provider', '--target-base-url', '--price-in', '--price-out', '--claims', '--max-tokens'] as const;
const handedOn = (): string[] => HANDED_ON.flatMap((f) => { const v = flag(f); return v === undefined ? [] : [`${f}=${v}`]; });
/** A run that has not answered in this long is ended: an unattended search must not wait for ever. */
const RUN_TIMEOUT_MS = 20 * 60 * 1000;

/** What the search exits with when it stopped before it could conclude: an unattended caller reads it without parsing. */
const EXIT_STOPPED = 2;

/** The briefs in a folder: each `.md` file that carries a task. A file with none is said, never guessed at. */
export function readBriefs(folder: string, say: (line: string) => void = () => undefined): Brief[] {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) die(`--briefs ${folder}: there is no such folder. A brief is a file with its task in the front matter (request: ...) and its material in a folder <brief>.material beside it.`);
  const out: Brief[] = []; const without: string[] = [];
  for (const f of readdirSync(folder).filter((x) => /\.(md|markdown|txt)$/i.test(x)).sort()) {
    const c = readCase(join(folder, f));
    if (c.task) out.push({ id: f, task: c.task, material: c.material }); else without.push(f);
  }
  if (without.length) say(`No task in the front matter, so not a brief: ${without.join(', ')}.`);
  return out;
}

export async function evolve(): Promise<void> {
  const name = skillArg('--skill <name> required: atelier evolve --skill <name> --briefs <folder>');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const std = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);
  const json = argv.includes('--json');
  const say = (line: string): void => { if (!json) console.log(line); };

  if (argv.includes('--rollback')) {
    if (!store.getCarry(L)) die(`"${name}" carries its method as it was built: there is nothing to go back from.`);
    // One adoption back, exactly as it was. The one left is kept beside the skill, and every search record stays.
    const back = store.restoreCarry(L);
    console.log(back ? `Back to how "${name}" carried its method before: ${back.drafts} draft(s)${back.note ? ', with its note' : ''}.${back.standardVersion === sv.standardVersionHash ? '' : ' It was adopted under an earlier standard, so it is kept and not used.'}` : `"${name}" carries its method as it was built again.`);
    return;
  }

  // WHAT THE SEARCH IS SCORED ON: the owner's required things that code reads. With none, there is nothing to climb on.
  const scoredOn = std.requirements.filter((r) => r.obligation && r.measurement && r.materiality === 'REQUIRED' && r.authority !== 'EXPERT_REJECTED');
  // A skill that answers in a fixed format is written once and carries no note: both settings would change nothing.
  if (store.getPackage(L, sv.materializedHash)?.files['contracts/output.schema.json']) die(`"${name}" answers in a fixed format, where neither more drafts nor a note is used: there is nothing to search over.`);
  if (!scoredOn.length) die(`"${name}" has no required step that code can check, so there is nothing a search could be scored on. A skill built by atelier method from steps that name what the work must contain has them.`);
  const statements = new Map(scoredOn.map((r) => [r.requirementId, r.statement]));

  const folder = resolve(flag('--briefs') ?? die('--briefs <folder> required: the briefs the skill is to get better on.'));
  const briefs = readBriefs(folder, say);
  if (briefs.length < MIN_BRIEFS) die(`${briefs.length} brief(s) in ${folder}: at least ${MIN_BRIEFS} are needed, so that some can be set aside and the rest still say something.`);
  const { dev, heldBack } = splitBriefs(briefs);
  const rounds = Math.max(1, Math.min(6, Math.floor(numericFlag('--rounds', 3))));
  const cap = numericFlag('--cap', 10);
  // A carry adopted under another standard quotes requirements that may no longer be the owner's: the search starts from as built.
  const adopted = store.getCarry(L); const stored = adopted?.standardVersion === sv.standardVersionHash ? adopted : null;
  // As it stands: what a plain run of it does today. Where the skill has a release, the number of drafts is the
  // release's to set (cli/commands/invoke.ts), so the search leaves it alone and searches the note only.
  const release = releaseFor(L, sv);
  const start: Carry = { drafts: release ? release.release.settings.drafts : stored?.drafts ?? (store.getVoice(L)?.pieces?.length ? 2 : 1), note: stored?.note ?? '' };
  const own = [NOTE_HEAD, ...statements.values()];

  if (argv.includes('--dry-run')) {
    const most = dev.length * (2 + 2 * rounds) + heldBack.length * 2;
    say(`${briefs.length} briefs: ${dev.length} to work on, ${heldBack.length} set aside (${heldBack.map((b) => b.id).join(', ')}).`);
    say(`Scored on ${scoredOn.length} required step(s) that code reads: ${scoredOn.map((r) => r.requirementId).join(', ')}.`);
    say(`As it stands: ${start.drafts} draft(s)${start.note ? ', with a note' : ''}. Up to ${rounds} round(s), two changes a round at most.${release ? ' The number of drafts is its release\'s, so only the note is searched.' : ''}`);
    say(`At most ${most} runs, each what a run of this skill costs, within --cap $${cap}. --dry-run: nothing was called.`);
    return;
  }

  // A search is not the person's last piece of work: what `atelier fix` and `atelier report` point at is put back
  // as it was, when what it points at now is one of this search's own runs.
  const pointers = ['last-invocation.json', 'last-invocation.txt'].map((f) => runFile(f)).map((f) => ({ f, was: existsSync(f) ? readFileSync(f, 'utf8') : null }));
  const tmp = mkdtempSync(join(tmpdir(), 'atelier-evolve-'));
  const mine = new Set<string>();
  const tidy = (): void => {
    rmSync(tmp, { recursive: true, force: true });
    let ours = false;
    try { ours = mine.has(readJson<{ invocationId?: string }>(pointers[0].f, { what: 'the last run' }).invocationId ?? ''); } catch { /* gone or unreadable: not this search's to put back */ }
    if (ours) for (const p of pointers) { if (p.was === null) rmSync(p.f, { force: true }); else writeAtomic(p.f, p.was); }
  };
  // A SIGNAL STOPS THE SEARCH: the run in flight is ended, what the search moved is put back, and nothing is adopted.
  let running: ChildProcess | null = null;
  const interrupted = (): void => { running?.kill('SIGTERM'); tidy(); process.exit(130); };
  process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted);
  let spent = 0; const state: { stopped: string | null } = { stopped: null };
  const tracked = new Set(scoredOn.map((r) => r.requirementId));

  /**
   * One brief under one way of carrying the method, or null when there is nothing to read: the cap could not cover
   * the run, or the run ended with no verdict. Null stops the search. A run that broke is never a case that failed.
   */
  const runOne = async (b: Brief, carry: Carry): Promise<BriefResult | null> => {
    const may = allowance(cap, spent, carry.drafts);
    if ('stop' in may) { state.stopped = may.stop; return null; }
    const noteFile = join(tmp, 'note.md'); writeAtomic(noteFile, carry.note);
    const withArgs = b.material.map((m, k) => { const f = join(tmp, `${k}-${m.name.replace(/[^A-Za-z0-9._-]+/g, '_')}`); writeAtomic(f, m.text); return `--with=material-${k + 1}=${f}`; });
    const ran = await new Promise<{ out: string; err: string; timedOut: boolean }>((done) => {
      running = execFile(process.execPath, [...process.execArgv, process.argv[1], 'invoke', '--skill', name, `--task=${b.task}`, ...withArgs, '--json', '--test-run',
        `--drafts=${carry.drafts}`, `--carry-note=${noteFile}`, `--cap=${may.forRun}`, ...handedOn()],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: RUN_TIMEOUT_MS, env: { ...process.env, ATELIER_CLAIMS_CAP: String(may.claims) } },
      (e, out, err) => { done({ out, err: err || (e?.message ?? ''), timedOut: e?.killed === true }); });
    });
    running = null;
    const read = readRun(b.id, ran.out, ran.err, ran.timedOut, tracked, RUN_TIMEOUT_MS / 60000);
    if (read.invocationId) mine.add(read.invocationId);
    spent += read.paid;
    if (read.stopped) state.stopped = read.stopped;
    return read.result;
  };
  const runAll = async (bs: readonly Brief[], carry: Carry, what: string): Promise<Scored> => {
    const results: BriefResult[] = [];
    for (const b of bs) { const r = state.stopped ? null : await runOne(b, carry); if (!r) break; results.push(r); }
    const s = scoreOf(results);
    say(`  ${what}: ${s.ok} of ${s.n} conformant · $${s.costUsd.toFixed(2)}${results.length < bs.length ? ` (stopped after ${results.length} of ${bs.length})` : ''}`);
    return s;
  };

  const trials: Trial[] = []; let incumbent = start; let record: EvolveRecord;
  try {
    say(`${briefs.length} briefs: ${dev.length} to work on, ${heldBack.length} set aside before anything is run.`);
    // THE UNCHANGED SKILL, TWICE: what it does, and how far two runs of the same thing differ.
    const first = await runAll(dev, start, 'as it stands, first run');
    const again = state.stopped ? null : await runAll(dev, start, 'as it stands, second run');
    // A second run that stopped part-way is not a reading of the band.
    const second = state.stopped ? null : again;
    const band = second ? noiseBand(first, second) : 1;
    let best = Math.max(first.ok, second?.ok ?? 0); let bestCost = second ? (first.costUsd + second.costUsd) / 2 : first.costUsd; let last = second && second.ok > first.ok ? second : first;
    // Every way of carrying the method that was run, the one it started from included: none is run twice.
    const tried = new Set<string>([carryKey(start, statements)]);
    for (let round = 1; round <= rounds && !state.stopped; round++) {
      const candidates = proposals(incumbent, last, statements, tried, { drafts: !release });
      if (!candidates.length) break;
      let winner: { c: (typeof candidates)[number]; s: Scored } | null = null;
      for (const c of candidates) {
        tried.add(c.key);
        // THE LEAKAGE CHECK, before anything is spent: a candidate that carries a brief is not run.
        const leaked = leak(c.carry.note, briefs, own);
        if (leaked) { say(`  round ${round}, a note was not tried: ${leaked}`); trials.push({ round, gene: c.gene, key: c.key, hypothesis: c.hypothesis, carry: c.carry, scored: null, kept: false, why: `refused before any run: ${leaked}` }); continue; }
        const s = await runAll(dev, c.carry, `round ${round}, ${c.gene === 'NOTE' ? 'naming what drafts miss' : `${c.carry.drafts} draft(s)`}`);
        if (state.stopped) { trials.push({ round, gene: c.gene, key: c.key, hypothesis: c.hypothesis, carry: c.carry, scored: s, kept: false, why: `not read: ${state.stopped}` }); break; }
        const r = rule(s, best, bestCost, band, c.gene);
        trials.push({ round, gene: c.gene, key: c.key, hypothesis: c.hypothesis, carry: c.carry, scored: s, kept: false, why: r.why });
        if (r.keep && (!winner || s.ok > winner.s.ok)) winner = { c, s };
      }
      // A round the search stopped in keeps nothing: its candidates were not all read.
      if (!winner || state.stopped) break;
      // One change is kept a round: the one that held the most cases.
      const won = winner;
      const at = trials.findIndex((t) => t.round === round && t.key === won.c.key);
      trials[at] = { ...trials[at], kept: true };
      incumbent = won.c.carry; best = Math.max(best, won.s.ok); bestCost = won.s.costUsd; last = won.s;
    }
    const changed = incumbent.drafts !== start.drafts || incumbent.note !== start.note;
    // THE BRIEFS SET ASIDE, READ ONCE: the skill as it started, and as the search left it.
    const heldStart = changed && !state.stopped ? await runAll(heldBack, start, 'held back, as it started') : null;
    const heldEnd = heldStart && !state.stopped ? await runAll(heldBack, incumbent, 'held back, as the search left it') : null;
    const held = heldStart && heldEnd && !state.stopped ? { start: heldStart, end: heldEnd } : null;
    const verdict: EvolveRecord['verdict'] = state.stopped ? 'STOPPED' : !changed ? 'UNCHANGED' : held && held.end.ok >= held.start.ok ? 'ADOPTED' : 'NOT_CARRIED';
    const why = state.stopped ? `${state.stopped}. Nothing was adopted; what was run is kept.`
      : !changed ? 'no change was plainly better than the skill as it stands, so it is left as it is.'
        : verdict === 'ADOPTED' ? `the change held on the briefs set aside (${held?.end.ok} of ${held?.end.n} against ${held?.start.ok}), so the skill now carries its method this way. atelier evolve --skill ${name} --rollback goes back.`
          : `better on the briefs it worked on, and worse on the ones set aside (${held?.end.ok} of ${held?.end.n} against ${held?.start.ok}): the gain did not carry, and the skill is left as it was.`;
    // `end` is what the search arrived at. After a stop that is where it had got to, with no reading on the briefs set aside.
    record = { schema: 1, skill: name, skillVersion: active, standardVersion: sv.standardVersionHash, at: new Date().toISOString(),
      briefs: { dev: dev.map((b) => b.id), heldBack: heldBack.map((b) => b.id) }, start, baseline: { first, second, band }, trials, end: incumbent, heldBack: held, verdict, why,
      costUsd: Math.round(spent * 1e6) / 1e6 };
  } finally {
    process.off('SIGINT', interrupted); process.off('SIGTERM', interrupted);
    tidy();
  }
  // EVERY SEARCH IS KEPT, adopted or not, in a file of its own.
  const kept = join(DATA, 'skills', name, 'evolve', `${record.at.replace(/[:.]/g, '-')}.json`);
  writeAtomic(kept, `${JSON.stringify(record, null, 1)}\n`);
  if (record.verdict === 'ADOPTED') store.setCarry(L, { ...record.end, adoptedAt: record.at, from: kept, standardVersion: record.standardVersion });
  if (record.verdict === 'STOPPED') process.exitCode = EXIT_STOPPED;
  if (json) { console.log(JSON.stringify({ ...record, file: kept }, null, 1)); return; }
  console.log(`\n${renderEvolve(record)}\n\n$${spent.toFixed(2)} · the whole search is kept at ${kept}`);
}
