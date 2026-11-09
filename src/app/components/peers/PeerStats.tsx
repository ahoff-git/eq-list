"use client";
import { useMemo } from "react";
import { rowsOf } from "@/lib/peers/usePeerShare";
import { exportAgeText } from "@/shared/game-exports";
import { whoText, type StatsRecord } from "@/shared/items/stats-record";
import type { ReceivedShare } from "@/shared/types";

const num = (n: number) => Math.round(n).toLocaleString();

/**
 * What the people who shared their **Character stats** (off by default) say they have: their classes and level,
 * and the figures the game's own Inventory window showed them — HP, mana, AC — as of when they read it. Only what
 * you asked them for, and never a figure they weren't sure of.
 *
 * It is a roster, not a plan: the use is in the loadout builder, where "Loadout for" a person who shared both their
 * inventory and their stats plans their gear in their real numbers ([ADR 0371](../../../../specs/decisions/0371-a-stats-record-is-kept-and-shared.md)).
 */
export default function PeerStats({ received }: { received: ReceivedShare[] }) {
  const rows = useMemo(() => rowsOf<StatsRecord>(received, "stats"), [received]);
  if (!rows.length) return null;
  return (
    <section className="peers-block">
      <h3>Character stats</h3>
      <p className="muted small">
        What each person&apos;s last stats read said. To plan their gear in their real numbers: Items → Loadout builder → <i>Loadout for</i> them
        (they need to share their inventory as well).
      </p>
      <ul className="bis-list small">
        {rows.map(({ row, by, peerId }) => (
          <li key={peerId}>
            <b>{by}</b> — {whoText(row)}
            {row.race ? ` · ${row.race}` : ""} <span className="muted">· read {exportAgeText(Date.now() - Date.parse(row.asOf))}</span>
            <span className="muted">
              {" "}
              · {(["hp", "mana", "ac"] as const).filter((k) => row.figures[k] !== undefined).map((k) => `${k === "ac" ? "AC" : k === "hp" ? "HP" : "Mana"} ${num(row.figures[k]!)}`).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
