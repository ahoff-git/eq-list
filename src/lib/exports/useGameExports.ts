"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWatcherStatus } from "@/lib/hooks";
import { exportCommandFor, lastExportedAt, type GameExportTimes } from "@/shared/game-exports";
import { heldGrades, inventoryTotals, ownedItems, parseInventoryDump, type InventoryItem, type OwnedPlace } from "@/shared/game-export-dumps";
import { holdingsOf, type Holdings } from "@/shared/tradeskills/held-materials";
import { rowsOf, usePeerShare } from "@/lib/peers/usePeerShare";
import type { InventoryShareRow } from "@/shared/peers/peer-share";
import { normalizeItemName } from "@/shared/items/grouping";
import type { GameExportDump } from "@/shared/types";

/**
 * Often enough that a dump taken while the tab is open shows up within a beat of alt-tabbing back
 * (focus refreshes too), rarely enough that a `readdir` of the game folder costs nothing.
 */
const REFRESH_MS = 30_000;

/** How long an unanswered inventory ask waits before it's repeated (`useHoldings`). */
const REASK_MS = 2 * 60_000;

/**
 * When each of the followed character's dumps was last written, and `now` as of that read — the two
 * are fetched together so an age is always measured against the clock that read it.
 */
export function useExportTimes(): { times: GameExportTimes; now: number; logFile?: string } {
  const status = useWatcherStatus();
  const [state, setState] = useState<{ times: GameExportTimes; now: number }>(() => ({ times: {}, now: Date.now() }));

  const refresh = useCallback(async () => {
    const times = (await api()?.log.exports()) ?? {};
    setState({ times, now: Date.now() });
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    // Typing the command means being in the game, so coming back to this window is the moment a new
    // dump is most likely to have appeared.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, status.file]);

  return { ...state, logFile: status.file };
}

/**
 * The newest dump for one command. Re-read only when `writtenAt` moves — a new dump — so switching
 * views doesn't re-send tens of KB that haven't changed.
 */
export function useExportDump(fileType: string, writtenAt: number | undefined): GameExportDump | null | undefined {
  const [dump, setDump] = useState<GameExportDump | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setDump(undefined);
    void api()
      ?.log.exportRead(fileType)
      .then((d) => live && setDump(d));
    return () => {
      live = false;
    };
  }, [fileType, writtenAt]);
  return dump;
}

/** The followed character's newest inventory dump, parsed — or null when there's none. */
export function useInventory(): { items: InventoryItem[] | null; at?: number } {
  const { times } = useExportTimes();
  const cmd = exportCommandFor("inventory");
  const at = cmd ? lastExportedAt(cmd, times) : undefined;
  const dump = useExportDump("inventory", at);
  const items = useMemo(() => (dump ? parseInventoryDump(dump.text) : null), [dump]);
  return { items, at: dump?.writtenAt };
}

/** The best grade the followed character holds of each item, keyed by `normalizeItemName` — empty with no dump. */
export function useHeldGrades(): Map<string, number> {
  const { items } = useInventory();
  return useMemo(() => (items ? heldGrades(items, normalizeItemName) : new Map<string, number>()), [items]);
}

/**
 * What the followed character owns, keyed by `normalizeItemName` — or null when there's no dump to
 * read. `at` is when the game wrote it.
 */
export function useOwnedItems(): { owned: Map<string, OwnedPlace[]> | null; at?: number } {
  const { items, at } = useInventory();
  const owned = useMemo(() => (items ? ownedItems(items, normalizeItemName) : null), [items]);
  return { owned, at };
}

/**
 * What you and the peers who've shared their inventories hold, by item — for crossing a recipe or a
 * guide's materials with what's already to hand. Null when there's neither a dump nor a shared row.
 *
 * **Asks for them, too.** Inventory is a `live` kind, which nothing fetches unprompted (ADR 0309) — so
 * a view that uses holdings asks each peer offering one, once per revision of theirs: opening the
 * guide *is* the person asking. Only peers who switched sharing on are offering anything to ask for.
 */
export function useHoldings(): Holdings | null {
  const { items } = useInventory();
  const { peers, received, ask } = usePeerShare();
  // When each (peer, revision) was last asked for. A reply can be lost on the way, and peers re-announce
  // every minute (which re-runs this), so an unanswered ask is repeated after `REASK_MS`, not never.
  const asked = useRef(new Map<string, number>());
  useEffect(() => {
    const now = Date.now();
    for (const peer of peers) {
      const offered = peer.offer?.inventory;
      if (!offered?.n || !peer.sessionId) continue;
      const have = received.find((r) => r.peerId === peer.peerId && r.kind === "inventory");
      const key = `${peer.peerId}@${offered.rev}`;
      const last = asked.current.get(key);
      if ((have && have.rev >= offered.rev) || (last !== undefined && now - last < REASK_MS)) continue;
      asked.current.set(key, now);
      ask(peer.peerId, "inventory");
    }
  }, [peers, received, ask]);
  return useMemo(() => {
    const peers = rowsOf<InventoryShareRow>(received, "inventory").map((r) => ({ by: r.by, item: r.row.item, count: r.row.count }));
    if (!items && !peers.length) return null;
    return holdingsOf(items ? inventoryTotals(items) : [], peers);
  }, [items, received]);
}
