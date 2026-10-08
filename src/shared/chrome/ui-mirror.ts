/**
 * ui-mirror.ts — a window's live view of the panel settings main is holding.
 *
 * `usePersistentState` writes every setting to two places: `localStorage`, and the main process
 * ([ADR 0166](../../specs/decisions/0166-a-panel-setting-belongs-to-the-app-not-to-an-origin.md)).
 * Main's copy is the authority, and asking for it is an IPC round trip — so a window asks **once**
 * and keeps the answer.
 *
 * The bug this module exists to make impossible is what "keeps the answer" was taken to mean. The
 * record was fetched at page load and held as a *snapshot*, and every mount of every hook re-applied
 * it:
 *
 * > Change a dropdown, switch tabs, switch back. The panel unmounts and remounts, the hook re-runs
 * > its load, and the load applies the record **as it was at launch** — silently reverting the
 * > change you just made. Every write worked perfectly; the read was answering from a photograph.
 *
 * So this is a mirror rather than a snapshot: **a write updates it**, and the seed that arrives from
 * main fills gaps rather than overwriting. Two consequences fall out, and both are the point:
 *
 * - A remount reads back what this window last wrote, which is by construction the newest value.
 * - It answers **synchronously**, so returning to a tab doesn't flash the defaults while an IPC call
 *   is in flight.
 *
 * Pure and storage-free: the hook owns the IPC and `localStorage`, this owns only "what do we
 * believe, and who said it most recently".
 */

export interface UiMirror {
  /** Do we already know a value for this key? */
  has(key: string): boolean;
  /** What we believe, or `undefined` for a key nothing has set. */
  get(key: string): unknown;
  /** Remember what this window just wrote. Beats anything a later seed brings for the same key. */
  remember(key: string, value: unknown): void;
  /**
   * Fold main's record in.
   *
   * **Gaps only.** A key this window has already written is newer than the answer to a request that
   * went out before the write did — a user quick enough to change a setting inside the first round
   * trip must not have it undone by the reply.
   */
  seed(record: Readonly<Record<string, unknown>>): void;
}

export function createUiMirror(): UiMirror {
  const held = new Map<string, unknown>();
  return {
    has: (key) => held.has(key),
    get: (key) => held.get(key),
    remember: (key, value) => {
      held.set(key, value);
    },
    seed(record) {
      for (const [key, value] of Object.entries(record)) {
        if (!held.has(key)) held.set(key, value);
      }
    },
  };
}
