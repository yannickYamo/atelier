// atelier/core/loop/work-field.ts — THE WORK IS WHAT IS INSIDE ITS FIELD; WHAT THE WRITER SAYS AROUND IT IS NOT.
//
// A writer asked for a piece sometimes opens with a few lines about the task ("Here is a post built on the brief's
// points…") before the piece. Those lines were delivered as its first paragraph, and every check read them as the
// work. No pattern can say which lines are about the task without reading their meaning, so the writer is asked to put
// the piece inside one delimited field, `<work>…</work>`, with anything else outside it, the way the self-review arm
// asks for its check and its answer apart. Only the field is delivered and checked.
//
// FORM ONLY. This reads two tags and code fences, nothing else. Each field runs from a `<work>` to the first `</work>` after
// it; the work is the insides of every field, joined; what stood before, between and after them is `outside`. A tag
// inside a code fence is shown, not used: it opens no field. Where the reply holds no field the whole reply is the work,
// as before, and the record says the field was missing.

/** The tags the writer is asked to put the piece between. */
export const WORK_OPEN = '<work>';
export const WORK_CLOSE = '</work>';

/** What the writer is told, after what the request asks: where the piece goes and where anything else goes. */
export const WORK_FIELD_ASK = `Put the piece itself between ${WORK_OPEN} and ${WORK_CLOSE}. Anything you want to say about the task, or about how you went about it, goes outside them: only what is inside is delivered.`;

/** How much of what stood outside the field the record keeps. */
export const OUTSIDE_KEPT = 2000;

export interface WorkField {
  /** the text that is the work: inside the field, or the whole reply where there was none */
  readonly text: string;
  /** true when the reply held the field and only its inside is the work */
  readonly delimited: boolean;
  /** what stood outside the field, as written (empty where there was no field or nothing outside it) */
  readonly outside: string;
}

/** The character ranges of a reply that sit inside a code fence (``` or ~~~ lines, fence lines included). */
function fencedRanges(reply: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let at = 0; let open = -1;
  for (const line of reply.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (open === -1) open = at; else { out.push({ start: open, end: at + line.length }); open = -1; }
    }
    at += line.length + 1;
  }
  if (open !== -1) out.push({ start: open, end: reply.length });
  return out;
}

/**
 * THE WORK FIELD OF A REPLY (a form parser: two tags and code fences, nothing read for meaning). Each field opens at a
 * `<work>` outside a code fence and closes at the first `</work>` after it outside one; the work is every field's inside,
 * trimmed, joined by a blank line; what stood around and between the fields is `outside`. A reply with no closed field,
 * or whose fields are all empty, is the work whole, with any stray tag taken out, and `delimited` false.
 */
export function workField(reply: string): WorkField {
  const fenced = fencedRanges(reply);
  const free = (i: number): boolean => !fenced.some((r) => i >= r.start && i < r.end);
  const next = (tag: string, from: number): number => {
    for (let i = reply.indexOf(tag, from); i !== -1; i = reply.indexOf(tag, i + 1)) if (free(i)) return i;
    return -1;
  };
  const inside: string[] = []; const around: string[] = [];
  let from = 0;
  for (let open = next(WORK_OPEN, 0); open !== -1; open = next(WORK_OPEN, from)) {
    const close = next(WORK_CLOSE, open + WORK_OPEN.length);
    if (close === -1) break;
    around.push(reply.slice(from, open));
    inside.push(reply.slice(open + WORK_OPEN.length, close).trim());
    from = close + WORK_CLOSE.length;
  }
  const text = inside.filter(Boolean).join('\n\n');
  if (text) {
    around.push(reply.slice(from));
    return { text, delimited: true, outside: around.map((x) => x.trim()).filter(Boolean).join('\n\n') };
  }
  const stray = reply.includes(WORK_OPEN) || reply.includes(WORK_CLOSE);
  return { text: stray ? reply.split(WORK_OPEN).join('').split(WORK_CLOSE).join('').trim() : reply, delimited: false, outside: '' };
}

/** What the record keeps of a reply's field: whether there was one, and what stood outside it (cut to OUTSIDE_KEPT characters). */
export const workRecord = (f: WorkField): { readonly delimited: boolean; readonly outside?: string } =>
  (f.delimited ? { delimited: true, ...(f.outside ? { outside: f.outside.slice(0, OUTSIDE_KEPT) } : {}) } : { delimited: false });
