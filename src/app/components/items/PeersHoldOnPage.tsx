"use client";
import { usePeersHolding } from "@/lib/exports/useGameExports";
import { peerHolderText } from "@/shared/items/ownership-notes";
import { exportAgeText } from "@/shared/game-exports";

/**
 * An item page's "who else has it": each peer sharing their inventory who holds the item, with how
 * many, most first (ADR 0354). Under your own count (`HeldOnPage`), so "I have 6, BunnySlayer has 8"
 * reads in one place. Opening the page asks sharing peers for their inventories. With nobody sharing,
 * nothing; with sharers who don't hold it, says so.
 */
export default function PeersHoldOnPage({ title }: { title: string }) {
  const { holders, sharing } = usePeersHolding(title);
  if (!sharing) return null;
  if (!holders.length) {
    return (
      <div className="held-on-page small muted">
        Peers: none of the {sharing} sharing {sharing === 1 ? "inventory" : "inventories"} hold it
      </div>
    );
  }
  const now = Date.now();
  return (
    <div className="held-on-page small">
      Peers:{" "}
      {holders.map((h, i) => (
        <span key={h.by} title={`${h.where} — from their inventory export, written ${exportAgeText(now - Date.parse(h.asOf))}`}>
          {i > 0 && " · "}
          {peerHolderText(h)}
        </span>
      ))}
    </div>
  );
}
