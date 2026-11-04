// atelier/core/direct/pieces.ts — THE AUTHOR'S PIECES THE DIRECT WRITER CHOOSES FROM, AND HOW MANY FIT.
//
// The writer that beat every compiled path in blind tests was the plainest one: the author's pieces of the kind asked
// for, pasted whole, with the material and the task, then one self-review against the same pieces. So the direct
// writer (cli/direct.ts) serves pieces, not rules. This module lists the pieces a skill holds (every piece it was built
// from, and every piece the person kept from a run, `atelier keep`), and fits a chosen order of them into a budget.
//
// Which pieces suit a request is a reading (./route.ts). Its floor, when no model can read, is here: the pieces whose
// words the request shares most, weighed by how rare each word is across the pieces. A floor, said as one, never the
// decision where a reading could be made.

/** One piece the writer may be shown. */
export interface Piece {
  /** `p1`, `p2`, … in catalogue order: what a reading answers with */
  readonly id: string;
  readonly text: string;
  /** the request the piece answered, where its file or its run carried one */
  readonly request: string | null;
  /** kept by the person from a run (`atelier keep`): writing they approved, newest first in the catalogue */
  readonly kept: boolean;
}

/** The characters of whole pieces one request is shown by default: about 20,000 tokens, the scale the winning baseline used. */
export const PIECE_BUDGET_CHARS = 80_000;

/** The pieces in one list: the person's kept pieces first (newest first), then the pieces the skill was built from. */
export function catalogueOf(built: readonly { readonly text: string; readonly request: string | null }[], kept: readonly { readonly text: string; readonly request: string | null }[] = []): Piece[] {
  const seen = new Set<string>();
  const out: Piece[] = [];
  for (const [list, isKept] of [[kept, true], [built, false]] as const) {
    for (const p of list) {
      const key = p.text.replace(/\s+/g, ' ').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `p${out.length + 1}`, text: p.text.trim(), request: p.request?.trim() ? p.request.trim() : null, kept: isKept });
    }
  }
  return out;
}

/** The first line of a piece, without its heading marks: what a catalogue entry is named by. */
export const titleOf = (text: string): string => (text.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').trim() ?? '').slice(0, 160);

/**
 * The pieces in `order`, as many as fit `budget` characters; the first always, whole, whatever its length (a piece is
 * never cut: a cut piece teaches a cut ending). Ids not in the catalogue are skipped, and none is taken twice.
 */
export function withinBudget(pieces: readonly Piece[], order: readonly string[], budget = PIECE_BUDGET_CHARS): Piece[] {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const out: Piece[] = [];
  let used = 0;
  for (const id of order) {
    const p = byId.get(id);
    if (!p || out.includes(p)) continue;
    if (out.length && used + p.text.length > budget) continue;
    out.push(p);
    used += p.text.length;
  }
  return out;
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const wordsOf = (s: string): string[] => (s.toLowerCase().match(WORD) ?? []).filter((w) => w.length > 2);

/**
 * THE FLOOR: the pieces ranked by the words they share with the request, each word weighed by how few pieces hold it
 * (a word every piece holds says nothing about which one is near). Kept pieces and the order of the catalogue break ties.
 */
export function lexicalOrder(pieces: readonly Piece[], request: string): string[] {
  const asked = new Set(wordsOf(request));
  const sets = pieces.map((p) => new Set(wordsOf(`${p.request ?? ''} ${p.text}`)));
  const df = new Map<string, number>();
  for (const s of sets) for (const w of s) if (asked.has(w)) df.set(w, (df.get(w) ?? 0) + 1);
  const n = pieces.length;
  const score = (i: number): number => {
    let x = 0;
    for (const w of asked) if (sets[i].has(w)) x += Math.log(1 + n / (df.get(w) ?? 1));
    return x;
  };
  return pieces.map((p, i) => ({ id: p.id, s: score(i), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.id);
}
