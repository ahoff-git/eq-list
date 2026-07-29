/**
 * types.ts — the shared contract between the Electron main process and the
 * renderer. Both sides import these; nothing here may import Node or React so
 * it stays safe on both. The preload bridge (`window.eql`) is typed by `EqlApi`.
 */

// ─── Log events ─────────────────────────────────────────────────────────────

/** A parsed "you looted X from Y" line from the EQ log. */
export interface LootEvent {
  kind: "loot";
  /** Item name, exactly as it appears in the log (leading article stripped). */
  item: string;
  /** How many the line reported ("You looted 2 Spiderling Eye…"); 1 when unstated. */
  qty: number;
  /** Corpse / source name the item came from. */
  source: string;
  /** Original, untouched log line (minus the timestamp bracket). */
  raw: string;
  /** ISO timestamp parsed from the log line, or the ingest time as a fallback. */
  at: string;
}

/** A parsed "You have entered <zone>" line — tracks the player's current zone. */
export interface ZoneEvent {
  kind: "zone";
  zone: string;
  raw: string;
  at: string;
}

/** A parsed "You gain [party] experience! (N%)" line. `pct` present only when shown. */
export interface XpEvent {
  kind: "xp";
  party: boolean;
  pct?: number;
  raw: string;
  at: string;
}

/** A parsed kill ("You have slain X" / "X has been slain by Y"). `target` is the mob. */
export interface KillEvent {
  kind: "kill";
  target: string;
  raw: string;
  at: string;
}

/** A parsed "Your Location is Y, X, Z" line (EQ reports y first). Drives the map. */
export interface LocEvent {
  kind: "loc";
  y: number;
  x: number;
  z: number;
  raw: string;
  at: string;
}

/**
 * Levelling up. `level` is present only for the numbered "Welcome to level N!" line —
 * the one place the log ever states your level. Either form means the XP-into-level
 * counter starts over.
 */
export interface LevelEvent {
  kind: "level";
  level?: number;
  raw: string;
  at: string;
}

export type LogEvent = LootEvent | ZoneEvent | XpEvent | KillEvent | LocEvent | LevelEvent;

// ─── Combat events (see combat-parser.ts) ───────────────────────────────────

/**
 * Damage landing on someone — a melee swing, a spell/proc, or a DoT tick. `melee`
 * separates swings from everything else; `spell` is set for spells and DoTs (for a
 * bare DoT tick the log names no caster, so `attacker` falls back to the DoT).
 */
export interface DamageEvent {
  kind: "damage";
  attacker: string;
  target: string;
  amount: number;
  /** The attack verb for melee swings ("bites", "pierce"). */
  verb?: string;
  spell?: string;
  /** "cold", "magic", "disease", "non-melee"… when the log names one. */
  damageType?: string;
  /** The log's trailing note on the swing: "Critical", "Riposte", … */
  qualifier?: string;
  melee: boolean;
  /** True for a damage-over-time tick, as opposed to a spell first landing. */
  tick?: boolean;
  raw: string;
  at: string;
}

/** A swing that missed — pairs with `DamageEvent` to give an accuracy figure. */
export interface MissEvent {
  kind: "miss";
  attacker: string;
  target: string;
  verb: string;
  /** "Riposte" when the miss was forced by one. */
  qualifier?: string;
  raw: string;
  at: string;
}

/** A heal ("You healed X for N hit points [by <spell>]"). Reflexive → healer. */
export interface HealEvent {
  kind: "heal";
  healer: string;
  target: string;
  /** Hit points actually restored. */
  amount: number;
  /** What the heal would have restored, when the log reports an overheal. */
  attempted?: number;
  spell?: string;
  raw: string;
  at: string;
}

/**
 * A cast starting ("You begin casting X"). Pairing this with the damage/heal that
 * follows is what makes cast time — and therefore damage-per-second-of-casting —
 * measurable from a log that never states either.
 */
