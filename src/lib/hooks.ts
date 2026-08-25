"use client";
import { type DependencyList, type RefObject, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { setRendererDebug } from "@/shared/logging";
import { UI_SCALE, clampScale, windowOpacity, type ScaleRange } from "@/shared/constants";
import { useWindowToggle } from "./windowToggles";
import type {
  ShoppingList,
  Settings,
  WatcherStatus,
  LootRecord,
  ItemPrice,
  LocEvent,
  CombatStats,
  FightStats,
  XpProgress,
  HpEstimate,
  KillRecord,
  SpawnView,
  BuffView,
  AppInfo,
  ItemSource,
  ItemCard,
  LucyItem,
  LucySearchResult,
  ShoppingListEntry,
  LootedItem,
  Unsubscribe,
} from "@/shared/types";
import { mobKey, type MobKnowledge } from "@/shared/mob-stats";
import type { SharedKill } from "@/shared/kill-filters";
import { mergeLootFeed } from "@/shared/loot-feed";
import { ratio } from "@/shared/numbers";
import { huntTargetsFor, type HuntTarget } from "@/shared/hunt";
import { itemDropSources, type ItemDropSource } from "@/shared/item-sources";
import { knownItems, type KnownItem } from "@/shared/known-items";
import { clockSkew } from "@/shared/spawn-timers";
import type { AlertUsage } from "@/shared/alert-styles";
import { buildVocabulary, NO_VOCABULARY, type Vocabulary } from "@/shared/log-vocabulary";
import { parseLogText } from "@/shared/log-parser";

/**
 * A value the **main process owns**: how to read it now, and how to follow it afterwards.
 *
 * Defined at module scope so each `source` has a stable identity — which is what lets `useLive` name
 * honest dependencies instead of an empty array with a lint suppression over it.
 */
type Eql = NonNullable<ReturnType<typeof api>>;

interface LiveSource<T> {
  read: (a: Eql) => Promise<T>;
  follow: (a: Eql, on: (value: T) => void) => Unsubscribe;
}

function live<T>(read: LiveSource<T>["read"], follow: LiveSource<T>["follow"]): LiveSource<T> {
  return { read, follow };
}

/**
 * Seed from the current value, then follow the stream, and unsubscribe on the way out.
 *
 * Eight hooks wrote this lifecycle out verbatim. None of them had it wrong — but "read once, subscribe,
 * **return the unsubscribe**" is exactly the shape where one copy quietly forgets the last part and
 * leaks a listener per mount, with nothing failing to show it. One copy can't drift from itself.
 *
 * `api()` is null during Next's prerender and in a plain browser, so a value that never arrives leaves
 * the initial one in place — every caller's initial is the honest "nothing yet".
 */
function useLive<T>(source: LiveSource<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const a = api();
    if (!a) return;
    void source.read(a).then(setValue);
    return source.follow(a, setValue);
  }, [source]);
  return value;
}

/**
 * Read something from the main process now, and again whenever `deps` change — **discarding an answer
 * the deps have already moved on from.**
 *
 * The other half of `useLive`: a value nothing pushes, that has to be asked for again when the question
 * changes. Seven places wrote the effect out, and the ones that left out the cancellation had a real
 * race in them: clicking session A then B fires two reads, and if A's reply lands second the panel shows
 * B selected with A's fights in it. Nothing throws; the numbers are simply the wrong session's.
 *
 * `deps` is the caller's own dependency list, which the lint rule can't see through a wrapper — so the
 * suppression lives here once instead of at every call site.
 */
export function useReading<T>(
  read: (a: Eql) => Promise<T>,
  initial: T,
  deps: DependencyList,
): { value: T; loading: boolean } {
  const [value, setValue] = useState<T>(initial);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const a = api();
    if (!a) return; // prerender, or a plain browser: the initial value stands
    let current = true;
    setLoading(true);
    void read(a).then((next) => {
      if (!current) return; // superseded — the newer read owns the state now
      setValue(next);
      setLoading(false);
    });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { value, loading };
}

/** `useReading` for the usual case: the value, and no interest in whether it's arrived yet. */
export function useRead<T>(read: (a: Eql) => Promise<T>, initial: T, deps: DependencyList): T {
  return useReading(read, initial, deps).value;
}

