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
  /** Map window: which layer of a multi-layer zone is being viewed (null = its first). */
  mapLayer: "eqlist.map.layer",
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
} as const;
