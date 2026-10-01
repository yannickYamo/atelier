// atelier/core/loop/answer-claims.ts — WHAT AN ANSWER MAY NOT MAKE UP ABOUT THE PERSON'S OWN SYSTEM.
//
// An answer is full of specifics nobody supplied, and most are general knowledge the reader can check
// ("PKCE stops a stolen authorization code from being redeemed"): those are listed, never cut. Three
// kinds are different. They describe the person's own system or the assistant's own work, which the
// assistant cannot know from the request, and a reader takes them as done:
//
//   WORK DONE     "Fixed: README.md said recieve", "Checked this against the failing case", "I ran the
//                 migration", "returns 200 now", "tests pass"
//   RESULT        a figure of progress or outcome: "2.3M rows, 40 min", "1.1M of 2.4M rows written"
//   ENVIRONMENT   an identifier from their system the request never gave: a project-specific `npm run`
//                 script, a table, branch or service name ("Drop the old `orders_legacy` table",
//                 "`npm run migrate:down`"); never `npm run build`, never a path on its own
//
// Found in the text itself, not only among the reader's flags: the reader missed "2.3M rows, 40 min" and
// "orders_legacy". Each is judged against what the person supplied (the request, bound material): a
// detail they gave is theirs to have repeated.

import { claimUnitsOf, type Claim } from './claims.js';
import { numbersIn } from './claim-extract.js';

const WORK_DONE = /^\W*(?:fixed|checked|verified|tested|ran|done|updated|deployed|applied|migrated|confirmed|reproduced|patched)\b|\bI(?:['’]ve| have)?\s+(?:ran|run|checked|verified|tested|fixed|updated|deployed|applied|reproduced|confirmed|changed|edited|patched|migrated|backfilled)\b|\b(?:now (?:passes|returns|works|succeeds)|returns? 200 now|(?:all )?tests? (?:now )?pass(?:es|ed)?|all green)\b/i;
const RESULT_WORDS = /\b(?:rows?|records?|written|processed|migrated|backfilled|remaining|left|done|complete[d]?|ETA|elapsed|min(?:utes?)?\b(?! of)|throughput|per second)\b/i;
const IDENTIFIER = /`([^`\n]{2,80})`/g;
// NARROW ON PURPOSE. Any `npm run <x>` or path-shaped name counted as "your system", so `npm run build` and
// an ordinary `src/index.ts` were cut from correct answers. A script is theirs only when its name is not one
// every project has; a file path alone is not claimed as theirs at all (an answer may name where a fix goes).
const COMMON_SCRIPTS = new Set(['build', 'test', 'dev', 'start', 'lint', 'format', 'typecheck', 'check', 'serve', 'preview', 'watch', 'ci', 'clean', 'install', 'prepare']);
const PROJECT_SCRIPT = /^(?:npm|pnpm|yarn) run ([\w:.-]+)/;
const NAMED_THING = /\b(?:table|column|branch|database|schema|bucket|queue|topic|service|index|migration)\b/i;
// A name every project has is not a detail of theirs: `main`, `HEAD`, `production`. Measured: next to the word
// "branch", `main` cut four correct sentences from a rebase explanation. Only a specific-looking name counts:
// one with an underscore, a colon, a dot or a dash inside it (`orders_legacy`, `migrate:down`, `api-v2`).
const COMMON_NAMES = new Set(['main', 'master', 'develop', 'dev', 'head', 'origin', 'upstream', 'production', 'prod', 'staging', 'stage', 'test', 'default', 'public', 'users', 'orders', 'release', 'trunk', 'feature', 'local', 'remote']);
const SPECIFIC = (id: string): boolean => /[\w][_:.-][\w]/.test(id) && !COMMON_NAMES.has(id.toLowerCase());

/**
 * The claim units of `text` that claim work done, a result, or an identifier from the person's system
 * not in `known` (the request and anything bound). Kept in the shape of the claim check's own claims, so
 * the loop cuts them the same way; `flagged` are the reader's or pattern's claims, reused where they match.
 */
export function answerWorkClaims(text: string, known: string, flagged: readonly Claim[]): Claim[] {
  const k = known.toLowerCase();
  const knownFigures = new Set(numbersIn(known));
  const out: Claim[] = [];
  for (const u of claimUnitsOf(text)) {
    // The unit's own text has inline code blanked out; the identifiers are the point here, so the
    // original is read at the unit's offsets.
    const s = text.slice(u.start, u.end);
    const work = WORK_DONE.test(s) || (RESULT_WORDS.test(s) && numbersIn(s).some((n) => !knownFigures.has(n)));
    const why = work ? 'a claim of work done or a result seen, which the request did not report' : environmentIdentifier(s, k);
    if (!why) continue;
    const reused = flagged.find((c) => c.start === u.start);
    out.push(reused ? { ...reused, kind: 'EXPERIENCE', why } : { start: u.start, end: u.end, text: u.text, kind: 'EXPERIENCE', why });
  }
  return out;
}

/** Why `s` names something from the person's own system that `known` (lower-cased) does not, or null. */
function environmentIdentifier(s: string, known: string): string | null {
  for (const m of s.matchAll(IDENTIFIER)) {
    const id = m[1].trim();
    if (known.includes(id.toLowerCase())) continue;
    // A named table, branch or service beside the identifier, or an identifier shaped like a path or script.
    const around = s.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + m[0].length + 30);
    const script = PROJECT_SCRIPT.exec(id)?.[1];
    const theirScript = script !== undefined && !COMMON_SCRIPTS.has(script.toLowerCase());
    if (theirScript || (NAMED_THING.test(around) && /^[\w.:-]+$/.test(id) && SPECIFIC(id))) {
      return `"${id}", a detail of your system the request did not give`;
    }
  }
  return null;
}

/** An answer's claim units as the context judge reads them: the original text, inline code included. */
export const answerSentences = (text: string): string[] => claimUnitsOf(text).map((u) => text.slice(u.start, u.end));

/**
 * The sentences the context judge read as work done or results that the patterns did not: listed for the
 * person to check, never cut. The judge is not measured (./cut-authority.ts), so it may flag, not delete.
 */
export function judgedOnly(text: string, judged: ReadonlySet<number> | null, cutByPattern: readonly Claim[]): Claim[] {
  if (!judged?.size) return [];
  const units = claimUnitsOf(text);
  return [...judged].map((i) => units[i]).filter((u): u is NonNullable<typeof u> => Boolean(u) && !cutByPattern.some((c) => c.start === u.start))
    .map((u) => ({ start: u.start, end: u.end, text: u.text, kind: 'EXPERIENCE' as const, why: 'may claim work done or a result seen (read by the context judge, not measured): check it' }));
}
