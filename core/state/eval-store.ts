// atelier/core/state/eval-store.ts — EVALUATIONS AND RATINGS, BESIDE THE RUN RECORDS, NEVER INSIDE THEM.
//
// An invocation record is a fact about what happened and is never revised (./store.ts, putInvocation). The
// evaluation of a run (../eval/summary.ts) is written once beside it, and a person's rating ("would you ship
// this as is?") is appended, never overwritten: a later rating of the same run is a new file, and the latest
// stands. Laid out under `skills/<name>/evals/` and `skills/<name>/ratings/`, written with writeAtomic.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from './fs-atomic.js';
import { readJson } from './read-json.js';
import type { StoreLayout } from './store.js';
import type { EvalSummary } from '../eval/summary.js';
import type { SkillCard } from '../eval/skill-card.js';

const base = (l: StoreLayout): string => {
  const name = l.skillName;
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) throw new Error(`STORE: "${name}" is not a skill name; it would resolve outside skills/.`);
  return join(l.root, 'skills', name);
};
const safeId = (id: string): string => {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`STORE: "${id}" is not an invocation id.`);
  return id;
};

/** Written once: a second evaluation of the same run is refused, as a second record of it would be. */
export function putEval(l: StoreLayout, e: EvalSummary): void {
  const p = join(base(l), 'evals', `${safeId(e.invocationId)}.json`);
  if (existsSync(p)) return;
  writeAtomic(p, JSON.stringify(e, null, 1));
}
export function getEval(l: StoreLayout, invocationId: string): EvalSummary | null {
  const p = join(base(l), 'evals', `${safeId(invocationId)}.json`);
  return existsSync(p) ? readJson<EvalSummary>(p, { what: 'a run evaluation', requireKeys: ['schema', 'result'] }) : null;
}
/** Newest first. */
export function listEvals(l: StoreLayout): EvalSummary[] {
  const d = join(base(l), 'evals');
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith('.json') && !f.startsWith('skill-')).map((f) => readJson<EvalSummary>(join(d, f), { what: 'a run evaluation' }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** A person's answer to "would you ship this as is?", with their reason. */
export interface Rating { readonly invocationId: string; readonly ship: boolean; readonly why: string | null; readonly at: string; readonly release: string | null }

export function putRating(l: StoreLayout, r: Rating): void {
  writeAtomic(join(base(l), 'ratings', `${safeId(r.invocationId)}-${r.at.replace(/[^0-9]/g, '')}.json`), JSON.stringify(r, null, 1));
}
/** The latest rating of each run. */
export function latestRatings(l: StoreLayout): Rating[] {
  const d = join(base(l), 'ratings');
  if (!existsSync(d)) return [];
  const by = new Map<string, Rating>();
  for (const f of readdirSync(d).filter((x) => x.endsWith('.json')).sort()) {
    const r = readJson<Rating>(join(d, f), { what: 'a rating' });
    const had = by.get(r.invocationId);
    if (!had || had.at <= r.at) by.set(r.invocationId, r);
  }
  return [...by.values()];
}

/** The skill's evaluation card for one skill version, written once at build (../eval/skill-card.ts). */
export function putSkillCard(l: StoreLayout, c: SkillCard): void {
  const p = join(base(l), 'evals', `skill-${safeId(c.skillVersion)}.json`);
  if (existsSync(p)) return;
  writeAtomic(p, JSON.stringify(c, null, 1));
}
/** The card of `skillVersion`, or null. */
export function getSkillCard(l: StoreLayout, skillVersion: string): SkillCard | null {
  const p = join(base(l), 'evals', `skill-${safeId(skillVersion)}.json`);
  return existsSync(p) ? readJson<SkillCard>(p, { what: 'a skill evaluation card', requireKeys: ['schema', 'rules'] }) : null;
}
