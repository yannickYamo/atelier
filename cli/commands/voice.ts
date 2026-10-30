// cli/commands/voice.ts — THE VOICE LAYER: THE CORPUS'S REGISTER, WHAT CARRIES OUT OF IT, AND THE PAIR BANK.
//
//   atelier voice register --skill <name> <register>      the register your pieces are written in (one register)
//   atelier voice register --skill <name> --corpus <dir>  several registers: each piece says its own in its front
//                                                         matter (`register: speech`), and what holds still between
//                                                         them is measured
//   atelier voice transfer --skill <name> --add <trait>   this rule or feature carries out of register (your ruling)
//   atelier voice transfer --skill <name> --strike <trait>   and back to unknown
//   atelier voice pairs --skill <name> [--cap 2]          build the pair bank: one model call per paragraph
//   atelier voice status --skill <name>                   registers, what carries, the bank, the mode
//
// A trait is a rule's id (c12) or a steering feature (f:<feature id>). Nothing here moves the standard: the
// policy says where approved rules are applied, never what a rule says, and it is written under one standard
// and not applied under another. The voice pass itself is turned on with
// `atelier fidelity --skill <name> --set voice=incontext`, or for one run with `invoke --voice incontext`.

import { namedAsMaterial } from '../../core/golden/case.js';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as store from '../../core/state/store.js';
import * as fstore from '../../core/state/fidelity-store.js';
import * as vstore from '../../core/state/voice-store.js';
import { readFidelity } from '../../core/fidelity/profile.js';
import { featureOf } from '../../core/observers/features.js';
import { normaliseRegister } from '../../core/voice/register.js';
import { featureTrait, makePolicy, measureInvariance, split, stateOf, MIN_PIECES_PER_REGISTER, type TransferState } from '../../core/voice/transfer.js';
import { buildPairBank, pairCandidates, MIN_PAIRS } from '../../core/voice/pairs.js';
import type { Budget } from '../../core/inference/client.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import type { FidelityProfile } from '../../core/fidelity/types.js';
import { DATA, die, flag, flagAll, numericFlag, positionals, skillArg, clientAndBinding } from '../runtime.js';

const USAGE = 'usage: atelier voice register|transfer|pairs|status --skill <name>';

export async function voice(): Promise<void> {
  const sub = positionals()[0] ?? die(USAGE);
  const name = skillArg(USAGE);
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`"${name}" has no active version.`);
  const std = store.getStandard(L, sv.standardVersionHash) ?? die(`"${name}" has no standard.`);
  const profile = fstore.getProfile(L) ?? die(`"${name}" has no fidelity profile: the voice layer needs a skill built from a corpus (atelier new <folder>).`);
  switch (sub) {
    case 'register': register(L, std, profile); return;
    case 'transfer': transfer(L, std, profile); return;
    case 'pairs': await pairs(L); return;
    case 'status': status(L, std, profile); return;
    default: die(`unknown voice command "${sub}". ${USAGE}`);
  }
}

/** Every trait a policy can speak about: the standard's live rules, and the profile's steering features. */
function traitsOf(std: StandardVersion, profile: FidelityProfile): { id: string; label: string }[] {
  return [
    ...std.requirements.filter((q) => q.authority !== 'EXPERT_REJECTED').map((q) => ({ id: q.requirementId, label: q.statement })),
    ...profile.bands.filter((b) => b.cls === 'all' && b.role !== 'MONITOR').map((b) => ({ id: featureTrait(b.id), label: featureOf(b.id)?.label ?? b.id })),
  ];
}

/** The current policy when it was written under this standard; a policy under another standard is not carried over. */
function currentPolicy(L: store.StoreLayout, std: StandardVersion): ReturnType<typeof vstore.getPolicy> {
  const p = vstore.getPolicy(L);
  return p?.standardVersionHash === std.standardVersionHash ? p : null;
}

