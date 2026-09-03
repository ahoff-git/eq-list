/**
 * localStorage keys for persisted UI state, in one place so they're documented as a
 * set and can't silently collide or drift between the components that read/write them.
 * Values persist per window (see `usePersistentState`).
 */
export const STORAGE_KEYS = {
  /**
   * Main window: where you are and how you got there — the whole trail (ADR 0173), not just the
   * screen showing. One key rather than two, because the tab is *part of* a place: a separately
   * stored "active tab" would be a second answer to where the window is, and back would be walking
   * a trail that the tab strip had already left.
   */
  nav: "eqlist.main.nav",
  /**
   * Main window: the active tab, before a tab became one place on a trail. Read once, as the first
   * place of a new trail, so an upgrade opens on the tab it was closed on.
   */
  activeTab: "eqlist.main.tab",
  /** Main window: the Hunt tab's zone filter. */
  huntZone: "eqlist.main.huntZone",
  /** Main window: whether the Hunt tab groups by zone or by item. */
  huntGrouping: "eqlist.main.huntGrouping",
  /**
   * Main window: the Items tab's three standing answers — what you're narrowing by, what a point of
   * each stat is worth to you, and which column the results are ordered by.
   *
   * All three persist, on the same reasoning as the Hunt tab's zone: this is a workbench you leave
   * and come back to, and a weight sheet in particular is a statement about your character that
   * shouldn't have to be retyped every session. Three keys rather than one record, because they are
   * edited by three different controls and a shared key means each writes its own stale copy of the
   * other two.
   */
  itemCriteria: "eqlist.main.itemCriteria.v2",
  /**
   * The same thing before "in era only" became the default.
   *
   * A key bump rather than a migration, because a stored `false` and a deliberate `false` are the
   * same three characters — there is nothing to read that tells them apart. What was stored is
   * carried across whole (nobody loses a zone list they spent a while ticking); only the era flag
   * comes over as the new default.
   */
  itemCriteriaV1: "eqlist.main.itemCriteria",
  itemWeights: "eqlist.main.itemWeights",
  itemSort: "eqlist.main.itemSort",
  /**
   * Main window: whether the weight sheet is open.
   *
   * The sheet is where the Value column comes from, so a reader who set it up wants to *see* it set
   * up — a collapsed sheet on returning to the tab reads as "my weights are gone" even though the
   * button beside it carries the count. The map window persists its three panels for the same reason.
   */
  itemWeightsOpen: "eqlist.main.itemWeightsOpen",
  /** Main window: how gently the Items tab fills the catalogue from the wiki (ADR 0153). */
  itemHarvestPace: "eqlist.main.itemHarvestPace",
  /**
   * Main window: the Loot tab's standing answers — which half you're reading, what you've narrowed
   * the feed to, and the order of each table.
   *
   * The feed is live and the panel is not, so these are the same kind of thing as the Hunt tab's zone:
   * a filter you set once because it is how you want to read the feed, not a search you ran a moment
   * ago. They were the last dropdowns in the app resetting on a tab switch.
   */
  lootView: "eqlist.main.lootView",
  lootFilters: "eqlist.main.lootFilters",
  lootSort: "eqlist.main.lootSort",
  lootPriceSort: "eqlist.main.lootPriceSort",
  /** Map window: dropped pins. */
  mapPins: "eqlist.map.pins",
  /**
   * Map window: the one set of kill filters the ☠ list and the 📖 mob panel share.
   *
   * Persisted like the rest of that window's controls. The bar always shows what is set and carries a
   * Clear, so a filter that outlives a session is visible rather than a mystery — which is the test a
   * remembered narrowing has to pass.
   */
  mapKillFilters: "eqlist.map.killFilters",
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
  /**
   * Map window: whether the hand-set height window (for a zone with no labelled floors) keeps
   * itself centred on your own `/loc` height as you move, instead of staying where it was dragged.
   */
  mapHeightFollow: "eqlist.map.heightFollow",
  /** Map window: the ± half-width of that follow window, in raw `/loc` z. */
  mapHeightFollowRange: "eqlist.map.heightFollowRange",
  /**
   * Map window: whether the map marks your hunt's mobs where your kills place them (ADR 0142).
   *
   * Persisted, unlike the pin-kind filter beside it: that one narrows what you drew to look at one
   * thing, and shouldn't still be narrowed tomorrow — this one is a standing answer to "should the
   * app put things on my map at all", and asking again every session is not what "no" means.
   */
  mapHuntPins: "eqlist.map.huntPins",
  /** Map window: the kills panel's visibility. */
  mapKillsOpen: "eqlist.map.killsOpen",
  /** Map window: the mob-knowledge panel's visibility. */
  mapMobsOpen: "eqlist.map.mobsOpen",
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