/**
 * Read a value, then read it again whenever the main process says it changed — **keeping whichever
 * read was started last, not whichever replied first.**
 *
 * `useReading`'s sibling for a value that is both fetched and followed, and it needs the same
 * cancellation for a sharper reason. A notice is not one event: eating a log or replaying a gap
 * broadcasts `killsChanged` dozens of times in a burst, so several reads of a 5000-record list are in
 * flight at once over a channel with no ordering guarantee. An older reply landing last leaves the
 * panel showing a *superseded* snapshot — with nothing to correct it until the next notice, which may
 * be minutes away. The three hooks below wrote this lifecycle out and all three left the guard off.
 *
 * Subscribing happens **before** the first read, so a change that lands while that read is in flight
 * is still noticed — it schedules a reload the guard then lets win, where reading first left a gap in
 * which a notice was simply missed.
 *
 * `follow` returns the unsubscribe, as every `on*` in the bridge does. `deps` is the caller's own
 * list, so re-keying the question (a different zone) both re-reads and discards the old answer.
 */
function useFollowedRead<T>(
  read: (a: Eql) => Promise<T>,
  follow: (a: Eql, reload: () => void) => Unsubscribe,
  initial: T,
  deps: DependencyList,
): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const a = api();
    if (!a) return;
    // Counted rather than a boolean: within one effect every reload has to be able to supersede the
    // one before it, which a single "am I still current" flag can't express.
    let latest = 0;
    const reload = () => {
      const mine = ++latest;
      void read(a).then((next) => {
        if (mine === latest) setValue(next);
      });
    };
    const stop = follow(a, reload);
    reload();
    return () => {
      latest += 1; // nothing in flight may land after we've gone
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/**
 * Close a popover when the user clicks outside `inside`, or presses Escape.
 *
 * Both the tab overflow menu and the zone picker had this, and they'd already drifted: one closed on
 * Escape and the other only did while its input had focus, so the same gesture dismissed one and not
 * the other. Listening happens **only while open**, so a closed popover leaves nothing attached.
 */
export function useDismiss(inside: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!inside.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
    // `close` is a fresh closure each render; re-subscribing per render would be pointless churn, so
    // what this follows is whether the popover is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

const LIVE = {
  combat: live<CombatStats>((a) => a.combat.get(), (a, on) => a.combat.onChanged(on)),
  xp: live<XpProgress>((a) => a.xp.get(), (a, on) => a.xp.onChanged(on)),
  hp: live<HpEstimate>((a) => a.hp.get(), (a, on) => a.hp.onChanged(on)),
  zone: live<string | null>((a) => a.zone.current(), (a, on) => a.zone.onChanged(on)),
  loc: live<LocEvent | null>((a) => a.loc.current(), (a, on) => a.loc.onChanged(on)),
  list: live<ShoppingList>((a) => a.list.get(), (a, on) => a.list.onChanged(on)),
  settings: live<Settings | null>((a) => a.settings.get(), (a, on) => a.settings.onChanged(on)),
  watcher: live<WatcherStatus>((a) => a.watcher.status(), (a, on) => a.watcher.onStatus(on)),
};

/** One-shot app diagnostics (hotkey registration) for the Help section. */
export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    const a = api();
    if (!a) return;
    void a.app.info().then(setInfo);
  }, []);
  return info;
}

const EMPTY_FIGHT: FightStats = {
  startedAt: "",
  endedAt: "",
  durationSec: 0,
  spanSec: 0,
  totalDealt: 0,
  yourDealt: 0,
  yourTaken: 0,
  byCombatant: [],
  spells: [],
  byMob: [],
  kills: 0,
  xpPct: 0,
  xpGains: 0,
  soloXp: 0,
  partyXp: 0,
  copper: 0,
  soldCopper: 0,
  yourPerSec: [],
  deaths: [],
  invocations: [],
};

const EMPTY_PRICES: ItemPrice[] = [];
const NO_KILLS: KillRecord[] = [];
const NO_MOBS: MobKnowledge[] = [];
/**
 * "Nothing yet", not "nothing running" — the panel's empty state has to be the same object every
 * render, or `useFollowedRead`'s initial would restart the memos below it on every tick.
 */
const NO_SPAWNS: SpawnView = { now: "", running: [], known: [], dismissed: [] };
const NO_BUFFS: BuffView = { now: "", active: [], lapsed: [], known: [], lexicon: false };
const NO_SOURCES: Record<string, ItemSource[]> = {};
const NO_FACTS: Record<string, SpellFacts> = {};
const NO_MOB_LOOT: Record<string, Record<string, string>> = {};
const NO_ITEM_SOURCES: ItemSource[] = [];
const NO_ITEM_DROPS: ItemDropSource[] = [];
const NO_LOOTED: LootedItem[] = [];
const EMPTY_LIST: ShoppingList = { entries: [], questRuns: {} };
const NO_WATCHER: WatcherStatus = { watching: false };
const EMPTY_COMBAT: CombatStats = { startedAt: "", fight: EMPTY_FIGHT, session: EMPTY_FIGHT };

