// cli/commands/reproduce.ts — `atelier reproduce`: THE HELD-BACK CASES, RUN AS THE EXPERT RAN THEM.
//
// For each piece held back at intake that carries its task and its material, the skill is given the task and the
// material and nothing else (core/golden/case.ts, `servedFor`), writes through the same checked path as any run, and
// the output is read by that run's own verdict. The piece itself is then read on the same counted rules. What comes
// out is a count of cases (core/eval/reproduce.ts), written beside the skill.
//
// THE REFERENCE NEVER REACHES A REQUEST. What is served is built by the one function that takes no reference; before
// any call it is audited against the reference (`leakedRun`), and a case whose task carries the reference's own
// wording is not run and is said. Each case is a run like any other: it costs what a run costs, and `--cap` holds
// the total.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../../core/state/store.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { readJson } from '../../core/state/read-json.js';
import { isGeneralScope } from '../../core/state/canonical-state.js';
import { measure } from '../../core/observers/registry.js';
import { countWords } from '../../core/eval/size.js';
import { goldenCase, servedFor, whyNotRunnable, repeatsReference, CARRIED_RUN, countClasses } from '../../core/golden/case.js';
import { renderReproduction, countsOf, type CaseOutcome, type ReproductionRecord } from '../../core/eval/reproduce.js';
import type { EvalSummary } from '../../core/eval/summary.js';
import { DATA, argv, die, flag, loadSession, numericFlag, skillArg, runFile, clientAndBinding, sha } from '../runtime.js';
import { spendOneWithResult } from './improve.js';
import type { Budget } from '../../core/inference/client.js';

/** What a run is told about its backend and its limits, handed on to each case's run as it was given here. */
const HANDED_ON = ['--provider', '--base-url', '--model', '--target-model', '--target-provider', '--target-base-url', '--price-in', '--price-out', '--claims', '--max-tokens'] as const;
const HANDED_ON_SWITCHES = ['--accept-new-binding', '--strict'] as const;
const handedOn = (): string[] => [...HANDED_ON.flatMap((f) => { const v = flag(f); return v === undefined ? [] : [`${f}=${v}`]; }), ...HANDED_ON_SWITCHES.filter((f) => argv.includes(f))];

/**
 * WHAT ONE RUN MAY SPEND, OUT OF WHAT IS LEFT OF THE CAP. A run has two meters: its own (`--cap`) and the claim
 * reader's (ATELIER_CLAIMS_CAP). Both are set from what is left, so together they cannot pass it. A run needs room
 * for its drafts, so with less than MIN_TO_START left no further case is started.
 */
const MIN_TO_START = 0.6;
const split = (left: number): { run: number; claims: number } => { const claims = Math.min(0.5, Math.round(left * 0.3 * 1e4) / 1e4); return { run: Math.round((left - claims) * 1e4) / 1e4, claims }; };

/** Where a skill's last reproduction is kept: beside the skill, read by `atelier report --skill`. */
export const reproductionFile = (L: store.StoreLayout): string => join(L.root, 'skills', L.skillName, 'reproduction.json');

interface InvokeJson { output?: string | null; delivered?: boolean; costUsd?: number; eval?: EvalSummary | null }

/** A text checked by `atelier verify`, as that command prints it with --json. */
interface VerifyJson { failed?: boolean; checked?: { requirementId: string; materiality: string; result: { verdict: string } }[] }

