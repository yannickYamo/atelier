// tests/atelier-voices-format.test.ts — FORMAT AND LENGTH ARE NOT AUTHORSHIP.
//
// One writer's unlabelled folder holds essays and lists, long pieces and short posts, posts and threads; it is one
// voice. Two writers who write in one format are still two, and two writers who each write in two formats are split by
// writer, never by format. The expected groupings are fixed by how the fixtures were written
// (tests/fixtures/composite/mixed-format.ts and five-voices.ts), not read off the code.
import { describe, it, expect } from 'vitest';
import { groupByStyle, authorship, styleDistances, splitDecision } from '../core/composite/voices.js';
import { FIVE_VOICES, FIVE_GROUPS } from './fixtures/composite/five-voices.js';
import { ONE_WRITER_MANY_TOPICS, TWO_NATURAL_WRITERS, TWO_NATURAL_GROUPS, MINORITY_WRITER, ONE_WRITER_TWO_SUBJECTS } from './fixtures/composite/natural-writers.js';
import { ESSAYS_AND_LISTS, ESSAYS_AND_POSTS, TWEETS_AND_ONE_LONG, POSTS_THREADS_LISTS, TWO_ESSAYISTS, TWO_ESSAYISTS_GROUPS, TWO_POSTERS }
  from './fixtures/composite/mixed-format.js';

const pieces = (o: Readonly<Record<string, string>>): { id: string; text: string }[] => Object.entries(o).map(([id, text]) => ({ id, text }));
const sortedGroups = (o: Readonly<Record<string, string>>): string[][] => groupByStyle(pieces(o)).groups.map((g) => [...g.pieces].sort());

describe('one writer in several formats is one voice', () => {
  it('seven essays and two list posts, unlabelled (the folder the efficiency journeys build from)', () => {
    const g = groupByStyle(pieces(ESSAYS_AND_LISTS));
    expect(g.groups).toHaveLength(1);
    expect(g.groups[0].pieces).toHaveLength(9);
    // the split the folder offers is essays against lists: a split of formats, recorded as such and not taken
    expect(g.tried.find((t) => t.k === 2)).toMatchObject({ alike: false, valid: false });
    expect(authorship(pieces(ESSAYS_AND_LISTS))).toMatchObject({ authors: null });
  });
  it('three long essays and five short posts', () => {
    expect(sortedGroups(ESSAYS_AND_POSTS)).toEqual([Object.keys(ESSAYS_AND_POSTS).sort()]);
  });
  it('eight tweets and one long piece', () => {
    expect(sortedGroups(TWEETS_AND_ONE_LONG)).toEqual([Object.keys(TWEETS_AND_ONE_LONG).sort()]);
  });
  it('posts, threads and lists', () => {
    expect(sortedGroups(POSTS_THREADS_LISTS)).toEqual([Object.keys(POSTS_THREADS_LISTS).sort()]);
  });
  it('one writer\'s words laid out as prose and as lists are one voice, however cleanly the layouts split', () => {
    const said = ['We keep the page short.', 'We check it every month.', 'Nobody owns it alone.', 'The page is where we start.', 'It changes when we learn.', 'We say why, every time.'];
    const prose = (n: number): string => Array.from({ length: 6 }, (_, k) => said.map((_s, i) => said[(i + k + n) % said.length]).join(' ')).join('\n\n');
    const asList = (n: number): string => `# Notes ${n}\n\n${Array.from({ length: 6 }, (_, k) => said.map((_s, i) => `- ${said[(i + k + n) % said.length]}`).join('\n')).join('\n')}`;
    const folder = Object.fromEntries([0, 1, 2, 3].flatMap((n) => [[`prose-${n}.md`, prose(n)], [`list-${n}.md`, asList(n)]]));
    expect(groupByStyle(pieces(folder)).groups).toHaveLength(1);
  });
});

describe('what two pieces are grouped by', () => {
  const said = ['We keep the page short, and we say why.', 'Nobody owns it alone; we check it every month.', 'It changes when we learn something, which is often.',
    'The page is where we start, not where we stop.', 'We would rather have one page people read than ten nobody opens.', 'That is most of it.'];
  const dense = Array.from({ length: 5 }, () => said.join(' ')).join('\n\n');
  const airy = Array.from({ length: 5 }, () => said.join('\n\n')).join('\n\n');
  const listed = `# Notes\n\n${Array.from({ length: 5 }, () => said.map((s) => `- **${s}**`).join('\n')).join('\n')}`;
  it('the same sentences in long paragraphs and in one-line paragraphs: their shape differs, their voice does not, so they sit together', () => {
    expect(styleDistances([dense, airy])[0][1]).toBeLessThan(0.02);
  });
  it('the same sentences as prose, as a bulleted list and as a numbered thread: bullets, bold and numbers are format, not words', () => {
    const thread = Array.from({ length: 5 }, (_, k) => said.map((s, i) => `${k * 6 + i + 1}/ ${s}`).join('\n\n')).join('\n\n');
    const d = styleDistances([dense, listed, thread]);
    expect(d[0][1]).toBeLessThan(0.02);
    expect(d[0][2]).toBeLessThan(0.02);
  });
});

