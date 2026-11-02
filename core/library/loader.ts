// atelier/core/library/loader.ts — THE LIBRARY, READ FROM DISK: THE PUBLIC CORE, AND A PRIVATE PACK OVER IT.
//
// The core ships with Atelier in `library/core/`; a pack, if the person keeps one, is a directory of the same files
// named by `packDir` or ATELIER_LIBRARY. The pack is merged over the core by id (a rubric or a beat prior has no id
// of its own: a rubric is keyed by its kind, a beat prior by its kind and beat), so a pack can replace one card and
// leave the rest. A library is user data: a file that is missing, unreadable or malformed, or an entry of the wrong
// shape, is left out and said in `problems`, never thrown.

import { existsSync, statSync } from 'node:fs';
import { readJson } from '../state/read-json.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type LIBRARY_FILES, type Angle, type BeatPrior, type Card, type Library, type PieceKind, type QuestionWording, type Rubric, type Tell } from './schema.js';

export interface LoadedLibrary extends Library {
  /** what was left out and why, one line each; empty when everything read */
  readonly problems: readonly string[];
}

const PACKAGE_NAME = '@yannickyamo/atelier';

/** The package root: the nearest directory above this file whose package.json is Atelier's (a checkout or an install). */
export function packageRoot(from: string = dirname(fileURLToPath(import.meta.url))): string | null {
  for (let dir = from, i = 0; i < 8; i++, dir = dirname(dir)) {
    const p = join(dir, 'package.json');
    if (existsSync(p)) {
      try { if (readJson<{ name?: unknown }>(p, { what: 'package.json' }).name === PACKAGE_NAME) return dir; } catch { /* not ours */ }
    }
    if (dirname(dir) === dir) break;
  }
  return null;
}

/** Where the public core sits in the package. */
export const coreLibraryDir = (): string | null => { const root = packageRoot(); return root ? join(root, 'library', 'core') : null; };

// ── SHAPES ─────────────────────────────────────────────────────────────────────────────────────
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (o: Obj, k: string): boolean => typeof o[k] === 'string' && (o[k]).trim() !== '';
const strs = (o: Obj, k: string): boolean => Array.isArray(o[k]) && (o[k] as unknown[]).every((x) => typeof x === 'string');
const num = (o: Obj, k: string): boolean => typeof o[k] === 'number' && Number.isFinite(o[k]);

/** What each file holds: the check of one entry, and the key it is merged by. A failing check names the field. */
interface Shape<T> { readonly check: (o: Obj) => string | null; readonly key: (t: T) => string }
const need = (o: Obj, fields: readonly [string, (o: Obj, k: string) => boolean][]): string | null =>
  fields.find(([k, ok]) => !ok(o, k))?.[0] ?? null;

const SHAPES = {
  'cards.json': { key: (c: Card) => c.id, check: (o) => need(o, [['id', str], ['kind', str], ['appliesWhen', str], ['theCall', str], ['strong', strs], ['nearMiss', str], ['weak', str], ['antiPatterns', strs], ['evidence', (x, k) => ['locked-golden', 'measured', 'principle'].includes(x[k] as string)]]) } as Shape<Card>,
  'angles.json': { key: (a: Angle) => a.id, check: (o) => need(o, [['id', str], ['kind', str], ['idea', str], ['structure', str], ['openingMove', str], ['evidenceType', str], ['fitsWhen', str], ['pitfalls', strs], ['steal', str]]) } as Shape<Angle>,
  'tells.json': { key: (t: Tell) => t.id, check: (o) => need(o, [['id', str], ['since', (x, k) => typeof x[k] === 'string' && /^\d{4}-\d{2}$/.test(x[k])], ['description', str], ['instead', str], ['status', (x, k) => x[k] === 'banned' || x[k] === 'warned']]) } as Shape<Tell>,
  'rubrics.json': { key: (r: Rubric) => r.kind, check: (o) => need(o, [['kind', str],
    ['criteria', (x, k) => Array.isArray(x[k]) && (x[k] as unknown[]).length > 0 && (x[k] as unknown[]).every((c) => isObj(c) && str(c, 'id') && num(c, 'weight') && (c.weight as number) > 0 && str(c, 'question'))],
    ['caps', (x, k) => Array.isArray(x[k]) && (x[k] as unknown[]).every((c) => isObj(c) && str(c, 'when') && num(c, 'max') && (c.max as number) >= 0 && (c.max as number) <= 10)]]) } as Shape<Rubric>,
  'beats.json': { key: (b: BeatPrior) => `${b.kind}\u0000${b.beat}`, check: (o) => need(o, [['kind', str], ['beat', str],
    ['position', (x, k) => num(x, k) && (x[k] as number) >= 0 && (x[k] as number) <= 1], ['concentration', (x, k) => num(x, k) && (x[k] as number) > 0], ['job', str]]) } as Shape<BeatPrior>,
  'questions.json': { key: (q: QuestionWording) => q.id, check: (o) => need(o, [['id', str], ['gap', str], ['ask', str], ['unlocks', str]]) } as Shape<QuestionWording>,
} satisfies Record<(typeof LIBRARY_FILES)[number], Shape<never>>;

