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
 * The cost is the materialisation, which is why the tick is slow and the result is cached: what a
 * peer sees is at most one tick stale, and a stale catalogue is a thing ADR 0141 already accounts
 * for.
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
  shareKind,
  shareableBuffs,
  sharing,
  type PeerOfferNotice,
  type ReceivedShare,
  type ShareEntry,
  type ShareKind,
  type ShareOffer,
} from "../src/shared/peer-share";
import { PLOTTABLE_CONFIDENCE } from "../src/shared/kill-confidence";
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
 * How long the room may stay empty before we quietly try joining again.
 *
 * **This is not a keepalive.** awari heartbeats every connection every two seconds
 * (`DEFAULT_HEARTBEAT_INTERVAL_MS`), so a live session does not idle out and nothing here needs to
 * poke it — a second keepalive on top would be inventing work and would hide real drops behind our
 * own traffic.
 *
 * What it *is* is the cure for the one failure the startup retries deliberately give up on: two
 * clients that begin together can each create their own room, and `REJOIN_DELAYS_MS` stops after
 * three attempts because being genuinely alone is a normal resting state
 * ([ADR 0070](../specs/decisions/0070-a-dropped-room-rejoins-itself.md)). A pair that settles split
 * therefore stays split all evening. Five minutes is slow enough that a solitary player is not
 * reconnecting in a loop — one attempt per five minutes is nothing — and fast enough that two people
 * who sit down together find each other without either of them having to know the button exists.
 *
 * Only ever while the room is **empty**: a room with somebody in it is a room that works, and
 * re-joining it would drop a working session to look for a better one.
 */
const ALONE_REJOIN_MS = 5 * 60_000;

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
  /** Take item pages a peer handed us into the page cache. Returns how many were new. */
  acceptItems?: (pages: SharedItemPage[], shard?: number) => number;
  /** Leave the room and join again — the owner window's job, relayed by `ipc.ts`. */
  rejoin: () => void;
  /** What we'd share, per kind — the app's own data, read only when asked for. */
  sources: Record<ShareKind, () => unknown[]>;
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
}

