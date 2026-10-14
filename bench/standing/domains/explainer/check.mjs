// The S2-mini standard, as code. Written before any arm output existed. Imports nothing from Atelier.
export const ANALOGY = /\b(think of|imagine|it works like|picture)\b/gi;
export function check(text) {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  const sentences = t.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const paras = t.split(/\n\s*\n/).filter((p) => p.trim());
  const fails = [];
  if (words < 150 || words > 230) fails.push('R1 length');
  if ((t.match(ANALOGY) ?? []).length !== 1) fails.push('R2 one analogy');
  if (/^\s*(#{1,6}\s|[-*]\s|\d+[.)]\s)/m.test(t) || /\*\*/.test(t)) fails.push('R3 plain paragraphs');
  if (!/^In short,/.test(paras[paras.length - 1] ?? '')) fails.push('R4 closing line');
  if (sentences.some((s) => s.split(/\s+/).length > 25)) fails.push('R5 sentence length');
  if ((t.match(/\byou(r|rs)?\b/gi) ?? []).length < 2) fails.push('R6 addresses the reader');
  return { words, fails };
}
