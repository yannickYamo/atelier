// core/golden/case.ts — A GOLDEN CASE IS THREE THINGS, AND ONLY ONE OF THEM MAY NEVER BE SERVED.
//
// A finished piece of work shows what good looks like. It does not show what was asked, or what the person had in
// front of them when they did it. Reproduction can only be tested where all three are known and kept apart:
//
//   task        what the expert was asked to produce
//   material    what they had to work from before they produced it (sources, data, notes)
//   reference   what they produced
//
// THE RULE. The task and the material may be given to a candidate. The reference never is, and neither is anything
// made from it. A brief written from the finished work, or "facts" read off it, tells the candidate what the expert
// chose to say: the scope, the emphasis, sometimes the conclusion. A test run that way measures how well the
// candidate was told the answer.
//
// So a case has a class, and the class says what it can honestly be used for. Every class teaches the standard.
// Only a full case can be called held-out reproduction.

/** What a case holds beside its reference. */
export type CaseClass =
  /** the finished work alone: it teaches the standard, and can test nothing a candidate was not told */
  | 'REFERENCE_ONLY'
  /** the work and what was asked: a candidate can be given the task, and writes without the expert's sources */
  | 'TASK_AND_REFERENCE'
  /** the work, what was asked, and what the expert worked from: the only class that tests reproduction */
  | 'FULL_REPRO_CASE';

export interface CaseMaterial { readonly name: string; readonly text: string }

export interface GoldenCase {
  readonly id: string;
  /** what was asked, in the asker's words; null when the example does not carry it */
  readonly task: string | null;
  /** what the expert worked from; empty when the example does not carry it */
  readonly material: readonly CaseMaterial[];
  /** the finished work. Never served to a candidate, in whole or in part */
  readonly reference: string;
  readonly caseClass: CaseClass;
}

export const classOf = (task: string | null, material: readonly CaseMaterial[]): CaseClass =>
  (!task?.trim() ? 'REFERENCE_ONLY' : material.some((m) => m.text.trim()) ? 'FULL_REPRO_CASE' : 'TASK_AND_REFERENCE');

export const goldenCase = (id: string, reference: string, task: string | null = null, material: readonly CaseMaterial[] = []): GoldenCase => {
  const kept = material.filter((m) => m.text.trim());
  const asked = task?.trim() ? task.trim() : null;
  return { id, task: asked, material: kept, reference, caseClass: classOf(asked, kept) };
};

/** A folder named `<example>.material` beside an example holds that example's material. */
export const MATERIAL_DIR = /\.material$/i;
/** Whether a path (relative, forward slashes) lies inside some example's material folder. */
export const inMaterialDir = (rel: string): boolean => rel.split('/').slice(0, -1).some((d) => MATERIAL_DIR.test(d));
/** The material folder of an example file: `reports/acme.md` has `reports/acme.material`. */
export const materialDirOf = (rel: string): string => `${rel.replace(/\.[^./]+$/, '')}.material`;

/**
 * THE MATERIAL AN EXAMPLE NAMES IN ITS FRONT MATTER, read apart and removed, as `request:` is
 * (../intake/extract.ts). Two layouts: `material: a.md, notes/b.txt` on one line, or a YAML list under
 * `material:`. Paths are relative to the example's own folder. A file with no such key is returned byte for byte.
 */
export function splitMaterialRefs(raw: string): { text: string; refs: string[] } {
  const body = raw.replace(/^\uFEFF/, '');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body);
  if (!fm) return { text: raw, refs: [] };
  const lines = fm[1].split(/\r?\n/);
  const at = lines.findIndex((l) => /^materials?\s*:/i.test(l));
  if (at < 0) return { text: raw, refs: [] };
  const first = lines[at].replace(/^materials?\s*:\s*/i, '').trim();
  let end = at + 1;
  if (first === '') while (end < lines.length && /^\s*-\s+\S/.test(lines[end])) end += 1;
  const unquote = (s: string): string => s.trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim();
  const refs = (first === '' ? lines.slice(at + 1, end).map((l) => l.replace(/^\s*-\s+/, '')) : first.replace(/^\[|\]$/g, '').split(',')).map(unquote).filter(Boolean);
  // ONLY WHEN EVERY VALUE NAMES A FILE. A piece may have a `materials:` key of its own ("materials: wood, glue"), and
  // that is the author's front matter: read as files, it lost the line and printed two files that could not be read.
  if (!refs.length || !refs.every(isFileRef)) return { text: raw, refs: [] };
  // The key's own lines are taken out and nothing else is touched: a blank line elsewhere in the front matter (a
  // request of two paragraphs) stays where it was.
  const rest = [...lines.slice(0, at), ...lines.slice(end)];
  const after = body.slice(fm[0].length);
  return { text: rest.some((l) => l.trim() !== '') ? `---\n${rest.join('\n')}\n---\n${after}` : after.replace(/^\s*\n/, ''), refs: refs.map((r) => r.replace(/\\/g, '/')) };
}

