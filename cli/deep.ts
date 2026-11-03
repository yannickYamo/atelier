// atelier/cli/deep.ts — A DEEP RUN: FACTS FIRST, A DEALT DIRECTION, AND A REVIEW BEFORE DELIVERY.
//
// `atelier run --deep` (or `atelier fidelity --set mode=deep`, for every run of a skill). Without it nothing here runs and
// a run is what it always was. With it, before the draft:
//   1. the library is read (core/library/loader.ts: the public core, and a pack named by ATELIER_LIBRARY over it);
//   2. a bounded web pass looks up facts the material lacks (core/enrich/), where a search can be made; --no-enrich skips it;
//   3. the facts only this subject has are listed, each with where it came from (core/loop/inventory.ts);
//   4. the questions are read from the gaps in those facts as well as from the author's decisions (cli/prewrite.ts);
//   5. three directions are dealt by code, one is chosen by a reading, and the writer is told it (core/library/dealer.ts),
//      with the plain model's habits in form to avoid where they are known (core/library/rendition.ts).
// After the draft, the story and thin checks name spans to repair, the reviewer reads the piece apart from the writer, and
// its verdict decides one bounded pass (cli/commands/invoke.ts, `withDeep`). What it all did is on the record (`deep`).
//
// What is served to the writer is facts and form, said in its own block after the skill: never the library's cards, which
// only the reviewer reads, and never anything of the author's voice, which stays in the skill.

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { argv, flag, providerFor, runFile, sha, DATA } from './runtime.js';
import * as store from '../core/state/store.js';
import type { Budget, InferenceClient } from '../core/inference/client.js';
import { readContext, type DecidedBy, type Decision } from '../core/inference/reading.js';
import { readingAs } from '../core/inference/step-guard.js';
import { loadLibrary, anglesFor, beatsFor, cardsFor, rubricFor, type LoadedLibrary } from '../core/library/loader.js';
import type { Angle, Card, Rubric } from '../core/library/schema.js';
import { dealAngles, chooseAngle, directionNote, recordAngleUse, recentAngles, CANON, type Chosen, type Deal } from '../core/library/dealer.js';
import { RENDITION, renditionNote, readRenditionPrior, writeRenditionPrior, type RenditionPrior } from '../core/library/rendition.js';
import { skillDir } from '../core/library/state.js';
import { enrichWithRecord, NullEnricher, type Enricher, type EnrichRecord } from '../core/enrich/enrich.js';
import { AnthropicSearchEnricher } from '../providers/anthropic-search.js';
import { readInventory, renderInventory, type FactInventory } from '../core/loop/inventory.js';
import { renderGapLineRule } from '../core/loop/gap-lines.js';
import { factCoverage, enrichedLedger } from '../core/loop/fact-ledger.js';
import { readLoops, LOOP_READER_VERSION } from '../core/story/loops.js';
import { loopFeatures, type LoopFeatures } from '../core/story/features.js';
import { storyBands, type Band, type StoryBands } from '../core/story/bands.js';
import { readNovelty, noveltyFeaturesOf, noveltyBand, NOVELTY_READER_VERSION, type NoveltyFeatures } from '../core/story/novelty.js';
import { writeAtomic } from '../core/state/fs-atomic.js';
import { readJson } from '../core/state/read-json.js';
import type { DeepRecord } from '../core/state/canonical-state.js';
import type { Review } from '../core/review/reviewer.js';

/** The kind a deep run writes when none is named, or the one named has nothing in the library. */
export const DEFAULT_KIND = 'blog';
/** What a deep run adds to the run's bounds: its readings, the web pass, the story and review passes and one more draft. */
export const DEEP_USD = 1.5;
export const DEEP_CALLS = 40;
/** The golden pieces read for the story and novelty bands: enough to give a band of the author's own, few enough to stay cheap. */
export const BAND_PIECES = 5;
/** How many of the author's pieces the reviewer is shown, and how much of each. */
const EXCERPTS = 3; const EXCERPT_CHARS = 1200;

/** Whether this run is deep: `--deep`, or the skill's release says every run is. */
export const deepAsked = (mode: 'deep' | undefined): boolean => argv.includes('--deep') || mode === 'deep';

/** A small reader: the client and the model name it is recorded under. */
export interface DeepReader { readonly client: InferenceClient | null; readonly model: string | null }

