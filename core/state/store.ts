// atelier/core/state/store.ts — APPEND-ONLY LOCAL STATE.
//
// Everything is append-only except one pointer. Standards and skill versions are written under their
// own hash and never overwritten, so history is a property of the layout rather than of anyone's
// discipline: to lose a previous version you would have to delete a file, not merely save over one.
//
// Rollback is a pointer move. That is the whole mechanism, and it is why rollback cannot corrupt
// history — the thing being changed is which version is ACTIVE, not what any version says.
//
// No telemetry. No network. Corpus and outputs stay where the user put them; this stores metadata,
// standards and events.

import type { Voice } from '../compiler/voice.js';
import type { ContrastPair } from '../compiler/contrast-examples.js';
import type { Recurrence } from '../mining/recurrence.js';
import type { QualityFloorContract, FloorQualification, FrozenBaselineEntry } from '../distinctiveness/floor.js';
import { mkdirSync, readFileSync, existsSync, readdirSync, appendFileSync, rmSync } from 'node:fs';
import { writeAtomic } from './fs-atomic.js';
import { readJson } from './read-json.js';
import { join, dirname } from 'node:path';
import type { Observation } from '../measurement/observation.js';
import type { ExpertEvidence, StandardVersion, SkillVersion, EvidenceEvent, InvocationRecord, FeedbackRecord } from './canonical-state.js';
import { assertSupersessionRecorded } from './canonical-state.js';
import type { SkillArchitecture } from '../architecture/compile.js';
import type { RatificationLedger } from '../ratification/decision-record.js';

export interface StoreLayout { readonly root: string; readonly skillName: string }

/**
 * A skill name is a single directory entry under `skills/`, and the layout refuses anything else.
 * The CLI validates names before they get here; this is the guard that holds when a caller does not.
 */
const safeName = (name: string): string => {
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
    throw new Error(`STORE: "${name}" is not a skill name; it would resolve outside skills/.`);
  }
  return name;
};

const dirs = (l: StoreLayout) => ({
  base: join(l.root, 'skills', safeName(l.skillName)),
  standards: join(l.root, 'skills', l.skillName, 'standards'),
  versions: join(l.root, 'skills', l.skillName, 'versions'),
  architectures: join(l.root, 'skills', l.skillName, 'architectures'),
  packages: join(l.root, 'skills', l.skillName, 'packages'),
  invocations: join(l.root, 'skills', l.skillName, 'invocations'),
  feedback: join(l.root, 'skills', l.skillName, 'feedback'),
  bindings: join(l.root, 'skills', l.skillName, 'bindings'),
  ledgers: join(l.root, 'skills', l.skillName, 'ledgers'),
});

export function initStore(l: StoreLayout): void {
  const d = dirs(l);
  for (const p of [d.base, d.standards, d.versions, d.architectures, d.packages, d.invocations, d.feedback, d.bindings]) mkdirSync(p, { recursive: true });
}

export function putEvidence(l: StoreLayout, e: ExpertEvidence): void {
  writeAtomic(join(dirs(l).base, 'evidence.json'), JSON.stringify(e, null, 1));
}
export const getEvidence = (l: StoreLayout): ExpertEvidence | null => {
  const p = join(dirs(l).base, 'evidence.json');
  return existsSync(p) ? readJson<ExpertEvidence>(p, { what: 'sealed evidence', requireKeys: ['evidenceId'] }) : null;
};

/** What the hash covers, in the order every minting site hashes it. */
const hashedContent = (v: StandardVersion): string =>
  JSON.stringify({ evidenceId: v.evidenceId, workType: v.workType, requirements: v.requirements });

/**
 * Write a standard. REFUSES to overwrite an existing hash with different content. Returns the standard
 * now on disk, which on a re-mint is the one written first.
 *
 * Two different standards cannot share a hash, so a collision means the same standard is being written
 * twice — harmless — while a DIFFERENT body under an existing hash would mean the hash is not an
 * identity. Refusing is cheap; discovering later that a version's content changed is not.
 *
 * THE COMPARISON IS OVER WHAT THE HASH COVERS. It compared the whole file, and `mintedAt`, `reason` and
 * `supersedes` sit outside the hash, so the same standard minted a second time (confirm after a
 * rollback, the same rule added again) differed by its timestamp and was refused as a conflicting
 * identity. Under content addressing it is the same version: the stored file stays canonical and the
 * caller renders from it. What remains open (B11): two different authority events over identical
 * requirements collapse to one identity, so the supersession chain records only the first.
 */
