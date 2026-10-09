// tests/atelier-overlap-fast.test.ts — THE COPYING CHECK IS FAST WHATEVER THE MODEL WRITES, AND READS EVERY SCRIPT.
//
// The check exists for the output that copies a long stretch of the author's work, and that was the output it was
// slowest on: each shared run was extended a word at a time by searching every piece again. It also read only
// unaccented Latin letters, so a copy in another script read as no copy at all. What is held here: the same numbers
// as before on every English input (against the earlier reading, kept below as the reference), in time that grows
// with the length of the text, and the same reading in any script.
import { describe, it, expect } from 'vitest';
import { overlapIndex, standardWordingOf, type CorpusOverlap } from '../core/observers/overlap.js';

// THE EARLIER READING, word for word, as the reference: slow, and right on the inputs it could read.
const N = 6;
const oldWords = (t: string): string[] => t.toLowerCase().match(/[a-z0-9'’]+/g) ?? [];
const oldGrams = (w: readonly string[]): string[] => w.slice(0, Math.max(0, w.length - N + 1)).map((_, i) => w.slice(i, i + N).join(' '));
function reference(corpus: readonly string[], standardWording: readonly string[] = []): (text: string) => CorpusOverlap {
  const words = corpus.map(oldWords);
  const grams = new Set(words.flatMap(oldGrams));
  const joined = words.map((w) => ` ${w.join(' ')} `);
  const standard = new Set(standardWording);
  return (text) => {
    const w = oldWords(text);
    let shared6 = 0; let longestShared = 0; let left = 0;
    for (let i = 0; i + N <= w.length; i++) {
      const gram = w.slice(i, i + N).join(' ');
      if (!grams.has(gram)) continue;
      if (standard.has(gram)) left += 1; else shared6 += 1;
      let j = i + N;
      while (j < w.length && joined.some((c) => c.includes(` ${w.slice(i, j + 1).join(' ')} `))) j++;
      if (!standard.size) { longestShared = Math.max(longestShared, j - i); continue; }
      let stretch = 0; let reach = -1;
      for (let k = i; k < j; k++) {
        if (k + N <= j && !standard.has(w.slice(k, k + N).join(' '))) reach = k + N - 1;
        stretch = k <= reach ? stretch + 1 : 0;
        longestShared = Math.max(longestShared, stretch);
      }
    }
    return standard.size ? { shared6, longestShared, standard: left } : { shared6, longestShared };
  };
}

// A small generator with a fixed seed, so a failure can be run again.
function rng(seed: number): () => number { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }
const VOCAB = ['the', 'provider', 'will', 'use', 'reasonable', 'efforts', 'to', 'restore', "client's", 'service', 'within', '30', 'days', 'of', 'notice'];
const text = (r: () => number, n: number): string => Array.from({ length: n }, () => VOCAB[Math.floor(r() * VOCAB.length)]).join(' ');

describe('the same numbers as the earlier reading, on every input it could read', () => {
  it('400 generated cases: pieces that share clauses, texts that lift stretches of them, with and without standard wording', () => {
    const r = rng(20261008);
    for (let c = 0; c < 400; c++) {
      const clause = text(r, 7 + Math.floor(r() * 6));
      const pieces = Array.from({ length: 2 + Math.floor(r() * 4) }, () => `${text(r, 20 + Math.floor(r() * 40))}. ${r() < 0.7 ? clause : text(r, 8)}; ${text(r, 10 + Math.floor(r() * 30))}`);
      const from = pieces[Math.floor(r() * pieces.length)].split(' ');
      const at = Math.floor(r() * Math.max(1, from.length - 30));
      const lifted = `${text(r, Math.floor(r() * 12))} ${from.slice(at, at + 8 + Math.floor(r() * 30)).join(' ')}, ${text(r, Math.floor(r() * 12))} ${r() < 0.5 ? clause : ''} ${text(r, 5)}`;
      const standard = c % 2 ? standardWordingOf(pieces) : [];
      expect(overlapIndex(pieces, standard)(lifted), `case ${c}`).toEqual(reference(pieces, standard)(lifted));
    }
  });
});

describe('time grows with the length of the text, not with the length of what was copied', () => {
  const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${(i * 7919) % 5003}x${i % 97}`).join(' ');
  it('an exact copy of 4,000 words is read in well under a second', () => {
    const piece = words(4000); const read = overlapIndex([piece, words(1500).split(' ').reverse().join(' ')]);
    const t = Date.now(); const got = read(piece); const ms = Date.now() - t;
    expect(got).toEqual({ shared6: 3995, longestShared: 4000 });
    expect(ms).toBeLessThan(2000);
  });
  it('and so is one read against standard wording', () => {
    const piece = words(4000);
    const read = overlapIndex([piece], ['w0x0 w2916x1 w829x2 w3745x3 w1658x4 w4574x5']);
    const t = Date.now(); const got = read(piece); const ms = Date.now() - t;
    expect(got).toEqual({ shared6: 3994, longestShared: 3999, standard: 1 });
    expect(ms).toBeLessThan(2000);
  });
});

describe('wording that repeats itself does not stall the reading', () => {
  it('a table of four hundred rows that all say the same, read against itself', () => {
    const table = Array.from({ length: 400 }, () => '| n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |').join('\n');
    const read = overlapIndex([table]);
    const t = Date.now(); const got = read(table); const ms = Date.now() - t;
    expect(got.longestShared).toBe(6400);
    // Each place in the text meets every place the same six words stand in the piece: this grows with both, and is
    // held to seconds, not minutes.
    expect(ms).toBeLessThan(30_000);
  }, 60_000);
});

describe('a copy is a copy in any script', () => {
  const copies: Record<string, string> = {
    Cyrillic: 'Мы строим продукт который помогает командам писать лучше и быстрее каждый день без лишней суеты',
    Greek: 'Χτίζουμε ένα προϊόν που βοηθά τις ομάδες να γράφουν καλύτερα και πιο γρήγορα κάθε μέρα',
    Arabic: 'نحن نبني منتجا يساعد الفرق على الكتابة بشكل أفضل وأسرع كل يوم بدون ضجيج',
    Hebrew: 'אנחנו בונים מוצר שעוזר לצוותים לכתוב טוב יותר ומהר יותר בכל יום בלי רעש מיותר',
    'accented Latin': 'Nous construisons un produit qui aide les équipes à écrire mieux et plus vite chaque journée',
  };
  for (const [script, piece] of Object.entries(copies)) {
    it(`${script}: an exact copy shares every word`, () => {
      const n = piece.split(' ').length;
      expect(overlapIndex([piece])(piece)).toEqual({ shared6: n - 5, longestShared: n });
      expect(overlapIndex([piece])('Something else entirely, written by nobody in particular, about nothing.')).toEqual({ shared6: 0, longestShared: 0 });
    });
  }
  it('a script written without spaces is read in words, so a copied passage is caught', () => {
    const piece = '我们正在构建一个帮助团队更好更快地写作的产品每天都没有多余的喧嚣和噪音围绕着我们的工作';
    expect(overlapIndex([piece])(piece).longestShared).toBeGreaterThanOrEqual(12);
    expect(overlapIndex([piece])('今天天气很好我们去公园散步然后回家吃饭看书睡觉明天继续上班').longestShared).toBe(0);
  });
  it('the same letter written two ways is the same word', () => {
    const composed = 'les équipes préfèrent écrire à côté de la fenêtre le matin';
    expect(overlapIndex([composed])(composed.normalize('NFD'))).toEqual({ shared6: 6, longestShared: 11 });
  });
  it('an accented word is one word, not the pieces around its accent', () => {
    // "préfèrent" was read as "pr", "f", "rent": three words for one, so a run was counted longer than it is
    expect(overlapIndex(['ils préfèrent écrire à côté de la fenêtre'])('ils préfèrent écrire à côté de la fenêtre').longestShared).toBe(8);
  });
});

describe('wording is the author\'s standard when three separate pieces carry it, however each one ends', () => {
  it('the same clause closed by a full stop, an exclamation mark and a semicolon is three pieces', () => {
    const clause = 'the provider will use commercially reasonable efforts to restore the service';
    expect(standardWordingOf([`${clause}.`, `${clause}!`, `${clause};`])).toHaveLength(6);
    // one piece given three times is still one piece
    expect(standardWordingOf([`${clause}.`, `${clause}.`, ` ${clause}.\n`])).toEqual([]);
  });
});