function register(L: store.StoreLayout, std: StandardVersion, profile: FidelityProfile): void {
  const dir = flag('--corpus');
  const prior = currentPolicy(L, std);
  // The owner's own rulings survive a re-declaration; measured states are measured again or dropped.
  const owned = Object.fromEntries(Object.entries(prior?.states ?? {}).filter(([, s]) => s.kind === 'owner-transfer'));
  if (!dir) {
    const one = positionals()[1] ?? die('name the register your pieces are written in: atelier voice register --skill <name> post   (or --corpus <dir> when pieces say their own)');
    const policy = makePolicy(std.standardVersionHash, [normaliseRegister(one)], owned, new Date().toISOString());
    vstore.setPolicy(L, policy);
    console.log(`"${L.skillName}" is written in one register: ${policy.corpusRegisters[0]}.`);
    console.log('One register: nothing can be shown to transfer. A request in another register gets only the rules you mark to carry:');
    console.log(`  atelier voice transfer --skill ${L.skillName} --add <rule id>      (atelier voice status --skill ${L.skillName} lists them)`);
    return;
  }
  if (!existsSync(dir) || !statSync(dir).isDirectory()) die(`${dir} is not a folder.`);
  const byRegister = new Map<string, string[]>();
  const pieceFiles = readdirSync(dir).filter((x) => /\.(md|markdown|txt)$/i.test(x)).sort();
  const material = namedAsMaterial(pieceFiles.map((f) => ({ name: f, raw: readFileSync(join(dir, f), 'utf8') })));
  for (const f of pieceFiles.filter((x) => !material.has(x))) {
    const raw = readFileSync(join(dir, f), 'utf8');
    const r = frontMatterRegister(raw) ?? die(`${f} names no register: add "register: <name>" to its front matter. A register is never guessed.`);
    byRegister.set(normaliseRegister(r), [...(byRegister.get(normaliseRegister(r)) ?? []), raw]);
  }
  if (!byRegister.size) die(`no .md or .txt pieces in ${dir}.`);
  const registers = [...byRegister.keys()].sort();
  // INVARIANCE, FEATURE BY FEATURE: each piece read against the profile, its value on each steering feature
  // grouped by the register the piece names.
  const states: Record<string, TransferState> = { ...owned };
  const features = profile.bands.filter((b) => b.cls === 'all' && b.role !== 'MONITOR').map((b) => b.id);
  let invariant = 0;
  if (registers.length >= 2) {
    const readings = new Map(registers.map((r) => [r, (byRegister.get(r) ?? []).map((t) => readFidelity(t, profile).values)]));
    for (const id of features) {
      if (states[featureTrait(id)]) continue;
      const values = Object.fromEntries(registers.map((r) => [r, (readings.get(r) ?? []).map((v) => v[id]).filter((x): x is number => typeof x === 'number')]));
      const s = measureInvariance(values);
      if (s.kind === 'invariant') { states[featureTrait(id)] = s; invariant += 1; }
    }
  }
  const policy = makePolicy(std.standardVersionHash, registers, states, new Date().toISOString());
  vstore.setPolicy(L, policy);
  console.log(`"${L.skillName}" is written in ${registers.length} register(s): ${registers.map((r) => `${r} (${byRegister.get(r)?.length ?? 0})`).join(', ')}.`);
  if (registers.length < 2) console.log('One register: nothing can be shown to transfer; mark what should carry (atelier voice transfer --add).');
  else console.log(`${invariant} of ${features.length} steering feature(s) held still between them (within a quarter of your own spread, registers with at least ${MIN_PIECES_PER_REGISTER} pieces); the rest are unknown. Rules are never measured: mark the ones that carry.`);
}

function transfer(L: store.StoreLayout, std: StandardVersion, profile: FidelityProfile): void {
  const policy = currentPolicy(L, std) ?? die(`declare the corpus's register first: atelier voice register --skill ${L.skillName} <register>`);
  const known = new Set(traitsOf(std, profile).map((t) => t.id));
  const add = flagAll('--add'); const strike = flagAll('--strike');
  if (!add.length && !strike.length) die('say which trait: --add <rule id or f:feature> to carry it out of register, --strike <trait> to stop.');
  for (const t of [...add, ...strike]) if (!known.has(t)) die(`"${t}" is not a rule of this standard or a steering feature. atelier voice status --skill ${L.skillName} lists them.`);
  const states: Record<string, TransferState> = { ...policy.states };
  const at = new Date().toISOString();
  for (const t of add) states[t] = { kind: 'owner-transfer', ratifiedAt: at };
  for (const t of strike) states[t] = { kind: 'unknown' };
  const next = makePolicy(std.standardVersionHash, policy.corpusRegisters, states, at);
  vstore.setPolicy(L, next);
  const s = split(next, [...known]);
  console.log(`Out of register, ${s.carried.length} trait(s) now carry and ${s.unknown.length} do not (policy ${next.hash}). The standard is unchanged.`);
}