export function putStandard(l: StoreLayout, v: StandardVersion): StandardVersion {
  assertSupersessionRecorded(v);
  const p = join(dirs(l).standards, `${v.standardVersionHash}.json`);
  if (existsSync(p)) {
    const existing = readJson<StandardVersion>(p, { what: `standard ${v.standardVersionHash}`, requireKeys: ['standardVersionHash', 'requirements'] });
    if (hashedContent(existing) !== hashedContent(v)) {
      throw new Error(`STORE: standard ${v.standardVersionHash} already exists with different content. A version hash is an identity; two bodies cannot share one.`);
    }
    return existing;
  }
  writeAtomic(p, JSON.stringify(v, null, 1));
  return v;
}

/**
 * THE RATIFICATION LEDGER, KEPT BESIDE THE STANDARD IT PRODUCED.
 *
 * AUTHORITY.md promised this and it was not so: the ledger lived only in the per-project working
 * folder, so the next close in the same project overwrote the record of who decided the previous
 * standard and what they were shown. Keyed by the standard's hash, written once, never replaced.
 */
export function putLedger(l: StoreLayout, standardVersionHash: string, ledger: RatificationLedger): void {
  // THE FIRST RECORD WINS, as the first mint of a standard does. The same rules ratified again — in
  // another project, or after an abort — mint the same standard hash with a ledger that differs by
  // its timestamps, and treating that as a conflicting identity blocked the build permanently.
  const p = join(dirs(l).ledgers, `${standardVersionHash}.json`);
  if (existsSync(p)) return;
  putByHash(p, standardVersionHash, ledger, 'ratification ledger');
}
export function getLedger(l: StoreLayout, standardVersionHash: string): RatificationLedger | null {
  const p = join(dirs(l).ledgers, `${standardVersionHash}.json`);
  return existsSync(p) ? readJson<RatificationLedger>(p, { what: 'a ratification ledger' }) : null;
}

/**
 * The owner's chosen exemplar for a skill: one complete piece of their own, shipped with every build.
 * Kept beside the skill rather than in a SkillVersion, so every re-render (amend, confirm, fix) carries
 * the same one until the owner changes it.
 */
export function getExemplar(l: StoreLayout): { text: string } | null {
  const p = join(dirs(l).base, 'exemplar.md');
  return existsSync(p) ? { text: readFileSync(p, 'utf8') } : null;
}
export function setExemplar(l: StoreLayout, text: string | null): void {
  const p = join(dirs(l).base, 'exemplar.md');
  if (text === null) { if (existsSync(p)) rmSync(p); return; }
  mkdirSync(dirs(l).base, { recursive: true });
  writeAtomic(p, text);
}

/**
 * The machine-writing phrases this skill's own drafts repeat and its author never uses
 * (core/observers/tell-lexicon.ts), plus what the owner added or struck. Implementation, not standard.
 */
export interface StoredTells { readonly learned: readonly string[]; readonly added: readonly string[]; readonly struck: readonly string[]; readonly at: string | null; readonly drafts: number; readonly topics: number }
export function getTells(l: StoreLayout): StoredTells {
  const p = join(dirs(l).base, 'tells.json');
  return existsSync(p) ? readJson<StoredTells>(p, { what: 'the learned machine tells' }) : { learned: [], added: [], struck: [], at: null, drafts: 0, topics: 0 };
}
export function setTells(l: StoreLayout, t: StoredTells): void {
  mkdirSync(dirs(l).base, { recursive: true });
  writeAtomic(join(dirs(l).base, 'tells.json'), JSON.stringify(t, null, 1));
}
/** The phrases every draft is checked against: learned and added, less what the owner struck. */
export const activeTells = (t: StoredTells): string[] => [...new Set([...t.learned, ...t.added])].filter((x) => !t.struck.includes(x));