export interface CastEvent {
  kind: "cast";
  caster: string;
  spell: string;
  raw: string;
  at: string;
}

/** How a cast ended without landing. */
export type SpellOutcome = "fizzle" | "interrupted" | "resisted" | "blocked";

export interface SpellOutcomeEvent {
  kind: "spell-outcome";
  caster: string;
  spell: string;
  outcome: SpellOutcome;
  /** Who shrugged it off, when the log names them. */
  target?: string;
  raw: string;
  at: string;
}

/** Your own death. `killer` is absent for the bare "You died." line. */
export interface DeathEvent {
  kind: "death";
  victim: string;
  killer?: string;
  raw: string;
  at: string;
}

export type CombatEvent =
  | DamageEvent
  | MissEvent
  | HealEvent
  | CastEvent
  | SpellOutcomeEvent
  | DeathEvent;

// ─── Damage meter ───────────────────────────────────────────────────────────

/** One row of the damage meter. */
export interface CombatantStat {
  name: string;
  /** Damage dealt / taken by this combatant, and healing it did. */
  dealt: number;
  taken: number;
  healed: number;
  /** Landed and missed swings (melee + spells), for the accuracy figure. */
  hits: number;
  misses: number;
  /** Landed swings the log tagged "(Critical)". */
  crits: number;
  /** Biggest single hit dealt. */
  maxHit: number;
  /**
   * Seconds this combatant was actually fighting (min 1) — the sum of gaps between
   * its damage, excluding downtime. Not the wall-clock span.
   */
  activeSec: number;
  /** `dealt / activeSec`, rounded to one decimal. */
  dps: number;
  /** True for you and your pet — the rows the meter highlights. */
  mine: boolean;
}

/**
 * One of your spells over a window. Everything here is measured from the log — EQ
 * states neither cast times nor resist rates, so both are derived: cast time from the
 * gap between "You begin casting X" and the effect landing, resist rate from how many
 * completed casts were shrugged off.
 */
export interface SpellStat {
  spell: string;
  /** Casts begun. */
  casts: number;
  /** Casts that landed damage or a heal (a DoT counts once, at first landing). */
  lands: number;
  /** Later damage-over-time ticks from those landings. */
  ticks: number;
  fizzles: number;
  interrupts: number;
  resists: number;
  blocked: number;
  /** Damage this spell did, first landing + every tick. */
  damage: number;
  healed: number;
  maxHit: number;
  /** Mean measured cast time, seconds (0 when no cast could be timed). */
  avgCastSec: number;
  /**
   * Damage per second **spent casting** — the efficiency figure: a slow nuke and a fast
   * one that hit for the same amount are not equally good. 0 when nothing was timed.
   */
  dpc: number;
  /** Share of completed casts that were resisted, 0–1. */
  resistRate: number;
  /** Hit points a heal would have restored but didn't (the overheal). */
  overhealed: number;
  /** Who resisted it, most often first — resist rates vary wildly by mob. */
  resistedBy: { target: string; count: number }[];
}

/**
 * What killing one kind of mob costs and earns. Kill time is measured between kills
 * inside a fight, so a pull of three coyotes gives three intervals — the closest the
 * log gets to "how long does one take".
 */
export interface MobKillStat {
  mob: string;
  kills: number;
  /** Mean seconds per kill. */
  avgKillSec: number;
  /** Experience percent credited to this mob (same attribution as the Session tab). */
  xpPct: number;
  /**
   * `xpPct` per minute *spent fighting it* — downtime excluded, so it compares mobs
   * fairly but overstates what a night actually yields. Use it to rank, not to forecast.
   */
  xpPerMin: number;
}

/** What was landing on you in the seconds before you died. */
export interface DeathRecap {
  at: string;
  killer?: string;
  /** Damage taken in the lead-up, biggest source first. */
  incoming: { source: string; amount: number }[];
  totalTaken: number;
  /** Seconds of damage the recap covers. */
  windowSec: number;
}

