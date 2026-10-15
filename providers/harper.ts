// providers/harper.ts — THE GRAMMAR ENGINE: harper.js, OFFLINE, LOADED ONCE.
//
// Harper is a WebAssembly grammar checker that runs in the process and sends nothing anywhere. This is the one
// place Atelier names it: core defines what a lint is (core/observers/grammar.ts, `GrammarEngine`) and the
// dispatcher wires this loader in. The curated dictionary is the expensive part (about three seconds); a second
// dialect on the same binary costs almost nothing, so both are built once and kept for the life of the process.
//
// Spans come back in UTF-16 code units, as the JavaScript glue counts them, so they index the text directly.

import type { GrammarEngine, GrammarLint, GrammarDialect, GrammarProvider } from '../core/observers/grammar.js';

/** The synchronous linter behind harper.js's promise-returning `LocalLinter`, once its binary is loaded. */
interface InnerLinter {
  organized_lints(text: string, language: number, allHeadings: boolean, regexMask: string | null | undefined, dedup: boolean, isolateEnglish: boolean): readonly {
    readonly group: string;
    readonly lints: readonly { span(): { readonly start: number; readonly end: number }; lint_kind(): string; message(): string;
      suggestions(): readonly { kind(): number; get_replacement_text(): string }[] }[];
    free(): void;
  }[];
}

/** harper.js's `Language.Markdown`: code, links and headings are read as markup, not prose. */
const MARKDOWN = 1;
/** harper.js's `SuggestionKind`: 0 replaces the span, 1 removes it, 2 inserts after it. */
const REPLACE = 0; const REMOVE = 1;

async function load(): Promise<GrammarEngine> {
  const [{ LocalLinter, Dialect }, { binary }] = await Promise.all([import('harper.js'), import('harper.js/binary')]);
  const inner = async (dialect: GrammarDialect): Promise<InnerLinter> => {
    const linter = new LocalLinter({ binary, dialect: dialect === 'british' ? Dialect.British : Dialect.American });
    await linter.setup();
    // `inner` is private to harper.js's typing and a lazy promise in its code: awaited once here, it is the
    // synchronous linter every observer call needs (an observer returns a fact, not a promise).
    return await (linter as unknown as { inner: Promise<InnerLinter> }).inner;
  };
  const linters: Record<GrammarDialect, InnerLinter> = { american: await inner('american'), british: await inner('british') };
  return {
    lint(text, dialect) {
      const out: GrammarLint[] = [];
      for (const group of linters[dialect].organized_lints(text, MARKDOWN, false, undefined, true, false)) {
        for (const l of group.lints) {
          const s = l.span(); const first = l.suggestions()[0];
          const replacement = first === undefined ? null : first.kind() === REMOVE ? '' : first.kind() === REPLACE ? first.get_replacement_text() : null;
          out.push({ rule: group.group, kind: l.lint_kind(), message: l.message(), start: s.start, end: s.end, replacement });
        }
        group.free();
      }
      return out;
    },
  };
}

/** The provider the dispatcher wires in: loads on the first standard that carries the rule, never before. */
export const harperGrammar: GrammarProvider = { load };