/** Live damage-meter state from the log (current fight + session). */
export function useCombatStats(): CombatStats {
  return useLive(LIVE.combat, EMPTY_COMBAT);
}

/**
 * How far into the current level the player is. Seeded by the player (the log never
 * states a total), then kept current by the main process from XP gains and level-ups.
 */
export function useXpProgress(): XpProgress {
  return useLive(LIVE.xp, { intoLevel: 0, known: false });
}

/**
 * Inferred bounds on your maximum hit points (see `hp-estimate.ts`). Soft by nature:
 * it sharpens as you play, and a stated figure overrides it.
 */
export function useHpEstimate(): HpEstimate {
  return useLive(LIVE.hp, { atLeast: 0, samples: 0, updatedAt: "" });
}

/**
 * Everything known about every mob, in every zone it's known in — yours pooled with peers'.
 *
 * The one fetch behind the two views below, because they ask the same question and differ only in how
 * they shape the answer: one folds the zones away, the other is *about* them.
 */
function useAllMobs(refreshKey?: unknown): MobKnowledge[] {
  return useFollowedRead<MobKnowledge[]>(
    (a) => a.mobs.all(),
    // Mob knowledge is derived from the kill log, so a bulk kill change (import / clear) means
    // refetch — not just when the caller's refreshKey ticks over.
    (a, reload) => a.kills.onChanged(reload),
    NO_MOBS,
    [refreshKey],
  );
}

/**
 * Pooled mob knowledge (yours plus peers'), keyed by mob name for quick lookup. Used wherever
 * the wiki's claims need checking against what we've actually killed.
 */
export function useMobKnowledge(refreshKey: unknown): Record<string, MobKnowledge> {
  const mobs = useAllMobs(refreshKey);
  return useMemo(() => {
    // A mob can be known in several zones; fold them together, since "does it drop this"
    // isn't a per-zone question.
    // Keyed by `mobKey` (article- and case-folded) so a wiki name like "a gnoll" finds
    // knowledge filed under the kill's stripped "gnoll".
    const byMob: Record<string, MobKnowledge> = {};
    for (const m of mobs) {
      const key = mobKey(m.mob);
      const cur = byMob[key];
      if (!cur) {
        byMob[key] = m;
        continue;
      }
      byMob[key] = {
        ...cur,
        kills: cur.kills + m.kills,
        myKills: cur.myKills + m.myKills,
        drops: mergeDropLists(cur, m),
        contributors: [...new Set([...cur.contributors, ...m.contributors])],
      };
    }
    return byMob;
  }, [mobs]);
}

/**
 * The mobs on your list, paired with the zones you've actually killed them in — the Hunt tab's
 * targets.
 *
 * The zones come from **your own kills** and nowhere else: a mob's wiki page carries no sources at
 * all, so where a named lives is a question only observation answers here. A mob you've never
 * killed comes back with an empty list and is shown as a target with an unknown home rather than
 * being quietly dropped.
 *
 * `mobs.all()` pools yours with peers', which is why the rule itself is `huntTargetsFor` and not a
 * filter written here: without it the tab said "go to Lower Guk" on somebody else's word, in the
 * same words it uses for a camp you have stood in.
 */
export function useHuntTargets(entries: ShoppingListEntry[]): HuntTarget[] {
  const mobs = useAllMobs();
  return useMemo(() => huntTargetsFor(entries, mobs), [entries, mobs]);
}

/**
 * What we know about **one** mob, one row per zone it's been killed in, most kills first.
 *
 * The per-zone shape is the point: a rate is a fact about a camp, and the zone is also the only thing
 * that can open a map. `useMobKnowledge` above folds the zones together, which is right for "does it
 * drop this" and useless for "where do I go".
 */
export function useMobZones(mob: string | null): MobKnowledge[] {
  const mobs = useAllMobs();
  return useMemo(() => {
    if (!mob) return [];
    // Folded, so the wiki's "a gnoll pup" finds the kill log's "gnoll pup".
    const key = mobKey(mob);
    return mobs.filter((m) => mobKey(m.mob) === key);
  }, [mobs, mob]);
}

