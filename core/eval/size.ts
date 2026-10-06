// atelier/core/eval/size.ts — HOW BIG A SKILL IS, THREE WAYS, AND WHERE THE WORDS ARE.
//
// "The skill is 13,000 words" was one number for three different things, and an outside comparison read the
// largest of them against hand-written skills of a few hundred words. They are kept apart here:
//
//   stored     every file of the compiled package: what is on disk, and what a host that opens files may read
//   exported   what `atelier export` writes and what `invoke` serves: SKILL.md with its example files inlined
//   per run    what one run actually sent (`RunSent`, recorded with the run): the served skill, the passages and
//              notes added for the request, and the request
//
// The export is then split by part, so a size has a cause: on the two skills this was first measured on, seven
// words in ten were whole pieces of the author's, set by one budget (core/compiler/voice.ts), and the rules and
// instructions were under a fifth. Counted in words and bytes, which need no model: a provider's token count is
// exact only when the provider reports it, and a run records that (core/inference/client.ts, `SpendLine`).

/** A part of an exported skill. Every word of the export belongs to exactly one. */
export type SizePart =
  | 'rules and instructions'   // SKILL.md outside the sections below: what to do, what to avoid, the checks
  | 'how I sound'              // the persona, the length line, and the guidance on taking the voice
  | 'moves'                    // "Moves I sometimes make"
  | 'reference index'          // the list in SKILL.md naming each example file and when it applies
  | 'your pieces'              // whole pieces, or passages, of the author's own (examples/voice-N.md)
  | 'exemplar'                 // the one piece the owner named (examples/exemplar.md)
  | 'rule examples'            // one file per rule or move shown by example
  | 'contrast examples'        // "write this, not that" pairs (examples/contrast.md)
  | 'framing';                 // the fence around the inlined files, and anything not counted above

export interface SizeLine { readonly part: SizePart; readonly words: number; readonly files: number }

export interface SkillSize {
  readonly stored: { readonly words: number; readonly bytes: number; readonly files: number };
  readonly exported: { readonly words: number; readonly bytes: number };
  /** the export by part, largest first, parts of no words left out; the words sum to `exported.words` */
  readonly parts: readonly SizeLine[];
}

/**
 * What one run sent the writer, in words: the served skill; what was added to it for this request (the author's
 * passages nearest the request and the release's experience notes; with drafts made to differ, the largest block any
 * one draft was given); and the request.
 */
export interface RunSent { readonly skill: number; readonly added: number; readonly request: number }

/** Words as `wc -w` counts them: runs of non-whitespace. The same count for every size Atelier states. */
export const countWords = (text: string): number => { const t = text.trim(); return t ? t.split(/\s+/).length : 0; };

const bytesOf = (text: string): number => new TextEncoder().encode(text).length;

/** The sections of SKILL.md that are parts of their own, by the heading the renderer writes (renderers/agent-skill/render.ts). */
const SECTION_PART: Readonly<Record<string, SizePart>> = {
  'How I sound': 'how I sound',
  'Moves I sometimes make': 'moves',
  'Reference material': 'reference index',
};

/** A section runs from its `## ` heading to the next one, or to the rule that closes the body of SKILL.md. */
function sectionsOf(skillMd: string): { part: SizePart; text: string }[] {
  const lines = skillMd.split('\n');
  const out: { part: SizePart; text: string }[] = [];
  let part: SizePart = 'rules and instructions'; let held: string[] = [];
  const flush = (): void => { if (held.length) out.push({ part, text: held.join('\n') }); held = []; };
  for (const line of lines) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) { flush(); part = SECTION_PART[heading[1]] ?? 'rules and instructions'; }
    else if (/^---\s*$/.test(line) && part !== 'rules and instructions') { flush(); part = 'rules and instructions'; }
    held.push(line);
  }
  flush();
  return out;
}

const filePart = (path: string): SizePart =>
  /^examples\/voice-\d+\.md$/.test(path) ? 'your pieces' : path === 'examples/exemplar.md' ? 'exemplar'
    : path === 'examples/contrast.md' ? 'contrast examples' : 'rule examples';

/**
 * The size of one compiled package: `files` as stored, `servedText` as exported, and `servedExamples` the example
 * files that export inlines. The parts are counted from the files themselves and `framing` takes the remainder, so
 * the lines always sum to the exported total whatever the fence around the examples says.
 */
export function skillSizeOf(files: Readonly<Record<string, string>>, servedText: string, servedExamples: readonly string[]): SkillSize {
  const all = Object.values(files);
  const by = new Map<SizePart, { words: number; files: number }>();
  const add = (part: SizePart, words: number, n: number): void => { const x = by.get(part) ?? { words: 0, files: 0 }; by.set(part, { words: x.words + words, files: x.files + n }); };
  for (const s of sectionsOf(files['SKILL.md'] ?? '')) add(s.part, countWords(s.text), 0);
  for (const f of servedExamples) add(filePart(f), countWords(files[f] ?? ''), 1);
  const exportedWords = countWords(servedText);
  const counted = [...by.values()].reduce((n, x) => n + x.words, 0);
  if (exportedWords > counted) add('framing', exportedWords - counted, 0);
  return {
    stored: { words: all.reduce((n, t) => n + countWords(t), 0), bytes: all.reduce((n, t) => n + bytesOf(t), 0), files: all.length },
    exported: { words: exportedWords, bytes: bytesOf(servedText) },
    parts: [...by].map(([part, x]) => ({ part, ...x })).filter((l) => l.words > 0).sort((a, b) => b.words - a.words || a.part.localeCompare(b.part)),
  };
}

const n = (x: number): string => x.toLocaleString('en-US');

/** The export's parts on one line: "your pieces 9,215 (3 files) · rule examples 1,871 (24 files) · …". */
export const describeParts = (size: SkillSize): string =>
  size.parts.map((l) => `${l.part} ${n(l.words)}${l.files ? ` (${l.files} file${l.files === 1 ? '' : 's'})` : ''}`).join(' · ');

/** Stored and exported, on one line. */
export const describeSize = (size: SkillSize): string =>
  `stored ${n(size.stored.words)} words in ${size.stored.files} file${size.stored.files === 1 ? '' : 's'} · exported ${n(size.exported.words)} words (${n(size.exported.bytes)} bytes)`;
