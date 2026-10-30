// atelier/core/composite/authors.ts — WHO WROTE WHICH PIECE, WHEN A FOLDER HOLDS SEVERAL AUTHORS.
//
// "Here are five examples from different authors. I love different things about them." Read as one author,
// such a folder gives the average of five writers, which is the one voice nobody asked for. So the authors are
// told apart before anything reads the pieces. Here, from three declarations:
//
//   front matter     `author: Ada` at the top of a piece
//   subfolders       ada/one.md, bea/two.md: a folder per author
//   --authors        a list of files, each by an author of its own
//
// Nothing here reads the prose. A declaration always wins; with none at all, `atelier new` groups the pieces by how
// they are written (./voices.ts), and a folder that does not split is one author, exactly as it always was.
//
// ONE EXCEPTION, BY COUNT: a declaration splits the pieces only where at least one declared author has enough to be
// counted on their own (the floor every author is counted from, ../observers/derive.ts). Six short pieces by six
// authors, split, gave six authors with nothing counted and a composite of nobody; such pieces are read as one voice,
// and the screen says so (`oneVoiceLine`). No flag is added: the count decides.

import { reachesCountingFloor } from '../observers/derive.js';

/** INFERRED: no author was declared, and the pieces were grouped by how they are written (./voices.ts). */
export type AuthorsHow = 'FRONT_MATTER' | 'SUBFOLDERS' | 'LISTED' | 'INFERRED';

export interface AuthorMap {
  /** the authors, in a fixed order (alphabetical), so every later screen and record lists them the same way */
  readonly names: readonly string[];
  /** piece id (its path in the folder) to author */
  readonly of: Readonly<Record<string, string>>;
  readonly how: AuthorsHow;
}

/** Pieces with no author of their own are grouped under this name, so none is dropped and none is guessed at. */
export const UNATTRIBUTED = 'unattributed';

/** `author:` in a piece's front matter, or null. The value is taken as written, trimmed of quotes. */
export function frontMatterAuthor(text: string): string | null {
  const fm = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!fm) return null;
  const line = fm[1].split(/\r?\n/).find((l) => /^author\s*:/i.test(l));
  if (!line) return null;
  const v = line.replace(/^author\s*:\s*/i, '').trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim();
  return v || null;
}

const stem = (id: string): string => id.split('/').pop()?.replace(/\.[^.]+$/, '') ?? id;

/**
 * The authors of `files`, or null when they are one. `listed` is `--authors`: the files named are each an author of
 * their own, named after the file; a file matched by its path, its name or its stem, without regard to case. A
 * declaration under which no author reaches the counting floor is one voice (null): see `oneVoiceLine`.
 */
export function detectAuthors(files: readonly { readonly id: string; readonly text: string }[], listed: readonly string[] | null = null): AuthorMap | null {
  const declared = declaredAuthors(files, listed);
  return declared?.names.some((name) => reachesCountingFloor(piecesBy(declared, files, name))) ? declared : null;
}

/** The texts of one author's pieces, as declared. */
const piecesBy = (m: AuthorMap, files: readonly { readonly id: string; readonly text: string }[], name: string): string[] =>
  files.filter((f) => m.of[f.id] === name).map((f) => withoutFrontMatter(f.text));

/**
 * THE ONE LINE SAID WHERE A DECLARATION OF SEVERAL AUTHORS IS READ AS ONE VOICE: every author is below the floor an
 * author is counted from, so the pieces are built as one voice, exactly as an unlabelled folder is. Null otherwise.
 */
export function oneVoiceLine(files: readonly { readonly id: string; readonly text: string }[], listed: readonly string[] | null = null): string | null {
  const declared = declaredAuthors(files, listed);
  if (!declared || detectAuthors(files, listed)) return null;
  return `${files.length} piece(s) by ${declared.names.length} authors (${howSaid(declared.how)}), none with enough to count alone: read as one voice.`;
}

/** The authors as declared, before the counting floor is read. */
function declaredAuthors(files: readonly { readonly id: string; readonly text: string }[], listed: readonly string[] | null = null): AuthorMap | null {
  const finish = (of: Record<string, string>, how: AuthorsHow): AuthorMap | null => {
    const names = [...new Set(Object.values(of))].sort((a, b) => a.localeCompare(b));
    return names.length >= 2 ? { names, of, how } : null;
  };
  if (listed?.length) {
    const of: Record<string, string> = {};
    const lower = (x: string): string => x.toLowerCase();
    for (const f of files) {
      const hit = listed.find((l) => [f.id, f.id.split('/').pop() ?? f.id, stem(f.id)].map(lower).includes(lower(l.replace(/^\.\//, ''))));
      of[f.id] = hit ? stem(hit) : UNATTRIBUTED;
    }
    return finish(of, 'LISTED');
  }
  const fromFront = files.map((f) => frontMatterAuthor(f.text));
  if (fromFront.some((a) => a !== null)) {
    return finish(Object.fromEntries(files.map((f, i) => [f.id, fromFront[i] ?? UNATTRIBUTED])), 'FRONT_MATTER');
  }
  const dir = (id: string): string | null => { const i = id.indexOf('/'); return i > 0 ? id.slice(0, i) : null; };
  if (files.length && files.every((f) => dir(f.id) !== null)) {
    return finish(Object.fromEntries(files.map((f) => [f.id, dir(f.id) ?? UNATTRIBUTED])), 'SUBFOLDERS');
  }
  return null;
}

/**
 * WHETHER ANYONE SAID WHO WROTE THE PIECES: front matter naming an author, a folder per author (even one), or
 * `--authors`. A declaration of one author is still a declaration: such a folder is never split by style (./voices.ts).
 */
export function authorsDeclared(files: readonly { readonly id: string; readonly text: string }[], listed: readonly string[] | null = null): boolean {
  if (listed?.length) return true;
  if (files.some((f) => frontMatterAuthor(f.text) !== null)) return true;
  return files.length > 0 && files.every((f) => f.id.indexOf('/') > 0);
}

/** How the authors were declared, as the screen says it. */
export const howSaid = (how: AuthorsHow): string => (how === 'FRONT_MATTER' ? 'author: in each piece' : how === 'SUBFOLDERS' ? 'a folder per author' : '--authors');

/** One line for the build screen. */
export const describeAuthors = (authors: AuthorMap, pieces: number): string =>
  `${pieces} piece(s) by ${authors.names.length} authors (${howSaid(authors.how)}): each is read on its own first. ${authors.names.join(', ')}.`;

/**
 * A PIECE AS IT IS SERVED: without its front matter. `author:`, `topic:` and the like are about the piece, not its
 * writing; served in a voice file they read as part of the author's prose, and a composite's names leak into drafts.
 */
export const withoutFrontMatter = (text: string): string => text.replace(/^\uFEFF?---\r?\n(?:[^\n]*\r?\n)*?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/, '').replace(/^\s*\n/, '');
