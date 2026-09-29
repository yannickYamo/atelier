// atelier/core/observers/doc-class.ts — A STANDARD MEASURES ONE KIND OF DOCUMENT.
//
// Every measured threshold was read off the owner's pieces, and those pieces were all one kind of
// thing. A median sentence length taken from essays, held against a two-line support reply, fails the
// reply for being a reply. So a skill may declare the class of document its rules describe, and any
// check may declare the class of the text in front of it. When both are declared and differ, the check
// refuses: its numbers would describe the wrong kind of writing. When either is missing, it runs and
// says what it assumed, because refusing on silence would make the declaration a toll on every call.

/** The short names people type for a known format, and the class each one means. */
export const CLASS_ALIASES: Readonly<Record<string, string>> = {
  whitepaper: 'white-paper', blog: 'blog-post', linkedin: 'linkedin-post', x: 'x-post', tweet: 'x-post', onepager: 'one-pager',
};

export const normalizeClass = (s: string): string => {
  const c = s.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return CLASS_ALIASES[c] ?? c;
};

export type ClassCheck =
  | { readonly ok: true; readonly note: string | null }
  | { readonly ok: false; readonly why: string };

export function checkClass(skillClass: string | null, declared: string | null | undefined): ClassCheck {
  const want = skillClass ? normalizeClass(skillClass) : null;
  const got = declared ? normalizeClass(declared) : null;
  if (want && got && want !== got) {
    return { ok: false, why: `this standard measures ${want}, and the text is declared ${got}. Its thresholds were read off ${want} and would describe the wrong kind of writing. Use a standard built from ${got}, or drop --class if the text really is ${want}.` };
  }
  if (want && !got) return { ok: true, note: `checked as ${want}, the class this standard measures; declare --class if the text is something else` };
  if (!want && got) return { ok: true, note: `this standard declares no document class, so ${got} could not be matched; set one with: atelier build --class <kind>` };
  return { ok: true, note: null };
}
