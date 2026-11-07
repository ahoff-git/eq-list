"use client";
import { useEffect, useMemo, useRef } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { GRID_DEFAULTS, GRID_SX_FIT, NUM_COL } from "@/app/components/dataGridDefaults";
import { DumpSection } from "@/app/components/exports/DumpParts";
import { segCls } from "@/app/components/ui";
import { useDamageTaken, type DamageTaken } from "@/lib/combat/useDamageTaken";
import { DAMAGE_WINDOWS, type DamageWindow } from "@/shared/combat/damage-window";
import { adviceOf, describeStrain, typeLabel } from "@/shared/combat/damage-taken-text";
import { MIN_HITS, RESIST_POINTS_PER_PERCENT, resistRows, type ResistRow } from "@/shared/combat/resist-worth";
import { percent } from "@/shared/format";
import type { LoadoutStats } from "@/shared/items/loadout-stats";
import { placeName } from "@/shared/zones/place";

/**
 * What the loadout builder is handed to show "damage taken": the window (owned above, so the status bar's
 * pill reads the same one) and how many times the pill has sent you here.
 */
export interface DamageControl {
  window: DamageWindow;
  onWindow: (next: DamageWindow) => void;
  focus?: number;
}

interface Row {
  id: string;
  label: string;
  share: number;
  hits: number;
  /** What your worn gear gives against it, as text — resist points, AC, or why there's no figure. */
  gear: string;
  /** Resist rows only: the estimated chance to fully resist, and what +30 points would cut. */
  resisted?: number;
  saved?: number;
  flagged: boolean;
  /** Why a row has no resist figures. */
  note?: string;
}

const NOTES: Record<string, string> = {
  melee: "Resists don't touch melee — AC and avoidance do.",
  other: "Untyped damage-over-time ticks and damage shields: the log gives no type to point a resist at.",
  void: "Void resist isn't read off items yet, so there is nothing here to raise.",
};

/** The melee row's gear cell: AC worn, and — when the builder's loadout reaches more — AC worn → reachable. */
function meleeGear(taken: DamageTaken, worn: LoadoutStats): string {
  if (taken.ac) return `AC ${taken.ac.wearing} → ${taken.ac.loadout}`;
  return `AC ${Math.round(taken.headroom?.ac.wearing ?? worn.ac ?? 0)}`;
}

/** The table's rows: every kind of damage that hit you, with the resist figures where a resist applies. */
function rowsOf(taken: DamageTaken, worn: LoadoutStats): Row[] {
  const resists = new Map<string, ResistRow>(resistRows(taken.profile, worn).map((r) => [r.type, r]));
  return taken.profile.types.map((t) => {
    const r = resists.get(t.type);
    const common = { id: t.type, label: typeLabel(t.type), share: t.share, hits: t.hits, note: NOTES[t.type] };
    if (!r) return { ...common, gear: t.type === "melee" ? meleeGear(taken, worn) : "—", flagged: t.type === "melee" && !!taken.ac };
    return { ...common, gear: r.stat ? `${r.points ?? 0}` : "not tracked", resisted: r.resisted, saved: r.saved, flagged: r.flagged };
  });
}

const COLUMNS: GridColDef<Row>[] = [
  {
    field: "label",
    headerName: "Damage",
    flex: 1,
    minWidth: 110,
    renderCell: (p) => <span title={p.row.note}>{p.row.flagged ? <b>🛡 {p.row.label}</b> : p.row.label}</span>,
  },
  {
    field: "share",
    headerName: "Taken",
    ...NUM_COL,
    flex: 1,
    renderCell: (p) => <span title={`${p.row.hits} landed hits`}>{percent(p.row.share)}</span>,
  },
  {
    field: "gear",
    headerName: "Gear",
    description: "What your worn gear gives against it: resist points, or AC for melee",
    ...NUM_COL,
    flex: 1,
    renderCell: (p) => <span title={p.row.note}>{p.row.gear}</span>,
  },
  {
    field: "resisted",
    headerName: "Resisted",
    description: "Estimated chance to fully resist a spell of this type, from your gear's resist points",
    ...NUM_COL,
    flex: 1,
    renderCell: (p) => (p.row.resisted === undefined ? <span className="muted">—</span> : <span>{percent(p.row.resisted, { places: 1 })}</span>),
  },
  {
    field: "saved",
    headerName: "+30 cuts",
    description: "What 30 more resist points would cut, as a share of everything that lands on you",
    ...NUM_COL,
    flex: 1,
    renderCell: (p) =>
      p.row.saved === undefined ? (
        <span className="muted" title={p.row.note}>
          —
        </span>
      ) : (
        <span className={p.row.flagged ? "good" : "muted"} title="Of everything that lands on you, by the wiki's rule">
          {percent(p.row.saved, { places: 1 })}
        </span>
      ),
  },
];