export function createPeerShareHub(deps: PeerShareDeps): PeerShareHub {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer = deps.clearInterval ?? ((h) => clearInterval(h as NodeJS.Timeout));

  /** The last measurement of each kind: what it held, and the revision that describes it. */
  const measured = new Map<ShareKind, { rows: unknown[]; digest: string; rev: number }>();
  /** Peers' answers, keyed `peerId:kind`. */
  const tray = new Map<string, ReceivedShare>();
  /** When we last asked each peer for each kind, keyed the same way. */
  const asked = new Map<string, number>();
  /** Their catalogues, so an automatic fetch can tell "changed" from "same as last time". */
  const offers = new Map<string, ShareOffer>();
  /** When each catalogue landed — the clock a shard claim expires against. */
  const offerAt = new Map<string, number>();
  /** Peers as the roster last described them — where a name and a session id come from. */
  const known = new Map<string, AwariPeer>();
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
  let noticeTimer: NodeJS.Timeout | null = null;
  let pins: MapPin[] = [];
  let debounce: NodeJS.Timeout | null = null;

  const trayKey = (peerId: string, kind: ShareKind) => `${peerId}:${kind}`;

  /**
   * Re-read one kind and give it a revision.
   *
   * The digest is only ever compared with itself, so it needs to be cheap and stable rather than
   * cryptographic — `JSON.stringify` over rows we are about to send anyway is both, and a collision
   * costs one skipped refresh rather than anything wrong. The **revision only ever goes up**, so a
   * peer comparing revisions can trust the direction even across our restarts within a session.
   */
  function measure(kind: ShareKind): { rows: unknown[]; rev: number } {
    // `items` is never materialised: there are eleven thousand of them and the catalogue line is
    // built from `itemStatus()` instead (see `offer`). Measuring it would read the whole page cache
    // off disk once a minute to produce a number nobody reads.
    if (kind === "items") return { rows: [], rev: itemRev() };
    const rows = kind === "pins" ? pins : safely(kind, deps.sources[kind]);
    const digest = `${rows.length}:${JSON.stringify(rows).length}`;
    const held = measured.get(kind);
    if (held && held.digest === digest) {
      held.rows = rows;
      return held;
    }
    const next = { rows, digest, rev: (held?.rev ?? 0) + 1 };
    measured.set(kind, next);
    return next;
  }

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
  function safely(kind: ShareKind, read: () => unknown[]): unknown[] {
    try {
      return read() ?? [];
    } catch (e) {
      log.debug("could not read", kind, "-", (e as Error).message);
      return [];
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
      const { rows, rev } = measure(spec.key);
      catalogue[spec.key] = { n: rows.length, rev } satisfies ShareEntry;
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
    deps.send({ kind: AWARI_MSG.offer, name: deps.getName(), ...offer() });
  }

  function touch(): void {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
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

    const { rows, rev } = measure(ask.what);
    // "Nothing changed since the revision you have" is a real answer, and a cheap one — `rows`
    // absent says it, which `readGive` keeps distinct from an empty list (that means "now empty").
    const stale = ask.since !== undefined && ask.since === rev;
    deps.send(
      {
        kind: AWARI_MSG.give,
        what: ask.what,
        rev,
        from: deps.getName(),
        ...(stale ? {} : { rows: outbound(ask.what, rows) }),
      },
      peerId,
    );
    log.debug("gave", ask.what, stale ? "(unchanged)" : `(${rows.length} rows)`, "to", peerId);
  }

  /**
   * Last touches before rows leave, for the kinds where "what it means here" isn't what it means
   * there.
   *
   * Only buffs need it, and they need it badly: a target of `ON_YOU` means *the sender*, so it has
   * to be resolved against our own name **on this side**, since we are the only ones who know whose
   * board it is (see `shareableBuffs`). Everything else travels as it stands.
   */
  function outbound(kind: ShareKind, rows: unknown[]): unknown[] {
    if (kind !== "buffs") return rows;
    return shareableBuffs(rows as Parameters<typeof shareableBuffs>[0], deps.getName());
  }

  /** Keep what a peer gave us: observations go to the stores, everything else to the tray. */
  function keep(peerId: string, raw: AwariPayload): void {
    const give = readGive(raw, () => randomId());
    if (!give) return void log.debug("give ignored - unknown kind", raw.what);
    if (give.stale) return void log.debug("give unchanged:", give.what, "from", peerId);

    const spec = shareKind(give.what);
    if (spec?.family === "mirror") {
      // Straight into the page cache, without a tray and without anybody clicking. It is the one
      // family that may: these are copies of eqlwiki's own public pages, identical for everyone, and
      // the alternative to accepting one is asking eqlwiki the same question a second time. They are
      // still read through `readSharedPage` first, and they still expire on our TTL — so a page a
      // peer got wrong is corrected by the source, on its own
      // ([ADR 0160](../specs/decisions/0160-a-room-fills-the-catalogue-once.md)).
      const taken = deps.acceptItems?.(give.rows as SharedItemPage[], give.shard) ?? 0;
      log.debug("took", taken, "of", give.rows.length, "item pages from", peerId, "shard", give.shard);
      return;
    }
    if (spec?.family === "observation") {
      // Straight into the existing pipeline, contributor id and all — pulling rather than being
      // pushed changed the transport and nothing about the trust model (ADR 0141). The id rides on
      // the payload the peer sent, exactly as it did when this was a broadcast.
      deps.fileContribution({ kind: give.what, [give.what]: give.rows, id: raw.id, name: raw.name });
      return;
    }
    tray.set(trayKey(peerId, give.what), {
      peerId,
      kind: give.what,
      from: give.from,
      rows: give.rows,
      rev: give.rev,
      at: now(),
    });
    log.debug("kept", give.rows.length, give.what, "from", peerId);
    deps.changed();
  }

  /** Ask a peer for a kind, unless we asked very recently. */
  function askFor(peerId: string, kind: ShareKind, force: boolean): void {
    const key = trayKey(peerId, kind);
    const last = asked.get(key) ?? 0;
    if (!force && now() - last < ASK_COOLDOWN_MS) return;
    asked.set(key, now());
    deps.send({ kind: AWARI_MSG.ask, what: kind, since: tray.get(key)?.rev }, peerId);
    log.debug("asked", peerId, "for", kind);
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
    const theirs = (payload.offer ?? payload) as Record<string, unknown>;
    const catalogue: ShareOffer = {};
    for (const spec of SHARE_KINDS) {
      const entry = theirs[spec.key];
      if (entry && typeof entry === "object") catalogue[spec.key] = entry as ShareEntry;
    }
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
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(flushNotices, NOTICE_DEBOUNCE_MS);
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

  /** When the room last had somebody in it — the clock behind `ALONE_REJOIN_MS`. */
  let lastCompany = now();

  const tick = setTimer(() => {
    sweep();
    publishOffer();
    reconcile();
    watchLoneliness();
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
      if (!known.get(peerId)?.sessionId) continue;
      for (const kind of outOfDate(catalogue, (k) => tray.get(trayKey(peerId, k))?.rev)) {
        askFor(peerId, kind, false);
      }
    }
  }

  /**
   * A room that has been empty too long is probably not the room everybody else is in.
   *
   * See `ALONE_REJOIN_MS` for why this exists and why it is slow. The clock resets the moment
   * anybody is seen, so a real solitary session costs one join attempt every five minutes and a
   * populated one costs none.
   */
  function watchLoneliness(): void {
    if (!deps.getSettings().connectPeers || !status.connected) return;
    if (known.size > 0) {
      lastCompany = now();
      return;
    }
    if (now() - lastCompany < ALONE_REJOIN_MS) return;
    lastCompany = now();
    log.debug("room empty for", Math.round(ALONE_REJOIN_MS / 1000), "s - re-joining to look again");
    deps.rejoin();
  }

  /** Drop answers nobody has refreshed in a while, so a long session doesn't accumulate the room. */
  function sweep(): void {
    const cutoff = now() - TRAY_TTL_MS;
    let dropped = 0;
    for (const [key, entry] of tray) {
      if (entry.at < cutoff) {
        tray.delete(key);
        dropped += 1;
      }
    }
    if (dropped) deps.changed();
  }

  return {
    offer,
    mine: (kind) => measure(kind).rows,
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
      // A join that has only just landed has had no chance to meet anybody, so the loneliness clock
      // starts here rather than at whatever it was before the outage.
      if (next.connected) lastCompany = now();
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
    room: () => ({ status, peers: [...known.values()] }),
    roster(peers) {
      // Somebody who has left can't answer and their catalogue is a promise about a session that is
      // over. Their *tray* stays until it ages out: what they already handed over is ours to look
      // at, and losing a list you were halfway through copying because they logged off is worse
      // than a slightly stale row.
      const here = new Set(peers.map((p) => p.peerId));
      if (peers.length) lastCompany = now();
      known.clear();
      for (const peer of peers) known.set(peer.peerId, peer);
      for (const peerId of [...offers.keys()]) {
        if (here.has(peerId)) continue;
        offers.delete(peerId);
        offerAt.delete(peerId);
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
      deps.changed();
    },
    setPins(next) {
      pins = next;
      touch();
    },
    touch,
    stop() {
      if (debounce) clearTimeout(debounce);
      if (noticeTimer) clearTimeout(noticeTimer);
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
 * The app's own data, shaped for the wire.
 *
 * Separated from the hub because these are the only lines that know what an EQ List *is* — the hub
 * itself only knows about kinds, revisions and peers, and stays readable for it. Each reader is a
 * one-liner over a store that already exists; the interesting decisions are the two exclusions:
 *
 *   - **Only your own kills travel.** A peer's kill re-shared under our name is an echo that grows
 *     with every hop, and with three clients in a room it goes round and round. `sharedBy` is the
 *     guard, and it is the same one the map used when this was a broadcast.
 *   - **Only placeable ones.** A position we don't have is nothing the receiver can draw, so it is
 *     weight on the wire and a row in their store for no gain.
 */
export function shareSources(context: {
  getList: () => { entries: unknown[] };
  getSettings: () => Settings;
  killLog: { kills: (zone?: string) => KillRecord[]; observations: () => unknown[] };
  spawns: { view: () => { running: unknown[]; known: KnownSpawn[] } };
  buffs: { view: () => { active: unknown[] } };
  scores: { board: () => { scores: unknown[] } };
}): Record<ShareKind, () => unknown[]> {
  return {
    watches: () => context.getSettings().castAlerts?.watches ?? [],
    styles: () => context.getSettings().castAlerts?.styles ?? [],
    lists: () => context.getList().entries,
    // Held by the map window, pushed in through `setPins` — this never runs (see `measure`), and is
    // here so the table has no hole in it for a reader to wonder about.
    pins: () => [],
    mobs: () => context.killLog.observations(),
    kills: () =>
      context.killLog
        .kills()
        .filter((k) => !k.sharedBy && k.y !== undefined && k.x !== undefined && k.confidence >= PLOTTABLE_CONFIDENCE)
        .map((k) => ({ zone: k.zone ?? "", y: k.y, x: k.x, mob: k.mob, confidence: k.confidence }))
        .filter((k) => k.zone),
    // Read off the Timers tab's own rows rather than re-derived, so there is one rule for what a
    // gap is worth and a peer is handed the figure we actually act on — the player's dismissals,
    // relearn cutoffs and dropped gaps included, since those are corrections and not noise.
    //
    // Reduced to the **conclusion** on the way out. A `KnownSpawn` also carries what this install
    // decided *about* the camp — whether it alerts, what it wears, how much padding somebody likes
    // — and that is a setting, not an observation. `gaps` goes for the reason a shared kill carries
    // no time: the evidence stays on the machine that saw it, and what travels is what it proved.
    respawns: () =>
      context.spawns.view().known.map((k) => ({
        key: k.key,
        mob: k.mob,
        place: k.place,
        shortestSeconds: k.shortestSeconds,
        longestSeconds: k.longestSeconds,
        samples: k.samples,
        lastKillAt: k.lastKillAt,
      })),
    timers: () => context.spawns.view().running,
    buffs: () => context.buffs.view().active,
    scores: () => context.scores.board().scores,
    // Addressed by shard, never as a whole (see `PeerShareDeps.items`). Present so the table has no
    // hole in it, and never called.
    items: () => [],
  };
}