/** Damage totals over a window: one fight, or the whole session. */
export interface FightStats {
  /** Log timestamps of the first and last damage in the window ("" when empty). */
  startedAt: string;
  endedAt: string;
  /**
   * Seconds of *combat* in the window, downtime excluded — so a session's figure is
   * time spent fighting, not time since the app opened.
   */
  durationSec: number;
  totalDealt: number;
  /** Damage you and your pet dealt, and took, within the window. */
  yourDealt: number;
  yourTaken: number;
  /**
   * Wall-clock seconds the window spans, first damage to last — as opposed to
   * `durationSec`, which counts only time in combat. The difference is downtime.
   */
  spanSec: number;
  /** Rows, biggest dealer first. */
  byCombatant: CombatantStat[];
  /** Your spells in this window, most damaging first. */
  spells: SpellStat[];
  /** What you killed here, and what it cost/earned. Best rate first. */
  byMob: MobKillStat[];
  /** Kills and experience credited within the window. */
  kills: number;
  xpPct: number;
  /** Your damage per second of the window, for a sparkline (index = second). */
  yourPerSec: number[];
  /** Your deaths in the window, newest first (capped). */
  deaths: DeathRecap[];
}

/**
 * The damage meter's live state: the current (or last) fight plus the session.
 * Whether the fight is still "live" is left to the reader — compare `fight.endedAt`
 * against the clock — because the log only reveals a lull when the next swing lands.
 */
export interface CombatStats {
  /** When tracking started / was last reset. */
  startedAt: string;
  fight: FightStats;
  session: FightStats;
}

// ─── Combat history (past fights and sessions) ──────────────────────────────

/**
 * A finished fight, kept so a past session can be dug into after the fact. It's the
 * same `FightStats` the live meter renders, plus enough identity to browse by.
 */
export interface StoredFight {
  id: string;
  /** Groups fights into a play session (one app run, or since the last reset). */
  sessionId: string;
  /** The main thing you were fighting — the biggest opponent, for the fight list. */
  label: string;
  /** The zone it happened in, when the log had told us one. */
  zone?: string;
  stats: FightStats;
}

/** A zone's whole recorded history — the "which camp is actually better" answer. */
export interface ZoneReport {
  zone: string;
  fights: number;
  kills: number;
  /** Seconds in combat, and the experience earned for them. */
  combatSec: number;
  xpPct: number;
  xpPerMin: number;
  yourDealt: number;
  /** Your DPS across the zone's fights. */
  dps: number;
  /** When you last fought here. */
  lastAt: string;
}

/** Your best recorded fight against a given opponent. */
export interface FightBest {
  label: string;
  /** Your damage and DPS in that fight. */
  yourDealt: number;
  dps: number;
  at: string;
}

/** A play session, derived by grouping stored fights. */
export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  fights: number;
  /** Seconds of combat, and damage totals, across the session's fights. */
  combatSec: number;
  totalDealt: number;
  yourDealt: number;
  yourTaken: number;
}

// ─── Session stats ──────────────────────────────────────────────────────────

export interface MobStat {
  mob: string;
  kills: number;
  xp: number;
}

/** Live session totals derived from the log (reset on demand). */
export interface SessionStats {
  startedAt: string;
  /** Count of experience-gain messages (EQ logs no XP amount). */
  totalXp: number;
  partyXp: number;
  soloXp: number;
  /** Sum of the shown percentages, when the server includes them. */
  totalPct: number;
  kills: number;
  /** Per-mob kills + attributed XP, best first. */
  byMob: MobStat[];
}

// ─── Wiki data ──────────────────────────────────────────────────────────────

export type SourceKind =
  | "drop"
  | "quest"
  | "recipe"
  | "vendor"
  | "forage"
  | "ground"
  | "unknown";

