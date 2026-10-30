// atelier/core/loop/task-needs.ts — WHAT THIS REQUEST NEEDS, READ BEFORE THE FIRST DRAFT.
//
// On twenty-four fresh requests every answer judged unusable was already so in its first draft: no step of the loop
// touched one of them. "Make the API faster" came back as a question, with nothing said of what would be measured;
// "change the timeout in config/app.yaml" came back asking for the file. What a reply needs was left to the writer.
//
// THE CONTRACT. Read in the call that already reads the request's form (./context-judge.ts, `requestIntent`): no call
// is added. Four things, each tied to the request's own words and validated in code, never a guess at what would be
// nice to have:
//   - deliver: what the reply must give (a question it asks, a deliverable it names), copied from the request;
//   - unknowns: facts the answer turns on that the request does not give (which environment, what is slow), each tied
//     to the words it concerns, and whether a sensible assumption settles it or only a check, a measurement or the
//     person can (the clarify-or-infer split);
//   - act on: something named the assistant could open, change or run itself;
//   - cannot be undone: an action in the request that is irreversible;
//   - subject (not a need: the role of the material): the request's words naming a supplied text the work comments on and
//     leaves standing (a review, a critique, a check, an answer about it), where quoting it is part of the work. Such a
//     text is not notes to write from (./material-points.ts): its title, sections and paths are quoted, and that is no
//     copied stretch. A rewrite or a new piece made from a text names no subject: there, copying it is the defect.
// What it does NOT hold: examples, alternatives, background. Whether an answer is better with one is the expert's
// standard, not the request's need; it is never added here.
//
// SERVED AFTER THE SKILL, UNCACHED (../fidelity/request-notes.ts): the skill's bytes do not change with the request.
// The method still decides how each need is met.

/** One fact the answer turns on that the request does not give. */
export interface Unknown { readonly what: string; readonly about: string; readonly settles: 'reasoning' | 'reality' }
export interface TaskNeeds {
  readonly deliver: readonly string[];
  readonly unknowns: readonly Unknown[];
  readonly actOn: string | null;
  readonly irreversible: string | null;
  /** The request's words naming the supplied text the work is about, or null when what is supplied is notes to write from. */
  readonly subject: string | null;
}

export const NEEDS_INSTRUCTIONS = `Then say what the request NEEDS to be answered well. Copy the request's own words where asked; never add what would merely be helpful (an example, an alternative, background): those are not needs.

- deliver: each thing the reply must give, copied from the request: a question it asks, a deliverable it names. A topic merely mentioned is not one. At most 4; none for a remark or a thank-you.
- unknowns: facts the answer turns on decisively that the request does not give and the assistant cannot work out itself (for example which environment, what exactly is slow and by how much, what counts as "old", the error text). For each: what (a few words), about (the request's words it concerns, copied exactly), settles: "reasoning" when a sensible stated assumption settles it, "reality" when only a measurement, a look at the system or the person can. Most requests have none: list one only if a different value would change what the reply should say. At most 3.
- act_on: if the request names something the assistant could open, change or run itself (a file, a repository, a config, a test suite), copy those words; otherwise null.
- irreversible: if the request asks for an action that cannot be undone (deleting data or files, dropping a table, force-pushing, publishing a secret, changing production), copy those words; otherwise null.
- subject: if the request asks for work that comments on a text it supplies and leaves that text standing (a review, a critique, a check of it, a verdict on it), copy the request's words that name that text (for example "this design proposal", "the attached contract", "it"); where the files supplied with the request are listed under <supplied>, give the name of the supplied file it is instead, exactly as listed (with several files supplied, only the name says which); otherwise null. Null when the work replaces the text or makes a new piece from it: a rewrite, a redraft, an edit into a new version, a summary, a reply or a response to it, a post or an article written from notes, facts or a draft.`;

export const NEEDS_SCHEMA = {
  deliver: { type: 'array', items: { type: 'string' } },
  unknowns: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, about: { type: 'string' }, settles: { type: 'string', enum: ['reasoning', 'reality'] } },
    required: ['what', 'about', 'settles'], additionalProperties: false } },
  act_on: { type: ['string', 'null'] },
  irreversible: { type: ['string', 'null'] },
  subject: { type: ['string', 'null'] },
} as const;

