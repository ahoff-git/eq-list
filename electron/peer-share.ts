/**
 * peer-share.ts — the half of peer sharing that has to be running: answering asks, and keeping what
 * arrives.
 *
 * [ADR 0141](../specs/decisions/0141-the-room-is-a-meeting-place.md) made the room a meeting place
 * and the data peer-to-peer, and the rules for what may cross are pure and next door in
 * [src/shared/peer-share.ts](../src/shared/peer-share.ts). This is the holder: what our catalogue
 * says, who is allowed to have what, and where a peer's answer goes when it lands.
 *
 * **It lives in main for the same reason contributions do** ([ADR 0132](../specs/decisions/0132-a-contribution-is-keyed-by-who-made-it.md)):
 * main is the only participant that is always running. A share hub that answered only while the
 * Peers tab was open would drop every ask the moment somebody switched to their list, and a peer
 * whose data arrived while no window wanted it would have shared it into nothing.
 *
 * ## The catalogue is measured, not tracked
 *
 * `rev` has to move when a kind changes, and the cheap way to arrange that would be to teach six
 * stores to call us. That is six chances to forget, in six modules that have no business knowing
 * this one exists. Instead each kind is **materialised on a tick and digested** — the digest moving
 * *is* the change — so a store that grows a new writer keeps working and nothing has to be wired.
 *
 * A store *may* volunteer a `version` ([`ShareSource`](#ShareSource)), and where one does the read is
 * skipped entirely while it holds still. That is an optimisation on top of the rule above rather
 * than a replacement for it: a store that says nothing still works exactly as it always did, which
 * is what keeps "nothing has to be wired" true. Only the kill log volunteers one today, because only
 * it was expensive — `observations()` folds the whole log and `kills()` scans five thousand records,
 * and both were paid for once a minute whether or not a single mob had died.
 *
 * ## What crosses is what moved
 *
 * A `give` used to be the whole kind, every time: one tally out of five thousand changing meant five
 * thousand tallies on the wire. Each kind now states **what a row is** (`ShareKindSpec.rowKey`), and
 * each row remembers the revision it last changed at — so "everything since `n`" is a question this
 * hub's own state can answer, and an asker that says what it holds gets back only the difference.
 *
 * Two things keep that from becoming a second, subtler protocol nobody can reason about:
 *
 *   - **A delta is undone before anything else sees it.** `absorb` folds it into what we hold from
 *     that peer and hands the *whole* set onwards, so `contributions.ts`'s five rules, the tray, and
 *     every panel's merge go on receiving precisely what they always received. No store knows.
 *   - **It is refused whenever it cannot be trusted.** A different `epoch` (their run restarted, or
 *     ours did), a `since` older than our tombstones reach, or nothing held for them at all — each
 *     falls back to the whole exchange, which is the well-worn path rather than the exotic one. A
 *     peer too old to send an epoch never gets a delta, and never notices this happened.
 *
 * ## What is *not* here
 *
 * No merging and no display. A peer's countdowns and buffs land in the tray as they arrived, and
 * the panel that draws them merges with `mergeTimers` / `mergeBuffs` — so the de-dupe is one tested
 * function rather than a main-process opinion the windows have to agree with.
 */
import { createLogger } from "../src/shared/logging";
import { AWARI_MSG, type AwariPayload, type AwariPeer, type AwariStatus, type Settings } from "../src/shared/types";
import {
  SHARE_KINDS,
  newlyOffered,
  outOfDate,
  readAsk,
  readGive,
  readOffer,
  readProtocol,
  SHARE_PROTOCOL,
  shareKind,
  sharing,
  type PeerOfferNotice,
  type PeerVersionNotice,
  type ReceivedShare,
  type ShareDelivery,
  type ShareEntry,
  type ShareKind,
  type ShareOffer,
} from "../src/shared/peer-share";
import { decodeCoverage, type PeerCoverage } from "../src/shared/item-shards";
import type { SharedItemPage } from "../src/shared/peer-share";
import type { MapPin } from "../src/shared/map/pins";
import type { KillRecord, KnownSpawn } from "../src/shared/types";

const log = createLogger("peer-share");

/**
 * How often the catalogue is re-measured.
 *
 * Slow on purpose. Every tick materialises each shared kind, and the only thing that goes stale in
 * between is a *count in somebody else's list* — nobody is waiting on it, and a peer who asks gets
 * whatever is true at that moment regardless. Fast enough that switching a toggle on and being
 * asked within the minute works; slow enough that a big kill log isn't re-observed on a timer.
 */
const OFFER_TICK_MS = 60_000;

/** A toggle is a decision and deserves to be seen immediately, so it re-offers off the tick. */
const OFFER_DEBOUNCE_MS = 1_500;

/**
 * The shortest gap between two asks to one peer for one kind.
 *
 * A peer chooses its own `rev`, so one that moves it constantly would otherwise be fetched
 * constantly (ADR 0141 says so and declines to be clever about it). This is the un-clever answer:
 * a floor, per peer per kind, that a flapping revision cannot get under.
 */
const ASK_COOLDOWN_MS = 30_000;

/** How long a peer's answer stays in the tray after they go quiet. */
const TRAY_TTL_MS = 30 * 60_000;

/**
 * How long a fresh offer waits before it becomes a notice
 * ([ADR 0143](../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)).
 *
 * Two jobs, and the second is the one that would be a bug without it. It **coalesces**, so somebody
 * switching six toggles on is one line rather than six. And it lets `hello` land: a catalogue and a
 * name are separate messages with no ordering between them, so announcing on arrival would routinely
 * name a peer "Someone (3f9a)" — which is precisely the question the notice exists to answer.
 */
const NOTICE_DEBOUNCE_MS = 4_000;

/**
 * The wiki cache, as the share hub needs to see it.
 *
 * An interface rather than the client itself, so the hub stays ignorant of eqlwiki and this file
 * keeps its promise of knowing only about kinds, revisions and peers.
 */
export interface ItemShardSource {
  /** Cheap enough for a minute tick: no page is read to answer it. */
  status(): { pages: number; cover: string; doing?: number };
  /** The pages in one shard, ready for the wire. */
  shard(shard: number): unknown[];
}