export async function reproduce(): Promise<void> {
  const name = skillArg('--skill <name> required: atelier reproduce --skill <name>');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const std = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);
  // THE PIECES HELD BACK ARE KEPT WITH THE RUN THAT BUILT THE SKILL, and only that run's are this skill's: a folder
  // with no run, or one whose run built another skill or has taken in a corpus since, has nothing to say about it.
  const s = loadSession();
  if (s.skillName !== name || s.run?.state !== 'BUILT') {
    die(`this folder's run did not build "${name}"${s.skillName ? ` (it built "${s.skillName}")` : s.run ? ' (it has not built a skill yet)' : ' (there is no run here)'}. Run atelier reproduce from the project where "${name}" was built: the pieces held back are kept with that run.`);
  }
  // THE RESERVE, THE RUN AND THE SKILL ARE ONE LINEAGE, AND THAT IS CHECKED, NOT ASSUMED FROM A NAME. The pieces were
  // held back by the run that closed a standard; the skill under test must hold that standard or one that supersedes
  // it (an amendment by the owner). A skill whose standard does not descend from this run's was built from something
  // else, and these pieces say nothing about it.
  const runStandard = s.run.standardVersionHash;
  const descends = (() => {
    const seen = new Set<string>();
    for (let h: string | null = sv.standardVersionHash; h && !seen.has(h); h = store.getStandard(L, h)?.supersedes ?? null) { if (h === runStandard) return true; seen.add(h); }
    return false;
  })();
  if (!runStandard || !descends) {
    die(`the skill "${name}" holds standard ${sv.standardVersionHash.slice(0, 12)}, which does not come from the run in this folder (it closed ${runStandard ? runStandard.slice(0, 12) : 'no standard'}). The pieces held back here were not held back from that skill, so nothing is run.`);
  }
  const reserved = s.reservation?.reserved ?? [];
  const classes = countClasses(reserved);
  const heldBack = { full: classes.FULL_REPRO_CASE, taskOnly: classes.TASK_AND_REFERENCE, referenceOnly: classes.REFERENCE_ONLY };
  const required = std.requirements.filter((r) => r.materiality === 'REQUIRED' && r.authority !== 'EXPERT_REJECTED');
  // The expert's own piece is read on the counted rules that apply to every piece. A conditional rule, a rule a run
  // waives for the request's own format, and a rule read by a reader are the run's to decide, piece by piece.
  const everyPiece = required.filter((r) => r.measurement && isGeneralScope(r.appliesWhen));
  const notCheckable = required.filter((r) => !r.measurement).length;
  const cases = reserved.filter((u) => u.caseClass === 'FULL_REPRO_CASE').map((u) => goldenCase(u.unitId, u.artifact, u.task, u.material ?? []));
  // What was run against what, by identity: the run and its sealed corpus, the held-back cases as they stood (each
  // task, material and reference by hash), and the standard and skill version under test.
  const identity = { runId: s.run.runId, corpusHash: s.evidence?.corpusHash ?? s.run.corpusHash ?? null,
    reservationHash: sha(JSON.stringify(cases.map((c) => [c.id, sha(c.task ?? ''), c.material.map((m) => [m.name, sha(m.text)]), sha(c.reference)]))),
    standardAmendedSinceRun: sv.standardVersionHash !== runStandard };
  const json = argv.includes('--json'); const dry = argv.includes('--dry-run');
  // A ONE-SHOT FLOOR (`--bare`). The same cases, one plain call to the model each, given the task and the material and
  // nothing else, then read with `atelier verify` against the same standard. It is NOT the skill taken away: the
  // skill's run writes more than one draft, chooses, repairs and has its claims read, and this arm does none of
  // that. So it says where a bare call lands, and the difference between it and the skill's count is the whole
  // runtime and the skill together, never the skill alone.
  const bare = argv.includes('--bare');
  const bareClient = bare && !dry ? clientAndBinding('target').client : null;
  // One call a case: bounded by count as well as by dollars, so a backend that reports no cost is still bound.
  const bareBudget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 5), maxCalls: Math.max(1, cases.length) };
  const cap = numericFlag('--cap', 5);
  const say = (line: string): void => { if (!json) console.log(line); };
  const blank = (id: string, reference: string): Pick<CaseOutcome, 'id' | 'reference' | 'words' | 'costUsd'> => {
    const read = everyPiece.map((r) => (r.measurement ? measure(reference, r.measurement).verdict : 'NOT_APPLICABLE')).filter((v) => v !== 'NOT_APPLICABLE');
    return { id, reference: { met: read.filter((v) => v === 'MET').length, applicable: read.length }, words: { output: null, reference: countWords(reference) }, costUsd: 0 };
  };
  const notRun = (id: string, reference: string, why: string): CaseOutcome => ({ ...blank(id, reference), state: 'not-run', why, conformant: null, required: null, claims: null });

  // THE AUDIT, BEFORE ANY CALL (core/golden/case.ts, `whyNotRunnable`): a case with no task, a task that repeats the
  // finished work, or material that holds it, is not run.
  const audited = cases.map((c) => ({ c, why: whyNotRunnable(c) }));
  if (dry) {
    const plan = audited.map(({ c, why }) => ({ id: c.id, runs: why === null, ...(why ? { why } : { task: c.task, material: c.material.map((m) => ({ name: m.name, words: countWords(m.text) })) }) }));
    if (json) { console.log(JSON.stringify({ skill: name, heldBack, cases: plan }, null, 1)); return; }
    if (!cases.length) { console.log(renderReproduction({ schema: 1, skill: name, skillVersion: active, standardVersion: sv.standardVersionHash, at: '', heldBack, cases: [], notCheckable, timesRun: 0, costUsd: 0 })); return; }
    for (const { c, why } of audited) {
      console.log(why ? `would not run  ${c.id}: ${why}` : `would run  ${c.id}\n  task: ${(c.task ?? '').replace(/\s+/g, ' ').slice(0, 160)}\n  material: ${c.material.map((m) => `${m.name} (${countWords(m.text)} words)`).join(', ')}`);
    }
    console.log(`\n--dry-run: ${plan.filter((p) => p.runs).length} of ${cases.length} case(s) would be run; nothing was called and nothing was written.`);
    return;
  }

  // A reproduction is not the person's last piece of work: `atelier fix` and a bare `atelier report` go on pointing at
  // the run they pointed at before.
  const pointers = ['last-invocation.json', 'last-invocation.txt'].map((f) => runFile(f)).map((f) => ({ f, was: existsSync(f) ? readFileSync(f, 'utf8') : null }));
  const outcomes: CaseOutcome[] = []; let spent = 0; let attempted = 0;
  const tmp = cases.length ? mkdtempSync(join(tmpdir(), 'atelier-reproduce-')) : null;
  try {
    for (const { c, why } of audited) {
      if (why) { outcomes.push(notRun(c.id, c.reference, why)); say(`not run         ${c.id}`); continue; }
      const served = servedFor(c);
      if (!served) continue;
      // THE CAP IS THE TOTAL. Each run is given what is left of it as its own cap, so the last one cannot pass it; with
      // too little left for a run to start, the case is not run and is said.
      const left = Math.round((cap - (bareClient ? bareBudget.spentUsd : spent)) * 1e4) / 1e4;
      if (left < MIN_TO_START) { outcomes.push(notRun(c.id, c.reference, `$${left.toFixed(2)} of the $${cap} cap was left after ${attempted} run(s), too little to start another. Raise it with --cap`)); continue; }
      attempted += 1;
      const withArgs = served.material.flatMap((m, k) => {
        const file = join(tmp ?? tmpdir(), `${k}-${m.name.replace(/[^A-Za-z0-9._-]+/g, '_')}`);
        writeAtomic(file, m.text);
        return [`--with=material-${k + 1}=${file}`];
      });
      if (bareClient) {
        let text: string;
        try {
          text = (await spendOneWithResult(bareClient, bareBudget, '', `${served.task}\n\n${served.material.map((m) => `<material name="${m.name}">\n${m.text}\n</material>`).join('\n\n')}`)).piece;
        } catch (e) { outcomes.push(notRun(c.id, c.reference, `the run ended with no result: ${(e as Error).message.split('\n')[0]}`)); say(`not run         ${c.id}`); continue; }
        const costOfThis = Math.round((bareBudget.spentUsd - spent) * 1e6) / 1e6;
        spent = bareBudget.spentUsd;
        const file = join(tmp ?? tmpdir(), 'bare-output.md'); writeAtomic(file, text);
        let vout = '';
        try { vout = execFileSync(process.execPath, [...process.execArgv, process.argv[1], 'verify', '--skill', name, file, ...withArgs, '--json', ...handedOn().filter((f) => f !== '--strict' && !f.startsWith('--claims=')), '--claims=pattern'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
        catch (e) { vout = (e as { stdout?: string }).stdout ?? ''; }
        let v: VerifyJson | null = null;
        try { v = JSON.parse(vout.slice(vout.indexOf('{'))) as VerifyJson; } catch { /* verify printed no result */ }
        if (!v?.checked) { outcomes.push(notRun(c.id, c.reference, 'its output could not be checked')); say(`not run         ${c.id}`); continue; }
        const req = v.checked.filter((x) => x.materiality === 'REQUIRED' && x.result.verdict !== 'NOT_APPLICABLE' && x.requirementId !== 'UNSOURCED');
        const unsourced = v.checked.some((x) => x.requirementId === 'UNSOURCED' && x.result.verdict === 'VIOLATED');
        const shared = repeatsReference(text, c);
        const ok = v.failed !== true && shared < CARRIED_RUN;
        outcomes.push({ ...blank(c.id, c.reference), state: 'ran', conformant: ok, required: { held: req.filter((x) => x.result.verdict === 'MET').length, applicable: req.length },
          claims: { qualified: false, instrument: 'atelier verify', unsupported: unsourced ? 1 : 0 }, sharedWithReference: shared,
          words: { output: countWords(text), reference: countWords(c.reference) }, costUsd: costOfThis });
        say(`${ok ? 'reproduced    ' : 'not reproduced'}  ${c.id}`);
        continue;
      }
      let out = ''; let err = '';
      try {
        // The task goes by flag and `=`, so one that begins with a dash is still the task.
        out = execFileSync(process.execPath, [...process.execArgv, process.argv[1], 'invoke', '--skill', name, `--task=${served.task}`, ...withArgs, '--json', '--test-run', `--cap=${split(left).run}`, ...handedOn()],
          { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ATELIER_CLAIMS_CAP: String(split(left).claims) } });
      } catch (e) { out = (e as { stdout?: string }).stdout ?? ''; err = (e as { stderr?: string }).stderr ?? ''; }
      let j: InvokeJson | null = null;
      try { j = JSON.parse(out.slice(out.indexOf('{'))) as InvokeJson; } catch { /* a run that printed no result */ }
      const ev = j?.eval ?? null;
      if (!j || !ev) {
        // A RUN THAT STOPPED PARTWAY HAS STILL SPENT. It says what, on its way out, and that is counted against the cap.
        const paid = /had spent (?:under )?\$([\d.]+) when it stopped/.exec(err); if (paid) spent += Number(paid[1]);
        const lines = err.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith("This run had spent"));
        outcomes.push({ ...notRun(c.id, c.reference, `the run ended with no result: ${(lines.slice(-1)[0] ?? 'nothing was printed').replace(/^atelier:\s*/, '')}`), costUsd: paid ? Number(paid[1]) : 0 });
        say(`not run         ${c.id}`);
        continue;
      }
      spent += j.costUsd ?? 0;
      const rules = { held: ev.gates.required.held, applicable: ev.gates.required.applicable };
      // A REFUSAL IS A RESULT. Under strict delivery an output that does not conform is not delivered: the case was
      // run, and it was not reproduced. Left out of the count, two cases with one refused read "1 of 1".
      if (typeof j.output !== 'string') {
        outcomes.push({ ...blank(c.id, c.reference), state: 'ran', conformant: false, refused: true, required: rules, claims: null, costUsd: j.costUsd ?? 0 });
        say(`not reproduced  ${c.id}  (refused under strict delivery)`);
        continue;
      }
      // AND THE LAST CHECK: the output must not carry the held-back piece's own wording. Nothing served should have.
      const shared = repeatsReference(j.output, c);
      const carried = shared >= CARRIED_RUN;
      const claims = { qualified: ev.gates.claims.state === 'checked' && ev.gates.claims.measured !== null, instrument: ev.gates.claims.instrument, unsupported: ev.gates.claims.delivered + ev.gates.claims.unconfirmed };
      const conformant = ev.result.conformant && !carried;
      outcomes.push({ ...blank(c.id, c.reference), state: 'ran', conformant, required: rules, claims, sharedWithReference: shared,
        ...(carried ? { why: `the output repeats ${shared} words in a row of the held-back piece that are not in its material: something served them, and this is not a reproduction` } : {}),
        words: { output: countWords(j.output), reference: countWords(c.reference) }, costUsd: j.costUsd ?? 0 });
      say(`${conformant ? 'reproduced    ' : 'not reproduced'}  ${c.id}`);
    }
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    for (const p of pointers) { if (p.was === null) rmSync(p.f, { force: true }); else writeAtomic(p.f, p.was); }
  }

  const file = bare ? reproductionFile(L).replace(/\.json$/, '-bare.json') : reproductionFile(L);
  const before = existsSync(file) ? readJson<ReproductionRecord>(file, { what: 'the reproduction record' }) : null;
  const anyRan = outcomes.some((o) => o.state === 'ran');
  // Counted per skill, across its versions: the same held-back pieces run again after a change is the thing to know.
  const timesRun = (before?.timesRun ?? (before ? 1 : 0)) + (anyRan ? 1 : 0);
  // Kept per version, so a version come back to after another still knows how often it has met these cases.
  const was = before?.runsByVersion ?? (before ? { [before.skillVersion]: before.timesRun } : {});
  const runsByVersion = { ...was, [active]: (was[active] ?? 0) + (anyRan ? 1 : 0) };
  const record: ReproductionRecord = { schema: 1, ...identity, runsByVersion, skill: name, ...(bare ? { arm: 'bare' as const } : {}), skillVersion: active, standardVersion: sv.standardVersionHash, at: new Date().toISOString(), heldBack, cases: outcomes, notCheckable, timesRun, costUsd: Math.round(spent * 1e6) / 1e6 };
  // A run in which no case came back does not replace a record of one in which they did.
  if (anyRan) writeAtomic(file, `${JSON.stringify(record, null, 1)}\n`);
  if (json) { console.log(JSON.stringify({ ...record, counts: countsOf(record) }, null, 1)); return; }
  console.log(`\n${renderReproduction(record)}`);
  if (anyRan) console.log(bare ? `\n$${spent.toFixed(2)} · one plain call a case, checked afterwards. A floor to read the skill's count against, not a measure of what the skill adds: atelier report --skill ${name}` : `\n$${spent.toFixed(2)} · kept with the skill: atelier report --skill ${name}`);
  else if (before && cases.length) console.log(`\nNothing was run this time, so the record of ${before.at.slice(0, 10)} is kept as it was.`);
}
