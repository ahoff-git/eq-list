"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWatcherStatus } from "@/lib/hooks";
import { exportCommandFor, lastExportedAt, type GameExportTimes } from "@/shared/game-exports";
import { heldGrades, inventoryTotals, ownedItems, parseInventoryDump, type InventoryItem, type OwnedPlace } from "@/shared/game-export-dumps";
import { holdingsOf, type Holdings } from "@/shared/tradeskills/held-materials";
import { offeredCount, rowsOf, shortId, usePeerShare, type PeerShareView } from "@/lib/peers/usePeerShare";
import type { InventoryShareRow } from "@/shared/peers/peer-share";
import type { StatsRecord as StatsShare } from "@/shared/items/stats-record";
import { inventoryAsksDue } from "@/shared/peers/inventory-asks";
import { peerInventoryItems } from "@/shared/peers/peer-inventory";
import { normalizeItemName } from "@/shared/items/grouping";
import { peerHoldersOf, type PeerHolder } from "@/shared/items/ownership-notes";
import type { GameExportDump } from "@/shared/types";

/**
 * Often enough that a dump taken while the tab is open shows up within a beat of alt-tabbing back
 * (focus refreshes too), rarely enough that a `readdir` of the game folder costs nothing.
 */
const REFRESH_MS = 30_000;


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

/**
 * The followed character's newest inventory dump, parsed — or null when there's none. `carried` names the
 * sections it left out and filled from an older dump, with that dump's date; `now` is the clock the read
 * was made against, so an age shown beside it can't disagree with how old the dump was when it was read.
 */
export function useInventory(): {
  items: InventoryItem[] | null;
  at?: number;
  carried?: GameExportDump["carried"];
  now: number;
  /** False until the first read has answered — so "no dump" isn't claimed of one that hasn't been read yet. */
  read: boolean;
} {
  const { times, now } = useExportTimes();
  const cmd = exportCommandFor("inventory");
  const at = cmd ? lastExportedAt(cmd, times) : undefined;
  const dump = useExportDump("inventory", at);
  // With any section the dump left out carried from an older one, marked `asOf` (`readInventory`).
  const items = useMemo(() => (dump ? [...parseInventoryDump(dump.text), ...(dump.carriedItems ?? [])] : null), [dump]);
  return { items, at: dump?.writtenAt, carried: dump?.carried, now, read: dump !== undefined };
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
 * The peer share, having asked each peer offering an inventory for it. Inventory is a `live` kind,
 * which nothing fetches unprompted (ADR 0309) — so a view that uses one asks each peer offering it,
 * once per revision of theirs — and again if the tray drops the answer or none comes
 * (`inventoryAsksDue`): opening the view *is* the person asking. Only peers who switched sharing on
 * are offering anything to ask for.
 */
function useAskedInventories(): PeerShareView {
  const share = usePeerShare();
  const { peers, received, ask } = share;
  // When each (peer, revision) was last asked for — the rules are `inventoryAsksDue`'s.
  const asked = useRef(new Map<string, number>());
  useEffect(() => {
    for (const peerId of inventoryAsksDue(peers, received, asked.current, Date.now())) ask(peerId, "inventory");
  }, [peers, received, ask]);
  return share;
}

/**
 * What you and the peers who've shared their inventories hold, by item — for crossing a recipe or a
 * guide's materials with what's already to hand. Null when there's neither a dump nor a shared row.
 * Asks for them, too (`useAskedInventories`).
 */
export function useHoldings(): Holdings | null {
  const { items } = useInventory();
  const { received } = useAskedInventories();
  return useMemo(() => {
    const peers = rowsOf<InventoryShareRow>(received, "inventory").map((r) => ({ by: r.by, item: r.row.item, count: r.row.count }));
    if (!items && !peers.length) return null;
    return holdingsOf(items ? inventoryTotals(items) : [], peers);
  }, [items, received]);
}

/**
 * Which sharing peers hold an item, for its page (`peerHoldersOf`), and how many peers' inventories
 * it was looked for in — so "none of them" can be told from "nobody has shared". Asks for them, too
 * (`useAskedInventories`): opening an item's page is asking who has it.
 */
export function usePeersHolding(name: string): { holders: PeerHolder[]; sharing: number } {
  const { received } = useAskedInventories();
  const rows = useMemo(() => rowsOf<InventoryShareRow>(received, "inventory"), [received]);
  return useMemo(
    () => ({ holders: peerHoldersOf(rows, name), sharing: new Set(rows.map((r) => r.peerId)).size }),
    [rows, name],
  );
}

/** One person sharing their stats with you: who, and what the game showed them — what planning as them is measured by. */
export interface PeerStats {
  name: string;
  record: StatsShare;
  /** When their screen was read, ms. */
  at: number;
}

/**
 * Everyone sharing their stats with you (the **Character stats** kind, on unless switched off — [ADR 0372](../../../specs/decisions/0372-character-stats-are-shared-by-default.md)), by name — asked for the way
 * inventories are (`inventoryAsksDue`, `kind` "stats"), since a live kind nothing fetches unprompted. Only what has
 * arrived: a peer offering one is not listed until it does ([ADR 0371](../../../specs/decisions/0371-a-stats-record-is-kept-and-shared.md)).
 */
export function usePeerStats(): PeerStats[] {
  const { peers, received, ask } = usePeerShare();
  const asked = useRef(new Map<string, number>());
  useEffect(() => {
    for (const peerId of inventoryAsksDue(peers, received, asked.current, Date.now(), undefined, "stats")) ask(peerId, "stats");
  }, [peers, received, ask]);
  return useMemo(() => {
    const out: PeerStats[] = [];
    for (const r of received) {
      if (r.kind !== "stats") continue;
      const [row] = rowsOf<StatsShare>([r], "stats").map((x) => x.row);
      if (row) out.push({ name: r.from || shortId(r.peerId), record: row, at: Date.parse(row.asOf) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [received]);
}

/** One person sharing their inventory with you: who, and what it reads as — null until it arrives. */
export interface PeerInventory {
  name: string;
  items: InventoryItem[] | null;
  /** When the game wrote the dump it comes from, ms. */
  at?: number;
}

/**
 * Everyone sharing their inventory with you, by name, each read back into the items their own dump
 * holds (`peerInventoryItems`) — what the loadout builder plans someone else's gear from. A peer
 * offering one is listed before it arrives, with `items` null. Asks for them (`useAskedInventories`).
 */
export function usePeerInventories(): PeerInventory[] {
  const { peers, received } = useAskedInventories();
  // Read back only when an answer lands — peers re-announce every minute, and each new array of
  // items would re-run the loadout solve for nothing.
  const arrived = useMemo(() => {
    const byPeer = new Map<string, PeerInventory>();
    for (const r of received) {
      if (r.kind !== "inventory") continue;
      const rows = rowsOf<InventoryShareRow>([r], "inventory").map((x) => x.row);
      const at = Math.max(0, ...rows.map((x) => Date.parse(x.asOf)).filter(Number.isFinite));
      byPeer.set(r.peerId, { name: r.from || shortId(r.peerId), items: peerInventoryItems(rows), ...(at ? { at } : {}) });
    }
    return byPeer;
  }, [received]);
  return useMemo(() => {
    const byPeer = new Map(arrived);
    for (const p of peers) {
      if (!byPeer.has(p.peerId) && offeredCount(p, "inventory") > 0) byPeer.set(p.peerId, { name: p.name || shortId(p.peerId), items: null });
    }
    return [...byPeer.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [peers, arrived]);
}