/**
 * One kind's data, as the hub reads it.
 *
 * `version` is the whole point of this being an object rather than the bare function it used to be.
 * Measuring a kind means reading every row and working out what changed, and for the kill log that
 * is a scan of five thousand records — on a timer, almost always to conclude that nothing has moved.
 * A store that keeps a counter can answer that question for nothing, and the read is then only paid
 * for when there is something to read.
 *
 * **The contract is one-directional and that is what makes it safe to get wrong in one direction.**
 * A version that moves when nothing changed costs a wasted read and nothing else. A version that
 * *fails* to move when something did means a peer is never told — so a store that cannot answer
 * honestly should not answer at all, and one that is unsure should bump.
 */
export interface ShareSource {
  /** Everything we hold of this kind, before the kind's own projection. */
  rows: () => unknown[];
  /** A counter that moves whenever `rows()` would answer differently. Optional. */
  version?: () => number;
}

export interface PeerShareHub {
  /** Our own catalogue, as peers see it — what the toggles amount to. */
  offer(): ShareOffer;
  /** The rows we'd hand over for a kind right now. The Peers tab previews its own share with this. */
  mine(kind: ShareKind): unknown[];
  /** Handle a peer payload. Returns true when it was ours to handle. */
  handle(peerId: string, payload: AwariPayload): boolean;
  /** Ask one peer for one kind, on a person's behalf. Ignores the cooldown — they clicked. */
  ask(peerId: string, kind: ShareKind): void;
  /** Ask one peer for one **shard** of the item catalogue (ADR 0160). */
  askShard(peerId: string, shard: number): void;
  /**
   * What the room says it holds of the item catalogue — one row per peer offering `items`.
   *
   * The planner's whole input. Read rather than pushed, because the harvester asks between shards
   * and a peer's catalogue may have arrived at any point before that.
   */
  itemRoom(): PeerCoverage[];
  /** The roster changed: greet newcomers with our catalogue and drop the departed from the tray. */
  roster(peers: AwariPeer[]): void;
  /** The connection came up or went down. Held, so a window can ask rather than having to have heard. */
  noteStatus(status: AwariStatus): void;
  /**
   * The room as it stands right now — the answer to a window that has just opened.
   *
   * This exists because the roster and the status were **push-only**, and a panel that mounts when
   * you click its tab has by then missed every push: the join, and the peers who were already there.
   * "Who's here · 0 peers" with a room full of people was exactly that, and no amount of listening
   * fixes it — the reader has to be able to *ask*.
   */
  room(): { status: AwariStatus; peers: AwariPeer[] };
  /** What a peer has given us, optionally narrowed to one kind. */
  received(peerId?: string, kind?: ShareKind): ReceivedShare[];
  /** Throw away a peer's answers — one kind, one peer, or the lot. */
  clear(peerId?: string, kind?: ShareKind): void;
  /** The map window reporting its pins, which live in its own storage and nowhere else. */
  setPins(pins: MapPin[]): void;
  /** Re-measure and re-publish the catalogue soon (a toggle moved, a list changed). */
  touch(): void;
  stop(): void;
}