/** Where facts from outside the material come from: a web search where one can be made, nothing otherwise, said why. */
export function enricherFor(): { readonly enricher: Enricher; readonly off?: string } {
  if (argv.includes('--no-enrich')) return { enricher: NullEnricher, off: 'turned off (--no-enrich)' };
  if (providerFor('target') !== 'anthropic') return { enricher: NullEnricher, off: 'the web pass runs on the Anthropic provider only' };
  if (!process.env.ANTHROPIC_API_KEY) return { enricher: NullEnricher, off: 'no ANTHROPIC_API_KEY to search with' };
  return { enricher: new AnthropicSearchEnricher(process.env.ATELIER_CLAIMS_MODEL ? { model: process.env.ATELIER_CLAIMS_MODEL } : {}) };
}

/** The kind of piece: the one named with --kind where the library holds it, else the default, said when it fell back. */
export function kindFor(lib: LoadedLibrary, named: string | undefined): { readonly kind: string; readonly note?: string } {
  if (!named) return { kind: DEFAULT_KIND };
  const has = lib.cards.some((c) => c.kind === named) || lib.angles.some((a) => a.kind === named) || lib.rubrics.some((r) => r.kind === named);
  return has ? { kind: named } : { kind: DEFAULT_KIND, note: `the library holds nothing for "${named}"; written as ${DEFAULT_KIND}` };
}

/** Rubric weights as shares of one: a pack may weigh in points out of a hundred, the core in small whole numbers. */
export function normalisedRubric(r: Rubric): Rubric {
  const total = r.criteria.reduce((n, c) => n + (c.weight > 0 ? c.weight : 0), 0);
  return total > 0 ? { ...r, criteria: r.criteria.map((c) => ({ ...c, weight: Math.round((c.weight / total) * 1e6) / 1e6 })) } : r;
}

// ── BEFORE THE DRAFT: THE LIBRARY, THE WEB PASS, THE FACTS ─────────────────────────────────────────────────────────

export interface DeepFacts {
  readonly runId: string;
  readonly lib: LoadedLibrary;
  readonly kind: string;
  readonly enrichment: EnrichRecord | null;
  readonly enrichOff?: string;
  readonly inventory: Decision<FactInventory>;
  /** the library's wording of the gap questions, for cli/prewrite.ts */
  readonly wording: readonly { readonly gap: string; readonly ask: string; readonly unlocks: string }[];
}

/** The library, the web pass and the fact inventory, in that order. Never throws for a pass that cannot run: it says why. */
export async function deepFacts(o: { readonly runId: string; readonly request: string; readonly material: readonly { readonly name: string; readonly text: string }[];
  readonly reader: DeepReader; readonly budget: Budget; readonly enricher: Enricher; readonly enrichOff?: string; readonly say: (line: string) => void }): Promise<DeepFacts> {
  const lib = loadLibrary();
  for (const p of lib.problems) o.say(`(library: ${p})`);
  const { kind, note } = kindFor(lib, flag('--kind'));
  if (note) o.say(`(deep: ${note}.)`);
  const materialText = o.material.map((m) => m.text).join('\n\n');
  let enrichment: EnrichRecord | null = null;
  if (!o.enrichOff) {
    try { enrichment = await enrichWithRecord(o.request, materialText, o.enricher, o.reader.client, o.budget, { model: o.reader.model }); }
    catch (e) { o.say(`(the web pass could not run: ${(e as Error).message.split('\n')[0]}; the piece is written from your material.)`); }
  }
  const inventory = await readInventory({ request: o.request, material: o.material, ...(enrichment?.docs.length ? { enriched: enrichment.docs } : {}) }, o.reader.client, o.reader.model, o.budget);
  const facts = inventory.value.facts;
  o.say(`Facts listed before writing: ${facts.length} (${facts.filter((f) => f.source === 'material').length} from your material, ${facts.filter((f) => f.source === 'enriched').length} from the web, ${facts.filter((f) => f.source === 'sample').length} missing and marked as such)${inventory.by === 'model' ? '' : ` — ${inventory.why ?? 'not read'}`}.`);
  if (enrichment) o.say(`Web pass: ${enrichment.queries.value.length} search(es), ${enrichment.docs.length} page(s) read (${enrichment.via}).${enrichment.notes.length ? ` ${enrichment.notes.length} could not be read.` : ''}`);
  else if (o.enrichOff) o.say(`Web pass: not run (${o.enrichOff}).`);
  return { runId: o.runId, lib, kind, enrichment, ...(o.enrichOff ? { enrichOff: o.enrichOff } : {}), inventory,
    wording: lib.questions.map((q) => ({ gap: q.gap, ask: q.ask, unlocks: q.unlocks })) };
}

