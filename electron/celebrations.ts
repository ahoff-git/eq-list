/**
 * celebrations.ts — the one thing "share my watched-item wins" has to remember: the single most
 * recent tracked-item drop worth telling the room about.
 *
 * Deliberately the smallest state that works. [ADR 0287](../specs/decisions/0287-a-drop-is-celebrated-not-claimed.md)
 * settled a celebration as cosmetic and transient — never pooled, never persisted — so there is
 * nothing here for a restart to lose: in memory only, one row, gone once it's no longer recent.
 * `shareSources` (`src/shared/peers/peer-share-hub.ts`) reads `current()` the same way it already
 * reads `fight.current()` — a single optional row, not a list.
 */
import { randomUUID } from "node:crypto";
import { stale } from "../src/shared/alerts/cast-alerts";
import type { CelebrationRow } from "../src/shared/peers/peer-share";

/**
 * How long a celebration stays "current" once announced. Generous next to the catalogue's own 60s
 * re-measure tick and 30s per-peer ask cooldown (`peer-share-hub.ts`'s `OFFER_TICK_MS`/
 * `ASK_COOLDOWN_MS`), so a peer polling at the ordinary cadence still catches it — not only one who
 * happens to ask in the same instant it happened.
 */
const LIVE_WITHIN_MS = 3 * 60_000;

export interface CelebrationFeed {
  /**
   * A tracked item just dropped and the player opted in to share it. `at` is the loot line's own
   * timestamp, the same one `AlertRouter.loot` checks (`stale`, `src/shared/alerts/cast-alerts.ts`)
   * — everything logged while the app was shut is replayed through this same path (ADR 0044), and a
   * celebration for last night's drop would be exactly the lie about the present `stale` already
   * exists to catch.
   */
  announce(item: string, qty: number, at: string): void;
  /** The current celebration, or `undefined` once it's aged past `LIVE_WITHIN_MS`. */
  current(): CelebrationRow | undefined;
}

export function createCelebrationFeed(now: () => number = Date.now): CelebrationFeed {
  let last: CelebrationRow | undefined;

  return {
    announce(item, qty, at) {
      if (stale(at, now())) return;
      last = { id: randomUUID(), item, qty, at };
    },
    current() {
      if (!last) return undefined;
      return now() - Date.parse(last.at) > LIVE_WITHIN_MS ? undefined : last;
    },
  };
}
