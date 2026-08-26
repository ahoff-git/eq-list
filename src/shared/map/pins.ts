/**
 * Map pins — user-placed markers on a zone map. A small fixed palette of pin kinds
 * (the map toolbar lets you "pick one up", then click the map to drop it). Pins are
 * persisted client-side (localStorage) and can be shared to peers over awari.
 * Pure/dependency-free so both the renderer and the room hook can share the shapes.
 */

export type PinKind = "star" | "danger" | "camp" | "loot" | "note";

export interface MapPin {
  id: string;
  kind: PinKind;
  /** Zone the pin belongs to (matched with `findZone`). */
  zone: string;
  /**
   * Which layer of a multi-layer zone it was dropped on (see `Zone.layer`). Unset means
   * the whole zone — an unlayered zone, or a pin we placed from data that doesn't know
   * the floor — and shows on every layer.
   */
  layer?: number;
  y: number;
  x: number;
  /** Short label drawn on the map under the pin. */
  title?: string;
  /** Free-text note shown when the pin is hovered. */
  note?: string;
  /** Who placed it — set on shared pins received from peers. */
  by?: string;
}

export interface PinType {
  key: PinKind;
  label: string;
  color: string;
  glyph: string;
}

/** The pin toolbar, in display order. */
export const PIN_TYPES: PinType[] = [
  { key: "star", label: "Star", color: "#f0b429", glyph: "★" },
  { key: "danger", label: "Danger", color: "#e5534b", glyph: "✖" },
  { key: "camp", label: "Camp", color: "#7fc4ff", glyph: "⚑" },
  { key: "loot", label: "Loot", color: "#8fe0a5", glyph: "◆" },
  { key: "note", label: "Note", color: "#c9a0ff", glyph: "✎" },
];

/** The pin type for a kind (falls back to the first entry for unknown kinds). */
export function pinType(kind: string): PinType {
  return PIN_TYPES.find((p) => p.key === kind) ?? PIN_TYPES[0];
}

/**
 * How a **hunt pin** is drawn — the one marker the map places for you, for a mob your list wants and
 * your kills can place (`hunt-pins.ts`).
 *
 * Not a `PinKind`, deliberately: those are a palette you pick a pin up from and drop, and this is
 * nothing you can hold, drop, drag or share. It only needs to look like itself, which is what a
 * type without a `key` says — a hollow ring rather than any of the solid glyphs above, so a mark the
 * app made reads at a glance as different from the five you made yourself.
 */
export const HUNT_PIN: Omit<PinType, "key"> = { label: "Hunt", color: "#ff8c42", glyph: "◎" };