const squash = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
/** The words without a quote on either end: a reading that quotes, or half-quotes, what it copied. */
const unquoted = (w: string): string => w.replace(/^["'“‘]+|["'”’]+$/g, '').trim();
/** Whether the request holds these words whole: at word boundaries, never inside other words ("is essay" in "this essay"). */
const holdsWords = (task: string, w: string): boolean => {
  const t = squash(task); const q = squash(w);
  if (!q) return false;
  const letter = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + 1)) {
    if (!letter(t[i - 1]) && !letter(t[i + q.length])) return true;
  }
  return false;
};
/** Words copied from the request, or null: a reading is held to what the request says. */
const quoted = (task: string, x: unknown): string | null => {
  if (typeof x !== 'string') return null;
  const w = unquoted(x.trim());
  // two words at least, or one name of a thing (a path, a file, an identifier): "the" or "fix" is no need
  const words = w.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const named = /^[\w-]+(?:[./_:][\w-]+)+$/.test(w);
  return (words.length >= 2 || named) && holdsWords(task, w) ? w : null;
};
/**
 * THE SUBJECT, TIED TO WHAT WAS GIVEN: the name of a file supplied with the request (as it was named: "draft"), or, where
 * exactly one file was supplied so the words can mean only that, the request's own words naming it ("this design
 * proposal", or just "it"). With several files supplied, only a name says which one the work is about: the request's
 * words name none of them. A name nothing supplied carries, or the whole request, is no subject. A caller that lists no
 * files leaves the words to the request alone, as before.
 */
const subjectOf = (task: string, x: unknown, supplied: readonly string[]): string | null => {
  if (typeof x !== 'string') return null;
  const w = unquoted(x.trim());
  if (!w || squash(w) === squash(task)) return null;
  const name = supplied.find((n) => squash(n) === squash(w));
  if (name !== undefined) return name;
  if (supplied.length > 1) return null;
  return quoted(task, w) ?? (supplied.length === 1 && holdsWords(task, w) ? w : null);
};

/**
 * The needs a reading names, kept only where code can tie them to the request; null when the reading said nothing usable.
 * `supplied` names the files bound for this run, the only files a subject may be.
 */
export function needsOf(task: string, raw: unknown, supplied: readonly string[] = []): TaskNeeds | null {
  const r = raw as { deliver?: unknown; unknowns?: unknown; act_on?: unknown; irreversible?: unknown; subject?: unknown } | null;
  if (!r || !['deliver', 'unknowns', 'act_on', 'irreversible', 'subject'].some((k) => k in r)) return null;
  const deliver: string[] = [];
  for (const d of Array.isArray(r.deliver) ? r.deliver : []) {
    const q = quoted(task, d);
    if (q && !deliver.some((x) => squash(x) === squash(q))) deliver.push(q);
    if (deliver.length === 4) break;
  }
  const unknowns: Unknown[] = [];
  for (const u of Array.isArray(r.unknowns) ? r.unknowns as { what?: unknown; about?: unknown; settles?: unknown }[] : []) {
    const about = quoted(task, u?.about);
    const what = typeof u?.what === 'string' ? u.what.trim().slice(0, 120) : '';
    if (!about || what.length < 3 || (u.settles !== 'reasoning' && u.settles !== 'reality')) continue;
    unknowns.push({ what, about, settles: u.settles });
    if (unknowns.length === 3) break;
  }
  return { deliver, unknowns, actOn: quoted(task, r.act_on), irreversible: quoted(task, r.irreversible), subject: subjectOf(task, r.subject, supplied) };
}

/** Nothing the request needs beyond answering it as asked. */
export const needsNothing = (n: TaskNeeds | null | undefined): boolean => !n || (!n.deliver.length && !n.unknowns.length && !n.actOn && !n.irreversible);

/**
 * THE NEEDS, SAID TO THE WRITER (after the skill, for this request only). Each line follows from a need code kept; the
 * last says the smallest answer that meets them is the one wanted. Empty when the request needs nothing named.
 */
export function needsNote(n: TaskNeeds | null | undefined): string {
  if (!n || needsNothing(n)) return '';
  const q = (s: string): string => `"${s}"`;
  const lines: string[] = [];
  if (n.deliver.length) lines.push(`- It asks for: ${n.deliver.map(q).join('; ')}. Give each one.`);
  const reality = n.unknowns.filter((u) => u.settles === 'reality');
  const reasoning = n.unknowns.filter((u) => u.settles === 'reasoning');
  // Only the request's own words reach the writer: what a reader thought was unknown is kept in the record, not served.
  if (reasoning.length) lines.push(`- Something the answer depends on is not stated (${reasoning.map((u) => q(u.about)).join('; ')}), and a sensible assumption settles it: unless your method says to ask, assume it, say the assumption, and answer.`);
  if (reality.length) lines.push(`- The answer turns on something the request does not say (${reality.map((u) => q(u.about)).join('; ')}) that only a check, a measurement or the person can settle: unless your method says to ask first, give what can be given now and name the check that would settle it.`);
  if (n.actOn) lines.push(`- It names something that could be acted on directly (${q(n.actOn)}): unless your method says to ask first, act on it or give the exact change, rather than asking for what could be found or checked.`);
  if (n.irreversible) lines.push(`- It asks for something that cannot be undone (${q(n.irreversible)}): follow your method on confirming first.`);
  return `What this request needs (read from the request; your method decides how each is met, and comes first):\n\n${lines.join('\n')}\n\nAnswer the rest of the request as it asks. Nothing else is required: give what it needs, at the length it asks for, and no more. An example, an alternative or background belongs only where the answer is not usable without it.`;
}
