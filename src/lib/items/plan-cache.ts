/**
 * plan-cache.ts — keeps a finished loadout plan (and the goal search behind it) past the page that
 * asked for it. `useMemo` dies with its component, so leaving the Items tab and coming back re-ran a
 * whole search; this lives at module level, so the way back is a lookup.
 *
 * The key is by **content** for the small inputs (criteria, weights, options) and by **identity** for
 * the big ones (catalogue rows, the inventory dump, proc spells), since hashing eleven thousand rows
 * would cost what the plan does. A new dump or a reloaded catalogue is a new object, so it misses.
 */
const ids = new WeakMap<object, number>();
let nextId = 1;

function idOf(o: object | null | undefined): number {
  if (!o) return 0;
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = nextId++));
  return id;
}

/** A key for these big inputs (by identity) and these small ones (by content). */
export function planKey(
  big: readonly (object | null | undefined)[],
  small: unknown,
): string {
  return `${big.map(idOf).join(".")}|${JSON.stringify(small)}`;
}

/** A small least-recently-used cache: the oldest entry goes when `limit` is passed. */
export function createPlanCache<T>(limit = 6) {
  const entries = new Map<string, T>();
  const keep = (key: string, value: T) => {
    entries.delete(key); // re-insert: most recently used goes last
    entries.set(key, value);
    if (entries.size > limit) entries.delete(entries.keys().next().value!);
  };
  return {
    /** What's kept under this key, if anything — for a result that arrives later (`set`) than it was asked for. */
    peek: (key: string): T | undefined => entries.get(key),
    set: keep,
    get(key: string, compute: () => T): T {
      if (entries.has(key)) {
        const hit = entries.get(key)!;
        keep(key, hit);
        return hit;
      }
      const value = compute();
      keep(key, value);
      return value;
    },
  };
}
