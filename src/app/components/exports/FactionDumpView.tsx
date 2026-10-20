"use client";
import { useMemo, useState } from "react";
import SearchField from "@/app/components/SearchField";
import { segCls } from "@/app/components/ui";
import { factionConText, parseFactionDump, type FactionDumpRow } from "@/shared/game-export-dumps";
import { DumpBar, textMatches } from "./DumpParts";

type Sort = "standing" | "name";

const SORTS: Record<Sort, (a: FactionDumpRow, b: FactionDumpRow) => number> = {
  standing: (a, b) => b.standing - a.standing || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
};

/**
 * A faction dump: every standing the game holds for you, as the number and the `/con` word it
 * earns, with how far is left to max. This is the game's own figure, so unlike the Faction tab's
 * ledger it has no history behind it and no gaps in it.
 */
export default function FactionDumpView({ text }: { text: string }) {
  const rows = useMemo(() => parseFactionDump(text), [text]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("standing");
  const shown = rows.filter((r) => textMatches(query, r.name)).sort(SORTS[sort]);

  return (
    <div className="dump-view">
      <div className="row wrap dump-toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Find a faction…" />
        <div className="segmented">
          <button className={segCls(sort === "standing")} onClick={() => setSort("standing")}>Standing</button>
          <button className={segCls(sort === "name")} onClick={() => setSort("name")}>Name</button>
        </div>
        <span className="muted small">{rows.length} factions</span>
      </div>
      <table className="dump-table">
        <tbody>
          {shown.map((r) => {
            const max = r.standing + r.pointsToMax;
            return (
              <tr key={r.id || r.name}>
                <td>{r.name}</td>
                <td className="muted small">{factionConText(r.standing)}</td>
                <td className="num">{r.standing}</td>
                <td className="dump-bar-cell">
                  <DumpBar
                    fraction={max > 0 ? r.standing / max : 0}
                    title={r.pointsToMax > 0 ? `${r.pointsToMax} to max (${max})` : "At max"}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
