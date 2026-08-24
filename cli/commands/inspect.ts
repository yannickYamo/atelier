// cli/commands/inspect.ts — Reading what exists: what was built, what changed, and what to roll back to.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { assertNotAuthority } from '../../core/state/canonical-state.js';
import { compileArchitecture } from '../../core/architecture/compile.js';
import { renderAgentSkill } from '../../renderers/agent-skill/render.js';
import * as store from '../../core/state/store.js';

import { DATA, die, flag, projectDir, pickHost } from '../runtime.js';

// ── inspect / history / rollback / feedback ──────────────────────────────────────────────────
export function inspect(): void {
  const L: store.StoreLayout = { root: DATA, skillName: flag('--skill') ?? die('--skill required') };
  const active = store.getActive(L) ?? die('no active version.');
  const sv = store.getSkillVersion(L, active)!;
  const v = store.getStandard(L, sv.standardVersionHash) ?? die('standard missing');
  assertNotAuthority('STANDARD_VERSION', true);
    console.log(`skill ${L.skillName}\nactive SkillVersion ${sv.skillVersionHash}\nowned by StandardVersion ${v.standardVersionHash} [${v.authorityState}] (${v.requirements.length} requirements, minted ${v.mintedAt})`);
  const ver = pickHost().verifyInstallation(renderAgentSkill(v, compileArchitecture(v), L.skillName, `Writes in the author's own standard (${v.workType})`), projectDir());
  console.log(ver.present ? (ver.matchesPackage ? 'installed file matches the standard.' : `\nMATERIALIZATION DRIFT: ${ver.detail}\nThe installed file was edited by hand. It now serves something the StandardVersion does not say.`) : `not installed: ${ver.detail}`);
  for (const r of v.requirements) console.log(`  [${r.kind[0]}] ${r.statement}${/^GENERAL\b/i.test(r.appliesWhen) ? '' : `  (when: ${r.appliesWhen})`}`);
}

export function historyCmd(): void {
  const L: store.StoreLayout = { root: DATA, skillName: flag('--skill') ?? die('--skill required') };
  for (const h of store.history(L)) console.log(`${h.active ? '*' : ' '} ${h.skillVersion.skillVersionHash}  ${h.skillVersion.builtAt}  standard ${h.skillVersion.standardVersionHash}${h.standard?.reason ? `  — ${h.standard.reason}` : ''}`);
}

export function rollback(): void {
  const L: store.StoreLayout = { root: DATA, skillName: flag('--skill') ?? die('--skill required') };
  const to = flag('--to') ?? die('--to <skillVersionHash> required');
  store.setActive(L, to);
  const sv = store.getSkillVersion(L, to)!;
  const v = store.getStandard(L, sv.standardVersionHash)!;
  const host = pickHost();
  const r = host.install(renderAgentSkill(v, compileArchitecture(v), L.skillName, `Writes in the author's own standard (${v.workType})`), projectDir());
  if (!r.ok) return void die(`reinstall failed: ${r.reason}`);
  console.log(`rolled back to ${to}. History is unchanged — this can itself be rolled back.`);
}

export function feedback(): void {
  const L: store.StoreLayout = { root: DATA, skillName: flag('--skill') ?? die('--skill required') };
  const verdict = (flag('--verdict') ?? '').toUpperCase();
  if (!['GOOD', 'CLOSE', 'BAD'].includes(verdict)) die('--verdict GOOD|CLOSE|BAD');
  store.appendEvent(L, { kind: 'FEEDBACK', at: new Date().toISOString(), skillVersionHash: store.getActive(L) ?? 'none', verdict, note: flag('--note') ?? null });
  console.log('recorded. Feedback is evidence — it can propose a change to your standard, never apply one.');
}

/** The single entry point a person actually types. Everything mechanical happens here. */
/**
 * THE WHOLE FLOW, IN ONE COMMAND.
 *
 * It used to be three: `create` sealed and discovered, then the user had to know to run
 * `ratify-close`, then `build --name`. Nobody pointing at a folder of their own writing knows those
 * words, and a product whose happy path requires reading the source is not a product.
 *
 * Nothing was weakened to collapse them. Ratification is not a gate any more (a ruling by the person whose standard it is), the
 * standard still mints with every rule carrying its own authority, unconfirmed prohibitions still
 * compile to OBSERVE and cannot shape output, and the post-build disclosure still asks about them.
 * The three commands remain for anyone who wants to stop in between.
 */
