/**
 * localStorage keys for persisted UI state, in one place so they're documented as a
 * set and can't silently collide or drift between the components that read/write them.
 * Values persist per window (see `usePersistentState`).
 */
export const STORAGE_KEYS = {
  /** Main window: the active tab. */
  activeTab: "eqlist.main.tab",
  /** Main window: the Hunt tab's zone filter. */
  huntZone: "eqlist.main.huntZone",
  /** Main window: whether the Hunt tab groups by zone or by item. */
  huntGrouping: "eqlist.main.huntGrouping",
  /** Map window: dropped pins. */
  mapPins: "eqlist.map.pins",
  /** Map window: which set of maps to draw — bundled images, or a game maps folder. */
  mapSource: "eqlist.map.source",
  /** Map window: the viewed-zone override (blank = follow current zone). */
  mapZone: "eqlist.map.zone",
  /** Map window: which kinds of map label are hidden (see `poiKind`). */
  mapHiddenPoiKinds: "eqlist.map.hiddenPoiKinds",
  /**
   * Map window: which of a zone's labelled floors are shown (empty = all of them). A new key
   * rather than the old `map.layer`, which held a single number — a stored scalar would break the
   * moment this read it as a list, and "show every floor" is the right thing to fall back to.
   */
  mapLayers: "eqlist.map.layers",
  /** Map window: whether zoning in-game snaps the map back to your zone. */
  mapFollowZone: "eqlist.map.followZone",
  /** Map window: share-my-pins toggle. */
  mapSharePins: "eqlist.map.sharePins",
  /** Map window: the kills panel's visibility. */
  mapKillsOpen: "eqlist.map.killsOpen",
  /** Map window: the mob-knowledge panel's visibility. */
  mapMobsOpen: "eqlist.map.mobsOpen",
  /** Map window: share-my-kills toggle. */
  mapShareKills: "eqlist.map.shareKills",
  /** Map window: the travel panel's visibility. Which conveyances you have is a *setting*, not this. */
  mapTravelOpen: "eqlist.map.travelOpen",
  /** The 🧭 panel's survey strip — what the graph holds about this zone. Off by default: it answers
   *  “should I believe this?”, which is a question you ask now and then rather than on every trip. */
  mapTravelAudit: "eqlist.map.travelAudit",
  /**
   * Any resizable panel (`ResizablePanel`), by the id it was given: the height its reader dragged it
   * to, as a % of its window. Absent means "as the panel was designed" — a default is a real answer
   * rather than a missing one, so it is stored as nothing at all rather than as a number.
   *
   * A key per panel, not one record holding every panel: two open panels are two components, and two
   * writers of one key would each save its own stale copy of the other's height.
   */
  panelHeight: (id: string) => `eqlist.panel.${id}.h`,
} as const;
