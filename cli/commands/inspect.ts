// cli/commands/inspect.ts — Reading what exists: what was built, what changed, and what to roll back to.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { assertSourceIsNotAuthority, isGeneralScope } from '../../core/state/canonical-state.js';
import * as store from '../../core/state/store.js';

import { DATA, die, flag, projectDir, pickHost } from '../runtime.js';

// ── inspect / history / rollback / feedback ──────────────────────────────────────────────────
export function inspect(): void {
  const L: store.StoreLayout = { root: DATA, skillName: flag('--skill') ?? die('--skill required') };
  const active = store.getActive(L) ?? die('no active version.');
  const sv = store.getSkillVersion(L, active)!;
  const v = store.getStandard(L, sv.standardVersionHash) ?? die('standard missing');
  assertSourceIsNotAuthority('STANDARD_VERSION', true);
    console.log(`skill ${L.skillName}\nactive SkillVersion ${sv.skillVersionHash}\nowned by StandardVersion ${v.standardVersionHash} [${v.authorityState}] (${v.requirements.length} requirements, minted ${v.mintedAt})`);
  // ── CHECK AGAINST WHAT WAS BUILT, NOT AGAINST A RECONSTRUCTION OF IT ────────────────────────
  //
  // This used to re-render the package and compare the installed file to that. The re-render took the
  // description as an argument and reconstructed it as a default, so any skill built with
  // `--description` failed the comparison and this command reported MATERIALIZATION DRIFT and told the
  // author their file had been edited by hand. Nothing had been edited. The checker was wrong and it
  // blamed the user, which is the worst available failure for a command whose whole job is to say
  // whether you can trust what is installed.
  //
  // The package that was built is in the store under `materializedHash`. Read it. A comparison against
  // re-derived bytes can only ever be as trustworthy as the re-derivation, and there is no reason to
  // depend on that when the real bytes are on disk.
  const pkg = store.getPackage(L, sv.materializedHash);
  if (!pkg) {
    console.log(`\nCANNOT CHECK: package ${sv.materializedHash} is not in the store, so there is nothing to compare the`);
    console.log(`installed file against. This SkillVersion predates package persistence. Rebuild it to make it checkable.`);
  } else {
    const ver = pickHost().verifyInstallation(pkg, projectDir());
    console.log(ver.present ? (ver.matchesPackage ? 'installed file matches the package that was built.' : `\nMATERIALIZATION DRIFT: ${ver.detail}\nThe installed file was edited by hand. It now serves something the StandardVersion does not say.`) : `not installed: ${ver.detail}`);
  }
  for (const r of v.requirements) console.log(`  [${r.kind[0]}] ${r.statement}${isGeneralScope(r.appliesWhen) ? '' : `  (when: ${r.appliesWhen})`}`);
}

export function historyCmd(): void {
  const L: store.StoreLayout = { root: DATA, skillName: flag('--skill') ?? die('--skill required') };
  for (const h of store.history(L)) console.log(`${h.active ? '*' : ' '} ${h.skillVersion.skillVersionHash}  ${h.skillVersion.builtAt}  standard ${h.skillVersion.standardVersionHash}${h.standard?.reason ? `  — ${h.standard.reason}` : ''}`);
}

export function rollback(): void {
  const L: store.StoreLayout = { root: DATA, skillName: flag('--skill') ?? die('--skill required') };
  const to = flag('--to') ?? die('--to <skillVersionHash> required');
  const sv = store.getSkillVersion(L, to) ?? die(`no SkillVersion ${to} for ${L.skillName}.`);
  // ── REINSTALL THE BYTES THAT VERSION BUILT ──────────────────────────────────────────────────
  //
  // Re-rendering here installed a package that was NOT the one this SkillVersion built, because the
  // description was reconstructed rather than read. Rolling back is a promise that you get the thing
  // you had; serving a near-copy of it breaks that promise silently and `materializedHash` would have
  // caught it if anything had consulted it.
  //
  // REFUSES rather than approximating. A rollback that cannot reproduce the version is not a rollback.
  const pkg = store.getPackage(L, sv.materializedHash)
    ?? die(`package ${sv.materializedHash} is not in the store, so ${to} cannot be reinstalled as it was built. `
      + `This version predates package persistence. Nothing was changed — the active pointer is untouched.`);
  const r = pickHost().install(pkg, projectDir());
  if (!r.ok) return void die(`reinstall failed: ${r.reason}`);
  store.setActive(L, to);
  console.log(`rolled back to ${to}. Reinstalled package ${sv.materializedHash}, the one it built.`);
  console.log(`History is unchanged — this can itself be rolled back.`);
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