/** One way an item can be obtained, scraped from its wiki page. */
export interface ItemSource {
  kind: SourceKind;
  /** Where it comes from: a mob, NPC, zone, recipe name, etc. */
  where: string;
  /** Optional extra context: zone, drop rate, cost, notes. */
  detail?: string;
}

/** A required ingredient/turn-in (recipe/quest) or a mob's loot line. */
export interface WikiComponent {
  name: string;
  qty: number;
  wikiPath?: string;
  /** Drop chance for mob loot as a percentage ("4.7%"), when the wiki gives one. */
  dropRate?: string;
}

export type WikiPageKind = "item" | "quest" | "recipe" | "mob" | "zone" | "spell" | "page";

/**
 * One reward line from a quest/recipe. `item`/`wikiPath` are set only when the whole
 * line is a single linked item (e.g. a reward weapon) — so it can be hovered/opened
 * like a list item. Faction/coin/XP lines stay as plain `text`.
 */
export interface WikiReward {
  text: string;
  item?: string;
  wikiPath?: string;
}

/**
 * The item stat card the wiki shows on hover (type, weight, class/race, effects…).
 * Present only for pages that have their own item block (items/recipes). Powers the
 * in-app hover tooltip.
 */
export interface ItemCard {
  title: string;
  /** Absolute URL of the item icon, if any. */
  icon?: string;
  /** Stat lines, top to bottom (e.g. "QUEST ITEM", "WT: 1.5 Size: SMALL", "Class: ALL"). */
  lines: string[];
}

/** Normalized result of scraping a single wiki page. */
export interface WikiPage {
  kind: WikiPageKind;
  title: string;
  wikiPath: string;
  /** For items: how to obtain it. */
  sources: ItemSource[];
  /** For quests/recipes: the items you must gather. */
  components: WikiComponent[];
  /** For quests/recipes: what you get. */
  rewards: WikiReward[];
  /** The item's own stat card (items/recipes), for the hover tooltip. */
  card?: ItemCard;
  /** True if the page is tagged with an era that isn't live yet (can't obtain). */
  outOfEra?: boolean;
  fetchedAt: string;
}

export interface SearchResult {
  title: string;
  wikiPath: string;
  snippet?: string;
  /** True if the page is tagged with an era that isn't live yet. */
  outOfEra?: boolean;
}

/** A screen-region rectangle (display-local CSS pixels) for the screengrab lookup. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A global shortcut and whether the OS accepted its registration. */
export interface HotkeyInfo {
  action: string;
  label: string;
  registered: boolean;
}

/** Diagnostic info shown in the app's Help section. */
export interface AppInfo {
  hotkeys: HotkeyInfo[];
  /** Path to the debug log file (see app.openLog). */
  logFile: string;
}

// ─── Shopping list ──────────────────────────────────────────────────────────

/** One line on the shopping list — a thing to watch for in the logs. */
export interface ShoppingListEntry {
  id: string;
  /** The name matched against loot lines. */
  name: string;
  wikiPath?: string;
  /** How many you want. */
  needed: number;
  /** How many have dropped/looted since it was added (from the log). */
  obtained: number;
  note?: string;
  /** What put this on the list (a quest/recipe), for grouping in the UI. */
  origin?: { kind: WikiPageKind; name: string };
  addedAt: string;
  /** Set when a matching loot line arrives; drives the overlay flash. */
  lastSeenAt?: string;
}

export interface ShoppingList {
  entries: ShoppingListEntry[];
  /** How many times to run each quest/recipe, keyed by origin ("kind:name"). Scales needed counts. */
  questRuns: Record<string, number>;
}

// ─── Experience progress ────────────────────────────────────────────────────

/**
 * How far into the current level you are. The log states experience only as *gains*
 * ("You gain experience! (1.025%)"), never a total — so the starting point has to come
 * from the player. Once given, the app keeps it current by adding every gain and
 * resetting on "You have gained a level!", so it's asked for at most once per level.
 */