/** The longest stretch of a web page the reviewer reads when no fact was listed from it. */
export const REVIEW_PAGE_CHARS = 800;

/**
 * WHAT THE REVIEWER AND THE DRAFT COMPARISON READ FROM THE WEB PASS: the facts the inventory listed from it (each with
 * its quote and URL), which is what the writer was served. Whole pages (up to 30,000 characters) went into every review
 * and both comparison calls on the writer's model, about a tenth of a deep run's cost for text no draft was written from.
 * Where the inventory listed nothing from the web, the start of each page stands in, capped.
 */
export function reviewEnrichment(f: Pick<DeepFacts, 'enrichment' | 'inventory'>): string[] {
  const listed = f.inventory.value.facts.filter((x) => x.source === 'enriched');
  if (listed.length) return listed.map((x) => `${x.text} (${x.sourceRef})${x.quote ? `\nquote: "${x.quote}"` : ''}`);
  return (f.enrichment?.docs ?? []).map((x) => `${x.title} (${x.url})\n${x.text.slice(0, REVIEW_PAGE_CHARS)}`);
}

// ── BEFORE THE DRAFT: THE DIRECTION AND WHAT THE WRITER IS TOLD ────────────────────────────────────────────────────

export interface DeepDirection {
  readonly deal: Deal;
  readonly chosen: Chosen;
  readonly angle: Angle | null;
  readonly rendition: { readonly prior: RenditionPrior | null; readonly from: 'stored' | 'read now' | 'none'; readonly why?: string };
  /** the blocks served to the writer, by name, and the text served */
  readonly served: readonly string[];
  readonly note: string;
}

/** Three directions dealt, one chosen, the use kept; the plain model's habits found; the writer's block written. */
export async function deepDirection(o: { readonly L: store.StoreLayout; readonly facts: DeepFacts; readonly request: string; readonly reader: DeepReader; readonly budget: Budget; readonly say: (line: string) => void }): Promise<DeepDirection> {
  const { facts } = o;
  const angles = anglesFor(facts.lib, facts.kind);
  const count = facts.inventory.value.facts.filter((f) => f.source !== 'sample').length;
  const reader = { client: o.reader.client, model: o.reader.model, budget: o.budget };
  const deal = await dealAngles(angles, { kind: facts.kind, requestSummary: o.request, inventoryCount: count, recent: recentAngles(o.L, 5, facts.kind), seed: facts.runId }, 3, reader);
  const candidates = deal.dealt.map((id) => angles.find((a) => a.id === id)).filter((a): a is Angle => a !== undefined);
  const chosen = await chooseAngle(candidates, { requestSummary: o.request, inventoryCount: count, seed: facts.runId }, o.reader.client, o.reader.model, o.budget);
  const angle = chosen.choice === CANON ? null : candidates.find((a) => a.id === chosen.choice) ?? null;
  recordAngleUse(o.L, { angle: chosen.choice, kind: facts.kind, dealt: chosen.dealt, seed: facts.runId, at: new Date().toISOString() });
  o.say(`Direction: ${angle ? angle.idea : 'the conventional way for this kind'} (dealt ${chosen.dealt.join(', ') || 'nothing'}; ${chosen.by === 'model' ? `chosen: ${chosen.reason}` : chosen.reason}).`);
  const rendition = await renditionFor(o.L, facts.kind, o.reader, o.budget);
  const inv = facts.inventory.value;
  const samples = inv.facts.filter((f) => f.source === 'sample').length;
  const blocks: [string, string][] = [
    ['facts', renderInventory(inv)],
    ['proof rule', renderGapLineRule({ samples })],
    ['direction', directionNote(angle ?? CANON)],
    ['habits to avoid', renditionNote(rendition.prior)],
  ];
  const kept = blocks.filter(([, t]) => t.trim());
  return { deal, chosen, angle, rendition, served: kept.map(([n]) => n), note: kept.map(([, t]) => t).join('\n\n') };
}

