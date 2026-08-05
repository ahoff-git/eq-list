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
  /** Map window: always-on-top. */
  mapPinned: "eqlist.map.pinned",
  /** Map window: share-my-pins toggle. */
  mapSharePins: "eqlist.map.sharePins",
  /** Map window: the kills panel's visibility. */
  mapKillsOpen: "eqlist.map.killsOpen",
  /** Map window: the mob-knowledge panel's visibility. */
  mapMobsOpen: "eqlist.map.mobsOpen",
  /** Map window: share-my-kills toggle. */
  mapShareKills: "eqlist.map.shareKills",
  /** Map window: route mode — click the map for a suggested walking route (off by default). */
  mapRouting: "eqlist.map.routing",
} as const;