export interface PeerShareDeps {
  getSettings: () => Settings;
  /** Our display name, as `hello` announces it — what resolves a buff's `ON_YOU` (ADR 0141). */
  getName: () => string;
  /** Send a payload to one peer (or the room, with no `to`). */
  send: (payload: AwariPayload, to?: string) => void;
  /** File an inbound observation exactly as a broadcast one is filed (`ipc.ts`). */
  fileContribution: (payload: AwariPayload) => void;
  /** Tell every window the tray moved. */
  changed: () => void;
  /** Somebody is newly offering something worth going to look at (ADR 0143). */
  offered: (notice: PeerOfferNotice) => void;
  /**
   * Somebody in the room speaks a newer wire protocol than this build does.
   *
   * Raised at most once a session — being behind is one fact about *this install*, not one per peer,
   * and saying it five times because five people are current would make it a chore rather than a
   * notice.
   */
  outdated: (notice: PeerVersionNotice) => void;
  /** Take item pages a peer handed us into the page cache. Returns how many were new. */
  acceptItems?: (pages: SharedItemPage[], shard?: number) => number;
  /** What we'd share, per kind — the app's own data, read only when asked for. */
  sources: Record<ShareKind, ShareSource>;
  /**
   * The item catalogue, which is the one kind that cannot be read as "all its rows".
   *
   * Eleven thousand pages is neither measurable on a minute tick nor sendable in a message, so this
   * kind is addressed by **shard**: a cheap status for the catalogue line, and ~11 pages when
   * somebody asks for one ([ADR 0160](../specs/decisions/0160-a-room-fills-the-catalogue-once.md)).
   */
  items?: ItemShardSource;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  /**
   * The two debounces (a catalogue re-publish, a notice) on the same terms as the tick above.
   *
   * Injectable for the same reason: every deadline in here is seconds to minutes long, and a test
   * that had to wait one out in real time would either be slow or would stop being written.
   */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export function createPeerShareHub(deps: PeerShareDeps): PeerShareHub {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer = deps.clearInterval ?? ((h) => clearInterval(h as NodeJS.Timeout));
  const later = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = deps.clearTimeout ?? ((h) => clearTimeout(h as NodeJS.Timeout));

  /**
   * Which **run** this is, stamped on every revision we publish.
   *
   * See `ShareEpoch`: a revision counter that restarts is a counter that lies, and this is what makes
   * the restart detectable rather than silently wrong. Per-run and never persisted, because a restart
   * already costs one whole exchange today.
   */
  const epoch = randomId().slice(0, 8);

  /** One row as we last measured it: what it said, and when it last changed. */
  interface MeasuredRow {
    row: unknown;
    /** What the row said last time, for telling a real change from a re-read. */
    digest: string;
    /** The revision at which it last changed. */
    seq: number;
  }

  /**
   * The last measurement of one kind — the state a delta is computed against.
   *
   * `seq` is the kind's revision and only ever goes up, so "everything since `n`" is a question the
   * rows can answer themselves. `gone` is the other half of that answer: a row that left is news
   * exactly as much as a row that changed, and a delta that could only add would let a receiver hold
   * a deleted row for ever.
   */
  interface Measured {
    rows: Map<string, MeasuredRow>;
    /** Keys that have gone, and the revision they went at. */
    gone: Map<string, number>;
    /** The kind's revision: the highest `seq` anything in it has been given. */
    seq: number;
    /**
     * The source's own version when this was taken, when it reports one — so an unchanged source
     * costs nothing at all rather than costing a re-read and a digest.
     */
    version?: number;
    /**
     * The oldest `since` a delta can still be honestly computed for.
     *
     * Tombstones are bounded, and a pruned one is a deletion we can no longer tell anybody about. An
     * ask from before the floor is answered whole rather than with a delta that would quietly leave
     * the asker holding rows we know are gone.
     */
    floor: number;
  }

  const measured = new Map<ShareKind, Measured>();

  /**
   * Most tombstones to keep per kind. Beyond this the oldest go and the floor rises, which costs a
   * peer that has been away a long time one whole exchange — the thing that already happens on every
   * restart, so nothing new can go wrong by it.
   */
  const MAX_TOMBSTONES = 2000;
  /** Peers' answers, keyed `peerId:kind`. */
  const tray = new Map<string, ReceivedShare>();
  /**
   * What we hold from each peer, keyed by that peer's own row keys — the state a delta is applied to.
   *
   * Separate from the tray, and not merely a copy of it, for two reasons. **Observations never reach
   * the tray at all** (they go straight to `contributions.ts`), and they are the kinds a delta is
   * most worth having for — five thousand tallies, one of which moved. And the tray holds rows for a
   * *reader*, in the order and shape a panel wants, while this holds them under the sender's keys,
   * which is the only thing a delta can be applied against.
   */
  const heldFrom = new Map<string, { epoch?: string; rev: number; rows: Map<string, unknown> }>();
  /** When we last asked each peer for each kind, keyed the same way. */
  const asked = new Map<string, number>();
  /** Their catalogues, so an automatic fetch can tell "changed" from "same as last time". */
  const offers = new Map<string, ShareOffer>();
  /** When each catalogue landed — the clock a shard claim expires against. */
  const offerAt = new Map<string, number>();
  /** Peers as the roster last described them — where a name and a session id come from. */
  const known = new Map<string, AwariPeer>();
  /** What wire protocol each peer speaks, from their catalogue. Read by the Peers tab's rows. */
  const protocols = new Map<string, number>();
  /**
   * Whether we have already said we are behind the room.
   *
   * Session-scoped and never reset by a peer coming or going: the fact is about this install, and a
   * notice that came back every time somebody re-joined would be the chore ADR 0143 is written to
   * avoid.
   */
  let toldAboutVersion = false;
  /** The pending version notice, coalescing the room's catalogues into one line. */
  let versionTimer: unknown = null;
  /** The connection, as the owner window last reported it. Held so a late window can ask for it. */
  let status: AwariStatus = { connected: false, peerId: null };
  /**
   * What we've already told the player about, **keyed by who rather than by connection**.
   *
   * A peer id is per-session and a dropped room re-joins under a fresh one
   * ([ADR 0070](../specs/decisions/0070-a-dropped-room-rejoins-itself.md)), so keying this by id
   * would re-announce the same people every time the network hiccuped. Keyed by the name the notice
   * would actually say, which is the thing the reader would be seeing twice.
   */
  const announced = new Map<string, Set<ShareKind>>();
  /** Newly-offered kinds waiting to become one notice per peer (see `NOTICE_DEBOUNCE_MS`). */
  const pendingNotices = new Map<string, Set<ShareKind>>();
  let noticeTimer: unknown = null;
  let pins: MapPin[] = [];
  let debounce: unknown = null;

  const trayKey = (peerId: string, kind: ShareKind) => `${peerId}:${kind}`;

  /**
   * The revision we hold from a peer for a kind, or `undefined` for nothing held.
   *
   * Read off `heldFrom` rather than off the tray, and that is a fix rather than a tidy-up: the tray
   * never held observations at all (they go straight to `contributions.ts`), so this answered
   * `undefined` for every pooled kind — which made `outOfDate` say "behind" every single minute and
   * re-fetch five thousand tallies that had not moved. Now every kind records what it holds, so the
   * comparison ADR 0145 describes can actually come out equal.
   */
  const heldRev = (peerId: string, kind: ShareKind): number | undefined => heldFrom.get(trayKey(peerId, kind))?.rev;

  /** An empty measurement, for a kind nothing has been read for yet. */
  const noMeasurement = (): Measured => ({ rows: new Map(), gone: new Map(), seq: 0, floor: 0 });

  /**
   * What one row says, for telling a real change from a re-read.
   *
   * Only ever compared with itself, so it needs to be cheap and stable rather than cryptographic — a
   * collision costs one skipped update of one row, and the reconciliation tick catches that.
   */
  const digestOf = (row: unknown): string => JSON.stringify(row) ?? "";

  /**
   * Re-read one kind, and work out what actually moved.
   *
   * ## Why a version is asked for first
   *
   * This used to materialise every shared kind on every tick and `JSON.stringify` the lot to decide
   * whether anything had changed — which for the kill log meant scanning five thousand records,
   * projecting them, serialising the result, and keeping its *length*. The tick was slow precisely to
   * make that affordable. A source that can say "nothing has written to me since you last asked"
   * makes the whole question free, so one is asked for and the read is skipped when it says so.
   *
   * A source without a version still works exactly as before — read, project, digest — because a
   * source that cannot answer cheaply must not be forced to answer wrongly.
   *
   * ## Why rows are keyed
   *
   * The **revision only ever goes up**, and each row remembers the revision it last changed at, so
   * "everything since `n`" is a question this state can answer without keeping a copy per peer. A row
   * that leaves becomes a tombstone for the same reason: a delta that could only add would let a
   * receiver hold a deleted row for ever.
   */
  function measure(kind: ShareKind): Measured {
    // `items` is never materialised: there are eleven thousand of them and the catalogue line is
    // built from `itemStatus()` instead (see `offer`). Measuring it would read the whole page cache
    // off disk once a minute to produce a number nobody reads.
    if (kind === "items") {
      const held = measured.get(kind) ?? noMeasurement();
      held.seq = itemRev();
      measured.set(kind, held);
      return held;
    }

    const held = measured.get(kind) ?? noMeasurement();
    const source = deps.sources[kind];

    // Pins are pushed in by the map window rather than read from a store, so they have no version to
    // ask for — the push is the change, and `setPins` re-measures.
    if (kind !== "pins" && source?.version) {
      const version = safely(kind, source.version, 0);
      if (held.version === version && measured.has(kind)) return held;
      held.version = version;
    }

    const raw = kind === "pins" ? pins : safely(kind, () => source?.rows() ?? [], []);
    const spec = shareKind(kind);
    // Projected **before** anything is keyed or digested, so a change to a field that never leaves
    // does not make a row look changed to anybody.
    const rows = spec?.project ? safely(kind, () => spec.project!(raw, { myName: deps.getName() }), []) : raw;

    const seen = new Map<string, MeasuredRow>();
    let seq = held.seq;
    let moved = 0;

    for (const row of rows) {
      const digest = digestOf(row);
      // A row whose kind cannot identify it is keyed by what it says. It then churns on every edit —
      // an edit reads as one row leaving and another arriving — which is correct, merely chattier
      // than a kind that can name its rows.
      const key = spec?.rowKey?.(row) ?? `~${digest}`;
      const before = held.rows.get(key);
      if (before && before.digest === digest) {
        // Unchanged: it keeps the revision it last moved at, which is what makes a delta narrow.
        seen.set(key, before);
        continue;
      }
      seq++;
      moved++;
      seen.set(key, { row, digest, seq });
    }

    for (const [key] of held.rows) {
      if (seen.has(key)) continue;
      seq++;
      moved++;
      held.gone.set(key, seq);
    }
    // A key that has come back is no longer gone. Checked after the sweep above so a row that left
    // and returned within one tick ends up present rather than tombstoned.
    for (const key of seen.keys()) held.gone.delete(key);

    held.rows = seen;
    held.seq = seq;

    if (held.gone.size > MAX_TOMBSTONES) {
      // Oldest first, and the floor rises to the newest one dropped: past this point we can no longer
      // tell anybody what went, so an older `since` has to be answered whole.
      const ordered = [...held.gone.entries()].sort((a, b) => a[1] - b[1]);
      const drop = ordered.slice(0, held.gone.size - MAX_TOMBSTONES);
      for (const [key, at] of drop) {
        held.gone.delete(key);
        held.floor = Math.max(held.floor, at);
      }
    }

    measured.set(kind, held);
    if (moved) log.debug("measured", kind, `${rows.length} rows,`, moved, "moved, rev", seq);
    return held;
  }

  /** The rows of a measurement, in no particular order — what a whole `give` sends. */
  const rowsOf = (m: Measured): unknown[] => [...m.rows.values()].map((r) => r.row);

  /**
   * Our own catalogue coverage, cached between ticks.
   *
   * Cheap by contract (the wiki client keeps the bitmap in memory), but it is read on every offer
   * and every ask, and the revision has to move when — and only when — the coverage does.
   */
  let itemsHeld: { pages: number; cover: string; doing?: number } | null = null;
  let itemsCover = "";
  let itemsRev = 0;

  function itemStatus(): { pages: number; cover: string; doing?: number } | null {
    if (!deps.items) return null;
    try {
      itemsHeld = deps.items.status();
    } catch (e) {
      log.debug("could not read the item catalogue -", (e as Error).message);
      return itemsHeld;
    }
    // The revision follows the *coverage*, not the page count: a page re-fetched on its TTL changes
    // the count and nothing a peer would want to re-ask about.
    if (itemsHeld.cover !== itemsCover) {
      itemsCover = itemsHeld.cover;
      itemsRev++;
    }
    return itemsHeld;
  }

  const itemRev = (): number => {
    itemStatus();
    return itemsRev;
  };

  /** A source that throws must not take the catalogue down with it — an empty kind is a fine answer. */
  function safely<T>(kind: ShareKind, read: () => T, fallback: T): T {
    try {
      return read() ?? fallback;
    } catch (e) {
      log.debug("could not read", kind, "-", (e as Error).message);
      return fallback;
    }
  }

  function offer(): ShareOffer {
    const settings = deps.getSettings();
    const catalogue: ShareOffer = {};
    // A kind that isn't switched on is **absent**, not zero: the catalogue is the toggle state, so
    // "I share none" and "I don't share this" must not look alike (ADR 0141).
    for (const spec of SHARE_KINDS) {
      if (!sharing(settings.share, spec.key)) continue;
      if (spec.key === "items") {
        const held = itemStatus();
        if (!held) continue;
        // The coverage bitmap *is* the coordination channel — 256 characters of hex, in a message
        // the room was already sending every minute (ADR 0160).
        catalogue.items = { n: held.pages, rev: itemRev(), cover: held.cover, doing: held.doing };
        continue;
      }
      const held = measure(spec.key);
      // The epoch rides on every line, because it is what tells a peer whether the `rev` beside it
      // can be compared with the one they remember (`ShareEpoch`). A peer too old to read it simply
      // never sends one back, and gets whole answers for ever — which is what it already expected.
      catalogue[spec.key] = { n: held.rows.size, rev: held.seq, epoch } satisfies ShareEntry;
    }
    return catalogue;
  }

  /**
   * Publish the catalogue to the room — the one broadcast this whole feature makes.
   *
   * It carries our **name** as well, which is redundant with `hello` on purpose. A `hello` is sent
   * on join and on a rename, so a peer who missed both stays "Someone (3f9a)" for the whole session
   * — and a nameless row is the one thing that makes this panel unusable. The catalogue goes out
   * every minute regardless, so letting it name us costs nothing and gives the roster a second,
   * self-healing way to learn who everybody is.
   */
  function publishOffer(): void {
    if (!deps.getSettings().connectPeers) return;
    // The protocol rides on the **envelope** rather than on each catalogue line: it describes the
    // client, not a kind, and the catalogue already goes out every minute — so this self-heals for a
    // peer who missed one, on exactly the argument ADR 0145 makes for the name beside it.
    deps.send({ kind: AWARI_MSG.offer, name: deps.getName(), protocol: SHARE_PROTOCOL, ...offer() });
  }

  function touch(): void {
    if (debounce) cancel(debounce);
    debounce = later(() => {
      debounce = null;
      publishOffer();
    }, OFFER_DEBOUNCE_MS);
  }

  /**
   * Hand a peer what they asked for — if we're actually sharing it.
   *
   * The toggle is checked **here** rather than trusted from the catalogue we last published: an
   * offer is a cache of a setting, the setting is the truth, and the gap between them is exactly a
   * toggle somebody switched off ten seconds ago.
   */
  function answer(peerId: string, raw: AwariPayload): void {
    const ask = readAsk(raw);
    if (!ask) return void log.debug("ask ignored - unknown kind", raw.what);
    const settings = deps.getSettings();
    if (!sharing(settings.share, ask.what)) return void log.debug("ask refused - not sharing", ask.what);

    // A shard, not a kind: "send me every item page you have" is not a request anybody can answer,
    // so this one names the slice it wants and gets that.
    if (ask.what === "items") {
      if (ask.shard === undefined) return void log.debug("items ask ignored - no shard named");
      const rows = deps.items?.shard(ask.shard) ?? [];
      deps.send({ kind: AWARI_MSG.give, what: "items", rev: itemRev(), from: deps.getName(), shard: ask.shard, rows }, peerId);
      log.debug("gave items shard", ask.shard, `(${rows.length} pages)`, "to", peerId);
      return;
    }

    const held = measure(ask.what);
    const from = deps.getName();

    // "Nothing changed since the revision you have" is a real answer, and the cheapest one — every
    // field absent says it, which `readGive` keeps distinct from an empty `rows` (that means "now
    // empty", which ADR 0056 reads as an un-share).
    // An asker that named **no** epoch gets the old semantics — "same number, same data" — because
    // that is the bargain every build before this one was already making, and tightening it here
    // would cost an old peer a whole exchange a minute for a safety it never had. An asker that named
    // a *different* epoch is a peer we have restarted under, and their number means nothing to us.
    const sameRun = ask.epoch === undefined || ask.epoch === epoch;
    if (ask.since !== undefined && ask.since === held.seq && sameRun) {
      deps.send({ kind: AWARI_MSG.give, what: ask.what, rev: held.seq, from }, peerId);
      return void log.debug("gave", ask.what, "(unchanged)", "to", peerId);
    }

    // A delta is only honest when the asker's number was counted in **this** run and is still inside
    // what our tombstones can account for. Anything else gets the whole kind — which is what every
    // exchange was before this, so the fallback is the well-worn path rather than the exotic one.
    const canDelta =
      ask.epoch === epoch && ask.since !== undefined && ask.since >= held.floor && ask.since < held.seq;

    if (canDelta) {
      const since = ask.since!;
      const changes: { k: string; r: unknown }[] = [];
      for (const [key, row] of held.rows) if (row.seq > since) changes.push({ k: key, r: row.row });
      const gone: string[] = [];
      for (const [key, at] of held.gone) if (at > since) gone.push(key);
      deps.send({ kind: AWARI_MSG.give, what: ask.what, rev: held.seq, from, epoch, changes, gone }, peerId);
      return void log.debug(
        "gave",
        ask.what,
        `delta since ${since}: ${changes.length} changed, ${gone.length} gone (of ${held.rows.size})`,
        "to",
        peerId,
      );
    }

    // Rows and their keys, positionally. The keys are what lets the *next* exchange be a delta: the
    // asker files these rows under our keys, so a later "this one changed" lands on the right one.
    const rows: unknown[] = [];
    const keys: string[] = [];
    for (const [key, row] of held.rows) {
      rows.push(row.row);
      keys.push(key);
    }
    deps.send({ kind: AWARI_MSG.give, what: ask.what, rev: held.seq, from, epoch, rows, keys }, peerId);
    log.debug("gave", ask.what, `(${rows.length} rows)`, "to", peerId);
  }

  /**
   * Keep what a peer gave us: observations go to the stores, everything else to the tray.
   *
   * ## A delta is undone before anything else sees it
   *
   * Everything downstream — the tray, `contributions.ts`'s five rules, every panel that merges —
   * takes **a peer's whole current set**, and that is deliberately unchanged. A delta is a saving on
   * the wire and nothing more: it is applied to what we already hold from that peer, and what comes
   * out the other side is the same complete set the same code has always been handed. So
   * `contributions.ts` rule 2 ("a report replaces that contributor's set") stays exactly true, and no
   * store had to learn what a delta is.
   */
  function keep(peerId: string, raw: AwariPayload): void {
    const give = readGive(raw, () => randomId());
    if (!give) return void log.debug("give ignored - unknown kind", raw.what);
    if (give.mode === "unchanged") return void log.debug("give unchanged:", give.what, "from", peerId);

    const spec = shareKind(give.what);
    if (spec?.family === "mirror") {
      // Straight into the page cache, without a tray and without anybody clicking. It is the one
      // family that may: these are copies of eqlwiki's own public pages, identical for everyone, and
      // the alternative to accepting one is asking eqlwiki the same question a second time. They are
      // still read through `readSharedPage` first, and they still expire on our TTL — so a page a
      // peer got wrong is corrected by the source, on its own
      // ([ADR 0160](../specs/decisions/0160-a-room-fills-the-catalogue-once.md)).
      //
      // Never a delta: `items` is addressed by shard, and a shard is already the small unit
      // (ADR 0160). A delta of one would be answering a question nobody asked.
      const pages = give.mode === "whole" ? give.rows : [];
      const taken = deps.acceptItems?.(pages as SharedItemPage[], give.shard) ?? 0;
      log.debug("took", taken, "of", pages.length, "item pages from", peerId, "shard", give.shard);
      return;
    }

    const rows = absorb(peerId, give);
    if (!rows) return;

    if (spec?.family === "observation") {
      // Straight into the existing pipeline, contributor id and all — pulling rather than being
      // pushed changed the transport and nothing about the trust model (ADR 0141). The id rides on
      // the payload the peer sent, exactly as it did when this was a broadcast.
      deps.fileContribution({ kind: give.what, [give.what]: rows, id: raw.id, name: raw.name });
      return;
    }
    tray.set(trayKey(peerId, give.what), {
      peerId,
      kind: give.what,
      from: give.from,
      rows,
      rev: give.rev,
      at: now(),
    });
    log.debug("kept", rows.length, give.what, "from", peerId);
    deps.changed();
  }

  /**
   * Fold a delivery into what we hold from that peer, and hand back their whole current set.
   *
   * `null` means "we cannot honestly say what they hold": a delta arrived for a peer or an epoch we
   * have nothing for, which happens when they restarted, when a `give` was lost, or when this is
   * simply the first thing we have heard. Nothing is applied and nothing is guessed — `askAgain`
   * re-asks without a `since`, and the minute reconciliation would have caught it regardless.
   */
  function absorb(peerId: string, give: ShareDelivery & { mode: "whole" | "delta" }): unknown[] | null {
    const key = trayKey(peerId, give.what);
    if (give.mode === "whole") {
      const rows = new Map<string, unknown>(give.keyed.map((k): [string, unknown] => [k.key, k.row]));
      heldFrom.set(key, { epoch: give.epoch, rev: give.rev, rows });
      return give.rows;
    }

    const held = heldFrom.get(key);
    if (!held || held.epoch !== give.epoch) {
      log.debug("delta unusable:", give.what, "from", peerId, held ? "(epoch moved)" : "(nothing held)");
      askAgain(peerId, give.what);
      return null;
    }
    for (const { key: k, row } of give.changes) held.rows.set(k, row);
    for (const k of give.gone) held.rows.delete(k);
    held.rev = give.rev;
    log.debug(
      "applied delta:",
      give.what,
      `${give.changes.length} changed, ${give.gone.length} gone, now ${held.rows.size}`,
      "from",
      peerId,
    );
    return [...held.rows.values()];
  }

  /**
   * Ask again from nothing, for a delta we could not use.
   *
   * The held state is dropped **first**, which is what makes the next ask a whole one: `since` is
   * read off what we hold, so a stale entry left in place would ask the same unusable question again.
   */
  function askAgain(peerId: string, kind: ShareKind): void {
    heldFrom.delete(trayKey(peerId, kind));
    tray.delete(trayKey(peerId, kind));
    askFor(peerId, kind, true);
  }

  /**
   * Ask a peer for a kind, unless we asked very recently — or cannot reach them at all.
   *
   * The addressability check is here rather than at each caller because of what it protects: a
   * `send` to a peer with no session id is **dropped by the owner window**, and asking anyway would
   * still write the cooldown. A catalogue that arrives a moment before the roster row it belongs to
   * would therefore burn the one ask and then refuse to repeat it for the next half minute, which
   * turns a harmless ordering race into a real wait for the data.
   */
  function askFor(peerId: string, kind: ShareKind, force: boolean): void {
    if (!known.get(peerId)?.sessionId) return void log.debug("ask held - peer not addressable yet:", peerId, kind);
    const key = trayKey(peerId, kind);
    const last = asked.get(key) ?? 0;
    if (!force && now() - last < ASK_COOLDOWN_MS) return;
    asked.set(key, now());
    // `since` is only sent while the epoch it was counted in still matches what the peer is
    // publishing. A number from before their restart means nothing to them, and sending it alone is
    // how a receiver would silently miss everything that changed in between.
    //
    // **The comparison is what matters, not that either side has one.** Two `undefined`s match, and
    // that is the case of a peer too old to have epochs at all: it gets `since` with no epoch, which
    // is exactly the ask every build before this one sent, and answers "unchanged" to it. Requiring
    // an epoch here instead cost an old peer the cheap answer and re-fetched their whole catalogue
    // every time it moved — the fallback has to be the *old* exchange, not no exchange.
    const held = heldFrom.get(key);
    const theirEpoch = offers.get(peerId)?.[kind]?.epoch;
    const since = held && held.epoch === theirEpoch ? held.rev : undefined;
    deps.send(
      {
        kind: AWARI_MSG.ask,
        what: kind,
        ...(since === undefined ? {} : { since }),
        ...(since !== undefined && held?.epoch ? { epoch: held.epoch } : {}),
      },
      peerId,
    );
    log.debug("asked", peerId, "for", kind, since === undefined ? "(everything)" : `(since ${since})`);
  }

  /**
   * A peer's catalogue arrived: fetch the **observations** they're offering that have moved on.
   *
   * Only observations, and only automatically. They are the pooled family — wanted by default,
   * filed without anybody looking, and the whole reason for a shared body of knowledge. Everything
   * else waits for a person to click, because an authored artifact fetched behind your back is a
   * tray filling up with other people's work you never asked to see.
   */
  function sawOffer(peerId: string, payload: AwariPayload): void {
    // Through the shared reader, which checks the shape of every line — the same one the renderer's
    // roster builder uses. There were two readers for this message and only one of them checked
    // anything; this was the other.
    const catalogue = readOffer(payload.offer ?? payload);
    noteProtocol(peerId, readProtocol(payload.offer ?? payload));
    const before = offers.get(peerId);
    offers.set(peerId, catalogue);
    // When it arrived, which is what a shard claim's TTL is measured against: a peer who stopped
    // publishing has stopped working, and their claim must not hold a shard for ever (ADR 0160).
    offerAt.set(peerId, now());
    if (!deps.getSettings().connectPeers) return;
    noteWorthTelling(peerId, newlyOffered(catalogue, before));
    for (const spec of SHARE_KINDS) {
      if (spec.family !== "observation") continue;
      const entry = catalogue[spec.key];
      if (!entry || entry.n <= 0) continue;
      askFor(peerId, spec.key, false);
    }
  }

  /** The name a notice would use for a peer — announced if they've said, a short id if not. */
  function nameOf(peerId: string): string {
    return known.get(peerId)?.name?.trim() || `Someone (${peerId.slice(-4)})`;
  }

  /**
   * Note what protocol a peer speaks, and say something if it is one we haven't got.
   *
   * **Only when we are the old one**, which is the asymmetry the whole feature turns on. A peer
   * running an older build is not something the reader can do anything about
   * ([ADR 0143](../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)'s second
   * narrowing) — it sits on their row in the Peers tab for anyone curious, and raises nothing. A peer
   * running a *newer* one means this install is the one falling back, and that is a thing a person
   * can fix.
   *
   * **Once a session.** Being behind is one fact about this install rather than one per peer, and a
   * room where four people are current must not produce four notices — the same discipline
   * [ADR 0093](../specs/decisions/0093-a-high-score-is-a-personal-best-with-a-floor.md) applied to a
   * fresh scoreboard. Nor does meeting a *third* protocol later re-raise it: you are behind either
   * way and the thing to do about it has not changed. The Peers tab carries it durably, which is what
   * lets the notice be this quiet (`toasts.ts`: a toast is never the only place something is said).
   */
  function noteProtocol(peerId: string, theirs: number): void {
    protocols.set(peerId, theirs);
    if (theirs <= SHARE_PROTOCOL || toldAboutVersion || versionTimer) return;
    if (!deps.getSettings().connectPeers) return;
    // Waited out for the same two reasons the offer notice is
    // ([ADR 0143](../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)). Catalogues
    // arrive one per peer within a second or two of joining, so raising this on the first one to
    // land would name whoever happened to be first and read as *that person's* problem rather than
    // as ours. And it lets `hello` land, so the notice can use names instead of "Someone (3f9a)".
    versionTimer = later(() => {
      versionTimer = null;
      if (toldAboutVersion || !deps.getSettings().connectPeers) return;
      const ahead = [...protocols.entries()].filter(([, p]) => p > SHARE_PROTOCOL);
      if (!ahead.length) return;
      toldAboutVersion = true;
      const newest = Math.max(...ahead.map(([, p]) => p));
      const names = ahead.map(([id]) => nameOf(id)).sort();
      log.debug("we are behind the room:", { ours: SHARE_PROTOCOL, newest, names });
      deps.outdated({ theirs: newest, ours: SHARE_PROTOCOL, peers: names });
    }, NOTICE_DEBOUNCE_MS);
  }

  /**
   * Queue what's newly on offer, to go out as one notice per peer once the dust settles.
   *
   * Two refusals here rather than in `newlyOffered`, because both are facts about the *connection*
   * and that function is a rule about catalogues:
   *
   *   - a peer we can't address is offering something nobody can ask them for, so a notice would
   *     point at a button that does nothing;
   *   - a kind this person has already been announced for is not news, however many times they
   *     toggle it (ADR 0143 — the second announcement carries nothing the first didn't).
   */
  function noteWorthTelling(peerId: string, kinds: ShareKind[]): void {
    if (!kinds.length || !known.get(peerId)?.sessionId) return;
    const seen = announced.get(nameOf(peerId)) ?? new Set<ShareKind>();
    const fresh = kinds.filter((k) => !seen.has(k));
    if (!fresh.length) return;
    const pending = pendingNotices.get(peerId) ?? new Set<ShareKind>();
    for (const kind of fresh) pending.add(kind);
    pendingNotices.set(peerId, pending);
    if (noticeTimer) cancel(noticeTimer);
    noticeTimer = later(flushNotices, NOTICE_DEBOUNCE_MS);
  }

  /**
   * Raise what's queued: one notice per peer, and remember it so nobody hears it twice.
   *
   * The already-announced set is written **here** rather than when the offer arrived, so a peer
   * whose name only turned up during the wait is remembered under the name they were actually
   * announced as — otherwise a `hello` landing mid-debounce would file them under "Someone (3f9a)"
   * and let the real name through as a second notice.
   */
  function flushNotices(): void {
    noticeTimer = null;
    for (const [peerId, kinds] of pendingNotices) {
      const name = nameOf(peerId);
      const seen = announced.get(name) ?? new Set<ShareKind>();
      const fresh = [...kinds].filter((k) => !seen.has(k));
      if (!fresh.length) continue;
      for (const kind of fresh) seen.add(kind);
      announced.set(name, seen);
      // Catalogue order, not arrival order, so two peers offering the same things read the same way.
      const ordered = SHARE_KINDS.filter((spec) => fresh.includes(spec.key)).map((spec) => spec.key);
      log.debug("offer worth telling:", name, ordered.join(", "));
      deps.offered({ peerId, name, kinds: ordered });
    }
    pendingNotices.clear();
  }

  const tick = setTimer(() => {
    sweep();
    publishOffer();
    reconcile();
  }, OFFER_TICK_MS);

  /**
   * Ask again for anything a peer holds that has moved past what we have.
   *
   * The point is that this is a **comparison, not a reaction**: an ask used to happen only when an
   * offer arrived with a moved revision, which quietly assumed every offer is seen and every answer
   * lands. A lost `give`, a restart mid-conversation, an offer that turned up while `connectPeers`
   * was off — any of those and the two installs disagree for ever, both believing otherwise. This is
   * what stops the pool sitting still.
   *
   * The per-peer-per-kind cooldown (`askFor`) is what keeps it from being chatty: a kind already
   * asked for recently is skipped, so a peer whose revision flaps costs one ask a cooldown rather
   * than one a tick.
   */
  function reconcile(): void {
    if (!deps.getSettings().connectPeers) return;
    for (const [peerId, catalogue] of offers) {
      for (const kind of outOfDate(catalogue, (k) => heldRev(peerId, k))) {
        askFor(peerId, kind, false);
      }
    }
  }

  /** Drop answers nobody has refreshed in a while, so a long session doesn't accumulate the room. */
  function sweep(): void {
    const cutoff = now() - TRAY_TTL_MS;
    let dropped = 0;
    for (const [key, entry] of tray) {
      if (entry.at < cutoff) {
        tray.delete(key);
        // The delta state goes with it. Keeping it would leave us asking "what changed since 40?"
        // about rows we have just thrown away, and filing the answer as if it were the whole set.
        heldFrom.delete(key);
        dropped += 1;
      }
    }
    if (dropped) deps.changed();
  }

  return {
    offer,
    mine: (kind) => rowsOf(measure(kind)),
    handle(peerId, payload) {
      switch (payload.kind) {
        case AWARI_MSG.offer:
          sawOffer(peerId, payload);
          return true;
        case AWARI_MSG.ask:
          answer(peerId, payload);
          return true;
        case AWARI_MSG.give:
          keep(peerId, payload);
          return true;
        default:
          return false;
      }
    },
    ask: (peerId, kind) => askFor(peerId, kind, true),

    askShard(peerId, shard) {
      // No cooldown and no revision: a shard is asked for once, by the planner, because it worked
      // out that this peer has something we don't. Repeating it would mean the planner was wrong,
      // and a rate limit would only hide that.
      deps.send({ kind: AWARI_MSG.ask, what: "items", shard }, peerId);
      log.debug("asked", peerId, "for item shard", shard);
    },

    itemRoom() {
      const room: PeerCoverage[] = [];
      for (const [peerId, catalogue] of offers) {
        const entry = catalogue.items;
        if (!entry?.cover) continue;
        room.push({
          peerId,
          have: decodeCoverage(entry.cover),
          doing: entry.doing,
          // The catalogue's arrival time is what a claim's TTL is measured from — a peer who has
          // gone quiet stops holding a shard reserved (`CLAIM_TTL_MS`).
          at: offerAt.get(peerId) ?? 0,
        });
      }
      return room;
    },

    noteStatus(next) {
      status = next;
      // A room we are no longer in has no roster and no catalogues: keeping them would let a window
      // that opens during an outage read a list of people who cannot hear it. The **tray** survives,
      // because what somebody already handed over is ours whether or not they are still here.
      if (!next.connected) {
        known.clear();
        offers.clear();
        offerAt.clear();
        pendingNotices.clear();
      }
    },
    room: () => ({
      status,
      // The protocol is folded in here rather than tracked by the window, because the catalogue it
      // comes from is a message the hub already handles and a late-opening panel has missed
      // (ADR 0144). A peer we have heard no catalogue from is left unstated rather than assumed
      // current — "hasn't said" and "says 1" look different on a row.
      peers: [...known.values()].map((p) => {
        const protocol = protocols.get(p.peerId);
        return protocol === undefined ? p : { ...p, protocol };
      }),
    }),
    roster(peers) {
      // Somebody who has left can't answer and their catalogue is a promise about a session that is
      // over. Their *tray* stays until it ages out: what they already handed over is ours to look
      // at, and losing a list you were halfway through copying because they logged off is worse
      // than a slightly stale row.
      const here = new Set(peers.map((p) => p.peerId));
      known.clear();
      for (const peer of peers) known.set(peer.peerId, peer);
      for (const peerId of [...offers.keys()]) {
        if (here.has(peerId)) continue;
        offers.delete(peerId);
        offerAt.delete(peerId);
        protocols.delete(peerId);
      }
      // A notice about somebody who left before it went out would point at a row that isn't there.
      for (const peerId of [...pendingNotices.keys()]) if (!here.has(peerId)) pendingNotices.delete(peerId);
      // A newcomer has missed every catalogue we published, so publish again — the same argument
      // ADR 0015 makes for re-announcing `hello`, and the same one-broadcast cost.
      touch();
    },
    received(peerId, kind) {
      return [...tray.values()].filter((e) => (!peerId || e.peerId === peerId) && (!kind || e.kind === kind));
    },
    clear(peerId, kind) {
      for (const [key, entry] of tray) {
        if ((!peerId || entry.peerId === peerId) && (!kind || entry.kind === kind)) tray.delete(key);
      }
      // The delta state goes with the rows it describes. Left behind, the next ask would say "since
      // 40" about a set we have just discarded, and the peer would answer with the handful that
      // moved — which we would then file as though it were everything they hold.
      for (const key of [...heldFrom.keys()]) {
        const cut = key.lastIndexOf(":");
        if (peerId && key.slice(0, cut) !== peerId) continue;
        if (kind && key.slice(cut + 1) !== kind) continue;
        heldFrom.delete(key);
      }
      deps.changed();
    },
    setPins(next) {
      pins = next;
      touch();
    },
    touch,
    stop() {
      if (debounce) cancel(debounce);
      if (noticeTimer) cancel(noticeTimer);
      if (versionTimer) cancel(versionTimer);
      clearTimer(tick);
    },
  };
}

/** Ids for rows read off the wire. `crypto` is global in Node 22, so nothing needs importing. */
function randomId(): string {
  return crypto.randomUUID();
}

// ─── What we'd share, per kind ──────────────────────────────────────────────

/**
 * The app's own data, as the hub reads it.
 *
 * Separated from the hub because these are the only lines that know what an EQ List *is* — the hub
 * itself only knows about kinds, revisions and peers, and stays readable for it.
 *
 * **What is no longer here is the point.** These used to shape rows for the wire as well as fetch
 * them: the kill filter, the respawn reduction. Both were rules about *what a kind is when it
 * travels*, and both now live on that kind's row in `SHARE_KINDS` beside the reader that checks them
 * coming the other way — which is what stopped the kill rule being written twice (the map window
 * plots by the same one now). What is left is genuinely just the fetch, plus the one thing only a
 * store can answer: whether anything has written to it.
 */
export function shareSources(context: {
  getList: () => { entries: unknown[] };
  getSettings: () => Settings;
  killLog: {
    kills: (zone?: string) => KillRecord[];
    observations: () => unknown[];
    /** Moves when a kill, a drop or a coin line is recorded. */
    version: () => number;
  };
  spawns: { view: () => { running: unknown[]; known: KnownSpawn[] } };
  buffs: { view: () => { active: unknown[] } };
  scores: { board: () => { scores: unknown[] } };
}): Record<ShareKind, ShareSource> {
  return {
    watches: { rows: () => context.getSettings().castAlerts?.watches ?? [] },
    styles: { rows: () => context.getSettings().castAlerts?.styles ?? [] },
    lists: { rows: () => context.getList().entries },
    // Held by the map window, pushed in through `setPins` — this never runs (see `measure`), and is
    // here so the table has no hole in it for a reader to wonder about.
    pins: { rows: () => [] },
    // **The two that were worth a version.** `observations()` folds the whole kill log and `kills()`
    // scans five thousand records, and until now both were paid for once a minute whether or not a
    // single kill had happened. Nothing else here is expensive enough to be worth the risk described
    // below: a list is a few hundred entries and a scoreboard is a dozen rows.
    mobs: { rows: () => context.killLog.observations(), version: context.killLog.version },
    kills: { rows: () => context.killLog.kills(), version: context.killLog.version },
    // Read off the Timers tab's own rows rather than re-derived, so there is one rule for what a
    // gap is worth and a peer is handed the figure we actually act on — the player's dismissals,
    // relearn cutoffs and dropped gaps included, since those are corrections and not noise. What
    // travels is the conclusion only (`shareableRespawns`).
    respawns: { rows: () => context.spawns.view().known },
    // **Deliberately unversioned**, all three. The obvious counter to hook is the store's own save,
    // and for these it would be a *lie*: a running countdown and a buff that is counting down are
    // views over a clock, so their rows differ from one second to the next while nothing has been
    // written. A version that says "unchanged" about rows that have changed is the one failure mode
    // `ShareSource` says must not happen, and these are cheap to measure anyway.
    timers: { rows: () => context.spawns.view().running },
    buffs: { rows: () => context.buffs.view().active },
    scores: { rows: () => context.scores.board().scores },
    // Addressed by shard, never as a whole (see `PeerShareDeps.items`). Present so the table has no
    // hole in it, and never called.
    items: { rows: () => [] },
  };
}