/** A value that names a file: a path with an extension, and no comment, block marker or URL in it. */
export const isFileRef = (ref: string): boolean => /^[^#|>\s][^#|>]*\.[A-Za-z0-9]{1,6}$/.test(ref) && !/^[a-z]+:\/\//i.test(ref);

/** A ref that stays inside the folder it is read from: not absolute, and no `..` that climbs out of it. */
export const staysInside = (rel: string): boolean => !/^([/\\]|[A-Za-z]:)/.test(rel) && !rel.split('/').includes('..');

/**
 * Which of the files in one flat folder are named as material by another, by their names. For a command that
 * reads a folder of pieces itself: what an example was made from is not one of the author's pieces there either.
 */
export function namedAsMaterial(files: readonly { readonly name: string; readonly raw: string }[]): Set<string> {
  const names = new Map(files.map((f) => [f.name.toLowerCase(), f.name]));
  const out = new Set<string>();
  for (const f of files) for (const ref of splitMaterialRefs(f.raw).refs) {
    const hit = names.get(ref.replace(/^\.\//, '').toLowerCase());
    if (hit !== undefined && hit !== f.name) out.add(hit);
  }
  return out;
}

/**
 * WHAT A CANDIDATE IS GIVEN FOR A CASE: the task and the material, and nothing else. The one function a
 * reproduction run builds its input with, so that "the reference was not served" is a property of the code and not
 * of care. It takes no reference and cannot return one. A case with no task has nothing to serve: null.
 */
export function servedFor(c: Pick<GoldenCase, 'task' | 'material'>): { task: string; material: readonly CaseMaterial[] } | null {
  return c.task === null ? null : { task: c.task, material: c.material };
}

/**
 * Words in any script. A script written without spaces (Chinese, Japanese) is read a character at a time, so a
 * shared run is still a run there: counted in Latin letters alone, an identical Cyrillic or Chinese sentence shared
 * nothing with itself.
 */
const wordsOf = (t: string): string[] => t.toLowerCase().match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}'’]+/gu) ?? [];

/** For each word of `a`, how many words from there on are found in a row somewhere in `b`. */
function runsFrom(a: readonly string[], b: readonly string[]): number[] {
  const best = new Array<number>(a.length).fill(0);
  let below = new Array<number>(b.length + 1).fill(0);
  for (let i = a.length - 1; i >= 0; i--) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = b.length - 1; j >= 0; j--) {
      if (a[i] === b[j]) { row[j] = 1 + below[j + 1]; if (row[j] > best[i]) best[i] = row[j]; }
    }
    below = row;
  }
  return best;
}

/**
 * THE AUDIT BEHIND THE RULE: the longest run of words a served text shares with a reference, leaving out a run that
 * is in the case's own material from end to end. An expert quotes their sources, so a reference and its material
 * share words honestly; what must not appear in what a candidate is given is wording the reference has and the
 * material does not. A run that begins in the material's words and goes on into the reference's own is counted
 * whole. A reproduction run makes this check on every request it builds, and a run of LEAK_RUN words or more stops it.
 */
export const LEAK_RUN = 8;
export function leakedRun(served: string, reference: string, material: readonly string[] = []): number {
  const s = wordsOf(served);
  const inReference = runsFrom(s, wordsOf(reference));
  const inMaterial = material.map((m) => runsFrom(s, wordsOf(m)));
  let longest = 0;
  for (let i = 0; i < s.length; i++) {
    const own = Math.max(0, ...inMaterial.map((m) => m[i]));
    if (inReference[i] > own && inReference[i] > longest) longest = inReference[i];
  }
  return longest;
}

/** A run of this many words shared by a case's material and its reference: the material holds the finished work. */
export const HOLDS_THE_WORK = 50;

