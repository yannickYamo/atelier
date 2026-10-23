// atelier/core/loop/work-field.ts — THE WORK IS WHAT IS INSIDE ITS FIELD; WHAT THE WRITER SAYS AROUND IT IS NOT.
//
// A writer asked for a piece sometimes opens with a few lines about the task ("Here is a post built on the brief's
// points…") before the piece. Those lines were delivered as its first paragraph, and every check read them as the
// work. No pattern can say which lines are about the task without reading their meaning, so the writer is asked to put
// the piece inside one delimited field, `<work>…</work>`, with anything else outside it, the way the self-review arm
// asks for its check and its answer apart. Only the field is delivered and checked.
//
// FORM ONLY. This reads two tags and nothing else: the text between the first `<work>` and the last `</work>`. Where the
// reply holds no such pair the whole reply is the work, as before, and the record says the field was missing.

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

/**
 * THE WORK FIELD OF A REPLY (a form parser: two tags, nothing read for meaning). The text between the first `<work>` and
 * the last `</work>` after it, trimmed; what stood before and after it is `outside`. A reply with no such pair, or with
 * an empty field, is the work whole, with any stray tag taken out, and `delimited` false.
 */
export function workField(reply: string): WorkField {
  const open = reply.indexOf(WORK_OPEN);
  const close = open === -1 ? -1 : reply.lastIndexOf(WORK_CLOSE);
  if (open !== -1 && close > open) {
    const inside = reply.slice(open + WORK_OPEN.length, close).trim();
    if (inside) {
      const outside = [reply.slice(0, open), reply.slice(close + WORK_CLOSE.length)].map((s) => s.trim()).filter(Boolean).join('\n\n');
      return { text: inside, delimited: true, outside };
    }
  }
  const stray = reply.includes(WORK_OPEN) || reply.includes(WORK_CLOSE);
  return { text: stray ? reply.split(WORK_OPEN).join('').split(WORK_CLOSE).join('').trim() : reply, delimited: false, outside: '' };
}

/** What the record keeps of a reply's field: whether there was one, and what stood outside it (cut to OUTSIDE_KEPT characters). */
export const workRecord = (f: WorkField): { readonly delimited: boolean; readonly outside?: string } =>
  (f.delimited ? { delimited: true, ...(f.outside ? { outside: f.outside.slice(0, OUTSIDE_KEPT) } : {}) } : { delimited: false });