/**
 * What we know about **one item**: who has dropped it, where, and how that squares with the page's
 * own "Drops From" (`itemDropSources`).
 *
 * The mirror of `useMobZones` — same pooled tally, asked from the item's end — and it reads the
 * *whole* tally rather than one mob's, because "who drops this" is a question about every mob at
 * once. `wikiSources` is the open page's own list, so a source it never mentions can be named as
 * the discovery it is.
 */
export function useItemDrops(item: string | null, wikiSources: ItemSource[] = NO_ITEM_SOURCES): ItemDropSource[] {
  const mobs = useAllMobs();
  return useMemo(() => (item ? itemDropSources(item, mobs, wikiSources) : NO_ITEM_DROPS), [mobs, item, wikiSources]);
}

/**
 * The items **you have held**, as one searchable vocabulary — the loot ledger and the pooled kill
 * tally folded together (`knownItems`).
 *
 * Read when the Search tab mounts, and again on the kill notice, which is the coalesced one: every
 * drop off a corpse lands on a kill record and fires it. A foraged or ground-spawned item, which no
 * corpse accounts for, therefore reaches this list on the next kill or the next time the tab is
 * opened — a freshness limit worth taking, because the alternative is re-deriving a 20,000-line
 * ledger per loot line during a replayed gap.
 */
export function useKnownItems(): KnownItem[] {
  const looted = useFollowedRead<LootedItem[]>(
    (a) => a.loot.items(),
    (a, reload) => a.kills.onChanged(reload),
    NO_LOOTED,
    [],
  );
  const mobs = useAllMobs();
  return useMemo(() => knownItems(looted, mobs), [looted, mobs]);
}

/**
 * Sum two zones' drop counts for the same mob, then re-derive the rates from the total.
 *
 * Your own share is summed alongside the total rather than dropped, for the same reason the merge
 * carries it in the first place: a rate that has lost track of how much of it you witnessed can't be
 * checked against anybody, and folding two zones together is not a reason to stop being able to.
 */
function mergeDropLists(a: MobKnowledge, b: MobKnowledge): MobKnowledge["drops"] {
  const kills = a.kills + b.kills;
  const counts = new Map<string, { count: number; myCount: number }>();
  for (const d of [...a.drops, ...b.drops]) {
    const sum = counts.get(d.item) ?? { count: 0, myCount: 0 };
    counts.set(d.item, { count: sum.count + d.count, myCount: sum.myCount + d.myCount });
  }
  return [...counts.entries()]
    .map(([item, { count, myCount }]) => ({ item, count, myCount, rate: ratio(count, kills, 3) }))
    .sort((x, y) => y.rate - x.rate || x.item.localeCompare(y.item));
}

/**
 * Recorded kills, newest first. Re-read whenever the main process says the log changed — a kill,
 * a drop landing on a corpse, or a bulk edit (import / clear).
 *
 * That notice is the *only* trigger, which is the point. This used to take a `refreshKey` and the
 * map passed it the length of the `/loc` trail, on the reasoning that the kill count moves with
 * play — but a `/loc` is not a kill, and each one refetched all 5000 records over IPC (~10ms per
 * hop) and redrew the heatmap. A replayed gap types dozens of them in one burst, right while the
 * map window is loading its geometry, which is exactly the lag spike that made this worth fixing.
 */
export function useKills(zone: string | undefined): KillRecord[] {
  return useFollowedRead<KillRecord[]>(
    (a) => a.kills.all(zone),
    (a, reload) => a.kills.onChanged(reload),
    NO_KILLS,
    [zone],
  );
}

/**
 * Kill positions peers have shared for a place — the other half of the heatmap.
 *
 * Read from the store rather than from the room, and that is the whole change: these used to be
 * React state in the map window, so they existed only while it was open and only for as long as the
 * connection held. They are now filed as they arrive by the main process
 * ([contributions.ts](../../electron/contributions.ts)), which means the map draws everything anyone
 * has ever shared with this install — including on an evening when nobody else is online.
 */
export function usePeerKills(zone: string | undefined): SharedKill[] {
  return useFollowedRead<SharedKill[]>(
    (a) => a.peers.kills(zone),
    (a, reload) => a.peers.onChanged(reload),
    NO_PEER_KILLS,
    [zone],
  );
}

/** Stable empty, so a window with nothing pooled doesn't rerender on every read. */
const NO_PEER_KILLS: SharedKill[] = [];