export interface XpProgress {
  /** Percent into the current level, 0–100. */
  intoLevel: number;
  /** Level, when the log has told us ("Welcome to level N!"). */
  level?: number;
  /** When the player last stated it (or when a level-up reset it). */
  statedAt?: string;
  /** True once we have something to work from. */
  known: boolean;
}

// ─── Settings ───────────────────────────────────────────────────────────────

export interface OverlaySettings {
  opacity: number; // 0.2 .. 1
  alwaysOnTop: boolean;
  clickThrough: boolean;
  fontScale: number; // 0.8 .. 1.6
  showObtained: boolean; // keep completed items visible
  /** Auto-narrow the overlay to the zone you're in (from the log) as you travel. */
  followZone: boolean;
}

export type MatchMode = "exact" | "contains";

export interface Settings {
  /** Directory holding eqlog_*.txt files. */
  logDir: string;
  /** Specific file to watch, or "" to auto-pick the most recently written. */
  activeLogFile: string;
  matchMode: MatchMode;
  /** Hide out-of-era pages in search results. */
  hideOutOfEra: boolean;
  /** Opt-in: join the awari peer-to-peer network (see peers + send pings). Default off. */
  connectPeers: boolean;
  /** Broadcast your live location to peers (requires `connectPeers`). Default off. */
  shareLocation: boolean;
  /** Display name shown to peers; blank = derived from the log file's character name. */
  playerName: string;
  /** Override for the awari bootstrap-service URL; blank = the live default. */
  bootstrapUrl: string;
  overlay: OverlaySettings;
  debug: boolean;
}

// ─── Watcher status ─────────────────────────────────────────────────────────

export interface WatcherStatus {
  watching: boolean;
  file?: string;
  error?: string;
}

// ─── Peer networking (awari) ────────────────────────────────────────────────

/**
 * Discriminator values for awari room payloads, in one place so a sender and the
 * receiver can't drift (a typo'd literal would silently fail to match — `kind` is a
 * plain string on the wire). Add a member here when a new feature uses the connection.
 */
export const AWARI_MSG = {
  /** A peer's live location. */
  loc: "loc",
  /** A peer's map click (a named marker for everyone viewing that zone). */
  ping: "ping",
  /** A peer's shared map pins. */
  pins: "pins",
  /**
   * Who a peer is (name + zone). awari's roster gives us peer *ids*; this is how a
   * connected-users list learns names. Sent on join, whenever ours changes, and
   * again whenever someone new joins (so late arrivals learn about us).
   */
  hello: "hello",
} as const;
export type AwariMsgKind = (typeof AWARI_MSG)[keyof typeof AWARI_MSG];

/**
 * An app message carried over the awari room. `kind` discriminates the shape
 * (see `AWARI_MSG`). Kept loose so it survives IPC structured-clone and isn't tied to
 * any one feature.
 */
export type AwariPayload = { kind: string; [key: string]: unknown };

/** A peer message the owner window received, relayed to every window (self excluded). */
export interface AwariInbound {
  /** The sending peer's id. */
  sender: string;
  payload: AwariPayload;
}

/** The owner window's connection status, broadcast to every window. */
export interface AwariStatus {
  connected: boolean;
  peerId: string | null;
}

/**
 * Someone else in the room, as the connected-users list sees them. Presence comes
 * from awari's roster (`onPeerJoined`/`onPeerLeft`) so a peer is listed as soon as
 * they connect; `name`/`zone` fill in when their `hello` arrives.
 */
export interface AwariPeer {
  peerId: string;
  name?: string;
  zone?: string;
}

// ─── Preload bridge (window.eql) ────────────────────────────────────────────

/** Unsubscribe function returned by every `on*` subscription. */
export type Unsubscribe = () => void;

