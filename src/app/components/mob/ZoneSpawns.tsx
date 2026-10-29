"use client";
import { useMemo } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useZoneMobs } from "@/lib/hooks";
import ItemLink from "@/app/components/items/ItemLink";
import MapLink, { RoamLink } from "@/app/components/map/MapLink";
import { ACTION_COL, GRID_DEFAULTS, GRID_SX, NUM_COL, PAGE_SIZE_OPTIONS } from "@/app/components/dataGridDefaults";
import { notAnItem } from "@/shared/shown-name";
import { spawnTopLevel, zoneSpawns, type ZoneSpawn } from "@/shared/zones/zone-spawns";

/** Rows on the first page: "some of the known spawns" — every named on most rosters, then the busiest camps. */
const FIRST_PAGE = 10;

/**
 * A zone page's top half (ADR 0351): a button that opens the zone on the map, then its known spawns —
 * the wiki page's NPC roster joined with what killing things there taught us (`zoneSpawns`). They
 * open in that order (named mobs, then the most killed), and every column sorts (ADR 0230). Each name
 * opens its page; a placed one's coordinate opens the map there.
 */
export default function ZoneSpawns({ zone, npcs }: { zone: string; npcs: readonly { name: string; level: string }[] }) {
  const { known } = useZoneMobs(zone);
  const spawns = useMemo(() => zoneSpawns(npcs, known), [npcs, known]);
  const killed = spawns.filter((s) => s.kills > 0).length;

  const columns = useMemo<GridColDef<ZoneSpawn>[]>(
    () => [
      {
        field: "name",
        headerName: "Mob",
        flex: 2,
        minWidth: 200,
        renderCell: ({ row: s }) => (
          <>
            <ItemLink title={notAnItem(s.name)} />
            {s.named && <span className="bis-tag">named</span>}
            {!s.onRoster && (
              <span className="muted small" title="Killed here, but the zone’s wiki page doesn’t list it">
                {" "}
                · not on the wiki’s list
              </span>
            )}
          </>
        ),
      },
      {
        field: "level",
        headerName: "Level",
        ...NUM_COL,
        width: 80,
        valueGetter: (_v, s) => spawnTopLevel(s),
        renderCell: ({ row: s }) => <span className="muted">{s.level ?? ""}</span>,
      },
      {
        field: "kills",
        headerName: "Killed",
        description: "Kills here, yours and sharing peers’ — yours on hover",
        ...NUM_COL,
        width: 80,
        renderCell: ({ row: s }) => (s.kills ? <span title={`${s.myKills} of them yours`}>{s.kills}</span> : ""),
      },
      {
        field: "area",
        headerName: "Where",
        ...ACTION_COL,
        width: 150,
        renderCell: ({ row: s }) => (s.area ? <RoamLink zone={zone} area={s.area} mob={s.name} /> : null),
      },
    ],
    [zone],
  );

  return (
    <div className="zone-spawns">
      <MapLink as="button" target={{ zone }}>
        🗺 Open {zone} on the map
      </MapLink>
      {spawns.length > 0 && (
        <>
          <h4 className="muted small">
            Known spawns · {spawns.length}
            {killed > 0 && ` · ${killed} killed here`}
          </h4>
          <DataGrid
            {...GRID_DEFAULTS}
            sx={GRID_SX}
            rows={spawns}
            getRowId={(s) => s.name}
            columns={columns}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            initialState={{ pagination: { paginationModel: { pageSize: FIRST_PAGE, page: 0 } } }}
          />
        </>
      )}
    </div>
  );
}
