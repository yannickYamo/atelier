// tests/fixtures/author-rates-corpus.ts — AN INVENTED CORPUS SHAPED LIKE ONE AUTHOR'S: ONE LONG PIECE AND FOUR SHORT ONES.
//
// Every piece is built from the same cycle of sentence lengths, so its counts can be worked out by hand: one sentence in
// eight is four words long, the median sentence is 15 words, and sentence 9 of every 16 opens on "I".

export const WORDS = ['tide', 'lamp', 'stone', 'rope', 'field', 'gate', 'oar', 'wheel', 'salt', 'clay'];
/** Sentence lengths, cycling: one in eight is four words long; the median is 15. */
const CYCLE = [15, 15, 15, 15, 4, 16, 20, 12];
/** A piece of n sentences in paragraphs of four; sentence 9 of every 16 (j % 16 === 8) opens on "I". */
export function piece(n: number): string {
  const ss = Array.from({ length: n }, (_, j) => {
    const ws = Array.from({ length: CYCLE[j % 8] }, (_, k) => WORDS[(j + k) % WORDS.length]);
    if (j % 16 === 8) ws[0] = 'I';
    return `${ws.join(' ').replace(/^./, (c) => c.toUpperCase())}.`;
  });
  const ps: string[] = []; for (let j = 0; j < ss.length; j += 4) ps.push(ss.slice(j, j + 4).join(' '));
  return ps.join('\n\n');
}