/**
 * Who wears a saved style **outside the alert settings** — the spawn timers and the armed list rows.
 *
 * The Saved styles list has to be able to say "worn by 2 rules · Loot drops" and mean it, and half of
 * that answer lives in stores the Alerts tab otherwise has no reason to read (`AlertUsage`). The
 * high-score half is already in `Settings`, so the panel adds it — this hook fetches only what needs
 * fetching.
 *
 * A read of its own rather than `useSpawns`, which pulses once a second to move its countdowns: what
 * this wants is the *choice* each timer has made, and re-rendering the Alerts tab at 1Hz to learn
 * nothing new would be a bad trade for one line of text.
 */
export function useStyleUsage(): AlertUsage {
  const spawns = useFollowedRead<SpawnView>(
    (a) => a.spawns.view(),
    (a, reload) => a.spawns.onChanged(reload),
    NO_SPAWNS,
    [],
  );
  const buffs = useFollowedRead<BuffView>(
    (a) => a.buffs.view(),
    (a, reload) => a.buffs.onChanged(reload),
    NO_BUFFS,
    [],
  );
  const list = useShoppingList();
  // A mob entry never offers the 🔔 — nothing drops it — so it can't be armed and mustn't be counted.
  const lootArmed = useMemo(
    () => list.entries.filter((e) => e.notify && e.kind !== "mob").length,
    [list],
  );
  return useMemo(
    () => ({ spawns: spawns.known, buffs: buffs.known, lootArmed }),
    [spawns, buffs, lootArmed],
  );
}

/**
 * The buff board: what's up, what has lapsed, and what the player decided about each spell.
 *
 * One clock rather than the spawn board's two. A countdown needs a second hand because the *number*
 * moves on its own; a buff row says "up" or "down", which only changes when main says so. The one
 * thing that does tick is how long a buff has been held, and that is a supporting figure on a row
 * rather than the row's point — so it is allowed to be a fetch behind rather than costing every
 * open panel a re-render a second.
 */
export function useBuffs(): BuffView {
  return useFollowedRead<BuffView>(
    (a) => a.buffs.view(),
    (a, reload) => a.buffs.onChanged(reload),
    NO_BUFFS,
    [],
  );
}

/**
 * Running respawn countdowns and what's known about each named (ADR 0092).
 *
 * Two clocks, deliberately. The **list** is refetched only when main says it changed — a timer
 * started, came due, or aged out — because that's when the *facts* move. The **`tick`** is this
 * window's own second hand, and exists so a countdown counts down without a round trip per second
 * for a number the renderer can work out from a due time it already holds.
 *
 * `view.now` is main's clock at the moment of the fetch, so a row's remaining time is measured
 * against the same clock that decides a timer is due, plus however long this window has been
 * ticking since — rather than against a renderer clock that could disagree by a second and show
 * `0:00` on a timer main still calls waiting.
 */
export function useSpawns(): { view: SpawnView; now: number } {
  const view = useFollowedRead<SpawnView>(
    (a) => a.spawns.view(),
    (a, reload) => a.spawns.onChanged(reload),
    NO_SPAWNS,
    [],
  );
  // Purely a re-render pulse so the countdowns move. The value is never read: it used to be, added
  // to the view's timestamp, and that was the bug — a counter running since mount got added to the
  // timestamp of *every later fetch*, so the displayed clock ran ahead by however long the panel had
  // been open. Anything that refetched (marking a mob dead, say) then measured a brand-new timer
  // against a clock minutes in the future, and it rendered as 0:00 — a timer that looked like it
  // had never restarted.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // Captured once per **fetch** — `view` is a new object only when main sends one. Recomputing it
  // every render would pin `now` to the moment of the fetch and the clock would stop dead.
  const skew = useMemo(() => clockSkew(view.now, Date.now()), [view]);
  return { view, now: Date.now() + skew };
}

/**
 * The words your own log has actually used — spells, casters, fade targets, zones and the mobs you
 * have killed — as a trie ready to complete against.
 *
 * A hook because two tabs now want it and the fetch is not trivial: it reads a slice of the log over
 * IPC and parses it, which is worth doing **once per tab** rather than per field, since every box on
 * a tab draws on the same words and rebuilding per keystroke is what the trie exists to avoid.
 *
 * Read once on mount and not followed. It is a *help with typing*, not a live figure — re-reading
 * the log under a half-typed name to add words nobody is looking for would cost far more than it
 * could possibly be worth.
 */
