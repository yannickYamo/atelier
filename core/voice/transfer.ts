// atelier/core/voice/transfer.ts — WHICH TRAITS CARRY TO ANOTHER REGISTER IS A POLICY, NOT A FINDING.
//
// A corpus in one register cannot say which of its habits would carry to another. A short paragraph in a
// blog post may be the author, the genre, the topic, or the author in that genre, and one register holds
// those four together: no count separates them. So transfer is never inferred. Every rule and every
// steering feature carries one of three states:
//
//   invariant        measured: the author's median barely moves between two or more of their registers
//   owner-transfer   declared: the owner said this carries, and that ruling is recorded with its date
//   unknown          the default, and the only state a one-register corpus can reach on its own
//
// Out of register, only what is `invariant` or `owner-transfer` is applied (./register.ts). The policy is
// below the standard and never moves it: it names the standard it was written under, and it says which
// approved rules are applied where, never what a rule says.
//
// INVARIANCE IS A NARROW CLAIM. It is measured on the registers the author has, by a bootstrap interval of
// the difference between register medians, held against a quarter of the author's own spread inside a
// register. It says the feature did not move between THOSE registers. It does not say it will hold in a
// register the corpus has none of; the panel says which registers it was measured across.

import { createHash } from 'node:crypto';
import { quantile } from '../observers/text.js';
import { canonicalJson } from '../fidelity/release.js';

export type TransferState =
  | { readonly kind: 'invariant'; readonly registers: readonly string[]; readonly interval: readonly [number, number] }
  | { readonly kind: 'owner-transfer'; readonly ratifiedAt: string }
  | { readonly kind: 'unknown' };

/** A trait is a requirement of the standard (its id) or a steering feature (`f:<feature id>`). */
export const featureTrait = (id: string): string => `f:${id}`;

export interface TransferPolicy {
  readonly version: 1;
  /** the standard this policy was written under; under another standard it is not applied */
  readonly standardVersionHash: string;
  /** the registers the corpus is written in, as the owner named them */
  readonly corpusRegisters: readonly string[];
  /** trait -> state; a trait absent here is `unknown` */
  readonly states: Readonly<Record<string, TransferState>>;
  readonly updatedAt: string;
  /** hash of everything above except updatedAt */
  readonly hash: string;
}

/** Fewer pieces than this in a register and its median says too little to compare. */
export const MIN_PIECES_PER_REGISTER = 4;
/** The share of the author's within-register spread (IQR) a between-register difference may reach. */
export const INVARIANCE_SHARE = 0.25;
const RESAMPLES = 1000;

/** A small seeded generator, so a measurement recorded once is the same measurement when replayed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const iqr = (xs: readonly number[]): number => quantile(xs, 0.75) - quantile(xs, 0.25);

/**
 * One feature's state from its values per register (one value per piece). `unknown` unless at least two
 * registers have MIN_PIECES_PER_REGISTER pieces each, the author's spread inside a register is not zero,
 * and for every pair of registers the 95% bootstrap interval of the difference in medians lies within
 * ±INVARIANCE_SHARE of that spread. The interval reported is the widest over the pairs.
 */
export function measureInvariance(byRegister: Readonly<Record<string, readonly number[]>>, seed = 1): TransferState {
  const registers = Object.keys(byRegister).filter((r) => byRegister[r].length >= MIN_PIECES_PER_REGISTER).sort();
  if (registers.length < 2) return { kind: 'unknown' };
  const spread = registers.reduce((a, r) => a + iqr(byRegister[r]), 0) / registers.length;
  if (!(spread > 0)) return { kind: 'unknown' };
  const rand = mulberry32(seed);
  const resample = (xs: readonly number[]): number[] => xs.map(() => xs[Math.floor(rand() * xs.length)]);
  let lo = Infinity; let hi = -Infinity;
  for (let i = 0; i < registers.length; i++) {
    for (let j = i + 1; j < registers.length; j++) {
      const a = byRegister[registers[i]]; const b = byRegister[registers[j]];
      const diffs: number[] = [];
      for (let k = 0; k < RESAMPLES; k++) diffs.push(median(resample(a)) - median(resample(b)));
      lo = Math.min(lo, quantile(diffs, 0.025)); hi = Math.max(hi, quantile(diffs, 0.975));
    }
  }
  const bound = INVARIANCE_SHARE * spread;
  return lo >= -bound && hi <= bound ? { kind: 'invariant', registers, interval: [round(lo), round(hi)] } : { kind: 'unknown' };
}

const round = (x: number): number => Math.round(x * 1000) / 1000;

export const policyHash = (p: Pick<TransferPolicy, 'standardVersionHash' | 'corpusRegisters' | 'states'>): string =>
  createHash('sha256').update(canonicalJson({ standardVersionHash: p.standardVersionHash, corpusRegisters: p.corpusRegisters, states: p.states }))
    .digest('hex').slice(0, 16);

export function makePolicy(standardVersionHash: string, corpusRegisters: readonly string[], states: Readonly<Record<string, TransferState>>, at: string): TransferPolicy {
  // `unknown` is the default, so it is never stored: a policy lists only what carries.
  const kept = Object.fromEntries(Object.entries(states).filter(([, s]) => s.kind !== 'unknown').sort(([a], [b]) => a.localeCompare(b)));
  const body = { standardVersionHash, corpusRegisters: [...new Set(corpusRegisters)].sort(), states: kept };
  return { version: 1, ...body, updatedAt: at, hash: policyHash(body) };
}

export const stateOf = (policy: TransferPolicy | null, trait: string): TransferState => policy?.states[trait] ?? { kind: 'unknown' };

/** Whether a trait is applied out of register: only when measured invariant, or declared by the owner. */
export const carries = (policy: TransferPolicy | null, trait: string): boolean => stateOf(policy, trait).kind !== 'unknown';

/** The traits among `traits` that carry, and those that do not. */
export function split(policy: TransferPolicy | null, traits: readonly string[]): { readonly carried: string[]; readonly unknown: string[] } {
  const carried = traits.filter((t) => carries(policy, t));
  return { carried, unknown: traits.filter((t) => !carried.includes(t)) };
}
