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
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (failure !== null) throw (failure as { error: unknown }).error;
  return out;
}
