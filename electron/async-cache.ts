/**
 * async-cache.ts — a value computed once per key, kept in memory, and shared by whoever else asks
 * for the same key while the first computation is still in flight.
 *
 * `eq-maps.ts`'s zone namer and `travel-graph.ts`'s graph builder each wrote this pair — a `Map` of
 * settled values and a `Map` of in-flight promises — by hand: both are a folder scan expensive enough
 * (up to a second, on the main thread) that two windows opening the same pack at once must share one
 * scan rather than race two. What differs between them — *what* gets built, and how it's remembered
 * on disk between runs — stays in each of their own `compute` callbacks; this is only the memoizing
 * and de-duplicating shell around it.
 */

export interface AsyncCache<T> {
  /** This key's value — from memory, or from `compute()` if nothing (or nothing in flight) has it
   *  yet. Concurrent calls for the same key while `compute()` is running share its one promise,
   *  rather than each starting their own. */
  get(key: string, compute: () => Promise<T>): Promise<T>;
  /** Forget every settled and in-flight value — a folder was reloaded from under it. */
  clear(): void;
}

export function createAsyncCache<T>(): AsyncCache<T> {
  const settled = new Map<string, T>();
  const inFlight = new Map<string, Promise<T>>();
  return {
    get(key, compute) {
      const cached = settled.get(key);
      if (cached !== undefined) return Promise.resolve(cached);
      const already = inFlight.get(key);
      if (already) return already;
      const pending = compute()
        .then((value) => {
          settled.set(key, value);
          return value;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
      return pending;
    },
    clear() {
      settled.clear();
      inFlight.clear();
    },
  };
}