/** The author's passages a skill serves (core/compiler/voice.ts), chosen at build; null when off or never chosen. */
export function getVoice(l: StoreLayout): Voice | null {
  const p = join(dirs(l).base, 'voice.json');
  return existsSync(p) ? readJson<Voice>(p, { what: "the voice passages" }) : null;
}
export function setVoice(l: StoreLayout, voice: Voice | null): void {
  const p = join(dirs(l).base, 'voice.json');
  if (voice === null) { if (existsSync(p)) rmSync(p); return; }
  mkdirSync(dirs(l).base, { recursive: true });
  writeAtomic(p, JSON.stringify(voice, null, 1));
}

/** The last `atelier mine` report, so `--add <n>` names the item the owner read. */
export interface MiningReport { readonly at: string; readonly standardVersionHash?: string; readonly items: readonly Recurrence[] }
export function getMining(l: StoreLayout): MiningReport | null {
  const p = join(dirs(l).base, 'mine.json');
  return existsSync(p) ? readJson<MiningReport>(p, { what: 'the last mining report' }) : null;
}
export function setMining(l: StoreLayout, report: MiningReport): void {
  mkdirSync(dirs(l).base, { recursive: true });
  writeAtomic(join(dirs(l).base, 'mine.json'), JSON.stringify(report, null, 1));
}

/**
 * THE REGRESSION FLOOR's state for a skill (see ../distinctiveness/measured.ts): the contract (which
 * rules it watches, the margin on each, ENFORCE or OBSERVE), the tasks it is measured on, and the
 * qualification an A/A run earned. The qualification names the contract and tasks it was earned on;
 * change either and it no longer applies.
 */
export interface FloorState {
  readonly contract: QualityFloorContract | null;
  readonly tasks: readonly string[];
  /** `contractHash` names everything the rate is a rate of (see qualificationKey in cli/commands/floor.ts) */
  readonly qualification: (FloorQualification & { readonly contractHash: string; readonly fires: number }) | null;
  /** A/A evidence so far, on the contract, tasks and model it was gathered under; runs accumulate */
  readonly aa?: { readonly contractHash: string; readonly falseAlarms: number; readonly trials: number;
    /** planted regressions of PLANTED_MARGINS × the margin, and how many the floor caught */
    readonly plantedHits?: number; readonly planted?: number };
}
const floorDir = (l: StoreLayout): string => join(dirs(l).base, 'floor');
export function getFloor(l: StoreLayout): FloorState {
  const p = join(floorDir(l), 'state.json');
  return existsSync(p) ? readJson<FloorState>(p, { what: 'the regression floor' }) : { contract: null, tasks: [], qualification: null };
}
export function setFloor(l: StoreLayout, f: FloorState): void {
  mkdirSync(floorDir(l), { recursive: true });
  writeAtomic(join(floorDir(l), 'state.json'), JSON.stringify(f, null, 1));
}
/** The frozen per-task scores of one SkillVersion: what a candidate is compared against. */
export function getBaseline(l: StoreLayout, skillVersionHash: string): readonly FrozenBaselineEntry[] | null {
  const p = join(floorDir(l), `baseline-${skillVersionHash}.json`);
  return existsSync(p) ? readJson<FrozenBaselineEntry[]>(p, { kind: 'array', what: 'a frozen floor baseline' }) : null;
}
export function setBaseline(l: StoreLayout, skillVersionHash: string, entries: readonly FrozenBaselineEntry[]): void {
  mkdirSync(floorDir(l), { recursive: true });
  writeAtomic(join(floorDir(l), `baseline-${skillVersionHash}.json`), JSON.stringify(entries, null, 1));
}

/**
 * The write-this-not-that pairs a skill ships (see ../compiler/contrast-examples.ts), chosen at build
 * and kept through every rebuild so the package is the same whichever command renders it. `off` is the
 * owner's `--contrast none`.
 */
export interface StoredContrast { readonly off: boolean; readonly pairs: readonly ContrastPair[] }
export function getContrast(l: StoreLayout): StoredContrast {
  const p = join(dirs(l).base, 'contrast.json');
  return existsSync(p) ? readJson<StoredContrast>(p, { what: 'the contrast examples' }) : { off: false, pairs: [] };
}
export function setContrast(l: StoreLayout, c: StoredContrast): void {
  mkdirSync(dirs(l).base, { recursive: true });
  writeAtomic(join(dirs(l).base, 'contrast.json'), JSON.stringify(c, null, 1));
}

