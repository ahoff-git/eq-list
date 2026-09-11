/**
 * faction-corrections.ts — the player's own stated faction totals, kept beside (not inside)
 * `faction-log.ts`.
 *
 * A small, own-file store for the same reason `xp-progress.ts` is one: it changes for a completely
 * different reason (a player statement) than the ledger it corrects (log lines), and it's persisted
 * so a correction survives a restart the way the ledger it adjusts does. See
 * `src/shared/faction-correction.ts` for what a correction actually does to a standing, and why it's
 * kept as an offset rather than a replacement.
 *
 * Deliberately not folded into `faction-log.ts` itself: that store is a pinned black box (a faction
 * hit is keyed by its log line, and every scalar field on it *is* that key — see its own
 * `admin: editable: []`), and a correction is not a hit at all, so it has no business inside it.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import type { FactionCorrection, ForgetScope } from "../src/shared/types";
import { createSaver, readJson } from "./json-store";

const log = createLogger("faction-corrections");

/** A correction is typed in rarely, not in a burst like a hit; still coalesced for the same reason
 *  every other small store here is. */
const WRITE_DEBOUNCE_MS = 3000;

export interface FactionCorrections {
  /** Every faction the player has stated a total for, keyed by faction name. */
  all(): Record<string, FactionCorrection>;
  /**
   * The player states faction `faction`'s real current total is `statedNet`; `observedNet` is the
   * ledger's own net for it right now, so the difference is what's carried forward as new hits land.
   */
  set(faction: string, statedNet: number, observedNet: number, at?: string): FactionCorrection;
  /**
   * Forget every stated correction. Unlike the ledger's own `clear`, there is no "records" half to
   * keep here — a correction is entirely the player's own statement, nothing folded from hits — so
   * `"records"` leaves it alone and only the explicit `"everything"` wipes it, the same rule a
   * retired standing gets (ADR 0056).
   */
  clear(scope?: ForgetScope): void;
  flush(): void;
}

export function createFactionCorrections(
  userDataDir: string,
  nowIso: () => string = () => new Date().toISOString(),
): FactionCorrections {
  const file = path.join(userDataDir, "faction-corrections.json");
  let corrections: Record<string, FactionCorrection> = read();
  const saver = createSaver(file, "faction corrections", () => corrections, WRITE_DEBOUNCE_MS);

  function read(): Record<string, FactionCorrection> {
    // Absent, unreadable, or not an object is "nothing stated yet" — a correction is a nicety on
    // top of the ledger, never a hard dependency.
    const parsed = readJson<unknown>(file, {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, FactionCorrection>) : {};
  }

  return {
    all: () => corrections,

    set(faction, statedNet, observedNet, at = nowIso()) {
      const correction: FactionCorrection = { offset: statedNet - observedNet, statedAt: at };
      corrections = { ...corrections, [faction]: correction };
      log.debug("faction stated by player", { faction, statedNet, observedNet });
      saver.save();
      return correction;
    },

    clear(scope = "records") {
      if (scope !== "everything") return;
      corrections = {};
      saver.flush();
      log.debug("cleared", { scope });
    },

    flush() {
      saver.flush();
    },
  };
}