// ── THE PLAIN MODEL'S HABITS: AT A BUILD WITH --deep, OR ON THE FIRST DEEP RUN ──────────────────────────────────────

/** The prior kept with the skill; else read now from the plain drafts this project's build wrote, and kept. */
export async function renditionFor(L: store.StoreLayout, kind: string, reader: DeepReader, budget: Budget): Promise<DeepDirection['rendition']> {
  const kept = readRenditionPrior(L);
  if (kept?.kind === kind) return { prior: kept, from: 'stored' };
  const path = runFile('contrast-drafts.json');
  let drafts: string[] = [];
  try { if (existsSync(path)) drafts = [...readJson<{ drafts: string[] }>(path, { what: 'the plain drafts' }).drafts]; } catch { drafts = []; }
  if (drafts.length < 2) return { prior: null, from: 'none', why: 'no plain drafts from the build are kept in this folder' };
  const prior = await readRenditionAt(L, kind, drafts, reader, budget);
  return prior ? { prior, from: 'read now' } : { prior: null, from: 'none', why: 'the plain drafts show no habit two of them share, or no model read them' };
}

/** One reading of the plain drafts' form, kept with the skill where it found a habit. */
export async function readRenditionAt(L: store.StoreLayout, kind: string, drafts: readonly string[], reader: DeepReader, budget: Budget): Promise<RenditionPrior | null> {
  const d = await readContext(RENDITION, { kind, drafts }, reader.client, reader.model, budget);
  if (!d.value.habits.length) return null;
  writeRenditionPrior(L, d.value);
  return d.value;
}

// ── THE STORY AND NOVELTY BANDS: THE AUTHOR'S OWN, READ ONCE AND KEPT ───────────────────────────────────────────────

export interface DeepBands { readonly story: StoryBands; readonly novelty: Band; readonly from: 'stored' | 'read now' | 'assumed'; readonly why?: string }
interface BandsFile { readonly key: string; readonly story: StoryBands; readonly novelty: Band; readonly pieces: number }
const BANDS_FILE = 'story-bands.json';
const bandsKey = (kind: string): string => `${kind}|${LOOP_READER_VERSION}|${NOVELTY_READER_VERSION}`;

/** The bands kept with the skill for this kind and these readers; else read from the author's pieces now (kept), else assumed. */
export async function bandsFor(L: store.StoreLayout, lib: LoadedLibrary, kind: string, golden: readonly string[], reader: DeepReader, budget: Budget): Promise<DeepBands> {
  const path = join(skillDir(L), BANDS_FILE);
  if (existsSync(path)) {
    try {
      const b = readJson<BandsFile>(path, { kind: 'object', what: 'the story bands' });
      if (b.key === bandsKey(kind)) return { story: b.story, novelty: b.novelty, from: 'stored' };
    } catch { /* read again below */ }
  }
  return readBandsAt(L, lib, kind, golden, reader, budget);
}

/** Read the author's pieces for loops and novelty and keep their bands; with nothing read, the library's priors, assumed. */
export async function readBandsAt(L: store.StoreLayout, lib: LoadedLibrary, kind: string, golden: readonly string[], reader: DeepReader, budget: Budget): Promise<DeepBands> {
  const pieces = golden.filter((g) => g.trim()).slice(0, BAND_PIECES);
  const client = reader.client ? readingAs('story reader', reader.client) : null;
  const loops: LoopFeatures[] = []; const novel: NoveltyFeatures[] = [];
  for (const p of client ? pieces : []) {
    const l = await readLoops(p, client, reader.model, budget);
    if (l.graph) loops.push(loopFeatures(l.graph));
    const n = await readNovelty(p, client, reader.model, budget);
    if (n.map) novel.push(noveltyFeaturesOf(p, n.map));
  }
  const story = storyBands(loops, kind, beatsFor(lib, kind));
  const novelty = noveltyBand(novel).longestStretchWords;
  if (!loops.length && !novel.length) return { story, novelty, from: 'assumed', why: !client ? 'no model to read your pieces: the library\'s priors are used' : 'none of your pieces could be read: the library\'s priors are used' };
  mkdirSync(skillDir(L), { recursive: true });
  writeAtomic(join(skillDir(L), BANDS_FILE), JSON.stringify({ key: bandsKey(kind), story, novelty, pieces: pieces.length } satisfies BandsFile, null, 1));
  return { story, novelty, from: 'read now' };
}