/**
 * WHETHER A CASE MAY BE RUN, decided before any call. Three ways it may not:
 *   it has no task;
 *   its task repeats the finished work's own wording (LEAK_RUN words in a row that its material does not hold);
 *   its material holds the finished work itself, or a long stretch of it. The audit above leaves the material's own
 *     wording alone, as it must; with the report filed in its own material folder that exemption covered everything,
 *     and a copy of the report came back as a reproduction. An expert quotes a source; a source does not hold
 *     HOLDS_THE_WORK words in a row of what was written from it.
 * Returns null when the case may be run, or the reason, in words a person can act on.
 */
export function whyNotRunnable(c: Pick<GoldenCase, 'task' | 'material' | 'reference'>): string | null {
  const served = servedFor(c);
  if (!served) return 'it carries no task';
  const texts = served.material.map((m) => m.text);
  const held = served.material.map((m) => ({ name: m.name, run: leakedRun(m.text, c.reference) })).sort((a, b) => b.run - a.run)[0];
  if (held && held.run >= HOLDS_THE_WORK) return `its material (${held.name}) holds ${held.run} words in a row of the finished work, so the skill would be handed the answer. Material is what the work was made from, never the work`;
  const leak = leakedRun(served.task, c.reference, texts);
  if (leak >= LEAK_RUN) return `its task repeats ${leak} words in a row of the finished work, so running it would give the skill part of the answer. Word the task as it was asked, before the work existed`;
  return null;
}

/**
 * THE LAST CHECK, AFTER A RUN: the longest run of words an output shares with the held-back reference that its
 * material does not hold. Nothing served should have carried them, so a long one means something did, by a path
 * the audit before the run does not read. The case is then not a reproduction, whatever else it met.
 */
export const repeatsReference = (output: string, c: Pick<GoldenCase, 'material' | 'reference'>): number => leakedRun(output, c.reference, c.material.map((m) => m.text));
/** An output may share this many words in a row with the reference by chance of subject; more is carried wording. */
export const CARRIED_RUN = 12;

/** How many cases of each class, in the order that matters to a person: what can be tested first. */
export function countClasses(cases: readonly { readonly caseClass?: CaseClass }[]): Record<CaseClass, number> {
  const n = (c: CaseClass): number => cases.filter((x) => (x.caseClass ?? 'REFERENCE_ONLY') === c).length;
  return { FULL_REPRO_CASE: n('FULL_REPRO_CASE'), TASK_AND_REFERENCE: n('TASK_AND_REFERENCE'), REFERENCE_ONLY: n('REFERENCE_ONLY') };
}

/** One line a person reads at intake: what they gave, and what it can be used for. */
export function describeCases(cases: readonly { readonly caseClass?: CaseClass }[]): string {
  const c = countClasses(cases); const total = cases.length;
  const parts = [
    c.FULL_REPRO_CASE ? `${c.FULL_REPRO_CASE} with the task and the material it was made from` : '',
    c.TASK_AND_REFERENCE ? `${c.TASK_AND_REFERENCE} with the task` : '',
    c.REFERENCE_ONLY ? `${c.REFERENCE_ONLY} finished work only` : '',
  ].filter(Boolean);
  const can = c.FULL_REPRO_CASE ? 'Reproduction can be tested on the first kind, on those held back.'
    : 'None carries both its task and its material, so reproduction cannot be tested yet: every example still teaches the standard.';
  return `${total} example${total === 1 ? '' : 's'}: ${parts.join(', ')}. ${can}`;
}

/**
 * WHICH FULL CASES ARE PUT FIRST IN LINE FOR THE RESERVE: half of them, rounded up, in the order `order` gives.
 * A full case is the only kind a reproduction can be tested on, so some are held back before anything else; the rest
 * stay with discovery, because a skill that answers learns how much to write from examples that carry their request,
 * and a reserve that took every one left it none. With a single full case and no other example that carries a
 * request, none is put first: the one pair teaches.
 */
export function preferredForReserve(units: readonly { readonly unitId: string; readonly caseClass?: CaseClass }[], order: (id: string) => string): Set<string> {
  const full = units.filter((u) => u.caseClass === 'FULL_REPRO_CASE').map((u) => u.unitId).sort((a, b) => order(a).localeCompare(order(b)));
  const withTask = units.filter((u) => u.caseClass === 'FULL_REPRO_CASE' || u.caseClass === 'TASK_AND_REFERENCE').length;
  if (full.length === 1 && withTask === 1) return new Set();
  return new Set(full.slice(0, Math.ceil(full.length / 2)));
}
