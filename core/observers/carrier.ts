// atelier/core/observers/carrier.ts — WHICH SENTENCES CARRY A RATE.
//
// A rate has no single place it lives: parentheses per 1,000 words are everywhere and nowhere. But some sentences
// carry more of it than others, and the one whose removal moves the measure most is where a rewrite should start.
// This is the one reading of that, shared by the FEATURE observer (./features.ts), which points its spans at the
// carriers, and the structural actuators (../fidelity/structural.ts), which rewrite the first of them. The caller
// supplies the sentences, split the way it splits them, so the two never disagree about where a sentence is.

export interface Carrier {
  readonly s: string;
  readonly at: number;
  /** how far the measure moves toward the band when this sentence alone is removed; always positive */
  readonly moves: number;
}

/**
 * The sentences whose removal moves `measure` most in `toward`'s direction, strongest first, at most `max`. A
 * sentence under four words is never a carrier (its removal says nothing about the rate). Ties keep text order.
 */
export function carriersOf(text: string, measure: (t: string) => number | null, sentences: readonly { readonly s: string; readonly at: number }[],
  toward: 'lower' | 'higher', max: number): Carrier[] {
  const base = measure(text);
  if (base === null || max <= 0) return [];
  const out: Carrier[] = [];
  for (const x of sentences) {
    if (x.s.split(/\s+/).length < 4) continue;
    const v = measure(text.slice(0, x.at) + text.slice(x.at + x.s.length));
    if (v === null) continue;
    const moves = toward === 'lower' ? base - v : v - base;
    if (moves > 0) out.push({ s: x.s, at: x.at, moves });
  }
  return out.sort((a, b) => b.moves - a.moves).slice(0, max);
}