/** The author's pieces as the skill keeps them. */
export const goldenOf = (L: store.StoreLayout): string[] => [...(store.getVoice(L)?.pieces ?? [])];

/** A few excerpts of the author's pieces, for the reviewer's sense of the voice. */
export const excerptsOf = (golden: readonly string[]): string[] => golden.slice(0, EXCERPTS).map((g) => g.slice(0, EXCERPT_CHARS));

/** What the reviewer reads: the rubric (weights as shares) and the kind's cards. Null where the library has no rubric. */
export function reviewKit(lib: LoadedLibrary, kind: string): { readonly rubric: Rubric; readonly cards: readonly Card[] } | null {
  const r = rubricFor(lib, kind);
  return r ? { rubric: normalisedRubric(r), cards: cardsFor(lib, kind) } : null;
}

/** The seed of a deep run's deal: its own id, from the request and the moment it began. */
export const deepRunId = (request: string, started: number): string => `d${sha(`${request}|${started}`).slice(0, 10)}`;

// ── AT A BUILD WITH --deep ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * THE BUILD'S SHARE (cli/commands/discover.ts, after the plain drafts): the plain model's habits in form, and the story and
 * novelty bands of the author's pieces, read once and kept with the skill. Only when the build is asked for --deep; a run
 * that finds neither reads them itself the first time.
 */