/**
 * The KIND OF DOCUMENT a skill's measured rules describe: "blog-post", "support-reply". Every
 * threshold was read off pieces of one kind, and a fragment cap calibrated on essays says nothing true
 * about a tweet. Declared by the owner; null when they never said.
 */
export function getDocClass(l: StoreLayout): string | null {
  const p = join(dirs(l).base, 'class.txt');
  return existsSync(p) ? readFileSync(p, 'utf8').trim() || null : null;
}
export function setDocClass(l: StoreLayout, cls: string | null): void {
  const p = join(dirs(l).base, 'class.txt');
  if (cls === null) { if (existsSync(p)) rmSync(p); return; }
  mkdirSync(dirs(l).base, { recursive: true });
  writeAtomic(p, cls);
}

/**
 * The person's MATERIAL for a skill: notes, anecdotes, figures and sources they vouch for. Served with
 * every task, and the only place a first-person story or a cited figure in the output may come from.
 */
export function getMaterial(l: StoreLayout): { name: string; text: string }[] {
  const d = join(dirs(l).base, 'material');
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => !f.startsWith('.')).sort().map((f) => ({ name: f, text: readFileSync(join(d, f), 'utf8') }));
}
export function addMaterial(l: StoreLayout, name: string, text: string): void {
  const d = join(dirs(l).base, 'material');
  mkdirSync(d, { recursive: true });
  writeAtomic(join(d, name.replace(/[^A-Za-z0-9._-]/g, '-')), text);
}
export function clearMaterial(l: StoreLayout): void {
  const d = join(dirs(l).base, 'material');
  if (existsSync(d)) rmSync(d, { recursive: true, force: true });
}

export const getStandard = (l: StoreLayout, hash: string): StandardVersion | null => {
  const p = join(dirs(l).standards, `${hash}.json`);
  return existsSync(p) ? readJson<StandardVersion>(p, { what: 'a StandardVersion', requireKeys: ['requirements'] }) : null;
};

export function putSkillVersion(l: StoreLayout, s: SkillVersion): void {
  writeAtomic(join(dirs(l).versions, `${s.skillVersionHash}.json`), JSON.stringify(s, null, 1));
}
export const getSkillVersion = (l: StoreLayout, hash: string): SkillVersion | null => {
  const p = join(dirs(l).versions, `${hash}.json`);
  return existsSync(p) ? readJson<SkillVersion>(p, { what: 'a SkillVersion', requireKeys: ['skillVersionHash'] }) : null;
};

/**
 * ─── WHY THE ARRANGEMENT AND THE ARTEFACT ARE STORED, NOT RE-DERIVED ────────────────────────────
 *
 * `SkillVersion` records `architectureHash` and `materializedHash` but neither the components nor
 * the files. That was survivable while every architecture was the DEFAULT one — `compileArchitecture`
 * could reproduce it from the standard. It stops being survivable the moment a repair produces a
 * NON-default arrangement: there is then no way to reconstruct what a candidate was, and a candidate
 * that cannot be reconstructed cannot be served, compared, or promoted.
 *
 * Storing the package too is what makes "the exact package the person evaluated is the exact package
 * promoted" a fact about storage rather than a hope about determinism. Re-rendering to check a hash
 * proves the renderer still agrees with itself; it does not prove the person saw this artefact.
 */

/** Structural, so `core/` never imports `renderers/`. A PortableSkillPackage satisfies it as-is. */
export interface StoredPackage {
  readonly packageHash: string;
  readonly skillId: string;
  readonly standardVersionHash: string;
  readonly architectureHash: string;
  readonly files: Readonly<Record<string, string>>;
  /**
   * Provenance and regression material. NEVER SERVED to a model.
   *
   * Declared because it is already written. `putPackage` takes the rendered package whole, so this
   * has been persisted since the renderer emitted it while the type said otherwise — a type lying by
   * omission about what is on disk, which is how a reader concludes the manifest is not kept and
   * recomputes it instead of reading what was actually built.
   */
  readonly assurance?: Readonly<Record<string, string>>;
}