export function useLogVocabulary(): Vocabulary {
  const [vocabulary, setVocabulary] = useState<Vocabulary>(NO_VOCABULARY);
  useEffect(() => {
    void api()
      ?.log.recent()
      .then((tail) => setVocabulary(buildVocabulary(parseLogText(tail?.text ?? ""))));
  }, []);
  return vocabulary;
}

/** The zone the player is currently in (from the log), or null if unknown. */
export function useCurrentZone(): string | null {
  return useLive(LIVE.zone, null);
}

/**
 * Scale this window's whole interface, as a CSS `zoom` on the document root.
 *
 * **Not** `webContents.setZoomFactor`, which was the obvious choice and cannot work: Chromium's
 * zoom is per *origin*, and every window here is served from one (`app://local` packaged,
 * `localhost:3000` in dev). Setting it on one window moved every window — so the map's A−/A+ and
 * the main window's fought over a single number instead of holding their own. Measured, not
 * assumed. CSS `zoom` is per document, so each window keeps its own.
 *
 * The shells must use `height: 100%` rather than `100vh` for this: a `vh` length gets scaled by
 * the zoom (leaving a gap), while `zoom` expands the containing block so percentages fill the
 * window exactly. See `.app` in globals.css.
 */
export function useUiScale(scale: number | undefined, range: ScaleRange = UI_SCALE): void {
  useEffect(() => {
    if (scale === undefined) return; // settings not loaded yet — leave it alone
    document.documentElement.style.zoom = String(clampScale(scale, range));
  }, [scale, range]);
}

/**
 * Own this window's live opacity, and the ◐ "fully opaque" toggle beside it.
 *
 * Two values meet here and neither is the other's business: **how translucent the app is** is one
 * app-wide preference (`overlay.opacity`, the Settings slider), while **whether this window is
 * flipped solid** is that window's own remembered state — so leaning into the map to read it never
 * clears the list, and both come back as you left them (`useWindowToggle`, ADR 0074).
 *
 * The **renderer** applies the product of the two rather than the main process: it's the only end
 * that knows both, and re-applying the saved slider from main on every settings change used to
 * clobber the override — the button read "on" while the window quietly went translucent.
 *
 * `saved` is `undefined` until settings load, which is when to leave the window alone — its
 * constructor already opened it at the right value, and applying a fallback would flash it.
 */
export function useWindowOpacity(saved: number | undefined): { opaque: boolean; toggle: () => void } {
  const { on: opaque, loaded, toggle } = useWindowToggle("opaque");
  useEffect(() => {
    if (!loaded || saved === undefined) return;
    api()?.win.setOpacity(windowOpacity(opaque, saved));
  }, [opaque, saved, loaded]);
  return { opaque, toggle };
}

/**
 * Whether this window is maximized. The main process announces it — including once per load,
 * so a fresh renderer doesn't start out guessing — because a frameless window's own titlebar
 * has no other way to know, and the window can be maximized by things that aren't our button.
 */
export function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => api()?.win.onMaximizeChanged(setMaximized), []);
  return maximized;
}

/** The player's last logged location (from `/loc`), or null if none yet. */
export function usePlayerLoc(): LocEvent | null {
  return useLive(LIVE.loc, null);
}

/**
 * A rolling trail of recent locations (oldest→newest) for drawing movement, plus a
 * `clear` for the map's "clear trail" control. Zoning wipes it: `LocEvent`s carry no
 * zone, so keeping them would draw the last zone's path across the new map.
 */
export function usePlayerTrail(limit = 200): { points: LocEvent[]; clear: () => void } {
  const [points, setPoints] = useState<LocEvent[]>([]);
  const zone = useCurrentZone();
  const clear = useCallback(() => setPoints([]), []);

  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.loc.onChanged((l) => {
      if (l) setPoints((prev) => [...prev, l].slice(-limit));
    });
  }, [limit]);

  useEffect(() => {
    clear();
  }, [zone, clear]);

  return { points, clear };
}

/**
 * React hooks over the preload bridge. Each subscribes on mount, seeds initial
 * state, and unsubscribes on unmount. They no-op cleanly when there's no Electron
 * host (e.g. during static export), so components render without special-casing.
 */

export function useShoppingList(): ShoppingList {
  return useLive(LIVE.list, EMPTY_LIST);
}

export function useSettings(): Settings | null {
  return useLive(LIVE.settings, null);
}

