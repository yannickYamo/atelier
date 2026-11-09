// atelier/cli/how-held.ts — HOW EACH RULE BROKEN IN THE DRAFT CAME TO HOLD, said the same way on both paths.
import type { RepairRecord } from '../core/state/canonical-state.js';

/**
 * HOW EACH RULE BROKEN IN THE DRAFT CAME TO HOLD, named by the step the record kept for it: a fix without a model says
 * what it did ("m2: long paragraphs split"), never that spans were rewritten; a span rewrite says so; invented claims
 * were cut. A record without the controller's steps is said as before, from its passes.
 */
export function howHeld(r: Pick<RepairRecord, 'violatedBefore' | 'passes' | 'controller' | 'unmeasured'>): string {
  // a rule the delivered text is too short to read did not come to hold: it is said as not measured, apart
  const before = r.violatedBefore.filter((id) => !r.unmeasured?.includes(id));
  if (!before.length) return '';
  const cutWords = 'held once what could not be traced to your material was cut';
  if (!r.controller) return `${before.join(', ')} ${r.passes ? 'fixed by rewriting only the spans that broke them' : before.includes('UNSOURCED') ? cutWords : 'held once the draft was corrected'}`;
  const kept = r.controller.decisions.filter((d) => d.outcome === 'kept');
  // what a fix without a model did, by rule: its record lists each fix as "<id>: <what>"
  const noModel = new Map<string, string[]>();
  for (const d of kept.filter((x) => x.action === 'mechanical' || x.action === 'grammar')) {
    const list = d.action === 'mechanical' ? d.why.replace(/^fixed without a model: /, '') : d.observed.note ?? '';
    for (const f of list.split('; ')) { const m = /^([^:]+): (.+)$/.exec(f.trim()); if (m && before.includes(m[1])) noModel.set(m[1], [...(noModel.get(m[1]) ?? []), m[2]]); }
  }
  const rewritten = new Set(kept.filter((d) => d.action === 'rewrite').flatMap((d) => d.targets));
  const spans = before.filter((id) => !noModel.has(id) && rewritten.has(id));
  const cut = before.filter((id) => !noModel.has(id) && !rewritten.has(id) && id === 'UNSOURCED');
  const rest = before.filter((id) => !noModel.has(id) && !rewritten.has(id) && id !== 'UNSOURCED');
  return [...[...noModel].map(([id, what]) => `${id} fixed without a model: ${[...new Set(what)].join(', ')}`),
    ...(spans.length ? [`${spans.join(', ')} fixed by rewriting only the spans that broke them`] : []),
    ...(cut.length ? [`${cut.join(', ')} ${cutWords}`] : []),
    ...(rest.length ? [`${rest.join(', ')} held once the draft was corrected`] : [])].join('; ');
}