async function pairs(L: store.StoreLayout): Promise<void> {
  const index = fstore.getRetrievalIndex(L) ?? die(`"${L.skillName}" has no passages of the author's to pair: it was built without a corpus.`);
  const candidates = pairCandidates(index.passages);
  if (candidates.length < MIN_PAIRS) die(`only ${candidates.length} paragraph(s) of 40 to 300 words in the pieces read: too few for a bank (${MIN_PAIRS} at least).`);
  // SAID BEFORE ANYTHING IS SPENT: one call per paragraph, and the cap it stops at.
  const cap = numericFlag('--cap', 2);
  const estimate = candidates.length * 0.01;
  console.log(`${candidates.length} paragraph(s) to rewrite plainly, one model call each: roughly $${estimate.toFixed(2)}; the cap is $${cap.toFixed(2)}.`);
  if (estimate > cap) die(`that is over the cap. Nothing was spent. Raise it with --cap ${Math.ceil(estimate)}.`);
  const { client, binding } = clientAndBinding('target');
  const budget: Budget = { spentUsd: 0, capUsd: cap, maxCalls: candidates.length };
  const bank = await buildPairBank(client, budget, index.passages, index.hash, binding.requestedModel, new Date().toISOString(),
    (done, of) => { if (done % 25 === 0 || done === of) console.log(`  ${done} of ${of}`); });
  const dropped = Object.entries(bank.rejected).filter(([, n]) => n > 0).map(([why, n]) => `${n} ${why}`).join(', ');
  if (bank.pairs.length < MIN_PAIRS) die(`only ${bank.pairs.length} pair(s) passed the checks (${dropped || 'none dropped'}); a bank needs ${MIN_PAIRS}. $${budget.spentUsd.toFixed(2)} spent, nothing stored.`);
  vstore.setBank(L, bank);
  console.log(`Pair bank ${bank.hash}: ${bank.pairs.length} pair(s) kept${dropped ? `; dropped ${dropped}` : ''}. $${budget.spentUsd.toFixed(2)} spent. The plain side was written by ${binding.requestedModel}.`);
  console.log(`Turn the voice pass on with: atelier fidelity --skill ${L.skillName} --set voice=incontext   (or for one run: invoke --voice incontext)`);
}

function status(L: store.StoreLayout, std: StandardVersion, profile: FidelityProfile): void {
  const policy = currentPolicy(L, std);
  const bank = vstore.getBank(L);
  const mode = fstore.getActiveRelease(L)?.release.settings.voice ?? 'off';
  if (!policy) {
    console.log(`"${L.skillName}" has no register declared, so nothing of the voice layer runs. Start with: atelier voice register --skill ${L.skillName} <register>`);
    return;
  }
  console.log(`Written in: ${policy.corpusRegisters.join(', ')} (policy ${policy.hash}, under standard ${policy.standardVersionHash}).`);
  console.log('Out of register:');
  for (const t of traitsOf(std, profile)) {
    const s = stateOf(policy, t.id);
    const how = s.kind === 'invariant' ? `carries: held still across ${s.registers.join(', ')} (${s.interval[0]} to ${s.interval[1]})` : s.kind === 'owner-transfer' ? `carries: your ruling, ${s.ratifiedAt.slice(0, 10)}` : 'unknown: not carried';
    console.log(`  ${t.id.padEnd(24)} ${how}  ${t.label.slice(0, 60)}`);
  }
  console.log(bank ? `Pair bank ${bank.hash}: ${bank.pairs.length} pair(s), plain side by ${[...new Set(bank.pairs.map((p) => p.neutraliser))].join(', ')}.` : `No pair bank yet: atelier voice pairs --skill ${L.skillName}`);
  console.log(`Voice pass: ${mode === 'incontext' ? 'on (in-context pairs)' : 'off'}. Not measured: whether it moves your voice; that is for a blind read by people.`);
}

/** The register a piece names in its front matter, or undefined: never guessed from the text. */
export function frontMatterRegister(raw: string): string | undefined {
  const lines = raw.replace(/^\uFEFF/, '').split('\n');
  if (lines[0]?.trim() !== '---') return undefined;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '---' || t === '...') break;
    const m = /^register:\s*(.+)$/i.exec(t);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '') || undefined;
  }
  return undefined;
}
