"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "./api";
import { createUiMirror } from "@/shared/ui-mirror";

/**
 * This window's live view of main's store — one for the whole window, since a dozen of these hooks
 * all want the same record and one round trip answers them all. See
 * [ui-mirror](../shared/ui-mirror.ts) for why it is a mirror rather than the snapshot it was.
 */
const mirror = createUiMirror();

/** Resolves once main's record has been folded into `mirror`; null where there is no host. */
let seeding: Promise<void> | null | undefined;
function seed(): Promise<void> | null {
  if (seeding !== undefined) return seeding;
  const asked = api()?.ui.all();
  seeding = asked
    ? asked.then((all) => mirror.seed(all)).catch(() => {
        /* no host, or it declined — localStorage is what we have */
      })
    : null;
  return seeding;
}

/**
 * The same thing for a **record** of settings — a filter bar, a set of bounds.
 *
 * The stored value is folded over the current defaults, because a record written last week can be
 * missing a field added since, and a filter object arriving with `undefined` where a mode should be
 * is a filter that quietly matches nothing. Three panels needed this rule and the third was the point
 * at which writing it out again would have been writing it differently.
 *
 * `defaults` must be a stable reference (a module constant), which is what it is at every call site.
 */

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
export function usePersistentShape<T extends object>(
  key: string,
  defaults: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [held, setHeld] = usePersistentState<T>(key, defaults);
  const folded = useMemo(() => ({ ...defaults, ...held }), [defaults, held]);
  // The updater form has to see the **folded** value, not the raw stored one: `set(f => ({...f, mob}))`
  // over a record written before a field existed would spread the gap straight back in, which is the
  // one failure this hook exists to prevent.
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => setHeld((stored) => (typeof next === "function" ? (next as (prev: T) => T)({ ...defaults, ...stored }) : next)),
    [defaults, setHeld],
  );
  return [folded, set];
}

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

  /**
   * Whether `value` is a setting **somebody chose**, rather than the default nobody has touched.
   *
   * Only a chosen value is written, and this is not a nicety — publishing defaults destroyed real
   * data. Main's copy is the authority for every origin, so the first window to mount a hook it had
   * no stored value for wrote its `initial` into main as though it were a decision; from then on that
   * default outranked the genuine value the *other* origin was holding in `localStorage`, overwrote
   * it there too, and the setting was gone for good.
   *
   * Seen in the write log for the Items tab's weight sheet: `{"int":2,"wis":1}` → `{}` → `{}`, then
   * `{"wis":50,"int":100,"mana":1}` → `{}`. Two sheets typed and thrown away by a default with a
   * louder voice than either of them.
   *
   * A ref rather than state: it must not itself cause a render, and the value change that follows it
   * is what re-runs the effect anyway.
   */
  const chosen = useRef(false);

  useEffect(() => {
    let live = true;
    // Already known to this window — written by us, or seeded from main earlier. Newest by
    // construction, and synchronous, so a remount neither flashes nor reverts.
    if (mirror.has(key)) {
      setValue(mirror.get(key) as T);
      chosen.current = true;
      setLoaded(true);
      return;
    }
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
    if (held !== undefined) {
      setValue(held);
      // A value in `localStorage` is a real one, and mirroring it up is how main is seeded on the
      // first run of the build that introduced it (ADR 0166).
      chosen.current = true;
    }

    const seeded = seed();
    if (!seeded) {
      setLoaded(true);
      return;
    }
    void seeded.finally(() => {
      if (!live) return;
      // Absent from main means "this build has never written it" — the local copy stands and the
      // persist effect below mirrors it up. Present means main is the authority, whatever origin
      // this window happens to be served from.
      const fromStore = mirror.get(key);
      const inherited = legacy ? mirror.get(legacy.key) : undefined;
      if (fromStore !== undefined) {
        setValue(fromStore as T);
        chosen.current = true;
      } else if (legacy && inherited !== undefined) {
        setValue(legacy.migrate(inherited));
        chosen.current = true;
      }
      setLoaded(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `legacy` is a literal; the key is the identity
  }, [key]);

  useEffect(() => {
    // Nothing chosen, nothing to say. A window that has never held this setting stays silent rather
    // than announcing its default as the answer — see `chosen`.
    if (!loaded || !chosen.current) return;
    // The mirror first and synchronously: it is what a remount reads, and it must be current even if
    // the IPC below is still in flight or fails outright.
    mirror.remember(key, value);
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

  /**
   * Setting a value is choosing one — including choosing to clear it back to the default, which is a
   * decision and is stored as one.
   */
  const choose = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    chosen.current = true;
    setValue(next);
  }, []);

  return [value, choose];
}