describe('writers are still told apart by how they write', () => {
  it('five writers, two pieces each: the same five voices', () => {
    expect(sortedGroups(FIVE_VOICES)).toEqual(FIVE_GROUPS.map((x) => [...x].sort()));
  });
  it('two writers of essays of one length, on the same four topics: two voices, by writer', () => {
    const g = groupByStyle(pieces(TWO_ESSAYISTS));
    expect(g.groups.map((x) => [...x.pieces].sort())).toEqual(TWO_ESSAYISTS_GROUPS.map((x) => [...x].sort()));
    expect(g.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it('two writers who each write essays and short posts: split by writer, not by format', () => {
    const pick = (o: Readonly<Record<string, string>>, ks: readonly string[]): Record<string, string> => Object.fromEntries(ks.map((k) => [k, o[k]]));
    const folder = { ...pick(TWO_ESSAYISTS, ['pell-1.md', 'pell-2.md', 'quist-1.md', 'quist-2.md']),
      ...pick(TWO_POSTERS, ['pell-post-1.md', 'pell-post-2.md', 'quist-post-1.md', 'quist-post-2.md']) };
    expect(sortedGroups(folder)).toEqual([['pell-1.md', 'pell-2.md', 'pell-post-1.md', 'pell-post-2.md'], ['quist-1.md', 'quist-2.md', 'quist-post-1.md', 'quist-post-2.md']]);
  });
});

describe('the split is read against the folder itself, on writers with natural variation', () => {
  it('one writer across twelve topics and three lengths is one voice', () => {
    expect(groupByStyle(pieces(ONE_WRITER_MANY_TOPICS)).groups).toHaveLength(1);
  });
  it('two writers on the same topics split by writer, with every piece placed', () => {
    const g = groupByStyle(pieces(TWO_NATURAL_WRITERS));
    expect(g.groups.map((x) => [...x.pieces].sort())).toEqual(TWO_NATURAL_GROUPS.map((x) => [...x].sort()));
    expect(g.confidence).toBe(1);
  });
  it('a writer with three pieces among nine of another is still found', () => {
    const g = groupByStyle(pieces(MINORITY_WRITER));
    expect(g.groups.map((x) => [...x.pieces].sort())).toEqual([Object.keys(MINORITY_WRITER).filter((k) => k.startsWith('mara')).sort(), Object.keys(MINORITY_WRITER).filter((k) => k.startsWith('theo')).sort()]);
  });
  it('the same folder groups the same way in any order', () => {
    expect(groupByStyle(pieces(TWO_NATURAL_WRITERS).reverse())).toEqual(groupByStyle(pieces(TWO_NATURAL_WRITERS)));
  });
});

describe('the decision, guard by guard (hand-set values)', () => {
  // thirty reference folders: fifteen at 0.04 and fifteen at 0.06, so their mean is 0.05 and their spread 0.01
  const nulls = [...Array(15).fill(0.04), ...Array(15).fill(0.06)] as number[];
  const strong = { silhouette: 0.2, gap: 0.3, alike: true, thinnest: 1000 };
  it('a cut far above every reference, wide apart and with enough text in each voice is a split, sure as the references allow', () => {
    expect(splitDecision(strong, nulls)).toEqual({ split: true, confidence: 1 });
  });
  it('voices closer than the gap floor are one writer, however clean the cut', () => {
    expect(splitDecision({ ...strong, gap: 0.2 }, nulls).split).toBe(false);
  });
  it('a cut fewer than four spreads above the references is one writer', () => {
    // (0.085 - 0.05) / 0.01 = 3.5
    expect(splitDecision({ ...strong, silhouette: 0.085 }, nulls).split).toBe(false);
  });
  it('a cut some reference matches is one writer, even far above their mean', () => {
    // 29 references at 0.04 and 0.06, one at 0.21: the mean is 0.0553, the spread 0.0285, so the cut sits 5.1 above
    const withOne = [...Array(15).fill(0.04), ...Array(14).fill(0.06), 0.21] as number[];
    expect(splitDecision(strong, withOne).split).toBe(false);
  });
  it('voices that can only be told apart by their format are one writer', () => {
    expect(splitDecision({ ...strong, alike: false }, nulls).split).toBe(false);
  });
  it('a voice too thin to read is one voice, said with no confidence either way', () => {
    expect(splitDecision({ ...strong, thinnest: 300 }, nulls)).toEqual({ split: false, confidence: 0.5 });
  });
  it('a folder that came close to splitting is not reported as surely one voice', () => {
    expect(splitDecision({ ...strong, gap: 0.2 }, nulls).confidence).toBeCloseTo(0.2, 6);
  });
  it('one writer on two subjects with their own vocabulary is one voice', () => {
    expect(groupByStyle(pieces(ONE_WRITER_TWO_SUBJECTS)).groups).toHaveLength(1);
  });
});
