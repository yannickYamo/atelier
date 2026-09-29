// atelier/core/inference/concurrency.ts — run independent calls side by side, in order.
//
// Discovery observed every rule against every held-out piece one call at a time, and `contract` ran
// thirty-six generations strictly in sequence: fifty minutes, with nothing on screen to tell work
// from a hang. The calls were never dependent on each other. They were sequential because a `for`
// loop with an `await` in it is the first thing anyone writes.
//
// Results come back in INPUT order whatever order the calls finish in, so nothing downstream can
// observe that they ran concurrently. The first failure stops new work from starting and is
// rethrown once the calls already in flight have settled — a budget refusal must not be followed by
// calls that were queued behind it.

/** How many provider calls run at once when nobody says otherwise. Conservative against rate limits. */
export const DEFAULT_CONCURRENCY = 4;

export async function mapLimit<T, R>(
  items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async (): Promise<void> => {
    while (failure === null && next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (e) { failure ??= { error: e }; }
    }
  };
  const width = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 1;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  if (failure !== null) throw (failure as { error: unknown }).error;
  return out;
}

/** One call's outcome: its value, or why it produced none. */
export type Settled<R> = { readonly ok: true; readonly value: R } | { readonly ok: false; readonly error: unknown };

/**
 * `mapLimit` for calls whose results are worth keeping when a sibling fails.
 *
 * `invoke --drafts 3` spent three generations and, when one of them failed, threw away the two that
 * had succeeded and delivered nothing — the whole point of several drafts is that each is a spare. Here
 * every call reports its own outcome and the caller decides what enough is. The first failure still
 * stops NEW work from starting (a budget refusal must not be followed by calls queued behind it); an
 * item never started reports that instead of a value.
 */
export async function mapLimitSettled<T, R>(
  items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>,
): Promise<Settled<R>[]> {
  const out = new Array<Settled<R>>(items.length);
  let next = 0;
  let failed: unknown = null; let anyFailed = false;
  const worker = async (): Promise<void> => {
    while (!anyFailed && next < items.length) {
      const i = next++;
      try { out[i] = { ok: true, value: await fn(items[i], i) }; } catch (e) {
        out[i] = { ok: false, error: e };
        if (!anyFailed) { anyFailed = true; failed = e; }
      }
    }
  };
  const width = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 1;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  for (let i = 0; i < items.length; i++) {
    out[i] ??= { ok: false, error: new Error('not started: an earlier call failed', { cause: failed }) };
  }
  return out;
}
