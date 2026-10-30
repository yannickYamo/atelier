// atelier/core/fidelity/request-notes.ts — THE SKILL, AND THIS REQUEST'S NOTES AFTER IT.

/**
 * WHERE THE SKILL ENDS AND THIS REQUEST'S NOTES BEGIN, in a served text. The skill above it is the same bytes on every
 * request, so a provider can cache it once (core/inference/client.ts, `stableBlock`); what is particular to one request
 * (rules set aside for it, its stated length, passages chosen for it) comes after this line and is sent uncached, after
 * the request (../loop/run-once.ts, `spendOneWithResult`; ./sections.ts, `planSections`). Before, those rules were cut out of the skill itself, and
 * every distinct cut paid a fresh cache write: three variants in a fourteen-request run.
 */
export const FOR_THIS_REQUEST = '\n\n## For this request only\n\n';

/** A served text split at `FOR_THIS_REQUEST`: the skill, and this request's notes (empty when there are none). */
export function splitServed(served: string): { readonly skill: string; readonly forRequest: string } {
  const at = served.lastIndexOf(FOR_THIS_REQUEST);
  return at < 0 ? { skill: served, forRequest: '' } : { skill: served.slice(0, at), forRequest: served.slice(at + FOR_THIS_REQUEST.length).trim() };
}
