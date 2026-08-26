"use client";
import type { PoiGroupSummary, PoiKind } from "@/shared/map/poi-kinds";
import { HUNT_PIN, PIN_TYPES, type PinKind } from "@/shared/map/pins";
import { CheckField } from "./ui";
import type { MapFloor, ZBand } from "@/shared/map/eqmap";

/** A hand-set height window, in EQ `/loc` z — what a map with no labelled storeys gets instead. */
export interface HeightPick {
  lo: number;
  hi: number;
}

/**
 * The map's 👁 panel: what's drawn and what isn't.
 *
 * Five questions, in the order you'd ask them — **which heights**, **which of my pins**, **the
 * hunt's own**, **which of the map's own labels**, **whose shared pins** — each its own section,
 * because a busy dungeon needs them all and a flat list of twenty-odd checkboxes is unreadable.
 *
 * The label section is **grouped** (`POI_GROUPS`): the thing you usually want is a whole group off
 * ("hide the dungeon furniture", "just show me who's here"), so each heading is itself a toggle,
 * with the individual kinds under it for when you want one back.
 *
 * Presentational on purpose — every choice is owned by the map window, so this can't drift out of
 * step with what's on the canvas.
 */
export default function MapFilters({
  floors,
  shownLayers,
  onLayers,
  yourFloor,
  zRange,
  height,
  onHeight,
  hiddenPinKinds,
  onPinKind,
  huntPins,
  showHuntPins,
  onHuntPins,
  poiGroups,
  hiddenPoiKinds,
  onPoiKinds,
  sharers,
  hiddenSharers,
  onSharer,
  zone,
  onClearPins,
}: {
  /** The storeys this map's author labelled, highest first (empty = they labelled none). */
  floors: MapFloor[];
  /** Which of them are drawn. Always non-empty: hiding every floor would just blank the map. */
  shownLayers: number[];
  onLayers: (layers: number[]) => void;
  /** The floor your `/loc` height puts you on, marked rather than acted on (ADR 0040). */
  yourFloor?: MapFloor;
  /** The height span this map covers — the scale a hand-set window is chosen within. */
  zRange?: ZBand;
  /** The hand-set window, or null for the whole span. Only offered when there are no floors. */
  height: HeightPick | null;
  onHeight: (pick: HeightPick | null) => void;
  hiddenPinKinds: ReadonlySet<PinKind>;
  onPinKind: (kind: PinKind, visible: boolean) => void;
  /** How many of the hunt's mobs this zone can place — the row says so, since zero explains itself. */
  huntPins: number;
  showHuntPins: boolean;
  onHuntPins: (show: boolean) => void;
  /** The label kinds this map actually has, in sections (see `poiGroupSummary`). */
  poiGroups: PoiGroupSummary[];
  hiddenPoiKinds: ReadonlySet<PoiKind>;
  /** Several at once, so a group heading is one action rather than one per kind. */
  onPoiKinds: (kinds: PoiKind[], visible: boolean) => void;
  /** People currently sharing pins — one toggle each. */
  sharers: string[];
  hiddenSharers: ReadonlySet<string>;
  onSharer: (name: string, visible: boolean) => void;
  zone?: string;
  onClearPins: () => void;
}) {
  const step = zRange ? heightStep(zRange) : 1;
  // Rounded outwards to the step, so the handles reach past the highest and lowest geometry
  // instead of clipping a unit off the map at either end.
  const lowest = zRange ? Math.floor(zRange.minZ / step) * step : 0;
  const highest = zRange ? Math.ceil(zRange.maxZ / step) * step : 0;
  const lo = height?.lo ?? lowest;
  const hi = height?.hi ?? highest;
  const wholeSpan = lo <= lowest && hi >= highest;

  /** Move one handle, keeping it on its own side of the other. */
  const setHeight = (next: Partial<HeightPick>) => {
    const pick = { lo, hi, ...next };
    onHeight(pick.lo <= lowest && pick.hi >= highest ? null : { lo: Math.min(pick.lo, pick.hi), hi: Math.max(pick.lo, pick.hi) });
  };

  const allLayers = floors.map((f) => f.layer);

  return (
    <div className="map-filters no-drag">
      {floors.length > 1 && (
        <section>
          <header>
            <span className="muted small">Floors</span>
            <button
              className="btn ghost sm"
              disabled={shownLayers.length === floors.length}
              onClick={() => onLayers(allLayers)}
            >
              all
            </button>
          </header>
          {floors.map((f) => (
            <CheckField
              key={f.layer}
              checked={shownLayers.includes(f.layer)}
              onChange={(on) => onLayers(toggle(shownLayers, f.layer, on, allLayers))}
              title="The map file holds every floor at once, as the game draws it. Pins and pings you make belong to the floor you made them on — which needs exactly one floor in view."
              label={
                <>
                  {f.label}
                  {yourFloor?.layer === f.layer && <span className="muted small">· you</span>}
                </>
              }
            />
          ))}
        </section>
      )}

      {/* No labelled storeys: height is all the map can honestly offer, so it offers height —
          a window on the zone's own z span. Never a guess at where the floors are (ADR 0040). */}
      {floors.length <= 1 && zRange && highest > lowest && (
        <section>
          <header>
            <span className="muted small">Height</span>
            <span className="muted small">{wholeSpan ? "all" : `${lo} … ${hi}`}</span>
            <button className="btn ghost sm" disabled={wholeSpan} onClick={() => onHeight(null)}>
              all
            </button>
          </header>
          <label className="row height-row" title="Draw only what stands between these heights. This map's author labelled no storeys, so these are raw /loc heights — the zone's own, from its geometry.">
            <span className="muted small">from</span>
            <input
              type="range"
              min={lowest}
              max={highest}
              step={step}
              value={lo}
              onChange={(e) => setHeight({ lo: Number(e.target.value) })}
            />
          </label>
          <label className="row height-row">
            <span className="muted small">to</span>
            <input
              type="range"
              min={lowest}
              max={highest}
              step={step}
              value={hi}
              onChange={(e) => setHeight({ hi: Number(e.target.value) })}
            />
          </label>
        </section>
      )}

      <section>
        <header>
          <span className="muted small">My pins</span>
        </header>
        {PIN_TYPES.map((t) => (
          <CheckField
            key={t.key}
            checked={!hiddenPinKinds.has(t.key)}
            onChange={(visible) => onPinKind(t.key, visible)}
            label={
              <>
                <span style={{ color: t.color }}>{t.glyph}</span> {t.label}
              </>
            }
          />
        ))}
      </section>

      {/* The one set of markers the map places by itself, so it gets a switch of its own rather than
          a sixth row under "My pins" — nothing here was dropped by you, and none of it can be. */}
      <section>
        <header>
          <span className="muted small">Hunt</span>
          <span className="muted small">{huntPins}</span>
        </header>
        <CheckField
          checked={showHuntPins}
          onChange={onHuntPins}
          title="Mark the mobs on your hunt wherever anything can place them: your own kills, kills pooled with peers', or the coordinate the wiki states. A measured position is an average of where the mob died rather than a spawn point, and its ring shows how rough that is; a stated one is dashed, because nobody measured it. Each mark says which in its hover."
          label={
            <>
              <span style={{ color: HUNT_PIN.color }}>{HUNT_PIN.glyph}</span> Where your hunt&apos;s mobs live
            </>
          }
        />
      </section>

      {poiGroups.map((group) => {
        const kinds = group.kinds.map((k) => k.kind);
        const shown = kinds.filter((k) => !hiddenPoiKinds.has(k));
        return (
          <section key={group.group}>
            <header>
              <CheckField
                checked={shown.length > 0}
                // Half the group off reads as "on" and switches the rest off, which is the
                // gesture you meant: one click clears the section.
                indeterminate={shown.length > 0 && shown.length < kinds.length}
                onChange={() => onPoiKinds(kinds, shown.length === 0)}
                label={<span className="group-name">{group.label}</span>}
              />
              <span className="muted small">{group.count}</span>
            </header>
            {group.kinds.map((k) => (
              <CheckField
                key={k.kind}
                className="indent"
                checked={!hiddenPoiKinds.has(k.kind)}
                onChange={(visible) => onPoiKinds([k.kind], visible)}
                title={k.hint}
                label={
                  <>
                    {/* The color these wear on *this* map — how you recognise them on screen. */}
                    <span className="poi-dot" style={{ background: k.color ?? "#8ba0bd" }} />
                    {k.label} <span className="muted small">{k.count}</span>
                  </>
                }
              />
            ))}
          </section>
        );
      })}

      {sharers.length > 0 && (
        <section>
          <header>
            <span className="muted small">Shared by</span>
          </header>
          {sharers.map((name) => (
            <CheckField
              key={name}
              checked={!hiddenSharers.has(name)}
              onChange={(visible) => onSharer(name, visible)}
              label={name}
            />
          ))}
        </section>
      )}

      <button className="btn ghost sm" onClick={onClearPins} disabled={!zone}>
        Clear pins in {zone ?? "zone"}
      </button>
    </div>
  );
}

/**
 * Add or remove one floor. Turning the last one off would leave a blank map, so it falls back to
 * showing them all — the same answer as travelling to a zone that doesn't have the floor you'd
 * picked, and the boxes tick back on to say so.
 */
function toggle(shown: number[], layer: number, visible: boolean, all: number[]): number[] {
  const next = visible ? [...shown, layer] : shown.filter((l) => l !== layer);
  return next.length ? next : all;
}

/**
 * A useful nudge for the height handles: ~50 steps across the zone, rounded to something a person
 * would pick, so dragging feels like choosing a level rather than tuning a number.
 */
function heightStep(range: ZBand): number {
  const span = Math.max(1, range.maxZ - range.minZ);
  const magnitude = Math.pow(10, Math.floor(Math.log10(span / 50)));
  return Math.max(1, Math.round(span / 50 / magnitude) * magnitude);
}
