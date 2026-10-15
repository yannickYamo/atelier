// atelier/core/inference/step-guard.ts — WHILE A REPAIR CHAIN RUNS, NO MODEL CALL OUTSIDE A STEP.
//
// Every replacement of the working text, and every model call made for one, is a step through `applyStep`
// (../loop/repair.ts), on the run's one ledger. A static scan of the chain's modules (tests/atelier-one-step.test.ts)
// holds that for the calls written in them; it cannot see a helper defined in another module, or one called from a
// branch no test runs. So the clients a run uses carry the guard at the call itself:
//
//   while a repair chain is running (`inRepairChain`), a call is allowed only inside a step (`inStep`, which `applyStep`
//   enters) or inside one of the read-only readers registered here (`asObserver`): readers that look at a text and
//   change nothing. Any other call is an error: under the test suite (ATELIER_STEP_GUARD=throw, set by the vitest
//   config) it throws, so the suite fails; elsewhere it is said on stderr and kept for the run's record
//   (`outOfStepCalls`), and the call goes ahead: a person's run is never refused for the program's own fault.
//
// The context travels with the async call chain (node's AsyncLocalStorage), so a helper anywhere is seen where it runs.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { InferenceClient, InferenceRequest, InferenceResult } from './client.js';

/**
 * THE READ-ONLY READERS a repair chain may call outside a step: each reads a text and changes nothing.
 *   claim reader    the invented-claim reader (../loop/claim-extract.ts)
 *   taste reader    the taste reader and its applicability and veto reads (../taste/reader.ts, ../fidelity/veto-sensor.ts)
 *   structure read  the paragraph-move reader (../structure/moves.ts)
 *   subject reader  the subject cards and their grading (../fidelity/subject-reader.ts)
 *   context judge   what the request asks and whether a reply gives it (../loop/context-judge.ts)
 */
export const READERS = ['claim reader', 'taste reader', 'structure read', 'subject reader', 'context judge'] as const;
export type Reader = (typeof READERS)[number];

interface Context { readonly chain: boolean; readonly step: boolean; readonly reader: Reader | null }
const context = new AsyncLocalStorage<Context>();

/** Run `f` as a repair chain: from here on, a call outside a step or a registered reader is an error. */
export const inRepairChain = <T>(f: () => Promise<T>): Promise<T> => context.run({ chain: true, step: false, reader: null }, f);
/** Run `f` as one step (`applyStep`): its calls are the step's, counted on the ledger. */
export const inStep = <T>(f: () => Promise<T>): Promise<T> => { const c = context.getStore(); return c ? context.run({ ...c, step: true }, f) : f(); };
/** Run `f` as one of the registered read-only readers. */
export const asObserver = <T>(who: Reader, f: () => Promise<T>): Promise<T> => { const c = context.getStore(); return c ? context.run({ ...c, reader: who }, f) : f(); };

/** The environment variable that makes a call outside a step throw: set by the test suite's config. */
export const STEP_GUARD_ENV = 'ATELIER_STEP_GUARD';
const stray: string[] = [];
/** Every call made in a repair chain outside a step and outside a registered reader, in this process. */
export const outOfStepCalls = (): readonly string[] => stray;

function guard(req: InferenceRequest): void {
  const c = context.getStore();
  if (!c?.chain || c.step || c.reader) return;
  const what = `a model call (${req.toolName}) was made while the repair ran, outside any step and any registered reader`;
  if (process.env[STEP_GUARD_ENV] === 'throw') throw new Error(`step guard: ${what}`);
  stray.push(what);
  process.stderr.write(`atelier: error: ${what}; it is not on the run's ledger.\n`);
}

const GUARDED = Symbol.for('atelier.stepGuarded');
/** The client with the guard on every call; a client already guarded is returned as it is. */
export function stepGuarded<C extends InferenceClient>(client: C): C {
  if ((client as unknown as Record<symbol, unknown>)[GUARDED]) return client;
  const complete = async (req: InferenceRequest): Promise<InferenceResult> => { guard(req); return client.complete(req); };
  return new Proxy(client, { get: (t, p, r) => (p === GUARDED ? true : p === 'complete' ? complete : Reflect.get(t, p, r) as unknown) });
}

/** `client` as one of the registered readers: each of its calls is that reader's. */
export const readingAs = (who: Reader, client: InferenceClient): InferenceClient => ({ complete: (req) => asObserver(who, () => client.complete(req)) });