/**
 * Same identity discipline as `putStandard`: one hash, one body, refuse on disagreement.
 *
 * The mkdir is not defensive clutter — stores created before these two directories existed are
 * still on disk, and a write into a missing directory during a repair would surface as a crash
 * mid-candidate rather than as the migration it actually is.
 */
function putByHash(path: string, hash: string, body: unknown, what: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const text = JSON.stringify(body, null, 1);
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') !== text) {
      throw new Error(`STORE: ${what} ${hash} already exists with different content. A hash is an identity; two bodies cannot share one.`);
    }
    return;
  }
  writeAtomic(path, text);
}

/**
 * KEYED BY (standard, architecture), NOT BY architectureHash ALONE.
 *
 * `architectureHash` is deliberately hashed over COMPONENTS only — that is what lets two arrangements
 * of one standard differ, and it is the property the whole optimizer rests on. But a `SkillArchitecture`
 * body also carries the standard it serves, so the SAME arrangement over a DIFFERENT standard has one
 * hash and two bodies.
 *
 * That is not hypothetical: amending a rule's wording changes the standard and leaves the arrangement
 * untouched, which is the common case. The refuse-on-overwrite guard caught it on the first amend
 * rather than letting one body silently replace the other — a stored architecture pointing at the
 * wrong standard would fail `assertArchitectureServesStandard` much later, somewhere unrelated.
 */
const archKey = (a: Pick<SkillArchitecture, 'standardVersionHash' | 'architectureHash'>): string =>
  `${a.standardVersionHash}.${a.architectureHash}`;

export function putArchitecture(l: StoreLayout, a: SkillArchitecture): void {
  putByHash(join(dirs(l).architectures, `${archKey(a)}.json`), archKey(a), a, 'architecture');
}
export const getArchitecture = (l: StoreLayout, hash: string, standardVersionHash?: string): SkillArchitecture | null => {
  const direct = standardVersionHash ? join(dirs(l).architectures, `${standardVersionHash}.${hash}.json`) : null;
  if (direct && existsSync(direct)) return readJson<SkillArchitecture>(direct, { what: 'a skill architecture' });
  // legacy + convenience: fall back to a unique suffix match when the standard is not supplied
  const d = dirs(l).architectures;
  if (!existsSync(d)) return null;
  const hits = readdirSync(d).filter((f) => f === `${hash}.json` || f.endsWith(`.${hash}.json`));
  if (hits.length === 1) return readJson<SkillArchitecture>(join(d, hits[0]), { what: 'a skill architecture' });
  if (hits.length === 0) return null;
  // AMBIGUOUS IS NOT ABSENT, AND RETURNING null CONFLATED THEM.
  //
  // One architectureHash under two standards is the ordinary result of amending a confirmed rule:
  // same carriers, new standard. This returned null there, and `improve.ts` reads that as "never
  // persisted" and silently recompiles the default arrangement — losing the stored one, which is the
  // exact thing this persistence exists to keep. Callers know their standard; the fix is to pass it,
  // and to refuse rather than guess when they have not.
  throw new Error(`STORE: architecture ${hash} exists under ${hits.length} standards `
    + `(${hits.join(', ')}). Pass the standardVersionHash: which one is meant is not recoverable here, `
    + 'and picking one would silently attribute an arrangement to the wrong standard.');
};

export function putPackage(l: StoreLayout, pkg: StoredPackage): void {
  putByHash(join(dirs(l).packages, `${pkg.packageHash}.json`), pkg.packageHash, pkg, 'package');
}
export const getPackage = (l: StoreLayout, hash: string): StoredPackage | null => {
  const p = join(dirs(l).packages, `${hash}.json`);
  return existsSync(p) ? readJson<StoredPackage>(p, { what: 'a stored package' }) : null;
};

/**
 * Executions and complaints. Append-only, one file per id, refuse-on-overwrite.
 *
 * The refusal matters most here and is the lesson of a research harness that overwrote a FAILED run
 * on re-fire: the record you least want silently replaced is the one that went wrong. An invocation
 * is a fact about something that happened; it is never revised.
 */