/**
 * Mirror the tray's "Debug logging" toggle into this renderer's log gate, so
 * `createLogger(...).debug()` actually prints (and reaches the main-process log file,
 * which pipes every renderer console). **Every window has to call this** — the gate is
 * per-renderer, so a window that skips it silently discards its own diagnostics. The
 * awari connection lives in the main window, which is exactly where they're wanted.
 */
export function useRendererDebug(): void {
  const settings = useSettings();
  const debug = settings?.debug ?? false;
  useEffect(() => {
    setRendererDebug(debug);
  }, [debug]);
}

export function useWatcherStatus(): WatcherStatus {
  return useLive(LIVE.watcher, NO_WATCHER);
}

/** Rolling feed of the most recent parsed loot lines (newest first). */
export function useLootFeed(limit = 40): LootRecord[] {
  const [events, setEvents] = useState<LootRecord[]>([]);
  /** Bumped when the ledger changes wholesale (a log eaten, a clear) — see `onDataChanged`. */
  const [refresh, setRefresh] = useState(0);
  useEffect(() => api()?.app.onDataChanged(() => setRefresh((n) => n + 1)), []);
  useEffect(() => {
    const a = api();
    if (!a) return;
    // History (the main process tracks drops whether or not this tab is open) plus the live ones,
    // *merged* — the two race, and `mergeLootFeed` owns which wins and how the overlap is spotted.
    // This used to keep whatever had arrived live and drop the history wholesale, which cost the
    // panel its entire ledger whenever one drop beat the fetch back.
    void a.loot.recent(limit).then((hist) => setEvents((prev) => mergeLootFeed(prev, hist, limit)));
    return a.loot.onEvent((e) => setEvents((prev) => [e, ...prev].slice(0, limit)));
  }, [limit, refresh]);
  return events;
}

/**
 * What each item has auto-sold for. Derived in main from the loot ledger, so it covers sales
 * from before this tab was opened; `refreshKey` re-reads it — a new sale is the only thing that
 * can change it, and the loot feed already knows when one arrives.
 */
export function useItemPrices(refreshKey: unknown): ItemPrice[] {
  return useRead((a) => a.loot.prices(), EMPTY_PRICES, [refreshKey]);
}

/**
 * Fetch the wiki `sources` for a set of list entries, keyed by name. Used by the
 * Hunt view (who drops what) and the overlay's zone narrowing (what's obtainable
 * here). Refetches only when the *set* of names changes — `wiki.getPage` is cached,
 * so this stays cheap. Returns `{}` while there's nothing to fetch.
 */
export function useEntrySources(entries: ShoppingListEntry[]): {
  sources: Record<string, ItemSource[]>;
  loading: boolean;
} {
  // Keyed on the name set, not the array identity, so this doesn't refetch every render.
  const key = entries
    .map((e) => e.name)
    .sort()
    .join("|");
  const { value: sources, loading } = useReading(
    async (a) =>
      Object.fromEntries(
        await Promise.all(entries.map(async (e) => [e.name, (await a.wiki.getPage(e.name))?.sources ?? []] as const)),
      ),
    NO_SOURCES,
    [key],
  );
  return { sources, loading };
}

/** What the wiki states about a spell — the numbers the log never gives. */
export interface SpellFacts {
  /** Mana cost, so damage can be weighed against what it cost to cast. */
  mana?: number;
  /** The wiki's stated cast time, for comparison with what we measured. */
  castSec?: number;
}

/**
 * Wiki facts for a set of spells, keyed by the name the meter uses. Mana cost is the one
 * thing needed for damage-per-mana and it isn't in the log — but it *is* on the spell's
 * wiki page, which the main process already caches, so no OCR and no guessing.
 *
 * Pages are per rank ("Spell: Shock of Lightning VI"), with the un-ranked page as the
 * fallback. Refetches only when the set of spells changes.
 */
export function useSpellFacts(spells: { spell: string; rank?: string }[]): Record<string, SpellFacts> {
  // Keyed on the spell set, not array identity (`wiki.getPage` is cached in main).
  const key = spells
    .map((s) => `${s.spell}|${s.rank ?? ""}`)
    .sort()
    .join(",");
  return useRead(
    async (a) =>
      Object.fromEntries(
        await Promise.all(
          spells.map(async ({ spell, rank }) => {
            const page =
              (rank ? await a.wiki.getPage(`Spell: ${spell} ${rank}`) : null) ??
              (await a.wiki.getPage(`Spell: ${spell}`));
            return [spell, factsFromCard(page?.card?.lines ?? [])] as const;
          }),
        ),
      ),
    NO_FACTS,
    [key],
  );
}

