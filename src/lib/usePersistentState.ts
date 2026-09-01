"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "./api";

/**
 * Main's whole record, fetched **once per window** and shared by every hook.
 *
 * A window holds a dozen or more of these, and one round trip each — all returning the same record —
 * would be a dozen IPC calls in the first frame for no more information than one gives.
 */
let shared: Promise<Record<string, unknown>> | null | undefined;
function allShared(): Promise<Record<string, unknown>> | null {
  if (shared === undefined) shared = api()?.ui.all() ?? null;
  return shared;
}

/**
 * `useState` that remembers its value, so window toggles / selections survive the window closing and
 * reopening (and app restarts). Drop-in for `useState`. The value must be JSON-serializable.
 *
 * ## Two places, and why
 *
 * The value goes to **`localStorage`** and to the **main process** (`electron/ui-state.ts`), and the
 * main process wins when they disagree.
 *
 * `localStorage` alone looks right and is not: it belongs to an *origin*, and this renderer has two
 * of them — `app://local` when the app is packaged, `http://localhost:3000` when it is run against
 * the dev server. Each keeps its own copy, so a weight sheet typed under one is simply absent under
 * the other, which presents as settings that don't survive a restart. Main has no origin, so it is
 * the copy that is actually the user's.
 *
 * `localStorage` is kept anyway because it is **synchronous**: main's copy arrives an IPC round trip
 * after mount, and without the local one every panel would visibly snap from its defaults on every
 * open. It is also what seeds main the first time this build runs, so nobody's stored settings are
 * lost on upgrade.
 *
 * Starts from `initial` on the first render (identical to the static-export markup, so no hydration
 * mismatch). No-ops cleanly where neither store is available — a plain browser, or a test.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  /**
   * An older key to inherit from, once, when `key` holds nothing anywhere.
   *
   * For a key that had to be *bumped* rather than migrated in place — where the stored shape can no
   * longer be told apart from the one you want (see the Items tab's era default). Nothing is written
   * back under the old key, so rolling the build back finds it untouched.
   */
  legacy?: { key: string; migrate: (stored: unknown) => T },
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  // A render flag (not a ref) so the persist effect only runs *after* the load — never
  // clobbering the stored value with `initial` on mount.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    const read = (name: string): unknown => {
      try {
        const raw = localStorage.getItem(name);
        return raw != null ? (JSON.parse(raw) as unknown) : undefined;
      } catch {
        return undefined; // storage unavailable or bad JSON — keep initial
      }
    };
    const local = (): T | undefined => {
      const mine = read(key);
      if (mine !== undefined) return mine as T;
      if (!legacy) return undefined;
      const old = read(legacy.key);
      return old === undefined ? undefined : legacy.migrate(old);
    };
    // Read local first and apply it immediately: it is synchronous, and the alternative is every
    // panel flashing its defaults while an IPC call is in flight.
    const held = local();
    if (held !== undefined) setValue(held);

    const fromMain = allShared();
    if (!fromMain) {
      setLoaded(true);
      return;
    }
    void fromMain
      .then((all) => {
        if (!live) return;
        // Absent from main means "this build has never written it" — the local copy stands and the
        // persist effect below mirrors it up. Present means main is the authority, whatever origin
        // this window happens to be served from.
        const fromStore = all[key];
        if (fromStore !== undefined) setValue(fromStore as T);
        else if (legacy && all[legacy.key] !== undefined) setValue(legacy.migrate(all[legacy.key]));
      })
      .catch(() => {
        /* no host, or it declined — the local copy is what we have */
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `legacy` is a literal; the key is the identity
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* best effort */
    }
    void api()
      ?.ui.set(key, value)
      .catch(() => {
        /* best effort — the local copy still holds it for this origin */
      });
  }, [key, value, loaded]);

  return [value, setValue];
}