export function putInvocation(l: StoreLayout, r: InvocationRecord): void {
  putByHash(join(dirs(l).invocations, `${r.invocationId}.json`), r.invocationId, r, 'invocation');
}
export const getInvocation = (l: StoreLayout, id: string): InvocationRecord | null => {
  const p = join(dirs(l).invocations, `${id}.json`);
  return existsSync(p) ? readJson<InvocationRecord>(p, { what: 'an invocation record' }) : null;
};
/** Newest first. */
export function listInvocations(l: StoreLayout): readonly InvocationRecord[] {
  const d = dirs(l).invocations;
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith('.json'))
    .map((f) => readJson<InvocationRecord>(join(d, f), { what: 'an invocation record' }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Observations live in the event log, not a new directory.
 *
 * An observation is append-only, arrives many-per-invocation, and is read back by folding — the same
 * shape as repair events, which already reuse this log. A fourth store surface for the same access
 * pattern is the drift this codebase has paid for before.
 */
export function putObservation(l: StoreLayout, o: Observation): void {
  appendEvent(l, { kind: 'OBSERVATION', ...o });
}

/** Newest first. Folded from the log, so it cannot disagree with what was written. */
export function listObservations(l: StoreLayout): readonly Observation[] {
  return readEvents(l)
    .filter((e) => e.kind === 'OBSERVATION')
    .map((e) => { const { kind: _kind, ...rest } = e; return rest as unknown as Observation; })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function putFeedback(l: StoreLayout, f: FeedbackRecord): void {
  putByHash(join(dirs(l).feedback, `${f.feedbackId}.json`), f.feedbackId, f, 'feedback');
}
/**
 * A complaint is identified by (invocation, words), not by when it was typed. Re-entering the same
 * complaint keeps the FIRST record — its time and the rule its diagnosis named — and says so.
 *
 * The callers used to `putFeedback` a record carrying a fresh timestamp and swallow the store's
 * refusal in a bare catch, on the stated belief that a re-entry "writes the same bytes". It did not,
 * and the same catch hid any real I/O failure, so evidence could be lost without a word.
 */
export function putFeedbackOnce(l: StoreLayout, f: FeedbackRecord): { readonly written: boolean; readonly record: FeedbackRecord } {
  const path = join(dirs(l).feedback, `${f.feedbackId}.json`);
  if (existsSync(path)) return { written: false, record: readJson<FeedbackRecord>(path, { what: 'a feedback record' }) };
  putFeedback(l, f);
  return { written: true, record: f };
}
export function listFeedback(l: StoreLayout): readonly FeedbackRecord[] {
  const d = dirs(l).feedback;
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith('.json'))
    .map((f) => readJson<FeedbackRecord>(join(d, f), { what: 'a feedback record' }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** The ONLY mutable file. Rollback moves this and nothing else. */
export function setActive(l: StoreLayout, skillVersionHash: string): void {
  if (!getSkillVersion(l, skillVersionHash)) {
    throw new Error(`STORE: cannot activate ${skillVersionHash} — no such version. Activation points at history; it does not create it.`);
  }
  writeAtomic(join(dirs(l).base, 'active.json'), JSON.stringify({ skillVersionHash, at: new Date().toISOString() }, null, 1));
}
export const getActive = (l: StoreLayout): string | null => {
  const p = join(dirs(l).base, 'active.json');
  return existsSync(p) ? readJson<{ skillVersionHash: string }>(p, { what: 'the active pointer', requireKeys: ['skillVersionHash'] }).skillVersionHash : null;
};

/** Append-only event log. One JSON object per line; nothing is ever rewritten. */
export function appendEvent(l: StoreLayout, e: EvidenceEvent | Record<string, unknown>): void {
  appendFileSync(join(dirs(l).base, 'events.jsonl'), `${JSON.stringify(e)}\n`);
}
// A TORN TAIL IS RECOVERABLE. A TORN MIDDLE IS NOT, AND MUST NOT BE READ PAST.
//
// `appendEvent` is the one write in this system that is deliberately not atomic, because an append is
// the right shape for a ledger. The cost is that an interrupted append can leave a partial final line.
//
// Those two damage patterns mean opposite things and must not be handled the same way. A partial LAST
// line is a crash during a write: every earlier event is intact, the lost record is the one that was
// still being written, and refusing to start would make one interrupted keystroke brick every command
// that reads history. A damaged line ANYWHERE ELSE is corruption of a history that claims to be
// append-only, and reading past it would silently report a ledger missing a record it cannot name.
// The second case is exactly the failure this project exists to refuse, so it throws.
export function readEvents(l: StoreLayout): readonly Record<string, unknown>[] {
  const p = join(dirs(l).base, 'events.jsonl');
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean);
  const out: Record<string, unknown>[] = [];
  lines.forEach((line, i) => {
    try {
      out.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      if (i !== lines.length - 1) {
        throw new Error(`LEDGER: event ${i + 1} of ${lines.length} in ${p} is not valid JSON. This is `
          + 'corruption in the middle of an append-only history, not a torn tail, and reading past it '
          + 'would report a history that is missing a record it cannot name.');
      }
      process.stderr.write(`atelier: the last line of ${p} is truncated, which is an interrupted `
        + `append. ${out.length} intact event(s) read; the torn record is lost.\n`);
    }
  });
  return out;
}

export interface HistoryEntry { readonly skillVersion: SkillVersion; readonly standard: StandardVersion | null; readonly active: boolean }

/** Newest first. The active pointer is shown, not assumed to be the newest. */
export function history(l: StoreLayout): readonly HistoryEntry[] {
  const d = dirs(l);
  if (!existsSync(d.versions)) return [];
  const active = getActive(l);
  return readdirSync(d.versions).filter((f) => f.endsWith('.json'))
    .map((f) => readJson<SkillVersion>(join(d.versions, f), { what: 'a SkillVersion' }))
    .sort((a, b) => b.builtAt.localeCompare(a.builtAt))
    .map((s) => ({ skillVersion: s, standard: getStandard(l, s.standardVersionHash), active: s.skillVersionHash === active }));
}


// ── RUNTIME BINDINGS ─────────────────────────────────────────────────────────────────────────
//
// Which runtimes a SkillVersion has ever been served through, IN ORDER. The first is the one its
// evidence came from; the rest are runtimes a person deliberately accepted afterwards.
//
// Kept beside the version rather than inside it, because a binding is not part of the version's
// identity. The package is byte-identical whichever model runs it — putting the runtime in the
// SkillVersion hash would mint a new version of an unchanged artefact every time someone switched
// backends, and the hash would stop meaning "different bytes".

import type { RuntimeBinding } from '../runtime/binding.js';
import { bindingHash } from '../runtime/binding.js';

interface BindingLog { readonly bindings: { binding: RuntimeBinding; hash: string; firstSeenAt: string }[] }

const bindingPath = (l: StoreLayout, skillVersionHash: string): string =>
  join(dirs(l).bindings, `${skillVersionHash}.json`);

export function listBindings(l: StoreLayout, skillVersionHash: string): BindingLog['bindings'] {
  const p = bindingPath(l, skillVersionHash);
  return existsSync(p) ? readJson<BindingLog>(p, { what: 'the binding log' }).bindings : [];
}

/**
 * The binding this SkillVersion's evidence came from — the FIRST one it ever ran under.
 *
 * Not "the most recent". Most-recent would silently redefine the baseline every time someone tried a
 * different model, so the guard would never fire twice and the whole point would be lost after one use.
 */
export function expectedBinding(l: StoreLayout, skillVersionHash: string): RuntimeBinding | null {
  return listBindings(l, skillVersionHash)[0]?.binding ?? null;
}

/** Append-only, and a no-op for a binding already on the log. */
export function recordBinding(l: StoreLayout, skillVersionHash: string, binding: RuntimeBinding): void {
  const h = bindingHash(binding);
  const existing = listBindings(l, skillVersionHash);
  if (existing.some((b) => b.hash === h)) return;
  mkdirSync(dirs(l).bindings, { recursive: true });
  const next: BindingLog = { bindings: [...existing, { binding, hash: h, firstSeenAt: new Date().toISOString() }] };
  writeAtomic(bindingPath(l, skillVersionHash), JSON.stringify(next, null, 1));
}
