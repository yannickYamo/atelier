// atelier/core/state/voice-store.ts — THE VOICE LAYER'S STATE, BESIDE THE SKILL'S, UNDER THE SAME RULES.
//
// Laid out under `skills/<name>/voice/` with the conventions of ./store.ts and ./fidelity-store.ts: every
// file written with writeAtomic, every read through readJson, everything content-addressed except the two
// pointers that say which is current.
//
//   policy.json             the current transfer policy (TransferPolicy): the corpus's registers, and which
//                           traits carry out of register
//   policies/<hash>.json    every policy there has been, kept: a run names the policy it applied
//   bank.json               the current pair bank (PairBank)
//   banks/<hash>.json       every bank a run has drawn examples from, kept for the same reason
//   threshold-<index>.json  the corpus's own register distance threshold, computed once per retrieval index
//
// None of it is the standard. A policy names the standard it was written under, and is not applied under
// another.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from './fs-atomic.js';
import { readJson } from './read-json.js';
import type { StoreLayout } from './store.js';
import { policyHash, type TransferPolicy } from '../voice/transfer.js';
import { pairsHash, type PairBank } from '../voice/pairs.js';

const base = (l: StoreLayout): string => {
  const name = l.skillName;
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
    throw new Error(`STORE: "${name}" is not a skill name; it would resolve outside skills/.`);
  }
  return join(l.root, 'skills', name, 'voice');
};
const hashed = (h: string): string => {
  if (!/^[0-9a-f]+$/.test(h)) throw new Error(`STORE: "${h}" is not a hash.`);
  return h;
};

/** The current policy, or the one with this hash. A file whose content does not hash to its name is not served. */
export function getPolicy(l: StoreLayout, hash?: string): TransferPolicy | null {
  const p = hash ? join(base(l), 'policies', `${hashed(hash)}.json`) : join(base(l), 'policy.json');
  if (!existsSync(p)) return null;
  const policy = readJson<TransferPolicy>(p, { what: 'the transfer policy', requireKeys: ['standardVersionHash', 'corpusRegisters', 'states', 'hash'] });
  if (policyHash(policy) !== policy.hash) throw new Error(`STORE: transfer policy at ${p} names itself ${policy.hash} and its content hashes to ${policyHash(policy)}. It is not served.`);
  return policy;
}
export function setPolicy(l: StoreLayout, policy: TransferPolicy): void {
  writeAtomic(join(base(l), 'policies', `${hashed(policy.hash)}.json`), JSON.stringify(policy, null, 1));
  writeAtomic(join(base(l), 'policy.json'), JSON.stringify(policy, null, 1));
}

/** The current bank, or the one with this hash. */
export function getBank(l: StoreLayout, hash?: string): PairBank | null {
  const p = hash ? join(base(l), 'banks', `${hashed(hash)}.json`) : join(base(l), 'bank.json');
  if (!existsSync(p)) return null;
  const bank = readJson<PairBank>(p, { what: 'the pair bank', requireKeys: ['pairs', 'hash'] });
  if (pairsHash(bank.pairs) !== bank.hash) throw new Error(`STORE: pair bank at ${p} names itself ${bank.hash} and its pairs hash to ${pairsHash(bank.pairs)}. It is not served.`);
  return bank;
}
export function setBank(l: StoreLayout, bank: PairBank): void {
  writeAtomic(join(base(l), 'banks', `${hashed(bank.hash)}.json`), JSON.stringify(bank));
  writeAtomic(join(base(l), 'bank.json'), JSON.stringify(bank));
}

/** The register threshold computed for one retrieval index (null is a stored answer: too few pieces to have one). */
export function getThreshold(l: StoreLayout, indexHash: string): { readonly threshold: number | null } | null {
  const p = join(base(l), `threshold-${hashed(indexHash)}.json`);
  return existsSync(p) ? readJson<{ threshold: number | null }>(p, { what: 'the register threshold', requireKeys: ['threshold'] }) : null;
}
export function setThreshold(l: StoreLayout, indexHash: string, threshold: number | null): void {
  writeAtomic(join(base(l), `threshold-${hashed(indexHash)}.json`), JSON.stringify({ threshold }));
}
