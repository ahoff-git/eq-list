"use client";
import { useMemo, useState } from "react";
import SearchField from "@/app/components/SearchField";
import { parseDumpTable } from "@/shared/game-export-dumps";
import { textMatches } from "./DumpParts";

/**
 * Any dump without a reader of its own — spellbook, guild bank, recipes, whatever the client writes
 * next — shown as the table it is, so a new kind of dump is readable before it is understood.
 */
export default function DumpTableView({ text, columns, emptyText }: { text: string; columns?: readonly string[]; emptyText: string }) {
  const table = useMemo(() => parseDumpTable(text, columns), [text, columns]);
  const [query, setQuery] = useState("");
  if (!table.rows.length) return <p className="muted">{emptyText}</p>;
  const shown = table.rows.filter((r) => textMatches(query, ...r));
  return (
    <div className="dump-view">
      <div className="row wrap dump-toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Filter…" />
        <span className="muted small">{table.rows.length} rows</span>
      </div>
      <table className="dump-table">
        {table.header.length > 0 && (
          <thead>
            <tr>
              {table.header.map((h, n) => (
                <th key={n}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {shown.map((r, n) => (
            <tr key={n}>
              {r.map((c, m) => (
                <td key={m}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