export interface EqlApi {
  list: {
    get(): Promise<ShoppingList>;
    /** Add a single item to watch. Returns the updated list. */
    add(input: {
      name: string;
      needed?: number;
      wikiPath?: string;
      note?: string;
      origin?: { kind: WikiPageKind; name: string };
    }): Promise<ShoppingList>;
    /** Add every component of a scraped quest/recipe at once. */
    addFromPage(page: WikiPage): Promise<ShoppingList>;
    update(id: string, patch: Partial<Pick<ShoppingListEntry, "needed" | "obtained" | "note">>): Promise<ShoppingList>;
    remove(id: string): Promise<ShoppingList>;
    clear(): Promise<ShoppingList>;
    /** Set how many times to run a quest/recipe group (by origin key); scales needs. */
    setRuns(originKey: string, runs: number): Promise<ShoppingList>;
    onChanged(cb: (list: ShoppingList) => void): Unsubscribe;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: DeepPartial<Settings>): Promise<Settings>;
    /** Open a native folder picker for the EQ log directory. */
    pickLogDir(): Promise<string | null>;
    onChanged(cb: (settings: Settings) => void): Unsubscribe;
  };
  wiki: {
    search(term: string): Promise<SearchResult[]>;
    getPage(title: string): Promise<WikiPage | null>;
    /** Fuzzy zone-name suggestions for the "quests by zone" search. */
    searchZones(term: string): Promise<SearchResult[]>;
    /** Quests located in / related to a zone. */
    questsByZone(zone: string): Promise<SearchResult[]>;
    /** Open a wiki page in the external browser (wikiPath or title). */
    openInBrowser(target: string): Promise<void>;
  };
  loot: {
    /** Every parsed loot line, whether or not it's on the list. */
    onEvent(cb: (event: LootEvent) => void): Unsubscribe;
    /** Loot lines that matched a shopping-list entry. */
    onMatched(cb: (payload: { event: LootEvent; entry: ShoppingListEntry }) => void): Unsubscribe;
  };
  watcher: {
    status(): Promise<WatcherStatus>;
    onStatus(cb: (status: WatcherStatus) => void): Unsubscribe;
  };
  zone: {
    /** The zone the player is currently in (from the log), or null if unknown. */
    current(): Promise<string | null>;
    onChanged(cb: (zone: string | null) => void): Unsubscribe;
  };
  loc: {
    /** The player's last logged location (from `/loc`), or null if none yet. */
    current(): Promise<LocEvent | null>;
    onChanged(cb: (loc: LocEvent | null) => void): Unsubscribe;
  };
  stats: {
    get(): Promise<SessionStats>;
    reset(): Promise<SessionStats>;
    onChanged(cb: (stats: SessionStats) => void): Unsubscribe;
  };
  /** The damage meter: per-combatant damage/DPS for the current fight and session. */
  combat: {
    get(): Promise<CombatStats>;
    reset(): Promise<CombatStats>;
    onChanged(cb: (stats: CombatStats) => void): Unsubscribe;
    /** Past play sessions, newest first. */
    sessions(): Promise<SessionSummary[]>;
    /** Per-zone totals across all recorded fights, best experience rate first. */
    zones(): Promise<ZoneReport[]>;
    /** Your best recorded fight per opponent. */
    bests(): Promise<FightBest[]>;
    /** The stored fights of one session, newest first. */
    fights(sessionId: string): Promise<StoredFight[]>;
    /** Forget all stored history (the live meter is untouched). */
    clearHistory(): Promise<SessionSummary[]>;
  };
  /**
   * Experience progress — the one figure the log can't give us, so the UI asks for it
   * and this keeps it current afterwards.
   */
  xp: {
    get(): Promise<XpProgress>;
    /** Record what the player says their current XP into the level is (0–100). */
    set(intoLevel: number, level?: number): Promise<XpProgress>;
    onChanged(cb: (progress: XpProgress) => void): Unsubscribe;
  };
  lookup: {
    /** Open the region selector (same as the screengrab hotkey). */
    open(): Promise<void>;
    /**
     * OCR the selected region; the read text is routed to the Search box. `rect` is
     * in the selector window's client pixels and `view` is that window's viewport
     * size — the ratio image/view maps the selection to image pixels regardless of
     * how the OS reports the window's units.
     */
    capture(rect: Rect, view: { width: number; height: number }): Promise<string>;
    /** Close all selector windows (cancel). */
    cancel(): Promise<void>;
  };
  app: {
    /** Diagnostics for the Help section (hotkey registration, log path, …). */
    info(): Promise<AppInfo>;
    /** Open the debug log file in the OS default app. */
    openLog(): Promise<void>;
  };
  search: {
    /** Fires when a screengrab lookup fills the Search box with OCR'd text. */
    onPrefill(cb: (text: string) => void): Unsubscribe;
  };
  nav: {
    /**
     * Browser back/forward from the mouse thumb buttons or Alt+←/→, forwarded from
     * the main process (`app-command`). Drives the in-app page history — links
     * navigate within the app, never straight to the external wiki.
     */
    onCommand(cb: (dir: "back" | "forward") => void): Unsubscribe;
  };
  overlay: {
    open(): Promise<void>;
    setClickThrough(enabled: boolean): Promise<void>;
  };
  map: {
    /** Open (or focus) the sibling map window. */
    open(): Promise<void>;
    /**
     * Open the map window at a zone. With `loc` (EQ y,x — e.g. from a mob's Location
     * coordinate), drop a marker there labeled with `label`.
     */
    openAt(zone: string, loc?: { y: number; x: number }, label?: string): Promise<void>;
    /** Fires in the map window when asked to view a zone / drop a marker (`openAt`). */
    onViewZone(cb: (msg: { zone: string; loc?: { y: number; x: number }; label?: string }) => void): Unsubscribe;
    /** Open a zone's map page on the Project 1999 wiki (for zones with no bundled map). */
    openP99(zone: string): Promise<void>;
  };
  /**
   * Peer networking (awari), brokered by the main process. The always-alive main
   * window owns the single WebRTC connection; every other window talks to peers
   * through here. See `AwariHost` (owner engine) and ADR 0012.
   */
  awari: {
    /** Publish an app payload to the room (relayed to the owner window, which holds the socket). */
    send(payload: AwariPayload): void;
    /** A peer message arrived (owner-relayed to every window; never your own). */
    onMessage(cb: (msg: AwariInbound) => void): Unsubscribe;
    /** Connection status changed (joined? + our peer id). */
    onStatus(cb: (status: AwariStatus) => void): Unsubscribe;
    /** Who else is in the room (roster + the names/zones they've announced). */
    onPeers(cb: (peers: AwariPeer[]) => void): Unsubscribe;
    /** Owner-window plumbing: the broker asks this (owner) window to publish a payload. */
    onPublish(cb: (payload: AwariPayload) => void): Unsubscribe;
    /** Owner-window plumbing: report an inbound peer message up to the broker. */
    reportMessage(msg: AwariInbound): void;
    /** Owner-window plumbing: report connection status up to the broker. */
    reportStatus(status: AwariStatus): void;
    /** Owner-window plumbing: report the room roster up to the broker. */
    reportPeers(peers: AwariPeer[]): void;
  };
  win: {
    /** Which window this renderer is: "main" or "overlay". */
    role(): Promise<"main" | "overlay">;
    minimize(): void;
    /** Hide the window to the tray (the app keeps running; reshow via tray/hotkey). */
    hide(): void;
    /** Set the live window opacity (0.2–1), transient — does not change the saved setting. */
    setOpacity(value: number): void;
    /** Toggle this window's always-on-top (per-window; used by the map's pin). */
    setAlwaysOnTop(enabled: boolean): void;
    close(): void;
    /** Forget saved positions and recenter windows (for "lost" windows). */
    resetPositions(): Promise<void>;
  };
}

/** Recursive Partial for settings patches. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