export async function deepAtBuild(o: { readonly skillName: string | null; readonly drafts: readonly string[]; readonly pieces: readonly string[]; readonly reader: DeepReader; readonly say: (line: string) => void }): Promise<void> {
  if (!o.skillName) { o.say('(--deep at build: the skill has no name yet; its first deep run reads the habits and bands instead.)'); return; }
  const L = { root: DATA, skillName: o.skillName };
  const lib = loadLibrary();
  const { kind } = kindFor(lib, flag('--kind'));
  const budget: Budget = { spentUsd: 0, capUsd: 1.0, maxCalls: 4 * BAND_PIECES + 2 };
  const prior = o.drafts.length >= 2 ? await readRenditionAt(L, kind, o.drafts, o.reader, budget) : null;
  const bands = await readBandsAt(L, lib, kind, o.pieces, o.reader, budget);
  o.say(`Deep runs: ${prior ? `${prior.habits.length} habit(s) of the plain model's in form kept` : 'no habit of the plain model\'s in form found'}; story bands ${bands.from === 'read now' ? 'read from your pieces' : `assumed (${bands.why ?? ''})`}.`);
}

// ── THE ONE PASS BACK THE REVIEWER'S VERDICT ASKS FOR ───────────────────────────────────────────────────────────────

/** What one more draft is told when the reviewer asks for it: its main failure, what to keep, its first fixes. Never its rubric or cards. */
export function reviewNote(r: Pick<Review, 'mainFailure' | 'keep' | 'fixes' | 'missingFacts'>): string {
  const failure: Readonly<Record<string, string>> = { 'missing-facts': 'it lacks facts the piece needs', invention: 'it states things nothing given supports', content: 'what it says does not hold up', craft: 'it is not built well enough', none: 'it falls short overall' };
  return [`A reader who read the draft apart from you found ${failure[r.mainFailure ?? 'none'] ?? failure.none}. Write the piece again from the start, in the same voice.`,
    r.keep ? `Keep: ${r.keep}` : '',
    r.fixes.length ? `Change:\n${r.fixes.slice(0, 3).map((f) => `- ${f.instruction}`).join('\n')}` : '',
    r.missingFacts.length ? `It needs, where the material or the facts listed give them (never invented):\n${r.missingFacts.slice(0, 5).map((x) => `- ${x}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
}

/** The facts read again with what the reviewer found missing, and the note one more draft is written from. */
export async function regatherNote(o: { readonly facts: DeepFacts; readonly missing: readonly string[]; readonly request: string; readonly material: readonly { readonly name: string; readonly text: string }[];
  readonly reader: DeepReader; readonly budget: Budget }): Promise<string> {
  const asked = o.missing.length ? `${o.request}\n\nThe piece was found short of these; list the facts the material holds for them first:\n${o.missing.map((x) => `- ${x}`).join('\n')}` : o.request;
  const docs = o.facts.enrichment?.docs ?? [];
  const again = await readInventory({ request: asked, material: o.material, ...(docs.length ? { enriched: docs } : {}) }, o.reader.client, o.reader.model, o.budget);
  const inv = again.value.facts.length ? again.value : o.facts.inventory.value;
  return [`A reader who read the draft apart from you found it short of facts. Write the piece again from the start, in the same voice, standing it on these.`,
    renderInventory(inv), renderGapLineRule({ samples: inv.facts.filter((f) => f.source === 'sample').length })].filter(Boolean).join('\n\n');
}

// ── THE RECORD ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** What a deep run did, gathered as it runs and written with the record. */
export interface DeepTrace {
  story?: DeepRecord['story'];
  choice?: DeepRecord['choice'];
  review?: DeepRecord['review'];
}

/** The record of a deep run, from what was decided before the draft, what happened after it, and the delivered work. */
export function deepRecord(f: DeepFacts, dir: DeepDirection, bands: DeepBands, t: DeepTrace, output: string, costUsd: number): DeepRecord {
  const facts = f.inventory.value.facts;
  const docs = f.enrichment?.docs ?? [];
  const used = docs.length ? factCoverage(output, [], enrichedLedger(docs)).enriched ?? [] : [];
  const by = (d: DecidedBy): string => d;
  return {
    runId: f.runId, kind: f.kind, library: { sources: f.lib.sources, problems: f.lib.problems },
    inventory: { by: by(f.inventory.by), ...(f.inventory.why ? { why: f.inventory.why } : {}),
      sourced: facts.filter((x) => x.source === 'material').length, enriched: facts.filter((x) => x.source === 'enriched').length, sample: facts.filter((x) => x.source === 'sample').length,
      facts: facts.map((x) => ({ text: x.text, source: x.source, sourceRef: x.sourceRef, quote: x.quote })) },
    enrichment: { via: f.enrichment?.via ?? NullEnricher.name, queries: f.enrichment?.queries.value ?? [], queriesBy: f.enrichment ? by(f.enrichment.queries.by) : 'off',
      urls: docs.map((d) => d.url), notes: f.enrichment?.notes ?? [], ...(f.enrichOff ? { off: f.enrichOff } : {}) },
    direction: { dealt: dir.chosen.dealt, choice: dir.chosen.choice, reason: dir.chosen.reason, by: by(dir.chosen.by), seed: dir.chosen.seed, fitBy: by(dir.deal.fitBy) },
    rendition: { habits: (dir.rendition.prior?.habits ?? []).map((h) => `${h.part.toLowerCase()}: ${h.habit}`), from: dir.rendition.from, ...(dir.rendition.why ? { why: dir.rendition.why } : {}) },
    bands: { from: bands.from, ...(bands.why ? { why: bands.why } : {}) },
    served: dir.served,
    ...(t.story ? { story: t.story } : {}), ...(t.choice ? { choice: t.choice } : {}), ...(t.review ? { review: t.review } : {}),
    enrichedUsed: used.map((u) => ({ text: u.text, url: u.url })),
    costUsd: Math.round(costUsd * 1e4) / 1e4,
  };
}

/** The lines a person reads about what the deep run did after the draft. */
export function deepLines(t: DeepTrace): string[] {
  const out: string[] = [];
  if (t.choice) out.push(`Of two drafts, ${t.choice.winner === 'tie' ? 'the ranking chose' : `${t.choice.decidedBy} chose draft ${t.choice.winner === 'a' ? 1 : 2}`}${t.choice.reasons[0] ? `: ${t.choice.reasons[0]}` : ''}.`);
  if (t.story) out.push(t.story.targets.length ? `Story and thin checks: ${t.story.targets.length} span(s) to repair; ${t.story.kept ? `${t.story.repaired} rewritten and kept` : `not kept${t.story.why ? ` (${t.story.why})` : ''}`}.` : `Story and thin checks: nothing to repair (${t.story.read}).`);
  if (t.review) out.push(`Reviewer: ${t.review.verdict}${t.review.overall !== null ? ` (${t.review.overall.toFixed(1)} of 10)` : ''}${t.review.why ? `, ${t.review.why}` : ''}; ${t.review.outcome}.`);
  return out;
}