/** One line saying what the window holds — and, when it's too thin to advise on, how thin. */
function statusText(taken: DamageTaken): string {
  const { profile, enough, here, window, loading } = taken;
  if (loading && !profile.fights) return "Reading your fights…";
  if (!profile.fights) return window === "zone" ? `No fights recorded in ${here ? placeName(here) : "this zone"} since you arrived.` : "No fights recorded yet.";
  if (!profile.measured) return "Those fights were recorded before damage was broken down by type.";
  if (!enough) return `${profile.hits} landed hits so far — ${MIN_HITS} are needed before this says anything.`;
  return `${profile.fights} fights, ${profile.hits} landed hits: what got through to you, after the resists you already wear.`;
}

/**
 * The loadout builder's **Damage taken** section: what kind of damage has been landing on you over the
 * window you choose, what your worn gear gives against it, and which resist — if any — is worth raising
 * ([ADR 0361](../../../../specs/decisions/0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md)).
 *
 * Open by itself when something is worth a look, and opened (and scrolled to) when the status bar's
 * pill sends you here: `focus` is a counter of those sends, and a new one remounts the section open.
 *
 * Yours only — the log is yours and so is the worn gear, so it isn't offered while planning for a peer.
 */
export default function BisDamageTaken({
  window,
  onWindow,
  wearing,
  focus = 0,
}: DamageControl & {
  /** What your worn gear adds up to — the resist points the table compares against. */
  wearing: LoadoutStats;
}) {
  const taken = useDamageTaken(window);
  const rows = useMemo(() => rowsOf(taken, wearing), [taken, wearing]);
  const flagged = useMemo(() => resistRows(taken.profile, wearing).filter((r) => r.flagged), [taken.profile, wearing]);
  const advice = useMemo(() => adviceOf({ ac: taken.ac, resists: flagged, hp: taken.hp, mana: taken.mana, swing: taken.swing }, window), [taken, flagged, window]);
  const suggested = advice.length > 0;
  const aside = suggested
    ? `${advice[0].label} — worth a look`
    : !taken.strain.fights
      ? "no fights yet"
      : !taken.enough
        ? "not enough yet"
        : "nothing to change";

  const sectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) sectionRef.current?.scrollIntoView({ block: "start" });
  }, [focus]);

  return (
    <div ref={sectionRef}>
      {/* Keyed on both, so it remounts open when a suggestion first turns up (the fights and the AC figure
          arrive after the first render) or the pill sends you here — and stays as you left it otherwise. */}
      <DumpSection key={`${focus}|${suggested}`} title="Damage taken" aside={aside} defaultOpen={suggested || focus > 0}>
        <div className="row wrap bis-steer">
          <div className="segmented" role="group" aria-label="Fights to read">
            {DAMAGE_WINDOWS.map((w) => (
              <button key={w.key} className={segCls(window === w.key)} onClick={() => onWindow(w.key)} title={w.hint}>
                {w.label}
              </button>
            ))}
          </div>
          {window === "zone" && taken.here && <span className="muted small">{placeName(taken.here)}</span>}
        </div>
        <p className="muted small">{statusText(taken)}</p>
        {taken.strain.fights > 0 && <p className="muted small">{describeStrain(taken.strain)}</p>}
        {rows.length > 0 && <DataGrid {...GRID_DEFAULTS} sx={GRID_SX_FIT} columns={COLUMNS} rows={rows} autoHeight hideFooter />}
        {suggested && (
          <ul className="bis-list small">
            {advice.map((a) => (
              <li key={a.label}>{a.sentence}</li>
            ))}
          </ul>
        )}
        <p className="muted small">
          An estimate: by the wiki&apos;s rule every {RESIST_POINTS_PER_PERCENT} resist points give a 1% greater chance to fully resist a spell (from EQEmu, not
          confirmed for EQL). The attacker&apos;s level isn&apos;t in the log, so that part is left out; buffs and AA aren&apos;t counted in what your gear gives.
          Only damage that landed counts, so a type you already resist well reads smaller than it is.
        </p>
      </DumpSection>
    </div>
  );
}