/** One file of one layer: its valid entries, and a line for each thing left out. A missing file is an empty layer. */
function readLayer<T>(dir: string, file: keyof typeof SHAPES, label: string, problems: string[]): T[] {
  const path = join(dir, file);
  if (!existsSync(path)) return [];
  let raw: unknown[];
  try { raw = readJson<unknown[]>(path, { kind: 'array', what: `${label}/${file}` }); } catch (e) {
    // Unreadable, not JSON, or not a list: the reader's message says which, and the file is left out.
    problems.push(`${(e as Error).message.split('\n')[0]} Left out.`);
    return [];
  }
  const shape = SHAPES[file] as unknown as Shape<T>;
  const out: T[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, i) => {
    const bad = isObj(entry) ? shape.check(entry) : 'the entry';
    const name = isObj(entry) && typeof entry.id === 'string' ? entry.id : `entry ${i + 1}`;
    if (bad) { problems.push(`${label}/${file}: ${name} left out (${bad} missing or of the wrong kind)`); return; }
    const key = shape.key(entry as T);
    // Within one layer the first entry of a key stands; a repeat is a mistake, said.
    if (seen.has(key)) { problems.push(`${label}/${file}: ${name} repeated; the first one stands`); return; }
    seen.add(key);
    out.push(entry as T);
  });
  return out;
}

/** The core's entries with the pack's over them, by key: a replaced entry keeps the core's place in the order. */
function merge<T>(core: readonly T[], pack: readonly T[], key: (t: T) => string): T[] {
  const over = new Map(pack.map((t) => [key(t), t]));
  const merged = core.map((t) => over.get(key(t)) ?? t);
  const inCore = new Set(core.map(key));
  return [...merged, ...pack.filter((t) => !inCore.has(key(t)))];
}

/**
 * The library: the public core, and the pack (`opts.packDir`, else ATELIER_LIBRARY) over it when one is named and
 * exists. `coreDir` points at another core (tests). A pack named but absent is said in `problems` and not read.
 */
export function loadLibrary(opts: { readonly packDir?: string; readonly coreDir?: string } = {}): LoadedLibrary {
  const problems: string[] = [];
  const coreDir = opts.coreDir ?? coreLibraryDir();
  const sources: string[] = [];
  if (coreDir && existsSync(coreDir)) sources.push('core');
  else problems.push('the public core library was not found; only a pack is read');
  const named = opts.packDir ?? process.env.ATELIER_LIBRARY;
  const packDir = named?.trim() ? named : null;
  const packOk = packDir !== null && existsSync(packDir) && statSync(packDir).isDirectory();
  if (packDir !== null && !packOk) problems.push(`the library pack ${packDir} is not a directory here; not read`);
  if (packOk) sources.push(packDir);
  const layer = <T>(file: keyof typeof SHAPES): T[] => {
    const c = coreDir && sources.includes('core') ? readLayer<T>(coreDir, file, 'core', problems) : [];
    const p = packOk ? readLayer<T>(packDir, file, 'pack', problems) : [];
    return merge(c, p, (SHAPES[file] as unknown as Shape<T>).key);
  };
  return {
    cards: layer<Card>('cards.json'), angles: layer<Angle>('angles.json'), tells: layer<Tell>('tells.json'),
    rubrics: layer<Rubric>('rubrics.json'), beats: layer<BeatPrior>('beats.json'), questions: layer<QuestionWording>('questions.json'),
    sources, problems,
  };
}

// ── WHAT A PART READS ──────────────────────────────────────────────────────────────────────────
export const cardsFor = (lib: Library, kind: PieceKind): Card[] => lib.cards.filter((c) => c.kind === kind);
export const anglesFor = (lib: Library, kind: PieceKind): Angle[] => lib.angles.filter((a) => a.kind === kind);
export const rubricFor = (lib: Library, kind: PieceKind): Rubric | null => lib.rubrics.find((r) => r.kind === kind) ?? null;
/** The beat priors of a kind, in the order they fall in a piece. */
export const beatsFor = (lib: Library, kind: PieceKind): BeatPrior[] => lib.beats.filter((b) => b.kind === kind).sort((a, b) => a.position - b.position);
/** The tells that apply by default: banned and warned alike (a person's own rate may allow one, decided elsewhere). */
export const tellsActive = (lib: Library): Tell[] => [...lib.tells];