/** Pull the two numbers we want out of a spell card's "Label: value" lines. */
function factsFromCard(lines: string[]): SpellFacts {
  const find = (label: string): number | undefined => {
    const line = lines.find((l) => l.toLowerCase().startsWith(`${label}:`));
    const value = line ? Number.parseFloat(line.slice(line.indexOf(":") + 1)) : NaN;
    return Number.isFinite(value) ? value : undefined;
  };
  return { mana: find("mana"), castSec: find("casting time") };
}

/**
 * Drop rates keyed `mob → item → rate`, for the Hunt list. Rates live on the mob's
 * loot list (not the item's "Drops From"), so we fetch each hunt mob's page (cached)
 * and index its loot components' `dropRate`. Refetches only when the mob set changes.
 */
export function useMobLoot(mobNames: string[]): Record<string, Record<string, string>> {
  const key = mobNames
    .slice()
    .sort()
    .join("|");
  return useRead(
    async (a) =>
      Object.fromEntries(
        await Promise.all(
          mobNames.map(async (mob) => {
            const page = await a.wiki.getPage(mob);
            const rates: Record<string, string> = {};
            for (const c of page?.components ?? []) if (c.dropRate) rates[c.name] = c.dropRate;
            return [mob, rates] as const;
          }),
        ),
      ),
    NO_MOB_LOOT,
    [key],
  );
}

// The item stat card, memoized per title across the session — a name can appear in
// many rows, and hovering should hit the (already cached) page at most once.
const cardCache = new Map<string, ItemCard | null>();

/**
 * The hover stat card for a page title, fetched lazily. Pass `null` (e.g. when not
 * hovering) to fetch nothing. Non-item pages resolve to `null`. See `ItemLink`.
 */
export function useItemCard(title: string | null): ItemCard | null {
  const [card, setCard] = useState<ItemCard | null>(() => (title ? cardCache.get(title) ?? null : null));
  useEffect(() => {
    if (!title) {
      setCard(null);
      return;
    }
    if (cardCache.has(title)) {
      setCard(cardCache.get(title) ?? null);
      return;
    }
    const a = api();
    if (!a) return;
    let cancelled = false;
    void a.wiki.getPage(title).then((p) => {
      const c = p?.card ?? null;
      cardCache.set(title, c);
      if (!cancelled) setCard(c);
    });
    return () => {
      cancelled = true;
    };
  }, [title]);
  return card;
}

/**
 * What Lucy already knows about an item **by name, from its cache alone** — never a request.
 *
 * Deliberately free, because this runs on any item page and Lucy is a guest source: a page opening
 * must not put traffic on someone else's server
 * ([ADR 0124](../../specs/decisions/0124-lucy-is-a-second-opinion.md)). Something has to have
 * fetched the item first, which is what `useLucySearch` and `fetchLucyItem` are for.
 */
export function useLucyCard(name: string | null): LucyItem | null {
  return useRead((a) => (name ? a.lucy.cachedByName(name) : Promise.resolve(null)), null, [name]);
}

/**
 * Lucy's hits for a search term — **only when `ask` is true.**
 *
 * The gate is a parameter rather than a check inside, because the caller is the only thing that knows
 * whether the wiki already answered, and asking Lucy about a query the wiki answered would be a
 * request for nothing. One request per settled query, cached for a week by the main process.
 */
export function useLucySearch(term: string, ask: boolean): { hits: LucySearchResult[]; loading: boolean } {
  const { value, loading } = useReading<LucySearchResult[]>(
    (a) => (ask && term.trim() ? a.lucy.search(term) : Promise.resolve(NO_LUCY_HITS)),
    NO_LUCY_HITS,
    [term, ask],
  );
  return { hits: value, loading: ask && loading };
}

/** A stable empty list, since it's the initial value of a hook whose deps include it downstream. */
const NO_LUCY_HITS: LucySearchResult[] = [];

/** Ids of entries that were satisfied by a loot line in the last `durationMs`. */
export function useMatchFlashes(durationMs = 1500): Set<string> {
  const [flashed, setFlashed] = useState<Record<string, number>>({});
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.loot.onMatched(({ entry }) => {
      setFlashed((prev) => ({ ...prev, [entry.id]: Date.now() }));
      setTimeout(() => {
        setFlashed((prev) => {
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
      }, durationMs);
    });
  }, [durationMs]);
  return new Set(Object.keys(flashed));
}
